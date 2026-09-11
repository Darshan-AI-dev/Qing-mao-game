# -*- coding: utf-8 -*-
"""Builds a playable scaffold scene for every beat that has no final-quality script yet.

A scaffold is a real scene, not a placeholder: title cards for its chapters, actors
staged in the area, his ledger entry delivered as inner voice, the beat's flags and
evidence wired, and any choice the beat's template implies. It is marked
`"quality": "scaffold"` so the content lint can report exactly how much of the game
is still waiting for an authoring pass.

Run after tools/authoring/beats.py and tools/authoring/build-ledger.py.
"""
import json, pathlib, re

ROOT = pathlib.Path('.')
SCRIPTS = ROOT / 'content/qingmao/scripts'

# Which templates open with a choice, and what that choice is about. Keeps the
# scaffolds from all feeling identical and gives each arc its method flag early.
TEMPLATE_CHOICES = {
    'extortion-loop': ('How hard do you press at the gate?', [
        ('intimidate', 'Make the threat explicit.', 'intimidate'),
        ('budget', 'Keep it small enough to be budgeted for.', 'budget'),
        ('irregular', 'Vary the hour so nobody can plan around it.', 'irregular')]),
    'confrontation-choice': ('Decide, and then do not look at it again.', [
        ('quiet', 'Somewhere nobody walks.', 'quiet'),
        ('quick', 'Immediately, and badly.', 'quick'),
        ('avoid', 'Leave. There will be another evening.', 'avoid')]),
    'stealth-confrontation': ('Choose the ground.', [
        ('lure-ravine', 'The ravine. He will come.', 'lure-ravine'),
        ('lure-grove', 'The thick of the grove, where sightlines are short.', 'lure-grove'),
        ('withdraw', 'Go home and be seen going home.', 'withdraw')]),
    'negotiation': ('What do you put on the table?', [
        ('composure', 'Nothing. Let the silence do it.', 'composure'),
        ('concede', 'A number, slightly too generous.', 'concede'),
        ('leverage', 'What you know about their household.', 'leverage')]),
    'investigation': ('She is waiting for an answer.', [
        ('consistent', 'The same account, word for word.', 'consistent'),
        ('fuller', 'A fuller version, with one new detail.', 'fuller'),
        ('redirect', 'A true fact about somebody else.', 'redirect')]),
    'inquiry': ('Jia Fu asks where the Liquor worm came from.', [
        ('fossil', 'The caravan, the sealed shell, the witnesses.', 'fossil'),
        ('vague', 'Less than he asked for.', 'vague'),
        ('offer', 'Offer to have it examined.', 'offer')]),
    'petition': ('How do you make the case?', [
        ('paper', 'On the dates, and only the dates.', 'paper'),
        ('pressure', 'Through people who owe you.', 'pressure'),
        ('patience', 'File it and wait for the hall to be busy.', 'patience')]),
    'witness-gathering': ('Three people remember the arrangement.', [
        ('pay', 'Pay them.', 'pay'),
        ('persuade', 'Give them a reason of their own.', 'persuade'),
        ('leave', 'Leave them out of it.', 'leave')]),
    'observer': ('The position below is not going to hold.', [
        ('watch', 'Stay on the ridge.', 'watch'),
        ('leave', 'Go down the other side now.', 'leave')]),
    'duel': ('His defences come up in the same order every time.', [
        ('read', 'Break the layer, not the boy.', 'read'),
        ('rush', 'Close the distance and keep it closed.', 'rush'),
        ('wait', 'Let him spend the first three.', 'wait')]),
    'refinement': ('The materials are laid out.', [
        ('careful', 'Measure twice. Lose the day.', 'careful'),
        ('fast', 'Now, and accept the odds.', 'fast')]),
    'wolf-tide': ('The pack is a structure, not a crowd.', [
        ('conceal', 'Conceal and cross.', 'conceal'),
        ('fight', 'Hold the ravine and spend essence.', 'fight')]),
    'cinematic': ('There is one decision left in this.', [
        ('proceed', 'Proceed.', 'proceed'),
        ('wait', 'Wait for the better moment.', 'wait')]),
    'escape': ('The raft, and a direction.', [
        ('south', 'South. The Southern Border.', 'south'),
        ('wait', 'Stay on the bank until the smoke stops.', 'wait')]),
}

DIALOGUE_CAP = 240


def line(actor, text, kind='spoken'):
    return {'op': 'line', 'actor': actor, 'text': text, 'kind': kind, 'sfx': None}


