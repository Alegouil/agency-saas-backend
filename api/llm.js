export default async function handler(req, res) {
  // CORS - accepte TOUT
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { task, brief, context } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'No API key' });
  }

  try {
    const msg = context ? `${context}\n\n${task}` : task;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: brief },
          { role: 'user', content: msg }
        ],
        max_tokens: 1800
      })
    });

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || 'No response';

    let json = { response: text };
    try {
      const s = text.indexOf('{');
      const e = text.lastIndexOf('}');
      if (s >= 0 && e > s) {
        json = JSON.parse(text.substring(s, e + 1));
      }
    } catch (e) { }

    res.json({
      thinking: json.thinking || '',
      response: json.response || text,
      deliverable: json.deliverable || '',
      question: null,
      delegations: [],
      flags: []
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
