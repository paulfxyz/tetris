// tetris — input.js
// ============================================================================
// Three input methods, one action stream.
//
//   Keyboard   → keydown/keyup, with DAS for left/right and auto-repeat for ↓
//   Virtual pad → DOM buttons with pointer-events (works for mouse + touch)
//   Touch      → drag = step move, tap = rotate, swipe down = hard drop
//
// All three feed into the same `onAction(name)` callback, where `name` is one
// of: 'left' 'right' 'soft' 'rotate' 'rotateCCW' 'hold' 'drop' 'pause'.
//
// The callback is responsible for routing actions into the engine — this
// module knows nothing about Tetris rules.
//
// CONCEPTS WORTH KNOWING
//
//   DAS (Delayed Auto-Shift): when you hold ←, the piece moves once, pauses
//     ~160 ms, then starts moving every 40 ms. Without it, holding ← either
//     moves one cell (key repeat off) or strafes erratically at OS key-repeat
//     speed. Every modern Tetris implements its own DAS for consistency.
//
//   Touch swipes vs. drags: a "tap" must NOT have moved (less than 12 px) and
//     must have been brief (<250 ms). A drag steps move every 22 px traveled.
//     A swipe down is a long vertical move (>90 px) completed quickly.
// ============================================================================

// Map browser keyCodes to our abstract action names.
// We use `e.code` (physical key) rather than `e.key` (character) so the game
// plays the same on AZERTY / QWERTZ / Dvorak.
const KEYMAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'soft',
  ArrowUp: 'rotate',
  KeyX: 'rotate',
  KeyZ: 'rotateCCW',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  Space: 'drop',
  KeyP: 'pause',
  Escape: 'pause',
};

// Returns true if the user is typing in a form field. Used to suppress game
// keybindings while the score-submit dialog is open — otherwise typing 'p',
// 'c', 'x', 'z' in the Name field would trigger pause/hold/rotate and the
// letter would be eaten by preventDefault().
function isEditableTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    // Allow game keys when focus is on non-text inputs (checkboxes, radios,
    // ranges) so the settings overlay doesn't break keyboard play.
    const type = (el.type || 'text').toLowerCase();
    const nonText = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color']);
    return !nonText.has(type);
  }
  return false;
}

export class Input {
  constructor({ boardEl, vpadEl, onAction }) {
    this.boardEl = boardEl;       // the canvas element — captures touch
    this.vpadEl = vpadEl;         // the virtual D-pad container — has .vbtn children
    this.onAction = onAction;     // (action: string) => void

    this.held = new Set();        // currently-held keyCodes (de-dup keydowns)
    this.dasTimer = null;         // setTimeout handle for DAS arming
    this.dasDir = null;           // 'left' | 'right' | null

    this.bindKeyboard();
    this.bindVPad();
    this.bindTouch();
  }

