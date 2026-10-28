import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { navigate } from '../lib/nav.js';
import { LADDERS, LEVELS, diagnosticOrder, ladderQuestions, ladderResults } from '../lib/diagnostic.js';
import {
  DIAGNOSIS, freshHardCount, predictionHistory, trackRecord, masteryTrack, mixedSet, predictScore, priorities, seenIds, shownEntries, skillProfile, trainingPool, trainingSet,
} from '../lib/mastery.js';
import { createDrillSession } from '../lib/session.js';
import { PredictionHistory, ScoreCurve, ScoreRange, ScoreSteps, TrackRecord } from '../components/ScoreCharts.jsx';
import { loadBundledTests } from '../lib/bundle.js';

const CELL = {
  correct: { label: '✓', title: 'Correct on the timed pass' },
  'br-fixed': { label: '½', title: 'Missed under time, fixed in blind review: a slip, not a skill gap' },
  wrong: { label: '✗', title: 'Still wrong after blind review: a genuine gap' },
  untried: { label: '·', title: 'Not attempted yet' },
  none: { label: '', title: 'No question at this level' },
};

const MASTERY_CELL = {
  mastered: { label: '★', title: 'Mastered: 3 of your last 4 right under time, none still wrong after blind review' },
  placed: { label: '✓', title: 'Placed out: your results say you get these right' },
  working: { label: '…', title: 'In progress' },
  new: { label: '·', title: 'Not started' },
  none: { label: '', title: 'No training questions at this level yet' },
};

const PACES = [['90', '1:30 per question'], ['80', 'Test pace (1:20)'], ['0', 'Untimed']];
const MIN_FOR_SCORE = 15;

export function useSkillProfile() {
  const { attempts, index, sessions, journal } = useStore();
  return useMemo(() => skillProfile({ attempts, index, sessions, journal }), [attempts, index, sessions, journal]);
}

/** Questions sitting in unfinished sessions, so a new set doesn't repeat them. */
export const pendingQids = (sessions) => Object.values(sessions)
  .filter((s) => s.phase !== 'done').flatMap((s) => s.sections.flatMap((sec) => sec.qids));

/** Unfinished training sets for a skill. */
export const openTraining = (sessions, skillId) => Object.values(sessions)
  .filter((s) => s.phase !== 'done' && s.training?.skill === skillId)
  .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

/** Reopen the most recent unfinished set for a skill. */
export function resumeTraining(skill, { sessions }) {
  const open = openTraining(sessions, skill.id)[0];
  if (open) navigate(`/session/${open.id}`);
}

/**
 * Start a new training set of questions you haven't seen. Unfinished sets for
 * the skill are closed first: the questions you answered are scored (without
 * blind review if you never reached it), and none of their questions, answered
 * or not, go into the new set.
 */
export async function startTraining(skill, level, { questions, attempts, sessions, saveSession, finishSession }, extra = {}, count = 8) {
  const seenInOpen = [];
  for (const old of openTraining(sessions, skill.id)) {
    old.sections.forEach((sec) => seenInOpen.push(...sec.qids));
    const answered = (id) => old.responses[id]?.first;
    const shownQids = old.sections.flatMap((sec) => sec.qids);
    const kept = old.sections.map((sec) => ({ ...sec, qids: sec.qids.filter(answered) })).filter((sec) => sec.qids.length);
    if (!kept.length) {
      // Nothing answered: keep a record of what it showed you, hidden from history.
      await saveSession({ ...old, phase: 'done', abandoned: true, finishedAt: new Date().toISOString(), shownQids,
        summary: { total: 0, firstCorrect: 0, brCorrect: 0, outcomes: {}, bySection: [] } });
      continue;
    }
    const reviewed = old.phase === 'br' && old.settings.blindReview;
    await finishSession({ ...old, sections: kept, shownQids, settings: { ...old.settings, blindReview: reviewed } });
  }
  const closed = new Set(openTraining(sessions, skill.id).map((x) => x.id));
  const pending = [...pendingQids(Object.fromEntries(Object.entries(sessions).filter(([id]) => !closed.has(id)))), ...seenInOpen];
  const picked = trainingSet(skill.id, level, { questions, attempts: [...attempts, ...shownEntries(sessions)], pending, count });
  if (!picked.length) {
    alert(`You've answered every ${skill.title} question near level ${level}. Questions you answered at least two weeks ago come back after that; until then, train another skill.`);
    return;
  }
  const s = await saveSession({
    ...createDrillSession(picked, { title: `Train ${skill.title}: level ${level}`, secondsPerQuestion: 80, training: { skill: skill.id, level } }),
    ...extra,
  });
  navigate(`/session/${s.id}`);
}

