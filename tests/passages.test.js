import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paceSec, wholePassages } from '../src/lib/passages.js';
import { trainingSet } from '../src/lib/mastery.js';
import { buildDrill } from '../src/lib/analytics.js';
import { createDrillSession } from '../src/lib/session.js';

// Six passages of 5 to 8 questions; each passage has a couple of detail questions at every level.
function library() {
  const questions = [];
  const sizes = [6, 8, 7, 5, 6, 7];
  sizes.forEach((size, p) => {
    for (let i = 0; i < size; i++) {
      questions.push({
        id: `p${p}-q${i}`, kind: 'RC', testId: 't1', passageId: `p${p}`, number: i + 1, answer: 'A', tags: [],
        types: [i < 3 ? 'rc-detail' : 'rc-main-point'], difficulty: (i % 5) + 1,
      });
    }
  });
  for (let i = 0; i < 20; i++) questions.push({ id: `lr${i}`, kind: 'LR', testId: 't1', number: i + 1, answer: 'A', tags: [], types: ['flaw'], difficulty: 3 });
  return questions;
}
const passageCounts = (qs) => {
  const c = {};
  qs.filter((q) => q.passageId).forEach((q) => { c[q.passageId] = (c[q.passageId] || 0) + 1; });
  return c;
};
const sizeOf = (questions, pid) => questions.filter((q) => q.passageId === pid).length;

test('whole passages: every question of a passage, never part of one', () => {
  const qs = library();
  const { questions } = wholePassages([qs[1]], qs, { count: 2 });
  assert.equal(questions.length, 6);
  assert.ok(questions.every((q) => q.passageId === 'p0'));
});

test('an RC training set is one whole passage you have never seen', () => {
  const qs = library();
  const attempts = [{ qid: 'p0-q0', first: 'A', br: 'A', answer: 'A', at: '2026-10-20T00:00:00Z' }];
  const set = trainingSet('rc-detail', 3, { questions: qs, attempts, now: new Date('2026-10-21').getTime() });
  const counts = passageCounts(set);
  assert.equal(Object.keys(counts).length, 1);
  const [pid] = Object.keys(counts);
  assert.notEqual(pid, 'p0');
  assert.equal(counts[pid], sizeOf(qs, pid));
});

test('drills from the drill builder take whole RC passages, preferring unseen ones', () => {
  const qs = library();
  const attempts = qs.filter((q) => q.passageId === 'p1').map((q) => ({ qid: q.id, first: 'A', br: 'A', answer: 'A', at: '2026-10-01T00:00:00Z' }));
  const picked = buildDrill(qs, attempts, {}, { mode: 'types', types: ['rc-detail'], kinds: ['RC'], count: 8 });
  const counts = passageCounts(picked);
  assert.ok(!counts.p1);
  for (const [pid, n] of Object.entries(counts)) assert.equal(n, sizeOf(qs, pid));
  assert.ok(picked.length >= 5 && picked.length <= 10);
});

test('RC pace leaves reading time out; LR pace is the section time per question', () => {
  const qs = library();
  const session = createDrillSession([...qs.slice(0, 6), qs.find((q) => q.id === 'lr0')], { secondsPerQuestion: 80 });
  const index = Object.fromEntries(qs.map((q) => [q.id, { question: q, test: { id: q.testId }, passage: q.passageId ? { id: q.passageId } : null }]));
  const [lr, rc] = session.sections;
  assert.equal(lr.timeLimitSec, 80);
  assert.equal(paceSec(lr, index), 80);
  assert.equal(rc.timeLimitSec, 210 + 6 * 47);
  assert.equal(paceSec(rc, index), 47);
});

test('reading target is 3:30 at test pace, scaled by the drill pace; history lists each passage read', async () => {
  const { readTargetSec, readingHistory } = await import('../src/lib/passages.js');
  const qs = library();
  const index = Object.fromEntries(qs.map((q) => [q.id, { question: q, test: { id: q.testId }, passage: q.passageId ? { id: q.passageId } : null }]));
  const six = qs.slice(0, 6);
  const atPace = createDrillSession(six, { secondsPerQuestion: 80 }).sections[0];
  const relaxed = createDrillSession(six, { secondsPerQuestion: 100 }).sections[0];
  assert.equal(readTargetSec(atPace, index), 210);
  assert.ok(readTargetSec(relaxed, index) > 250);
  const s = createDrillSession(six, { secondsPerQuestion: 80 });
  s.phase = 'done'; s.finishedAt = '2026-10-29T12:00:00Z';
  s.reading = { '0:p0': { ms: 250_000, done: true }, '0:p9': { ms: 10_000, done: true } };
  six.forEach((q, i) => { s.responses[q.id].first = i < 5 ? 'A' : 'B'; });
  const h = readingHistory({ [s.id]: s }, index);
  assert.equal(h.length, 1);
  assert.deepEqual([h[0].ms, h[0].n, h[0].right, h[0].targetSec], [250_000, 6, 5, 210]);
});

test('reading drill: unread passages only, targets step down 15s when met with 75%+, and hold otherwise', async () => {
  const { nextReadingTarget, readingDrillPassages, readingDrillResult } = await import('../src/lib/readingDrill.js');
  const qs = library();
  const index = Object.fromEntries(qs.map((q) => [q.id, { question: q, test: { id: q.testId }, passage: q.passageId ? { id: q.passageId } : null }]));
  const seen = new Set(qs.filter((q) => q.passageId === 'p0' || q.id === 'p1-q3').map((q) => q.id));
  const picked = readingDrillPassages(qs, seen, 2);
  const pids = [...new Set(picked.map((q) => q.passageId))];
  assert.equal(pids.length, 2);
  assert.ok(!pids.includes('p0') && !pids.includes('p1'));
  for (const pid of pids) assert.equal(picked.filter((q) => q.passageId === pid).length, qs.filter((q) => q.passageId === pid).length);
  // No history: 4:00 to start.
  assert.equal(nextReadingTarget({}, index), 240);
  const drill = (targetSec, readSec, rightOf) => {
    const s = createDrillSession(qs.filter((q) => q.passageId === 'p2'), { secondsPerQuestion: 80 });
    Object.assign(s, { phase: 'done', finishedAt: '2026-10-30T12:00:00Z', readingDrill: { targetSec }, reading: { '0:p2': { ms: readSec * 1000, done: true } } });
    s.sections[0].qids.forEach((id, i) => { s.responses[id].first = i < rightOf ? 'A' : 'B'; });
    return s;
  };
  assert.equal(readingDrillResult(drill(240, 230, 7), index).nextSec, 225); // met, 7/7
  assert.equal(readingDrillResult(drill(240, 260, 7), index).nextSec, 240); // too slow
  assert.equal(readingDrillResult(drill(240, 230, 4), index).nextSec, 240); // fast but 4/7
  assert.equal(readingDrillResult(drill(215, 200, 7), index).nextSec, 210); // never below 3:30
  const s = drill(240, 230, 7);
  assert.equal(nextReadingTarget({ [s.id]: s }, index), 225);
});
