import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
};

export const env = {
  port: num(process.env.PORT, 3001),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  llmProvider: process.env.LLM_PROVIDER ?? 'mock',
  llmApiKey: process.env.LLM_API_KEY ?? '',
  llmModel: process.env.LLM_MODEL ?? 'claude-haiku-5-5',
  llmBaseUrl: process.env.LLM_BASE_URL ?? '',
  llmTimeoutMs: num(process.env.LLM_TIMEOUT_MS, 12000),
  turnMs: num(process.env.TURN_MS, 30000),
  questionDelayMs: num(process.env.QUESTION_DELAY_MS, 2500),
  interTurnMs: num(process.env.INTER_TURN_MS, 700),
  disconnectGraceMs: num(process.env.DISCONNECT_GRACE_MS, 5000),
  answerMaxChars: num(process.env.ANSWER_MAX_CHARS, 200),
  allowDeadSpectators: process.env.ALLOW_DEAD_SPECTATORS === 'true',
  logDir: path.resolve(ROOT, process.env.LOG_DIR ?? 'logs'),
};

export const paths = {
  levels: path.join(ROOT, 'config', 'levels.json'),
  questions: path.join(ROOT, 'data', 'questions.json'),
  names: path.join(ROOT, 'data', 'names.json'),
  prompt: path.join(ROOT, 'prompts', 'ai_master_prompt.txt'),
};

export interface DelayConfig {
  baseMs: number;
  perCharMs: number;
  /** 0..1, relative random spread applied to base and per-char time. */
  jitter: number;
  slowChance: number;
  slowExtraMs: [number, number];
  minMs: number;
  maxMs: number;
}

export interface LevelConfig {
  name: string;
  temperature: number;
  maxChars: number;
  maxTokens: number;
  delay: DelayConfig;
  typoProbability: number;
  lowercaseProbability: number;
  dropEndPunctuationProbability: number;
  styleNotes: string;
  /** language code -> short generic answers used when the LLM fails. */
  fallbacks: Record<string, string[]>;
}

/** Reads config/levels.json, re-reading when the file changes so tuning needs no restart. */
export class LevelStore {
  private cache: Record<string, LevelConfig> | null = null;
  private mtime = 0;

  constructor(private file = paths.levels) {}

  get(level: number): LevelConfig {
    const all = this.load();
    const key = String(Math.min(5, Math.max(1, Math.round(level))));
    const cfg = all[key];
    if (!cfg) throw new Error(`levels.json has no entry for level ${key}`);
    return cfg;
  }

  private load(): Record<string, LevelConfig> {
    const m = fs.statSync(this.file).mtimeMs;
    if (!this.cache || m !== this.mtime) {
      this.cache = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Record<string, LevelConfig>;
      this.mtime = m;
    }
    return this.cache;
  }
}
