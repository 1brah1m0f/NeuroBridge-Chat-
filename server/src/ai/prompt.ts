import fs from 'node:fs';
import { paths, type LevelConfig } from '../config';
import { forPrompt } from '../sanitize';
import type { AiTurnContext } from '../types';
import type { PersonaEntry } from './memory';

const LANGUAGE_NAMES: Record<string, string> = { az: 'Azerbaijani', en: 'English', ru: 'Russian' };

let cached: { mtime: number; text: string } | null = null;
export function loadTemplate(file = paths.prompt): string {
  const m = fs.statSync(file).mtimeMs;
  if (!cached || cached.mtime !== m) cached = { mtime: m, text: fs.readFileSync(file, 'utf8') };
  return cached.text;
}

const HISTORY_ROUNDS = 5;

function formatPrevious(ctx: AiTurnContext): string {
  if (ctx.previousAnswers.length === 0) return '(none yet, you answer first)';
  return ctx.previousAnswers.map((a, i) => `${i + 1}. ${forPrompt(a.name)}: ${forPrompt(a.text)}`).join('\n');
}

/** Own answers (persona memory) first, then what others said recently. Only data the AI is allowed to see. */
function formatHistory(ctx: AiTurnContext, own: PersonaEntry[]): string {
  const lines: string[] = [];
  const ownRecent = own.filter((e) => e.round < ctx.round).slice(-HISTORY_ROUNDS);
  if (ownRecent.length) {
    lines.push('YOUR earlier answers (stay consistent with these):');
    for (const e of ownRecent) lines.push(`- Round ${e.round} | Q: ${forPrompt(e.question)} | you: ${forPrompt(e.text)}`);
  }
  const others = ctx.pastRounds.filter((r) => r.round < ctx.round).slice(-HISTORY_ROUNDS);
  if (others.length) {
    lines.push("Other players' earlier answers:");
    for (const r of others) {
      const answers = r.answers
        .filter((a) => a.playerId !== ctx.playerId && a.text)
        .map((a) => `${forPrompt(a.name)}: ${forPrompt(a.text!)}`)
        .join(' || ');
      lines.push(`- Round ${r.round} | Q: ${forPrompt(r.question)} | ${answers || '(no answers)'}`);
    }
  }
  return lines.length ? lines.join('\n') : '(no earlier rounds)';
}

/**
 * Fill the master template in a single pass, so placeholder-like text inside
 * untrusted values is never re-expanded.
 */
export function buildPrompt(template: string, ctx: AiTurnContext, level: LevelConfig, own: PersonaEntry[]): string {
  const vars: Record<string, string> = {
    MY_NAME: forPrompt(ctx.name),
    ALIVE_PLAYERS: ctx.aliveNames.map(forPrompt).join(', '),
    ROUND: String(ctx.round),
    QUESTION: forPrompt(ctx.question),
    PREVIOUS_ANSWERS: formatPrevious(ctx),
    LANGUAGE: LANGUAGE_NAMES[ctx.language] ?? ctx.language,
    HISTORY: formatHistory(ctx, own),
    LEVEL: String(ctx.level),
    MAX_CHARS: String(ctx.maxChars),
    STYLE_NOTES: level.styleNotes,
  };
  return template.replace(/\{([A-Z_]+)\}/g, (whole, key: string) => (key in vars ? vars[key]! : whole));
}
