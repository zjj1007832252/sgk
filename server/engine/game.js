// 三国杀标准版 身份局引擎
const { buildDeck, cardColor, rankLabel, publicCard, SUITS } = require('./cards');
const { GENERALS } = require('./generals');
const { SKILLS } = require('./skills');
const AI = require('./ai');
const { CustomSkillExecutor } = require('./custom-skill-executor');

const IDENTITIES = { zhu: '主公', zhong: '忠臣', fan: '反贼', nei: '内奸' };
const IDENTITY_DIST = {
  4: ['zhu', 'zhong', 'fan', 'fan'],
  5: ['zhu', 'zhong', 'fan', 'fan', 'nei'],
  6: ['zhu', 'zhong', 'fan', 'fan', 'fan', 'nei'],
  7: ['zhu', 'zhong', 'zhong', 'fan', 'fan', 'fan', 'nei'],
  8: ['zhu', 'zhong', 'zhong', 'fan', 'fan', 'fan', 'fan', 'nei'],
};

class Player {
  constructor(info, seat) {
    this.pid = info.pid; // 连接 id（AI 为 'ai_x'）
    this.name = info.name;
    this.isAI = !!info.isAI;
    this.offline = false;
    this.seat = seat;
    this.identity = null;
    this.identityPref = info.identityPref || null;
    this.generalId = info.generalId || null;
    this.generalName = '';
    this.title = '';
    this.kingdom = 'qun';
    this.gender = 'm';
    this.maxHp = 4;
    this.hp = 4;
    this.skills = [];
    this.custom = !!info.custom;
    this.hand = [];
    this.equips = { weapon: null, armor: null, horse_plus: null, horse_minus: null };
    this.judgeZone = [];
    this.alive = true;
    this.turnFlags = {};
    this.dead = null; // 死亡信息
  }
}

class Game {
  /**
   * playerInfos: [{pid,name,isAI,identityPref,generalId?}]
   * opts: { pickMode:'random'|'free', pickCount, generalIds (卡池), aiDelay, identityPrefs }
   * hooks: { sendTo(pid,msg), broadcastAll(msgFn), delay(ms)->Promise, onEnd(result) }
   */
  constructor(playerInfos, opts, hooks) {
    this.opts = opts;
    this.hooks = hooks;
    this.players = playerInfos.map((info, i) => new Player(info, i));
    this.deck = buildDeck(this.opts.bannedCards || [], this.opts.customCards || []);
    this.discardPile = [];
    this.logs = [];
    this.pending = null; // {seat, prompt, resolve}
    this.phase = 'picking';
    this.turnSeat = 0;
    this.round = 1;
    this.winner = null;
    this.finished = false;
    this.resolving = []; // 结算中的牌 [{key, cards, user}]
    this.claimed = new Set();
    this.replayEvents = []; // 回放事件记录
    this.startTime = Date.now();
    this.hostility = {}; // attackerPid -> victimPid -> dmg
    this.aiDelay = opts.aiDelay != null ? opts.aiDelay : 800;
    this.aiDifficulty = opts.aiDifficulty || 'normal';
    // 游戏速度：影响动画延迟和AI思考时间
    const speedMult = { fast: 0.4, normal: 1.0, slow: 1.8 }[opts.gameSpeed] || 1.0;
    this.aiDelay = Math.round(this.aiDelay * speedMult);
    this.stepDelay = Math.round((opts.stepDelay != null ? opts.stepDelay : 300) * speedMult);
    this.turnTimer = opts.turnTimer || 0; // 出牌倒计时（秒）
    this.publicCard = publicCard;
    this.cardColor = cardColor;
    this.rankLabel = rankLabel;
    this.suitLabel = s => SUITS[s];
    this.customExecutor = new CustomSkillExecutor(this);
    this.customSkills = Array.isArray(opts.customSkills) ? opts.customSkills : [];
    this.customCards = Array.isArray(opts.customCards) ? opts.customCards : [];
    // 游戏模式
    const { createGameMode } = require('./game-modes');
    this.gameMode = createGameMode(this, opts.gameMode || 'identity');
  }

  // ============ 基础设施 ============
  delay(ms) { return this.hooks.delay(ms); }
  log(msg) {
    this.logs.push(msg);
    if (this.logs.length > 300) this.logs.shift();
  }
  sync() {
    if (this.hooks.broadcastAll) this.hooks.broadcastAll();
  }
  broadcastEvent(ev) {
    // 记录回放事件
    this.replayEvents.push({ ...ev, round: this.round, phase: this.phase, t: Date.now() - this.startTime });
    if (this.hooks.broadcastEvent) this.hooks.broadcastEvent(ev);
  }
  sendTo(player, msg) {
    if (!player.isAI && !player.offline && this.hooks.sendTo) this.hooks.sendTo(player.pid, msg);
  }

