import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords } from '../src/lib/merge.js';

test('merging keeps every record, the newest version of each, and honors deletes', () => {
  const file = [
    { id: 'a', updatedAt: '2026-10-01', v: 'file-old' },
    { id: 'b', updatedAt: '2026-10-05', v: 'file-new' },
    { id: 'c', updatedAt: '2026-10-02', v: 'only-in-file' },
  ];
  const browser = [
    { id: 'a', updatedAt: '2026-10-03', v: 'browser-new' },
    { id: 'b', updatedAt: '2026-10-04', v: 'browser-old' },
    { id: 'd', updatedAt: '2026-10-06', v: 'only-in-browser' },
  ];
  const out = Object.fromEntries(mergeRecords('sessions', file, browser).map((r) => [r.id, r.v]));
  assert.deepEqual(out, { a: 'browser-new', b: 'file-new', c: 'only-in-file', d: 'only-in-browser' });
  assert.equal(mergeRecords('sessions', file, browser, ['c']).length, 3);
});

test('a test retired in either copy stays retired, and prefs compare by their own timestamp', () => {
  const [t] = mergeRecords('tests', [{ id: 'x', retired: true }], [{ id: 'x', name: 'X' }]);
  assert.equal(t.retired, true);
  const [p] = mergeRecords('settings', [{ key: 'prefs', value: { dailyGoal: 30, updatedAt: '2026-10-09' } }], [{ key: 'prefs', value: { dailyGoal: 20, updatedAt: '2026-10-01' } }]);
  assert.equal(p.value.dailyGoal, 30);
});
