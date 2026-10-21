import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HighlightText from './HighlightText.jsx';
import { AllChoiceNotes, ChoiceNote } from './Breakdown.jsx';
import { formatMs } from '../lib/analytics.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const HL_COLORS = ['yellow', 'pink', 'orange'];
const SAVE_EVERY_MS = 4000;

function highlightKey(entry) {
  return entry.passage
    ? `p:${entry.test.id}:${entry.section.id}:${entry.passage.id}`
    : `q:${entry.question.id}`;
}

/**
 * The exam interface. Used for the timed pass and for blind review.
 * Owns a working copy of the session and persists it via `onSave`.
 */
export default function Runner({ initial, index, onSave, onFinish, onExit }) {
  const [session, setSession] = useState(initial);
  const [tool, setTool] = useState(null);
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('lsat.fontSize')) || 16);
  const [hideTimer, setHideTimer] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [toast, setToast] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const lastSave = useRef(0);
  const warned = useRef(new Set());
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const isBR = session.phase === 'br';
  // Instant-feedback drills: check each answer as you go, no blind review.
  const instant = !!session.settings.instant;
  const isBreak = session.phase === 'break';
  const sec = session.sections[session.current.section];
  const qid = sec.qids[session.current.index];
  const entry = index[qid];
  const resp = session.responses[qid];

  // Persist after every change: immediately for answers/navigation,
  // at most every few seconds for timer ticks.
  const forceSave = useRef(false);
  const update = useCallback((fn, force = true) => {
    if (force) forceSave.current = true;
    setSession(fn);
  }, []);
  useEffect(() => {
    const now = Date.now();
    if (forceSave.current || now - lastSave.current > SAVE_EVERY_MS) {
      forceSave.current = false;
      lastSave.current = now;
      onSave(session);
    }
  }, [session, onSave]);

  // Save on unmount / tab close (a finishing session is saved by onFinish).
  useEffect(() => {
    const flush = () => { if (sessionRef.current.phase !== 'finishing') onSave(sessionRef.current); };
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, [onSave]);

  useEffect(() => { localStorage.setItem('lsat.fontSize', String(fontSize)); }, [fontSize]);

  // ---- section flow -------------------------------------------------------
  const endSection = useCallback(() => {
    setConfirmEnd(false);
    update((s) => {
      const i = s.current.section;
      if (i + 1 < s.sections.length) {
        if (s.settings.breakAfterSection === i && s.settings.breakMinutes) {
          return { ...s, phase: 'break', breakEndsAt: Date.now() + s.settings.breakMinutes * 60_000, current: { section: i + 1, index: 0 } };
        }
        return { ...s, current: { section: i + 1, index: 0 } };
      }
      if (s.settings.blindReview) {
        const responses = Object.fromEntries(Object.entries(s.responses).map(([k, r]) => [k, { ...r, br: r.first }]));
        return { ...s, phase: 'br', responses, current: { section: 0, index: 0 } };
      }
      return { ...s, phase: 'finishing' };
    });
  }, [update]);

  useEffect(() => {
    if (session.phase === 'finishing') onFinish(session);
  }, [session, onFinish]);

  // ---- timer --------------------------------------------------------------
  useEffect(() => {
    if (session.phase !== 'timed' && session.phase !== 'br' && session.phase !== 'break') return undefined;
    const id = setInterval(() => {
      setSession((prev) => {
        if (prev.phase === 'break') {
          if (Date.now() >= prev.breakEndsAt) {
            forceSave.current = true;
            return { ...prev, phase: 'timed', breakEndsAt: null };
          }
          return { ...prev };
        }
        const s = prev.sections[prev.current.section];
        const q = s.qids[prev.current.index];
        const r = prev.responses[q];
        const timeField = prev.phase === 'br' ? 'brTimeMs' : 'timeMs';
        const sections = prev.phase === 'timed'
          ? prev.sections.map((x, i) => (i === prev.current.section ? { ...x, elapsedSec: x.elapsedSec + 1 } : x))
          : prev.sections;
        return { ...prev, sections, responses: { ...prev.responses, [q]: { ...r, [timeField]: r[timeField] + 1000 } } };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [session.phase]);

  const remaining = sec.timeLimitSec != null ? sec.timeLimitSec - sec.elapsedSec : null;
  useEffect(() => {
    if (session.phase !== 'timed' || remaining == null) return;
    const key = session.current.section;
    if (remaining <= 300 && remaining > 0 && !warned.current.has(key)) {
      warned.current.add(key);
      setToast('Five minutes remaining in this section.');
      setTimeout(() => setToast(''), 6000);
    }
    if (remaining <= 0) endSection();
  }, [remaining, session.phase, session.current.section, endSection]);

  // ---- navigation & answering --------------------------------------------
  const visible = useMemo(() => {
    const list = sec.qids.map((id, i) => ({ id, i }));
    return isBR && flaggedOnly ? list.filter((x) => session.responses[x.id].flagged) : list;
  }, [sec, isBR, flaggedOnly, session.responses]);

  const go = useCallback((sectionIdx, idx) => update((s) => ({ ...s, current: { section: sectionIdx, index: idx } }), false), [update]);
  const step = useCallback((d) => {
    const pos = visible.findIndex((x) => x.i === session.current.index);
    const target = visible[pos + d] ?? (pos === -1 ? visible[0] : null);
    if (target) go(session.current.section, target.i);
  }, [visible, session.current, go]);

  const setResp = useCallback((patch) => update((s) => ({
    ...s, responses: { ...s.responses, [qid]: { ...s.responses[qid], ...patch(s.responses[qid]) } },
  })), [update, qid]);

  const answerField = isBR ? 'br' : 'first';
  const elimField = isBR ? 'brEliminated' : 'eliminated';
  const choose = (letter) => {
    if (instant && resp?.checked) return;
    setResp((r) => ({ [answerField]: r[answerField] === letter && !isBR ? null : letter }));
  };
  const allChecked = instant && sec.qids.every((id) => session.responses[id].checked);
  const check = () => {
    if (!instant || !resp?.first || resp.checked) return;
    const right = resp.first === entry.question.answer;
    update((s) => {
      const combo = right ? (s.combo || 0) + 1 : 0;
      return {
        ...s,
        combo,
        bestCombo: Math.max(s.bestCombo || 0, combo),
        responses: { ...s.responses, [qid]: { ...s.responses[qid], checked: true } },
      };
    });
    if (right && [5, 10, 15, 20, 25].includes((session.combo || 0) + 1)) {
      setToast(`🔥 ${(session.combo || 0) + 1} in a row!`);
      setTimeout(() => setToast(''), 2500);
    }
  };
  const nextOrFinish = () => {
    const nextUnchecked = sec.qids.findIndex((id, i) => i > session.current.index && !session.responses[id].checked);
    if (nextUnchecked >= 0) go(session.current.section, nextUnchecked);
    else if (allChecked) update((x) => ({ ...x, phase: 'finishing' }));
    else step(1);
  };
  const toggleElim = (letter) => setResp((r) => ({
    [elimField]: r[elimField].includes(letter) ? r[elimField].filter((l) => l !== letter) : [...r[elimField], letter],
  }));
  const toggleFlag = () => setResp((r) => ({ flagged: !r.flagged }));

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('textarea, select, input:not([type=checkbox])') || e.metaKey || e.ctrlKey || isBreak) return;
      const k = e.key.toUpperCase();
      const n = entry?.question.choices.length ?? 5;
      if (LETTERS.slice(0, n).includes(k)) {
        e.preventDefault();
        if (e.shiftKey) toggleElim(k); else choose(k);
      } else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (k === 'F') toggleFlag();
      else if (e.key === 'Enter' && instant) {
        e.preventDefault();
        if (resp?.checked) nextOrFinish(); else check();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- break screen -------------------------------------------------------
  if (isBreak) {
    const left = Math.max(0, session.breakEndsAt - Date.now());
    return (
      <div className="exam break-screen">
        <div className="card center">
          <h1>Intermission</h1>
          <p>The next section begins when the break ends.</p>
          <div className="big-timer">{formatMs(left)}</div>
          <button className="primary" onClick={() => update((s) => ({ ...s, phase: 'timed', breakEndsAt: null }))}>Resume now</button>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="exam"><div className="card center">
        <p>This question is no longer in your library (the test may have been deleted).</p>
        <button onClick={() => step(1)}>Next</button> <button onClick={onExit}>Exit</button>
      </div></div>
    );
  }

  const { question, passage } = entry;
  const hlKey = highlightKey(entry);
  const highlights = session.highlights?.[hlKey] || [];
  const setHighlights = (list) => update((s) => ({ ...s, highlights: { ...(s.highlights || {}), [hlKey]: list } }));
  const leftText = passage ? passage.text : question.stimulus;
  const chosen = resp[answerField];
  const eliminated = resp[elimField];
  const unanswered = sec.qids.filter((id) => !session.responses[id][answerField]).length;

  return (
    <div className="exam" style={{ '--exam-font': `${fontSize}px` }}>
      <header className={`exam-top ${isBR ? 'br' : ''}`}>
        <div className="exam-title">
          <button className="ghost" onClick={onExit} title="Save and exit">✕</button>
          <span>{session.title}</span>
          <span className="muted-on-dark">
            {isBR ? 'Blind Review — untimed' : `Section ${session.current.section + 1} of ${session.sections.length} · ${sec.title}`}
          </span>
        </div>
        <div className="exam-timer">
          {instant ? (
            <span className="combo-display" title="Correct answers in a row">
              {session.combo ? `🔥 ${session.combo} in a row` : 'Instant feedback'} · {formatMs(resp.timeMs)}
            </span>
          ) : isBR ? (
            <span className="muted-on-dark">Blind review is untimed</span>
          ) : remaining == null ? (
            <span className="muted-on-dark">Untimed · {formatMs(sec.elapsedSec * 1000)}</span>
          ) : hideTimer && remaining > 300 ? (
            <button className="ghost" onClick={() => setHideTimer(false)}>Show time</button>
          ) : (
            <button className={`ghost timer ${remaining <= 300 ? 'low' : ''}`} onClick={() => setHideTimer(true)} title="Click to hide">
              {formatMs(remaining * 1000)}
            </button>
          )}
        </div>
        <div className="exam-tools">
          {HL_COLORS.map((c) => (
            <button key={c} className={`tool swatch hl-${c} ${tool === c ? 'on' : ''}`} title={`Highlight (${c})`} onClick={() => setTool(tool === c ? null : c)} />
          ))}
          <button className={`tool ${tool === 'erase' ? 'on' : ''}`} title="Erase highlights: select highlighted text" onClick={() => setTool(tool === 'erase' ? null : 'erase')}>⌫</button>
          <button className="tool" title="Smaller text" onClick={() => setFontSize((f) => Math.max(12, f - 1))}>A−</button>
          <button className="tool" title="Larger text" onClick={() => setFontSize((f) => Math.min(24, f + 1))}>A+</button>
        </div>
      </header>

      <div className="exam-nav">
        {isBR && session.sections.length > 1 && (
          <select value={session.current.section} onChange={(e) => go(Number(e.target.value), 0)}>
            {session.sections.map((s, i) => <option key={i} value={i}>Section {i + 1}: {s.title}</option>)}
          </select>
        )}
        <div className="bubbles">
          {visible.map(({ id, i }) => {
            const r = session.responses[id];
            return (
              <button key={id} onClick={() => go(session.current.section, i)}
                className={`bubble ${i === session.current.index ? 'current' : ''} ${r[answerField] ? 'answered' : ''} ${
                  instant && r.checked ? (r.first === index[id]?.question.answer ? 'right' : 'wrong') : ''}`}>
                {r.flagged && <span className="flag-dot">⚑</span>}
                {i + 1}
              </button>
            );
          })}
        </div>
        {isBR && (
          <label className="flag-filter"><input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> Flagged only</label>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className={`exam-body ${leftText ? '' : 'single'}`}>
        {leftText && (
          <div className="pane left">
            {passage?.title && <div className="passage-title">{passage.title}</div>}
            <HighlightText text={leftText} highlights={highlights} tool={tool} onChange={setHighlights} />
          </div>
        )}
        <div className="pane right">
          {isBR && (
            <div className="br-note">
              Your timed answer: <strong>{resp.first ?? '—'}</strong>
              {resp.flagged && ' · flagged'}
            </div>
          )}
          <div className="q-number">Question {session.current.index + 1}</div>
          <div className="stem">{question.stem}</div>
          <div className="choices">
            {question.choices.map((c, i) => {
              const L = LETTERS[i];
              const elim = eliminated.includes(L);
              const reveal = instant && resp.checked
                ? (L === question.answer ? 'reveal-right' : L === chosen ? 'reveal-wrong' : '') : '';
              return (
                <div key={L} className={`choice ${chosen === L ? 'selected' : ''} ${elim ? 'eliminated' : ''} ${reveal}`}>
                  <button className="choice-main" onClick={() => choose(L)}>
                    <span className="radio">{L}</span>
                    <span className="choice-text">{c}</span>
                  </button>
                  <button className="elim" title="Cross out (Shift+letter)" onClick={() => toggleElim(L)}>{elim ? '↺' : '⊘'}</button>
                </div>
              );
            })}
          </div>
          {instant && resp.checked && (
            <div className={`feedback ${chosen === question.answer ? 'good' : 'bad'}`}>
              <div className="feedback-head">
                {chosen === question.answer
                  ? <>✓ Correct{(session.combo || 0) > 1 ? ` · 🔥 ${session.combo} in a row` : ''}</>
                  : <>✗ The answer is ({question.answer}). This one goes to your mistake journal.</>}
              </div>
              {question.breakdown ? (
                <>
                  {question.breakdown.analysis && <p>{question.breakdown.analysis}</p>}
                  {chosen !== question.answer && (
                    <div className="bd-pair"><strong>Your answer ({chosen}):</strong> <ChoiceNote note={question.breakdown.choices[LETTERS.indexOf(chosen)]} /></div>
                  )}
                  <div className="bd-pair"><strong>({question.answer}):</strong> <ChoiceNote note={question.breakdown.choices[LETTERS.indexOf(question.answer)]} isAnswer /></div>
                  <details className="bd-all">
                    <summary>Why every other choice is wrong</summary>
                    <AllChoiceNotes breakdown={question.breakdown} answer={question.answer} />
                  </details>
                </>
              ) : question.explanation && <p>{question.explanation}</p>}
            </div>
          )}
        </div>
      </div>

      <footer className="exam-bottom">
        <button onClick={() => step(-1)}>← Previous</button>
        <button className={resp.flagged ? 'flagged' : ''} onClick={toggleFlag}>⚑ {resp.flagged ? 'Flagged' : 'Flag'}</button>
        <button onClick={() => step(1)}>Next →</button>
        <span className="spacer" />
        <span className="hint">Keys: A–E answer · Shift+A–E cross out · ←/→ move · F flag{instant ? ' · Enter check / continue' : ''}</span>
        {instant ? (
          resp.checked
            ? <button className="primary" onClick={nextOrFinish}>{allChecked ? 'See results' : 'Continue →'}</button>
            : <button className="primary" disabled={!resp.first} onClick={check}>Check</button>
        ) : (
          <button className="primary" onClick={() => setConfirmEnd(true)}>
            {isBR ? 'Finish blind review' : session.current.section + 1 < session.sections.length ? 'End section' : 'End test'}
          </button>
        )}
      </footer>

      {confirmEnd && (
        <div className="modal-backdrop" onClick={() => setConfirmEnd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {isBR ? (
              <>
                <h2>Finish blind review?</h2>
                <p>Your test will be scored. Questions you got wrong both times go to your mistake journal.</p>
                <button className="primary" onClick={() => { setConfirmEnd(false); update((s) => ({ ...s, phase: 'finishing' })); }}>Finish and score</button>
              </>
            ) : (
              <>
                <h2>End this section?</h2>
                <p>{unanswered ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. ` : ''}You can't return to this section until blind review.</p>
                <button className="primary" onClick={endSection}>End section</button>
              </>
            )}{' '}
            <button onClick={() => setConfirmEnd(false)}>Keep working</button>
          </div>
        </div>
      )}
    </div>
  );
}
