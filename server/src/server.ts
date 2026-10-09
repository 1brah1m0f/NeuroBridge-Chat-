import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Server, type Socket } from 'socket.io';
import type { ErrorCode, ErrorPayload, JoinChatAck, SetAiLevelAck, SubmitAck } from '../../shared/protocol';
import { ChatRoom, type RoomConfig } from './ChatRoom';
import { env, paths } from './config';
import { loadQuestionBank, QuestionPicker, type QuestionEntry } from './questions';
import { sanitizeName } from './sanitize';
import { RateLimiter } from './util';
import type { AiPlanner, ChatSink, RoundLogger } from './types';

/** Creates and holds one ChatRoom per match. The game drives rooms through this object. */
export class ChatManager {
  private rooms = new Map<string, ChatRoom>();
  private bank: QuestionEntry[];
  private names: Record<string, string[]>;

  constructor(private deps: { sink: ChatSink; ai: AiPlanner; logger: RoundLogger }) {
    this.bank = loadQuestionBank();
    this.names = JSON.parse(fs.readFileSync(paths.names, 'utf8'));
  }

  createRoom(opts: Partial<RoomConfig> & { roomId: string }): ChatRoom {
    if (this.rooms.has(opts.roomId)) throw new Error(`Room ${opts.roomId} exists`);
    const cfg: RoomConfig = {
      matchId: crypto.randomUUID(),
      language: 'en',
      turnMs: env.turnMs,
      questionDelayMs: env.questionDelayMs,
      interTurnMs: env.interTurnMs,
      disconnectGraceMs: env.disconnectGraceMs,
      maxChars: env.answerMaxChars,
      allowDeadSpectators: env.allowDeadSpectators,
      ...opts,
    };
    const room = new ChatRoom(cfg, {
      ...this.deps,
      questions: new QuestionPicker(this.bank, cfg.language),
      aiNames: this.names[cfg.language] ?? this.names.en ?? [],
    });
    this.rooms.set(cfg.roomId, room);
    return room;
  }

  get(roomId: string): ChatRoom | undefined {
    return this.rooms.get(roomId);
  }

  destroyRoom(roomId: string): void {
    this.rooms.get(roomId)?.destroy();
    this.rooms.delete(roomId);
  }

  destroyAll(): void {
    for (const id of [...this.rooms.keys()]) this.destroyRoom(id);
  }
}

export interface ChatServerOptions {
  port?: number;
  origin?: string | string[];
  /** Dev only: let unknown clients create a human player by sending a name. Production: false. */
  openJoin?: boolean;
  /** Let connected clients change the AI level (host UI / dev). Production: false, the game sets it. */
  allowLevelSelect?: boolean;
  ai: AiPlanner;
  logger: RoundLogger;
}

export interface ChatServer {
  httpServer: http.Server;
  io: Server;
  manager: ChatManager;
  port: number;
  close(): Promise<void>;
}

