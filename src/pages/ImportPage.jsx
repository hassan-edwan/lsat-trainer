import { useState } from 'react';
import { useStore } from '../store.jsx';
import { navigate } from '../lib/nav.js';
import { normalizeImport, parseTestText } from '../lib/importer.js';
import { typeLabel } from '../lib/taxonomy.js';
import { loadBundledTests } from './Home.jsx';

const TEXT_EXAMPLE = `# My Practice Test 1
## Section: LR | 35
1. Stimulus text goes here. It can span
several lines.
Which one of the following most strengthens the argument?
(A) first choice
(B) second choice
(C) third choice
(D) fourth choice
(E) fifth choice
2. ...
## Section: RC | 35
### Passage 1
Passage text...
1. Which one of the following most accurately expresses the main point of the passage?
(A) ...
## Answers
C A ...
B ...`;

export default function ImportPage() {
  const { tests, addTests } = useStore();
  const [mode, setMode] = useState('file');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const parse = (input, kind) => {
    setError('');
    setPreview(null);
    try {
      const raw = kind === 'text' ? parseTestText(input) : JSON.parse(input);
      setPreview(normalizeImport(raw));
    } catch (e) {
      setError(e.message);
    }
  };

  const onFiles = async (files) => {
    const all = [];
    setError('');
    for (const f of files) {
      try {
        const content = await f.text();
        const raw = f.name.endsWith('.txt') ? parseTestText(content) : JSON.parse(content);
        all.push(...normalizeImport(raw));
      } catch (e) {
        setError(`${f.name}: ${e.message}`);
        return;
      }
    }
    setPreview(all);
  };

  const existing = new Set(tests.map((t) => t.id));

  return (
    <div className="stack">
      <section className="card">
        <h1>Import tests</h1>
        <p>
          Import tests in the <a href="https://github.com/hassan-edwan/lsat-trainer/blob/main/docs/FORMAT.md" target="_blank" rel="noreferrer">LSAT Trainer format</a> (JSON),
          or paste plain text and it will be converted. Questions without types are tagged automatically from the
          wording of the question; you can change any tag later.
        </p>
        <p className="muted small-text">
          Only import material you have the right to use. Everything you import stays in this browser and is
          never uploaded anywhere.
        </p>
        <div className="tabs">
          {[['file', 'Upload files'], ['json', 'Paste JSON'], ['text', 'Paste text']].map(([m, l]) => (
            <button key={m} className={mode === m ? 'tab active' : 'tab'} onClick={() => { setMode(m); setPreview(null); setError(''); }}>{l}</button>
          ))}
        </div>

        {mode === 'file' && (
          <div className="dropzone">
            <input type="file" accept=".json,.txt" multiple onChange={(e) => onFiles([...e.target.files])} />
            <p className="muted">One or more .json files (a single test, an array, or {'{ "tests": [...] }'}), or .txt files in the text format.</p>
          </div>
        )}
        {mode !== 'file' && (
          <>
            <textarea className="code" rows={16} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={mode === 'text' ? TEXT_EXAMPLE : '{ "name": "...", "sections": [...] }'} />
            <div className="row">
              <button className="primary" onClick={() => parse(text, mode)}>Preview</button>
              {mode === 'text' && <button onClick={() => setText(TEXT_EXAMPLE)}>Show example</button>}
            </div>
          </>
        )}
        {error && <pre className="error">{error}</pre>}
      </section>

      {preview && (
        <section className="card">
          <h2>Preview</h2>
          {preview.map((t) => {
            const qs = t.sections.flatMap((s) => s.questions);
            const typeCounts = {};
            qs.forEach((q) => q.types.forEach((ty) => { typeCounts[ty] = (typeCounts[ty] || 0) + 1; }));
            return (
              <div key={t.id} className="preview">
                <h3>{t.name} {existing.has(t.id) && <span className="badge warn">will replace existing</span>}</h3>
                <p>
                  {t.sections.map((s) => `${s.title} (${s.questions.length}q, ${s.timeLimitMinutes} min)`).join(' · ')}
                </p>
                <p className="muted">{qs.filter((q) => q.autoTagged).length} of {qs.length} questions auto-tagged.</p>
                <div className="chips">
                  {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([ty, n]) => (
                    <span key={ty} className="chip">{typeLabel(ty)} · {n}</span>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="row">
            <button className="primary" onClick={async () => { await addTests(preview); navigate('/library'); }}>
              Import {preview.length} test{preview.length === 1 ? '' : 's'}
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Built-in practice tests</h2>
        <p>Load (or reload, after an update) the original practice tests that come with the app. Your history is kept.</p>
        <button onClick={async () => { await loadBundledTests(addTests); navigate('/library'); }}>Load the practice tests</button>
      </section>
    </div>
  );
}
