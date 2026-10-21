# LSAT Trainer

An open-source, local-first LSAT practice environment. Take timed sections in a test-day style interface,
blind review your answers, drill by question type, and keep a journal of every question you miss twice.

It runs entirely in your browser. There's no account and no server, and your data never leaves your machine.

## Features

- **Today page with a daily plan:** a goal ring for the day, and a short queue built from your history: mistakes
  due for spaced review, a drill on your current weakest category, a stretch set of level-5 questions, and one
  bigger task (the diagnostic, journal write-ups, or a weekly full test). One **Start next** button, plus a
  **Quick 5** for when you only have a few minutes.
- **Motivation that tracks real progress:** a daily-goal streak (with earned streak freezes so one missed day
  doesn't erase weeks of work), an activity calendar, XP (more for hard questions, blind-review fixes, journal
  write-ups, and mastered mistakes), levels, 18 achievements, and bronze/silver/gold mastery badges per question
  type and category. All of it can be switched off in Settings.
- **Instant-feedback drills:** right/wrong and the explanation after each question, with a combo counter. Full
  tests keep test-day rules (no feedback until blind review is done).
- **Spaced review:** journal questions come back after 1, 3, 7, and 14 days; two correct retries in a row masters
  them.

- **Test-day interface:** two panes (passage or stimulus on the left, question on the right), a 35-minute
  section timer you can hide, a five-minute warning, a question bar with flags, crossing out answers, three
  highlighter colors and an eraser, adjustable text size, and the intermission after section 2. Keyboard:
  `A–E` answer, `Shift+A–E` cross out, `←/→` move, `F` flag.
- **Blind review:** after the timed sections, go through every question again untimed (or only the flagged
  ones) and re-answer. Each question gets one of four results: correct, fixed in blind review, changed to wrong
  in blind review, or wrong twice.
- **Mistake journal:** questions you get wrong in both the timed pass and blind review are added
  automatically. Each entry has fields for your thought process, what was tricky, why the right answer is
  right, and your takeaway, plus trap tags ("scope shift", "reversed conditional", …). Download them as
  Markdown, CSV, or JSON, with the full question text included.
- **AI tutor packs:** from the journal, download (or copy) a Markdown "tutor pack" and paste it into any AI chat
  (ChatGPT, Claude, Gemini). It contains instructions that turn the AI into an LSAT tutor: it asks for your
  reasoning before revealing anything, classifies the gap (misread, method gap, trap, logic gap, or timing),
  teaches it Socratically or directly (your choice), tests you on a fresh question of the same kind, and has you
  state the takeaway. The pack includes your weak-spot profile, each question with your answers and notes, and
  the correct answer and explanation in a section marked tutor-only. At the end the AI outputs a
  `lsat-trainer-notes` block; paste it back into the journal to save its reasoning, your takeaways, and trap tags.
  Each journal entry also has a **Copy for AI** button for a single question.
- **Standard categories:** besides its type, every question is tagged the way LSAT prep courses categorize
  questions, so you can see what you're weak at from several angles:
  - *Question family:* Assumption, Inference, Structure, and Explanation for LR; global, specific, and extended
    questions for RC (derived from the type).
  - *Reasoning type:* conditional/formal logic, causal, numbers & statistics, studies & samples, analogy,
    comparisons, principles, plans, authority, counterarguments, debate, and fact sets.
  - *Flaw pattern:* correlation vs. causation, necessary vs. sufficient, unrepresentative samples, percentages
    vs. numbers, equivocation, part vs. whole, lack of evidence as proof, attacking the source, bad appeals to
    authority, circular reasoning, false choice, possible-as-certain, straw man, flawed analogy, quantifier
    errors, and overreaching conclusions.
  - *RC passage subject:* law, natural science, social science, humanities.

  Analytics ranks your weakest categories and shows accuracy for each; results pages break each session down
  by category; the journal shows which reasoning types and flaw patterns you miss most; and every category can
  be drilled directly.
- **Question-type tagging:** every question is tagged with its type (Flaw, Necessary Assumption, MSS, RC
  Inference, …). Tags come from the test file or are guessed from the wording of the question stem, and you
  can change any of them.
- **Skill diagnostic:** every skill (17 of them, including conditional reasoning and debate/dialogue
  questions) has a ladder of questions from level 1 (easier than the LSAT) to level 5 (harder and sneakier
  than almost anything on it). A grid shows the level where each skill breaks, and every miss goes to the
  journal so you can write up your thinking. Each skill links to a drill that starts just below its breaking
  point.
