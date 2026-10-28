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
import { shuffle } from './analytics.js';
import { passageKey, passageMap, wholePassages } from './passages.js';

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

// A question answered again sooner than this is remembered, not re-solved.
export const RECENT_DAYS = 14;
// A skill you haven't practiced for this many answers or days is due a check-in.
export const STALE_ANSWERS = 100;
export const STALE_DAYS = 10;

/**
 * Evidence for every answer, with how much it counts: recent answers count
 * more, and a repeat of a question you've seen counts less. `fresh` is false
 * for a repeat within RECENT_DAYS of the last attempt at that question.
 */
export function evidenceRows({ attempts, index, sessions = {}, now = Date.now() }) {
  const seen = new Set();
  const lastAt = new Map();
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
    const prev = lastAt.get(a.qid);
    const fresh = prev == null || new Date(a.at) - prev >= RECENT_DAYS * DAY_MS;
    seen.add(a.qid);
    lastAt.set(a.qid, new Date(a.at).getTime());
    rows.push({ a, q, kind, d: q.difficulty ?? 3, skills: skillsOf(q, kind), ev: evidenceOf(a, reviewed), w, fresh });
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
    // How long since you last practiced it, in answers and days.
    let lastIdx = -1;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].skills.includes(l.id)) { lastIdx = i; break; }
    const lastAt = lastIdx >= 0 ? rows[lastIdx].a.at : null;
    const answersSince = lastIdx >= 0 ? rows.length - 1 - lastIdx : null;
    const daysSince = lastAt ? (now - new Date(lastAt).getTime()) / DAY_MS : null;
    const stale = rs.length >= 3 && (answersSince >= STALE_ANSWERS || daysSince >= STALE_DAYS);
    return { ...l, n: rs.length, counts, traps, timed, understanding, level, timedLevel, diagnosis, lastAt, answersSince, daysSince, stale };
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
 * none was still wrong after blind review. Only fresh answers count: a
 * question repeated within two weeks is remembered, not re-solved. Levels
 * below where your timed ability says you'd get about 70% right are placed out.
 * `unseen` counts the level's questions you haven't answered in two weeks.
 */
export function masteryTrack(skill, rows, pool, now = Date.now()) {
  const all = rows.filter((r) => r.skills.includes(skill.id));
  const mine = all.filter((r) => r.fresh);
  const recentIds = new Set(all.filter((r) => now - new Date(r.a.at).getTime() < RECENT_DAYS * DAY_MS).map((r) => r.a.qid));
  const placement = skill.n >= 3 ? Math.max(1, Math.min(5, Math.round(skill.timed.theta + 3 - 0.85))) : 1;
  const levels = LEVELS.map((level) => {
    const recent = mine.filter((r) => r.d === level).slice(-MASTERY_WINDOW);
    const right = recent.filter((r) => r.ev === 'correct' || r.ev === 'br-broke').length;
    const genuine = recent.filter((r) => r.ev === 'genuine' || r.ev === 'unreviewed').length;
    const atLevel = pool.filter((q) => (q.difficulty ?? 3) === level);
    const available = atLevel.length;
    const unseen = atLevel.filter((q) => !recentIds.has(q.id)).length;
    let status;
    if (recent.length >= 3 && right >= Math.ceil(0.75 * recent.length) && genuine === 0) status = 'mastered';
    else if (level < placement) status = 'placed';
    else if (!available && !recent.length) status = 'none';
    else status = recent.length ? 'working' : 'new';
    return { level, status, recent: recent.length, right, genuine, available, unseen };
  });
  let through = 0;
  for (const x of levels) {
    if (x.status === 'mastered' || x.status === 'placed' || x.status === 'none') through = x.level; else break;
  }
  const next = levels.find((x) => x.level > through && x.status !== 'none');
  return { levels, through, next: next?.level ?? null, complete: !next };
}

/**
 * Questions a closed training set showed you without your answering them,
 * as { qid, at } entries, so new sets treat them as seen.
 */
export function shownEntries(sessions) {
  return Object.values(sessions)
    .filter((s) => s.phase === 'done' && s.shownQids)
    .flatMap((s) => s.shownQids.map((qid) => ({ qid, at: s.finishedAt })));
}

