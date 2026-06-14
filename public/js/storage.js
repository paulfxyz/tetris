// tetris — storage.js
// Tiny settings store, persisted in localStorage.

const KEY = 'tetris:settings';
const DEFAULTS = {
  theme: 'modern',     // classic | color | modern
  mode: 'dark',        // dark | light
  zoom: 100,           // %
  fit: false,
  vpadMode: 'auto',    // auto | always | never
  sfx: true,
  music: false,
  server: '',
  identity: { name: '', tagline: '', email: '' },
};

export const settings = {
  state: load(),
  get(k) { return this.state[k]; },
  set(k, v) { this.state[k] = v; this.save(); },
  patch(obj) { Object.assign(this.state, obj); this.save(); },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch {} },
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...raw, identity: { ...DEFAULTS.identity, ...(raw.identity || {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}
