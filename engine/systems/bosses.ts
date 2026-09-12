/**
 * Fight data: what the player can do, and what the bosses do back.
 *
 * Separate from combat.ts because this is content, not behaviour — the numbers and the
 * fiction of each phase, with no engine state. Keeping it apart means the unit tests
 * and the content lint can read it without dragging the whole combat class in, which
 * they could not: Node's type stripping refuses constructor parameter properties.
 */
export type TelegraphShape = 'cone' | 'ring' | 'line' | 'slam' | 'arc';
export type TelegraphPattern = 'solid' | 'dashed' | 'dotted' | 'chevron' | 'hatched';

export interface Ability {
  id: string;
  label: string;
  key: string;
  gu: string;
  essence: number;
  /** Unlocked only when this flag is set; the HUD hides the rest. */
  requiresFlag: string;
  kind: 'ranged' | 'melee' | 'guard' | 'dodge' | 'move' | 'utility' | 'heal';
  range: number;
  damage: number;
  seconds?: number;
}

export const ABILITIES: readonly Ability[] = [
  /*
   * The prologue's arsenal.
   *
   * Chapter 1 is five hundred years of cultivation in a room with one exit, and the
   * design asks for it to be played at full power so that waking up at Rank one has
   * something to be a drop from. These are the only abilities gated on the prologue's
   * own flag: the next beat does not have it, so the whole action bar empties between
   * chapter 2 and chapter 3. The drop is not narrated, it is the HUD going quiet.
   */
  { id: 'ruined-blade', label: 'Ruined Blade', key: 'attack', gu: 'body', essence: 20, requiresFlag: 'rank.8.prologue', kind: 'ranged', range: 22, damage: 26 },
  { id: 'sovereign-guard', label: 'Ward', key: 'guard', gu: 'body', essence: 15, requiresFlag: 'rank.8.prologue', kind: 'guard', range: 0, damage: 0, seconds: 4 },
  { id: 'moonblade', label: 'Moonblade', key: 'attack', gu: 'moonlight-gu', essence: 4, requiresFlag: 'skill.moonblade', kind: 'ranged', range: 18, damage: 9 },
  { id: 'strike', label: 'Strike', key: 'strike', gu: 'body', essence: 0, requiresFlag: 'rank.1.initial', kind: 'melee', range: 3, damage: 5 },
  { id: 'dodge', label: 'Dodge', key: 'dodge', gu: 'body', essence: 1, requiresFlag: 'rank.1.initial', kind: 'dodge', range: 0, damage: 0, seconds: 0.4 },
  { id: 'guard-jade-skin', label: 'Guard', key: 'guard', gu: 'jade-skin-gu', essence: 3, requiresFlag: 'gu.jade-skin', kind: 'guard', range: 0, damage: 0, seconds: 3 },
  { id: 'guard-white-jade', label: 'Guard', key: 'guard', gu: 'white-jade-gu', essence: 5, requiresFlag: 'gu.white-jade', kind: 'guard', range: 0, damage: 0, seconds: 6 },
  { id: 'guard-sky-canopy', label: 'Canopy', key: 'guard', gu: 'sky-canopy-gu', essence: 9, requiresFlag: 'gu.sky-canopy', kind: 'guard', range: 0, damage: 0, seconds: 7 },
  { id: 'moonglow', label: 'Moonglow', key: 'attack', gu: 'moonglow-gu', essence: 8, requiresFlag: 'gu.moonglow', kind: 'ranged', range: 24, damage: 19 },
  { id: 'blood-moon', label: 'Blood Moon', key: 'attack', gu: 'blood-moon-gu', essence: 14, requiresFlag: 'gu.blood-moon', kind: 'ranged', range: 26, damage: 24 },
  { id: 'centipede', label: 'Centipede', key: 'strike', gu: 'chainsaw-golden-centipede', essence: 11, requiresFlag: 'gu.centipede', kind: 'melee', range: 4, damage: 28 },
  { id: 'wings', label: 'Wings', key: 'wings', gu: 'thunderwings-gu', essence: 7, requiresFlag: 'gu.thunderwings', kind: 'move', range: 14, damage: 0 },
  { id: 'conceal', label: 'Conceal', key: 'conceal', gu: 'stealth-scales-gu', essence: 5, requiresFlag: 'gu.stealth-scales', kind: 'utility', range: 0, damage: 0, seconds: 20 },
  { id: 'listen', label: 'Listen', key: 'listen', gu: 'earth-ear-grass', essence: 3, requiresFlag: 'gu.earth-ear', kind: 'utility', range: 40, damage: 0, seconds: 6 },
  { id: 'leaf', label: 'Leaf', key: 'heal', gu: 'nine-leaf-vitality-grass', essence: 0, requiresFlag: 'gu.nine-leaf', kind: 'heal', range: 0, damage: 0 }
];

