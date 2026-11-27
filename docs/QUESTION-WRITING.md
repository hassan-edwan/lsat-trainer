# Writing questions for LSAT Trainer

This is the brief to give any writer, human or AI, who writes questions for this project. Paste the whole file
into the prompt. It describes what's on the test (question types, how often each appears, the exact stem
wording), how right and wrong answers are built, the JSON each question needs, and, at the end, how to write the
**Overdrive** questions that are deliberately harder than the real test.

Everything here comes from the project's own sources: the taxonomy in `src/lib/taxonomy.js`, the type
classifier's stem patterns, and the stems used across the six Classic-Style Tests and the RC sections, which were
audited against PrepTests 140–159.

Only write original material. Never copy or closely paraphrase LSAC questions.

## The test

The current LSAT has two scored Logical Reasoning (LR) sections and one scored Reading Comprehension (RC)
section, 35 minutes each, plus an unscored section. An LR section has 25–26 questions; an RC section has four
passages with 5–8 questions each (26–28 in all). Logic games (Analytical Reasoning) are no longer on the test.

## Logical Reasoning question types

The share is roughly how often the type appears among LR questions. The id goes in `types`.

| id | Type | Share | Family |
|---|---|---|---|
| `flaw` | Flaw | 14% | Assumption |
| `necessary-assumption` | Necessary Assumption | 9% | Assumption |
| `most-strongly-supported` | Most Strongly Supported / Completes the argument | 9% | Inference |
| `weaken` | Weaken | 8% | Assumption |
| `strengthen` | Strengthen | 7% | Assumption |
| `sufficient-assumption` | Sufficient Assumption | 6% | Assumption |
| `explain` | Explain / Resolve the paradox | 5% | Explanation |
| `principle-strengthen` | Principle (Justify) | 5% | Assumption |
| `must-be-true` | Must Be True | 4% | Inference |
| `method` | Method of Reasoning | 4% | Structure |
| `role` | Role of a claim | 4% | Structure |
| `main-conclusion` | Main Conclusion | 4% | Structure |
| `point-at-issue` | Point at Issue / Agreement | 4% | Inference |
| `principle-apply` | Principle (Conform) | 3% | Inference |
| `parallel` | Parallel Reasoning | 3% | Structure |
| `parallel-flaw` | Parallel Flaw | 3% | Assumption |
| `evaluate` | Evaluate the argument | 1% | Assumption |
| `must-be-false` | Must Be False / Cannot be true | 1% | Inference |

### LR stems (use this wording)

Real stems are formulaic. Use these, naming the speaker when the stimulus has one ("the economist's argument").

- **Flaw:** "The reasoning in the argument is most vulnerable to criticism on the grounds that the argument" ·
  "The reasoning in the argument is flawed in that the argument" · "The argument is most vulnerable to criticism
  on the grounds that it". Flaw answers begin with verbs: "takes for granted that…", "presumes, without providing
  justification, that…", "fails to consider the possibility that…", "infers…from…", "confuses…with…",
  "treats…as…".
- **Necessary assumption:** "Which one of the following is an assumption on which the argument depends?" ·
  "Which one of the following is an assumption required by the argument?" · "The historian's argument depends on
  assuming which one of the following?"
- **Sufficient assumption:** "The conclusion of the argument follows logically if which one of the following is
  assumed?" · "The conclusion of the argument can be properly drawn if which one of the following is assumed?" ·
  "Which one of the following, if assumed, enables the conclusion above to be properly drawn?"
- **Strengthen:** "Which one of the following, if true, most strengthens the argument?" · "…would provide the
  most support for…" · EXCEPT form: "Each of the following, if true, strengthens the argument EXCEPT:"
- **Weaken:** "Which one of the following, if true, most seriously weakens the argument?" · EXCEPT form:
  "Each of the following, if true, weakens the argument EXCEPT:"
- **Explain:** "Which one of the following, if true, most helps to resolve the apparent discrepancy described
  above?" · "…most helps to explain why…" · EXCEPT form: "Each of the following, if true, helps to resolve the
  apparent discrepancy described above EXCEPT:"
- **Most strongly supported:** "The statements above, if true, most strongly support which one of the
  following?" · "Which one of the following is most strongly supported by the information above?" · "Which one
  of the following most logically completes the argument?" (stimulus ends in a blank: "…since ______.")
