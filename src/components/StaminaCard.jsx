import { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { formatMs } from '../lib/analytics.js';
import { expectedByDifficulty, staminaReport, verdict } from '../lib/stamina.js';

const signed = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n}`);

/** How accuracy and pace held up across a long session (shown on the results page). */
export default function StaminaCard({ session }) {
  const { attempts, index } = useStore();
  const report = useMemo(
    () => staminaReport(session, index, expectedByDifficulty(attempts, index, session.id)),
    [session, index, attempts],
  );
  if (!report) return null;
  return (
    <section className="card">
      <h2>Stamina</h2>
      <p className="card-sub">
        Accuracy is compared with what you usually get at each difficulty, so harder late questions don't count against you.
      </p>
      <div className="stamina-head">
        <div className={`stamina-fade ${!report.counts ? 'neutral' : report.passed ? 'good' : 'bad'}`}>
          <div className="mini-value">{signed(report.fade)} pts</div>
          <div className="mini-label">late fade on answered questions (last 40% vs first 60%)</div>
        </div>
        <p>
          {verdict(report)}
          {session.stamina && report.counts && (report.passed
            ? <> <strong>Level {session.stamina.level} passed.</strong></>
            : <> Repeat level {session.stamina.level} until the fade is under 6 points{report.paced ? '' : ' and no more than 10% is blank'}.</>)}
        </p>
      </div>
      {session.pauses?.length > 0 && (
        <p className="muted">
          ⏸ Paused {session.pauses.length} time{session.pauses.length === 1 ? '' : 's'} for {formatMs(session.pauses.reduce((t, x) => t + (x.ms || 0), 0))} in total.
          The real test has no pause, so the fade may look better than it would on test day.
        </p>
      )}
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Section</th><th>Accuracy</th><th>vs. your usual</th><th>Last third vs. first two thirds</th><th>Pace (sec/question)</th><th>Reading / passage</th><th>Blank</th></tr></thead>
        <tbody>
          {report.sections.map((s, i) => (
            <tr key={i}>
              <td>{i + 1}. {s.title}</td>
              <td>{s.accuracy}%</td>
              <td className={s.vsExpected < -5 ? 'bad-text' : ''}>{signed(s.vsExpected)}</td>
              <td className={s.lateThird < -10 ? 'bad-text' : ''}>{signed(s.lateThird)}</td>
              <td>{s.secPerQuestion}{s.targetSec ? ` / ${s.targetSec}` : ''}</td>
              <td className={s.readSec > s.readTargetSec * 1.15 ? 'bad-text' : ''}>{s.readSec ? `${Math.floor(s.readSec / 60)}:${String(s.readSec % 60).padStart(2, '0')} / 3:30` : ''}</td>
              <td className={s.unanswered ? 'bad-text' : ''}>{s.unanswered || ''}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}
