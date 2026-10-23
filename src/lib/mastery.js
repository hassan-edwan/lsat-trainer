// Skill model, score prediction, and the mastery path that keeps training a
// skill after the diagnostic.
//
// Every answer to a question that trains a skill (diagnostic ladders, drills,
// practice tests) is evidence. Each skill gets two ability estimates on a
// one-parameter logistic (Rasch) scale, where difficulty level d has
// difficulty d − 3:
//   - timed: was the first, timed answer right? This is what scores.
//   - understanding: was the answer right after blind review? A miss you fix
//     in blind review is an execution slip (misread, rushed), not a skill gap.
//     A miss that survives blind review is a genuine gap.
// Skills with little data are pulled toward your overall ability for that
// section type, so one misread doesn't sink a skill.

import { LADDERS, ladderOf } from './diagnostic.js';
import { QUESTION_TYPES } from './taxonomy.js';
import { groupBy, prioritize, shuffle } from './analytics.js';

export const LEVELS = [1, 2, 3, 4, 5];
const B = { 1: -2, 2: -1, 3: 0, 4: 1, 5: 2 };
// Rough share of each difficulty level on a recent test.
const TEST_MIX = { 1: 0.15, 2: 0.25, 3: 0.3, 4: 0.2, 5: 0.1 };
// Scored questions on the current LSAT: two LR sections and one RC section.
const SCORED = { LR: 50, RC: 27 };
const DAY_MS = 86_400_000;
const HALF_LIFE_DAYS = 60;
const SKILL_SD = 0.9; // how far one skill can sit from your overall ability, a priori
const GLOBAL_SD = 1.5;
export const EXECUTION_TRAPS = ['Misread the stem', 'Misread the stimulus', 'Ran out of time / rushed'];

// Approximate percent-correct to scaled-score curve from PrepTests 140–159.
const CURVE = [[0, 120], [0.18, 130], [0.27, 140], [0.35, 145], [0.44, 150], [0.53, 155], [0.63, 160], [0.73, 165], [0.82, 170], [0.9, 175], [0.98, 180], [1, 180]];

// Which skill a question type draws on, for the score prediction.
const TYPE_SKILL = {
  'flaw': ['flaw'], 'parallel-flaw': ['parallel', 'flaw'], 'necessary-assumption': ['necessary-assumption'],
  'sufficient-assumption': ['sufficient-assumption'], 'strengthen': ['strengthen'], 'weaken': ['weaken'],
  'most-strongly-supported': ['inference'], 'must-be-true': ['inference'], 'must-be-false': ['inference'],
  'explain': ['explain'], 'principle-strengthen': ['principle', 'strengthen'], 'principle-apply': ['principle'],
  'parallel': ['parallel'], 'method': ['structure'], 'role': ['structure'], 'main-conclusion': ['structure'],
  'point-at-issue': ['debate'], 'evaluate': ['evaluate'],
  'rc-main-point': ['rc-big-picture'], 'rc-structure': ['rc-big-picture'], 'rc-detail': ['rc-detail'],
  'rc-inference': ['rc-inference'], 'rc-analogy': ['rc-inference'], 'rc-author-attitude': ['rc-author'],
  'rc-function': ['rc-author'], 'rc-meaning': ['rc-author'],
};

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** Ladder ids a question trains (a question can train more than one, e.g. Flaw + Conditional). */
export function skillsOf(question, kind = question.kind) {
  const own = ladderOf(question);
  return LADDERS.filter((l) => l.kind === kind && (own === l.id
    || question.types?.some((t) => (l.drill.types || []).includes(t))
    || (question.tags || []).some((t) => (l.drill.skills || []).includes(t)))).map((l) => l.id);
}

/**
 * How an answer counts as evidence.
 * correct: right under time. execution: wrong under time, fixed in blind review.
 * genuine: still wrong after blind review. unreviewed: wrong, with no blind review to tell.
 * br-broke: right under time, changed to wrong in blind review.
 */
