# Housie Game Website

Single-file HTML+CSS+JS. No framework. Premium dark UI.

## Features

### Core Game
- Configurable number pool: 1–90 (classic Tambola), 1–100, or custom max
- Number draw: manual click or auto-draw with speed control (1s / 2s / 5s)
- Vocal announcement via Web Speech API (TTS built-in browsers)
- Drawn number display: large center callout + full board grid showing called/uncalled
- Last 5 numbers shown in sidebar
- Shuffle/randomize pool on new game

### Player & Game Session Management
- Multi-game sessions: "Game 1", "Game 2", … (named or auto-numbered)
- Per game: add players with names
- Track winners per prize category:
  - Early Five (first to mark 5)
  - Top Row
  - Middle Row
  - Bottom Row
  - Full House
- Mark winner for each prize (click player name → winner locked)
- Game history panel: see all past games, winners, timestamp

### Ticket Generator (bonus)
- Generate printable Housie ticket (3×9 grid, 15 numbers per ticket) for any player
- Print / save as PDF

### UI Layout
- Left sidebar: game session list + new game button
- Center: number board grid (colored cells for called numbers) + big announcement area
- Right panel: players list, prize tracking, last called numbers
- Top bar: game name, pool config, draw controls
- Dark glassmorphism theme, smooth animations on number draw

## Tech Stack
- Pure HTML / CSS / JS (single `index.html` + `style.css` + `app.js`)
- Web Speech API for TTS
- CSS Grid + custom properties for design tokens
- localStorage for game session persistence
- Google Fonts: Inter

## Open Questions

> [!IMPORTANT]
> 1. **Ticket generation**: Auto-generate standard Tambola tickets (15 numbers, 3×9 grid) or just player name list?
> 2. **Auto-draw sound**: Only TTS voice announcement, or also a "bingo ball drop" sound effect?
> 3. **Number range**: Should custom range allow any min too (e.g. 10–80) or always start from 1?
> 4. **Multi-device**: Single host machine use only, or need to share via network (would need a backend)?
> 5. **Prize categories**: Use the standard 5 (Early Five, Top Row, Middle Row, Bottom Row, Full House) or allow custom prizes?

## Proposed Files

### [NEW] index.html
Main shell: layout structure, fonts, meta tags.

### [NEW] style.css
Full design system: dark theme tokens, glassmorphism, grid, animations, responsive.

### [NEW] app.js
All game logic: draw engine, TTS, session management, localStorage persistence, ticket gen.

## Verification Plan
- Open `index.html` in browser
- Test draw (manual + auto)
- Test TTS announcement
- Test multi-game session create/switch
- Test winner marking
- Check localStorage persistence on reload
