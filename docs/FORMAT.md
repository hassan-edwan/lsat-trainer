# Test file format

LSAT Trainer imports tests as **JSON** (`lsat-trainer/v1`) or as **plain text**, which is converted to JSON.
You can import several tests at once: a single test object, an array of tests, or `{ "tests": [...] }`.

Only import material you have the right to use. Imported tests stay in your browser; nothing is uploaded.
Keep private test files out of git: the repo's `.gitignore` already ignores `private/` and `*.private.json`.

## JSON

```json
{
  "format": "lsat-trainer/v1",
  "id": "my-test-1",
  "name": "My Practice Test 1",
  "number": 1,
  "source": "Where this came from (optional)",
  "sections": [
    {
      "id": "s1",
      "kind": "LR",
      "title": "Logical Reasoning",
      "timeLimitMinutes": 35,
      "questions": [
        {
          "number": 1,
          "stimulus": "The argument text…",
          "stem": "Which one of the following, if true, most strengthens the argument?",
          "choices": ["…", "…", "…", "…", "…"],
          "answer": "C",
          "types": ["strengthen"],
          "difficulty": 3,
          "explanation": "Optional, shown after you finish."
        }
      ]
    },
    {
      "id": "s2",
      "kind": "RC",
      "title": "Reading Comprehension",
      "passages": [{ "id": "p1", "title": "Optional title", "text": "Passage text…\n\nSecond paragraph…" }],
      "questions": [
        { "number": 1, "passageId": "p1", "stem": "…", "choices": ["…"], "answer": "A" }
      ]
    }
  ],
  "scoreConversion": { "75": 180, "74": 180, "73": 179 }
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Shown in the library. |
| `id` | no | Defaults to a slug of `name`. Importing a test with the same id replaces it. |
| `number` | no | Used to sort the library. |
| `sections[].kind` | yes | `LR`, `RC`, or `AR`. |
| `sections[].timeLimitMinutes` | no | Default 35. |
| `sections[].scored` | no | Set `false` for an experimental section. |
| `questions[].stimulus` | LR | The passage or argument above the stem. Leave it empty for RC (use `passageId`). |
| `questions[].stem` | yes | The question itself. Used for auto-tagging. |
| `questions[].choices` | yes | 2–5 strings, in order A–E. |
| `questions[].answer` | yes | A letter. |
| `questions[].types` | no | Question type ids (below). If omitted, they're guessed from the stem and marked "auto". |
| `questions[].difficulty` | no | 1–5. |
| `questions[].tags` | no | Free-form strings. `except` / `least` are added automatically. |
| `questions[].skills` | no | Cross-cutting skills: `conditional`, `debate`. If omitted, they're guessed from the stimulus; an explicit array (even `[]`) turns the guess off. |
| `purpose` | no | `"diagnostic"` marks a skill-diagnostic test: it appears on the Diagnostic page instead of the library and is kept out of drills. Its questions carry a `ladder:<skill id>` tag and `difficulty` = ladder level (1–5); see `src/lib/diagnostic.js` for the skill ids. |
| `scoreConversion` | no | Raw score → scaled score. If present, results show scaled scores. |

Use `\n\n` between paragraphs in `stimulus` and passage `text`.

## Plain text

```
# My Practice Test 1
## Section: LR | 35
1. Stimulus text. Hard line breaks from a PDF are fine;
they're joined back into paragraphs.
Which one of the following most strengthens the argument?
(A) …
(B) …
(C) …
(D) …
(E) …
@types sufficient-assumption
2. Next question (the @types line before it overrides auto-tagging)…

## Section: RC | 35 | Reading Comprehension
### Passage 1
Passage text…
1. The primary purpose of the passage is to
(A) …

## Answers
C A …
B D …
```

- `## Section: LR|RC|AR [| minutes] [| title]` starts a section.
- `### Passage [title]` starts an RC passage; questions after it belong to it until the next passage.
- Questions start with `1.` or `1)`. Choices start with `(A)`, `A.` or `A)`.
- **Stem detection:** in LR, the stem is the last paragraph before the choices. If there's only one paragraph, it's the last sentence ending in `?` or `:`. Check the preview, and put a blank line before the stem if it splits in the wrong place.
- `## Answers`: one line per section, in order, with the letters separated by spaces. A `1:` or `Section 1:` prefix is allowed.

Convert from the command line and see how each question was tagged:

```
npm run parse-text -- my-test.txt private/my-test.json
```

See [`examples/sample-text-format.txt`](examples/sample-text-format.txt) for a complete example.

## Question type ids

**Logical Reasoning:** `flaw`, `necessary-assumption`, `sufficient-assumption`, `strengthen`, `weaken`,
`most-strongly-supported`, `must-be-true`, `must-be-false`, `explain`, `principle-strengthen`,
`principle-apply`, `parallel`, `parallel-flaw`, `method`, `role`, `main-conclusion`, `point-at-issue`,
`evaluate`, `lr-other`

**Reading Comprehension:** `rc-main-point`, `rc-detail`, `rc-inference`, `rc-author-attitude`, `rc-function`,
`rc-structure`, `rc-analogy`, `rc-strengthen-weaken`, `rc-comparative`, `rc-other`

**Analytical Reasoning:** `ar-ordering`, `ar-grouping`, `ar-hybrid`

A question can have more than one type (for example `["principle-strengthen", "strengthen"]`). Its stats then
count toward each type.
