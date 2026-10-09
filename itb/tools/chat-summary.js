#!/usr/bin/env node
'use strict';
/* node tools/chat-summary.js [logs/chat.jsonl]
 * Per AI level: how many AI answers, how often the LLM failed (fallback), average delay, and how the humans
 * treated the AIs in meetings (share of meetings where an AI got >= 1 vote, and ejection rate). Lower = better disguise. */
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'logs', 'chat.jsonl');
if (!fs.existsSync(file)) { console.error('No log at ' + file + ' (play a match with the server first).'); process.exit(1); }
const by = {};
const lv = (l) => by[l] || (by[l] = { answers: 0, fallback: 0, delay: 0, timeouts: 0, aiSlots: 0, votedFor: 0, ejected: 0, meetings: 0 });
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const o = JSON.parse(line);
  if (o.type === 'qa') {
    for (const a of o.answers) if (a.authorType === 'ai') { const s = lv(o.level); if (a.timedOut) s.timeouts++; else { s.answers++; s.fallback += a.fallback ? 1 : 0; s.delay += a.delayMs || 0; } }
  } else if (o.type === 'result') {
    const s = lv(o.level); s.meetings++;
    for (const p of o.ai) { s.aiSlots++; s.votedFor += p.votes > 0 ? 1 : 0; s.ejected += p.ejected ? 1 : 0; }
  }
}
const pct = (n, d) => (d ? (100 * n / d).toFixed(0) + '%' : 'n/a');
console.table(Object.keys(by).sort().map((l) => ({
  level: l, aiAnswers: by[l].answers, llmFallback: pct(by[l].fallback, by[l].answers), avgDelayMs: by[l].answers ? Math.round(by[l].delay / by[l].answers) : 0,
  meetings: by[l].meetings, aiGotVotes: pct(by[l].votedFor, by[l].aiSlots), aiEjected: pct(by[l].ejected, by[l].aiSlots),
})));
