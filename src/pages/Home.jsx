import { useState } from 'react';
import { useStore } from '../store.jsx';
import { navigate } from '../lib/nav.js';
import { normalizeImport } from '../lib/importer.js';
import { createPTSession } from '../lib/session.js';
import { scaledScore } from '../lib/analytics.js';

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
  const raw = `${s.firstCorrect}/${s.total} → BR ${s.brCorrect}/${s.total}`;
  return scaled ? `${scaled} → BR ${scaledBR} (${raw})` : raw;
}

export default function Home() {
  const { tests, sessions, addTests, saveSession, deleteSession } = useStore();
  const [busy, setBusy] = useState(false);
  const all = Object.values(sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active = all.filter((s) => s.phase !== 'done');
  const done = all.filter((s) => s.phase === 'done');
  const testById = Object.fromEntries(tests.map((t) => [t.id, t]));

  const start = async (test) => {
    const session = await saveSession(createPTSession(test));
    navigate(`/session/${session.id}`);
  };

  return (
    <div className="stack">
      {tests.length === 0 && (
        <section className="card hero">
          <h1>Welcome to LSAT Trainer</h1>
          <p>
            Take timed sections in a test-day style interface, blind review your answers, drill by question type,
            and keep a journal of the questions you miss twice.
          </p>
          <p className="muted">
            The built-in tests are original, LSAT-style practice tests written for this project. This app
            doesn't include official LSAC PrepTests, because they're copyrighted, but you can import tests you
            have the right to use (see <a href="#/import">Import</a>).
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
          <h2>In progress</h2>
          <table className="table">
            <tbody>
              {active.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td className="muted">{s.phase === 'br' ? 'Blind review' : `Section ${s.current.section + 1} of ${s.sections.length}`}</td>
                  <td className="muted">{new Date(s.updatedAt).toLocaleString()}</td>
                  <td className="right">
                    <button className="primary small" onClick={() => navigate(`/session/${s.id}`)}>Resume</button>{' '}
                    <button className="small" onClick={() => confirm('Discard this session?') && deleteSession(s.id)}>Discard</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tests.length > 0 && (
        <section className="card">
          <div className="row spread">
            <h2>Library</h2>
            <a className="button" href="#/import">Import more</a>
          </div>
          <table className="table">
            <thead>
              <tr><th>Test</th><th>Sections</th><th>Questions</th><th>Taken</th><th>Last score</th><th /></tr>
            </thead>
            <tbody>
              {tests.map((t) => {
                const taken = done.filter((s) => s.kind === 'pt' && s.testId === t.id);
                return (
                  <tr key={t.id}>
                    <td><a href={`#/test/${encodeURIComponent(t.id)}`}>{t.name}</a></td>
                    <td>{t.sections.map((s) => s.kind).join(' · ')}</td>
                    <td>{t.sections.reduce((n, s) => n + s.questions.length, 0)}</td>
                    <td>{taken.length || '—'}</td>
                    <td>{taken[0] ? scoreText(taken[0], t) : '—'}</td>
                    <td className="right">
                      <button className="primary small" onClick={() => start(t)}>Start full test</button>{' '}
                      <a className="button small" href={`#/test/${encodeURIComponent(t.id)}`}>Sections &amp; tags</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {done.length > 0 && (
        <section className="card">
          <h2>History</h2>
          <table className="table">
            <thead><tr><th>Session</th><th>Type</th><th>Finished</th><th>Score (timed → blind review)</th><th /></tr></thead>
            <tbody>
              {done.slice(0, 30).map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.kind === 'pt' ? 'Test' : 'Drill'}</td>
                  <td className="muted">{new Date(s.finishedAt || s.updatedAt).toLocaleString()}</td>
                  <td>{scoreText(s, testById[s.testId])}</td>
                  <td className="right"><a className="button small" href={`#/session/${s.id}`}>Review</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
