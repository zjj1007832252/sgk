// 三国杀局域网服务器
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const multer = require('multer');

const { MODES } = require('./engine/game-modes');
const { RoomManager } = require('./rooms');
const customs = require('./customs');
const customSkills = require('./custom-skills');
const customCards = require('./custom-cards');
const replays = require('./replays');
const { GENERALS } = require('./engine/generals');
const { DIY_SKILLS } = require('./engine/skills');

const { NetworkOptimizer } = require('./netopt');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const rooms = new RoomManager();
const netopt = new NetworkOptimizer();

// pid -> ws
const clients = new Map();
// pid -> reconnect token (prevents session hijacking)
const reconnectTokens = new Map();
netopt.setWsMap(clients);
let pidCounter = 1;

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- HTTP API ----------
app.get('/api/meta', (req, res) => {
  res.json({ generals: GENERALS, diySkills: DIY_SKILLS, customs: customs.load() });
});
app.get('/api/customs', (req, res) => {
  res.json({ customs: customs.load(), diySkills: DIY_SKILLS });
});
app.post('/api/customs', (req, res) => {
  const r = customs.create(req.body || {});
  if (!r.ok) return res.status(400).json({ error: r.msg });
  broadcastRooms();
  res.json({ ok: true, general: r.value });
});
app.delete('/api/customs/:id', (req, res) => {
  res.json({ ok: customs.remove(req.params.id) });
});

// 游戏模式 API
app.get('/api/modes', (req, res) => {
  const modes = Object.entries(MODES).map(([id, Cls]) => {
    const inst = new Cls(null);
    return { id, name: inst.name, minPlayers: inst.minPlayers, maxPlayers: inst.maxPlayers, desc: inst.description };
  });
  res.json({ modes });
});
app.get('/api/custom-cards', (req, res) => {
  res.json({ cards: customCards.load() });
});
app.post('/api/custom-cards', (req, res) => {
  const r = customCards.create(req.body || {});
  if (!r.ok) return res.status(400).json({ error: r.msg });
  res.json({ ok: true, card: r.value });
});
app.delete('/api/custom-cards/:id', (req, res) => {
  res.json({ ok: customCards.remove(req.params.id) });
});

// 卡牌图片上传
const cardUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = customCards.IMAGE_DIR;
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const id = (req.params.id || 'card').replace(/[^\w-]/g, '');
      cb(null, id + path.extname(file.originalname || '.png'));
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
app.post('/api/card-image/:id', cardUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '需要图片文件' });
  res.json({ ok: true, url: '/assets/cards/' + req.file.filename });
});

// 自定义技能 API
app.get('/api/custom-skills', (req, res) => {
  res.json({ skills: customSkills.load() });
});
app.post('/api/custom-skills', (req, res) => {
  const r = customSkills.create(req.body || {});
  if (!r.ok) return res.status(400).json({ error: r.msg });
  res.json({ ok: true, skill: r.value });
});
app.delete('/api/custom-skills/:id', (req, res) => {
  res.json({ ok: customSkills.remove(req.params.id) });
});

// 回放 API
app.get('/api/replays', (req, res) => {
  res.json({ replays: replays.listReplays(20) });
});
app.get('/api/replays/:id', (req, res) => {
  const replay = replays.getReplay(req.params.id);
  if (!replay) return res.status(404).json({ error: '回放不存在' });
  res.json({ replay, analysis: replays.analyzeReplay(replay) });
});
app.get('/api/replays/:id/export', (req, res) => {
  const replay = replays.getReplay(req.params.id);
  if (!replay) return res.status(404).json({ error: '回放不存在' });
  const format = req.query.format || 'text';
  if (format === 'text') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="replay_${req.params.id}.txt"`);
    return res.send(replays.exportAsText(replay));
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="replay_${req.params.id}.json"`);
  res.send(replays.exportAsJSON(replay));
});
app.delete('/api/replays/:id', (req, res) => {
  res.json({ ok: replays.deleteReplay(req.params.id) });
});

// 头像上传（DIY 或覆盖官方头像）
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '..', 'public', 'assets', 'avatars');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const id = (req.params.id || 'avatar').replace(/[^\w-]/g, '');
      cb(null, id + '.png');
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
app.post('/api/avatar/:id', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '需要图片文件' });
  res.json({ ok: true, url: '/assets/avatars/' + req.file.filename });
});

