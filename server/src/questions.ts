import fs from 'node:fs';
import { paths } from './config';
import { pick, type Rng } from './util';

export interface QuestionEntry {
  id: string;
  category: string;
  text: Record<string, string>;
}

export interface PickedQuestion {
  id: string;
  category: string;
  text: string;
}

export function loadQuestionBank(file = paths.questions): QuestionEntry[] {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { questions: QuestionEntry[] };
  return data.questions;
}

/** One picker per match: never repeats a question until the bank for that language is exhausted. */
export class QuestionPicker {
  private used = new Set<string>();
  private pool: QuestionEntry[];

  constructor(bank: QuestionEntry[], private language: string, private rng: Rng = Math.random) {
    this.pool = bank.filter((q) => typeof q.text[language] === 'string');
    if (this.pool.length === 0) throw new Error(`No questions for language "${language}"`);
  }

  next(): PickedQuestion {
    let fresh = this.pool.filter((q) => !this.used.has(q.id));
    if (fresh.length === 0) {
      console.warn('[chat] question bank exhausted, recycling');
      this.used.clear();
      fresh = this.pool;
    }
    const q = pick(fresh, this.rng);
    this.used.add(q.id);
    return { id: q.id, category: q.category, text: q.text[this.language]! };
  }
}
