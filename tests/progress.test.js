import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityByDay, attemptXp, dayKey, dueJournal, earnedAchievements, journalDueAt, levelInfo, masteryTier, streakInfo,
  totalXp, xpForLevel,
} from '../src/lib/progress.js';

const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const days = (list, n = 25) => Object.fromEntries(list.map((k) => [k, n]));

test('activity groups attempts by local day', () => {
  const by = activityByDay([{ first: 'A', at: new Date(day(2026, 10, 1, 9)).toISOString() }, { first: 'B', at: new Date(day(2026, 10, 1, 22)).toISOString() }, { first: null, at: new Date(day(2026, 10, 1, 23)).toISOString() }]);
  assert.deepEqual(by, { '2026-10-01': 2 });
});

test('streak counts consecutive goal days and includes today once done', () => {
  const now = day(2026, 10, 10);
  const s = streakInfo(days(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']), 20, now);
  assert.equal(s.current, 4);
  assert.equal(s.todayDone, true);
  // Today not done yet: the streak through yesterday still stands.
  const s2 = streakInfo(days(['2026-10-07', '2026-10-08', '2026-10-09']), 20, now);
  assert.equal(s2.current, 3);
  assert.equal(s2.todayDone, false);
});

test('days below the goal do not count, and a gap breaks the streak', () => {
  const now = day(2026, 10, 10);
  const by = { ...days(['2026-10-05', '2026-10-06']), '2026-10-07': 5, ...days(['2026-10-08', '2026-10-09']) };
  const s = streakInfo(by, 20, now);
  assert.equal(s.current, 2);
  assert.equal(s.best, 2);
});

test('a freeze earned after 7 goal days covers one missed day', () => {
  const now = day(2026, 10, 12);
  const goalDays = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-10', '2026-10-11'];
  const s = streakInfo(days(goalDays), 20, now);
  assert.deepEqual(s.frozenDays, ['2026-10-08']);
  assert.equal(s.current, 10);
  assert.equal(s.freezes, 0);
});

test('XP rewards correct and hard answers, and BR fixes a little', () => {
  assert.equal(attemptXp({ first: 'A', br: 'A', answer: 'A' }, 3), 11);
  assert.equal(attemptXp({ first: 'A', br: 'A', answer: 'A' }, 5), 17);
  assert.equal(attemptXp({ first: 'B', br: 'A', answer: 'A' }, 5), 5);
  assert.equal(attemptXp({ first: 'B', br: 'B', answer: 'A' }, 5), 1);
  const j = { e: { myReasoning: 'a', tricky: 'b', correctReasoning: 'c', takeaway: 'd', status: 'mastered' } };
  assert.equal(totalXp([], j), 40);
});

test('levels increase with XP', () => {
  assert.equal(levelInfo(0).level, 1);
  assert.equal(xpForLevel(2), 200);
  assert.equal(levelInfo(200).level, 2);
  assert.equal(levelInfo(499).level, 2);
  assert.equal(levelInfo(500).level, 3);
  assert.ok(levelInfo(250).progress > 0 && levelInfo(250).progress < 1);
});

test('mastery tiers need volume and accuracy', () => {
  assert.equal(masteryTier({ n: 4, firstAccuracy: 1 }), null);
  assert.equal(masteryTier({ n: 5, firstAccuracy: 0.6 }), 'bronze');
  assert.equal(masteryTier({ n: 10, firstAccuracy: 0.8 }), 'silver');
  assert.equal(masteryTier({ n: 15, firstAccuracy: 0.95 }), 'gold');
  assert.equal(masteryTier({ n: 9, firstAccuracy: 0.95 }), 'bronze');
});

test('journal entries come back on a widening schedule', () => {
  const added = '2026-10-01T12:00:00.000Z';
  const base = Date.parse(added);
  const D = 86_400_000;
  assert.equal(journalDueAt({ addedAt: added, retries: [] }), base + D);
  assert.equal(journalDueAt({ addedAt: added, retries: [{ at: added, correct: true }] }), base + 3 * D);
  assert.equal(journalDueAt({ addedAt: added, retries: [{ at: added, correct: true }, { at: added, correct: true }] }), base + 7 * D);
  assert.equal(journalDueAt({ addedAt: added, retries: [{ at: added, correct: true }, { at: added, correct: false }] }), base + D);
  assert.equal(journalDueAt({ addedAt: added, retries: [], status: 'mastered' }), Infinity);
  const due = dueJournal({ a: { qid: 'a', addedAt: added, retries: [] }, b: { qid: 'b', addedAt: new Date().toISOString(), retries: [] } });
  assert.deepEqual(due.map((e) => e.qid), ['a']);
});

test('achievements unlock from counts', () => {
  const ids = earnedAchievements({ answered: 120, testsDone: 1, diagnosticsDone: 0, bestStreak: 3, perfectSessions: 0, bestCombo: 0, hardCorrect: 0, brFixed: 0, writeups: 0, mastered: 0, laddersCleared: 0, goldBadges: 0 });
  assert.deepEqual(ids, ['first-question', 'q100', 'first-test', 'streak3']);
});

test('dayKey uses local dates', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});
