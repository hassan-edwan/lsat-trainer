import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeImport } from '../src/lib/importer.js';
import { buildIndex, createDrillSession, createPTSession, finalizeSession, flatQuestions } from '../src/lib/session.js';
import { toCSV, toMarkdown } from '../src/lib/journal.js';

const [sample] = normalizeImport(JSON.parse(fs.readFileSync(new URL('../public/samples/sample-test.json', import.meta.url))));
const index = buildIndex([sample]);

function answerAll(session, pick) {
  for (const [qid, r] of Object.entries(session.responses)) Object.assign(r, pick(index[qid].question));
  return session;
}

test('PT session: wrong twice goes to the journal, BR-fixed does not', () => {
  const s = createPTSession(sample);
  const wrong = (q) => (q.answer === 'A' ? 'B' : 'A');
  const [q1, q2, q3] = sample.sections[0].questions;
  answerAll(s, (q) => ({ first: q.answer, br: q.answer }));
  Object.assign(s.responses[q1.id], { first: wrong(q1), br: wrong(q1) }); // wrong twice
  Object.assign(s.responses[q2.id], { first: wrong(q2), br: q2.answer }); // fixed in BR
  Object.assign(s.responses[q3.id], { first: q3.answer, br: wrong(q3) }); // broke in BR

  const { attempts, journalPuts, summary } = finalizeSession(s, index, {});
  assert.equal(attempts.length, 15);
  assert.equal(summary.total, 15);
  assert.equal(summary.firstCorrect, 13);
  assert.equal(summary.brCorrect, 13);
  assert.deepEqual(summary.outcomes, { 'correct': 12, 'wrong-twice': 1, 'br-fixed': 1, 'br-broke': 1 });
  assert.deepEqual(journalPuts.map((e) => e.qid), [q1.id]);
  assert.equal(journalPuts[0].stem, q1.stem);
});

test('repeat misses accumulate and correct retries master an entry', () => {
  const q1 = sample.sections[0].questions[0];
  const wrong = q1.answer === 'A' ? 'B' : 'A';
  const run = (journal, first, br) => {
    const s = createDrillSession([{ ...q1, kind: 'LR', testId: sample.id }]);
    Object.assign(s.responses[q1.id], { first, br });
    const { journalPuts } = finalizeSession(s, index, journal);
    return { ...journal, ...Object.fromEntries(journalPuts.map((e) => [e.qid, e])) };
  };
  let j = run({}, wrong, wrong);
  j = run(j, wrong, wrong);
  assert.equal(j[q1.id].occurrences.length, 2);
  j = run(j, q1.answer, q1.answer);
  assert.equal(j[q1.id].status, 'new');
  j = run(j, q1.answer, q1.answer);
  assert.equal(j[q1.id].status, 'mastered');
});

test('drill sessions keep RC passage questions together', () => {
  const qs = flatQuestions([sample]);
  const rc = qs.filter((q) => q.kind === 'RC');
  const lr = qs.filter((q) => q.kind === 'LR').slice(0, 2);
  const s = createDrillSession([rc[3], lr[0], rc[1], lr[1]]);
  const ids = s.sections[0].qids;
  const rcPositions = ids.map((id, i) => (index[id].passage ? i : -1)).filter((i) => i >= 0);
  assert.equal(rcPositions.length, 2);
  assert.equal(rcPositions[1] - rcPositions[0], 1);
  assert.equal(s.sections[0].timeLimitSec, 4 * 80);
});

test('journal exports include notes and question text', () => {
  const s = createPTSession(sample);
  answerAll(s, (q) => ({ first: q.answer === 'A' ? 'B' : 'A', br: q.answer === 'A' ? 'B' : 'A' }));
  const { journalPuts } = finalizeSession(s, index, {});
  journalPuts[0].myReasoning = 'I thought "streetlights" meant, everywhere';
  const md = toMarkdown(journalPuts);
  assert.match(md, /## Sample Test \(original questions\) — Logical Reasoning Q1/);
  assert.match(md, /I thought "streetlights" meant, everywhere/);
  const csv = toCSV(journalPuts);
  assert.equal(csv.split('\n')[0].split(',')[0], 'Test');
  assert.match(csv, /"I thought ""streetlights"" meant, everywhere"/);
});

test('unscored sections are excluded from the score', () => {
  const t = { ...sample, sections: sample.sections.map((sec, i) => (i === 1 ? { ...sec, scored: false } : sec)) };
  const idx = buildIndex([t]);
  const s = createPTSession(t);
  for (const [qid, r] of Object.entries(s.responses)) Object.assign(r, { first: idx[qid].question.answer });
  const { summary } = finalizeSession(s, idx, {});
  assert.equal(summary.total, 10);
  assert.equal(summary.bySection[1].total, 5);
});
