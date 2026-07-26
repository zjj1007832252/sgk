// 房间管理：大厅 / 座位 / 点身份 / 开局
const { Game, IDENTITIES, IDENTITY_DIST } = require('./engine/game');
const { GENERALS } = require('./engine/generals');

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
    };
    this.identityPrefs = {};   // pid -> identity
    this.state = 'lobby';      // lobby | playing | ended
    this.game = null;
    this.chat = [];
  }

  seatedPlayers() {
    return this.seats.filter(Boolean);
  }
  seatOf(pid) {
    return this.seats.findIndex(s => s && s.pid === pid);
  }
  hasPid(pid) {
    return this.seatOf(pid) >= 0;
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
      pickMode: this.opts.pickMode,
      pickCount: this.opts.pickCount,
      generalIds: generalPool.map(g => g.id),
      generals: generalPool,
      allowIdentityPick: this.opts.allowIdentityPick,
      identityPrefs: this.identityPrefs,
      aiDelay: this.opts.aiDelay,
      stepDelay: Math.min(600, this.opts.aiDelay / 2 + 200),
    }, hooks);
    this.state = 'playing';
    return { ok: true, game: this.game };
  }

  backToLobby(pid) {
    if (pid !== this.hostPid) return { ok: false, msg: '只有房主可以操作' };
    this.state = 'lobby';
    this.game = null;
    // 移除 AI 座位？保留，方便再开
    return { ok: true };
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
    };
  }

  lobbyView() {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      players: this.seatedPlayers().length,
      maxPlayers: this.opts.maxPlayers,
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