export function evidenceOf(a, reviewed) {
  const firstOk = a.first === a.answer;
  const brOk = (a.br ?? a.first) === a.answer;
  if (firstOk) return brOk || !reviewed ? 'correct' : 'br-broke';
  if (!reviewed) return 'unreviewed';
  return brOk ? 'execution' : 'genuine';
}
const UNDERSTOOD = { correct: 1, execution: 1, 'br-broke': 0.5, genuine: 0, unreviewed: 0 };

/** MAP estimate of ability from weighted responses [{ b, y, w }] with a normal prior. */
export function estimateTheta(items, mu = 0, sd = 1) {
  let theta = mu;
  let hess = -1 / (sd * sd);
  for (let it = 0; it < 30; it++) {
    let grad = -(theta - mu) / (sd * sd);
    hess = -1 / (sd * sd);
    for (const { b, y, w } of items) {
      const p = sigmoid(theta - b);
      grad += w * (y - p);
      hess -= w * p * (1 - p);
    }
    const stepSize = grad / hess;
    theta -= Math.max(-1, Math.min(1, stepSize));
    if (Math.abs(stepSize) < 1e-6) break;
  }
  return { theta, se: 1 / Math.sqrt(-hess) };
}

/** Level on the 1–5 scale where your chance of getting a question right is 50%. */
export const thetaToLevel = (theta) => Math.max(0.5, Math.min(5.5, theta + 3));

/**
 * Evidence for every answer, with how much it counts: recent answers count
 * more, and a repeat of a question you've seen counts less.
 */
export function evidenceRows({ attempts, index, sessions = {}, now = Date.now() }) {
  const seen = new Set();
  const sorted = [...attempts].sort((a, b) => (a.at < b.at ? -1 : 1));
  const rows = [];
  for (const a of sorted) {
    const entry = index[a.qid];
    if (!entry) continue;
    const q = entry.question;
    const kind = entry.section?.kind || a.kind;
    if (kind !== 'LR' && kind !== 'RC') continue;
    const reviewed = a.reviewed ?? sessions[a.sessionId]?.settings?.blindReview ?? true;
    const age = Math.max(0, (now - new Date(a.at).getTime()) / DAY_MS);
    const w = Math.pow(0.5, age / HALF_LIFE_DAYS) * (seen.has(a.qid) ? 0.5 : 1);
    seen.add(a.qid);
    rows.push({ a, q, kind, d: q.difficulty ?? 3, skills: skillsOf(q, kind), ev: evidenceOf(a, reviewed), w });
  }
  return rows;
}

/** Ability estimates for each section type and each skill. */
export function skillProfile({ attempts, index, sessions = {}, journal = {}, now = Date.now() }) {
  const rows = evidenceRows({ attempts, index, sessions, now });
  const fit = (rs, field, mu, sd) => estimateTheta(rs.map((r) => ({
    b: B[r.d] ?? 0, w: r.w, y: field === 'timed' ? (r.ev === 'correct' || r.ev === 'br-broke' ? 1 : 0) : UNDERSTOOD[r.ev],
  })), mu, sd);

  const global = {};
  for (const kind of ['LR', 'RC']) {
    const rs = rows.filter((r) => r.kind === kind);
    global[kind] = { n: rs.length, timed: fit(rs, 'timed', 0, GLOBAL_SD), understanding: fit(rs, 'understanding', 0, GLOBAL_SD) };
  }

  const skills = LADDERS.map((l) => {
    const rs = rows.filter((r) => r.skills.includes(l.id));
    const g = global[l.kind];
    const timed = fit(rs, 'timed', g.timed.theta, SKILL_SD);
    const understanding = fit(rs, 'understanding', g.understanding.theta, SKILL_SD);
    const counts = { correct: 0, execution: 0, genuine: 0, unreviewed: 0, 'br-broke': 0 };
    for (const r of rs) counts[r.ev] += 1;
    const traps = {};
    for (const r of rs) {
      if (r.ev === 'correct') continue;
      for (const t of journal[r.a.qid]?.traps || []) if (EXECUTION_TRAPS.includes(t)) traps[t] = (traps[t] || 0) + 1;
    }
    const level = thetaToLevel(understanding.theta);
    const timedLevel = thetaToLevel(timed.theta);
    const gap = understanding.theta - timed.theta;
    let diagnosis;
    if (rs.length < 3) diagnosis = 'no-data';
    else if (level < 3 || understanding.theta < g.understanding.theta - 0.5) diagnosis = 'gap';
    else if (gap >= 0.6 && counts.execution >= 2) diagnosis = 'execution';
    else if (timedLevel >= 4.5) diagnosis = 'strong';
    else diagnosis = 'solid';
    return { ...l, n: rs.length, counts, traps, timed, understanding, level, timedLevel, diagnosis };
  });
  return { global, skills, rows };
}

