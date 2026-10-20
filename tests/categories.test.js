import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoriesOf, categoryLabel, detectFlaws, detectSkills, familiesOf } from '../src/lib/taxonomy.js';
import { normalizeTest } from '../src/lib/importer.js';
import { categoryStats } from '../src/lib/analytics.js';

test('families come from question types', () => {
  assert.deepEqual(familiesOf(['weaken']), ['assumption']);
  assert.deepEqual(familiesOf(['must-be-true']), ['inference']);
  assert.deepEqual(familiesOf(['role']), ['structure']);
  assert.deepEqual(familiesOf(['explain']), ['explanation']);
  assert.deepEqual(familiesOf(['rc-detail']), ['rc-specific']);
});

test('categoriesOf combines family, reasoning, flaw, and subject', () => {
  const q = { types: ['flaw'], tags: ['causal', 'flaw:causation', 'except', 'ladder:flaw'] };
  assert.deepEqual(categoriesOf(q), ['family:assumption', 'reasoning:causal', 'flaw:causation']);
  assert.equal(categoryLabel('flaw:causation'), 'Correlation vs. causation');
  assert.equal(categoryLabel('family:inference'), 'Inference family');
});

test('detects common reasoning patterns', () => {
  const s = detectSkills('A survey of 200 residents found that 60 percent support the plan, which would lead to lower costs.');
  for (const t of ['sampling', 'statistical', 'causal', 'plan']) assert.ok(s.includes(t), t);
});

test('guesses the flaw from the correct answer of a flaw question', () => {
  const q = (answerText) => ({ types: ['flaw'], choices: ['x', answerText, 'y', 'z', 'w'], answer: 'B' });
  assert.deepEqual(detectFlaws(q('generalizes from a sample that is not representative')), ['sampling']);
  assert.deepEqual(detectFlaws(q('mistakes a condition necessary for an outcome for one sufficient to produce it')), ['necessary-sufficient']);
  assert.deepEqual(detectFlaws(q('uses a key term in two different senses')), ['equivocation']);
  assert.deepEqual(detectFlaws({ ...q('representative'), types: ['weaken'] }), []);
});

test('import turns flaws and passage subjects into tags', () => {
  const t = normalizeTest({ name: 'C', sections: [
    { kind: 'LR', questions: [{ stimulus: 'x', stem: 'The argument is flawed in that it', choices: ['a', 'b', 'c', 'd', 'e'], answer: 'A', skills: ['causal'], flaws: ['causation', 'bogus'] }] },
    { kind: 'RC', passages: [{ id: 'p1', text: 'p', subject: 'law' }], questions: [{ passageId: 'p1', stem: 'According to the passage, the author', choices: ['a', 'b', 'c', 'd', 'e'], answer: 'B' }] },
  ] });
  assert.deepEqual(t.sections[0].questions[0].tags, ['causal', 'flaw:causation']);
  assert.deepEqual(t.sections[1].questions[0].tags, ['subject:law']);
});

test('categoryStats aggregates by category', () => {
  const at = new Date().toISOString();
  const s = categoryStats([
    { categories: ['reasoning:causal'], first: 'A', br: 'A', answer: 'A', at },
    { categories: ['reasoning:causal', 'flaw:causation'], first: 'B', br: 'B', answer: 'A', at },
  ]);
  assert.equal(s['reasoning:causal'].n, 2);
  assert.equal(s['reasoning:causal'].firstCorrect, 1);
  assert.equal(s['flaw:causation'].wrongTwice, 1);
});
