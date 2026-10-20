import { useState } from 'react';
import { useStore } from '../store.jsx';
import { db, exportAll, importAll, STORES } from '../lib/db.js';
import { download, today } from '../lib/download.js';

export default function Settings() {
  const { reload } = useStore();
  const [msg, setMsg] = useState('');

  return (
    <div className="stack">
      <section className="card">
        <h1>Settings &amp; data</h1>
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
