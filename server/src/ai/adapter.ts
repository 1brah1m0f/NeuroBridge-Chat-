import { env, LevelStore } from '../config';
import { truncate } from '../sanitize';
import type { AiPlan, AiPlanner, AiTurnContext } from '../types';
import { applyStyle, cleanModelOutput, computeDelayMs, pickFallback } from './humanize';
import type { GenerateAnswer } from './llm';
import { InMemoryPersonaMemory, type PersonaMemory } from './memory';
import { buildPrompt, loadTemplate } from './prompt';

export interface AiAdapterOptions {
  generate: GenerateAnswer;
  levels?: LevelStore;
  memory?: PersonaMemory;
  /** Multiplies every delay; tests use a small value. */
  delayScale?: number;
  llmTimeoutMs?: number;
  loadTemplate?: () => string;
}

/**
 * Turns a turn context into a ready-to-post plan: answer text (LLM or fallback)
 * plus humanised timing. It never throws and never returns error text.
 */
export class AiAdapter implements AiPlanner {
  private levels: LevelStore;
  private memory: PersonaMemory;
  private scale: number;

  constructor(private opts: AiAdapterOptions) {
    this.levels = opts.levels ?? new LevelStore();
    this.memory = opts.memory ?? new InMemoryPersonaMemory();
    this.scale = opts.delayScale ?? 1;
  }

  remember(matchId: string, playerId: string, entry: { round: number; question: string; text: string }): void {
    this.memory.append(matchId, playerId, entry);
  }

  async plan(ctx: AiTurnContext): Promise<AiPlan> {
    const started = Date.now();
    const level = this.levels.get(ctx.level);
    const maxChars = Math.min(ctx.maxChars, level.maxChars);
    // leave headroom so the answer always lands before the turn deadline
    const budgetMs = ctx.turnMs * 0.85;

    let text: string | null = null;
    try {
      const template = (this.opts.loadTemplate ?? loadTemplate)();
      const prompt = buildPrompt(template, { ...ctx, maxChars }, level, this.memory.list(ctx.matchId, ctx.playerId));
      const timeoutMs = Math.min(this.opts.llmTimeoutMs ?? env.llmTimeoutMs, ctx.turnMs * 0.6);
      // hard cap here too, so a provider that ignores its own timeout can never stall the turn
      let timer: NodeJS.Timeout | undefined;
      const hardTimeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs + 250);
      });
      const raw = await Promise.race([
        this.opts.generate(prompt, { temperature: level.temperature, maxTokens: level.maxTokens, timeoutMs }),
        hardTimeout,
      ]).finally(() => clearTimeout(timer));
      text = cleanModelOutput(raw, maxChars);
    } catch (e) {
      // server log only; nothing about the failure ever reaches the chat
      console.warn(`[ai] LLM failed for level ${ctx.level}: ${(e as Error).message}`);
    }

    const fallbackUsed = text === null;
    if (text === null) text = pickFallback(level, ctx.language);
    text = truncate(applyStyle(text, level, ctx.language), maxChars);

    const llmMs = Date.now() - started;
    const target = computeDelayMs(text.length, level.delay, budgetMs) * this.scale;
    const waitMs = Math.max(0, target - llmMs);
    // first "typing" signal shortly after a human-like reading pause
    const typingAfterMs = Math.min(waitMs, Math.max(250 * this.scale, target * (0.25 + Math.random() * 0.25) - llmMs));
    return { text, waitMs, typingAfterMs, fallbackUsed, llmMs };
  }
}