- **Must be true:** "If the statements above are true, which one of the following must also be true?"
- **Must be false:** "If the statements above are true, which one of the following CANNOT be true?"
- **Principle (Justify):** "Which one of the following principles, if valid, most helps to justify the
  editor's reasoning?"
- **Principle (Conform):** "Which one of the following judgments most closely conforms to the principle stated
  above?" · "The principle stated above, if valid, most helps to justify the reasoning in which one of the
  following arguments?"
- **Parallel:** "Which one of the following arguments is most similar in its pattern of reasoning to the
  argument above?" · "The pattern of reasoning in which one of the following is most similar to that in the
  argument above?"
- **Parallel flaw:** "Which one of the following arguments exhibits a flawed pattern of reasoning most similar
  to that exhibited by the argument above?" · "The flawed pattern of reasoning in which one of the following is
  most similar to that in the argument above?"
- **Method:** "The historian's argument proceeds by" · "The ethicist responds to the critic by" · "…does which
  one of the following?"
- **Role:** "The claim that … plays which one of the following roles in the argument?" · "Which one of the
  following most accurately describes the role played in the argument by the claim that …?"
- **Main conclusion:** "Which one of the following most accurately expresses the main conclusion drawn in the
  argument?" · "…the overall conclusion drawn in the columnist's argument?"
- **Point at issue:** "Ana and Ben disagree over whether" · "The dialogue provides the most support for the claim
  that Ana and Ben disagree over whether" · agreement form: "…are committed to agreeing with which one of the
  following?"
- **Evaluate:** "The answer to which one of the following questions would be most useful to know in order to
  evaluate the argument?"

### Reasoning tags (`skills`)

`conditional` (formal logic, all/none/only/unless chains) · `causal` · `statistical` (percentages, rates,
averages) · `sampling` (studies and surveys) · `analogy` · `comparison` · `principle` · `plan` · `authority` ·
`rebuttal` (an argument answering another view) · `debate` (two speakers) · `fact-set` (no argument, just
facts).

### Flaw patterns (`flaws`, for Flaw and Parallel Flaw)

`causation` (correlation as cause) · `necessary-sufficient` · `sampling` · `percent-number` · `equivocation`
· `part-whole` · `absence-of-evidence` · `ad-hominem` · `bad-authority` · `circular` · `false-choice` ·
`possibility-certainty` · `straw-man` · `flawed-analogy` · `quantifier` (most/some chains) · `scope-shift`
(conclusion overreaches).

## Reading Comprehension question types

| id | Type | Share | Typical stem |
|---|---|---|---|
| `rc-inference` | Inference | 21% | "The author would be most likely to agree with which one of the following statements?" · "Which one of the following is most strongly supported by the passage?" · "The passage suggests that…" |
| `rc-detail` | Detail | 20% | "According to the passage, …" · "The passage provides information that most helps to answer which one of the following questions?" · "The passage cites each of the following as … EXCEPT:" |
| `rc-main-point` | Main point / Primary purpose | 12% | "Which one of the following most accurately expresses the main point of the passage?" · "The primary purpose of the passage is to" |
| `rc-function` | Function of a part | 11% | "The author mentions … (second paragraph) primarily in order to" · "The primary function of the third paragraph is to" |
| `rc-author-attitude` | Author attitude | 7% | "The author's attitude toward … can most accurately be described as" |
| `rc-analogy` | Analogy / Application | 6% | "Which one of the following is most analogous to …?" · "Based on the passage, in which one of the following … would …?" |
| `rc-strengthen-weaken` | Strengthen / Weaken | 6% | "Which one of the following, if true, would most call into question …?" · "…would most seriously undermine…" |
| `rc-comparative` | Comparative passages | 6% | "Both passages are primarily concerned with" · "The authors of the two passages would be most likely to disagree over whether" · "Which one of the following is mentioned in passage A but not in passage B?" |
| `rc-meaning` | Meaning in context | 5% | "By "…" (last sentence of the second paragraph), the author most probably means" |
| `rc-structure` | Organization | 4% | "Which one of the following most accurately describes the organization of the passage?" |