/**
 * Start a mixed set: about 60% from your weak spots and 40% variety (skills you
 * haven't practiced in a while first), all questions you've never seen, mostly level 3+.
 */
export async function startMixed({ questions, attempts, index, sessions, journal, saveSession }, extra = {}) {
  const profile = skillProfile({ attempts, index, sessions, journal });
  const tracks = Object.fromEntries(profile.skills.map((x) => [x.id, masteryTrack(x, profile.rows, trainingPool(x.id, questions))]));
  const mix = mixedSet({ profile, tracks, questions, seen: seenIds({ attempts, sessions }) });
  if (!mix.questions.length) { alert('There are no questions left that you haven\'t seen.'); return; }
  const title = (id) => LADDERS.find((l) => l.id === id)?.title;
  const s = await saveSession({
    ...createDrillSession(mix.questions, { title: mix.weak.length ? `Mixed set: ${mix.weak.map(title).join(', ')} + variety` : 'Mixed set', secondsPerQuestion: 80 }),
    mix: { weak: mix.weak, variety: mix.variety },
    ...extra,
  });
  navigate(`/session/${s.id}`);
}

const ago = (s) => (s.daysSince == null ? 'never practiced'
  : `last practiced ${s.daysSince < 1 ? 'today' : `${Math.floor(s.daysSince)} day${Math.floor(s.daysSince) === 1 ? '' : 's'} ago`}, ${s.answersSince} answer${s.answersSince === 1 ? '' : 's'} ago`);

function evidenceLine(s) {
  const parts = [`${s.counts.correct + s.counts['br-broke']} right`];
  if (s.counts.execution) parts.push(`${s.counts.execution} fixed in blind review`);
  if (s.counts.genuine) parts.push(`${s.counts.genuine} still wrong after blind review`);
  if (s.counts.unreviewed) parts.push(`${s.counts.unreviewed} missed without blind review`);
  const traps = Object.entries(s.traps).map(([t, n]) => `${n} tagged “${t.toLowerCase()}”`);
  return `${s.n} answer${s.n === 1 ? '' : 's'}: ${parts.join(' · ')}${traps.length ? ` (${traps.join(', ')})` : ''}`;
}

/** One line on how close past predictions came: the typical gap and how many landed within 10 points. */
function TrackSummary({ rows }) {
  const gaps = rows.map((r) => Math.abs(r.actual - r.expected) * 100);
  const avg = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  const within = gaps.filter((g) => g <= 10).length;
  const bias = Math.round(rows.reduce((t, r) => t + (r.actual - r.expected), 0) / rows.length * 100);
  return (
    <strong>
      Off by {avg} point{avg === 1 ? '' : 's'} of accuracy on average; within 10 points in {within} of {rows.length} sessions
      {Math.abs(bias) >= 5 ? (bias > 0 ? ', and you tend to beat it.' : ', and it tends to run high, so read it as a ceiling.') : '.'}
    </strong>
  );
}

