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
- `buildDeck(bannedCards)` filtering is done at deck construction time; the signature is now `buildDeck(bannedCards, customCards)` and DIY cards are merged at the same point
- `test/browser-check.js` drives headless **Edge** (msedge) via CDP, not Chrome
- `scripts/gen_voices.js` now iterates all 70 generals; shipped voice assets only cover the 25 standard ones (89 WAVs)

## Accomplished

### Recent (v2)
- New player guide — 6-step text modal tutorial + full rules reference fallback (coachmark overlay HTML/CSS exists but no JS drives it — see Known gaps)
- Achievement system — 16 achievements defined with client-side stat accumulation in data.js; server per-player stats chain is dangling (Player has no stats field) so several achievements are unreachable — see Known gaps
- Achievement rewards — skin & avatar frame unlock logic defined in skin-system.js, but `grantAchievementRewards` is never called — see Known gaps
- Spectator mode — 30s anti-cheat delay via server snapshot queue, read-only client UI, danmaku chat, lobby spectator count

### Core Engine
- 108-card standard deck (53 basic + 36 trick + 19 equip)
- 70 generals (25 standard + 23 军争篇 + 14 一将成名 + 8 神武将)
- All skills implemented with hooks
- Identity mode with 4-8 player support
- Game modes: identity, 1v1, 3v3, 国战, 斗地主

### Features
- Custom room rules (HP bonus, hand limit, round limit, AOE toggle, etc.)
- Custom win conditions (10 built-in + JS script; note: `rooms.js` strips `winParams.script` server-side as an RCE guard, so JS-script conditions only work outside room play)
- Rule presets with share codes
- Ban list (generals/cards) with presets
- Game speed (fast/normal/slow) + turn timer (30/60/90s/∞)
- AI difficulty (easy/normal/hard)
- Custom skill editor (DSL-based)
- Custom card editor with image upload
- DIY generals
- DIY skills / DIY cards fully wired into the engine (details under "Done since v3" below)
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
- `server/engine/game.js` - Game engine (~1700 lines)
- `server/engine/ai.js` - AI system (`AIBrain` base + `SimpleAI` / `HardAI`; difficulty via `AI_DIFFICULTIES` config + `createAI()` factory)
- `server/engine/cards.js` - 108-card deck
- `server/engine/generals.js` - 70 generals
- `server/engine/skills.js` - Skill registry
- `server/engine/game-modes.js` - Game modes + win condition evaluator
- `server/engine/custom-skill-executor.js` - DIY skill executor (wired into Game engine)
- `server/rooms.js` - Room management with spectator support
- `server/replays.js` - Replay storage + analysis
- `server/customs.js` - DIY general persistence
- `server/custom-cards.js` - Custom card persistence
- `server/custom-skills.js` - Custom skill persistence
- `server/netopt.js` - Network optimization (batching, delta)
- `server/avatar.js` - Procedural SVG silhouette placeholder avatar generation; real JPG portraits in `public/assets/avatars/` take priority (client load order JPG→PNG→SVG)
- `server/data/` - Runtime persistence store (`customs.json`, `replays.json`)

### Client Files
- `public/js/app.js` - Main client (~3500 lines)
- `public/js/fx.js` - Visual effects engine
- `public/js/audio.js` - AudioManager
- `public/js/sound.js` - Sound manager + BGM
- `public/js/card-counter.js` - Card counter
- `public/js/card-detail.js` - Card detail modal, hand sorting, discard-pile panel
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
- `test/run-all.js` - Test suite entry (`npm test` / `npm run test:fast`)
- `test/simulate.js` - Headless AI simulation
- `test/e2e.js` - WebSocket end-to-end test
- `test/verify.js` - Data integrity + per-general test (24 checks)
- `test/pindian.js` - 拼点 engine + distance exemption + AI card choice
- `test/browser-play.js` - CDP browser full game test
- `test/browser-audio.js` - CDP audio test
- `test/browser-fx.js` - CDP effects test
- `test/browser-keys.js` - CDP keyboard shortcuts test
- `test/browser-skilleditor.js` - CDP skill editor test
- `test/browser-check.js` - CDP smoke test (drives headless Edge, not Chrome)
- `test/browser-ol-play.js` - CDP online-mode full game test (`npm run test:ol`)
- `test/ai-test.js` - AI-specific test
- `test/balance-test.js` - Balance testing

## Remaining Tasks

### Implemented (verified by doc audit 2026-10)
1. **Spectator Mode** - ✅ Implemented (30s delayed snapshots, client UI, danmaku, read-only mode)
2. **Achievement System** - ⚠️ Partially implemented (16 achievements + client stats accumulation defined; server stats chain dangling, reward granting never called — see Known gaps)
3. **New Player Guide / Tutorial** - ⚠️ Partially implemented (6-step text modal + rules reference; coachmark HTML/CSS not driven by JS — see Known gaps)

