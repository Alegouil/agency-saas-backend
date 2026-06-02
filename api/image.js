function setCors(res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const WORKSPACE_SLUG = "default";
const STORAGE_BUCKET = "generated-assets";
const SUPPORTED_IMAGE_MODELS = new Set(["gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5"]);

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return { url, key };
}

async function fetchWorkspaceId(url, key) {
  const response = await fetch(
    `${url}/rest/v1/workspaces?slug=eq.${WORKSPACE_SLUG}&select=id&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase workspaces lookup failed (${response.status})`);
  }

  const rows = await response.json();
  const workspaceId = rows[0]?.id;

  if (!workspaceId) {
    throw new Error("Default workspace not found");
  }

  return workspaceId;
}

function sanitizePathSegment(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function parseDataUrlAsset(asset, index) {
  const source = String(asset?.url || "");
  const match = source.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const base64Payload = match[2];
  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return {
    name: sanitizePathSegment(asset?.name || `reference-${index + 1}`, `reference-${index + 1}`) + `.${extension}`,
    mimeType,
    buffer: Buffer.from(base64Payload, "base64"),
  };
}

async function uploadImageToStorage(url, key, storagePath, base64Payload) {
  const binary = Buffer.from(base64Payload, "base64");
  const response = await fetch(`${url}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "x-upsert": "false",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: binary,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase storage upload failed (${response.status}): ${errorText}`);
  }

  return `${url}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
}

async function insertImageRecord(url, key, record) {
  const response = await fetch(`${url}/rest/v1/generated_images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase generated_images insert failed (${response.status}): ${errorText}`);
  }

  const rows = await response.json();
  return rows[0] || null;
}

async function resolveImageBase64(imageEntry) {
  if (imageEntry?.b64_json) return imageEntry.b64_json;
  if (!imageEntry?.url) return null;

  const response = await fetch(imageEntry.url);
  if (!response.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.toString("base64");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const requestedModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const model = SUPPORTED_IMAGE_MODELS.has(requestedModel) ? requestedModel : "gpt-image-1";
  const prompt = String(req.body?.prompt || "").trim();
  const requestedCount = Number(req.body?.count || 1);
  const count = Number.isFinite(requestedCount) ? Math.max(1, Math.min(10, requestedCount)) : 1;
  const conversationId = sanitizePathSegment(req.body?.conversationId, "default-conversation");
  const messageId = Number.isFinite(Number(req.body?.messageId)) ? Number(req.body.messageId) : null;
  const exactCount = Number.isFinite(Number(req.body?.exactCount)) ? Math.max(1, Math.min(10, Number(req.body.exactCount))) : null;
  const referenceImages = Array.isArray(req.body?.references)
    ? req.body.references.map(parseDataUrlAsset).filter(Boolean).slice(0, 2)
    : [];

  if (!apiKey) {
    res.status(400).json({ error: "No API key" });
    return;
  }

  if (!prompt) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  try {
    const supabase = getSupabaseConfig();
    if (!supabase) {
      res.status(503).json({ error: "Supabase is not configured" });
      return;
    }

    const workspaceId = await fetchWorkspaceId(supabase.url, supabase.key);
    const images = [];

    for (let index = 0; index < count; index += 1) {
      const indexedPrompt = count > 1 || exactCount
        ? `${prompt}\n\nConsigne impérative pour cette image : génère uniquement le visuel ${index + 1} sur ${exactCount || count}. Une seule slide ou publication dans l'image. Aucun collage. Aucune mosaïque. Aucune planche de plusieurs slides. Si un brief slide par slide est fourni, utilise uniquement les instructions de la slide ${index + 1}. Garde le meme header, le meme logo, la meme navigation, la meme pagination et le meme footer que sur les autres slides.`
        : prompt;
      let response;
      let data;
      let imageBase64 = null;

      if (referenceImages.length > 0) {
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", indexedPrompt);
        form.append("size", "1024x1024");
        form.append("quality", "low");
        form.append("response_format", "b64_json");
        referenceImages.forEach((image, imageIndex) => {
          const blob = new Blob([image.buffer], { type: image.mimeType });
          const fieldName = referenceImages.length === 1 ? "image" : "image[]";
          form.append(fieldName, blob, image.name || `reference-${imageIndex + 1}.png`);
        });

        response = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: form,
        });

        data = await response.json();
        if (response.ok) {
          imageBase64 = await resolveImageBase64(data?.data?.[0]);
        }
      }

      if (!response || !response.ok || !imageBase64) {
        response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            prompt: indexedPrompt,
            n: 1,
            size: "1024x1024",
            quality: "low",
            output_format: "png",
            response_format: "b64_json",
          }),
        });

        data = await response.json();
        if (response.ok) {
          imageBase64 = await resolveImageBase64(data?.data?.[0]);
        }
      }

      if (!response.ok) {
        res.status(response.status).json({ error: data?.error?.message || "Image generation failed" });
        return;
      }

      if (!imageBase64) {
        res.status(502).json({ error: "No image returned by OpenAI" });
        return;
      }

      const assetId = crypto.randomUUID();
      const storagePath = `workspaces/${workspaceId}/conversations/${conversationId}/images/${assetId}.png`;
      const publicUrl = await uploadImageToStorage(supabase.url, supabase.key, storagePath, imageBase64);

      await insertImageRecord(supabase.url, supabase.key, {
        id: assetId,
        workspace_id: workspaceId,
        conversation_id: conversationId,
        message_id: messageId,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        public_url: publicUrl,
        mime_type: "image/png",
        prompt: indexedPrompt,
      });

      images.push(publicUrl);
    }

    if (!images.length) {
      res.status(502).json({ error: "No image returned by OpenAI" });
      return;
    }

    res.status(200).json({
      model,
      prompt,
      imageUrl: images[0],
      images,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
