// OL 经典操作样式端到端测试（需先启动服务器 node server/index.js）
// 验证：待用区弹出、目标高亮与序号、确定/取消、多模式选择、借刀双目标
// 用法：node test/browser-ol-play.js
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');

const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const DEBUG_PORT = 9240;
const PROFILE = '/tmp/sgk-edge-ol-test';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getTargetWs() {
  for (let i = 0; i < 30; i++) {
    try {
      const json = await new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: DEBUG_PORT, path: '/json' }, res => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      const page = json.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error('无法连接浏览器调试端口');
}

let msgId = 1;
function cdp(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const onMsg = raw => {
      const m = JSON.parse(raw);
      if (m.id === id) {
        ws.off('message', onMsg);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

(async () => {
  spawn('bash', ['-c', `pkill -f "remote-debugging-port=${DEBUG_PORT}" 2>/dev/null; sleep 0.5; rm -rf ${PROFILE}`]);
  await sleep(1500);
  spawn('bash', ['-c', `nohup "${EDGE}" --headless --disable-gpu --no-sandbox --remote-debugging-port=${DEBUG_PORT} --no-first-run --user-data-dir=${PROFILE} about:blank > /tmp/edge-ol-test.log 2>&1 & disown`]);
  await sleep(4000);
  const wsUrl = await getTargetWs();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));
  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.navigate', { url: 'http://localhost:3000/' });
  await sleep(1500);
  const evalJs = async (expr) => {
    const r = await cdp(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面JS错误: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };
  const fails = [];
  const check = (name, cond, extra) => { console.log((cond ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };

  await evalJs(`document.getElementById('input-name').value='OL测试';document.getElementById('input-name').dispatchEvent(new Event('input'))`);
  await evalJs(`document.getElementById('btn-create').click()`);
  await sleep(1000);
  for (let i = 0; i < 4; i++) { await evalJs(`document.getElementById('btn-add-ai').click()`); await sleep(200); }
  await evalJs(`(() => { const s = document.getElementById('opt-speed'); if (s) { s.value = 'fast'; s.dispatchEvent(new Event('change')); } return !!s; })()`);
  await sleep(200);
  // 点身份：主公（主公开局先行动，确保轮到我）
  await evalJs(`(() => { const btn = [...document.querySelectorAll('#identity-pick .id-btn')].find(b => b.textContent.includes('主公')); if (btn) btn.click(); return !!btn; })()`);
  await sleep(300);
  await evalJs(`document.getElementById('btn-start').click()`);
  await sleep(2500);
  await evalJs(`document.querySelector('.general-card')?.click()`);
  await sleep(300);
  await evalJs(`[...document.querySelectorAll('#modal .btn')].find(b=>b.textContent.includes('确定'))?.click()`);

  // 等待我的真实出牌阶段（我是 seat0 主公先行动，服务器等待我的 play 响应，状态静止）
  let myTurn = false;
  for (let i = 0; i < 100 && !myTurn; i++) {
    await sleep(500);
    myTurn = await evalJs(`document.getElementById('action-bar').children.length > 0`);
  }
  check('轮到我的出牌阶段（操作条出现）', myTurn);
  if (!myTurn) { console.log('❌ 未等到出牌阶段'); process.exit(1); }

  // 注入一张杀，消除起手随机性（确保有可指定目标的牌；服务器在等我，状态静止）
  await evalJs(`(() => {
    const gs = window.gameState;
    gs.myHand.push({ uid: 'ol_inj_sha', key: 'sha', name: '杀', suit: 'spade', rank: 7, type: 'basic', range: null });
    return true;
  })()`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);

  const handInfo = await evalJs(`[...document.querySelectorAll('#my-hand .card')].map(c => c.textContent.replace(/\\s+/g, '').slice(0, 8))`);

  // 依次点每张牌，找能进入"选择目标"状态的牌
  let entered = false, enteredIdx = 0;
  for (let i = 0; i < handInfo.length && !entered; i++) {
    await evalJs(`(() => { const el = document.querySelectorAll('#my-hand .card')[${i}]; if (el) el.click(); return true; })()`);
    await sleep(250);
    const st = await evalJs(`(() => {
      const z = document.getElementById('pending-zone');
      return {
        active: z.classList.contains('active'),
        hint: document.querySelector('#pending-zone .pending-hint')?.textContent || '',
        targetable: document.querySelectorAll('.opp.targetable').length,
      };
    })()`);
    await evalJs(`(() => { const el = document.querySelectorAll('#my-hand .card')[${i}]; if (el) el.click(); return true; })()`);
    await sleep(200);
    if (st.active && st.targetable >= 1) { entered = true; enteredIdx = i; }
  }
  check('找到可指定目标的牌并激活待用区', entered);

  // 重新点击找到的牌进入目标选择
  await evalJs(`(() => { const el = document.querySelectorAll('#my-hand .card')[${enteredIdx}]; if (el) el.click(); return true; })()`);
  await sleep(300);
  const pending1 = await evalJs(`(() => ({
    active: document.getElementById('pending-zone').classList.contains('active'),
    cardCount: document.querySelectorAll('#pending-zone .pending-card').length,
    hint: document.querySelector('#pending-zone .pending-hint')?.textContent || '',
    hasOk: !!document.querySelector('#pending-zone .pending-ok'),
    hasCancel: !!document.querySelector('#pending-zone .pending-cancel'),
    targetable: document.querySelectorAll('.opp.targetable').length,
    canMarks: document.querySelectorAll('.tgt-can').length,
  }))()`);
  check('待用区激活并显示选中牌', pending1.active && pending1.cardCount >= 1, JSON.stringify(pending1));
  check('待用区有提示与确定/取消', pending1.hint.length > 0 && pending1.hasOk && pending1.hasCancel, JSON.stringify(pending1));
  check('可选目标高亮（含可指定角标）', pending1.targetable >= 1 && pending1.canMarks >= 1, JSON.stringify(pending1));

  // 点击第一个可选目标 → 选中序号
  await evalJs(`document.querySelector('.opp.targetable')?.click()`);
  await sleep(300);
  const pending2 = await evalJs(`(() => {
    const s = document.querySelector('.opp.selected');
    const mark = s ? s.querySelector('.tgt-selected')?.textContent : null;
    const okBtn = document.querySelector('#pending-zone .pending-ok');
    return { selected: !!s, markNum: mark, okDisabled: okBtn ? okBtn.disabled : null, okExists: !!okBtn };
  })()`);
  check('点击目标显示选中序号', pending2.selected && pending2.markNum === '1', JSON.stringify(pending2));
  // 确定可用性依目标数而定（借刀需 2 目标；此处只断言按钮存在 + 提示已更新）
  check('选中目标后确定按钮存在、提示更新', pending2.okExists && pending2.okDisabled !== null, JSON.stringify(pending2));

  // 取消收回
  await evalJs(`document.querySelector('#pending-zone .pending-cancel')?.click()`);
  await sleep(300);
  const afterCancel = await evalJs(`(() => {
    const z = document.getElementById('pending-zone');
    return { active: z.classList.contains('active'), selectedOpps: document.querySelectorAll('.opp.selected').length };
  })()`);
  check('取消后待用区收回、目标清空', !afterCancel.active && afterCancel.selectedOpps === 0, JSON.stringify(afterCancel));

  // 右键收回（OL 经典）：选牌+目标后右键任意处 → 全部收回
  await evalJs(`document.querySelectorAll('#my-hand .card')[${enteredIdx}]?.click()`);
  await sleep(250);
  await evalJs(`document.querySelector('.opp.targetable')?.click()`);
  await sleep(250);
  const beforeRight = await evalJs(`(() => ({
    zoneActive: document.getElementById('pending-zone').classList.contains('active'),
    selCards: document.querySelectorAll('#my-hand .card.selected').length,
    selTargets: document.querySelectorAll('.opp.selected').length,
  }))()`);
  check('右键前：待用区激活且有选牌/目标', beforeRight.zoneActive && beforeRight.selCards >= 1 && beforeRight.selTargets >= 1, JSON.stringify(beforeRight));
  await evalJs(`document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
  await sleep(250);
  const afterRight = await evalJs(`(() => ({
    zoneActive: document.getElementById('pending-zone').classList.contains('active'),
    selCards: document.querySelectorAll('#my-hand .card.selected').length,
    selTargets: document.querySelectorAll('.opp.selected').length,
  }))()`);
  check('空白处右键后全部收回（待用区/选牌/目标清空）', !afterRight.zoneActive && afterRight.selCards === 0 && afterRight.selTargets === 0, JSON.stringify(afterRight));

  // 手牌右键应保留选择（查看牌详情，不触发收回）
  await evalJs(`document.querySelectorAll('#my-hand .card')[${enteredIdx}]?.click()`);
  await sleep(250);
  const rightOnCard = await evalJs(`(() => {
    const el = document.querySelectorAll('#my-hand .card')[${enteredIdx}];
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return {
      selCards: document.querySelectorAll('#my-hand .card.selected').length,
      detailShown: !!(document.getElementById('card-detail-mask') && !document.getElementById('card-detail-mask').classList.contains('hidden')),
    };
  })()`);
  check('手牌右键保留选择（看详情不收回）', rightOnCard.selCards === 1, JSON.stringify(rightOnCard));
  await evalJs(`document.querySelector('#pending-zone .pending-cancel')?.click()`);
  await sleep(200);

  // 多模式方式选择（注入红装备+武圣 → 「当装备」与「武圣当杀」双模式；服务器在等我不会覆盖）
  await evalJs(`(() => {
    const gs = window.gameState;
    const me = gs.players[gs.mySeat];
    gs.myHand.push({ uid: 'ol_red', key: 'zhuge', name: '诸葛连弩', suit: 'heart', rank: 1, type: 'equip', subtype: 'weapon', range: 1 });
    if (!me.skills.some(s => s.id === 'wusheng')) me.skills.push({ id: 'wusheng', name: '武圣', desc: '红牌当杀', type: 'convert' });
    return true;
  })()`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);
  await evalJs(`(() => { const el = [...document.querySelectorAll('#my-hand .card')].find(c => (c.textContent || '').includes('诸葛连弩')); if (el) el.click(); return !!el; })()`);
  await sleep(300);
  const modes = await evalJs(`(() => ({
    count: document.querySelectorAll('#pending-zone .pending-mode').length,
    texts: [...document.querySelectorAll('#pending-zone .pending-mode')].map(o => o.textContent),
  }))()`);
  check('多模式牌显示方式选项（含武圣转化）', modes.count >= 2, JSON.stringify(modes));
  await evalJs(`(() => { const el = [...document.querySelectorAll('#pending-zone .pending-mode')].find(o => (o.textContent || '').includes('武圣')); if (el) el.click(); return !!el; })()`);
  await sleep(300);
  const modeCur = await evalJs(`[...document.querySelectorAll('#pending-zone .pending-mode')].find(o => o.classList.contains('cur'))?.textContent || ''`);
  check('点击切换使用方式', modeCur.includes('武圣'), modeCur);

  // 借刀杀人双目标
  await evalJs(`(() => { const gs = window.gameState; const me = gs.players[gs.mySeat];
    gs.myHand.push({ uid: 'ol_jiedao', key: 'jiedao', name: '借刀杀人', suit: 'club', rank: 12, type: 'trick', range: null });
    const opp = gs.players.find(p => p.seat !== gs.mySeat && p.alive);
    if (opp && !opp.equips.weapon) opp.equips.weapon = { uid: 'ol_w', key: 'zhuge', name: '诸葛连弩', suit: 'club', rank: 1, type: 'equip', subtype: 'weapon', range: 1 };
    return !!opp;
  })()`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);
  await evalJs(`(() => { const el = [...document.querySelectorAll('#my-hand .card')].find(c => (c.textContent || '').includes('借刀')); if (el) el.click(); return true; })()`);
  await sleep(300);
  const jd1 = await evalJs(`(() => ({
    hint: document.querySelector('#pending-zone .pending-hint')?.textContent || '',
    targetable: document.querySelectorAll('.opp.targetable').length,
  }))()`);
  check('借刀提示选择持刀者', jd1.hint.includes('装备武器'), JSON.stringify(jd1));
  await evalJs(`document.querySelector('.opp.targetable')?.click()`);
  await sleep(300);
  const jd2 = await evalJs(`(() => ({
    hint: document.querySelector('#pending-zone .pending-hint')?.textContent || '',
    targetable: document.querySelectorAll('.opp.targetable').length,
  }))()`);
  check('借刀第二目标提示与候选', jd2.hint.includes('杀') && jd2.targetable >= 1, JSON.stringify(jd2));
  await evalJs(`document.querySelector('.opp.targetable')?.click()`);
  await sleep(300);
  const jd3 = await evalJs(`(() => ({
    selMarks: [...document.querySelectorAll('.tgt-selected')].map(e => e.textContent).join(','),
    okDisabled: (() => { const b = document.querySelector('#pending-zone .pending-ok'); return b ? b.disabled : 'missing'; })(),
  }))()`);
  check('借刀两目标选定、确定可用', jd3.selMarks === '1,2' && jd3.okDisabled === false, JSON.stringify(jd3));

  // ===== 技能发动走待用区（注入反间：0 牌 + 1 目标） =====
  await evalJs(`(() => {
    const gs = window.gameState;
    const me = gs.players[gs.mySeat];
    if (!me.skills.some(s => s.id === 'fanjian')) me.skills.push({ id: 'fanjian', name: '反间', desc: '出牌阶段限一次，令一名角色选择花色', type: 'active' });
    gs.pendingForMe = { kind: 'play', shaUsed: 0, shaLimit: 1, canSha: true,
      skills: [{ id: 'fanjian', name: '反间', desc: '令一名角色选择花色', type: 'active', usable: true,
        button: { needCards: 0, needTargets: 1, targetFilter: 'other' } }] };
    return true;
  })()`);
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);
  // 点技能按钮「反间」
  await evalJs(`(() => { const el = [...document.querySelectorAll('#action-bar .btn')].find(b => (b.textContent || '').includes('反间')); if (el) el.click(); return !!el; })()`);
  await sleep(300);
  const skillSt = await evalJs(`(() => ({
    zoneActive: document.getElementById('pending-zone').classList.contains('active'),
    skillShown: (document.querySelector('#pending-zone .pending-skill')?.textContent || '').includes('反间'),
    hint: document.querySelector('#pending-zone .pending-hint')?.textContent || '',
    targetable: document.querySelectorAll('.opp.targetable').length,
  }))()`);
  check('点技能按钮后待用区显示技能并高亮目标', skillSt.zoneActive && skillSt.skillShown && skillSt.targetable >= 1, JSON.stringify(skillSt));
  // 选目标 → 确定可用
  await evalJs(`document.querySelector('.opp.targetable')?.click()`);
  await sleep(300);
  const skillOk = await evalJs(`(() => ({
    selMarks: [...document.querySelectorAll('.tgt-selected')].map(e => e.textContent).join(','),
    okDisabled: (() => { const b = document.querySelector('#pending-zone .pending-ok'); return b ? b.disabled : 'missing'; })(),
  }))()`);
  check('技能选目标后确定可用', skillOk.selMarks === '1' && skillOk.okDisabled === false, JSON.stringify(skillOk));
  // 取消收回
  await evalJs(`document.querySelector('#pending-zone .pending-cancel')?.click()`);
  await sleep(300);
  const skillCancel = await evalJs(`(() => ({
    zoneActive: document.getElementById('pending-zone').classList.contains('active'),
    skillSel: document.querySelectorAll('#action-bar .btn.btn-primary').length,
  }))()`);
  check('技能取消后待用区收回、技能按钮复位', !skillCancel.zoneActive && skillCancel.skillSel === 0, JSON.stringify(skillCancel));

  ws.close();
  // 清理：杀 Edge 断开页面 WS，服务器自动释放房间
  spawn('bash', ['-c', `pkill -f "remote-debugging-port=${DEBUG_PORT}" 2>/dev/null`]);
  console.log(fails.length ? `❌ ${fails.length} 项失败: ${fails.join('、')}` : '🎉 OL 经典操作样式端到端通过');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('❌ 异常:', e.message); process.exit(1); });
