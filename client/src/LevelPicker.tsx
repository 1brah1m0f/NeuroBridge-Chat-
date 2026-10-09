const LEVELS = [
  { level: 1, name: 'Rookie', hint: 'Easy to spot' },
  { level: 2, name: 'Beginner', hint: 'Slightly off' },
  { level: 3, name: 'Average', hint: 'Like a normal player' },
  { level: 4, name: 'Advanced', hint: 'Hard to detect' },
  { level: 5, name: 'Master', hint: 'Very hard to detect' },
];

interface Props {
  level: number;
  onChange: (level: number) => void;
}

/** Host control: applies from the AI's next turn. */
export function LevelPicker({ level, onChange }: Props) {
  const current = LEVELS.find((l) => l.level === level);
  return (
    <fieldset className="level-picker">
      <legend>AI difficulty</legend>
      <div className="level-options" role="radiogroup" aria-label="AI difficulty">
        {LEVELS.map((l) => (
          <button
            key={l.level}
            type="button"
            role="radio"
            aria-checked={l.level === level}
            className={l.level === level ? 'level active' : 'level'}
            onClick={() => onChange(l.level)}
            title={`${l.name}: ${l.hint}`}
          >
            <b>{l.level}</b>
            <span>{l.name}</span>
          </button>
        ))}
      </div>
      <p className="level-hint">
        {current ? `${current.name}: ${current.hint}. Applies from the AI's next turn.` : ''}
      </p>
    </fieldset>
  );
}
