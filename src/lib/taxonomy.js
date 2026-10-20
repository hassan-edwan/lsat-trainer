// Question-type taxonomy, approximate exam frequencies, and a stem classifier.
//
// `weight` is the approximate share of questions of that type within its
// section kind, based on publicly discussed breakdowns of recent PrepTests.
// It only needs to be roughly right: it scales how much a weakness in a
// type matters when building smart drills.

export const SECTION_KINDS = {
  LR: 'Logical Reasoning',
  RC: 'Reading Comprehension',
  AR: 'Analytical Reasoning',
};

export const QUESTION_TYPES = {
  // Logical Reasoning
  'flaw': { kind: 'LR', label: 'Flaw', weight: 0.14 },
  'necessary-assumption': { kind: 'LR', label: 'Necessary Assumption', weight: 0.09 },
  'sufficient-assumption': { kind: 'LR', label: 'Sufficient Assumption', weight: 0.06 },
  'strengthen': { kind: 'LR', label: 'Strengthen', weight: 0.07 },
  'weaken': { kind: 'LR', label: 'Weaken', weight: 0.08 },
  'most-strongly-supported': { kind: 'LR', label: 'Most Strongly Supported', weight: 0.09 },
  'must-be-true': { kind: 'LR', label: 'Must Be True', weight: 0.04 },
  'must-be-false': { kind: 'LR', label: 'Must Be False', weight: 0.01 },
  'explain': { kind: 'LR', label: 'Explain / Paradox', weight: 0.05 },
  'principle-strengthen': { kind: 'LR', label: 'Principle (Justify)', weight: 0.05 },
  'principle-apply': { kind: 'LR', label: 'Principle (Conform)', weight: 0.03 },
  'parallel': { kind: 'LR', label: 'Parallel Reasoning', weight: 0.03 },
  'parallel-flaw': { kind: 'LR', label: 'Parallel Flaw', weight: 0.03 },
  'method': { kind: 'LR', label: 'Method of Reasoning', weight: 0.04 },
  'role': { kind: 'LR', label: 'Role / Argument Part', weight: 0.04 },
  'main-conclusion': { kind: 'LR', label: 'Main Conclusion', weight: 0.04 },
  'point-at-issue': { kind: 'LR', label: 'Point at Issue / Agreement', weight: 0.04 },
  'evaluate': { kind: 'LR', label: 'Evaluate', weight: 0.01 },
  'lr-other': { kind: 'LR', label: 'Other LR', weight: 0.01 },

  // Reading Comprehension
  'rc-main-point': { kind: 'RC', label: 'Main Point / Primary Purpose', weight: 0.12 },
  'rc-detail': { kind: 'RC', label: 'Detail / Specific Reference', weight: 0.2 },
  'rc-inference': { kind: 'RC', label: 'Inference', weight: 0.25 },
  'rc-author-attitude': { kind: 'RC', label: 'Author Attitude', weight: 0.07 },
  'rc-function': { kind: 'RC', label: 'Function / Purpose of Part', weight: 0.12 },
  'rc-structure': { kind: 'RC', label: 'Organization / Structure', weight: 0.04 },
  'rc-analogy': { kind: 'RC', label: 'Analogy / Application', weight: 0.06 },
  'rc-strengthen-weaken': { kind: 'RC', label: 'Strengthen / Weaken', weight: 0.06 },
  'rc-comparative': { kind: 'RC', label: 'Comparative Passage Relationship', weight: 0.06 },
  'rc-other': { kind: 'RC', label: 'Other RC', weight: 0.02 },

  // Analytical Reasoning (no longer on the scored LSAT, kept for older tests)
  'ar-ordering': { kind: 'AR', label: 'Ordering', weight: 0.4 },
  'ar-grouping': { kind: 'AR', label: 'Grouping', weight: 0.4 },
  'ar-hybrid': { kind: 'AR', label: 'Hybrid / Other', weight: 0.2 },
};

export function typeLabel(id) {
  return QUESTION_TYPES[id]?.label ?? id;
}

export function typesForKind(kind) {
  return Object.entries(QUESTION_TYPES)
    .filter(([, t]) => t.kind === kind)
    .map(([id, t]) => ({ id, ...t }));
}

