import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { STATUSES, TRAP_TAGS, journalPatterns, toCSV, toMarkdown } from '../lib/journal.js';
import { CATEGORY_GROUPS, categoriesOf, categoryLabel, typeLabel } from '../lib/taxonomy.js';
import { download, today } from '../lib/download.js';
import QuestionReview from '../components/QuestionReview.jsx';
import { XP, isWrittenUp, journalDueAt } from '../lib/progress.js';
import { TUTOR_MODES, applyTutorNote, buildTutorPack, parseTutorNotes } from '../lib/tutorExport.js';
import { categoryStats, typeStats } from '../lib/analytics.js';
import { ladderResults } from '../lib/diagnostic.js';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/** The student's weak spots, for the tutor pack's profile section. */
function useTutorProfile() {
  const { attempts, diagnosticQuestions } = useStore();
  return useMemo(() => {
    const byWeakness = (stats) => Object.values(stats).filter((x) => x.n >= 3).sort((a, b) => a.firstAccuracy - b.firstAccuracy).slice(0, 5);
    const cats = Object.fromEntries(Object.entries(categoryStats(attempts)).filter(([k]) => !k.startsWith('family:') && !k.startsWith('subject:')));
    return {
      weakCategories: byWeakness(cats),
      weakTypes: byWeakness(typeStats(attempts)),
      ladders: ladderResults(diagnosticQuestions, attempts).filter((r) => r.breaksAt),
    };
  }, [attempts, diagnosticQuestions]);
}

const FIELDS = [
  ['myReasoning', 'My thought process', 'What were you thinking when you picked your answer, in the timed pass and in blind review?'],
  ['tricky', 'What was tricky', 'What made this question hard? Which wrong answer was attractive, and why?'],
  ['correctReasoning', 'Why the right answer is right', 'Explain the correct answer in your own words, and why your answer is wrong.'],
  ['takeaway', 'Takeaway for next time', 'A rule or habit to use next time you see this kind of question.'],
];

function dueLabel(entry) {
  const due = journalDueAt(entry);
  if (due === Infinity) return 'Mastered';
  const days = Math.ceil((due - Date.now()) / 86_400_000);
  return days <= 0 ? '🔁 Due for review' : `Review in ${days} day${days === 1 ? '' : 's'}`;
}

function snapshotEntry(e) {
  // QuestionReview expects the library shape; journal entries carry a snapshot.
  return {
    question: { stimulus: e.stimulus, stem: e.stem, choices: e.choices, answer: e.answer },
    passage: e.passage ? { text: e.passage } : null,
  };
}

