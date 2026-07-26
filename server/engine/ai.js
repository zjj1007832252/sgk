// 简单 AI：按身份行事的基础策略
const { cardColor } = require('./cards');

const GENERAL_TIER = [
  'lvbu', 'zhangliao', 'zhenji', 'huangyueying', 'sunquan', 'guojia', 'diaochan',
  'zhaoyun', 'machao', 'ganning', 'huatuo', 'zhouyu', 'simayi', 'sunshangxiang',
  'guanyu', 'caocao', 'liubei', 'zhangfei', 'xiahoudun', 'xuchu', 'luxun',
  'daqiao', 'lvmeng', 'huanggai', 'zhugeliang',
];

function hostility(game, fromPid, toPid) {
  return ((game.hostility[fromPid] || {})[toPid]) || 0;
}
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** 敌人列表 */
function enemiesOf(game, p) {
  const others = game.aliveOthers(p);
  const zhu = game.players.find(x => x.identity === 'zhu');
  switch (p.identity) {
    case 'fan': {
      const list = others.filter(o => o === zhu);
      // 打过反贼的也算敌人
      for (const o of others) {
        if (o !== zhu && game.players.some(f => f.identity === 'fan' && hostility(game, o.pid, f.pid) > 0)) list.push(o);
      }
      return list;
    }
    case 'zhong': {
      const list = others.filter(o => hostility(game, o.pid, zhu.pid) > 0 || hostility(game, o.pid, p.pid) > 0);
      if (list.length) return list;
      return others.filter(o => o !== zhu);
    }
    case 'zhu': {
      const list = others.filter(o => hostility(game, o.pid, p.pid) > 0);
      if (list.length) return list;
      if (game.round >= 2) return others.slice();
      return [];
    }
    case 'nei': {
      const fans = others.filter(o => o.identity === 'fan' || o.deadFans !== undefined);
      const fanAlive = others.filter(o => hostility(game, o.pid, zhu.pid) > 0);
      if (fanAlive.length) return fanAlive;
      const nonZhu = others.filter(o => o !== zhu);
      if (nonZhu.length) return nonZhu;
      return others.slice();
    }
  }
  return [];
}

/** 盟友列表（会施救/给牌） */
function alliesOf(game, p) {
  const others = game.aliveOthers(p);
  const zhu = game.players.find(x => x.identity === 'zhu');
  switch (p.identity) {
    case 'zhong': return zhu && zhu.alive ? [zhu] : [];
    case 'fan': return others.filter(o => o !== zhu && hostility(game, o.pid, zhu.pid) > 0);
    case 'nei': {
      const fansGone = !game.players.some(x => x.identity === 'fan' && x.alive);
      return fansGone ? [] : (zhu && zhu.alive && zhu.hp <= 2 ? [zhu] : []);
    }
    default: return [];
  }
}

function cardValue(card, p) {
  switch (card.key) {
    case 'tao': return 9;
    case 'sha': return 7;
    case 'shan': return 6;
    case 'wuxie': return 6;
    case 'wuzhong': return 7;
    case 'shunshou': return 6;
    case 'guohe': return 5;
    case 'lebu': return 5;
    case 'juedou': return 4;
    case 'nanman': case 'wanjian': return 4;
    case 'taoyuan': return 3;
    case 'wugu': return 3;
    case 'jiedao': return 3;
    case 'shandian': return 1;
    default:
      if (card.type === 'equip') {
        if (card.subtype === 'armor') return 7;
        if (card.subtype === 'weapon') return 5 + (card.range || 1);
        return 3;
      }
      return 2;
  }
}

function junkCards(game, p, keepCount = 0) {
  // 低价值牌（保留杀闪桃各一）
  const sorted = p.hand.slice().sort((a, b) => cardValue(a, p) - cardValue(b, p));
  return sorted.slice(0, Math.max(0, sorted.length - keepCount));
}

function bestEnemy(game, p, candidates) {
  const enemies = enemiesOf(game, p).filter(e => candidates.includes(e));
  const pool = enemies.length ? enemies : [];
  if (!pool.length) return null;
  pool.sort((a, b) => (a.hp - b.hp) || (a.hand.length - b.hand.length));
  return pool[0];
}

