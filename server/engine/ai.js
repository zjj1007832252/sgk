// 智能 AI：身份推理 + 威胁评估 + 资源管理 + 技能协同
const { cardColor } = require('./cards');

// ==================== 行为追踪 ====================
class BehaviorTracker {
  constructor(game) {
    this.game = game;
    this.data = {}; // seat -> behavior record
    game.players.forEach(p => {
      this.data[p.seat] = {
        damageDealt: {},      // targetSeat -> total damage
        damageTaken: 0,
        healsGiven: 0,
        healsReceived: 0,
        cardsPlayed: 0,
        equipsUsed: 0,
        kills: 0,
        attackedLord: false,
        protectedLord: false,
        usedAOE: 0,
        skillTriggers: {},
        lastTargets: [],
        suspicious: 0,
      };
    });
  }

  recordDamage(fromSeat, toSeat, amount) {
    if (fromSeat == null) return;
    const d = this.data[fromSeat];
    d.damageDealt[toSeat] = (d.damageDealt[toSeat] || 0) + amount;
    this.data[toSeat].damageTaken += amount;
    const target = this.game.players[toSeat];
    const lord = this.game.players.find(p => p.identity === 'zhu');
    if (target && lord) {
      if (toSeat === lord.seat) d.attackedLord = true;
      if (fromSeat === lord.seat) this.data[toSeat].protectedLord = true;
    }
  }

  recordHeal(fromSeat, toSeat) {
    if (fromSeat != null) this.data[fromSeat].healsGiven++;
    this.data[toSeat].healsReceived++;
  }

  recordKill(killerSeat) {
    if (killerSeat != null) this.data[killerSeat].kills++;
  }

  recordCardPlay(seat) { if (seat != null) this.data[seat].cardsPlayed++; }
  recordEquip(seat) { if (seat != null) this.data[seat].equipsUsed++; }
  recordAOE(seat) { if (seat != null) this.data[seat].usedAOE++; }
  recordSkill(seat, skillId) {
    if (seat == null) return;
    const d = this.data[seat];
    d.skillTriggers[skillId] = (d.skillTriggers[skillId] || 0) + 1;
  }

  get(seat) { return this.data[seat] || {}; }
}

// ==================== 身份推理 ====================
class IdentityInference {
  constructor(game, tracker) {
    this.game = game;
    this.tracker = tracker;
    this.probs = {}; // seat -> { zhu, zhong, fan, nei }
  }

  // 推断某座位的身份概率
  infer(seat) {
    if (this.probs[seat]) return this.probs[seat];
    const me = this.game.players[seat];
    if (!me) return null;
    if (me.identity === 'zhu') return { zhu: 1, zhong: 0, fan: 0, nei: 0 };
    if (!me.alive && me.dead) return { [me.dead.identity]: 1 };

    const lord = this.game.players.find(p => p.identity === 'zhu');
    const alive = this.game.alivePlayers();
    const bt = this.tracker.get(seat);

    // 基础概率（按存活人数身份分布）
    const dist = this._identityDistribution(alive.length);
    let probs = { ...dist };

    // 行为修正
    if (lord) {
      // 攻击主公 → 反贼概率↑
      if (bt.attackedLord) { probs.fan += 0.4; probs.zhong -= 0.2; probs.nei -= 0.1; }
      // 保护主公（回血/无懈） → 忠臣概率↑
      if (bt.protectedLord) { probs.zhong += 0.3; probs.fan -= 0.2; }
      // 从未攻击主公且主公健康 → 内奸/忠臣概率↑
      if (!bt.attackedLord && lord.hp >= lord.maxHp - 1) {
        probs.nei += 0.15; probs.zhong += 0.1;
      }
    }

    // 高伤害输出 → 反贼概率↑
    const totalDmg = Object.values(bt.damageDealt).reduce((a, b) => a + b, 0);
    if (totalDmg >= 3) probs.fan += 0.15;

    // 使用 AOE → 反贼概率↑
    if (bt.usedAOE >= 1) probs.fan += 0.1;

    // 治疗他人 → 忠臣/内奸概率↑
    if (bt.healsGiven >= 1) { probs.zhong += 0.1; probs.nei += 0.05; }

    // 归一化
    const total = probs.zhong + probs.fan + probs.nei;
    if (total > 0) {
      probs.zhong /= total; probs.fan /= total; probs.nei /= total;
    }
    probs.zhu = 0;

    this.probs[seat] = probs;
    return probs;
  }

  // 推断某座位是敌人的概率
  isEnemy(seat, myIdentity) {
    const probs = this.infer(seat);
    if (!probs) return 0.5;
    switch (myIdentity) {
      case 'fan': return probs.zhu + probs.zhong + probs.nei * 0.5;
      case 'zhong': return probs.fan + probs.nei * 0.3;
      case 'zhu': return probs.fan + probs.nei * 0.4;
      case 'nei': return probs.fan * 0.3 + probs.zhong * 0.3;
      default: return 0.5;
    }
  }

  // 推断某座位是盟友的概率
  isAlly(seat, myIdentity) {
    return 1 - this.isEnemy(seat, myIdentity);
  }

  _identityDistribution(aliveCount) {
    // 简化：根据存活人数估算剩余身份
    const total = { zhong: 1, fan: 2, nei: 1 };
    const aliveIds = this.game.alivePlayers().map(p => p.identity);
    aliveIds.forEach(id => { if (total[id]) total[id] = Math.max(0, total[id] - 0.3); });
    const sum = total.zhong + total.fan + total.nei;
    return { zhong: total.zhong / sum, fan: total.fan / sum, nei: total.nei / sum };
  }
}

// ==================== 威胁评估 ====================
class ThreatAssessor {
  constructor(game, tracker, inference) {
    this.game = game;
    this.tracker = tracker;
    this.inference = inference;
  }

