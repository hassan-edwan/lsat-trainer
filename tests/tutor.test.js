import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeImport } from '../src/lib/importer.js';
import { buildIndex, createPTSession, finalizeSession } from '../src/lib/session.js';
import { applyTutorNote, buildTutorPack, parseTutorNotes, tutorOrder } from '../src/lib/tutorExport.js';

const [sample] = normalizeImport(JSON.parse(fs.readFileSync(new URL('../public/samples/sample-test.json', import.meta.url))));
const index = buildIndex([sample]);

function missEverything() {
  const s = createPTSession(sample);
  for (const [qid, r] of Object.entries(s.responses)) {
    const a = index[qid].question.answer;
    Object.assign(r, { first: a === 'A' ? 'B' : 'A', br: a === 'A' ? 'B' : 'A' });
  }
  return finalizeSession(s, index, {}).journalPuts;
}

test('pack has instructions, profile, questions, and answers marked tutor-only', () => {
  const entries = missEverything();
  entries[0].myReasoning = 'I thought the sample was fine.';
  const md = buildTutorPack(entries, {
    profile: { weakCategories: [{ type: 'reasoning:causal', n: 6, firstAccuracy: 0.33 }], weakTypes: [], ladders: [{ title: 'Flaw', breaksAt: 3 }] },
  });
  assert.match(md, /## Instructions for the AI tutor/);
  assert.match(md, /Get their reasoning first/);
  assert.match(md, /Causal reasoning: 33% of 6/);
  assert.match(md, /Flaw: breaks at level 3/);
  assert.match(md, /I thought the sample was fine\./);
  assert.match(md, /```lsat-trainer-notes/);
  // Every question has a tutor-only answer line, and the answer only appears after the student-facing part.
  const blocks = md.split('### Question ').slice(1);
  assert.equal(blocks.length, entries.length);
  for (const b of blocks) {
    const tutor = b.indexOf('**TUTOR ONLY');
    assert.ok(tutor > 0);
    assert.ok(b.indexOf('Correct answer:') > tutor);
    assert.ok(b.indexOf('Official explanation:') > tutor);
  }
});

test('RC passages are printed once and referenced afterward', () => {
  const md = buildTutorPack(missEverything());
  const passageStart = 'For centuries, art historians attributed';
  assert.equal(md.split(passageStart).length - 1, 1);
  assert.match(md, /same passage as Question \d+ above/);
});

test('direct mode changes the teaching instruction', () => {
  const md = buildTutorPack(missEverything().slice(0, 1), { mode: 'direct' });
  assert.match(md, /reveal the correct answer and explain it/);
  assert.doesNotMatch(md, /Teach Socratically/);
});

test('order groups recurring categories first', () => {
  const e = (qid, tags, n = 1) => ({ qid, types: ['flaw'], tags, occurrences: Array(n).fill({}) });
  const ordered = tutorOrder([e('a', ['causal']), e('b', ['conditional']), e('c', ['conditional'], 2)]);
  assert.deepEqual(ordered.map((x) => x.qid), ['c', 'b', 'a']);
});

test('parses the notes block and merges without overwriting the student', () => {
  const reply = `Great session! Summary...\n\n\`\`\`lsat-trainer-notes\n[{"id":"q1","gap":"trap","correctReasoning":"It ignores other neighborhoods.","takeaway":"Check the sample.","traps":["Scope shift","Made up trap"]}]\n\`\`\``;
  const [note] = parseTutorNotes(reply);
  assert.equal(note.id, 'q1');
  assert.deepEqual(note.traps, ['Scope shift']);
  const merged = applyTutorNote({ qid: 'q1', correctReasoning: '', takeaway: 'My own rule.', tricky: '', traps: [], status: 'new' }, note);
  assert.equal(merged.correctReasoning, 'It ignores other neighborhoods.');
  assert.equal(merged.takeaway, 'My own rule.\n\nAI tutor: Check the sample.');
  assert.equal(merged.tricky, 'Gap (per AI tutor): trap');
  assert.equal(merged.status, 'reviewed');
  assert.deepEqual(applyTutorNote(merged, note).takeaway, merged.takeaway);
  assert.throws(() => parseTutorNotes('no block here'), /lsat-trainer-notes/);
});

test('pack includes per-choice breakdown notes in the tutor-only section', () => {
  const [e] = missEverything();
  const breakdown = { setup: [{ label: 'Conclusion', text: 'Streetlights everywhere will cut burglary.' }], analysis: 'Sample may not be representative.', choices: ['a', 'b', 'c', 'd', 'e'].map((x) => ({ note: `note ${x}`, example: x === 'b' ? 'Ex B' : undefined })) };
  const md = buildTutorPack([{ ...e, breakdown }]);
  const tutor = md.slice(md.indexOf('**TUTOR ONLY'));
  assert.match(tutor, /Analysis: Sample may not be representative\./);
  assert.match(tutor, /\(B\) note b/);
  assert.match(tutor, /Example of that reasoning: Ex B/);
});