/**
 * A training set for one skill at one level: mostly questions at the level,
 * one from the level below to keep it solid, and a couple from the level
 * above as a stretch. Only questions you've never answered (and that aren't
 * sitting in an unfinished set, `pending`) are used, widening to nearby levels
 * when a level runs out. Only once every nearby question has been answered
 * does it fall back to the ones you answered longest ago (never within
 * RECENT_DAYS). Journal misses aren't mixed in: they come back in the daily
 * mistake review on their own schedule.
 */
export function trainingSet(skillId, level, { questions, attempts, pending = [], count = 8, now = Date.now(), rng = Math.random }) {
  const pool = trainingPool(skillId, questions);
  const lastAt = new Map();
  for (const a of attempts) {
    const t = new Date(a.at).getTime();
    if (!(lastAt.get(a.qid) >= t)) lastAt.set(a.qid, t);
  }
  const held = new Set(pending);
  if (pool.some((q) => q.passageId)) return passageTrainingSet(pool, level, { questions, lastAt, held, count, now });
  const never = pool.filter((q) => !lastAt.has(q.id) && !held.has(q.id));
  const old = pool.filter((q) => lastAt.has(q.id) && !held.has(q.id) && now - lastAt.get(q.id) >= RECENT_DAYS * DAY_MS)
    .sort((a, b) => lastAt.get(a.id) - lastAt.get(b.id));
  const used = new Set();
  const picked = [];
  const take = (cands, n) => {
    for (const q of cands) {
      if (n <= 0) break;
      if (used.has(q.id)) continue;
      used.add(q.id);
      picked.push(q);
      n -= 1;
    }
    return n;
  };
  const near = [level + 1, level - 1, level + 2, level - 2].filter((d) => d >= 1 && d <= 5);
  const fill = (cands, n, ordered) => {
    const at = (d) => {
      const xs = cands.filter((q) => (q.difficulty ?? 3) === d);
      return ordered ? xs : shuffle(xs, rng);
    };
    if (n <= 0) return 0;
    const stretch = level < 5 ? Math.min(2, n) : 0;
    const review = level > 1 && n > stretch + 1 ? 1 : 0;
    let left = take(at(level), n - stretch - review);
    left += take(at(level + 1), stretch) + take(at(level - 1), review);
    for (const d of near) if (left > 0) left = take(at(d), left);
    return left;
  };
  const left = fill(never, count, false);
  fill(old, left, true);
  // Keep RC passage questions together, LR shuffled.
  const rc = picked.filter((q) => q.passageId).sort((a, b) => (a.passageId < b.passageId ? -1 : a.passageId > b.passageId ? 1 : a.number - b.number));
  return [...shuffle(picked.filter((q) => !q.passageId), rng), ...rc];
}

/**
 * Reading training: one whole passage with all its questions (more only if the set is long),
 * chosen for the most questions of the skill near the level. Passages you've never seen any of
 * come first; once those run out, passages whose every question you last answered at least
 * RECENT_DAYS ago, oldest first. A passage with a question in an unfinished set is skipped.
 */
function passageTrainingSet(pool, level, { questions, lastAt, held, count, now }) {
  const near = (q) => Math.abs((q.difficulty ?? 3) - level) + ((q.difficulty ?? 3) < level ? 0.5 : 0);
  const cands = [...pool].sort((a, b) => near(a) - near(b));
  const neverSeen = (qs) => qs.every((q) => !lastAt.has(q.id) && !held.has(q.id));
  let { questions: out } = wholePassages(cands, questions, { count, ok: neverSeen });
  if (!out.length) {
    const lastOf = (qs) => Math.max(...qs.map((q) => lastAt.get(q.id) ?? 0));
    const oldEnough = (qs) => qs.every((q) => !held.has(q.id)) && now - lastOf(qs) >= RECENT_DAYS * DAY_MS;
    const map = passageMap(questions);
    const byAge = [...cands].sort((a, b) => lastOf(map.get(passageKey(a))) - lastOf(map.get(passageKey(b))));
    out = wholePassages(byAge, questions, { count, ok: oldEnough }).questions;
  }
  return out;
}

// ---- mixed sets -------------------------------------------------------------

/** Ids of every question you've answered, been shown in a closed set, or have in an unfinished one. */
export function seenIds({ attempts, sessions = {} }) {
  const ids = new Set(attempts.map((a) => a.qid));
  for (const s of Object.values(sessions)) {
    if (s.phase !== 'done') s.sections.forEach((sec) => sec.qids.forEach((id) => ids.add(id)));
    (s.shownQids || []).forEach((id) => ids.add(id));
  }
  return ids;
}