/** Percent correct → scaled score (unrounded). */
export function scoreFromPct(pct) {
  const p = Math.max(0, Math.min(1, pct));
  for (let i = 1; i < CURVE.length; i++) {
    const [x1, y1] = CURVE[i];
    const [x0, y0] = CURVE[i - 1];
    if (p <= x1) return y0 + ((p - x0) / (x1 - x0 || 1)) * (y1 - y0);
  }
  return 180;
}

/** Expected share correct on a test-day mix of difficulties at ability theta. */
export const expectedAccuracy = (theta) => LEVELS.reduce((t, d) => t + TEST_MIX[d] * sigmoid(theta - B[d]), 0);

function sectionAccuracy(profile, kind, field, bump = {}, shift = 0) {
  const byId = Object.fromEntries(profile.skills.map((s) => [s.id, s]));
  const g = profile.global[kind][field].theta;
  let total = 0;
  let acc = 0;
  for (const [type, meta] of Object.entries(QUESTION_TYPES)) {
    if (meta.kind !== kind) continue;
    const ids = (TYPE_SKILL[type] || []).filter((id) => byId[id]);
    const thetas = ids.length ? ids.map((id) => byId[id][field].theta + (bump[id] || 0)) : [g];
    const theta = thetas.reduce((a, b) => a + b, 0) / thetas.length + shift;
    total += meta.weight;
    acc += meta.weight * expectedAccuracy(theta);
  }
  return acc / total;
}

/**
 * Predicted scaled score. `field` is 'timed' (what you'd score today) or
 * 'understanding' (if every miss you fix in blind review were right).
 * low/high shift every skill by one standard error of your overall ability.
 */
export function predictScore(profile, { field = 'timed', bump = {} } = {}) {
  const at = (shift) => {
    const lr = sectionAccuracy(profile, 'LR', field, bump, shift);
    const rc = sectionAccuracy(profile, 'RC', field, bump, shift);
    return (SCORED.LR * lr + SCORED.RC * rc) / (SCORED.LR + SCORED.RC);
  };
  const se = Math.max(0.2, Math.sqrt((SCORED.LR * profile.global.LR[field].se ** 2 + SCORED.RC * profile.global.RC[field].se ** 2) / (SCORED.LR + SCORED.RC)));
  const pct = at(0);
  return {
    pct, exact: scoreFromPct(pct), score: Math.round(scoreFromPct(pct)),
    low: Math.round(scoreFromPct(at(-se))), high: Math.round(scoreFromPct(at(se))),
    n: profile.global.LR.n + profile.global.RC.n,
  };
}

/** Skills ranked by how many scaled points one level of improvement is worth. */
export function priorities(profile) {
  const base = predictScore(profile).exact;
  return profile.skills
    .map((s) => ({ ...s, gain: TYPE_SKILL_IDS.has(s.id) ? predictScore(profile, { bump: { [s.id]: 1 } }).exact - base : null }))
    .sort((a, b) => rank(b) - rank(a));
}
const TYPE_SKILL_IDS = new Set(Object.values(TYPE_SKILL).flat());
// Genuine gaps first, then execution problems, then skills without data; by points available within each.
const TIER = { gap: 4, execution: 3, 'no-data': 2, solid: 1, strong: 0 };
const rank = (s) => TIER[s.diagnosis] * 100 + (s.gain ?? 0.5);

