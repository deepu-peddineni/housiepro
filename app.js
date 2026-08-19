/* =====================================================
   HousiePro v2 – app.js
   Room-based Tambola with multiplayer, scoreboard, TTS
   ===================================================== */

'use strict';

// =====================================================
// CONSTANTS
// =====================================================

const ALL_PRIZES = [
  { id: 'early-five', name: 'Early Five',    icon: '⚡', desc: 'First to mark any 5 numbers' },
  { id: 'top-row',    name: 'Top Row',        icon: '🔝', desc: 'All 5 numbers in top row' },
  { id: 'mid-row',    name: 'Middle Row',     icon: '⬛', desc: 'All 5 numbers in middle row' },
  { id: 'bot-row',    name: 'Bottom Row',     icon: '⬇️', desc: 'All 5 numbers in bottom row' },
  { id: 'full-house', name: 'Full House',     icon: '🏆', desc: 'All 15 numbers on ticket' },
  { id: 'corners',    name: 'Four Corners',   icon: '🔲', desc: '4 corner numbers of the ticket' },
  { id: 'jaldi-five', name: 'Jaldi Five',     icon: '💨', desc: 'First 5 numbers anywhere on ticket' },
  { id: 'star',       name: 'Star',           icon: '🌟', desc: '4 corners + centre of middle row' },
  { id: 'second-fh',  name: '2nd Full House', icon: '🥈', desc: '2nd player to complete full house' },
];

const DEFAULT_PRIZE_IDS = ['early-five', 'top-row', 'mid-row', 'bot-row', 'full-house'];

// =====================================================
// STATE
// =====================================================

const S = {
  theme:          'dark',
  screen:         'landing',
  // Room
  room:           null,  // { code, name, hostId, poolMax, prizeIds, bestOf, entryFee }
  // Players in this room (local view)
  players:        [],    // [{ id, name, ticket, isHost, isLocal }]
  myPlayerId:     null,
  // Current game round
  currentRound:   0,     // 1-based
  drawn:          [],
  pool:           [],
  autoInterval:   null,
  timerRemain:    0,
  timerTick:      null,
  // All rounds data
  rounds:         [],    // [{ roundNo, drawn:[], prizes:[{...winnerId}], completed }]
  // Scoreboard data
  scoreboard:     {},    // { [playerId]: { name, gamesWon, coinsWon, coinsPaid } }
  // Audio
  voices:         [],
  voiceIndex:     undefined,
  audioCtx:       null,
  // BroadcastChannel
  channel:        null,
};

// =====================================================
// UTILITIES
// =====================================================

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildPool(max, drawn = []) {
  const used = new Set(drawn);
  const pool = [];
  for (let i = 1; i <= max; i++) {
    if (!used.has(i)) pool.push(i);
  }
  return shuffle(pool);
}

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }
function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
// PERSISTENCE
// =====================================================

function save() {
  try {
    localStorage.setItem('hp-room', JSON.stringify(S.room));
    localStorage.setItem('hp-players', JSON.stringify(S.players));
    localStorage.setItem('hp-myid', S.myPlayerId || '');
    localStorage.setItem('hp-rounds', JSON.stringify(S.rounds));
    localStorage.setItem('hp-scoreboard', JSON.stringify(S.scoreboard));
    localStorage.setItem('hp-currentRound', String(S.currentRound));
    localStorage.setItem('hp-drawn', JSON.stringify(S.drawn));
    localStorage.setItem('hp-theme', S.theme);
    if (S.voiceIndex !== undefined) localStorage.setItem('hp-voice', String(S.voiceIndex));
  } catch (e) {}
}

function load() {
  try {
    S.room = JSON.parse(localStorage.getItem('hp-room')) || null;
    S.players = JSON.parse(localStorage.getItem('hp-players')) || [];
    S.myPlayerId = localStorage.getItem('hp-myid') || null;
    S.rounds = JSON.parse(localStorage.getItem('hp-rounds')) || [];
    S.scoreboard = JSON.parse(localStorage.getItem('hp-scoreboard')) || {};
    S.currentRound = parseInt(localStorage.getItem('hp-currentRound') || '0', 10);
    S.drawn = JSON.parse(localStorage.getItem('hp-drawn')) || [];
    S.theme = localStorage.getItem('hp-theme') || 'dark';
    const vi = localStorage.getItem('hp-voice');
    S.voiceIndex = vi !== null ? parseInt(vi, 10) : undefined;
  } catch (e) {
    S.room = null; S.players = []; S.rounds = []; S.scoreboard = {};
  }
}

// =====================================================
// AUDIO ENGINE
// =====================================================

function getAudioCtx() {
  if (!S.audioCtx) S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (S.audioCtx.state === 'suspended') S.audioCtx.resume();
  return S.audioCtx;
}

function playChime() {
  try {
    const ctx = getAudioCtx(); const now = ctx.currentTime;
    [880, 1100, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = now + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t); osc.stop(t + 0.36);
    });
  } catch (_) {}
}

function playBallDrop() {
  try {
    const ctx = getAudioCtx(); const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    const src = ctx.createBufferSource(); const filter = ctx.createBiquadFilter(); const gain = ctx.createGain();
    src.buffer = buf; filter.type = 'bandpass'; filter.frequency.value = 180; filter.Q.value = 1.2; gain.gain.value = 0.55;
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start(now);
  } catch (_) {}
}

