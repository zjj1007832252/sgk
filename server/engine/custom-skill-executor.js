// 服务端自定义技能执行引擎
class CustomSkillExecutor {
  constructor(game) {
    this.game = game;
    this.marks = {};
    this.executed = {};
    this.turnFlags = {};
  }

  async checkAndExecute(player, trigger, ctx = {}) {
    const skills = player.customSkills || [];
    for (const sk of skills) {
      if (!sk.enabled) continue;
      if (sk.trigger !== trigger) continue;
      if (sk.limitation === 'oncePerGame' && this.executed[`${player.seat}:${sk.id}`]) continue;
      if (sk.limitation === 'oncePerTurn' && this.turnFlags[`${player.seat}:${sk.id}`]) continue;
      if (!this.checkCondition(player, sk.condition, ctx)) continue;

      const g = this.game;
      g.log(`${player.name} 发动【${sk.name}】`);

      if (sk.cost) {
        const paid = await this.payCost(player, sk.cost);
        if (!paid) continue;
      }

      for (const effect of sk.effects) {
        await this.executeEffect(player, effect, ctx);
      }

      if (sk.limitation === 'oncePerGame') this.executed[`${player.seat}:${sk.id}`] = true;
      if (sk.limitation === 'oncePerTurn') this.turnFlags[`${player.seat}:${sk.id}`] = true;
    }
  }

  checkCondition(player, cond, ctx) {
    if (!cond || cond.type === 'always') return true;
    const g = this.game;
    const p = cond.params || {};
    switch (cond.type) {
      case 'hpLessThan': return player.hp < (p.value || 99);
      case 'hpMoreThan': return player.hp > (p.value || 0);
      case 'handLessThan': return player.hand.length < (p.value || 99);
      case 'handMoreThan': return player.hand.length > (p.value || 0);
      case 'hasSha': return player.hand.some(c => c.key === 'sha');
      case 'hasShan': return player.hand.some(c => c.key === 'shan');
      case 'hasTao': return player.hand.some(c => c.key === 'tao');
      case 'hasEquip': return Object.values(player.equips).some(Boolean);
      case 'noEquip': return !Object.values(player.equips).some(Boolean);
      case 'inRange': return g.aliveOthers(player).some(t => g.canTargetSha(player, t));
      case 'turnCount': return g.round >= (p.value || 1);
      case 'aliveCount': return g.alivePlayers().length <= (p.value || 8);
      case 'identityIs': return player.identity === p.value;
      case 'hasMark': return (this.marks[player.seat]?.[p.mark] || 0) > 0;
      case 'hpPercent': return (player.hp / player.maxHp * 100) < (p.value || 100);
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
      case 'card': {
        if (!player.hand.length) return false;
        const card = g.randomHand(player);
        g.loseCards(player, [card]);
        g.toDiscard([card]);
        return true;
      }
      case 'equip': {
        const slots = Object.entries(player.equips).filter(([, v]) => v);
        if (!slots.length) return false;
        await g.removeEquip(player, slots[0][0]);
        return true;
      }
      case 'flip':
        player.flipped = !player.flipped;
        return true;
      default: return true;
    }
  }

  async executeEffect(player, effect, ctx) {
    const g = this.game;
    const p = effect.params || {};
    const target = ctx.target;

    switch (effect.type) {
      case 'drawCards': await g.drawCards(player, p.value || 1); break;
      case 'discardCards': {
        if (player.hand.length) {
          const cnt = Math.min(p.value || 1, player.hand.length);
          const cards = [];
          for (let i = 0; i < cnt; i++) cards.push(g.randomHand(player));
          g.loseCards(player, cards);
          g.toDiscard(cards);
        }
        break;
      }
      case 'damage':
        if (target && target.alive) await g.damage(player, target, p.value || 1, { skill: 'custom' });
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
          if (card) g.gain(player, [card]);
        }
        break;
      case 'discardTarget':
        if (target && g.cardCountOf(target) > 0) {
          const card = await g.chooseCardOf(player, target, `弃置 ${target.name} 的一张牌`);
          if (card) g.toDiscard([card]);
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
        break;
      case 'extraSha':
        player.turnFlags.extraSha = (player.turnFlags.extraSha || 0) + (p.value || 1);
        break;
      case 'addMark':
        if (!this.marks[player.seat]) this.marks[player.seat] = {};
        this.marks[player.seat][p.mark || 'mark'] = (this.marks[player.seat][p.mark || 'mark'] || 0) + (p.value || 1);
        break;
      case 'removeMark':
        if (this.marks[player.seat]) {
          this.marks[player.seat][p.mark || 'mark'] = Math.max(0, (this.marks[player.seat][p.mark || 'mark'] || 0) - (p.value || 1));
        }
        break;
      case 'changeHpMax':
        player.maxHp = Math.max(1, player.maxHp + (p.value || 0));
        player.hp = Math.min(player.hp, player.maxHp);
        break;
      case 'peekTop':
        g.broadcastEvent({ type: 'peek', cards: g.deck.slice(0, p.value || 3).map(g.publicCard) });
        break;
      case 'revealHand':
        if (target) g.broadcastEvent({ type: 'revealHand', seat: target.seat, cards: target.hand.map(g.publicCard) });
        break;
      case 'stealCard':
        if (target && g.cardCountOf(target) > 0) {
          const card = await g.chooseCardOf(player, target, `获得 ${target.name} 的一张牌`);
          if (card) g.gain(player, [card]);
        }
        break;
      case 'damageAll':
        for (const t of g.aliveOthers(player)) await g.damage(player, t, p.value || 1, { skill: 'custom' });
        break;
      case 'healAll':
        for (const t of g.alivePlayers()) await g.recover(t, p.value || 1, player);
        break;
      case 'drawForAll':
        for (const t of g.alivePlayers()) await g.drawCards(t, p.value || 1);
        break;
      case 'discardAll':
        for (const t of g.aliveOthers(player)) {
          if (t.hand.length) { const c = g.randomHand(t); g.loseCards(t, [c]); g.toDiscard([c]); }
        }
        break;
      case 'reduceDamage':
        if (ctx) ctx.damage = Math.max(0, (ctx.damage || 1) - (p.value || 1));
        break;
      case 'reflectDamage':
        if (ctx && ctx.source && ctx.source.alive) await g.damage(player, ctx.source, p.value || 1, { skill: 'custom' });
        break;
      case 'lock':
        if (target) target.turnFlags.locked = (p.value || 1);
        break;
      case 'extraPhase':
        player.turnFlags['extra_' + (p.phase || 'play')] = true;
        break;
      case 'immunity':
        if (ctx) { ctx.immune = ctx.immune || []; ctx.immune.push(p.type || 'damage'); }
        break;
      case 'swapHand':
        if (target) {
          const tmp = [...player.hand];
          player.hand = [...target.hand];
          target.hand = tmp;
        }
        break;
    }
  }

  resetTurn(seat) {
    Object.keys(this.turnFlags).forEach(k => {
      if (k.startsWith(seat + ':')) this.turnFlags[k] = false;
    });
  }
}

module.exports = { CustomSkillExecutor };
