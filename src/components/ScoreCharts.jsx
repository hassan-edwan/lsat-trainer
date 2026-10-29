import { useEffect, useRef, useState } from 'react';
import { CURVE } from '../lib/mastery.js';

// Charts for the predicted score. Prediction marks use --accent; real results use --viz-actual.
// Every value a chart shows on hover is also printed beside it or in its table view.

/** Width of a container in CSS pixels, kept up to date as it resizes. */
function useWidth(fallback = 600) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const pct = (x) => `${Math.round(x * 100)}%`;
const shortDate = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * The 120–180 scale with your likely range shaded, today's score as a dot, and the
 * no-slips score as a ring, each labeled.
 */
export function ScoreRange({ prediction, potential }) {
  const [ref, w] = useWidth();
  const pad = 14;
  const lo = 120;
  const hi = 180;
  const x = (v) => pad + ((v - lo) / (hi - lo)) * (w - 2 * pad);
  const y = 46;
  const ticks = [120, 130, 140, 150, 160, 170, 180];
  const showPotential = potential && potential.score > prediction.score;
  // Keep the two labels from colliding: the no-slips label sits below the axis.
  return (
    <div ref={ref} className="viz">
      <svg width={w} height={92} role="img" aria-label={`Predicted score ${prediction.score}, likely between ${prediction.low} and ${prediction.high}${showPotential ? `; ${potential.score} with no execution slips` : ''}, on the 120 to 180 scale.`}>
        <line x1={x(lo)} x2={x(hi)} y1={y} y2={y} className="viz-axis" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={y - 4} y2={y + 4} className="viz-axis" />
            <text x={x(t)} y={y + 20} className="viz-tick" textAnchor="middle">{t}</text>
          </g>
        ))}
        <rect x={x(prediction.low)} y={y - 9} width={Math.max(4, x(prediction.high) - x(prediction.low))} height={18} rx={9} className="viz-band" />
        {showPotential && (
          <g>
            <circle cx={x(potential.score)} cy={y} r={6} className="viz-ring" />
            <text x={x(potential.score)} y={y + 40} className="viz-label" textAnchor="middle">no slips {potential.score}</text>
          </g>
        )}
        <circle cx={x(prediction.exact)} cy={y} r={7} className="viz-dot" />
        <text x={x(prediction.exact)} y={y - 18} className="viz-label strong" textAnchor="middle">today {prediction.score}</text>
      </svg>
    </div>
  );
}

/** Where the number comes from: LR and RC expected accuracy, the weighted total, then the scaled score. */
export function ScoreSteps({ prediction }) {
  const { lrPct, rcPct, pct: total, scored, score, low, high } = prediction;
  const Bar = ({ value }) => (
    <div className="viz-meter" aria-hidden="true"><div style={{ width: `${Math.round(value * 100)}%` }} /></div>
  );
  return (
    <ol className="score-steps">
      <li>
        <span className="step-label">Logical Reasoning</span>
        <strong>{pct(lrPct)}</strong>
        <Bar value={lrPct} />
        <span className="muted small-text">expected right of {scored.LR} scored questions</span>
      </li>
      <li>
        <span className="step-label">Reading Comprehension</span>
        <strong>{pct(rcPct)}</strong>
        <Bar value={rcPct} />
        <span className="muted small-text">expected right of {scored.RC} scored questions</span>
      </li>
      <li>
        <span className="step-label">Whole test</span>
        <strong>{pct(total)}</strong>
        <Bar value={total} />
        <span className="muted small-text">about {Math.round(total * (scored.LR + scored.RC))} of {scored.LR + scored.RC} right</span>
      </li>
      <li>
        <span className="step-label">Scaled score</span>
        <strong>{score}</strong>
        <span className="muted small-text">from the score curve; likely {low}–{high}</span>
      </li>
    </ol>
  );
}

/**
 * The percent-correct to scaled-score curve with your spot on it. The whisker is your likely
 * range of accuracy and the score it maps to.
 */
