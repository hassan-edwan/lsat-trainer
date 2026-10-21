// The built-in question bank shipped in public/samples/.

import { normalizeImport } from './importer.js';

const SAMPLES = `${import.meta.env.BASE_URL}samples/`;

/** public/samples/index.json: { version, files, retired } (a bare array of files is also accepted). */
export async function fetchBundleIndex() {
  const raw = await (await fetch(`${SAMPLES}index.json`)).json();
  return Array.isArray(raw) ? { version: 1, files: raw, retired: [] } : { retired: [], ...raw };
}

// Loads every bundled test listed in the index and retires the tests it replaces.
export async function loadBundledTests(installBundle) {
  const { version, files, retired } = await fetchBundleIndex();
  const tests = await Promise.all(files.map(async (f) => normalizeImport(await (await fetch(SAMPLES + f)).json())));
  await installBundle(tests.flat(), retired, version);
}
