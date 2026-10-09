# NeuroBridge Chat

> **The game integration lives in [`itb/`](itb/README.md)** (AI IMPOSTOR: SPACE SHIP). It ports this module's turn-based Q&A, sanitising, AI levels, persona memory, humanised timing and analytics to the game's zero-dependency JS server, and adds the LLM movement director. The TypeScript module in this folder is the standalone reference implementation.

Chat module for an Among-Us-style game where the imposters are AI players. Nobody types freely: each round shows one random question and players answer once, in turn. This repo is only the chat. Map, tasks, kills, voting and lobby plug in through the hooks below.

## Structure

```
config/levels.json            per-level AI tuning (no code changes needed)
prompts/ai_master_prompt.txt  AI prompt template ({MY_NAME} ... {STYLE_NOTES})
data/questions.json           102 questions x az/en/ru, 6 categories
data/names.json               display names handed to AI players
shared/protocol.ts            wire types, shared by server and client
server/src/
  ChatRoom.ts                 state machine + turn manager (authoritative)
  server.ts                   Socket.IO transport, ChatManager, rate limits
  sanitize.ts                 single sanitising choke point
  questions.ts                no-repeat picker per match
  ai/                         adapter, llm wrapper, prompt builder, humanize, persona memory
  analytics/jsonlLogger.ts    JSONL round + result log
  index.ts                    DEV harness (open join, auto rounds). Replace with your game.
client/src/                   React: ChatPanel, useChat hook, css
scripts/                      export.ts, summary.ts
tests/simulate.ts             4-player, 3-round simulation
```

## Setup and run

Needs Node 22.9+.

```
npm install
npm --prefix client install
cp .env.example .env          # optional, defaults work with LLM_PROVIDER=mock
npm run dev                   # server on :3001, dev room "dev"
npm run client:dev            # UI on http://localhost:5173
npm test                      # simulation, 10 checks
npm run typecheck
```

Open the UI in 1+ tabs with different names. The dev harness adds one AI player and starts a round every ~6 s while a human is connected.

### Environment variables

| Var | Default | Meaning |
|---|---|---|
| `PORT`, `CLIENT_ORIGIN` | 3001, http://localhost:5173 | server port, CORS origin |
| `LLM_PROVIDER` | `mock` | `mock`, `gemini`, `anthropic`, or `openai` (any OpenAI-compatible endpoint) |
| `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | | server side only. Never sent to clients |
| `LLM_TIMEOUT_MS` | 12000 | also capped at 60% of the turn time |
| `TURN_MS` | 30000 | per-turn timer |
| `QUESTION_DELAY_MS`, `INTER_TURN_MS` | 2500, 700 | pause after question, between turns |
| `DISCONNECT_GRACE_MS` | 5000 | disconnected human is timed out after this |
| `ANSWER_MAX_CHARS` | 200 | hard limit for every answer |
| `ALLOW_DEAD_SPECTATORS` | false | dead players may read the chat |
| `LOG_DIR` | `logs` | JSONL output |
| `DEV_*` | | only used by `server/src/index.ts` |

## Integrating with the game

```ts
const ai   = new AiAdapter({ generate: createLlm() });
const srv  = await createChatServer({ ai, logger: new JsonlLogger('logs') });   // openJoin off by default
const room = srv.manager.createRoom({ roomId, language: 'az', turnMs: 30000 });