  byPid(pid) { return this.players.find(p => p.pid === pid); }
  bySeat(seat) { return this.players[seat]; }
  alivePlayers() { return this.players.filter(p => p.alive); }
  aliveOthers(player) { return this.players.filter(p => p.alive && p !== player); }
  hasSkill(player, id) { return player.skills.includes(id); }
  nextAlive(from) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const p = this.players[(from.seat + i) % n];
      if (p.alive) return p;
    }
    return null;
  }

  // ============ 询问系统 ============
  ask(player, prompt) {
    if (!player.alive && prompt.kind !== 'respond') return Promise.resolve(null);
    if (player.isAI || player.offline) {
      // 根据难度调整思考时间
      const diffMult = { easy: 1.5, normal: 1.0, hard: 0.7 }[this.aiDifficulty] || 1.0;
      return Promise.resolve()
        .then(() => this.delay(Math.round(this.aiDelay * diffMult)))
        .then(() => {
          try {
            const { createAI } = require('./ai');
            const brain = createAI(this, this.aiDifficulty);
            return brain.decide(this, player, prompt);
          } catch (e) { console.error('AI error', e); return null; }
        })
        .then(ans => {
          if (ans == null) {
            const { createAI } = require('./ai');
            const brain = createAI(this, this.aiDifficulty);
            return brain._fallback ? brain._fallback(this, player, prompt) : null;
          }
          return ans;
        });
    }
    return new Promise(resolve => {
      this.pending = { seat: player.seat, prompt, resolve };
      this.sendTo(player, { type: 'prompt', prompt, turnTimer: this.turnTimer });
      this.sync();
      // 出牌倒计时
      if (this.turnTimer > 0) {
        let remaining = this.turnTimer;
        // 发送倒计时更新
        const tickTimer = setInterval(() => {
          remaining--;
          if (remaining <= 10 && remaining > 0) {
            this.sendTo(player, { type: 'timer', remaining });
          }
          if (remaining <= 0) {
            clearInterval(tickTimer);
            if (this.pending && this.pending.seat === player.seat) {
              // 超时自动操作
              const auto = this._autoAnswer(prompt);
              this.pending = null;
              this.log(`${player.name} 超时，自动操作`);
              resolve(auto);
            }
          }
        }, 1000);
        // 存储定时器以便手动操作时清除
        this.pending.timer = tickTimer;
      }
    });
  }

  // 超时自动回答
  _autoAnswer(prompt) {
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

  async confirm(player, skill, title) {
    const ans = await this.ask(player, { kind: 'confirm', skill, title });
    return !!(ans && ans.yes);
  }
  async chooseOption(player, skill, title, options) {
    const ans = await this.ask(player, { kind: 'chooseOption', skill, title, options });
    return ans && ans.option != null ? ans.option : (options[0] && options[0].id);
  }
  /** candidates: Player[] -> 返回 Player[] */
  async choosePlayers(player, title, candidates, min, max) {
    if (!candidates.length) return [];
    const ans = await this.ask(player, {
      kind: 'choosePlayers', title, min, max,
      candidates: candidates.map(c => c.seat),
    });
    if (!ans || !Array.isArray(ans.targetIds)) return min > 0 ? [candidates[0]] : [];
    const picked = ans.targetIds.map(s => this.players[s]).filter(p => p && candidates.includes(p));
    if (picked.length < min) return min > 0 ? [candidates[0]] : [];
    return picked.slice(0, max);
  }
  /** 从自己的手牌中选 filter(card)->bool */
  async chooseOwnCards(player, title, min, max, filter) {
    const pool = player.hand.filter(filter || (() => true));
    if (pool.length < min) { // 不够就选全部可用的
      if (pool.length === 0 && min > 0) return [];
    }
    const ans = await this.ask(player, {
      kind: 'chooseCards', title, min, max,
      cards: pool.map(publicCard),
    });
    if (!ans || !Array.isArray(ans.cardIds)) return min > 0 ? pool.slice(0, min) : [];
    const picked = ans.cardIds.map(uid => pool.find(c => c.uid === uid)).filter(Boolean);
    if (picked.length < min) return pool.slice(0, min);
    return picked.slice(0, max);
  }
  /** 选目标角色的一张牌（手牌=随机，装备/判定=指定） */
  async chooseCardOf(player, target, title) {
    const zones = [];
    if (target.hand.length) zones.push('hand');
    for (const slot of ['weapon', 'armor', 'horse_plus', 'horse_minus']) {
      if (target.equips[slot]) zones.push(slot);
    }
    if (target.judgeZone.length) zones.push('judge');
    if (!zones.length) return null;
    const ans = await this.ask(player, {
      kind: 'chooseCardOf', title, target: target.seat,
      handCount: target.hand.length,
      equips: Object.entries(target.equips).filter(([, c]) => c).map(([slot, c]) => ({ slot, card: publicCard(c) })),
      judge: target.judgeZone.map(publicCard),
    });
    let card = null;
    if (!ans || ans.zone === 'hand') {
      card = this.randomHand(target);
      if (card) this.loseCards(target, [card]);
    } else if (ans.zone === 'judge') {
      card = target.judgeZone.find(c => c.uid === ans.cardUid) || target.judgeZone[0];
      target.judgeZone = target.judgeZone.filter(c => c !== card);
    } else {
      card = target.equips[ans.zone];
      if (card) await this.removeEquip(target, ans.zone);
    }
    return card;
  }

  /** 人类/离线统一入口：由服务器调用 */
  handleAction(pid, action) {
    const p = this.byPid(pid);
    if (!p || !this.pending || this.pending.seat !== p.seat) return false;
    const { resolve, timer } = this.pending;
    if (timer) clearInterval(timer);
    this.pending = null;
    resolve(action);
    return true;
  }

  /** 断线 -> AI 托管；若正在等其输入则立即由 AI 代答 */
  playerOffline(pid) {
    const p = this.byPid(pid);
    if (!p) return;
    p.offline = true;
    if (this.pending && this.pending.seat === p.seat) {
      const { prompt, resolve, timer } = this.pending;
      if (timer) clearInterval(timer);
      this.pending = null;
      Promise.resolve()
        .then(() => AI.decide(this, p, prompt))
        .then(ans => resolve(ans == null ? AI.fallback(this, p, prompt) : ans));
    }
    this.sync();
  }
  playerOnline(pid) {
    const p = this.byPid(pid);
    if (p) { p.offline = false; this.sync(); }
  }

  // ============ 牌堆操作 ============
  async drawCards(player, n) {
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (!this.deck.length) this.reshuffle();
      if (!this.deck.length) break;
      const c = this.deck.shift();
      player.hand.push(c);
      drawn.push(c);
    }
    if (drawn.length) {
      this.log(`${player.name} 摸了 ${drawn.length} 张牌`);
      this.broadcastEvent({ type: 'draw', seat: player.seat, count: drawn.length });
      this.broadcastEvent({ type: 'fxstep' });
      this.sync();
    }
    return drawn;
  }
  reshuffle() {
    if (!this.discardPile.length) return;
    this.deck = this.discardPile;
    this.discardPile = [];
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
    this.log('牌堆已重洗');
  }
  gain(player, cards) {
    cards = cards.filter(Boolean);
    if (!cards.length) return;
    player.hand.push(...cards);
    this.sync();
  }
  loseCards(player, cards) {
    cards = cards.filter(Boolean);
    player.hand = player.hand.filter(c => !cards.includes(c));
    this.sync();
  }
  toDiscard(cards) {
    for (const c of cards.filter(Boolean)) {
      if (!this.claimed.has(c.uid)) this.discardPile.push(c);
    }
  }
  /** 弃置玩家指定牌（从手牌） */
  async discard(player, cards) {
    this.loseCards(player, cards);
    this.toDiscard(cards);
    this.log(`${player.name} 弃置了 ${cards.length} 张牌`);
    await this.passiveSweep();
  }
  randomHand(player) {
    if (!player.hand.length) return null;
    return player.hand[Math.floor(Math.random() * player.hand.length)];
  }
  cardCountOf(p) {
    return p.hand.length + Object.values(p.equips).filter(Boolean).length + p.judgeZone.length;
  }
  claimCards(cards) {
    for (const c of cards) {
      this.claimed.add(c.uid);
      this.discardPile = this.discardPile.filter(x => x.uid !== c.uid);
      for (const r of this.resolving) r.cards = r.cards.filter(x => x.uid !== c.uid);
    }
  }
  isInPlayOrDiscard(card) {
    if (this.claimed.has(card.uid)) return false;
    if (this.discardPile.some(c => c.uid === card.uid)) return true;
    return this.resolving.some(r => r.cards.some(c => c.uid === card.uid));
  }

  async removeEquip(player, slot) {
    const eq = player.equips[slot];
    if (!eq) return;
    player.equips[slot] = null;
    this.log(`${player.name} 失去了装备【${eq.name}】`);
    if (this.hasSkill(player, 'xiaoji') && player.alive) {
      await SKILLS.xiaoji.onLoseEquip(this, player, eq);
    }
    this.sync();
  }

  /** 失去最后手牌 -> 连营 */
  async passiveSweep() {
    for (const p of this.alivePlayers()) {
      if (!p.hand.length && this.hasSkill(p, 'lianying')) {
        this.log(`${p.name} 发动【连营】`);
        await this.drawCards(p, 1);
      }
    }
  }

  // ============ 距离 / 范围 ============
  distance(from, to) {
    const alive = this.alivePlayers();
    const i = alive.indexOf(from), j = alive.indexOf(to);
    if (i < 0 || j < 0) return 99;
    const n = alive.length;
    let d = Math.min((i - j + n) % n, (j - i + n) % n);
    if (to.equips.horse_plus) d += 1;
    if (from.equips.horse_minus) d -= 1;
    if (this.hasSkill(from, 'mashu')) d -= 1;
    return Math.max(1, d);
  }
  attackRange(p) { return p.equips.weapon ? p.equips.weapon.range : 1; }
  shaLimit(p) {
    if (this.hasSkill(p, 'paoxiao')) return 99;
    if (p.equips.weapon && p.equips.weapon.key === 'zhuge') return 99;
    return 1;
  }
  canTargetSha(user, target, opts = {}) {
    if (!target || !target.alive) return false;
    if (opts.noDistance) return true;
    return this.distance(user, target) <= this.attackRange(user);
  }

  // ============ 判定 ============
  /** opts.keep: 调用方自行处理判定牌（如洛神）；否则非天妒情况下自动弃置 */
  async judge(player, reason, opts = {}) {
    if (!this.deck.length) this.reshuffle();
    let card = this.deck.shift();
    this.log(`${player.name} 的判定牌：【${card.name}】${this.suitLabel(card.suit)}${this.rankLabel(card.rank)}`);
    this.broadcastEvent({ type: 'judge', seat: player.seat, card: { suit: card.suit, rank: card.rank, name: card.name, rankLabel: this.rankLabel(card.rank) } });
    this.sync();
    await this.delay(this.stepDelay);
    // 鬼才改判
    for (const p of this.alivePlayers()) {
      if (!this.hasSkill(p, 'guicai') || !p.hand.length) continue;
      const picked = await this.chooseOwnCards(p, `鬼才：可用一张手牌替换 ${player.name} 的判定牌【${card.name}】${this.suitLabel(card.suit)}${this.rankLabel(card.rank)}（不选则跳过）`, 0, 1, () => true);
      if (picked && picked.length) {
        this.loseCards(p, picked);
        p.hand.push(card); // 原判定牌归鬼才使用者
        this.log(`${p.name} 发动【鬼才】，以【${picked[0].name}】替换判定牌`);
        card = picked[0];
      }
    }
    // 天妒
    if (this.hasSkill(player, 'tiandu') && !opts.keep) {
      this.gain(player, [card]);
      this.log(`${player.name} 发动【天妒】，获得判定牌`);
      return card;
    }
    if (!opts.keep) this.toDiscard([card]);
    return card;
  }

  // ============ 伤害 / 回复 / 死亡 ============
  recordHostility(src, target, n) {
    if (!src || src === target) return;
    (this.hostility[src.pid] = this.hostility[src.pid] || {});
    this.hostility[src.pid][target.pid] = (this.hostility[src.pid][target.pid] || 0) + n;
  }

  async damage(source, target, n, ctx = {}) {
    if (!target.alive) return;
    // 裸衣加成
    if (source && source.turnFlags && source.turnFlags.luoyi && (ctx.key === 'sha' || ctx.key === 'juedou')) {
      n += 1;
      this.log(`【裸衣】伤害+1`);
    }
    target.hp -= n;
    this.log(`${target.name} 受到 ${source ? source.name + ' 造成的 ' : ''}${n} 点伤害${target.hp <= 0 ? '，进入濒死！' : ''}`);
    this.recordHostility(source, target, n);
    // AI 行为追踪
    if (this.__brain && this.__brain.tracker) this.__brain.tracker.recordDamage(source ? source.seat : null, target.seat, n);
    // 自定义技能：受到伤害后
    await this.customExecutor.checkAndExecute(target, 'damage:after', { source, damage: n });
    // 自定义技能：造成伤害后
    if (source) await this.customExecutor.checkAndExecute(source, 'damage:deal', { target, damage: n });
    this.broadcastEvent({ type: 'damage', seat: target.seat, amount: n });
    this.sync();
    await this.delay(this.stepDelay);
    // 受伤触发技
    for (const sk of target.skills) {
      const def = SKILLS[sk];
      if (def && def.onDamaged && target.alive) {
        await def.onDamaged(this, target, { source, damage: n, cards: ctx.cards || (this.resolving.length ? this.resolving[this.resolving.length - 1].cards.slice() : []), key: ctx.key });
      }
    }
    if (target.hp <= 0) await this.dying(target, source);
    await this.passiveSweep();
  }

  async loseHp(player, n) {
    player.hp -= n;
    this.log(`${player.name} 失去了 ${n} 点体力`);
    this.broadcastEvent({ type: 'damage', seat: player.seat, amount: n });
    await this.customExecutor.checkAndExecute(player, 'loseHp', { damage: n });
    this.sync();
    if (player.hp <= 0) await this.dying(player, null);
  }

  async recover(player, n, source, opts = {}) {
    if (!player.alive || player.hp >= player.maxHp) return;
    // 救援：吴势力角色对主公孙权用桃 +1
    if (opts.byTao && source && source !== player && this.hasSkill(player, 'jiuyuan') &&
        player.identity === 'zhu' && source.kingdom === 'wu') {
      n += 1;
      this.log(`【救援】生效，回复+1`);
    }
    player.hp = Math.min(player.maxHp, player.hp + n);
    this.log(`${player.name} 回复了 ${n} 点体力（${player.hp}/${player.maxHp}）`);
    this.broadcastEvent({ type: 'recover', seat: player.seat });
    await this.customExecutor.checkAndExecute(player, 'recover', { source, heal: n });
    this.sync();
  }

  async dying(target, source) {
    this.log(`${target.name} 濒死，请求【桃】！`);
    this.broadcastEvent({ type: 'dying', seat: target.seat });
    let p = target;
    const order = [];
    const alive = this.alivePlayers();
    let idx = alive.indexOf(target);
    for (let i = 0; i < alive.length; i++) order.push(alive[(idx + i) % alive.length]);
    for (const saver of order) {
      if (target.hp > 0) break;
      while (target.hp <= 0) {
        const card = await this.askRespondCard(saver, 'tao', {
          title: `${target.name} 濒死（体力 ${target.hp}），是否使用【桃】？`,
          allowJijiu: true, dying: target.seat,
        });
        if (!card) break;
        this.loseCards(saver, card.cards);
        this.toDiscard(card.cards);
        this.log(`${saver.name} 对 ${target.name} 使用【桃】`);
        await this.recover(target, 1, saver, { byTao: true });
        if (this.__brain && this.__brain.tracker) this.__brain.tracker.recordHeal(saver.seat, target.seat);
      }
    }
    if (target.hp <= 0) await this.death(target, source);
  }

  async death(target, killer) {
    // 自定义技能：死亡时（濒死角色）
    await this.customExecutor.checkAndExecute(target, 'die', { killer });
    target.alive = false;
    target.dead = { identity: target.identity };
    this.log(`💀 ${target.name} 死亡，身份是【${IDENTITIES[target.identity]}】`);
    this.broadcastEvent({ type: 'death', seat: target.seat, identity: target.identity, generalId: target.generalId });
    // 自定义技能：杀死角色后
    if (killer && killer.alive) await this.customExecutor.checkAndExecute(killer, 'kill', { target });
    // 自定义技能：任意角色死亡
    for (const p of this.alivePlayers()) {
      await this.customExecutor.checkAndExecute(p, 'die:any', { dead: target });
    }
    // 弃置所有牌
    const all = [...target.hand, ...Object.values(target.equips).filter(Boolean), ...target.judgeZone];
    target.hand = [];
    target.equips = { weapon: null, armor: null, horse_plus: null, horse_minus: null };
    target.judgeZone = [];
    this.toDiscard(all);
    // 奖惩
    if (killer && killer.alive) {
      if (target.identity === 'fan') {
        this.log(`${killer.name} 杀死反贼，摸三张牌`);
        await this.drawCards(killer, 3);
        if (this.__brain && this.__brain.tracker) this.__brain.tracker.recordKill(killer.seat);
        killer.totalKills = (killer.totalKills || 0) + 1;
        killer.lastKill = target.seat;
      }
      if (killer.identity === 'zhu' && target.identity === 'zhong') {
        this.log(`主公杀死忠臣，弃置所有牌`);
        const kAll = [...killer.hand, ...Object.values(killer.equips).filter(Boolean), ...killer.judgeZone];
        killer.hand = [];
        killer.judgeZone = [];
        for (const slot of Object.keys(killer.equips)) if (killer.equips[slot]) await this.removeEquip(killer, slot);
        this.toDiscard(kAll);
      }
    }
    this.sync();
    await this.checkWin();
  }

  async checkWin() {
    const alive = this.alivePlayers();
    // 先检查自定义胜利条件
    if (this.opts.winCondition && this.opts.winCondition !== 'default') {
      const { WinConditionEvaluator } = require('./game-modes');
      const evaluator = new WinConditionEvaluator(this, this.opts.winCondition, this.opts.winParams || {});
      const customWinner = evaluator.evaluate(alive);
      if (customWinner != null) {
        this.winner = customWinner;
        this.finished = true;
        this.log(`🏆 游戏结束：自定义胜利条件达成！`);
        this.sync();
        if (this.hooks.onEnd) this.hooks.onEnd(this.winner);
        return;
      }
    }
    // 使用游戏模式的默认胜利条件
    const winner = this.gameMode.checkWin(alive);
    if (winner) {
      this.winner = winner;
      this.finished = true;
      const names = { zhu: '主公/忠臣 阵营', fan: '反贼 阵营', nei: '内奸', cold: '冷色阵营', warm: '暖色阵营', landlord: '地主', farmer: '农民' };
      this.log(`🏆 游戏结束：${names[winner] || winner}获胜！`);
      this.sync();
      if (this.hooks.onEnd) this.hooks.onEnd(this.winner);
    }
  }

  // ============ 响应系统 ============
  /** 可用作某需求的牌（含转化），返回 [{cards:[...], label}] */
  responseOptions(player, need, ctx = {}) {
    const opts = [];
    const h = player.hand;
    const red = c => cardColor(c) === 'red';
    const black = c => cardColor(c) === 'black';
    if (need === 'shan') {
      for (const c of h.filter(c => c.key === 'shan')) opts.push({ cards: [c], label: '闪' });
      if (this.hasSkill(player, 'longdan')) for (const c of h.filter(c => c.key === 'sha')) opts.push({ cards: [c], label: '龙胆·杀当闪' });
      if (this.hasSkill(player, 'qingguo')) for (const c of h.filter(black)) opts.push({ cards: [c], label: '倾国·黑牌当闪' });
    } else if (need === 'sha') {
      for (const c of h.filter(c => c.key === 'sha')) opts.push({ cards: [c], label: '杀' });
      if (this.hasSkill(player, 'wusheng')) for (const c of h.filter(red)) opts.push({ cards: [c], label: '武圣·红牌当杀' });
      if (this.hasSkill(player, 'longdan')) for (const c of h.filter(c => c.key === 'shan')) opts.push({ cards: [c], label: '龙胆·闪当杀' });
      if (player.equips.weapon && player.equips.weapon.key === 'zhangba' && h.length >= 2) {
        opts.push({ cards: null, label: '丈八·两牌当杀', zhangba: true });
      }
    } else if (need === 'tao') {
      for (const c of h.filter(c => c.key === 'tao')) opts.push({ cards: [c], label: '桃' });
      const isMyTurn = this.players[this.turnSeat] === player;
      if (ctx.allowJijiu && this.hasSkill(player, 'jijiu') && !isMyTurn) {
        for (const c of h.filter(red)) opts.push({ cards: [c], label: '急救·红牌当桃' });
      }
    } else if (need === 'wuxie') {
      for (const c of h.filter(c => c.key === 'wuxie')) opts.push({ cards: [c], label: '无懈可击' });
    }
    return opts;
  }

  /** 请求玩家打出响应牌；返回 {cards, via} 或 null */
  async askRespondCard(player, need, ctx = {}) {
    while (true) {
      const options = this.responseOptions(player, need, ctx);
      // 八阵：需要闪且有八卦阵
      const baguaAvailable = need === 'shan' && player.equips.armor && player.equips.armor.key === 'bagua' &&
        !(ctx.attacker && ctx.attacker.equips.weapon && ctx.attacker.equips.weapon.key === 'qinggang');
      const jijiangAvailable = (need === 'sha') && this.hasSkill(player, 'jijiang') && player.identity === 'zhu' &&
        this.aliveOthers(player).some(p => p.kingdom === 'shu');
      if (!options.length && !baguaAvailable && !jijiangAvailable) return null;
      const ans = await this.ask(player, {
        kind: 'respond', need, title: ctx.title || `请打出【${need === 'sha' ? '杀' : need === 'shan' ? '闪' : '桃'}】`,
        bagua: baguaAvailable, jijiang: jijiangAvailable,
        options: options.map(o => ({ label: o.label, cardIds: o.cards ? o.cards.map(c => c.uid) : null, zhangba: !!o.zhangba })),
      });
      if (!ans || ans.pass) return null;
      if (ans.skill === 'bagua') {
        this.log(`${player.name} 发动【八卦阵】进行判定`);
        const card = await this.judge(player, 'bagua');
        if (cardColor(card) === 'red') {
          this.log(`【八卦阵】判定为红色，视为打出【闪】`);
          return { cards: [], via: 'bagua' };
        }
        this.log(`【八卦阵】判定为黑色，判定失效`);
        continue; // 可继续出闪
      }
      if (ans.skill === 'jijiang') {
        const got = await this.askJijiang(player);
        if (got) return got;
        continue;
      }
      // 校验牌
      let cards = (ans.cardIds || []).map(uid => player.hand.find(c => c.uid === uid)).filter(Boolean);
      if (ans.zhangba) {
        if (cards.length !== 2) return null;
        return { cards, via: 'zhangba' };
      }
      const valid = this.responseOptions(player, need, ctx)
        .some(o => o.cards && o.cards.length === cards.length && o.cards.every((c, i) => c.uid === cards[i].uid));
      if (!valid) return null;
      return { cards, via: 'hand' };
    }
  }

  /** 激将：询问蜀势力角色出杀 */
  async askJijiang(liubei) {
    this.log(`${liubei.name} 发动【激将】，蜀势力角色可打出【杀】`);
    for (const p of this.aliveOthers(liubei)) {
      if (p.kingdom !== 'shu') continue;
      const res = await this.askRespondCard(p, 'sha', { title: `${liubei.name} 发动【激将】，是否为其打出【杀】？` });
      if (res) {
        this.loseCards(p, res.cards);
        this.toDiscard(res.cards);
        this.log(`${p.name} 响应【激将】打出【杀】`);
        return { cards: [], via: 'jijiang', provider: p };
      }
    }
    this.log('无人响应【激将】');
    return null;
  }

  // ============ 无懈可击 ============
  /** 在某锦囊对 target（可为 null=整体）生效前询问无懈；返回 true=被抵消 */
  async askWuxie(trickName, target, about) {
    let canceled = false;
    for (let depth = 0; depth < 6; depth++) {
      let used = false;
      for (const p of this.alivePlayers()) {
        const has = p.hand.some(c => c.key === 'wuxie');
        if (!has) continue;
        const ans = await this.ask(p, {
          kind: 'respond', need: 'wuxie',
          title: `【${trickName}】${target ? '对 ' + target.name + ' ' : ''}${about || ''}${canceled ? '（当前已被无懈）' : ''}，是否使用【无懈可击】？`,
          options: this.responseOptions(p, 'wuxie').map(o => ({ label: o.label, cardIds: o.cards.map(c => c.uid) })),
        });
        if (ans && !ans.pass && ans.cardIds && ans.cardIds.length) {
          const card = p.hand.find(c => c.uid === ans.cardIds[0] && c.key === 'wuxie');
          if (card) {
            this.loseCards(p, [card]);
            this.toDiscard([card]);
            canceled = !canceled;
            used = true;
            this.log(`${p.name} 使用【无懈可击】，【${trickName}】${canceled ? '被抵消' : '恢复生效'}`);
            if (this.hasSkill(p, 'jizhi')) { this.log(`${p.name} 发动【集智】`); await this.drawCards(p, 1); }
            await this.passiveSweep();
            break;
          }
        }
      }
      if (!used) break;
    }
    return canceled;
  }

  // ============ 杀 ============
  shaColorOf(cards) {
    if (!cards || !cards.length) return 'none';
    const colors = cards.map(cardColor);
    return colors.every(c => c === colors[0]) ? colors[0] : 'none';
  }

  /**
   * 使用杀（含铁骑/流离/无双/防具/武器特效）
   * cards: 实际消耗的牌（虚拟杀时为转化牌）
   */
  async useSha(user, target, cards, opts = {}) {
    if (!this.canTargetSha(user, target)) {
      if (!opts.noDistance || !user.turnFlags?.xianzhenTarget || target.seat !== user.turnFlags.xianzhenTarget) {
        this.log('目标不合法');
        return false;
      }
    }
    if (!opts.redirected && !opts.noCount) user.turnFlags.shaUsed = (user.turnFlags.shaUsed || 0) + 1;
    cards = cards || [];
    const color = this.shaColorOf(cards);
    this.resolving.push({ key: 'sha', cards, user });
    this.log(`${user.name} 对 ${target.name} 使用【杀】`);
    const cardInfo = cards && cards[0] ? { suit: cards[0].suit, rank: cards[0].rank, name: cards[0].name } : { name: '杀' };
    this.broadcastEvent({ type: 'sha', from: user.seat, to: target.seat, card: cardInfo });
    this.sync();
    await this.delay(this.stepDelay);

    // 流离
    if (this.hasSkill(target, 'liuli') && target.hand.length && !opts.redirected) {
      const candidates = this.aliveOthers(target).filter(p => p !== user && this.distance(target, p) <= this.attackRange(target) && this.canTargetSha(user, p));
      if (candidates.length) {
        const yes = await this.confirm(target, 'liuli', `${user.name} 对你使用【杀】，是否发动【流离】（弃一张牌转移）？`);
        if (yes) {
          const dc = await this.chooseOwnCards(target, '流离：选择弃置的一张牌', 1, 1, () => true);
          if (dc && dc.length) {
            const nt = await this.choosePlayers(target, '流离：选择转移的目标', candidates, 1, 1);
            if (nt && nt.length) {
              await this.discard(target, dc);
              this.resolving.pop();
              this.log(`${target.name} 发动【流离】，【杀】转移给 ${nt[0].name}`);
              return await this.useSha(user, nt[0], cards, { ...opts, redirected: true });
            }
          }
        }
      }
    }

    // 雌雄双股剑
    if (user.equips.weapon && user.equips.weapon.key === 'cixiong' && user.gender !== target.gender && target.hand.length) {
      const yes = await this.confirm(user, 'cixiong', `是否发动【雌雄双股剑】？`);
      if (yes) {
        const opt = await this.chooseOption(target, 'cixiong', `${user.name} 发动【雌雄双股剑】，请选择：`, [
          { id: 'discard', label: '弃置一张手牌' }, { id: 'draw', label: `令 ${user.name} 摸一张牌` },
        ]);
        if (opt === 'discard' && target.hand.length) {
          const dc = await this.chooseOwnCards(target, '选择弃置的一张手牌', 1, 1, () => true);
          if (dc && dc.length) await this.discard(target, dc);
        } else {
          await this.drawCards(user, 1);
        }
      }
    }

    // 仁王盾
    const ignoreArmor = user.equips.weapon && user.equips.weapon.key === 'qinggang';
    if (!ignoreArmor && target.equips.armor && target.equips.armor.key === 'renwang' && color === 'black') {
      this.log(`【仁王盾】使黑色【杀】无效`);
      this.resolving.pop();
      await this.passiveSweep();
      return true;
    }

    // 铁骑
    let undodgeable = false;
    if (this.hasSkill(user, 'tieji')) {
      const yes = await this.confirm(user, 'tieji', '是否发动【铁骑】判定？');
      if (yes) {
        const card = await this.judge(user, 'tieji');
        if (cardColor(card) === 'red') {
          undodgeable = true;
          this.log(`【铁骑】判定为红色，此【杀】不可闪避！`);
        }
      }
    }

    const needShan = this.hasSkill(user, 'wushuang') ? 2 : 1;
    let dodged = 0;
    if (!undodgeable) {
      for (let i = 0; i < needShan; i++) {
        const res = await this.askRespondCard(target, 'shan', {
          title: needShan > 1 ? `${user.name}（无双）对你使用【杀】，需两张【闪】（第 ${i + 1} 张）` : `${user.name} 对你使用【杀】，是否打出【闪】？`,
          attacker: user,
        });
        if (res) {
          if (res.cards.length) {
            this.loseCards(target, res.cards);
            this.toDiscard(res.cards);
          }
          this.log(`${target.name} 打出【闪】`);
          this.broadcastEvent({ type: 'dodge', seat: target.seat });
          dodged++;
          this.sync();
        } else break;
      }
    }

    const hit = dodged < needShan;
    if (hit) {
      this.broadcastEvent({ type: 'hit', seat: target.seat, from: user.seat });
      // 寒冰剑
      if (user.equips.weapon && user.equips.weapon.key === 'hanbing' && this.cardCountOf(target) > 0) {
        const yes = await this.confirm(user, 'hanbing', `是否发动【寒冰剑】（防止伤害，改为弃置 ${target.name} 至多两张牌）？`);
        if (yes) {
          for (let i = 0; i < 2 && this.cardCountOf(target) > 0; i++) {
            const c = await this.chooseCardOf(user, target, `寒冰剑：弃置 ${target.name} 的一张牌（第${i + 1}张）`);
            if (c) this.toDiscard([c]);
          }
          this.resolving.pop();
          await this.passiveSweep();
          return true;
        }
      }
      await this.damage(user, target, 1, { key: 'sha', cards });
      // 麒麟弓
      if (user.equips.weapon && user.equips.weapon.key === 'qilin' && target.alive &&
          (target.equips.horse_plus || target.equips.horse_minus)) {
        const yes = await this.confirm(user, 'qilin', `是否发动【麒麟弓】弃置 ${target.name} 的一匹马？`);
        if (yes) {
          const slot = target.equips.horse_plus ? 'horse_plus' : 'horse_minus';
          const eq = target.equips[slot];
          await this.removeEquip(target, slot);
          this.toDiscard([eq]);
        }
      }
    } else {
      this.log(`${target.name} 闪避了【杀】`);
      // 贯石斧
      if (user.equips.weapon && user.equips.weapon.key === 'guanshi' && user.hand.length >= 2) {
        const yes = await this.confirm(user, 'guanshi', '是否发动【贯石斧】（弃两张牌强制命中）？');
        if (yes) {
          const dc = await this.chooseOwnCards(user, '贯石斧：选择弃置的两张牌', 2, 2, () => true);
          if (dc && dc.length === 2) {
            await this.discard(user, dc);
            this.log(`【贯石斧】强制命中！`);
            await this.damage(user, target, 1, { key: 'sha', cards });
          }
        }
      }
      // 青龙偃月刀
      if (user.equips.weapon && user.equips.weapon.key === 'qinglong' && target.alive) {
        const shaOpts = this.responseOptions(user, 'sha').filter(o => o.cards);
        if (shaOpts.length) {
          const yes = await this.confirm(user, 'qinglong', `是否发动【青龙偃月刀】对 ${target.name} 再使用一张【杀】？`);
          if (yes) {
            const picked = await this.chooseOwnCards(user, '青龙偃月刀：选择当【杀】使用的牌', 1, 1, c => shaOpts.some(o => o.cards[0].uid === c.uid));
            if (picked && picked.length) {
              this.loseCards(user, picked);
              this.resolving.pop();
              await this.useSha(user, target, picked, { ...opts, extra: true, noCount: true });
              this.toDiscard(picked);
              await this.passiveSweep();
              return true;
            }
          }
        }
      }
    }
    this.resolving.pop();
    await this.passiveSweep();
    return true;
  }

  // ============ 决斗 ============
  async resolveDuel(a, b, opts = {}) {
    // a 对 b 决斗，b 先出杀
    this.log(`${a.name} 对 ${b.name} 使用【决斗】`);
    this.broadcastEvent({ type: 'sha', from: a.seat, to: b.seat });
    let defender = b, attacker = a;
    while (true) {
      const need = this.hasSkill(attacker, 'wushuang') ? 2 : 1;
      let played = 0;
      for (let i = 0; i < need; i++) {
        const res = await this.askRespondCard(defender, 'sha', {
          title: need > 1 ? `【决斗】对方（无双），你需打出两张【杀】（第 ${i + 1} 张）` : `【决斗】请打出【杀】，否则受到1点伤害`,
        });
        if (!res) break;
        if (res.cards.length) {
          this.loseCards(defender, res.cards);
          this.toDiscard(res.cards);
        }
        defender.turnFlags.shaUsed = (defender.turnFlags.shaUsed || 0) + 1; // 打出杀也计克己
        this.log(`${defender.name} 打出【杀】`);
        played++;
        this.sync();
      }
      if (played < need) {
        await this.damage(attacker, defender, 1, { key: 'juedou', cards: opts.cards || [] });
        return;
      }
      [attacker, defender] = [defender, attacker];
    }
  }

  // ============ 出牌阶段可用性 ============
  playableShaTargets(user) {
    return this.aliveOthers(user).filter(t => this.canTargetSha(user, t));
  }
  canPlaySha(user) {
    return (user.turnFlags.shaUsed || 0) < this.shaLimit(user) && this.playableShaTargets(user).length > 0;
  }

  /** 校验并执行出牌 */
  async tryPlayCard(user, ans) {
    const hand = user.hand;
    const cards = (ans.cardIds || []).map(uid => hand.find(c => c.uid === uid)).filter(Boolean);
    if (!cards.length || cards.length !== (ans.cardIds || []).length) return this.err(user, '牌不存在');
    const targets = (ans.targets || []).map(s => this.players[s]).filter(p => p && p.alive);
    let asKey = ans.as || (cards.length === 1 ? cards[0].key : null);
    let virtual = false;

    // 转化牌判定
    if (cards.length === 1) {
      const c = cards[0];
      if (asKey === 'sha' && c.key !== 'sha') {
        if (cardColor(c) === 'red' && this.hasSkill(user, 'wusheng')) {
          virtual = true;
          this.broadcastEvent({ type: 'skillAnim', skillId: 'wusheng', from: user.seat });
        } else if (c.key === 'shan' && this.hasSkill(user, 'longdan')) {
          virtual = true;
          this.broadcastEvent({ type: 'skillAnim', skillId: 'longdan', from: user.seat });
        } else return this.err(user, '不能这样转化【杀】');
      } else if (asKey === 'guohe' && c.key !== 'guohe') {
        if (cardColor(c) === 'black' && this.hasSkill(user, 'qixi')) virtual = true;
        else return this.err(user, '不能这样转化');
      } else if (asKey === 'lebu' && c.key !== 'lebu') {
        if (c.suit === 'diamond' && this.hasSkill(user, 'guose')) virtual = true;
        else return this.err(user, '不能这样转化');
      }
    } else if (cards.length === 2 && asKey === 'sha') {
      if (!(user.equips.weapon && user.equips.weapon.key === 'zhangba')) return this.err(user, '需要丈八蛇矛');
      virtual = true;
    }

    const legal = await this.validateCardUse(user, asKey, cards, targets, virtual);
    if (!legal.ok) return this.err(user, legal.msg || '不合法的操作');

    // 消耗牌（装备在 executeCard 内处理）
    const isEquip = cards[0] && cards[0].type === 'equip' && !virtual;
    if (!isEquip) this.loseCards(user, cards);
    await this.executeCard(user, asKey, cards, targets, virtual);
    return true;
  }

  err(player, msg) {
    this.sendTo(player, { type: 'toast', msg });
    return false;
  }

  async validateCardUse(user, key, cards, targets, virtual) {
    const t = targets[0];
    switch (key) {
      case 'sha': {
        if (!this.canPlaySha(user)) return { ok: false, msg: '本回合不能再使用【杀】或无合法目标' };
        const maxTargets = (user.equips.weapon && user.equips.weapon.key === 'fangtian' && user.hand.length === cards.length) ? 3 : 1;
        if (!targets.length || targets.length > maxTargets) return { ok: false, msg: `【杀】需要 1~${maxTargets} 个目标` };
        for (const tg of targets) if (!this.canTargetSha(user, tg)) return { ok: false, msg: '目标不在攻击范围内或不合法' };
        return { ok: true };
      }
      case 'tao':
        if (user.hp >= user.maxHp) return { ok: false, msg: '体力已满' };
        return { ok: true };
      case 'shan':
      case 'wuxie':
        return { ok: false, msg: '此牌不能在出牌阶段主动使用' };
      case 'juedou':
        if (this.opts.allowJuedou === false) return { ok: false, msg: '本房间禁用【决斗】' };
        if (!t || t === user) return { ok: false, msg: '【决斗】需要一名其他角色为目标' };
        if (this.hasSkill(t, 'kongcheng') && !t.hand.length) return { ok: false, msg: '【空城】不能成为决斗目标' };
        return { ok: true };
      case 'guohe':
        if (!t || t === user || !this.cardCountOf(t)) return { ok: false, msg: '【过河拆桥】需要一名有牌的其他角色' };
        return { ok: true };
      case 'shunshou': {
        if (!t || t === user || !this.cardCountOf(t)) return { ok: false, msg: '【顺手牵羊】需要一名有牌的其他角色' };
        if (this.hasSkill(t, 'qianxun')) return { ok: false, msg: '【谦逊】不能成为顺手牵羊目标' };
        if (!this.hasSkill(user, 'qicai') && this.distance(user, t) > 1) return { ok: false, msg: '距离不足（顺手牵羊距离为1）' };
        return { ok: true };
      }
      case 'lebu':
        if (!t || t === user) return { ok: false, msg: '【乐不思蜀】需要一名其他角色' };
        if (this.hasSkill(t, 'qianxun')) return { ok: false, msg: '【谦逊】不能成为乐不思蜀目标' };
        if (t.judgeZone.some(c => c.key === 'lebu')) return { ok: false, msg: '其判定区已有乐不思蜀' };
        return { ok: true };
      case 'shandian':
        if (user.judgeZone.some(c => c.key === 'shandian')) return { ok: false, msg: '你的判定区已有闪电' };
        return { ok: true };
      case 'jiedao': {
        const holder = targets[0], victim = targets[1];
        if (!holder || holder === user || !holder.equips.weapon) return { ok: false, msg: '【借刀杀人】需要一名装备武器的其他角色' };
        if (!victim || victim === user || victim === holder) return { ok: false, msg: '需要指定被杀的目标' };
        if (this.distance(holder, victim) > this.attackRange(holder)) return { ok: false, msg: '被杀目标不在其攻击范围内' };
        if (this.hasSkill(victim, 'kongcheng') && !victim.hand.length) return { ok: false, msg: '【空城】不能成为杀的目标' };
        return { ok: true };
      }
      case 'wuzhong': case 'taoyuan': case 'wugu':
        return { ok: true };
      case 'nanman': case 'wanjian':
        if (this.opts.allowAoe === false) return { ok: false, msg: '本房间禁用AOE锦囊' };
        return { ok: true };
      default:
        if (cards[0] && cards[0].type === 'equip') return { ok: true };
        return { ok: false, msg: '未知牌' };
    }
  }

  async executeCard(user, key, cards, targets, virtual) {
    const label = virtual ? `（${cards.map(c => c.name).join('+')}当作【${cards.length ? (key === 'sha' ? '杀' : key === 'guohe' ? '过河拆桥' : '乐不思蜀') : key}】）` : '';
    // 装备
    if (cards[0] && cards[0].type === 'equip' && !virtual) {
      const card = cards[0];
      this.loseCards(user, [card]);
      const slot = card.subtype;
      const old = user.equips[slot];
      if (old) {
        await this.removeEquip(user, slot);
        this.toDiscard([old]);
      }
      user.equips[slot] = card;
      this.log(`${user.name} 装备了【${card.name}】`);
      if (this.__brain && this.__brain.tracker) this.__brain.tracker.recordEquip(user.seat);
      this.broadcastEvent({ type: 'equip', seat: user.seat, equipName: card.name });
      this.sync();
      await this.passiveSweep();
      return;
    }
    this.resolving.push({ key, cards, user });
    let skipFinalDiscard = false;
    try {
      switch (key) {
        case 'sha': {
          this.resolving.pop(); // useSha 自管理 resolving 栈
          for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            if (!t.alive) continue;
            await this.useSha(user, t, cards, { noCount: i > 0 });
          }
          return;
        }
        case 'tao':
          this.toDiscard(cards);
          await this.recover(user, 1, user, { byTao: true });
          if (this.__brain && this.__brain.tracker) this.__brain.tracker.recordHeal(user.seat, user.seat);
          this.log(`${user.name} 使用【桃】`);
          break;
        case 'wuzhong':
          this.log(`${user.name} 使用【无中生有】`);
          if (await this.askWuxie('无中生有', user)) break;
          await this.drawCards(user, 2);
          break;
        case 'juedou': {
          const t = targets[0];
          this.log(`${user.name} 对 ${t.name} 使用【决斗】${label}`);
          if (!(await this.askWuxie('决斗', t))) {
            await this.resolveDuel(user, t, { cards });
          }
          break;
        }
        case 'guohe': {
          const t = targets[0];
          this.log(`${user.name} 对 ${t.name} 使用【过河拆桥】${label}`);
          if (!(await this.askWuxie('过河拆桥', t)) && this.cardCountOf(t)) {
            const c = await this.chooseCardOf(user, t, `过河拆桥：选择弃置 ${t.name} 的一张牌`);
            if (c) {
              this.toDiscard([c]);
              this.log(`${t.name} 的【${c.name}】被弃置`);
            }
          }
          break;
        }
        case 'shunshou': {
          const t = targets[0];
          this.log(`${user.name} 对 ${t.name} 使用【顺手牵羊】`);
          if (!(await this.askWuxie('顺手牵羊', t)) && this.cardCountOf(t)) {
            const c = await this.chooseCardOf(user, t, `顺手牵羊：选择获得 ${t.name} 的一张牌`);
            if (c) {
              this.gain(user, [c]);
              this.log(`${user.name} 获得了 ${t.name} 的一张牌`);
            }
          }
          break;
        }
        case 'lebu': {
          const t = targets[0];
          this.log(`${user.name} 对 ${t.name} 使用【乐不思蜀】${label}`);
          skipFinalDiscard = true; // 进入判定区而非弃牌堆
          for (const c of cards) {
            // 创建虚拟对象，不修改原牌属性
            const lebuCard = { ...c, key: 'lebu', name: '乐不思蜀', type: 'trick', subtype: 'delayed' };
            t.judgeZone.push(lebuCard);
          }
          this.sync();
          break;
        }
        case 'shandian':
          this.log(`${user.name} 使用【闪电】`);
          skipFinalDiscard = true;
          user.judgeZone.push(...cards);
          this.sync();
          break;
        case 'taoyuan':
          this.log(`${user.name} 使用【桃园结义】`);
          for (const p of this.alivePlayers()) {
            if (!(await this.askWuxie('桃园结义', p))) await this.recover(p, 1, user);
          }
          break;
        case 'nanman': case 'wanjian': {
          const need = key === 'nanman' ? 'sha' : 'shan';
          const cname = key === 'nanman' ? '南蛮入侵' : '万箭齐发';
           this.log(`${user.name} 使用【${cname}】`);
           this.broadcastEvent({ type: 'aoe', aoeType: key, from: user.seat });
           for (const p of this.aliveOthers(user)) {
            if (!p.alive) continue;
            if (await this.askWuxie(cname, p)) continue;
            const res = await this.askRespondCard(p, need, { title: `【${cname}】：请打出【${need === 'sha' ? '杀' : '闪'}】，否则受到1点伤害`, attacker: user });
            if (res) {
              if (res.cards.length) { this.loseCards(p, res.cards); this.toDiscard(res.cards); }
              if (need === 'sha') p.turnFlags.shaUsed = (p.turnFlags.shaUsed || 0) + 1;
              this.log(`${p.name} 打出【${need === 'sha' ? '杀' : '闪'}】`);
              this.sync();
            } else {
              await this.damage(user, p, 1, { key, cards });
            }
          }
          break;
        }
        case 'wugu': {
          this.log(`${user.name} 使用【五谷丰登】`);
          if (await this.askWuxie('五谷丰登', user)) break;
          const n = this.alivePlayers().length;
          const revealed = [];
          for (let i = 0; i < n; i++) {
            if (!this.deck.length) this.reshuffle();
            if (this.deck.length) revealed.push(this.deck.shift());
          }
          this.broadcastEvent({ type: 'wugu', cards: revealed.map(publicCard) });
          for (const p of [...this.alivePlayers()].sort((a, b) => ((a.seat - user.seat + 99) % 99) - ((b.seat - user.seat + 99) % 99))) {
            if (!p.alive || !revealed.length) continue;
            const picked = await this.chooseWuguCard(p, revealed);
            const idx = revealed.indexOf(picked);
            if (idx >= 0) revealed.splice(idx, 1);
            this.gain(p, [picked]);
            this.log(`${p.name} 从【五谷丰登】获得一张牌`);
          }
          this.toDiscard(revealed);
          break;
        }
        case 'jiedao': {
          const holder = targets[0], victim = targets[1];
          this.log(`${user.name} 对 ${holder.name} 使用【借刀杀人】（令其杀 ${victim.name}）`);
          if (await this.askWuxie('借刀杀人', holder)) break;
          const res = await this.askRespondCard(holder, 'sha', { title: `【借刀杀人】：请对 ${victim.name} 使用【杀】，否则武器被 ${user.name} 获得` });
          if (res) {
            if (res.cards.length) this.loseCards(holder, res.cards);
            await this.useSha(holder, victim, res.cards.length ? res.cards : [], { extra: true, noCount: true });
            this.toDiscard(res.cards);
          } else {
            const w = holder.equips.weapon;
            await this.removeEquip(holder, 'weapon');
            this.gain(user, [w]);
            this.log(`${user.name} 获得了 ${holder.name} 的【${w.name}】`);
          }
          break;
        }
        default:
          this.log(`使用了【${cards[0] ? cards[0].name : key}】`);
      }
      // 集智：只对实际是锦囊牌的牌触发（不含虚拟杀/闪等基本牌转化）
      if (this.hasSkill(user, 'jizhi') && cards[0] && cards[0].type === 'trick' && key !== 'lebu' && key !== 'shandian') {
        this.log(`${user.name} 发动【集智】`);
        await this.drawCards(user, 1);
      }
    } finally {
      const idx = this.resolving.findIndex(r => r.user === user && r.cards === cards);
      if (idx >= 0) this.resolving.splice(idx, 1);
      if (!skipFinalDiscard) this.toDiscard(cards);
      await this.passiveSweep();
      this.sync();
    }
  }

  async chooseWuguCard(player, revealed) {
    const ans = await this.ask(player, {
      kind: 'chooseCards', title: '五谷丰登：选择一张牌', min: 1, max: 1,
      cards: revealed.map(publicCard),
    });
    let card = ans && ans.cardIds && revealed.find(c => c.uid === ans.cardIds[0]);
    if (!card) card = revealed[0];
    return card;
  }
  // ============ 技能使用（出牌阶段按钮） ============
  buildSkillButtons(player) {
    const btns = [];
    for (const sk of player.skills) {
      const def = SKILLS[sk];
      if (!def) continue;
      if (def.type === 'active') {
        let usable = true, reason = '';
        if (sk === 'zhiheng' && player.turnFlags.zhiheng) { usable = false; reason = '已用过'; }
        if (sk === 'fanjian' && (player.turnFlags.fanjian || !player.hand.length)) { usable = false; reason = '已用过/无手牌'; }
        if (sk === 'jieyin' && player.turnFlags.jieyin) { usable = false; reason = '已用过'; }
        if (sk === 'qingnang' && player.turnFlags.qingnang) { usable = false; reason = '已用过'; }
        if (sk === 'lijian' && player.turnFlags.lijian) { usable = false; reason = '已用过'; }
        if (sk === 'yanling' && player.turnFlags.yanling) { usable = false; reason = '已用过'; }
        if (sk === 'kurou' && player.hp <= 1 && !player.hand.some(c => c.key === 'tao')) { /* 允许自杀式? 限制 */ }
        btns.push({ id: sk, name: def.name, desc: def.desc, type: 'active', usable, reason, button: def.button || {} });
      } else if (def.type === 'convert' && (sk === 'qixi' || sk === 'guose')) {
        btns.push({ id: sk, name: def.name, desc: def.desc, type: 'convert', usable: true, button: {} });
      } else if (sk === 'jijiang' && player.identity === 'zhu') {
        btns.push({ id: sk, name: def.name, desc: def.desc, type: 'lord', usable: this.canPlaySha(player), button: {} });
      } else if (def.type !== 'active') {
        btns.push({ id: sk, name: def.name, desc: def.desc, type: def.type, usable: true, passive: true, button: {} });
      }
    }
    (player.customSkills || []).forEach(sk => {
      if (!sk.enabled || player.skills.includes(sk.id)) return;
      const passive = !['active','lord','convert'].includes(sk.type || 'passive');
      btns.push({ id: sk.id, name: sk.name, desc: sk.desc || '', type: passive ? 'passive' : 'active', usable: true, passive, button: {} });
    });
    return btns;
  }

  async trySkill(user, ans) {
    const sk = ans.skill;
    const def = SKILLS[sk];
    const customDef = (user.customSkills || []).find(s => s.id === sk);
    if (!def && !customDef) return this.err(user, '没有此技能');
    if (customDef) {
      const cards = (ans.cardIds || []).map(uid => user.hand.find(c => c.uid === uid)).filter(Boolean);
      const targets = (ans.targets || []).map(s => this.players[s]).filter(p => p && p.alive);
      await this.customExecutor.executeEffect(user, customDef, { cards, targets });
      await this.passiveSweep();
      this.sync();
      return true;
    }
    if (!user.skills.includes(sk)) return this.err(user, '没有此技能');
      if (sk === 'jijiang') {
        // 激将出杀
        if (!this.canPlaySha(user)) return this.err(user, '无法使用【杀】');
        const targets = (ans.targets || []).map(s => this.players[s]).filter(p => p && p.alive);
        if (!targets.length || !this.canTargetSha(user, targets[0])) return this.err(user, '请选择合法目标');
        this.broadcastEvent({ type: 'skillVoice', seat: user.seat, generalId: user.generalId, skillId: 'jijiang' });
        const got = await this.askJijiang(user);
        if (got) {
          await this.useSha(user, targets[0], [], { jijiang: true });
        }
        return true;
      }
    if (def.type !== 'active') return this.err(user, '该技能不能主动发动');
    const cards = (ans.cardIds || []).map(uid => user.hand.find(c => c.uid === uid)).filter(Boolean);
    const targets = (ans.targets || []).map(s => this.players[s]).filter(p => p && p.alive);
    // 基本校验
    const need = def.button || {};
    if (need.needCards === 2 && cards.length !== 2) return this.err(user, '需要选择两张牌');
    if (need.needCards === 1 && cards.length !== 1) return this.err(user, '需要选择一张牌');
    if (need.needCards === '1+' && !cards.length) return this.err(user, '需要选择至少一张牌');
    if ((need.needTargets || 0) > targets.length) return this.err(user, '需要选择目标');
    const ok = await def.activate(this, user, { cards, targets });
    if (!ok) this.err(user, '技能发动失败');
    await this.passiveSweep();
    this.sync();
    return ok;
  }

  // ============ 回合流程 ============
  async runTurn(player) {
    if (!player.alive) return;
    player.turnFlags = {};
    this.customExecutor.resetTurn(player.seat);
    this.phase = 'prepare';
    this.log(`—— ${player.name} 的回合 ——`);
    this.sync();
    await this.delay(this.stepDelay);

    // 自定义技能：回合开始
    await this.customExecutor.checkAndExecute(player, 'phase:start');

    // 回合开始阶段：观星/洛神
    for (const sk of player.skills) {
      const def = SKILLS[sk];
      if (def && def.onTurnPrepare && player.alive) await def.onTurnPrepare(this, player);
    }

    // 判定阶段
    this.phase = 'judge';
    this.sync();
    let skipPlay = false;
    while (player.judgeZone.length && player.alive) {
      const delayed = player.judgeZone[player.judgeZone.length - 1]; // 后来的先判
      if (delayed.key === 'lebu') {
        this.log(`判定【乐不思蜀】（${player.name}）`);
        if (!(await this.askWuxie('乐不思蜀', player, '即将判定'))) {
          const card = await this.judge(player, 'lebu');
          if (card.suit !== 'heart') {
            this.log(`【乐不思蜀】生效，${player.name} 跳过出牌阶段`);
            skipPlay = true;
          } else {
            this.log(`【乐不思蜀】未生效`);
          }
        }
        player.judgeZone = player.judgeZone.filter(c => c !== delayed);
        this.toDiscard([delayed]);
      } else if (delayed.key === 'shandian') {
        this.log(`判定【闪电】（${player.name}）`);
        if (!(await this.askWuxie('闪电', player, '即将判定'))) {
          const card = await this.judge(player, 'shandian');
          if (card.suit === 'spade' && card.rank >= 2 && card.rank <= 9) {
            this.log(`⚡【闪电】命中！${player.name} 受到3点雷电伤害`);
            await this.damage(null, player, 3, { key: 'shandian' });
            player.judgeZone = player.judgeZone.filter(c => c !== delayed);
            this.toDiscard([delayed]);
          } else {
            this.log(`【闪电】未命中，移至下家`);
            player.judgeZone = player.judgeZone.filter(c => c !== delayed);
            const next = this.nextAlive(player);
            if (next && next !== player) {
              if (next.judgeZone.some(c => c.key === 'shandian')) {
                this.toDiscard([delayed]); // 下家已有闪电则... 实际上应该顺延，简化：弃置
              } else {
                next.judgeZone.push(delayed);
              }
            }
          }
        } else {
          player.judgeZone = player.judgeZone.filter(c => c !== delayed);
          this.toDiscard([delayed]);
        }
      } else {
        player.judgeZone = player.judgeZone.filter(c => c !== delayed);
        this.toDiscard([delayed]);
      }
      this.sync();
      if (!player.alive) return;
    }

    // 摸牌阶段
    this.phase = 'draw';
    this.sync();
    await this.customExecutor.checkAndExecute(player, 'phase:draw');
    let drawCount = 2;
    for (const sk of player.skills) {
      const def = SKILLS[sk];
      if (def && def.onDrawPhase && player.alive) {
        const r = await def.onDrawPhase(this, player, drawCount);
        if (r != null) drawCount = r;
      }
    }
    if (drawCount > 0 && player.alive) await this.drawCards(player, drawCount);

    // 出牌阶段
    this.phase = 'play';
    this.sync();
    await this.customExecutor.checkAndExecute(player, 'phase:play');
    if (!skipPlay && player.alive) {
      while (player.alive && !this.finished) {
        const ans = await this.ask(player, {
          kind: 'play',
          shaUsed: player.turnFlags.shaUsed || 0,
          shaLimit: this.shaLimit(player),
          canSha: this.canPlaySha(player),
          skills: this.buildSkillButtons(player),
        });
        if (!ans || ans.action === 'end') break;
        if (ans.action === 'playCard') await this.tryPlayCard(player, ans);
        else if (ans.action === 'skill') await this.trySkill(player, ans);
        this.sync();
      }
    }

    // 弃牌阶段
    this.phase = 'discard';
    this.sync();
    await this.customExecutor.checkAndExecute(player, 'phase:discard');
    if (player.alive) {
      const kejiSkip = this.hasSkill(player, 'keji') && !(player.turnFlags.shaUsed > 0);
      if (kejiSkip) {
        this.log(`${player.name} 发动【克己】，跳过弃牌阶段`);
      }
      const maxHand = this.opts.handLimit > 0 ? this.opts.handLimit : player.hp;
      const discardEnabled = this.opts.discardLimit !== false;
      while (!kejiSkip && discardEnabled && player.hand.length > maxHand && player.alive) {
        const need = player.hand.length - maxHand;
        const cards = await this.chooseOwnCards(player, `弃牌阶段：弃置 ${need} 张牌（手牌 ${player.hand.length}/${this.opts.handLimit > 0 ? '上限' + this.opts.handLimit : '体力' + player.hp}）`, need, need, () => true);
        if (!cards || !cards.length) break;
        await this.discard(player, cards);
      }
    }

    // 结束阶段
    this.phase = 'end';
    this.sync();
    await this.customExecutor.checkAndExecute(player, 'phase:end');
    for (const sk of player.skills) {
      const def = SKILLS[sk];
      if (def && def.onTurnEnd && player.alive) await def.onTurnEnd(this, player);
    }
    player.turnFlags = {};
  }

  // ============ 开局 ============
  async start() {
    const n = this.players.length;
    // 1. 分配身份（尊重点身份偏好）
    this.assignIdentities();
    // 2. 选将
    await this.pickGenerals();
    // 3. 体力 & 发牌
    for (const p of this.players) {
      if (p.identity === 'zhu' && this.opts.lordExtraHp !== false) p.maxHp += 1;
      p.maxHp += (this.opts.hpBonus || 0);
      p.maxHp = Math.max(1, p.maxHp);
      p.hp = p.maxHp;
    }
    this.phase = 'dealing';
    const startCards = this.opts.startCards || 4;
    for (const p of this.players) await this.drawCards(p, startCards);
    this.log('游戏开始！主公先行动。');
    // 4. 回合循环
    const zhuPlayer = this.players.find(p => p.identity === 'zhu');
    const zhuSeat = zhuPlayer ? zhuPlayer.seat : 0;
    let idx = zhuSeat;
    while (!this.finished) {
      const p = this.players[idx];
      this.turnSeat = idx;
      if (p.alive) await this.runTurn(p);
      if (this.finished) break;
      idx = (idx + 1) % this.players.length;
      if (idx === zhuSeat) {
        this.round++;
        const limit = this.opts.roundLimit;
        if (limit > 0 && this.round > limit) {
          this.winner = 'zhu';
          this.finished = true;
          this.log(`达到回合上限 ${limit}，游戏结束`);
          if (this.hooks.onEnd) this.hooks.onEnd(this.winner);
        }
        // 每回合结束时检查自定义胜利条件
        if (!this.finished && this.opts.winCondition && this.opts.winCondition !== 'default') {
          const { WinConditionEvaluator } = require('./game-modes');
          const evaluator = new WinConditionEvaluator(this, this.opts.winCondition, this.opts.winParams || {});
          const customWinner = evaluator.evaluate(this.alivePlayers());
          if (customWinner != null) {
            this.winner = customWinner;
            this.finished = true;
            this.log(`🏆 游戏结束：自定义胜利条件达成！`);
            if (this.hooks.onEnd) this.hooks.onEnd(this.winner);
          }
        }
      }
      if (this.round > 500) {
        // 兜底：回合上限，按存活玩家判定胜负
        const lord = this.players.find(p => p.identity === 'zhu');
        this.winner = lord && lord.alive ? 'zhu' : 'fan';
        this.finished = true;
        if (this.hooks.onEnd) this.hooks.onEnd(this.winner);
      }
    }
    this.phase = 'over';
    this.sync();
  }

  assignIdentities() {
    const n = this.players.length;
    // 使用游戏模式的身份分配
    const dist = this.gameMode.getIdentityDistribution(n);
    if (dist.length === 0) return; // 国战等特殊模式自行处理
    let pool = dist.slice();
    const prefsAllowed = this.opts.allowIdentityPick;
    // 先满足点了身份的真人（按座位顺序），冲突先到先得
    const assigned = new Map();
    if (prefsAllowed) {
      for (const p of this.players) {
        const pref = this.opts.identityPrefs && this.opts.identityPrefs[p.pid];
        if (pref && pool.includes(pref) && !assigned.has(p.pid)) {
          // 主公只有一个：先到先得
          assigned.set(p.pid, pref);
          pool.splice(pool.indexOf(pref), 1);
        }
      }
    }
    // 其余随机
    const rest = this.players.filter(p => !assigned.has(p.pid));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    rest.forEach((p, i) => assigned.set(p.pid, pool[i]));
    for (const p of this.players) p.identity = assigned.get(p.pid);
    const zhu = this.players.find(p => p.identity === 'zhu');
    if (!zhu) throw new Error('身份分配异常：未生成主公');
    this.log(`主公是 ${zhu.name}！`);
  }

  async pickGenerals() {
    this.phase = 'picking';
    let pool = (this.opts.generalIds || GENERALS.map(g => g.id)).slice();
    // 应用禁将列表
    if (this.opts.bannedGenerals && this.opts.bannedGenerals.length) {
      pool = pool.filter(id => !this.opts.bannedGenerals.includes(id));
    }
    const pickMode = this.opts.pickMode || 'random';
    const pickCount = this.opts.pickCount || 4;
    // 测试钩子：强制指定座位武将（这些座位跳过选将）
    const forced = this.opts.forceGenerals || {};
    for (const p of this.players) {
      const fid = forced[p.seat];
      if (fid && pool.includes(fid)) this.setGeneral(p, fid);
    }
    const needPick = p => !(forced[p.seat] && pool.includes(forced[p.seat]));
    if (pickMode === 'random') {
      // 每人随机 N 选 1
      const shuffled = pool.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const offers = {};
      this.players.forEach((p, i) => {
        offers[p.seat] = shuffled.slice(i * pickCount, i * pickCount + pickCount);
      });
      await Promise.all(this.players.filter(needPick).map(async p => {
        const cands = offers[p.seat].map(id => this.generalInfo(id));
        const chosen = await this.chooseGeneral(p, cands);
        this.setGeneral(p, chosen);
      }));
    } else {
      // 自由点将：按座位顺序
      const taken = new Set(this.players.filter(p => !needPick(p)).map(p => p.generalId));
      for (const p of this.players) {
        if (!needPick(p)) continue;
        const cands = pool.filter(id => !taken.has(id)).map(id => this.generalInfo(id));
        const chosen = await this.chooseGeneral(p, cands);
        taken.add(chosen);
        this.setGeneral(p, chosen);
      }
    }
    this.sync();
  }

  async chooseGeneral(p, cands) {
    const ans = await this.ask(p, {
      kind: 'chooseGeneral',
      title: p.identity === 'zhu' ? `你是【主公】，请选择武将` : `请选择武将（你的身份：${IDENTITIES[p.identity]}）`,
      candidates: cands,
      identity: p.identity,
    });
    if (ans && ans.generalId && cands.some(c => c.id === ans.generalId)) return ans.generalId;
    return cands[0].id;
  }

  generalInfo(id) {
    const g = (this.opts.generals || GENERALS).find(x => x.id === id) || GENERALS.find(x => x.id === id);
    if (!g) return { id, name: id, kingdom: 'qun', hp: 4, skills: [], title: '' };
    return {
      id: g.id, name: g.name, kingdom: g.kingdom, hp: g.hp, title: g.title || '',
      gender: g.gender || 'm', custom: !!g.custom,
      skills: (g.skills || []).map(sk => ({ id: sk, name: (SKILLS[sk] || {}).name || sk, desc: (SKILLS[sk] || {}).desc || '' })),
    };
  }

  setGeneral(p, generalId) {
    const g = (this.opts.generals || GENERALS).find(x => x.id === generalId) || GENERALS.find(x => x.id === generalId);
    if (!g) return;
    p.generalId = g.id;
    p.generalName = g.name;
    p.title = g.title || '';
    p.kingdom = g.kingdom;
    p.gender = g.gender || 'm';
    p.maxHp = g.hp;
    p.hp = g.hp;
    p.skills = (g.skills || []).slice();
    p.custom = !!g.custom;
    if (Array.isArray(this.customSkills)) {
      p.customSkills = (this.customSkills || []).filter(sk => !p.skills.includes(sk.id));
    }
    this.log(`${p.name} 选择了武将【${g.name}】`);
    this.broadcastEvent({ type: 'selectGeneral', seat: p.seat, generalId: g.id, name: g.name });
    this.sync();
  }

  // ============ 状态输出（按玩家视角） ============
  getState(forPid) {
    const me = this.byPid(forPid);
    const zhuRevealed = true;
    return {
      phase: this.phase,
      turnSeat: this.turnSeat,
      round: this.round,
      deckCount: this.deck.length,
      discardCount: this.discardPile.length,
      winner: this.winner,
      finished: this.finished,
      gameMode: this.gameMode.id,
      logs: this.logs.slice(-80),
      mySeat: me ? me.seat : -1,
      myIdentity: me ? me.identity : null,
      myHand: me ? me.hand.map(publicCard) : [],
      pendingForMe: this.pending && me && this.pending.seat === me.seat ? this.pending.prompt : null,
      players: this.players.map(p => ({
        seat: p.seat,
        name: p.name,
        isAI: p.isAI,
        alive: p.alive,
        identity: (p.identity === 'zhu') || !p.alive || (me && me.pid === p.pid) || this.finished ? p.identity : null,
        generalId: p.generalId,
        generalName: p.generalName,
        title: p.title,
        kingdom: p.kingdom,
        gender: p.gender,
        custom: p.custom,
        hp: p.hp,
        maxHp: p.maxHp,
        handCount: p.hand.length,
        equips: Object.fromEntries(Object.entries(p.equips).map(([k, v]) => [k, v ? publicCard(v) : null])),
        judgeZone: p.judgeZone.map(publicCard),
        skills: p.skills.map(sk => ({ id: sk, name: (SKILLS[sk] || {}).name || sk, desc: (SKILLS[sk] || {}).desc || '', type: (SKILLS[sk] || {}).type })),
        stats: p.stats,
        distance: me && me.alive && p.alive && me !== p ? this.distance(me, p) : null,
        turnFlags: me && me.pid === p.pid ? (p.turnFlags || null) : null,
      })),
    };
  }
}

module.exports = { Game, IDENTITIES, IDENTITY_DIST };
