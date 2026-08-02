// 数据持久化：战绩 / 统计 / 回放
(function () {
  'use strict';

  const DB_KEY = 'sgk_data_v1';

  function loadDB() {
    try { return JSON.parse(localStorage.getItem(DB_KEY) || '{}'); } catch { return {}; }
  }

  function saveDB(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { console.warn('saveDB failed', e); }
  }

  // 记录一场对局
  function recordGame(data) {
    const db = loadDB();
    if (!db.history) db.history = [];
    if (!db.stats) db.stats = {};
    const record = {
      id: 'game_' + Date.now().toString(36),
      timestamp: Date.now(),
      duration: data.duration || 0,
      players: data.players || [],
      winner: data.winner || '',
      myIdentity: data.myIdentity || '',
      myGeneral: data.myGeneral || '',
      myResult: data.myResult || '', // win/lose
      rounds: data.rounds || 0,
      log: data.log || [],
    };
    db.history.unshift(record);
    if (db.history.length > 100) db.history = db.history.slice(0, 100);

    // 更新统计
    const me = (data.players || []).find(p => p.isMe);
    if (me) {
      const s = db.stats;
      s.totalGames = (s.totalGames || 0) + 1;
      if (record.myResult === 'win') s.wins = (s.wins || 0) + 1;
      else s.losses = (s.losses || 0) + 1;
      // 武将使用统计
      if (!s.generalStats) s.generalStats = {};
      const gid = me.generalId || 'unknown';
      if (!s.generalStats[gid]) s.generalStats[gid] = { name: me.generalName || gid, count: 0, wins: 0, kills: 0, damage: 0 };
      s.generalStats[gid].count++;
      if (record.myResult === 'win') s.generalStats[gid].wins++;
      s.generalStats[gid].kills += me.kills || 0;
      s.generalStats[gid].damage += me.damage || 0;
      // 身份统计
      if (!s.identityStats) s.identityStats = {};
      const idKey = me.identity || 'unknown';
      if (!s.identityStats[idKey]) s.identityStats[idKey] = { count: 0, wins: 0 };
      s.identityStats[idKey].count++;
      if (record.myResult === 'win') s.identityStats[idKey].wins++;
    }

    saveDB(db);
    return record;
  }

  function getHistory(limit = 20) {
    const db = loadDB();
    return (db.history || []).slice(0, limit);
  }

  function getStats() {
    const db = loadDB();
    return db.stats || {};
  }

  function getGeneralRanking() {
    const db = loadDB();
    const gs = (db.stats || {}).generalStats || {};
    return Object.values(gs).sort((a, b) => b.count - a.count);
  }

  function clearData() {
    const db = loadDB();
    delete db.history;
    delete db.stats;
    saveDB(db);
  }

  // 生成战绩摘要文本
  function formatRecord(rec) {
    const date = new Date(rec.timestamp);
    const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    const resultStr = rec.myResult === 'win' ? '🏆 胜利' : '💀 失败';
    return `[${timeStr}] ${resultStr} | 身份:${rec.myIdentity} | 武将:${rec.myGeneral} | ${rec.rounds}回合`;
  }

  window.SGKData = { recordGame, getHistory, getStats, getGeneralRanking, clearData, formatRecord, loadDB, saveDB };
})();
