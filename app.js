/* =====================================================
   HousiePro – app.js
   All game logic, audio, TTS, UI rendering, storage
   ===================================================== */

'use strict';

// =====================================================
// CONSTANTS
// =====================================================

const ALL_PRIZES = [
  { id: 'early-five', name: 'Early Five',      icon: '⚡', desc: 'First to mark any 5 numbers' },
  { id: 'top-row',    name: 'Top Row',          icon: '🔝', desc: 'All 5 numbers in top row' },
  { id: 'mid-row',    name: 'Middle Row',       icon: '⬛', desc: 'All 5 numbers in middle row' },
  { id: 'bot-row',    name: 'Bottom Row',       icon: '⬇️', desc: 'All 5 numbers in bottom row' },
  { id: 'full-house', name: 'Full House',       icon: '🏆', desc: 'All 15 numbers on ticket' },
  { id: 'corners',    name: 'Four Corners',     icon: '🔲', desc: '4 corner numbers of the ticket' },
  { id: 'jaldi-five', name: 'Jaldi Five',       icon: '💨', desc: 'First 5 numbers anywhere on ticket (speed round)' },
  { id: 'star',       name: 'Star',             icon: '🌟', desc: '4 corners + centre of middle row' },
  { id: 'second-fh',  name: '2nd Full House',   icon: '🥈', desc: '2nd player to complete full house' },
];

const DEFAULT_PRIZE_IDS = ['early-five', 'top-row', 'mid-row', 'bot-row', 'full-house'];

const COL_COLORS = [
  '#f43f5e', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
];

// =====================================================
// STATE
// =====================================================

const S = {
  games:         [],
  currentGameId: null,
  pool:          [],
  drawn:         [],
  poolMax:       90,
  mode:          'digital',   // 'digital' | 'paper'
  autoInterval:  null,
  timerSec:      15,
  timerRemain:   0,
  timerTick:     null,
  voices:        [],
  audioCtx:      null,
  theme:         'dark',
};

// =====================================================
// UTILITIES
// =====================================================

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function colFor(num, max) {
  if (max <= 90) {
    if (num <= 9)  return 0;
    if (num >= 80) return 8;
    return Math.floor(num / 10);
  }
  return Math.min(8, Math.floor((num - 1) * 9 / max));
}

function buildPool(max, drawn = []) {
  const used = new Set(drawn);
  const pool = [];
  for (let i = 1; i <= max; i++) {
    if (!used.has(i)) pool.push(i);
  }
  return shuffle(pool);
}

function getGame(id) {
  return S.games.find(g => g.id === (id || S.currentGameId)) || null;
}

function currentGame() { return getGame(S.currentGameId); }

// =====================================================
// PERSISTENCE
// =====================================================

function save() {
  try {
    localStorage.setItem('hp-games',   JSON.stringify(S.games));
    localStorage.setItem('hp-current', S.currentGameId || '');
    localStorage.setItem('hp-mode',    S.mode);
    localStorage.setItem('hp-timer',   String(S.timerSec));
    localStorage.setItem('hp-theme',   S.theme);
  } catch (e) { /* quota */ }
}

function load() {
  try {
    const g = localStorage.getItem('hp-games');
    if (g) S.games = JSON.parse(g);
    S.currentGameId = localStorage.getItem('hp-current') || null;
    S.mode     = localStorage.getItem('hp-mode')  || 'digital';
    S.timerSec = parseInt(localStorage.getItem('hp-timer') || '15', 10);
    S.theme    = localStorage.getItem('hp-theme') || 'dark';
  } catch (e) { S.games = []; S.theme = 'dark'; }
}

function applyTheme(theme) {
  S.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const btn = qs('#btn-theme');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  save();
}

function toggleTheme() {
  applyTheme(S.theme === 'dark' ? 'light' : 'dark');
}

// =====================================================
// AUDIO ENGINE  (Web Audio API – no external files)
// =====================================================

