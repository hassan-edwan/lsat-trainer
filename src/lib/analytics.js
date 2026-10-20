// Scoring, per-type statistics, weakness scoring, and drill selection.
// Everything here is pure so it can be unit-tested without a browser.

import { QUESTION_TYPES, inCategory } from './taxonomy.js';

export const OUTCOMES = {
  'correct': { label: 'Correct', short: '✓' },
  'br-fixed': { label: 'Fixed in blind review', short: 'BR✓' },
  'br-broke': { label: 'Changed to wrong in blind review', short: 'BR✗' },
  'wrong-twice': { label: 'Wrong in timed and blind review', short: '✗✗' },
};

/** Classify a question given first (timed) and blind-review answers. */
export function outcome(first, br, answer) {
  const brAnswer = br ?? first;
  const firstOk = first === answer;
  const brOk = brAnswer === answer;
  if (firstOk && brOk) return 'correct';
  if (!firstOk && brOk) return 'br-fixed';
  if (firstOk && !brOk) return 'br-broke';
  return 'wrong-twice';
}

const DAY_MS = 86_400_000;
const HALF_LIFE_DAYS = 45;

function recencyWeight(at, now) {
  const age = Math.max(0, (now - new Date(at).getTime()) / DAY_MS);
  return Math.pow(0.5, age / HALF_LIFE_DAYS);
}

/**
 * Aggregate attempt history by question type.
 * attempts: [{ qid, types, kind, first, br, answer, timeMs, at }]
 */
export function typeStats(attempts, now = Date.now()) {
  return statsBy(attempts, (a) => a.types || [], now);
}

/** Same as typeStats, keyed by category ("reasoning:causal", ...); attempts need `categories`. */
export function categoryStats(attempts, now = Date.now()) {
  return statsBy(attempts, (a) => a.categories || [], now);
}

function statsBy(attempts, keysOf, now) {
  const stats = {};
  for (const a of attempts) {
    const oc = outcome(a.first, a.br, a.answer);
    const w = recencyWeight(a.at, now);
    for (const t of keysOf(a)) {
      const s = (stats[t] ||= {
        type: t, n: 0, firstCorrect: 0, brCorrect: 0, wrongTwice: 0, timeMs: 0, timed: 0,
        wN: 0, wFirstWrong: 0, wWrongTwice: 0,
      });
      s.n += 1;
      if (oc === 'correct' || oc === 'br-broke') s.firstCorrect += 1;
      if (oc === 'correct' || oc === 'br-fixed') s.brCorrect += 1;
      if (oc === 'wrong-twice') s.wrongTwice += 1;
      if (a.timeMs > 0) { s.timeMs += a.timeMs; s.timed += 1; }
      s.wN += w;
      if (oc === 'br-fixed' || oc === 'wrong-twice') s.wFirstWrong += w;
      if (oc === 'wrong-twice') s.wWrongTwice += w;
    }
  }
  for (const s of Object.values(stats)) {
    s.firstAccuracy = s.n ? s.firstCorrect / s.n : 0;
    s.brAccuracy = s.n ? s.brCorrect / s.n : 0;
    s.avgTimeMs = s.timed ? s.timeMs / s.timed : 0;
  }
  return stats;
}

/**
 * How much drilling a type deserves: how often you miss it (recency-weighted,
 * smoothed toward 50% when there is little data), with misses that survive
 * blind review counting extra, scaled by how often the type appears.
 */
export function weaknessScores(attempts, { kinds = ['LR', 'RC'], now = Date.now() } = {}) {
  const stats = typeStats(attempts, now);
  const rows = [];
  for (const [type, meta] of Object.entries(QUESTION_TYPES)) {
    if (!kinds.includes(meta.kind)) continue;
    const s = stats[type];
    const wN = s?.wN ?? 0;
    const missRate = ((s?.wFirstWrong ?? 0) + 1) / (wN + 2);
    const twiceRate = ((s?.wWrongTwice ?? 0) + 0.5) / (wN + 2);
    const score = meta.weight * (missRate + 1.5 * twiceRate);
    rows.push({ type, label: meta.label, kind: meta.kind, weight: meta.weight, n: s?.n ?? 0, missRate, twiceRate, score, stats: s || null });
  }
  return rows.sort((a, b) => b.score - a.score);
}

