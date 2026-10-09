import type { DelayConfig, LevelConfig } from '../config';
import { stripUnsafe, truncate } from '../sanitize';
import { clamp, pick, type Rng } from '../util';

const AI_SELF_REFERENCE = /\b(as an ai|language model|i am an ai|i'm an ai|i am a bot|i'm a bot|imposter|impostor|system prompt)\b/i;

/** Turn raw model output into a single plain answer line, or null if it is unusable. */
export function cleanModelOutput(raw: string, maxChars: number): string | null {
  let s = raw.trim();
  s = s.split(/\r?\n/).find((l) => l.trim()) ?? '';
  s = s.replace(/^\s*(?:answer|response|reply)\s*:\s*/i, '');
  s = s.replace(/^["'“”«»]+|["'“”«»]+$/g, '');
  s = stripUnsafe(s);
  if (!s || AI_SELF_REFERENCE.test(s)) return null;
  return truncate(s, maxChars);
}

function injectTypo(text: string, rng: Rng): string {
  const words = text.split(' ');
  const candidates = words.flatMap((w, i) => (/^\p{L}{4,}$/u.test(w) ? [i] : []));
  if (!candidates.length) return text;
  const i = candidates[Math.floor(rng() * candidates.length)]!;
  const w = [...words[i]!];
  const k = 1 + Math.floor(rng() * (w.length - 2)); // interior letter, k+1 always exists
  const kind = Math.floor(rng() * 3);
  if (kind === 0) [w[k], w[k + 1]] = [w[k + 1]!, w[k]!];
  else if (kind === 1) w.splice(k, 1);
  else w.splice(k, 0, w[k]!);
  words[i] = w.join('');
  return words.join(' ');
}

/** Level-driven surface imperfections: typos, lowercase, missing final punctuation. */
export function applyStyle(text: string, level: LevelConfig, rng: Rng = Math.random): string {
  let s = text;
  if (rng() < level.typoProbability) s = injectTypo(s, rng);
  if (rng() < level.lowercaseProbability) s = s.toLocaleLowerCase();
  if (rng() < level.dropEndPunctuationProbability) s = s.replace(/[.!]+$/, '');
  return s;
}

/** Total time from turn start until the answer should be posted. */
export function computeDelayMs(textLen: number, d: DelayConfig, budgetMs: number, rng: Rng = Math.random): number {
  const spread = (x: number) => x * (1 + (rng() * 2 - 1) * d.jitter);
  let ms = spread(d.baseMs) + spread(textLen * d.perCharMs);
  if (rng() < d.slowChance) ms += d.slowExtraMs[0] + rng() * (d.slowExtraMs[1] - d.slowExtraMs[0]);
  return Math.min(clamp(ms, d.minMs, d.maxMs), budgetMs);
}

export function pickFallback(level: LevelConfig, language: string, rng: Rng = Math.random): string {
  const pool = level.fallbacks[language] ?? level.fallbacks.en ?? ['hmm'];
  return pick(pool, rng);
}