// ==================== 出牌阶段 ====================
function decidePlay(game, p, prompt) {
  const hand = p.hand;
  const enemies = enemiesOf(game, p);
  const allies = alliesOf(game, p);
  const junk = () => junkCards(game, p).sort((a, b) => cardValue(a, p) - cardValue(b, p));

  // 0. 濒死边缘先吃桃
  if (p.hp <= 2 && p.hp < p.maxHp) {
    const tao = hand.find(c => c.key === 'tao');
    if (tao) return { action: 'playCard', cardIds: [tao.uid], targets: [] };
  }
  // 1. 苦肉
  if (p.skills.includes('kurou') && (p.hp >= 3 || (p.hp === 2 && hand.some(c => c.key === 'tao')))) {
    return { action: 'skill', skill: 'kurou', cardIds: [], targets: [] };
  }
  // 2. 装备
  for (const c of hand.filter(c => c.type === 'equip')) {
    const cur = p.equips[c.subtype];
    if (!cur || (c.subtype === 'weapon' && (c.range || 1) > (cur.range || 1))) {
      return { action: 'playCard', cardIds: [c.uid], targets: [] };
    }
  }
  // 3. 无中生有
  const wuzhong = hand.find(c => c.key === 'wuzhong');
  if (wuzhong) return { action: 'playCard', cardIds: [wuzhong.uid], targets: [] };
  // 4. 结姻
  if (p.skills.includes('jieyin') && !p.turnFlags.jieyin) {
    const target = [p, ...allies].find(x => x.gender === 'm' && x.alive && x.hp < x.maxHp) ||
      (p.hp < p.maxHp ? allies.find(x => x.gender === 'm') : null);
    const maleAlly = allies.find(x => x.gender === 'm' && x.hp < x.maxHp);
    const t = maleAlly || null;
    const jk = junk();
    if (t && jk.length >= 2) return { action: 'skill', skill: 'jieyin', cardIds: jk.slice(0, 2).map(c => c.uid), targets: [t.seat] };
  }
  // 5. 青囊
  if (p.skills.includes('qingnang') && !p.turnFlags.qingnang) {
    const t = [p, ...allies].find(x => x.alive && x.hp < x.maxHp);
    const jk = junk();
    if (t && jk.length >= 1) return { action: 'skill', skill: 'qingnang', cardIds: [jk[0].uid], targets: [t.seat] };
  }
  // 6. 乐不思蜀（含国色）
  const enemyNoLebu = bestEnemy(game, p, enemies.filter(e => !e.judgeZone.some(c => c.key === 'lebu') && !e.skills.includes('qianxun')));
  if (enemyNoLebu) {
    const lebu = hand.find(c => c.key === 'lebu');
    if (lebu) return { action: 'playCard', cardIds: [lebu.uid], targets: [enemyNoLebu.seat] };
    if (p.skills.includes('guose')) {
      const dia = hand.find(c => c.suit === 'diamond');
      if (dia) return { action: 'playCard', cardIds: [dia.uid], as: 'lebu', targets: [enemyNoLebu.seat] };
    }
  }
  // 7. 过河拆桥（含奇袭）：拆敌人装备/手牌
  const chaiTarget = bestEnemy(game, p, enemies.filter(e => game.cardCountOf(e) > 0));
  if (chaiTarget) {
    const guohe = hand.find(c => c.key === 'guohe');
    if (guohe) return { action: 'playCard', cardIds: [guohe.uid], targets: [chaiTarget.seat] };
    if (p.skills.includes('qixi')) {
      const black = hand.filter(c => cardColor(c) === 'black' && c.key !== 'sha').sort((a, b) => cardValue(a, p) - cardValue(b, p))[0];
      if (black) return { action: 'playCard', cardIds: [black.uid], as: 'guohe', targets: [chaiTarget.seat] };
    }
  }
  // 8. 顺手牵羊
  const shunTarget = bestEnemy(game, p, enemies.filter(e => game.cardCountOf(e) > 0 && !e.skills.includes('qianxun') &&
    (p.skills.includes('qicai') || game.distance(p, e) <= 1)));
  if (shunTarget) {
    const shun = hand.find(c => c.key === 'shunshou');
    if (shun) return { action: 'playCard', cardIds: [shun.uid], targets: [shunTarget.seat] };
  }
  // 9. AOE
  const otherEnemies = enemies.filter(e => e.alive).length;
  const otherAllies = game.aliveOthers(p).length - otherEnemies;
  if (otherEnemies > otherAllies) {
    const aoe = hand.find(c => c.key === 'nanman' || c.key === 'wanjian');
    if (aoe) return { action: 'playCard', cardIds: [aoe.uid], targets: [] };
  }
  // 10. 桃园
  const woundedAllies = [p, ...allies].filter(x => x.hp < x.maxHp).length;
  const woundedEnemies = enemies.filter(x => x.hp < x.maxHp).length;
  if (woundedAllies > woundedEnemies) {
    const taoyuan = hand.find(c => c.key === 'taoyuan');
    if (taoyuan) return { action: 'playCard', cardIds: [taoyuan.uid], targets: [] };
  }
  // 11. 五谷
  if (allies.length >= enemies.length) {
    const wugu = hand.find(c => c.key === 'wugu');
    if (wugu && game.alivePlayers().length >= 4) return { action: 'playCard', cardIds: [wugu.uid], targets: [] };
  }
  // 12. 离间
  if (p.skills.includes('lijian') && !p.turnFlags.lijian) {
    const males = enemies.filter(e => e.gender === 'm');
    const jk = junk();
    if (males.length >= 2 && jk.length >= 1) {
      return { action: 'skill', skill: 'lijian', cardIds: [jk[0].uid], targets: [males[0].seat, males[1].seat] };
    }
  }
  // 13. 借刀杀人
  const holder = enemies.find(e => e.equips.weapon);
  if (holder) {
    const victim = enemies.find(e => e !== holder && game.distance(holder, e) <= game.attackRange(holder) && !(e.skills.includes('kongcheng') && !e.hand.length));
    const jd = hand.find(c => c.key === 'jiedao');
    if (victim && jd) return { action: 'playCard', cardIds: [jd.uid], targets: [holder.seat, victim.seat] };
  }
  // 14. 决斗
  const shaCount = hand.filter(c => c.key === 'sha').length;
  const duelTarget = bestEnemy(game, p, enemies.filter(e => !(e.skills.includes('kongcheng') && !e.hand.length) && (e.hand.length <= shaCount || e.hp <= 1)));
  if (duelTarget) {
    const jd = hand.find(c => c.key === 'juedou');
    if (jd) return { action: 'playCard', cardIds: [jd.uid], targets: [duelTarget.seat] };
  }
  // 15. 反间
  if (p.skills.includes('fanjian') && !p.turnFlags.fanjian && hand.length) {
    const t = bestEnemy(game, p, enemies);
    if (t) return { action: 'skill', skill: 'fanjian', cardIds: [], targets: [t.seat] };
  }
  // 16. 杀（含转化）
  if (game.canPlaySha(p)) {
    const targets = game.playableShaTargets(p);
    const t = bestEnemy(game, p, targets);
    if (t) {
      const sha = hand.find(c => c.key === 'sha');
      if (sha) return { action: 'playCard', cardIds: [sha.uid], targets: [t.seat] };
      if (p.skills.includes('wusheng')) {
        const red = junk().find(c => cardColor(c) === 'red');
        if (red) return { action: 'playCard', cardIds: [red.uid], as: 'sha', targets: [t.seat] };
      }
      if (p.skills.includes('longdan')) {
        const shan = hand.find(c => c.key === 'shan');
        if (shan && hand.filter(c => c.key === 'shan').length > 1) {
          return { action: 'playCard', cardIds: [shan.uid], as: 'sha', targets: [t.seat] };
        }
      }
      if (p.equips.weapon && p.equips.weapon.key === 'zhangba' && hand.length >= 2) {
        const jk = junk();
        if (jk.length >= 2) return { action: 'playCard', cardIds: jk.slice(0, 2).map(c => c.uid), as: 'sha', targets: [t.seat] };
      }
      if (p.skills.includes('jijiang') && p.identity === 'zhu' && game.aliveOthers(p).some(x => x.kingdom === 'shu')) {
        return { action: 'skill', skill: 'jijiang', cardIds: [], targets: [t.seat] };
      }
    }
  }
  // 17. 制衡
  if (p.skills.includes('zhiheng') && !p.turnFlags.zhiheng) {
    const jk = junk().filter(c => c.key !== 'sha' && c.key !== 'shan' && c.key !== 'tao');
    if (jk.length >= 2) return { action: 'skill', skill: 'zhiheng', cardIds: jk.map(c => c.uid), targets: [] };
  }
  // 18. 仁德
  if (p.skills.includes('rende')) {
    const woundedAlly = allies.filter(a => a.hp < a.maxHp).sort((a, b) => a.hp - b.hp)[0];
    const jk = junk();
    if (woundedAlly && jk.length >= 2 && (p.hp < p.maxHp || jk.length >= 3)) {
      return { action: 'skill', skill: 'rende', cardIds: jk.slice(0, 2).map(c => c.uid), targets: [woundedAlly.seat] };
    }
  }
  // 19. 闪电
  if (enemies.length > allies.length && !p.judgeZone.some(c => c.key === 'shandian')) {
    const sd = hand.find(c => c.key === 'shandian');
    if (sd && p.hp >= 3) return { action: 'playCard', cardIds: [sd.uid], targets: [] };
  }
  return { action: 'end' };
}

