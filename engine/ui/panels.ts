/**
 * Journal, codex, Reader's Lens, settings, Atlas and the Legacy export.
 *
 * The Journal's Chapters view lists all two hundred chapters with their coverage
 * level and a replay link, which is the player-facing proof of the "every chapter has
 * a place" pillar. The content lint enforces 200 out of 200 on the data behind it.
 */
import { bus } from '../core/bus';
import {
  acts, charactersById, glossary, guById, itemsById, mustLand, sequelThreads
} from '../../canon/index';
import type { BeatGraph, Coverage } from '../core/beats';
import type { SaveGameV5 } from '../save/schema';
import type { Economy } from '../systems/economy';
import type { Upkeep } from '../systems/upkeep';
import { RECIPES, Refinement, type RefinementOutcome } from '../systems/refinement';
import { buildLegacy, storeLegacy } from '../save/legacy';
import { byId, clear, closeDialog, el, openDialog } from './dom';

const COVERAGE_LABEL: Record<Coverage, string> = {
  played: 'Played',
  staged: 'Staged',
  ledger: 'Ledger'
};

export interface PanelHost {
  save: SaveGameV5;
  graph: BeatGraph;
  economy: Economy;
  upkeep: Upkeep;
  refinement: Refinement;
  /** Runs a refinement and returns what happened, so the panel can say so. */
  attemptRefinement(recipeId: string): RefinementOutcome;
  replay(beatId: string): void;
  travel(areaId: string): void;
  unlockedAreas(): { id: string; name: string }[];
  applySettings(): void;
  settingsToDom(): void;
}

export class Panels {
  constructor(private host: PanelHost) {
    this.wire();
  }

  private wire(): void {
    byId('journalButton').addEventListener('click', () => this.openJournal('chapters'));
    byId('closeJournal').addEventListener('click', () => closeDialog(byId<HTMLDialogElement>('journal')));
    byId('atlasButton').addEventListener('click', () => this.openAtlas());
    byId('closeAtlas').addEventListener('click', () => closeDialog(byId<HTMLDialogElement>('atlas')));
    byId('optionsButton').addEventListener('click', () => this.openSettings());
    byId('closeOptions').addEventListener('click', () => {
      this.host.applySettings();
      closeDialog(byId<HTMLDialogElement>('options'));
    });
    for (const tab of Array.from(document.querySelectorAll<HTMLElement>('[data-journal-tab]'))) {
      tab.addEventListener('click', () => this.openJournal(tab.dataset.journalTab as JournalTab));
    }
    byId('reportErrata').addEventListener('click', () => this.openErrata());
  }

