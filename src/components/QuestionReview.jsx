import { useState } from 'react';
import { BreakdownHead, ChoiceNote } from './Breakdown.jsx';
import { typeLabel } from '../lib/taxonomy.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Read-only view of a question with the user's answers and the correct one marked. */
export default function QuestionReview({ entry, first, br, showAnswer = true }) {
  const [showPassage, setShowPassage] = useState(false);
  const { question, passage } = entry;
  const bd = question.breakdown;
  return (
    <div className="q-review">
      {passage && (
        <div>
          <button className="linklike" onClick={() => setShowPassage(!showPassage)}>
            {showPassage ? 'Hide passage' : 'Show passage'}
          </button>
          {showPassage && <div className="pre passage-box">{passage.text}</div>}
        </div>
      )}
      {question.stimulus && <div className="pre stimulus">{question.stimulus}</div>}
      <div className="stem">{question.stem}</div>
      {showAnswer && bd && <BreakdownHead breakdown={bd} typeLabel={(question.types || []).map(typeLabel).join(', ')} />}
      <ul className="review-choices">
        {question.choices.map((c, i) => {
          const L = LETTERS[i];
          const cls = [
            showAnswer && L === question.answer ? 'correct' : '',
            showAnswer && (L === first || L === br) && L !== question.answer ? 'wrong' : '',
          ].join(' ');
          const marks = [L === first ? 'timed' : null, L === br ? 'BR' : null].filter(Boolean);
          return (
            <li key={L} className={cls}>
              <span className="radio">{L}</span>
              <span className="choice-text">{c}</span>
              {marks.length > 0 && <span className="your-mark">your {marks.join(' & ')} answer</span>}
              {showAnswer && bd && <ChoiceNote note={bd.choices[i]} isAnswer={L === question.answer} />}
            </li>
          );
        })}
      </ul>
      {showAnswer && !bd && question.explanation && <div className="explanation"><strong>Explanation:</strong> {question.explanation}</div>}
    </div>
  );
}