// ==================== 响应 ====================
function decideRespond(game, p, prompt) {
  const need = prompt.need;
  if (need === 'wuxie') {
    // 只保护自己/盟友的关键时刻
    const title = prompt.title || '';
    const aboutMe = title.includes(p.name) || title.includes('乐不思蜀') || title.includes('闪电');
    const protect = (title.includes('乐不思蜀') && title.includes(p.name)) ||
      (title.includes('闪电') && title.includes(p.name)) ||
      ((title.includes('南蛮') || title.includes('万箭')) && p.hp <= 2);
    const allies = alliesOf(game, p);
    const aboutAlly = allies.some(a => title.includes(a.name) && a.hp <= 2);
    if (protect || aboutAlly) {
      const wx = p.hand.find(c => c.key === 'wuxie');
      if (wx) return { cardIds: [wx.uid] };
    }
    return { pass: true };
  }
  const options = prompt.options || [];
  if (!options.length) {
    // 八卦阵：没闪时用
    if (prompt.bagua && (p.hp <= 2 || Math.random() < 0.7)) return { skill: 'bagua' };
    return { pass: true };
  }
  if (need === 'shan') {
    // 基本总是闪；队友的AOE血量高可不闪…简单：闪
    const opt = options.find(o => o.cardIds);
    if (opt) return { cardIds: opt.cardIds };
    if (prompt.bagua) return { skill: 'bagua' };
    return { pass: true };
  }
  if (need === 'sha') {
    const opt = options.find(o => o.cardIds);
    if (opt) return { cardIds: opt.cardIds };
    if (prompt.jijiang) return { skill: 'jijiang' };
    return { pass: true };
  }
  if (need === 'tao') {
    const title = prompt.title || '';
    // 自救
    if (title.includes(p.name) || prompt.dying === p.seat) {
      const opt = options.find(o => o.cardIds);
      if (opt) return { cardIds: opt.cardIds };
      return { pass: true };
    }
    // 救盟友
    const allies = alliesOf(game, p);
    if (allies.some(a => prompt.dying === a.seat || title.includes(a.name))) {
      const opt = options.find(o => o.cardIds);
      if (opt) return { cardIds: opt.cardIds };
    }
    return { pass: true };
  }
  return { pass: true };
}

