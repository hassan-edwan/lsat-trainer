import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { navigate } from '../lib/nav.js';
import { buildDrill } from '../lib/analytics.js';
import { createDrillSession, createPTSession } from '../lib/session.js';
import { dailyPlan } from '../lib/plan.js';
import { ACHIEVEMENTS, dayKey } from '../lib/progress.js';
import { AchievementGrid, GoalRing, Heatmap, LevelBar } from '../components/ProgressWidgets.jsx';
import { loadBundledTests } from './Home.jsx';

/** Start a plan task; returns false if it has nothing to start. */
export async function startTask(task, { tests, saveSession }) {
  const a = task.action;
  if (!a) return false;
  if (a.kind === 'link') { window.location.hash = a.href.replace(/^#/, ''); return true; }
  const queue = { day: dayKey(Date.now()), task: task.id };
  let session;
  if (a.kind === 'test') session = createPTSession(tests.find((t) => t.id === a.testId));
  else session = createDrillSession(a.questions, a.opts);
  const saved = await saveSession({ ...session, queue });
  navigate(`/session/${saved.id}`);
  return true;
}

export default function Today() {
  const store = useStore();
  const { tests, sessions, attempts, journal, index, questions, progress, prefs, addTests, saveSession } = store;
  const [busy, setBusy] = useState(false);
  const plan = useMemo(
    () => dailyPlan({ tests, sessions, attempts, journal, index, questions, progress }),
    [tests, sessions, attempts, journal, index, questions, progress],
  );
  const next = plan.find((t) => !t.done && t.action);
  const doneCount = plan.filter((t) => t.done).length;
  const inProgress = Object.values(sessions).filter((s) => s.phase !== 'done').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const { streak, level, today, byDay } = progress;
  const game = prefs.gamification;

  if (!tests.length) {
    return (
      <section className="card hero">
        <h1>Welcome to LSAT Trainer</h1>
        <p>Three full practice tests, a skill diagnostic, and a flaw-pattern set are built in. Load them to get your first daily plan.</p>
        <button className="primary" disabled={busy} onClick={async () => { setBusy(true); await loadBundledTests(addTests); setBusy(false); }}>Load the practice tests</button>
      </section>
    );
  }

  const quick5 = async () => {
    const picked = buildDrill(questions, attempts, journal, { mode: 'smart', kinds: ['LR'], count: 5 });
    const s = await saveSession(createDrillSession(picked, { title: 'Quick 5', instant: true }));
    navigate(`/session/${s.id}`);
  };

  const remaining = Math.max(0, prefs.dailyGoal - today);
  return (
    <div className="stack">
      <section className="card today-hero">
        <GoalRing value={today} goal={prefs.dailyGoal} />
        <div className="today-main">
          <h1>{greeting()}</h1>
          <p className="today-msg">
            {remaining === 0
              ? (game ? `Goal met. Your streak is safe for today${streak.current > 1 ? ` (${streak.current} days)` : ''}. Anything more is bonus XP.` : 'Daily goal met. Nice work.')
              : game && streak.current > 0 && !streak.todayDone
                ? `${remaining} more question${remaining === 1 ? '' : 's'} to keep your ${streak.current}-day streak going.`
                : `${remaining} question${remaining === 1 ? '' : 's'} to today's goal.`}
          </p>
          <div className="row">
            {next && <button className="primary big" onClick={() => startTask(next, store)}>▶ Start next: {next.title}</button>}
            <button onClick={quick5} title="Five questions with instant feedback">⚡ Quick 5</button>
            {inProgress && <a className="button" href={`#/session/${inProgress.id}`}>Resume “{inProgress.title}”</a>}
          </div>
        </div>
        {game && (
          <div className="today-side">
            <div className="streak-big">
              <span className={`flame ${streak.todayDone ? 'lit' : ''}`}>🔥</span>
              <span className="streak-num">{streak.current}</span>
              <span className="muted small-text">day streak · best {streak.best}</span>
            </div>
            {streak.freezes > 0 && <div className="small-text" title="Earned every 7 goal days; covers a missed day">❄️ {streak.freezes} streak freeze{streak.freezes === 1 ? '' : 's'} saved</div>}
            <LevelBar level={level} />
          </div>
        )}
      </section>

      <section className="card">
        <div className="row spread">
          <h2>Today's plan</h2>
          <span className="muted">{doneCount}/{plan.length} done</span>
        </div>
        <ol className="plan">
          {plan.map((t) => (
            <li key={t.id} className={`plan-item ${t.done ? 'done' : ''} ${next?.id === t.id ? 'next' : ''}`}>
              <span className="plan-icon">{t.done ? '✅' : t.icon}</span>
              <div className="plan-text">
                <strong>{t.title}</strong>
                <span className="muted small-text">{t.detail}</span>
              </div>
              {!t.done && t.action && <button className={next?.id === t.id ? 'primary' : ''} onClick={() => startTask(t, store)}>Start</button>}
            </li>
          ))}
        </ol>
        {doneCount === plan.length && <p className="plan-complete">🎉 Plan complete for today. Come back tomorrow for a fresh one{game ? ', or keep going for bonus XP' : ''}.</p>}
      </section>

      <section className="card">
        <div className="row spread">
          <h2>Activity</h2>
          <span className="muted small-text">{Object.values(byDay).reduce((a, b) => a + b, 0)} questions all-time · goal {prefs.dailyGoal}/day (change in Settings)</span>
        </div>
        <Heatmap byDay={byDay} goal={prefs.dailyGoal} frozen={streak.frozenDays} />
      </section>

      {game && (
        <section className="card">
          <div className="row spread">
            <h2>Achievements</h2>
            <span className="muted">{progress.earned.length} of {ACHIEVEMENTS.length} unlocked</span>
          </div>
          <AchievementGrid earned={progress.earned} />
        </section>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
