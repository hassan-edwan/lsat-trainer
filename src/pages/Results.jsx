import { Fragment, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { navigate } from '../lib/nav.js';
import { OUTCOMES, buildDrill, categoryStats, formatMs, outcome, scaledScore, typeStats } from '../lib/analytics.js';
import { makeEntry } from '../lib/journal.js';
import { CATEGORY_GROUPS, categoryLabel, typeLabel } from '../lib/taxonomy.js';
import { createDrillSession } from '../lib/session.js';
import QuestionReview from '../components/QuestionReview.jsx';
import { GoalRing, LevelBar } from '../components/ProgressWidgets.jsx';
import { attemptXp } from '../lib/progress.js';
import { dailyPlan } from '../lib/plan.js';
import { startTask } from './Today.jsx';
import StaminaCard from '../components/StaminaCard.jsx';

export default function Results({ session }) {
  const { index, attempts, journal, questions, saveJournalEntry, saveSession } = useStore();
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('all');
  const test = session.testId ? index[session.sections[0]?.qids[0]]?.test : null;
  const s = session.summary;

  const rows = useMemo(() => session.sections.flatMap((sec, si) => sec.qids.map((qid, qi) => {
    const entry = index[qid];
    const r = session.responses[qid];
    const br = session.settings.blindReview ? r.br ?? r.first : r.first;
    return { qid, si, qi, sec, entry, r, br, oc: entry ? outcome(r.first, br, entry.question.answer) : null };
  })), [session, index]);

  const sessionAttempts = attempts.filter((a) => a.sessionId === session.id);
  const byType = Object.values(typeStats(sessionAttempts)).sort((a, b) => a.firstAccuracy - b.firstAccuracy);
  // Families are already summarized by the type table, so list the other groups.
  const byCategory = Object.values(categoryStats(sessionAttempts))
    .filter((c) => !c.type.startsWith('family:'))
    .sort((a, b) => a.firstAccuracy - b.firstAccuracy || b.n - a.n);
  const shown = rows.filter((row) => filter === 'all' || row.oc === filter || (filter === 'missed' && row.oc !== 'correct'));

  const scaled = scaledScore(test, s.firstCorrect);
  const scaledBR = scaledScore(test, s.brCorrect);

  const drillMisses = async () => {
    const types = [...new Set(rows.filter((x) => x.oc && x.oc !== 'correct').flatMap((x) => x.entry.question.types))];
    const kinds = [...new Set(rows.map((x) => x.sec.kind).filter((k) => k !== 'MIXED'))];
    const picked = buildDrill(questions.filter((q) => !session.responses[q.id]), attempts, journal, { mode: 'types', types, kinds, count: 10 });
    if (!picked.length) { alert('No unseen questions of these types in your library yet.'); return; }
    const d = await saveSession(createDrillSession(picked, { title: `Drill: ${types.map(typeLabel).slice(0, 3).join(', ')}` }));
    navigate(`/session/${d.id}`);
  };

  return (
    <div className="stack">
      <PageHeader
        eyebrow={`${session.kind === 'pt' ? 'Practice test' : session.kind === 'stamina' ? 'Stamina' : session.kind === 'diagnostic' ? 'Diagnostic' : 'Drill'} results · ${new Date(session.finishedAt || session.updatedAt).toLocaleDateString()}`}
        title={session.title}
      />
      <Celebration session={session} sessionAttempts={sessionAttempts} />
      <section className="card">
        <h2>Score</h2>
        <div className="stat-row">
          <div className="stat"><div className="stat-label">{session.settings.blindReview ? 'Timed' : 'Score'}</div><div className="stat-value">{scaled ?? `${s.firstCorrect}/${s.total}`}</div>{scaled && <div className="muted">{s.firstCorrect}/{s.total}</div>}</div>
          {session.settings.blindReview && (
            <div className="stat"><div className="stat-label">Blind review</div><div className="stat-value">{scaledBR ?? `${s.brCorrect}/${s.total}`}</div>{scaledBR && <div className="muted">{s.brCorrect}/{s.total}</div>}</div>
          )}
          {Object.entries(OUTCOMES).filter(([k]) => session.settings.blindReview || k === 'correct' || k === 'wrong-twice').map(([k, o]) => (
            <button key={k} className={`stat clickable oc-${k} ${filter === k ? 'on' : ''}`} onClick={() => setFilter(filter === k ? 'all' : k)}>
              <div className="stat-label">{!session.settings.blindReview && k === 'wrong-twice' ? 'Missed' : o.label}</div><div className="stat-value">{s.outcomes[k] || 0}</div>
            </button>
          ))}
        </div>
        {session.kind === 'diagnostic' && (
          <p>
            Every question you missed on the timed pass is now in your <a href="#/journal">mistake journal</a>. Write
            down your thought process for each, then check the <a href="#/diagnostic">diagnostic grid</a> to see where
            each skill breaks.
          </p>
        )}
        {session.kind !== 'diagnostic' && !session.settings.blindReview && (s.outcomes['wrong-twice'] || 0) > 0 && (
          <p>
            {s.outcomes['wrong-twice']} miss{s.outcomes['wrong-twice'] === 1 ? ' is' : 'es are'} now in your <a href="#/journal">mistake journal</a> and
            will come back for review tomorrow. Write down what tripped you up while it's fresh.
          </p>
        )}
        {session.kind !== 'diagnostic' && session.settings.blindReview && (s.outcomes['wrong-twice'] || 0) > 0 && (
          <p>
            {s.outcomes['wrong-twice']} question{s.outcomes['wrong-twice'] === 1 ? ' was' : 's were'} wrong in both the timed pass and blind review and {s.outcomes['wrong-twice'] === 1 ? 'is' : 'are'} now in your{' '}
            <a href="#/journal">mistake journal</a>. Write down your thought process while it's fresh.
          </p>
        )}
        <div className="row">
          <a className="button primary" href="#/journal">Open mistake journal</a>
          <button onClick={drillMisses}>Drill the types I missed</button>
        </div>
      </section>

      {(session.kind === 'stamina' || (session.kind === 'pt' && session.sections.length > 1)) && <StaminaCard session={session} />}

      {session.sections.length > 1 && (
        <section className="card">
          <h2>By section</h2>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Section</th><th>Timed</th><th>Blind review</th><th>Time used</th></tr></thead>
            <tbody>
              {s.bySection.map((b, i) => (
                <tr key={i}><td>{i + 1}. {b.title}{b.scored === false && <span className="chip" style={{ marginLeft: 6 }}>unscored</span>}</td><td>{b.firstCorrect}/{b.total}</td><td>{b.brCorrect}/{b.total}</td><td>{formatMs(session.sections[i].elapsedSec * 1000)}</td></tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}

      <section className="card">
        <h2>By question type</h2>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Type</th><th>Questions</th><th>Timed</th><th>Blind review</th><th>Wrong twice</th><th>Avg time</th></tr></thead>
          <tbody>
            {byType.map((t) => (
              <tr key={t.type}>
                <td>{typeLabel(t.type)}</td><td>{t.n}</td><td>{t.firstCorrect}/{t.n}</td><td>{t.brCorrect}/{t.n}</td>
                <td>{t.wrongTwice || ''}</td><td>{formatMs(t.avgTimeMs)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>

      {byCategory.length > 0 && (
        <section className="card">
          <h2>By category</h2>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Category</th><th>Group</th><th>Questions</th><th>Timed</th><th>Blind review</th><th>Wrong twice</th></tr></thead>
            <tbody>
              {byCategory.map((c) => (
                <tr key={c.type}>
                  <td>{categoryLabel(c.type)}</td>
                  <td className="muted">{CATEGORY_GROUPS.find((g) => c.type.startsWith(`${g.id}:`))?.label}</td>
                  <td>{c.n}</td><td>{c.firstCorrect}/{c.n}</td><td>{c.brCorrect}/{c.n}</td><td>{c.wrongTwice || ''}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}

      <section className="card">
        <div className="row spread">
          <h2>Questions</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="missed">Missed in either pass</option>
            {Object.entries(OUTCOMES).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
          </select>
        </div>
        <div className="table-wrap"><table className="table results-table">
          <thead><tr><th>Sec</th><th>#</th><th>Type</th><th>Timed</th><th>BR</th><th>Correct</th><th>Time</th><th>Result</th><th /></tr></thead>
          <tbody>
            {shown.map((row) => {
              const { qid, si, qi, entry, r, br, oc } = row;
              if (!entry) return null;
              const inJournal = !!journal[qid];
              return (
                <Fragment key={qid}>
                  <tr className={`clickable oc-row-${oc}`} onClick={() => setOpen(open === qid ? null : qid)}>
                    <td>{si + 1}</td>
                    <td>{qi + 1}{r.flagged ? ' ⚑' : ''}</td>
                    <td>{entry.question.types.map(typeLabel).join(', ')}</td>
                    <td>{r.first ?? '—'}</td>
                    <td>{session.settings.blindReview ? br ?? '—' : ''}</td>
                    <td>{entry.question.answer}</td>
                    <td>{formatMs(r.timeMs)}</td>
                    <td><span className={`badge oc-${oc}`}>{OUTCOMES[oc].label}</span></td>
                    <td className="right" onClick={(e) => e.stopPropagation()}>
                      {inJournal ? <a href="#/journal" className="small-text">In journal</a> : (
                        <button className="small" onClick={() => saveJournalEntry(makeEntry(entry.question, {
                          testName: entry.test.name, sectionTitle: entry.section.title, kind: entry.section.kind, passageText: entry.passage?.text,
                        }, { first: r.first, br, source: 'manual', sessionId: session.id }))}>+ Journal</button>
                      )}
                    </td>
                  </tr>
                  {open === qid && (
                    <tr className="expanded"><td colSpan={9}><QuestionReview entry={entry} first={r.first} br={session.settings.blindReview ? br : null} /></td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}

/** Top-of-results summary: XP, level, goal, and the next thing to do. */
function Celebration({ session, sessionAttempts }) {
  const store = useStore();
  const { index, tests, sessions, attempts, journal, questions, progress, prefs } = store;
  const xp = sessionAttempts.reduce((sum, a) => sum + attemptXp(a, index[a.qid]?.question.difficulty), 0);
  const plan = dailyPlan({ tests, sessions, attempts, journal, index, questions, progress });
  const next = plan.find((t) => !t.done && t.action);
  const s = session.summary;
  const pct = s.total ? s.firstCorrect / s.total : 0;
  const cheer = pct === 1 ? 'Flawless!' : pct >= 0.85 ? 'Excellent work!' : pct >= 0.7 ? 'Solid session.' : pct >= 0.5 ? 'Good reps. The misses are where the points are.' : 'Tough set. Every miss is now a lesson in your journal.';
  return (
    <section className="card celebrate">
      <GoalRing value={progress.today} goal={prefs.dailyGoal} size={96} />
      <div className="celebrate-main">
        <h2>{cheer}</h2>
        {prefs.gamification && (
          <>
            <div className="xp-gain">+{xp} XP{session.bestCombo >= 3 ? ` · best run 🔥 ${session.bestCombo}` : ''}{progress.streak.todayDone ? ` · streak ${progress.streak.current} 🔥` : ''}</div>
            <LevelBar level={progress.level} />
          </>
        )}
        <div className="row">
          {next ? <button className="primary" onClick={() => startTask(next, store)}>▶ Next up: {next.title}</button>
            : <a className="button primary" href="#/">Back to Today</a>}
          <a className="button" href="#/">Today's plan</a>
        </div>
      </div>
    </section>
  );
}
