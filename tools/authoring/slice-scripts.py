# -*- coding: utf-8 -*-
"""Authored scene scripts for the chapters 1-19 vertical slice.

All dialogue and all inner-voice lines are original writing in the characters'
registers. Nothing here is transcribed from any translation of the source text.

Emits content/qingmao/scripts/act1/*.json.
"""
import json, pathlib

def line(actor, text, kind='spoken'):
    return {'op': 'line', 'actor': actor, 'text': text, 'kind': kind, 'sfx': None}

def thought(text):
    return line('fang-yuan', text, 'thought')

def narr(text):
    return line('narrator', text, 'narration')

FY = 'fang-yuan'

SCRIPTS = []

# ---------------------------------------------------------------- ch 1-2
SCRIPTS.append({
    'id': 'act1/001-last-stand',
    'beat': 'prologue.last-stand',
    'chapters': [1, 2],
    'quality': 'final',
    'sfx': None, 'music': None,
    'lens': {
        'anchor': 'Chapters 1-3.',
        'adaptation': 'The novel opens on the end of the first life and moves through it quickly. '
                      'Here it is playable, at full power, so the drop to Rank one in the next scene '
                      'has something to be a drop from.',
        'irony': 'Everything he spends here, he spends knowing he is about to lose all of it.'
    },
    'veteran': ['The worm he reaches for at the end is the only thing in five hundred years he never used.'],
    'commands': [
        {'op': 'letterbox', 'on': True},
        {'op': 'timeOfDay', 'value': 0.03},
        {'op': 'weather', 'kind': 'storm', 'intensity': 0.9},
        {'op': 'title', 'chapter': 1, 'text': 'The last stand of the first life'},
        {'op': 'place', 'actor': FY, 'at': [0, 0], 'facing': 0},
        {'op': 'cut', 'to': [0, 16, 30], 'look': [0, 2, 0]},
        narr('Eight of them have the doorway surrounded and none of them has gone through it.'),
        thought('They are counting. Good. Counting is slower than moving.'),
        {'op': 'camera', 'to': [7, 4, 12], 'look': [0, 2, 0], 'seconds': 2.4},
        narr('Five hundred years of cultivation, and a room with one exit.'),
        thought('Four can be made to stand still. Two will run. The last two are the problem, and they know it.'),
        {'op': 'gesture', 'actor': FY, 'gesture': 'cast'},
        {'op': 'flag', 'set': 'tutorial.combat'},
        narr('Spend what you have. The cost of every Gu is printed on it, and tonight the costs do not matter.'),
        {'op': 'wait', 'seconds': 1.2},
        thought('That is the last of the essence. Noted, and irrelevant.'),
        {'op': 'camera', 'to': [0, 3, 7], 'look': [0, 2, 0], 'seconds': 1.8},
        {'op': 'title', 'chapter': 2, 'text': 'Spring, then autumn'},
        narr('There is one thing left, and he has carried it unused for five centuries.'),
        {'op': 'choice', 'id': 'prologue.cicada', 'prompt': 'Use the Spring Autumn Cicada.', 'method': 'prologue',
         'options': [
             {'id': 'immediately', 'label': 'Now, before they finish counting.', 'method': 'cold'},
             {'id': 'last-moment', 'label': 'Let it get as close as it is going to get.', 'method': 'patient'}
         ]},
        thought('Not mercy. A ledger closed, and reopened on the first page.'),
        {'op': 'fade', 'to': 'black', 'seconds': 1.6},
        {'op': 'letterbox', 'on': False},
    ]
})

