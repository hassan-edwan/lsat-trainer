import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';
import { navigate } from '../lib/nav.js';
import Runner from '../components/Runner.jsx';
import Results from './Results.jsx';
import Layout from '../components/Layout.jsx';

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
    return <Layout section="session"><div className="card empty-state">Session not found. <a href="#/">Back to Today</a></div></Layout>;
  }
  if (session.phase === 'done') {
    return <Layout section="session"><Results session={session} /></Layout>;
  }
  if (session.phase === 'finishing') return <div className="loading">Scoring…</div>;
  return <Runner key={session.id} initial={session} index={index} onSave={saveSession} onFinish={onFinish} onExit={() => navigate('/')} />;
}
