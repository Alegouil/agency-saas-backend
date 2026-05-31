export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { task, brief, context } = req.body;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
  }

  if (!task || !brief) {
    return res.status(400).json({ error: 'Missing task or brief' });
  }

  try {
    const userMessage = context 
      ? `Context:\n${context}\n\n---\nTask:\n${task}`
      : task;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.7,
        max_tokens: 1000,
        messages: [
          { role: 'system', content: brief },
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.error?.message || 'OpenAI error' });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    if (!text) {
      return res.status(500).json({ error: 'Empty response' });
    }

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