  // 评估某座位对我的威胁分数 (0~100)
  assess(seat, mySeat) {
    const p = this.game.players[seat];
    if (!p || !p.alive || seat === mySeat) return 0;
    const my = this.game.players[mySeat];
    if (!my) return 0;

    let score = 0;
    const enemyProb = this.inference.isEnemy(seat, my.identity);

    // 基础威胁 = 敌概率 * 50
    score += enemyProb * 50;

    // 距离越近威胁越大
    const dist = this.game.distance(my, p);
    if (dist <= 1) score += 15;
    else if (dist <= 2) score += 8;

    // 手牌越多威胁越大
    score += Math.min(p.handCount, 5) * 3;

    // 装备威胁
    if (p.equips.weapon) score += 8;
    if (p.equips.armor) score += 4;
    if (p.equips.horse_plus) score += 3;

    // 低血量 = 低威胁（濒死优先补刀）
    if (p.hp <= 1) score += 10; // 濒死优先击杀
    else if (p.hp <= 2) score += 5;

    // 历史伤害输出高的更危险
    const bt = this.tracker.get(seat);
    const totalDmg = Object.values(bt.damageDealt).reduce((a, b) => a + b, 0);
    score += Math.min(totalDmg, 5) * 2;

    // 对我的直接伤害
    if (bt.damageDealt[mySeat]) score += bt.damageDealt[mySeat] * 5;

    // 特殊武将威胁
    const dangerousGens = ['lvbu', 'zhangliao', 'guojia', 'huangyueying', 'zhenji', 'zhouyu'];
    if (dangerousGens.includes(p.generalId)) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  // 评估某座位的脆弱性 (0~100, 越高越容易击杀)
  vulnerability(seat) {
    const p = this.game.players[seat];
    if (!p || !p.alive) return 0;
    let score = 0;
    // 低血量 = 更脆弱
    score += (p.maxHp - p.hp) * 15;
    // 手牌少 = 更脆弱
    score += Math.max(0, 4 - p.handCount) * 8;
    // 无防具 = 更脆弱
    if (!p.equips.armor) score += 10;
    // 无武器 = 威胁低但脆弱
    if (!p.equips.weapon) score += 3;
    return Math.min(100, score);
  }
}

// ==================== 资源管理 ====================
class ResourceManager {
  constructor(game) {
    this.game = game;
  }

  // 评估手牌保留价值
  keepValue(card, player, context = {}) {
    const hpRatio = player.hp / player.maxHp;
    switch (card.key) {
      case 'tao':
        // 低血量时桃价值极高；满血时价值低
        if (hpRatio <= 0.3) return 15;
        if (hpRatio <= 0.6) return 10;
        return 6;
      case 'shan':
        // 有闪时价值适中，无闪时价值高
        const shanCount = player.hand.filter(c => c.key === 'shan').length;
        if (shanCount <= 1) return 9;
        return 5;
      case 'sha':
        const shaCount = player.hand.filter(c => c.key === 'sha').length;
        if (shaCount <= 1) return 7;
        return 4;
      case 'wuxie': return 8;
      case 'juedou': return 6;
      case 'guohe': return 5;
      case 'shunshou': return 5;
      case 'nanman': case 'wanjian': return 4;
      case 'wuzhong': return 7;
      case 'lebu': return 4;
      case 'shandian': return 2;
      default:
        if (card.type === 'equip') return 6;
        return 3;
    }
  }

  // 判断是否该保留某张牌（不出）
  shouldKeep(card, player, turnNumber) {
    const val = this.keepValue(card, player);
    // 游戏前期更倾向保留
    if (turnNumber <= 2 && val >= 7) return true;
    // 低血量保留桃闪
    if (player.hp <= 2 && (card.key === 'tao' || card.key === 'shan')) return true;
    return false;
  }

  // 计算手牌压力（是否需要弃牌）
  discardPressure(player) {
    return Math.max(0, player.hand.length - player.hp);
  }
}

// ==================== 主 AI 决策引擎 ====================
class AIBrain {
  constructor(game) {
    this.game = game;
    this.tracker = new BehaviorTracker(game);
    this.inference = new IdentityInference(game, this.tracker);
    this.threat = new ThreatAssessor(game, this.tracker, this.inference);
    this.resource = new ResourceManager(game);
    this.turnCount = 0;
  }

  // 主决策入口
  async decide(game, player, prompt) {
    // 同步追踪数据
    this._syncTracker(game);

    switch (prompt.kind) {
      case 'play': return this._decidePlay(game, player, prompt);
      case 'respond': return this._decideRespond(game, player, prompt);
      case 'confirm': return this._decideConfirm(game, player, prompt);
      case 'chooseOption': return this._decideChooseOption(game, player, prompt);
      case 'choosePlayers': return this._decideChoosePlayers(game, player, prompt);
      case 'chooseCards': return this._decideChooseCards(game, player, prompt);
      case 'chooseCardOf': return this._decideChooseCardOf(game, player, prompt);
      case 'arrange': return this._decideArrange(game, player, prompt);
      case 'chooseGeneral': return this._decideChooseGeneral(game, player, prompt);
      default: return this._fallback(game, player, prompt);
    }
  }

  _syncTracker(game) {
    // 从游戏状态同步行为数据（轻量）
    game.players.forEach(p => {
      const bt = this.tracker.get(p.seat);
      bt.lastTargets = bt.lastTargets.slice(-5);
    });
  }

  // ==================== 出牌阶段决策 ====================
  _decidePlay(game, player, prompt) {
    this.turnCount++;
    const hand = player.hand;
    const enemies = this._getEnemies(player);
    const allies = this._getAllies(player);
    const threats = this._rankThreats(player);

    // 1. 濒死自救
    if (player.hp <= 2 && player.hp < player.maxHp) {
      const tao = hand.find(c => c.key === 'tao');
      if (tao) return { action: 'playCard', cardIds: [tao.uid], targets: [] };
    }

    // 2. 技能协同：先考虑强力技能
    const skillAction = this._considerSkills(game, player, prompt, enemies, allies, threats);
    if (skillAction) return skillAction;

    // 3. 装备（优先武器和防具）
    const equipAction = this._considerEquip(game, player, hand);
    if (equipAction) return equipAction;

    // 4. 无中生有 / 五谷（过牌）
    const wuzhong = hand.find(c => c.key === 'wuzhong');
    if (wuzhong && this._shouldDrawCards(player)) {
      return { action: 'playCard', cardIds: [wuzhong.uid], targets: [] };
    }

    // 5. 顺手牵羊 / 过河拆桥（拆敌人关键牌）
    const disruptAction = this._considerDisrupt(game, player, hand, enemies, threats);
    if (disruptAction) return disruptAction;

    // 6. 乐不思蜀（给高威胁敌人）
    const lebuAction = this._considerLebu(game, player, hand, threats);
    if (lebuAction) return lebuAction;

    // 7. AOE（敌人多时使用）
    const aoeAction = this._considerAOE(game, player, hand, enemies, allies);
    if (aoeAction) return aoeAction;

    // 8. 决斗（有把握时）
    const juedouAction = this._considerJuedou(game, player, hand, enemies, threats);
    if (juedouAction) return juedouAction;

    // 9. 杀（核心输出）
    const shaAction = this._considerSha(game, player, hand, enemies, threats);
    if (shaAction) return shaAction;

    // 10. 桃园（队友多受伤时）
    const taoyuanAction = this._considerTaoyuan(game, player, hand, allies);
    if (taoyuanAction) return taoyuanAction;

    // 11. 闪电（优势时）
    const sdAction = this._considerShandian(game, player, hand, enemies, allies);
    if (sdAction) return sdAction;

    return { action: 'end' };
  }

