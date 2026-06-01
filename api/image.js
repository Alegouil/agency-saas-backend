function setCors(res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const prompt = String(req.body?.prompt || "").trim();

  if (!apiKey) {
    res.status(400).json({ error: "No API key" });
    return;
  }

  if (!prompt) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1024",
        quality: "low",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json({ error: data?.error?.message || "Image generation failed" });
      return;
    }

    const imageBase64 = data?.data?.[0]?.b64_json;
    if (!imageBase64) {
      res.status(502).json({ error: "No image returned by OpenAI" });
      return;
    }

    res.status(200).json({
      model,
      prompt,
      imageUrl: `data:image/png;base64,${imageBase64}`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
