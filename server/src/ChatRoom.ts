import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import type {
  AnswerPostedPayload,
  ChatSnapshot,
  ErrorCode,
  Phase,
  PlayerTimeoutPayload,
  PublicPlayer,
  RoundCompletedPayload,
  TurnStartedPayload,
} from '../../shared/protocol';
import { sanitizeAnswer, sanitizeName } from './sanitize';
import { shuffle } from './util';
import type { QuestionPicker } from './questions';
import type { AiPlanner, AiTurnContext, ChatSink, PastRound, PlayerRecord, RoundLogger, RoundResult } from './types';

export interface RoomConfig {
  roomId: string;
  matchId: string;
  language: string;
  turnMs: number;
  questionDelayMs: number;
  interTurnMs: number;
  disconnectGraceMs: number;
  maxChars: number;
  allowDeadSpectators: boolean;
}

export interface RoomDeps {
  sink: ChatSink;
  ai: AiPlanner;
  logger: RoundLogger;
  questions: QuestionPicker;
  aiNames: string[];
}

const PALETTE = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#0aa5a5',
  '#c9a000',
  '#f032e6',
  '#7a9a01',
  '#9a6324',
  '#469990',
  '#808080',
];

interface RoundAnswer {
  playerId: string;
  name: string;
  text: string | null;
  timedOut: boolean;
  delayMs: number | null;
  fallbackUsed: boolean;
  llmMs: number | null;
}

interface RoundState {
  round: number;
  questionId: string;
  category: string;
  question: string;
  order: string[]; // player ids
  slots: (RoundAnswer | null)[];
  authors: Map<string, { kind: PlayerRecord['kind']; level: number | null }>;
}

interface TurnState {
  idx: number;
  playerId: string;
  startedAt: number;
  deadline: number;
  timers: NodeJS.Timeout[];
  lastTyping: number;
}

export type SubmitResult = { ok: true } | { ok: false; code: ErrorCode; message: string };

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  chat_locked: 'Chat is locked.',
  not_your_turn: 'It is not your turn.',
  already_answered: 'You already answered this round.',
  empty: 'Answer cannot be empty.',
  too_long: 'Answer is too long.',
  bad_request: 'Invalid request.',
};
const fail = (code: ErrorCode): SubmitResult => ({ ok: false, code, message: MESSAGES[code] ?? 'Error.' });

/**
 * Authoritative state machine for one match's chat:
 * IDLE -> QUESTION_SHOWN -> PLAYER_TURN(n) -> LOCKED -> (game calls startRound again)
 *
 * Emits (in-process, for the game): `round_completed`, `player_timeout`.
 */
export class ChatRoom extends EventEmitter {
  phase: Phase = 'IDLE';
  private players = new Map<string, PlayerRecord>();
  private round = 0;
  private cur: RoundState | null = null;
  private turn: TurnState | null = null;
  private pending: NodeJS.Timeout | null = null;
  private past: PastRound[] = [];
  private pastAuthors = new Map<number, RoundState['authors']>();
  private destroyed = false;

  constructor(
    readonly cfg: RoomConfig,
    private deps: RoomDeps,
  ) {
    super();
  }

  // ---------- players (called by the game) ----------

  /** Register a human; returns the token the game hands to that player's client. */
  registerHuman(name: string): { playerId: string; token: string } {
    const p = this.addRecord('human', this.uniqueName(sanitizeName(name, 'Player')));
    p.token = crypto.randomBytes(16).toString('hex');
    return { playerId: p.id, token: p.token };
  }

  /** Add an AI player. Returns its player id. The AI is a normal player id everywhere else. */
  addAi(level: number, name?: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    const free = this.deps.aiNames.filter((n) => !taken.has(n.toLowerCase()));
    const chosen = name ?? free[Math.floor(Math.random() * free.length)] ?? `Player${this.players.size + 1}`;
    const p = this.addRecord('ai', this.uniqueName(chosen));
    p.level = level;
    p.connected = true;
    return p.id;
  }

  /** Level shared by the match's AI players (null if there are none). */
  getAiLevel(): number | null {
    for (const p of this.players.values()) if (p.kind === 'ai') return p.level ?? null;
    return null;
  }

