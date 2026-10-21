// "AI tutor pack": a self-contained Markdown file that turns any chat LLM
// into an LSAT tutor for the student's own mistakes, plus a parser for the
// notes block the tutor hands back at the end.

import { categoriesOf, categoryLabel, typeLabel } from './taxonomy.js';
import { TRAP_TAGS, journalPatterns } from './journal.js';

const L = ['A', 'B', 'C', 'D', 'E'];
export const NOTES_FENCE = 'lsat-trainer-notes';

export const TUTOR_MODES = {
  socratic: 'Socratic: I explain my reasoning first, the tutor guides me to the answer',
  direct: 'Direct: the tutor hears my reasoning, then explains the answer',
};

function instructions(mode) {
  const teach = mode === 'direct'
    ? `4. **Teach.** After the student explains, reveal the correct answer and explain it, starting from the exact
   point where their reasoning went wrong. Then explain why their answer fails and why the correct answer
   survives, using the official explanation as ground truth.`
    : `4. **Teach Socratically.** Don't reveal the answer yet. Ask one pointed question at a time that leads the
   student to find the flaw in their own reasoning (e.g. "What does the conclusion actually claim?", "If (B)
   were false, would the argument fall apart?"). If they're still stuck after two hints, explain directly.
   Once they've found it, confirm with the official explanation.`;
  return `## Instructions for the AI tutor

Read this whole file before your first reply.

You are an expert LSAT tutor working one-on-one with a student. Below are questions the student got wrong,
with the student's own answers and notes, a profile of their weak areas, and, in sections marked
**TUTOR ONLY**, the correct answer and official explanation. Your goal is to find and fix the *specific reasoning
gap* behind each miss so the student doesn't make it again, not just to explain the answer.

For each question, in the order given:

1. **Present it.** Show the question (passage or stimulus, stem, and choices) and the answer the student chose.
   Never show anything from a TUTOR ONLY section at this point.
2. **Get their reasoning first.** Ask the student to walk you through why they picked their answer and why they
   rejected the correct one. If their notes already describe their thinking, quote them and ask a follow-up
   instead of asking from scratch.
3. **Diagnose the gap precisely.** Classify it as one of: *misread* (stimulus, stem, or a choice), *method gap*
   (doesn't know how to approach this question type), *trap* (knew the method but fell for a specific
   wrong-answer pattern; name it), *logic gap* (e.g. conditional reasoning, quantifiers, causation), or
   *timing/pressure* (they got it in blind review but not under time). Say which one you think it is and why.
${teach}
5. **Check transfer.** Write ONE new, original LSAT-style question (do not copy real LSAC questions) that
   tests the same gap in a different scenario. Have the student answer it and explain their choice, then give
   feedback. If they miss it, do one more.
6. **Lock it in.** Ask the student to state the lesson as a one-sentence rule in their own words; tighten it if
   needed.

Rules:
- The answer key is ground truth. If you believe a key is wrong, say so explicitly and explain why, but still
  teach toward the key and note the disagreement in the notes block.
- Keep each reply short (under about 200 words) and end with a question for the student, so it stays a
  conversation.
- Use the student profile to connect misses: if a gap matches one of their weak categories or recurring traps,
  point that out.
- When all questions are done, or the student says "wrap up", summarize the patterns across their misses (what
  to watch for on test day), then output the notes block described below.

## Notes block (output this at the end)

So the student can import your notes back into their study app, end the session with exactly one fenced block
in this format, with one object per question you covered. Use the question ids given below.

\`\`\`${NOTES_FENCE}
[
  {
    "id": "<question id>",
    "gap": "misread | method gap | trap | logic gap | timing/pressure",
    "correctReasoning": "Why the right answer is right and theirs is wrong, in 2-4 sentences.",
    "takeaway": "The student's one-sentence rule.",
    "traps": ["Scope shift"]
  }
]
\`\`\`

\`traps\` must only use labels from this list: ${TRAP_TAGS.map((t) => `"${t}"`).join(', ')}.
`;
}

function pct(x) { return `${Math.round(x * 100)}%`; }

