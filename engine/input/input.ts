/**
 * Unified input: keyboard and mouse, touch, and gamepad.
 *
 * Every scheme resolves to the same small set of intents, so gameplay code never
 * asks which device it is talking to. Keys are fully remappable. The gamepad uses
 * the standard mapping, which is the natural input on Chromebooks and on a TV.
 *
 * Touch is a redesign rather than the desktop HUD shrunk: a left stick, drag
 * anywhere on the right to look, one large context button that becomes Interact,
 * Strike or Cultivate depending on what is in front of you, a radial wheel for Gu,
 * and tap-an-NPC-to-talk. Guard and run can each be hold or toggle.
 */
import type { SettingsState } from '../save/schema';

export type Intent =
  | 'forward' | 'back' | 'left' | 'right' | 'run'
  | 'interact' | 'attack' | 'strike' | 'guard' | 'dodge' | 'cultivate'
  | 'wings' | 'observe' | 'conceal' | 'listen' | 'heal' | 'recollect'
  | 'journal' | 'atlas' | 'pause';

export interface InputFrame {
  move: { x: number; z: number };
  look: { dx: number; dy: number };
  /** Held this frame. */
  held: ReadonlySet<Intent>;
  /** Pressed this frame only. */
  pressed: ReadonlySet<Intent>;
  /** Screen-space tap, for tap-to-talk and for manual aim. */
  tap: { x: number; y: number } | null;
  /** Set while the radial Gu wheel is open; the value is the chosen slot. */
  wheel: number | null;
  source: 'keyboard' | 'touch' | 'gamepad';
}

const ANALOG_DEADZONE = 0.18;

export class Input {
  private held = new Set<Intent>();
  private pressed = new Set<Intent>();
  private move = { x: 0, z: 0 };
  private look = { dx: 0, dy: 0 };
  private tap: { x: number; y: number } | null = null;
  private wheel: number | null = null;
  private source: InputFrame['source'] = 'keyboard';
  private toggles = new Set<Intent>();
  private pointerLooking = false;
  private lastPointer: { x: number; y: number } | null = null;
  private stickOrigin: { x: number; y: number } | null = null;
  private stickTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private detach: (() => void)[] = [];
  private capturing: ((code: string) => void) | null = null;

  constructor(private settings: SettingsState, private canvas: HTMLCanvasElement, private stick: HTMLElement) {
    this.attachKeyboard();
    this.attachPointer();
    this.attachTouch();
  }

  /** Options screen remapping: the next key pressed is bound to `intent`. */
  captureKey(intent: Intent): Promise<string> {
    return new Promise((resolve) => {
      this.capturing = (code) => {
        this.settings.keymap[intent] = code;
        this.capturing = null;
        resolve(code);
      };
    });
  }

  frame(): InputFrame {
    this.pollGamepad();
    const snapshot: InputFrame = {
      move: { ...this.move },
      look: { ...this.look },
      held: new Set([...this.held, ...this.toggles]),
      pressed: new Set(this.pressed),
      tap: this.tap,
      wheel: this.wheel,
      source: this.source
    };
    this.pressed.clear();
    this.look = { dx: 0, dy: 0 };
    this.tap = null;
    return snapshot;
  }

  dispose(): void {
    for (const off of this.detach) off();
    this.detach = [];
  }

  // ---------------------------------------------------------------- keyboard
  private intentFor(code: string): Intent | null {
    for (const [intent, bound] of Object.entries(this.settings.keymap)) {
      if (bound === code) return intent as Intent;
    }
    // Arrow keys always work alongside whatever WASD is bound to.
    if (code === 'ArrowUp') return 'forward';
    if (code === 'ArrowDown') return 'back';
    if (code === 'ArrowLeft') return 'left';
    if (code === 'ArrowRight') return 'right';
    return null;
  }