export interface BossPhase {
  /** The defence the player has to read, not a damage threshold. */
  defence: string;
  /** What tells the player it is up. */
  telegraph: { shape: TelegraphShape; pattern: TelegraphPattern; seconds: number };
  /** What actually gets through it. */
  answer: string;
  vitality: number;
}

export interface BossDefinition {
  id: string;
  name: string;
  beat: string;
  phases: BossPhase[];
}

export const BOSSES: readonly BossDefinition[] = [
  {
    // The prologue, and the tutorial. Eight of them have the doorway surrounded and
    // none of them has gone through it, which is the whole read: they take turns, and
    // each turn leaves a gap. Two phases, the two simplest rules in the game.
    id: 'prologue-eight', name: 'The eight at the doorway', beat: 'prologue.last-stand',
    phases: [
      { defence: 'They come one at a time and none of them commits.', telegraph: { shape: 'line', pattern: 'solid', seconds: 1.6 }, answer: 'Strike the one that has just swung.', vitality: 110 },
      { defence: 'The last two close together and hold the doorway.', telegraph: { shape: 'arc', pattern: 'chevron', seconds: 1.3 }, answer: 'Get inside the doorway with them.', vitality: 150 }
    ]
  },
  {
    id: 'fang-zheng', name: 'Fang Zheng', beat: 'act2.duel.fang-zheng',
    phases: [
      { defence: 'An outer ward he reapplies on a count of four.', telegraph: { shape: 'ring', pattern: 'solid', seconds: 1.1 }, answer: 'Strike inside the count, not through the ward.', vitality: 60 },
      { defence: 'A second layer he only raises when pressed at range.', telegraph: { shape: 'arc', pattern: 'dashed', seconds: 0.9 }, answer: 'Close the distance and he cannot raise it.', vitality: 70 },
      { defence: 'A retreat into the same corner of the arena, every time.', telegraph: { shape: 'line', pattern: 'chevron', seconds: 0.7 }, answer: 'Be in the corner first.', vitality: 50 }
    ]
  },
  {
    id: 'monkey-king', name: 'Jade-eye stone monkey king', beat: 'act2.inheritance.stone-forest',
    phases: [
      { defence: 'Concealment against the pillars; it only breaks to strike.', telegraph: { shape: 'cone', pattern: 'dotted', seconds: 0.8 }, answer: 'Watch the pillar, not the floor. Light helps.', vitality: 80 },
      { defence: 'It drops stone from above rather than closing.', telegraph: { shape: 'slam', pattern: 'hatched', seconds: 1.3 }, answer: 'Keep moving between pillars; guard is wasted here.', vitality: 90 }
    ]
  },
  {
    id: 'boar-king', name: 'Wild boar king', beat: 'act2.winter.boar-king',
    phases: [
      { defence: 'A charge it commits to completely.', telegraph: { shape: 'line', pattern: 'chevron', seconds: 1.2 }, answer: 'Sidestep late. Guarding a charge costs more than it saves.', vitality: 120 },
      { defence: 'It turns its flank to the wolves and not to you.', telegraph: { shape: 'arc', pattern: 'solid', seconds: 1.0 }, answer: 'Let the wolves work. Strike the flank they opened.', vitality: 100 }
    ]
  },
  {
    id: 'thunder-crown-wolf', name: 'Thunder Crown Wolf', beat: 'act3.wolf-tide.forest',
    phases: [
      { defence: 'The pack screens it; the small ones drive, it arrives after.', telegraph: { shape: 'ring', pattern: 'dashed', seconds: 0.9 }, answer: 'Conceal and let the screen pass. Fighting the screen is the trap.', vitality: 110 },
      { defence: 'A crown discharge that follows the wet ground.', telegraph: { shape: 'cone', pattern: 'hatched', seconds: 1.4 }, answer: 'Stand on stone. The telegraph shows the water, not the wolf.', vitality: 130 }
    ]
  },
  {
    id: 'bai-ning-bing', name: 'Bai Ning Bing', beat: 'act4.bai.transformation',
    phases: [
      { defence: 'Ice that answers whatever you opened with.', telegraph: { shape: 'ring', pattern: 'dotted', seconds: 1.0 }, answer: 'Change your opening. The ice mirrors the last thing it saw.', vitality: 140 }
    ]
  }
];
