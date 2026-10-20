import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { STATUSES, TRAP_TAGS, journalPatterns, toCSV, toMarkdown } from '../lib/journal.js';
import { typeLabel } from '../lib/taxonomy.js';
import { download, today } from '../lib/download.js';
import QuestionReview from '../components/QuestionReview.jsx';

const FIELDS = [
  ['myReasoning', 'My thought process', 'What were you thinking when you picked your answer, in the timed pass and in blind review?'],
  ['tricky', 'What was tricky', 'What made this question hard? Which wrong answer was attractive, and why?'],
  ['correctReasoning', 'Why the right answer is right', 'Explain the correct answer in your own words, and why your answer is wrong.'],
  ['takeaway', 'Takeaway for next time', 'A rule or habit to use next time you see this kind of question.'],
];

function snapshotEntry(e) {
  // QuestionReview expects the library shape; journal entries carry a snapshot.
  return {
    question: { stimulus: e.stimulus, stem: e.stem, choices: e.choices, answer: e.answer },
    passage: e.passage ? { text: e.passage } : null,
  };
}

function EntryCard({ entry, onSave, onDelete, defaultOpen }) {
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
            {entry.traps.map((t) => <span key={t} className="chip trap">{t}</span>)}
          </div>
        </div>
        <div className="journal-meta">
          <span>Timed {entry.first ?? '—'} · BR {entry.br ?? '—'} · Correct {entry.answer}</span>
          <span className="muted">Missed {entry.occurrences.length}× · {filled}/4 notes{entry.retries.length ? ` · retries ${entry.retries.filter((r) => r.correct).length}/${entry.retries.length}` : ''}</span>
          <select value={entry.status} onClick={(e) => e.stopPropagation()} onChange={(e) => commit({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {open && (
        <div className="journal-body">
          <QuestionReview entry={snapshotEntry(entry)} first={entry.first} br={entry.br} />
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
            <span className="muted small-text">Added {new Date(entry.addedAt).toLocaleDateString()} ({entry.source === 'auto' ? 'wrong twice' : 'added by hand'})</span>
            <button className="danger small" onClick={() => confirm('Remove this question from your journal?') && onDelete(entry.qid)}>Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Journal() {
  const { journal, saveJournalEntry, deleteJournalEntry } = useStore();
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const [trap, setTrap] = useState('');
  const [q, setQ] = useState('');

  const all = useMemo(() => Object.values(journal).sort((a, b) => b.addedAt.localeCompare(a.addedAt)), [journal]);
  const entries = all.filter((e) =>
    (status === 'all' || (status === 'open' ? e.status !== 'mastered' : e.status === status))
    && (!type || e.types.includes(type))
    && (!trap || e.traps.includes(trap))
    && (!q || `${e.stimulus} ${e.stem} ${e.myReasoning} ${e.tricky} ${e.takeaway} ${e.testName}`.toLowerCase().includes(q.toLowerCase())));
  const patterns = journalPatterns(all.filter((e) => e.status !== 'mastered'));
  const allTypes = [...new Set(all.flatMap((e) => e.types))];

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
          <label>Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {allTypes.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
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

      {all.length > 0 && (patterns.types.length > 0) && (
        <section className="card">
          <h2>Patterns in what you miss</h2>
          <div className="two-col">
            <div>
              <h3>Types</h3>
              {patterns.types.slice(0, 6).map(([t, n]) => <div key={t} className="pattern-row"><span>{typeLabel(t)}</span><span>{n}</span></div>)}
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
      ) : entries.map((e, i) => <EntryCard key={e.qid} entry={e} defaultOpen={i === 0} onSave={saveJournalEntry} onDelete={deleteJournalEntry} />)}
    </div>
  );
}
