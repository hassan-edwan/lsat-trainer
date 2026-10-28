// Stamina: how accuracy and pace hold up over a long sitting, and a ladder of
// longer and longer sessions to build it.

import { shuffle } from './analytics.js';
import { createSectionsSession, flatQuestions } from './session.js';
import { seenIds } from './mastery.js';

// Accuracy a typical student gets at each difficulty, used until there is enough of the user's own history.
const PRIOR = { 1: 0.9, 2: 0.82, 3: 0.7, 4: 0.55, 5: 0.4 };
const PRIOR_WEIGHT = 5;
const PASS_FADE = -6;
const MIN_ANSWERED = 0.75; // share of questions answered for a session to count
const LONG_MINUTES = 45; // a timed sitting at least this long shows its fade // points; a late drop no worse than this passes a level

export const STAMINA_LEVELS = [
  { level: 1, title: 'One section', kinds: () => ['LR'], breakAfter: null,
    detail: 'One timed 35-minute section. Learn your baseline pace and where in a section you start to slip.' },
  { level: 2, title: 'Back to back', kinds: () => shuffle(['LR', 'RC']), breakAfter: null,
    detail: 'Two sections, 70 minutes, no break. The second section is where focus first starts to fade.' },
  { level: 3, title: 'Three straight', kinds: () => ['LR', 'LR', 'RC'], breakAfter: null,
    detail: 'Three sections, 105 minutes, no break, with reading last so you practice it tired.' },
  { level: 4, title: 'Test day', kinds: () => shuffle(['LR', 'LR', 'RC', Math.random() < 0.5 ? 'LR' : 'RC']), breakAfter: 1,
    detail: 'Four sections with the 10-minute break after section 2, exactly like the real test.' },
  { level: 5, title: 'Overtime', kinds: () => [...shuffle(['LR', 'LR', 'RC', Math.random() < 0.5 ? 'LR' : 'RC']), 'LR'], breakAfter: 1,
    detail: 'Five sections, one more than the real test, so test day feels short.' },
];

