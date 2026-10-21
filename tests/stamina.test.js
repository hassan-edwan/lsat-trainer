import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStaminaSession, currentLevel, expectedByDifficulty, staminaReport } from '../src/lib/stamina.js';

// Two sections of 20 questions, all difficulty 3, answer A.
function fixture() {
  const mk = (kind, n) => ({ id: `s-${kind}-${n}`, title: `${kind} ${n}`, kind, timeLimitMinutes: 35,
    questions: Array.from({ length: 25 }, (_, i) => ({ id: `${kind}${n}-q${i}`, answer: 'A', difficulty: 3, types: ['flaw'] })) });
  const tests = [{ id: 't1', sections: [mk('LR', 1), mk('LR', 2), mk('RC', 1)] }, { id: 't2', sections: [mk('LR', 3), mk('RC', 2), mk('LR', 4)] }];
  const index = {};
  for (const t of tests) for (const s of t.sections) for (const q of s.questions) index[q.id] = { question: q, section: s, test: t };
  return { tests, index };
}

function session(sections, rightIf) {
  let k = 0;
  const responses = {};
  for (const s of sections) for (const q of s.questions) responses[q.id] = { first: rightIf(k++) ? 'A' : 'B', timeMs: 80_000 };
  return { id: 'x', kind: 'stamina', phase: 'done', finishedAt: '2026-10-01', stamina: { level: 2 },
    sections: sections.map((s) => ({ title: s.title, kind: s.kind, timeLimitSec: 2100, elapsedSec: 2000, qids: s.questions.map((q) => q.id) })), responses };
}

test('staminaReport: steady accuracy passes, a late collapse fails', () => {
  const { tests, index } = fixture();
  const secs = tests[0].sections.slice(0, 2);
  const expected = expectedByDifficulty([], index);
  const steady = staminaReport(session(secs, (k) => k % 5 !== 0), index, expected);
  assert.equal(steady.fade, 0);
  assert.equal(steady.passed, true);
  const fading = staminaReport(session(secs, (k) => k < 30 || k % 2 === 0), index, expected);
  assert.ok(fading.fade < -6);
  assert.equal(fading.passed, false);
  assert.equal(fading.sections.length, 2);
  assert.equal(fading.sections[0].accuracy, 100);
  assert.equal(fading.sections[1].targetSec, 84);
});

test('staminaReport: a rushed session does not count', () => {
  const { tests, index } = fixture();
  const s = session(tests[0].sections.slice(0, 2), (k) => k % 5 !== 0);
  s.sections.forEach((x) => { x.elapsedSec = 300; });
  const r = staminaReport(s, index, expectedByDifficulty([], index));
  assert.equal(r.counts, false);
  assert.equal(r.passed, false);
});

test('staminaReport needs at least 10 questions', () => {
  const { index } = fixture();
  const s = { sections: [{ title: 'x', qids: ['LR1-q0'] }], responses: {} };
  assert.equal(staminaReport(s, index, expectedByDifficulty([], index)), null);
});

test('currentLevel: one above the highest level passed; a full test counts as 4', () => {
  assert.equal(currentLevel([]), 1);
  const h = (level, passed, extra = {}) => ({ session: { stamina: level ? { level } : undefined, sections: [1, 2, 3, 4], kind: 'stamina', ...extra }, report: { passed } });
  assert.equal(currentLevel([h(1, true), h(2, false)]), 2);
  assert.equal(currentLevel([h(null, true, { kind: 'pt' })]), 5);
  assert.equal(currentLevel([h(5, true)]), 5);
});

test('createStaminaSession picks distinct, unseen sections of the right kinds', () => {
  const { tests } = fixture();
  const seen = tests[0].sections[0].questions.map((q) => ({ qid: q.id }));
  const s = createStaminaSession(3, tests, seen);
  assert.equal(s.kind, 'stamina');
  assert.deepEqual(s.stamina, { level: 3 });
  assert.deepEqual(s.sections.map((x) => x.kind), ['LR', 'LR', 'RC']);
  assert.equal(new Set(s.sections.map((x) => x.title)).size, 3);
  assert.ok(!s.sections.some((x) => x.title === 'LR 1'));
  assert.equal(s.settings.breakAfterSection, null);
  const four = createStaminaSession(4, tests, []);
  assert.equal(four.sections.length, 4);
  assert.equal(four.settings.breakAfterSection, 1);
});
