// Minimal promise wrapper around IndexedDB. When the app runs from the dev or
// preview server, every write is also saved to the project's data/ folder
// (see fileSync.js).

import { markDirty } from './fileSync.js';
import { KEYS } from './merge.js';

const DB_NAME = 'lsat-trainer';
const DB_VERSION = 1;
// tests: imported tests · sessions: PT / drill sessions (in progress and finished) ·
// attempts: one row per question answered in a finished session · journal: mistake journal · settings
export const STORES = KEYS;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const result = fn(s);
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const then = (p, fn) => p.then((r) => { fn(); return r; });

export const db = {
  getAll: (store) => tx(store, 'readonly', (s) => s.getAll()),
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  put: (store, value) => then(tx(store, 'readwrite', (s) => { s.put(value); }), () => markDirty(store)),
  putMany: (store, values) => then(tx(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); }), () => markDirty(store)),
  delete: (store, key) => then(tx(store, 'readwrite', (s) => { s.delete(key); }), () => markDirty(store, { deleted: [key] })),
  deleteMany: (store, keys) => then(tx(store, 'readwrite', (s) => { keys.forEach((k) => s.delete(k)); }), () => markDirty(store, { deleted: keys })),
  clear: (store) => then(tx(store, 'readwrite', (s) => { s.clear(); }), () => markDirty(store, { replace: true })),
};

/** Full backup of every store, for download. */
export async function exportAll() {
  const out = { format: 'lsat-trainer-backup/v1', exportedAt: new Date().toISOString() };
  for (const name of Object.keys(STORES)) out[name] = await db.getAll(name);
  return out;
}

export async function importAll(backup) {
  if (backup?.format !== 'lsat-trainer-backup/v1') throw new Error('Not an LSAT Trainer backup file.');
  for (const name of Object.keys(STORES)) {
    if (Array.isArray(backup[name])) {
      await db.clear(name);
      await db.putMany(name, backup[name]);
    }
  }
}
