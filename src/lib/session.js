// Session construction and finalization (pure functions).

import { outcome } from './analytics.js';
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

/** Flat list for drill building: question fields plus section kind. */
export function flatQuestions(tests) {
  return tests.flatMap((t) => t.sections.flatMap((s) => s.questions.map((q) => ({ ...q, kind: s.kind, testId: t.id }))));
}

function blankResponse() {
  return { first: null, br: null, flagged: false, eliminated: [], brEliminated: [], highlights: [], timeMs: 0, brTimeMs: 0 };
}

export function createPTSession(test, { sectionIds = null, blindReview = true, timed = true, breakMinutes = 10 } = {}) {
  const sections = test.sections
    .filter((s) => !sectionIds || sectionIds.includes(s.id))
    .map((s) => ({
      title: s.title,
      kind: s.kind,
      timeLimitSec: timed ? s.timeLimitMinutes * 60 : null,
      elapsedSec: 0,
      qids: s.questions.map((q) => q.id),
    }));
  return baseSession({
    kind: 'pt',
    title: test.name,
    testId: test.id,
    sections,
    settings: { blindReview, breakAfterSection: sections.length >= 3 ? 1 : null, breakMinutes },
  });
}

export function createDrillSession(questions, { title = 'Drill', secondsPerQuestion = 80, blindReview = true } = {}) {
  // RC questions from the same passage are kept together so the passage is read once.
  const ordered = [];
  const seen = new Set();
  for (const q of questions) {
    if (seen.has(q.id)) continue;
    const group = q.passageId ? questions.filter((x) => x.passageId === q.passageId && x.testId === q.testId) : [q];
    group.sort((a, b) => a.number - b.number).forEach((x) => { seen.add(x.id); ordered.push(x); });
  }
  const kinds = new Set(ordered.map((q) => q.kind));
  return baseSession({
    kind: 'drill',
    title,
    sections: [{
      title,
      kind: kinds.size === 1 ? [...kinds][0] : 'MIXED',
      timeLimitSec: secondsPerQuestion ? secondsPerQuestion * ordered.length : null,
      elapsedSec: 0,
      qids: ordered.map((q) => q.id),
    }],
    settings: { blindReview, breakAfterSection: null },
  });
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
 * Turn a finished session into attempt rows and journal changes.
 * Returns { attempts, journalPuts, summary }.
 */
export function finalizeSession(session, index, journal) {
  const at = new Date().toISOString();
  const attempts = [];
  const journalPuts = [];
  const summary = { total: 0, firstCorrect: 0, brCorrect: 0, outcomes: {}, bySection: [] };

  session.sections.forEach((sec) => {
    const secSum = { title: sec.title, total: 0, firstCorrect: 0, brCorrect: 0 };
    for (const qid of sec.qids) {
      const entry = index[qid];
      if (!entry) continue;
      const { question, section, test, passage } = entry;
      const r = session.responses[qid];
      const br = session.settings.blindReview ? r.br ?? r.first : r.first;
      const oc = outcome(r.first, br, question.answer);
      // Experimental (unscored) sections count in the section table and stats, not the score.
      const scored = section.scored !== false;
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
        timeMs: r.timeMs, flagged: r.flagged, at,
      });

      const existing = journal[qid];
      const ctx = { testName: test.name, sectionTitle: section.title, kind: section.kind, passageText: passage?.text };
      if (oc === 'wrong-twice') {
        journalPuts.push(existing
          ? recordRepeat(recordRetry(existing, { correct: false, at }), { first: r.first, br, sessionId: session.id, at })
          : makeEntry(question, ctx, { first: r.first, br, sessionId: session.id, at }));
      } else if (existing) {
        journalPuts.push(recordRetry(existing, { correct: r.first === question.answer, at }));
      }
    }
    summary.bySection.push(secSum);
  });
  return { attempts, journalPuts, summary };
}