  /** Applies from the next AI turn. Returns the clamped level. */
  setAiLevel(level: number): number {
    const lv = Math.min(5, Math.max(1, Math.round(level)));
    for (const p of this.players.values()) if (p.kind === 'ai') p.level = lv;
    return lv;
  }

  setAlive(playerId: string, alive: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.alive === alive) return;
    p.alive = alive;
    if (!alive) {
      if (!this.cfg.allowDeadSpectators) this.deps.sink.evict(this.cfg.roomId, playerId);
      if (this.turn?.playerId === playerId) this.skipTurn(this.turn, 'dead');
    }
  }

  // ---------- connection (called by transport) ----------

  authorize(token: unknown): PlayerRecord | undefined {
    if (typeof token !== 'string' || !token) return undefined;
    for (const p of this.players.values()) {
      if (
        p.token &&
        p.token.length === token.length &&
        crypto.timingSafeEqual(Buffer.from(p.token), Buffer.from(token))
      )
        return p;
    }
    return undefined;
  }

  getPlayer(id: string): PlayerRecord | undefined {
    return this.players.get(id);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.kind === 'ai') return;
    p.connected = connected;
    if (!connected && this.turn?.playerId === playerId) this.armGrace(this.turn);
  }

  connectedHumans(): number {
    return [...this.players.values()].filter((p) => p.kind === 'human' && p.connected && p.alive).length;
  }

  // ---------- round lifecycle (called by the game) ----------

  startRound(): void {
    if (this.destroyed) return;
    if (this.phase === 'QUESTION_SHOWN' || this.phase === 'PLAYER_TURN') throw new Error('A round is already running');
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length === 0) throw new Error('No alive players');

    const q = this.deps.questions.next();
    const order = shuffle(alive);
    this.round += 1;
    this.cur = {
      round: this.round,
      questionId: q.id,
      category: q.category,
      question: q.text,
      order: order.map((p) => p.id),
      slots: order.map(() => null),
      authors: new Map(order.map((p) => [p.id, { kind: p.kind, level: p.level ?? null }])),
    };
    this.phase = 'QUESTION_SHOWN';
    this.broadcast('round_started', {
      round: this.round,
      question: q.text,
      turnOrder: order.map((p) => this.pub(p)),
      maxChars: this.cfg.maxChars,
      turnMs: this.cfg.turnMs,
    });
    this.pending = setTimeout(() => this.beginTurn(0), this.cfg.questionDelayMs);
  }

  /** Game reports what humans did after a round so analytics can compute detection rates. */
  recordResult(round: number, result: RoundResult): void {
    const authors = this.pastAuthors.get(round);
    if (!authors) return;
    const perPlayer = [...authors.entries()].map(([playerId, a]) => ({
      playerId,
      authorType: a.kind,
      level: a.level,
      suspected: result.suspectedIds.includes(playerId),
      votedOut: result.votedOutId === playerId,
    }));
    this.deps.logger.logResult(this.cfg.matchId, round, perPlayer);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.pending) clearTimeout(this.pending);
    this.clearTurn();
    this.removeAllListeners();
  }

  // ---------- player actions (called by transport / AI) ----------

  submit(playerId: string, raw: unknown, meta: { fallbackUsed?: boolean; llmMs?: number } = {}): SubmitResult {
    const cur = this.cur;
    if (!cur || this.phase === 'IDLE' || this.phase === 'LOCKED') return fail('chat_locked');
    const idx = cur.order.indexOf(playerId);
    if (idx >= 0 && cur.slots[idx]) return fail('already_answered');
    const turn = this.turn;
    if (!turn || turn.playerId !== playerId) return fail('not_your_turn');

    const clean = sanitizeAnswer(raw, this.cfg.maxChars);
    if (!clean.ok) return fail(clean.code);

    const p = this.players.get(playerId)!;
    cur.slots[turn.idx] = {
      playerId,
      name: p.name,
      text: clean.text,
      timedOut: false,
      delayMs: Date.now() - turn.startedAt,
      fallbackUsed: meta.fallbackUsed ?? false,
      llmMs: meta.llmMs ?? null,
    };
    this.broadcast('answer_posted', {
      playerId,
      name: p.name,
      color: p.color,
      text: clean.text,
      order: turn.idx + 1,
    } satisfies AnswerPostedPayload);
    if (p.kind === 'ai') {
      this.deps.ai.remember(this.cfg.matchId, playerId, { round: cur.round, question: cur.question, text: clean.text });
    }
    this.finishTurn(turn);
    return { ok: true };
  }

  /** Human typing signal; AI uses the same broadcast so clients cannot tell them apart. */
  noteTyping(playerId: string): void {
    const t = this.turn;
    if (!t || t.playerId !== playerId || Date.now() - t.lastTyping < 1000) return;
    t.lastTyping = Date.now();
    this.broadcast('typing', { playerId });
  }

  snapshot(playerId?: string): ChatSnapshot {
    const cur = this.cur;
    const me = playerId ? this.players.get(playerId) : undefined;
    return {
      phase: this.phase,
      round: this.round,
      question: cur?.question ?? null,
      turnOrder: cur ? cur.order.map((id) => this.pub(this.players.get(id)!)) : [],
      answers: cur
        ? cur.slots.flatMap((s, i) =>
            s && s.text !== null
              ? [
                  {
                    playerId: s.playerId,
                    name: s.name,
                    color: this.players.get(s.playerId)!.color,
                    text: s.text,
                    order: i + 1,
                  },
                ]
              : [],
          )
        : [],
      skipped: cur ? cur.slots.flatMap((s) => (s && s.text === null ? [s.playerId] : [])) : [],
      currentTurn: this.turn
        ? { playerId: this.turn.playerId, deadline: this.turn.deadline, serverTime: Date.now() }
        : null,
      maxChars: this.cfg.maxChars,
      turnMs: this.cfg.turnMs,
      canAnswer: !!me?.alive,
    };
  }

  // ---------- internals ----------

  private beginTurn(idx: number): void {
    const cur = this.cur;
    if (!cur || this.destroyed) return;
    this.pending = null;
    const p = this.players.get(cur.order[idx]!)!;

    if (!p.alive) {
      this.recordSkip(idx, p, false);
      this.broadcast('turn_skipped', { playerId: p.id });
      this.afterTurn(idx);
      return;
    }

    const startedAt = Date.now();
    const turn: TurnState = {
      idx,
      playerId: p.id,
      startedAt,
      deadline: startedAt + this.cfg.turnMs,
      timers: [],
      lastTyping: 0,
    };
    this.turn = turn;
    this.phase = 'PLAYER_TURN';
    this.broadcast('turn_started', {
      playerId: p.id,
      deadline: turn.deadline,
      serverTime: startedAt,
    } satisfies TurnStartedPayload);
    turn.timers.push(setTimeout(() => this.skipTurn(turn, 'timeout'), this.cfg.turnMs));

    if (p.kind === 'ai') void this.runAi(turn, p);
    else if (!p.connected) this.armGrace(turn);
  }

  private armGrace(turn: TurnState): void {
    turn.timers.push(
      setTimeout(() => {
        const p = this.players.get(turn.playerId);
        if (this.turn === turn && p && !p.connected) this.skipTurn(turn, 'timeout');
      }, this.cfg.disconnectGraceMs),
    );
  }

  private async runAi(turn: TurnState, p: PlayerRecord): Promise<void> {
    const cur = this.cur!;
    const ctx: AiTurnContext = {
      matchId: this.cfg.matchId,
      roomId: this.cfg.roomId,
      playerId: p.id,
      name: p.name,
      level: p.level ?? 3,
      language: this.cfg.language,
      round: cur.round,
      question: cur.question,
      aliveNames: [...this.players.values()].filter((x) => x.alive).map((x) => x.name),
      previousAnswers: cur.slots.flatMap((s) => (s && s.text !== null ? [{ name: s.name, text: s.text }] : [])),
      pastRounds: this.past.slice(-5),
      maxChars: this.cfg.maxChars,
      turnMs: this.cfg.turnMs,
    };
    let plan;
    try {
      plan = await this.deps.ai.plan(ctx);
    } catch (e) {
      console.error('[chat] ai planner failed', e);
      return; // turn will time out; never leaks anything into chat
    }
    if (this.turn !== turn) return;

    turn.timers.push(
      setTimeout(() => {
        if (this.turn !== turn) return;
        this.broadcast('typing', { playerId: p.id });
        // humans re-send typing roughly every 2s while typing; mirror that
        turn.timers.push(setInterval(() => this.turn === turn && this.broadcast('typing', { playerId: p.id }), 2000));
      }, plan.typingAfterMs),
    );
    turn.timers.push(
      setTimeout(() => {
        if (this.turn === turn) this.submit(p.id, plan.text, { fallbackUsed: plan.fallbackUsed, llmMs: plan.llmMs });
      }, plan.waitMs),
    );
  }

  private skipTurn(turn: TurnState, reason: 'timeout' | 'dead'): void {
    if (this.turn !== turn) return;
    const p = this.players.get(turn.playerId)!;
    this.recordSkip(turn.idx, p, reason === 'timeout');
    this.broadcast('turn_skipped', { playerId: p.id });
    if (reason === 'timeout') {
      this.emit('player_timeout', {
        matchId: this.cfg.matchId,
        roomId: this.cfg.roomId,
        round: this.round,
        playerId: p.id,
      } satisfies PlayerTimeoutPayload);
    }
    this.finishTurn(turn);
  }

  private recordSkip(idx: number, p: PlayerRecord, timedOut: boolean): void {
    this.cur!.slots[idx] = {
      playerId: p.id,
      name: p.name,
      text: null,
      timedOut,
      delayMs: null,
      fallbackUsed: false,
      llmMs: null,
    };
  }

  private finishTurn(turn: TurnState): void {
    this.clearTurn();
    this.afterTurn(turn.idx);
  }

  private clearTurn(): void {
    if (!this.turn) return;
    for (const t of this.turn.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.turn = null;
  }

  private afterTurn(idx: number): void {
    const cur = this.cur!;
    if (idx + 1 < cur.order.length) {
      this.pending = setTimeout(() => this.beginTurn(idx + 1), this.cfg.interTurnMs);
    } else {
      this.lock();
    }
  }

  private lock(): void {
    const cur = this.cur!;
    this.phase = 'LOCKED';
    this.broadcast('chat_locked', { round: cur.round });

    const answers = cur.slots.map((s, i) => ({
      playerId: s!.playerId,
      name: s!.name,
      order: i + 1,
      text: s!.text,
      timedOut: s!.timedOut,
    }));
    this.past.push({
      round: cur.round,
      question: cur.question,
      answers: answers.map(({ playerId, name, text }) => ({ playerId, name, text })),
    });
    this.pastAuthors.set(cur.round, cur.authors);

    this.deps.logger.logRound({
      matchId: this.cfg.matchId,
      roomId: this.cfg.roomId,
      language: this.cfg.language,
      round: cur.round,
      questionId: cur.questionId,
      category: cur.category,
      question: cur.question,
      answers: cur.slots.map((s, i) => {
        const a = cur.authors.get(s!.playerId)!;
        return {
          ...answers[i]!,
          authorType: a.kind,
          level: a.level,
          delayMs: s!.delayMs,
          fallbackUsed: s!.fallbackUsed,
          llmMs: s!.llmMs,
        };
      }),
    });

    this.emit('round_completed', {
      matchId: this.cfg.matchId,
      roomId: this.cfg.roomId,
      round: cur.round,
      question: cur.question,
      answers,
    } satisfies RoundCompletedPayload);
  }

  private addRecord(kind: PlayerRecord['kind'], name: string): PlayerRecord {
    const p: PlayerRecord = {
      id: 'p_' + crypto.randomBytes(5).toString('hex'),
      name,
      color: PALETTE[this.players.size % PALETTE.length]!,
      kind,
      alive: true,
      connected: false,
    };
    this.players.set(p.id, p);
    return p;
  }

  private uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let n = name;
    for (let i = 2; taken.has(n.toLowerCase()); i++) n = `${name} ${i}`;
    return n;
  }

  private pub(p: PlayerRecord): PublicPlayer {
    return { playerId: p.id, name: p.name, color: p.color };
  }

  private broadcast(event: string, payload: unknown): void {
    this.deps.sink.broadcast(this.cfg.roomId, event, payload);
  }
}
