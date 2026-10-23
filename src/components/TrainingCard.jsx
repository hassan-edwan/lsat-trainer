import { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { LADDERS } from '../lib/diagnostic.js';
import { masteryTrack, skillProfile, trainingPool } from '../lib/mastery.js';
import { startTraining } from '../pages/Diagnostic.jsx';

const LABEL = { mastered: '★', placed: '✓', working: '…', new: '·', none: '' };

/** After a mastery-path set: where the skill stands now, and the next set. */
export default function TrainingCard({ session }) {
  const store = useStore();
  const { attempts, index, sessions, journal, questions } = store;
  const { skill: skillId, level } = session.training;
  const { skill, track, before } = useMemo(() => {
    const pool = trainingPool(skillId, questions);
    const now = skillProfile({ attempts, index, sessions, journal });
    const prev = skillProfile({ attempts: attempts.filter((a) => a.sessionId !== session.id), index, sessions, journal });
    const s = now.skills.find((x) => x.id === skillId);
    return {
      skill: s,
      track: masteryTrack(s, now.rows, pool),
      before: masteryTrack(prev.skills.find((x) => x.id === skillId), prev.rows, pool),
    };
  }, [skillId, attempts, index, sessions, journal, questions, session.id]);
  if (!skill) return null;
  const at = track.levels[level - 1];
  const justMastered = at.status === 'mastered' && before.levels[level - 1].status !== 'mastered';
  const title = LADDERS.find((l) => l.id === skillId)?.title;

  return (
    <section className="card">
      <h2>{title}: mastery path</h2>
      <div className="training-levels">
        {track.levels.map((x) => (
          <span key={x.level} className={`ladder-cell mc-${x.status}`} title={`Level ${x.level}`}>
            {x.status === 'working' ? `${x.right}/${x.recent}` : LABEL[x.status] || x.level}
          </span>
        ))}
      </div>
      <p>
        {justMastered ? <strong>Level {level} mastered! </strong> : at.status === 'mastered' ? <>Level {level} is mastered. </> : (
          <>Level {level}: {at.right} of your last {at.recent} right under time{at.genuine ? `, ${at.genuine} still wrong after blind review` : ''}. You need 3 of 4 right and none still wrong after blind review. </>
        )}
        {track.complete ? 'Every level of this skill is mastered.' : `Next: level ${track.next}.`}
        {' '}Skill level {skill.level.toFixed(1)} after blind review, {skill.timedLevel.toFixed(1)} under time.
      </p>
      {!track.complete && <button className="primary" onClick={() => startTraining(skill, track.next, store)}>▶ Next set: level {track.next}</button>}
      {' '}<a href="#/diagnostic">All skills</a>
    </section>
  );
}