  // ------------------------------------------------------------------ journal
  openJournal(tab: JournalTab = 'chapters'): void {
    const dialog = byId<HTMLDialogElement>('journal');
    const body = byId('journalContent');
    clear(body);
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-journal-tab]'))) {
      node.classList.toggle('active', node.dataset.journalTab === tab);
    }
    switch (tab) {
      case 'chapters': body.append(this.chaptersView()); break;
      case 'gu': body.append(this.guView()); break;
      case 'ledger': body.append(this.ledgerView()); break;
      case 'codex': body.append(this.codexView()); break;
      case 'threads': body.append(this.threadsView()); break;
      case 'moments': body.append(this.momentsView()); break;
    }
    openDialog(dialog);
  }

  /**
   * The refinement bench.
   *
   * Every recipe he knows, whether its materials are in hand, what it costs in stones,
   * essence and days, and the odds. The system behind it had been complete since the
   * systems pass and had no caller anywhere: there was no way for a player to refine
   * anything, so gathered materials led nowhere and the one piece of item progression
   * in the game was script-only.
   *
   * Canonical recipes say plainly that they cannot be lost, because a player who has
   * just watched Moonglow fail at chapter 119 needs to know that is the chapter and
   * not their save.
   */
  openRefinery(): void {
    const dialog = byId<HTMLDialogElement>('refinery');
    const list = byId('refineryList');
    clear(list);
    byId('refineryNote').textContent =
      `${this.host.economy.stones} stones on hand. A refinement costs days as well as materials.`;

    for (const recipe of RECIPES) {
      const preview = this.host.refinement.preview(recipe.id);
      if (!preview) continue;

      const row = el('div', { class: 'refineRow' });
      const made = this.host.save.gu.some((g) => g.id === recipe.produces);
      row.append(el('strong', { text: guById.get(recipe.produces)?.name ?? recipe.produces }));

      const needs = recipe.from.map((id) => guById.get(id)?.name ?? id);
      const improves = recipe.improvedBy.map(
        (id) => `${itemsById.get(id)?.name ?? id}${(this.host.save.economy.items[id] ?? 0) > 0 ? '' : ' (none)'}`
      );
      row.append(el('small', {
        text: [
          needs.length ? `From ${needs.join(' + ')}` : 'From materials only',
          improves.length ? `Better with ${improves.join(', ')}` : '',
          `${preview.stones} stones · ${preview.essence} essence · ${Math.round(preview.chance * 100)}%`,
          preview.canFailOutright
            ? 'Can fail outright and consume its materials.'
            : 'Cannot be lost — a bad attempt costs days and stones.'
        ].filter(Boolean).join(' · ')
      }));

      const button = el('button', { type: 'button', class: 'refineGo', text: made ? 'Already refined' : 'Attempt' });
      if (made) button.setAttribute('disabled', 'true');
      else {
        button.addEventListener('click', () => {
          bus.emit('toast', { text: describeOutcome(this.host.attemptRefinement(recipe.id)) });
          this.openRefinery();
        });
      }
      row.append(button);
      list.append(row);
    }

    if (!list.childElementCount) {
      list.append(el('p', { class: 'guEmpty', text: 'Nothing you know how to make yet.' }));
    }
    openDialog(dialog);
  }

  /**
   * What he is carrying, and what is in reserve.
   *
   * A mortal Gu Master raises five or six at a time, so this is where the loadout
   * decision gets made. Every row states its diet and interval, because that is what
   * carrying it costs — the upkeep bill and this screen are the same decision seen
   * from two sides. The Spring Autumn Cicada cannot be put away: it is the reason
   * there is a story.
   */
  private guView(): HTMLElement {
    const upkeep = this.host.upkeep;
    const wrap = el('div', { class: 'guView' });
    const carried = upkeep.carried();
    const stored = upkeep.stored();
    wrap.append(
      el('p', { class: 'guCount', text: `Carrying ${carried.length} of ${upkeep.capacity()}. Upkeep runs about ${upkeep.dailyBurn()} stones a day.` })
    );

    const section = (title: string, rows: typeof carried, action: string | null): HTMLElement => {
      const box = el('section', { class: 'guSection' }, el('h3', { text: title }));
      if (!rows.length) {
        box.append(el('p', { class: 'guEmpty', text: 'Nothing here.' }));
        return box;
      }
      for (const state of rows) {
        const canon = guById.get(state.id);
        const row = el('div', { class: `guRow${state.sluggish ? ' sluggish' : ''}` });
        row.append(el('strong', { text: canon?.name ?? state.id }));
        const diet = canon?.feedDays
          ? `${canon.dietItem ? itemsById.get(canon.dietItem)?.name ?? canon.dietItem : 'primeval stones'} every ${canon.feedDays} days`
          : 'needs no feeding';
        row.append(el('small', { text: state.sluggish ? `${diet} · sluggish, feed it` : diet }));
        if (action && state.id !== 'spring-autumn-cicada') {
          const button = el('button', { type: 'button', class: 'guSwap', text: action });
          button.addEventListener('click', () => {
            const moved = action === 'Carry' ? upkeep.carry(state.id) : upkeep.store(state.id);
            if (!moved) {
              bus.emit('toast', { text: `No room — you can carry ${upkeep.capacity()}.` });
              return;
            }
            this.openJournal('gu');
          });
          row.append(button);
        }
        box.append(row);
      }
      return box;
    };

    wrap.append(section('Carried', carried, 'Put away'));
    wrap.append(section('In reserve', stored, 'Carry'));

    // A door to the bench that is always here. The context button at a forge offers it
    // too, but that button also carries "Begin" when a beat is waiting on the same
    // ground, and a door that is sometimes missing is one players stop looking for.
    const bench = el('button', { type: 'button', class: 'guSwap benchLink', text: 'Refinement bench' });
    bench.addEventListener('click', () => {
      closeDialog(byId<HTMLDialogElement>('journal'));
      this.openRefinery();
    });
    wrap.append(el('p', { class: 'guEmpty' }, bench));
    return wrap;
  }

  /** All 200 chapters, their coverage and a replay link for anything already reached. */
  private chaptersView(): HTMLElement {
    const complete = new Set(this.host.save.completed);
    const summary = this.host.graph.coverageSummary();
    const wrap = el('div', { class: 'chaptersView' });
    wrap.append(
      el('p', { class: 'coverageSummary', text:
        `${summary.played + summary.staged + summary.ledger} of 200 chapters covered · ` +
        `${summary.played} played, ${summary.staged} staged, ${summary.ledger} recorded in the ledger.` })
    );

    for (const act of acts) {
      const section = el('section', { class: 'actSection' });
      section.append(el('h3', { text: `Act ${act.number} · ${act.name}` }), el('p', { class: 'spine', text: act.spine }));
      const list = el('ol', { class: 'chapterList' });
      for (const record of this.host.graph.chapters) {
        if (record.chapter < act.chapters[0] || record.chapter > act.chapters[1]) continue;
        const beat = this.host.graph.get(record.beat);
        const reached = complete.has(record.beat);
        const row = el('li', { class: `chapterRow ${reached ? 'reached' : 'unreached'}` });
        row.append(el('span', { class: 'chapterNumber', text: String(record.chapter) }));
        row.append(el('span', { class: `coverageTag tag-${record.coverage}`, text: COVERAGE_LABEL[record.coverage] }));
        row.append(el('span', { class: 'chapterTitle', text: beat?.title ?? record.beat }));
        if (reached) {
          // His own entry, not a summary of the source text.
          row.append(el('p', { class: 'ledgerLine', text: record.ledger }));
          if (beat?.coverage !== 'ledger') {
            const replay = el('button', { type: 'button', class: 'replay', text: 'Revisit' });
            replay.addEventListener('click', () => this.host.replay(record.beat));
            row.append(replay);
          }
        } else {
          row.append(el('p', { class: 'ledgerLine withheld', text: 'Not yet written.' }));
        }
        if (this.host.save.reader.lens && beat?.designNote) {
          row.append(el('p', { class: 'lensNote', text: beat.designNote }));
        }
        list.append(row);
      }
      section.append(list);
      wrap.append(section);
    }
    return wrap;
  }

  /** The stone ledger: daily income and expense, the balance, and the upkeep burn. */
  private ledgerView(): HTMLElement {
    const wrap = el('div', { class: 'ledgerView' });
    wrap.append(
      el('p', { text: `Balance: ${this.host.save.economy.stones} primeval stones.` }),
      el('p', { class: 'fine', text: `Gu upkeep is costing about ${this.host.upkeep.dailyBurn()} stones a day at present.` })
    );
    const table = el('table', { class: 'ledgerTable' });
    table.append(el('thead', {}, el('tr', {},
      el('th', { text: 'Day' }), el('th', { text: 'In' }), el('th', { text: 'Out' }), el('th', { text: 'Balance' })
    )));
    const body = el('tbody');
    for (const row of this.host.economy.dailyTotals().slice(-40)) {
      body.append(el('tr', {},
        el('td', { text: String(row.day) }),
        el('td', { text: row.income ? `+${row.income}` : '—' }),
        el('td', { text: row.expense ? `-${row.expense}` : '—' }),
        el('td', { text: String(row.balance) })
      ));
    }
    table.append(body);
    wrap.append(table);

    const inventory = el('section', {});
    inventory.append(el('h3', { text: 'On hand' }));
    const list = el('ul', { class: 'plainList' });
    for (const [id, count] of Object.entries(this.host.save.economy.items)) {
      if (!count) continue;
      list.append(el('li', { text: `${itemsById.get(id)?.name ?? id} × ${count}` }));
    }
    if (!list.childElementCount) list.append(el('li', { class: 'fine', text: 'Nothing worth recording.' }));
    inventory.append(list);
    wrap.append(inventory);

    const gu = el('section', {});
    gu.append(el('h3', { text: 'Gu and their appetites' }));
    const guList = el('ul', { class: 'plainList' });
    for (const state of this.host.save.gu) {
      const canon = guById.get(state.id);
      if (!canon) continue;
      const diet = canon.diet ? `eats ${canon.diet} every ${canon.feedDays} days` : 'needs no feeding';
      guList.append(el('li', { text: `${canon.name} — ${diet}${state.sluggish ? ' · sluggish' : ''}` }));
    }
    gu.append(guList);
    wrap.append(gu);
    return wrap;
  }

  /** Codex for newcomers. Entries unlock as the story reaches them. */
  private codexView(): HTMLElement {
    const wrap = el('div', { class: 'codexView' });
    const chapter = this.currentChapter();
    wrap.append(el('p', { class: 'fine', text: 'Entries appear as the story reaches them. Nothing here spoils a later chapter.' }));

    const terms = el('section', {});
    terms.append(el('h3', { text: 'Terms' }));
    for (const term of glossary) {
      if (term.firstUse > chapter) continue;
      terms.append(el('dl', {}, el('dt', { text: term.use }), el('dd', { text: term.definition })));
    }
    wrap.append(terms);

    const people = el('section', {});
    people.append(el('h3', { text: 'People' }));
    for (const character of charactersById.values()) {
      if (character.firstChapter > chapter || character.id === 'narrator') continue;
      people.append(el('dl', {}, el('dt', { text: character.name }), el('dd', { text: character.role })));
    }
    wrap.append(people);

    const worms = el('section', {});
    worms.append(el('h3', { text: 'Gu' }));
    for (const state of this.host.save.gu) {
      const canon = guById.get(state.id);
      if (!canon) continue;
      worms.append(el('dl', {},
        el('dt', { text: `${canon.name} · Rank ${canon.rank}` }),
        el('dd', { text: canon.effects.join(' ') })
      ));
    }
    wrap.append(worms);
    return wrap;
  }

  /**
   * "Unfinished business": the threads game 2 picks up, in his voice. Shown after the
   * ending and never before, and it never shows anything past chapter 200.
   */
  private threadsView(): HTMLElement {
    const wrap = el('div', { class: 'threadsView' });
    if (!this.host.save.completed.includes('act4.escape.raft')) {
      wrap.append(el('p', { text: 'Nothing is finished yet.' }));
      return wrap;
    }
    wrap.append(el('h3', { text: 'Unfinished business' }));
    const voiced: Record<string, string> = {
      'fang-zheng.sky-crane': 'My brother went east, alive, in someone else\'s hands. Alive is the part that will cost somebody.',
      'bai.yang-leverage': 'Bai has the arm back and I have the Yang Gu. Neither of us has mentioned it since the glacier.',
      'no-healing-gu': 'No healing Gu. Every injury from here is a logistics problem with a deadline.',
      'weakened-cultivation': 'Rank one again, and this time I know exactly what I had and exactly what it cost to lose it.',
      'southern-border': 'The Southern Border. Chosen, not fled to. That distinction will matter later even if it does not matter now.'
    };
    const list = el('ul', { class: 'plainList' });
    for (const thread of sequelThreads) {
      list.append(el('li', {}, el('b', { text: thread.summary }), el('p', { class: 'ledgerLine', text: voiced[thread.id] ?? '' })));
    }
    wrap.append(list);

    const exportButton = el('button', { type: 'button', class: 'primary', text: 'Carry this life forward' });
    exportButton.addEventListener('click', () => this.exportLegacy());
    wrap.append(el('p', { class: 'fine', text: 'Exports a Legacy file and stores it for this site. The next game reads it at its start, and plays without it.' }), exportButton);
    return wrap;
  }

  private momentsView(): HTMLElement {
    const wrap = el('div', { class: 'momentsView' });
    const complete = new Set(this.host.save.completed);
    wrap.append(el('p', { class: 'fine', text: 'The fifteen scenes this adaptation is built around.' }));
    const list = el('ol', { class: 'plainList' });
    for (const moment of mustLand) {
      const beat = this.host.graph.get(moment.id);
      const reached = beat ? complete.has(beat.id) : false;
      const row = el('li', { class: reached ? 'reached' : 'unreached' });
      row.append(el('b', { text: `${moment.title} · ch ${moment.chapters[0]}–${moment.chapters[1]}` }));
      if (reached) {
        const replay = el('button', { type: 'button', class: 'replay', text: 'Revisit' });
        replay.addEventListener('click', () => this.host.replay(moment.id));
        row.append(replay);
      }
      if (this.host.save.reader.lens) row.append(el('p', { class: 'lensNote', text: moment.treatment }));
      list.append(row);
    }
    wrap.append(list);
    return wrap;
  }

  private async exportLegacy(): Promise<void> {
    const file = buildLegacy(this.host.save);
    const json = JSON.stringify(file, null, 2);
    await storeLegacy(file);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: 'qing-mao-legacy.json' });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    bus.emit('legacy.export', { bytes: json.length });
    bus.emit('toast', { text: 'Legacy saved for this site, and downloaded.' });
  }

  // ------------------------------------------------------------------- atlas
  openAtlas(): void {
    const dialog = byId<HTMLDialogElement>('atlas');
    const list = byId('realmChoices');
    clear(list);
    for (const area of this.host.unlockedAreas()) {
      const button = el('button', { type: 'button', class: 'realm', text: area.name });
      button.addEventListener('click', () => {
        this.host.travel(area.id);
        closeDialog(dialog);
      });
      list.append(button);
    }
    openDialog(dialog);
  }

  // ---------------------------------------------------------------- settings
  openSettings(): void {
    // The form is filled from the save, never the other way round, so opening the
    // dialog can never overwrite a setting with a control's default value.
    this.host.settingsToDom();
    this.renderKeymap();
    openDialog(byId<HTMLDialogElement>('options'));
  }

  private renderKeymap(): void {
    const node = byId('keymapList');
    clear(node);
    for (const [intent, code] of Object.entries(this.host.save.settings.keymap)) {
      const row = el('div', { class: 'keyRow' });
      row.append(el('span', { text: intent }));
      const button = el('button', { type: 'button', class: 'keyBind', text: code });
      button.addEventListener('click', async () => {
        button.textContent = 'press a key…';
        const { input } = await import('./keycapture');
        const code2 = await input(intent, this.host.save.settings);
        button.textContent = code2;
      });
      row.append(button);
      node.append(row);
    }
  }

  private openErrata(): void {
    const dialog = byId<HTMLDialogElement>('errata');
    byId('errataScene').textContent = this.host.save.current ?? '(no scene)';
    byId('errataChapter').textContent = String(this.currentChapter());
    openDialog(dialog);
    byId('errataSubmit').onclick = () => {
      const note = byId<HTMLTextAreaElement>('errataNote').value.trim();
      if (!note) return;
      const entry = { scene: this.host.save.current ?? 'unknown', chapter: this.currentChapter(), note };
      this.host.save.reader.errata.push(entry);
      bus.emit('errata.report', entry);
      byId<HTMLTextAreaElement>('errataNote').value = '';
      closeDialog(dialog);
      bus.emit('toast', { text: 'Noted, with the scene and chapter attached.' });
    };
  }

  currentChapter(): number {
    const complete = new Set(this.host.save.completed);
    let highest = 1;
    for (const id of complete) {
      const beat = this.host.graph.get(id);
      if (beat) highest = Math.max(highest, beat.chapters[1]);
    }
    return highest;
  }

  /** The "Previously…" card on load, written from his own ledger. */
  previouslyCard(): string[] {
    const complete = this.host.save.completed;
    const recent = complete
      .map((id) => this.host.graph.get(id))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .sort((a, b) => b.chapters[1] - a.chapters[1])
      .slice(0, 3)
      .reverse();
    return recent
      .map((beat) => this.host.graph.ledgerForChapter(beat.chapters[1]))
      .filter((line): line is string => !!line);
  }
}

export type JournalTab = 'chapters' | 'gu' | 'ledger' | 'codex' | 'threads' | 'moments';

/** One sentence for each way a refinement can land. */
function describeOutcome(outcome: RefinementOutcome): string {
  switch (outcome.kind) {
    case 'success':
      return `Refined. ${outcome.days} days and ${outcome.stones} stones.`;
    case 'delay':
      return `It did not take. ${outcome.days} days and ${outcome.stones} stones gone; the materials are still yours.`;
    case 'failure':
      return `Lost it. ${outcome.days} days, ${outcome.stones} stones and the materials.`;
    case 'blocked':
      return outcome.reason === 'materials'
        ? 'You do not have what it needs.'
        : outcome.reason === 'stones'
          ? 'Not enough stones.'
          : 'Not enough essence.';
  }
}