// ==================== 其它询问 ====================
function decideConfirm(game, p, prompt) {
  const t = prompt.title || '';
  const sk = prompt.skill;
  switch (sk) {
    case 'jianxiong': case 'fankui': case 'yiji': case 'luoshen': case 'guanxing':
    case 'biyue': case 'xiaoji': case 'tieji': case 'cixiong': case 'qilin':
      return { yes: true };
    case 'ganglie': {
      // 来源是敌人才刚烈
      const src = game.players[game.turnSeat];
      return { yes: true };
    }
    case 'tuxi': {
      const has = game.aliveOthers(p).some(o => o.hand.length > 0 && enemiesOf(game, p).includes(o));
      return { yes: has };
    }
    case 'luoyi': {
      return { yes: p.hand.some(c => c.key === 'sha') && game.canPlaySha(p) };
    }
    case 'hanbing': {
      const target = game.aliveOthers(p).find(o => t.includes(o.name));
      return { yes: !!target && game.cardCountOf(target) >= 2 && target.hp > 1 };
    }
    case 'guanshi': {
      return { yes: p.hand.length >= 3 };
    }
    case 'qinglong': {
      return { yes: p.hand.some(c => c.key === 'sha') };
    }
    case 'liuli': {
      return { yes: p.hand.length > 1 };
    }
    case 'bagua': return { yes: true };
    case ' kurou': return { yes: false };
    default:
      // 濒死相关确认默认同意
      if (t.includes('濒死')) return { yes: true };
      return { yes: true };
  }
}

