// 自定义技能执行引擎
(function () {
  'use strict';

  class CustomSkillEngine {
    constructor(game) {
      this.game = game;
      this.marks = {}; // playerSeat -> { markName: count }
      this.flags = {}; // playerSeat -> { flagName: value }
      this.executed = {}; // playerSeat -> Set(skillId) for oncePerGame
    }

    // 注册自定义技能到玩家
    register(player, skills) {
      if (!player.customSkills) player.customSkills = [];
      skills.forEach(sk => {
        const def = this.buildSkillDef(sk);
        if (def) player.customSkills.push(def);
      });
    }

    buildSkillDef(sk) {
      return {
        id: sk.id,
        name: sk.name,
        desc: sk.desc,
        trigger: sk.trigger,
        condition: sk.condition,
        effects: sk.effects,
        limitation: sk.limitation,
        cost: sk.cost,
        enabled: sk.enabled,
      };
    }

    // 检查并执行触发技能
    async checkAndExecute(player, trigger, ctx = {}) {
      if (!player.customSkills || !player.alive) return;
      for (const sk of player.customSkills) {
        if (!sk.enabled) continue;
        if (sk.trigger !== trigger) continue;

        // 检查限制
        if (sk.limitation === 'oncePerGame') {
          const key = `${player.seat}:${sk.id}`;
          if (this.executed[key]) continue;
        }
        if (sk.limitation === 'oncePerTurn') {
          const flag = `${player.seat}:${sk.id}:turn`;
          if (this.flags[flag]) continue;
        }

        // 检查条件
        if (!this.checkCondition(player, sk.condition, ctx)) continue;

        // 执行消耗
        if (sk.cost) {
          const canPay = await this.payCost(player, sk.cost);
          if (!canPay) continue;
        }

        // 执行效果
        this.game.log(`${player.name} 发动【${sk.name}】`);
        for (const effect of sk.effects) {
          await this.executeEffect(player, effect, ctx);
        }

        // 标记已执行
        if (sk.limitation === 'oncePerGame') {
          this.executed[`${player.seat}:${sk.id}`] = true;
        }
        if (sk.limitation === 'oncePerTurn') {
          this.flags[`${player.seat}:${sk.id}:turn`] = true;
        }
        voice(this.game, player, sk.id);
      }
    }

    checkCondition(player, cond, ctx) {
      if (!cond || cond.type === 'always') return true;
      const g = this.game;
      switch (cond.type) {
        case 'hpLessThan': return player.hp < (cond.params.value || 99);
        case 'hpMoreThan': return player.hp > (cond.params.value || 0);
        case 'handLessThan': return player.hand.length < (cond.params.value || 99);
        case 'handMoreThan': return player.hand.length > (cond.params.value || 0);
        case 'hasSha': return player.hand.some(c => c.key === 'sha');
        case 'hasShan': return player.hand.some(c => c.key === 'shan');
        case 'hasTao': return player.hand.some(c => c.key === 'tao');
        case 'hasEquip': return Object.values(player.equips).some(Boolean);
        case 'noEquip': return !Object.values(player.equips).some(Boolean);
        case 'inRange': return g.aliveOthers(player).some(p => g.canTargetSha(player, p));
        case 'turnCount': return g.round >= (cond.params.value || 1);
        case 'aliveCount': return g.alivePlayers().length <= (cond.params.value || 8);
        case 'identityIs': return player.identity === cond.params.value;
        case 'hasMark': return (this.marks[player.seat]?.[cond.params.mark] || 0) > 0;
        case 'hpPercent': return (player.hp / player.maxHp * 100) < (cond.params.value || 100);
        default: return true;
      }
    }

    async payCost(player, costType) {
      const g = this.game;
      switch (costType) {
        case 'hp':
          if (player.hp < 1) return false;
          await g.loseHp(player, 1);
          return player.alive;
        case 'card':
          if (!player.hand.length) return false;
          const card = g.randomHand(player);
          g.loseCards(player, [card]);
          g.toDiscard([card]);
          g.log(`${player.name} 弃置一张手牌作为【${player.customSkills[0]?.name}】的消耗`);
          return true;
        case 'equip':
          const slots = Object.entries(player.equips).filter(([, v]) => v);
          if (!slots.length) return false;
          const [slot] = slots[0];
          await g.removeEquip(player, slot);
          return true;
        case 'flip':
          player.flipped = !player.flipped;
          g.log(`${player.name} ${player.flipped ? '翻至背面' : '翻回正面'}`);
          return true;
        default: return true;
      }
    }

    async executeEffect(player, effect, ctx) {
      const g = this.game;
      const p = effect.params || {};
      const target = ctx.target;

      switch (effect.type) {
        case 'drawCards':
          await g.drawCards(player, p.value || 1);
          break;
        case 'discardCards':
          if (player.hand.length) {
            const cnt = Math.min(p.value || 1, player.hand.length);
            const cards = [];
            for (let i = 0; i < cnt; i++) cards.push(g.randomHand(player));
            g.loseCards(player, cards);
            g.toDiscard(cards);
            g.log(`${player.name} 弃置了 ${cnt} 张牌`);
          }
          break;
        case 'damage':
          if (target && target.alive) {
            await g.damage(player, target, p.value || 1, { skill: 'custom' });
          }
          break;
        case 'recover':
          await g.recover(player, p.value || 1, player);
          break;
        case 'recoverTarget':
          if (target && target.alive) await g.recover(target, p.value || 1, player);
          break;
        case 'gainCard':
          if (target && g.cardCountOf(target) > 0) {
            const card = await g.chooseCardOf(player, target, `获得 ${target.name} 的一张牌`);
            if (card) { g.gain(player, [card]); g.log(`${player.name} 获得了 ${target.name} 的一张牌`); }
          }
          break;
        case 'discardTarget':
          if (target && g.cardCountOf(target) > 0) {
            const card = await g.chooseCardOf(player, target, `弃置 ${target.name} 的一张牌`);
            if (card) { g.toDiscard([card]); g.log(`${target.name} 的一张牌被弃置`); }
          }
          break;
        case 'discardTargetMulti':
          if (target) {
            for (let i = 0; i < (p.value || 1) && g.cardCountOf(target) > 0; i++) {
              const card = await g.chooseCardOf(player, target, `弃置 ${target.name} 的第${i + 1}张牌`);
              if (card) g.toDiscard([card]);
            }
          }
          break;
        case 'skipPhase':
          player.turnFlags['skip_' + (p.phase || 'play')] = true;
          g.log(`${player.name} 跳过了${{ draw: '摸牌', play: '出牌', discard: '弃牌' }[p.phase] || p.phase}阶段`);
          break;
        case 'extraSha':
          player.turnFlags.extraSha = (player.turnFlags.extraSha || 0) + (p.value || 1);
          break;
        case 'addMark':
          if (!this.marks[player.seat]) this.marks[player.seat] = {};
          this.marks[player.seat][p.mark || 'mark'] = (this.marks[player.seat][p.mark || 'mark'] || 0) + (p.value || 1);
          g.log(`${player.name} 获得 ${p.value || 1} 枚【${p.mark || 'mark'}】标记`);
          break;
        case 'removeMark':
          if (this.marks[player.seat]) {
            this.marks[player.seat][p.mark || 'mark'] = Math.max(0, (this.marks[player.seat][p.mark || 'mark'] || 0) - (p.value || 1));
          }
          break;
        case 'changeHpMax':
          player.maxHp = Math.max(1, player.maxHp + (p.value || 0));
          player.hp = Math.min(player.hp, player.maxHp);
          g.log(`${player.name} 的体力上限${p.value > 0 ? '+' : ''}${p.value}`);
          break;
        case 'peekTop':
          const cards = g.deck.slice(0, p.value || 3);
          g.broadcastEvent({ type: 'peek', cards: cards.map(g.publicCard) });
          break;
        case 'revealHand':
          if (target) {
            g.broadcastEvent({ type: 'revealHand', seat: target.seat, cards: target.hand.map(g.publicCard) });
          }
          break;
        case 'stealCard':
          if (target && g.cardCountOf(target) > 0) {
            const card = await g.chooseCardOf(player, target, `获得 ${target.name} 区域内的一张牌`);
            if (card) g.gain(player, [card]);
          }
          break;
        case 'damageAll':
          for (const t of g.aliveOthers(player)) {
            await g.damage(player, t, p.value || 1, { skill: 'custom' });
          }
          break;
        case 'healAll':
          for (const t of g.alivePlayers()) {
            await g.recover(t, p.value || 1, player);
          }
          break;
        case 'drawForAll':
          for (const t of g.alivePlayers()) {
            await g.drawCards(t, p.value || 1);
          }
          break;
        case 'discardAll':
          for (const t of g.aliveOthers(player)) {
            if (t.hand.length) {
              const card = g.randomHand(t);
              g.loseCards(t, [card]);
              g.toDiscard([card]);
            }
          }
          break;
        case 'reduceDamage':
          ctx.reduced = (ctx.reduced || 0) + (p.value || 1);
          break;
        case 'reflectDamage':
          if (ctx.source && ctx.source.alive) {
            await g.damage(player, ctx.source, p.value || 1, { skill: 'custom' });
          }
          break;
        case 'lock':
          if (target) {
            target.turnFlags.locked = (p.value || 1);
            g.log(`${target.name} 被锁定 ${p.value || 1} 回合`);
          }
          break;
        case 'extraPhase':
          player.turnFlags['extra_' + (p.phase || 'play')] = true;
          break;
        case 'immunity':
          ctx.immune = ctx.immune || [];
          ctx.immune.push(p.type || 'damage');
          break;
        case 'swapHand':
          if (target) {
            const myHand = [...player.hand];
            const theirHand = [...target.hand];
            player.hand = theirHand;
            target.hand = myHand;
            g.log(`${player.name} 与 ${target.name} 交换了手牌`);
          }
          break;
        case 'copySkill':
          // 简化：临时获得一个标记
          if (target) {
            player.turnFlags.copiedSkill = target.generalId;
            g.log(`${player.name} 复制了 ${target.name} 的技能`);
          }
          break;
      }
    }

    // 重置回合标记
    resetTurn(seat) {
      Object.keys(this.flags).forEach(k => {
        if (k.startsWith(seat + ':') && k.endsWith(':turn')) this.flags[k] = false;
      });
    }

    // 获取标记数
    getMarks(seat, mark) {
      return this.marks[seat]?.[mark] || 0;
    }
  }

  window.CustomSkillEngine = CustomSkillEngine;
})();