export default function Diagnostic() {
  const store = useStore();
  const { diagnosticQuestions, questions, attempts, journal, installBundle, saveSession } = store;
  const available = useMemo(() => ladderQuestions(diagnosticQuestions), [diagnosticQuestions]);
  const ladders = LADDERS.filter((l) => available[l.id]);
  const [selected, setSelected] = useState(() => new Set(LADDERS.map((l) => l.id)));
  const [pace, setPace] = useState('90');
  const results = useMemo(() => ladderResults(diagnosticQuestions, attempts), [diagnosticQuestions, attempts]);
  const profile = useSkillProfile();
  const ranked = useMemo(() => priorities(profile), [profile]);
  const prediction = useMemo(() => predictScore(profile), [profile]);
  const potential = useMemo(() => predictScore(profile, { field: 'understanding' }), [profile]);
  const history = useMemo(() => predictionHistory({ attempts, index: store.index, sessions: store.sessions, minAnswers: MIN_FOR_SCORE }), [attempts, store.index, store.sessions]);
  const record = useMemo(() => trackRecord({ attempts, index: store.index, sessions: store.sessions }), [attempts, store.index, store.sessions]);
  const tracks = useMemo(() => Object.fromEntries(profile.skills.map((s) => [s.id, masteryTrack(s, profile.rows, trainingPool(s.id, questions))])), [profile, questions]);

  const start = async (ids) => {
    const picked = diagnosticOrder(diagnosticQuestions, ids);
    if (!picked.length) return;
    const title = ids.length === 1 ? `Diagnostic: ${LADDERS.find((l) => l.id === ids[0]).title}` : 'Skill diagnostic';
    const s = await saveSession(createDrillSession(picked, { title, secondsPerQuestion: Number(pace), kind: 'diagnostic' }));
    navigate(`/session/${s.id}`);
  };
  const train = (skill) => {
    const t = tracks[skill.id];
    return startTraining(skill, t.next ?? 5, store);
  };
  const openSet = (skill) => openTraining(store.sessions, skill.id).length > 0;
  const seen = useMemo(() => seenIds({ attempts, sessions: store.sessions }), [attempts, store.sessions]);
  const freshHard = (skill) => freshHardCount(skill.id, questions, seen);
  const unseenAt = (skill) => tracks[skill.id].levels[(tracks[skill.id].next ?? 5) - 1].unseen;

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
  const enough = prediction.n >= MIN_FOR_SCORE;
  // LR and RC are ranked separately, so a section never crowds the other out of the list.
  const sections = ['LR', 'RC'].map((kind) => {
    const focus = ranked.filter((s) => s.kind === kind && s.diagnosis !== 'strong' && s.diagnosis !== 'solid').slice(0, 4);
    const focusIds = new Set(focus.map((s) => s.id));
    const stale = profile.skills.filter((s) => s.kind === kind && s.stale && !focusIds.has(s.id))
      .sort((a, b) => (b.answersSince ?? 0) - (a.answersSince ?? 0)).slice(0, 3);
    return { kind, title: kind === 'LR' ? 'Logical Reasoning' : 'Reading Comprehension', focus, stale };
  });

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Practice"
        title="Skills"
        subtitle="Find where each skill breaks, see what it means for your score, and train each skill level by level until it's mastered."
      />

      <section className="card">
        <h2>Predicted score</h2>
        {enough ? (
          <>
            <div className="score-hero">
              <span className="hero-value">{prediction.score}</span>
              <span className="muted">likely {prediction.low}–{prediction.high} if you sat a test today</span>
            </div>
            <ScoreRange prediction={prediction} potential={potential} />
            <div className="stat-row">
              <div className="stat"><div className="stat-label">With no execution slips</div><div className="stat-value">{potential.score}</div><div className="muted">if every miss you fix in blind review were right</div></div>
              <div className="stat"><div className="stat-label">Points lost to slips</div><div className="stat-value">{Math.max(0, potential.score - prediction.score)}</div><div className="muted">misreads and rushing</div></div>
              <div className="stat"><div className="stat-label">Based on</div><div className="stat-value">{prediction.n}</div><div className="muted">answers ({profile.global.LR.n} LR, {profile.global.RC.n} RC)</div></div>
            </div>

            <div className="score-block">
              <h3>How it's worked out</h3>
              <p className="card-sub">
                Each skill gets an ability estimate from how hard the questions you got right and wrong were, with recent answers counting
                more. Those give the share you'd get right on a test-day mix of questions in each section, two scored LR sections and one RC.
                The total goes through the score curve below.
              </p>
              <div className="score-explain">
                <ScoreSteps prediction={prediction} />
                <ScoreCurve prediction={prediction} />
              </div>
            </div>

            {history.length >= 2 && (
              <div className="score-block">
                <h3>How it has moved</h3>
                <p className="card-sub">
                  The prediction at the end of each day you practiced, using only the answers you had by then. The shaded band is the likely
                  range; it narrows as answers add up, so a narrow band means a steadier estimate.
                </p>
                <PredictionHistory points={history} />
              </div>
            )}

            <div className="score-block">
              <h3>Has it been right?</h3>
              {record.length ? (
                <>
                  <p className="card-sub">
                    Before each recent session, the model used only your earlier answers to predict how many of that session's exact
                    questions you'd get right under time, harder questions included. Here's that prediction next to what you got.
                    {' '}<TrackSummary rows={record} />
                  </p>
                  <TrackRecord rows={record} />
                </>
              ) : (
                <p className="muted">Once you finish a few more sessions, this shows how the prediction made before each one compared with your result.</p>
              )}
            </div>
            <p className="muted small-text">It's an estimate from your practice, not an official score, and it assumes test-day conditions like your timed practice.</p>
          </>
        ) : (
          <p className="muted">Answer at least {MIN_FOR_SCORE} questions (the full diagnostic is {count}) to see a prediction. {prediction.n ? `${prediction.n} so far.` : ''}</p>
        )}
      </section>

      {enough && (
        <section className="card">
          <h2>What to work on</h2>
          <p className="card-sub">
            Ranked by how many points one level of improvement is worth, with genuine gaps (still wrong after blind review) ahead of
            execution slips (fixed in blind review). Misses you fix in blind review count as slips, not as a weak skill.
          </p>
          <div className="mix-box">
            <div>
              <strong>Mixed set</strong>
              <div className="small-text">10 questions you've never seen, mostly level 3–5: about 6 from your weak spots below and 4 for variety, led by skills you haven't practiced in a while.</div>
            </div>
            <button className="primary" onClick={() => startMixed(store)}>▶ Start mixed set</button>
          </div>
          {sections.map(({ kind, title, focus, stale }) => (
            <div key={kind} className="work-section">
              <h3>{title}</h3>
              {focus.length === 0 ? <p className="muted">Every {title} skill with data is solid or strong. Keep training at higher levels below.</p> : (
                <div className="focus-list">
                  {focus.map((s) => (
                    <div key={s.id} className="focus-item">
                      <div className="focus-main">
                        <div className="row">
                          <strong>{s.title}</strong>
                          <span className={`chip dx-${s.diagnosis}`}>{DIAGNOSIS[s.diagnosis].label}</span>
                          {s.gain != null && s.diagnosis !== 'no-data' && <span className="muted small-text">+{s.gain.toFixed(1)} pts per level</span>}
                        </div>
                        <div className="small-text">
                          {s.diagnosis !== 'no-data' && <>Skill level {s.level.toFixed(1)} after blind review · {s.timedLevel.toFixed(1)} under time. </>}
                          {DIAGNOSIS[s.diagnosis].tip}
                        </div>
                        {s.n > 0 && <div className="muted small-text">{evidenceLine(s)} · {ago(s)}</div>}
                      </div>
                      <div className="focus-action">
                        <div className="row">
                          {openSet(s) && <button className="small" onClick={() => resumeTraining(s, store)} title="Go back to the set you didn't finish">Resume</button>}
                          <button className="primary small" onClick={() => (s.diagnosis === 'no-data' ? start([s.id]) : train(s))}
                            title={openSet(s) ? 'Scores what you answered in your unfinished set and starts new questions' : undefined}>
                            {s.diagnosis === 'no-data' ? 'Take ladder' : `${openSet(s) ? 'New set' : 'Train'} · level ${tracks[s.id].next ?? 5}`}
                          </button>
                        </div>
                        {s.diagnosis !== 'no-data' && <span className="muted small-text">{unseenAt(s)} new at this level · {freshHard(s)} new at level 3+</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {stale.length > 0 && (
                <>
                  <h4>Keep fresh</h4>
                  <p className="card-sub">Skills you haven't practiced in a while. A quick 4-question check-in keeps them sharp, or shows they've slipped.</p>
                  <div className="focus-list">
                    {stale.map((s) => (
                      <div key={s.id} className="focus-item">
                        <div className="focus-main">
                          <div className="row"><strong>{s.title}</strong><span className={`chip dx-${s.diagnosis}`}>{DIAGNOSIS[s.diagnosis].label}</span></div>
                          <div className="muted small-text">Skill level {s.level.toFixed(1)} · {ago(s)} · {freshHard(s)} new at level 3+</div>
                        </div>
                        <div className="focus-action">
                          <button className="small" onClick={() => startTraining(s, Math.max(3, tracks[s.id].next ?? 5), store, {}, 4)}>Check in</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Mastery path</h2>
        <p className="card-sub">
          Train one level at a time. A level is mastered when 3 of your last 4 answers there are right under time and none is still wrong
          after blind review. Every set is new questions you haven't answered. Repeats come back only once a skill's nearby questions are all
          used, and never within two weeks. A repeat within two weeks also doesn't count toward mastery. Each set has 8 questions: mostly at
          your level, one below to keep it solid, and two above as a stretch. Diagnostic ladder questions are kept out so retests stay fresh, and journal misses come back in the daily mistake review.
        </p>
        <div className="table-wrap"><table className="table ladder-grid">
          <thead><tr><th>Skill</th>{LEVELS.map((l) => <th key={l} className="center">L{l}</th>)}<th>Level</th><th /></tr></thead>
          <tbody>
            {profile.skills.map((s) => {
              const t = tracks[s.id];
              return (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  {t.levels.map((x) => (
                    <td key={x.level} className="center">
                      <span className={`ladder-cell mc-${x.status}`} title={`${MASTERY_CELL[x.status].title}${x.recent ? ` · ${x.right} of last ${x.recent} right` : ''}${x.available ? ` · ${x.unseen} of ${x.available} questions not answered in the last two weeks` : ''}`}>
                        {x.status === 'working' ? `${x.right}/${x.recent}` : MASTERY_CELL[x.status].label}
                      </span>
                    </td>
                  ))}
                  <td>{s.n >= 3 ? s.level.toFixed(1) : <span className="muted">—</span>}</td>
                  <td className="right">
                    {t.complete
                      ? <span className="oc-correct">Mastered</span>
                      : (
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          {openSet(s) && <button className="small" onClick={() => resumeTraining(s, store)}>Resume</button>}
                          <button className="small" onClick={() => train(s)} title={`${t.levels[t.next - 1].unseen} new questions at level ${t.next}`}>{openSet(s) ? 'New' : 'Train'} L{t.next}</button>
                        </span>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <p className="muted small-text">★ mastered · ✓ placed out · 2/3 right of your recent answers at that level · · not started. Skill level is where you'd get about half right after blind review (1–5).</p>
      </section>

      <section className="card">
        <h2>Take the diagnostic</h2>
        <p className="card-sub">
          Each skill has a ladder of five questions from level 1 (a typical early-section question) to level 5 (the hardest on recent tests).
          Levels run in order: every level 1 first, then level 2, and so on. Every miss goes to your <a href="#/journal">mistake journal</a>.
          Tag misreads there (“Misread the stem”) so they show up as slips.
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
        <h2>Diagnostic ladders</h2>
        <p className="card-sub">Your most recent ladder result at each level. A skill breaks at the first level you still miss after blind review. A miss you fix in blind review (½) is a slip.</p>
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
                    : r.complete && r.levels.some((x) => x.attempts) ? <span className="oc-correct">Cleared{r.slipsAt ? ' (with a slip)' : ''}</span>
                      : r.slipsAt ? <span className="muted">Slip at L{r.slipsAt}</span>
                        : <span className="muted">—</span>}
                </td>
                <td className="right"><button className="small" onClick={() => start([r.id])}>{r.levels.some((x) => x.attempts) ? 'Retake' : 'Take'} ladder</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="muted small-text">✓ correct · ½ missed under time, fixed in blind review · ✗ still wrong after blind review · · not tried yet. Retaking reuses the same five questions, so it's most useful after a few weeks of training.</p>
      </section>
    </div>
  );
}