  // ==================== 技能协同 ====================
  _considerSkills(game, player, prompt, enemies, allies, threats = []) {
    const skills = (prompt.skills || []).filter(s => !s.passive && s.usable);
    if (!skills.length) return null;

    // 按技能优先级排序
    const priority = this._skillPriority(player, enemies, allies);

    for (const sk of priority) {
      const def = this._getSkillDef(sk.id);
      if (!def) continue;

      switch (sk.id) {
        case 'kurou': // 苦肉：有桃或体力充裕时
          if (player.hp >= 3 || (player.hp === 2 && player.hand.some(c => c.key === 'tao'))) {
            return { action: 'skill', skill: 'kurou', cardIds: [], targets: [] };
          }
          break;
        case 'zhiheng': { // 制衡：手牌质量低时
          const junk = this._countJunkCards(player);
          if (junk >= 2) return { action: 'skill', skill: 'zhiheng', cardIds: this._pickDiscardCards(player, junk), targets: [] };
          break;
        }
        case 'rende': { // 仁德：有队友且手牌多
          const woundedAlly = allies.find(a => a.hp < a.maxHp);
          const junk = player.hand.filter(c => this.resource.keepValue(c, player) <= 4);
          if (woundedAlly && junk.length >= 2 && (player.hp < player.maxHp || junk.length >= 3)) {
            return { action: 'skill', skill: 'rende', cardIds: junk.slice(0, 2).map(c => c.uid), targets: [woundedAlly.seat] };
          }
          break;
        }
        case 'fanjian': { // 反间：手牌多且敌人手牌少
          const target = enemies.find(e => e.handCount <= 2) || enemies[0];
          if (target && player.hand.length >= 2) {
            return { action: 'skill', skill: 'fanjian', cardIds: [], targets: [target.seat] };
          }
          break;
        }
        case 'jieyin': { // 结姻：有受伤男性队友
          const maleAlly = allies.find(a => a.gender === 'm' && a.hp < a.maxHp);
          const junk = player.hand.filter(c => this.resource.keepValue(c, player) <= 5);
          if (maleAlly && junk.length >= 2) {
            return { action: 'skill', skill: 'jieyin', cardIds: junk.slice(0, 2).map(c => c.uid), targets: [maleAlly.seat] };
          }
          break;
        }
        case 'qingnang': { // 青囊：有受伤队友
          const wounded = [player, ...allies].find(a => a.hp < a.maxHp);
          const junk = player.hand.find(c => this.resource.keepValue(c, player) <= 5);
          if (wounded && junk) {
            return { action: 'skill', skill: 'qingnang', cardIds: [junk.uid], targets: [wounded.seat] };
          }
          break;
        }
        case 'lijian': { // 离间：两个男性敌人
          const males = enemies.filter(e => e.gender === 'm');
          const junk = player.hand.find(c => this.resource.keepValue(c, player) <= 5);
          if (males.length >= 2 && junk) {
            return { action: 'skill', skill: 'lijian', cardIds: [junk.uid], targets: [males[0].seat, males[1].seat] };
          }
          break;
        }
        case 'jijiang': // 激将：蜀国队友多
          if (game.aliveOthers(player).some(p => p.kingdom === 'shu') && game.canPlaySha(player)) {
            const targets = game.playableShaTargets(player);
            const t = this._pickBestTarget(targets, player);
            if (t) return { action: 'skill', skill: 'jijiang', cardIds: [], targets: [t.seat] };
          }
          break;
        case 'qixi': { // 奇袭：有黑色牌且需要拆/杀
          const black = player.hand.filter(c => cardColor(c) === 'black' && c.key !== 'sha' && c.key !== 'shan');
          if (black.length && enemies.length) {
            const t = this._pickBestTarget(enemies, player);
            if (t) return { action: 'playCard', cardIds: [black[0].uid], as: 'guohe', targets: [t.seat] };
          }
          break;
        }
        case 'guose': { // 国色：有方块且敌人需要乐不
          const diamond = player.hand.find(c => c.suit === 'diamond');
          const t = threats[0];
          if (diamond && t && !game.players[t.seat].judgeZone.some(j => j.key === 'lebu')) {
            return { action: 'playCard', cardIds: [diamond.uid], as: 'lebu', targets: [t.seat] };
          }
          break;
        }
      }
    }
    return null;
  }

  _skillPriority(player, enemies, allies) {
    const skills = player.skills;
    const priority = [];
    // 根据身份和局势排序
    if (skills.includes('kurou')) priority.push('kurou');
    if (skills.includes('zhiheng')) priority.push('zhiheng');
    if (skills.includes('rende')) priority.push('rende');
    if (skills.includes('fanjian')) priority.push('fanjian');
    if (skills.includes('jieyin')) priority.push('jieyin');
    if (skills.includes('qingnang')) priority.push('qingnang');
    if (skills.includes('lijian')) priority.push('lijian');
    if (skills.includes('jijiang')) priority.push('jijiang');
    if (skills.includes('qixi')) priority.push('qixi');
    if (skills.includes('guose')) priority.push('guose');
    return priority.map(id => ({ id, name: id }));
  }

  _getSkillDef(skillId) {
    try { return require('./skills')[SKILL_IDS[skillId]] || { name: skillId }; } catch { return { name: skillId }; }
  }

  // ==================== 装备决策 ====================
  _considerEquip(game, player, hand) {
    const equips = hand.filter(c => c.type === 'equip');
    for (const eq of equips) {
      const slot = eq.subtype;
      const cur = player.equips[slot];
      // 空槽或升级武器时装备
      if (!cur || (slot === 'weapon' && (eq.range || 1) > (cur.range || 1))) {
        return { action: 'playCard', cardIds: [eq.uid], targets: [] };
      }
    }
    return null;
  }