function profileSection(profile, entries) {
  const lines = ['## Student profile', ''];
  if (profile?.weakCategories?.length) {
    lines.push('Weakest categories (timed accuracy, all practice so far):');
    for (const c of profile.weakCategories) lines.push(`- ${categoryLabel(c.type)}: ${pct(c.firstAccuracy)} of ${c.n}`);
    lines.push('');
  }
  if (profile?.weakTypes?.length) {
    lines.push('Weakest question types:');
    for (const t of profile.weakTypes) lines.push(`- ${typeLabel(t.type)}: ${pct(t.firstAccuracy)} of ${t.n}`);
    lines.push('');
  }
  if (profile?.ladders?.length) {
    lines.push('Skill diagnostic (level 1 = easier than the LSAT, 5 = harder): first level missed per skill:');
    for (const r of profile.ladders) lines.push(`- ${r.title}: breaks at level ${r.breaksAt}`);
    lines.push('');
  }
  const p = journalPatterns(entries);
  if (p.traps.length) lines.push(`Traps the student has tagged on these questions: ${p.traps.map(([t, n]) => `${t} (${n})`).join(', ')}.`, '');
  if (p.categories.length) lines.push(`Most common categories among these questions: ${p.categories.slice(0, 6).map(([c, n]) => `${categoryLabel(c)} (${n})`).join(', ')}.`, '');
  if (lines.length === 2) lines.push('No history yet beyond the questions below.', '');
  return lines.join('\n');
}

function quote(text) {
  return String(text || '').split('\n').map((l) => `> ${l}`).join('\n');
}

/**
 * Order: questions whose categories recur most in this set first (so the
 * tutor sees the pattern early), then by how often each was missed.
 */
export function tutorOrder(entries) {
  const freq = {};
  for (const e of entries) for (const c of categoriesOf(e)) if (!c.startsWith('family:')) freq[c] = (freq[c] || 0) + 1;
  const score = (e) => Math.max(0, ...categoriesOf(e).map((c) => freq[c] || 0));
  return [...entries].sort((a, b) => score(b) - score(a) || b.occurrences.length - a.occurrences.length);
}

