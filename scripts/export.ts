// Usage: npm run logs:export -- [--format=csv|jsonl] [--out=path] [--file=logs/rounds.jsonl]
import fs from 'node:fs';
import { readRows, type FlatRow } from './lib';

const arg = (name: string, d: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const format = arg('format', 'csv');
const out = arg('out', `export.${format}`);

const rows = readRows();
const cols: (keyof FlatRow)[] = [
  'matchId',
  'round',
  'language',
  'category',
  'question',
  'playerId',
  'name',
  'authorType',
  'level',
  'text',
  'timedOut',
  'delayMs',
  'fallbackUsed',
  'suspected',
  'votedOut',
];
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const body =
  format === 'jsonl'
    ? rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
    : [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';

fs.writeFileSync(out, body);
console.log(`wrote ${rows.length} rows to ${out}`);
