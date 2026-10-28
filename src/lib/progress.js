// Progress and motivation: daily activity, streaks, XP and levels,
// achievements, category mastery, and spaced review of journal entries.
// Everything is derived from history, so it is always consistent with it.

import { isAnswered, outcome } from './analytics.js';

const DAY_MS = 86_400_000;

/** Local calendar day as "YYYY-MM-DD". */
export function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

/** Questions you answered (picked an answer for) in one session. */
export function sessionAnswered(s) {
  return s.sections.reduce((t, sec) => t + sec.qids.filter((id) => s.responses?.[id]?.first).length, 0);
}

/**
 * All-time questions answered, added up from your history: every finished session that shows in
 * History (abandoned ones hidden there don't count), so the total always matches that list.
 */
export function answeredFromHistory(sessions) {
  return Object.values(sessions).filter((s) => s.phase === 'done' && !s.abandoned).reduce((t, s) => t + sessionAnswered(s), 0);
}

/** Questions answered per local day: { "2026-10-21": 34, ... } */
export function activityByDay(attempts) {
  const out = {};
  for (const a of attempts) {
    if (!isAnswered(a)) continue;
    const k = dayKey(a.at);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/**
 * Streak of consecutive days meeting the daily goal, ending today (or
 * yesterday, if today isn't done yet). Every 7 goal days earns a streak
 * freeze (max 2); a missed day uses one up instead of breaking the streak.
 */
export function streakInfo(byDay, goal, now = Date.now()) {
  const today = dayKey(now);
  const days = Object.keys(byDay).filter((k) => byDay[k] >= goal).sort();
  if (!days.length) return { current: 0, best: 0, freezes: 0, todayDone: false, frozenDays: [] };

  let current = 0;
  let best = 0;
  let freezes = 0;
  let earnedTowardFreeze = 0;
  const frozenDays = [];
  const met = new Set(days);
  // Walk from the first goal day up to yesterday; today can only add.
  for (let k = days[0]; k < today; k = addDays(k, 1)) {
    if (met.has(k)) {
      current += 1;
      earnedTowardFreeze += 1;
      if (earnedTowardFreeze === 7) { freezes = Math.min(2, freezes + 1); earnedTowardFreeze = 0; }
    } else if (current > 0 && freezes > 0) {
      freezes -= 1;
      frozenDays.push(k);
    } else {
      current = 0;
      earnedTowardFreeze = 0;
    }
    best = Math.max(best, current);
  }
  const todayDone = met.has(today);
  if (todayDone) current += 1;
  best = Math.max(best, current);
  return { current, best, freezes, todayDone, frozenDays };
}

// ---- XP and levels ---------------------------------------------------------

export const XP = {
  correct: 10, // timed answer correct
  hardBonus: 3, // per difficulty level above 3, on correct answers
  brFixed: 4, // fixed in blind review
  attempt: 1, // showing up counts
  journalWriteup: 15, // all four journal fields filled
  journalMastered: 25,
};

export function attemptXp(a, difficulty) {
  if (!isAnswered(a)) return 0;
  const oc = outcome(a.first, a.br, a.answer);
  let xp = XP.attempt;
  if (oc === 'correct' || oc === 'br-broke') xp += XP.correct + XP.hardBonus * Math.max(0, (difficulty ?? 3) - 3);
  else if (oc === 'br-fixed') xp += XP.brFixed;
  return xp;
}

const WRITEUP_FIELDS = ['myReasoning', 'tricky', 'correctReasoning', 'takeaway'];
export const isWrittenUp = (e) => WRITEUP_FIELDS.every((f) => (e[f] || '').trim().length > 0);

export function totalXp(attempts, journal, difficultyOf = () => null) {
  let xp = 0;
  for (const a of attempts) xp += attemptXp(a, difficultyOf(a.qid));
  for (const e of Object.values(journal)) {
    if (isWrittenUp(e)) xp += XP.journalWriteup;
    if (e.status === 'mastered') xp += XP.journalMastered;
  }
  return xp;
}

export const LEVEL_TITLES = [
  'Pre-Law Curious', 'Argument Spotter', 'Premise Hunter', 'Assumption Finder', 'Flaw Detector',
  'Conditional Thinker', 'Passage Reader', 'Inference Engine', 'Trap Dodger', 'Blind Review Pro',
  'Logic Machine', '170 Contender', '175 Contender', 'Top Percentile', '180 Club',
];

/** XP needed to reach level n (level 1 = 0). Gently increasing steps. */
export function xpForLevel(n) {
  let total = 0;
  for (let i = 1; i < n; i++) total += 200 + 100 * (i - 1);
  return total;
}

export function levelInfo(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    xp,
    intoLevel: xp - start,
    levelSize: next - start,
    progress: (xp - start) / (next - start),
  };
}

// ---- Mastery tiers ---------------------------------------------------------

/** Bronze/silver/gold for a category or type, from stats { n, firstAccuracy }. */
export function masteryTier(stats) {
  if (!stats || stats.n < 5) return null;
  const acc = stats.firstAccuracy;
  if (stats.n >= 15 && acc >= 0.9) return 'gold';
  if (stats.n >= 10 && acc >= 0.75) return 'silver';
  if (acc >= 0.6) return 'bronze';
  return null;
}

// ---- Spaced review of journal entries ----------------------------------------

const INTERVALS = [1, 3, 7, 14, 30]; // days after each consecutive correct retry

/** When a journal entry should come back for review (ms timestamp). */
export function journalDueAt(entry) {
  if (entry.status === 'mastered') return Infinity;
  const retries = entry.retries || [];
  const last = retries[retries.length - 1];
  if (!last) return new Date(entry.addedAt).getTime() + INTERVALS[0] * DAY_MS;
  if (!last.correct) return new Date(last.at).getTime() + INTERVALS[0] * DAY_MS;
  let streak = 0;
  for (let i = retries.length - 1; i >= 0 && retries[i].correct; i--) streak += 1;
  return new Date(last.at).getTime() + INTERVALS[Math.min(streak, INTERVALS.length - 1)] * DAY_MS;
}

export function dueJournal(journal, now = Date.now()) {
  return Object.values(journal).filter((e) => journalDueAt(e) <= now)
    .sort((a, b) => journalDueAt(a) - journalDueAt(b));
}

// ---- Achievements ----------------------------------------------------------

export const ACHIEVEMENTS = [
  { id: 'first-question', icon: '🌱', title: 'First step', desc: 'Answer your first question.', test: (c) => c.answered >= 1 },
  { id: 'q100', icon: '💯', title: 'Century', desc: 'Answer 100 questions.', test: (c) => c.answered >= 100 },
  { id: 'q500', icon: '📚', title: 'Bookworm', desc: 'Answer 500 questions.', test: (c) => c.answered >= 500 },
  { id: 'q1000', icon: '🏛️', title: 'Grinder', desc: 'Answer 1,000 questions.', test: (c) => c.answered >= 1000 },
  { id: 'first-test', icon: '📝', title: 'Full dress rehearsal', desc: 'Finish a full practice test.', test: (c) => c.testsDone >= 1 },
  { id: 'three-tests', icon: '🎯', title: 'Test veteran', desc: 'Finish three full practice tests.', test: (c) => c.testsDone >= 3 },
  { id: 'diagnostic', icon: '🩺', title: 'Know thyself', desc: 'Finish a skill diagnostic.', test: (c) => c.diagnosticsDone >= 1 },
  { id: 'streak3', icon: '🔥', title: 'Warming up', desc: 'Hit your daily goal 3 days in a row.', test: (c) => c.bestStreak >= 3 },
  { id: 'streak7', icon: '⚡', title: 'One week strong', desc: 'Hit your daily goal 7 days in a row.', test: (c) => c.bestStreak >= 7 },
  { id: 'streak30', icon: '🏆', title: 'Unstoppable', desc: 'Hit your daily goal 30 days in a row.', test: (c) => c.bestStreak >= 30 },
  { id: 'perfect10', icon: '✨', title: 'Flawless', desc: 'Get every question right in a session of 10 or more.', test: (c) => c.perfectSessions >= 1 },
  { id: 'combo10', icon: '🎰', title: 'On a roll', desc: 'Get 10 in a row right in an instant-feedback drill.', test: (c) => c.bestCombo >= 10 },
  { id: 'hard25', icon: '🧗', title: 'Summit', desc: 'Get 25 level-5 questions right.', test: (c) => c.hardCorrect >= 25 },
  { id: 'br-fixer', icon: '🔍', title: 'Second look', desc: 'Fix 20 answers in blind review.', test: (c) => c.brFixed >= 20 },
  { id: 'writeup10', icon: '✍️', title: 'Reflective', desc: 'Fully write up 10 journal entries.', test: (c) => c.writeups >= 10 },
  { id: 'mastered10', icon: '🧠', title: 'Lessons learned', desc: 'Master 10 journal questions.', test: (c) => c.mastered >= 10 },
  { id: 'ladder5', icon: '🪜', title: 'Top rung', desc: 'Clear every level of a diagnostic ladder.', test: (c) => c.laddersCleared >= 1 },
  { id: 'gold', icon: '🥇', title: 'Gold standard', desc: 'Earn a gold mastery badge in any category.', test: (c) => c.goldBadges >= 1 },
];

export function earnedAchievements(counts) {
  return ACHIEVEMENTS.filter((a) => a.test(counts)).map((a) => a.id);
}