Refer to places in the passage by paragraph and sentence ("second sentence of the third paragraph"), not line
numbers. Passage subjects (`passages[].subject`): `law`, `natural-science`, `social-science`, `humanities`. A
section has one law passage, a humanities passage, a science passage, and usually one comparative pair (passage A
and passage B).

RC passages run 450–500 words (a comparative pair about 250 each), and they're about a real subject: a real case,
doctrine, artist, work, scientific finding or historical episode, handled accurately. A real passage has a
structure (a view, an objection, the author's refinement), more than one point of view, and an author with an
attitude that's often qualified rather than all-for or all-against.

## How the answers are built

- **One answer is right, provably.** An expert reading carefully must reach exactly one answer with no doubt. In
  inference and assumption questions, test it formally: negate a necessary-assumption answer and the argument
  must fall apart; a sufficient-assumption answer, added to the premises, must guarantee the conclusion.
- **Every wrong answer is wrong for a nameable reason:** out of scope, too strong (all/never/most vs. some),
  reversed (confuses necessary and sufficient), right fact but irrelevant to the gap, half right, true but doesn't
  answer the stem, or the opposite of what's asked. At least one wrong answer should be the trap a good student
  picks.
- **The right answer often sounds weaker than the traps.** Real keys hedge ("at least some", "could"), use
  paraphrase rather than the stimulus's words, and are rarely the longest choice.
- **No letter patterns.** Spread keys naturally across A–E; don't let the key be the longest or most specific
  choice more often than chance.
- Choices in a set are similar in length and grammar, and each begins in a way that completes the stem.

## JSON for each question

```json
{
  "number": 1,
  "stimulus": "Speaker: argument text…",
  "stem": "The reasoning in the argument is flawed in that the argument",
  "choices": ["…", "…", "…", "…", "…"],
  "answer": "C",
  "types": ["flaw"],
  "difficulty": 4,
  "skills": ["causal"],
  "flaws": ["causation"],
  "explanation": "2–4 sentences: why the key is right and what the main trap does wrong.",
  "breakdown": {
    "setup": [{ "label": "Conclusion", "text": "…" }, { "label": "Reasoning", "text": "…" }],
    "analysis": "How to attack it: the gap, the prephrase, what to watch for.",
    "choices": [{ "note": "Why (A) is wrong." }, { "note": "…" }, { "note": "CORRECT. Why (C) is right." }, { "note": "…" }, { "note": "…" }]
  }
}
```

RC questions leave `stimulus` empty and set `passageId`. The setup labels are `Conclusion`/`Reasoning` for
arguments, `Facts` for fact sets, `Paradox` for explain questions, and `Task` for parallel and principle
questions. Start the correct choice's note with "CORRECT." For a wrong flaw answer, the note can sketch an
argument that would commit that flaw; for each necessary-assumption choice, give its negation.

`difficulty` is 1–5 for real-test questions: 1 is an easy early-section question, 5 is the hardest kind of
question on PrepTests 150–159. Overdrive questions are level 6 (below).

## Overdrive: harder than the real test

Overdrive questions (difficulty **6**) are training weights: questions built to be clearly harder than anything
on a real LSAT, so real questions feel easy by comparison. They keep everything above, the real types, real stem
wording, one provably correct answer, the same kind of traps, so the skills transfer. Only the load goes up.

What makes a question harder without making it unfair:

- **Longer, denser stimuli** (130–200 words for LR) with more moving parts: a premise set that has to be combined,
  an intermediate conclusion, a concession, a counterargument and its rebuttal, or two speakers who each make a
  partial argument.
- **Heavier formal logic:** four- or five-link conditional chains with "unless", "only if", "no…except", and
  "not both" mixed in; quantifier chains ("most", "some", "all") where one step is invalid; contrapositives that
  need to be combined before the answer appears.
- **Numbers that need thought:** rates vs. totals, Simpson's-paradox-style mix effects, base rates, percentages
  of different wholes, averages over changing groups.
- **Abstract, carefully worded answers:** answers that describe the argument's structure in general terms
  ("treats a condition that is required for a result as one that guarantees it") so you have to map them back.
- **Two strong contenders:** a trap that is nearly right and fails on one word (scope, strength, the wrong
  group, the wrong time) and a key that's correct but sounds modest or oblique.
- **Twists on the stem:** EXCEPT and LEAST stems, "if true, would provide the LEAST support", "CANNOT be true",
  principle questions where the principle has an exception clause, role questions about a claim that's both
  supported and supporting, parallel questions where the key reorders the premises and conclusion.
- **RC:** 550–650-word passages in dense academic prose, about a real and demanding subject, with three or more
  positions (the author's often partial agreement with one of them), and qualified claims. Questions lean on
  inference, the author's precise attitude, the function of a sentence, application to a new case, and EXCEPT
  forms. Comparative pairs where the passages agree on more than they seem to.

What not to do: no trick questions, no ambiguity, no specialist knowledge, no deliberately confusing grammar beyond
what careful legal and academic prose uses. If a strong student who has the answer explained says "that's
unfair" rather than "I see it now", rewrite it. Every key must survive an independent blind solve.

## Fidelity check: does it break you the way the LSAT does?

Hard isn't the goal; hard *in the LSAT's way* is. Run every question, Overdrive included, through this check. A
question that's hard for a reason the real test never uses trains the wrong thing and fails, however good it is.

**1. The crux is a real LSAT skill.** Name the one move the question turns on. It must be one the test rewards:

- finding the conclusion and telling it apart from premises, intermediate conclusions, concessions and opposing views
- spotting the gap between premises and conclusion (new term in the conclusion, a shift in scope or strength)
- conditional logic: sufficient vs. necessary, contrapositives, "unless", "only if", "no…except", chaining
- quantifiers: what "most", "some", "all", "none" do and don't let you combine
- causal reasoning: alternative causes, reverse causation, coincidence, correlation treated as cause
- samples and studies: representativeness, self-selection, control groups, what was actually measured
- numbers: rates vs. totals, percentages of different wholes, averages over a changing mix (reasoned about, not calculated)
- analogies, comparisons, plans (will it work? at what cost?), principles (do all conditions apply?), authority and source attacks
- RC: the passage's structure, the author's view vs. other views, what a sentence is for, what the author would accept

**2. The difficulty comes from the LSAT's sources**, not from somewhere else. Real hard questions are hard
because of dense but natural prose, a conclusion that's easy to misidentify, a gap that's subtle, an answer
phrased abstractly, a correct answer that sounds weak, and a trap that's nearly right. They are *not* hard because
of arithmetic (if solving needs pencil computation of an exact figure, rewrite it so the numbers can be reasoned
about), outside knowledge, puzzle-like rule sets that read like a logic game, ambiguous grammar, double meanings
the test-maker didn't intend, dates or names you must track for their own sake, or a key that depends on a
debatable reading.

**3. The traps are the LSAT's traps.** Each wrong answer should be a recognizable LSAT trap:

- *reversal:* confuses sufficient and necessary, or reverses cause and effect
- *too strong / too weak:* right idea, wrong degree ("all" for "some", "must" for "could", "proves" for "suggests")
- *out of scope:* a new topic, group, time or comparison the stimulus never reaches
- *irrelevant truth:* true or plausible but doesn't touch the gap
- *premise restatement:* repeats what's already given (in strengthen, assumption and flaw questions)
- *opposite:* strengthens in a weaken question, or the reverse
- *wrong conclusion:* addresses an intermediate conclusion, a concession, or the opponent's claim
- *half right:* the first half fits, the second half doesn't
- *shell game:* the stimulus's own words, attached to the wrong idea
- *real flaw, wrong argument:* a genuine flaw pattern the argument doesn't commit (flaw questions)
- RC: *wrong position-holder* (someone else's view given to the author), *true but doesn't answer the stem*,
  *distortion* of what the passage says, *too extreme* an attitude

**4. It reads like the test.** A standard stem from the lists above; a speaker label where the test would use one
("Economist:"); conclusion and premise indicators used the way the test uses them; answer choices in the test's
register (flaw answers start with verbs like "takes for granted", "fails to consider", "confuses"); RC locators
by paragraph and sentence.

**5. It's fair.** A strong student who sees the explanation says "I see it now", not "that's unfair".

A reviewer records, for each question: the crux (from list 1), each wrong answer's trap type (from list 3), and a
verdict: *pass*, or *revise* with the reason. Revised questions get a fresh blind solve.