- **Drills:**
  - *Smart drill* gives more questions to the types you miss most, especially ones you still miss after blind
    review. It's weighted by how often each type appears on the LSAT, and recent results count more than old
    ones.
  - *By type* lets you pick the types yourself, or cross-cutting skills: *conditional reasoning* (any
    question whose crux is formal logic) and *debate & dialogue*. You can also limit drills to hard questions.
  - *Journal retry* re-tests questions you've missed. A question counts as mastered after two correct timed
    retries in a row.
  - Drills keep RC passage questions together, and you can limit them to tests you've already taken so fresh
    tests stay fresh.
- **Analytics:** timed and blind-review accuracy by section and question type, average time per type, and a
  trend of recent sessions.
- **Backups:** download all your data as one file and restore it on another computer.

## About test content

**This app doesn't include official LSAC PrepTests.** LSAC holds the copyright to its PrepTests, so they can't
be bundled with or redistributed through an open-source project. The official way to practice with them is
[LSAC LawHub](https://www.lsac.org/lawhub).

What's included instead is **original** material written for this project:

- **Three full practice tests** in the current LSAT format (two LR sections of 25 and one RC section with four
  passages each, 231 questions). They are deliberately **harder than the real test**: about a quarter of
  the questions are rated level 5, with dense stimuli, stacked conditionals, indirect correct answers, and
  near-miss traps. Every section was solved blind by a separate checker to confirm the answer key.
- **A Flaw Pattern Practice Set** of 60 LR questions: five for each of twelve flaw patterns (equivocation,
  false choice, circular reasoning, straw man, bad authority, ad hominem, possible-as-certain, part vs. whole,
  lack of evidence, sampling, flawed analogy, overreaching conclusions), at difficulty 2 through 5, so every
  standard flaw pattern has enough questions to measure and drill.
- **Three Classic-Style Tests:** full LR / RC / LR tests (231 questions) written to match the voice and difficulty curve of recent
  LSATs (short everyday stimuli with one clean gap per question, the full range of standard stems, and RC
  passages built on the classic structures), for practicing at real-test difficulty.
- **The skill diagnostic** described above.
- **A full breakdown for every built-in question:** the conclusion and reasoning (or facts, paradox, or task),
  an analysis with the prephrase, and a note on every answer choice, with example arguments for wrong flaw
  answers and negations for every necessary-assumption choice.
- A short sample test. To practice with other material you have the right to use, import it:
[docs/FORMAT.md](docs/FORMAT.md) describes the JSON format and a plain-text format that's easy to produce from
copied text.

If you build up a library of freely licensed questions, contributions to `public/samples/` are welcome. Only
contribute content you wrote or that is openly licensed.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (classifier, importer, scoring, drills, journal)
npm run build      # static site in dist/
```

`dist/` is a static site, so you can host it anywhere (GitHub Pages, Netlify, Vercel) or open it with
`npm run preview`. Since all data is stored in the browser, each person who uses a hosted copy has their own
private data.

## How the smart drill decides

For each question type the app computes:

- **Miss rate:** the share of your timed answers that were wrong, with each attempt weighted by recency (half-life
  45 days) and smoothed toward 50% when you have few attempts.
- **Wrong-after-BR rate:** the same, counting only questions you still missed after blind review. These count
  1.5× because they show a gap in understanding rather than a timing problem.
- **Exam share:** roughly how often the type appears on the LSAT.

`priority = exam share × (miss rate + 1.5 × wrong-after-BR rate)`. The drill's questions are split across types
in proportion to priority. Within each type it picks un-mastered journal questions first, then questions you
haven't seen, then ones you last got wrong, then the rest (oldest first). The Drills page shows this table, so
you can see why it picked what it did.

## Project layout

```
src/lib/taxonomy.js   question types, exam weights, stem classifier
src/lib/importer.js   JSON validation and the plain-text parser
src/lib/analytics.js  outcomes, per-type stats, weakness scores, drill selection
src/lib/session.js    building PT and drill sessions; scoring them
src/lib/journal.js    journal entries, mastery, Markdown/CSV export
src/lib/db.js         IndexedDB storage and backups
src/components/       the exam interface (Runner), highlighter, question review
src/pages/            library, import, drills, journal, analytics, settings
scripts/parse-text.mjs  command-line text → JSON converter
```

## License

MIT. See [LICENSE](LICENSE). The license covers the code and the sample questions in this repository, not
any content you import.
