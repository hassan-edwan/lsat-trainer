// App-wide data: loads everything from IndexedDB once, keeps it in React
// state, and writes changes back.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db } from './lib/db.js';
import { initFileSync } from './lib/fileSync.js';
import { buildIndex, finalizeSession, flatQuestions, viewedQids } from './lib/session.js';
import { categoriesOf } from './lib/taxonomy.js';
import { categoryStats, isAnswered, outcome, typeStats } from './lib/analytics.js';
import { ladderResults } from './lib/diagnostic.js';
import {
  activityByDay, dayKey, dueJournal, earnedAchievements, isWrittenUp, levelInfo, masteryTier, streakInfo, totalXp,
} from './lib/progress.js';

export const DEFAULT_PREFS = { dailyGoal: 20, gamification: true, seenAchievements: null, unscoredSection: true };

const StoreContext = createContext(null);

const byKey = (list, key) => Object.fromEntries(list.map((x) => [x[key], x]));

export function StoreProvider({ children }) {
  const [loaded, setLoaded] = useState(false);
  const [allTests, setTests] = useState([]);
  const [sessions, setSessions] = useState({});
  const [attempts, setAttempts] = useState([]);
  const [journal, setJournal] = useState({});
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  const reload = useCallback(async () => {
    const [t, s, a, j, p] = await Promise.all([
      db.getAll('tests'), db.getAll('sessions'), db.getAll('attempts'), db.getAll('journal'), db.get('settings', 'prefs'),
    ]);
    setPrefs({ ...DEFAULT_PREFS, ...(p?.value || {}) });
    setTests(t.sort((x, y) => (x.number ?? 1e9) - (y.number ?? 1e9) || x.name.localeCompare(y.name)));
    setSessions(byKey(s, 'id'));
    setAttempts(a.sort((x, y) => x.at.localeCompare(y.at)));
    setJournal(byKey(j, 'qid'));
    setLoaded(true);
  }, []);

  // Merge with the project's data/ folder first (when running locally), then load.
  useEffect(() => { initFileSync(db).catch(() => false).finally(reload); }, [reload]);

  // Retired tests (replaced by a newer built-in set) stay indexed so old results still render,
  // but they're left out of the library, drills, and plans.
  const tests = useMemo(() => allTests.filter((t) => !t.retired), [allTests]);
  const index = useMemo(() => buildIndex(allTests), [allTests]);
  const allQuestions = useMemo(() => flatQuestions(tests), [tests]);
  // Diagnostic questions are kept out of drills so retakes stay fresh.
  const questions = useMemo(() => allQuestions.filter((q) => q.purpose !== 'diagnostic'), [allQuestions]);
  const diagnosticQuestions = useMemo(() => allQuestions.filter((q) => q.purpose === 'diagnostic'), [allQuestions]);
  // Use each question's current tags, so retagging updates past stats too.
  const taggedAttempts = useMemo(
    () => attempts.map((a) => (index[a.qid] ? { ...a, types: index[a.qid].question.types, categories: categoriesOf(index[a.qid].question) } : a)),
    [attempts, index],
  );

  const progress = useMemo(() => {
    const byDay = activityByDay(attempts);
    const streak = streakInfo(byDay, prefs.dailyGoal);
    const difficultyOf = (qid) => index[qid]?.question.difficulty;
    const xp = totalXp(attempts, journal, difficultyOf);
    const done = Object.values(sessions).filter((s) => s.phase === 'done');
    const typeS = typeStats(taggedAttempts);
    const catS = categoryStats(taggedAttempts);
    const entries = Object.values(journal);
    const counts = {
      answered: attempts.filter(isAnswered).length,
      testsDone: done.filter((s) => s.kind === 'pt').length,
      diagnosticsDone: done.filter((s) => s.kind === 'diagnostic').length,
      bestStreak: streak.best,
      perfectSessions: done.filter((s) => s.summary?.total >= 10 && s.summary.firstCorrect === s.summary.total).length,
      bestCombo: Math.max(0, ...done.map((s) => s.bestCombo || 0)),
      hardCorrect: attempts.filter((a) => difficultyOf(a.qid) === 5 && a.first === a.answer).length,
      brFixed: attempts.filter((a) => outcome(a.first, a.br, a.answer) === 'br-fixed').length,
      writeups: entries.filter(isWrittenUp).length,
      mastered: entries.filter((e) => e.status === 'mastered').length,
      laddersCleared: ladderResults(diagnosticQuestions, attempts).filter((r) => r.cleared === 5).length,
      goldBadges: [...Object.values(typeS), ...Object.values(catS)].filter((x) => masteryTier(x) === 'gold').length,
    };
    const today = byDay[dayKey(Date.now())] || 0;
    return {
      byDay, streak, xp, level: levelInfo(xp), counts, today,
      // Only questions still in the library come back for review; retired tests are history only.
      earned: earnedAchievements(counts), due: dueJournal(journal).filter((e) => index[e.qid] && !index[e.qid].test.retired),
    };
  }, [attempts, taggedAttempts, journal, sessions, index, diagnosticQuestions, prefs.dailyGoal]);

  const actions = useMemo(() => ({
    reload,
    async savePrefs(patch) {
      setPrefs((prev) => {
        const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
        db.put('settings', { key: 'prefs', value: next });
        return next;
      });
    },
    async addTests(newTests) {
      await db.putMany('tests', newTests);
      await reload();
    },
    /** Add a built-in bundle, then retire tests it replaces: unused ones are deleted, used ones kept for history. */
    async installBundle(newTests, retiredIds, version) {
      await db.putMany('tests', newTests);
      const used = new Set();
      for (const s of Object.values(sessions)) {
        if (s.testId) used.add(s.testId);
        for (const sec of s.sections || []) for (const qid of sec.qids || []) if (index[qid]) used.add(index[qid].test.id);
      }
      for (const t of allTests.filter((x) => retiredIds.includes(x.id) && !x.retired)) {
        if (used.has(t.id)) await db.put('tests', { ...t, retired: true });
        else await db.delete('tests', t.id);
      }
      const p = (await db.get('settings', 'prefs'))?.value || {};
      await db.put('settings', { key: 'prefs', value: { ...DEFAULT_PREFS, ...p, bundleVersion: version, updatedAt: new Date().toISOString() } });
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
    // Discard an unfinished session. Questions it already showed you stay marked as seen (in a
    // hidden, abandoned record), so later drills and stamina sessions don't hand them back as new.
    async discardSession(id) {
      const s = sessions[id];
      const shownQids = s ? viewedQids(s, index) : [];
      if (!shownQids.length) { await db.delete('sessions', id); await reload(); return; }
      await db.put('sessions', { ...s, phase: 'done', abandoned: true, finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), shownQids,
        summary: { total: 0, firstCorrect: 0, brCorrect: 0, outcomes: {}, bySection: [] } });
      await reload();
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
      await db.putMany('journal', journalPuts.map((e) => ({ ...e, updatedAt: done.finishedAt })));
      await reload();
      return done;
    },
    async saveJournalEntry(raw) {
      const entry = { ...raw, updatedAt: new Date().toISOString() };
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
  }), [reload, index, journal, attempts, sessions, allTests]);

  const value = { loaded, tests, allTests, sessions, attempts: taggedAttempts, journal, index, questions, diagnosticQuestions, prefs, progress, ...actions };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}