// Each rule is [typeId, regex]. The first match wins, so order matters:
// specific phrasings (sufficient assumption, parallel flaw, MSS) must come
// before the broader ones they overlap with.
const LR_RULES = [
  ['parallel-flaw', /(flawed|questionable|faulty|erroneous).{0,80}(most (closely )?(similar|parallel)|parallels)|(most (closely )?(similar|parallel)|parallels).{0,80}(flawed|questionable|faulty|erroneous)/],
  ['parallel', /most (closely )?(similar|parallel)|(closely )?parallels|exhibits a pattern of reasoning/],
  ['sufficient-assumption', /if assumed|\bif\b.{0,60}\bis assumed|enables? the (argument'?s? )?conclusion to be properly (drawn|inferred)|allows the conclusion to be properly|conclusion (would|will) follow logically/],
  ['necessary-assumption', /assumption (that )?(on which|required|that the argument requires|the argument (depends|relies))|(argument|reasoning) (depends|relies) on (the )?assum|requires (the )?assum|assumes which|argument assumes|is an assumption/],
  ['principle-apply', /(conforms?|conform most closely) (most closely )?to the principle|illustrates? the principle|principle.{0,60}(illustrated|exemplif)|(judgment|action|situation)s? .{0,40}conforms?/],
  ['principle-strengthen', /principle.{0,100}(justify|justifies|support|valid|helps)|(justify|justifies).{0,80}principle/],
  ['point-at-issue', /disagree|point at issue|committed to (agreeing|disagreeing)|would (both )?agree|agree (that|about|on)/],
  ['flaw', /vulnerable to (the )?critici|flaw|error (of|in) (reasoning|its reasoning)|questionable (because|technique)|reasoning is (most )?(questionable|faulty)|fails to (consider|establish|justify)|takes for granted|presumes, without/],
  ['main-conclusion', /main (point|conclusion)|overall conclusion|most accurately (expresses|states) the conclusion|conclusion (drawn )?in the argument/],
  ['role', /role (played|that is played)|figures? in the argument|plays which|serves (as|which)|functions? (in the argument|as)|describes the (role|function)/],
  ['method', /(argumentative )?(strategy|technique|method)|proceeds by|responds? to .{0,60} by|by doing which|describes (how|the way)|the argument (does|is structured)/],
  ['explain', /explain|resolve|reconcile|discrepancy|paradox|apparent conflict|account for/],
  ['evaluate', /most (useful|helpful|important) to (know|determine|establish)|evaluat|relevant to (assess|determin)/],
  ['must-be-false', /cannot be true|must be false|could be true except|(if|statements above are) true.{0,40}could be true except|inconsistent with/],
  ['most-strongly-supported', /(statements|information) above.{0,60}(most )?strongly support|most strongly supported by|(provide|provides) the most support for|best supported by|most strongly support which/],
  ['weaken', /weaken|undermine|casts? (the most )?doubt|call(s)? into question|counter|challenge|damag|argues? (most )?against/],
  ['strengthen', /strengthen|(most|best) (strongly )?(support|justif)|bolster|provides? (the )?most support|adds? the most support|helps? to justify/],
  ['must-be-true', /must (also )?be true|properly (inferred|concluded)|follows? logically|can be (properly )?(inferred|concluded)|deduced|logically (completes|follows)|most logically completes/],
];

const RC_RULES = [
  ['rc-comparative', /both passages|passage a and passage b|passages a and b|relationship between (the two )?passages|(passage a|passage b)/],
  ['rc-main-point', /main (point|idea)|primary purpose|central (idea|claim|thesis)|most accurately (summarizes|expresses|states) the|best title|primarily concerned with|overall purpose/],
  ['rc-author-attitude', /attitude|author'?s? (stance|view|position) (toward|regarding|of)|tone|would most likely (characterize|describe)/],
  ['rc-structure', /organiz|structure of the passage|describes the (organization|structure)|sequence/],
  ['rc-function', /in order to|primarily (to|serves)|function|serves (to|as)|purpose of the (reference|mention|discussion|phrase|sentence|paragraph)|mentions? .{0,60} (in order|primarily)|role/],
  ['rc-analogy', /analogous|most similar|most closely (parallels|resembles)|exemplif|illustrates? the (principle|concept)|would most likely (be|endorse|apply)/],
  ['rc-strengthen-weaken', /strengthen|weaken|undermine|support the|cast(s)? doubt|challenge|calls? into question/],
  ['rc-detail', /according to the passage|the passage (states|mentions|indicates|asserts|claims)|stated in the passage|explicitly|the passage provides (information|an answer)|is (described|identified|mentioned)/],
  ['rc-inference', /infer|most strongly suggest|most likely agree|implies|would (most likely )?(agree|accept|endorse)|most strongly support|can be concluded|most reasonably|suggests that|consistent with/],
];

/**
 * Guess question types from a question stem.
 * Returns an array of type ids (usually one) — the caller can always override.
 */
export function classifyStem(stem, kind = 'LR') {
  const text = String(stem || '').toLowerCase().replace(/\s+/g, ' ');
  if (kind === 'AR') return ['ar-hybrid'];
  const rules = kind === 'RC' ? RC_RULES : LR_RULES;
  for (const [type, re] of rules) {
    if (re.test(text)) return [type];
  }
  return [kind === 'RC' ? 'rc-other' : 'lr-other'];
}

/** Tags that describe stem features independent of type (e.g. EXCEPT). */
export function stemFeatureTags(stem) {
  const tags = [];
  if (/\bEXCEPT\b/.test(stem || '')) tags.push('except');
  if (/\bLEAST\b/.test(stem || '')) tags.push('least');
  return tags;
}

// ---------------------------------------------------------------------------
// Standard categories beyond question type. A question's categories are
// keys like "family:assumption", "reasoning:causal", "flaw:sampling",
// "subject:law". Families are derived from the type; the rest are tags
// (reasoning tags are stored bare, e.g. "conditional", for compatibility).

// LR families as commonly taught (7Sage, LSAT Lab): Assumption, Inference,
// Structure, Explanation. RC: global, specific, and extended questions.
export const FAMILIES = {
  assumption: { label: 'Assumption family', kind: 'LR', types: ['necessary-assumption', 'sufficient-assumption', 'strengthen', 'weaken', 'flaw', 'parallel-flaw', 'evaluate', 'principle-strengthen'] },
  inference: { label: 'Inference family', kind: 'LR', types: ['must-be-true', 'most-strongly-supported', 'must-be-false', 'principle-apply', 'point-at-issue'] },
  structure: { label: 'Structure family', kind: 'LR', types: ['main-conclusion', 'role', 'method', 'parallel'] },
  explanation: { label: 'Explanation (paradox)', kind: 'LR', types: ['explain'] },
  'rc-global': { label: 'RC global (main point, structure, attitude)', kind: 'RC', types: ['rc-main-point', 'rc-structure', 'rc-author-attitude'] },
  'rc-specific': { label: 'RC specific (detail, function)', kind: 'RC', types: ['rc-detail', 'rc-function'] },
  'rc-extended': { label: 'RC extended (inference, analogy, strengthen/weaken)', kind: 'RC', types: ['rc-inference', 'rc-analogy', 'rc-strengthen-weaken', 'rc-comparative'] },
};

export function familiesOf(types) {
  return Object.entries(FAMILIES).filter(([, f]) => types.some((t) => f.types.includes(t))).map(([id]) => id);
}

export const REASONING = {
  conditional: 'Conditional & formal logic',
  causal: 'Causal reasoning',
  statistical: 'Numbers & statistics',
  sampling: 'Studies, surveys & samples',
  analogy: 'Analogy',
  comparison: 'Comparisons',
  principle: 'Principles & value judgments',
  plan: 'Plans & proposals',
  authority: 'Experts, sources & authority',
  rebuttal: 'Counterarguments & rebuttals',
  debate: 'Debate & dialogue',
  'fact-set': 'Fact sets (no argument)',
};
// Older name, kept for the diagnostic's skill drills.
export const SKILLS = REASONING;

export const FLAWS = {
  causation: 'Correlation vs. causation',
  'necessary-sufficient': 'Necessary vs. sufficient',
  sampling: 'Unrepresentative sample',
  'percent-number': 'Percentages vs. numbers',
  equivocation: 'Term shift (equivocation)',
  'part-whole': 'Part vs. whole',
  'absence-of-evidence': 'Lack of evidence as proof',
  'ad-hominem': 'Attacks the source',
  'bad-authority': 'Bad appeal to authority/popularity',
  circular: 'Circular reasoning',
  'false-choice': 'False choice',
  'possibility-certainty': 'Possible treated as certain',
  'straw-man': 'Straw man',
  'flawed-analogy': 'Flawed analogy',
  quantifier: 'Quantifier error (most/some chains)',
  'scope-shift': 'Conclusion overreaches (scope shift)',
};

export const SUBJECTS = {
  law: 'Law',
  'natural-science': 'Natural science',
  'social-science': 'Social science',
  humanities: 'Humanities',
};

export const CATEGORY_GROUPS = [
  { id: 'family', label: 'Question family', entries: Object.fromEntries(Object.entries(FAMILIES).map(([k, v]) => [k, v.label])) },
  { id: 'reasoning', label: 'Reasoning type', entries: REASONING },
  { id: 'flaw', label: 'Flaw pattern', entries: FLAWS },
  { id: 'subject', label: 'RC passage subject', entries: SUBJECTS },
];

/** Every category key for a question, e.g. ["family:assumption", "reasoning:causal", "flaw:sampling"]. */
export function categoriesOf(question) {
  const out = familiesOf(question.types || []).map((f) => `family:${f}`);
  for (const t of question.tags || []) {
    if (REASONING[t]) out.push(`reasoning:${t}`);
    else if (t.startsWith('flaw:') || t.startsWith('subject:')) out.push(t);
  }
  return out;
}

export function categoryLabel(key) {
  const [group, id] = key.split(':');
  return CATEGORY_GROUPS.find((g) => g.id === group)?.entries[id] ?? key;
}

/** True if the question belongs to the category key. */
export function inCategory(question, key) {
  return categoriesOf(question).includes(key);
}

// ---- detection for imported questions (best effort; files can set tags) ----
const SPEAKER = /^[A-Z][A-Za-z.' -]{1,40}:\s/;
const CONDITIONAL_CUES = /\b(if|unless|whenever|without|requires?|necessary|sufficient|all|every|each|none|no|any|only|must|cannot)\b/gi;
const REASONING_CUES = {
  causal: /\b(caus\w*|because of|result(s|ed)? in|leads? to|led to|effect|due to|responsible for|contribut\w*)\b/i,
  statistical: /(%|\bpercent\w*|\b(rate|proportion|average|ratio|per capita)\b)/i,
  sampling: /\b(survey\w*|poll\w*|respondents|sample\w*|study|studies|experiment\w*|participants)\b/i,
  principle: /\b(should|ought|morally|ethical\w*|unjust\w*|fair(ness)?|obligat\w*|justified)\b/i,
  plan: /\b(plan|proposal|proposed|program|policy|in order to)\b/i,
  rebuttal: /\b(critics|opponents|some (people|argue|claim)|it has been (argued|claimed))\b/i,
};

/** Guess reasoning tags from a question's text. */
export function detectSkills(stimulus = '', stem = '', kind = 'LR') {
  if (kind !== 'LR') return [];
  const text = String(stimulus);
  const skills = [];
  const paras = text.split(/\n\s*\n/).filter((x) => x.trim());
  if (paras.length >= 2 && paras.filter((x) => SPEAKER.test(x.trim())).length >= 2) skills.push('debate');
  if ((text.match(CONDITIONAL_CUES) || []).length >= 4) skills.push('conditional');
  for (const [tag, re] of Object.entries(REASONING_CUES)) if (re.test(text)) skills.push(tag);
  return skills;
}

const FLAW_CUES = [
  ['sampling', /representative|typical of|sample|generaliz/i],
  ['necessary-sufficient', /necessary|sufficient|required for|ensure|guarantee/i],
  ['percent-number', /percentage|proportion|number of|total|rate/i],
  ['causation', /caus|correlat|coinciden/i],
  ['equivocation', /different sense|two different|ambiguous|shifts? (the )?meaning|same term/i],
  ['part-whole', /as a whole|each (of the )?(part|member)|group as|individual members/i],
  ['absence-of-evidence', /not been (shown|proven|established)|lack of evidence|no evidence|absence of/i],
  ['ad-hominem', /character|motives|source of|person (who|making)|rather than (the|its) (argument|reasoning)/i],
  ['bad-authority', /authority|expert|popular|most people believe/i],
  ['circular', /presuppos|assumes what|restates|circular/i],
  ['false-choice', /only (two|alternatives|options)|mutually exclusive|other alternatives/i],
  ['possibility-certainty', /could|possib|might|will (definitely|certainly)/i],
  ['straw-man', /distort|misrepresent|position .* (not|never) (held|taken)/i],
  ['flawed-analogy', /analog|relevantly (similar|different)|comparison between/i],
  ['quantifier', /\bmost\b.*\bmost\b|\bsome\b.*\ball\b/i],
];

/** Guess the flaw pattern of a Flaw / Parallel Flaw question from its correct answer. */
export function detectFlaws(question) {
  if (!(question.types || []).some((t) => t === 'flaw' || t === 'parallel-flaw')) return [];
  const correct = question.choices?.['ABCDE'.indexOf(question.answer)] || '';
  const hit = FLAW_CUES.find(([, re]) => re.test(correct));
  return hit ? [hit[0]] : [];
}