export function ScoreCurve({ prediction }) {
  const [ref, w] = useWidth(320);
  const [hover, setHover] = useState(null);
  const h = 210;
  const m = { l: 36, r: 12, t: 12, b: 30 };
  const x = (p) => m.l + p * (w - m.l - m.r);
  const y = (s) => m.t + (1 - (s - 120) / 60) * (h - m.t - m.b);
  const path = CURVE.map(([p, s], i) => `${i ? 'L' : 'M'}${x(p)},${y(s)}`).join(' ');
  const scoreAt = (p) => {
    for (let i = 1; i < CURVE.length; i++) {
      const [x1, y1] = CURVE[i];
      const [x0, y0] = CURVE[i - 1];
      if (p <= x1) return y0 + ((p - x0) / (x1 - x0 || 1)) * (y1 - y0);
    }
    return 180;
  };
  const px = prediction.pct;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left - m.l) / (w - m.l - m.r)));
    setHover(p);
  };
  return (
    <div ref={ref} className="viz">
      <svg width={w} height={h} role="img" aria-label={`Score curve: ${pct(px)} right maps to about ${prediction.score}.`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[120, 140, 160, 180].map((s) => (
          <g key={s}>
            <line x1={m.l} x2={w - m.r} y1={y(s)} y2={y(s)} className="viz-grid" />
            <text x={m.l - 6} y={y(s) + 4} className="viz-tick" textAnchor="end">{s}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <text key={p} x={x(p)} y={h - 10} className="viz-tick" textAnchor="middle">{pct(p)}</text>
        ))}
        <path d={path} className="viz-curve" />
        <line x1={x(prediction.lowPct)} x2={x(prediction.highPct)} y1={y(prediction.exact)} y2={y(prediction.exact)} className="viz-whisker" />
        <line x1={x(px)} x2={x(px)} y1={y(prediction.low)} y2={y(prediction.high)} className="viz-whisker" />
        <circle cx={x(px)} cy={y(prediction.exact)} r={6} className="viz-dot" />
        <text x={x(px) + (px > 0.7 ? -10 : 10)} y={y(prediction.exact) + (px > 0.7 ? 20 : -10)} className="viz-label strong" textAnchor={px > 0.7 ? 'end' : 'start'}>
          you: {pct(px)} → {prediction.score}
        </text>
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={h - m.b} className="viz-cross" />
            <circle cx={x(hover)} cy={y(scoreAt(hover))} r={4} className="viz-hover-dot" />
            <text x={x(hover) + (hover > 0.6 ? -8 : 8)} y={m.t + 12} className="viz-label" textAnchor={hover > 0.6 ? 'end' : 'start'}>
              {pct(hover)} right → {Math.round(scoreAt(hover))}
            </text>
          </g>
        )}
      </svg>
      <div className="muted small-text viz-caption">Percent right on the whole test (across) and the scaled score it gives (up). Hover the chart to read any point.</div>
    </div>
  );
}

/**
 * The predicted score over time, with its likely range shaded; it should narrow as answers add up.
 * `official` scores you logged from real PrepTests show as separate dots, the check on the prediction.
 */
