// Reading Comprehension is drilled a passage at a time, as on the LSAT: one passage and
// every question that goes with it (usually 5 to 8), never a question or two cut out of one.

export const passageKey = (q) => (q.passageId ? `${q.testId}:${q.passageId}` : null);

/** passage key -> that passage's questions in order. */
export function passageMap(questions) {
  const map = new Map();
  for (const q of questions) {
    const k = passageKey(q);
    if (k) (map.get(k) || map.set(k, []).get(k)).push(q);
  }
  for (const g of map.values()) g.sort((a, b) => a.number - b.number);
  return map;
}

/**
 * Whole passages for the reading questions in `cands` (best first). Passages you've seen
 * fewer questions from come first, then ones with more matching questions, then the order
 * of `cands`. `ok(passage)` can rule a passage out. The first passage is always taken;
 * more are added only while the set stays within two questions of `count`.
 * Returns { questions, passages }.
 */
export function wholePassages(cands, all, { count, seen = new Set(), ok = () => true, skip = new Set() } = {}) {
  const map = passageMap(all);
  const info = new Map();
  cands.forEach((q, i) => {
    const k = passageKey(q);
    if (!k || skip.has(k) || !map.has(k)) return;
    const x = info.get(k) || info.set(k, { k, first: i, matches: 0 }).get(k);
    x.matches += 1;
  });
  const ranked = [...info.values()]
    .map((x) => ({ ...x, qs: map.get(x.k), seenN: map.get(x.k).filter((q) => seen.has(q.id)).length }))
    .filter((x) => ok(x.qs))
    .sort((a, b) => a.seenN - b.seenN || b.matches - a.matches || a.first - b.first);
  const out = [];
  const keys = [];
  for (const x of ranked) {
    if (keys.length && out.length + x.qs.length > count + 2) continue;
    out.push(...x.qs);
    keys.push(x.k);
    if (out.length >= count) break;
  }
  return { questions: out, passages: keys };
}

// RC pace on the real test: 35 minutes for about 4 passages and 27 questions, which is roughly
// 3.5 minutes to read each passage plus about 47 seconds per question (at an 80-second LR pace).
export const RC_READ_SEC = 210;
export const RC_QUESTION_SEC = 47;

/**
 * Target seconds per question in a section. In RC, reading time is taken out first
 * (it's timed separately), so the pace is for answering, in the same reading-to-answering
 * ratio as the real test.
 */
export function paceSec(sec, index) {
  if (!sec.timeLimitSec || !sec.qids.length) return null;
  const n = sec.qids.length;
  const passages = new Set(sec.qids.map((id) => index?.[id]?.passage && `${index[id].test.id}:${index[id].passage.id}`).filter(Boolean)).size;
  if (!passages) return Math.round(sec.timeLimitSec / n);
  return Math.round(sec.timeLimitSec * RC_QUESTION_SEC * n / (RC_READ_SEC * passages + RC_QUESTION_SEC * n) / n);
}
