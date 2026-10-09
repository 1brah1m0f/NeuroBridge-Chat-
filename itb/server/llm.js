'use strict';
/* LLM clients, server side only (keys never reach the browser).
 *   gemini  -> meeting Q&A answers (text in, text out)
 *   groq    -> AI movement director (JSON decisions), OpenAI-compatible chat completions
 * Both throw on any failure; callers fall back to the built-in behaviour.
 */

async function postJson(url, headers, body, timeoutMs) {
  const res = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, headers),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch (e) { /* ignore */ }
    const err = new Error('LLM HTTP ' + res.status + (detail ? ' ' + detail : ''));
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function makeGemini(apiKey, model) {
  if (!apiKey) return null;
  return async function generate(prompt, o) {
    const data = await postJson(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
      { 'x-goog-api-key': apiKey },
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // thinking tokens would eat the small output budget and return empty answers
        generationConfig: { temperature: o.temperature, maxOutputTokens: o.maxTokens, thinkingConfig: { thinkingBudget: 0 } },
      },
      o.timeoutMs,
    );
    const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
  };
}

function makeGroq(apiKey, model) {
  if (!apiKey) return null;
  // -> { text, tokens }
  return async function chatJson(system, user, o) {
    const body = {
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      temperature: o.temperature == null ? 0.8 : o.temperature,
      max_tokens: o.maxTokens || 400,
    };
    if (/gpt-oss|qwen/i.test(model)) body.reasoning_effort = 'low'; // reasoning tokens count against max_tokens
    const data = await postJson('https://api.groq.com/openai/v1/chat/completions', { authorization: 'Bearer ' + apiKey }, body, o.timeoutMs || 8000);
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    return { text: String((msg && msg.content) || ''), tokens: (data && data.usage && data.usage.total_tokens) || 0 };
  };
}

/** Sliding one-minute budget for requests and tokens (providers rate-limit per minute). */
class Budget {
  constructor(rpm, tpm) {
    this.rpm = rpm; this.tpm = tpm; this.hits = [];
  }
  _trim(now) { this.hits = this.hits.filter((h) => now - h.t < 60000); }
  canSpend(estTokens, now) {
    now = now || Date.now();
    this._trim(now);
    const tokens = this.hits.reduce((a, h) => a + h.tokens, 0);
    return this.hits.length < this.rpm && tokens + estTokens <= this.tpm;
  }
  spend(tokens, now) { this.hits.push({ t: now || Date.now(), tokens }); return this.hits[this.hits.length - 1]; }
}

module.exports = { makeGemini, makeGroq, Budget };