/** How many questions training a skill you've never seen, at level 3 and above. */
export function freshHardCount(skillId, questions, seen) {
  return trainingPool(skillId, questions).filter((q) => (q.difficulty ?? 3) >= 3 && !seen.has(q.id)).length;
}

/**
 * A short mixed set of questions you've never seen, mostly hard: about 60% from
 * your weak spots (genuine gaps first, then execution problems) at or above
 * each one's mastery level, and 40% variety, led by skills you haven't
 * practiced in a while. Reading comes as one whole passage (all its questions,
 * usually 5 to 8), never seen before, and at most one per set.
 */
export function mixedSet({ profile, tracks, questions, seen, count = 10, weakShare = 0.6, rng = Math.random }) {
  const ranked = priorities(profile);
  let weak = ranked.filter((s) => s.diagnosis === 'gap' || s.diagnosis === 'execution').slice(0, 3);
  if (!weak.length) weak = [...profile.skills].filter((s) => s.n >= 3).sort((a, b) => a.level - b.level).slice(0, 2);
  const weakIds = new Set(weak.map((s) => s.id));
  // Variety: skills overdue for a check-in first, then ones with little data, then the least recently practiced.
  const varietyRank = (x) => (x.stale ? 0 : x.n < 3 ? 1 : 2);
  const variety = profile.skills.filter((x) => !weakIds.has(x.id))
    .sort((a, b) => varietyRank(a) - varietyRank(b) || (a.lastAt || '').localeCompare(b.lastAt || ''));
  const used = new Set();
  const picked = [];
  const tag = new Map();
  const fresh = (q) => !seen.has(q.id) && !used.has(q.id);
  const add = (q, role) => { used.add(q.id); picked.push(q); tag.set(q.id, role); };
  // Reading comes as one whole passage you've never seen any of, at most one per set.
  const passages = passageMap(questions);
  let passageTaken = false;

  // One question for a skill, as hard as its level allows, never seen.
  const takeOne = (skill, role, room) => {
    const target = Math.max(3, tracks[skill.id]?.next ?? Math.round(skill.timedLevel) ?? 3);
    const reading = LADDERS.find((x) => x.id === skill.id)?.kind === 'RC';
    if (reading && (passageTaken || room < 4)) return 0;
    const pool = trainingPool(skill.id, questions).filter((q) => (reading ? passages.get(passageKey(q))?.every(fresh) : fresh(q)));
    const order = [target, target + 1, target - 1, target + 2, 5, 4, 3].filter((d, i, a) => d >= 3 && d <= 5 && a.indexOf(d) === i);
    let cands = [];
    for (const d of order) { cands = shuffle(pool.filter((q) => (q.difficulty ?? 3) === d), rng); if (cands.length) break; }
    if (!cands.length) cands = shuffle(pool, rng);
    const q = cands[0];
    if (!q) return 0;
    if (!q.passageId) { add(q, role); return 1; }
    const whole = passages.get(passageKey(q));
    whole.forEach((x) => add(x, role));
    passageTaken = true;
    return whole.length;
  };
  const fill = (skills, role, slots) => {
    let left = slots;
    let idle = 0;
    for (let i = 0; left > 0 && skills.length && idle < skills.length; i = (i + 1) % skills.length) {
      const got = takeOne(skills[i], role, left);
      if (got) { left -= got; idle = 0; } else idle += 1;
    }
    return left;
  };
  const nWeak = Math.round(count * weakShare);
  const weakLeft = fill(weak, 'weak', nWeak);
  const varLeft = fill(variety, 'variety', count - nWeak + weakLeft);
  if (varLeft > 0) fill(weak, 'weak', varLeft);
  const lr = shuffle(picked.filter((q) => !q.passageId), rng);
  const rc = picked.filter((q) => q.passageId).sort((a, b) => (a.passageId < b.passageId ? -1 : a.passageId > b.passageId ? 1 : a.number - b.number));
  return {
    questions: [...lr, ...rc],
    weak: weak.map((s) => s.id),
    variety: [...new Set(picked.filter((q) => tag.get(q.id) === 'variety').flatMap((q) => skillsOf(q, q.kind).filter((id) => !weakIds.has(id)).slice(0, 1)))],
    counts: { weak: picked.filter((q) => tag.get(q.id) === 'weak').length, variety: picked.filter((q) => tag.get(q.id) === 'variety').length },
  };
}
