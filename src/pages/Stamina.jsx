import { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { navigate } from '../lib/nav.js';
import { PageHeader } from '../components/Layout.jsx';
import { STAMINA_LEVELS, createStaminaSession, ladderStatus, staminaHistory, staminaSupply, unfinishedStamina } from '../lib/stamina.js';

const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

const TIPS = [
  ['Check in at fixed points', 'At question 13 of LR and before passage 3 of RC, take one slow breath and reread the next stem twice. Fades start with skimming stems.'],
  ['Don\'t carry a question forward', 'If one item rattles you, flag it, guess, and move on. Late misses often come from the question before them.'],
  ['Use the break on test day', 'Stand up, drink water, eat something small, and don\'t replay section 2. Practice the same routine at level 4.'],
  ['Train tired reading', 'Levels 3–5 put reading late on purpose. If your RC drops when it comes last, that is the skill to build, not more LR.'],
  ['Same time of day', 'Do long sessions at the time of day you will test, at least once a week.'],
];

export default function Stamina() {
  const { tests, sessions, attempts, index, saveSession, finishSession } = useStore();
  const history = useMemo(() => staminaHistory(sessions, attempts, index), [sessions, attempts, index]);
  const ladder = useMemo(() => ladderStatus(history), [history]);
  const supply = useMemo(() => staminaSupply(tests, attempts, sessions), [tests, attempts, sessions]);
  const level = ladder.next;
  const repeatAdvice = ladder.levels[level - 1].completed && !ladder.levels[level - 1].passed && ladder.unlocked > level;

  const start = async (lvl) => {
    const s = createStaminaSession(lvl, tests, attempts, sessions);
    if (!s) return;
    if (s.stamina.repeats && !confirm(`You've used up the fresh questions for this level: ${s.stamina.repeats} of these questions are ones you answered at least two weeks ago. Start anyway?`)) return;
    const saved = await saveSession(s);
    navigate(`/session/${saved.id}`);
  };

  const unfinished = unfinishedStamina(sessions);
  // Score a session that was left unfinished. If blind review was never reached, it's scored on the timed answers.
  const scoreNow = (s) => finishSession({ ...s, settings: { ...s.settings, blindReview: s.phase === 'br' && s.settings.blindReview } });
  const answered = (s) => s.sections.flatMap((x) => x.qids).filter((id) => s.responses[id]?.first).length;
  const total = (s) => s.sections.reduce((t, x) => t + x.qids.length, 0);

  const recent = history.slice(0, 8);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Practice"
        title="Stamina"
        subtitle="Test day is four 35-minute sections and a 10-minute break. Build up to it one level at a time, and watch how much your accuracy fades late in a long sitting."
      />

      {unfinished.length > 0 && (
        <section className="card">
          <h2>Unfinished stamina sessions</h2>
          <p className="card-sub">
            A session counts once it's scored, after blind review and Finish and score. These were left before that, so they
            aren't in your history yet. Resume to finish, or score one now as it stands.
          </p>
          <div className="focus-list">
            {unfinished.map((u) => (
              <div key={u.id} className="focus-item">
                <div className="focus-main">
                  <strong>{u.title}</strong>
                  <div className="muted small-text">
                    {u.phase === 'br' ? 'In blind review' : `Section ${u.current.section + 1} of ${u.sections.length}`} · {answered(u)} of {total(u)} answered · started {new Date(u.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="row">
                  <button className="small" onClick={() => navigate(`/session/${u.id}`)}>Resume</button>
                  <button className="small primary" onClick={() => scoreNow(u)} title={u.phase === 'br' ? 'Score with your blind-review answers so far' : 'Score on your timed answers; unanswered questions count as misses'}>Score now</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>{repeatAdvice ? 'Suggested: repeat' : 'Next:'} level {level}, {STAMINA_LEVELS[level - 1].title}</h2>
        {repeatAdvice ? (
          <p className="card-sub">
            You finished this level, but your late accuracy faded {Math.abs(ladder.levels[level - 1].last.fade)} points (passing is under 6). Repeating it
            builds the habit before going longer. Level {ladder.unlocked} is unlocked if you'd rather move on.
          </p>
        ) : (
          <p className="card-sub">{STAMINA_LEVELS[level - 1].detail} Finishing a level unlocks the next. You pass it when your late accuracy drops by less than 6 points after adjusting for difficulty.</p>
        )}
        <div className="row">
          <button className="primary big" onClick={() => start(level)} disabled={!tests.length}>▶ {repeatAdvice ? 'Repeat' : 'Start'} level {level}</button>
          {repeatAdvice && <button className="big" onClick={() => start(ladder.unlocked)} disabled={!tests.length}>Go on to level {ladder.unlocked}</button>}
        </div>
        {!tests.length && <p className="muted">Load the practice tests first.</p>}
        {tests.length > 0 && (
          <p className="muted small-text">
            Every stamina session uses questions you've never seen, including ones you saw in a session you discarded.
            Fresh questions left: about {supply.LR} LR section{supply.LR === 1 ? '' : 's'} and {supply.RC} RC section{supply.RC === 1 ? '' : 's'} of four unread passages.
            {(supply.LR < 2 || supply.RC < 1) && ' The bank is running low. Once it runs out, sessions reuse questions you answered at least two weeks ago and tell you before starting.'}
          </p>
        )}
      </section>

      <section className="card">
        <h2>The ladder</h2>
        <div className="stamina-ladder">
          {STAMINA_LEVELS.map((l) => {
            const st = ladder.levels[l.level - 1];
            const locked = l.level > ladder.unlocked;
            const status = st.passed ? 'Passed: held steady'
              : st.completed ? `Done, faded ${Math.abs(st.last.fade)} pts: repeat to pass`
                : st.attempts ? 'Tried, but didn\'t count (rushed or mostly blank)' : null;
            return (
              <div key={l.level} className={`stamina-step ${st.passed ? 'passed' : st.completed ? 'done' : ''} ${l.level === level ? 'current' : ''}`}>
                <div className="step-num">{st.passed ? '✓' : st.completed ? '↻' : l.level}</div>
                <div className="step-body">
                  <strong>{l.title}</strong>
                  <span className="muted">{l.detail}</span>
                  {status && <span className="small-text">{status}{st.attempts > 1 ? ` · ${st.attempts} attempts` : ''}</span>}
                </div>
                <button className={l.level === level ? 'primary small' : 'small'} onClick={() => start(l.level)} disabled={!tests.length || locked}>
                  {locked ? 'Locked' : st.attempts ? 'Repeat' : 'Start'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Your fade over time</h2>
        <p className="card-sub">Late fade = (late accuracy − your usual at that difficulty) minus (early accuracy − your usual). Full practice tests and any long timed drill (two timed sections or 45+ minutes) show their fade here; only stamina sessions and full tests move you up the ladder.</p>
        {recent.length === 0 ? (
          <p className="muted">No long sessions yet. Start level {level} or take a full practice test.</p>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Session</th><th>Finished</th><th>Sections</th><th>Late fade</th><th>Result</th></tr></thead>
            <tbody>
              {recent.map(({ session, report }) => (
                <tr key={session.id}>
                  <td><a href={`#/session/${session.id}`}>{session.title}</a></td>
                  <td className="muted">{new Date(session.finishedAt).toLocaleDateString()}</td>
                  <td>{session.sections.length}</td>
                  <td className={report.passed || !report.counts ? '' : 'bad-text'}>{signed(report.fade)} pts</td>
                  <td>{!report.counts ? 'Didn\'t count' : report.passed ? 'Held steady' : 'Faded'}{session.kind !== 'stamina' && session.kind !== 'pt' ? <span className="muted small-text"> · drill</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="card">
        <h2>How to build stamina</h2>
        <ul className="tips">
          {TIPS.map(([t, d]) => <li key={t}><strong>{t}.</strong> {d}</li>)}
        </ul>
      </section>
    </div>
  );
}
