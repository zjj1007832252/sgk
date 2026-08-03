# AGENTS.md - 三国杀项目开发指南

## Goal
Build a complete web-based Three Kingdoms Kill (三国杀) card game with single-player, LAN multiplayer, DIY features, animations, AI, and multiple game modes.

## Instructions
- Web-based (HTML/CSS/JS + Node.js), no build tools
- Express + WebSocket server for LAN multiplayer
- Support all 25 standard generals + 45 expansion generals (70 total)
- Full 108-card standard deck
- Identity mode (主公/忠臣/反贼/内奸)
- DIY generals (template assembly), DIY skills (visual DSL editor), DIY cards
- Smart AI with 3 difficulty levels (easy/normal/hard)
- Custom room rules, win conditions, ban lists
- Visual effects (card fly, particles, damage numbers, AOE sweep, skill animations)
- Sound effects + voice lines + background music
- Keyboard shortcuts, card counter, skin system
- Replay system with export/share
- Game speed, turn timer, rule presets

## Discoveries
- `app.js` function declarations are hoisted within the IIFE, so helpers like `$` must be defined before referenced code
- macOS `say` command for TTS works with `-o file.aiff` (no `--file-format` flag needed)
- `sed -i ''` on macOS differs from Linux `sed -i`
- CDP (Chrome DevTools Protocol) synthetic key events may double-fire in headless browsers - test accordingly
- WebSocket `unref()` prevents the heartbeat timer from keeping the process alive
- `buildDeck(bannedCards)` filtering is done at deck construction time

## Accomplished

### Core Engine
- 108-card standard deck (53 basic + 36 trick + 19 equip)
- 70 generals (25 standard + 25 军争篇 + 12 一将成名 + 8 神武将)
- All skills implemented with hooks
- Identity mode with 4-8 player support
- Game modes: identity, 1v1, 3v3, 国战, 斗地主

### Features
- Custom room rules (HP bonus, hand limit, round limit, AOE toggle, etc.)
- Custom win conditions (10 built-in + JS script)
- Rule presets with share codes
- Ban list (generals/cards) with presets
- Game speed (fast/normal/slow) + turn timer (30/60/90s/∞)
- AI difficulty (easy/normal/hard)
- Custom skill editor (DSL-based)
- Custom card editor with image upload
- DIY generals
- Card counter (remaining cards, key cards)
- Skin system (6 skins, 7 frames, effects)
- Replay system (JSON/text export, analysis, share links)
- Keyboard shortcuts
- Sound effects + voice lines + background music
- Visual effects (particles, card fly, AOE sweep, skill animations)
- LAN multiplayer via WebSocket
- Web Audio API real-time SFX

### Server Files
- `server/index.js` - Main server (Express + WS)
- `server/engine/game.js` - Game engine (~1600 lines)
- `server/engine/ai.js` - AI system (SimpleAI, NormalAI, HardAI)
- `server/engine/cards.js` - 108-card deck
- `server/engine/generals.js` - 70 generals
- `server/engine/skills.js` - Skill registry
- `server/engine/game-modes.js` - Game modes + win condition evaluator
- `server/engine/custom-skill-executor.js` - Custom skill execution
- `server/rooms.js` - Room management with spectator support
- `server/replays.js` - Replay storage + analysis
- `server/customs.js` - DIY general persistence
- `server/custom-cards.js` - Custom card persistence
- `server/custom-skills.js` - Custom skill persistence
- `server/netopt.js` - Network optimization (batching, delta)
- `server/avatar.js` - SVG avatar generation

### Client Files
- `public/js/app.js` - Main client (~2800 lines)
- `public/js/fx.js` - Visual effects engine
- `public/js/audio.js` - AudioManager
- `public/js/sound.js` - Sound manager + BGM
- `public/js/card-counter.js` - Card counter
- `public/js/skin-system.js` - Skin system
- `public/js/skill-editor.js` - Skill editor DSL
- `public/js/card-editor.js` - Card editor DSL
- `public/js/custom-skills.js` - Client-side custom skill engine
- `public/js/game-rules.js` - Win conditions + rule presets
- `public/js/shortcuts.js` - Keyboard shortcuts
- `public/js/perf.js` - Performance utilities
- `public/js/data.js` - Data persistence (stats/history)
- `public/css/style.css` - Ancient-style theme

### Tests
- `test/simulate.js` - Headless AI simulation
- `test/e2e.js` - WebSocket end-to-end test
- `test/verify.js` - Data integrity + per-general test
- `test/browser-play.js` - CDP browser full game test
- `test/browser-audio.js` - CDP audio test
- `test/browser-fx.js` - CDP effects test
- `test/browser-keys.js` - CDP keyboard shortcuts test
- `test/browser-skilleditor.js` - CDP skill editor test
- `test/ai-test.js` - AI-specific test
- `test/balance-test.js` - Balance testing

## Remaining Tasks

### In Progress (started but not completed)
1. **Spectator Mode** - rooms.js spectator support added, but server handlers and client UI not yet implemented
2. **Achievement System** - Not started
3. **New Player Guide / Tutorial** - Not started

### Not Started
- Spectator mode needs:
  - Server handlers: `spectateRoom`, `spectateAction`, `danmaku` messages
  - Client UI: spectator view (read-only game view), danmaku overlay, spectator count display
  - Delay mechanism (30s delay to prevent cheating)
  - Room lobby shows spectator count

- Achievement system needs:
  - Achievement definitions (first kill, win streak, general mastery, etc.)
  - Achievement tracking in game engine
  - Achievement unlock UI
  - Achievement rewards (skin/frame unlocks)

- Tutorial needs:
  - Step-by-step game introduction
  - Interactive tutorial mode
  - Rule quick reference panel
  - Card/skill explanation popups

## Relevant files
- `/Users/jjzhang/chess/sgk/server/rooms.js` - Just modified to add spectator support
- `/Users/jjzhang/chess/sgk/server/index.js` - Needs spectator/danmaku handlers
- `/Users/jjzhang/chess/sgk/public/js/app.js` - Needs spectator UI + achievements + tutorial
- `/Users/jjzhang/chess/sgk/public/index.html` - Needs spectator/achievement/tutorial HTML
- `/Users/jjzhang/chess/sgk/public/css/style.css` - Needs spectator/achievement/tutorial CSS
