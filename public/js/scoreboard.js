// tetris — scoreboard.js
// ============================================================================
// The NETWORK BOUNDARY of the game.
//
// All HTTP I/O lives in this file. The rest of the code calls scoreboard.submit
// or .fetchTop without knowing whether there's actually a server on the other
// side. We handle three cases transparently:
//
//   1. SERVER AVAILABLE — POST the score to /api/submit or /api/sign. The
//      server signs the receipt with PGP and (optionally) stores it on the
//      public leaderboard. Returns the ASCII-armoured signed text.
//
//   2. NO SERVER — generate an unsigned local receipt so the player still
//      gets a downloadable .txt to keep. Marked clearly as UNSIGNED.
//
//   3. NETWORK ERROR — same fallback as (2), with a "saved locally" message.
//      The caller (app.js) catches the rejected promise and writes the local
//      file. We also persist the score to localStorage in all cases so the
//      player can see their own history offline.
//
// Server URL resolution (in order):
//   a. Manual override in settings ("server" field) — saved to localStorage.
//   b. Same-origin /api — auto-detected when the page is on http(s).
//   c. None — offline mode.
// ============================================================================

const LOCAL_KEY = 'tetris:scores';

// Same-origin /api works when:
//   - the page is served over http(s) (not file://, which has no origin)
//   - a backend (PHP at tetris.rocks, or Node on Fly) lives at /api on the
//     same origin
// We just check the protocol — testing actual reachability happens at submit
// time. If /api 404s, the fetch throws and we fall back to local.
function sameOriginApiAvailable() {
  try {
    return typeof window !== 'undefined'
      && /^https?:$/.test(window.location.protocol);
  } catch { return false; }
}

export class Scoreboard {
  constructor() {
    this.override = (localStorage.getItem('tetris:server') || '').replace(/\/$/, '');
    this.server = this.resolve();
  }
  // Resolve the server URL: explicit override beats auto-detection.
  resolve() {
    if (this.override) return this.override;
    return sameOriginApiAvailable() ? '/api' : '';
  }
  // Called when the user changes the URL in settings.
  setServer(url) {
    const v = (url || '').replace(/\/$/, '');
    this.override = v;
    if (v) localStorage.setItem('tetris:server', v);
    else localStorage.removeItem('tetris:server');
    this.server = this.resolve();
  }
  serverAvailable() { return !!this.server; }

  // ------- Local high-score history -------
  // Capped at 200 entries so localStorage doesn't grow unbounded after years
  // of play. Sorted descending by score so .slice(0, n) returns the top N.
  localScores() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
    catch { return []; }
  }
  saveLocal(score) {
    const list = this.localScores();
    list.push(score);
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 200)));
  }

  // ------- Submit -------
  // `store: true`  → POST /submit (signed AND added to public leaderboard)
  // `store: false` → POST /sign   (signed, NOT stored — private receipt only)
  //
  // Returns { signed_txt, accepted, rank, offline? }. Throws on network/HTTP
  // errors so the caller can show a graceful fallback message.
  async submit(payload, { store = true } = {}) {
    if (!this.server) {
      // Offline: store locally and craft an unsigned receipt so the player
      // still gets something tangible. Never throws.
      this.saveLocal(payload);
      return { signed_txt: localReceipt(payload), accepted: false, rank: null, offline: true };
    }
    const url = this.server + (store ? '/submit' : '/sign');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`server: ${res.status}`);
    const data = await res.json();
    // Server kept the score → also keep a local copy for offline browsing.
    if (data.accepted) this.saveLocal(payload);
    return data;
  }

  // ------- Top N -------
  // Returns either remote data or local data depending on availability.
  // Discriminated by the `online` flag so the UI can render appropriately.
  async fetchTop(n = 25) {
    if (!this.server) return { local: this.localScores().slice(0, n), online: false };
    try {
      const res = await fetch(`${this.server}/scores?limit=${n}`);
      if (!res.ok) throw new Error('bad');
      const data = await res.json();
      return { remote: data.scores, online: true };
    } catch {
      return { local: this.localScores().slice(0, n), online: false };
    }
  }
}

// Plain-text fallback receipt for when there's no server. Clearly labelled
// UNSIGNED so the player knows it can't be verified. Same field order as the
// PGP-signed version so the visual layout is consistent.
function localReceipt(p) {
  const lines = [
    '----- TETRIS SCORE (OFFLINE — UNSIGNED) -----',
    `Name:    ${p.name || ''}`,
    `Tagline: ${p.tagline || ''}`,
    `Email:   ${p.email || ''}`,
    '',
    `Score:   ${p.score}`,
    `Lines:   ${p.lines}`,
    `Level:   ${p.level}`,
    `Time:    ${formatTime(p.duration_ms)}`,
    `Pieces:  ${p.pieces ?? '?'}`,
    `Date:    ${new Date(p.played_at || Date.now()).toISOString()}`,
    `Theme:   ${p.theme || ''}`,
    `Client:  tetris ${p.client_version || ''}`,
    '',
    'NOTE: This receipt is unsigned because no scoreboard server was configured.',
    'To get a PGP-signed receipt, configure a scoreboard server URL in settings.',
  ];
  return lines.join('\n') + '\n';
}

function formatTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
