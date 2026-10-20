import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';
import { navigate } from '../lib/nav.js';
import Runner from '../components/Runner.jsx';
import Results from './Results.jsx';

export default function SessionPage({ id }) {
  const { sessions, index, saveSession, finishSession } = useStore();
  const session = sessions[id];
  const finishing = useRef(false);

  const onFinish = useCallback(async (s) => {
    if (finishing.current) return;
    finishing.current = true;
    await finishSession(s);
  }, [finishSession]);

  // A session closed mid-scoring is scored on the next visit.
  useEffect(() => {
    if (session?.phase === 'finishing') onFinish(session);
  }, [session, onFinish]);

  if (!session) {
    return <div className="page"><div className="card">Session not found. <a href="#/">Back to library</a></div></div>;
  }
  if (session.phase === 'done') {
    return (
      <div className="app">
        <header className="topnav">
          <a className="brand" href="#/">LSAT Trainer</a>
          <nav><a href="#/">Library</a><a href="#/drill">Drills</a><a href="#/journal">Mistake Journal</a><a href="#/stats">Analytics</a></nav>
        </header>
        <main className="page"><Results session={session} /></main>
      </div>
    );
  }
  if (session.phase === 'finishing') return <div className="loading">Scoring…</div>;
  return <Runner key={session.id} initial={session} index={index} onSave={saveSession} onFinish={onFinish} onExit={() => navigate('/')} />;
}
