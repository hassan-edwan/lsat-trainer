// Skill diagnostic: "ladders" of five questions per skill at difficulty
// levels 1–5. The level where you start missing is your breaking point.

import { outcome, shuffle } from './analytics.js';

export const LEVELS = [1, 2, 3, 4, 5];

// `drill` says which questions in the wider library train the same skill.
export const LADDERS = [
  { id: 'conditional', title: 'Conditional Reasoning', kind: 'LR', drill: { skills: ['conditional'] } },
  { id: 'debate', title: 'Debate & Dialogue', kind: 'LR', drill: { skills: ['debate'] } },
  { id: 'flaw', title: 'Flaw', kind: 'LR', drill: { types: ['flaw', 'parallel-flaw'] } },
  { id: 'necessary-assumption', title: 'Necessary Assumption', kind: 'LR', drill: { types: ['necessary-assumption'] } },
  { id: 'sufficient-assumption', title: 'Sufficient Assumption', kind: 'LR', drill: { types: ['sufficient-assumption'] } },
  { id: 'strengthen', title: 'Strengthen', kind: 'LR', drill: { types: ['strengthen', 'principle-strengthen'] } },
  { id: 'weaken', title: 'Weaken', kind: 'LR', drill: { types: ['weaken'] } },
  { id: 'explain', title: 'Explain / Paradox', kind: 'LR', drill: { types: ['explain'] } },
  { id: 'evaluate', title: 'Evaluate', kind: 'LR', drill: { types: ['evaluate'] } },
  { id: 'inference', title: 'Inference (MBT / MSS / MBF)', kind: 'LR', drill: { types: ['must-be-true', 'most-strongly-supported', 'must-be-false'] } },
  { id: 'principle', title: 'Principle', kind: 'LR', drill: { types: ['principle-strengthen', 'principle-apply'] } },
  { id: 'parallel', title: 'Parallel Reasoning', kind: 'LR', drill: { types: ['parallel', 'parallel-flaw'] } },
  { id: 'structure', title: 'Argument Structure', kind: 'LR', drill: { types: ['main-conclusion', 'role', 'method'] } },
  { id: 'rc-big-picture', title: 'RC: Main Point & Structure', kind: 'RC', drill: { types: ['rc-main-point', 'rc-structure'] } },
  { id: 'rc-detail', title: 'RC: Detail', kind: 'RC', drill: { types: ['rc-detail'] } },
  { id: 'rc-inference', title: 'RC: Inference & Analogy', kind: 'RC', drill: { types: ['rc-inference', 'rc-analogy'] } },
  { id: 'rc-author', title: 'RC: Author & Function', kind: 'RC', drill: { types: ['rc-author-attitude', 'rc-function', 'rc-meaning'] } },
];

export function ladderOf(question) {
  const tag = (question.tags || []).find((t) => t.startsWith('ladder:'));
  return tag ? tag.slice('ladder:'.length) : null;
}

/** Diagnostic questions grouped as { [ladderId]: { [level]: question[] } }. */
export function ladderQuestions(questions) {
  const out = {};
  for (const q of questions) {
    const id = ladderOf(q);
    if (!id || q.difficulty == null) continue;
    ((out[id] ||= {})[q.difficulty] ||= []).push(q);
  }
  return out;
}

/**
 * Latest result per ladder and level, plus the breaking point: the first
 * level missed on the timed pass. `cleared` is the highest level reached
 * with every level up to it correct.
 */
export function ladderResults(questions, attempts) {
  const byLadder = ladderQuestions(questions);
  const latest = {};
  for (const a of attempts) {
    if (!latest[a.qid] || a.at >= latest[a.qid].at) latest[a.qid] = a;
  }
  return LADDERS.filter((l) => byLadder[l.id]).map((l) => {
    const levels = LEVELS.map((level) => {
      const qs = byLadder[l.id][level] || [];
      const tried = qs.map((q) => latest[q.id]).filter(Boolean);
      if (!qs.length) return { level, status: 'none', questions: qs };
      if (!tried.length) return { level, status: 'untried', questions: qs };
      const results = tried.map((a) => outcome(a.first, a.br, a.answer));
      const status = results.every((r) => r === 'correct' || r === 'br-broke') ? 'correct'
        : results.every((r) => r === 'br-fixed' || r === 'correct' || r === 'br-broke') ? 'br-fixed'
          : 'wrong';
      return { level, status, questions: qs, attempts: tried };
    });
    const firstMiss = levels.find((x) => x.status === 'br-fixed' || x.status === 'wrong');
    const tried = levels.filter((x) => x.status !== 'untried' && x.status !== 'none');
    let cleared = 0;
    for (const x of levels) {
      if (x.status === 'correct') cleared = x.level; else break;
    }
    return { ...l, levels, breaksAt: firstMiss?.level ?? null, cleared, complete: tried.length === levels.filter((x) => x.status !== 'none').length };
  });
}

/**
 * Order questions for a diagnostic run: all level-1 questions first, then
 * level 2, and so on, with skills shuffled within each level. RC questions
 * from the same passage stay together (createDrillSession groups them).
 */
export function diagnosticOrder(questions, ladderIds, rng = Math.random) {
  const wanted = new Set(ladderIds);
  const chosen = questions.filter((q) => wanted.has(ladderOf(q)));
  const out = [];
  for (const level of LEVELS) {
    const atLevel = chosen.filter((q) => q.difficulty === level);
    const lr = shuffle(atLevel.filter((q) => !q.passageId), rng);
    const rc = atLevel.filter((q) => q.passageId).sort((a, b) => a.number - b.number);
    out.push(...lr, ...rc);
  }
  return out;
}