def lines(actor, text, kind='spoken'):
    """Split a long entry at sentence boundaries so no line exceeds the dialogue cap."""
    if len(text) <= DIALOGUE_CAP:
        return [line(actor, text, kind)]
    out, buf = [], ''
    for sentence in re.findall(r'[^.!?]*[.!?]+|\S[^.!?]*$', text):
        sentence = sentence.strip()
        if not sentence:
            continue
        candidate = (buf + ' ' + sentence).strip()
        if buf and len(candidate) > DIALOGUE_CAP:
            out.append(line(actor, buf, kind))
            buf = sentence
        else:
            buf = candidate
    if buf:
        out.append(line(actor, buf, kind))
    return out

def build(beat, ledger_by_chapter):
    c0, c1 = beat['chapters']
    cast = [a for a in beat['cast'] if a != 'narrator']
    lead = cast[0] if cast else 'fang-yuan'
    others = [a for a in cast if a != 'fang-yuan'][:3]

    cmds = []
    if beat['coverage'] != 'ledger':
        cmds.append({'op': 'letterbox', 'on': True})
    cmds.append({'op': 'weather', 'kind': beat['weather'] if beat['weather'] in
                 ('rain', 'snow', 'mist', 'storm') else 'clear', 'intensity': 0.6})
    if beat['art']:
        cmds.append({'op': 'art', 'id': beat['art']})

    # Stage the cast in a loose arc facing the player.
    cmds.append({'op': 'place', 'actor': 'fang-yuan', 'at': [0, 8], 'facing': 3.14})
    for i, actor in enumerate(others):
        x = -4 + i * 4
        cmds.append({'op': 'place', 'actor': actor, 'at': [x, 0], 'facing': 0.0})
    cmds.append({'op': 'cut', 'to': [0, 4, 15], 'look': [0, 1.8, 2]})

    for chapter in range(c0, c1 + 1):
        entry = ledger_by_chapter[chapter]
        first_of_beat = chapter == c0
        if first_of_beat:
            cmds.append({'op': 'title', 'chapter': chapter, 'text': beat['title']})
        else:
            cmds.append({'op': 'title', 'chapter': chapter, 'text': f'Chapter {chapter}'})
        # The ledger entry is his own record, so it plays as inner voice.
        cmds.extend(lines('fang-yuan', entry, 'thought'))
        if first_of_beat and beat.get('designNote'):
            cmds.extend(lines('narrator', beat['designNote'], 'narration'))
        if first_of_beat and others:
            cmds.append({'op': 'face', 'actor': others[0], 'target': 'fang-yuan'})
            cmds.append({'op': 'gesture', 'actor': others[0], 'gesture': 'talk-point'})

    choice = TEMPLATE_CHOICES.get(beat['template'])
    if choice and beat['coverage'] == 'played':
        prompt, options = choice
        cmds.append({
            'op': 'choice',
            'id': f"{beat['id']}.method",
            'prompt': prompt,
            'method': beat['id'].split('.')[1] if '.' in beat['id'] else beat['id'],
            'options': [{'id': oid, 'label': label, 'method': method} for oid, label, method in options]
        })

    for flag in beat['sets']:
        cmds.append({'op': 'flag', 'set': flag})
    for evidence in beat['evidence']:
        cmds.append({'op': 'evidence', 'add': evidence})

    if beat['art']:
        cmds.append({'op': 'art', 'id': None})
    if beat['coverage'] != 'ledger':
        cmds.append({'op': 'letterbox', 'on': False})

    return {
        'id': beat['script'].replace('.json', ''),
        'beat': beat['id'],
        'chapters': [c0, c1],
        'quality': 'scaffold',
        'sfx': None,
        'music': None,
        'lens': {
            'anchor': f'Chapters {c0}-{c1}.' if c1 > c0 else f'Chapter {c0}.',
            'adaptation': beat.get('designNote') or 'Awaiting its authoring pass; the beat, flags and '
                                                   'evidence are final, the staging is not.',
        },
        'commands': cmds,
    }

def main():
    ledger = {r['chapter']: r['ledger'] for r in
              json.loads((ROOT / 'content/qingmao/ledger/chapters.json').read_text(encoding='utf-8'))['chapters']}
    written = skipped = 0
    for act in ('act1', 'act2', 'act3', 'act4'):
        data = json.loads((ROOT / f'content/qingmao/acts/{act}/beats.json').read_text(encoding='utf-8'))
        for beat in data['beats']:
            path = SCRIPTS / beat['script']
            if path.exists():
                existing = json.loads(path.read_text(encoding='utf-8'))
                if existing.get('quality') == 'final':
                    skipped += 1
                    continue
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(build(beat, ledger), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            written += 1
    print(f'{written} scaffold scripts written, {skipped} final-quality scripts left alone')

main()
