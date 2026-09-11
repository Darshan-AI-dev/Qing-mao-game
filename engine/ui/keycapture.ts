/** Key rebinding: waits for one keypress and writes it into the keymap. */
import type { SettingsState } from '../save/schema';

export function input(intent: string, settings: SettingsState): Promise<string> {
  return new Promise((resolve) => {
    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      window.removeEventListener('keydown', handler, true);
      if (event.code === 'Escape') return resolve(settings.keymap[intent] ?? '');
      settings.keymap[intent] = event.code;
      resolve(event.code);
    };
    window.addEventListener('keydown', handler, true);
  });
}
