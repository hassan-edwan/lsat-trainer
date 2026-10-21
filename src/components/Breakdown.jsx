const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Setup lines ("Conclusion: …") and the analysis paragraph of a full breakdown. */
export function BreakdownHead({ breakdown, typeLabel }) {
  return (
    <div className="bd-head">
      {typeLabel && <div className="bd-row"><span className="bd-label">Question type</span><span>{typeLabel}</span></div>}
      {breakdown.setup.map((s, i) => (
        <div key={i} className="bd-row"><span className="bd-label">{s.label}</span><span>{s.text}</span></div>
      ))}
      {breakdown.analysis && <div className="bd-analysis"><span className="bd-label">Analysis</span><p>{breakdown.analysis}</p></div>}
    </div>
  );
}

/** The note for one answer choice, with its "Example of flaw" / "Negation" extras. */
export function ChoiceNote({ note, isAnswer }) {
  if (!note?.note) return null;
  const text = note.note.replace(/^CORRECT\.\s*/, '');
  return (
    <div className={`bd-note ${isAnswer ? 'right' : ''}`}>
      {isAnswer && <strong className="bd-verdict">Correct. </strong>}
      {text}
      {note.example && <div className="bd-extra"><em>Example of {isAnswer ? 'this' : 'that'} reasoning:</em> {note.example}</div>}
      {note.negation && <div className="bd-extra"><em>Negation:</em> {note.negation}</div>}
    </div>
  );
}

/** Notes for every choice, as a list (used where choices aren't otherwise shown). */
export function AllChoiceNotes({ breakdown, answer }) {
  return (
    <ol className="bd-choices" type="A">
      {breakdown.choices.map((c, i) => (
        <li key={i}><strong>({LETTERS[i]})</strong> <ChoiceNote note={c} isAnswer={LETTERS[i] === answer} /></li>
      ))}
    </ol>
  );
}
