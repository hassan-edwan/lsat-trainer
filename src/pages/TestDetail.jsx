import { useState } from 'react';
import { useStore } from '../store.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { navigate } from '../lib/nav.js';
import { createPTSession } from '../lib/session.js';
import { typeLabel, typesForKind } from '../lib/taxonomy.js';

export function TypeEditor({ kind, types, onChange }) {
  const options = typesForKind(kind);
  return (
    <div className="type-editor">
      {types.map((t) => (
        <span key={t} className="chip">
          {typeLabel(t)}
          {types.length > 1 && <button className="chip-x" title="Remove" onClick={() => onChange(types.filter((x) => x !== t))}>×</button>}
        </span>
      ))}
      <select value="" onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        // Choosing a type replaces a lone auto-tag; otherwise adds.
        onChange(e.target.selectedOptions[0].dataset.replace === '1' ? [v] : [...types, v]);
      }}>
        <option value="">Change…</option>
        <optgroup label="Replace with">
          {options.map((o) => <option key={o.id} value={o.id} data-replace="1">{o.label}</option>)}
        </optgroup>
        <optgroup label="Also tag as">
          {options.filter((o) => !types.includes(o.id)).map((o) => <option key={`add-${o.id}`} value={o.id}>{o.label}</option>)}
        </optgroup>
      </select>
    </div>
  );
}

export default function TestDetail({ id }) {
  const { allTests: tests, saveTest, deleteTest, saveSession } = useStore();
  const test = tests.find((t) => t.id === id);
  const [selected, setSelected] = useState(() => new Set(test?.sections.map((s) => s.id)));
  const [timed, setTimed] = useState(true);
  const [blindReview, setBlindReview] = useState(true);
  const [open, setOpen] = useState(null);
  const [showAnswers, setShowAnswers] = useState(false);

  if (!test) return <div className="card">Test not found. <a href="#/library">Back to library</a></div>;

  const start = async () => {
    const session = await saveSession(createPTSession(test, { sectionIds: [...selected], timed, blindReview }));
    navigate(`/session/${session.id}`);
  };

  const setTypes = (sectionId, qid, types) => {
    saveTest({
      ...test,
      sections: test.sections.map((s) => s.id !== sectionId ? s : {
        ...s,
        questions: s.questions.map((q) => (q.id === qid ? { ...q, types, autoTagged: false } : q)),
      }),
    });
  };

  return (
    <div className="stack">
      <PageHeader
        eyebrow={<a href="#/library">← Practice tests</a>}
        title={test.name}
        subtitle={test.source}
        actions={<button className="danger small" onClick={async () => {
          if (confirm(`Delete "${test.name}" from your library? Your history and journal entries are kept.`)) {
            await deleteTest(test.id);
            navigate('/library');
          }
        }}>Delete test</button>}
      />
      <section className="card">
        <h2>Start this test</h2>
        <p className="card-sub">Take every section for the full experience, or pick sections to practice.</p>
        <div className="checks">
          {test.sections.map((s, i) => (
            <label key={s.id}>
              <input type="checkbox" checked={selected.has(s.id)} onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(s.id); else next.delete(s.id);
                setSelected(next);
              }} />
              Section {i + 1}: {s.title} — {s.questions.length} questions, {s.timeLimitMinutes} min
            </label>
          ))}
        </div>
        <div className="checks">
          <label><input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} /> Timed</label>
          <label><input type="checkbox" checked={blindReview} onChange={(e) => setBlindReview(e.target.checked)} /> Blind review after the timed sections</label>
        </div>
        <button className="primary big" disabled={selected.size === 0} onClick={start}>
          Start {selected.size === test.sections.length ? 'full test' : `${selected.size} section${selected.size === 1 ? '' : 's'}`}
        </button>
      </section>

      {test.sections.map((s, i) => (
        <section className="card" key={s.id}>
          <h2>Section {i + 1}: {s.title}</h2>
          <div className="row spread">
            <p className="muted">Question types are tagged automatically when no type is given. Fix any tag here; your stats update right away.</p>
            <label className="inline"><input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} /> Show answers</label>
          </div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>#</th><th>Question</th><th>Type</th><th>Ans</th></tr></thead>
            <tbody>
              {s.questions.map((q) => (
                <tr key={q.id}>
                  <td>{q.number}</td>
                  <td className="stem-cell">
                    <button className="linklike" onClick={() => setOpen(open === q.id ? null : q.id)}>{q.stem}</button>
                    {open === q.id && (
                      <div className="mini-q">
                        {q.stimulus && <p className="pre">{q.stimulus}</p>}
                        <ol type="A">{q.choices.map((c, ci) => <li key={ci}>{c}</li>)}</ol>
                      </div>
                    )}
                  </td>
                  <td>
                    <TypeEditor kind={s.kind} types={q.types} onChange={(types) => setTypes(s.id, q.id, types)} />
                    {q.autoTagged && <span className="badge">auto</span>}
                  </td>
                  <td>{showAnswers ? q.answer : '•'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      ))}
    </div>
  );
}