export function PredictionHistory({ points, official = [] }) {
  const [ref, w] = useWidth();
  const [hi, setHi] = useState(null);
  if (points.length < 2) return null;
  const h = 200;
  const m = { l: 36, r: 46, t: 14, b: 26 };
  const t0 = Math.min(points[0].at, ...official.map((o) => o.at));
  const t1 = Math.max(points[points.length - 1].at, ...official.map((o) => o.at));
  const x = (t) => m.l + ((t - t0) / (t1 - t0 || 1)) * (w - m.l - m.r);
  const minS = Math.max(120, Math.floor((Math.min(...points.map((p) => p.low), ...official.map((o) => o.score)) - 2) / 5) * 5);
  const maxS = Math.min(180, Math.ceil((Math.max(...points.map((p) => p.high), ...official.map((o) => o.score)) + 2) / 5) * 5);
  const y = (s) => m.t + (1 - (s - minS) / (maxS - minS || 1)) * (h - m.t - m.b);
  const step = maxS - minS > 30 ? 10 : 5;
  const ticks = [];
  for (let s = minS; s <= maxS; s += step) ticks.push(s);
  const band = `${points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at)},${y(p.high)}`).join(' ')} ${[...points].reverse().map((p) => `L${x(p.at)},${y(p.low)}`).join(' ')} Z`;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at)},${y(p.exact)}`).join(' ');
  const last = points[points.length - 1];
  const nearest = (clientX, rect) => {
    const px = clientX - rect.left;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(x(p.at) - px) < Math.abs(x(points[best].at) - px)) best = i; });
    return best;
  };
  const cur = hi != null ? points[hi] : null;
  return (
    <div ref={ref} className="viz">
      {official.length > 0 && (
        <div className="viz-legend">
          <span><svg width="18" height="10" aria-hidden="true"><line x1="1" x2="17" y1="5" y2="5" className="viz-line" /></svg> predicted</span>
          <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className="viz-actual" /></svg> official PrepTest</span>
        </div>
      )}
      <svg width={w} height={h} role="img" tabIndex={0}
        aria-label={`Predicted score over time, from ${points[0].score} on ${shortDate(t0)} to ${last.score} on ${shortDate(t1)}. Use the arrow keys to step through days.`}
        onPointerMove={(e) => setHi(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setHi(null)}
        onBlur={() => setHi(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHi((i) => Math.min(points.length - 1, (i ?? -1) + 1));
          if (e.key === 'ArrowLeft') setHi((i) => Math.max(0, (i ?? points.length) - 1));
        }}>
        {ticks.map((s) => (
          <g key={s}>
            <line x1={m.l} x2={w - m.r} y1={y(s)} y2={y(s)} className="viz-grid" />
            <text x={m.l - 6} y={y(s) + 4} className="viz-tick" textAnchor="end">{s}</text>
          </g>
        ))}
        <text x={m.l} y={h - 6} className="viz-tick" textAnchor="start">{shortDate(t0)}</text>
        <text x={w - m.r} y={h - 6} className="viz-tick" textAnchor="end">{shortDate(t1)}</text>
        <path d={band} className="viz-area" />
        <path d={line} className="viz-line" />
        {official.map((o) => (
          <g key={o.id}>
            <title>{`Official ${o.label || 'PrepTest'}: ${o.score} on ${shortDate(o.at)}`}</title>
            <circle cx={x(o.at)} cy={y(o.score)} r={6} className="viz-actual" />
            <text x={x(o.at)} y={y(o.score) - 10} className="viz-label" textAnchor="middle">{o.score}</text>
          </g>
        ))}
        <circle cx={x(last.at)} cy={y(last.exact)} r={5} className="viz-dot" />
        <text x={x(last.at) + 8} y={y(last.exact) + 4} className="viz-label strong">{last.score}</text>
        {cur && (
          <g pointerEvents="none">
            <line x1={x(cur.at)} x2={x(cur.at)} y1={m.t} y2={h - m.b} className="viz-cross" />
            <circle cx={x(cur.at)} cy={y(cur.exact)} r={5} className="viz-dot" />
          </g>
        )}
      </svg>
      {cur && (
        <div className="viz-tip" style={{ left: Math.min(w - 170, Math.max(0, x(cur.at) - 80)) }}>
          <strong>{cur.score}</strong> <span className="muted">likely {cur.low}–{cur.high}</span>
          <div className="muted small-text">{shortDate(cur.at)} · {cur.n} answers</div>
        </div>
      )}
      <details className="viz-table">
        <summary>Show as a table</summary>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Day</th><th>Predicted</th><th>Likely range</th><th>Answers</th></tr></thead>
          <tbody>{[...points].reverse().map((p) => <tr key={p.at}><td>{shortDate(p.at)}</td><td>{p.score}</td><td>{p.low}–{p.high}</td><td>{p.n}</td></tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}

/**
 * Each recent session as a row: the accuracy the model expected on its questions beforehand
 * (ring) and what you got (dot), joined by a line; the gap is how far off it was.
 */
export function TrackRecord({ rows }) {
  const [ref, w] = useWidth();
  if (!rows.length) return null;
  // On narrow screens each session's name sits above its row so the plot can use the full width.
  const stacked = w < 560;
  const labelW = stacked ? w : Math.min(200, Math.round(w * 0.38));
  const numW = 74;
  const plotL = stacked ? 14 : labelW + 10;
  const plotR = w - numW - 8;
  const x = (p) => plotL + p * (plotR - plotL);
  const rowH = stacked ? 46 : 34;
  const dotY = stacked ? 15 : 0;
  const top = 22;
  const h = top + rows.length * rowH + 6;
  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const chars = Math.max(10, Math.floor(labelW / 7));
  return (
    <div ref={ref} className="viz">
      <div className="viz-legend">
        <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className="viz-ring" /></svg> predicted beforehand</span>
        <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className="viz-actual" /></svg> what you got</span>
      </div>
      <svg width={w} height={h} role="img" aria-label="Predicted versus actual accuracy for recent sessions; the table below lists the numbers.">
        {(stacked ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((p) => (
          <g key={p}>
            <line x1={x(p)} x2={x(p)} y1={top - 4} y2={h - 4} className="viz-grid" />
            <text x={x(p)} y={12} className="viz-tick" textAnchor="middle">{pct(p)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const mid = top + i * rowH + rowH / 2;
          const cy = mid + dotY / 2;
          const off = Math.round((r.actual - r.expected) * 100);
          return (
            <g key={r.id}>
              <title>{`${r.title}, ${shortDate(r.at)}: predicted ${pct(r.expected)}, got ${pct(r.actual)} (${r.n} questions)`}</title>
              <rect x={0} y={mid - rowH / 2} width={w} height={rowH} className="viz-hit" />
              {stacked ? (
                <text x={0} y={mid - rowH / 2 + 13} className="viz-label">{clip(r.title, chars)} <tspan className="viz-tick">{shortDate(r.at)} · {r.n} q</tspan></text>
              ) : (
                <>
                  <text x={0} y={cy - 2} className="viz-label">{clip(r.title, chars)}</text>
                  <text x={0} y={cy + 11} className="viz-tick">{shortDate(r.at)} · {r.n} q</text>
                </>
              )}
              <line x1={x(r.expected)} x2={x(r.actual)} y1={cy} y2={cy} className="viz-connector" />
              <circle cx={x(r.expected)} cy={cy} r={6} className="viz-ring" />
              <circle cx={x(r.actual)} cy={cy} r={6} className="viz-actual" />
              <text x={w} y={cy + 4} className="viz-label" textAnchor="end">{pct(r.actual)} <tspan className="viz-tick">{off > 0 ? `+${off}` : off}</tspan></text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/**
 * Reading time for every passage, oldest to newest: a dot per passage, a line for the average of
 * the last four, and the 3:30 test-pace target. Accuracy on each passage is in the tooltip and table.
 */
export function ReadingTrend({ passages, targetSec = 210 }) {
  const [ref, w] = useWidth();
  const [hi, setHi] = useState(null);
  if (passages.length < 2) return null;
  const h = 210;
  const m = { l: 40, r: 64, t: 16, b: 26 };
  const secs = passages.map((p) => p.ms / 1000);
  const maxY = Math.max(targetSec + 60, ...secs) + 15;
  const minY = Math.max(0, Math.min(targetSec - 60, ...secs) - 15);
  const x = (i) => m.l + (passages.length === 1 ? 0 : (i / (passages.length - 1)) * (w - m.l - m.r));
  const y = (v) => m.t + (1 - (v - minY) / (maxY - minY)) * (h - m.t - m.b);
  const avg = secs.map((_, i) => { const win = secs.slice(Math.max(0, i - 3), i + 1); return win.reduce((a, b) => a + b, 0) / win.length; });
  const line = avg.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const ticks = [];
  for (let v = Math.ceil(minY / 60) * 60; v <= maxY; v += 60) ticks.push(v);
  const cur = hi != null ? passages[hi] : null;
  const nearest = (clientX, rect) => {
    const px = clientX - rect.left;
    let best = 0;
    passages.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    return best;
  };
  const last = avg[avg.length - 1];
  return (
    <div ref={ref} className="viz">
      <div className="viz-legend">
        <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4" className="viz-dot faint" /></svg> one passage</span>
        <span><svg width="18" height="10" aria-hidden="true"><line x1="1" x2="17" y1="5" y2="5" className="viz-line" /></svg> average of the last 4</span>
        <span><svg width="18" height="10" aria-hidden="true"><line x1="1" x2="17" y1="5" y2="5" className="viz-target" /></svg> {mmss(targetSec)} target</span>
      </div>
      <svg width={w} height={h} role="img" tabIndex={0}
        aria-label={`Reading time per passage for ${passages.length} passages, latest average ${mmss(last)} against a ${mmss(targetSec)} target. Use the arrow keys to step through passages.`}
        onPointerMove={(e) => setHi(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setHi(null)}
        onBlur={() => setHi(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHi((i) => Math.min(passages.length - 1, (i ?? -1) + 1));
          if (e.key === 'ArrowLeft') setHi((i) => Math.max(0, (i ?? passages.length) - 1));
        }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className="viz-grid" />
            <text x={m.l - 6} y={y(v) + 4} className="viz-tick" textAnchor="end">{mmss(v)}</text>
          </g>
        ))}
        <line x1={m.l} x2={w - m.r} y1={y(targetSec)} y2={y(targetSec)} className="viz-target" />
        <text x={w - m.r + 6} y={y(targetSec) + 4} className="viz-label">target</text>
        <text x={m.l} y={h - 6} className="viz-tick">{shortDate(passages[0].at)}</text>
        <text x={w - m.r} y={h - 6} className="viz-tick" textAnchor="end">{shortDate(passages[passages.length - 1].at)}</text>
        {secs.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={4} className="viz-dot faint" />)}
        <path d={line} className="viz-line" />
        <circle cx={x(avg.length - 1)} cy={y(last)} r={5} className="viz-dot" />
        <text x={x(avg.length - 1) + 8} y={y(last) + 4} className="viz-label strong">{mmss(last)}</text>
        {cur && (
          <g pointerEvents="none">
            <line x1={x(hi)} x2={x(hi)} y1={m.t} y2={h - m.b} className="viz-cross" />
            <circle cx={x(hi)} cy={y(secs[hi])} r={6} className="viz-dot" />
          </g>
        )}
      </svg>
      {cur && (
        <div className="viz-tip" style={{ left: Math.min(w - 170, Math.max(0, x(hi) - 80)) }}>
          <strong>{mmss(cur.ms / 1000)}</strong> <span className="muted">reading · {cur.right}/{cur.n} right</span>
          <div className="muted small-text">{shortDate(cur.at)} · {cur.title}</div>
        </div>
      )}
      <details className="viz-table">
        <summary>Show as a table</summary>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Date</th><th>Session</th><th>Reading</th><th>Target</th><th>Right</th></tr></thead>
          <tbody>{[...passages].reverse().map((p, i) => (
            <tr key={i}><td>{shortDate(p.at)}</td><td>{p.title}</td><td>{mmss(p.ms / 1000)}</td><td>{mmss(p.targetSec)}</td><td>{p.right}/{p.n}</td></tr>
          ))}</tbody>
        </table></div>
      </details>
    </div>
  );
}