// ---------- 工具 ----------
function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function sendPid(pid, msg) {
  const ws = clients.get(pid);
  if (ws) send(ws, msg);
}
function broadcastRooms() {
  const msg = JSON.stringify({ type: 'rooms', rooms: rooms.list() });
  for (const [pid, ws] of clients) {
    if (ws.readyState !== 1) continue;
    // 只广播给大厅/房间中的玩家，不广播给正在进行游戏的玩家
    const room = getRoomOf(pid);
    if (!room || room.state === 'lobby') ws.send(msg);
  }
}
function roomBroadcast(room) {
  const view = JSON.stringify({ type: 'room', room: room.publicView() });
  for (const s of room.seatedPlayers()) {
    const ws = clients.get(s.pid);
    if (ws && ws.readyState === 1) ws.send(view);
  }
}
function gameBroadcastAll(room) {
  const game = room.game;
  if (!game) return;
  for (const s of room.seatedPlayers()) {
    if (s.isAI) continue;
    const ws = clients.get(s.pid);
    if (ws && ws.readyState === 1) {
      const fullState = game.getState(s.pid);
      const delta = netopt.getDeltaState(s.pid, fullState);
      netopt.sendImmediate(ws, delta);
    }
  }
  // 为观战者记录一帧脱敏快照（观战者视角：mySeat=-1，手牌/身份隐藏）
  if (room.spectators.size) {
    room.pushSpectatorSnapshot(game.getState(null));
  }
}

// 每秒向观战者推送延迟后的对局状态，防止窥屏作弊
function flushSpectators() {
  const now = Date.now();
  for (const room of rooms.rooms.values()) {
    if (!room.spectators.size || !room.game) continue;
    const delayed = room.getDelayedSpectatorState(now);
    for (const [pid] of room.spectators) {
      const ws = clients.get(pid);
      if (!ws || ws.readyState !== 1) continue;
      if (delayed) {
        ws.send(JSON.stringify({ type: 'game', state: delayed.state, spectating: true, delay: room.spectatorDelay }));
      } else {
        const remain = Math.max(0, room.spectatorDelay - Math.round((now - (room.game.startTime || now)) / 1000));
        ws.send(JSON.stringify({ type: 'spectatorWaiting', delay: room.spectatorDelay, remaining: remain }));
      }
    }
  }
}

const spectatorTimer = setInterval(flushSpectators, 1000);
spectatorTimer.unref();
server.on('close', () => clearInterval(spectatorTimer));

// 心跳定时器
const heartbeatTimer = setInterval(() => {
  for (const [pid, ws] of clients) {
    if (ws.readyState === 1) {
      netopt.sendHeartbeat(ws);
    }
  }
}, netopt.heartbeatInterval);
heartbeatTimer.unref(); // 不阻止进程退出

server.on('close', () => clearInterval(heartbeatTimer));
function getRoomOf(pid) {
  for (const room of rooms.rooms.values()) if (room.hasPid(pid)) return room;
  return null;
}

function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

// ---------- 游戏钩子 ----------
function makeHooks(room) {
  return {
    sendTo: (pid, msg) => sendPid(pid, msg),
    broadcastAll: () => gameBroadcastAll(room),
    broadcastEvent: (ev) => {
      for (const s of room.seatedPlayers()) {
        if (!s.isAI) netopt.batch(s.pid, { type: 'event', event: ev });
      }
    },
    delay: (ms) => new Promise(r => setTimeout(r, ms)),
    onEnd: () => {
      room.state = 'ended';
      // 保存回放
      try {
        const game = room.game;
        if (game) {
          const record = {
            players: game.players.map(p => ({
              seat: p.seat, name: p.name, generalId: p.generalId, generalName: p.generalName,
              identity: p.identity, kingdom: p.kingdom, hp: p.hp, maxHp: p.maxHp,
              isAI: p.isAI, alive: p.alive, totalKills: p.totalKills || 0,
            })),
            events: game.replayEvents || [],
            logs: game.logs || [],
            winner: game.winner,
            winnerIdentity: game.players.find(p => p.seat === game.winner)?.identity || game.winner,
            rounds: game.round,
            duration: Date.now() - game.startTime,
            gameMode: game.opts?.gameMode || 'identity',
            winCondition: game.opts?.winCondition || 'default',
            roomName: room.name,
          };
          const replay = replays.createReplay(record);
          room.lastReplayId = replay.id;
        }
      } catch (e) { console.error('保存回放失败', e); }
      roomBroadcast(room);
      broadcastRooms();
      gameBroadcastAll(room);
    },
  };
}

