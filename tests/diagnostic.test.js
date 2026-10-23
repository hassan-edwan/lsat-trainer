import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticOrder, ladderResults } from '../src/lib/diagnostic.js';
import { detectSkills } from '../src/lib/taxonomy.js';
import { buildIndex, createDrillSession, finalizeSession } from '../src/lib/session.js';
import { normalizeTest } from '../src/lib/importer.js';

const at = '2026-10-01T00:00:00Z';
const ladder = (id, kind = 'LR') => [1, 2, 3, 4, 5].map((level) => ({
  id: `${id}-${level}`, number: level, difficulty: level, kind, types: ['flaw'], tags: [`ladder:${id}`], answer: 'A',
}));
const att = (qid, first, br = first) => ({ qid, first, br, answer: 'A', at });

test('breaking point is the first level still missed after blind review', () => {
  const qs = ladder('flaw');
  const attempts = [att('flaw-1', 'A'), att('flaw-2', 'A'), att('flaw-3', 'B', 'A'), att('flaw-4', 'B'), att('flaw-5', 'A')];
  const [r] = ladderResults(qs, attempts);
  assert.equal(r.id, 'flaw');
  assert.deepEqual(r.levels.map((x) => x.status), ['correct', 'correct', 'br-fixed', 'wrong', 'correct']);
  assert.equal(r.breaksAt, 4);
  assert.equal(r.slipsAt, 3);
  assert.equal(r.cleared, 2);
  assert.equal(r.complete, true);
});

test('a ladder with every level correct has no breaking point', () => {
  const qs = ladder('weaken');
  const [r] = ladderResults(qs, qs.map((q) => att(q.id, 'A')));
  assert.equal(r.breaksAt, null);
  assert.equal(r.cleared, 5);
});

test('the latest attempt wins', () => {
  const qs = ladder('flaw');
  const attempts = [{ ...att('flaw-1', 'B'), at: '2026-01-01T00:00:00Z' }, att('flaw-1', 'A')];
  const [r] = ladderResults(qs, attempts);
  assert.equal(r.levels[0].status, 'correct');
  assert.equal(r.levels[1].status, 'untried');
  assert.equal(r.breaksAt, null);
});

test('diagnostic order goes level by level across ladders', () => {
  const qs = [...ladder('flaw'), ...ladder('weaken')];
  const order = diagnosticOrder(qs, ['flaw', 'weaken']);
  assert.equal(order.length, 10);
  assert.deepEqual(order.map((q) => q.difficulty), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.equal(diagnosticOrder(qs, ['flaw']).length, 5);
});

test('detects dialogue questions and dense conditional stimuli', () => {
  assert.ok(detectSkills('Ana: We should do X.\n\nBen: But X costs too much.', 'Ana and Ben disagree over whether').includes('debate'));
  assert.ok(detectSkills('No student may join unless enrolled in rhetoric, and only students with high grades may enroll. Every member is a junior.', '').includes('conditional'));
  assert.deepEqual(detectSkills('Sales rose after the campaign, so the campaign worked.', ''), []);
  assert.deepEqual(detectSkills('Ana: x\n\nBen: y', '', 'RC'), []);
});

test('an explicit skills array overrides detection', () => {
  const t = normalizeTest({ name: 'S', sections: [{ kind: 'LR', questions: [{
    stimulus: 'No student may join unless enrolled, and only students with high grades may enroll. Every member is a junior.',
    stem: 'Which one of the following must be true?', choices: ['a', 'b', 'c', 'd', 'e'], answer: 'A', skills: [],
  }] }] });
  assert.ok(!t.sections[0].questions[0].tags.includes('conditional'));
});

test('diagnostic sessions journal every timed miss, not only double misses', () => {
  const t = normalizeTest({ name: 'D', purpose: 'diagnostic', sections: [{ kind: 'LR', questions: [1, 2].map((n) => ({
    number: n, stem: 'The argument is flawed in that it', choices: ['a', 'b', 'c', 'd', 'e'], answer: 'A', difficulty: n, tags: ['ladder:flaw'],
  })) }] });
  assert.equal(t.purpose, 'diagnostic');
  const index = buildIndex([t]);
  const qs = t.sections[0].questions.map((q) => ({ ...q, kind: 'LR', testId: t.id }));
  const s = createDrillSession(qs, { kind: 'diagnostic' });
  assert.equal(s.kind, 'diagnostic');
  Object.assign(s.responses[qs[0].id], { first: 'B', br: 'A' }); // fixed in BR: still journaled
  Object.assign(s.responses[qs[1].id], { first: 'A', br: 'A' });
  const { journalPuts } = finalizeSession(s, index, {});
  assert.deepEqual(journalPuts.map((e) => e.qid), [qs[0].id]);
  assert.equal(journalPuts[0].source, 'diagnostic');
});