const channel = (roomId: string) => `chat:${roomId}`;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export async function createChatServer(opts: ChatServerOptions): Promise<ChatServer> {
  const httpServer = http.createServer((_req, res) => {
    res.writeHead(404).end();
  });
  const io = new Server(httpServer, {
    cors: { origin: opts.origin ?? env.clientOrigin },
    maxHttpBufferSize: 16 * 1024,
  });

  const sink: ChatSink = {
    broadcast: (roomId, event, payload) => io.to(channel(roomId)).emit(event, payload),
    evict: (roomId, playerId) => {
      void io
        .in(channel(roomId))
        .fetchSockets()
        .then((socks) => {
          for (const s of socks) if (s.data.playerId === playerId) s.leave(channel(roomId));
        });
    },
  };
  const manager = new ChatManager({ sink, ai: opts.ai, logger: opts.logger });

  // sockets per player, so a second tab closing does not mark the player disconnected
  const conns = new Map<string, number>();

  const sendError = (socket: Socket, code: ErrorCode, message: string): ErrorPayload => {
    const err = { code, message };
    socket.emit('error', err);
    return err;
  };

  io.on('connection', (socket) => {
    const limiter = new RateLimiter(12, 5000);
    const typingLimiter = new RateLimiter(4, 3000);

    socket.on('join_chat', (data: unknown, ack?: (r: JoinChatAck) => void) => {
      const reply = (r: JoinChatAck) => typeof ack === 'function' && ack(r);
      if (!limiter.allow()) return reply({ ok: false, error: sendError(socket, 'rate_limited', 'Too many requests.') });
      if (!isObj(data) || typeof data.roomId !== 'string') {
        return reply({ ok: false, error: sendError(socket, 'bad_request', 'Invalid request.') });
      }
      const room = manager.get(data.roomId);
      if (!room) return reply({ ok: false, error: sendError(socket, 'no_room', 'Room not found.') });

      let player = room.authorize(data.token);
      if (!player && opts.openJoin && typeof data.name === 'string') {
        const { playerId } = room.registerHuman(sanitizeName(data.name, 'Player'));
        player = room.getPlayer(playerId);
      }
      if (!player) return reply({ ok: false, error: sendError(socket, 'unauthorized', 'Not allowed to join.') });
      if (!player.alive && !room.cfg.allowDeadSpectators) {
        return reply({ ok: false, error: sendError(socket, 'spectating_disabled', 'Spectating is disabled.') });
      }

      socket.data.roomId = room.cfg.roomId;
      socket.data.playerId = player.id;
      void socket.join(channel(room.cfg.roomId));
      conns.set(player.id, (conns.get(player.id) ?? 0) + 1);
      room.setConnected(player.id, true);
      reply({
        ok: true,
        playerId: player.id,
        token: player.token,
        name: player.name,
        color: player.color,
        snapshot: room.snapshot(player.id),
        ...(opts.allowLevelSelect ? { aiLevel: room.getAiLevel() } : {}),
      });
    });

    socket.on('submit_answer', (data: unknown, ack?: (r: SubmitAck) => void) => {
      const reply = (r: SubmitAck) => typeof ack === 'function' && ack(r);
      const room = manager.get(socket.data.roomId);
      if (!room || !socket.data.playerId)
        return reply({ ok: false, error: sendError(socket, 'not_joined', 'Join first.') });
      if (!limiter.allow()) return reply({ ok: false, error: sendError(socket, 'rate_limited', 'Too many requests.') });
      const text = isObj(data) ? data.text : undefined;
      const res = room.submit(socket.data.playerId, text);
      if (res.ok) return reply({ ok: true });
      reply({ ok: false, error: sendError(socket, res.code, res.message) });
    });

    socket.on('set_ai_level', (data: unknown, ack?: (r: SetAiLevelAck) => void) => {
      const reply = (r: SetAiLevelAck) => typeof ack === 'function' && ack(r);
      if (!opts.allowLevelSelect) return reply({ ok: false, error: sendError(socket, 'unauthorized', 'Not allowed.') });
      const room = manager.get(socket.data.roomId);
      if (!room || !socket.data.playerId)
        return reply({ ok: false, error: sendError(socket, 'not_joined', 'Join first.') });
      if (!limiter.allow()) return reply({ ok: false, error: sendError(socket, 'rate_limited', 'Too many requests.') });
      const level = isObj(data) ? data.level : undefined;
      if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 5) {
        return reply({ ok: false, error: sendError(socket, 'bad_request', 'Level must be 1-5.') });
      }
      const applied = room.setAiLevel(level);
      sink.broadcast(room.cfg.roomId, 'ai_level', { level: applied });
      reply({ ok: true, level: applied });
    });

    // Optional human typing signal; silently ignored when invalid or too frequent.
    socket.on('typing', () => {
      const room = manager.get(socket.data.roomId);
      if (room && socket.data.playerId && typingLimiter.allow()) room.noteTyping(socket.data.playerId);
    });

    socket.on('disconnect', () => {
      const { roomId, playerId } = socket.data as { roomId?: string; playerId?: string };
      if (!roomId || !playerId) return;
      const left = (conns.get(playerId) ?? 1) - 1;
      if (left > 0) return void conns.set(playerId, left);
      conns.delete(playerId);
      manager.get(roomId)?.setConnected(playerId, false);
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(opts.port ?? env.port, resolve));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? env.port);

  return {
    httpServer,
    io,
    manager,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        manager.destroyAll();
        void io.close(() => resolve());
      }),
  };
}
