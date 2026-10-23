// Keeps the browser's data in step with the files in the project's data/
// folder (served by scripts/local-data-plugin.mjs while `npm run dev` or
// `npm run preview` is running). On start, the files and the browser are
// merged; after that, every change is sent to the files a moment later.
// On a static copy of the app with no such server, this stays off.

import { KEYS, mergeRecords } from './merge.js';

const URL_BASE = './__lsat-data';
const DELAY_MS = 1200;

let api = null; // { getAll, putMany }
let enabled = false;
let timer = null;
let flushing = null;
const dirty = new Map(); // store → { deleted: Set, replace: boolean }
const status = { enabled: false, dir: null, lastSaved: null, error: null };
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn({ ...status }));

export function syncStatus() { return { ...status }; }
export function onSyncStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Called by db.js after every write. */
export function markDirty(store, { deleted = [], replace = false } = {}) {
  if (!enabled || !KEYS[store]) return;
  const d = dirty.get(store) || { deleted: new Set(), replace: false };
  if (replace) { d.replace = true; d.deleted.clear(); }
  for (const k of deleted) d.deleted.add(k);
  dirty.set(store, d);
  clearTimeout(timer);
  timer = setTimeout(flush, DELAY_MS);
}

export async function flush() {
  if (!enabled) return;
  if (flushing) { await flushing; if (!dirty.size) return; }
  const batch = [...dirty.entries()];
  dirty.clear();
  flushing = (async () => {
    for (const [store, d] of batch) {
      try {
        const records = await api.getAll(store);
        const res = await fetch(`${URL_BASE}/${store}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records, deleted: [...d.deleted], replace: d.replace }),
        });
        const body = await res.json();
        if (!body.ok) throw new Error(body.error || `HTTP ${res.status}`);
        status.lastSaved = body.savedAt;
        status.error = null;
      } catch (err) {
        // Put it back so the next change retries it.
        const again = dirty.get(store) || { deleted: new Set(), replace: false };
        d.deleted.forEach((k) => again.deleted.add(k));
        again.replace ||= d.replace;
        dirty.set(store, again);
        status.error = `Couldn't save to the data folder (${err.message}). Is the dev server still running?`;
      }
    }
    emit();
  })();
  await flushing;
  flushing = null;
}

/**
 * Connect to the data folder: merge its records with the browser's (newest
 * version of each record wins), write the result to both, and turn on saving.
 * Returns false when there's no data folder to connect to.
 */
export async function initFileSync(dbApi) {
  api = dbApi;
  let remote;
  try {
    const res = await fetch(URL_BASE, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return false;
    remote = await res.json();
    if (remote?.format !== 'lsat-trainer-files/v1') return false;
  } catch {
    return false;
  }
  enabled = true;
  status.enabled = true;
  status.dir = remote.dir;
  for (const store of Object.keys(KEYS)) {
    const local = await api.getAll(store);
    const key = KEYS[store];
    const before = new Map(local.map((r) => [r[key], r]));
    const merged = mergeRecords(store, remote.stores[store] || [], local);
    const changed = merged.filter((r) => before.get(r[key]) !== r);
    if (changed.length) await api.putMany(store, changed);
    markDirty(store);
  }
  await flush();
  window.addEventListener('pagehide', () => { flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  emit();
  return true;
}
