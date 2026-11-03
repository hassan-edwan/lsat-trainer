import test from 'node:test';
import assert from 'node:assert/strict';
import { contentLinks } from '../src/lib/lineage.js';
import { seenIds } from '../src/lib/mastery.js';

const stim = 'Archaeologist: grinding stones were found together with charred barley grains in a layer dated to about nine thousand years ago, so the people living there must already have been farming barley by then.';
const lr = (id, stimulus, retired = false) => ({
  id, retired, sections: [{ id: 'lr1', kind: 'LR', questions: [{ number: 1, stimulus, stem: 'Which one of the following most weakens the argument?', choices: ['a', 'b', 'c', 'd', 'e'], answer: 'A' }] }],
});

test('a question carried into a new version of a test counts as seen', () => {
  const tests = [lr('t-v1', stim, true), lr('t-v2', stim.replace('nine thousand', '9,000'))];
  const seen = seenIds({ attempts: [{ qid: 't-v1:lr1:1', at: '2026-10-01T00:00:00Z' }], tests });
  assert.ok(seen.has('t-v2:lr1:1'));
});

test('unrelated questions are not linked', () => {
  const tests = [lr('a', stim, true), lr('b', 'Economist: when a city raises its sales tax, shoppers near the border drive to the next town, so the tax will raise less revenue than the council expects.')];
  assert.equal(contentLinks(tests).size, 0);
});