  emit(action) {
    if (action) this.onAction(action);
  }

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------
  // We listen on window so the player doesn't need to click the canvas first.
  // preventDefault stops the page from scrolling when arrows / space are
  // pressed. `held` deduplicates the OS-level auto-repeat: pressing and
  // holding ← in most OSes fires keydown every ~30 ms; we want to ignore
  // those and run our own DAS timer instead.
  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // BUGFIX: when the user is typing in a text field (e.g. the score-submit
      // form's Name / Tagline / Email inputs), we must NOT intercept their
      // keystrokes. Otherwise letters mapped to game actions — 'p' (pause),
      // 'c' (hold), arrow keys, etc. — get swallowed by preventDefault() and
      // never reach the input. Bail out if the focused element is editable.
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;

      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (this.held.has(e.code)) {
        // OS auto-repeat: ignore for actions that we DAS-repeat manually.
        if (a === 'left' || a === 'right' || a === 'soft') return;
      }
      this.held.add(e.code);
      this.emit(a);
      if (a === 'left' || a === 'right') this.startDAS(a);
      if (a === 'soft') this.startRepeat('soft');
    });

    window.addEventListener('keyup', (e) => {
      // Mirror the keydown guard: don't track keys pressed inside form fields.
      if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return;
      this.held.delete(e.code);
      const a = KEYMAP[e.code];
      if (a === 'left' || a === 'right') this.stopDAS();
      if (a === 'soft') this.stopRepeat();
    });

    // If the player tabs away, stop everything — otherwise the piece keeps
    // moving when they come back (held key state went stale).
    window.addEventListener('blur', () => {
      this.held.clear();
      this.stopDAS();
      this.stopRepeat();
    });
  }

  // DAS — wait 160 ms (the "charge" period), then auto-repeat every 40 ms.
  // The first move was already emitted on keydown.
  startDAS(dir) {
    this.stopDAS();
    this.dasDir = dir;
    this.dasTimer = setTimeout(() => {
      this.dasInterval = setInterval(() => this.emit(dir), 40);
    }, 160);
  }
  stopDAS() {
    clearTimeout(this.dasTimer);
    clearInterval(this.dasInterval);
    this.dasTimer = this.dasInterval = null;
    this.dasDir = null;
  }
  // Auto-repeat for soft drop has no charge period — the player wants the
  // piece to fall continuously the moment they hold ↓.
  startRepeat(action) {
    this.stopRepeat();
    this.repeatInterval = setInterval(() => this.emit(action), 50);
  }
  stopRepeat() {
    clearInterval(this.repeatInterval);
    this.repeatInterval = null;
  }

  // -------------------------------------------------------------------------
  // Virtual D-pad
  // -------------------------------------------------------------------------
  // Each pad button has a data-action attribute. We listen for pointer events
  // (which unify mouse + touch + stylus in one API). Holding ◀/▶ uses the
  // same DAS-ish pattern as keyboard, but with slightly slower numbers
  // because thumbs are imprecise.
  bindVPad() {
    if (!this.vpadEl) return;
    this.vpadEl.querySelectorAll('.vbtn').forEach(btn => {
      const action = btn.dataset.action;
      let holdTimer, repeatTimer;
      const press = (ev) => {
        ev.preventDefault();
        this.emit(action);
        if (action === 'left' || action === 'right') {
          // Slightly longer charge (180 ms) and same 50 ms repeat — thumb-friendly.
          holdTimer = setTimeout(() => {
            repeatTimer = setInterval(() => this.emit(action), 50);
          }, 180);
        } else if (action === 'soft') {
          repeatTimer = setInterval(() => this.emit('soft'), 50);
        }
      };
      const release = () => {
        clearTimeout(holdTimer);
        clearInterval(repeatTimer);
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);    // OS interrupt
      btn.addEventListener('pointerleave', release);     // finger slid off
    });
  }

  // -------------------------------------------------------------------------
  // Touch directly on the board
  // -------------------------------------------------------------------------
  // We support three gestures, decided at touchend:
  //
  //   TAP    — touchstart/touchend with <12 px movement and <250 ms duration
  //            → rotate (CW)
  //   DRAG   — finger moves >22 px on x or y axis
  //            → for each 22 px traveled, emit step move ('left'/'right'/'soft')
  //   SWIPE  — long vertical move (>90 px) done quickly (<400 ms) at touchend
  //            → 'drop' (hard drop)
  //
  // The 22 px per-cell threshold is eyeballed; it's roughly one Tetris cell on
  // a typical phone screen, which makes the drag feel like "moving the piece
  // with my finger" rather than scrubbing through abstract gestures.
  bindTouch() {
    if (!this.boardEl) return;
    let sx = 0, sy = 0;          // touch START position
    let st = 0;                  // touch start time
    let lastX = 0, lastY = 0;    // running cursor for drag stepping
    let moved = false;           // any drag detected during this touch?
    const THRESH = 22;           // px per "cell step" of horizontal/vertical drag

    this.boardEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;             // ignore multi-finger
      const t = e.touches[0];
      sx = lastX = t.clientX;
      sy = lastY = t.clientY;
      st = performance.now();
      moved = false;
    }, { passive: true });

    // During the drag, emit one step per `THRESH` pixels of movement on each
    // axis. We update lastX/lastY by exactly the consumed delta so partial
    // pixels accumulate (rather than getting dropped on each frame).
    this.boardEl.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - lastX;
      const dy = t.clientY - lastY;
      if (Math.abs(dx) > THRESH) {
        const steps = Math.trunc(dx / THRESH);
        for (let i = 0; i < Math.abs(steps); i++) this.emit(steps > 0 ? 'right' : 'left');
        lastX += steps * THRESH;
        moved = true;
      }
      if (dy > THRESH) {
        const steps = Math.trunc(dy / THRESH);
        for (let i = 0; i < steps; i++) this.emit('soft');
        lastY += steps * THRESH;
        moved = true;
      }
      // Upward movement is intentionally ignored — there's no way to lift a
      // dropping piece in Tetris, so dragging up does nothing.
    }, { passive: true });

    this.boardEl.addEventListener('touchend', (e) => {
      const dt = performance.now() - st;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);

      // TAP — barely moved, brief duration → rotate.
      if (!moved && dt < 250 && adx < 12 && ady < 12) {
        this.emit('rotate');
        return;
      }
      // SWIPE — long fast downward gesture → hard drop.
      // The `ady > adx` check ensures we don't fire on diagonal swipes that
      // are more horizontal than vertical.
      if (ady > 90 && dy > 0 && ady > adx && dt < 400) {
        this.emit('drop');
      }
    }, { passive: true });
  }
}
