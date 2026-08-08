// 房间管理：大厅 / 座位 / 点身份 / 开局
const { Game, IDENTITIES, IDENTITY_DIST } = require('./engine/game');
const { GENERALS } = require('./engine/generals');
const { MODES, createGameMode } = require('./engine/game-modes');
const customCards = require('./custom-cards');
const customSkills = require('./custom-skills');

let roomCounter = 1;
let aiCounter = 1;

class Room {
  constructor(id, name, hostPid) {
    this.id = id;
    this.name = name || `房间${id}`;
    this.hostPid = hostPid;
    this.seats = new Array(8).fill(null); // {pid,name,isAI}
    this.opts = {
      maxPlayers: 5,
      pickMode: 'random',      // random=随机选将 / free=自由点将
      pickCount: 4,
      allowIdentityPick: true, // 点身份
      includeCustoms: true,    // 启用 DIY 武将
      aiDelay: 800,
      aiDifficulty: 'normal', // easy/normal/hard
      gameSpeed: 'normal',    // fast/normal/slow
      turnTimer: 0,           // 0=无限, >0=出牌倒计时秒数
      gameMode: 'identity',
      winCondition: 'default',
      winParams: {}, // identity/1v1/3v3/guozhan/doudizhu
      // ---- 自定义规则 ----
      roundLimit: 0,           // 0=无限，>0=最大回合数
      startCards: 4,           // 初始手牌
      hpBonus: 0,              // 体力加成（主公额外+1由引擎处理）
      handLimit: 0,            // 0=默认（体力值）
      allowAoe: true,          // 允许AOE锦囊
      allowJuedou: true,       // 允许决斗
      allowLianhuan: true,     // 允许铁索连环
      firstDraw: 2,            // 首回合摸牌数
      discardLimit: true,      // 弃牌限制（手牌≤体力）
      lordExtraHp: true,       // 主公额外体力+1
      neiWinAlone: true,       // 内奸需单杀主公
      revealOnDeath: true,     // 死亡揭示身份
      customRules: {},         // 扩展规则
      // 禁将/禁牌
      bannedGenerals: [],       // 禁用武将 ID 列表
      bannedCards: [],          // 禁用卡牌 key 列表
      banPreset: 'none',        // 预设方案
      allowVoteBan: false,      // 允许投票禁将
    };
    this.identityPrefs = {};   // pid -> identity
    this.state = 'lobby';      // lobby | playing | ended
    this.game = null;
    this.chat = [];
    this.spectators = new Map(); // pid -> { name, ws }
    this.danmaku = [];          // 弹幕消息
    this.spectatorDelay = 30;   // 观战延迟（秒）
    this.spectatorSnapshots = []; // { t, state } 延迟观战快照
  }

  seatedPlayers() {
    return this.seats.filter(Boolean);
  }
  seatOf(pid) {
    return this.seats.findIndex(s => s && s.pid === pid);
  }
  hasPid(pid) {
    return this.seatOf(pid) >= 0 || this.spectators.has(pid);
  }

  sit(pid, name, seat) {
    if (this.state !== 'lobby') return { ok: false, msg: '游戏已开始' };
    if (seat < 0 || seat >= this.opts.maxPlayers) return { ok: false, msg: '座位无效' };
    if (this.seats[seat]) return { ok: false, msg: '座位已被占' };
    const cur = this.seatOf(pid);
    if (cur >= 0) this.seats[cur] = null;
    this.seats[seat] = { pid, name, isAI: false };
    return { ok: true };
  }

  stand(pid) {
    const cur = this.seatOf(pid);
    if (cur >= 0) {
      this.seats[cur] = null;
      delete this.identityPrefs[pid];
    }
    return cur;
  }

  addAI(pid) {
    if (pid !== this.hostPid) return { ok: false, msg: '只有房主可以添加电脑' };
    if (this.state !== 'lobby') return { ok: false, msg: '游戏已开始' };
    const empty = this.seats.findIndex((s, i) => i < this.opts.maxPlayers && !s);
    if (empty < 0) return { ok: false, msg: '没有空位' };
    this.seats[empty] = { pid: 'ai_' + (aiCounter++), name: '电脑' + empty, isAI: true };
    return { ok: true };
  }

  removeSeat(pid, seat) {
    if (pid !== this.hostPid) return { ok: false, msg: '只有房主可以操作' };
    const s = this.seats[seat];
    if (!s) return { ok: false, msg: '座位为空' };
    if (s.pid === this.hostPid) return { ok: false, msg: '不能移除自己' };
    this.seats[seat] = null;
    if (!s.isAI) delete this.identityPrefs[s.pid];
    return { ok: true, kicked: s.isAI ? null : s.pid };
  }

