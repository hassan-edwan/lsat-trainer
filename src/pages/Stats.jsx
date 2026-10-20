import { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { navigate } from '../lib/nav.js';
import { buildDrill, formatMs, weaknessScores } from '../lib/analytics.js';
import { createDrillSession } from '../lib/session.js';
import { SECTION_KINDS, typeLabel } from '../lib/taxonomy.js';

const pct = (x) => `${Math.round(x * 100)}%`;

export default function Stats() {
  const { attempts, sessions, questions, journal, saveSession } = useStore();
  const done = Object.values(sessions).filter((s) => s.phase === 'done').sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));

  const byKind = useMemo(() => ['LR', 'RC'].map((kind) => {
    const rows = weaknessScores(attempts, { kinds: [kind] }).filter((r) => r.n > 0);
    const list = attempts.filter((a) => a.kind === kind);
    const first = list.filter((a) => a.first === a.answer).length;
    const br = list.filter((a) => a.br === a.answer).length;
    return { kind, rows, n: list.length, first, br };
  }), [attempts]);

  const drillType = async (type, kind) => {
    const picked = buildDrill(questions, attempts, journal, { mode: 'types', types: [type], kinds: [kind], count: 10 });
    if (!picked.length) { alert('No questions of this type in your library.'); return; }
    const s = await saveSession(createDrillSession(picked, { title: `Drill: ${typeLabel(type)}` }));
    navigate(`/session/${s.id}`);
  };

  if (!attempts.length) {
    return <section className="card"><h1>Analytics</h1><p className="muted">Finish a test or drill to see your stats by question type.</p></section>;
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>Analytics</h1>
        <div className="stat-row">
          <div className="stat"><div className="stat-label">Questions answered</div><div className="stat-value">{attempts.length}</div></div>
          {byKind.filter((k) => k.n).map((k) => (
            <div className="stat" key={k.kind}>
              <div className="stat-label">{SECTION_KINDS[k.kind]}</div>
              <div className="stat-value">{pct(k.first / k.n)}</div>
              <div className="muted">blind review {pct(k.br / k.n)}</div>
            </div>
          ))}
          <div className="stat"><div className="stat-label">Journal (not mastered)</div><div className="stat-value">{Object.values(journal).filter((e) => e.status !== 'mastered').length}</div></div>
        </div>
      </section>

      {done.length > 1 && (
        <section className="card">
          <h2>Recent sessions</h2>
          <div className="trend">
            {done.slice(-20).map((s) => {
              const f = s.summary.firstCorrect / s.summary.total;
              const b = s.summary.brCorrect / s.summary.total;
              return (
                <a key={s.id} href={`#/session/${s.id}`} className="trend-col" title={`${s.title}: timed ${pct(f)}, blind review ${pct(b)}`}>
                  <div className="trend-bar br" style={{ height: `${b * 100}%` }} />
                  <div className="trend-bar first" style={{ height: `${f * 100}%` }} />
                </a>
              );
            })}
          </div>
          <div className="legend"><span className="key first" /> Timed <span className="key br" /> Blind review</div>
        </section>
      )}

      {byKind.filter((k) => k.rows.length).map((k) => (
        <section className="card" key={k.kind}>
          <h2>{SECTION_KINDS[k.kind]} by question type</h2>
          <p className="muted">Sorted by drill priority: how often you miss the type, weighted toward recent results and by how often it appears on the LSAT.</p>
          <table className="table">
            <thead><tr><th>Type</th><th>Attempts</th><th>Timed</th><th>Blind review</th><th>Wrong twice</th><th>Avg time</th><th /></tr></thead>
            <tbody>
              {k.rows.map((r) => (
                <tr key={r.type}>
                  <td>{r.label}</td>
                  <td>{r.n}</td>
                  <td><div className="acc"><div className="bar"><div style={{ width: pct(r.stats.firstAccuracy) }} /></div>{pct(r.stats.firstAccuracy)}</div></td>
                  <td>{pct(r.stats.brAccuracy)}</td>
                  <td>{r.stats.wrongTwice || ''}</td>
                  <td>{formatMs(r.stats.avgTimeMs)}</td>
                  <td className="right"><button className="small" onClick={() => drillType(r.type, k.kind)}>Drill 10</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
