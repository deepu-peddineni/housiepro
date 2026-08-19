# HousiePro

Professional Tambola / Housie game manager — a static single-page app deployed on GitHub Pages.

**Live:** [deepu-peddineni.github.io/housiepro](https://deepu-peddineni.github.io/housiepro/)

---

## Features

### Core Gameplay
- **Room-based multiplayer** — Create a room, share a 6-character invite code, players join via link or code
- **Number drawing** — Dramatic reveal animation with red→green lifecycle (red while announcing, green once settled)
- **Auto-draw** — Configurable interval (1s–8s) with countdown bar between draws
- **Tambola ticket generation** — 3×9 grid tickets with proper column ranges (1–10, 11–20, etc.)
- **Multiple rounds** — "Best of N" format (configurable 1–99 rounds per game)

### Game Modes
| Mode | Description |
|------|-------------|
| 📱 **Digital** | On-screen Tambola tickets generated for all players, auto-tracking of called numbers |
| 📄 **Paper** | Physical tickets — host tracks manually, no digital tickets generated for players |

### Prizes
Configurable prize selection per game:
- ⚡ Early Five — First to mark any 5 numbers
- 🔝 Top Row — All 5 numbers in top row
- ⬛ Middle Row — All 5 numbers in middle row
- ⬇️ Bottom Row — All 5 numbers in bottom row
- 🏆 Full House — All 15 numbers on ticket
- 🔲 Four Corners — 4 corner numbers
- 💨 Jaldi Five — First 5 numbers anywhere
- 🌟 Star — 4 corners + centre
- 🥈 2nd Full House — 2nd player to complete full house

Multiple winners per prize are supported (especially useful in Paper mode).

### Coin System
- Entry fee per player (configurable 0–100 coins)
- Winners earn 2× entry fee per prize
- Net coins tracked across all rounds

### Scoreboard
- Live mini-scoreboard in the right sidebar during gameplay
- Full scoreboard modal with:
  - Player rankings (by wins, then net coins)
  - Round-by-round results with winners
  - Summary stats (total rounds, players, prizes, coins)

### Voice Announcements
- Text-to-speech: "Number thirty", "Winner! Alice wins Full House!"
- Voice selector saved to localStorage
- Supports all browser voices (English preferred)

### Sound Effects
- Ball drop sound (white noise burst)
- Chime (ascending sine tones)
- Tick countdown (last 3 seconds of auto-draw)
- Winner fanfare (triangle wave arpeggio)

### Number Board
- Compact 10-column grid (1–10, 11–20, ... 81–90)
- Responsive to pool size (10, 50, 75, 90, 100, or custom)
- Called numbers highlighted in green
- Recently drawn number pulses on the board

### Theme
- Dark mode (default) — Deep purple/cyan gradient aesthetic
- Light mode — Clean white with stronger green for visibility
- Toggle via moon/sun icon
- Saved to localStorage

### Responsive Design
- **Desktop** (1024px+) — Three-column layout: rounds sidebar, main board, players/prizes sidebar
- **Tablet** (768px–1024px) — Narrower sidebars
- **Mobile** (≤768px) — Single column, collapsible bottom panel for players/score
- **Small mobile** (≤480px) — Reduced sizes for number ring and board

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Draw next number |
| `A` | Toggle auto-draw |
| `R` | Reset current round |
| `Escape` | Close modals / settings panel / stop auto-draw |

---

## Session Management

| Action | Behavior |
|--------|----------|
| **Refresh browser** | Session is **restored** from localStorage — you continue where you left off |
| **🏠 Home button** (topbar) | Clears session, returns to landing page (requires confirmation) |
| **Open invite link** | Redirects to Join Room screen with code pre-filled |
| **New game** | Leave current room via 🏠, then create a new room from landing |

---

## Architecture

```
housiepro/
├── index.html      # Single HTML file with all screens and modals
├── style.css       # All CSS — tokens, components, responsive, print
├── app.js          # All JavaScript — state, engine, UI, persistence
├── .nojekyll       # Disables Jekyll processing on GitHub Pages
└── README.md       # This file
```

- **No build step** — Plain HTML/CSS/JS, no frameworks or bundlers
- **No server** — Everything runs client-side
- **localStorage** persistence — All game state saved automatically
- **BroadcastChannel** — Local multi-tab multiplayer sync (open 2 browser tabs in the same room)

---

## Multiplayer

The current multiplayer model is **local** (same device or same network via BroadcastChannel):

1. **Host** creates a room and shares the invite code
2. **Players** join by entering the code on the same device (or a different tab)
3. **BroadcastChannel** syncs state between tabs in real-time

For remote multiplayer across different devices, a backend (WebSocket server) would be needed.

---

## Deployment

This is a static site — deploy to any static hosting:

### GitHub Pages
```bash
# Push to main branch, GitHub Pages serves automatically
git push origin main
```

### Other hosting
Simply serve the 4 files (`index.html`, `style.css`, `app.js`, `.nojekyll`) from any HTTP server.

---

## Changelog

### v2.1 (Latest)
- 🏠 Home button — Leave game and return to landing (with confirmation)
- Session restore on refresh — localStorage persistence
- Pool sync — Settings panel dropdown reflects actual room pool
- Compact number board — No scrollbars, cells sized to fit
- Dramatic number reveal — Multi-stage animation with ring glow flash
- Last 10 numbers — Previous numbers strip shows last 10 instead of 5
- Digital/Paper mode toggle in room creation
- Scoreboard as modal overlay with round-by-round breakdown
- Invite modal with auto-copy
- Multiple winners per prize
- Light mode green visibility fix
- Ticket column headers (1–10, 11–20, etc.)

### v2.0
- Room-based architecture with alphanumeric invite codes
- TTS voice announcements
- Voice selector with localStorage persistence
- Auto-draw with countdown bar
- Coin-based scoring system
- Responsive design (mobile/tablet/desktop)
- Theme toggle (dark/light)
- Keyboard shortcuts

### v1.0
- Basic Tambola number drawing
- Single-player mode
- Number board display

---

## License

Personal project — not open source.
