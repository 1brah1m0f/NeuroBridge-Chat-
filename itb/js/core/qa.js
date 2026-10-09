/* AI IMPOSTOR: SPACE SHIP — meeting Q&A chat (browser + Node).
 *
 * During a meeting's discussion stage the game asks `settings.qaRounds` (default 3) questions. For every question the
 * alive players answer ONCE, in a random turn order, with a per-turn timer (`settings.answerTime`). Nobody types freely.
 * When the last question is done, the voting stage opens.
 * Free chat is separate: it opens only when `settings.aiLevel >= 3` AND the meeting was started by a found body
 * (see Game.freeChatOpen). On levels 1-2 meetings are pure questions and answers.
 *
 * Humans answer with the `answer` action. Bots (AI impostors + NPC crew) answer through an async provider:
 *   game.aiProvider = { answer(ctx) -> Promise<{ text, llmMs?, fallback? }> }   (server sets it; LLM lives server side)
 * with a synchronous local generator (AS.Bots.qaLocal) as the offline / failure fallback. Either way the answer is
 * restyled per AI level (typos, lowercase...) and delayed like a person typing, then posted through the same path as a
 * human answer, so events and snapshots are identical (no AI flag anywhere).
 *
 * Server-side observers (analytics) use game.hooks.{qaAnswer, qaRound, meetingResult}; they never reach clients.
 */