function EntryCard({ entry, onSave, onDelete, defaultOpen, onCopyForAI }) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState(entry);
  useEffect(() => { setDraft(entry); }, [entry]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const commit = (patch = {}) => onSave({ ...draft, ...patch });
  const filled = FIELDS.filter(([k]) => entry[k]?.trim()).length;

  return (
    <div className={`journal-entry status-${entry.status}`}>
      <div className="journal-head" onClick={() => setOpen(!open)}>
        <div>
          <strong>{entry.testName}</strong> · {entry.sectionTitle} Q{entry.number}
          <div className="chips">
            {entry.types.map((t) => <span key={t} className="chip">{typeLabel(t)}</span>)}
            {categoriesOf(entry).filter((c) => !c.startsWith('family:')).map((c) => <span key={c} className="chip cat">{categoryLabel(c)}</span>)}
            {entry.traps.map((t) => <span key={t} className="chip trap">{t}</span>)}
          </div>
        </div>
        <div className="journal-meta">
          <span>Timed {entry.first ?? '—'} · BR {entry.br ?? '—'} · Correct {entry.answer}</span>
          <span className="muted">{dueLabel(entry)} · Missed {entry.occurrences.length}× · {filled}/4 notes{entry.retries.length ? ` · retries ${entry.retries.filter((r) => r.correct).length}/${entry.retries.length}` : ''}</span>
          <select value={entry.status} onClick={(e) => e.stopPropagation()} onChange={(e) => commit({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {open && (
        <div className="journal-body">
          <QuestionReview entry={snapshotEntry(entry)} first={entry.first} br={entry.br} />
          {!isWrittenUp(entry) && <div className="xp-hint">✍️ Fill in all four notes for +{XP.journalWriteup} XP. Writing it down is what makes the lesson stick.</div>}
          <div className="journal-fields">
            {FIELDS.map(([k, label, hint]) => (
              <label key={k}>
                <span>{label}</span>
                <textarea rows={3} placeholder={hint} value={draft[k]} onChange={(e) => set({ [k]: e.target.value })} onBlur={() => commit()} />
              </label>
            ))}
          </div>
          <div>
            <span className="field-label">Traps that got me</span>
            <div className="chips">
              {TRAP_TAGS.map((t) => (
                <button key={t} className={`chip toggle ${draft.traps.includes(t) ? 'on' : ''}`}
                  onClick={() => commit({ traps: draft.traps.includes(t) ? draft.traps.filter((x) => x !== t) : [...draft.traps, t] })}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="row spread">
            <span className="muted small-text">Added {new Date(entry.addedAt).toLocaleDateString()} ({{ auto: 'wrong twice', diagnostic: 'missed in diagnostic', manual: 'added by hand' }[entry.source] || entry.source})</span>
            <div className="row">
              <button className="small" onClick={() => onCopyForAI(entry)} title="Copy this mistake with tutor instructions, to paste into an AI chat">🤖 Copy for AI</button>
              <button className="danger small" onClick={() => confirm('Remove this question from your journal?') && onDelete(entry.qid)}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Journal() {
  const { journal, index, saveJournalEntry, deleteJournalEntry } = useStore();
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const [trap, setTrap] = useState('');
  const [q, setQ] = useState('');

  // Entries saved before categories existed get their tags from the library.
  const all = useMemo(() => Object.values(journal)
    .map((e) => (e.tags ? e : { ...e, tags: index[e.qid]?.question.tags || [] }))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt)), [journal, index]);
  const entries = all.filter((e) =>
    (status === 'all' || (status === 'open' ? e.status !== 'mastered' : e.status === status))
    && (!type || e.types.includes(type) || categoriesOf(e).includes(type))
    && (!trap || e.traps.includes(trap))
    && (!q || `${e.stimulus} ${e.stem} ${e.myReasoning} ${e.tricky} ${e.takeaway} ${e.testName}`.toLowerCase().includes(q.toLowerCase())));
  const patterns = journalPatterns(all.filter((e) => e.status !== 'mastered'));
  const allTypes = [...new Set(all.flatMap((e) => e.types))];
  const allCats = new Set(all.flatMap((e) => categoriesOf(e)));

  const profile = useTutorProfile();
  const [mode, setMode] = useState('socratic');
  const [limit, setLimit] = useState(8);
  const [notice, setNotice] = useState('');
  const [pasted, setPasted] = useState('');
  const noticeTimer = useRef(null);
  const flash = (msg) => {
    clearTimeout(noticeTimer.current);
    setNotice(msg);
    noticeTimer.current = setTimeout(() => setNotice(''), 4000);
  };
  const explanationOf = (qid) => index[qid]?.question.explanation || '';
  const pack = (list) => buildTutorPack(list, { mode, profile, explanationOf });
  const packEntries = entries.slice(0, limit);
  const importNotes = async () => {
    try {
      const notes = parseTutorNotes(pasted);
      let n = 0;
      for (const note of notes) {
        const e = journal[note.id];
        if (!e) continue;
        await saveJournalEntry(applyTutorNote(e, note));
        n += 1;
      }
      setPasted('');
      flash(n ? `Added tutor notes to ${n} journal entr${n === 1 ? 'y' : 'ies'}.` : 'None of those ids are in your journal.');
    } catch (err) {
      flash(err.message);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="row spread">
          <h1>Mistake journal</h1>
          <div className="row">
            <button disabled={!entries.length} onClick={() => download(`lsat-mistakes-${today()}.md`, toMarkdown(entries), 'text/markdown')}>Download Markdown</button>
            <button disabled={!entries.length} onClick={() => download(`lsat-mistakes-${today()}.csv`, toCSV(entries), 'text/csv')}>CSV</button>
            <button disabled={!entries.length} onClick={() => download(`lsat-mistakes-${today()}.json`, JSON.stringify(entries, null, 2), 'application/json')}>JSON</button>
          </div>
        </div>
        <p className="muted">
          Questions you get wrong in both the timed pass and blind review are added here automatically. For each one,
          write down how you were thinking and what tricked you. Downloads include the full question text and only
          the entries matching your current filters.
        </p>
        <div className="form-row">
          <label>Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open">Not mastered</option><option value="all">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Type or category
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <optgroup label="Question type">
                {allTypes.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
              </optgroup>
              {CATEGORY_GROUPS.map((g) => {
                const keys = Object.keys(g.entries).map((id) => `${g.id}:${id}`).filter((k) => allCats.has(k));
                return keys.length ? (
                  <optgroup key={g.id} label={g.label}>
                    {keys.map((k) => <option key={k} value={k}>{categoryLabel(k)}</option>)}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
          <label>Trap
            <select value={trap} onChange={(e) => setTrap(e.target.value)}>
              <option value="">Any</option>
              {TRAP_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Search <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="text or notes" /></label>
        </div>
      </section>

      {all.length > 0 && (
        <section className="card tutor-card">
          <h2>🤖 Study with an AI tutor</h2>
          <p>
            Download a tutoring pack and paste it into ChatGPT, Claude, Gemini, or any AI chat (or attach the file). It
            tells the AI how to tutor you: hear your reasoning first, pinpoint the exact gap, teach it, test you on a
            fresh question, and lock in a takeaway. It includes the correct answers, hidden from you until you've
            explained your thinking, and your weak-spot profile.
          </p>
          <div className="form-row">
            <label>Teaching style
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {Object.entries(TUTOR_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Questions per session
              <input type="number" min={1} max={50} value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
            </label>
          </div>
          <div className="row">
            <button className="primary" disabled={!packEntries.length} onClick={() => download(`lsat-tutor-session-${today()}.md`, pack(packEntries), 'text/markdown')}>
              Download tutor pack ({packEntries.length})
            </button>
            <button disabled={!packEntries.length} onClick={async () => { await copyText(pack(packEntries)); flash('Copied. Paste it into your AI chat as the first message.'); }}>
              Copy to clipboard
            </button>
            <span className="muted small-text">Uses the first {packEntries.length} of the {entries.length} entries matching your filters. Filter by category to work on one weakness.</span>
          </div>
          <details className="tutor-import">
            <summary>Bring the tutor's notes back into your journal</summary>
            <p className="muted small-text">
              At the end of the session (or when you say "wrap up"), the tutor writes a <code>lsat-trainer-notes</code> block.
              Paste its final message here to add the reasoning, takeaways, and trap tags to these entries.
            </p>
            <textarea rows={5} className="code" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the tutor's final message here" />
            <button disabled={!pasted.trim()} onClick={importNotes}>Add notes to journal</button>
          </details>
        </section>
      )}

      {all.length > 0 && (patterns.types.length > 0) && (
        <section className="card">
          <h2>Patterns in what you miss</h2>
          <div className="three-col">
            <div>
              <h3>Types</h3>
              {patterns.types.slice(0, 6).map(([t, n]) => <div key={t} className="pattern-row"><span>{typeLabel(t)}</span><span>{n}</span></div>)}
            </div>
            <div>
              <h3>Reasoning &amp; flaw patterns</h3>
              {patterns.categories.slice(0, 6).map(([c, n]) => <div key={c} className="pattern-row"><span>{categoryLabel(c)}</span><span>{n}</span></div>)}
            </div>
            <div>
              <h3>Traps</h3>
              {patterns.traps.length ? patterns.traps.slice(0, 6).map(([t, n]) => <div key={t} className="pattern-row"><span>{t}</span><span>{n}</span></div>)
                : <p className="muted">Tag traps on your entries to see which ones you fall for most.</p>}
            </div>
          </div>
          <a className="button" href="#/drill">Drill these weaknesses →</a>
        </section>
      )}

      {entries.length === 0 ? (
        <section className="card muted">{all.length ? 'No entries match these filters.' : 'Nothing here yet. Questions you miss in both the timed pass and blind review will show up here.'}</section>
      ) : entries.map((e, i) => <EntryCard key={e.qid} entry={e} defaultOpen={i === 0} onSave={saveJournalEntry} onDelete={deleteJournalEntry}
        onCopyForAI={async (entry) => { await copyText(pack([entry])); flash('Copied this question with tutor instructions. Paste it into your AI chat.'); }} />)}
      {notice && <p className="notice" role="status">{notice}</p>}
    </div>
  );
}
