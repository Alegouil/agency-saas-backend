const WORKSPACE_SLUG = "default";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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

async function readState(url, key) {
  const workspaceId = await fetchWorkspaceId(url, key);
  const response = await fetch(
    `${url}/rest/v1/workspace_state?workspace_id=eq.${workspaceId}&select=config,messages,kpis,last_id&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase workspace_state read failed (${response.status})`);
  }

  const rows = await response.json();
  return rows[0] || null;
}

async function writeState(url, key, payload) {
  const workspaceId = await fetchWorkspaceId(url, key);
  const response = await fetch(`${url}/rest/v1/workspace_state?workspace_id=eq.${workspaceId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Supabase workspace_state write failed (${response.status})`);
  }

  const rows = await response.json();
  return rows[0] || null;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const config = getSupabaseConfig();
  if (!config) {
    res.status(503).json({ error: "Supabase is not configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      const state = await readState(config.url, config.key);
      res.status(200).json({
        config: state?.config || null,
        messages: state?.messages || null,
        kpis: state?.kpis || null,
        lastId: state?.last_id ?? null,
      });
      return;
    }

    if (req.method === "POST") {
      const nextState = {};

      if (Object.prototype.hasOwnProperty.call(req.body || {}, "config")) {
        nextState.config = req.body.config;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "messages")) {
        nextState.messages = req.body.messages;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "kpis")) {
        nextState.kpis = req.body.kpis;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "lastId")) {
        nextState.last_id = req.body.lastId;
      }

      const state = await writeState(config.url, config.key, nextState);
      res.status(200).json({
        config: state?.config || null,
        messages: state?.messages || null,
        kpis: state?.kpis || null,
        lastId: state?.last_id ?? null,
      });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