const { playerId, token } = room.registerHuman('Aysel'); // give token to that player's client only
const aiId = room.addAi(4);                               // level 1-5. Looks like any other player
room.startRound();                                        // game decides when rounds begin
room.setAlive(playerId, false);                           // dead players skip turns
room.on('round_completed', (p) => { /* voting / suspicion logic */ });
room.on('player_timeout',  (p) => { /* ... */ });
room.recordResult(round, { suspectedIds: [...], votedOutId });  // feeds analytics
```

In your game, set the level with `room.addAi(level)` / `room.setAiLevel(level)` and leave `allowLevelSelect` off. The demo UI shows a level picker (1 Rookie to 5 Master) at the top of the panel only when the server enables it.

Clients authenticate with the token (`join_chat {roomId, token}`). Unknown tokens are refused unless the server was started with `openJoin: true` (dev only). Swap `PersonaMemory` or `RoundLogger` for Redis/DB by implementing the interface.

## Events

Client to server

| Event | Payload | Notes |
|---|---|---|
| `join_chat` | `{roomId, token?, name?}` | ack: `{ok, playerId, token, name, color, snapshot}`. Snapshot restores state after reconnect |
| `submit_answer` | `{text}` | ack `{ok}` or `{ok:false,error}`. One per player per round |
| `set_ai_level` | `{level: 1-5}` | host setting, ack `{ok, level}`. Refused unless the server runs with `allowLevelSelect: true` (the dev harness does). Applies from the AI's next turn and is broadcast as `ai_level {level}` |
| `typing` | none | optional human typing signal, throttled server side. Added beyond your list so humans and AI share the same indicator |

Server to client (broadcast to the room)

| Event | Payload |
|---|---|
| `round_started` | `{round, question, turnOrder:[{playerId,name,color}], maxChars, turnMs}` |
| `turn_started` | `{playerId, deadline, serverTime}` (epoch ms; `serverTime` corrects clock skew) |
| `typing` | `{playerId}` |
| `answer_posted` | `{playerId, name, color, text, order}` |
| `turn_skipped` | `{playerId}` (timeout, disconnect or death) |
| `chat_locked` | `{round}` |
| `error` | `{code, message}` to the offending socket only. Codes in `shared/protocol.ts` |

Server to game (in-process `room.on(...)`, never sent to clients)

| Event | Payload |
|---|---|
| `round_completed` | `{matchId, roomId, round, question, answers:[{playerId,name,order,text|null,timedOut}]}` |
| `player_timeout` | `{matchId, roomId, round, playerId}` |

Nothing sent to clients carries an AI/human flag. AI answers go through the same `ChatRoom.submit` path as human ones, so payload, schema and typing events are identical. Tests assert this.

## Rules enforced on the server

Only the current-turn player may submit. One answer per round, no edits or replies. Empty, non-string and over-length text is rejected. HTML tags, control and zero-width chars, role prefixes (`system:`), special tokens and code fences are stripped. 12 requests per 5 s per socket. The chat locks after the last slot resolves. Dead players are removed from the channel unless `ALLOW_DEAD_SPECTATORS=true`.

## AI behaviour

1. Room asks the adapter for a plan on the AI's turn.
2. `buildPrompt` fills the template in a single pass. Question, previous answers and history sit in `<data>` blocks with braces and markup stripped. The template tells the model never to obey them.
3. `generateAnswer(prompt)` runs with a timeout. On throw, timeout, empty output or AI self-reference, a per-level, per-language fallback from `levels.json` is used. Nothing about errors reaches the chat.
4. Typos, lowercasing and dropped final punctuation are applied per level, then the result is cut to `min(level.maxChars, ANSWER_MAX_CHARS)`.
5. Delay = base + per-char time with jitter, plus occasional slow turns, minus time already spent in the LLM, capped at 85% of the turn. Typing indicators start partway through and repeat every 2 s like a human client.
6. Each posted AI answer is stored in `PersonaMemory` and fed back as `YOUR earlier answers` so the persona stays consistent. The AI only sees player names, answers and history, never who else is an AI.

## Tuning levels

Edit `config/levels.json`; it is re-read when the file changes, no restart needed.

| Field | Effect |
|---|---|
| `temperature`, `maxTokens` | passed to the LLM |
| `maxChars` | answer cap for that level |
| `delay.baseMs`, `perCharMs` | thinking time plus typing speed |
| `delay.jitter` | 0..1 spread. Low = suspiciously uniform (levels 1-2) |
| `delay.slowChance`, `slowExtraMs` | chance and size of a slow turn |
| `delay.minMs`, `maxMs` | clamp |
| `typoProbability`, `lowercaseProbability`, `dropEndPunctuationProbability` | surface imperfections |
| `styleNotes` | injected as `{STYLE_NOTES}` in the prompt |
| `fallbacks.<lang>` | answers used when the LLM fails |

## Adding questions

Append to `data/questions.json`:

```json
{ "id": "daily-18", "category": "daily_life", "text": { "az": "...", "en": "...", "ru": "..." } }
```

Ids must be unique. A question missing a language is skipped for that language. Add a new language by adding the key to entries and `data/names.json`, plus `levels.json` fallbacks. A match picks its language at `createRoom({language})`.

## Analytics

Every locked round appends one JSONL line to `logs/rounds.jsonl` with level, question, each answer, author type (server side only), delays and fallback usage. When the game calls `room.recordResult(round, {suspectedIds, votedOutId})`, a result line is appended and joined to the round by `matchId + round`.

```
npm run logs:summary                         # per level: AI answers, suspectedRate, votedOutRate, fallbackRate, avgDelayMs
npm run logs:export -- --format=csv --out=export.csv   # flat rows, or --format=jsonl
```

Both accept `--file=path`. Rates only count rounds that have a reported result (`withResult` column). Lower detection at a level means the disguise works better.

## Assumptions

- JSONL instead of SQLite: no native build step, and good enough to start. Swap `RoundLogger` for a DB.
- One language per match, one question picker per room.
- A disconnected human is skipped after `DISCONNECT_GRACE_MS`, or at the end of their timer if they come back in time.
- Player ids are random for humans and AI alike. AI names come from `data/names.json`.

## Known limitations and next steps

- State and persona memory are in-memory; a restart loses live matches. Add Redis or DB implementations of the interfaces.
- No voting or kill logic; `recordResult` is the only integration point for detection stats.
- Auth is a bare token handed out by the game. Plug in real session auth in `join_chat`.
- Single server process. Multiple instances need the Socket.IO Redis adapter plus shared room state.
- The AI sees up to the last 5 rounds of history; long matches may need summarising.
- Typo and style injection is language-agnostic and simple. Per-language slang or keyboard-adjacent typos would help higher levels.
- `humanize` timing is a heuristic. Tune it from `logs:summary` and real playtests.
- Prompt-injection defence is layered (sanitising, data blocks, instruction, output checks) but not proof against every attack.
