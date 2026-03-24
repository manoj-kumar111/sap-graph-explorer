import { getSchema } from './database';

const SYSTEM_PROMPT = `You are an SAP Order-to-Cash data analyst assistant. You help users explore and query an SAP O2C dataset stored in a SQLite database.

${getSchema()}

RULES:
1. You ONLY answer questions about this SAP Order-to-Cash dataset.
2. If the user asks something unrelated (general knowledge, creative writing, coding help, etc.), politely decline and say you can only help with SAP O2C data queries.
3. When answering, ALWAYS generate a SQL query first to get the data, then explain the results.
4. Return your response in this exact JSON format:
{
  "sql": "YOUR SQL QUERY HERE",
  "explanation": "Brief explanation of what the query does",
  "isRelevant": true
}
5. If the question is NOT about the dataset, return:
{
  "sql": null,
  "explanation": "I can only help with questions about the SAP Order-to-Cash dataset. Please ask about sales orders, deliveries, billing documents, payments, customers, or products.",
  "isRelevant": false
}
6. Use proper SQLite syntax. Use GROUP BY, JOIN, subqueries as needed.
7. Always limit results to at most 50 rows unless the user specifically asks for all.
8. For "trace the flow" questions, join across tables: sales_order_headers → outbound_delivery_items (via referenceSDDocument) → outbound_delivery_headers → billing_document_items (via referenceSDDocument) → billing_document_headers → journal_entry_items (via customer).
9. For "broken flow" questions, use LEFT JOIN and check for NULL to find missing links.
10. Always return valid JSON. No markdown, no code blocks, just the JSON object.`;

export async function queryLLM(userMessage, conversationHistory = []) {
  const apiKey = process.env.LLM_API_KEY;
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

  if (!apiKey) {
    return {
      sql: null,
      explanation: 'LLM API key not configured. Please set LLM_API_KEY in .env.local',
      isRelevant: false,
    };
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-6),
    { role: 'user', content: userMessage },
  ];

  try {
    let response;
    if (provider === 'gemini') {
      response = await callGemini(apiKey, messages);
    } else if (provider === 'groq') {
      response = await callGroq(apiKey, messages);
    } else if (provider === 'openrouter') {
      response = await callOpenRouter(apiKey, messages);
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    // Parse the JSON response
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('LLM Error:', error);
    return {
      sql: null,
      explanation: `Error communicating with LLM: ${error.message}`,
      isRelevant: false,
    };
  }
}

async function callGemini(apiKey, messages) {
  const model = process.env.LLM_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = [];
  let systemInstruction = '';

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = msg.content;
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) {
      throw new Error('Gemini API quota exhausted. Please try a different API key or switch to Groq (set LLM_PROVIDER=groq in .env.local).');
    }
    throw new Error(`Gemini API error (${res.status}): ${errText.substring(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Gemini API. The model may have filtered the response.');
  }
  return text;
}

async function callGroq(apiKey, messages) {
  const model = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenRouter(apiKey, messages) {
  const model = process.env.LLM_MODEL || 'google/gemini-2.0-flash-exp:free';
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
