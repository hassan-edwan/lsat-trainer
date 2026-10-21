import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { fetchBundleIndex, loadBundledTests } from '../lib/bundle.js';

/** Offers the newer built-in question bank when the one in this browser is out of date. */
export default function BundleUpdate() {
  const { allTests, prefs, installBundle } = useStore();
  const [bundle, setBundle] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchBundleIndex().then(setBundle).catch(() => {}); }, []);
  if (!bundle || !allTests.length) return null;
  const stale = allTests.some((t) => !t.retired && bundle.retired.includes(t.id))
    || (prefs.bundleVersion != null && prefs.bundleVersion < bundle.version);
  if (!stale) return null;
  return (
    <section className="card update-card">
      <div>
        <h2>New question bank available</h2>
        <p className="card-sub" style={{ margin: 0 }}>
          {bundle.notes || 'The built-in questions have been updated.'} Tests you've already taken stay in your history.
        </p>
      </div>
      <button className="primary" disabled={busy} onClick={async () => { setBusy(true); await loadBundledTests(installBundle); setBusy(false); }}>
        {busy ? 'Updating…' : 'Update now'}
      </button>
    </section>
  );
}