function decideChooseOption(game, p, prompt) {
  const t = prompt.title || '';
  if (t.includes('刚烈')) {
    return { option: p.hand.length >= 3 ? 'discard' : 'damage' };
  }
  if (t.includes('雌雄双股剑')) {
    return { option: p.hand.length >= 3 ? 'discard' : 'draw' };
  }
  if (prompt.skill === 'fanjian' || t.includes('反间')) {
    return { option: rand(['spade', 'heart', 'club', 'diamond']) };
  }
  return { option: prompt.options && prompt.options[0] ? prompt.options[0].id : null };
}

function decideChoosePlayers(game, p, prompt) {
  const cands = (prompt.candidates || []).map(s => game.players[s]).filter(Boolean);
  const t = prompt.title || '';
  if (t.includes('遗计') || t.includes('仁德')) {
    const allies = alliesOf(game, p);
    const ally = cands.find(c => allies.includes(c));
    if (ally) return { targetIds: [ally.seat] };
    return { targetIds: [cands[0].seat] };
  }
  // 突袭/流离等：选敌人
  const enemies = enemiesOf(game, p).filter(e => cands.includes(e));
  const max = prompt.max || 1;
  const picked = (enemies.length ? enemies : cands).slice(0, max);
  return { targetIds: picked.map(x => x.seat) };
}

function decideChooseCards(game, p, prompt) {
  const t = prompt.title || '';
  const pool = (prompt.cards || []);
  const min = prompt.min || 0;
  const max = prompt.max || 1;
  if (min === 0 && max <= 1) {
    // 鬼才改判
    if (t.includes('鬼才')) return decideGuicai(game, p, prompt, pool);
    return { cardIds: [] };
  }
  if (t.includes('五谷丰登')) {
    const sorted = pool.slice().sort((a, b) => cardValue(b, p) - cardValue(a, p));
    return { cardIds: [sorted[0].uid] };
  }
  // 弃牌：丢低价值
  const myCards = pool.filter(c => p.hand.some(h => h.uid === c.uid));
  const sorted = myCards.sort((a, b) => cardValue(a, p) - cardValue(b, p));
  return { cardIds: sorted.slice(0, min).map(c => c.uid) };
}

function decideGuicai(game, p, prompt, pool) {
  // 只改与自己/盟友相关的判定
  const title = prompt.title || '';
  const m = title.match(/【(.+?)】(.)/);
  const judgeCardText = m ? m[1] : '';
  const suitText = m ? m[2] : '';
  const owner = game.players.find(x => title.includes(x.name + ' 的判定牌') || title.includes(x.name));
  const mine = owner === p || alliesOf(game, p).includes(owner);
  if (!mine) return { cardIds: [] };
  const handCards = pool.filter(c => p.hand.some(h => h.uid === c.uid));
  const isBad = (suit) => {
    // 判定牌对我不利的情形
    if (title.includes('乐不思蜀') && suit !== '♥') return 'heart';
    if (title.includes('闪电') && suit === '♠') return 'notspade';
    if (title.includes('八卦') && suit !== '♥' && suit !== '♦') return 'red';
    return null;
  };
  const need = isBad(suitText);
  if (!need) return { cardIds: [] };
  let swap = null;
  if (need === 'heart') swap = handCards.find(c => c.suit === 'heart');
  if (need === 'notspade') swap = handCards.find(c => !(c.suit === 'spade' && c.rank >= 2 && c.rank <= 9));
  if (need === 'red') swap = handCards.find(c => cardColor(c) === 'red');
  return swap ? { cardIds: [swap.uid] } : { cardIds: [] };
}

