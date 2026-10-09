export interface PersonaEntry {
  round: number;
  question: string;
  text: string;
}

/** Per-AI answer memory for one match. Swap for Redis/DB by implementing this interface. */
export interface PersonaMemory {
  append(matchId: string, playerId: string, entry: PersonaEntry): void;
  list(matchId: string, playerId: string): PersonaEntry[];
}

export class InMemoryPersonaMemory implements PersonaMemory {
  private store = new Map<string, PersonaEntry[]>();

  append(matchId: string, playerId: string, entry: PersonaEntry): void {
    const key = `${matchId}:${playerId}`;
    const list = this.store.get(key) ?? [];
    list.push(entry);
    this.store.set(key, list);
  }

  list(matchId: string, playerId: string): PersonaEntry[] {
    return this.store.get(`${matchId}:${playerId}`) ?? [];
  }
}
