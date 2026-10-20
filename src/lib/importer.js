// Import and validation for test content.
//
// The app never ships copyrighted test content. Users import tests they
// have the right to use, either as JSON (see docs/FORMAT.md) or as plain
// text that `parseTestText` converts.

import { QUESTION_TYPES, classifyStem, detectSkills, stemFeatureTags } from './taxonomy.js';

export const FORMAT_ID = 'lsat-trainer/v1';
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const DEFAULT_MINUTES = 35;

export function questionId(testId, sectionId, number) {
  return `${testId}:${sectionId}:${number}`;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'test';
}

/**
 * Validate and normalize a test object. Throws an Error listing every
 * problem found, so a user fixing a file sees them all at once.
 * Missing question types are filled in by the stem classifier and marked
 * `autoTagged: true`.
 */
export function normalizeTest(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') throw new Error('Test must be a JSON object.');
  const name = String(raw.name || '').trim();
  if (!name) errors.push('Missing "name".');
  const id = slug(raw.id || name);
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    errors.push('"sections" must be a non-empty array.');
  }

  const sections = (raw.sections || []).map((s, si) => {
    const where = `Section ${si + 1}`;
    const kind = String(s.kind || '').toUpperCase();
    if (!['LR', 'RC', 'AR'].includes(kind)) errors.push(`${where}: "kind" must be LR, RC, or AR.`);
    const sectionId = slug(s.id || `s${si + 1}`);
    const passages = (s.passages || []).map((p, pi) => ({
      id: String(p.id || `p${pi + 1}`),
      title: p.title ? String(p.title) : '',
      text: String(p.text || ''),
    }));
    const passageIds = new Set(passages.map((p) => p.id));
    if (!Array.isArray(s.questions) || s.questions.length === 0) {
      errors.push(`${where}: "questions" must be a non-empty array.`);
    }
    const questions = (s.questions || []).map((q, qi) => {
      const qWhere = `${where}, question ${q.number ?? qi + 1}`;
      const number = Number(q.number ?? qi + 1);
      const choices = Array.isArray(q.choices) ? q.choices.map(String) : [];
      if (choices.length < 2 || choices.length > 5) errors.push(`${qWhere}: needs 2–5 choices.`);
      const answer = String(q.answer || '').trim().toUpperCase();
      if (!LETTERS.slice(0, choices.length).includes(answer)) {
        errors.push(`${qWhere}: "answer" must be one of ${LETTERS.slice(0, choices.length).join(', ')}.`);
      }
      if (!String(q.stem || '').trim()) errors.push(`${qWhere}: missing "stem".`);
      if (q.passageId != null && !passageIds.has(String(q.passageId))) {
        errors.push(`${qWhere}: passageId "${q.passageId}" not found in section passages.`);
      }
      let types = Array.isArray(q.types) ? q.types.filter((t) => QUESTION_TYPES[t]) : [];
      const autoTagged = types.length === 0;
      if (autoTagged) types = classifyStem(q.stem, kind);
      const tags = Array.from(new Set([...(q.tags || []), ...stemFeatureTags(q.stem),
        // An explicit `skills` array (even empty) means a person reviewed it; otherwise guess.
        ...(Array.isArray(q.skills) ? q.skills : detectSkills(q.stimulus, q.stem, kind))]));
      const difficulty = q.difficulty == null ? null : Math.max(1, Math.min(5, Number(q.difficulty)));
      return {
        id: questionId(id, sectionId, number),
        number,
        passageId: q.passageId != null ? String(q.passageId) : null,
        stimulus: String(q.stimulus || ''),
        stem: String(q.stem || ''),
        choices,
        answer,
        types,
        autoTagged,
        tags,
        difficulty,
        explanation: q.explanation ? String(q.explanation) : '',
      };
    });
    return {
      id: sectionId,
      kind,
      title: s.title ? String(s.title) : `${SECTION_TITLE[kind] || 'Section'}`,
      timeLimitMinutes: Number(s.timeLimitMinutes) > 0 ? Number(s.timeLimitMinutes) : DEFAULT_MINUTES,
      scored: s.scored !== false,
      passages,
      questions,
    };
  });

  if (errors.length) throw new Error(errors.join('\n'));
  return {
    format: FORMAT_ID,
    id,
    name,
    number: raw.number != null ? Number(raw.number) : null,
    purpose: raw.purpose === 'diagnostic' ? 'diagnostic' : 'test',
    source: raw.source ? String(raw.source) : '',
    sections,
    scoreConversion: raw.scoreConversion && typeof raw.scoreConversion === 'object' ? raw.scoreConversion : null,
    importedAt: raw.importedAt || new Date().toISOString(),
  };
}

const SECTION_TITLE = { LR: 'Logical Reasoning', RC: 'Reading Comprehension', AR: 'Analytical Reasoning' };

