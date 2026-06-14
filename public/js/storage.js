// tetris — storage.js
// ============================================================================
// 30-line settings store on top of localStorage. Worth reading just to see
// how *little* code you need for persistence in a small app.
//
// The pattern:
//   - one JSON object under one key
//   - DEFAULTS define the shape (and the contract — UI assumes these keys exist)
//   - load() merges saved values over defaults so old saves stay compatible
//     when we add new keys
//   - get/set/patch are tiny wrappers around the in-memory `state` object
//   - every set writes through to localStorage (no debouncing — writes are
//     fast enough that this never matters in practice)
//
// Why not IndexedDB, why not a library? Because for ~1 KB of structured prefs,
// localStorage is the right tool: synchronous, present everywhere, no schema.
// ============================================================================

const KEY = 'tetris:settings';

const DEFAULTS = {
  theme: 'modern',     // classic | color | modern
  mode: 'dark',        // dark | light
  zoom: 100,           // %  (60..160)
  fit: false,          // auto-fit to viewport on load
  vpadMode: 'auto',    // auto | always | never  (auto = show on touch devices)
  sfx: true,
  music: false,        // reserved — there's no music track yet
  server: '',          // override scoreboard URL; empty = auto-detect same-origin
  identity: { name: '', tagline: '', email: '' },  // last submitted identity
};

// The exported object IS the state. Other modules import `settings` and read
// .state.<key> for current value, or call .get/.set/.patch for typed access.
export const settings = {
  state: load(),
  get(k) { return this.state[k]; },
  set(k, v) { this.state[k] = v; this.save(); },
  // Shallow merge a partial object into state — useful for "update identity"
  // type calls where you don't want to clobber the unchanged keys.
  patch(obj) { Object.assign(this.state, obj); this.save(); },
  // try/catch because localStorage can throw (quota exceeded, private mode,
  // disabled in iframe). We swallow — the in-memory state is still good
  // for the current session.
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch {} },
};

// Read and migrate: spread DEFAULTS first, then saved values on top so any
// new keys we add in future releases get sensible defaults for existing users.
// The nested `identity` object is merged separately so partial saves don't
// drop sub-keys.
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...raw, identity: { ...DEFAULTS.identity, ...(raw.identity || {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}
