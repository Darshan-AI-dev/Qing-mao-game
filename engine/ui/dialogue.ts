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

const TYPE_MS_PER_CHAR = 18;
const AUTO_ADVANCE_MS = 1400;

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
  private typing: { cancel: () => void; finish: () => void } | null = null;
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

  /** Space, click or the context button completes the line, then advances. */
  advance(): void {
    this.typing?.finish();
  }

  private type(node: HTMLElement, text: string): Promise<void> {
    this.typing?.cancel();
    this.continueButton.hidden = false;
    node.textContent = '';
    return new Promise((resolve) => {
      let index = 0;
      let done = false;
      let timer = 0;
      let autoTimer = 0;

      const settle = () => {
        if (done) return;
        done = true;
        window.clearInterval(timer);
        window.clearTimeout(autoTimer);
        this.typing = null;
        this.continueButton.removeEventListener('click', finish);
        resolve();
      };
      const finish = () => {
        if (index < text.length) {
          // First press completes the line; the next one advances.
          index = text.length;
          node.textContent = text;
          window.clearInterval(timer);
          autoTimer = window.setTimeout(settle, this.autoAdvance ? AUTO_ADVANCE_MS : 0);
          if (!this.autoAdvance) settle();
          return;
        }
        settle();
      };

      timer = window.setInterval(() => {
        index += 1;
        node.textContent = text.slice(0, index);
        if (index >= text.length) {
          window.clearInterval(timer);
          if (this.autoAdvance) autoTimer = window.setTimeout(settle, AUTO_ADVANCE_MS);
        }
      }, TYPE_MS_PER_CHAR);

      this.continueButton.addEventListener('click', finish);
      this.typing = { cancel: settle, finish };
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