/** Split `count` slots across items proportionally to `score` (largest remainder). */
export function allocate(items, count) {
  const total = items.reduce((sum, i) => sum + i.score, 0);
  if (!total || count <= 0) return items.map((i) => ({ ...i, slots: 0 }));
  const raw = items.map((i) => ({ ...i, exact: (i.score / total) * count }));
  raw.forEach((r) => { r.slots = Math.floor(r.exact); });
  let left = count - raw.reduce((s, r) => s + r.slots, 0);
  [...raw].sort((a, b) => (b.exact - b.slots) - (a.exact - a.slots)).forEach((r) => {
    if (left > 0) { r.slots += 1; left -= 1; }
  });
  return raw;
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Order candidate questions by drill priority:
 *   0. journal entries not yet mastered
 *   1. never attempted
 *   2. attempted, last result not correct
 *   3. everything else (oldest attempt first)
 */
export function prioritize(questions, { attemptsByQid = {}, journal = {}, rng = Math.random } = {}) {
  const tiers = [[], [], [], []];
  for (const q of questions) {
    const hist = attemptsByQid[q.id] || [];
    const j = journal[q.id];
    if (j && j.status !== 'mastered') tiers[0].push(q);
    else if (hist.length === 0) tiers[1].push(q);
    else {
      const last = hist[hist.length - 1];
      if (outcome(last.first, last.br, last.answer) !== 'correct') tiers[2].push(q);
      else tiers[3].push({ q, at: last.at });
    }
  }
  tiers[3].sort((a, b) => new Date(a.at) - new Date(b.at));
  return [
    ...shuffle(tiers[0], rng),
    ...shuffle(tiers[1], rng),
    ...shuffle(tiers[2], rng),
    ...tiers[3].map((x) => x.q),
  ];
}

/**
 * Build a drill.
 * questions: flat list of all library questions ({ id, types, kind, difficulty, ... })
 * opts.mode: 'types' (use opts.types) or 'smart' (weakness-weighted)
 */
export function buildDrill(questions, attempts, journal, opts) {
  const { mode = 'smart', types = [], skills = [], categories = [], kinds = ['LR'], count = 10, difficulty = null, rng = Math.random } = opts;
  const attemptsByQid = groupBy(attempts, (a) => a.qid);
  const pool = questions.filter(
    (q) => kinds.includes(q.kind) && (!difficulty || q.difficulty == null || difficulty.includes(q.difficulty)),
  );
  const picked = [];
  const used = new Set();
  const take = (candidates, n) => {
    for (const q of prioritize(candidates, { attemptsByQid, journal, rng })) {
      if (n <= 0) break;
      if (used.has(q.id)) continue;
      used.add(q.id);
      picked.push(q);
      n -= 1;
    }
    return n;
  };

  if (mode === 'types') {
    const matches = (q) => q.types.some((t) => types.includes(t))
      || (q.tags || []).some((t) => skills.includes(t))
      || categories.some((c) => inCategory(q, c));
    take(pool.filter(matches), count);
  } else {
    const available = new Set(pool.flatMap((q) => q.types));
    const scores = weaknessScores(attempts, { kinds }).filter((r) => available.has(r.type));
    let shortfall = 0;
    for (const r of allocate(scores, count)) {
      if (r.slots > 0) shortfall += take(pool.filter((q) => q.types.includes(r.type)), r.slots);
    }
    if (shortfall > 0) take(pool, shortfall);
  }
  return shuffle(picked, rng);
}

export function groupBy(list, keyFn) {
  const out = {};
  for (const item of list) (out[keyFn(item)] ||= []).push(item);
  return out;
}

export function formatMs(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Look up a scaled score from a test's optional conversion table. */
export function scaledScore(test, rawCorrect) {
  const table = test?.scoreConversion;
  if (!table) return null;
  const v = table[String(rawCorrect)];
  return v == null ? null : Number(v);
}