  private attachKeyboard(): void {
    const down = (event: KeyboardEvent) => {
      if (this.capturing) {
        event.preventDefault();
        this.capturing(event.code);
        return;
      }
      const intent = this.intentFor(event.code);
      if (!intent) return;
      if (event.repeat) return;
      event.preventDefault();
      this.source = 'keyboard';
      // Hold-or-toggle for guard and run, which matters for anyone who cannot hold a key.
      if ((intent === 'guard' && !this.settings.holdToGuard) || (intent === 'run' && !this.settings.holdToRun)) {
        if (this.toggles.has(intent)) this.toggles.delete(intent);
        else this.toggles.add(intent);
        this.pressed.add(intent);
        this.syncMove();
        return;
      }
      this.held.add(intent);
      this.pressed.add(intent);
      this.syncMove();
    };
    const up = (event: KeyboardEvent) => {
      const intent = this.intentFor(event.code);
      if (!intent) return;
      this.held.delete(intent);
      this.syncMove();
    };
    const blur = () => {
      this.held.clear();
      this.syncMove();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.detach.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    });
  }

  private syncMove(): void {
    if (this.source === 'keyboard') {
      this.move.z = (this.held.has('forward') ? -1 : 0) + (this.held.has('back') ? 1 : 0);
      this.move.x = (this.held.has('right') ? 1 : 0) + (this.held.has('left') ? -1 : 0);
      const length = Math.hypot(this.move.x, this.move.z);
      if (length > 1) {
        this.move.x /= length;
        this.move.z /= length;
      }
    }
  }

  // ---------------------------------------------------------------- mouse
  private attachPointer(): void {
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      this.pointerLooking = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
    };
    const moveHandler = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (!this.pointerLooking || !this.lastPointer) return;
      this.look.dx += event.clientX - this.lastPointer.x;
      this.look.dy += event.clientY - this.lastPointer.y;
      this.lastPointer = { x: event.clientX, y: event.clientY };
    };
    const up = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      // A click without a drag is a tap: used for manual aim and tap-to-talk.
      if (this.pointerLooking && this.lastPointer) this.tap = { x: event.clientX, y: event.clientY };
      this.pointerLooking = false;
      this.lastPointer = null;
    };
    this.canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', up);
    this.detach.push(() => {
      this.canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', up);
    });
  }

  // ---------------------------------------------------------------- touch
  private attachTouch(): void {
    const stickStart = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch) return;
      event.preventDefault();
      this.source = 'touch';
      this.stickTouchId = touch.identifier;
      const rect = this.stick.getBoundingClientRect();
      this.stickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const touchMove = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) {
        if (touch.identifier === this.stickTouchId && this.stickOrigin) {
          event.preventDefault();
          const radius = this.stick.getBoundingClientRect().width / 2 || 56;
          const dx = (touch.clientX - this.stickOrigin.x) / radius;
          const dy = (touch.clientY - this.stickOrigin.y) / radius;
          const length = Math.hypot(dx, dy);
          const scale = length > 1 ? 1 / length : 1;
          this.move.x = dx * scale;
          this.move.z = dy * scale;
          const knob = this.stick.firstElementChild as HTMLElement | null;
          if (knob) knob.style.transform = `translate(${this.move.x * radius * 0.6}px, ${this.move.z * radius * 0.6}px)`;
        } else if (touch.identifier === this.lookTouchId) {
          event.preventDefault();
          this.look.dx += touch.clientX - (this.lastPointer?.x ?? touch.clientX);
          this.look.dy += touch.clientY - (this.lastPointer?.y ?? touch.clientY);
          this.lastPointer = { x: touch.clientX, y: touch.clientY };
        }
      }
    };
    const touchEnd = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) {
        if (touch.identifier === this.stickTouchId) {
          this.stickTouchId = null;
          this.stickOrigin = null;
          this.move.x = 0;
          this.move.z = 0;
          const knob = this.stick.firstElementChild as HTMLElement | null;
          if (knob) knob.style.transform = '';
        } else if (touch.identifier === this.lookTouchId) {
          this.lookTouchId = null;
          this.lastPointer = null;
        }
      }
    };
    const canvasStart = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch || this.lookTouchId !== null) return;
      this.source = 'touch';
      this.lookTouchId = touch.identifier;
      this.lastPointer = { x: touch.clientX, y: touch.clientY };
      // Recorded as a tap too: a stationary tap on an NPC starts a conversation.
      this.tap = { x: touch.clientX, y: touch.clientY };
    };

    this.stick.addEventListener('touchstart', stickStart, { passive: false });
    this.canvas.addEventListener('touchstart', canvasStart, { passive: true });
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd);
    window.addEventListener('touchcancel', touchEnd);
    this.detach.push(() => {
      this.stick.removeEventListener('touchstart', stickStart);
      this.canvas.removeEventListener('touchstart', canvasStart);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchEnd);
    });
  }

  /** Called by the on-screen buttons and by the radial wheel. */
  press(intent: Intent): void {
    this.source = 'touch';
    this.pressed.add(intent);
    if ((intent === 'guard' && !this.settings.holdToGuard) || (intent === 'run' && !this.settings.holdToRun)) {
      if (this.toggles.has(intent)) this.toggles.delete(intent);
      else this.toggles.add(intent);
    }
  }

  holdStart(intent: Intent): void {
    this.source = 'touch';
    this.held.add(intent);
  }

  holdEnd(intent: Intent): void {
    this.held.delete(intent);
  }

  setWheel(slot: number | null): void {
    this.wheel = slot;
  }

  // ---------------------------------------------------------------- gamepad
  private attachedPad = -1;

  private pollGamepad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((p): p is Gamepad => !!p?.connected && p.mapping === 'standard') ?? pads.find((p): p is Gamepad => !!p?.connected);
    if (!pad) {
      this.attachedPad = -1;
      return;
    }
    this.attachedPad = pad.index;
    const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
    const dead = (v: number) => (Math.abs(v) < ANALOG_DEADZONE ? 0 : v);
    if (dead(lx) || dead(ly)) {
      this.source = 'gamepad';
      this.move.x = dead(lx);
      this.move.z = dead(ly);
    } else if (this.source === 'gamepad') {
      this.move.x = 0;
      this.move.z = 0;
    }
    if (dead(rx) || dead(ry)) {
      this.look.dx += dead(rx) * 14;
      this.look.dy += dead(ry) * 14;
    }

    // Standard mapping: A interact, X strike, B dodge, Y cultivate, RB attack,
    // LB guard, LT conceal, RT wings, start pause, select journal.
    const buttons: [number, Intent][] = [
      [0, 'interact'], [2, 'strike'], [1, 'dodge'], [3, 'cultivate'],
      [5, 'attack'], [4, 'guard'], [6, 'conceal'], [7, 'wings'],
      [9, 'pause'], [8, 'journal'], [12, 'recollect'], [13, 'heal'],
      [14, 'observe'], [15, 'listen']
    ];
    for (const [index, intent] of buttons) {
      const button = pad.buttons[index];
      if (!button) continue;
      const down = button.pressed || button.value > 0.5;
      const was = this.held.has(intent);
      if (down && !was) {
        this.source = 'gamepad';
        this.pressed.add(intent);
        this.held.add(intent);
      } else if (!down && was) {
        this.held.delete(intent);
      }
    }
  }

  get gamepadConnected(): boolean {
    return this.attachedPad >= 0;
  }
}
