/**
 * The HUD.
 *
 * Measured problem in the previous build: on a 390 px phone the HUD covered about
 * 70% of the screen, and stage 1 showed all eleven action buttons even though most
 * were locked.
 *
 * So: only unlocked, relevant abilities are rendered; the quest panel collapses to a
 * one-line strip on a phone; the minimap shrinks to a corner icon. Tap targets are
 * at least 44 px and safe-area insets are respected in CSS. The whole action row is
 * rebuilt whenever the ability set changes rather than being hidden with CSS, so a
 * locked ability is not in the accessibility tree either.
 */
import { bus } from '../core/bus';
import { guById } from '../../canon/index';
import type { Ability } from '../systems/combat';
import type { Input, Intent } from '../input/input';
import { byId, clear, el } from './dom';
import { telegraphSvg } from './feedback';

export interface HudModel {
  rankLabel: string;
  essence: number;
  essenceMax: number;
  essenceLabel: string;
  vitality: number;
  vitalityMax: number;
  stones: number;
  questTitle: string;
  questTask: string;
  chapterLabel: string;
  calendarLabel: string;
  distance: number | null;
  /** Context button label: Interact, Strike or Cultivate depending on what is near. */
  context: { intent: Intent; label: string } | null;
  sluggish: string[];
  recollectionAvailable: boolean;
}

export class Hud {
  private actionsNode: HTMLElement;
  private contextButton: HTMLButtonElement;
  private wheelNode: HTMLElement;
  private telegraphLayer: HTMLElement;
  private lastAbilityKey = '';
  private offs: (() => void)[] = [];

  constructor(private input: Input) {
    this.actionsNode = byId('actions');
    this.contextButton = byId<HTMLButtonElement>('contextButton');
    this.wheelNode = byId('guWheel');
    this.telegraphLayer = byId('telegraphLayer');

    this.offs.push(
      bus.on('enemy.telegraph', ({ shape, pattern, seconds }) => this.showTelegraph(shape, pattern, seconds)),
      bus.on('gu.refused', ({ reason }) => {
        byId('essenceBar').classList.add('refused');
        window.setTimeout(() => byId('essenceBar').classList.remove('refused'), 400);
        if (reason === 'sluggish') bus.emit('toast', { text: 'The Gu is sluggish. It has not been fed.' });
      })
    );

    this.contextButton.addEventListener('click', () => {
      const intent = this.contextButton.dataset.intent as Intent | undefined;
      if (intent) this.input.press(intent);
    });
    byId('guWheelButton').addEventListener('click', () => this.toggleWheel());
  }

  render(model: HudModel, abilities: readonly Ability[], costOf: (a: Ability) => number): void {
    byId('rank').textContent = model.rankLabel;
    byId('essenceText').textContent =
      model.essenceMax > 0 ? `${model.essence} / ${model.essenceMax} ${model.essenceLabel}` : 'Aperture dormant';
    byId('stones').textContent = `${model.stones} stones`;
    byId('essenceBar').style.width = model.essenceMax > 0 ? `${(model.essence / model.essenceMax) * 100}%` : '0%';
    byId('healthBar').style.width = `${(model.vitality / model.vitalityMax) * 100}%`;
    byId('questTitle').textContent = model.questTitle;
    byId('questText').textContent = model.questTask;
    byId('chapterLabel').textContent = model.chapterLabel;
    byId('calendarLabel').textContent = model.calendarLabel;
    byId('distance').textContent = model.distance === null ? '' : `${Math.round(model.distance)} paces to the objective`;

    const recollect = byId('recollectButton');
    recollect.hidden = !model.recollectionAvailable;

    const sluggish = byId('sluggishRow');
    clear(sluggish);
    sluggish.hidden = model.sluggish.length === 0;
    for (const id of model.sluggish) {
      sluggish.append(el('span', { class: 'sluggishTag', text: `${guById.get(id)?.name ?? id} · hungry` }));
    }

    if (model.context) {
      this.contextButton.hidden = false;
      this.contextButton.textContent = model.context.label;
      this.contextButton.dataset.intent = model.context.intent;
    } else {
      this.contextButton.hidden = true;
    }

    // Rebuild the action row only when the unlocked set actually changes.
    const key = abilities.map((a) => `${a.id}:${costOf(a)}`).join('|');
    if (key !== this.lastAbilityKey) {
      this.lastAbilityKey = key;
      this.renderActions(abilities, costOf);
    } else {
      for (const ability of abilities) {
        const button = this.actionsNode.querySelector<HTMLElement>(`[data-ability="${ability.id}"] .cost`);
        if (button) button.textContent = costOf(ability) > 0 ? String(costOf(ability)) : '';
      }
    }
  }

