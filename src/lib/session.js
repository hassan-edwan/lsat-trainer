// Session construction and finalization (pure functions).

import { outcome } from './analytics.js';
import { RC_QUESTION_SEC, RC_READ_SEC } from './passages.js';
import { makeEntry, recordRepeat, recordRetry } from './journal.js';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** qid -> { question, section, test, passage } for every question in the library. */
export function buildIndex(tests) {
  const index = {};
  for (const test of tests) {
    for (const section of test.sections) {
      const passages = Object.fromEntries(section.passages.map((p) => [p.id, p]));
      for (const q of section.questions) {
        index[q.id] = { question: q, section, test, passage: q.passageId ? passages[q.passageId] : null };
      }
    }
  }
  return index;
}

/** Key for a passage's reading time (RC reading pause): one per passage per section, or null for LR. */
export function readingKey(sectionIdx, entry) {
  return entry?.passage ? `${sectionIdx}:${entry.passage.id}` : null;
}

/** Flat list for drill building: question fields plus section kind. */
export function flatQuestions(tests) {
  return tests.flatMap((t) => t.sections.flatMap((s) => s.questions.map((q) => ({ ...q, kind: s.kind, testId: t.id, purpose: t.purpose || 'test' }))));
}

function blankResponse() {
  return { first: null, br: null, flagged: false, eliminated: [], brEliminated: [], highlights: [], timeMs: 0, brTimeMs: 0 };
}

/**
 * Test-day mode: an unscored LR or RC section borrowed from another full test,
 * placed at a random position. Returns { section, at } or null.
 */
export function pickUnscoredSection(tests, test, rand = Math.random) {
  const pool = tests
    .filter((t) => t.id !== test.id && !t.retired && t.purpose !== 'diagnostic' && t.sections.length >= 3)
    .flatMap((t) => t.sections.filter((s) => s.kind === 'LR' || s.kind === 'RC'));
  if (!pool.length) return null;
  return { section: pool[Math.floor(rand() * pool.length)], at: Math.floor(rand() * (test.sections.length + 1)) };
}

export function createPTSession(test, { sectionIds = null, blindReview = true, timed = true, breakMinutes = 10, unscored = null } = {}) {
  const toSession = (s, scored = true) => ({
    title: s.title,
    kind: s.kind,
    timeLimitSec: timed ? s.timeLimitMinutes * 60 : null,
    elapsedSec: 0,
    qids: s.questions.map((q) => q.id),
    ...(scored ? {} : { scored: false }),
  });
  const sections = test.sections.filter((s) => !sectionIds || sectionIds.includes(s.id)).map((s) => toSession(s));
  if (unscored) sections.splice(Math.min(unscored.at, sections.length), 0, toSession(unscored.section, false));
  return baseSession({
    kind: 'pt',
    title: test.name,
    testId: test.id,
    sections,
    settings: { blindReview, breakAfterSection: sections.length >= 3 ? 1 : null, breakMinutes },
  });
}

/** A timed session made of whole sections, possibly from different tests (stamina training). */
export function createSectionsSession(sections, { kind, title, breakAfterSection = null, breakMinutes = 10, blindReview = true } = {}) {
  return baseSession({
    kind,
    title,
    sections: sections.map((s) => ({ title: s.title, kind: s.kind, timeLimitSec: s.timeLimitMinutes * 60, elapsedSec: 0, qids: s.questions.map((q) => q.id) })),
    settings: { blindReview, breakAfterSection, breakMinutes },
  });
}


export function createDrillSession(questions, { title = 'Drill', secondsPerQuestion = 80, blindReview = true, kind = 'drill', instant = false, training = null } = {}) {
  // RC questions from the same passage are kept together so the passage is read once.
  const ordered = [];
  const seen = new Set();
  for (const q of questions) {
    if (seen.has(q.id)) continue;
    const group = q.passageId ? questions.filter((x) => x.passageId === q.passageId && x.testId === q.testId) : [q];
    group.sort((a, b) => a.number - b.number).forEach((x) => { seen.add(x.id); ordered.push(x); });
  }
  // LR and RC run as separate sections with their own clocks: RC needs reading time per
  // passage, so a single per-question pace would be too generous for LR and too tight for RC.
  const lr = ordered.filter((q) => !q.passageId);
  const rc = ordered.filter((q) => q.passageId);
  const groups = [lr, rc].filter((g) => g.length);
  const scale = secondsPerQuestion / 80;
  const limit = (g) => {
    if (!secondsPerQuestion || instant) return null; // instant-feedback drills are self-paced
    if (!g[0].passageId) return Math.round(secondsPerQuestion * g.length);
    const passages = new Set(g.map((q) => `${q.testId}:${q.passageId}`)).size;
    return Math.round(scale * (RC_READ_SEC * passages + RC_QUESTION_SEC * g.length));
  };
  const session = baseSession({
    kind,
    title,
    sections: groups.map((g) => ({
      title: groups.length > 1 ? (g[0].passageId ? 'Reading Comprehension' : 'Logical Reasoning') : title,
      kind: g[0].passageId ? 'RC' : (g[0].kind || 'LR'),
      timeLimitSec: limit(g),
      elapsedSec: 0,
      qids: g.map((q) => q.id),
    })),
    settings: { blindReview: blindReview && !instant, instant, breakAfterSection: null },
  });
  // A mastery-path training set records the skill and level it trains.
  return training ? { ...session, training } : session;
}

