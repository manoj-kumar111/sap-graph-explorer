import { NextResponse } from 'next/server';
import { queryLLM } from '@/lib/llm';
import { getDb } from '@/lib/database';

export async function POST(request) {
  try {
    const { message, history = [] } = await request.json();

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Call LLM to translate NL to SQL
    const llmResult = await queryLLM(message, history);

    if (!llmResult.isRelevant) {
      return NextResponse.json({
        answer: llmResult.explanation,
        sql: null,
        data: null,
        isRelevant: false,
      });
    }

    // Execute the SQL query
    let queryResult = null;
    let answer = llmResult.explanation;

    if (llmResult.sql) {
      try {
        // Validate - only allow SELECT queries
        const sqlTrimmed = llmResult.sql.trim().toUpperCase();
        if (!sqlTrimmed.startsWith('SELECT') && !sqlTrimmed.startsWith('WITH')) {
          return NextResponse.json({
            answer: 'Only SELECT queries are allowed for safety.',
            sql: llmResult.sql,
            data: null,
            isRelevant: true,
          });
        }

        const db = getDb();
        queryResult = db.prepare(llmResult.sql).all();

        // Generate a natural language summary
        const summaryPrompt = `Given this SQL query and its results, provide a clear natural language answer.

Query: ${llmResult.sql}
Results (first 10 rows): ${JSON.stringify(queryResult.slice(0, 10))}
Total rows returned: ${queryResult.length}

Original question: ${message}

Provide a clear, concise answer. Include key numbers and facts. Format with bullet points if useful. Do NOT include any JSON formatting or sql. Just plain text answer.`;

        const summaryMessages = [
          { role: 'system', content: 'You are a helpful SAP data analyst. Provide clear, concise answers based on query results. Use bullet points for lists. Always ground your answer in the actual data provided.' },
          { role: 'user', content: summaryPrompt },
        ];

        const apiKey = process.env.LLM_API_KEY;
        const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

        if (apiKey) {
          try {
            let summaryResponse;
            if (provider === 'gemini') {
              const model = process.env.LLM_MODEL || 'gemini-2.0-flash';
              const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
              const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: summaryMessages[0].content }] },
                  contents: [{ role: 'user', parts: [{ text: summaryMessages[1].content }] }],
                  generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
                }),
              });
              const data = await res.json();
              summaryResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            } else if (provider === 'groq') {
              const model = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';
              const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ model, messages: summaryMessages, temperature: 0.3, max_tokens: 1024 }),
              });
              const data = await res.json();
              summaryResponse = data.choices?.[0]?.message?.content;
            } else if (provider === 'openrouter') {
              const model = process.env.LLM_MODEL || 'google/gemini-2.0-flash-exp:free';
              const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ model, messages: summaryMessages, temperature: 0.3, max_tokens: 1024 }),
              });
              const data = await res.json();
              summaryResponse = data.choices?.[0]?.message?.content;
            }
            if (summaryResponse) answer = summaryResponse;
          } catch (e) {
            // Use the original explanation if summary fails
            answer = `${llmResult.explanation}\n\nFound ${queryResult.length} result(s).`;
          }
        }
      } catch (sqlError) {
        return NextResponse.json({
          answer: `SQL execution error: ${sqlError.message}. The generated query was: ${llmResult.sql}`,
          sql: llmResult.sql,
          data: null,
          isRelevant: true,
        });
      }
    }

    return NextResponse.json({
      answer,
      sql: llmResult.sql,
      data: queryResult ? queryResult.slice(0, 50) : null,
      totalRows: queryResult ? queryResult.length : 0,
      isRelevant: true,
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
