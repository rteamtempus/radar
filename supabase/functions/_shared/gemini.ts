// Gemini via bare REST (no SDK — handoff §4). ONLY called from edge functions.
// Every call gets an ai_invocations row, success or failure (handoff §11).

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface GeminiJsonResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Structured-output call: JSON mime type + explicit responseSchema, thinking
 * disabled (rank-and-write task, not reasoning).
 */
export async function geminiJson<T>(opts: {
  systemInstruction: string;
  userText: string;
  responseSchema: unknown;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<GeminiJsonResult<T>> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')!,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: opts.userText }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: opts.responseSchema,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
        temperature: opts.temperature ?? 0.7,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text candidate');
  return {
    data: JSON.parse(text) as T,
    model: MODEL,
    inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
