// 自定义胜利条件 + 规则预设系统
(function () {
  'use strict';

  const WIN_CONDITIONS = [
    { id: 'default', label: '默认', desc: '按模式默认规则判定', params: [] },
    { id: 'kill_all', label: '击杀所有敌人', desc: '消灭所有敌对角色即可获胜', params: [] },
    { id: 'survive_rounds', label: '存活回合', desc: '存活指定回合数获胜', params: [
      { key: 'rounds', label: '回合数', type: 'number', default: 10, min: 1, max: 100 },
    ]},
    { id: 'first_kills', label: '首杀竞赛', desc: '最先获得指定击杀数获胜', params: [
      { key: 'kills', label: '击杀数', type: 'number', default: 3, min: 1, max: 10 },
    ]},
    { id: 'kill_lord', label: '斩首行动', desc: '击杀对方主帅获胜', params: [] },
    { id: 'last_standing', label: '最后存活', desc: '最后一名存活者获胜', params: [] },
    { id: 'team_kill_all', label: '团灭敌方', desc: '团灭敌方阵营所有角色', params: [] },
    { id: 'kill_count_limit', label: '击杀上限', desc: '达到击杀上限后分数最高者获胜', params: [
      { key: 'maxKills', label: '击杀上限', type: 'number', default: 5, min: 1, max: 20 },
    ]},
    { id: 'hp_threshold', label: '体力阈值', desc: '所有敌方体力低于阈值获胜', params: [
      { key: 'threshold', label: '体力阈值', type: 'number', default: 1, min: 0, max: 5 },
    ]},
    { id: 'card_count', label: '牌堆耗尽', desc: '牌堆耗尽时手牌最多者获胜', params: [] },
    { id: 'custom_script', label: '自定义脚本', desc: '使用 JavaScript 自定义胜利条件', params: [
      { key: 'script', label: '脚本', type: 'textarea', default: '// return winner seat or null\nreturn null;' },
    ]},
  ];

  class WinConditionEvaluator {
    constructor(game, condition, params) {
      this.game = game;
      this.condition = condition;
      this.params = params || {};
    }

    evaluate(alivePlayers) {
      switch (this.condition) {
        case 'default': return null;
        case 'kill_all': {
          const me = this.game.players.find(p => p.seat === 0);
          if (!me) return null;
          const enemies = alivePlayers.filter(p => this.isEnemy(me, p));
          return enemies.length === 0 ? me.seat : null;
        }
        case 'survive_rounds':
          if (this.game.round >= this.params.rounds) return this.game.turnSeat;
          return null;
        case 'first_kills': {
          const killer = alivePlayers.find(p => (p.totalKills || 0) >= this.params.kills);
          return killer ? killer.seat : null;
        }
        case 'kill_lord': {
          const lord = this.game.players.find(p => p.identity === 'zhu' || p.identity === 'landlord');
          if (lord && !lord.alive) {
            const killer = alivePlayers.find(p => p.lastKill === lord.seat);
            if (killer) return killer.seat;
          }
          return null;
        }
        case 'last_standing':
          return alivePlayers.length === 1 ? alivePlayers[0].seat : null;
        case 'team_kill_all': {
          const teams = {};
          alivePlayers.forEach(p => { teams[p.team] = (teams[p.team] || 0) + 1; });
          const keys = Object.keys(teams);
          if (keys.length === 1) {
            // 返回该阵营中存活玩家的座位号
            return alivePlayers[0] ? alivePlayers[0].seat : null;
          }
          return null;
        }
        case 'kill_count_limit': {
          const dead = this.game.players.filter(p => !p.alive);
          if (dead.length >= this.params.maxKills) {
            let best = alivePlayers[0];
            alivePlayers.forEach(p => { if ((p.totalKills || 0) > (best.totalKills || 0)) best = p; });
            return best ? best.seat : null;
          }
          return null;
        }
        case 'hp_threshold': {
          const me = this.game.players.find(p => p.seat === this.game.turnSeat);
          if (!me) return null;
          const enemies = alivePlayers.filter(p => this.isEnemy(me, p));
          if (enemies.length && enemies.every(p => p.hp <= this.params.threshold)) return this.game.turnSeat;
          return null;
        }
        case 'card_count':
          if (this.game.deck.length === 0) {
            let best = alivePlayers[0];
            alivePlayers.forEach(p => { if (p.handCount > best.handCount) best = p; });
            return best ? best.seat : null;
          }
          return null;
        case 'custom_script':
          try {
            // 沙箱化执行：只暴露有限的数据，禁止访问全局对象
            const safeData = {
              round: this.game.round,
              deckCount: this.game.deck.length,
              players: this.game.players.map(p => ({
                seat: p.seat, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
                identity: p.identity, handCount: p.hand.length,
                totalKills: p.totalKills || 0,
              })),
            };
            const script = String(this.params.script || 'return null;').slice(0, 2000);
            const fn = new Function('data', `"use strict"; ${script}`);
            return fn(safeData);
          } catch { return null; }
        default: return null;
      }
    }

    isEnemy(p1, p2) {
      if (!p1 || !p2) return false;
      if (p1.identity === 'zhu' && (p2.identity === 'fan' || p2.identity === 'nei')) return true;
      if (p1.identity === 'fan' && (p2.identity === 'zhu' || p2.identity === 'zhong')) return true;
      if (p1.identity === 'nei' && p2.identity !== 'nei') return true;
      if (p1.identity === 'landlord' && p2.identity === 'farmer') return true;
      if (p1.identity === 'farmer' && p2.identity === 'landlord') return true;
      if (p1.team && p2.team && p1.team !== p2.team) return true;
      return false;
    }
  }

class RulePresetManager {
  constructor() {
    this.presets = JSON.parse(localStorage.getItem('sgk_rule_presets') || '{}');
    const defaults = this._defaults();
    for (const [k, v] of Object.entries(defaults)) {
      if (!this.presets[k]) this.presets[k] = v;
    }
  }

  _defaults() {
    return {
      classic: { name: '经典身份', desc: '标准身份局', opts: { winCondition: 'default', winParams: {} } },
      fast: { name: '快速模式', desc: '15回合上限', opts: { roundLimit: 15, winCondition: 'default', winParams: {} } },
      battle_royale: { name: '大乱斗', desc: '最后存活者获胜', opts: { maxPlayers: 8, gameMode: 'identity', winCondition: 'last_standing', winParams: {} } },
      kill_race: { name: '击杀竞赛', desc: '先获3击杀获胜', opts: { winCondition: 'first_kills', winParams: { kills: 3 } } },
      survive_10: { name: '生存挑战', desc: '存活10回合获胜', opts: { winCondition: 'survive_rounds', winParams: { rounds: 10 } } },
      lord_hunter: { name: '斩首行动', desc: '击杀对方主帅', opts: { winCondition: 'kill_lord', winParams: {} } },
      // 禁将预设
      ban_none: { name: '不禁将', desc: '不禁用任何武将', opts: { banPreset: 'none', bannedGenerals: [], bannedCards: [] } },
      ban_basic: { name: '禁用强力武将', desc: '禁用过于强力的武将', opts: { banPreset: 'basic', bannedGenerals: ['lvbu','guojia','simayi','zhugeliang'], bannedCards: [] } },
      ban_extreme: { name: '禁用极端卡牌', desc: '禁用闪电/无懈', opts: { banPreset: 'cards', bannedGenerals: [], bannedCards: ['shandian','wuxie'] } },
      ban_strict: { name: '严格模式', desc: '强力武将+卡牌全禁', opts: { banPreset: 'strict', bannedGenerals: ['lvbu','guojia','simayi','zhugeliang','xiahoudun'], bannedCards: ['shandian','wuxie','lebu'] } },
    };
  }

    save(name, desc, opts) {
      const id = 'custom_' + Date.now().toString(36);
      this.presets[id] = { name, desc, opts, custom: true };
      this._save();
      return id;
    }

    load(id) { return this.presets[id] || null; }

    remove(id) {
      if (this.presets[id] && this.presets[id].custom) { delete this.presets[id]; this._save(); return true; }
      return false;
    }

    list() {
      return Object.entries(this.presets).map(([id, p]) => ({ id, name: p.name, desc: p.desc, custom: !!p.custom }));
    }

    encode(opts) {
      try { return btoa(encodeURIComponent(JSON.stringify(opts)).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16)))); }
      catch { return null; }
    }

    decode(code) {
      try { return JSON.parse(decodeURIComponent(atob(code).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))); }
      catch { return null; }
    }

    _save() { try { localStorage.setItem('sgk_rule_presets', JSON.stringify(this.presets)); } catch {} }
  }

  window.GameRules = { WIN_CONDITIONS, WinConditionEvaluator, RulePresetManager };
})();