function getAudioCtx() {
  if (!S.audioCtx) {
    S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (S.audioCtx.state === 'suspended') S.audioCtx.resume();
  return S.audioCtx;
}

/** Short rising chime before TTS */
function playChime() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    [880, 1100, 1320].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.36);
    });
  } catch (_) {}
}

/** Soft ball-drop / tumble sound */
function playBallDrop() {
  try {
    const ctx  = getAudioCtx();
    const now  = ctx.currentTime;
    const len  = Math.floor(ctx.sampleRate * 0.25);
    const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    }
    const src    = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain   = ctx.createGain();
    src.buffer  = buf;
    filter.type = 'bandpass';
    filter.frequency.value = 180;
    filter.Q.value         = 1.2;
    gain.gain.value = 0.55;
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start(now);
  } catch (_) {}
}

/** Triumphant arpeggio for winner */
function playWinner() {
  try {
    const ctx   = getAudioCtx();
    const now   = ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle'; osc.frequency.value = freq;
      const t = now + i * 0.13;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t); osc.stop(t + 0.56);
    });
  } catch (_) {}
}

/** Tick sound for countdown */
function playTick(last = false) {
  try {
    const ctx  = getAudioCtx();
    const now  = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = last ? 660 : 440;
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.start(now); osc.stop(now + 0.09);
  } catch (_) {}
}

// =====================================================
// TTS (Web Speech API)
// =====================================================

function loadVoices() {
  if (!window.speechSynthesis) return;
  S.voices = speechSynthesis.getVoices();
}

function pickVoice() {
  const v = S.voices;
  return v.find(x => x.lang.startsWith('en') && x.name.includes('Google'))
      || v.find(x => x.lang.startsWith('en') && x.localService)
      || v.find(x => x.lang.startsWith('en'))
      || v[0] || null;
}

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate  = 0.88;
  u.pitch = 1.05;
  u.volume = 1;
  const voice = pickVoice();
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

// =====================================================
// TICKET GENERATION  (Tambola 3×9)
// =====================================================

function colRange(col, max) {
  if (max <= 90) {
    const min = col === 0 ? 1 : col * 10;
    const end = col === 8 ? 90 : (col + 1) * 10 - 1;
    return { min, max: Math.min(end, max) };
  }
  const size = Math.ceil(max / 9);
  const min  = col * size + 1;
  const end  = Math.min((col + 1) * size, max);
  return { min, max: end };
}

/** Generate valid 3×9 Tambola ticket */
function generateTicket(poolMax = 90) {
  // Find structure: 3 rows, each 5 cols filled, every col covered (≥1)
  let structure;
  let tries = 0;
  do {
    tries++;
    structure = [
      shuffle([0,1,2,3,4,5,6,7,8]).slice(0,5),
      shuffle([0,1,2,3,4,5,6,7,8]).slice(0,5),
      shuffle([0,1,2,3,4,5,6,7,8]).slice(0,5),
    ];
    const covered = new Set([...structure[0], ...structure[1], ...structure[2]]);
    if (covered.size === 9) break;
  } while (tries < 600);

  // Build col→rows map
  const colRows = {};
  for (let r = 0; r < 3; r++) {
    for (const c of structure[r]) {
      (colRows[c] = colRows[c] || []).push(r);
    }
  }

  const grid = Array.from({ length: 3 }, () => Array(9).fill(null));

  for (let col = 0; col < 9; col++) {
    const rows = colRows[col] || [];
    if (!rows.length) continue;
    const { min, max: maxC } = colRange(col, poolMax);
    if (maxC < min) continue;
    const pool = [];
    for (let n = min; n <= maxC; n++) pool.push(n);
    const chosen = shuffle(pool).slice(0, rows.length).sort((a, b) => a - b);
    const sortedR = [...rows].sort((a, b) => a - b);
    for (let i = 0; i < sortedR.length; i++) grid[sortedR[i]][col] = chosen[i];
  }

  return grid;
}

// =====================================================
// GAME SESSIONS
// =====================================================

