import { useState } from 'react';
import {
  BarChart3, BookOpen, Dumbbell, Ellipsis, NotebookPen, Settings as SettingsIcon, Stethoscope, Sun, Upload,
} from 'lucide-react';
import { useStore } from '../store.jsx';
import { AchievementToaster, LevelBar } from './ProgressWidgets.jsx';

const PRACTICE = [
  { path: '/', label: 'Today', icon: Sun, hint: 'Your daily plan' },
  { path: '/drill', label: 'Drills', icon: Dumbbell, hint: 'Practice by type or weakness' },
  { path: '/diagnostic', label: 'Skill diagnostic', icon: Stethoscope, hint: 'Find where each skill breaks' },
  { path: '/library', label: 'Practice tests', icon: BookOpen, hint: 'Full timed tests' },
];
const REVIEW = [
  { path: '/journal', label: 'Mistake journal', icon: NotebookPen, hint: 'Review and learn from misses' },
  { path: '/stats', label: 'Progress', icon: BarChart3, hint: 'Accuracy by type and category' },
];
const FOOT = [
  { path: '/import', label: 'Import tests', icon: Upload },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];

function isActive(path, section) {
  if (path === '/') return !section;
  if (path === '/library') return section === 'library' || section === 'test';
  return `/${section}` === path;
}

function NavLink({ item, section, badge }) {
  const Icon = item.icon;
  return (
    <a href={`#${item.path}`} className={`nav-link ${isActive(item.path, section) ? 'active' : ''}`} title={item.hint}>
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
      <span>{item.label}</span>
      {badge ? <span className="count" aria-label={`${badge} due`}>{badge}</span> : null}
    </a>
  );
}

function ProgressCard() {
  const { prefs, progress } = useStore();
  if (!prefs.gamification) return null;
  const { streak, level, today } = progress;
  const pct = Math.min(100, Math.round((today / prefs.dailyGoal) * 100));
  return (
    <a className="side-progress" href="#/" title="Today">
      <div className="row-between">
        <span className={`streak-pill ${streak.todayDone ? 'lit' : ''}`}><span className="flame">🔥</span>{streak.current} day{streak.current === 1 ? '' : 's'}</span>
        <span className="muted small-text">{today}/{prefs.dailyGoal} today</span>
      </div>
      <div className={`goal-mini ${pct >= 100 ? 'done' : ''}`}><span style={{ width: `${pct}%` }} /></div>
      <LevelBar level={level} compact />
    </a>
  );
}

export function Brand() {
  return (
    <a className="brand" href="#/">
      <span className="brand-mark" aria-hidden="true"><BookOpen size={18} /></span>
      LSAT Trainer
    </a>
  );
}

export default function Layout({ section, children }) {
  const { progress, prefs } = useStore();
  const [more, setMore] = useState(false);
  const due = progress.due.length;
  const tabs = [PRACTICE[0], PRACTICE[1], REVIEW[0], REVIEW[1]];
  return (
    <div className="app">
      <aside className="sidebar" aria-label="Main navigation">
        <Brand />
        <ProgressCard />
        <nav className="nav-group" aria-label="Practice">
          <div className="nav-label">Practice</div>
          {PRACTICE.map((it) => <NavLink key={it.path} item={it} section={section} />)}
        </nav>
        <nav className="nav-group" aria-label="Review">
          <div className="nav-label">Review</div>
          {REVIEW.map((it) => <NavLink key={it.path} item={it} section={section} badge={it.path === '/journal' ? due : 0} />)}
        </nav>
        <nav className="sidebar-foot" aria-label="More">
          {FOOT.map((it) => <NavLink key={it.path} item={it} section={section} />)}
        </nav>
      </aside>

      <div className="main">
        <header className="mobile-top">
          <Brand />
          {prefs.gamification && (
            <span className={`streak-pill ${progress.streak.todayDone ? 'lit' : ''}`}><span className="flame">🔥</span>{progress.streak.current}</span>
          )}
        </header>
        <main className="page">{children}</main>
      </div>

      <nav className="tabbar" aria-label="Main navigation">
        {tabs.map((it) => {
          const Icon = it.icon;
          return (
            <a key={it.path} href={`#${it.path}`} className={isActive(it.path, section) ? 'active' : ''}>
              <Icon size={20} aria-hidden="true" />
              {it.label.split(' ').pop().replace(/^\w/, (c) => c.toUpperCase())}
            </a>
          );
        })}
        <a href="#more" onClick={(e) => { e.preventDefault(); setMore(true); }} className={more ? 'active' : ''}>
          <Ellipsis size={20} aria-hidden="true" />More
        </a>
      </nav>
      {more && (
        <div className="more-sheet" onClick={() => setMore(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {[PRACTICE[2], PRACTICE[3], ...FOOT].map((it) => (
              <span key={it.path} onClick={() => setMore(false)}><NavLink item={it} section={section} /></span>
            ))}
          </div>
        </div>
      )}
      <AchievementToaster />
    </div>
  );
}

/** Consistent page title block: what this page is and what to do here. */
export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}
