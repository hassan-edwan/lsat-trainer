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

test('finishing a level unlocks the next; a level you faded on is suggested again', async () => {
  const { ladderStatus } = await import('../src/lib/stamina.js');
  const h = (level, { passed = false, counts = true, fade = passed ? 0 : -10, kind = 'stamina', at = '2026-10-01' } = {}) => ({
    session: { stamina: level ? { level } : undefined, sections: [1, 2, 3, 4], kind, finishedAt: at },
    report: { passed: passed && counts, counts, fade },
  });
  assert.equal(currentLevel([]), 1);
  // Finished level 1 but faded: level 2 unlocks, level 1 is suggested again.
  let st = ladderStatus([h(1)]);
  assert.equal(st.unlocked, 2);
  assert.equal(st.next, 1);
  assert.equal(st.levels[0].completed, true);
  assert.equal(st.levels[0].passed, false);
  // Rushed sessions don't unlock anything.
  assert.equal(ladderStatus([h(1, { counts: false })]).unlocked, 1);
  // Passed 1, faded on 2: suggest 2, with 3 unlocked.
  st = ladderStatus([h(2, { at: '2026-10-02' }), h(1, { passed: true })]);
  assert.deepEqual([st.next, st.unlocked], [2, 3]);
  // A passed full test counts as level 4 and covers the levels below it.
  st = ladderStatus([h(null, { passed: true, kind: 'pt' })]);
  assert.deepEqual([st.next, st.unlocked], [5, 5]);
  assert.equal(currentLevel([h(5, { passed: true })]), 5);
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

test('long drills show a fade, short ones do not, and drills never move the ladder', async () => {
  const { isLongSitting, staminaHistory, unfinishedStamina } = await import('../src/lib/stamina.js');
  const { tests, index } = fixture();
  const sec = (s, limit) => ({ title: s.title, kind: s.kind, timeLimitSec: limit, elapsedSec: limit * 0.9, qids: s.questions.map((q) => q.id) });
  assert.equal(isLongSitting({ kind: 'drill', sections: [sec(tests[0].sections[0], 2100), sec(tests[0].sections[2], 1200)] }), true);
  assert.equal(isLongSitting({ kind: 'drill', sections: [sec(tests[0].sections[0], 800)] }), false);
  assert.equal(isLongSitting({ kind: 'diagnostic', sections: [sec(tests[0].sections[0], 3000)] }), true);
  const longDrill = { ...session(tests[0].sections.slice(0, 2), () => true), kind: 'drill', stamina: undefined, id: 'd1' };
  longDrill.sections = longDrill.sections.map((x) => ({ ...x, timeLimitSec: 2100, elapsedSec: 2000 }));
  const history = staminaHistory({ d1: longDrill }, [], index);
  assert.equal(history.length, 1);
  assert.equal(currentLevel(history), 1);
  const open = { id: 'u1', kind: 'stamina', phase: 'br', updatedAt: '2026-10-20' };
  assert.deepEqual(unfinishedStamina({ u1: open, d1: longDrill }).map((x) => x.id), ['u1']);
});

test('a session with a few blanks at the end still counts', () => {
  const { tests, index } = fixture();
  const s = session(tests[0].sections.slice(0, 2), (k) => k % 5 !== 0);
  // Ran out of time: last 8 of 50 unanswered (84% answered).
  const ids = s.sections.flatMap((x) => x.qids);
  ids.slice(-8).forEach((id) => { s.responses[id].first = null; });
  const r = staminaReport(s, index, expectedByDifficulty([], index));
  assert.equal(r.counts, true);
});

test('repeating a stamina level gives questions you have not seen', () => {
  const { tests } = fixture();
  let attempts = [];
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const s = createStaminaSession(1, tests, attempts);
    const qids = s.sections.flatMap((x) => x.qids);
    assert.equal(qids.length, 25);
    assert.ok(qids.every((id) => !seen.has(id)), `repeat in session ${i + 1}`);
    qids.forEach((id) => seen.add(id));
    attempts = [...attempts, ...qids.map((qid) => ({ qid, first: 'A', answer: 'A', at: '2026-10-01' }))];
  }
});
