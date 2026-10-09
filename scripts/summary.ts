// Detection rate per AI level. Usage: npm run logs:summary [-- --file=logs/rounds.jsonl]
import { readRows } from './lib';

const ai = readRows().filter((r) => r.authorType === 'ai' && !r.timedOut);

interface Stat { answers: number; judged: number; suspected: number; votedOut: number; fallback: number; delaySum: number }
const byLevel = new Map<number, Stat>();
for (const r of ai) {
  const s = byLevel.get(r.level ?? 0) ?? { answers: 0, judged: 0, suspected: 0, votedOut: 0, fallback: 0, delaySum: 0 };
  s.answers++;
  s.fallback += r.fallbackUsed ? 1 : 0;
  s.delaySum += r.delayMs ?? 0;
  if (r.suspected !== null) {
    s.judged++;
    s.suspected += r.suspected ? 1 : 0;
    s.votedOut += r.votedOut ? 1 : 0;
  }
  byLevel.set(r.level ?? 0, s);
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
console.table(
  [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, s]) => ({
      level,
      aiAnswers: s.answers,
      withResult: s.judged,
      suspectedRate: pct(s.suspected, s.judged),
      votedOutRate: pct(s.votedOut, s.judged),
      fallbackRate: pct(s.fallback, s.answers),
      avgDelayMs: s.answers ? Math.round(s.delaySum / s.answers) : 0,
    })),
);
console.log('suspectedRate = share of AI answers whose author humans flagged; votedOutRate = share voted out. Rounds without a reported result are excluded from both.');
