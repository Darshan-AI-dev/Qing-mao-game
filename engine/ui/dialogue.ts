/**
 * Dialogue presentation.
 *
 * Typewriter with instant-complete and auto-advance, a scrollable backlog of recent
 * lines, portraits with gestures, and a separate visual channel for the inner voice.
 *
 * Most of the novel happens inside his head, so `thought` lines render in italics in
 * their own band and can sit on top of a spoken line — readers recognise the gap
 * between what he says and what he thinks immediately. Every inner-voice line is
 * original writing in his register.
 */
import { bus } from '../core/bus';
import { charactersById } from '../../canon/index';
import { byId, clear, el } from './dom';

const TYPE_MS_PER_CHAR = 14;
/** Auto-advance holds a finished line long enough to read it, not a flat delay. */
const AUTO_ADVANCE_BASE_MS = 700;
const AUTO_ADVANCE_MS_PER_CHAR = 22;
const AUTO_ADVANCE_MAX_MS = 4500;

function autoAdvanceDelay(text: string): number {
  return Math.min(AUTO_ADVANCE_MAX_MS, AUTO_ADVANCE_BASE_MS + text.length * AUTO_ADVANCE_MS_PER_CHAR);
}

export interface BacklogLine {
  speaker: string;
  text: string;
  kind: 'spoken' | 'thought' | 'narration';
}

export class Dialogue {
  private panel: HTMLElement;
  private speakerNode: HTMLElement;
  private textNode: HTMLElement;
  private thoughtNode: HTMLElement;
  private continueButton: HTMLButtonElement;
  private choicesNode: HTMLElement;
  private backlogNode: HTMLElement;
  private backlog: BacklogLine[] = [];
  private typing: { cancel: () => void; finish: () => void; armAutoAdvance: () => void; isComplete: () => boolean } | null = null;
  private instant = false;
  public autoAdvance = false;

  constructor() {
    this.panel = byId('dialoguePanel');
    this.speakerNode = byId('dialogueSpeaker');
    this.textNode = byId('dialogueText');
    this.thoughtNode = byId('dialogueThought');
    this.continueButton = byId<HTMLButtonElement>('dialogueContinue');
    this.choicesNode = byId('dialogueChoices');
    this.backlogNode = byId('dialogueBacklog');
  }

  /** Resolves when the player has read the line (or the typewriter auto-advances). */
  showLine(actorId: string, text: string, kind: 'spoken' | 'thought' | 'narration'): Promise<void> {
    const character = charactersById.get(actorId);
    this.backlog.push({ speaker: character?.name ?? actorId, text, kind });
    if (this.backlog.length > 40) this.backlog.shift();
    this.renderBacklog();

    this.panel.hidden = false;
    this.panel.dataset.kind = kind;

    if (kind === 'thought') {
      // A thought can sit on top of a spoken line rather than replacing it.
      this.thoughtNode.hidden = false;
      return this.type(this.thoughtNode, text);
    }
    this.thoughtNode.hidden = true;
    this.speakerNode.textContent = kind === 'narration' ? '' : character?.name ?? actorId;
    this.speakerNode.hidden = kind === 'narration';
    return this.type(this.textNode, text);
  }

  askChoice(id: string, prompt: string, options: { id: string; label: string }[]): Promise<string> {
    this.panel.hidden = false;
    this.speakerNode.hidden = true;
    this.thoughtNode.hidden = true;
    this.textNode.textContent = prompt;
    clear(this.choicesNode);
    this.choicesNode.hidden = false;
    this.continueButton.hidden = true;

    return new Promise((resolve) => {
      for (const option of options) {
        const button = el('button', { class: 'choice', type: 'button', text: option.label, 'data-choice': option.id });
        button.addEventListener('click', () => {
          this.choicesNode.hidden = true;
          this.continueButton.hidden = false;
          clear(this.choicesNode);
          this.backlog.push({ speaker: 'You', text: option.label, kind: 'spoken' });
          this.renderBacklog();
          resolve(option.id);
        });
        this.choicesNode.append(button);
      }
      (this.choicesNode.firstElementChild as HTMLElement | null)?.focus();
      void id;
    });
  }

  hide(): void {
    this.panel.hidden = true;
    this.typing?.cancel();
    this.typing = null;
  }

  /** Space, the context button or a tap completes the line, then advances. */
  advance(): void {
    this.typing?.finish();
  }