/** Expected first-pass accuracy by difficulty, from the user's history blended with a prior. */
export function expectedByDifficulty(attempts, index, excludeSessionId = null) {
  const tally = {};
  for (const a of attempts) {
    if (a.sessionId === excludeSessionId) continue;
    const d = index[a.qid]?.question.difficulty;
    if (!d) continue;
    tally[d] ||= { n: 0, right: 0 };
    tally[d].n += 1;
    if (a.first === a.answer) tally[d].right += 1;
  }
  const out = {};
  for (const d of [1, 2, 3, 4, 5]) {
    const t = tally[d] || { n: 0, right: 0 };
    out[d] = (t.right + PRIOR_WEIGHT * PRIOR[d]) / (t.n + PRIOR_WEIGHT);
  }
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Difficulty-adjusted stamina report for one session. `fade` is the change in
 * (actual − expected) accuracy, in points, from the first 60% of the questions
 * (in the order they were taken) to the last 40%. Negative = you faded.
 */
export function staminaReport(session, index, expected) {
  const rows = [];
  session.sections.forEach((sec, si) => sec.qids.forEach((qid, qi) => {
    const q = index[qid]?.question;
    if (!q) return;
    const r = session.responses[qid] || {};
    const right = r.first === q.answer ? 1 : 0;
    rows.push({ si, qi, n: sec.qids.length, right, resid: right - (expected[q.difficulty] ?? 0.7), timeMs: r.timeMs || 0, answered: !!r.first });
  }));
  if (rows.length < 10) return null;
  const cut = Math.round(rows.length * 0.6);
  const early = rows.slice(0, cut);
  const late = rows.slice(cut);
  const pts = (x) => (x == null ? null : Math.round(x * 100));
  const sections = session.sections.map((sec, si) => {
    const rs = rows.filter((r) => r.si === si);
    const third = Math.floor(sec.qids.length * 2 / 3);
    return {
      title: sec.title,
      kind: sec.kind,
      accuracy: pts(mean(rs.map((r) => r.right))),
      vsExpected: pts(mean(rs.map((r) => r.resid))),
      lateThird: pts((mean(rs.filter((r) => r.qi >= third).map((r) => r.resid)) ?? 0) - (mean(rs.filter((r) => r.qi < third).map((r) => r.resid)) ?? 0)),
      // RC reading-pause time is stored per passage; count it toward the section's pace.
      secPerQuestion: Math.round((rs.reduce((t, r) => t + r.timeMs, 0) + Object.entries(session.reading || {})
        .filter(([k]) => k.startsWith(`${si}:`)).reduce((t, [, v]) => t + v.ms, 0)) / Math.max(1, rs.length) / 1000),
      targetSec: sec.timeLimitSec ? Math.round(sec.timeLimitSec / sec.qids.length) : null,
      unanswered: rs.filter((r) => !r.answered).length,
    };
  });
  const fade = pts(mean(late.map((r) => r.resid)) - mean(early.map((r) => r.resid)));
  // A rushed or mostly blank session says nothing about stamina, so it can't pass a level.
  const limit = session.sections.reduce((t, s) => t + (s.timeLimitSec || 0), 0);
  const used = session.sections.reduce((t, s) => t + (s.elapsedSec || 0), 0);
  // Running out of time late is itself the stamina signal, so blanks count as misses rather than voiding the session.
  const counts = rows.filter((r) => r.answered).length >= MIN_ANSWERED * rows.length && (!limit || used >= 0.4 * limit);
  return { fade, early: pts(mean(early.map((r) => r.resid))), late: pts(mean(late.map((r) => r.resid))), sections, counts, passed: counts && fade >= PASS_FADE };
}

export function verdict(report) {
  if (!report) return '';
  if (!report.counts) return 'This session doesn\'t count toward the ladder: answer at least 75% of the questions and use at least 40% of the time, as you would on test day.';
  const f = report.fade;
  if (f >= 3) return 'You got stronger as the session went on. Your stamina is not the limiting factor here.';
  if (f >= PASS_FADE) return 'You held steady: your late accuracy stayed close to your early accuracy after adjusting for difficulty.';
  if (f >= -12) return 'You faded late. Your accuracy in the last stretch dropped more than the harder questions explain.';
  return 'You faded sharply late. Build up with shorter back-to-back sessions before going longer.';
}

/**
 * A long timed sitting: a stamina session, a practice test with two or more sections, or any other
 * timed session with two or more timed sections or at least 45 minutes on the clock.
 */
export function isLongSitting(s) {
  if (s.kind === 'stamina') return true;
  const timed = s.sections.filter((sec) => sec.timeLimitSec);
  if (s.kind === 'pt') return s.sections.length >= 2;
  const minutes = timed.reduce((t, sec) => t + sec.timeLimitSec, 0) / 60;
  return timed.length >= 2 || minutes >= LONG_MINUTES;
}

/** Finished long sittings with their reports, newest first. */
export function staminaHistory(sessions, attempts, index) {
  return Object.values(sessions)
    .filter((s) => s.phase === 'done' && !s.abandoned && isLongSitting(s))
    .sort((a, b) => (b.finishedAt || '').localeCompare(a.finishedAt || ''))
    .map((s) => ({ session: s, report: staminaReport(s, index, expectedByDifficulty(attempts, index, s.id)) }))
    .filter((x) => x.report);
}

const ladderLevel = (session) => session.stamina?.level
  ?? (session.kind === 'pt' && session.sections.length >= 4 ? 4 : session.sections.length >= 3 ? 3 : 2);

/**
 * Where you are on the ladder. Finishing a level (a session that counts) unlocks the next one;
 * holding steady (fade under 6 points) passes it. `next` is the level to do now: the first
 * unlocked level you haven't passed, so a level you faded on is suggested again, but the
 * next one stays open. Full tests count as level 4; drills don't move the ladder.
 */
export function ladderStatus(history) {
  const levels = STAMINA_LEVELS.map((l) => ({ level: l.level, attempts: 0, completed: false, passed: false, last: null }));
  // history is newest first; walk oldest first so `last` ends up as the latest attempt.
  for (const { session, report } of [...history].reverse()) {
    if (session.kind !== 'stamina' && session.kind !== 'pt') continue;
    const x = levels[ladderLevel(session) - 1];
    if (!x) continue;
    x.attempts += 1;
    x.last = { fade: report.fade, counts: report.counts, passed: report.passed, at: session.finishedAt };
    if (report.counts) x.completed = true;
    if (report.passed) x.passed = true;
  }
  // Passing or finishing a longer sitting covers the shorter levels below it.
  for (let i = levels.length - 2; i >= 0; i--) {
    levels[i].passed ||= levels[i + 1].passed;
    levels[i].completed ||= levels[i + 1].completed;
  }
  let unlocked = 1;
  for (const x of levels) if (x.completed) unlocked = Math.max(unlocked, x.level + 1);
  unlocked = Math.min(5, unlocked);
  const next = levels.find((x) => x.level <= unlocked && !x.passed)?.level ?? unlocked;
  return { levels, unlocked, next };
}

/** The level to train next (see ladderStatus). */
export function currentLevel(history) {
  return ladderStatus(history).next;
}

// A real LR section's difficulty mix (25 questions), easiest first with the hardest late.
const LR_MIX = { 1: 4, 2: 6, 3: 7, 4: 5, 5: 3 };
const MAX_SAME_TYPE = 4;

/** A 25-question LR section of questions you've never seen, shaped like a real one. */
function freshLRSection(questions, seen, rng) {
  const pool = questions.filter((q) => q.kind === 'LR' && !seen.has(q.id));
  const picked = [];
  const typeCount = {};
  const take = (cands, n) => {
    for (const q of shuffle(cands, rng)) {
      if (n <= 0) break;
      const t = q.types?.[0] || 'other';
      if (picked.includes(q) || (typeCount[t] || 0) >= MAX_SAME_TYPE) continue;
      picked.push(q);
      typeCount[t] = (typeCount[t] || 0) + 1;
      n -= 1;
    }
    return n;
  };
  let short = 0;
  for (const [d, n] of Object.entries(LR_MIX)) short += take(pool.filter((q) => (q.difficulty ?? 3) === Number(d)), n);
  if (short > 0) take(pool, short);
  if (picked.length < 20) return null;
  // Easiest first with some overlap between neighbouring levels, as on the real test.
  const ordered = picked.map((q) => ({ q, k: (q.difficulty ?? 3) + rng() * 1.5 })).sort((x, y) => x.k - y.k).map((x) => x.q);
  return { title: 'Logical Reasoning', kind: 'LR', timeLimitMinutes: 35, questions: ordered };
}

/** An RC section of four whole passages (about 27 questions) you've never read. */
function freshRCSection(questions, seen, rng) {
  const groups = {};
  for (const q of questions) if (q.kind === 'RC' && q.passageId) (groups[`${q.testId}:${q.passageId}`] ||= []).push(q);
  const fresh = Object.values(groups).filter((g) => g.length >= 4 && g.every((q) => !seen.has(q.id)));
  const picked = [];
  let count = 0;
  for (const g of shuffle(fresh, rng)) {
    if (picked.length === 4) break;
    if (count + g.length > 30) continue;
    picked.push(g);
    count += g.length;
  }
  if (picked.length < 3) return null;
  return {
    title: 'Reading Comprehension', kind: 'RC', timeLimitMinutes: 35,
    questions: picked.flatMap((g) => [...g].sort((x, y) => x.number - y.number)),
  };
}

/**
 * Build a stamina session for `level`. Each section is a whole real section you haven't touched
 * if one is left; otherwise it's assembled from questions you've never seen (LR in a real
 * section's difficulty mix, RC as four whole unread passages), so a repeated level is always new.
 * Falls back to the least-seen real section only if the bank runs out.
 */
export function createStaminaSession(level, tests, attempts, sessions = {}, rng = Math.random) {
  const spec = STAMINA_LEVELS[level - 1];
  const seen = seenIds({ attempts, sessions });
  const live = tests.filter((t) => !t.retired && t.purpose !== 'diagnostic');
  const questions = flatQuestions(live);
  const real = live.filter((t) => t.sections.length >= 3)
    .flatMap((t) => t.sections.filter((s) => s.timeLimitMinutes >= 35 && s.questions.length >= 22)
      .map((s) => ({ s, fresh: s.questions.filter((q) => !seen.has(q.id)).length / s.questions.length })));
  const used = new Set();
  const picked = [];
  for (const kind of spec.kinds()) {
    const untouched = shuffle(real.filter((x) => x.s.kind === kind && x.fresh === 1 && !used.has(x.s)), rng)[0];
    let section = untouched?.s
      || (kind === 'LR' ? freshLRSection(questions, seen, rng) : freshRCSection(questions, seen, rng));
    if (!section) section = shuffle(real.filter((x) => x.s.kind === kind && !used.has(x.s)), rng).sort((a, b) => b.fresh - a.fresh)[0]?.s;
    if (!section) continue;
    used.add(section);
    section.questions.forEach((q) => seen.add(q.id));
    picked.push(section);
  }
  if (!picked.length) return null;
  const session = createSectionsSession(picked, {
    kind: 'stamina',
    title: `Stamina ${level}: ${spec.title}`,
    breakAfterSection: picked.length >= 4 ? spec.breakAfter : null,
  });
  return { ...session, stamina: { level } };
}

/** Stamina sessions that were started but never scored (left during the test or blind review). */
export function unfinishedStamina(sessions) {
  return Object.values(sessions).filter((s) => s.kind === 'stamina' && s.phase !== 'done')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
