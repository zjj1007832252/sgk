// 技能注册表：元数据 + 钩子实现
// type: passive(锁定/被动) trigger(触发) active(出牌阶段主动) convert(转化) lord(主公技)
// 钩子由 game.js 引擎调用；active 技能通过 activate(game, player, payload) 触发

const SKILLS = {
  // ================= 魏 =================
  jianxiong: {
    name: '奸雄', type: 'trigger',
    desc: '当你受到伤害后，你可以获得对你造成伤害的牌。',
    async onDamaged(game, player, ctx) {
      if (!ctx.cards || !ctx.cards.length) return;
      const takeable = ctx.cards.filter(c => game.isInPlayOrDiscard(c));
      if (!takeable.length) return;
      const yes = await game.confirm(player, '奸雄', '是否发动【奸雄】获得对你造成伤害的牌？');
      if (yes) {
        game.claimCards(takeable);
        game.gain(player, takeable);
        game.log(`${player.name} 发动【奸雄】，获得 ${takeable.map(c => c.name).join('、')}`);
      }
    },
  },
  fankui: {
    name: '反馈', type: 'trigger',
    desc: '当你受到伤害后，你可以获得伤害来源的一张牌。',
    async onDamaged(game, player, ctx) {
      const src = ctx.source;
      if (!src || !src.alive || src === player) return;
      if (!game.cardCountOf(src)) return;
      const yes = await game.confirm(player, '反馈', `是否发动【反馈】获得 ${src.name} 的一张牌？`);
      if (yes) {
        const card = await game.chooseCardOf(player, src, '反馈：选择获得其一张牌');
        if (card) {
          game.gain(player, [card]);
          game.log(`${player.name} 发动【反馈】，获得 ${src.name} 的一张牌`);
        }
      }
    },
  },
  guicai: {
    name: '鬼才', type: 'trigger',
    desc: '当一名角色的判定牌生效前，你可以打出一张手牌代替之。',
    // 由 game.judge 内部调用 handleGuicai
  },
  ganglie: {
    name: '刚烈', type: 'trigger',
    desc: '当你受到伤害后，你可以判定：若结果不为红桃，伤害来源须弃置两张手牌，否则受到你造成的1点伤害。',
    async onDamaged(game, player, ctx) {
      const src = ctx.source;
      if (!src || !src.alive || src === player) return;
      const yes = await game.confirm(player, '刚烈', '是否发动【刚烈】进行判定？');
      if (!yes) return;
      const card = await game.judge(player, 'ganglie');
      if (card.suit !== 'heart') {
        game.log(`【刚烈】判定成功，${src.name} 须弃置两张手牌或受到1点伤害`);
        if (src.hand.length >= 2) {
          const opt = await game.chooseOption(src, '刚烈', '请选择：', [
            { id: 'discard', label: '弃置两张手牌' },
            { id: 'damage', label: '受到1点伤害' },
          ]);
          if (opt === 'discard') {
            const cards = await game.chooseOwnCards(src, '刚烈：选择弃置两张手牌', 2, 2, c => true);
            await game.discard(src, cards);
            return;
          }
        }
        await game.damage(player, src, 1, { skill: 'ganglie' });
      } else {
        game.log('【刚烈】判定为红桃，无事发生');
      }
    },
  },
  tuxi: {
    name: '突袭', type: 'trigger',
    desc: '摸牌阶段，你可以改为获得至多两名其他角色的各一张手牌。',
    async onDrawPhase(game, player) {
      const candidates = game.aliveOthers(player).filter(p => p.hand.length > 0);
      if (!candidates.length) return null;
      const yes = await game.confirm(player, '突袭', '是否发动【突袭】（放弃摸牌，改为获得至多两名角色各一张手牌）？');
      if (!yes) return null;
      const targets = await game.choosePlayers(player, '突袭：选择至多两名有手牌的角色', candidates, 1, 2);
      if (!targets || !targets.length) return null;
      for (const t of targets) {
        if (t.hand.length > 0) {
          const card = game.randomHand(t);
          game.loseCards(t, [card]);
          game.gain(player, [card]);
          game.log(`${player.name} 发动【突袭】，获得 ${t.name} 的一张手牌`);
        }
      }
      return 0; // 不再摸牌
    },
  },
  luoyi: {
    name: '裸衣', type: 'trigger',
    desc: '摸牌阶段，你可以少摸一张牌，然后本回合你使用【杀】或【决斗】造成的伤害+1。',
    async onDrawPhase(game, player, baseCount) {
      const yes = await game.confirm(player, '裸衣', '是否发动【裸衣】（少摸一张牌，本回合【杀】/【决斗】伤害+1）？');
      if (yes) {
        player.turnFlags.luoyi = true;
        game.log(`${player.name} 发动【裸衣】`);
        return Math.max(0, baseCount - 1);
      }
      return baseCount;
    },
  },
  tiandu: {
    name: '天妒', type: 'passive',
    desc: '当你的判定牌生效后，你可以获得之。',
    // 由 game.judge 内部处理（自动获得，锁定）
  },
  yiji: {
    name: '遗计', type: 'trigger',
    desc: '当你受到1点伤害后，你可以摸两张牌，然后可以将至多两张手牌交给其他角色。',
    async onDamaged(game, player, ctx) {
      for (let i = 0; i < ctx.damage; i++) {
        const yes = await game.confirm(player, '遗计', '是否发动【遗计】摸两张牌？');
        if (!yes) return;
        await game.drawCards(player, 2);
        if (!player.hand.length) continue;
        const give = await game.confirm(player, '遗计', '是否将手牌交给其他角色？');
        if (!give) continue;
        const others = game.aliveOthers(player);
        if (!others.length) continue;
        const cards = await game.chooseOwnCards(player, '遗计：选择要交出的手牌', 1, 2, () => true);
        if (!cards || !cards.length) continue;
        const targets = await game.choosePlayers(player, '遗计：选择交给的角色', others, 1, 1);
        if (!targets || !targets.length) continue;
        game.loseCards(player, cards);
        game.gain(targets[0], cards);
        game.log(`${player.name} 发动【遗计】，将 ${cards.length} 张牌交给 ${targets[0].name}`);
      }
    },
  },
  qingguo: {
    name: '倾国', type: 'convert',
    desc: '你可以将一张黑色手牌当【闪】使用或打出。',
    // 引擎响应逻辑处理
  },
  luoshen: {
    name: '洛神', type: 'trigger',
    desc: '回合开始阶段，你可以判定：若结果为黑色，你获得此牌并可以再次判定。',
    async onTurnPrepare(game, player) {
      const yes = await game.confirm(player, '洛神', '是否发动【洛神】？');
      if (!yes) return;
      while (true) {
        const card = await game.judge(player, 'luoshen', { keep: true });
        if (game.cardColor(card) === 'black') {
          game.gain(player, [card]);
          game.log(`${player.name} 【洛神】判定为黑色，获得此牌`);
          const again = await game.confirm(player, '洛神', '再次发动【洛神】？');
          if (!again) break;
        } else {
          game.toDiscard([card]);
          game.log(`${player.name} 【洛神】判定为红色，结束`);
          break;
        }
      }
    },
  },

  // ================= 蜀 =================
  rende: {
    name: '仁德', type: 'active',
    desc: '出牌阶段，你可以将任意张手牌交给其他角色；你每回合首次以此法给出两张或更多牌时，回复1点体力。',
    button: { needCards: '1+', needTargets: 1, targetFilter: 'other' },
    async activate(game, player, payload) {
      const cards = payload.cards;
      const target = payload.targets[0];
      if (!cards.length || !target) return false;
      game.loseCards(player, cards);
      game.gain(target, cards);
      player.turnFlags.rendeGiven = (player.turnFlags.rendeGiven || 0) + cards.length;
      game.log(`${player.name} 发动【仁德】，将 ${cards.length} 张牌交给 ${target.name}`);
      if (!player.turnFlags.rendeHealed && player.turnFlags.rendeGiven >= 2 && player.hp < player.maxHp) {
        player.turnFlags.rendeHealed = true;
        await game.recover(player, 1, player);
      }
      return true;
    },
  },
  jijiang: {
    name: '激将', type: 'lord',
    desc: '主公技。当你需要使用或打出【杀】时，你可以令其他蜀势力角色选择是否打出一张【杀】（视为由你使用或打出）。',
  },
  wusheng: {
    name: '武圣', type: 'convert',
    desc: '你可以将一张红色牌当【杀】使用或打出。',
  },
  paoxiao: {
    name: '咆哮', type: 'passive',
    desc: '锁定技。你使用【杀】无次数限制。',
  },
  guanxing: {
    name: '观星', type: 'trigger',
    desc: '回合开始阶段，你可以观看牌堆顶的X张牌（X为存活角色数且至多为5），并以任意顺序置于牌堆顶或牌堆底。',
    async onTurnPrepare(game, player) {
      const alive = game.alivePlayers().length;
      const n = Math.min(5, alive, game.deck.length);
      if (n <= 0) return;
      const yes = await game.confirm(player, '观星', `是否发动【观星】观看牌堆顶 ${n} 张牌？`);
      if (!yes) return;
      const cards = game.deck.slice(0, n);
      const ans = await game.ask(player, {
        kind: 'arrange', skill: 'guanxing',
        title: `观星：将牌放入「牌堆顶」与「牌堆底」（顶部按点击顺序从上到下）`,
        cards: cards.map(game.publicCard),
      });
      let top = [], bottom = [];
      if (ans && Array.isArray(ans.top) && Array.isArray(ans.bottom)) {
        const byUid = Object.fromEntries(cards.map(c => [c.uid, c]));
        top = ans.top.map(u => byUid[u]).filter(Boolean);
        bottom = ans.bottom.map(u => byUid[u]).filter(Boolean);
      }
      const used = new Set([...top, ...bottom].map(c => c.uid));
      const rest = cards.filter(c => !used.has(c.uid));
      top = top.concat(rest); // 未分配的默认放顶
      game.deck.splice(0, n);
      game.deck.unshift(...top);
      game.deck.push(...bottom);
      game.log(`${player.name} 发动【观星】`);
    },
  },
  kongcheng: {
    name: '空城', type: 'passive',
    desc: '锁定技。若你没有手牌，你不能成为【杀】或【决斗】的目标。',
  },
  longdan: {
    name: '龙胆', type: 'convert',
    desc: '你可以将一张【杀】当【闪】、一张【闪】当【杀】使用或打出。',
  },
  mashu: {
    name: '马术', type: 'passive',
    desc: '锁定技。你计算与其他角色的距离-1。',
  },
  tieji: {
    name: '铁骑', type: 'trigger',
    desc: '当你使用【杀】指定目标后，你可以判定：若结果为红色，此【杀】不可被【闪】响应。',
    // 引擎 useSha 内处理
  },
  jizhi: {
    name: '集智', type: 'passive',
    desc: '当你使用一张非延时类锦囊牌时，你可以摸一张牌。',
    // 引擎 resolveTrick 内处理（锁定自动摸）
  },
  qicai: {
    name: '奇才', type: 'passive',
    desc: '锁定技。你使用锦囊牌无距离限制。',
  },

  // ================= 吴 =================
  zhiheng: {
    name: '制衡', type: 'active',
    desc: '出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。',
    button: { needCards: '1+', needTargets: 0 },
    async activate(game, player, payload) {
      if (player.turnFlags.zhiheng) return false;
      const cards = payload.cards;
      if (!cards.length) return false;
      player.turnFlags.zhiheng = true;
      await game.discard(player, cards);
      await game.drawCards(player, cards.length);
      game.log(`${player.name} 发动【制衡】，弃 ${cards.length} 摸 ${cards.length}`);
      return true;
    },
  },
  jiuyuan: {
    name: '救援', type: 'lord',
    desc: '主公技。锁定技。其他吴势力角色对你使用的【桃】回复的体力+1。',
    // 引擎 recover 内处理
  },
  qixi: {
    name: '奇袭', type: 'convert',
    desc: '你可以将一张黑色牌当【过河拆桥】使用。',
    // 出牌阶段：引擎 playCard as='guohe' 处理
  },
  keji: {
    name: '克己', type: 'passive',
    desc: '若你本回合未使用或打出过【杀】，你可以跳过弃牌阶段。',
  },
  kurou: {
    name: '苦肉', type: 'active',
    desc: '出牌阶段，你可以失去1点体力，然后摸两张牌。',
    button: { needCards: 0, needTargets: 0 },
    async activate(game, player) {
      if (player.hp < 1) return false;
      game.log(`${player.name} 发动【苦肉】`);
      await game.loseHp(player, 1);
      if (player.alive) await game.drawCards(player, 2);
      return true;
    },
  },
  yingzi: {
    name: '英姿', type: 'passive',
    desc: '摸牌阶段，你可以多摸一张牌。',
    async onDrawPhase(game, player, baseCount) {
      game.log(`${player.name} 发动【英姿】，多摸一张牌`);
      return baseCount + 1;
    },
  },
  fanjian: {
    name: '反间', type: 'active',
    desc: '出牌阶段限一次，你可以令一名其他角色选择一种花色，然后获得你的一张手牌并展示之：若花色不同，你对其造成1点伤害。',
    button: { needCards: 0, needTargets: 1, targetFilter: 'other' },
    async activate(game, player, payload) {
      if (player.turnFlags.fanjian) return false;
      const target = payload.targets[0];
      if (!target || !player.hand.length) return false;
      player.turnFlags.fanjian = true;
      const suits = [
        { id: 'spade', label: '♠ 黑桃' }, { id: 'heart', label: '♥ 红桃' },
        { id: 'club', label: '♣ 梅花' }, { id: 'diamond', label: '♦ 方块' },
      ];
      const suit = await game.chooseOption(target, '反间', `${player.name} 对你发动【反间】，请选择一种花色`, suits);
      const card = game.randomHand(player);
      game.loseCards(player, [card]);
      game.gain(target, [card]);
      game.broadcastEvent({ type: 'reveal', player: player.seat, card: game.publicCard(card) });
      game.log(`${target.name} 选择了${suits.find(s => s.id === suit).label}，获得 ${player.name} 的【${card.name}】（${game.suitLabel(card.suit)}${game.rankLabel(card.rank)}）`);
      if (card.suit !== suit) {
        game.log('花色不同，【反间】造成1点伤害');
        await game.damage(player, target, 1, { skill: 'fanjian' });
      }
      return true;
    },
  },
  guose: {
    name: '国色', type: 'convert',
    desc: '你可以将一张方块牌当【乐不思蜀】使用。',
  },
  liuli: {
    name: '流离', type: 'trigger',
    desc: '当你成为【杀】的目标时，你可以弃置一张牌，将此【杀】转移给你攻击范围内的另一名其他角色。',
    // 引擎 useSha 内处理
  },
  qianxun: {
    name: '谦逊', type: 'passive',
    desc: '锁定技。你不能成为【顺手牵羊】和【乐不思蜀】的目标。',
  },
  lianying: {
    name: '连营', type: 'passive',
    desc: '当你失去最后的手牌时，你可以摸一张牌。',
    // 引擎 loseCards 后检查
  },
  jieyin: {
    name: '结姻', type: 'active',
    desc: '出牌阶段限一次，你可以弃置两张手牌并选择一名已受伤的男性角色：你与其各回复1点体力。',
    button: { needCards: 2, needTargets: 1, targetFilter: 'male_wounded' },
    async activate(game, player, payload) {
      if (player.turnFlags.jieyin) return false;
      const target = payload.targets[0];
      const cards = payload.cards;
      if (!target || cards.length !== 2) return false;
      if (target.gender !== 'm' || target.hp >= target.maxHp) return false;
      player.turnFlags.jieyin = true;
      await game.discard(player, cards);
      game.log(`${player.name} 发动【结姻】，与 ${target.name} 各回复1点体力`);
      if (player.hp < player.maxHp) await game.recover(player, 1, player);
      await game.recover(target, 1, player);
      return true;
    },
  },
  xiaoji: {
    name: '枭姬', type: 'trigger',
    desc: '当你失去装备区里的一张牌时，你可以摸两张牌。',
    async onLoseEquip(game, player, equip) {
      const yes = await game.confirm(player, '枭姬', `失去【${equip.name}】，是否发动【枭姬】摸两张牌？`);
      if (yes) await game.drawCards(player, 2);
    },
  },

  // ================= 群 =================
  jijiu: {
    name: '急救', type: 'convert',
    desc: '你的回合外，你可以将一张红色牌当【桃】使用。',
  },
  qingnang: {
    name: '青囊', type: 'active',
    desc: '出牌阶段限一次，你可以弃置一张手牌，令一名已受伤的角色回复1点体力。',
    button: { needCards: 1, needTargets: 1, targetFilter: 'wounded' },
    async activate(game, player, payload) {
      if (player.turnFlags.qingnang) return false;
      const target = payload.targets[0];
      const cards = payload.cards;
      if (!target || cards.length !== 1 || target.hp >= target.maxHp) return false;
      player.turnFlags.qingnang = true;
      await game.discard(player, cards);
      game.log(`${player.name} 发动【青囊】，令 ${target.name} 回复1点体力`);
      await game.recover(target, 1, player);
      return true;
    },
  },
  wushuang: {
    name: '无双', type: 'passive',
    desc: '锁定技。你使用【杀】需两张【闪】才能抵消；与你【决斗】的角色每次需打出两张【杀】。',
  },
  lijian: {
    name: '离间', type: 'active',
    desc: '出牌阶段限一次，你可以弃置一张牌并选择两名男性角色，视为其中一名对另一名使用【决斗】。',
    button: { needCards: 1, needTargets: 2, targetFilter: 'male' },
    async activate(game, player, payload) {
      if (player.turnFlags.lijian) return false;
      const [a, b] = payload.targets;
      const cards = payload.cards;
      if (!a || !b || cards.length !== 1) return false;
      if (a.gender !== 'm' || b.gender !== 'm') return false;
      player.turnFlags.lijian = true;
      await game.discard(player, cards);
      game.log(`${player.name} 发动【离间】，视为 ${a.name} 对 ${b.name} 使用【决斗】`);
      await game.resolveDuel(a, b, { fromSkill: true });
      return true;
    },
  },
  biyue: {
    name: '闭月', type: 'trigger',
    desc: '回合结束阶段，你可以摸一张牌。',
    async onTurnEnd(game, player) {
      const yes = await game.confirm(player, '闭月', '是否发动【闭月】摸一张牌？');
      if (yes) await game.drawCards(player, 1);
    },
  },
};

// DIY 可选技能（排除主公技）
const DIY_SKILLS = Object.entries(SKILLS)
  .filter(([, s]) => s.type !== 'lord')
  .map(([id, s]) => ({ id, name: s.name, type: s.type, desc: s.desc }));

module.exports = { SKILLS, DIY_SKILLS };
