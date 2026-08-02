// 游戏模式架构
class GameMode {
  constructor(game) {
    this.game = game;
  }

  get id() { return 'identity'; }
  get name() { return '身份局'; }
  get minPlayers() { return 4; }
  get maxPlayers() { return 8; }
  get description() { return '经典身份局：主/忠/反/内'; }

  getIdentityDistribution(playerCount) {
    const dist = {
      4: ['zhu', 'zhong', 'fan', 'fan'],
      5: ['zhu', 'zhong', 'fan', 'fan', 'nei'],
      6: ['zhu', 'zhong', 'fan', 'fan', 'fan', 'nei'],
      7: ['zhu', 'zhong', 'zhong', 'fan', 'fan', 'fan', 'nei'],
      8: ['zhu', 'zhong', 'zhong', 'fan', 'fan', 'fan', 'fan', 'nei'],
    };
    return dist[playerCount] || dist[8];
  }

  checkWin(alivePlayers) {
    const zhu = alivePlayers.find(p => p.identity === 'zhu');
    if (!zhu) {
      if (alivePlayers.length === 1 && alivePlayers[0].identity === 'nei') return 'nei';
      return 'fan';
    }
    if (!alivePlayers.some(p => p.identity === 'fan' || p.identity === 'nei')) return 'zhu';
    return null;
  }

  shouldRevealIdentity() { return true; }
  getPickMode() { return 'random'; }
  getMaxHandLimit(player) { return player.hp; }
}

class OneVOneMode extends GameMode {
  get id() { return '1v1'; }
  get name() { return '1v1 单挑'; }
  get minPlayers() { return 2; }
  get maxPlayers() { return 2; }
  get description() { return 'KOF 赛制：击败对方所有武将'; }

  getIdentityDistribution(playerCount) {
    return ['fan', 'fan'];
  }

  checkWin(alivePlayers) {
    const teams = {};
    alivePlayers.forEach(p => { teams[p.team] = (teams[p.team] || 0) + 1; });
    const teamKeys = Object.keys(teams);
    if (teamKeys.length === 1) return teamKeys[0];
    return null;
  }

  shouldRevealIdentity() { return false; }
  getPickMode() { return 'kof'; }
  getGeneralsPerPlayer() { return 3; }
}

class ThreeVThreeMode extends GameMode {
  get id() { return '3v3'; }
  get name() { return '3v3 对抗'; }
  get minPlayers() { return 6; }
  get maxPlayers() { return 6; }
  get description() { return '冷暖阵营对抗 + 换将机制'; }

  getIdentityDistribution(playerCount) {
    return ['zhu', 'fan', 'fan', 'zhu', 'fan', 'fan'];
  }

  checkWin(alivePlayers) {
    const zhuAlive = alivePlayers.some(p => p.identity === 'zhu');
    if (!zhuAlive) {
      const dead = this.game.players.find(p => p.identity === 'zhu' && !p.alive);
      if (dead) return dead.team === 'cold' ? 'warm' : 'cold';
    }
    return null;
  }

  shouldRevealIdentity() { return true; }
  getPickMode() { return '3v3'; }
}

class GuoZhanMode extends GameMode {
  get id() { return 'guozhan'; }
  get name() { return '国 战'; }
  get minPlayers() { return 2; }
  get maxPlayers() { return 8; }
  get description() { return '双武将暗置 + 珠联璧合 + 野心家'; }

  getIdentityDistribution(playerCount) { return []; }

  checkWin(alivePlayers) {
    const kingdoms = {};
    alivePlayers.forEach(p => {
      const k = p.kingdom || 'qun';
      kingdoms[k] = (kingdoms[k] || 0) + 1;
    });
    const keys = Object.keys(kingdoms);
    if (keys.length === 1) return keys[0];
    return null;
  }

  shouldRevealIdentity() { return false; }
  getPickMode() { return 'guozhan'; }
  getGeneralsPerPlayer() { return 2; }

  getSynergyPairs() {
    return [
      ['liubei', 'guanyu'], ['guanyu', 'zhangfei'], ['liubei', 'zhangfei'],
      ['caocao', 'xiahoudun'], ['sunquan', 'zhouyu'],
      ['zhaoyun', 'liubei'], ['zhouyu', 'huanggai'],
      ['lvbu', 'diaochan'], ['huatuo', 'lvbu'],
    ];
  }
}

class DouDiZhuMode extends GameMode {
  get id() { return 'doudizhu'; }
  get name() { return '斗地主'; }
  get minPlayers() { return 3; }
  get maxPlayers() { return 3; }
  get description() { return '1 地主 vs 2 农民'; }

  getIdentityDistribution(playerCount) {
    return ['landlord', 'farmer', 'farmer'];
  }

  checkWin(alivePlayers) {
    const landlord = alivePlayers.find(p => p.identity === 'landlord');
    const farmer = alivePlayers.find(p => p.identity === 'farmer');
    if (!landlord) return 'farmer';
    if (!farmer) return 'landlord';
    return null;
  }

  shouldRevealIdentity() { return true; }
  getPickMode() { return 'doudizhu'; }

  getHpBonus(player) {
    return player.identity === 'landlord' ? 1 : 0;
  }

  getStartCards(player) {
    return player.identity === 'landlord' ? 5 : 4;
  }
}

const MODES = {
  identity: GameMode,
  '1v1': OneVOneMode,
  '3v3': ThreeVThreeMode,
  guozhan: GuoZhanMode,
  doudizhu: DouDiZhuMode,
};

function createGameMode(game, modeId) {
  const Cls = MODES[modeId] || GameMode;
  return new Cls(game);
}

function createGameMode(game, modeId) {
  const Cls = MODES[modeId] || GameMode;
  return new Cls(game);
}

// ==================== 胜利条件评估器（服务端） ====================
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
        const enemies = alivePlayers.filter(p => this._isEnemy(me, p));
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
        return keys.length === 1 ? keys[0] : null;
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
        const enemies = alivePlayers.filter(p => me && this._isEnemy(me, p));
        if (enemies.every(p => p.hp <= this.params.threshold)) return this.game.turnSeat;
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
          const fn = new Function('players', 'game', this.params.script || 'return null;');
          return fn(alivePlayers, { round: this.game.round, deckCount: this.game.deck.length, players: this.game.players });
        } catch { return null; }
      default: return null;
    }
  }

  _isEnemy(p1, p2) {
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

if (typeof window !== 'undefined') {
  window.GameModes = { GameMode, OneVOneMode, ThreeVThreeMode, GuoZhanMode, DouDiZhuMode, MODES, createGameMode, WinConditionEvaluator };
}
if (typeof module !== 'undefined') {
  module.exports = { GameMode, OneVOneMode, ThreeVThreeMode, GuoZhanMode, DouDiZhuMode, MODES, createGameMode, WinConditionEvaluator };
}
