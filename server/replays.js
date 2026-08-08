// 回放存储与管理
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const REPLAY_FILE = path.join(DATA_DIR, 'replays.json');
let writeLock = false;

function load() {
  try { return JSON.parse(fs.readFileSync(REPLAY_FILE, 'utf8')); } catch { return {}; }
}

function save(data) {
  // 简单文件锁：写入排队
  if (writeLock) {
    setTimeout(() => save(data), 10);
    return;
  }
  writeLock = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(REPLAY_FILE, JSON.stringify(data, null, 2), 'utf8');
  } finally {
    writeLock = false;
  }
}

function generateId() {
  return 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
}

function createReplay(gameRecord) {
  const id = generateId();
  const replays = load();
  const record = {
    id,
    createdAt: Date.now(),
    ...gameRecord,
  };
  replays[id] = record;
  // 只保留最近 200 条
  const keys = Object.keys(replays);
  if (keys.length > 200) {
    const sorted = keys.sort((a, b) => replays[b].createdAt - replays[a].createdAt);
    const toRemove = sorted.slice(200);
    toRemove.forEach(k => delete replays[k]);
  }
  save(replays);
  return record;
}

function getReplay(id) {
  const replays = load();
  return replays[id] || null;
}

function listReplays(limit = 20) {
  const replays = load();
  return Object.values(replays)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

function deleteReplay(id) {
  const replays = load();
  if (replays[id]) { delete replays[id]; save(replays); return true; }
  return false;
}

// 分析对局数据
function analyzeReplay(replay) {
  if (!replay || !replay.events) return null;
  const events = replay.events;
  const players = {};
  const keyEvents = [];
  let totalDamage = 0;
  let totalHeal = 0;

  // 初始化玩家数据
  (replay.players || []).forEach(p => {
    players[p.seat] = {
      seat: p.seat,
      name: p.name,
      generalName: p.generalName,
      identity: p.identity,
      kills: 0,
      damageDealt: 0,
      damageTaken: 0,
      healDone: 0,
      healReceived: 0,
      cardsPlayed: 0,
      cardsDrawn: 0,
      skillsUsed: 0,
      isWinner: false,
    };
  });

  // 分析事件
  events.forEach(ev => {
    switch (ev.type) {
      case 'damage': {
        totalDamage += ev.amount || 1;
        if (ev.source != null && players[ev.source]) players[ev.source].damageDealt += ev.amount || 1;
        if (players[ev.seat]) players[ev.seat].damageTaken += ev.amount || 1;
        if (ev.amount >= 3) keyEvents.push({ type: 'big_damage', ...ev });
        break;
      }
      case 'recover':
      case 'heal': {
        totalHeal += ev.amount || 1;
        if (players[ev.seat]) players[ev.seat].healReceived += ev.amount || 1;
        break;
      }
      case 'kill': {
        if (players[ev.killer]) players[ev.killer].kills++;
        keyEvents.push({ type: 'kill', ...ev });
        break;
      }
      case 'sha':
        if (ev.source != null && players[ev.source]) players[ev.source].cardsPlayed++;
        break;
      case 'draw':
        if (ev.seat != null && players[ev.seat]) players[ev.seat].cardsDrawn += ev.count || 1;
        break;
      case 'skill':
        if (ev.seat != null && players[ev.seat]) players[ev.seat].skillsUsed++;
        break;
      case 'dying':
        keyEvents.push({ type: 'dying', ...ev });
        break;
    }
  });

  // 标记获胜者
  const winner = replay.winner;
  Object.values(players).forEach(p => {
    if (replay.winnerIdentity && p.identity === replay.winnerIdentity) p.isWinner = true;
  });

  // 找出 MVP（击杀+伤害最高）
  let mvp = null;
  let mvpScore = -1;
  Object.values(players).forEach(p => {
    const score = p.kills * 3 + p.damageDealt + p.healDone;
    if (score > mvpScore) { mvpScore = score; mvp = p.seat; }
  });

  return {
    duration: replay.duration || 0,
    rounds: replay.rounds || 0,
    totalDamage,
    totalHeal,
    totalEvents: events.length,
    keyEvents: keyEvents.slice(-20), // 最近 20 个关键事件
    players: Object.values(players),
    mvp,
    winner,
    winCondition: replay.winCondition,
    gameMode: replay.gameMode,
  };
}

// 导出为文本格式
function exportAsText(replay) {
  const lines = [];
  lines.push(`=== 三国杀对局记录 ===`);
  lines.push(`时间: ${new Date(replay.createdAt).toLocaleString()}`);
  lines.push(`模式: ${replay.gameMode || 'identity'}`);
  lines.push(`回合: ${replay.rounds || 0}`);
  lines.push(`胜者: ${replay.winner || 'unknown'}`);
  lines.push('');
  lines.push('--- 玩家 ---');
  (replay.players || []).forEach(p => {
    lines.push(`  ${p.name}(${p.generalName}) - ${p.identity}`);
  });
  lines.push('');
  lines.push('--- 事件 ---');
  (replay.events || []).forEach((ev, i) => {
    lines.push(`  [${i + 1}] ${ev.type}: ${JSON.stringify(ev)}`);
  });
  return lines.join('\n');
}

// 导出为 JSON 格式
function exportAsJSON(replay) {
  return JSON.stringify(replay, null, 2);
}

module.exports = { createReplay, getReplay, listReplays, deleteReplay, analyzeReplay, exportAsText, exportAsJSON };
