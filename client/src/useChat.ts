import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AnswerPostedPayload,
  ChatSnapshot,
  ErrorPayload,
  JoinChatAck,
  Phase,
  PublicPlayer,
  RoundStartedPayload,
  SetAiLevelAck,
  SubmitAck,
  TurnStartedPayload,
} from '../../shared/protocol';

export interface ChatState {
  status: 'connecting' | 'joined' | 'failed';
  me: { playerId: string; name: string } | null;
  phase: Phase;
  round: number;
  question: string | null;
  turnOrder: PublicPlayer[];
  answers: AnswerPostedPayload[];
  skipped: string[];
  currentTurn: { playerId: string; deadline: number } | null;
  /** playerId -> epoch ms (local clock) until which the typing indicator shows */
  typingUntil: Record<string, number>;
  maxChars: number;
  canAnswer: boolean;
  /** null = server does not expose level selection */
  aiLevel: number | null;
  error: string | null;
}

const initial: ChatState = {
  status: 'connecting',
  me: null,
  phase: 'IDLE',
  round: 0,
  question: null,
  turnOrder: [],
  answers: [],
  skipped: [],
  currentTurn: null,
  typingUntil: {},
  maxChars: 200,
  canAnswer: true,
  aiLevel: null,
  error: null,
};

const TYPING_TTL_MS = 3500;
const tokenKey = (roomId: string) => `chat-token:${roomId}`;
const readToken = (roomId: string) => {
  try {
    return sessionStorage.getItem(tokenKey(roomId)) ?? undefined;
  } catch {
    return undefined;
  }
};
const saveToken = (roomId: string, token: string) => {
  try {
    sessionStorage.setItem(tokenKey(roomId), token);
  } catch {
    /* storage unavailable */
  }
};

export function useChat(serverUrl: string, roomId: string, name: string) {
  const [state, setState] = useState<ChatState>(initial);
  const socketRef = useRef<Socket | null>(null);
  /** server clock minus local clock, so countdowns survive clock skew */
  const skew = useRef(0);

  useEffect(() => {
    const socket = io(serverUrl, { transports: ['websocket'] });
    socketRef.current = socket;
    const patch = (p: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) =>
      setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
    const applyTurn = (t: TurnStartedPayload) => {
      skew.current = t.serverTime - Date.now();
      return { playerId: t.playerId, deadline: t.deadline - skew.current };
    };
    const applySnapshot = (snap: ChatSnapshot): Partial<ChatState> => ({
      phase: snap.phase,
      round: snap.round,
      question: snap.question,
      turnOrder: snap.turnOrder,
      answers: snap.answers,
      skipped: snap.skipped,
      maxChars: snap.maxChars,
      canAnswer: snap.canAnswer,
      currentTurn: snap.currentTurn ? applyTurn(snap.currentTurn) : null,
      typingUntil: {},
    });

    const join = () =>
      socket.emit('join_chat', { roomId, name, token: readToken(roomId) }, (res: JoinChatAck) => {
        if (!res.ok || !res.snapshot || !res.playerId) {
          return patch({ status: 'failed', error: res.error?.message ?? 'Could not join' });
        }
        if (res.token) saveToken(roomId, res.token);
        patch({
          status: 'joined',
          error: null,
          aiLevel: res.aiLevel ?? null,
          me: { playerId: res.playerId, name: res.name ?? name },
          ...applySnapshot(res.snapshot),
        });
      });

    socket.on('connect', join);
    socket.on('disconnect', () => patch({ status: 'connecting' }));
    socket.on('round_started', (p: RoundStartedPayload) =>
      patch({
        phase: 'QUESTION_SHOWN',
        round: p.round,
        question: p.question,
        turnOrder: p.turnOrder,
        answers: [],
        skipped: [],
        currentTurn: null,
        typingUntil: {},
        maxChars: p.maxChars,
      }),
    );
    socket.on('turn_started', (p: TurnStartedPayload) => patch({ phase: 'PLAYER_TURN', currentTurn: applyTurn(p) }));
    socket.on('typing', (p: { playerId: string }) =>
      patch((s) => ({ typingUntil: { ...s.typingUntil, [p.playerId]: Date.now() + TYPING_TTL_MS } })),
    );
    socket.on('answer_posted', (p: AnswerPostedPayload) =>
      patch((s) => ({
        answers: s.answers.some((a) => a.playerId === p.playerId)
          ? s.answers
          : [...s.answers, p].sort((a, b) => a.order - b.order),
        typingUntil: { ...s.typingUntil, [p.playerId]: 0 },
        currentTurn: s.currentTurn?.playerId === p.playerId ? null : s.currentTurn,
      })),
    );
    socket.on('turn_skipped', (p: { playerId: string }) =>
      patch((s) => ({
        skipped: [...s.skipped, p.playerId],
        typingUntil: { ...s.typingUntil, [p.playerId]: 0 },
        currentTurn: s.currentTurn?.playerId === p.playerId ? null : s.currentTurn,
      })),
    );
    socket.on('chat_locked', () => patch({ phase: 'LOCKED', currentTurn: null }));
    socket.on('ai_level', (p: { level: number }) => patch({ aiLevel: p.level }));
    socket.on('error', (e: ErrorPayload) => patch({ error: e.message }));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serverUrl, roomId, name]);

  const submit = useCallback((text: string) => {
    socketRef.current?.emit('submit_answer', { text }, (res: SubmitAck) => {
      if (!res.ok) setState((s) => ({ ...s, error: res.error?.message ?? 'Could not send' }));
    });
  }, []);

  const setAiLevel = useCallback((level: number) => {
    socketRef.current?.emit('set_ai_level', { level }, (res: SetAiLevelAck) => {
      if (!res.ok) setState((s) => ({ ...s, error: res.error?.message ?? 'Could not change level' }));
    });
  }, []);

  const sendTyping = useCallback(() => socketRef.current?.emit('typing'), []);

  return { state, submit, sendTyping, setAiLevel };
}