# ---------------------------------------------------------------- ch 3
SCRIPTS.append({
    'id': 'act1/003-waking-bamboo-room',
    'beat': 'act1.waking.bamboo-room',
    'chapters': [3, 3],
    'quality': 'final',
    'sfx': None, 'music': None,
    'lens': {
        'anchor': 'Chapter 3.',
        'adaptation': 'The room is built from the text\'s description: wooden stakes under the living '
                      'floor, a thin blanket, an open window, damp mountain air.',
        'irony': 'The player has just finished the prologue at full power. This body can barely cross the room.'
    },
    'commands': [
        {'op': 'timeOfDay', 'value': 0.22},
        {'op': 'weather', 'kind': 'rain', 'intensity': 0.7},
        {'op': 'title', 'chapter': 3, 'text': 'Rain on the upper floor'},
        {'op': 'place', 'actor': FY, 'at': [0, 2], 'facing': 3.14},
        {'op': 'cut', 'to': [0, 2.4, 8], 'look': [0, 1.6, 0]},
        {'op': 'fade', 'to': 'clear', 'seconds': 1.8},
        narr('Rain on bamboo. Below the floor, wooden stakes hold the room above the slope.'),
        thought('Fifteen. The latch on that window has been broken since the spring before last.'),
        {'op': 'camera', 'to': [2.5, 1.8, 4], 'look': [0, 1.5, 0], 'seconds': 2.0},
        narr('Twelve primeval stones in a cloth bag by the bed. No aperture. No Gu but one, and that one is asleep.'),
        thought('Everything in this room is already accounted for. That is the advantage. It is not a large one.'),
        {'op': 'flag', 'set': 'tutorial.movement'},
        narr('Stand up. The mountain is where it was.'),
        {'op': 'camera', 'to': [0, 6, 12], 'look': [0, 1.5, 0], 'seconds': 2.4},
    ]
})

# ---------------------------------------------------------------- ch 4-6
SCRIPTS.append({
    'id': 'act1/004-awakening-ceremony',
    'beat': 'act1.awakening.ceremony',
    'chapters': [4, 6],
    'quality': 'final',
    'sfx': None, 'music': None,
    'lens': {
        'anchor': 'Chapters 4-6.',
        'adaptation': 'The previous build covered the awakening in a single interaction. Here it is '
                      'staged in the round, with the crowd, so the verdict lands on a person in front of people.',
        'irony': 'He knows the number before the elder reads it, and so do you.'
    },
    'veteran': ['Keep the forty-four percent in mind. It is the figure everything in this arc is priced against.'],
    'commands': [
        {'op': 'letterbox', 'on': True},
        {'op': 'timeOfDay', 'value': 0.0},
        {'op': 'weather', 'kind': 'mist', 'intensity': 0.5},
        {'op': 'title', 'chapter': 4, 'text': 'Forty-four percent'},
        {'op': 'art', 'id': 'awakening'},
        {'op': 'place', 'actor': FY, 'at': [0, 10], 'facing': 3.14},
        {'op': 'place', 'actor': 'elder-gu-room', 'at': [0, 2], 'facing': 0},
        {'op': 'place', 'actor': 'fang-zheng', 'at': [-3, 11], 'facing': 3.14},
        {'op': 'cut', 'to': [0, 7, 26], 'look': [0, 2, 4]},
        narr('A clear, faintly blue river. On the far bank, moon orchids: jade stems, crescent petals, pearl-bright centres.'),
        line('elder-gu-room', 'Step to the water. One at a time, and in the order you were given.'),
        thought('He has read this list out for thirty years. He does not look at the faces any more.'),
        {'op': 'camera', 'to': [3, 3, 14], 'look': [0, 2, 6], 'seconds': 2.2},
        {'op': 'gesture', 'actor': 'elder-gu-room', 'gesture': 'talk-point'},
        line('elder-gu-room', 'Fang Yuan.'),
        {'op': 'move', 'actor': FY, 'to': [0, 4], 'seconds': 2.0},
        narr('The Hope Gu gather over the water. Light collects without heat.'),
        thought('Now.'),
        {'op': 'wait', 'seconds': 1.0},
        narr('Something opens. Not a door — a volume, where there was none.'),
        {'op': 'flag', 'set': 'codex.aperture'},
        line('elder-gu-room', 'C grade. Forty-four percent.'),
        {'op': 'camera', 'to': [-2, 2.6, 9], 'look': [0, 1.9, 4], 'seconds': 1.6},
        narr('The sound the crowd makes is not cruelty. It is arithmetic, done out loud.'),
        thought('A clerk reading a figure he has read ten thousand times, and four hundred people agreeing with him.'),
        thought('Forty-four percent of a sea. It is not a verdict. It is a budget.'),
        {'op': 'title', 'chapter': 5, 'text': 'The second name'},
        line('elder-gu-room', 'Fang Zheng.'),
        {'op': 'move', 'actor': 'fang-zheng', 'to': [-1, 4], 'seconds': 1.8},
        {'op': 'face', 'actor': FY, 'target': 'fang-zheng'},
        {'op': 'wait', 'seconds': 0.8},
        line('elder-gu-room', 'A grade. One hundred percent.'),
        narr('The crowd does something different this time, and it does it for longer.'),
        line('fang-zheng', 'Brother — did you hear? A grade!'),
        thought('He is not gloating. That is the part that will be inconvenient later.'),
        {'op': 'choice', 'id': 'awakening.response', 'prompt': 'Answer your brother.', 'method': 'brother',
         'options': [
             {'id': 'accurate', 'label': '"The grades are accurate."', 'method': 'cold'},
             {'id': 'congratulate', 'label': '"Good. The clan will pay for everything now."', 'method': 'barbed'},
             {'id': 'nothing', 'label': 'Say nothing at all.', 'method': 'silent'}
         ]},
        {'op': 'flag', 'set': 'know.fang-zheng-a-grade'},
        {'op': 'title', 'chapter': 6, 'text': 'The mountain\'s green spears'},
        {'op': 'art', 'id': None},
        {'op': 'letterbox', 'on': False},
        {'op': 'timeOfDay', 'value': 0.35},
        {'op': 'weather', 'kind': 'clear'},
        narr('Outside, the bamboo stands straight, each stem sharpened at the tip like a spear.'),
        thought('The mountain is the only thing here that has not changed its mind about me.'),
    ]
})

