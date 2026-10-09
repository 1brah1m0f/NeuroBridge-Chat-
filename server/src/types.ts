import type { RoundCompletedAnswer } from '../../shared/protocol';

export type PlayerKind = 'human' | 'ai';

/** Server-side player record. `kind` and `level` must never be serialised to clients. */
export interface PlayerRecord {
  id: string;
  name: string;
  color: string;
  kind: PlayerKind;
  alive: boolean;
  connected: boolean;
  token?: string;
  level?: number;
}

export interface PastRound {
  round: number;
  question: string;
  answers: { playerId: string; name: string; text: string | null }[];
}

export interface AiTurnContext {
  matchId: string;
  roomId: string;
  playerId: string;
  name: string;
  level: number;
  language: string;
  round: number;
  question: string;
  aliveNames: string[];
  previousAnswers: { name: string; text: string }[];
  pastRounds: PastRound[];
  /** Hard cap for the answer, already min(global, level). */
  maxChars: number;
  turnMs: number;
}

export interface AiPlan {
  text: string;
  /** ms from now until the answer should be posted (LLM latency already deducted). */
  waitMs: number;
  /** ms from now until the first typing indicator. */
  typingAfterMs: number;
  fallbackUsed: boolean;
  llmMs: number;
}

/** What the room needs from the AI layer; keeps ChatRoom ignorant of LLMs. */
export interface AiPlanner {
  plan(ctx: AiTurnContext): Promise<AiPlan>;
  remember(matchId: string, playerId: string, entry: { round: number; question: string; text: string }): void;
}

export interface RoundLogEntry {
  matchId: string;
  roomId: string;
  language: string;
  round: number;
  questionId: string;
  category: string;
  question: string;
  answers: (RoundCompletedAnswer & {
    authorType: PlayerKind;
    level: number | null;
    delayMs: number | null;
    fallbackUsed: boolean;
    llmMs: number | null;
  })[];
}

export interface RoundResult {
  /** Players humans flagged as suspicious this round. */
  suspectedIds: string[];
  /** Player voted out this round, if any. */
  votedOutId?: string;
}

export interface RoundLogger {
  logRound(entry: RoundLogEntry): void;
  logResult(
    matchId: string,
    round: number,
    perPlayer: {
      playerId: string;
      authorType: PlayerKind;
      level: number | null;
      suspected: boolean;
      votedOut: boolean;
    }[],
  ): void;
}

export interface ChatSink {
  broadcast(roomId: string, event: string, payload: unknown): void;
  /** Remove all sockets of a player from the room channel (dead players when spectating is off). */
  evict(roomId: string, playerId: string): void;
}
