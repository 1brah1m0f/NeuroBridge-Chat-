import { useState } from 'react';
import { ChatPanel } from './ChatPanel';

// Demo shell. In the real game, render <ChatPanel/> inside the game screen with the token the game issued.
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';
const ROOM_ID = import.meta.env.VITE_ROOM_ID ?? 'dev';

export function App() {
  const [name, setName] = useState('');
  const [joined, setJoined] = useState<string | null>(null);

  if (joined) {
    return (
      <main className="demo">
        <ChatPanel serverUrl={SERVER_URL} roomId={ROOM_ID} name={joined} />
      </main>
    );
  }
  return (
    <main className="demo">
      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) setJoined(name.trim());
        }}
      >
        <h1>Join chat</h1>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={20}
          autoFocus
        />
        <button type="submit" disabled={!name.trim()}>
          Join
        </button>
      </form>
    </main>
  );
}