function createGame(name, poolMax, prizeIds) {
  const game = {
    id:        uid(),
    name:      name || `Game ${S.games.length + 1}`,
    createdAt: Date.now(),
    poolMax:   poolMax || S.poolMax,
    drawn:     [],
    players:   [],
    prizes:    (prizeIds || DEFAULT_PRIZE_IDS).map(pid => {
      const p = ALL_PRIZES.find(x => x.id === pid) || {};
      return { ...p, winnerId: null, wonAt: null };
    }),
  };
  S.games.unshift(game);
  S.currentGameId = game.id;
  save();
  return game;
}

function switchGame(gameId) {
  // Persist current draw state
  const cur = currentGame();
  if (cur) { cur.drawn = [...S.drawn]; save(); }
  stopAuto();
  S.currentGameId = gameId;
  const g = currentGame();
  if (g) {
    S.drawn   = [...g.drawn];
    S.poolMax = g.poolMax;
    S.pool    = buildPool(g.poolMax, g.drawn);
  }
  save();
  renderAll();
  updateCurrentNumber();
}

function resetGame() {
  const g = currentGame();
  if (!g) return;
  stopAuto();
  g.drawn   = [];
  g.prizes  = g.prizes.map(p => ({ ...p, winnerId: null, wonAt: null }));
  S.drawn   = [];
  S.pool    = buildPool(g.poolMax);
  save();
  renderAll();
  qs('#num-display').textContent = '–';
  qs('#prev-strip').innerHTML     = '';
  setProgressBar(0, g.poolMax);
}

// =====================================================
// PLAYERS
// =====================================================

function addPlayer(name, genTicket) {
  const g = currentGame();
  if (!g) return;
  const p = { id: uid(), name, ticket: genTicket ? generateTicket(g.poolMax) : null };
  g.players.push(p);
  save();
  return p;
}

// =====================================================
// DRAW ENGINE
// =====================================================

function drawNumber() {
  const g = currentGame();
  if (!g) { toast('Select or create a game first!'); return null; }
  if (!S.pool.length) {
    toast('All numbers drawn! Game complete.');
    stopAuto();
    return null;
  }

  const num = S.pool.pop();
  S.drawn.push(num);
  g.drawn = [...S.drawn];
  save();

  // Sound + TTS
  playBallDrop();
  setTimeout(() => {
    playChime();
    setTimeout(() => speak(`Number ${num}`), 250);
  }, 120);

  // UI updates
  animateNumber(num);
  updateBoard(num);
  updateStats();
  renderPrevStrip();
  renderGameList();

  return num;
}