  setOpts(pid, patch) {
    if (pid !== this.hostPid) return { ok: false, msg: '只有房主可以设置' };
    if (this.state !== 'lobby') return { ok: false, msg: '游戏已开始' };
    const o = this.opts;
    if (patch.maxPlayers != null) {
      const n = Math.max(4, Math.min(8, patch.maxPlayers | 0));
      // 收缩座位时清掉超出的人
      for (let i = n; i < 8; i++) this.seats[i] = null;
      o.maxPlayers = n;
    }
    if (patch.pickMode && ['random', 'free'].includes(patch.pickMode)) o.pickMode = patch.pickMode;
    if (patch.pickCount != null) o.pickCount = Math.max(2, Math.min(7, patch.pickCount | 0));
    if (patch.allowIdentityPick != null) o.allowIdentityPick = !!patch.allowIdentityPick;
    if (patch.includeCustoms != null) o.includeCustoms = !!patch.includeCustoms;
    if (patch.aiDelay != null) o.aiDelay = Math.max(0, Math.min(3000, patch.aiDelay | 0));
    if (patch.aiDifficulty && ['easy', 'normal', 'hard'].includes(patch.aiDifficulty)) o.aiDifficulty = patch.aiDifficulty;
    if (patch.gameSpeed && ['fast', 'normal', 'slow'].includes(patch.gameSpeed)) o.gameSpeed = patch.gameSpeed;
    if (patch.turnTimer != null) o.turnTimer = Math.max(0, Math.min(120, patch.turnTimer | 0));
    if (patch.gameMode && MODES[patch.gameMode]) o.gameMode = patch.gameMode;
    if (patch.winCondition) o.winCondition = patch.winCondition;
    if (patch.winParams) o.winParams = { ...o.winParams, ...patch.winParams };
    // 自定义规则
    if (patch.roundLimit != null) o.roundLimit = Math.max(0, Math.min(100, patch.roundLimit | 0));
    if (patch.startCards != null) o.startCards = Math.max(2, Math.min(8, patch.startCards | 0));
    if (patch.hpBonus != null) o.hpBonus = Math.max(-2, Math.min(3, patch.hpBonus | 0));
    if (patch.handLimit != null) o.handLimit = Math.max(0, Math.min(20, patch.handLimit | 0));
    if (patch.allowAoe != null) o.allowAoe = !!patch.allowAoe;
    if (patch.allowJuedou != null) o.allowJuedou = !!patch.allowJuedou;
    if (patch.firstDraw != null) o.firstDraw = Math.max(0, Math.min(4, patch.firstDraw | 0));
    if (patch.discardLimit != null) o.discardLimit = !!patch.discardLimit;
    if (patch.lordExtraHp != null) o.lordExtraHp = !!patch.lordExtraHp;
    if (patch.revealOnDeath != null) o.revealOnDeath = !!patch.revealOnDeath;
    // 禁将/禁牌
    if (patch.bannedGenerals) o.bannedGenerals = patch.bannedGenerals.filter(Boolean);
    if (patch.bannedCards) o.bannedCards = patch.bannedCards.filter(Boolean);
    if (patch.banPreset) o.banPreset = patch.banPreset;
    if (patch.allowVoteBan != null) o.allowVoteBan = !!patch.allowVoteBan;
    return { ok: true };
  }

  pickIdentity(pid, identity) {
    if (!this.opts.allowIdentityPick) return { ok: false, msg: '未开启点身份' };
    if (this.state !== 'lobby') return { ok: false, msg: '游戏已开始' };
    if (identity !== null && !IDENTITIES[identity]) return { ok: false, msg: '身份无效' };
    if (identity === null) delete this.identityPrefs[pid];
    else this.identityPrefs[pid] = identity;
    return { ok: true };
  }

  startGame(pid, customs, hooks) {
    if (pid !== this.hostPid) return { ok: false, msg: '只有房主可以开始' };
    if (this.state === 'playing') return { ok: false, msg: '游戏已开始' };
    const n = this.opts.maxPlayers;
    // 空位自动补 AI
    for (let i = 0; i < n; i++) {
      if (!this.seats[i]) this.seats[i] = { pid: 'ai_' + (aiCounter++), name: '电脑' + i, isAI: true };
    }
    const humans = this.seatedPlayers().filter(s => !s.isAI);
    if (!humans.length) return { ok: false, msg: '至少需要一名玩家' };
    const infos = this.seats.slice(0, n).map(s => ({ pid: s.pid, name: s.name, isAI: s.isAI }));
    const generalPool = GENERALS.concat(this.opts.includeCustoms ? customs : []);
    this.game = new Game(infos, {
      // 选将
      pickMode: this.opts.pickMode,
      pickCount: this.opts.pickCount,
      generalIds: generalPool.map(g => g.id),
      generals: generalPool,
      allowIdentityPick: this.opts.allowIdentityPick,
      identityPrefs: this.identityPrefs,
      // AI / 节奏
      aiDelay: this.opts.aiDelay,
      stepDelay: Math.min(600, this.opts.aiDelay / 2 + 200),
      aiDifficulty: this.opts.aiDifficulty,
      gameSpeed: this.opts.gameSpeed,
      turnTimer: this.opts.turnTimer,
      // 模式
      gameMode: this.opts.gameMode,
      // 自定义规则
      roundLimit: this.opts.roundLimit,
      startCards: this.opts.startCards,
      handLimit: this.opts.handLimit,
      hpBonus: this.opts.hpBonus,
      lordExtraHp: this.opts.lordExtraHp,
      discardLimit: this.opts.discardLimit,
      allowJuedou: this.opts.allowJuedou,
      allowAoe: this.opts.allowAoe,
      revealOnDeath: this.opts.revealOnDeath,
      allowVoteBan: this.opts.allowVoteBan,
      // 禁将 / 禁牌
      bannedGenerals: this.opts.bannedGenerals,
      bannedCards: this.opts.bannedCards,
      // 自定义卡牌 / 技能
      customCards: this.opts.includeCustoms ? customCards.load() : [],
      customSkills: this.opts.includeCustoms ? customSkills.load() : [],
      // 自定义胜利条件
      winCondition: this.opts.winCondition,
      winParams: this.opts.winParams,
    }, hooks);
    this.state = 'playing';
    return { ok: true, game: this.game };
  }