(function (AS) {
  'use strict';
  const U = AS.util, T = AS.T;
  const QA_MAX_CHARS = 140;
  AS.QA_MAX_CHARS = QA_MAX_CHARS;

  // ====================================================================== AI levels (tuning, no code changes needed elsewhere)
  // delay: ms. fallbacks: short generic answers used when the LLM fails or offline.
  AS.AI_LEVELS = {
    1: { name: 'Rookie', temperature: 0.3, maxChars: 140, maxTokens: 120,
      delay: { baseMs: 700, perCharMs: 18, jitter: 0.05, slowChance: 0, slowExtraMs: [0, 0], minMs: 600, maxMs: 4000 },
      typo: 0, lower: 0, dropEnd: 0,
      styleNotes: 'Two short, complete, tidy sentences. Polite and balanced, a little textbook-like. No slang, no typos, no personal story. Stay slightly vague where a person would be specific.',
      fallbacks: {
        en: ['That is a good question. I would say something simple and familiar.', 'I do not have a strong opinion on this. I usually like calm and easy things.'],
        az: ['Yaxşı sualdır. Məncə sadə və tanış bir şey olar.', 'Bu barədə güclü fikrim yoxdur. Adətən sakit və rahat şeyləri sevirəm.'],
      } },
    2: { name: 'Beginner', temperature: 0.5, maxChars: 120, maxTokens: 100,
      delay: { baseMs: 900, perCharMs: 30, jitter: 0.12, slowChance: 0.02, slowExtraMs: [1000, 2500], minMs: 800, maxMs: 6000 },
      typo: 0.02, lower: 0.05, dropEnd: 0.1,
      styleNotes: 'Short casual tone, one or two sentences, minimal personal detail, rare slang. A bit tidy and non-committal.',
      fallbacks: {
        en: ['Not sure, I think the usual one is fine.', 'Hard to say honestly, I like simple things.'],
        az: ['Əmin deyiləm, adi olanı yaxşıdır məncə.', 'Düzü demək çətindir, sadə şeyləri sevirəm.'],
      } },
    3: { name: 'Average', temperature: 0.7, maxChars: 110, maxTokens: 90,
      delay: { baseMs: 1200, perCharMs: 55, jitter: 0.3, slowChance: 0.06, slowExtraMs: [1500, 4000], minMs: 900, maxMs: 9000 },
      typo: 0.07, lower: 0.15, dropEnd: 0.35,
      styleNotes: 'Normal player. Casual, opinionated, light slang matching the chat, an occasional small imperfection. Specifics present but modest.',
      fallbacks: {
        en: ['hmm not sure tbh, probably the usual', 'hard to pick, whatever is easiest i guess', 'idk, depends on my mood lol'],
        az: ['hmm bilmirəm düzü, yəqin adi olan', 'seçmək çətindir, hansı asandırsa də', 'bilmirəm, əhvaldan asılıdır'],
      } },
    4: { name: 'Advanced', temperature: 0.85, maxChars: 100, maxTokens: 80,
      delay: { baseMs: 1500, perCharMs: 75, jitter: 0.45, slowChance: 0.12, slowExtraMs: [2000, 6000], minMs: 1000, maxMs: 14000 },
      typo: 0.15, lower: 0.4, dropEnd: 0.55,
      styleNotes: 'Mirror the other players: length, punctuation, capitalisation, slang. Include a small concrete personal detail or opinion. Occasional typo, trailing off, or a mild joke. Vary mood between questions.',
      fallbacks: {
        en: ['ugh this one is hard, ill go with the usual', 'no idea lol', 'honestly whatever i had yesterday'],
        az: ['ay bu çətindi, adi olanı deyim', 'heç bilmirəm ee', 'düzü dünən nə idisə o'],
      } },
    5: { name: 'Master', temperature: 0.95, maxChars: 90, maxTokens: 70,
      delay: { baseMs: 1800, perCharMs: 90, jitter: 0.6, slowChance: 0.18, slowExtraMs: [3000, 9000], minMs: 1100, maxMs: 20000 },
      typo: 0.2, lower: 0.5, dropEnd: 0.7,
      styleNotes: 'Indistinguishable from the best human. Consistent fake persona. Sometimes lazy and short, sometimes emotional. Occasionally give a slightly wrong or unpopular answer. Never the most polished answer in the room.',
      fallbacks: {
        en: ['idk man', 'lol hard one... skip', 'eh same as always i guess', 'hmm honestly no clue'],
        az: ['bilmirəm ee', 'lol çətin sualdı', 'eh həmişəki kimi də', 'hmm düzü heç ideyam yoxdu'],
      } },
  };
  AS.aiLevel = (lv) => AS.AI_LEVELS[U.clamp(Math.round(Number(lv) || 3), 1, 5)];

  // ====================================================================== text helpers (shared by humans, bots and the server)
  // C0/C1 controls, zero-width and bidi marks, line/paragraph separators, invisible operators, BOM.
  // Keep in sync with itb/js/core/qa.js (CONTROL) and server/src/sanitize.ts.
  const CONTROL = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF]/g;
  const TAGS = /<\/?[a-zA-Z!][^>]*>?/g;
  const SPECIAL = /<\|[^|]*\|>|\[\/?(?:INST|SYS)\]|<<\/?SYS>>/gi;
  const ROLE_PREFIX = /^\s*(?:system|assistant|developer|user|human|ai)\s*[:>]\s*/i;
  const HEADING_ROLE = /#{2,}\s*(?:system|instruction|assistant)s?\b/gi;

  // Strip markup, control chars and system-like content; single line.
  AS.stripUnsafe = function (input) {
    let s = String(input == null ? '' : input);
    try { s = s.normalize('NFC'); } catch (e) { /* ignore */ }
    s = s.replace(SPECIAL, ' ');
    for (let prev = ''; prev !== s;) { prev = s; s = s.replace(TAGS, ' '); }
    s = s.replace(/[<>]/g, '').replace(/`{3,}/g, ' ').replace(HEADING_ROLE, ' ');
    s = s.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
    for (let prev = ''; prev !== s;) { prev = s; s = s.replace(ROLE_PREFIX, ''); }
    return s.trim();
  };

  // -> { ok:true, text } | { ok:false, err:'badAction'|'empty'|'tooLong' }
  AS.sanitizeAnswer = function (raw, max) {
    max = max || QA_MAX_CHARS;
    if (typeof raw !== 'string') return { ok: false, err: 'badAction' };
    if (raw.length > max * 8 + 512) return { ok: false, err: 'tooLong' };
    const text = AS.stripUnsafe(raw);
    if (!text) return { ok: false, err: 'empty' };
    if (Array.from(text).length > max) return { ok: false, err: 'tooLong' };
    return { ok: true, text };
  };

  // Cut to max chars on a word boundary when possible (for generated text, which is trimmed not rejected).
  AS.truncateText = function (text, max) {
    const ch = Array.from(text);
    if (ch.length <= max) return text;
    const cut = ch.slice(0, max).join('');
    const sp = cut.lastIndexOf(' ');
    return (sp > max * 0.5 ? cut.slice(0, sp) : cut).trim();
  };

  function injectTypo(text, rng) {
    const words = text.split(' ');
    const cand = [];
    words.forEach((w, i) => { if (/^[\p{L}]{4,}$/u.test(w)) cand.push(i); });
    if (!cand.length) return text;
    const i = cand[Math.floor(rng() * cand.length)];
    const w = Array.from(words[i]);
    const k = 1 + Math.floor(rng() * (w.length - 2));
    const kind = Math.floor(rng() * 3);
    if (kind === 0) { const t = w[k]; w[k] = w[k + 1]; w[k + 1] = t; } else if (kind === 1) w.splice(k, 1); else w.splice(k, 0, w[k]);
    words[i] = w.join('');
    return words.join(' ');
  }

  // Level-driven surface imperfections: typos, lowercase, missing final punctuation.
  AS.qaStyle = function (text, level, rng) {
    const L = AS.aiLevel(level);
    let s = text;
    if (rng() < L.typo) s = injectTypo(s, rng);
    if (rng() < L.lower) s = s.toLocaleLowerCase();
    if (rng() < L.dropEnd) s = s.replace(/[.!]+$/, '');
    return s;
  };

  // Seconds from the start of the turn until the answer is posted (typing speed + thinking + occasional slow turn).
  AS.aiDelay = function (len, level, rng, capSec) {
    const d = AS.aiLevel(level).delay;
    const spread = (x) => x * (1 + (rng() * 2 - 1) * d.jitter);
    let ms = spread(d.baseMs) + spread(len * d.perCharMs);
    if (rng() < d.slowChance) ms += d.slowExtraMs[0] + rng() * (d.slowExtraMs[1] - d.slowExtraMs[0]);
    ms = U.clamp(ms, d.minMs, d.maxMs);
    return Math.min(ms / 1000, capSec == null ? 1e9 : capSec);
  };

  const AI_SELF = /\b(as an ai|language model|i am an ai|i'm an ai|i am a bot|i'm a bot|imposter|impostor|system prompt)\b/i;
  // Raw model output -> one plain answer line, or null.
  AS.cleanModelAnswer = function (raw, max) {
    let s = String(raw == null ? '' : raw).trim();
    s = (s.split(/\r?\n/).find((l) => l.trim()) || '');
    s = s.replace(/^\s*(?:answer|response|reply)\s*:\s*/i, '').replace(/^["'“”«»]+|["'“”«»]+$/g, '');
    s = AS.stripUnsafe(s);
    if (!s || AI_SELF.test(s)) return null;
    return AS.truncateText(s, max || QA_MAX_CHARS);
  };

  if (AS.i18n) {
    AS.i18n.add({
      az: { 'err.chatClosed': 'Çat indi bağlıdır', 'err.notYourTurn': 'Növbə səndə deyil', 'err.answered': 'Artıq cavab vermisən', 'err.empty': 'Cavab boş ola bilməz', 'err.tooLong': 'Cavab çox uzundur', 'err.rate': 'Bir az yavaş yaz' },
      en: { 'err.chatClosed': 'Chat is closed right now', 'err.notYourTurn': 'It is not your turn', 'err.answered': 'You already answered', 'err.empty': 'Answer cannot be empty', 'err.tooLong': 'Answer is too long', 'err.rate': 'Slow down a bit' },
    });
  }

  // ====================================================================== the engine (installed on AS.Game.prototype)
  const r1 = (v) => Math.round(v * 10) / 10;
  const fail = (err) => ({ ok: false, err });

  function install(Game) {
    const P = Game.prototype;

    P._hook = function (name, data) {
      const h = this.hooks && this.hooks[name];
      if (typeof h === 'function') { try { h(data); } catch (e) { this._logOnce('hook:' + name, e); } }
    };

    // Free chat: AI level 3+ AND the meeting was caused by a found body (not the emergency button).
    P.freeChatOpen = function () {
      const m = this.meeting;
      return this.phase === 'meeting' && !!m && m.body != null && this.settings.aiLevel >= 3 && (m.stage === 'discussion' || m.stage === 'voting');
    };

    P._qaInit = function (m) {
      m.qa = { rounds: this.settings.qaRounds, round: 0, state: 'idle', t: 0, q: null, order: [], idx: -1, answers: [], turn: null, log: [] };
    };

    P._qaLangOf = function () { return this.lang === 'en' ? 'en' : 'az'; };

    P._qaPick = function (round) {
      const bank = AS.QUESTIONS || [];
      const used = this._qaUsed || (this._qaUsed = new Set());
      let pool = bank.filter((q) => !used.has(q.id));
      if (!pool.length) { used.clear(); pool = bank.slice(); }
      if (round === 1) { const g = pool.filter((q) => q.category === 'game'); if (g.length) pool = g; } else { const n = pool.filter((q) => q.category !== 'game'); if (n.length && this.rng() < 0.7) pool = n; }
      const q = U.pick(this.rng, pool);
      used.add(q.id);
      return { id: q.id, category: q.category, az: q.text.az, en: q.text.en };
    };

    P._qaNextRound = function () {
      const m = this.meeting, qa = m.qa;
      qa.round++;
      qa.q = this._qaPick(qa.round);
      const alive = this.list().filter((p) => p.alive && !p.left);
      qa.order = U.shuffle(this.rng, alive.map((p) => p.id));
      qa.idx = -1;
      qa.answers = [];
      qa.turn = null;
      qa.state = 'question';
      qa.t = T.QA_QUESTION_TIME;
      m.timer = qa.t;
      this._emit({ type: 'qaQuestion', round: qa.round, rounds: qa.rounds, q: { az: qa.q.az, en: qa.q.en }, order: qa.order.slice() });
    };

    P._qaStartTurn = function (idx) {
      const m = this.meeting, qa = m.qa;
      while (idx < qa.order.length) {
        const p = this.getPlayer(qa.order[idx]);
        if (p && p.alive && !p.left) break;
        idx++;
      }
      if (idx >= qa.order.length) { this._qaEndRound(); return; }
      const p = this.getPlayer(qa.order[idx]);
      qa.idx = idx;
      qa.state = 'turn';
      qa.turn = { player: p.id, left: this.settings.answerTime, started: this.time, plan: null, asked: false, typeAt: 0, lastType: -9 };
      m.timer = qa.turn.left;
      this._emit({ type: 'qaTurn', player: p.id, round: qa.round, seconds: this.settings.answerTime });
      if (p.isBot && !p.agent) this._qaBotTurn(p, qa.turn);
    };

    P._qaEndRound = function () {
      const m = this.meeting, qa = m.qa;
      const rec = { round: qa.round, q: { id: qa.q.id, category: qa.q.category, az: qa.q.az, en: qa.q.en }, answers: qa.answers.map((a) => ({ player: a.player, name: (this.getPlayer(a.player) || {}).name, text: a.text })) };
      qa.log.push(rec);
      (this._qaLog || (this._qaLog = [])).push(rec);
      this._hook('qaRound', { game: this, meeting: this.meetingCount, round: qa.round, q: rec.q, answers: qa.answers.slice() });
      qa.state = 'roundEnd';
      qa.t = T.QA_ROUND_END;
      qa.turn = null;
      m.timer = qa.t;
    };

    // Called by _tickMeeting while stage === 'discussion'. Moves on to 'voting' after the last question.
    P._qaTick = function (dt) {
      const m = this.meeting, qa = m.qa;
      if (!qa) { this._setStage('voting', this.settings.votingTime); return; }
      switch (qa.state) {
        case 'idle': this._qaNextRound(); break;
        case 'question':
          qa.t -= dt; m.timer = Math.max(0, qa.t);
          if (qa.t <= 0) this._qaStartTurn(0);
          break;
        case 'gap':
          qa.t -= dt; m.timer = Math.max(0, qa.t);
          if (qa.t <= 0) this._qaStartTurn(qa.idx + 1);
          break;
        case 'roundEnd':
          qa.t -= dt; m.timer = Math.max(0, qa.t);
          if (qa.t <= 0) {
            if (qa.round >= qa.rounds) { qa.state = 'done'; this._setStage('voting', this.settings.votingTime); } else this._qaNextRound();
          }
          break;
        case 'turn': this._qaTurnTick(dt); break;
        default: this._setStage('voting', this.settings.votingTime);
      }
    };

    P._qaTurnTick = function (dt) {
      const m = this.meeting, qa = m.qa, turn = qa.turn;
      const p = this.getPlayer(turn.player);
      if (!p || !p.alive || p.left) { this._qaSkip(turn, false); return; }
      turn.left -= dt;
      m.timer = Math.max(0, turn.left);
      if (p.isBot && !p.agent) {
        const plan = turn.plan;
        if (!plan && turn.left < this.settings.answerTime * 0.35) this._qaPlan(p, turn, null); // provider too slow: local answer now
        else if (plan) {
          if (this.time >= plan.typeAt && this.time - turn.lastType > 1.8 && this.time < plan.at) { turn.lastType = this.time; this.setTyping(p.id, 2.4); }
          if (this.time >= plan.at) { this._qaPost(p, plan.text, plan.meta); return; }
        }
      }
      if (turn.left <= 0) this._qaSkip(turn, true);
    };

    P._qaSkip = function (turn, timedOut) {
      const qa = this.meeting.qa;
      qa.answers.push({ player: turn.player, text: null, order: qa.idx + 1, timedOut: !!timedOut });
      this._emit({ type: 'qaSkip', player: turn.player, round: qa.round });
      this._hook('qaAnswer', { game: this, player: this.getPlayer(turn.player), round: qa.round, q: qa.q, text: null, timedOut: !!timedOut, meta: {} });
      this._qaGap();
    };

    P._qaGap = function () {
      const qa = this.meeting.qa;
      qa.turn = null;
      qa.state = 'gap';
      qa.t = T.QA_GAP;
    };

    P._qaPost = function (p, text, meta) {
      const m = this.meeting, qa = m.qa, turn = qa.turn;
      const order = qa.idx + 1;
      p.typingUntil = 0;
      qa.answers.push({ player: p.id, text, order });
      this._emit({ type: 'qaAnswer', player: p.id, text, order, round: qa.round });
      if (p.isBot) {
        const h = ((p.brain || (p.brain = {})).qaHist || (p.brain.qaHist = []));
        h.push({ round: this._qaLog ? this._qaLog.length + 1 : 1, q: qa.q.en, qaz: qa.q.az, text });
        if (h.length > 12) h.shift();
      }
      this._hook('qaAnswer', { game: this, player: p, round: qa.round, q: qa.q, text, timedOut: false, delayMs: Math.round((this.time - turn.started) * 1000), meta: meta || {} });
      this._qaGap();
    };

    // ---- bots (AI impostors, NPC crew): provider (LLM) or local generator, then human-like timing
    P._qaContext = function (p) {
      const qa = this.meeting.qa, lang = this._qaLangOf();
      const L = AS.aiLevel(this.settings.aiLevel);
      const names = (ids) => ids.map((i) => (this.getPlayer(i) || {}).name).filter(Boolean);
      const ctx = {
        playerId: p.id, name: p.name, isAI: !!p.isAI, level: p.isAI ? this.settings.aiLevel : 3, lang,
        gameSeed: this.seed, meetingNo: this.meetingCount, round: qa.round, rounds: qa.rounds,
        question: { id: qa.q.id, category: qa.q.category, az: qa.q.az, en: qa.q.en, text: qa.q[lang] },
        aliveNames: names(this.list().filter((q) => q.alive && !q.left).map((q) => q.id)),
        previous: qa.answers.filter((a) => a.text).map((a) => ({ name: (this.getPlayer(a.player) || {}).name, text: a.text })),
        pastRounds: (this._qaLog || []).slice(-6).map((r) => ({ q: r.q[lang], answers: r.answers.filter((a) => a.text).map((a) => ({ name: a.name, text: a.text })) })),
        own: ((p.brain && p.brain.qaHist) || []).slice(-6).map((h) => ({ q: lang === 'en' ? h.q : h.qaz, text: h.text })),
        allies: p.isAI ? this.list().filter((q) => q.isAI && q !== p).map((q) => ({ name: q.name, alive: q.alive && !q.left })) : [],
        facts: AS.Bots && AS.Bots.qaFacts ? AS.Bots.qaFacts(this, p) : [],
        maxChars: Math.min(QA_MAX_CHARS, L.maxChars), turnSec: this.settings.answerTime,
        meetingBody: this.meeting.body != null,
      };
      return ctx;
    };

    P._qaBotTurn = function (p, turn) {
      const prov = this.aiProvider;
      turn.asked = true;
      if (p.isAI && prov && typeof prov.answer === 'function') {
        let ctx;
        try { ctx = this._qaContext(p); } catch (e) { this._logOnce('qaContext', e); this._qaPlan(p, turn, null); return; }
        let settled = false;
        const fin = (res) => { if (settled) return; settled = true; if (this.meeting && this.meeting.qa && this.meeting.qa.turn === turn) this._qaPlan(p, turn, res); };
        try { Promise.resolve(prov.answer(ctx)).then(fin, () => fin(null)); } catch (e) { fin(null); }
      } else this._qaPlan(p, turn, null);
    };

    // Turn a provider result (or null) into a scheduled, styled post.
    P._qaPlan = function (p, turn, res) {
      if (turn.plan) return;
      const level = p.isAI ? this.settings.aiLevel : 3;
      const L = AS.aiLevel(level);
      const max = Math.min(QA_MAX_CHARS, L.maxChars);
      let text = res && typeof res.text === 'string' ? AS.cleanModelAnswer(res.text, max) : null;
      let fallback = !!(res && res.fallback);
      if (!text) {
        fallback = true;
        try { text = AS.Bots && AS.Bots.qaLocal ? AS.Bots.qaLocal(this, p, this._qaContext(p)) : null; } catch (e) { this._logOnce('qaLocal', e); }
        if (!text) text = U.pick(this.rng, L.fallbacks[this._qaLangOf()] || L.fallbacks.en);
        text = AS.cleanModelAnswer(text, max) || '...';
      }
      text = AS.truncateText(AS.qaStyle(text, level, this.rng), max) || text;
      const cap = this.settings.answerTime * 0.8;
      const started = turn.started;
      let at = started + AS.aiDelay(Array.from(text).length, level, this.rng, cap);
      at = Math.max(at, this.time + 0.2);
      at = Math.min(at, started + cap);
      const typeAt = Math.min(at - 0.3, Math.max(this.time, started + (at - started) * (0.25 + this.rng() * 0.25)));
      turn.plan = { text, at, typeAt, meta: { fallback, llmMs: res && res.llmMs != null ? res.llmMs : null, source: res && res.source ? res.source : 'local' } };
    };

    // ---- humans (and external agents)
    P._a_answer = function (p, a) {
      if (this.phase !== 'meeting' || !this.meeting || this.meeting.stage !== 'discussion') return fail('chatClosed');
      const qa = this.meeting.qa;
      if (!qa) return fail('chatClosed');
      if (!p.alive) return fail('dead');
      if (qa.answers.some((x) => x.player === p.id)) return fail('answered');
      if (qa.state !== 'turn' || !qa.turn || qa.turn.player !== p.id) return fail('notYourTurn');
      if (p.isBot && !p.agent) return fail('bot');
      const now = this.time;
      p.answerTimes = (p.answerTimes || []).filter((x) => now - x < 5);
      if (p.answerTimes.length >= 4) return fail('rate');
      p.answerTimes.push(now);
      const s = AS.sanitizeAnswer(a.text, QA_MAX_CHARS);
      if (!s.ok) return fail(s.err);
      this._qaPost(p, s.text, { source: p.agent ? 'agent' : 'human' });
      return { ok: true };
    };

    // ---- snapshot (what a viewer is allowed to see)
    P._qaSnapshot = function (m, viewer) {
      const qa = m.qa;
      if (!qa) return null;
      const log = qa.log.map((r) => ({ round: r.round, q: { az: r.q.az, en: r.q.en }, answers: r.answers.filter((a) => a.text).map((a) => ({ player: a.player, text: a.text })) }));
      const out = {
        round: qa.round, rounds: qa.rounds, state: qa.state,
        q: qa.q ? { az: qa.q.az, en: qa.q.en } : null,
        order: qa.order.slice(), turn: qa.turn ? { player: qa.turn.player, left: r1(Math.max(0, qa.turn.left)) } : null,
        answers: qa.answers.map((a) => ({ player: a.player, text: a.text, order: a.order })),
        log,
        maxChars: QA_MAX_CHARS,
      };
      return out;
    };
  }

  AS.QA = { install };
  if (AS.Game) install(AS.Game);
})(globalThis.AS = globalThis.AS || {});
