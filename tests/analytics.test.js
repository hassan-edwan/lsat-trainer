import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, buildDrill, outcome, typeStats, weaknessScores } from '../src/lib/analytics.js';

const now = Date.parse('2026-10-01T00:00:00Z');
const at = '2026-09-30T00:00:00Z';
const att = (types, first, br, answer = 'A', extra = {}) => ({ qid: Math.random().toString(), types, kind: 'LR', first, br, answer, timeMs: 60000, at, ...extra });

test('outcome categories', () => {
  assert.equal(outcome('A', 'A', 'A'), 'correct');
  assert.equal(outcome('B', 'A', 'A'), 'br-fixed');
  assert.equal(outcome('A', 'B', 'A'), 'br-broke');
  assert.equal(outcome('B', 'C', 'A'), 'wrong-twice');
  assert.equal(outcome('B', null, 'A'), 'wrong-twice'); // no BR answer = timed answer stands
  assert.equal(outcome(null, null, 'A'), 'wrong-twice');
});

test('typeStats counts timed, BR, and wrong-twice', () => {
  const s = typeStats([att(['flaw'], 'A', 'A'), att(['flaw'], 'B', 'A'), att(['flaw'], 'B', 'B')], now).flaw;
  assert.equal(s.n, 3);
  assert.equal(s.firstCorrect, 1);
  assert.equal(s.brCorrect, 2);
  assert.equal(s.wrongTwice, 1);
});

test('weakness ranks a frequently missed type above a mastered one', () => {
  const attempts = [
    ...Array.from({ length: 10 }, () => att(['flaw'], 'A', 'A')),
    ...Array.from({ length: 10 }, () => att(['necessary-assumption'], 'B', 'B')),
  ];
  const rows = weaknessScores(attempts, { kinds: ['LR'], now });
  const rank = (t) => rows.findIndex((r) => r.type === t);
  assert.ok(rank('necessary-assumption') < rank('flaw'));
  assert.equal(rows[0].type, 'necessary-assumption');
});

test('old misses count less than recent ones', () => {
  const old = Array.from({ length: 6 }, () => att(['weaken'], 'B', 'B', 'A', { at: '2025-01-01T00:00:00Z' }));
  const recent = Array.from({ length: 6 }, () => att(['strengthen'], 'B', 'B'));
  const rows = weaknessScores([...old, ...recent], { kinds: ['LR'], now });
  const w = rows.find((r) => r.type === 'weaken');
  const s = rows.find((r) => r.type === 'strengthen');
  assert.ok(s.missRate > w.missRate);
});

test('allocate distributes exactly count slots', () => {
  const r = allocate([{ score: 3 }, { score: 1 }, { score: 1 }], 10);
  assert.equal(r.reduce((n, x) => n + x.slots, 0), 10);
  assert.equal(r[0].slots, 6);
});

test('buildDrill: type mode returns only matching types, prefers journal and unseen', () => {
  const qs = [
    { id: 'q1', types: ['flaw'], kind: 'LR' },
    { id: 'q2', types: ['flaw'], kind: 'LR' },
    { id: 'q3', types: ['flaw'], kind: 'LR' },
    { id: 'q4', types: ['weaken'], kind: 'LR' },
  ];
  const attempts = [{ qid: 'q1', types: ['flaw'], first: 'A', br: 'A', answer: 'A', at }];
  const journal = { q2: { status: 'new' } };
  const picked = buildDrill(qs, attempts, journal, { mode: 'types', types: ['flaw'], kinds: ['LR'], count: 2, rng: () => 0.5 });
  assert.deepEqual(picked.map((q) => q.id).sort(), ['q2', 'q3']);
});

test('buildDrill: smart mode fills the requested count when the pool allows', () => {
  const qs = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, types: [i % 2 ? 'flaw' : 'weaken'], kind: 'LR' }));
  const picked = buildDrill(qs, [], {}, { mode: 'smart', kinds: ['LR'], count: 12 });
  assert.equal(picked.length, 12);
  assert.equal(new Set(picked.map((q) => q.id)).size, 12);
});
