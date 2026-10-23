// Vite plugin: saves the app's data to JSON files in the project's data/
// folder, so progress survives a new port, a new browser, or cleared browser
// storage. The app reads the files on start and sends changes as they happen.
//
//   GET  /__lsat-data          → every store
//   POST /__lsat-data/<store>  { records, deleted, replace } → merged into data/<store>.json
//
// Writes merge with what's on disk (newest version of each record wins), so
// two tabs on different ports can't erase each other's work. The first write
// each day snapshots the folder to data/backups/<date>/ (the last 30 are kept).

import fs from 'node:fs';
import path from 'node:path';
import { KEYS, mergeRecords } from '../src/lib/merge.js';

const KEEP_SNAPSHOTS = 30;

export default function localData({ dir = 'data' } = {}) {
  const root = path.resolve(dir);
  const file = (store) => path.join(root, `${store}.json`);
  const read = (store) => {
    try { return JSON.parse(fs.readFileSync(file(store), 'utf8')); } catch { return []; }
  };

  let snappedDay = null;
  const snapshot = () => {
    const day = new Date().toISOString().slice(0, 10);
    if (snappedDay === day) return;
    snappedDay = day;
    const dest = path.join(root, 'backups', day);
    const have = Object.keys(KEYS).filter((s) => fs.existsSync(file(s)));
    if (fs.existsSync(dest) || !have.length) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const s of have) fs.copyFileSync(file(s), path.join(dest, `${s}.json`));
    const days = fs.readdirSync(path.join(root, 'backups')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    for (const old of days.slice(0, Math.max(0, days.length - KEEP_SNAPSHOTS))) {
      fs.rmSync(path.join(root, 'backups', old), { recursive: true, force: true });
    }
  };

  const write = (store, rows) => {
    fs.mkdirSync(root, { recursive: true });
    snapshot();
    const tmp = `${file(store)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rows));
    fs.renameSync(tmp, file(store));
  };

  const send = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };

  const middleware = (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith('/__lsat-data')) return next();
    const store = url.slice('/__lsat-data/'.length);
    if (req.method === 'GET' && !store) {
      return send(res, 200, {
        format: 'lsat-trainer-files/v1', dir: root,
        stores: Object.fromEntries(Object.keys(KEYS).map((s) => [s, read(s)])),
      });
    }
    if (req.method === 'POST' && KEYS[store]) {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const { records = [], deleted = [], replace = false } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const rows = replace ? records : mergeRecords(store, read(store), records, deleted);
          write(store, rows);
          send(res, 200, { ok: true, count: rows.length, savedAt: new Date().toISOString() });
        } catch (err) {
          send(res, 500, { ok: false, error: err.message });
        }
      });
      return undefined;
    }
    return send(res, 404, { ok: false });
  };

  return {
    name: 'lsat-local-data',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
