// Mistake journal: entries are created automatically when a question is
// wrong in both the timed pass and blind review, and can be added by hand.
// Each entry snapshots the question text so exports stay complete even if
// the source test is later removed.

import { typeLabel } from './taxonomy.js';

export const TRAP_TAGS = [
  'Misread the stimulus',
  'Misread the stem',
  'Missed the conclusion',
  'Scope shift',
  'Too strong / extreme language',
  'Reversed conditional',
  'Negated conditional incorrectly',
  'Correlation vs. causation',
  'Sampling / representativeness',
  'Part vs. whole',
  'Necessary vs. sufficient',
  'Attractive answer that restates premise',
  'Right concept, wrong direction',
  'Out-of-scope answer looked relevant',
  'Eliminated correct answer too fast',
  'Ran out of time / rushed',
  'Overthought in blind review',
  'Passage detail recall',
  'Author vs. other viewpoint',
];

export const STATUSES = ['new', 'reviewed', 'mastered'];

export function makeEntry(question, ctx, { first, br, source = 'auto', sessionId, at = new Date().toISOString() }) {
  return {
    qid: question.id,
    testName: ctx.testName,
    sectionTitle: ctx.sectionTitle,
    number: question.number,
    kind: ctx.kind,
    types: [...question.types],
    passage: ctx.passageText || '',
    stimulus: question.stimulus,
    stem: question.stem,
    choices: [...question.choices],
    answer: question.answer,
    first: first ?? null,
    br: br ?? null,
    source,
    addedAt: at,
    occurrences: [{ sessionId, at, first: first ?? null, br: br ?? null }],
    myReasoning: '',
    tricky: '',
    correctReasoning: '',
    takeaway: '',
    traps: [],
    status: 'new',
    retries: [],
  };
}

/** Merge a fresh miss into an existing entry (same question missed again). */
export function recordRepeat(entry, { first, br, sessionId, at = new Date().toISOString() }) {
  return {
    ...entry,
    first: first ?? null,
    br: br ?? null,
    status: entry.status === 'mastered' ? 'reviewed' : entry.status,
    occurrences: [...entry.occurrences, { sessionId, at, first: first ?? null, br: br ?? null }],
  };
}

/** Record a later attempt at a journal question (e.g. in a drill). */
export function recordRetry(entry, { correct, at = new Date().toISOString() }) {
  const retries = [...entry.retries, { at, correct }];
  // Two correct retries in a row (with no misses since) marks it mastered.
  const lastTwo = retries.slice(-2);
  const mastered = lastTwo.length === 2 && lastTwo.every((r) => r.correct);
  return { ...entry, retries, status: mastered ? 'mastered' : entry.status };
}

const L = ['A', 'B', 'C', 'D', 'E'];

function quoteBlock(text) {
  return String(text || '').split('\n').map((l) => `> ${l}`).join('\n');
}

export function toMarkdown(entries) {
  const out = ['# LSAT Mistake Journal', '', `Exported ${new Date().toLocaleString()} — ${entries.length} question(s).`, ''];
  for (const e of entries) {
    out.push(`## ${e.testName} — ${e.sectionTitle} Q${e.number}`);
    out.push('');
    out.push(`**Type:** ${e.types.map(typeLabel).join(', ')}  `);
    out.push(`**Your answer:** ${e.first ?? '—'} (timed), ${e.br ?? '—'} (blind review) · **Correct:** ${e.answer}  `);
    out.push(`**Status:** ${e.status} · **Missed ${e.occurrences.length}×**${e.traps.length ? ` · **Traps:** ${e.traps.join('; ')}` : ''}`);
    out.push('');
    if (e.passage) { out.push('<details><summary>Passage</summary>', '', quoteBlock(e.passage), '', '</details>', ''); }
    if (e.stimulus) { out.push(quoteBlock(e.stimulus), ''); }
    out.push(`**${e.stem}**`, '');
    e.choices.forEach((c, i) => {
      const mark = L[i] === e.answer ? ' ✅' : L[i] === e.first || L[i] === e.br ? ' ❌' : '';
      out.push(`- (${L[i]}) ${c}${mark}`);
    });
    out.push('');
    out.push('### My thought process', e.myReasoning || '_(not written yet)_', '');
    out.push('### What was tricky', e.tricky || '_(not written yet)_', '');
    out.push('### Why the right answer is right', e.correctReasoning || '_(not written yet)_', '');
    out.push('### Takeaway for next time', e.takeaway || '_(not written yet)_', '');
    out.push('---', '');
  }
  return out.join('\n');
}

function csvCell(v) {
  const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(entries) {
  const cols = [
    ['Test', (e) => e.testName], ['Section', (e) => e.sectionTitle], ['Q', (e) => e.number],
    ['Types', (e) => e.types.map(typeLabel)], ['Timed answer', (e) => e.first], ['BR answer', (e) => e.br],
    ['Correct', (e) => e.answer], ['Times missed', (e) => e.occurrences.length], ['Status', (e) => e.status],
    ['Traps', (e) => e.traps], ['My thought process', (e) => e.myReasoning], ['What was tricky', (e) => e.tricky],
    ['Why right answer is right', (e) => e.correctReasoning], ['Takeaway', (e) => e.takeaway],
    ['Stem', (e) => e.stem], ['Added', (e) => e.addedAt],
  ];
  const rows = [cols.map(([h]) => csvCell(h)).join(',')];
  for (const e of entries) rows.push(cols.map(([, f]) => csvCell(f(e))).join(','));
  return rows.join('\n');
}

/** Count trap tags and types across entries, most common first. */
export function journalPatterns(entries) {
  const traps = {};
  const types = {};
  for (const e of entries) {
    for (const t of e.traps) traps[t] = (traps[t] || 0) + 1;
    for (const t of e.types) types[t] = (types[t] || 0) + 1;
  }
  const sort = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return { traps: sort(traps), types: sort(types) };
}
