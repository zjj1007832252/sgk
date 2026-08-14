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

### Recent (v2)
- Interactive tutorial — 8-step coachmark with element highlighting + full rules reference fallback
- Achievement system — 16 achievements with live stat tracking (kills / damage / healing / saves / win streak / identity wins / card variety / general variety / speed wins / DIY count)
- Achievement rewards — skin & avatar frame unlocks tied to specific achievements
- Spectator mode — 30s anti-cheat delay via server snapshot queue, read-only client UI, danmaku chat, lobby spectator count

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
1. **Spectator Mode** - ✅ Implemented (30s delayed snapshots, client UI, danmaku, read-only mode)
2. **Achievement System** - ✅ Implemented (16 achievements with stats tracking, skin/frame rewards)
3. **New Player Guide / Tutorial** - ✅ Implemented (interactive coachmark + full rules reference)

### Not Started
### Not Started
- In-game card/skill tooltip popups (hover to see skill/card description during play)
- Ranked / ladder system
- Custom game mode editor UI

## Relevant files
- `/Users/jjzhang/chess/sgk/server/engine/game.js` - Player stats field added for achievement tracking
- `/Users/jjzhang/chess/sgk/server/rooms.js` - Spectator snapshots + 30s delay mechanism
- `/Users/jjzhang/chess/sgk/server/index.js` - Spectator handlers + delayed state push timer
- `/Users/jjzhang/chess/sgk/public/js/data.js` - Expanded stats accumulation for achievements
- `/Users/jjzhang/chess/sgk/public/js/app.js` - Achievement rewards, spectator client mode, interactive coach tutorial
- `/Users/jjzhang/chess/sgk/public/js/skin-system.js` - Achievement-based skin/frame unlocks
- `/Users/jjzhang/chess/sgk/public/index.html` - Coachmark overlay HTML
- `/Users/jjzhang/chess/sgk/public/css/style.css` - Coachmark styles

## Recent (v3) — Code Review Fixes
- 修复 `public/index.html:438` 回放查看器「导出文本」按钮标签未闭合
- 修复 `public/js/app.js` 胜利条件选择/规则预设/禁将按钮 html 在 `box.innerHTML = html;` 之后被追加而永不渲染的 bug
- 修复 `server/engine/game.js` `stepDelay` 被 `speedMult` 处理后又被原 opts 覆盖（speedMult 永远无效）
- 修复 `server/engine/game.js` 乐不思蜀原地修改牌的 key/name 污染牌堆，改为推虚拟对象
- 修复 `public/js/app.js` 禁将预设切换时 `bannedG.has(text && find(...))` 永远 false 导致高亮不刷新
- 修复 `server/rooms.js` 观战延迟选帧升序遍历取最旧帧，改为反向遍历取最接近 `now-delay` 的帧
- 修复 `server/engine/game.js` 五谷丰登选牌顺序公式 `(seat - seat + 99) % 99` 在差为负时映射反转，改为 `(seat - seat + n) % n`（n = 玩家数）
- 修复 `server/engine/game.js` 五谷丰登 `splice(indexOf(picked), 1)` 在 picked 不在 revealed 时会从末尾误删，加 indexOf 校验
- 修复 `server/engine/game-modes.js` `survive_rounds` / `hp_threshold` 胜利条件可能在 turnSeat 玩家已死时返回死亡 seat 的问题
- 修复 `server/rooms.js` 房间的 `startGame` 只传极少量 opts 给 Game，自定义规则（hpBonus/handLimit/winCondition/...）全部丢失；补全所有字段
- 删除 `server/engine/game-modes.js` 重声明的死代码 `createGameMode`

## Verify results
- test/verify.js: 86/86 稳定（极少数场景有 1 项 forceGenerals 偶发 flaky，与本次修改无关）
- test/simulate.js: 10 局无错
- test/ai-test.js: 4 局无错
- test/balance-test.js: 跑通无错

## Remaining Tasks (after v3)
### Not Started
- In-game card/skill tooltip popups (hover to see skill/card description during play)
- Ranked / ladder system
- Custom game mode editor UI
- DIY skill / DIY card system actually wired into Game engine (server/engine/custom-skill-executor.js + server/custom-skills.js + server/custom-cards.js are 孤立模块,未挂载到 player.customSkills / buildDeck)
