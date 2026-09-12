/**
 * People in the world who will talk to you.
 *
 * The villages were full of `villager` props: a pale instanced figure, good enough as a
 * distant crowd and completely inert up close. You could walk the length of Qing Mao
 * Mountain, past forty people, and not one of them would acknowledge that you existed
 * — in a story whose whole subject is what a clan does to someone it has written off.
 *
 * These are not extras. Every one of them is a character the canon bible already names,
 * standing where the story puts them, and what they say moves with the beats you have
 * finished. The uncle's line about the inheritance is one thing before the awakening
 * river and another after it; the keeper stops asking where your stones come from;
 * Jia Jin Sheng is in the village until the night on the bamboo path, and then he is
 * not, because the world is allowed to notice.
 *
 * `needs` is a beat that must be complete for a line to be offered; `until` withdraws
 * one once a later beat lands. The most recent eligible line is what they open with,
 * and pressing again works back through the rest, so a person is worth returning to.
 */

export interface FolkLine {
  text: string;
  /** Offered only once this beat is complete. */
  needs?: string;
  /** Withdrawn once this beat is complete. */
  until?: string;
}

export interface Folk {
  /** Canon character id. Extras do not get to talk; named people do. */
  id: string;
  x: number;
  z: number;
  /** Radians. Which way they stand when nobody is talking to them. */
  facing?: number;
  /** They are not in the world at all once this beat is complete. */
  until?: string;
  lines: FolkLine[];
}

const HOUSEHOLD: Folk[] = [
  {
    id: 'fang-qiu',
    x: -5,
    z: -4,
    facing: Math.PI,
    lines: [
      { text: 'There is work on the terraces if you want stones of your own. You will not want it.' },
      { text: 'Your father’s things are where they are safe. A boy with no aperture has no use for a key.', until: 'act1.awakening.ceremony' },
      { text: 'Forty-four percent. Not a disgrace. Not a reason to hand anything over either.', needs: 'act1.awakening.ceremony' },
      { text: 'You feed that Gu out of your own sea, not my stores. Remember whose roof this is.', needs: 'act1.academy.first-gu' },
      { text: 'Middle stage at your aptitude. You have been going without something to pay for it.', needs: 'act1.breakthrough.middle-stage' }
    ]
  },
  {
    id: 'fang-qiu-wife',
    x: 4,
    z: -3,
    facing: Math.PI * 1.2,
    lines: [
      { text: 'Do not track mud past the loom. I have said it once already this week.' },
      { text: 'Three mouths and one purse of stones. You will understand when you are grown.', until: 'act1.awakening.ceremony' },
      { text: 'Your brother came out of that river at A grade. Say nothing about yours at the table.', needs: 'act1.awakening.ceremony' },
      { text: 'Where are you getting stones from? No — do not tell me. I would rather not know.', needs: 'act1.extortion.toll' }
    ]
  },
  {
    id: 'fang-zheng',
    x: 0,
    z: 6,
    lines: [
      { text: 'The elders set us verses to copy. Mine are done. Yours are on the table, still blank.' },
      { text: 'Elder Feng says the river shows everyone the same thing. I hope that is true.', until: 'act1.awakening.ceremony' },
      { text: 'Forty-four is still a Gu Master, brother. I will ask the elder what it opens.', needs: 'act1.awakening.ceremony' },
      { text: 'You practise later than I do. I can see your lamp from the yard.', needs: 'act1.academy.moonblade' },
      { text: 'People in the yard have stopped using your name. They just say him.', needs: 'act1.extortion.servant' }
    ]
  }
];

const VILLAGE: Folk[] = [
  {
    id: 'wang-da',
    x: -40,
    z: -6,
    facing: Math.PI / 2,
    lines: [
      { text: 'Bring me a boar hide in good condition and I will pay better than the market will.' },
      { text: 'Do not go past the third ridge on your own. I have seen what drags things off up there.' },
      { text: 'Every spring a few of you come out of that river thinking the mountain owes you something.', needs: 'act1.awakening.ceremony' },
      { text: 'My beast-skin map is gone. Worth a winter, that was. If you see it, you have not seen it.', needs: 'act1.liquor-worm.cave' }
    ]
  },
  {
    id: 'jiang-ya',
    x: 0,
    z: 6,
    facing: 0,
    lines: [
      { text: 'Half the clan walks past this stall and buys nothing. You at least stop and look.' },
      { text: 'Vitality leaves, two stones each, cut this morning whatever your aunt tells you.' },
      { text: 'You will want leaves by the week now. A Gu eats whether you use it or not.', needs: 'act1.academy.first-gu' },
      { text: 'You buy in fives lately. I do not ask where it comes from. I do ask that you keep coming.', needs: 'act1.caravan.gambling' }
    ]
  },
  {
    id: 'jia-jin-sheng',
    x: -16,
    z: 12,
    facing: Math.PI * 1.6,
    // He follows Fang Yuan onto the mountain and does not come back down. After that
    // night the village is short one person, and standing where he stood would be a lie.
    until: 'act1.jia-jin-sheng.night',
    lines: [
      { text: 'Nobody in my family holds anything either. We are all the other kind of Gu Yue.' },
      { text: 'You are the Fang boy. The quiet one. Nobody can ever say what you are thinking.' },
      { text: 'If you are going up the mountain for that worm, take someone with you. Take me.', needs: 'act1.liquor-worm.search' },
      { text: 'You went up alone and came back fine. So there is a way up that you are not saying.', needs: 'act1.liquor-worm.cave' }
    ]
  }
];

