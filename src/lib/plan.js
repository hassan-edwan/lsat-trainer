// The daily plan: a short queue of high-value tasks, rebuilt from history.

import { buildDrill, categoryStats, shuffle } from './analytics.js';
import { categoryLabel } from './taxonomy.js';
import { dayKey, isWrittenUp } from './progress.js';
import { STAMINA_LEVELS, currentLevel, staminaHistory } from './stamina.js';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Weakest category with enough attempts to mean something, or null. */
export function weakestCategory(attempts) {
  const rows = Object.values(categoryStats(attempts)).filter((c) => c.n >= 3 && !c.type.startsWith('subject:'));
  rows.sort((a, b) => a.firstAccuracy - b.firstAccuracy || b.n - a.n);
  return rows[0] || null;
}

/**
 * Tasks for today. Each has { id, icon, title, detail, done, action } where
 * action is { kind: 'drill', questions, opts } | { kind: 'test', testId } |
 * { kind: 'link', href } | { kind: 'stamina', level }.
 */
export function dailyPlan({ tests, sessions, attempts, journal, index, questions, progress, now = Date.now() }) {
  const today = dayKey(now);
  const doneToday = new Set(Object.values(sessions)
    .filter((s) => s.phase === 'done' && s.queue?.day === today)
    .map((s) => s.queue.task));
  const tasks = [];

  // 1. Spaced review of journal mistakes that are due.
  const due = progress.due.filter((e) => index[e.qid]).slice(0, 10);
  tasks.push({
    id: 'review',
    icon: '🔁',
    title: due.length ? `Review ${due.length} mistake${due.length === 1 ? '' : 's'} due today` : 'Mistake review',
    detail: due.length ? 'Questions you missed before, back on a 1-3-7-14-day schedule.' : 'Nothing due. Misses come back here on schedule.',
    done: doneToday.has('review') || due.length === 0,
    action: due.length ? {
      kind: 'drill',
      questions: due.map((e) => index[e.qid]).map(({ question, section, test }) => ({ ...question, kind: section.kind, testId: test.id })),
      opts: { title: 'Mistake review', instant: true },
    } : null,
  });

  // 2. Weak-spot drill on the weakest category (or a smart drill before there's data).
  const weak = weakestCategory(attempts);
  const weakQs = weak
    ? buildDrill(questions, attempts, journal, { mode: 'types', categories: [weak.type], kinds: ['LR', 'RC'], count: 10 })
    : buildDrill(questions, attempts, journal, { mode: 'smart', kinds: ['LR'], count: 10 });
  tasks.push({
    id: 'weakness',
    icon: '🎯',
    title: weak ? `Weak spot: ${categoryLabel(weak.type)}` : 'Starter drill',
    detail: weak ? `You're at ${Math.round(weak.firstAccuracy * 100)}% here. 10 questions with instant feedback.` : '10 mixed questions with instant feedback to find your weak spots.',
    done: doneToday.has('weakness'),
    action: weakQs.length ? { kind: 'drill', questions: weakQs, opts: { title: weak ? `Weak spot: ${categoryLabel(weak.type)}` : 'Starter drill', instant: true } } : null,
  });

  // 3. Stretch set: the hardest questions, timed, with blind review.
  const seen = new Set(attempts.map((a) => a.qid));
  const hard = questions.filter((q) => q.difficulty === 5 && q.kind === 'LR');
  const stretch = shuffle([...hard.filter((q) => !seen.has(q.id)), ...shuffle(hard.filter((q) => seen.has(q.id)))]).slice(0, 5);
  tasks.push({
    id: 'stretch',
    icon: '🧗',
    title: 'Stretch set: 5 level-5 questions',
    detail: 'The hardest questions in the bank, at test pace, with blind review.',
    done: doneToday.has('stretch'),
    action: stretch.length ? { kind: 'drill', questions: stretch, opts: { title: 'Stretch set', secondsPerQuestion: 80 } } : null,
  });

  // 4. One bigger task: diagnostic, journal write-ups, a weekly full test, or a stamina session.
  const done = Object.values(sessions).filter((s) => s.phase === 'done');
  const pendingWriteups = Object.values(journal).filter((e) => e.status !== 'mastered' && !isWrittenUp(e)).length;
  const recentTest = done.some((s) => s.kind === 'pt' && now - new Date(s.finishedAt).getTime() < WEEK_MS);
  const takenIds = new Set(done.filter((s) => s.kind === 'pt').map((s) => s.testId));
  const fresh = tests.find((t) => t.purpose !== 'diagnostic' && !takenIds.has(t.id) && t.sections.length >= 3);
  if (!done.some((s) => s.kind === 'diagnostic')) {
    tasks.push({ id: 'diagnostic', icon: '🩺', title: 'Take the skill diagnostic', detail: 'Find the level where each skill breaks. Pick a few ladders if you are short on time.', done: false, action: { kind: 'link', href: '#/diagnostic' } });
  } else if (pendingWriteups > 0) {
    tasks.push({ id: 'writeups', icon: '✍️', title: `Write up ${Math.min(pendingWriteups, 3)} journal entr${Math.min(pendingWriteups, 3) === 1 ? 'y' : 'ies'}`, detail: `Thought process, what was tricky, and the takeaway (+15 XP each). ${pendingWriteups} waiting.`, done: false, action: { kind: 'link', href: '#/journal' } });
  } else if (!recentTest && fresh) {
    tasks.push({ id: 'test', icon: '📝', title: `Weekly full test: ${fresh.name}`, detail: 'Test-day conditions, then blind review.', done: false, action: { kind: 'test', testId: fresh.id } });
  } else {
    // Midweek: a long sitting if there hasn't been one (stamina or full test) in the last 3 days.
    const long = done.filter((s) => s.kind === 'stamina' || (s.kind === 'pt' && s.sections.length >= 2));
    const recentLong = long.some((s) => now - new Date(s.finishedAt).getTime() < 3 * DAY_MS);
    if (!recentLong || doneToday.has('stamina')) {
      const level = currentLevel(staminaHistory(sessions, attempts, index));
      const spec = STAMINA_LEVELS[level - 1];
      tasks.push({ id: 'stamina', icon: '⏳', title: `Stamina level ${level}: ${spec.title}`, detail: `${spec.detail} Pass by keeping your late fade under 6 points.`, done: doneToday.has('stamina'), action: { kind: 'stamina', level } });
    }
  }
  return tasks;
}
