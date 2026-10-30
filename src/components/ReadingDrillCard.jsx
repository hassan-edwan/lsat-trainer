import { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { formatMs } from '../lib/analytics.js';
import { readingDrillResult } from '../lib/readingDrill.js';
import { startReadingDrill } from '../pages/DrillBuilder.jsx';

/** Results of a reading drill: each passage's reading time against the target, accuracy, and the next target. */
export default function ReadingDrillCard({ session }) {
  const store = useStore();
  const r = useMemo(() => readingDrillResult(session, store.index), [session, store.index]);
  const right = r.passages.reduce((t, p) => t + p.right, 0);
  const n = r.passages.reduce((t, p) => t + p.n, 0);
  const verdict = r.met && r.accurate
    ? `Target met with ${right} of ${n} right. Next drill: ${formatMs(r.nextSec * 1000)}${r.nextSec === r.targetSec ? ', the test pace. Keep it there.' : '.'}`
    : !r.accurate
      ? `${right} of ${n} right is under 75%, so the target holds at ${formatMs(r.targetSec * 1000)}. Read for structure (main point, viewpoints, turns) rather than slowing down overall.`
      : `Not under ${formatMs(r.targetSec * 1000)} yet, so the next drill keeps the same target. Skim examples and lists; slow down only for turns and opinions.`;
  return (
    <section className="card">
      <h2>Reading drill</h2>
      <p className="card-sub">{verdict}</p>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Passage</th><th>Reading</th><th>Right</th><th>Your main point</th></tr></thead>
        <tbody>
          {r.passages.map((p, i) => (
            <tr key={p.key}>
              <td>{p.title || `Passage ${i + 1}`}</td>
              <td className={p.ms != null && p.ms / 1000 > r.targetSec + 5 ? 'time-slow' : ''}>{p.ms != null ? formatMs(p.ms) : '—'} <span className="muted">/ {formatMs(r.targetSec * 1000)}</span></td>
              <td>{p.right}/{p.n}</td>
              <td className="muted">{p.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="muted small-text">Check your main point against the passage's main-point question in the review below.</p>
      <button className="primary" onClick={() => startReadingDrill(store)}>▶ Next reading drill · {formatMs(r.nextSec * 1000)}</button>
    </section>
  );
}
