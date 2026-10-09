// Dev harness: one open-join room, auto-started rounds. A real game replaces this file and drives
// ChatManager / ChatRoom directly (registerHuman, addAi, startRound, recordResult, setAlive).
import { AiAdapter } from './ai/adapter';
import { createLlm } from './ai/llm';
import { JsonlLogger } from './analytics/jsonlLogger';
import { env } from './config';
import { createChatServer } from './server';

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

const ai = new AiAdapter({ generate: createLlm() });
const logger = new JsonlLogger(env.logDir);
const server = await createChatServer({ ai, logger, openJoin: true, allowLevelSelect: true });

const roomId = process.env.DEV_ROOM ?? 'dev';
const room = server.manager.createRoom({ roomId, language: process.env.DEV_LANGUAGE ?? 'en' });
for (let i = 0; i < num(process.env.DEV_AI_COUNT, 1); i++) room.addAi(num(process.env.DEV_AI_LEVEL, 3));

room.on('round_completed', (p) => console.log(`[game] round ${p.round} completed (${p.answers.length} slots)`));
room.on('player_timeout', (p) => console.log(`[game] timeout ${p.playerId}`));

const minHumans = num(process.env.DEV_MIN_HUMANS, 1);
const gapMs = num(process.env.DEV_ROUND_GAP_MS, 6000);
let lockedAt = 0;
room.on('round_completed', () => (lockedAt = Date.now()));
setInterval(() => {
  const idle = room.phase === 'IDLE' || (room.phase === 'LOCKED' && Date.now() - lockedAt > gapMs);
  if (idle && room.connectedHumans() >= minHumans) room.startRound();
}, 1000);

console.log(`[chat] listening on :${server.port}, room "${roomId}", llm=${env.llmProvider}, logs=${logger.file}`);
