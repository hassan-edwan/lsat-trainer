import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeImport, normalizeTest, parseTestText, splitStimulusAndStem } from '../src/lib/importer.js';

const sample = JSON.parse(fs.readFileSync(new URL('../public/samples/sample-test.json', import.meta.url)));

test('sample test is valid and keeps its explicit types', () => {
  const [t] = normalizeImport(sample);
  assert.equal(t.sections.length, 2);
  assert.equal(t.sections[0].questions.length, 10);
  assert.equal(t.sections[1].questions.length, 5);
  assert.ok(t.sections.flatMap((s) => s.questions).every((q) => !q.autoTagged));
  assert.equal(t.sections[1].questions[0].passageId, 'p1');
  assert.equal(t.sections[0].questions[0].id, 'sample-original-1:lr1:1');
});

test('sample test answers are not all the same letter', () => {
  const letters = new Set(sample.sections.flatMap((s) => s.questions.map((q) => q.answer)));
  assert.ok(letters.size >= 4);
});

test('auto-tags questions without types', () => {
  const t = normalizeTest({
    name: 'X',
    sections: [{ kind: 'LR', questions: [{ stem: 'Which one of the following, if true, most weakens the argument?', choices: ['a', 'b', 'c', 'd', 'e'], answer: 'b' }] }],
  });
  const q = t.sections[0].questions[0];
  assert.deepEqual(q.types, ['weaken']);
  assert.equal(q.autoTagged, true);
  assert.equal(q.answer, 'B');
});

test('reports every validation problem at once', () => {
  assert.throws(
    () => normalizeTest({ sections: [{ kind: 'XX', questions: [{ stem: '', choices: ['a'], answer: 'Z' }] }] }),
    (e) => /Missing "name"/.test(e.message) && /kind/.test(e.message) && /2–5 choices/.test(e.message) && /missing "stem"/.test(e.message),
  );
});

test('parses the plain-text format', () => {
  const raw = parseTestText(fs.readFileSync(new URL('../docs/examples/sample-text-format.txt', import.meta.url), 'utf8'));
  const t = normalizeTest(raw);
  assert.equal(t.name, 'Text Format Example');
  const [lr, rc] = t.sections;
  assert.equal(lr.kind, 'LR');
  assert.equal(lr.questions.length, 2);
  assert.match(lr.questions[0].stimulus, /^Pharmacist: .*more effective\.$/);
  assert.match(lr.questions[0].stem, /most seriously weakens/);
  assert.match(lr.questions[0].choices[1], /milder allergies before they began treatment\.$/);
  assert.deepEqual(lr.questions.map((q) => q.answer), ['B', 'A']);
  assert.deepEqual(lr.questions.map((q) => q.types[0]), ['weaken', 'must-be-true']);
  assert.equal(rc.kind, 'RC');
  assert.equal(rc.title, 'Reading Comprehension');
  assert.equal(rc.passages.length, 1);
  assert.match(rc.passages[0].text, /^Some historians/);
  assert.deepEqual(rc.questions.map((q) => q.passageId), ['p1', 'p1']);
  assert.deepEqual(rc.questions.map((q) => q.types[0]), ['rc-main-point', 'rc-detail']);
});

test('splits a single-paragraph LR question at the final question sentence', () => {
  const r = splitStimulusAndStem('Cats purr. Dogs bark. Which one of the following must be true?');
  assert.equal(r.stimulus, 'Cats purr. Dogs bark.');
  assert.equal(r.stem, 'Which one of the following must be true?');
});
