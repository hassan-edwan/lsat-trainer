// Merging records from two copies of the data (the browser and the files in
// data/). Shared by the app and the dev server so both merge the same way.

export const KEYS = { tests: 'id', sessions: 'id', attempts: 'key', journal: 'qid', settings: 'key' };

const stamp = (x) => x?.updatedAt || x?.value?.updatedAt || x?.finishedAt || x?.at || x?.addedAt || '';

/** The newer of two versions of a record; `b` wins ties. A test retired in either copy stays retired. */
export function pick(a, b) {
  if (!a) return b;
  if (!b) return a;
  const newer = stamp(b) >= stamp(a) ? b : a;
  return (a.retired || b.retired) && !newer.retired ? { ...newer, retired: true } : newer;
}

/** Union of two record lists by key, newest version of each, minus deleted keys. */
export function mergeRecords(store, existing = [], incoming = [], deleted = []) {
  const key = KEYS[store];
  const out = new Map(existing.map((r) => [r[key], r]));
  for (const r of incoming) out.set(r[key], pick(out.get(r[key]), r));
  for (const k of deleted) out.delete(k);
  return [...out.values()];
}