# ---------------------------------------------------------------- ch 7-8
SCRIPTS.append({
    'id': 'act1/007-academy-first-gu',
    'beat': 'act1.academy.first-gu',
    'chapters': [7, 8],
    'quality': 'final',
    'sfx': None, 'music': None,
    'lens': {
        'anchor': 'Chapters 7-8.',
        'adaptation': 'The two-stone price of Green Bamboo Wine is the figure the source text states. '
                      'Everything else in the economy is balanced around numbers like it.',
        'irony': 'He is about to spend a sixth of everything he owns on a smell, and he wants to be seen doing it.'
    },
    'commands': [
        {'op': 'timeOfDay', 'value': 0.4},
        {'op': 'title', 'chapter': 7, 'text': 'The crescent in your palm'},
        {'op': 'place', 'actor': FY, 'at': [0, 8], 'facing': 3.14},
        {'op': 'place', 'actor': 'elder-gu-room', 'at': [0, 0], 'facing': 0},
        {'op': 'cut', 'to': [0, 3, 12], 'look': [0, 1.8, 2]},
        line('elder-gu-room', 'Moonlight Gu. Every Gu Yue student takes it first, and most of them take nothing else.'),
        narr('A translucent pale-blue crescent, cold as jade against the palm.'),
        thought('The clan owns the breeding method. That is why it is the signature, and not because of the poetry.'),
        line('elder-gu-room', 'It eats moon orchid petals. Every six days, and it is your business to remember.'),
        {'op': 'flag', 'set': 'codex.upkeep'},
        thought('So the first thing I learn about my first Gu is what it costs to keep.'),
        {'op': 'gesture', 'actor': 'elder-gu-room', 'gesture': 'talk-dismiss'},
        line('elder-gu-room', 'The training courtyard is north. Do not practise indoors.'),
        {'op': 'title', 'chapter': 8, 'text': 'A jar bought with tomorrow'},
        {'op': 'fade', 'to': 'black', 'seconds': 0.5},
        {'op': 'place', 'actor': FY, 'at': [0, 6], 'facing': 3.14},
        {'op': 'place', 'actor': 'tavern-keeper', 'at': [0, -2], 'facing': 0},
        {'op': 'cut', 'to': [4, 2.6, 9], 'look': [0, 1.7, 1]},
        {'op': 'timeOfDay', 'value': 0.66},
        {'op': 'fade', 'to': 'clear', 'seconds': 0.6},
        line('tavern-keeper', 'Green Bamboo Wine. Two stones, and I will not pretend it is worth two stones to drink.'),
        thought('Twelve stones. Two of them is a sixth of everything I have, spent on a smell.'),
        {'op': 'choice', 'id': 'wine.purchase', 'prompt': 'Two primeval stones.', 'method': 'wine',
         'options': [
             {'id': 'buy-openly', 'label': 'Buy it in front of the room.', 'sets': 'item.wine', 'method': 'open'},
             {'id': 'buy-quietly', 'label': 'Wait until the room thins out.', 'sets': 'item.wine', 'method': 'quiet'}
         ]},
        line('tavern-keeper', 'Most boys your age buy it to look older. You have the look of someone buying it for a reason.'),
        thought('Let him say that to whoever asks. A story I did not have to build is the cheapest kind.'),
        {'op': 'flag', 'set': 'econ.stones-open'},
    ]
})