export function buildTutorPack(entries, { mode = 'socratic', profile = null, explanationOf = () => '', breakdownOf = () => null } = {}) {
  const ordered = tutorOrder(entries);
  const out = [
    '# LSAT tutoring session: my mistakes',
    '',
    `I'm studying for the LSAT. Below are ${ordered.length} question${ordered.length === 1 ? '' : 's'} I got wrong. Please tutor me through them following the instructions.`,
    `Exported ${new Date().toLocaleDateString()} from LSAT Trainer.`,
    '',
    instructions(mode),
    profileSection(profile, ordered),
    '## Questions',
    '',
  ];
  const passagesShown = new Map();
  ordered.forEach((e, i) => {
    const cats = categoriesOf(e).filter((c) => !c.startsWith('family:')).map(categoryLabel);
    out.push(`### Question ${i + 1} (id: \`${e.qid}\`)`, '');
    out.push(`- Source: ${e.testName}, ${e.sectionTitle}, question ${e.number}`);
    out.push(`- Type: ${e.types.map(typeLabel).join(', ')}${e.difficulty ? ` · difficulty ${e.difficulty}/5` : ''}`);
    if (cats.length) out.push(`- Categories: ${cats.join(', ')}`);
    out.push(`- Student's answer: (${e.first ?? 'none'}) under time${e.br && e.br !== e.first ? `, changed to (${e.br}) in blind review` : e.br ? ', kept in blind review' : ''}`);
    out.push(`- Missed ${e.occurrences.length} time${e.occurrences.length === 1 ? '' : 's'}${e.retries?.length ? `; retries: ${e.retries.map((r) => (r.correct ? 'right' : 'wrong')).join(', ')}` : ''}`);
    out.push('');
    if (e.passage) {
      if (passagesShown.has(e.passage)) {
        out.push(`**Passage:** same passage as Question ${passagesShown.get(e.passage)} above.`, '');
      } else {
        passagesShown.set(e.passage, i + 1);
        out.push('**Passage:**', '', quote(e.passage), '');
      }
    }
    if (e.stimulus) out.push('**Stimulus:**', '', quote(e.stimulus), '');
    out.push(`**Question:** ${e.stem}`, '');
    e.choices.forEach((c, ci) => out.push(`(${L[ci]}) ${c}`, ''));
    const notes = [
      ['My thought process', e.myReasoning], ['What was tricky', e.tricky],
      ['Why I think the right answer is right', e.correctReasoning], ['My takeaway so far', e.takeaway],
    ].filter(([, v]) => v && v.trim());
    if (notes.length || e.traps?.length) {
      out.push("**Student's notes:**", '');
      for (const [k, v] of notes) out.push(`- ${k}: ${v.trim().replace(/\n+/g, ' ')}`);
      if (e.traps?.length) out.push(`- Traps I think got me: ${e.traps.join(', ')}`);
      out.push('');
    } else {
      out.push("**Student's notes:** none yet. Ask the student to reconstruct their thinking.", '');
    }
    const explanation = e.explanation || explanationOf(e.qid) || '';
    out.push('**TUTOR ONLY (do not show until the student has explained their reasoning):**', '');
    out.push(`- Correct answer: (${e.answer}) ${e.choices[L.indexOf(e.answer)] ?? ''}`);
    if (explanation) out.push(`- Official explanation: ${explanation}`);
    const bd = e.breakdown || breakdownOf(e.qid);
    if (bd) {
      for (const st of bd.setup || []) out.push(`- ${st.label}: ${st.text}`);
      if (bd.analysis) out.push(`- Analysis: ${bd.analysis}`);
      out.push('- Why each choice is right or wrong:');
      bd.choices.forEach((c, ci) => {
        out.push(`  - (${L[ci]}) ${c.note}`);
        if (c.example) out.push(`    - Example of that reasoning: ${c.example}`);
        if (c.negation) out.push(`    - Negation: ${c.negation}`);
      });
    }
    out.push('', '---', '');
  });
  out.push('Please start with Question 1.');
  return out.join('\n');
}

/**
 * Pull the notes block out of a pasted tutor reply. Returns
 * [{ id, gap, correctReasoning, takeaway, traps }]; throws a readable error.
 */
export function parseTutorNotes(text) {
  const fence = new RegExp('```\\s*' + NOTES_FENCE + '\\s*\\n([\\s\\S]*?)```');
  const m = String(text).match(fence);
  const body = m ? m[1] : String(text).trim();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Couldn't find a valid \`${NOTES_FENCE}\` block. Paste the tutor's final message (or just the block).`);
  }
  if (!Array.isArray(data)) data = [data];
  return data.filter((n) => n && typeof n.id === 'string').map((n) => ({
    id: n.id,
    gap: typeof n.gap === 'string' ? n.gap : '',
    correctReasoning: typeof n.correctReasoning === 'string' ? n.correctReasoning.trim() : '',
    takeaway: typeof n.takeaway === 'string' ? n.takeaway.trim() : '',
    traps: Array.isArray(n.traps) ? n.traps.filter((t) => TRAP_TAGS.includes(t)) : [],
  }));
}

/** Merge tutor notes into a journal entry without overwriting the student's own words. */
export function applyTutorNote(entry, note) {
  const merge = (mine, theirs, label) => {
    if (!theirs) return mine;
    if (!mine?.trim()) return theirs;
    if (mine.includes(theirs)) return mine;
    return `${mine.trim()}\n\n${label}: ${theirs}`;
  };
  return {
    ...entry,
    correctReasoning: merge(entry.correctReasoning, note.correctReasoning, 'AI tutor'),
    takeaway: merge(entry.takeaway, note.takeaway, 'AI tutor'),
    tricky: note.gap && !entry.tricky?.trim() ? `Gap (per AI tutor): ${note.gap}` : entry.tricky,
    traps: Array.from(new Set([...(entry.traps || []), ...note.traps])),
    status: entry.status === 'new' ? 'reviewed' : entry.status,
  };
}
