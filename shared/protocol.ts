// Wire protocol shared by server and client. Nothing here may ever reveal who is an AI.

export type Phase = 'IDLE' | 'QUESTION_SHOWN' | 'PLAYER_TURN' | 'LOCKED';

export interface PublicPlayer {
  playerId: string;
  name: string;
  color: string;
}

// ---- Client -> Server ----
export interface JoinChatRequest {
  roomId: string;
  /** Token issued by the game (or by the dev open-join flow). Required to reconnect. */
  token?: string;
  /** Only honoured when the server runs with open join (dev). */
  name?: string;
}
export interface SubmitAnswerRequest {
  text: string;
}
/** Host setting; only honoured when the server enables level selection (dev / host UI). */
export interface SetAiLevelRequest {
  level: number;
}

// ---- Server -> Client ----
export interface RoundStartedPayload {
  round: number;
  question: string;
  turnOrder: PublicPlayer[];
  maxChars: number;
  turnMs: number;
}
export interface TurnStartedPayload {
  playerId: string;
  /** Epoch ms on the server clock. */
  deadline: number;
  /** Server clock at emit time, lets clients correct for clock skew. */
  serverTime: number;
}
export interface TypingPayload {
  playerId: string;
}
export interface AnswerPostedPayload {
  playerId: string;
  name: string;
  color: string;
  text: string;
  /** 1-based position in this round's turn order. */
  order: number;
}
export interface TurnSkippedPayload {
  playerId: string;
}
export interface ChatLockedPayload {
  round: number;
}
export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}
export type ErrorCode =
  | 'bad_request'
  | 'rate_limited'
  | 'no_room'
  | 'unauthorized'
  | 'spectating_disabled'
  | 'not_joined'
  | 'chat_locked'
  | 'not_your_turn'
  | 'already_answered'
  | 'empty'
  | 'too_long';

export interface ChatSnapshot {
  phase: Phase;
  round: number;
  question: string | null;
  turnOrder: PublicPlayer[];
  answers: AnswerPostedPayload[];
  skipped: string[];
  currentTurn: TurnStartedPayload | null;
  maxChars: number;
  turnMs: number;
  /** True when this player is allowed to answer (alive). */
  canAnswer: boolean;
}

export interface JoinChatAck {
  ok: boolean;
  error?: ErrorPayload;
  playerId?: string;
  token?: string;
  name?: string;
  color?: string;
  snapshot?: ChatSnapshot;
  /** Present only when level selection is enabled on the server. Match-wide, not per player. */
  aiLevel?: number | null;
}
export interface SetAiLevelAck {
  ok: boolean;
  error?: ErrorPayload;
  level?: number;
}
export interface SubmitAck {
  ok: boolean;
  error?: ErrorPayload;
}

// ---- Server -> Game hooks (in-process, never sent to clients) ----
export interface RoundCompletedAnswer {
  playerId: string;
  name: string;
  order: number;
  text: string | null;
  timedOut: boolean;
}
export interface RoundCompletedPayload {
  matchId: string;
  roomId: string;
  round: number;
  question: string;
  answers: RoundCompletedAnswer[];
}
export interface PlayerTimeoutPayload {
  matchId: string;
  roomId: string;
  round: number;
  playerId: string;
}
