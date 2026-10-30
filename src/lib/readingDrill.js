// Reading drill: whole unread RC passages read against a target that steps down toward the
// test's 3:30 as you meet it, with your accuracy on each passage's questions as the check.

import { shuffle } from './analytics.js';
import { RC_READ_SEC, passageMap, readingHistory } from './passages.js';

export const READING_STEP_SEC = 15; // how much faster each met target makes the next one
const START_MAX_SEC = 300;
const MIN_ACCURACY = 0.75; // below this, reading faster is costing too much; hold the target

const round5 = (s) => Math.round(s / 5) * 5;

/** How one reading drill went: { passages: [{ ms, n, right, note }], met, accurate, targetSec, nextSec }. */
export function readingDrillResult(session, index) {
  const targetSec = session.readingDrill.targetSec;
  const passages = [];
  session.sections.forEach((sec, si) => {
    const seen = new Set();
    for (const id of sec.qids) {
      const pid = index[id]?.passage?.id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      const qids = sec.qids.filter((x) => index[x]?.passage?.id === pid);
      const key = `${si}:${pid}`;
      passages.push({
        key, title: index[id].passage.title || null, ms: session.reading?.[key]?.ms ?? null, n: qids.length,
        right: qids.filter((x) => session.responses[x]?.first === index[x].question.answer).length,
        note: session.readingNotes?.[key] || '',
      });
    }
  });
  const read = passages.filter((p) => p.ms != null);
  // Five seconds of grace: the clock ticks in whole seconds.
  const met = read.length > 0 && read.every((p) => p.ms / 1000 <= targetSec + 5);
  const n = passages.reduce((t, p) => t + p.n, 0);
  const accurate = n > 0 && passages.reduce((t, p) => t + p.right, 0) / n >= MIN_ACCURACY;
  const nextSec = met && accurate ? Math.max(RC_READ_SEC, targetSec - READING_STEP_SEC) : targetSec;
  return { passages, met, accurate, targetSec, nextSec };
}

/**
 * The target for your next reading drill: where your last drill left it, or, before your first,
 * 15 seconds under your recent average reading time (from any RC you've read with the reading
 * pause), between 3:30 and 5:00. With no reading history it starts at 4:00.
 */
export function nextReadingTarget(sessions, index) {
  const last = Object.values(sessions)
    .filter((s) => s.readingDrill && s.phase === 'done' && !s.abandoned)
    .sort((a, b) => (b.finishedAt || '').localeCompare(a.finishedAt || ''))[0];
  if (last) return readingDrillResult(last, index).nextSec;
  const recent = readingHistory(sessions, index).slice(-4);
  if (!recent.length) return 240;
  const avg = recent.reduce((t, r) => t + r.ms / 1000, 0) / recent.length;
  return Math.min(START_MAX_SEC, Math.max(RC_READ_SEC, round5(avg - READING_STEP_SEC)));
}

/**
 * Whole passages you've never read any of, for a reading drill. Skill-builder passages come
 * first, so the practice tests' reading sections stay whole for stamina and full tests.
 */
export function readingDrillPassages(questions, seen, count = 2, rng = Math.random) {
  const groups = [...passageMap(questions.filter((q) => q.kind === 'RC')).values()]
    .filter((g) => g.length >= 4 && g.every((q) => !seen.has(q.id)));
  const practice = (g) => (g[0].testId.startsWith('skill-builder') ? 0 : 1);
  const ordered = shuffle(groups, rng).sort((a, b) => practice(a) - practice(b));
  return ordered.slice(0, count).flat();
}