/** Accepts a single test, an array of tests, or `{ tests: [...] }`. */
export function normalizeImport(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.tests) ? json.tests : [json];
  return list.map((t, i) => {
    try {
      return normalizeTest(t);
    } catch (e) {
      throw new Error(`Test ${i + 1}${t?.name ? ` ("${t.name}")` : ''}:\n${e.message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Plain-text format (see docs/FORMAT.md):
//
//   # PrepTest Name
//   ## Section: LR            (or RC / AR; optional "| 35" for minutes)
//   1. Stimulus text ...
//   Question stem?
//   (A) ...
//   (B) ...
//   ...
//   ## Section: RC
//   ### Passage
//   Passage text...
//   1. Stem
//   (A) ...
//   ## Answers
//   1: C A B D ...            (one line per section, in order)
//
// Optional per-question type override: a line "@types flaw" before the number.

const CHOICE_RE = /^\(?([A-E])[).]\s*(.*)$/;
const QNUM_RE = /^(\d{1,2})[.)]\s+(.*)$/;

export function parseTestText(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const test = { name: '', sections: [] };
  let section = null;
  let passage = null;
  let question = null;
  let pendingTypes = null;
  let mode = 'body';
  const answerLines = [];

  const finishQuestion = () => {
    if (!question) return;
    const body = question.bodyLines.join('\n').trim();
    const { stimulus, stem } = splitStimulusAndStem(body, section.kind === 'RC');
    question.stimulus = stimulus;
    question.stem = stem;
    question.choices = question.choices.map((c) => c.trim());
    delete question.bodyLines;
    delete question.current;
    section.questions.push(question);
    question = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (mode === 'answers') {
      if (line) answerLines.push(line);
      continue;
    }
    let m;
    if ((m = line.match(/^#\s+(.+)$/))) {
      test.name = m[1].trim();
      continue;
    }
    if (/^##\s*answers?\b/i.test(line)) {
      finishQuestion();
      mode = 'answers';
      continue;
    }
    if ((m = line.match(/^##\s*section\s*:?\s*(LR|RC|AR)\b(?:\s*\|\s*(\d+))?(?:\s*\|\s*(.+))?/i))) {
      finishQuestion();
      section = {
        kind: m[1].toUpperCase(),
        timeLimitMinutes: m[2] ? Number(m[2]) : DEFAULT_MINUTES,
        title: m[3]?.trim(),
        passages: [],
        questions: [],
      };
      test.sections.push(section);
      passage = null;
      continue;
    }
    if (!section) continue;
    if ((m = line.match(/^###\s*passage\b\s*(.*)$/i))) {
      finishQuestion();
      passage = { id: `p${section.passages.length + 1}`, title: m[1].trim(), lines: [] };
      section.passages.push(passage);
      continue;
    }
    if ((m = line.match(/^@types?\s+(.+)$/i))) {
      pendingTypes = m[1].split(/[\s,]+/).filter(Boolean);
      continue;
    }
    if ((m = line.match(QNUM_RE))) {
      finishQuestion();
      question = {
        number: Number(m[1]),
        passageId: section.kind === 'RC' && passage ? passage.id : null,
        bodyLines: [m[2]],
        choices: [],
        current: 'body',
        ...(pendingTypes ? { types: pendingTypes } : {}),
      };
      pendingTypes = null;
      if (passage) passage.closed = true;
      continue;
    }
    if (question && (m = line.match(CHOICE_RE))) {
      question.choices.push(m[2]);
      question.current = 'choices';
      continue;
    }
    if (question) {
      if (question.current === 'choices') {
        if (line) question.choices[question.choices.length - 1] += ' ' + line;
      } else {
        question.bodyLines.push(line);
      }
      continue;
    }
    if (passage && !passage.closed) passage.lines.push(rawLine);
  }
  finishQuestion();

  // Answers: one line per section, letters optionally prefixed by "n:".
  answerLines.forEach((line, i) => {
    const sec = test.sections[i];
    if (!sec) return;
    const letters = line.replace(/^\s*(section\s*)?\d+\s*[:.-]\s*/i, '').match(/\b[A-E]\b/g) || [];
    sec.questions.forEach((q, qi) => {
      q.answer = letters[qi] || '';
    });
  });

  for (const sec of test.sections) {
    sec.passages = sec.passages.map((p) => ({ id: p.id, title: p.title, text: p.lines.join('\n').trim() }));
  }
  return test;
}

/**
 * LSAT stems are the last sentence before the choices. Split there, joining
 * hard-wrapped lines (from PDF copy/paste) back into paragraphs.
 */
export function splitStimulusAndStem(body, isRC = false) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' '))
    .filter(Boolean);
  if (isRC) return { stimulus: '', stem: paragraphs.join(' ') };
  if (paragraphs.length > 1) {
    const stem = paragraphs.pop();
    return { stimulus: paragraphs.join('\n\n'), stem };
  }
  const text = paragraphs[0] || '';
  // Single paragraph: take the last sentence ending in "?" or ":".
  const m = text.match(/^(.*[.!?"”)])\s+([A-Z][^?]*?(\?|:))\s*$/s);
  if (m) return { stimulus: m[1].trim(), stem: m[2].trim() };
  return { stimulus: '', stem: text };
}