# ---------------------------------------------------------------- ch 9-11
SCRIPTS.append({
    'id': 'act1/009-household-brothers',
    'beat': 'act1.household.brothers',
    'chapters': [9, 11],
    'quality': 'final',
    'sfx': None, 'music': None,
    'lens': {
        'anchor': 'Chapters 9-11.',
        'adaptation': 'An arc the previous build skipped entirely. It seeds the asset dispute that does '
                      'not settle until chapter 115, and it is where the brothers start to diverge.',
        'irony': 'The transfer date Aunt Cui cannot produce is the thing that decides chapter 113.'
    },
    'commands': [
        {'op': 'timeOfDay', 'value': 0.35},
        {'op': 'weather', 'kind': 'rain', 'intensity': 0.5},
        {'op': 'title', 'chapter': 9, 'text': 'A house that is not his'},
        {'op': 'place', 'actor': FY, 'at': [0, 7], 'facing': 3.14},
        {'op': 'place', 'actor': 'fang-qiu', 'at': [-3, -1], 'facing': 0.3},
        {'op': 'place', 'actor': 'fang-qiu-wife', 'at': [3, -1], 'facing': -0.3},
        {'op': 'place', 'actor': 'fang-zheng', 'at': [0, 4], 'facing': 3.14},
        {'op': 'cut', 'to': [0, 3.2, 13], 'look': [0, 1.8, 1]},
        line('fang-qiu', 'Nephew. Sit, sit. There is tea.'),
        thought('Fourth time he has said nephew. Three more than the sentence needed.'),
        line('fang-qiu-wife', 'We have kept the accounts in good order all these years. Nobody can say otherwise.'),
        thought('Nobody has asked.'),
        {'op': 'title', 'chapter': 10, 'text': 'An itemised kindness'},
        {'op': 'gesture', 'actor': 'fang-qiu-wife', 'gesture': 'talk-cross-arms'},
        line('fang-qiu-wife', 'The roof, the rice, the academy fees. Two boys is not a small thing to carry.'),
        line('fang-qiu', 'She means it kindly.'),
        thought('She means it as an invoice. He means it as a receipt.'),
        {'op': 'choice', 'id': 'household.records', 'prompt': 'The accounts are on the table.', 'method': 'household',
         'options': [
             {'id': 'ask-date', 'label': 'Ask which year the transfer was recorded in.', 'sets': 'know.asset-records', 'method': 'paper'},
             {'id': 'say-nothing', 'label': 'Let them finish and take the tea.', 'method': 'patient'},
             {'id': 'push', 'label': 'Say the property was your father\'s.', 'method': 'direct'}
         ]},
        line('fang-qiu', 'That is — we will find the year. It will be written somewhere.'),
        thought('It is written nowhere. That is worth more than an argument tonight.'),
        {'op': 'flag', 'set': 'know.assets-dispute'},
        {'op': 'title', 'chapter': 11, 'text': 'What his brother asks'},
        {'op': 'camera', 'to': [2, 2.2, 7], 'look': [0, 1.7, 4], 'seconds': 2.0},
        {'op': 'face', 'actor': 'fang-zheng', 'target': 'fang-yuan'},
        line('fang-zheng', 'Are you angry about the grades? You have barely said anything since the river.'),
        thought('He wants to be told no. It would cost nothing to tell him no.'),
        {'op': 'choice', 'id': 'household.brother', 'prompt': 'Answer him.', 'method': 'brother',
         'options': [
             {'id': 'accurate', 'label': '"The grades were accurate."', 'method': 'cold'},
             {'id': 'reassure', 'label': '"No. Go and train."', 'method': 'managed'},
             {'id': 'warn', 'label': '"Be careful what the clan spends on you."', 'method': 'oblique'}
         ]},
        line('fang-zheng', 'You always say things like that as if they were answers.'),
        thought('He accepted it. He will keep accepting it, for about a hundred chapters.'),
        {'op': 'flag', 'set': 'know.uncle'},
    ]
})

