// App-wide data: loads everything from IndexedDB once, keeps it in React
// state, and writes changes back.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db } from './lib/db.js';
import { buildIndex, finalizeSession, flatQuestions } from './lib/session.js';

const StoreContext = createContext(null);

const byKey = (list, key) => Object.fromEntries(list.map((x) => [x[key], x]));

export function StoreProvider({ children }) {
  const [loaded, setLoaded] = useState(false);
  const [tests, setTests] = useState([]);
  const [sessions, setSessions] = useState({});
  const [attempts, setAttempts] = useState([]);
  const [journal, setJournal] = useState({});

  const reload = useCallback(async () => {
    const [t, s, a, j] = await Promise.all([
      db.getAll('tests'), db.getAll('sessions'), db.getAll('attempts'), db.getAll('journal'),
    ]);
    setTests(t.sort((x, y) => (x.number ?? 1e9) - (y.number ?? 1e9) || x.name.localeCompare(y.name)));
    setSessions(byKey(s, 'id'));
    setAttempts(a.sort((x, y) => x.at.localeCompare(y.at)));
    setJournal(byKey(j, 'qid'));
    setLoaded(true);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const index = useMemo(() => buildIndex(tests), [tests]);
  const questions = useMemo(() => flatQuestions(tests), [tests]);
  // Use each question's current tags, so retagging updates past stats too.
  const taggedAttempts = useMemo(
    () => attempts.map((a) => (index[a.qid] ? { ...a, types: index[a.qid].question.types } : a)),
    [attempts, index],
  );

  const actions = useMemo(() => ({
    reload,
    async addTests(newTests) {
      await db.putMany('tests', newTests);
      await reload();
    },
    async deleteTest(id) {
      await db.delete('tests', id);
      await reload();
    },
    async saveTest(test) {
      await db.put('tests', test);
      setTests((prev) => prev.map((t) => (t.id === test.id ? test : t)));
    },
    async saveSession(session) {
      const next = { ...session, updatedAt: new Date().toISOString() };
      setSessions((prev) => ({ ...prev, [next.id]: next }));
      await db.put('sessions', next);
      return next;
    },
    async deleteSession(id) {
      await db.delete('sessions', id);
      await db.deleteMany('attempts', attempts.filter((a) => a.sessionId === id).map((a) => a.key));
      await reload();
    },
    async finishSession(session) {
      const { attempts: rows, journalPuts, summary } = finalizeSession(session, index, journal);
      const done = { ...session, phase: 'done', finishedAt: new Date().toISOString(), summary };
      await db.put('sessions', done);
      await db.putMany('attempts', rows);
      await db.putMany('journal', journalPuts);
      await reload();
      return done;
    },
    async saveJournalEntry(entry) {
      setJournal((prev) => ({ ...prev, [entry.qid]: entry }));
      await db.put('journal', entry);
    },
    async deleteJournalEntry(qid) {
      await db.delete('journal', qid);
      setJournal((prev) => {
        const next = { ...prev };
        delete next[qid];
        return next;
      });
    },
  }), [reload, index, journal, attempts]);

  const value = { loaded, tests, sessions, attempts: taggedAttempts, journal, index, questions, ...actions };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}
