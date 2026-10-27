import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTheta, evidenceOf, masteryTrack, predictScore, priorities, scoreFromPct, shownEntries, skillProfile, trainingPool, trainingSet,
} from '../src/lib/mastery.js';

const at = '2026-10-20T00:00:00Z';
const now = new Date('2026-10-21T00:00:00Z').getTime();

// A small library: flaw and weaken LR questions at every level, plus a diagnostic ladder question.
function library() {
  const questions = [];
  for (const type of ['flaw', 'weaken', 'necessary-assumption']) {
    for (const d of [1, 2, 3, 4, 5]) {
      for (let i = 0; i < 6; i++) questions.push({ id: `${type}-${d}-${i}`, kind: 'LR', types: [type], tags: [], difficulty: d, answer: 'A', number: i + 1 });
    }
  }
  questions.push({ id: 'ladder-flaw-3', kind: 'LR', types: ['flaw'], tags: ['ladder:flaw'], difficulty: 3, answer: 'A', purpose: 'diagnostic', number: 1 });
  const index = Object.fromEntries(questions.map((q) => [q.id, { question: q, section: { kind: 'LR' }, test: {} }]));
  return { questions, index };
}
const att = (qid, first, br = first, extra = {}) => ({ qid, first, br, answer: 'A', at, sessionId: 's1', reviewed: true, ...extra });

test('evidence: a blind-review fix is an execution slip, a miss that survives it is a genuine gap', () => {
  assert.equal(evidenceOf({ first: 'A', br: 'A', answer: 'A' }, true), 'correct');
  assert.equal(evidenceOf({ first: 'B', br: 'A', answer: 'A' }, true), 'execution');
  assert.equal(evidenceOf({ first: 'B', br: 'B', answer: 'A' }, true), 'genuine');
  assert.equal(evidenceOf({ first: 'B', br: 'B', answer: 'A' }, false), 'unreviewed');
  assert.equal(evidenceOf({ first: 'A', br: 'C', answer: 'A' }, true), 'br-broke');
});

test('ability rises with harder questions answered right', () => {
  const B = [-2, -1, 0, 1, 2];
  const low = estimateTheta(B.map((b, i) => ({ b, y: i < 2 ? 1 : 0, w: 1 })), 0, 1.5);
  const high = estimateTheta(B.map((b, i) => ({ b, y: i < 4 ? 1 : 0, w: 1 })), 0, 1.5);
  assert.ok(high.theta > low.theta + 0.5);
  assert.ok(low.se > 0 && low.se < 1.5);
  assert.ok(scoreFromPct(0.53) > 154 && scoreFromPct(0.53) < 156);
  assert.equal(scoreFromPct(1), 180);
});

test('misses fixed in blind review read as execution, not a skill gap', () => {
  const { questions, index } = library();
  const attempts = [];
  // Flaw: right on levels 1-2, levels 3-5 missed under time but fixed in blind review.
  for (const d of [1, 2, 3, 4, 5]) for (let i = 0; i < 3; i++) attempts.push(d <= 2 ? att(`flaw-${d}-${i}`, 'A') : att(`flaw-${d}-${i}`, 'B', 'A'));
  // Weaken: levels 3-5 still wrong after blind review.
  for (const d of [1, 2, 3, 4, 5]) for (let i = 0; i < 3; i++) attempts.push(d <= 2 ? att(`weaken-${d}-${i}`, 'A') : att(`weaken-${d}-${i}`, 'B', 'C'));
  const p = skillProfile({ attempts, index, now });
  const flaw = p.skills.find((s) => s.id === 'flaw');
  const weaken = p.skills.find((s) => s.id === 'weaken');
  assert.equal(flaw.diagnosis, 'execution');
  assert.equal(weaken.diagnosis, 'gap');
  assert.ok(flaw.understanding.theta > weaken.understanding.theta + 1);
  assert.equal(flaw.counts.execution, 9);
  // Fixing the slips would raise the score.
  assert.ok(predictScore(p, { field: 'understanding' }).score > predictScore(p).score);
  // The genuine gap ranks ahead of the execution problem.
  const order = priorities(p).map((s) => s.id);
  assert.ok(order.indexOf('weaken') < order.indexOf('flaw'));
});

