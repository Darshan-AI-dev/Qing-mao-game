/**
 * Gathering.
 *
 * Upkeep was the one system the player never actually participated in: the Moonlight
 * Gu eats moon orchid petals every six days, the bill was paid silently out of stones,
 * and walking across an area with orchids growing in it did nothing. The canon item
 * list even says of the petals, "gathered near the awakening river, or bought" — the
 * gathering half was never built.
 *
 * So the scenery is the resource. Nodes are derived from the props an area already
 * places, which means anywhere with orchids in it is somewhere you can feed a Gu, and
 * an area laid out for how it looks turns out to be laid out for what it gives you.
 * Harvested nodes regrow on the calendar, so a route becomes worth walking again.
 */
import { bus } from '../core/bus';
import { itemsById } from '../../canon/index';
import type { AreaDescription, PropKind } from '../render/world';
import type { SaveGameV5 } from '../save/schema';
import type { Economy } from './economy';

/**
 * Which props are worth stopping for, and what they give.
 *
 * Three things, all of which someone would actually want: the petals the Moonlight Gu
 * eats, the leaves that are the only healing in the game, and the decayed soil the
 * winter mission is about. Reeds were in here for a while yielding spring water, which
 * is worth zero stones and feeds nothing — a gathering action whose reward is nothing
 * teaches the player that gathering is not worth doing.
 */
const HARVEST: Partial<Record<PropKind, { item: string; regrowDays: number; yield: number }>> = {
  orchid: { item: 'moon-orchid-petal', regrowDays: 6, yield: 2 },
  terrace: { item: 'vitality-leaf', regrowDays: 12, yield: 1 },
  snowdrift: { item: 'decayed-soil', regrowDays: 9, yield: 1 }
};

/**
 * At most this many in one area, spread across its placements.
 *
 * Deriving a node from every harvestable prop gave the leaf terraces a hundred and
 * twenty-six and the river a hundred and ten, which is not scarcity, it is a field of
 * free money. A dozen is enough to make a route worth walking and few enough that the
 * regrow interval means something.
 */
const MAX_NODES = 12;

/** How close you have to be. About two paces: close enough to have to mean it. */
export const GATHER_RANGE = 2.6;

export interface ForageNode {
  /** Stable within an area, so a harvest survives a save and a reload. */
  index: number;
  x: number;
  z: number;
  item: string;
  regrowDays: number;
  yield: number;
}

/**
 * Every node in an area, in a stable order.
 *
 * Derived rather than authored, and derived from the placement list in the order the
 * content declares it, so the index of a node does not move when an unrelated prop is
 * added somewhere else in the array.
 */
export function nodesFor(area: AreaDescription): ForageNode[] {
  // Built rooms are furnished, not planted: the orchids around the Bai clan's dais and
  // the trays in the Gu room are decoration, and letting the player strip them was a
  // way to farm a foreign clan's audience hall. Content overrides the default, because
  // the underground awakening river is enclosed and is where the petals come from.
  if (!(area.gathering ?? !area.enclosed)) return [];

  const candidates: ForageNode[] = [];
  let index = 0;
  for (const group of area.props) {
    const harvest = HARVEST[group.kind];
    if (!harvest) continue;
    for (const place of group.places) {
      candidates.push({ index: index++, x: place.x, z: place.z, ...harvest });
    }
  }
  if (candidates.length <= MAX_NODES) return candidates;

  // An even stride, so the survivors are spread over the area rather than clustered in
  // whichever corner the content happened to declare first. The index is kept from the
  // full list so a save's harvest record survives a change to MAX_NODES.
  const stride = candidates.length / MAX_NODES;
  const picked: ForageNode[] = [];
  for (let i = 0; i < MAX_NODES; i++) picked.push(candidates[Math.floor(i * stride)]!);
  return picked;
}

export class Forage {
  constructor(private save: SaveGameV5, private economy: Economy) {}

  private harvestedIn(areaId: string): Record<string, number> {
    this.save.forage ??= {};
    this.save.forage[areaId] ??= {};
    return this.save.forage[areaId]!;
  }

  /** Has this node grown back? */
  ready(areaId: string, node: ForageNode, day: number): boolean {
    const taken = this.harvestedIn(areaId)[String(node.index)];
    return taken === undefined || day - taken >= node.regrowDays;
  }

  /** Everything ready to pick in this area right now. */
  available(areaId: string, area: AreaDescription, day: number): ForageNode[] {
    return nodesFor(area).filter((node) => this.ready(areaId, node, day));
  }

  /** The closest thing worth stopping for, or null. */
  nearest(
    areaId: string,
    area: AreaDescription,
    day: number,
    at: { x: number; z: number }
  ): { node: ForageNode; distance: number } | null {
    let best: { node: ForageNode; distance: number } | null = null;
    for (const node of this.available(areaId, area, day)) {
      const distance = Math.hypot(node.x - at.x, node.z - at.z);
      if (!best || distance < best.distance) best = { node, distance };
    }
    return best;
  }

  /** Picks it. Returns what was gathered, or null if it was not ready. */
  gather(areaId: string, node: ForageNode, day: number): { item: string; count: number } | null {
    if (!this.ready(areaId, node, day)) return null;
    this.harvestedIn(areaId)[String(node.index)] = day;
    this.economy.addItem(node.item, node.yield);
    const name = itemsById.get(node.item)?.name ?? node.item;
    bus.emit('forage.gather', { item: node.item, count: node.yield, area: areaId });
    bus.emit('toast', { text: `${name} ×${node.yield}` });
    return { item: node.item, count: node.yield };
  }
}