### Not Started
- In-game skill hover tooltip popups during play (card detail modal already exists via `card-detail.js`)
- Ranked / ladder system
- Custom game mode editor UI

## Relevant files
- `/Users/jjzhang/sgk/server/engine/game.js` - `getState` reads `p.stats` but the `Player` class never defines/assigns it (dangling — see Known gaps)
- `/Users/jjzhang/sgk/server/rooms.js` - Spectator snapshots + 30s delay mechanism
- `/Users/jjzhang/sgk/server/index.js` - Spectator handlers + delayed state push timer
- `/Users/jjzhang/sgk/public/js/data.js` - Expanded stats accumulation for achievements (kills/damage/heal/saves/uniqueCards/uniqueGenerals/diyCount…)
- `/Users/jjzhang/sgk/public/js/app.js` - Achievement checks (16) + spectator client mode; tutorial is a 6-step text modal (coachmark not driven)
- `/Users/jjzhang/sgk/public/js/skin-system.js` - Achievement-based skin/frame unlock definitions; `grantAchievementRewards` defined but never called
- `/Users/jjzhang/sgk/public/index.html` - Coachmark overlay HTML (present, not driven by JS)
- `/Users/jjzhang/sgk/public/css/style.css` - Coachmark styles

## Recent (v3) — Code Review Fixes
- 修复 `public/index.html:438` 回放查看器「导出文本」按钮标签未闭合
- 修复 `public/js/app.js` 胜利条件选择/规则预设/禁将按钮 html 在 `box.innerHTML = html;` 之后被追加而永不渲染的 bug
- 修复 `server/engine/game.js` `stepDelay` 被 `speedMult` 处理后又被原 opts 覆盖（speedMult 永远无效）
- 修复 `server/engine/game.js` 乐不思蜀原地修改牌的 key/name 污染牌堆，改为推虚拟对象
- 修复 `public/js/app.js` 禁将预设切换时 `bannedG.has(text && find(...))` 永远 false 导致高亮不刷新
- 修复 `server/rooms.js` 观战延迟选帧升序遍历取最旧帧，改为反向遍历取最接近 `now-delay` 的帧
- `server/engine/game.js` 五谷丰登选牌顺序公式：当时记录的改为 `(seat - seat + n) % n` 实际未落地，代码仍为 `(seat - seat + 99) % 99`（座位 0-7 下恰好排序正确，无实际影响）
- 修复 `server/engine/game.js` 五谷丰登 `splice(indexOf(picked), 1)` 在 picked 不在 revealed 时会从末尾误删，加 indexOf 校验
- 修复 `server/engine/game-modes.js` `survive_rounds` / `hp_threshold` 胜利条件可能在 turnSeat 玩家已死时返回死亡 seat 的问题
- 修复 `server/rooms.js` 房间的 `startGame` 只传极少量 opts 给 Game，自定义规则（hpBonus/handLimit/winCondition/...）全部丢失；补全所有字段
- 删除 `server/engine/game-modes.js` 重声明的死代码 `createGameMode`

## Verify results
- test/verify.js: 24/24 通过（run-all.js 中 "86 项" 描述标签已过时，实际为 24 项检查）
- test/simulate.js: 10 局无错
- test/ai-test.js: 4 局无错
- test/balance-test.js: 跑通无错

## Remaining Tasks (after v3)
### Not Started
- In-game skill hover tooltip popups during play (card detail modal already exists via card-detail.js)
- Ranked / ladder system
- Custom game mode editor UI

### Done since v3 (verified by doc audit 2026-10)
- ✅ DIY skill / DIY card system now wired into Game engine: `Game` instantiates `CustomSkillExecutor`, `buildDeck(bannedCards, customCards)` accepts DIY cards, `player.customSkills` assigned in `setGeneral`, `trySkill` executes custom effects, executor hooks on damage/heal/die/kill/phase events; `rooms.js` passes `customCards.load()` / `customSkills.load()` gated by `includeCustoms`

## Known gaps (found by doc audit 2026-10, not yet fixed)
- `Player` has no `stats` field; `getState` sends `stats: p.stats` (always undefined) and the client never reports per-player stats → achievements `three_kills` / `healer` / `destroyer` / `card_master` / `survivor` unreachable; `first_blood` checks `s.firstBlood` which data.js never writes (it tracks `gamesWithKill`)
- `grantAchievementRewards` (skin-system.js) is never called → achievement skin/frame rewards never actually unlock
- Coachmark tutorial: overlay HTML (index.html) + CSS (style.css) exist but no JS drives them; shipped tutorial is a 6-step text modal
- DIY skills are granted to **every** player regardless of general binding (game.js only dedupes against built-in skill ids)
- `rooms.js` strips `winParams.script` (RCE guard) → JS-script win condition unavailable in room play
- `test/run-all.js` labels verify as "86 项" (actually 24)
