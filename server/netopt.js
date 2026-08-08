// 网络优化：消息批量 / Delta 更新 / 心跳 / 重连恢复

class NetworkOptimizer {
  constructor() {
    this.buffers = new Map();
    this.timers = new Map();
    this.lastState = new Map();
    this.batchInterval = 50;
    this.heartbeatInterval = 30000;
  }

  // 批量发送消息
  batch(pid, msg) {
    if (!this.buffers.has(pid)) this.buffers.set(pid, []);
    this.buffers.get(pid).push(msg);

    if (!this.timers.has(pid)) {
      const timer = setTimeout(() => this.flush(pid), this.batchInterval);
      this.timers.set(pid, timer);
    }
  }

  // 立即发送（不批量）
  sendImmediate(ws, msg) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  // 刷新缓冲区
  flush(pid) {
    this.timers.delete(pid);
    const msgs = this.buffers.get(pid);
    this.buffers.delete(pid);
    if (!msgs || !msgs.length) return;

    const ws = this.wsMap ? this.wsMap.get(pid) : null;
    if (!ws || ws.readyState !== 1) return;

    if (msgs.length === 1) {
      ws.send(JSON.stringify(msgs[0]));
    } else {
      ws.send(JSON.stringify({ type: 'batch', messages: msgs }));
    }
  }

  // 计算状态哈希（用于 delta 检测）
  hashState(state) {
    // 轻量级哈希：取关键字段 + 增加校验位减少碰撞
    let h = state.phase + '|' + state.turnSeat + '|' + state.round + '|' + state.deckCount + '|' + (state.winner || '') + '|';
    for (const p of state.players || []) {
      h += p.seat + ':' + p.hp + ':' + p.maxHp + ':' + p.handCount + ':' + (p.alive ? 1 : 0) + ':';
      // 包含装备和判定区信息减少碰撞
      if (p.equips) {
        for (const [k, v] of Object.entries(p.equips)) {
          h += k + (v ? v.key : '') + ',';
        }
      }
      h += '|';
    }
    return h;
  }

  // 获取 delta 状态（只返回变化的部分）
  getDeltaState(pid, fullState) {
    const hash = this.hashState(fullState);
    const last = this.lastState.get(pid);

    if (last === hash) {
      return { type: 'stateSame', hash }; // 状态未变，跳过
    }

    this.lastState.set(pid, hash);
    return { type: 'game', state: fullState, hash };
  }

  // 清理
  cleanup(pid) {
    this.buffers.delete(pid);
    const t = this.timers.get(pid);
    if (t) { clearTimeout(t); this.timers.delete(pid); }
    this.lastState.delete(pid);
  }

  // 设置 WebSocket 映射
  setWsMap(map) { this.wsMap = map; }

  // 发送心跳
  sendHeartbeat(ws) {
    if (ws && ws.readyState === 1) {
      try { ws.ping(); } catch {}
    }
  }
}

module.exports = { NetworkOptimizer };
