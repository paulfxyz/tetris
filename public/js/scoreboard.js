// tetris — scoreboard.js
// Talks to the backend (Fly.io) and falls back to localStorage when offline.

const LOCAL_KEY = 'tetris:scores';

export class Scoreboard {
  constructor() {
    this.server = localStorage.getItem('tetris:server') || '';
  }
  setServer(url) {
    this.server = (url || '').replace(/\/$/, '');
    localStorage.setItem('tetris:server', this.server);
  }
  serverAvailable() { return !!this.server; }

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

  // Ask server to sign + (optionally) store. Returns { signed_txt, accepted, rank }.
  async submit(payload, { store = true } = {}) {
    if (!this.server) {
      // Offline: store locally and craft an unsigned receipt so the player still gets something.
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
    if (data.accepted) this.saveLocal(payload);
    return data;
  }

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
