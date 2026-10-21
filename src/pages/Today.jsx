import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { navigate } from '../lib/nav.js';
import { buildDrill } from '../lib/analytics.js';
import { createDrillSession, createPTSession } from '../lib/session.js';
import { dailyPlan } from '../lib/plan.js';
import { ACHIEVEMENTS, dayKey } from '../lib/progress.js';
import { AchievementGrid, GoalRing, Heatmap } from '../components/ProgressWidgets.jsx';
import { loadBundledTests } from '../lib/bundle.js';
import BundleUpdate from '../components/BundleUpdate.jsx';

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
  const { tests, sessions, attempts, journal, index, questions, progress, prefs, installBundle, saveSession } = store;
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
        <div className="eyebrow">👋 Welcome</div>
        <h1>Let's get you a 170+</h1>
        <p className="today-msg">
          LSAT Trainer comes with six full practice tests (three real-feel, three extra-hard), a skill diagnostic, and a
          flaw-pattern set, all original and fully explained. Load them and you'll get a personalized plan every day.
        </p>
        <div className="row">
          <button className="primary big" disabled={busy} onClick={async () => { setBusy(true); await loadBundledTests(installBundle); setBusy(false); }}>
            {busy ? 'Loading…' : 'Load the practice tests'}
          </button>
          <a className="button big" href="#/import">Import my own</a>
        </div>
      </section>
    );
  }

  const quick5 = async () => {
    const picked = buildDrill(questions, attempts, journal, { mode: 'smart', kinds: ['LR'], count: 5 });
    const s = await saveSession(createDrillSession(picked, { title: 'Quick 5', instant: true }));
    navigate(`/session/${s.id}`);
  };

  const remaining = Math.max(0, prefs.dailyGoal - today);
  const message = remaining === 0
    ? (game ? `Goal met${streak.current > 1 ? ` — ${streak.current} days in a row` : ''}. Anything more is bonus XP.` : 'Daily goal met. Nice work.')
    : game && streak.current > 0 && !streak.todayDone
      ? `${remaining} more question${remaining === 1 ? '' : 's'} to keep your ${streak.current}-day streak alive.`
      : `${remaining} question${remaining === 1 ? '' : 's'} to reach today's goal of ${prefs.dailyGoal}.`;

  return (
    <div className="stack">
      <BundleUpdate />
      <section className="card today-hero">
        <GoalRing value={today} goal={prefs.dailyGoal} size={128} />
        <div>
          <h1>{greeting()}</h1>
          <p className="today-msg">{message}</p>
          <div className="row">
            {next && <button className="primary big" onClick={() => startTask(next, store)}>▶ {next.title}</button>}
            <button className="big" onClick={quick5} title="Five questions with instant feedback">⚡ Quick 5</button>
            {inProgress && <a className="button big" href={`#/session/${inProgress.id}`}>↻ Resume “{inProgress.title}”</a>}
          </div>
        </div>
      </section>

      {game && (
        <div className="today-stats">
          <div className="card mini-stat">
            <span className="mini-icon"><span className={streak.todayDone ? 'flame-lit' : ''}>🔥</span></span>
            <div>
              <div className="mini-value">{streak.current} day{streak.current === 1 ? '' : 's'}</div>
              <div className="mini-label">Streak · best {streak.best}{streak.freezes ? ` · ❄️ ${streak.freezes} freeze${streak.freezes === 1 ? '' : 's'}` : ''}</div>
            </div>
          </div>
          <div className="card mini-stat">
            <span className="mini-icon">⭐</span>
            <div style={{ flex: 1 }}>
              <div className="mini-value">Level {level.level}</div>
              <div className="mini-label">{level.title} · {level.levelSize - level.intoLevel} XP to next</div>
              <div className="xp-track" style={{ width: '100%', marginTop: 6 }}><span className="xp-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} /></div>
            </div>
          </div>
          <a className="card mini-stat" href="#/journal" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className="mini-icon">🔁</span>
            <div>
              <div className="mini-value">{progress.due.length} due</div>
              <div className="mini-label">Mistakes ready for review</div>
            </div>
          </a>
        </div>
      )}

      <section className="card">
        <div className="row spread">
          <div>
            <h2>Today's plan</h2>
            <p className="card-sub">Built from your history: review what you missed, then work your weakest area.</p>
          </div>
          <span className="badge">{doneCount} of {plan.length} done</span>
        </div>
        <ol className="plan">
          {plan.map((t) => (
            <li key={t.id} className={`plan-item ${t.done ? 'done' : ''} ${next?.id === t.id ? 'next' : ''}`}>
              <span className="plan-icon">{t.done ? '✓' : t.icon}</span>
              <div className="plan-text">
                <strong>{t.title}</strong>
                <span className="muted small-text">{t.detail}</span>
              </div>
              {!t.done && t.action && <button className={next?.id === t.id ? 'primary' : ''} onClick={() => startTask(t, store)}>Start</button>}
            </li>
          ))}
        </ol>
        {doneCount === plan.length && <p className="plan-complete">🎉 Plan complete. Come back tomorrow for a fresh one{game ? ', or keep going for bonus XP' : ''}.</p>}
      </section>

      <section className="card">
        <div className="row spread">
          <div>
            <h2>Activity</h2>
            <p className="card-sub">Questions answered per day over the last 12 weeks. Darker means more.</p>
          </div>
          <span className="muted small-text">{Object.values(byDay).reduce((a, b) => a + b, 0)} all-time</span>
        </div>
        <Heatmap byDay={byDay} goal={prefs.dailyGoal} frozen={streak.frozenDays} />
      </section>

      {game && (
        <section className="card">
          <div className="row spread">
            <div>
              <h2>Achievements</h2>
              <p className="card-sub">Milestones for consistency, volume, and mastery.</p>
            </div>
            <span className="badge">{progress.earned.length} / {ACHIEVEMENTS.length}</span>
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