test('a level is mastered at 3 of the last 4 right with none still wrong after blind review', () => {
  const { questions, index } = library();
  const attempts = [
    att('flaw-1-0', 'B', 'B', { at: '2026-10-01T00:00:00Z' }),
    att('flaw-1-1', 'A'), att('flaw-1-2', 'A'), att('flaw-1-3', 'B', 'A'), att('flaw-1-4', 'A'),
    att('flaw-2-0', 'A'), att('flaw-2-1', 'B', 'B'), att('flaw-2-2', 'A'), att('flaw-2-3', 'A'),
  ];
  const p = skillProfile({ attempts, index, now });
  const flaw = { ...p.skills.find((s) => s.id === 'flaw'), n: 0 }; // no placement, so every level is earned
  const t = masteryTrack(flaw, p.rows, trainingPool('flaw', questions));
  assert.equal(t.levels[0].status, 'mastered'); // old genuine miss fell out of the window; 3 of 4 right with a slip
  assert.equal(t.levels[1].status, 'working'); // a genuine miss in the window
  assert.equal(t.through, 1);
  assert.equal(t.next, 2);
});

test('training sets centre on the level and skip diagnostic questions', () => {
  const { questions } = library();
  const set = trainingSet('flaw', 3, { questions, attempts: [] });
  assert.equal(set.length, 8);
  assert.ok(!set.some((q) => q.purpose === 'diagnostic'));
  assert.ok(set.every((q) => q.types.includes('flaw')));
  const byLevel = set.reduce((m, q) => ({ ...m, [q.difficulty]: (m[q.difficulty] || 0) + 1 }), {});
  assert.equal(byLevel[4], 2);
  assert.ok(byLevel[3] >= 4);
});

test('every set is questions you have never answered, until a skill runs out', () => {
  const { questions } = library();
  const nowMs = new Date('2026-10-21T00:00:00Z').getTime();
  // Answered long ago, answered yesterday, and sitting in an unfinished set: all skipped while new ones remain.
  const attempts = [att('flaw-3-0', 'A', 'A', { at: '2026-06-01T00:00:00Z' }), att('flaw-3-1', 'A', 'A', { at: '2026-10-20T00:00:00Z' })];
  const ids = trainingSet('flaw', 3, { questions, attempts, pending: ['flaw-3-2'], now: nowMs }).map((q) => q.id);
  for (const id of ['flaw-3-0', 'flaw-3-1', 'flaw-3-2']) assert.ok(!ids.includes(id), id);
  // Back-to-back sets never repeat while unanswered questions remain (30 flaw questions here).
  const seen = new Set();
  let history = [];
  for (let round = 0; round < 3; round++) {
    const set = trainingSet('flaw', 3, { questions, attempts: history, now: nowMs });
    assert.equal(set.length, 8);
    for (const q of set) { assert.ok(!seen.has(q.id), `repeat ${q.id}`); seen.add(q.id); }
    history = [...history, ...set.map((q) => att(q.id, 'A', 'A', { at: '2026-10-20T00:00:00Z' }))];
  }
  // Everything answered yesterday: nothing to offer rather than a repeat.
  const all = questions.filter((q) => q.types.includes('flaw')).map((q) => att(q.id, 'A', 'A', { at: '2026-10-20T00:00:00Z' }));
  assert.equal(trainingSet('flaw', 3, { questions, attempts: all, now: nowMs }).length, 0);
  // Everything answered long ago: the oldest come back.
  const longAgo = questions.filter((q) => q.types.includes('flaw')).map((q, i) => att(q.id, 'A', 'A', { at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }));
  assert.equal(trainingSet('flaw', 3, { questions, attempts: longAgo, now: nowMs }).length, 8);
});

test('a question repeated within two weeks does not count toward mastery', () => {
  const { questions, index } = library();
  const attempts = [
    att('flaw-1-0', 'B', 'B', { at: '2026-10-18T00:00:00Z' }),
    att('flaw-1-0', 'A', 'A', { at: '2026-10-19T00:00:00Z' }),
    att('flaw-1-0', 'A', 'A', { at: '2026-10-19T01:00:00Z' }),
    att('flaw-1-0', 'A', 'A', { at: '2026-10-19T02:00:00Z' }),
  ];
  const p = skillProfile({ attempts, index, now });
  const flaw = { ...p.skills.find((s) => s.id === 'flaw'), n: 0 };
  const t = masteryTrack(flaw, p.rows, trainingPool('flaw', questions), now);
  assert.equal(t.levels[0].recent, 1);
  assert.notEqual(t.levels[0].status, 'mastered');
  assert.equal(t.levels[0].unseen, 5);
});

test('questions a closed set showed you count as seen', () => {
  const { questions } = library();
  const nowMs = new Date('2026-10-21T00:00:00Z').getTime();
  const sessions = { s1: { phase: 'done', finishedAt: '2026-10-20T00:00:00Z', shownQids: ['flaw-3-0', 'flaw-3-1', 'flaw-3-2', 'flaw-3-3'] } };
  const ids = trainingSet('flaw', 3, { questions, attempts: shownEntries(sessions), now: nowMs }).map((q) => q.id);
  for (const id of sessions.s1.shownQids) assert.ok(!ids.includes(id), id);
});
