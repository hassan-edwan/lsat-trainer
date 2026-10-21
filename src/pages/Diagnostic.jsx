import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { navigate } from '../lib/nav.js';
import { buildDrill } from '../lib/analytics.js';
import { LADDERS, LEVELS, diagnosticOrder, ladderQuestions, ladderResults } from '../lib/diagnostic.js';
import { createDrillSession } from '../lib/session.js';
import { loadBundledTests } from '../lib/bundle.js';

const CELL = {
  correct: { label: '✓', title: 'Correct on the timed pass' },
  'br-fixed': { label: '½', title: 'Missed on the timed pass, fixed in blind review' },
  wrong: { label: '✗', title: 'Missed on the timed pass and in blind review' },
  untried: { label: '·', title: 'Not attempted yet' },
  none: { label: '', title: 'No question at this level' },
};

const PACES = [['90', '1:30 per question'], ['80', 'Test pace (1:20)'], ['0', 'Untimed']];

export default function Diagnostic() {
  const { diagnosticQuestions, questions, attempts, journal, installBundle, saveSession } = useStore();
  const available = useMemo(() => ladderQuestions(diagnosticQuestions), [diagnosticQuestions]);
  const ladders = LADDERS.filter((l) => available[l.id]);
  const [selected, setSelected] = useState(() => new Set(LADDERS.map((l) => l.id)));
  const [pace, setPace] = useState('90');
  const results = useMemo(() => ladderResults(diagnosticQuestions, attempts), [diagnosticQuestions, attempts]);
  const tried = results.filter((r) => r.levels.some((x) => x.attempts));
  const weakest = [...tried].sort((a, b) => (a.breaksAt ?? 6) - (b.breaksAt ?? 6) || a.cleared - b.cleared).slice(0, 5);

  const start = async (ids) => {
    const picked = diagnosticOrder(diagnosticQuestions, ids);
    if (!picked.length) return;
    const title = ids.length === 1 ? `Diagnostic: ${LADDERS.find((l) => l.id === ids[0]).title}` : 'Skill diagnostic';
    const s = await saveSession(createDrillSession(picked, { title, secondsPerQuestion: Number(pace), kind: 'diagnostic' }));
    navigate(`/session/${s.id}`);
  };

  const drill = async (ladder, fromLevel) => {
    const minLevel = Math.max(1, fromLevel - 1);
    const pool = questions.filter((q) => q.kind === ladder.kind && (q.difficulty == null || q.difficulty >= minLevel));
    const picked = buildDrill(pool, attempts, journal, { mode: 'types', types: ladder.drill.types || [], skills: ladder.drill.skills || [], kinds: [ladder.kind], count: 10 });
    if (!picked.length) { alert('No practice-test questions for this skill yet.'); return; }
    const s = await saveSession(createDrillSession(picked, { title: `Drill: ${ladder.title} (level ${minLevel}+)` }));
    navigate(`/session/${s.id}`);
  };

  if (!ladders.length) {
    return (
      <section className="card empty-state">
        <div className="empty-icon">🩺</div>
        <h2>The diagnostic isn't loaded yet</h2>
        <button className="primary" onClick={() => loadBundledTests(installBundle)}>Load the built-in tests</button>
      </section>
    );
  }

  const count = diagnosticOrder(diagnosticQuestions, [...selected]).length;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Practice"
        title="Skill diagnostic"
        subtitle="Each skill has five questions that climb from level 1 (a typical early-section question) to level 5 (the hardest questions on recent tests). The level where you start missing is your breaking point."
      />
      <section className="card">
        <h2>Choose skills to test</h2>
        <p className="card-sub">
          Levels run in order: every level 1 first, then level 2, and so on. Every miss goes to your <a href="#/journal">mistake journal</a> so you can write up your thinking.
        </p>
        <div className="type-grid">
          <h3>{count} questions selected</h3>
          {ladders.map((l) => (
            <label key={l.id}>
              <input type="checkbox" checked={selected.has(l.id)} onChange={() => {
                const next = new Set(selected);
                if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                setSelected(next);
              }} />
              {l.title}
            </label>
          ))}
        </div>
        <div className="form-row">
          <label>Timing
            <select value={pace} onChange={(e) => setPace(e.target.value)}>
              {PACES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button onClick={() => setSelected(new Set(ladders.map((l) => l.id)))}>Select all</button>
          <button onClick={() => setSelected(new Set())}>Clear</button>
        </div>
        <button className="primary" disabled={!count} onClick={() => start([...selected])}>Start diagnostic</button>
      </section>

      <section className="card">
        <h2>Where each skill breaks</h2>
        <p className="card-sub">Your most recent result at each level. Start drilling one level below the breaking point.</p>
        <div className="table-wrap"><table className="table ladder-grid">
          <thead>
            <tr><th>Skill</th>{LEVELS.map((l) => <th key={l} className="center">L{l}</th>)}<th>Breaks at</th><th /></tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                {r.levels.map((x) => (
                  <td key={x.level} className="center">
                    <span className={`ladder-cell lc-${x.status}`} title={CELL[x.status].title}>{CELL[x.status].label}</span>
                  </td>
                ))}
                <td>
                  {r.breaksAt ? <strong className="oc-wrong-twice">Level {r.breaksAt}</strong>
                    : r.complete && r.levels.some((x) => x.attempts) ? <span className="oc-correct">Cleared</span>
                      : <span className="muted">—</span>}
                </td>
                <td className="right">
                  <button className="small" onClick={() => start([r.id])}>Take ladder</button>{' '}
                  {r.breaksAt && <button className="small primary" onClick={() => drill(r, r.breaksAt)}>Drill from L{Math.max(1, r.breaksAt - 1)}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="muted small-text">✓ correct · ½ missed but fixed in blind review · ✗ missed both times · · not tried yet. The breaking point is the first level missed on the timed pass.</p>
      </section>

      {weakest.some((r) => r.breaksAt) && (
        <section className="card">
          <h2>Your weakest skills</h2>
          <ol>
            {weakest.filter((r) => r.breaksAt).map((r) => (
              <li key={r.id}><strong>{r.title}</strong>: breaks at level {r.breaksAt}{r.cleared ? `, solid through level ${r.cleared}` : ''}.</li>
            ))}
          </ol>
          <p className="muted">
            Start each drill one level below the breaking point, then write up every miss in the journal. Retaking a
            ladder reuses the same questions, so it's most useful after a few weeks.
          </p>
        </section>
      )}
    </div>
  );
}
