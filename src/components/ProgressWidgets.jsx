import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { ACHIEVEMENTS, dayKey } from '../lib/progress.js';

export function GoalRing({ value, goal, size = 120 }) {
  const pct = Math.min(1, goal ? value / goal : 0);
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  return (
    <svg className="goal-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value} of ${goal} questions today`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className={`ring-fill ${pct >= 1 ? 'done' : ''}`}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="46%" textAnchor="middle" className="ring-value">{value}</text>
      <text x="50%" y="64%" textAnchor="middle" className="ring-label">{pct >= 1 ? 'goal met ✓' : `of ${goal} today`}</text>
    </svg>
  );
}

export function LevelBar({ level, compact = false }) {
  return (
    <div className={`level-bar ${compact ? 'compact' : ''}`} title={`${level.intoLevel} / ${level.levelSize} XP to level ${level.level + 1}`}>
      <span className="level-badge">Lv {level.level}</span>
      {!compact && <span className="level-title">{level.title}</span>}
      <span className="xp-track"><span className="xp-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} /></span>
      {!compact && <span className="muted small-text">{level.intoLevel}/{level.levelSize} XP</span>}
    </div>
  );
}

/** Compact streak + level shown in the top navigation. */
export function NavProgress() {
  const { prefs, progress } = useStore();
  if (!prefs.gamification) return null;
  const { streak, level, today } = progress;
  return (
    <a className="nav-progress" href="#/" title="Today">
      <span className={`nav-streak ${streak.todayDone ? 'lit' : ''}`} title={streak.todayDone ? 'Goal met today' : `${Math.max(0, prefs.dailyGoal - today)} more today to keep your streak`}>
        🔥 {streak.current}
      </span>
      <LevelBar level={level} compact />
    </a>
  );
}

/** Last 12 weeks of activity, GitHub-style. */
export function Heatmap({ byDay, goal, weeks = 12, frozen = [] }) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (weeks * 7 - 1) - today.getDay());
  const cols = [];
  for (let w = 0; w < weeks + 1; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      if (date > today) { col.push(null); continue; }
      const k = dayKey(date);
      const n = byDay[k] || 0;
      const lvl = n === 0 ? 0 : n < goal / 2 ? 1 : n < goal ? 2 : n < goal * 2 ? 3 : 4;
      col.push({ k, n, lvl, frozen: frozen.includes(k) });
    }
    cols.push(col);
  }
  return (
    <div className="heatmap" role="img" aria-label="Questions answered per day, last 12 weeks">
      {cols.map((col, i) => (
        <div key={i} className="heat-col">
          {col.map((c, j) => c
            ? <span key={j} className={`heat-cell h${c.lvl} ${c.frozen ? 'frozen' : ''}`} title={`${c.k}: ${c.n} question${c.n === 1 ? '' : 's'}${c.frozen ? ' (streak freeze used)' : ''}`} />
            : <span key={j} className="heat-cell empty" />)}
        </div>
      ))}
    </div>
  );
}

export function AchievementGrid({ earned }) {
  const set = new Set(earned);
  return (
    <div className="achievements">
      {ACHIEVEMENTS.map((a) => (
        <div key={a.id} className={`achievement ${set.has(a.id) ? 'earned' : 'locked'}`} title={a.desc}>
          <span className="ach-icon">{set.has(a.id) ? a.icon : '🔒'}</span>
          <span className="ach-title">{a.title}</span>
          <span className="ach-desc">{a.desc}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Pops a toast for achievements earned since they were last seen. On first
 * run, everything already earned is marked seen silently.
 */
export function AchievementToaster() {
  const { prefs, progress, savePrefs, loaded } = useStore();
  const [shown, setShown] = useState([]);
  useEffect(() => {
    if (!loaded || !prefs.gamification) return;
    if (prefs.seenAchievements == null) { savePrefs({ seenAchievements: progress.earned }); return; }
    const fresh = progress.earned.filter((id) => !prefs.seenAchievements.includes(id));
    if (!fresh.length) return;
    setShown(fresh);
    savePrefs({ seenAchievements: [...prefs.seenAchievements, ...fresh] });
    const t = setTimeout(() => setShown([]), 6000);
    return () => clearTimeout(t);
  }, [loaded, prefs.gamification, prefs.seenAchievements, progress.earned, savePrefs]);
  if (!shown.length) return null;
  return (
    <div className="ach-toasts" role="status">
      {shown.map((id) => {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        return (
          <div key={id} className="ach-toast" onClick={() => setShown((s) => s.filter((x) => x !== id))}>
            <span className="ach-icon">{a.icon}</span>
            <div><strong>Achievement unlocked: {a.title}</strong><div className="small-text">{a.desc}</div></div>
          </div>
        );
      })}
    </div>
  );
}