// ---------- WS 消息处理 ----------
const handlers = {
  hello(ws, msg, ctx) {
    // 断线重连：需要验证 token
    const pid = msg.pid && /^[\w-]{1,40}$/.test(msg.pid) ? msg.pid : null;
    if (pid && msg.token) {
      const expected = reconnectTokens.get(pid);
      if (expected && expected === msg.token) {
        for (const room of rooms.rooms.values()) {
          const seat = room.seatOf(pid);
          if (seat >= 0) {
            ctx.pid = pid;
            clients.set(pid, ws);
            room.seats[seat].name = msg.name || room.seats[seat].name;
            if (room.game) room.game.playerOnline(pid);
            send(ws, { type: 'welcome', pid });
            roomBroadcast(room);
            if (room.game) send(ws, { type: 'game', state: room.game.getState(pid) });
            broadcastRooms();
            return;
          }
        }
      }
      // token 无效，当作新连接处理
    }
    ctx.pid = 'p' + (pidCounter++);
    clients.set(ctx.pid, ws);
    ctx.name = (msg.name || '无名氏').slice(0, 12);
    // 生成 reconnect token
    const token = generateToken();
    reconnectTokens.set(ctx.pid, token);
    send(ws, { type: 'welcome', pid: ctx.pid, reconnectToken: token });
    send(ws, { type: 'rooms', rooms: rooms.list() });
  },

  createRoom(ws, msg, ctx) {
    if (!ctx.pid) return;
    const old = getRoomOf(ctx.pid);
    if (old) leaveRoom(old, ctx.pid);
    const room = rooms.create((msg.name || '').slice(0, 16) || `${ctx.name}的房间`, ctx.pid);
    room.sit(ctx.pid, ctx.name, 0);
    send(ws, { type: 'room', room: room.publicView() });
    broadcastRooms();
  },

  joinRoom(ws, msg, ctx) {
    if (!ctx.pid) return;
    const room = rooms.get(msg.roomId);
    if (!room) return send(ws, { type: 'error', msg: '房间不存在' });
    const old = getRoomOf(ctx.pid);
    if (old && old !== room) leaveRoom(old, ctx.pid);
    // 找空位
    const empty = room.seats.findIndex((s, i) => i < room.opts.maxPlayers && !s);
    if (room.state !== 'lobby') return send(ws, { type: 'error', msg: '游戏已开始' });
    if (empty < 0) return send(ws, { type: 'error', msg: '房间已满' });
    room.sit(ctx.pid, ctx.name, empty);
    roomBroadcast(room);
    broadcastRooms();
  },

  leaveRoom(ws, msg, ctx) {
    const room = getRoomOf(ctx.pid);
    if (room) leaveRoom(room, ctx.pid);
    send(ws, { type: 'rooms', rooms: rooms.list() });
  },

  addAI(ws, msg, ctx) {
    const room = getRoomOf(ctx.pid);
    if (!room) return;
    const r = room.addAI(ctx.pid);
    if (!r.ok) send(ws, { type: 'toast', msg: r.msg });
    roomBroadcast(room);
  },

  removeSeat(ws, msg, ctx) {
    const room = getRoomOf(ctx.pid);
    if (!room) return;
    const r = room.removeSeat(ctx.pid, msg.seat);
    if (!r.ok) send(ws, { type: 'toast', msg: r.msg });
    else if (r.kicked) sendPid(r.kicked, { type: 'kicked' });
    roomBroadcast(room);
  },

  setOpts(ws, msg, ctx) {
    const room = getRoomOf(ctx.pid);
    if (!room) return;
    const r = room.setOpts(ctx.pid, msg.opts || {});
    if (!r.ok) send(ws, { type: 'toast', msg: r.msg });
    roomBroadcast(room);
    broadcastRooms();
  },

  pickIdentity(ws, msg, ctx) {
    const room = getRoomOf(ctx.pid);
    if (!room) return;
    room.pickIdentity(ctx.pid, msg.identity);
    roomBroadcast(room);
  },

  chat(ws, msg, ctx) {
    const room = getRoomOf(ctx.pid);
    if (!room) return;
    room.chat.push({ name: ctx.name, text: String(msg.text || '').slice(0, 100) });
    roomBroadcast(room);
  },

  startGame(ws, msg, ctx) {
    const room = getRoomOf(ctx.pid);
    if (!room) return;
    const r = room.startGame(ctx.pid, customs.load(), makeHooks(room));
    if (!r.ok) return send(ws, { type: 'toast', msg: r.msg });
    roomBroadcast(room);
    broadcastRooms();
    gameBroadcastAll(room);
    r.game.start().catch(e => {
      console.error('游戏异常', e);
      room.state = 'lobby';
      room.game = null;
      roomBroadcast(room);
    });
  },

  backToLobby(ws, msg, ctx) {
    const room = getRoomOf(ctx.pid);
    if (!room) return;
    const result = room.backToLobby(ctx.pid);
    if (!result.ok) {
      // 失败时 sendTo 客户端给出反馈,避免点了没反应
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', msg: result.msg || '返回大厅失败' }));
      return;
    }
    roomBroadcast(room);
    broadcastRooms();
  },

  spectateRoom(ws, msg, ctx) {
    if (!ctx.pid) return;
    const room = rooms.get(msg.roomId);
    if (!room) return send(ws, { type: 'error', msg: '房间不存在' });
    if (room.state === 'lobby') return send(ws, { type: 'error', msg: '游戏未开始' });
    if (room.spectators.size >= 50) return send(ws, { type: 'toast', msg: '观战人数已满' });
    const r = room.addSpectator(ctx.pid, ctx.name || '观战者');
    if (!r.ok) return send(ws, { type: 'toast', msg: r.msg });
    send(ws, { type: 'welcome', pid: ctx.pid });
    send(ws, { type: 'room', room: room.publicView() });
    // 观战状态由 flushSpectators 按 30 秒延迟推送，此处不发送实时状态
    roomBroadcast(room);
    broadcastRooms();
  },

  danmaku(ws, msg, ctx) {
    if (!ctx.pid) return;
    for (const room of rooms.rooms.values()) {
      if (room.isSpectator(ctx.pid)) {
        const dm = room.addDanmaku(ctx.pid, msg.text);
        if (dm) {
          // 广播给房间内所有人（玩家+观战者）
          for (const s of room.seatedPlayers()) {
            if (!s.isAI) sendPid(s.pid, { type: 'danmaku', msg: dm });
          }
          for (const [spid] of room.spectators) {
            sendPid(spid, { type: 'danmaku', msg: dm });
          }
        }
        return;
      }
    }
  },

  action(ws, msg, ctx) {
    const room = getRoomOf(ctx.pid);
    if (!room || !room.game) return;
    if (room.isSpectator && room.isSpectator(ctx.pid)) return; // 观战者不能操作
    room.game.handleAction(ctx.pid, msg);
  },
};