function baseSession({ kind, title, testId = null, sections, settings }) {
  const responses = {};
  for (const s of sections) for (const id of s.qids) responses[id] = blankResponse();
  const now = new Date().toISOString();
  return {
    id: uid(), kind, title, testId, createdAt: now, updatedAt: now,
    phase: 'timed', // timed -> (break) -> br -> done
    current: { section: 0, index: 0 },
    sections, responses, settings,
  };
}

/**
 * Questions a session showed you: any you spent time on or answered, the one it was open on,
 * and every question of a passage you started reading (a read passage is spent).
 */
export function viewedQids(session, index) {
  const ids = new Set();
  session.sections.forEach((sec, si) => sec.qids.forEach((id, qi) => {
    const r = session.responses[id];
    const here = session.current.section === si && session.current.index === qi;
    if (here || r?.first || r?.timeMs > 0 || session.reading?.[readingKey(si, index[id])]) ids.add(id);
  }));
  for (const sec of session.sections) {
    const read = new Set(sec.qids.filter((id) => ids.has(id)).map((id) => index[id]?.passage?.id).filter(Boolean));
    sec.qids.forEach((id) => { if (read.has(index[id]?.passage?.id)) ids.add(id); });
  }
  return [...ids];
}

/**
 * Turn a finished session into attempt rows and journal changes.
 * Returns { attempts, journalPuts, summary }.
 */
export function finalizeSession(session, index, journal) {
  const at = new Date().toISOString();
  const attempts = [];
  const journalPuts = [];
  const summary = { total: 0, firstCorrect: 0, brCorrect: 0, outcomes: {}, bySection: [] };

  session.sections.forEach((sec) => {
    const secSum = { title: sec.title, total: 0, firstCorrect: 0, brCorrect: 0, ...(sec.scored === false ? { scored: false } : {}) };
    for (const qid of sec.qids) {
      const entry = index[qid];
      if (!entry) continue;
      const { question, section, test, passage } = entry;
      const r = session.responses[qid];
      const br = session.settings.blindReview ? r.br ?? r.first : r.first;
      const oc = outcome(r.first, br, question.answer);
      // Experimental (unscored) sections count in the section table and stats, not the score.
      const scored = section.scored !== false && sec.scored !== false;
      secSum.total += 1;
      if (r.first === question.answer) secSum.firstCorrect += 1;
      if (br === question.answer) secSum.brCorrect += 1;
      if (scored) {
        summary.total += 1;
        if (r.first === question.answer) summary.firstCorrect += 1;
        if (br === question.answer) summary.brCorrect += 1;
      }
      summary.outcomes[oc] = (summary.outcomes[oc] || 0) + 1;

      attempts.push({
        key: `${session.id}:${qid}`, sessionId: session.id, sessionKind: session.kind, qid,
        types: [...question.types], kind: section.kind, first: r.first, br, answer: question.answer,
        timeMs: r.timeMs, flagged: r.flagged, reviewed: !!session.settings.blindReview, at,
      });

      const existing = journal[qid];
      const ctx = { testName: test.name, sectionTitle: section.title, kind: section.kind, passageText: passage?.text };
      // A diagnostic is about finding weak spots, so every timed miss goes
      // to the journal for a write-up, not only misses that survive BR.
      const missed = oc === 'wrong-twice' || (session.kind === 'diagnostic' && r.first !== question.answer);
      if (missed) {
        journalPuts.push(existing
          ? recordRepeat(recordRetry(existing, { correct: false, at }), { first: r.first, br, sessionId: session.id, at })
          : makeEntry(question, ctx, { first: r.first, br, sessionId: session.id, at, source: session.kind === 'diagnostic' ? 'diagnostic' : 'auto' }));
      } else if (existing) {
        journalPuts.push(recordRetry(existing, { correct: r.first === question.answer, at }));
      }
    }
    summary.bySection.push(secSum);
  });
  return { attempts, journalPuts, summary };
}
