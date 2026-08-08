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
      // 连胜
      if (record.myResult === 'win') {
        s.currentStreak = (s.currentStreak || 0) + 1;
        s.maxStreak = Math.max(s.maxStreak || 0, s.currentStreak);
      } else {
        s.currentStreak = 0;
      }
      // 身份胜场
      if (record.myResult === 'win') {
        if (me.identity === 'zhu') s.lordWins = (s.lordWins || 0) + 1;
        if (me.identity === 'nei') s.neiWins = (s.neiWins || 0) + 1;
      }
      // 最快胜利回合
      if (record.myResult === 'win') {
        s.minWinRound = Math.min(s.minWinRound || 999, record.rounds || 999);
      }
      // 击杀 / 伤害 / 治疗 / 救援
      const mst = me.stats || {};
      s.totalKills = (s.totalKills || 0) + (mst.kills || 0);
      s.maxKills = Math.max(s.maxKills || 0, mst.kills || 0);
      s.totalDamage = (s.totalDamage || 0) + (mst.damageDealt || 0);
      s.totalHeal = (s.totalHeal || 0) + (mst.healing || 0);
      s.saves = (s.saves || 0) + (mst.saves || 0);
      // 首次击杀：记录生涯中完成击杀的总场次（每局最多+1）
      if ((mst.kills || 0) > 0) s.gamesWithKill = (s.gamesWithKill || 0) + 1;
      // 使用过的牌种
      if (Array.isArray(mst.cardKeys)) {
        s.uniqueCardKeys = Array.from(new Set([...(s.uniqueCardKeys || []), ...mst.cardKeys]));
        s.uniqueCards = s.uniqueCardKeys.length;
      }
      // 使用过的武将
      if (me.generalId) {
        s.uniqueGeneralIds = Array.from(new Set([...(s.uniqueGeneralIds || []), me.generalId]));
        s.uniqueGenerals = s.uniqueGeneralIds.length;
      }
      // DIY 武将数量
      if (typeof data.diyCount === 'number') s.diyCount = data.diyCount;
      // 武将使用统计
      if (!s.generalStats) s.generalStats = {};
      const gid = me.generalId || 'unknown';
      if (!s.generalStats[gid]) s.generalStats[gid] = { name: me.generalName || gid, count: 0, wins: 0, kills: 0, damage: 0 };
      s.generalStats[gid].count++;
      if (record.myResult === 'win') s.generalStats[gid].wins++;
      s.generalStats[gid].kills += mst.kills || 0;
      s.generalStats[gid].damage += mst.damageDealt || 0;
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
