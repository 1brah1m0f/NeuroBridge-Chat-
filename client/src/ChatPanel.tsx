import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LevelPicker } from './LevelPicker';
import { useChat } from './useChat';

interface Props {
  serverUrl: string;
  roomId: string;
  name: string;
}

export function ChatPanel({ serverUrl, roomId, name }: Props) {
  const { state, submit, sendTyping, setAiLevel } = useChat(serverUrl, roomId, name);
  const [text, setText] = useState('');
  const [now, setNow] = useState(Date.now());
  const lastTypingSent = useRef(0);

  // one ticker drives both the countdown and typing-indicator expiry
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const { me, currentTurn, phase, answers, skipped, turnOrder } = state;
  const myTurn = !!me && currentTurn?.playerId === me.playerId && phase === 'PLAYER_TURN';
  const alreadyAnswered = !!me && answers.some((a) => a.playerId === me.playerId);
  const canType = myTurn && !alreadyAnswered;
  const turnPlayer = turnOrder.find((p) => p.playerId === currentTurn?.playerId);
  const secondsLeft = currentTurn ? Math.max(0, Math.ceil((currentTurn.deadline - now) / 1000)) : null;

  useEffect(() => {
    if (!canType) setText('');
  }, [canType]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!canType || !t) return;
    submit(t);
    setText(''); // input stays disabled until the next turn; server is the authority
  };

  const onChange = (v: string) => {
    setText(v);
    if (Date.now() - lastTypingSent.current > 1500) {
      lastTypingSent.current = Date.now();
      sendTyping();
    }
  };

  let status: string;
  if (state.status === 'connecting') status = 'Connecting…';
  else if (state.status === 'failed') status = state.error ?? 'Could not join';
  else if (phase === 'LOCKED') status = 'Chat locked';
  else if (phase === 'IDLE') status = 'Waiting for the next round…';
  else if (phase === 'QUESTION_SHOWN') status = 'Get ready…';
  else if (myTurn) status = 'Your turn';
  else if (turnPlayer) status = `Waiting for ${turnPlayer.name}…`;
  else status = '…';

  return (
    <section className="chat" aria-label="Chat">
      {state.aiLevel !== null && state.status === 'joined' && (
        <LevelPicker level={state.aiLevel} onChange={setAiLevel} />
      )}
      <header className="chat-question">
        {state.question ? (
          <>
            <span className="chat-round">Round {state.round}</span>
            <p>{state.question}</p>
          </>
        ) : (
          <p className="muted">No question yet</p>
        )}
      </header>

      <ol className="chat-answers">
        {turnOrder.map((p) => {
          const a = answers.find((x) => x.playerId === p.playerId);
          const isTyping = !a && (state.typingUntil[p.playerId] ?? 0) > now;
          const isTurn = currentTurn?.playerId === p.playerId;
          return (
            <li key={p.playerId} className={isTurn ? 'row current' : 'row'}>
              <span className="dot" style={{ background: p.color }} />
              <div className="body">
                <span className="author" style={{ color: p.color }}>
                  {p.name}
                  {me?.playerId === p.playerId && ' (you)'}
                </span>
                {a ? (
                  <span className="text">{a.text}</span>
                ) : skipped.includes(p.playerId) ? (
                  <span className="text muted">no answer</span>
                ) : isTyping ? (
                  <span className="text muted typing">
                    typing<i>.</i>
                    <i>.</i>
                    <i>.</i>
                  </span>
                ) : (
                  <span className="text muted">{isTurn ? '…' : ''}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className={`chat-status${phase === 'LOCKED' ? ' locked' : ''}${myTurn ? ' mine' : ''}`} role="status">
        <span>{status}</span>
        {secondsLeft !== null && phase === 'PLAYER_TURN' && <span className="timer">{secondsLeft}s</span>}
      </div>

      <form className="chat-input" onSubmit={onSubmit}>
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          maxLength={state.maxChars}
          disabled={!canType}
          placeholder={canType ? 'Type your answer…' : phase === 'LOCKED' ? 'Chat locked' : 'Not your turn'}
          autoComplete="off"
          aria-label="Your answer"
        />
        <button type="submit" disabled={!canType || !text.trim()}>
          Send
        </button>
        {canType && (
          <span className="count">
            {text.length}/{state.maxChars}
          </span>
        )}
      </form>
      {state.error && state.status === 'joined' && (
        <p className="chat-error" role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}