function leaveRoom(room, pid) {
  if (room.isSpectator && room.isSpectator(pid)) {
    room.removeSpectator(pid);
    roomBroadcast(room);
    broadcastRooms();
    return;
  }
  const seat = room.stand(pid);
  if (room.game) room.game.playerOffline(pid); // 游戏中离开 -> AI 托管
  // 房主离开 -> 移交给下一个人类
  if (room.hostPid === pid) {
    const next = room.seatedPlayers().find(s => !s.isAI);
    if (next) room.hostPid = next.pid;
  }
  if (!room.seatedPlayers().some(s => !s.isAI)) {
    rooms.remove(room.id); // 没有真人了，销毁房间
  } else {
    roomBroadcast(room);
  }
  broadcastRooms();
}

wss.on('connection', (ws) => {
  const ctx = { pid: null, name: '无名氏' };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const h = handlers[msg.type];
    if (h) {
      try { h(ws, msg, ctx); } catch (e) { console.error('handler error', msg.type, e); }
    }
  });
  ws.on('close', () => {
    if (!ctx.pid) return;
    netopt.cleanup(ctx.pid);
    clients.delete(ctx.pid);
    for (const room of rooms.rooms.values()) {
      if (room.hasPid(ctx.pid)) {
        if (room.isSpectator && room.isSpectator(ctx.pid)) {
          room.removeSpectator(ctx.pid);
          roomBroadcast(room);
          broadcastRooms();
        } else if (room.state === 'lobby') {
          leaveRoom(room, ctx.pid);
        } else if (room.game) {
          room.game.playerOffline(ctx.pid);
          roomBroadcast(room);
        }
      }
    }
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, '0.0.0.0', () => {
  const ip = lanAddress();
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║          三国杀 · 标准版 · 局域网对战          ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  本机访问:  http://localhost:${PORT}`);
  console.log(`  局域网开黑: http://${ip}:${PORT}  (分享给好友)`);
  console.log('');
});