# ---------------------------------------------------------------- ch 12-13
SCRIPTS.append({
    'id': 'act1/012-liquor-worm-search',
    'beat': 'act1.liquor-worm.search',
    'chapters': [12, 13],
    'quality': 'final',
    'sfx': None, 'music': None,
    'lens': {
        'anchor': 'Chapters 12-13.',
        'adaptation': 'The previous build compressed the search into one visit. Here it takes several '
                      'nights, because the cost of the search is the point.',
        'irony': 'A reader already knows what the wine is for. A Recollection will say so, at no charge, whenever you want it.'
    },
    'veteran': ['The crevice this leads to matters again at chapter 60, long after the wall goes dark.'],
    'commands': [
        {'op': 'timeOfDay', 'value': 0.88},
        {'op': 'weather', 'kind': 'mist', 'intensity': 0.6},
        {'op': 'title', 'chapter': 12, 'text': 'Nights with nothing in them'},
        {'op': 'place', 'actor': FY, 'at': [0, 44], 'facing': 3.14},
        {'op': 'cut', 'to': [0, 6, 54], 'look': [0, 2, 36]},
        narr('The jar is open on a flat stone. Bamboo, wet, and a cool smell going nowhere.'),
        thought('A wine-loving Gu lives on this mountain. The memory is that specific and no more specific than that.'),
        thought('Five hundred years is a long time for a crevice to keep the same shape.'),
        {'op': 'wait', 'seconds': 1.4},
        narr('Nothing on the first night. Nothing on the second.'),
        {'op': 'flag', 'set': 'know.liquor-worm'},
        {'op': 'title', 'chapter': 13, 'text': 'A bead of snow'},
        {'op': 'timeOfDay', 'value': 0.91},
        narr('Fourth night. Something white comes out between the stems, drinks, and goes northeast fast enough to cost essence to follow.'),
        thought('I have seen worse returns on two stones.'),
        {'op': 'camera', 'to': [8, 4, 30], 'look': [16, 1, 12], 'seconds': 2.6},
    ]
})

