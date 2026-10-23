import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { db, exportAll, importAll, STORES } from '../lib/db.js';
import { download, today } from '../lib/download.js';
import { flush, onSyncStatus, syncStatus } from '../lib/fileSync.js';

export default function Settings() {
  const { reload, prefs, savePrefs } = useStore();
  const [msg, setMsg] = useState('');
  const [sync, setSync] = useState(syncStatus);
  useEffect(() => onSyncStatus(setSync), []);

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
          <label className="inline">
            <input type="checkbox" checked={prefs.unscoredSection} onChange={(e) => savePrefs({ unscoredSection: e.target.checked })} />
            Test-day mode: full tests include an unscored fourth section (LR or RC, any position)
          </label>
        </div>
        <p className="muted small-text">
          Your streak counts days you reach the daily goal. Every 7 goal days earns a streak freeze (up to 2), which
          covers a missed day automatically.
        </p>
      </section>
      <section className="card">
        <h2>Data</h2>
        {sync.enabled ? (
          <div className={`sync-box ${sync.error ? 'bad' : 'good'}`}>
            <strong>{sync.error ? 'Not saving' : 'Saving to your project folder'}</strong>
            <div className="small-text"><code>{sync.dir}</code></div>
            <div className="small-text">
              {sync.error || `Every change is saved there automatically${sync.lastSaved ? `, last at ${new Date(sync.lastSaved).toLocaleTimeString()}` : ''}. A snapshot is kept for each day in backups/.`}
            </div>
            <button className="small" onClick={() => flush()}>Save now</button>
          </div>
        ) : (
          <p className="muted">
            This copy of the app isn't connected to a data folder, so your data is only in this browser. Run it with
            <code> npm run dev</code> to save to the project's <code>data/</code> folder.
          </p>
        )}
        <p>
          Your history, mistake journal and imported tests are also kept in this browser. When the app starts, it merges
          the browser with the data folder, so switching ports or browsers doesn't lose anything. A downloaded backup is
          a single file you can keep anywhere or move to another computer.
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
