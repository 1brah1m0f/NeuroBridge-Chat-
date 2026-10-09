# AI IMPOSTOR: SPACE SHIP

A social-deduction game on a spaceship. **Real players** repair the ship's systems (power, navigation, communications, life support...) while hidden **AI impostors** pretend to be human, work together, and kill. In meetings nobody types freely: every player **answers the same questions in turn**, and you have to work out who the AI is from how they answer. Then you vote.

Plain HTML5 canvas, no build step. Offline in the browser (`index.html`) or online rooms with Node.js (zero npm dependencies). Art and sound are generated in the browser. Languages: Azerbaijani (default) and English.

**AZ qısa:** Kosmik gəmidə real oyunçular sistemləri təmir edir, gizli AI saxtakarlar insan kimi davranıb öldürür. Yığıncaqda hər kəs eyni suallara növbə ilə cavab verir, sən də cavablardan AI-ı tapıb səs verirsən. Quraşdırma və qaydalar aşağıda ingiliscədir; oyun özü Azərbaycan dilində açılır.

## Rules

| Total players | AI impostors |
|---|---|
| 5-6 | 1 |
| 7-9 | 2 |
| 10-12 | 3 |

- The lobby holds up to **9 humans/NPCs** (min 4). The AIs are added automatically when the match starts so the total matches the table (4 -> 5 players, 6 -> 8, 8 -> 11, 9 -> 12). Nobody can tell which player was added.
- **Every AI is an impostor.** They know each other, want to win together, walk the map, fake tasks, use vents, sabotage and kill. Humans never get the impostor role.
- **Humans win** when every AI is ejected, or when all tasks are done (lobby setting *Win by Tasks*, on by default). **AIs win** when they equal the number of living humans, or when a critical sabotage (reactor, oxygen) is not fixed in time.
- Found a body (REPORT) or pressed the emergency button -> meeting.

### Meetings: questions and answers
1. **3 questions** (setting *Questions per Meeting*). The first is about the match ("where were you?", "who did you see last?"), the others are everyday/opinion/"would you rather" questions that are easy for a human and hard to fake.
2. For each question every living player answers **once**, in a random turn order, within the *Answer Time* (default 25 s). The input is enabled only on your turn. Silence = "no answer", which looks suspicious.
3. After the last question **voting opens**. Most votes is ejected; the reveal says whether they were an AI.
4. **Free chat** is only available on **AI level 3 and above**, and only when the meeting was started by a **found body**. On levels 1-2 (and for emergency meetings) it is questions and answers only.

### AI level (lobby setting *AI Level*, 1-5)
Controls how human the AIs sound: 1 Rookie (tidy, polite, uniform timing, easy to spot) ... 5 Master (casual, lazy, typos, unpredictable timing, consistent persona). Tuning lives in `AS.AI_LEVELS` in `js/core/qa.js` (delays, typo/lowercase probabilities, style notes, fallback answers).

## Run

**Offline (no keys needed):** open `index.html`. Pick the number of NPC players and the AI level. AIs use the built-in behaviour and answers.

**Online / LLM-powered AIs:**
1. Install Node.js 18+.
2. Copy `.env.example` to `.env` and fill the keys (below). The file is git-ignored and never served to browsers.
3. Double-click `start-server.bat` (or `node server/server.js`). Open `http://localhost:3000`; friends on the same Wi-Fi use the `192.168...` address printed in the window. One player creates a room and shares the 4-letter code.

