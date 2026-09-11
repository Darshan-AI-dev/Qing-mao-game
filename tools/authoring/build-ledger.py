# -*- coding: utf-8 -*-
"""Emit content/qingmao/ledger/chapters.json from the authored ledger sources.

Run from the repository root:  python3 tools/authoring/build-ledger.py
"""
import json, pathlib, statistics, sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from ledger_a import LEDGER_1_100       # noqa: E402
from ledger_b import LEDGER_101_200     # noqa: E402

L = {**LEDGER_1_100, **LEDGER_101_200}
missing = [c for c in range(1, 201) if c not in L]
if missing:
    raise SystemExit(f'ledger is missing chapters: {missing}')

beats, act_of = [], {}
for act in ('act1', 'act2', 'act3', 'act4'):
    data = json.loads(pathlib.Path(f'content/qingmao/acts/{act}/beats.json').read_text(encoding='utf-8'))
    for b in data['beats']:
        beats.append(b)
        act_of[b['id']] = act

by_chapter = {}
for b in beats:
    for c in range(b['chapters'][0], b['chapters'][1] + 1):
        by_chapter[c] = b

out = {
    'note': "One private-ledger entry per chapter, written in Fang Yuan's voice. Original "
            "writing: these are his records of cost and conclusion, never summaries of the "
            "source text. The Journal's Chapters view and the 'Previously...' card read from here.",
    'voice': 'First person, past tense, terse. Records what he did, what it cost, and what he '
             'concluded. He explains himself to no one.',
    'chapters': [
        {
            'chapter': c,
            'beat': by_chapter[c]['id'],
            'act': act_of[by_chapter[c]['id']],
            'coverage': by_chapter[c]['coverage'],
            'ledger': L[c],
        }
        for c in range(1, 201)
    ],
}
p = pathlib.Path('content/qingmao/ledger/chapters.json')
p.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
lens = [len(r['ledger']) for r in out['chapters']]
print(f'{p}: 200 chapters, mean {int(statistics.mean(lens))} chars, range {min(lens)}-{max(lens)}')
