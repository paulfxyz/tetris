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
        // Pressing a vpad button keeps the floating pad alive on mobile —
        // reset the auto-hide timer so the player can keep using it.
        if (this.revealVPad) this.revealVPad();
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
  // Touch directly on the board (v1.5.0 — classic mobile Tetris gestures)
  // -------------------------------------------------------------------------
  // The mobile board fills the entire viewport, so every touch lands here.
  // FIVE gestures, decided either DURING the touch (drag) or AT touchend:
  //
  //   TAP        — <12 px movement and <250 ms duration            → rotate (CW)
  //   DRAG L/R   — finger moves >22 px on the X axis                → step move
  //   DRAG DOWN  — finger moves >22 px downward                     → step soft
  //   SWIPE UP   — fast upward swipe, dy < -90 px in <400 ms         → hard drop
  //   LONG-PRESS — still finger held ≥500 ms                         → hold
  //
  // AMBIGUOUS-TOUCH → VPAD REVEAL. A touch that matched no gesture reveals
  // the floating virtual pad for ~3 s by toggling body.vpad-reveal. This is
  // the discovery hint for new players who didn't read the keys list.
  bindTouch() {
    if (!this.boardEl) return;
    let sx = 0, sy = 0;          // touch START position
    let st = 0;                  // touch start time
    let lastX = 0, lastY = 0;    // running cursor for drag stepping
    let moved = false;           // any drag detected during this touch?
    const THRESH = 22;           // px per "cell step" of horizontal/vertical drag

    let longPressTimer = null;   // 500 ms hold trigger
    let consumed = false;        // if long-press fired, swallow touchend
    let vpadHideTimer = null;    // auto-hide the revealed vpad
    const LONG_PRESS_MS = 500;
    const VPAD_REVEAL_MS = 3000;
    const TAP_MAX = 12;

    // Reveal/dismiss the floating vpad. Idempotent — calling reveal twice
    // resets the auto-hide timer (so using the pad keeps it visible).
    const revealVPad = () => {
      document.body.classList.add('vpad-reveal');
      clearTimeout(vpadHideTimer);
      vpadHideTimer = setTimeout(() => {
        document.body.classList.remove('vpad-reveal');
        vpadHideTimer = null;
      }, VPAD_REVEAL_MS);
    };
    const dismissVPad = () => {
      clearTimeout(vpadHideTimer);
      vpadHideTimer = null;
      document.body.classList.remove('vpad-reveal');
    };
    // Exposed so bindVPad's button press can keep the pad alive while in use.
    this.revealVPad = revealVPad;
    this.dismissVPad = dismissVPad;

    // v1.5.2 — touch handlers are NON-PASSIVE so we can preventDefault() on
    // touchmove. iOS Safari otherwise rubber-bands the page when you swipe
    // down on the board, and the play surface scrolls along with the gesture
    // instead of moving the piece. preventDefault() on every move while a
    // single-finger gesture is in flight stops the page from scrolling and
    // gives us deterministic gesture handling. We deliberately DO NOT block
    // multi-touch (pinch-zoom remains, e.touches.length > 1 falls through).
    this.boardEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;             // ignore multi-finger
      const t = e.touches[0];
      sx = lastX = t.clientX;
      sy = lastY = t.clientY;
      st = performance.now();
      moved = false;
      consumed = false;
      // v1.5.4 — reveal the floating vpad on EVERY touchstart, not just
      // ambiguous touches. The pad sits at very low opacity by default;
      // the moment the user touches the board we lift it to full opacity
      // so the buttons are visible while they play. The 3 s auto-hide
      // timer is reset on every touch / vpad button press.
      revealVPad();
      // Arm long-press — fires HOLD if finger still down + still after 500 ms.
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        if (!moved) {
          this.emit('hold');
          consumed = true;       // touchend won't also fire 'rotate'
        }
        longPressTimer = null;
      }, LONG_PRESS_MS);
    }, { passive: false });

    // During the drag, emit one step per `THRESH` pixels of movement on each
    // axis. We update lastX/lastY by exactly the consumed delta so partial
    // pixels accumulate (rather than getting dropped on each frame).
    //
    // preventDefault() is called UNCONDITIONALLY for single-finger moves so
    // iOS Safari doesn't scroll the page or trigger pull-to-refresh during a
    // soft-drop drag. The CSS rule `touch-action: none` on .board-frame is
    // the belt; this is the suspenders.
    this.boardEl.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      // Cancel pending long-press as soon as the finger drifts past TAP_MAX.
      if (longPressTimer) {
        if (Math.abs(t.clientX - sx) > TAP_MAX || Math.abs(t.clientY - sy) > TAP_MAX) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
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
    }, { passive: false });

    this.boardEl.addEventListener('touchend', (e) => {
      clearTimeout(longPressTimer);
      longPressTimer = null;

      // Long-press already fired hold — swallow this touchend entirely.
      if (consumed) { consumed = false; return; }

      const dt = performance.now() - st;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);

      // TAP — barely moved, brief duration → rotate.
      if (!moved && dt < 250 && adx < TAP_MAX && ady < TAP_MAX) {
        this.emit('rotate');
        // Tap on the board also dismisses a revealed vpad (tap-outside).
        if (document.body.classList.contains('vpad-reveal')) dismissVPad();
        return;
      }
      // SWIPE UP — fast upward gesture, vertical-dominant → hard drop.
      // dy is NEGATIVE for an up-swipe (touch ended above start). v1.5.0
      // flipped the v1.4.x "swipe DOWN = hard drop" mapping to match the
      // classic mobile Tetris convention: drag down = soft, swipe up = hard.
      if (ady > 90 && dy < 0 && ady > adx && dt < 400) {
        this.emit('drop');
        return;
      }

      // AMBIGUOUS — no gesture matched. New-player discovery hint: reveal
      // the floating vpad for ~3 s so the buttons become visible. We only
      // reveal when the user clearly didn't already drag, tap, or swipe.
      if (!moved) revealVPad();
    }, { passive: true });

    // Touch interrupted by OS (incoming call, notification, system gesture).
    this.boardEl.addEventListener('touchcancel', () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      consumed = false;
      moved = false;
    }, { passive: true });
  }
}