| Service | Variable | Used for |
|---|---|---|
| Google Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.1-flash-lite`) | the AIs' answers in meetings |
| Groq | `GROQ_API_KEY`, `GROQ_MODEL` (default `openai/gpt-oss-20b`) | the AIs' movement decisions |

Without a key the corresponding feature silently falls back to the built-in behaviour. The server prints which services are active on start.

> `llama-3.1-8b-instant` is not available on Groq any more (the API returns `model_not_found`), so the director defaults to `openai/gpt-oss-20b`, which answers in about half a second. Change `GROQ_MODEL` if you have access to something else. Groq limits requests and tokens per minute; `GROQ_RPM` / `GROQ_TPM` (defaults 24 / 7000) cap what the server sends. With 2-3 AIs that is roughly one decision per AI every 25-40 s; the built-in behaviour fills the gaps. Raise the caps on a paid plan.

### How the AI works
- **Movement (Groq).** Each AI periodically gets a compact view: the ship graph, what it can currently see, its fake task list, its allies, cooldowns. The model returns one JSON action (`goto`, `fake_task`, `follow`, `kill`, `vent`, `sabotage`, `wait`). The server validates it against the real game state and the bot code pathfinds, fakes tasks, kills (only unseen), vents. Slow or invalid answers fall back to the built-in bot. AIs only use information a player could legitimately have.
- **Answers (Gemini).** The prompt (`server/prompts/ai_chat_prompt.txt`) holds the question, previous answers, the AI's own earlier answers (persona memory), private match facts and the level's style notes. Player text is untrusted: stripped and wrapped in `<data>` blocks. The reply is cleaned (one line, no AI self-reference), restyled for the level (typos, lowercase), and posted after a human-like delay with typing indicators, through the same path as a human answer. Failure or timeout falls back to a local answer, so a turn never gets stuck.
- **Nothing reveals an AI.** Snapshots carry no AI/bot flag after the lobby, events are identical for humans and AIs, and the roles of other players are never sent to a human.

### Analytics
`logs/chat.jsonl` (server only) records every question with each answer's author type, level, delay and whether the LLM failed, plus per-meeting votes against each AI. `node tools/chat-summary.js` prints per level: AI answers, LLM fallback rate, average delay, how often an AI got votes / was ejected.

## Controls
| Action | Keyboard | Touch |
|---|---|---|
| Move | `W A S D` / arrows | virtual joystick |
| Use (tasks, button, cameras, admin table) | `E` / `Space` | USE |
| Report a body | `R` | REPORT |
| Map | `Tab` / `M` | MAP |
| Close a panel | `Esc` | X |

(Kill / vent / sabotage buttons exist for the AI side only; humans are never impostors.)

## Developers
- Shared simulation in `js/core/` (also loaded by the server): `game.js` (rules), `qa.js` (meeting Q&A, AI levels, sanitising), `bots.js` (bot brain, perception API, directive executor), `questions.js` (question bank, 118 questions az/en). Server: `server/` (`server.js` rooms, `director.js` Groq, `ai-chat.js` Gemini, `analytics.js`, `llm.js`, `env.js`). Details: `docs/CONTRACT.md` (section 10 lists what changed) and `docs/AGENTS.md`.
- URL parameters: `?lang=en|az`, `?auto=1` (start offline immediately, with `&bots=5&level=3&seed=42&skill=hard`), `?debug=1`, `?scene=lobby|intro|meeting|voting|eject|end|map|sabotage`.
- Tests: `node tools/test-rules.js` (new rules, 45 checks), `node tools/test-net.js` (server and protocol, 75 checks), `node tools/sim.js 3 7 --chat` (headless bot matches), `node tools/validate-map.js`. With real keys: `node tools/live-test.js` (Groq director + Gemini Q&A headless) and `node tools/live-room.js` (real server room). `tools/test-core.js` is legacy: its fixtures assume human impostors, so its role-based tests fail by design.
- Server env: `PORT` (3000), `HOST` (0.0.0.0; use `127.0.0.1` for local-only), `LOG_DIR`, `DIRECTOR_DEBUG=1` to log every director decision.

## Known limitations
- Offline play cannot use the LLMs (a browser must never hold the keys), so offline AIs use the built-in behaviour and canned answers.
- AIs never kill each other, although the design document allows it.
- Free chat replies from AIs still come from the rule-based bot (Q&A answers are the LLM-powered part).
- Task mini-games keep their original mechanics; only names and flavour were rethemed to ship systems. New mini-game mechanics are not built yet.
- Rotate any API key that has been pasted into a chat or committed anywhere.