function animateNumber(num) {
  const el = qs('#num-display');
  el.textContent = num;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function updateCurrentNumber() {
  const g = currentGame();
  qs('#num-display').textContent = g && g.drawn.length ? g.drawn[g.drawn.length - 1] : '–';
  qs('#game-label').textContent  = g ? g.name : '— select or create a game —';
}

// =====================================================
// AUTO-DRAW + COUNTDOWN TIMER
// =====================================================

function startAuto() {
  if (S.autoInterval) return;
  const g = currentGame();
  if (!g) { toast('Select or create a game first!'); return; }

  S.timerRemain = S.timerSec;
  updateTimerRing(1);

  S.timerTick = setInterval(() => {
    S.timerRemain--;
    const ratio = S.timerRemain / S.timerSec;
    updateTimerRing(ratio);

    // Last 3 seconds: tick
    if (S.timerRemain <= 3 && S.timerRemain > 0) playTick(S.timerRemain === 1);

    if (S.timerRemain <= 0) {
      const num = drawNumber();
      if (num === null) { stopAuto(); return; }
      S.timerRemain = S.timerSec;
      updateTimerRing(1);
    }
  }, 1000);

  qs('#btn-auto').classList.add('active');
  qs('#btn-auto').innerHTML = '⏸&nbsp; Pause';
}

function stopAuto() {
  clearInterval(S.timerTick);
  S.timerTick = null;
  S.autoInterval = null; // legacy compat
  S.timerRemain = 0;
  updateTimerRing(0);
  const btn = qs('#btn-auto');
  if (btn) { btn.classList.remove('active'); btn.innerHTML = '▶&nbsp; Auto'; }
}

function toggleAuto() {
  S.timerTick ? stopAuto() : startAuto();
}

function updateTimerRing(ratio) {
  const ring  = qs('#timer-prog');
  const label = qs('#timer-count');
  const bar   = qs('#timer-bar');
  if (!ring) return;
  const r = 11; const C = 2 * Math.PI * r;
  ring.style.strokeDasharray  = C;
  ring.style.strokeDashoffset = C * (1 - Math.max(0, ratio));
  if (label) label.textContent = S.timerTick ? Math.max(0, S.timerRemain) : S.timerSec;
  if (bar)   bar.style.transform = `scaleX(${Math.max(0, ratio)})`;
}

// =====================================================
// PRIZE MANAGEMENT
// =====================================================

function awardPrize(prizeId, playerId) {
  const g = currentGame();
  if (!g) return;
  const prize  = g.prizes.find(p => p.id === prizeId);
  const player = g.players.find(p => p.id === playerId);
  if (!prize || !player || prize.winnerId) return;

  prize.winnerId = playerId;
  prize.wonAt    = g.drawn.length;
  save();

  playWinner();
  speak(`Winner! ${player.name} wins ${prize.name}!`);
  showWinnerModal(player.name, prize.name, prize.icon, prize.wonAt);
  renderPrizes();
  renderGameList();
  renderHistory();
}

// =====================================================
// UI – BOARD
// =====================================================

function renderBoard() {
  const g   = currentGame();
  const max = g ? g.poolMax : S.poolMax;
  const drawn = new Set(g ? g.drawn : []);
  const board = qs('#number-board');

  // Columns: 9 for ≤90, 10 for ≤100, scale
  const cols = max <= 75 ? 5 : max <= 90 ? 9 : 10;
  board.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  board.classList.toggle('board-lg', max <= 50);

  board.innerHTML = '';
  for (let n = 1; n <= max; n++) {
    const col  = colFor(n, max);
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    cell.id = `cell-${n}`;
    cell.textContent = n;
    cell.dataset.col = col;
    if (drawn.has(n)) {
      cell.classList.add('called');
      cell.style.setProperty('--col-color', COL_COLORS[col]);
    }
    board.appendChild(cell);
  }
}

function updateBoard(num) {
  const cell = qs(`#cell-${num}`);
  if (!cell) return;
  const col = parseInt(cell.dataset.col);
  cell.style.setProperty('--col-color', COL_COLORS[col]);
  cell.classList.add('called', 'just-called');
  setTimeout(() => cell.classList.remove('just-called'), 800);
}

// =====================================================
// UI – STATS & PROGRESS
// =====================================================

function updateStats() {
  const g = currentGame();
  if (!g) return;
  const called    = g.drawn.length;
  const remaining = g.poolMax - called;
  const pct       = Math.round((called / g.poolMax) * 100);
  qs('#stat-called').textContent  = `Called: ${called}`;
  qs('#stat-remain').textContent  = `Remaining: ${remaining}`;
  qs('#stat-pct').textContent     = `${pct}%`;
  qs('#progress-text').textContent = `${called} / ${g.poolMax} drawn`;
  setProgressBar(pct, g.poolMax);
}

function setProgressBar(pct) {
  qs('#progress-fill').style.width = `${pct}%`;
}

// =====================================================
// UI – PREV STRIP (last 5 before current)
// =====================================================

function renderPrevStrip() {
  const g = currentGame();
  if (!g) return;
  const last5 = g.drawn.slice(-6, -1).reverse();
  qs('#prev-strip').innerHTML = last5.map(n => {
    const col = colFor(n, g.poolMax);
    return `<span class="prev-num" style="--col-color:${COL_COLORS[col]}">${n}</span>`;
  }).join('');
}

// =====================================================
// UI – GAME LIST (left sidebar)
// =====================================================

function renderGameList() {
  const list = qs('#game-list');
  qs('#session-count').textContent = S.games.length;

  if (!S.games.length) {
    list.innerHTML = '<p class="hint-text">No games yet.<br>Click <strong>New Game</strong> to start.</p>';
    return;
  }

  list.innerHTML = S.games.map(g => {
    const wonCount = g.prizes.filter(p => p.winnerId).length;
    return `
      <div class="game-item ${g.id === S.currentGameId ? 'active' : ''}"
           onclick="switchGame('${g.id}')">
        <div class="gi-name">${esc(g.name)}</div>
        <div class="gi-meta">
          <span>${g.players.length} player${g.players.length !== 1 ? 's' : ''}</span>
          <span>${g.drawn.length}/${g.poolMax} drawn</span>
          ${wonCount ? `<span style="color:var(--amber)">${wonCount} prize${wonCount > 1 ? 's' : ''} won</span>` : ''}
        </div>
        <div class="gi-prizes">
          ${g.prizes.filter(p => p.winnerId).map(p => `<span title="${p.name}">${p.icon}</span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

// =====================================================
// UI – PLAYERS
// =====================================================

function renderPlayers() {
  const g    = currentGame();
  const list = qs('#player-list');

  if (!g) { list.innerHTML = '<p class="hint-text">Select a game first</p>'; return; }
  if (!g.players.length) { list.innerHTML = '<p class="hint-text">No players yet — click + Add</p>'; return; }

  list.innerHTML = g.players.map(p => {
    const wins = g.prizes.filter(pr => pr.winnerId === p.id).map(pr => pr.icon).join(' ');
    return `
      <div class="player-card" id="pc-${p.id}">
        <div class="player-avatar">${p.name[0].toUpperCase()}</div>
        <div class="player-info">
          <div class="player-name">${esc(p.name)}</div>
          ${wins ? `<div class="player-wins">${wins} Winner!</div>` : ''}
        </div>
        <div class="player-actions">
          ${p.ticket ? `<button class="btn btn-xs btn-outline" onclick="showTicket('${p.id}')">🎫</button>` : ''}
          <button class="btn btn-xs btn-danger" onclick="removePlayer('${p.id}')" title="Remove player">✕</button>
        </div>
      </div>`;
  }).join('');
}

function removePlayer(playerId) {
  const g = currentGame();
  if (!g) return;
  g.players = g.players.filter(p => p.id !== playerId);
  // Clear any prizes won by this player
  g.prizes.forEach(pr => { if (pr.winnerId === playerId) { pr.winnerId = null; pr.wonAt = null; } });
  save();
  renderPlayers();
  renderPrizes();
  renderGameList();
}

// =====================================================
// UI – PRIZES
// =====================================================

function renderPrizes() {
  const g    = currentGame();
  const list = qs('#prize-list');

  if (!g) { list.innerHTML = '<p class="hint-text">Select a game first</p>'; return; }
  if (!g.prizes.length) { list.innerHTML = '<p class="hint-text">No prizes configured</p>'; return; }

  list.innerHTML = g.prizes.map(p => {
    const winner = p.winnerId ? g.players.find(pl => pl.id === p.winnerId) : null;
    const playerBtns = !winner && g.players.length
      ? `<div class="prize-btn-row">${g.players.map(pl =>
          `<button class="btn btn-xs btn-green prize-claim"
                   onclick="awardPrize('${p.id}','${pl.id}')"
                   title="Award ${p.name} to ${esc(pl.name)}">
             ${esc(pl.name)}
           </button>`).join('')}</div>`
      : (!winner && !g.players.length)
        ? '<p class="hint-text" style="padding:4px 0">Add players first</p>'
        : '';

    return `
      <div class="prize-card ${winner ? 'won' : ''}">
        <div class="prize-row">
          <span class="prize-icon">${p.icon}</span>
          <span class="prize-name">${p.name}</span>
          ${p.wonAt ? `<span class="prize-at">call #${p.wonAt}</span>` : ''}
        </div>
        ${winner
          ? `<div class="prize-winner-name">🏆 ${esc(winner.name)}</div>`
          : playerBtns}
      </div>`;
  }).join('');
}

// =====================================================
// UI – HISTORY
// =====================================================

function renderHistory() {
  const el   = qs('#game-history');
  const relevant = S.games.filter(g => g.prizes.some(p => p.winnerId));
  if (!relevant.length) { el.innerHTML = '<p class="hint-text">No results yet</p>'; return; }
  el.innerHTML = relevant.slice(0, 8).map(g => `
    <div class="hist-item">
      <div class="hist-game">${esc(g.name)} <small style="color:var(--t3);font-weight:400">${g.drawn.length}/${g.poolMax}</small></div>
      ${g.prizes.filter(p => p.winnerId).map(p => {
        const w = g.players.find(pl => pl.id === p.winnerId);
        return `<div class="hist-prize">${p.icon} ${p.name}: <strong>${w ? esc(w.name) : '?'}</strong> (call #${p.wonAt})</div>`;
      }).join('')}
    </div>`).join('');
}

// =====================================================
// TICKET DISPLAY MODAL
// =====================================================

function showTicket(playerId) {
  const g = currentGame();
  if (!g) return;
  const p = g.players.find(x => x.id === playerId);
  if (!p || !p.ticket) return;

  qs('#ticket-title').textContent = `${p.name}'s Ticket`;
  qs('#ticket-display').innerHTML = buildTicketHTML(p.ticket, g.drawn, g.poolMax);
  openModal('modal-ticket');
}

function buildTicketHTML(grid, drawn, max) {
  const drawnSet = new Set(drawn);
  let html = '<table class="ticket-table"><tbody>';
  for (let r = 0; r < 3; r++) {
    html += '<tr>';
    for (let c = 0; c < 9; c++) {
      const num = grid[r][c];
      if (num === null) {
        html += '<td class="ticket-td t-blank">&nbsp;</td>';
      } else {
        const col     = colFor(num, max);
        const marked  = drawnSet.has(num);
        html += `<td class="ticket-td t-num ${marked ? 't-marked' : ''}"
                     style="--col-color:${COL_COLORS[col]}">${num}</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// =====================================================
// WINNER MODAL
// =====================================================

function showWinnerModal(playerName, prizeName, icon, callNo) {
  qs('#winner-burst').textContent = icon || '🎉';
  qs('#winner-info').innerHTML = `
    <div class="w-player">${esc(playerName)}</div>
    <div class="w-prize">${esc(prizeName)}</div>
    <div class="w-call">at call #${callNo}</div>`;
  openModal('modal-winner');
}

// =====================================================
// MODALS
// =====================================================

function openModal(id) {
  qs(`#${id}`).classList.remove('hidden');
}
function closeModal(id) {
  qs(`#${id}`).classList.add('hidden');
}

// =====================================================
// MODE TOGGLE  (Digital ↔ Paper)
// =====================================================

function setMode(mode) {
  S.mode = mode;
  document.body.classList.toggle('paper-mode', mode === 'paper');
  qs('#btn-mode-digital').classList.toggle('active', mode === 'digital');
  qs('#btn-mode-paper').classList.toggle('active',  mode === 'paper');
  save();
}

// =====================================================
// RENDER ALL
// =====================================================

function renderAll() {
  renderBoard();
  renderGameList();
  renderPlayers();
  renderPrizes();
  renderHistory();
  updateStats();
  renderPrevStrip();
  updateCurrentNumber();
}

// =====================================================
// HELPERS
// =====================================================

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function toast(msg) {
  const el = qs('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// =====================================================
// INJECT DYNAMIC TOPBAR WIDGETS (timer + mode)
// =====================================================

function injectTopbarWidgets() {
  // Mode pill
  const modePill = document.createElement('div');
  modePill.className = 'mode-pill';
  modePill.innerHTML = `
    <button id="btn-mode-digital" class="active" onclick="setMode('digital')">Digital</button>
    <button id="btn-mode-paper"                  onclick="setMode('paper')">Paper</button>`;

  // Timer ring + count
  const timerWrap = document.createElement('div');
  timerWrap.className = 'ctrl-group timer-display';
  timerWrap.innerHTML = `
    <div class="timer-ring-wrap">
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle class="timer-track" cx="14" cy="14" r="11" stroke-width="3"/>
        <circle id="timer-prog"  class="timer-prog" cx="14" cy="14" r="11" stroke-width="3"
                stroke-dasharray="69.12" stroke-dashoffset="69.12"/>
      </svg>
    </div>
    <span id="timer-count" style="min-width:20px;text-align:center">${S.timerSec}</span>s
    <input type="number" id="timer-input" class="input-sm" min="3" max="120" value="${S.timerSec}"
           title="Auto-draw interval (seconds)" style="width:50px">`;

  // Timer bar (fixed below topbar)
  const timerBar = document.createElement('div');
  timerBar.className = 'timer-bar-wrap';
  timerBar.innerHTML = `<div class="timer-bar" id="timer-bar" style="transform:scaleX(0)"></div>`;
  document.body.appendChild(timerBar);

  const controls = qs('.topbar-controls');
  controls.appendChild(document.createElement('span')).className = 'vdiv';
  controls.appendChild(modePill);
  controls.appendChild(document.createElement('span')).className = 'vdiv';
  controls.appendChild(timerWrap);

  // Timer input handler
  qs('#timer-input').addEventListener('change', e => {
    const v = Math.max(3, Math.min(120, parseInt(e.target.value, 10) || 15));
    S.timerSec = v;
    e.target.value = v;
    qs('#timer-count').textContent = v;
    save();
    if (S.timerTick) { stopAuto(); startAuto(); }
  });
}

// (timer bar is updated inline inside updateTimerRing itself)

// =====================================================
// NEW GAME MODAL – prize selector
// =====================================================

function buildPrizeSelector(selectedIds = DEFAULT_PRIZE_IDS) {
  return `
    <div class="field">
      <label class="field-label">Prizes for this game</label>
      <div class="prize-select-grid">
        ${ALL_PRIZES.map(p => `
          <label class="prize-check-row">
            <input type="checkbox" name="gprize" value="${p.id}"
                   ${selectedIds.includes(p.id) ? 'checked' : ''}>
            <span class="prize-icon">${p.icon}</span>
            <span class="prize-check-info">
              <span class="prize-check-name">${p.name}</span>
              <span class="prize-check-desc">${p.desc}</span>
            </span>
          </label>`).join('')}
      </div>
    </div>`;
}

// =====================================================
// EVENT LISTENERS
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
  load();
  loadVoices();
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = loadVoices;

  injectTopbarWidgets();

  // Theme toggle
  qs('#btn-theme').addEventListener('click', toggleTheme);

  // Inject prize selector into New Game modal (before the footer buttons)
  const modalFoot = qs('#modal-game .modal-foot');
  if (modalFoot) modalFoot.insertAdjacentHTML('beforebegin', buildPrizeSelector());

  // ── Pool preset ──
  qs('#pool-preset').addEventListener('change', e => {
    const v = e.target.value;
    const ci = qs('#custom-max');
    if (v === 'custom') {
      ci.classList.remove('hidden');
      S.poolMax = parseInt(ci.value, 10) || 90;
    } else {
      ci.classList.add('hidden');
      S.poolMax = parseInt(v, 10);
    }
  });
  qs('#custom-max').addEventListener('change', e => {
    S.poolMax = Math.max(10, parseInt(e.target.value, 10) || 90);
  });

  // ── Draw buttons ──
  qs('#btn-draw').addEventListener('click', () => drawNumber());
  qs('#btn-auto').addEventListener('click', () => toggleAuto());
  qs('#btn-reset').addEventListener('click', () => {
    if (confirm('Reset this game? All drawn numbers will be cleared.')) resetGame();
  });

  // ── New Game ──
  qs('#btn-new-game').addEventListener('click', () => {
    const g = currentGame();
    const nextName = `Game ${S.games.length + 1}`;
    qs('#new-game-name').value = nextName;
    // Sync pool preset to current selection
    const poolRadio = qs(`input[name="gpool"][value="${S.poolMax}"]`);
    if (poolRadio) poolRadio.checked = true;
    openModal('modal-game');
  });

  qs('#btn-create-game').addEventListener('click', () => {
    const name  = qs('#new-game-name').value.trim() || `Game ${S.games.length + 1}`;
    const poolV = qs('input[name="gpool"]:checked')?.value || '90';
    const pool  = poolV === 'custom'
      ? Math.max(10, parseInt(qs('#game-custom-max').value, 10) || 90)
      : parseInt(poolV, 10);
    const prizeIds = [...qsa('input[name="gprize"]:checked')].map(el => el.value);
    if (!prizeIds.length) { toast('Select at least one prize'); return; }
    const g = createGame(name, pool, prizeIds);
    S.pool  = buildPool(g.poolMax);
    S.drawn = [];
    S.poolMax = g.poolMax;
    closeModal('modal-game');
    renderAll();
  });

  qs('#new-game-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') qs('#btn-create-game').click();
  });

  // ── Add Player ──
  qs('#btn-add-player').addEventListener('click', () => {
    if (!currentGame()) { toast('Select a game first!'); return; }
    qs('#new-player-name').value = '';
    qs('#gen-ticket').checked = true;
    openModal('modal-player');
    setTimeout(() => qs('#new-player-name').focus(), 60);
  });

  qs('#btn-create-player').addEventListener('click', () => {
    const name = qs('#new-player-name').value.trim();
    if (!name) { toast('Enter a player name'); return; }
    addPlayer(name, qs('#gen-ticket').checked);
    closeModal('modal-player');
    renderPlayers();
    renderGameList();
    renderPrizes();
  });
  qs('#new-player-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') qs('#btn-create-player').click();
  });

  // ── Ticket modal ──
  qs('#btn-print-ticket').addEventListener('click', () => window.print());

  // ── Winner modal ──
  qs('#btn-close-winner').addEventListener('click', () => closeModal('modal-winner'));

  // ── Modal close buttons (data-close attr) ──
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-close]');
    if (t) closeModal(t.dataset.close);
    // Click outside modal
    if (e.target.classList.contains('modal-overlay')) {
      const modal = e.target.querySelector('.modal');
      if (!modal || !modal.contains(e.target)) closeModal(e.target.id);
    }
  });

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', e => {
    // Ignore when typing in inputs
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); drawNumber(); }
    if (e.key  === 'a' || e.key === 'A') toggleAuto();
    if (e.key  === 'Escape') {
      qsa('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
      stopAuto();
    }
  });

  // ── Init ──
  if (S.currentGameId && currentGame()) {
    const g  = currentGame();
    S.drawn   = [...g.drawn];
    S.poolMax = g.poolMax;
    S.pool    = buildPool(g.poolMax, g.drawn);
    // Sync pool preset dropdown
    const preset = qs('#pool-preset');
    if (preset) {
      if (g.poolMax === 90 || g.poolMax === 100 || g.poolMax === 75 || g.poolMax === 50) {
        preset.value = String(g.poolMax);
      } else {
        preset.value = 'custom';
        qs('#custom-max').value = g.poolMax;
        qs('#custom-max').classList.remove('hidden');
      }
    }
  }

  setMode(S.mode);
  applyTheme(S.theme);
  renderAll();
  updateTimerRing(0);

  // Warm up audio context on first interaction
  document.addEventListener('pointerdown', () => getAudioCtx(), { once: true });
});
