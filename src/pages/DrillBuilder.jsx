import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { navigate } from '../lib/nav.js';
import { allocate, buildDrill, shuffle, weaknessScores } from '../lib/analytics.js';
import { createDrillSession } from '../lib/session.js';
import { SECTION_KINDS, SKILLS, typeLabel, typesForKind } from '../lib/taxonomy.js';

const PACES = [
  ['80', 'Test pace (1:20 per question)'],
  ['100', 'Relaxed (1:40 per question)'],
  ['60', 'Fast (1:00 per question)'],
  ['0', 'Untimed'],
];

export default function DrillBuilder() {
  const { questions, index, attempts, journal, sessions, saveSession } = useStore();
  const [mode, setMode] = useState('smart');
  const [kinds, setKinds] = useState(['LR']);
  const [types, setTypes] = useState([]);
  const [skills, setSkills] = useState([]);
  const [count, setCount] = useState(10);
  const [pace, setPace] = useState('80');
  const [blindReview, setBlindReview] = useState(true);
  const [saveFresh, setSaveFresh] = useState(false);
  const [minDifficulty, setMinDifficulty] = useState(1);

  // Tests the user has started at least once as a full PT.
  const takenTests = useMemo(() => new Set(Object.values(sessions).filter((s) => s.kind === 'pt').map((s) => s.testId)), [sessions]);
  const pool = useMemo(
    () => questions.filter((q) => (!saveFresh || takenTests.has(q.testId))
      && (q.difficulty == null || q.difficulty >= minDifficulty)),
    [questions, saveFresh, takenTests, minDifficulty],
  );

  const typeCounts = useMemo(() => {
    const c = {};
    pool.forEach((q) => [...q.types, ...(q.tags || [])].forEach((t) => { c[t] = (c[t] || 0) + 1; }));
    return c;
  }, [pool]);

  const weakness = useMemo(() => {
    const available = new Set(pool.filter((q) => kinds.includes(q.kind)).flatMap((q) => q.types));
    const rows = weaknessScores(attempts, { kinds }).filter((r) => available.has(r.type));
    return allocate(rows, count);
  }, [attempts, kinds, pool, count]);

  const maxScore = Math.max(0, ...weakness.map((r) => r.score)) || 1;
  const journalOpen = Object.values(journal).filter((e) => e.status !== 'mastered');

  const start = async () => {
    let picked;
    let title;
    if (mode === 'journal') {
      // Use the index rather than `questions` so diagnostic misses can be retried too.
      picked = shuffle(journalOpen.map((e) => index[e.qid]).filter(Boolean)
        .map(({ question, section, test }) => ({ ...question, kind: section.kind, testId: test.id }))).slice(0, count);
      title = 'Mistake journal retry';
    } else {
      picked = buildDrill(pool, attempts, journal, { mode, types, skills, kinds, count });
      title = mode === 'smart' ? 'Smart drill' : `Drill: ${[...skills.map((k) => SKILLS[k]), ...types.map(typeLabel)].join(', ')}`;
    }
    if (!picked.length) {
      alert('No matching questions. Import more tests or change the filters.');
      return;
    }
    const session = await saveSession(createDrillSession(picked, { title, secondsPerQuestion: Number(pace), blindReview }));
    navigate(`/session/${session.id}`);
  };

  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const canStart = mode === 'journal' ? journalOpen.length > 0 : kinds.length > 0 && (mode !== 'types' || types.length > 0 || skills.length > 0);

  return (
    <div className="stack">
      <section className="card">
        <h1>Drills</h1>
        <div className="tabs">
          {[['smart', 'Smart drill'], ['types', 'By question type'], ['journal', 'Retry journal questions']].map(([m, l]) => (
            <button key={m} className={mode === m ? 'tab active' : 'tab'} onClick={() => setMode(m)}>{l}</button>
          ))}
        </div>

        {mode === 'smart' && (
          <p className="muted">
            Smart drills give more questions to the types you miss most, especially ones you still miss after blind
            review, weighted by how often each type appears on the LSAT. Recent results count more than old ones.
            Within each type, journal questions come first, then questions you haven't seen.
          </p>
        )}
        {mode === 'journal' && (
          <p className="muted">
            {journalOpen.length} journal question{journalOpen.length === 1 ? '' : 's'} not yet mastered. A question counts
            as mastered after two correct timed retries in a row.
          </p>
        )}

        {mode !== 'journal' && (
          <div className="checks">
            {['LR', 'RC'].map((k) => (
              <label key={k}><input type="checkbox" checked={kinds.includes(k)} onChange={() => toggle(kinds, setKinds, k)} /> {SECTION_KINDS[k]}</label>
            ))}
            <label title="Keep tests you haven't taken yet fresh for full timed practice">
              <input type="checkbox" checked={saveFresh} onChange={(e) => setSaveFresh(e.target.checked)} /> Only use tests I've already taken
            </label>
          </div>
        )}

        {mode === 'types' && (
          <div className="type-grid">
            <h3>Skills (across question types)</h3>
            {Object.entries(SKILLS).map(([id, label]) => (
              <label key={id} className={typeCounts[id] ? '' : 'disabled'}>
                <input type="checkbox" disabled={!typeCounts[id]} checked={skills.includes(id)} onChange={() => toggle(skills, setSkills, id)} />
                {label} <span className="muted">({typeCounts[id] || 0})</span>
              </label>
            ))}
          </div>
        )}
        {mode === 'types' && kinds.map((k) => (
          <div key={k} className="type-grid">
            <h3>{SECTION_KINDS[k]}</h3>
            {typesForKind(k).map((t) => (
              <label key={t.id} className={typeCounts[t.id] ? '' : 'disabled'}>
                <input type="checkbox" disabled={!typeCounts[t.id]} checked={types.includes(t.id)} onChange={() => toggle(types, setTypes, t.id)} />
                {t.label} <span className="muted">({typeCounts[t.id] || 0})</span>
              </label>
            ))}
          </div>
        ))}

        <div className="form-row">
          <label>Questions <input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} /></label>
          <label>Difficulty
            <select value={minDifficulty} onChange={(e) => setMinDifficulty(Number(e.target.value))}>
              <option value={1}>All</option>
              <option value={3}>Medium and up (3–5)</option>
              <option value={4}>Hard (4–5)</option>
              <option value={5}>Hardest only (5)</option>
            </select>
          </label>
          <label>Timing
            <select value={pace} onChange={(e) => setPace(e.target.value)}>
              {PACES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="inline"><input type="checkbox" checked={blindReview} onChange={(e) => setBlindReview(e.target.checked)} /> Blind review afterward</label>
        </div>
        <button className="primary" disabled={!canStart} onClick={start}>Start drill</button>
      </section>

      {mode === 'smart' && (
        <section className="card">
          <h2>What a smart drill of {count} would focus on</h2>
          <table className="table">
            <thead><tr><th>Type</th><th>Your attempts</th><th>Miss rate</th><th>Wrong after BR</th><th>Exam share</th><th>Priority</th><th>Questions</th></tr></thead>
            <tbody>
              {[...weakness].sort((a, b) => b.score - a.score).filter((r) => r.slots > 0 || r.n > 0).map((r) => (
                <tr key={r.type}>
                  <td>{r.label}</td>
                  <td>{r.n}</td>
                  <td>{r.n ? `${Math.round(r.missRate * 100)}%` : '—'}</td>
                  <td>{r.n ? `${Math.round(r.twiceRate * 100)}%` : '—'}</td>
                  <td>{Math.round(r.weight * 100)}%</td>
                  <td><div className="bar"><div style={{ width: `${(r.score / maxScore) * 100}%` }} /></div></td>
                  <td>{r.slots}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {attempts.length === 0 && <p className="muted">No history yet, so the mix follows how often each type appears on the LSAT. Take a test or drill to personalize it.</p>}
        </section>
      )}
    </div>
  );
}