function playWinner() {
  try {
    const ctx = getAudioCtx(); const now = ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
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

function playTick(last = false) {
  try {
    const ctx = getAudioCtx(); const now = ctx.currentTime;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square'; osc.frequency.value = last ? 660 : 440;
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.start(now); osc.stop(now + 0.09);
  } catch (_) {}
}

// =====================================================
// TTS – "Number thirty"
// =====================================================

function loadVoices() {
  if (!window.speechSynthesis) return;
  S.voices = speechSynthesis.getVoices();
}

function pickVoice() {
  // Use saved voice index if available
  if (S.voiceIndex !== undefined && S.voices[S.voiceIndex]) return S.voices[S.voiceIndex];
  const v = S.voices;
  return v.find(x => x.lang.startsWith('en') && x.name.includes('Google'))
      || v.find(x => x.lang.startsWith('en') && x.localService)
      || v.find(x => x.lang.startsWith('en'))
      || v[0] || null;
}

function numberToWords(n) {
  if (n === 0) return 'zero';
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  if (n <= 19) {
    const ones = ['','one','two','three','four','five','six','seven','eight','nine','ten',
                  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
    return ones[n];
  }
  if (n % 10 === 0) return tens[Math.floor(n / 10)];
  return tens[Math.floor(n / 10)] + '-' + (['','','two','three','four','five','six','seven','eight','nine'][n % 10]);
}

function speakNumber(num) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const text = `Number ${numberToWords(num)}`;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85; u.pitch = 1.05; u.volume = 1;
  const voice = pickVoice();
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85; u.pitch = 1.05; u.volume = 1;
  const voice = pickVoice();
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

// =====================================================
// TICKET GENERATION (Tambola 3x9)
// =====================================================

function colRange(col, max) {
  if (max <= 90) {
    const min = col === 0 ? 1 : col * 10;
    const end = col === 8 ? 90 : (col + 1) * 10 - 1;
    return { min, max: Math.min(end, max) };
  }
  const size = Math.ceil(max / 9);
  return { min: col * size + 1, max: Math.min((col + 1) * size, max) };
}

function generateTicket(poolMax = 90) {
  let structure; let tries = 0;
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

  const colRows = {};
  for (let r = 0; r < 3; r++) for (const c of structure[r]) (colRows[c] = colRows[c] || []).push(r);

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
// THEME
// =====================================================

function applyTheme(theme) {
  S.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const btns = qsa('.theme-toggle');
  btns.forEach(b => b.textContent = theme === 'dark' ? '🌙' : '☀️');
  save();
}

function toggleTheme() { applyTheme(S.theme === 'dark' ? 'light' : 'dark'); }

// =====================================================
// SCREEN NAVIGATION
// =====================================================

function showScreen(name) {
  S.screen = name;
  qsa('.screen').forEach(s => s.classList.add('hidden'));
  const el = qs(`#screen-${name}`);
  if (el) el.classList.remove('hidden');

  const topbar = qs('#topbar');
  topbar.classList.toggle('hidden', !['game', 'lobby'].includes(name));

  // Show/hide game controls vs lobby
  const gc = qs('#topbar-game-controls');
  if (gc) gc.style.display = name === 'game' ? '' : 'none';

  const newRoundBtn = qs('#btn-new-round');
  if (newRoundBtn) newRoundBtn.classList.toggle('hidden', name !== 'game');

  const sbBtn = qs('#btn-scoreboard');
  if (sbBtn) sbBtn.classList.toggle('hidden', name === 'landing' || name === 'scoreboard');
}

// =====================================================
// ROOM MANAGEMENT
// =====================================================

function createRoom(hostName, roomName, poolMax, prizeIds, bestOf, entryFee) {
  const code = genCode();
  const hostId = uid();

  S.room = { code, name: roomName, hostId, poolMax, prizeIds, bestOf: parseInt(bestOf), entryFee: parseInt(entryFee) };
  S.players = [{ id: hostId, name: hostName, ticket: null, isHost: true, isLocal: true }];
  S.myPlayerId = hostId;
  S.currentRound = 0;
  S.rounds = [];
  S.drawn = [];
  S.scoreboard = {};

  // Init scoreboard for host
  S.scoreboard[hostId] = { name: hostName, gamesWon: 0, coinsWon: 0, coinsPaid: entryFee };

  // Generate ticket for host
  S.players[0].ticket = generateTicket(S.room.poolMax);

  initChannel();
  save();
  broadcastState();
  showLobby();
}

function joinRoom(code, playerName) {
  code = code.toUpperCase().trim();
  // Check if room exists locally (for local multiplayer)
  // In local mode, joining means adding yourself to the room's player list
  if (!S.room || S.room.code !== code) {
    // For local multiplayer: create a "remote" view of the room
    // In practice, the host shares the code and players join on the same device or via BroadcastChannel
    // For simplicity, we'll add the player to the existing room
    toast('Room not found. Make sure you have the correct code.');
    return false;
  }

  const playerId = uid();
  const ticket = generateTicket(S.room.poolMax);
  const player = { id: playerId, name: playerName, ticket, isHost: false, isLocal: true };

  S.players.push(player);
  S.myPlayerId = playerId;
  S.scoreboard[playerId] = { name: playerName, gamesWon: 0, coinsWon: 0, coinsPaid: S.room.entryFee };

  initChannel();
  save();
  broadcastState();
  showLobby();
  return true;
}

function showLobby() {
  showScreen('lobby');
  const r = S.room;
  if (!r) return;

  qs('#lb-room-name').textContent = r.name;
  qs('#lb-code-text').textContent = r.code;

  const inviteUrl = `${location.origin}${location.pathname}#room=${r.code}`;
  qs('#lb-link-box').textContent = inviteUrl;

  renderLobbyPlayers();

  qs('#lb-pool-info').textContent = `Pool: 1–${r.poolMax}`;
  qs('#lb-best-of').textContent = `Best of ${r.bestOf}`;
  qs('#lb-entry-fee').textContent = `Entry: ${r.entryFee} coin${r.entryFee !== 1 ? 's' : ''}`;

  const isHost = S.players.find(p => p.id === S.myPlayerId)?.isHost;
  const startBtn = qs('#btn-start-game');
  startBtn.disabled = S.players.length < 1;
  startBtn.textContent = isHost
    ? (S.players.length < 2 ? 'Start Game (need 2+ players)' : 'Start Game')
    : 'Waiting for host to start...';
  if (!isHost) startBtn.disabled = true;

  // Update topbar
  qs('#tb-room-name').textContent = r.name;
  qs('#tb-room-code').textContent = r.code;
}

function renderLobbyPlayers() {
  const list = qs('#lb-player-list');
  qs('#lb-player-count').textContent = S.players.length;

  list.innerHTML = S.players.map(p => `
    <div class="lobby-player ${p.isHost ? 'is-host' : ''}">
      <div class="lobby-player-avatar">${p.name[0].toUpperCase()}</div>
      <div class="lobby-player-name">${esc(p.name)}</div>
      ${p.isHost ? '<div class="lobby-player-host">HOST</div>' : ''}
    </div>
  `).join('');
}

// =====================================================
// BROADCASTCHANNEL – local multiplayer sync
// =====================================================

function initChannel() {
  if (S.channel) S.channel.close();
  if (!S.room) return;
  try {
    S.channel = new BroadcastChannel(`housie-${S.room.code}`);
    S.channel.onmessage = (e) => handleBroadcast(e.data);
  } catch (_) {}
}

function broadcastState() {
  if (!S.channel) return;
  try {
    S.channel.postMessage({
      type: 'state-sync',
      room: S.room,
      players: S.players,
      rounds: S.rounds,
      scoreboard: S.scoreboard,
      currentRound: S.currentRound,
      drawn: S.drawn,
    });
  } catch (_) {}
}

function handleBroadcast(msg) {
  if (msg.type === 'state-sync') {
    // Merge remote state (remote is authoritative for room data)
    if (msg.room) S.room = msg.room;
    // Merge players (keep local ticket data)
    if (msg.players) {
      const localMap = new Map(S.players.filter(p => p.isLocal).map(p => [p.id, p]));
      S.players = msg.players.map(rp => {
        const local = localMap.get(rp.id);
        return local ? { ...rp, ticket: local.ticket, isLocal: true } : { ...rp, isLocal: false };
      });
      // Add any local players not in remote list
      for (const [id, lp] of localMap) {
        if (!S.players.find(p => p.id === id)) S.players.push(lp);
      }
    }
    if (msg.rounds) S.rounds = msg.rounds;
    if (msg.scoreboard) S.scoreboard = msg.scoreboard;
    if (msg.currentRound !== undefined) S.currentRound = msg.currentRound;
    if (msg.drawn) S.drawn = msg.drawn;

    // Update UI based on current screen
    if (S.screen === 'lobby') renderLobbyPlayers();
    if (S.screen === 'game') renderAll();
    save();
  } else if (msg.type === 'player-joined') {
    if (S.screen === 'lobby') renderLobbyPlayers();
    toast(`${msg.playerName} joined the room!`);
  } else if (msg.type === 'game-started') {
    startGameFromState(msg);
  } else if (msg.type === 'number-drawn') {
    handleRemoteDraw(msg.num);
  } else if (msg.type === 'prize-awarded') {
    handleRemotePrize(msg.prizeId, msg.playerId);
  }
}

// =====================================================
// GAME ENGINE
// =====================================================

function startGame() {
  const r = S.room;
  if (!r || S.players.length < 2) { toast('Need at least 2 players!'); return; }

  S.currentRound = 1;
  S.drawn = [];
  S.pool = buildPool(r.poolMax);
  S.rounds = [];

  startRound();

  if (S.channel) {
    S.channel.postMessage({ type: 'game-started', room: S.room });
  }

  showScreen('game');
  renderAll();
}

function startGameFromState(msg) {
  showScreen('game');
  renderAll();
}

function startRound() {
  const r = S.room;
  S.drawn = [];
  S.pool = buildPool(r.poolMax);

  // Build prize state for this round
  const roundPrizes = r.prizeIds.map(pid => {
    const p = ALL_PRIZES.find(x => x.id === pid) || {};
    return { ...p, winnerId: null, wonAt: null };
  });

  // Create round entry
  const round = {
    roundNo: S.currentRound,
    drawn: [],
    prizes: roundPrizes,
    completed: false,
  };

  // If round already exists (resuming), use it
  const existing = S.rounds.find(rn => rn.roundNo === S.currentRound);
  if (existing) {
    S.drawn = [...existing.drawn];
    S.pool = buildPool(r.poolMax, existing.drawn);
  } else {
    S.rounds.push(round);
  }

  save();
  renderAll();
  updateCurrentNumber();
}

function drawNumber() {
  const r = S.room;
  if (!r) { toast('No active game!'); return null; }
  if (!S.pool.length) { toast('All numbers drawn! Round complete.'); stopAuto(); return null; }

  const num = S.pool.pop();
  S.drawn.push(num);

  // Update current round data
  const curRound = S.rounds.find(rn => rn.roundNo === S.currentRound);
  if (curRound) curRound.drawn = [...S.drawn];

  save();

  // Sound + Enhanced TTS
  playBallDrop();
  setTimeout(() => {
    playChime();
    setTimeout(() => speakNumber(num), 250);
  }, 120);

  // Broadcast
  if (S.channel) {
    S.channel.postMessage({ type: 'number-drawn', num });
  }

  // UI
  animateNumber(num);
  updateBoard(num);
  updateStats();
  renderPrevStrip();
  renderRoundList();

  return num;
}

function handleRemoteDraw(num) {
  if (S.drawn.includes(num)) return;
  S.drawn.push(num);
  const curRound = S.rounds.find(rn => rn.roundNo === S.currentRound);
  if (curRound) curRound.drawn = [...S.drawn];
  save();
  animateNumber(num);
  updateBoard(num);
  updateStats();
  renderPrevStrip();
  renderRoundList();
}

function animateNumber(num) {
  const el = qs('#num-display');
  el.textContent = num;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function updateCurrentNumber() {
  qs('#num-display').textContent = S.drawn.length ? S.drawn[S.drawn.length - 1] : '–';
  qs('#game-label').textContent = S.room ? `Round ${S.currentRound} of ${S.room.bestOf}` : '–';
}

// =====================================================
// AUTO-DRAW + TIMER
// =====================================================

function getSpeed() { return parseInt(qs('#auto-speed')?.value || '3000', 10); }

function startAuto() {
  if (S.timerTick) return;
  const speed = getSpeed();
  S.timerRemain = Math.floor(speed / 1000);

  S.timerTick = setInterval(() => {
    S.timerRemain--;
    if (S.timerRemain <= 3 && S.timerRemain > 0) playTick(S.timerRemain === 1);
    if (S.timerRemain <= 0) {
      const num = drawNumber();
      if (num === null) { stopAuto(); return; }
      S.timerRemain = Math.floor(getSpeed() / 1000);
    }
  }, 1000);

  qs('#btn-auto').classList.add('active');
  qs('#btn-auto').innerHTML = '⏸&nbsp; Pause';
}

function stopAuto() {
  clearInterval(S.timerTick);
  S.timerTick = null;
  S.timerRemain = 0;
  const btn = qs('#btn-auto');
  if (btn) { btn.classList.remove('active'); btn.innerHTML = '▶&nbsp; Auto'; }
}

function toggleAuto() { S.timerTick ? stopAuto() : startAuto(); }

// =====================================================
// PRIZE MANAGEMENT
// =====================================================

function awardPrize(prizeId, playerId) {
  const curRound = S.rounds.find(rn => rn.roundNo === S.currentRound);
  if (!curRound) return;

  const prize = curRound.prizes.find(p => p.id === prizeId);
  const player = S.players.find(p => p.id === playerId);
  if (!prize || !player || prize.winnerId) return;

  prize.winnerId = playerId;
  prize.wonAt = S.drawn.length;
  save();

  // Update scoreboard
  if (S.scoreboard[playerId]) {
    S.scoreboard[playerId].coinsWon += S.room.entryFee * 2; // Winner gets entry fee x2
  }

  playWinner();
  speak(`Winner! ${player.name} wins ${prize.name}!`);
  showWinnerModal(player.name, prize.name, prize.icon, prize.wonAt);

  if (S.channel) {
    S.channel.postMessage({ type: 'prize-awarded', prizeId, playerId });
  }

  renderPrizes();
  renderRoundList();
}

function handleRemotePrize(prizeId, playerId) {
  awardPrize(prizeId, playerId);
}

function completeRound() {
  const curRound = S.rounds.find(rn => rn.roundNo === S.currentRound);
  if (curRound) curRound.completed = true;

  // Mark round winner in scoreboard
  const fhPrize = curRound.prizes.find(p => p.id === 'full-house');
  if (fhPrize && fhPrize.winnerId && S.scoreboard[fhPrize.winnerId]) {
    S.scoreboard[fhPrize.winnerId].gamesWon++;
  }

  save();

  // Show round over modal
  showRoundOverModal();

  if (S.channel) {
    S.channel.postMessage({ type: 'state-sync', room: S.room, players: S.players, rounds: S.rounds, scoreboard: S.scoreboard, currentRound: S.currentRound, drawn: S.drawn });
  }
}

function nextRound() {
  if (S.currentRound >= S.room.bestOf) {
    // Tournament complete
    showScoreboard();
    return;
  }
  S.currentRound++;
  stopAuto();
  startRound();
  closeModal('modal-round-over');
  showScreen('game');
  renderAll();
}

function resetRound() {
  S.drawn = [];
  S.pool = buildPool(S.room.poolMax);
  const curRound = S.rounds.find(rn => rn.roundNo === S.currentRound);
  if (curRound) {
    curRound.drawn = [];
    curRound.prizes.forEach(p => { p.winnerId = null; p.wonAt = null; });
  }
  save();
  qs('#num-display').textContent = '–';
  qs('#prev-strip').innerHTML = '';
  qs('#progress-fill').style.width = '0%';
  renderAll();
}

// =====================================================
// UI – BOARD
// =====================================================

function renderBoard() {
  const max = S.room ? S.room.poolMax : 90;
  const drawn = new Set(S.drawn);
  const board = qs('#number-board');

  // Always 10 columns: 1-10, 11-20, etc.
  board.style.gridTemplateColumns = 'repeat(10, 1fr)';
  board.classList.toggle('board-lg', max <= 50);

  board.innerHTML = '';
  for (let n = 1; n <= max; n++) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    cell.id = `cell-${n}`;
    cell.textContent = n;
    if (drawn.has(n)) {
      cell.classList.add('called');
    }
    board.appendChild(cell);
  }
}

function updateBoard(num) {
  const cell = qs(`#cell-${num}`);
  if (!cell) return;
  cell.classList.add('called', 'just-called');
  setTimeout(() => cell.classList.remove('just-called'), 800);
}

// =====================================================
// UI – STATS
// =====================================================

function updateStats() {
  const max = S.room ? S.room.poolMax : 90;
  const called = S.drawn.length;
  const remaining = max - called;
  const pct = Math.round((called / max) * 100);
  qs('#stat-called').textContent = `Called: ${called}`;
  qs('#stat-remain').textContent = `Remaining: ${remaining}`;
  qs('#stat-pct').textContent = `${pct}%`;
  qs('#progress-text').textContent = `${called} / ${max} drawn`;
  qs('#progress-fill').style.width = `${pct}%`;

  // Auto-complete round when all numbers drawn
  if (called >= max) {
    stopAuto();
    setTimeout(() => completeRound(), 1200);
  }
}

// =====================================================
// UI – PREV STRIP
// =====================================================

function renderPrevStrip() {
  const last5 = S.drawn.slice(-6, -1).reverse();
  qs('#prev-strip').innerHTML = last5.map(n => {
    return `<span class="prev-num">${n}</span>`;
  }).join('');
}

// =====================================================
// UI – ROUND LIST (left sidebar)
// =====================================================

function renderRoundList() {
  const list = qs('#round-list');
  qs('#round-count').textContent = S.rounds.length;

  if (!S.rounds.length) {
    list.innerHTML = '<p class="hint-text">No rounds yet</p>';
    return;
  }

  list.innerHTML = S.rounds.map(rn => {
    const fhPrize = rn.prizes.find(p => p.id === 'full-house');
    const winner = fhPrize?.winnerId ? S.players.find(p => p.id === fhPrize.winnerId) : null;
    const wonCount = rn.prizes.filter(p => p.winnerId).length;
    return `
      <div class="game-item ${rn.roundNo === S.currentRound ? 'active' : ''} ${rn.completed ? 'completed' : ''}">
        <div class="gi-name">Round ${rn.roundNo}</div>
        <div class="gi-meta">
          <span>${rn.drawn.length}/${S.room.poolMax} drawn</span>
          ${wonCount ? `<span style="color:var(--amber)">${wonCount} prize${wonCount > 1 ? 's' : ''}</span>` : ''}
        </div>
        ${winner ? `<div class="gi-meta"><span style="color:var(--green)">🏆 ${esc(winner.name)}</span></div>` : ''}
      </div>`;
  }).join('');
}

// =====================================================
// UI – PLAYERS
// =====================================================

function renderPlayers() {
  const list = qs('#player-list');
  qs('#game-player-count').textContent = S.players.length;

  if (!S.players.length) { list.innerHTML = '<p class="hint-text">No players</p>'; return; }

  list.innerHTML = S.players.map(p => {
    const curRound = S.rounds.find(rn => rn.roundNo === S.currentRound);
    const wins = curRound ? curRound.prizes.filter(pr => pr.winnerId === p.id).map(pr => pr.icon).join(' ') : '';
    const score = S.scoreboard[p.id];
    return `
      <div class="player-card" id="pc-${p.id}">
        <div class="player-avatar">${p.name[0].toUpperCase()}</div>
        <div class="player-info">
          <div class="player-name">${esc(p.name)} ${p.id === S.myPlayerId ? '<span style="color:var(--cyan);font-size:10px">(You)</span>' : ''}</div>
          ${wins ? `<div class="player-wins">${wins} This Round</div>` : ''}
          ${score ? `<div style="font-size:10px;color:var(--t3)">💰 ${score.coinsWon - score.coinsPaid} net coins</div>` : ''}
        </div>
        <div class="player-actions">
          ${p.ticket ? `<button class="btn btn-xs btn-outline" onclick="showTicket('${p.id}')">🎫</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

// =====================================================
// UI – PRIZES
// =====================================================

function renderPrizes() {
  const list = qs('#prize-list');
  const curRound = S.rounds.find(rn => rn.roundNo === S.currentRound);
  if (!curRound) { list.innerHTML = '<p class="hint-text">No active round</p>'; return; }

  list.innerHTML = curRound.prizes.map(p => {
    const winner = p.winnerId ? S.players.find(pl => pl.id === p.winnerId) : null;
    const playerBtns = !winner && S.players.length
      ? `<div class="prize-btn-row">${S.players.map(pl =>
          `<button class="btn btn-xs btn-green prize-claim"
                   onclick="awardPrize('${p.id}','${pl.id}')"
                   title="Award ${p.name} to ${esc(pl.name)}">
             ${esc(pl.name)}
           </button>`).join('')}</div>`
      : (!winner && !S.players.length) ? '<p class="hint-text" style="padding:3px 0">No players</p>' : '';

    return `
      <div class="prize-card ${winner ? 'won' : ''}">
        <div class="prize-row">
          <span class="prize-icon">${p.icon}</span>
          <span class="prize-name">${p.name}</span>
          ${p.wonAt ? `<span class="prize-at">call #${p.wonAt}</span>` : ''}
        </div>
        ${winner ? `<div class="prize-winner-name">🏆 ${esc(winner.name)}</div>` : playerBtns}
      </div>`;
  }).join('');
}

// =====================================================
// UI – HISTORY
// =====================================================

function renderHistory() {
  const el = qs('#game-history');
  const completed = S.rounds.filter(r => r.completed);
  if (!completed.length) { el.innerHTML = '<p class="hint-text">No completed rounds yet</p>'; return; }

  el.innerHTML = completed.map(rn => {
    const winners = rn.prizes.filter(p => p.winnerId).map(p => {
      const w = S.players.find(pl => pl.id === p.winnerId);
      return `<div class="hist-prize">${p.icon} ${p.name}: <strong>${w ? esc(w.name) : '?'}</strong> (call #${p.wonAt})</div>`;
    }).join('');
    return `
      <div class="hist-item">
        <div class="hist-game">Round ${rn.roundNo}</div>
        ${winners || '<div class="hist-prize">No prizes claimed</div>'}
      </div>`;
  }).join('');
}

// =====================================================
// TICKET DISPLAY
// =====================================================

function showTicket(playerId) {
  const p = S.players.find(x => x.id === playerId);
  if (!p || !p.ticket) return;
  const max = S.room ? S.room.poolMax : 90;
  qs('#ticket-title').textContent = `${p.name}'s Ticket`;
  qs('#ticket-display').innerHTML = buildTicketHTML(p.ticket, S.drawn, max);
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
        const marked = drawnSet.has(num);
        html += `<td class="ticket-td ${marked ? 't-called' : ''}">${num}</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// =====================================================
// MODALS
// =====================================================

function openModal(id) { qs(`#${id}`).classList.remove('hidden'); }
function closeModal(id) { qs(`#${id}`).classList.add('hidden'); }

function showWinnerModal(playerName, prizeName, icon, callNo) {
  qs('#winner-burst').textContent = icon || '🎉';
  qs('#winner-info').innerHTML = `
    <div class="w-player">${esc(playerName)}</div>
    <div class="w-prize">${esc(prizeName)}</div>
    <div class="w-call">at call #${callNo}</div>`;
  openModal('modal-winner');
}

function showRoundOverModal() {
  const curRound = S.rounds.find(rn => rn.roundNo === S.currentRound);
  const winners = curRound ? curRound.prizes.filter(p => p.winnerId).map(p => {
    const w = S.players.find(pl => pl.id === p.winnerId);
    return `<div style="margin:4px 0;font-size:13px">${p.icon} <strong>${p.name}</strong>: ${w ? esc(w.name) : '?'}</div>`;
  }).join('') : '';

  qs('#round-over-info').innerHTML = winners || '<div style="color:var(--t3)">No prizes claimed this round</div>';

  const isLast = S.currentRound >= S.room.bestOf;
  qs('#btn-next-round').textContent = isLast ? 'View Final Scoreboard' : 'Next Round →';
  qs('#btn-next-round').onclick = isLast ? () => { closeModal('modal-round-over'); showScoreboard(); } : nextRound;

  openModal('modal-round-over');
}

// =====================================================
// SCOREBOARD
// =====================================================

function showScoreboard() {
  showScreen('scoreboard');
  stopAuto();

  const r = S.room;
  if (!r) return;

  qs('#sb-room-info').innerHTML = `<strong>${esc(r.name)}</strong> &middot; Code: ${r.code} &middot; Pool: 1–${r.poolMax} &middot; Best of ${r.bestOf}`;

  // Summary stats
  const totalRounds = S.rounds.filter(rn => rn.completed).length;
  const totalPrizes = S.rounds.reduce((sum, rn) => sum + rn.prizes.filter(p => p.winnerId).length, 0);
  qs('#sb-summary').innerHTML = `
    <div class="sb-stat"><div class="sb-stat-val">${totalRounds}</div><div class="sb-stat-label">Rounds</div></div>
    <div class="sb-stat"><div class="sb-stat-val">${S.players.length}</div><div class="sb-stat-label">Players</div></div>
    <div class="sb-stat"><div class="sb-stat-val">${totalPrizes}</div><div class="sb-stat-label">Prizes Won</div></div>
    <div class="sb-stat"><div class="sb-stat-val">${r.entryFee * S.players.length}</div><div class="sb-stat-label">Total Coins</div></div>`;

  // Sort players by games won, then coins
  const sorted = S.players.map(p => {
    const sc = S.scoreboard[p.id] || { name: p.name, gamesWon: 0, coinsWon: 0, coinsPaid: r.entryFee };
    return { ...p, ...sc, netCoins: (sc.coinsWon || 0) - (sc.coinsPaid || r.entryFee) };
  }).sort((a, b) => b.gamesWon - a.gamesWon || b.netCoins - a.netCoins);

  const tbody = qs('#sb-body');
  tbody.innerHTML = sorted.map((p, i) => `
    <tr>
      <td class="sb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${p.gamesWon}</td>
      <td>${p.coinsWon}</td>
      <td class="${p.netCoins >= 0 ? 'sb-coins-pos' : 'sb-coins-neg'}">${p.netCoins >= 0 ? '+' : ''}${p.netCoins}</td>
    </tr>
  `).join('');

  // Per-round breakdown
  const gamesList = qs('#sb-games-list');
  gamesList.innerHTML = '<h3 style="font-size:14px;color:var(--t2);margin-bottom:10px">Round-by-Round Results</h3>' +
    S.rounds.map(rn => {
      const winners = rn.prizes.filter(p => p.winnerId).map(p => {
        const w = S.players.find(pl => pl.id === p.winnerId);
        return `<div class="sb-game-result">${p.icon} ${p.name}: <strong>${w ? esc(w.name) : '?'}</strong></div>`;
      }).join('');
      return `
        <div class="sb-game-card">
          <div class="sb-game-title">Round ${rn.roundNo} ${rn.completed ? '✓' : '(in progress)'}</div>
          ${winners || '<div class="sb-game-result" style="color:var(--t3)">No prizes claimed</div>'}
        </div>`;
    }).join('');
}

// =====================================================
// RENDER ALL
// =====================================================

function renderAll() {
  renderBoard();
  renderRoundList();
  renderPlayers();
  renderPrizes();
  renderHistory();
  updateStats();
  renderPrevStrip();
  updateCurrentNumber();
}

// =====================================================
// VOICE SELECTOR
// =====================================================

function populateVoiceSelector() {
  const sel = qs('#voice-select');
  if (!sel) return;
  sel.innerHTML = '';
  const en = S.voices.filter(v => v.lang.startsWith('en'));
  const all = en.length ? en : S.voices.slice(0, 8);
  all.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = S.voices.indexOf(v);
    opt.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(opt);
  });
  if (S.voiceIndex !== undefined && sel.querySelector(`option[value="${S.voiceIndex}"]`)) {
    sel.value = S.voiceIndex;
  }
}

// =====================================================
// ADD PLAYER MODAL
// =====================================================

function openAddPlayerModal() {
  qs('#new-player-name').value = '';
  qs('#gen-ticket').checked = true;
  openModal('modal-add-player');
  setTimeout(() => qs('#new-player-name').focus(), 60);
}

// =====================================================
// EVENT LISTENERS
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
  load();
  applyTheme(S.theme);

  // ── Theme toggles ──
  qsa('.theme-toggle').forEach(btn => btn.addEventListener('click', toggleTheme));

  // ── Voice selector ──
  loadVoices();
  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = () => { loadVoices(); populateVoiceSelector(); };
  }
  setTimeout(populateVoiceSelector, 300);
  qs('#voice-select')?.addEventListener('change', e => {
    S.voiceIndex = parseInt(e.target.value, 10);
    save();
    toast('Voice updated');
  });

  // ── Mid-game share button ──
  qs('#btn-share-game')?.addEventListener('click', () => {
    if (!S.room) return;
    const url = `${location.origin}${location.pathname}#room=${S.room.code}`;
    navigator.clipboard?.writeText(url).then(() => toast('Invite link copied!'))
      .catch(() => toast(`Room code: ${S.room.code}`));
  });

  // ── Landing buttons ──
  qs('#btn-create-room').addEventListener('click', () => {
    showScreen('create');
    buildPrizeSelector();
    qs('#cr-host-name').focus();
  });
  qs('#btn-join-room').addEventListener('click', () => {
    showScreen('join');
    // Pre-fill code from URL if present
    const hash = location.hash;
    if (hash.startsWith('#room=')) {
      qs('#jn-code').value = hash.slice(6).toUpperCase();
    }
    qs('#jn-code').focus();
  });

  // ── Create Room ──
  qs('#btn-back-create').addEventListener('click', () => showScreen('landing'));
  qs('#btn-cancel-create').addEventListener('click', () => showScreen('landing'));

  qs('#btn-do-create').addEventListener('click', () => {
    const hostName = qs('#cr-host-name').value.trim();
    const roomName = qs('#cr-room-name').value.trim() || `Housie Room`;
    const poolV = qs('input[name="crpool"]:checked')?.value || '90';
    const pool = poolV === 'custom'
      ? Math.max(10, parseInt(qs('#cr-custom-pool').value, 10) || 90)
      : parseInt(poolV, 10);
    const prizeIds = [...qsa('#cr-prizes input[type=checkbox]:checked')].map(el => el.value);
    const bestOf = Math.max(1, parseInt(qs('#cr-best-of').value, 10) || 5);
    const entryFee = qs('#cr-entry-fee').value;

    if (!hostName) { toast('Enter your name'); return; }
    if (!prizeIds.length) { toast('Select at least one prize'); return; }

    createRoom(hostName, roomName, pool, prizeIds, bestOf, entryFee);
  });

  qs('#cr-host-name').addEventListener('keydown', e => { if (e.key === 'Enter') qs('#btn-do-create').click(); });

  // ── Join Room ──
  qs('#btn-back-join').addEventListener('click', () => showScreen('landing'));
  qs('#btn-cancel-join').addEventListener('click', () => showScreen('landing'));

  qs('#btn-do-join').addEventListener('click', () => {
    const code = qs('#jn-code').value.trim();
    const name = qs('#jn-name').value.trim();
    if (!code) { toast('Enter room code'); return; }
    if (!name) { toast('Enter your name'); return; }
    joinRoom(code, name);
  });

  qs('#jn-code').addEventListener('keydown', e => { if (e.key === 'Enter') qs('#jn-name').focus(); });
  qs('#jn-name').addEventListener('keydown', e => { if (e.key === 'Enter') qs('#btn-do-join').click(); });

  // ── Lobby ──
  qs('#btn-copy-code').addEventListener('click', () => {
    navigator.clipboard?.writeText(S.room?.code || '').then(() => toast('Code copied!'));
  });
  qs('#btn-copy-link').addEventListener('click', () => {
    const url = `${location.origin}${location.pathname}#room=${S.room?.code || ''}`;
    navigator.clipboard?.writeText(url).then(() => toast('Link copied!'));
  });
  qs('#btn-start-game').addEventListener('click', startGame);
  qs('#btn-lobby-add-player').addEventListener('click', () => openAddPlayerModal());

  // ── Game controls ──
  qs('#btn-draw').addEventListener('click', () => drawNumber());
  qs('#btn-auto').addEventListener('click', () => toggleAuto());
  qs('#btn-reset').addEventListener('click', () => {
    if (confirm('Reset this round? All drawn numbers will be cleared.')) resetRound();
  });
  qs('#btn-new-round').addEventListener('click', nextRound);

  qs('#btn-scoreboard').addEventListener('click', showScoreboard);
  qs('#btn-back-score').addEventListener('click', () => {
    if (S.room) showScreen('game');
    else showScreen('landing');
  });

  // ── Pool preset ──
  qs('#pool-preset')?.addEventListener('change', e => {
    if (S.room) {
      S.room.poolMax = parseInt(e.target.value, 10);
      save();
      renderAll();
    }
  });

  // ── Add Player ──
  qs('#btn-lobby-add-player')?.addEventListener('click', () => openAddPlayerModal());
  qs('#btn-game-add-player')?.addEventListener('click', () => openAddPlayerModal());

  qs('#btn-create-player').addEventListener('click', () => {
    const name = qs('#new-player-name').value.trim();
    if (!name) { toast('Enter player name'); return; }
    const playerId = uid();
    const ticket = qs('#gen-ticket').checked ? generateTicket(S.room.poolMax) : null;
    S.players.push({ id: playerId, name, ticket, isHost: false, isLocal: true });
    S.scoreboard[playerId] = { name, gamesWon: 0, coinsWon: 0, coinsPaid: S.room.entryFee };
    save();
    broadcastState();
    closeModal('modal-add-player');
    renderPlayers();
    renderLobbyPlayers();
  });
  qs('#new-player-name').addEventListener('keydown', e => { if (e.key === 'Enter') qs('#btn-create-player').click(); });

  // ── Ticket print ──
  qs('#btn-print-ticket').addEventListener('click', () => window.print());

  // ── Winner modal ──
  qs('#btn-close-winner').addEventListener('click', () => closeModal('modal-winner'));

  // ── Modal close buttons ──
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-close]');
    if (t) closeModal(t.dataset.close);
    if (e.target.classList.contains('modal-overlay')) {
      const modal = e.target.querySelector('.modal');
      if (!modal || !modal.contains(e.target)) closeModal(e.target.id);
    }
  });

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space' && S.screen === 'game') { e.preventDefault(); drawNumber(); }
    if ((e.key === 'a' || e.key === 'A') && S.screen === 'game') toggleAuto();
    if (e.key === 'Escape') {
      qsa('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
      stopAuto();
    }
  });

  // ── Auto-fill code from URL hash ──
  const hash = location.hash;
  if (hash.startsWith('#room=')) {
    const code = hash.slice(6).toUpperCase();
    showScreen('join');
    qs('#jn-code').value = code;
  }

  // ── Resume session if room exists ──
  if (S.room && S.myPlayerId) {
    initChannel();
    if (S.currentRound > 0 && S.rounds.length) {
      showScreen('game');
      S.pool = buildPool(S.room.poolMax, S.drawn);
      renderAll();
    } else {
      showLobby();
    }
  }

  // ── Mobile sidebar toggle ──
  qs('.sidebar-right')?.addEventListener('click', function(e) {
    if (window.innerWidth <= 768 && e.target === this) {
      this.classList.toggle('open');
    }
  });

  // ── Warm up audio ──
  document.addEventListener('pointerdown', () => getAudioCtx(), { once: true });
});

// =====================================================
// BUILD PRIZE SELECTOR (create room form)
// =====================================================

function buildPrizeSelector() {
  const container = qs('#cr-prizes');
  container.innerHTML = ALL_PRIZES.map(p => `
    <label class="prize-check-row">
      <input type="checkbox" value="${p.id}" ${DEFAULT_PRIZE_IDS.includes(p.id) ? 'checked' : ''}>
      <span class="prize-icon">${p.icon}</span>
      <span class="prize-check-info">
        <span class="prize-check-name">${p.name}</span>
        <span class="prize-check-desc">${p.desc}</span>
      </span>
    </label>
  `).join('');
}
