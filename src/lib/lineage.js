// A question carried into a newer version of a test, unchanged or lightly edited, gets a new id.
// Linking questions by content lets anything you've seen in any version count as seen.

const memo = new WeakMap();
// Unrelated questions in the bank share at most about 30% of their four-word runs; a lightly
// reworded version shares 50% or more.
const SHINGLE = 4; // words per shingle
const SAME = 0.4; // share of the shorter text's shingles two versions must share

function shingles(text) {
  const w = (text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const out = new Set();
  for (let i = 0; i + SHINGLE <= w.length; i++) out.add(w.slice(i, i + SHINGLE).join(' '));
  return out;
}

/**
 * Map from question id to the ids of the same content in other tests. A unit is an LR stimulus
 * or an RC passage (every question on it). Two units in different tests are the same content
 * when they share at least 40% of the shorter one's four-word runs.
 */
export function contentLinks(tests) {
  if (memo.has(tests)) return memo.get(tests);
  const units = [];
  for (const t of tests) {
    for (const s of t.sections) {
      const ids = (q) => `${t.id}:${s.id}:${q.number}`;
      if (s.kind === 'RC') {
        for (const p of s.passages || []) {
          const qids = s.questions.filter((q) => q.passageId === p.id).map(ids);
          if (qids.length) units.push({ test: t.id, qids, sh: shingles(p.text) });
        }
      } else {
        for (const q of s.questions) units.push({ test: t.id, qids: [ids(q)], sh: shingles(q.stimulus || `${q.stem} ${(q.choices || []).join(' ')}`) });
      }
    }
  }
  const byShingle = new Map();
  units.forEach((u, i) => u.sh.forEach((x) => { if (!byShingle.has(x)) byShingle.set(x, []); byShingle.get(x).push(i); }));
  const links = new Map();
  const link = (a, b) => { if (!links.has(a)) links.set(a, new Set()); links.get(a).add(b); };
  units.forEach((u, i) => {
    const shared = new Map();
    for (const x of u.sh) for (const j of byShingle.get(x)) if (j > i && units[j].test !== u.test) shared.set(j, (shared.get(j) || 0) + 1);
    for (const [j, n] of shared) {
      const v = units[j];
      if (n < SAME * Math.min(u.sh.size, v.sh.size) || !u.sh.size || !v.sh.size) continue;
      for (const a of u.qids) for (const b of v.qids) { link(a, b); link(b, a); }
    }
  });
  memo.set(tests, links);
  return links;
}

/** Adds to `ids` every question with the same content as one already in it. */
export function withLinked(ids, tests) {
  if (!tests?.length) return ids;
  const links = contentLinks(tests);
  for (const id of [...ids]) for (const l of links.get(id) || []) ids.add(l);
  return ids;
}
