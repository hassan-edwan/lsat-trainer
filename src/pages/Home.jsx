import { useState } from 'react';
import { useStore } from '../store.jsx';
import { navigate } from '../lib/nav.js';
import { normalizeImport } from '../lib/importer.js';
import { createPTSession } from '../lib/session.js';
import { scaledScore } from '../lib/analytics.js';
import { PageHeader } from '../components/Layout.jsx';

// Loads every bundled test listed in public/samples/index.json.
export async function loadBundledTests(addTests) {
  const base = `${import.meta.env.BASE_URL}samples/`;
  const files = await (await fetch(`${base}index.json`)).json();
  const tests = await Promise.all(files.map(async (f) => normalizeImport(await (await fetch(base + f)).json())));
  await addTests(tests.flat());
}

function scoreText(session, test) {
  const s = session.summary;
  if (!s) return '';
  const scaled = scaledScore(test, s.firstCorrect);
  const scaledBR = scaledScore(test, s.brCorrect);
  const raw = s.firstCorrect === s.brCorrect ? `${s.firstCorrect}/${s.total}` : `${s.firstCorrect}/${s.total} → ${s.brCorrect}/${s.total}`;
  return scaled ? `${scaled} → ${scaledBR} (${raw})` : raw;
}

export default function Home() {
  const { tests, sessions, addTests, saveSession, deleteSession } = useStore();
  const [busy, setBusy] = useState(false);
  const all = Object.values(sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active = all.filter((s) => s.phase !== 'done');
  const done = all.filter((s) => s.phase === 'done');
  const testById = Object.fromEntries(tests.map((t) => [t.id, t]));
  const practiceTests = tests.filter((t) => t.purpose !== 'diagnostic');
  const hasDiagnostic = tests.length > practiceTests.length;

  const start = async (test) => {
    const session = await saveSession(createPTSession(test));
    navigate(`/session/${session.id}`);
  };

  const KIND = { LR: 'Logical Reasoning', RC: 'Reading Comp', AR: 'Logic Games' };
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Practice"
        title="Practice tests"
        subtitle="Full tests under real conditions: 35-minute sections, a break after section 2, then blind review. Take one a week to track your score."
        actions={<a className="button" href="#/import">Import a test</a>}
      />

      {tests.length === 0 && (
        <section className="card hero">
          <h2>No tests loaded yet</h2>
          <p className="muted">
            The built-in tests are original LSAT-style tests written for this project. Official LSAC PrepTests aren't
            included because they're copyrighted, but you can import tests you have the right to use.
          </p>
          <div className="row">
            <button className="primary" disabled={busy} onClick={async () => { setBusy(true); await loadBundledTests(addTests); setBusy(false); }}>
              Load the practice tests
            </button>
            <a className="button" href="#/import">Import tests</a>
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section className="card">
          <h2>Pick up where you left off</h2>
          <div className="stack" style={{ gap: '0.6rem' }}>
            {active.map((s) => (
              <div key={s.id} className="plan-item">
                <span className="plan-icon">↻</span>
                <div className="plan-text">
                  <strong>{s.title}</strong>
                  <span className="muted small-text">
                    {s.phase === 'br' ? 'Blind review' : `Section ${s.current.section + 1} of ${s.sections.length}`} · last opened {new Date(s.updatedAt).toLocaleString()}
                  </span>
                </div>
                <button className="primary small" onClick={() => navigate(`/session/${s.id}`)}>Resume</button>
                <button className="small" onClick={() => confirm('Discard this session?') && deleteSession(s.id)}>Discard</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {practiceTests.length > 0 && (
        <div className="test-grid">
          {practiceTests.map((t) => {
            const taken = done.filter((s) => s.kind === 'pt' && s.testId === t.id);
            const qCount = t.sections.reduce((n, s) => n + s.questions.length, 0);
            return (
              <article key={t.id} className="test-card">
                <div>
                  <h3>{t.name}</h3>
                  <div className="meta" style={{ marginTop: '0.5rem' }}>
                    {Object.entries(t.sections.reduce((acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] || 0) + 1 }), {})).map(([k, n]) => (
                      <span key={k} className="chip">{KIND[k] || k}{n > 1 ? ` ×${n}` : ''}</span>
                    ))}
                  </div>
                </div>
                <div className="score">
                  {qCount} questions · {t.sections.length} section{t.sections.length === 1 ? '' : 's'}
                  <br />
                  {taken[0] ? <>Last score: <strong style={{ color: 'var(--text)' }}>{scoreText(taken[0], t)}</strong></> : 'Not taken yet'}
                </div>
                <div className="actions">
                  <button className="primary" onClick={() => start(t)}>{taken.length ? 'Retake' : 'Start test'}</button>
                  <a className="button" href={`#/test/${encodeURIComponent(t.id)}`}>Details</a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hasDiagnostic && (
        <section className="card row spread">
          <div>
            <h2>Not sure where to start?</h2>
            <p className="card-sub" style={{ margin: 0 }}>The skill diagnostic finds the difficulty level where each question type starts to break down for you.</p>
          </div>
          <a className="button primary" href="#/diagnostic">Open the diagnostic</a>
        </section>
      )}

      {done.length > 0 && (
        <section className="card">
          <h2>History</h2>
          <p className="card-sub">Every finished test, drill, and diagnostic. Scores show timed → after blind review.</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Session</th><th>Type</th><th>Finished</th><th>Score</th><th /></tr></thead>
              <tbody>
                {done.slice(0, 30).map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td><span className="chip">{s.kind === 'pt' ? 'Test' : s.kind === 'diagnostic' ? 'Diagnostic' : 'Drill'}</span></td>
                    <td className="muted">{new Date(s.finishedAt || s.updatedAt).toLocaleDateString()}</td>
                    <td>{scoreText(s, testById[s.testId])}</td>
                    <td className="right"><a className="button small" href={`#/session/${s.id}`}>Review</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