  // ==================== 拆牌决策 ====================
  _considerDisrupt(game, player, hand, enemies, threats) {
    const shun = hand.find(c => c.key === 'shunshou');
    const guo = hand.find(c => c.key === 'guohe');

    // 优先拆高威胁敌人的装备/手牌
    const highThreat = threats.find(t => {
      const p = game.players[t.seat];
      return (p.equips.weapon || p.handCount >= 3) && this.game.distance(player, p) <= (shun ? 1 : 99);
    });

    if (highThreat) {
      const target = highThreat.seat;
      if (shun && game.distance(player, game.players[target]) <= 1 && this._cardCountOf(game.players[target]) > 0) {
        return { action: 'playCard', cardIds: [shun.uid], targets: [target] };
      }
      if (guo && this._cardCountOf(game.players[target]) > 0) {
        return { action: 'playCard', cardIds: [guo.uid], targets: [target] };
      }
    }
    return null;
  }

  // ==================== 乐不思蜀决策 ====================
  _considerLebu(game, player, hand, threats) {
    const lebu = hand.find(c => c.key === 'lebu');
    if (!lebu) return null;
    // 给最高威胁且没有乐不的敌人
    for (const t of threats) {
      const p = game.players[t.seat];
      if (!p.judgeZone.some(j => j.key === 'lebu') && !p.skills.includes('qianxun')) {
        return { action: 'playCard', cardIds: [lebu.uid], targets: [t.seat] };
      }
    }
    return null;
  }

  // ==================== AOE 决策 ====================
  _considerAOE(game, player, hand, enemies, allies) {
    const nanman = hand.find(c => c.key === 'nanman');
    const wanjian = hand.find(c => c.key === 'wanjian');
    const aoe = nanman || wanjian;
    if (!aoe) return null;

    // 敌人比盟友多时使用
    const enemyCount = enemies.filter(e => e.alive).length;
    const allyCount = allies.filter(a => a.alive).length;
    if (enemyCount > allyCount && player.hp >= 2) {
      return { action: 'playCard', cardIds: [aoe.uid], targets: [] };
    }
    return null;
  }

  // ==================== 决斗决策 ====================
  _considerJuedou(game, player, hand, enemies, threats) {
    const jd = hand.find(c => c.key === 'juedou');
    if (!jd) return null;
    // 找手牌少的敌人决斗
    const target = enemies.find(e => {
      if (e.skills.includes('kongcheng') && !e.hand.length) return false;
      const mySha = player.hand.filter(c => c.key === 'sha').length;
      return e.handCount <= mySha || e.hp <= 1;
    });
    if (target) return { action: 'playCard', cardIds: [jd.uid], targets: [target.seat] };
    return null;
  }

  // ==================== 杀决策 ====================
  _considerSha(game, player, hand, enemies, threats) {
    if (!game.canPlaySha(player)) return null;
    const targets = game.playableShaTargets(player);
    if (!targets.length) return null;

    const bestTarget = this._pickBestTarget(targets, player);
    if (!bestTarget) return null;

    // 优先用转化牌（保留真实杀）
    const realSha = hand.find(c => c.key === 'sha');
    const convertSha = this._findConvertSha(player, hand);

    if (realSha) return { action: 'playCard', cardIds: [realSha.uid], targets: [bestTarget.seat] };
    if (convertSha) return { action: 'playCard', cardIds: [convertSha.uid], as: 'sha', targets: [bestTarget.seat] };
    return null;
  }

  _findConvertSha(player, hand) {
    if (player.skills.includes('wusheng')) {
      const red = hand.find(c => cardColor(c) === 'red' && c.key !== 'shan');
      if (red) return red;
    }
    if (player.skills.includes('longdan')) {
      const shan = hand.find(c => c.key === 'shan');
      if (shan && player.hand.filter(c => c.key === 'shan').length > 1) return shan;
    }
    return null;
  }

