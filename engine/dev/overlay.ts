/**
 * Developer mode: jump to any beat, inspect and set flags, play any scene on its
 * own, free camera, and a performance overlay against the active tier's budget.
 *
 * Enabled with `?dev=1` or by pressing the backtick key. It is never reachable in a
 * release build unless the query parameter is present, so it cannot be stumbled into.
 */
import type { BeatGraph } from '../core/beats';
import type { Renderer } from '../render/renderer';
import type { SaveGameV5 } from '../save/schema';
import { BUDGETS } from '../render/quality';
import { bus } from '../core/bus';
import { clear, el } from '../ui/dom';

export interface DevHost {
  save: SaveGameV5;
  graph: BeatGraph;
  renderer: Renderer;
  jumpTo(beatId: string): void;
  playScene(beatId: string): void;
  toggleFreeCamera(): boolean;
}

export class DevOverlay {
  private root: HTMLElement;
  private stats: HTMLElement;
  private open = false;

  constructor(private host: DevHost) {
    this.root = el('aside', { id: 'devOverlay', hidden: 'hidden' });
    this.stats = el('pre', { class: 'devStats' });
    this.root.append(el('h3', { text: 'Developer' }), this.stats);
    document.body.append(this.root);
    this.build();

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Backquote') this.toggle();
    });
    if (new URLSearchParams(location.search).get('dev') === '1') this.toggle(true);
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.root.hidden = !this.open;
  }

  private build(): void {
    const jump = el('select', { id: 'devBeat' });
    for (const beat of this.host.graph.beats) {
      jump.append(el('option', { value: beat.id, text: `${beat.chapters[0]}-${beat.chapters[1]} ${beat.id}` }));
    }
    const go = el('button', { type: 'button', text: 'Jump' });
    go.addEventListener('click', () => this.host.jumpTo((jump as HTMLSelectElement).value));
    const play = el('button', { type: 'button', text: 'Play scene only' });
    play.addEventListener('click', () => this.host.playScene((jump as HTMLSelectElement).value));
    const freeCam = el('button', { type: 'button', text: 'Free camera' });
    freeCam.addEventListener('click', () => {
      freeCam.classList.toggle('on', this.host.toggleFreeCamera());
    });

    const flagInput = el('input', { type: 'text', placeholder: 'flag.to.set' });
    const setFlag = el('button', { type: 'button', text: 'Set flag' });
    setFlag.addEventListener('click', () => {
      const value = (flagInput as HTMLInputElement).value.trim();
      if (!value) return;
      const state = (this.host.save.beatState['dev'] ??= {});
      state[value] = true;
      bus.emit('toast', { text: `dev flag ${value}` });
    });

    const flags = el('details', {}, el('summary', { text: 'Flags in play' }), el('div', { id: 'devFlags' }));
    flags.addEventListener('toggle', () => {
      const node = document.getElementById('devFlags');
      if (!node) return;
      clear(node);
      const complete = new Set(this.host.save.completed);
      for (const flag of [...this.host.graph.flagsFor(complete)].sort()) {
        node.append(el('code', { text: flag }), document.createTextNode(' '));
      }
    });

    this.root.append(jump, go, play, freeCam, flagInput, setFlag, flags);
  }

  update(): void {
    if (!this.open) return;
    const stats = this.host.renderer.stats();
    const budget = BUDGETS[stats.tier];
    const over = (value: number, limit: number) => (value > limit ? ' OVER' : '');
    this.stats.textContent =
      `tier        ${stats.tier} (target ${budget.targetFps} fps)\n` +
      `fps         ${stats.fps}\n` +
      `draw calls  ${stats.drawCalls} / ${budget.drawCalls}${over(stats.drawCalls, budget.drawCalls)}\n` +
      `triangles   ${stats.triangles.toLocaleString()} / ${budget.triangles.toLocaleString()}${over(stats.triangles, budget.triangles)}\n` +
      `chunks      ${stats.chunksVisible} / ${stats.chunksTotal} visible\n` +
      `scale       ${stats.renderScale.toFixed(2)}\n` +
      `day         ${this.host.save.calendar.day} (${this.host.save.calendar.weather})\n` +
      `stones      ${this.host.save.economy.stones}\n` +
      `beats       ${this.host.save.completed.length} / ${this.host.graph.beats.length}\n` +
      `evidence    ${this.host.save.exposure.evidence.length} open, ${this.host.save.exposure.cleaned.length} cleaned`;
  }
}
