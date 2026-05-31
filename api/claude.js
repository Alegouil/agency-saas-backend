export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { task, brief, context } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  if (!task || !brief) {
    return res.status(400).json({ error: 'Missing task or brief' });
  }

  try {
    const userMessage = context 
      ? `Context:\n${context}\n\n---\nTask:\n${task}`
      : task;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: brief,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.message });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    let json = {};
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        json = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
      } catch (e) {
        json = { response: text };
      }
    } else {
      try {
        json = JSON.parse(text);
      } catch (e) {
        json = { response: text };
      }
    }

    return res.status(200).json({
      thinking: json.thinking || '',
      response: (json.response || text || '').substring(0, 2000),
      deliverable: json.deliverable || '',
      question: json.question || null,
      delegations: Array.isArray(json.delegations) ? json.delegations.slice(0, 5) : [],
      flags: Array.isArray(json.flags) ? json.flags.slice(0, 3) : []
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
