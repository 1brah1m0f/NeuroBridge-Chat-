import { env } from '../config';

export interface GenerateOptions {
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

/** Provider-agnostic: prompt in, answer text out. Throws on any failure; the caller falls back. */
export type GenerateAnswer = (prompt: string, opts: GenerateOptions) => Promise<string>;

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  return res.json();
}

const anthropic: GenerateAnswer = async (prompt, o) => {
  const data = await postJson(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': env.llmApiKey, 'anthropic-version': '2023-06-01' },
    {
      model: env.llmModel,
      max_tokens: o.maxTokens,
      temperature: o.temperature,
      messages: [{ role: 'user', content: prompt }],
    },
    o.timeoutMs,
  );
  return String(data?.content?.[0]?.text ?? '');
};

const openai: GenerateAnswer = async (prompt, o) => {
  const base = (env.llmBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const data = await postJson(
    `${base}/chat/completions`,
    { authorization: `Bearer ${env.llmApiKey}` },
    {
      model: env.llmModel,
      max_tokens: o.maxTokens,
      temperature: o.temperature,
      messages: [{ role: 'user', content: prompt }],
    },
    o.timeoutMs,
  );
  return String(data?.choices?.[0]?.message?.content ?? '');
};

const gemini: GenerateAnswer = async (prompt, o) => {
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.llmModel)}:generateContent`,
    { 'x-goog-api-key': env.llmApiKey },
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: o.temperature,
        maxOutputTokens: o.maxTokens,
        // thinking tokens would eat the tiny output budget and return empty answers
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    o.timeoutMs,
  );
  const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
};

/** Offline stand-in for dev and tests. Ignores the prompt on purpose. */
const MOCK_ANSWERS = [
  'probably the usual, nothing special',
  'honestly depends on the day',
  'i like it simple tbh',
  'hmm good question, maybe tea and something small',
  'not really a fan but fine',
  'always been that way for me',
];
const mock: GenerateAnswer = async () => {
  await new Promise((r) => setTimeout(r, 30 + Math.random() * 60));
  return MOCK_ANSWERS[Math.floor(Math.random() * MOCK_ANSWERS.length)]!;
};

export function createLlm(provider = env.llmProvider): GenerateAnswer {
  switch (provider) {
    case 'anthropic':
      if (!env.llmApiKey) throw new Error('LLM_API_KEY is required for provider=anthropic');
      return anthropic;
    case 'openai':
      if (!env.llmApiKey) throw new Error('LLM_API_KEY is required for provider=openai');
      return openai;
    case 'gemini':
      if (!env.llmApiKey) throw new Error('LLM_API_KEY is required for provider=gemini');
      return gemini;
    case 'mock':
      return mock;
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}"`);
  }
}
