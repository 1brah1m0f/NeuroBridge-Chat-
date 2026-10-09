import fs from 'node:fs';

/**
 * A file that is re-read when it changes on disk, for config that can be tuned without a restart.
 * The mtime is checked at most once per `checkMs`, so callers on a hot path (every AI turn) stay cheap.
 * After the first successful load, a failed re-read (file mid-save, bad JSON) keeps the last good value.
 */
export class HotFile<T> {
  private value: T | undefined;
  private mtime = -1;
  private checkedAt = -Infinity;

  constructor(
    private readonly file: string,
    private readonly parse: (text: string) => T,
    private readonly checkMs = 1000,
  ) {}

  get(now = Date.now()): T {
    if (this.value !== undefined && now - this.checkedAt < this.checkMs) return this.value;
    this.checkedAt = now;
    try {
      const m = fs.statSync(this.file).mtimeMs;
      if (this.value === undefined || m !== this.mtime) {
        this.value = this.parse(fs.readFileSync(this.file, 'utf8'));
        this.mtime = m;
      }
    } catch (e) {
      if (this.value === undefined) throw e;
      console.warn(`[config] keeping previous ${this.file}: ${(e as Error).message}`);
    }
    return this.value;
  }
}
