// Stamina: how accuracy and pace hold up over a long sitting, and a ladder of
// longer and longer sessions to build it.

import { shuffle } from './analytics.js';
import { createSectionsSession } from './session.js';

// Accuracy a typical student gets at each difficulty, used until there is enough of the user's own history.
const PRIOR = { 1: 0.9, 2: 0.82, 3: 0.7, 4: 0.55, 5: 0.4 };
const PRIOR_WEIGHT = 5;
const PASS_FADE = -6; // points; a late drop no worse than this passes a level

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
      secPerQuestion: Math.round(mean(rs.map((r) => r.timeMs)) / 1000),
      targetSec: sec.timeLimitSec ? Math.round(sec.timeLimitSec / sec.qids.length) : null,
      unanswered: rs.filter((r) => !r.answered).length,
    };
  });
  const fade = pts(mean(late.map((r) => r.resid)) - mean(early.map((r) => r.resid)));
  // A rushed or mostly blank session says nothing about stamina, so it can't pass a level.
  const limit = session.sections.reduce((t, s) => t + (s.timeLimitSec || 0), 0);
  const used = session.sections.reduce((t, s) => t + (s.elapsedSec || 0), 0);
  const counts = rows.filter((r) => r.answered).length >= 0.9 * rows.length && (!limit || used >= 0.4 * limit);
  return { fade, early: pts(mean(early.map((r) => r.resid))), late: pts(mean(late.map((r) => r.resid))), sections, counts, passed: counts && fade >= PASS_FADE };
}

export function verdict(report) {
  if (!report) return '';
  if (!report.counts) return 'This session doesn\'t count toward the ladder: answer at least 90% of the questions and use at least 40% of the time, as you would on test day.';
  const f = report.fade;
  if (f >= 3) return 'You got stronger as the session went on. Your stamina is not the limiting factor here.';
  if (f >= PASS_FADE) return 'You held steady: your late accuracy stayed close to your early accuracy after adjusting for difficulty.';
  if (f >= -12) return 'You faded late. Your accuracy in the last stretch dropped more than the harder questions explain.';
  return 'You faded sharply late. Build up with shorter back-to-back sessions before going longer.';
}

/** Long sessions (stamina ladder or full tests) with their reports, newest first. */
export function staminaHistory(sessions, attempts, index) {
  return Object.values(sessions)
    .filter((s) => s.phase === 'done' && (s.kind === 'stamina' || (s.kind === 'pt' && s.sections.length >= 2)))
    .sort((a, b) => (b.finishedAt || '').localeCompare(a.finishedAt || ''))
    .map((s) => ({ session: s, report: staminaReport(s, index, expectedByDifficulty(attempts, index, s.id)) }))
    .filter((x) => x.report);
}

/** The next level to train: one above the highest level passed. Full tests count as level 4. */
export function currentLevel(history) {
  let best = 0;
  for (const { session, report } of history) {
    const lvl = session.stamina?.level ?? (session.kind === 'pt' && session.sections.length >= 4 ? 4 : session.sections.length >= 3 ? 3 : 2);
    if (report.passed) best = Math.max(best, lvl);
  }
  return Math.min(5, best + 1);
}

/** Build a stamina session for `level` from the library, preferring sections not seen before. */
export function createStaminaSession(level, tests, attempts) {
  const spec = STAMINA_LEVELS[level - 1];
  const seen = new Set(attempts.map((a) => a.qid));
  const pool = tests
    .filter((t) => !t.retired && t.purpose !== 'diagnostic' && t.sections.length >= 3)
    .flatMap((t) => t.sections.filter((s) => s.timeLimitMinutes >= 35 && s.questions.length >= 22).map((s) => ({ s, fresh: s.questions.filter((q) => !seen.has(q.id)).length / s.questions.length })));
  const used = new Set();
  const picked = [];
  for (const kind of spec.kinds()) {
    const options = shuffle(pool.filter((x) => x.s.kind === kind && !used.has(x.s))).sort((a, b) => b.fresh - a.fresh);
    if (!options.length) continue;
    used.add(options[0].s);
    picked.push(options[0].s);
  }
  if (!picked.length) return null;
  const session = createSectionsSession(picked, {
    kind: 'stamina',
    title: `Stamina ${level}: ${spec.title}`,
    breakAfterSection: picked.length >= 4 ? spec.breakAfter : null,
  });
  return { ...session, stamina: { level } };
}
