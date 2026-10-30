// Stamina: how accuracy and pace hold up over a long sitting, and a ladder of
// longer and longer sessions to build it.

import { shuffle } from './analytics.js';
import { QUESTION_TYPES } from './taxonomy.js';
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
  { level: 4, title: 'Test day', kinds: () => shuffle(['LR', 'LR', 'RC', 'any']), breakAfter: 1,
    detail: 'Four sections with the 10-minute break after section 2, exactly like the real test.' },
  { level: 5, title: 'Overtime', kinds: () => [...shuffle(['LR', 'LR', 'RC', 'any']), 'LR'], breakAfter: 1,
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

const MAX_BLANK = 0.1; // more blanks than this is a pacing problem, and the level isn't passed
const READ_TARGET_SEC = 210; // about 3.5 minutes to read an RC passage at test pace

/**
 * Difficulty-adjusted stamina report for one session. `fade` is the change in
 * (actual − expected) accuracy, in points, from the first 60% of the answered questions
 * (in the order they were taken) to the last 40%. Negative = you faded. Blanks are left out
 * of the fade and counted in `blank`: running out of time is a pacing problem, and counting
 * blanks as late misses would read slow reading as fading focus.
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
  const answered = rows.filter((r) => r.answered);
  const cut = Math.round(answered.length * 0.6);
  const early = answered.slice(0, cut);
  const late = answered.slice(cut);
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
      readSec: (() => {
        const reads = Object.entries(session.reading || {}).filter(([k, v]) => k.startsWith(`${si}:`) && v.ms > 30_000);
        return reads.length ? Math.round(reads.reduce((t, [, v]) => t + v.ms, 0) / reads.length / 1000) : null;
      })(),
      readTargetSec: sec.kind === 'RC' ? READ_TARGET_SEC : null,
    };
  });
  const fade = answered.length >= 10 ? pts(mean(late.map((r) => r.resid)) - mean(early.map((r) => r.resid))) : null;
  const blank = rows.length - answered.length;
  // A rushed or mostly blank session says nothing about stamina, so it can't pass a level.
  const limit = session.sections.reduce((t, s) => t + (s.timeLimitSec || 0), 0);
  const used = session.sections.reduce((t, s) => t + (s.elapsedSec || 0), 0);
  const counts = answered.length >= MIN_ANSWERED * rows.length && (!limit || used >= 0.4 * limit);
  const paced = blank <= MAX_BLANK * rows.length;
  return {
    fade, blank, paced, early: pts(mean(early.map((r) => r.resid))), late: pts(mean(late.map((r) => r.resid))), sections, counts,
    passed: counts && paced && fade != null && fade >= PASS_FADE,
  };
}

export function verdict(report) {
  if (!report) return '';
  if (!report.counts) return 'This session doesn\'t count toward the ladder: answer at least 75% of the questions and use at least 40% of the time, as you would on test day.';
  const f = report.fade;
  const pace = report.paced ? '' : ` You left ${report.blank} blank, though: that's pacing, not stamina, and a level isn't passed with more than 10% blank.`;
  const slowRead = report.sections.find((x) => x.readSec && x.readSec > x.readTargetSec * 1.15);
  const read = !report.paced && slowRead ? ` Your RC reading averaged ${Math.floor(slowRead.readSec / 60)}:${String(slowRead.readSec % 60).padStart(2, '0')} a passage against a 3:30 target.` : '';
  return fadeText(f) + pace + read;
}

function fadeText(f) {
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
    x.last = { fade: report.fade, blank: report.blank, paced: report.paced, counts: report.counts, passed: report.passed, at: session.finishedAt };
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

/** How many of each LR question type a 25-question section has, from how often each appears on the LSAT. */
function typeQuotas(n = 25) {
  const types = Object.entries(QUESTION_TYPES).filter(([t, m]) => m.kind === 'LR' && t !== 'lr-other');
  const total = types.reduce((t, [, m]) => t + m.weight, 0);
  const raw = types.map(([t, m]) => ({ t, x: (m.weight / total) * n }));
  const out = Object.fromEntries(raw.map((r) => [r.t, Math.floor(r.x)]));
  let left = n - Object.values(out).reduce((a, b) => a + b, 0);
  for (const r of [...raw].sort((a, b) => (b.x % 1) - (a.x % 1))) { if (left <= 0) break; out[r.t] += 1; left -= 1; }
  return out;
}

/**
 * A 25-question LR section of questions you've never seen, shaped like a real one: question
 * types in their usual test proportions (about 4 flaw, 2 each of the assumption, strengthen and
 * weaken types, and so on) and a real section's difficulty mix, easiest first.
 */
function freshLRSection(questions, seen, rng) {
  const pool = shuffle(questions.filter((q) => q.kind === 'LR' && !seen.has(q.id)), rng);
  const picked = [];
  const used = new Set();
  const diffLeft = { ...LR_MIX };
  const take = (q) => { used.add(q.id); picked.push(q); const d = q.difficulty ?? 3; if (diffLeft[d] > 0) diffLeft[d] -= 1; };
  // Prefer a question whose difficulty still has room in the mix.
  const best = (cands) => cands.find((q) => !used.has(q.id) && diffLeft[q.difficulty ?? 3] > 0) || cands.find((q) => !used.has(q.id));
  const quotas = Object.entries(typeQuotas()).sort((a, b) => b[1] - a[1]);
  for (const [t, k] of quotas) {
    const cands = pool.filter((q) => q.types?.[0] === t);
    for (let i = 0; i < k; i++) { const q = best(cands); if (q) take(q); }
  }
  // Types the bank ran out of are filled from whatever fits the difficulty mix.
  while (picked.length < 25) { const q = best(pool); if (!q) break; take(q); }
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
  if (picked.length < 4) return null;
  return {
    title: 'Reading Comprehension', kind: 'RC', timeLimitMinutes: 35,
    questions: picked.flatMap((g) => [...g].sort((x, y) => x.number - y.number)),
  };
}

/** How many more fresh sections the bank can build: { LR, RC }, counting only questions you've never seen. */
export function staminaSupply(tests, attempts, sessions = {}) {
  const seen = seenIds({ attempts, sessions });
  const questions = flatQuestions(tests.filter((t) => !t.retired && t.purpose !== 'diagnostic'));
  const passages = {};
  for (const q of questions) if (q.kind === 'RC' && q.passageId) (passages[`${q.testId}:${q.passageId}`] ||= []).push(q);
  const freshPassages = Object.values(passages).filter((g) => g.length >= 4 && g.every((q) => !seen.has(q.id))).length;
  return {
    LR: Math.floor(questions.filter((q) => q.kind === 'LR' && !seen.has(q.id)).length / 25),
    RC: Math.floor(freshPassages / 4),
    passages: freshPassages,
  };
}

/**
 * Build a stamina session for `level`, every question new to you: no question you've answered,
 * been shown, or have waiting in an unfinished session, and no passage you've read any of. Each
 * section is a whole real section you haven't touched if one is left; otherwise it's assembled from
 * questions you've never seen (LR in a real section's type and difficulty mix, RC as whole unread
 * passages). Nothing is ever reused: if the bank can't fill a section, this returns
 * { outOf: ['RC'] } (or 'LR') instead of a session.
 */
export function createStaminaSession(level, tests, attempts, sessions = {}, rng = Math.random) {
  const spec = STAMINA_LEVELS[level - 1];
  const seen = seenIds({ attempts, sessions });
  const live = tests.filter((t) => !t.retired && t.purpose !== 'diagnostic');
  const questions = flatQuestions(live);
  const real = live.filter((t) => t.sections.length >= 3)
    .flatMap((t) => t.sections.filter((s) => s.timeLimitMinutes >= 35 && s.questions.length >= 22));
  const used = new Set();
  const picked = [];
  const outOf = new Set();
  const build = (kind) => {
    const untouched = shuffle(real.filter((s) => s.kind === kind && !used.has(s) && s.questions.every((q) => !seen.has(q.id))), rng)[0];
    return untouched || (kind === 'LR' ? freshLRSection(questions, seen, rng) : freshRCSection(questions, seen, rng));
  };
  for (const want of spec.kinds()) {
    // Test day's fourth section can be either kind; it's LR when no fresh reading is left.
    let section = null;
    if (want === 'any') section = rng() < 0.5 ? build('RC') || build('LR') : build('LR') || build('RC');
    else section = build(want);
    if (!section) { outOf.add(want === 'any' ? 'LR' : want); continue; }
    used.add(section);
    section.questions.forEach((q) => seen.add(q.id));
    picked.push(section);
  }
  if (outOf.size) return { outOf: [...outOf] };
  const session = createSectionsSession(picked, {
    kind: 'stamina',
    title: `Stamina ${level}: ${spec.title}`,
    breakAfterSection: picked.length >= 4 ? spec.breakAfter : null,
  });
  return { ...session, stamina: { level } };
}

/** Fresh sections a level needs: { LR, RC } (Test day's either-kind section counts as LR, its fallback). */
export function staminaNeeds(level) {
  const kinds = STAMINA_LEVELS[level - 1].kinds();
  return { LR: kinds.filter((k) => k !== 'RC').length, RC: kinds.filter((k) => k === 'RC').length };
}

/** Why a stamina level can't be built, in words. */
export function outOfText(outOf) {
  const what = outOf.map((k) => (k === 'RC' ? 'unread reading passages' : 'new LR questions')).join(' or ');
  return `There aren't enough ${what} left for a completely new session at this level, and stamina sessions never reuse questions. Add more questions to the bank, or train a level that fits what's left.`;
}

/** Stamina sessions that were started but never scored (left during the test or blind review). */
export function unfinishedStamina(sessions) {
  return Object.values(sessions).filter((s) => s.kind === 'stamina' && s.phase !== 'done')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