function decideChooseCardOf(game, p, prompt) {
  // 优先拆装备（武器/防具/马），其次手牌
  const equips = prompt.equips || [];
  if (equips.length) {
    const prio = ['armor', 'weapon', 'horse_minus', 'horse_plus'];
    equips.sort((a, b) => prio.indexOf(a.slot) - prio.indexOf(b.slot));
    return { zone: equips[0].slot, cardUid: equips[0].card.uid };
  }
  if (prompt.judge && prompt.judge.length) {
    // 拆友方乐不？简单：不碰判定区
  }
  if (prompt.handCount > 0) return { zone: 'hand' };
  if (prompt.judge && prompt.judge.length) return { zone: 'judge', cardUid: prompt.judge[0].uid };
  return { zone: 'hand' };
}

function decideArrange(game, p, prompt) {
  const cards = (prompt.cards || []).slice();
  // 判定区有乐不/闪电时优先安排判定牌
  const hasLebu = p.judgeZone.some(c => c.key === 'lebu');
  const hasShandian = p.judgeZone.some(c => c.key === 'shandian');
  const top = [], rest = [];
  for (const c of cards) {
    if (hasLebu && top.length === 0 && c.suit === 'heart') { top.push(c); continue; }
    if (hasShandian && top.length === 0 && !(c.suit === 'spade' && c.rank >= 2 && c.rank <= 9)) { top.push(c); continue; }
    rest.push(c);
  }
  // 好牌放顶
  rest.sort((a, b) => cardValue(b, p) - cardValue(a, p));
  while (top.length < 2 && rest.length) top.push(rest.shift());
  return { top: top.map(c => c.uid), bottom: rest.map(c => c.uid) };
}

function decideChooseGeneral(game, p, prompt) {
  const cands = prompt.candidates || [];
  for (const id of GENERAL_TIER) {
    const found = cands.find(c => c.id === id);
    if (found) return { generalId: found.id };
  }
  return { generalId: cands[0] ? cands[0].id : null };
}

// ==================== 入口 ====================
function decide(game, p, prompt) {
  switch (prompt.kind) {
    case 'play': return decidePlay(game, p, prompt);
    case 'respond': return decideRespond(game, p, prompt);
    case 'confirm': return decideConfirm(game, p, prompt);
    case 'chooseOption': return decideChooseOption(game, p, prompt);
    case 'choosePlayers': return decideChoosePlayers(game, p, prompt);
    case 'chooseCards': return decideChooseCards(game, p, prompt);
    case 'chooseCardOf': return decideChooseCardOf(game, p, prompt);
    case 'arrange': return decideArrange(game, p, prompt);
    case 'chooseGeneral': return decideChooseGeneral(game, p, prompt);
    default: return null;
  }
}

function fallback(game, p, prompt) {
  switch (prompt.kind) {
    case 'play': return { action: 'end' };
    case 'respond': return { pass: true };
    case 'confirm': return { yes: false };
    case 'chooseOption': return { option: prompt.options && prompt.options[0] ? prompt.options[0].id : null };
    case 'choosePlayers': return { targetIds: (prompt.candidates || []).slice(0, prompt.min || 0) };
    case 'chooseCards': return { cardIds: (prompt.cards || []).slice(0, prompt.min || 0).map(c => c.uid) };
    case 'chooseCardOf': return { zone: 'hand' };
    case 'arrange': return { top: (prompt.cards || []).map(c => c.uid), bottom: [] };
    case 'chooseGeneral': return { generalId: prompt.candidates && prompt.candidates[0] ? prompt.candidates[0].id : null };
    default: return null;
  }
}

module.exports = { decide, fallback };
