// Minimal promise wrapper around IndexedDB. All data stays in the browser.

const DB_NAME = 'lsat-trainer';
const DB_VERSION = 1;
export const STORES = {
  tests: 'id', // imported tests
  sessions: 'id', // PT / drill sessions (in progress and finished)
  attempts: 'key', // one row per question answered in a finished session
  journal: 'qid', // mistake journal
  settings: 'key',
};

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

export const db = {
  getAll: (store) => tx(store, 'readonly', (s) => s.getAll()),
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  put: (store, value) => tx(store, 'readwrite', (s) => { s.put(value); }),
  putMany: (store, values) => tx(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); }),
  delete: (store, key) => tx(store, 'readwrite', (s) => { s.delete(key); }),
  deleteMany: (store, keys) => tx(store, 'readwrite', (s) => { keys.forEach((k) => s.delete(k)); }),
  clear: (store) => tx(store, 'readwrite', (s) => { s.clear(); }),
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