  backToLobby(pid) {
    if (pid !== this.hostPid) return { ok: false, msg: '只有房主可以操作' };
    if (this.game && this.game.phase !== 'over' && this.game.phase !== 'ended') {
      // 游戏仍在运行中，不能直接返回
      return { ok: false, msg: '游戏仍在进行中，无法返回大厅' };
    }
    this.state = 'lobby';
    this.game = null;
    this.spectators.clear();
    this.danmaku = [];
    this.spectatorSnapshots = [];
    return { ok: true };
  }

  // 观战
  addSpectator(pid, name) {
    if (this.state !== 'playing' && this.state !== 'ended') return { ok: false, msg: '游戏未开始' };
    this.spectators.set(pid, { name, joinTime: Date.now() });
    return { ok: true };
  }

  removeSpectator(pid) {
    this.spectators.delete(pid);
  }

  isSpectator(pid) {
    return this.spectators.has(pid);
  }

  // 弹幕
  addDanmaku(pid, text) {
    const spec = this.spectators.get(pid);
    if (!spec) return;
    const msg = { name: spec.name, text: String(text).slice(0, 50), time: Date.now() };
    this.danmaku.push(msg);
    if (this.danmaku.length > 100) this.danmaku.shift();
    return msg;
  }

  getDanmaku(after = 0) {
    return this.danmaku.filter(d => d.time > after);
  }

  // 记录一帧观战快照（节流由调用方保证）
  pushSpectatorSnapshot(state) {
    const now = Date.now();
    const last = this.spectatorSnapshots[this.spectatorSnapshots.length - 1];
    if (last && now - last.t < 1000) return;
    this.spectatorSnapshots.push({ t: now, state });
    // 只保留延迟窗口 + 10 秒内的快照
    const cutoff = now - (this.spectatorDelay + 10) * 1000;
    this.spectatorSnapshots = this.spectatorSnapshots.filter(s => s.t >= cutoff);
  }

  // 返回延迟后的观战状态；未到延迟返回 null
  // 取"最接近 now-delay"的那一帧（即最后一个 t <= threshold 的快照），
  // 避免因无 break 退化成取最旧的一帧（实际延迟会比预期多 0~1 个节拍）。
  getDelayedSpectatorState(now = Date.now()) {
    const threshold = now - this.spectatorDelay * 1000;
    let picked = null;
    for (let i = this.spectatorSnapshots.length - 1; i >= 0; i--) {
      if (this.spectatorSnapshots[i].t <= threshold) { picked = this.spectatorSnapshots[i]; break; }
    }
    if (!picked) return null;
    return { state: picked.state, serverTime: now, snapshotTime: picked.t };
  }

  publicView() {
    return {
      id: this.id,
      name: this.name,
      hostPid: this.hostPid,
      state: this.state,
      opts: this.opts,
      seats: this.seats.map((s, i) => s ? { seat: i, name: s.name, isAI: s.isAI, pid: s.pid } : { seat: i, name: null }),
      identityPrefs: this.identityPrefs,
      identities: IDENTITIES,
      identityDist: IDENTITY_DIST[this.opts.maxPlayers],
      chat: this.chat.slice(-50),
      spectatorCount: this.spectators.size,
      allowSpectate: this.state === 'playing' || this.state === 'ended',
    };
  }

  lobbyView() {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      players: this.seatedPlayers().length,
      maxPlayers: this.opts.maxPlayers,
      spectators: this.spectators.size,
    };
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }
  create(name, hostPid) {
    const id = 'r' + (roomCounter++);
    const room = new Room(id, name, hostPid);
    this.rooms.set(id, room);
    return room;
  }
  get(id) { return this.rooms.get(id); }
  remove(id) { this.rooms.delete(id); }
  list() { return [...this.rooms.values()].map(r => r.lobbyView()); }
}

module.exports = { Room, RoomManager, IDENTITIES };
