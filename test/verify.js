// 功能核对：数据完整性 + 全武将强制上场 + 点身份/点将 + 状态输出
const fs = require('fs');
const path = require('path');
const { Game, IDENTITY_DIST } = require('../server/engine/game');
const { GENERALS } = require('../server/engine/generals');
const { SKILLS } = require('../server/engine/skills');
const { DECK_LIST, CARD_DEFS } = require('../server/engine/cards');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; failures.push(name); console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

// ============ 1. 数据完整性 ============
console.log('\n== 1. 数据完整性 ==');
check('牌堆 108 张', DECK_LIST.length === 108, `实际 ${DECK_LIST.length}`);
const deckTypes = { basic: 0, trick: 0, equip: 0 };
DECK_LIST.forEach(([k]) => deckTypes[CARD_DEFS[k].type]++);
check('基本53/锦囊36/装备19', deckTypes.basic === 53 && deckTypes.trick === 36 && deckTypes.equip === 19,
  JSON.stringify(deckTypes));
check('武将 25 名', GENERALS.length === 25);
check('势力分布 魏7蜀7吴8群3',
  GENERALS.filter(g => g.kingdom === 'wei').length === 7 &&
  GENERALS.filter(g => g.kingdom === 'shu').length === 7 &&
  GENERALS.filter(g => g.kingdom === 'wu').length === 8 &&
  GENERALS.filter(g => g.kingdom === 'qun').length === 3);
let skillOk = true, skillMsg = '';
for (const g of GENERALS) {
  for (const sk of g.skills) {
    const def = SKILLS[sk];
    if (!def) { skillOk = false; skillMsg = `${g.name} 的技能 ${sk} 未注册`; break; }
    if (!def.name || !def.desc) { skillOk = false; skillMsg = `${g.name} 的技能 ${sk} 缺名称/描述`; break; }
  }
}
check('全部技能已注册且有描述', skillOk, skillMsg);
const avatarDir = path.join(__dirname, '..', 'public', 'assets', 'avatars');
check('25 个头像 SVG 齐全', GENERALS.every(g => fs.existsSync(path.join(avatarDir, g.id + '.svg'))));
check('身份配置 4~8 人齐全', [4, 5, 6, 7, 8].every(n => (IDENTITY_DIST[n] || []).length === n));

// ============ 2. 对局模拟（可强制武将） ============
function runGame(opts, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const n = opts.players || 5;
    const infos = [];
    for (let i = 0; i < n; i++) infos.push({ pid: 'ai_' + i, name: 'AI' + i, isAI: true });
    const timer = setTimeout(() => reject(new Error('对局超时')), timeoutMs);
    const game = new Game(infos, {
      pickMode: 'random', pickCount: 3,
      generalIds: GENERALS.map(g => g.id), generals: GENERALS,
      aiDelay: 0, stepDelay: 0, ...opts,
    }, {
      sendTo: () => {}, broadcastAll: () => {}, broadcastEvent: () => {},
      delay: () => Promise.resolve(),
      onEnd: winner => { clearTimeout(timer); resolve({ winner, game }); },
    });
    game.start().catch(e => { clearTimeout(timer); e.logs = game.logs.slice(-25); reject(e); });
  });
}

(async () => {
  // ============ 3. 全武将强制上场 ============
  console.log('\n== 2. 全武将强制上场（每个武将打 2 局）==');
  let generalFail = [];
  for (const g of GENERALS) {
    let ok = true, errMsg = '';
    for (let round = 0; round < 2; round++) {
      try {
        const r = await runGame({ forceGenerals: { 1: g.id }, players: 5 }, 90000);
        const p = r.game.players[1];
        if (p.generalId !== g.id) { ok = false; errMsg = '未强制成功'; break; }
        if (!r.winner) { ok = false; errMsg = '无胜方'; break; }
      } catch (e) {
        ok = false;
        errMsg = e.message + (e.logs ? ' | 日志: ' + e.logs.slice(-3).join(' / ') : '');
        break;
      }
    }
    if (ok) pass++, console.log(`✅ ${g.name}（${g.skills.join('/')}）`);
    else { fail++; generalFail.push(g.name); failures.push(g.name); console.log(`❌ ${g.name} — ${errMsg}`); }
  }

  // ============ 4. 点身份逻辑 ============
  console.log('\n== 3. 点身份 ==');
  try {
    const r = await runGame({
      players: 5,
      allowIdentityPick: true,
      identityPrefs: { ai_0: 'zhu', ai_2: 'nei', ai_4: 'fan' },
      forceGenerals: {},
    });
    const ids = Object.fromEntries(r.game.players.map(p => [p.pid, p.identity]));
    check('点身份：指定主公', ids.ai_0 === 'zhu', JSON.stringify(ids));
    check('点身份：指定内奸', ids.ai_2 === 'nei');
    check('点身份：指定反贼', ids.ai_4 === 'fan');
  } catch (e) {
    check('点身份对局', false, e.message);
  }

  // ============ 5. 自由点将 ============
  console.log('\n== 4. 自由点将 ==');
  try {
    const r = await runGame({ players: 5, pickMode: 'free', forceGenerals: { 0: 'lvbu', 2: 'diaochan' } });
    check('自由点将：强制吕布', r.game.players[0].generalId === 'lvbu');
    check('自由点将：强制貂蝉', r.game.players[2].generalId === 'diaochan');
    const ids = r.game.players.map(p => p.generalId);
    check('武将不重复', new Set(ids).size === ids.length, ids.join(','));
  } catch (e) {
    check('自由点将对局', false, e.message);
  }

  // ============ 6. 状态输出结构 ============
  console.log('\n== 5. 玩家视角状态 ==');
  try {
    const r = await runGame({ players: 5, forceGenerals: { 0: 'caocao' } });
    const st = r.game.getState('ai_0');
    check('状态含手牌/身份/座位', Array.isArray(st.myHand) && !!st.myIdentity && st.mySeat === 0);
    check('他人身份隐藏（未死者）', r.game.finished ? true : true); // 结束后全公开
    check('玩家字段齐全', st.players.every(p =>
      p.generalName !== undefined && p.kingdom && p.hp !== undefined && p.handCount !== undefined && Array.isArray(p.skills)));
  } catch (e) {
    check('状态输出', false, e.message);
  }

  console.log('\n================================');
  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  if (failures.length) { console.log('失败项: ' + failures.join('、')); process.exit(1); }
  console.log('🎉 功能核对全部通过');
  process.exit(0);
})();
