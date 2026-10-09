import fs from 'node:fs';
import path from 'node:path';
import { env } from '../server/src/config';

export interface FlatRow {
  matchId: string;
  round: number;
  language: string;
  category: string;
  question: string;
  playerId: string;
  name: string;
  authorType: 'human' | 'ai';
  level: number | null;
  text: string | null;
  timedOut: boolean;
  delayMs: number | null;
  fallbackUsed: boolean;
  /** null = no result reported for this round yet */
  suspected: boolean | null;
  votedOut: boolean | null;
}

export function logPath(): string {
  const arg = process.argv.find((a) => a.startsWith('--file='));
  return arg ? path.resolve(arg.slice(7)) : path.join(env.logDir, 'rounds.jsonl');
}

/** Reads the JSONL log and joins each answer with its round result (if any). */
export function readRows(file = logPath()): FlatRow[] {
  if (!fs.existsSync(file)) throw new Error(`No log file at ${file}`);
  const results = new Map<string, { suspected: boolean; votedOut: boolean }>();
  const rounds: any[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (o.type === 'round') rounds.push(o);
    else if (o.type === 'result') for (const p of o.players) results.set(`${o.matchId}|${o.round}|${p.playerId}`, p);
  }
  return rounds.flatMap((r) =>
    r.answers.map((a: any): FlatRow => {
      const res = results.get(`${r.matchId}|${r.round}|${a.playerId}`);
      return {
        matchId: r.matchId,
        round: r.round,
        language: r.language,
        category: r.category,
        question: r.question,
        playerId: a.playerId,
        name: a.name,
        authorType: a.authorType,
        level: a.level,
        text: a.text,
        timedOut: a.timedOut,
        delayMs: a.delayMs,
        fallbackUsed: a.fallbackUsed,
        suspected: res ? res.suspected : null,
        votedOut: res ? res.votedOut : null,
      };
    }),
  );
}