const TAVERN: Folk[] = [
  {
    id: 'tavern-keeper',
    x: -7,
    z: -4,
    facing: Math.PI / 2,
    lines: [
      { text: 'Sit where you like, so long as it is not the table by the window. That one is kept.' },
      { text: 'Green Bamboo Wine, four stones the jar. I keep no tab for anyone your age.' },
      { text: 'A Liquor worm is not wine, lad. One costs what this whole cellar is worth.', needs: 'act1.liquor-worm.search' },
      { text: 'You came off that mountain carrying something. I did not ask then. I am not asking now.', needs: 'act1.liquor-worm.cave' }
    ]
  },
  {
    id: 'jiang-he',
    x: 6,
    z: -2,
    facing: Math.PI * 1.3,
    lines: [
      { text: 'Talk in here travels. Whatever you are thinking about saying, think about it outside.' },
      { text: 'I let rooms. Quietly. You are too young to need one of mine.' },
      { text: 'You cultivate at the hostel? The walls there are paper. Mine are not, and I ask nothing.', needs: 'act1.cultivation.first-weeks' },
      { text: 'You have stones now, and I have a door nobody watches. That is the whole arrangement.', needs: 'act1.caravan.gambling' }
    ]
  }
];

const ACADEMY: Folk[] = [
  {
    id: 'mo-yan',
    x: -8,
    z: 24,
    facing: Math.PI,
    lines: [
      { text: 'You have the same robe all season. I suppose one is enough if you never go anywhere.' },
      { text: 'My father gives to the academy every year. Elders remember who gives.' },
      { text: 'I paid you. So why are you still standing where I have to look at you?', needs: 'act1.extortion.toll' },
      { text: 'It is settled and it is finished. Do not speak to me in the yard again.', needs: 'act1.extortion.negotiation' }
    ]
  },
  {
    id: 'academy-elder-mo',
    x: 6,
    z: 26,
    facing: Math.PI * 0.9,
    lines: [
      { text: 'You have a habit of standing at the back and missing nothing. I have noticed it.' },
      { text: 'You learn it in the hall. You find out in the yard whether you learned it.' },
      { text: 'Someone has been counting stones that are not his. I am told the name may be yours.', needs: 'act1.extortion.elder-counters' },
      { text: 'Nothing was proved. I want you to understand that is not the same as nothing happened.', needs: 'act1.extortion.negotiation' }
    ]
  }
];

const GU_ROOM: Folk[] = [
  {
    id: 'elder-gu-room',
    x: 0,
    z: -4.6,
    facing: 0,
    lines: [
      { text: 'The trays are fed at dawn and at dusk. Touch nothing on them in between.' },
      { text: 'Hands where I can see them. One Gu leaves this room with you, and only one.', until: 'act1.academy.first-gu' },
      { text: 'Feed it on its schedule. A sluggish Gu in a fight is how young Gu Masters die.', needs: 'act1.academy.first-gu' },
      { text: 'Middle stage at forty-four percent. Either you are working, or you are doing something I would rather not find.', needs: 'act1.breakthrough.middle-stage' }
    ]
  }
];

const TRAINING_YARD: Folk[] = [
  {
    id: 'man-shi',
    x: -6,
    z: 4,
    facing: Math.PI * 1.15,
    lines: [
      { text: 'My arms are bigger than your head. People find that easier to remember than names.' },
      { text: 'You are standing where I throw. Move, or do not, it is the same to me.' },
      { text: 'I saw what your moonblade did to the post. Do that at me and I will sit on you.', needs: 'act1.academy.moonblade' },
      { text: 'They say things about you now. I tell them you are only quiet. They keep saying them.', needs: 'act1.extortion.servant' }
    ]
  }
];

export const FOLK: ReadonlyMap<string, readonly Folk[]> = new Map([
  ['mountain.uncle-house', HOUSEHOLD],
  ['mountain.village', VILLAGE],
  ['mountain.tavern', TAVERN],
  ['mountain.academy', ACADEMY],
  ['mountain.gu-room', GU_ROOM],
  ['mountain.training-yard', TRAINING_YARD]
]);
