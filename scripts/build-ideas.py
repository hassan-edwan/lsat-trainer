"""Assemble verified interest passages into RC sections for public/samples/reading-through-ideas.json.

Usage: python3 scripts/build-ideas.py <scratch dir with writer JSON files> <last verified passage number>
Passages int-p1..int-pN are grouped four to a section in id order and three sections to a test, so test
and section ids stay stable as later batches are added.
"""
import glob, json, sys

src, last = sys.argv[1], int(sys.argv[2])
P, Q = {}, {}
for f in glob.glob(f'{src}/*.json'):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    if not isinstance(d, dict) or 'passages' not in d:
        continue
    for p in d['passages']:
        P[p['id']] = p
    for q in d['questions']:
        Q.setdefault(q['passageId'], []).append(q)

ids = [f'int-p{i}' for i in range(1, last + 1) if f'int-p{i}' in P]
sections = []
for si in range(0, len(ids), 4):
    chunk = ids[si:si + 4]
    if len(chunk) < 4:
        break  # wait for a full section
    passages, questions = [], []
    for pid in chunk:
        p = P[pid]
        passages.append({k: p[k] for k in ('id', 'title', 'subject', 'text', 'topics', 'sources') if k in p})
        for q in Q[pid]:
            q = {k: v for k, v in q.items() if k not in ('number', 'id', 'skill')}
            q['stimulus'] = ''
            q['number'] = len(questions) + 1
            questions.append(q)
    n = len(sections) + 1
    sections.append({
        'id': f'ideas-rc-{n}', 'kind': 'RC', 'timeLimitMinutes': 35,
        'title': f'Reading Through Ideas {n}: ' + ' · '.join(P[x]['title'] for x in chunk),
        'passages': passages, 'questions': questions,
    })

tests = []
for ti in range(0, len(sections), 3):
    secs = sections[ti:ti + 3]
    n = ti // 3 + 1
    tests.append({
        'format': 'lsat-trainer/v1', 'id': f'reading-through-ideas-{n}', 'name': f'Reading Through Ideas {n}',
        'number': 100 + n,
        'source': 'Original RC passages written for LSAT Trainer from real scholarship (philosophy, epistemology, '
                  'etymology, poetry, literature, history, mathematics, Islamic thought, law, economics and politics), '
                  'with sources for further reading on every passage. Every key was confirmed by a blind solver and '
                  'every passage checked for accuracy. Not LSAC material. MIT licensed.',
        'sections': secs,
    })
json.dump({'tests': tests}, open('public/samples/reading-through-ideas.json', 'w'), ensure_ascii=False, indent=1)
print(len(ids), 'passages,', len(sections), 'sections,', len(tests), 'tests')
for s in sections:
    print(' ', s['id'], len(s['questions']), 'q:', s['title'][:150])