export const DIAGNOSIS = {
  gap: { label: 'Skill gap', tip: 'You miss these even after blind review. Learn the method, then train level by level.' },
  execution: { label: 'Execution', tip: 'You get these right in blind review but miss them under time: misreads and rushing. Read the stem first, and slow down on the conclusion.' },
  solid: { label: 'Solid', tip: 'Keep it sharp with harder questions.' },
  strong: { label: 'Strong', tip: 'You get even hard questions right under time.' },
  'no-data': { label: 'Not enough data', tip: 'Take this skill\'s ladder or a training set.' },
};

// ---- mastery path ----------------------------------------------------------

const MASTERY_WINDOW = 4;

/** Questions that train a skill, excluding the diagnostic ladders (kept fresh for retests). */
export function trainingPool(skillId, questions) {
  const l = LADDERS.find((x) => x.id === skillId);
  return questions.filter((q) => q.purpose !== 'diagnostic' && skillsOf(q, q.kind).includes(skillId) && q.kind === l.kind);
}

/**
 * Mastery status at each level of a skill. A level is mastered when, of your
 * last four answers at that level, at least three were right under time and
 * none was still wrong after blind review. Levels below where your timed
 * ability says you'd get about 70% right are placed out.
 */
export function masteryTrack(skill, rows, pool) {
  const mine = rows.filter((r) => r.skills.includes(skill.id));
  const placement = skill.n >= 3 ? Math.max(1, Math.min(5, Math.round(skill.timed.theta + 3 - 0.85))) : 1;
  const levels = LEVELS.map((level) => {
    const recent = mine.filter((r) => r.d === level).slice(-MASTERY_WINDOW);
    const right = recent.filter((r) => r.ev === 'correct' || r.ev === 'br-broke').length;
    const genuine = recent.filter((r) => r.ev === 'genuine' || r.ev === 'unreviewed').length;
    const available = pool.filter((q) => (q.difficulty ?? 3) === level).length;
    let status;
    if (recent.length >= 3 && right >= Math.ceil(0.75 * recent.length) && genuine === 0) status = 'mastered';
    else if (level < placement) status = 'placed';
    else if (!available && !recent.length) status = 'none';
    else status = recent.length ? 'working' : 'new';
    return { level, status, recent: recent.length, right, genuine, available };
  });
  let through = 0;
  for (const x of levels) {
    if (x.status === 'mastered' || x.status === 'placed' || x.status === 'none') through = x.level; else break;
  }
  const next = levels.find((x) => x.level > through && x.status !== 'none');
  return { levels, through, next: next?.level ?? null, complete: !next };
}

/**
 * A training set for one skill at one level: due journal misses first, then
 * mostly questions at the level, one from the level below to keep it solid,
 * and a couple from the level above as a stretch.
 */
export function trainingSet(skillId, level, { questions, attempts, journal = {}, count = 8, rng = Math.random }) {
  const pool = trainingPool(skillId, questions);
  const attemptsByQid = groupBy(attempts, (a) => a.qid);
  const used = new Set();
  const picked = [];
  const take = (cands, n) => {
    for (const q of prioritize(cands, { attemptsByQid, journal, rng })) {
      if (n <= 0) break;
      if (used.has(q.id)) continue;
      used.add(q.id);
      picked.push(q);
      n -= 1;
    }
    return n;
  };
  const at = (d) => pool.filter((q) => (q.difficulty ?? 3) === d);
  const misses = pool.filter((q) => journal[q.id] && journal[q.id].status !== 'mastered' && (q.difficulty ?? 3) <= level + 1);
  take(misses, 2);
  const stretch = level < 5 ? 2 : 0;
  const review = level > 1 ? 1 : 0;
  let left = take(at(level), count - picked.length - stretch - review);
  left += take(at(level + 1), stretch) + take(at(level - 1), review);
  // Not enough at this level: widen to the nearest levels.
  for (const d of [level + 1, level - 1, level + 2, level - 2]) if (left > 0 && d >= 1 && d <= 5) left = take(at(d), left);
  // Keep RC passage questions together, LR shuffled.
  const rc = picked.filter((q) => q.passageId).sort((a, b) => (a.passageId < b.passageId ? -1 : a.passageId > b.passageId ? 1 : a.number - b.number));
  return [...shuffle(picked.filter((q) => !q.passageId), rng), ...rc];
}