  // ==================== 目标选择 ====================
  _pickBestTarget(candidates, player) {
    if (!candidates.length) return null;
    let best = null, bestScore = -999;
    for (const t of candidates) {
      const score = this._targetScore(t, player);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  _targetScore(target, player) {
    let score = 0;
    const vuln = this.threat.vulnerability(target.seat);
    const enemy = this.inference.isEnemy(target.seat, player.identity);
    const threat = this.threat.assess(target.seat, player.seat);

    score += vuln * 0.4;       // 脆弱性
    score += enemy * 30;       // 是敌人加分
    score += threat * 0.3;     // 威胁度

    // 击杀奖励
    if (target.hp <= 1) score += 20;
    // 距离惩罚
    const dist = this.game.distance(player, target);
    score -= dist * 2;

    return score;
  }

  // ==================== 响应阶段决策 ====================
  _decideRespond(game, player, prompt) {
    const need = prompt.need;
    const options = prompt.options || [];

    if (need === 'shan') {
      // 评估是否需要闪
      const attacker = this._getAttacker(prompt);
      const willDie = this._willDieWithoutDodge(player, prompt);
      if (willDie) {
        // 濒死必须闪
        const opt = options.find(o => o.cardIds && o.cardIds.length);
        if (opt) return { cardIds: opt.cardIds };
      }
      // 高威胁攻击者需要闪
      if (attacker && this.threat.assess(attacker, player.seat) >= 40) {
        const opt = options.find(o => o.cardIds && o.cardIds.length);
        if (opt) return { cardIds: opt.cardIds };
      }
      // 低威胁可不闪（保留闪）
      return { pass: true };
    }

    if (need === 'sha') {
      // 决斗/南蛮：有杀就出
      const opt = options.find(o => o.cardIds && o.cardIds.length);
      if (opt) return { cardIds: opt.cardIds };
      return { pass: true };
    }

    if (need === 'tao') {
      // 濒死自救
      if (prompt.dying === player.seat) {
        const opt = options.find(o => o.cardIds && o.cardIds.length);
        if (opt) return { cardIds: opt.cardIds };
      }
      // 救盟友
      const allies = this._getAllies(player);
      if (allies.some(a => prompt.dying === a.seat)) {
        const opt = options.find(o => o.cardIds && o.cardIds.length);
        if (opt) return { cardIds: opt.cardIds };
      }
      return { pass: true };
    }

    if (need === 'wuxie') {
      // 无懈：保护自己/盟友免受关键锦囊
      const title = prompt.title || '';
      const isFriendly = title.includes(player.name) || this._getAllies(player).some(a => title.includes(a.name));
      const isHostile = this._getEnemies(player).some(e => title.includes(e.name));
      if (isFriendly && (title.includes('乐不思蜀') || title.includes('闪电') || title.includes('决斗'))) {
        const opt = options.find(o => o.cardIds && o.cardIds.length);
        if (opt) return { cardIds: opt.cardIds };
      }
      return { pass: true };
    }

    return { pass: true };
  }

  // ==================== 确认决策 ====================
  _decideConfirm(game, player, prompt) {
    const t = prompt.title || '';
    const sk = prompt.skill;
    // 有益触发技默认同意
    const goodSkills = ['jianxiong', 'fankui', 'yiji', 'luoshen', 'guanxing', 'biyue', 'xiaoji', 'tiandu'];
    if (goodSkills.includes(sk)) return { yes: true };
    // 刚烈：来源是敌人时发动
    if (sk === 'ganglie') return { yes: true };
    // 裸衣：有杀时发动
    if (sk === 'luoyi') return { yes: player.hand.some(c => c.key === 'sha') };
    // 突袭：有敌人有手牌时
    if (sk === 'tuxi') return { yes: game.aliveOthers(player).some(p => p.hand.length > 0) };
    // 铁骑：有红色手牌时
    if (sk === 'tieji') return { yes: player.hand.length > 0 };
    // 雌雄：异性目标时
    if (sk === 'cixiong') return { yes: true };
    // 寒冰：目标有牌且不会致死时
    if (sk === 'hanbing') return { yes: true };
    // 贯石斧：手牌多时
    if (sk === 'guanshi') return { yes: player.hand.length >= 3 };
    // 青龙刀：有杀时
    if (sk === 'qinglong') return { yes: player.hand.some(c => c.key === 'sha') };
    // 麒麟弓：目标有马时
    if (sk === 'qilin') return { yes: true };
    // 流离：有牌时
    if (sk === 'liuli') return { yes: player.hand.length > 1 };
    // 濒死相关
    if (t.includes('濒死')) return { yes: true };
    return { yes: true };
  }

  // ==================== 选项决策 ====================
  _decideChooseOption(game, player, prompt) {
    const t = prompt.title || '';
    if (t.includes('刚烈')) return { option: player.hand.length >= 3 ? 'discard' : 'damage' };
    if (t.includes('雌雄双股剑')) return { option: player.hand.length >= 3 ? 'discard' : 'draw' };
    if (prompt.skill === 'fanjian' || t.includes('反间')) return { option: ['spade', 'heart', 'club', 'diamond'][Math.floor(Math.random() * 4)] };
    return { option: prompt.options && prompt.options[0] ? prompt.options[0].id : null };
  }

  // ==================== 玩家选择决策 ====================
  _decideChoosePlayers(game, player, prompt) {
    const cands = (prompt.candidates || []).map(s => game.players[s]).filter(Boolean);
    const t = prompt.title || '';
    // 遗计/仁德：给受伤盟友
    if (t.includes('遗计') || t.includes('仁德')) {
      const allies = this._getAllies(player);
      const ally = cands.find(c => allies.includes(c));
      if (ally) return { targetIds: [ally.seat] };
      return { targetIds: [cands[0].seat] };
    }
    // 突袭/流离：选敌人
    const enemies = this._getEnemies(player).filter(e => cands.includes(e));
    const max = prompt.max || 1;
    const picked = (enemies.length ? enemies : cands).slice(0, max);
    return { targetIds: picked.map(x => x.seat) };
  }

  // ==================== 手牌选择决策 ====================
  _decideChooseCards(game, player, prompt) {
    const t = prompt.title || '';
    const pool = (prompt.cards || []);
    const min = prompt.min || 0;
    const max = prompt.max || 1;

    if (min === 0 && max <= 1) {
      if (t.includes('鬼才')) return this._guicaiPick(game, player, prompt, pool);
      return { cardIds: [] };
    }
    if (t.includes('五谷丰登')) {
      const sorted = pool.slice().sort((a, b) => this._cardValue(b, player) - this._cardValue(a, player));
      return { cardIds: [sorted[0].uid] };
    }
    // 弃牌：丢低价值
    const myCards = pool.filter(c => player.hand.some(h => h.uid === c.uid));
    const sorted = myCards.sort((a, b) => this._cardValue(a, player) - this._cardValue(b, player));
    return { cardIds: sorted.slice(0, min).map(c => c.uid) };
  }

  _guicaiPick(game, player, prompt, pool) {
    const title = prompt.title || '';
    const owner = game.players.find(x => title.includes(x.name + ' 的判定牌'));
    const mine = owner === player || this._getAllies(player).includes(owner);
    if (!mine) return { cardIds: [] };
    const handCards = pool.filter(c => player.hand.some(h => h.uid === c.uid));
    const m = title.match(/【(.+?)】(.)/);
    const suitText = m ? m[2] : '';
    const need = (suitText && title.includes('乐不思蜀') && suitText !== '♥') ? 'heart' :
      (suitText && title.includes('闪电') && suitText === '♠') ? 'notspade' :
      (suitText && title.includes('八卦') && suitText !== '♥' && suitText !== '♦') ? 'red' : null;
    if (!need) return { cardIds: [] };
    let swap = null;
    if (need === 'heart') swap = handCards.find(c => c.suit === 'heart');
    if (need === 'notspade') swap = handCards.find(c => !(c.suit === 'spade' && c.rank >= 2 && c.rank <= 9));
    if (need === 'red') swap = handCards.find(c => cardColor(c) === 'red');
    return swap ? { cardIds: [swap.uid] } : { cardIds: [] };
  }

  // ==================== 选牌（目标）决策 ====================
  _decideChooseCardOf(game, player, prompt) {
    const equips = prompt.equips || [];
    if (equips.length) {
      const prio = ['armor', 'weapon', 'horse_minus', 'horse_plus'];
      equips.sort((a, b) => prio.indexOf(a.slot) - prio.indexOf(b.slot));
      return { zone: equips[0].slot, cardUid: equips[0].card.uid };
    }
    if (prompt.judge && prompt.judge.length) return { zone: 'judge', cardUid: prompt.judge[0].uid };
    if (prompt.handCount > 0) return { zone: 'hand' };
    return { zone: 'hand' };
  }

  // ==================== 观星排序 ====================
  _decideArrange(game, player, prompt) {
    const cards = (prompt.cards || []).slice();
    const hasLebu = player.judgeZone.some(c => c.key === 'lebu');
    const hasShandian = player.judgeZone.some(c => c.key === 'shandian');
    const top = [], rest = [];
    for (const c of cards) {
      if (hasLebu && top.length === 0 && c.suit === 'heart') { top.push(c); continue; }
      if (hasShandian && top.length === 0 && !(c.suit === 'spade' && c.rank >= 2 && c.rank <= 9)) { top.push(c); continue; }
      rest.push(c);
    }
    rest.sort((a, b) => this._cardValue(b, player) - this._cardValue(a, player));
    while (top.length < 2 && rest.length) top.push(rest.shift());
    return { top: top.map(c => c.uid), bottom: rest.map(c => c.uid) };
  }

  // ==================== 选将决策 ====================
  _decideChooseGeneral(game, player, prompt) {
    const cands = prompt.candidates || [];
    // 根据身份选将
    const tier = this._generalTier(player.identity);
    for (const id of tier) {
      const found = cands.find(c => c.id === id);
      if (found) return { generalId: found.id };
    }
    return { generalId: cands[0] ? cands[0].id : null };
  }

  _generalTier(identity) {
    const tiers = {
      zhu: ['sunquan', 'caocao', 'liubei', 'zhenji', 'simayi', 'guojia', 'zhangliao'],
      zhong: ['zhangliao', 'guojia', 'simayi', 'zhenji', 'zhaoyun', 'machao', 'ganning'],
      fan: ['lvbu', 'zhangliao', 'machao', 'ganning', 'huangyueying', 'zhouyu', 'guojia'],
      nei: ['zhenji', 'simayi', 'guojia', 'luxun', 'lvmeng', 'sunquan', 'huatuo'],
    };
    return tiers[identity] || tiers.fan;
  }

  // ==================== 辅助方法 ====================
  _getEnemies(player) {
    return this.game.aliveOthers(player).filter(p =>
      this.inference.isEnemy(p.seat, player.identity) > 0.4
    );
  }

  _getAllies(player) {
    return this.game.aliveOthers(player).filter(p =>
      this.inference.isAlly(p.seat, player.identity) > 0.5
    );
  }

  _rankThreats(player) {
    return this.game.aliveOthers(player)
      .map(p => ({ seat: p.seat, score: this.threat.assess(p.seat, player.seat) }))
      .sort((a, b) => b.score - a.score);
  }

  _cardValue(card, player) {
    return this.resource.keepValue(card, player);
  }

  _countJunkCards(player) {
    return player.hand.filter(c => this.resource.keepValue(c, player) <= 4).length;
  }

  _pickDiscardCards(player, count) {
    const sorted = player.hand.slice().sort((a, b) => this.resource.keepValue(a, player) - this.resource.keepValue(b, player));
    return sorted.slice(0, Math.min(count, sorted.length)).map(c => c.uid);
  }

  _cardCountOf(p) {
    return p.hand.length + Object.values(p.equips).filter(Boolean).length + p.judgeZone.length;
  }

  _shouldDrawCards(player) {
    return player.hand.length <= 4;
  }

  _getAttacker(prompt) {
    const title = prompt.title || '';
    const m = title.match(/(\S+)\s*对你使用/);
    if (!m) return null;
    const name = m[1];
    return this.game.players.find(p => p.name === name && p.alive);
  }

  _willDieWithoutDodge(player, prompt) {
    // 简化：如果当前血量 <= 1 且被攻击，不闪会死
    return player.hp <= 1;
  }

  _considerTaoyuan(game, player, hand, allies) {
    const taoyuan = hand.find(c => c.key === 'taoyuan');
    if (!taoyuan) return null;
    const woundedAllies = [player, ...allies].filter(a => a.hp < a.maxHp).length;
    const woundedEnemies = this._getEnemies(player).filter(a => a.hp < a.maxHp).length;
    if (woundedAllies > woundedEnemies) return { action: 'playCard', cardIds: [taoyuan.uid], targets: [] };
    return null;
  }

  _considerShandian(game, player, hand, enemies, allies) {
    const sd = hand.find(c => c.key === 'shandian');
    if (!sd || player.judgeZone.some(c => c.key === 'shandian')) return null;
    if (enemies.filter(e => e.alive).length > allies.filter(a => a.alive).length && player.hp >= 3) {
      return { action: 'playCard', cardIds: [sd.uid], targets: [] };
    }
    return null;
  }

  _fallback(game, player, prompt) {
    switch (prompt.kind) {
      case 'play': return { action: 'end' };
      case 'respond': return { pass: true };
      case 'confirm': return { yes: false };
      case 'chooseOption': return { option: prompt.options && prompt.options[0] ? prompt.options[0].id : null };
      case 'choosePlayers': return { targetIds: (prompt.candidates || []).slice(0, prompt.min || 0) };
      case 'chooseCards': return { cardIds: (prompt.cards || []).slice(0, prompt.min || 0).map(c => c.uid) };
      case 'chooseCardOf': return { zone: 'hand' };
      case 'arrange': return { top: (prompt.cards || []).map(c => c.uid), bottom: [] };
      case 'chooseGeneral': return { generalId: prompt.candidates && prompt.prompt.candidates[0] ? prompt.candidates[0].id : null };
      default: return null;
    }
  }
}

// 技能 ID 映射（用于查找技能定义）
const SKILL_IDS = {};

// ==================== 简单 AI（基础启发式） ====================
class SimpleAI {
  constructor(game) {
    this.game = game;
  }

  decide(game, player, prompt) {
    switch (prompt.kind) {
      case 'play': return this._play(game, player, prompt);
      case 'respond': return this._respond(game, player, prompt);
      case 'confirm': return { yes: Math.random() > 0.3 };
      case 'chooseOption': return { option: prompt.options?.[0]?.id };
      case 'choosePlayers': return { targetIds: (prompt.candidates || []).slice(0, prompt.min || 1) };
      case 'chooseCards': return this._chooseCards(game, player, prompt);
      case 'chooseCardOf': return { zone: 'hand' };
      case 'arrange': return { top: (prompt.cards || []).map(c => c.uid), bottom: [] };
      case 'chooseGeneral': return { generalId: prompt.candidates?.[0]?.id };
      default: return this._fallback(prompt);
    }
  }

  _play(game, player, prompt) {
    const hand = player.hand;
    // 1. 低血量吃桃
    if (player.hp <= 2 && player.hp < player.maxHp) {
      const tao = hand.find(c => c.key === 'tao');
      if (tao) return { action: 'playCard', cardIds: [tao.uid], targets: [] };
    }
    // 2. 装备
    for (const c of hand) {
      if (c.type === 'equip') return { action: 'playCard', cardIds: [c.uid], targets: [] };
    }
    // 3. 无中生有
    const wuzhong = hand.find(c => c.key === 'wuzhong');
    if (wuzhong) return { action: 'playCard', cardIds: [wuzhong.uid], targets: [] };
    // 4. 杀最近敌人
    if (game.canPlaySha(player)) {
      const targets = game.playableShaTargets(player);
      if (targets.length) {
        const t = targets[Math.floor(Math.random() * targets.length)];
        const sha = hand.find(c => c.key === 'sha');
        if (sha) return { action: 'playCard', cardIds: [sha.uid], targets: [t.seat] };
      }
    }
    return { action: 'end' };
  }

  _respond(game, player, prompt) {
    const options = prompt.options || [];
    if (prompt.need === 'shan') {
      const opt = options.find(o => o.cardIds?.length);
      if (opt && player.hp <= 2) return { cardIds: opt.cardIds };
      if (opt && Math.random() > 0.4) return { cardIds: opt.cardIds };
      return { pass: true };
    }
    if (prompt.need === 'sha') {
      const opt = options.find(o => o.cardIds?.length);
      if (opt) return { cardIds: opt.cardIds };
      return { pass: true };
    }
    if (prompt.need === 'tao') {
      if (prompt.dying === player.seat) {
        const opt = options.find(o => o.cardIds?.length);
        if (opt) return { cardIds: opt.cardIds };
      }
      return { pass: true };
    }
    if (prompt.need === 'wuxie') return { pass: true };
    return { pass: true };
  }

  _chooseCards(game, player, prompt) {
    const pool = prompt.cards || [];
    const min = prompt.min || 0;
    if (prompt.title?.includes('五谷')) {
      const sorted = pool.slice().sort((a, b) => {
        const v = { tao: 9, sha: 7, shan: 6, wuxie: 8, wuzhong: 7 };
        return (v[b.key] || 3) - (v[a.key] || 3);
      });
      return { cardIds: [sorted[0]?.uid] };
    }
    return { cardIds: pool.slice(0, min).map(c => c.uid) };
  }

  _fallback(prompt) {
    switch (prompt.kind) {
      case 'play': return { action: 'end' };
      case 'respond': return { pass: true };
      case 'confirm': return { yes: false };
      case 'chooseOption': return { option: prompt.options?.[0]?.id };
      case 'choosePlayers': return { targetIds: (prompt.candidates || []).slice(0, prompt.min || 0) };
      case 'chooseCards': return { cardIds: (prompt.cards || []).slice(0, prompt.min || 0).map(c => c.uid) };
      case 'chooseCardOf': return { zone: 'hand' };
      case 'arrange': return { top: (prompt.cards || []).map(c => c.uid), bottom: [] };
      case 'chooseGeneral': return { generalId: prompt.candidates?.[0]?.id };
      default: return null;
    }
  }
}

// ==================== 困难 AI（强化推理 + 身份隐藏） ====================
class HardAI extends AIBrain {
  constructor(game) {
    super(game);
    this.bluffChance = 0.15; // 身份伪装概率
  }

  // 困难 AI 的出牌决策：更精细的目标选择和资源管理
  _decidePlay(game, player, prompt) {
    // 内奸特殊策略：前期伪装，后期收割
    if (player.identity === 'nei') {
      return this._neiStrategy(game, player, prompt);
    }
    // 反贼：优先集火主公
    if (player.identity === 'fan') {
      return this._fanStrategy(game, player, prompt);
    }
    // 忠臣：保护主公
    if (player.identity === 'zhong') {
      return this._zhongStrategy(game, player, prompt);
    }
    // 主公：谨慎出牌
    if (player.identity === 'zhu') {
      return this._zhuStrategy(game, player, prompt);
    }
    return super._decidePlay(game, player, prompt);
  }

  // 内奸策略：前期混战，后期收割
  _neiStrategy(game, player, prompt) {
    const alive = game.alivePlayers();
    const fans = alive.filter(p => p.identity === 'fan');
    const zhongs = alive.filter(p => p.identity === 'zhong');
    const lord = alive.find(p => p.identity === 'zhu');
    // 前期：帮主忠打反贼
    if (fans.length > 0) {
      return this._attackWeakestEnemy(game, player, fans);
    }
    // 中期：消耗忠臣
    if (zhongs.length > 0 && lord && lord.hp > 1) {
      return this._attackWeakestEnemy(game, player, zhongs);
    }
    // 后期：准备击杀主公
    if (lord && alive.length <= 3) {
      // 确保自己状态好
      if (player.hp < player.maxHp) {
        const tao = player.hand.find(c => c.key === 'tao');
        if (tao) return { action: 'playCard', cardIds: [tao.uid], targets: [] };
      }
      // 攻击主公
      if (game.canPlaySha(player) && game.canTargetSha(player, lord)) {
        const sha = player.hand.find(c => c.key === 'sha');
        if (sha) return { action: 'playCard', cardIds: [sha.uid], targets: [lord.seat] };
      }
    }
    return super._decidePlay(game, player, prompt);
  }

  // 反贼策略：集火主公
  _fanStrategy(game, player, prompt) {
    const lord = game.players.find(p => p.identity === 'zhu' && p.alive);
    if (lord && game.canPlaySha(player) && game.canTargetSha(player, lord)) {
      const sha = player.hand.find(c => c.key === 'sha');
      if (sha) return { action: 'playCard', cardIds: [sha.uid], targets: [lord.seat] };
    }
    // 乐不思蜀给主公
    const lebu = player.hand.find(c => c.key === 'lebu');
    if (lebu && lord && !lord.judgeZone.some(j => j.key === 'lebu')) {
      return { action: 'playCard', cardIds: [lebu.uid], targets: [lord.seat] };
    }
    return super._decidePlay(game, player, prompt);
  }

  // 忠臣策略：保护主公
  _zhongStrategy(game, player, prompt) {
    const lord = game.players.find(p => p.identity === 'zhu' && p.alive);
    // 主公低血量时优先回复
    if (lord && lord.hp <= 2) {
      const tao = player.hand.find(c => c.key === 'tao');
      if (tao && lord.hp < lord.maxHp) {
        // 忠臣不能直接给主公用桃（需在濒死时），但可以用青囊等技能
      }
    }
    // 攻击威胁最大的反贼
    const enemies = game.aliveOthers(player).filter(p => {
      const probs = this.inference.isEnemy(p.seat, player.identity);
      return probs > 0.5;
    });
    if (enemies.length && game.canPlaySha(player)) {
      const target = this._pickBestTarget(enemies, player);
      if (target) {
        const sha = player.hand.find(c => c.key === 'sha');
        if (sha && game.canTargetSha(player, target)) {
          return { action: 'playCard', cardIds: [sha.uid], targets: [target.seat] };
        }
      }
    }
    return super._decidePlay(game, player, prompt);
  }

  // 主公策略：谨慎出牌
  _zhuStrategy(game, player, prompt) {
    // 低血量优先自保
    if (player.hp <= 2) {
      const tao = player.hand.find(c => c.key === 'tao');
      if (tao && player.hp < player.maxHp) {
        return { action: 'playCard', cardIds: [tao.uid], targets: [] };
      }
    }
    // 攻击威胁最高的角色
    const enemies = game.aliveOthers(player).filter(p => {
      const probs = this.inference.isEnemy(p.seat, 'zhu');
      return probs > 0.4;
    });
    if (enemies.length && game.canPlaySha(player)) {
      const target = this._pickBestTarget(enemies, player);
      if (target && game.canTargetSha(player, target)) {
        const sha = player.hand.find(c => c.key === 'sha');
        if (sha) return { action: 'playCard', cardIds: [sha.uid], targets: [target.seat] };
      }
    }
    return super._decidePlay(game, player, prompt);
  }

  // 攻击最弱的敌人
  _attackWeakestEnemy(game, player, enemies) {
    if (!enemies.length) return super._decidePlay(game, player, {});
    const sorted = enemies.slice().sort((a, b) => a.hp - b.hp);
    for (const target of sorted) {
      if (game.canPlaySha(player) && game.canTargetSha(player, target)) {
        const sha = player.hand.find(c => c.key === 'sha');
        if (sha) return { action: 'playCard', cardIds: [sha.uid], targets: [target.seat] };
      }
    }
    return super._decidePlay(game, player, {});
  }

  // 困难 AI 响应：更精确的闪/杀判断
  _decideRespond(game, player, prompt) {
    if (prompt.need === 'shan') {
      const options = prompt.options || [];
      const attacker = this._getAttacker(prompt);
      // 濒死必闪
      if (player.hp <= 1) {
        const opt = options.find(o => o.cardIds?.length);
        if (opt) return { cardIds: opt.cardIds };
      }
      // 评估攻击者威胁
      if (attacker) {
        const threat = this.threat.assess(attacker.seat, player.seat);
        const willDie = player.hp <= 1;
        if (willDie || threat >= 40) {
          const opt = options.find(o => o.cardIds?.length);
          if (opt) return { cardIds: opt.cardIds };
        }
        // 困难 AI：手牌充裕时更倾向闪
        if (player.hand.length >= 4) {
          const opt = options.find(o => o.cardIds?.length);
          if (opt && Math.random() > 0.3) return { cardIds: opt.cardIds };
        }
      }
      return { pass: true };
    }
    // 困难 AI：更智能的无懈可击使用
    if (prompt.need === 'wuxie') {
      const title = prompt.title || '';
      const allies = this._getAllies(player);
      const isFriendly = title.includes(player.name) || allies.some(a => title.includes(a.name));
      if (isFriendly) {
        const opt = (prompt.options || []).find(o => o.cardIds?.length);
        if (opt) return { cardIds: opt.cardIds };
      }
      return { pass: true };
    }
    return super._decideRespond(game, player, prompt);
  }

  // 困难 AI 选将：更注重武将强度和身份适配
  _decideChooseGeneral(game, player, prompt) {
    const cands = prompt.candidates || [];
    const identity = player.identity;
    // 困难 AI 按身份选将
    const tiers = {
      zhu: ['sunquan', 'caocao', 'liubei', 'zhenji', 'simayi', 'guojia', 'zhangliao'],
      zhong: ['zhangliao', 'guojia', 'simayi', 'zhenji', 'zhaoyun', 'machao', 'ganning'],
      fan: ['lvbu', 'zhangliao', 'machao', 'ganning', 'huangyueying', 'zhouyu', 'guojia'],
      nei: ['zhenji', 'simayi', 'guojia', 'luxun', 'lvmeng', 'sunquan', 'huatuo'],
    };
    const tier = tiers[identity] || tiers.fan;
    for (const id of tier) {
      const found = cands.find(c => c.id === id);
      if (found) return { generalId: found.id };
    }
    return { generalId: cands[0]?.id };
  }
}

// ==================== 难度管理器 ====================
const AI_DIFFICULTIES = {
  easy: { name: '简单', desc: '基础启发式，适合新手', cls: SimpleAI, delayMultiplier: 1.5 },
  normal: { name: '普通', desc: '智能推理，身份判断', cls: AIBrain, delayMultiplier: 1.0 },
  hard: { name: '困难', desc: '强化策略，身份伪装', cls: HardAI, delayMultiplier: 0.8 },
};

function createAI(game, difficulty = 'normal') {
  const def = AI_DIFFICULTIES[difficulty] || AI_DIFFICULTIES.normal;
  if (!game.__brain || game.__brain.constructor !== def.cls) {
    game.__brain = new def.cls(game);
  }
  return game.__brain;
}

// ==================== 兼容旧接口 ====================
function decide(game, player, prompt) {
  const difficulty = game.opts?.aiDifficulty || 'normal';
  const brain = createAI(game, difficulty);
  return brain.decide(game, player, prompt);
}

function fallback(game, player, prompt) {
  const difficulty = game.opts?.aiDifficulty || 'normal';
  const brain = createAI(game, difficulty);
  if (brain._fallback) return brain._fallback(game, player, prompt);
  return null;
}

module.exports = { decide, fallback, AIBrain, SimpleAI, HardAI, AI_DIFFICULTIES, createAI, BehaviorTracker, IdentityInference, ThreatAssessor, ResourceManager };
