import { useState } from 'react';
import { useStore } from '../store.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { db, exportAll, importAll, STORES } from '../lib/db.js';
import { download, today } from '../lib/download.js';

export default function Settings() {
  const { reload, prefs, savePrefs } = useStore();
  const [msg, setMsg] = useState('');

  return (
    <div className="stack">
      <PageHeader title="Settings" subtitle="Your daily goal, motivation features, and your data." />
      <section className="card">
        <h2>Study preferences</h2>
        <div className="form-row">
          <label>Daily goal (questions)
            <input type="number" min={5} max={200} value={prefs.dailyGoal}
              onChange={(e) => savePrefs({ dailyGoal: Math.max(5, Math.min(200, Number(e.target.value) || 20)) })} />
          </label>
          <label className="inline">
            <input type="checkbox" checked={prefs.gamification} onChange={(e) => savePrefs({ gamification: e.target.checked })} />
            Show streaks, XP, levels, and achievements
          </label>
        </div>
        <p className="muted small-text">
          Your streak counts days you reach the daily goal. Every 7 goal days earns a streak freeze (up to 2), which
          covers a missed day automatically.
        </p>
      </section>
      <section className="card">
        <h2>Data</h2>
        <p>
          Everything (your imported tests, history, and mistake journal) is stored in this browser only. Download a
          backup regularly, and use it to move your data to another computer.
        </p>
        <div className="row">
          <button className="primary" onClick={async () => download(`lsat-trainer-backup-${today()}.json`, JSON.stringify(await exportAll()), 'application/json')}>
            Download backup
          </button>
          <label className="button">
            Restore backup…
            <input type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files[0];
              if (!f) return;
              if (!confirm('Restoring replaces all data in this browser with the backup. Continue?')) return;
              try {
                await importAll(JSON.parse(await f.text()));
                await reload();
                setMsg('Backup restored.');
              } catch (err) {
                setMsg(`Restore failed: ${err.message}`);
              }
            }} />
          </label>
        </div>
        {msg && <p>{msg}</p>}
      </section>
      <section className="card">
        <h2>Reset</h2>
        <p className="muted">Clear your history (sessions and answers) but keep your tests and journal, or erase everything.</p>
        <div className="row">
          <button className="danger" onClick={async () => {
            if (!confirm('Delete all sessions and answer history?')) return;
            await db.clear('sessions'); await db.clear('attempts'); await reload(); setMsg('History cleared.');
          }}>Clear history</button>
          <button className="danger" onClick={async () => {
            if (!confirm('Erase ALL data, including tests and your mistake journal? This cannot be undone.')) return;
            for (const s of Object.keys(STORES)) await db.clear(s);
            await reload(); setMsg('All data erased.');
          }}>Erase everything</button>
        </div>
      </section>
    </div>
  );
}
