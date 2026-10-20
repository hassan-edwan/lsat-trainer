import { useState } from 'react';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Read-only view of a question with the user's answers and the correct one marked. */
export default function QuestionReview({ entry, first, br, showAnswer = true }) {
  const [showPassage, setShowPassage] = useState(false);
  const { question, passage } = entry;
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
            </li>
          );
        })}
      </ul>
      {showAnswer && question.explanation && <div className="explanation"><strong>Explanation:</strong> {question.explanation}</div>}
    </div>
  );
}