  /** Called when the auto-advance toggle changes, so a waiting line picks it up. */
  refreshAutoAdvance(): void {
    if (this.typing?.isComplete()) this.typing.armAutoAdvance();
  }

  /**
   * Resolves whatever line is on screen right now.
   *
   * Skip needs this: the timeline only checks its abort flag between commands, so
   * without a way to settle the pending line the whole scene stays stuck on the
   * typewriter until someone taps Continue.
   */
  cancelPending(): void {
    this.typing?.cancel();
    this.typing = null;
  }

  /** Renders every following line instantly. Set while a skip is in progress. */
  setInstant(instant: boolean): void {
    this.instant = instant;
  }

  private type(node: HTMLElement, text: string): Promise<void> {
    this.typing?.cancel();
    this.continueButton.hidden = false;
    node.textContent = '';

    if (this.instant) {
      node.textContent = text;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      // Driven by requestAnimationFrame against the clock, not setInterval.
      // A 14 ms interval is starved badly by the render loop — a 78-character line
      // measured at 16 seconds instead of one — and the result reads as a game that
      // has hung. Frame-synced and time-based, the pacing holds at any frame rate.
      let revealed = 0;
      let done = false;
      let raf = 0;
      let autoTimer = 0;
      const started = performance.now();

      const settle = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        window.clearTimeout(autoTimer);
        this.typing = null;
        this.panel.removeEventListener('click', onTap);
        resolve();
      };

      const armAutoAdvance = () => {
        window.clearTimeout(autoTimer);
        if (this.autoAdvance) autoTimer = window.setTimeout(settle, autoAdvanceDelay(text));
      };

      const complete = () => {
        revealed = text.length;
        node.textContent = text;
        cancelAnimationFrame(raf);
      };

      // First tap completes the line; a second advances. Auto-advance takes the
      // second tap for you, after a pause that scales with how much there is to read.
      const finish = () => {
        if (revealed < text.length) {
          complete();
          if (this.autoAdvance) armAutoAdvance();
          else settle();
          return;
        }
        settle();
      };

      // The whole panel is the tap target, not just the Continue button. On a phone,
      // tapping the text is the gesture people actually reach for.
      const onTap = (event: Event) => {
        const target = event.target as HTMLElement;
        if (target.closest('#dialogueChoices') || target.closest('.inlineCheck') || target.closest('#dialogueBacklog')) return;
        finish();
      };

      const step = (now: number) => {
        const shouldShow = Math.min(text.length, Math.floor((now - started) / TYPE_MS_PER_CHAR));
        if (shouldShow !== revealed) {
          revealed = shouldShow;
          node.textContent = text.slice(0, revealed);
        }
        if (revealed >= text.length) {
          armAutoAdvance();
          return;
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);

      this.panel.addEventListener('click', onTap);
      // Re-arm if the player flips auto-advance on while this line is already waiting.
      this.typing = { cancel: settle, finish, armAutoAdvance, isComplete: () => revealed >= text.length };
    });
  }

  private renderBacklog(): void {
    clear(this.backlogNode);
    for (const line of this.backlog.slice(-20)) {
      const row = el('p', { class: `backlogLine kind-${line.kind}` });
      if (line.kind !== 'narration') row.append(el('b', { text: `${line.speaker}: ` }));
      row.append(document.createTextNode(line.text));
      this.backlogNode.append(row);
    }
    this.backlogNode.scrollTop = this.backlogNode.scrollHeight;
  }

  get lines(): readonly BacklogLine[] {
    return this.backlog;
  }
}

/** Chapter title card, shown whenever a new chapter begins. */
export function showChapterTitle(chapter: number, title: string, act: string, reducedMotion: boolean): Promise<void> {
  const card = el('div', { class: 'chapterCard' + (reducedMotion ? ' noMotion' : '') },
    el('small', { text: act.toUpperCase().replace('ACT', 'ACT ') }),
    el('h2', { text: `Chapter ${chapter}` }),
    el('p', { text: title })
  );
  document.body.append(card);
  bus.emit('chapter.title', { chapter, act, title });
  return new Promise((resolve) => {
    window.setTimeout(() => {
      card.classList.add('out');
      window.setTimeout(() => {
        card.remove();
        resolve();
      }, reducedMotion ? 0 : 500);
    }, reducedMotion ? 900 : 2100);
  });
}