# ---------------------------------------------------------------- ch 14-19
SCRIPTS.append({
    'id': 'act1/014-liquor-worm-cave',
    'beat': 'act1.liquor-worm.cave',
    'chapters': [14, 19],
    'quality': 'final',
    'sfx': None, 'music': None,
    'lens': {
        'anchor': 'Chapters 14-19.',
        'adaptation': 'The image wall, the remains and the Cicada are given a set piece rather than one '
                      'interaction. The cave is genuinely dark and the player carries the light.',
        'irony': 'The wall contradicts the clan before any character in the game says so out loud.'
    },
    'veteran': ['The Photo-audio Gu powering the wall is nearly spent. It will not be a working screen for long.'],
    'commands': [
        {'op': 'letterbox', 'on': True},
        {'op': 'timeOfDay', 'value': 0.0},
        {'op': 'weather', 'kind': 'clear'},
        {'op': 'title', 'chapter': 14, 'text': 'What the mountain keeps'},
        {'op': 'art', 'id': 'lotus-chamber'},
        {'op': 'place', 'actor': FY, 'at': [0, 32], 'facing': 3.14},
        {'op': 'cut', 'to': [0, 4, 40], 'look': [0, 2, 18]},
        narr('The crevice opens wider than it looked. Inside, the dark has a shape to it, and the shape is large.'),
        thought('Carry the light. Whatever is in here has been in here a long time and is in no hurry.'),
        {'op': 'evidence', 'add': 'cave.entry-traces'},
        {'op': 'title', 'chapter': 15, 'text': 'A witness in the wall'},
        {'op': 'camera', 'to': [-5, 2.6, 10], 'look': [0, 2.2, -6], 'seconds': 2.8},
        narr('Remains, by the vessels: a monk, dead long enough for the clan to have built something over the top of him.'),
        narr('And a wall that is still showing pictures.'),
        thought('That is a Photo-audio Gu, and it is nearly finished.'),
        {'op': 'wait', 'seconds': 1.2},
        narr('What the wall shows does not match what the village celebrates every spring.'),
        thought('Watch it three times. Be able to repeat it without an error, in case the chance to watch it goes away.'),
        {'op': 'flag', 'set': 'know.image-wall'},
        {'op': 'title', 'chapter': 16, 'text': 'What he left at the mouth'},
        {'op': 'camera', 'to': [0, 3, 24], 'look': [0, 1.6, 34], 'seconds': 2.2},
        thought('Crushed bamboo, a scuffed ledge, one print in wet clay. Ordinary on their own.'),
        thought('Together they are a direction, for anyone who thinks to look.'),
        {'op': 'choice', 'id': 'cave.traces', 'prompt': 'The approach you came in by.', 'method': 'cave',
         'options': [
             {'id': 'brush-out', 'label': 'Spend the evening making it look like weather.', 'method': 'careful'},
             {'id': 'leave-it', 'label': 'Leave it. Nobody comes up here.', 'method': 'fast'}
         ]},
        {'op': 'title', 'chapter': 17, 'text': 'It will not be taken by hand'},
        {'op': 'camera', 'to': [4, 2.2, -2], 'look': [-2, 1, -12], 'seconds': 2.4},
        narr('The worm is faster than he is, and it has no reason to trust a jar twice.'),
        thought('Two nights more than I wanted to spend on this.'),
        {'op': 'title', 'chapter': 18, 'text': 'Methods he will not use'},
        thought('The clan has a procedure for this. The procedure requires telling the clan.'),
        thought('An advantage announced is an advantage surrendered. So: the other thing.'),
        {'op': 'title', 'chapter': 19, 'text': 'Pressure'},
        {'op': 'camera', 'to': [0, 2.4, 4], 'look': [0, 1.2, -8], 'seconds': 2.0},
        narr('Something very old turns over, without waking.'),
        narr('The resistance goes out of the worm like water out of a cracked jar.'),
        thought('Nobody on this mountain can explain what just happened. Including me, in any useful detail.'),
        {'op': 'flag', 'set': 'gu.liquor-worm'},
        {'op': 'flag', 'set': 'secret.liquor-worm-origin'},
        thought('What I have now: a Gu that refines essence, and a cave only I can find. The second one may outlast the first.'),
        {'op': 'art', 'id': None},
        {'op': 'letterbox', 'on': False},
    ]
})

def main():
    out = pathlib.Path('content/qingmao/scripts')
    count = 0
    for script in SCRIPTS:
        path = out / (script['id'] + '.json')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(script, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        lines = sum(1 for c in script['commands'] if c['op'] == 'line')
        choices = sum(1 for c in script['commands'] if c['op'] == 'choice')
        thoughts = sum(1 for c in script['commands'] if c['op'] == 'line' and c.get('kind') == 'thought')
        print(f"{path}: {len(script['commands'])} commands, {lines} lines "
              f"({thoughts} inner voice), {choices} choices")
        count += 1
    print(f'{count} final-quality slice scripts')

main()