  private renderActions(abilities: readonly Ability[], costOf: (a: Ability) => number): void {
    clear(this.actionsNode);
    clear(this.wheelNode);
    for (const [index, ability] of abilities.entries()) {
      const cost = costOf(ability);
      const button = el('button', { type: 'button', class: `action kind-${ability.kind}`, 'data-ability': ability.id });
      button.append(el('span', { class: 'label', text: ability.label }));
      // Visible essence cost on every ability: the scarcity has to be legible.
      button.append(el('span', { class: 'cost', text: cost > 0 ? String(cost) : '' }));
      const bind = () => {
        if (ability.kind === 'guard') {
          button.addEventListener('pointerdown', () => this.input.holdStart('guard'));
          button.addEventListener('pointerup', () => this.input.holdEnd('guard'));
          button.addEventListener('pointerleave', () => this.input.holdEnd('guard'));
        }
        button.addEventListener('click', () => this.input.press(ability.key as Intent));
      };
      bind();
      this.actionsNode.append(button);

      // The same set also fills the radial wheel, which is the phone's Gu selector.
      const slot = el('button', { type: 'button', class: 'wheelSlot', text: ability.label, style: radialStyle(index, abilities.length) });
      slot.addEventListener('click', () => {
        this.input.press(ability.key as Intent);
        this.toggleWheel(false);
      });
      this.wheelNode.append(slot);
    }
  }

  private toggleWheel(force?: boolean): void {
    const open = force ?? this.wheelNode.hidden;
    this.wheelNode.hidden = !open;
    this.input.setWheel(open ? 0 : null);
  }

  private showTelegraph(shape: string, pattern: string, seconds: number): void {
    const svg = telegraphSvg(shape, pattern, seconds);
    this.telegraphLayer.append(svg);
    window.setTimeout(() => svg.remove(), seconds * 1000 + 200);
  }

  dispose(): void {
    for (const off of this.offs) off();
  }
}

function radialStyle(index: number, total: number): string {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  const radius = 88;
  return `transform: translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`;
}

/**
 * The toast used for every short, non-blocking message.
 *
 * Its vertical position is measured rather than guessed. The quest panel is a wide
 * card at desktop and tablet widths and a one-line strip on a phone, so any fixed
 * offset that clears it at one size lands on top of it at another — which is exactly
 * what happened at 768 and 1024 px.
 */
export function attachToasts(): void {
  const node = byId('toast');
  let timer = 0;

  const place = (): void => {
    // Everything above the toast, not only the quest panel. The region name is centred
    // in the header and at desktop width on WebKit it hangs three pixels lower than the
    // quest card beside it, which is enough to sit under the toast.
    let below = 0;
    for (const id of ['quest', 'regionName']) {
      const el = document.getElementById(id);
      if (!el || el.hidden || getComputedStyle(el).display === 'none') continue;
      const box = el.getBoundingClientRect();
      if (box.height > 0) below = Math.max(below, box.bottom);
    }
    node.style.top = `${Math.round(below + 8)}px`;
  };

  // Place it now, and again whenever anything above it changes size.
  //
  // `place()` used to run only when a message arrived, so until the first toast the
  // element sat at its CSS fallback of 9rem — which on WebKit at desktop width is three
  // pixels above the region name. Measuring on demand also missed the case that matters
  // in play: the quest panel reflowing while a toast is already on screen.
  place();
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(place);
    for (const id of ['quest', 'regionName']) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
  }

  bus.on('toast', ({ text }) => {
    node.textContent = text;
    // Measure after the text is in, since the quest panel may have reflowed too.
    place();
    node.classList.add('on');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => node.classList.remove('on'), 2600);
  });

  window.addEventListener('resize', () => {
    if (node.classList.contains('on')) place();
  });
}
