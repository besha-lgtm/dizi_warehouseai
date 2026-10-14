const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

// Running total of Gemini token usage for this server process (resets on restart).
const usage = { totalTokens: 0, promptTokens: 0, completionTokens: 0, requests: 0 };

function getTokenUsage() {
  return { ...usage };
}

function endpoint(apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
}

// history: [{ role: 'user' | 'ai', content: string }]
async function askGemini({ systemInstruction, history, message }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const contents = [
    ...history.map((h) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    })),
    { role: 'user', parts: [{ text: message }] }
  ];

  const response = await fetch(endpoint(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const u = data?.usageMetadata;
  if (u) {
    usage.promptTokens += u.promptTokenCount || 0;
    usage.completionTokens += u.candidatesTokenCount || 0;
    usage.totalTokens += u.totalTokenCount || 0;
    usage.requests += 1;
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return text.trim();
}

module.exports = { askGemini, getTokenUsage };
