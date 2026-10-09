'use strict';
/* Q&A analytics (JSONL, server side only). Author types (human / ai / npc) live only in these files.
 *   {type:'qa', ...}      one line per finished question: every answer with author type, level, delay, fallback use
 *   {type:'result', ...}  one line per meeting: votes received per AI and whether an AI was ejected
 * `node tools/chat-summary.js` joins them into "how often were AIs voted for / ejected, per level".
 */
const fs = require('fs');
const path = require('path');

function create(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'chat.jsonl');
  const write = (o) => { try { fs.appendFileSync(file, JSON.stringify(o) + '\n'); } catch (e) { console.error('[analytics]', e.message); } };
  const kind = (p) => (p.isAI ? 'ai' : p.isBot ? 'npc' : 'human');

  // game.hooks
  return {
    file,
    attach(game, roomCode) {
      const buf = [];
      game.hooks = {
        qaAnswer(d) {
          buf.push({ player: d.player.id, name: d.player.name, authorType: kind(d.player), level: d.player.isAI ? game.settings.aiLevel : null,
            text: d.text, timedOut: !!d.timedOut, delayMs: d.delayMs == null ? null : d.delayMs, fallback: !!(d.meta && d.meta.fallback),
            llmMs: d.meta && d.meta.llmMs != null ? d.meta.llmMs : null, source: (d.meta && d.meta.source) || null });
        },
        qaRound(d) {
          write({ type: 'qa', ts: new Date().toISOString(), room: roomCode, seed: game.seed, meeting: d.meeting, round: d.round, level: game.settings.aiLevel,
            freeChat: game.freeChatOpen ? !!(game.meeting && game.meeting.body != null && game.settings.aiLevel >= 3) : false,
            question: { id: d.q.id, category: d.q.category, en: d.q.en }, answers: buf.splice(0, buf.length) });
        },
        meetingResult(d) {
          const players = game.list().filter((p) => p.isAI).map((p) => ({ id: p.id, name: p.name, votes: (d.tally[p.id] || []).length, ejected: d.ejected === p.id }));
          const total = Object.keys(d.tally).reduce((a, k) => a + d.tally[k].length, 0);
          write({ type: 'result', ts: new Date().toISOString(), room: roomCode, seed: game.seed, meeting: d.meetingNo, level: game.settings.aiLevel, totalVotes: total, ai: players, ejectedWasAI: d.ejectedWasAI });
        },
      };
    },
  };
}

module.exports = { create };
