// Everything a player (or the LLM) writes is untrusted. This is the single sanitising choke point.

const CONTROL = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;
const TAGS = /<\/?[a-zA-Z!][^>]*>?/g;
const SPECIAL_TOKENS = /<\|[^|]*\|>|\[\/?(?:INST|SYS)\]|<<\/?SYS>>/gi;
const ROLE_PREFIX = /^\s*(?:system|assistant|developer|user|human|ai)\s*[:>]\s*/i;
const HEADING_ROLE = /#{2,}\s*(?:system|instruction|assistant)s?\b/gi;
const CODE_FENCE = /`{3,}/g;

/** Strip markup, control chars and system-like content; collapse to a single line. */
export function stripUnsafe(input: string): string {
  let s = input.normalize('NFC');
  s = s.replace(SPECIAL_TOKENS, ' ');
  // repeat so nested tags like <<b>b> cannot survive a single pass
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(TAGS, ' ');
  }
  s = s.replace(/[<>]/g, '');
  s = s.replace(CODE_FENCE, ' ').replace(HEADING_ROLE, ' ');
  s = s.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  // role prefixes ("system: ...") may be stacked
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(ROLE_PREFIX, '');
  }
  return s.trim();
}

export type SanitizeResult =
  | { ok: true; text: string }
  | { ok: false; code: 'bad_request' | 'empty' | 'too_long' };

export function sanitizeAnswer(raw: unknown, maxChars: number): SanitizeResult {
  if (typeof raw !== 'string') return { ok: false, code: 'bad_request' };
  // guard against huge payloads before doing any work
  if (raw.length > maxChars * 8 + 512) return { ok: false, code: 'too_long' };
  const text = stripUnsafe(raw);
  if (!text) return { ok: false, code: 'empty' };
  if ([...text].length > maxChars) return { ok: false, code: 'too_long' };
  return { ok: true, text };
}

export function sanitizeName(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? stripUnsafe(raw).slice(0, 20).trim() : '';
  return s || fallback;
}

/** Cut to maxChars on a word boundary when possible (used for LLM output, which is trimmed not rejected). */
export function truncate(text: string, maxChars: number): string {
  const chars = [...text];
  if (chars.length <= maxChars) return text;
  const cut = chars.slice(0, maxChars).join('');
  const sp = cut.lastIndexOf(' ');
  return (sp > maxChars * 0.5 ? cut.slice(0, sp) : cut).trim();
}

/** Make untrusted text safe to embed inside a delimited <data> block of the AI prompt. */
export function forPrompt(text: string): string {
  return stripUnsafe(text).replace(/[{}]/g, '');
}
