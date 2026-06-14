// tetris — input.js
// Keyboard + touch (swipe/tap) + virtual D-pad. Emits action events on a target.

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

export class Input {
  constructor({ boardEl, vpadEl, onAction }) {
    this.boardEl = boardEl;
    this.vpadEl = vpadEl;
    this.onAction = onAction;
    this.held = new Set();
    this.dasTimer = null;
    this.dasDir = null;
    this.bindKeyboard();
    this.bindVPad();
    this.bindTouch();
  }

  emit(action) {
    if (action) this.onAction(action);
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (this.held.has(e.code)) {
        if (a === 'left' || a === 'right' || a === 'soft') return;
      }
      this.held.add(e.code);
      this.emit(a);
      if (a === 'left' || a === 'right') this.startDAS(a);
      if (a === 'soft') this.startRepeat('soft');
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      const a = KEYMAP[e.code];
      if (a === 'left' || a === 'right') this.stopDAS();
      if (a === 'soft') this.stopRepeat();
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.stopDAS();
      this.stopRepeat();
    });
  }

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
  startRepeat(action) {
    this.stopRepeat();
    this.repeatInterval = setInterval(() => this.emit(action), 50);
  }
  stopRepeat() {
    clearInterval(this.repeatInterval);
    this.repeatInterval = null;
  }

  bindVPad() {
    if (!this.vpadEl) return;
    this.vpadEl.querySelectorAll('.vbtn').forEach(btn => {
      const action = btn.dataset.action;
      let holdTimer, repeatTimer;
      const press = (ev) => {
        ev.preventDefault();
        this.emit(action);
        if (action === 'left' || action === 'right') {
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
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    });
  }

  bindTouch() {
    if (!this.boardEl) return;
    let sx = 0, sy = 0, st = 0, lastX = 0, lastY = 0;
    let moved = false;
    let stepX = 0, stepY = 0;
    const THRESH = 22; // px per cell-ish
    this.boardEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      sx = lastX = t.clientX;
      sy = lastY = t.clientY;
      st = performance.now();
      moved = false;
      stepX = stepY = 0;
    }, { passive: true });

    this.boardEl.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - lastX;
      const dy = t.clientY - lastY;
      // Horizontal stepwise move
      if (Math.abs(dx) > THRESH) {
        const steps = Math.trunc(dx / THRESH);
        for (let i = 0; i < Math.abs(steps); i++) this.emit(steps > 0 ? 'right' : 'left');
        lastX += steps * THRESH;
        moved = true;
      }
      // Vertical soft drop
      if (dy > THRESH) {
        const steps = Math.trunc(dy / THRESH);
        for (let i = 0; i < steps; i++) this.emit('soft');
        lastY += steps * THRESH;
        moved = true;
      }
    }, { passive: true });

    this.boardEl.addEventListener('touchend', (e) => {
      const dt = performance.now() - st;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (!moved && dt < 250 && adx < 12 && ady < 12) {
        this.emit('rotate');
        return;
      }
      // Quick downward swipe → hard drop
      if (ady > 90 && dy > 0 && ady > adx && dt < 400) {
        this.emit('drop');
      }
    }, { passive: true });
  }
}
