import fs from 'node:fs';
import path from 'node:path';
import type { PlayerKind, RoundLogEntry, RoundLogger } from '../types';

/**
 * Append-only JSONL log. Two line types:
 *   {type:"round", ...}   written when a round locks (author types live here, server side only)
 *   {type:"result", ...}  written when the game reports what humans did with that round
 * Swap for a DB by implementing RoundLogger.
 */
export class JsonlLogger implements RoundLogger {
  readonly file: string;

  constructor(dir: string, name = 'rounds.jsonl') {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, name);
  }

  logRound(entry: RoundLogEntry): void {
    this.write({ type: 'round', ts: new Date().toISOString(), ...entry });
  }

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
  ): void {
    this.write({ type: 'result', ts: new Date().toISOString(), matchId, round, players: perPlayer });
  }

  private write(obj: unknown): void {
    try {
      fs.appendFileSync(this.file, JSON.stringify(obj) + '\n');
    } catch (e) {
      console.error('[log] write failed', e);
    }
  }
}

export class NullLogger implements RoundLogger {
  logRound(): void {}
  logResult(): void {}
}
