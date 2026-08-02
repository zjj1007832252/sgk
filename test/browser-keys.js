// CDP 浏览器测试：验证快捷键功能
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const DEBUG_PORT = 9227;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getTargetWs() {
  for (let i = 0; i < 30; i++) {
    try {
      const json = await new Promise((resolve, reject) => {
        http.get({ host: 'localhost', port: DEBUG_PORT, path: '/json' }, res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      const page = json.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error('连接失败');
}
let msgId = 1;
function cdp(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const onMsg = raw => {
      const m = JSON.parse(raw);
      if (m.id === id) { ws.off('message', onMsg); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

(async () => {
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', `--remote-debugging-port=${DEBUG_PORT}`, '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  const fails = [];
  const check = (name, cond) => { console.log((cond ? '✅' : '❌') + ' ' + name); if (!cond) fails.push(name); };
  try {
    const wsUrl = await getTargetWs();
    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.on('open', r));
    await cdp(ws, 'Page.enable');
    await cdp(ws, 'Runtime.enable');
    const errs = [];
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
    });
    await cdp(ws, 'Page.navigate', { url: 'http://localhost:3000/' });
    await sleep(2000);
    const evalJs = async (expr) => {
      const r = await cdp(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result ? r.result.value : undefined;
    };
    check('shortcuts.js 已加载', await evalJs('typeof Shortcuts === "function"'));
    check('快捷键帮助面板存在', await evalJs('!!document.getElementById("shortcuts-help")'));
    check('快捷键列表存在', await evalJs('!!document.getElementById("shortcuts-list")'));
    // 创建房间并启动
    await evalJs(`document.getElementById('input-name').value='快捷键测试';document.getElementById('input-name').dispatchEvent(new Event('input'))`);
    await evalJs(`document.getElementById('btn-create').click()`);
    await sleep(600);
    for (let i = 0; i < 4; i++) { await evalJs(`document.getElementById('btn-add-ai').click()`); await sleep(200); }
    await evalJs(`document.getElementById('btn-start').click()`);
    await sleep(2500);
    await evalJs(`document.querySelector('.general-card')?.click()`);
    await sleep(200);
    await evalJs(`[...document.querySelectorAll('#modal .btn')].find(b=>b.textContent.includes('确定'))?.click()`);
    await sleep(2500);
    check('牌桌加载', await evalJs(`document.getElementById('view-game').classList.contains('active')`));
    // 等待人类玩家获得出牌提示（最多 40s）
    let hasPrompt = false;
    for (let i = 0; i < 40 && !hasPrompt; i++) {
      await sleep(1000);
      hasPrompt = await evalJs(`document.getElementById('action-bar').children.length > 0`);
    }
    check('轮到人类出牌', hasPrompt);
    const cardCount = await evalJs(`document.querySelectorAll('#my-hand .card').length`);
    check('手牌有数字标记', await evalJs(`document.querySelectorAll('#my-hand .card[data-num]').length`) === cardCount && cardCount > 0);
    // 验证快捷键处理器逻辑（直接调用，绕过 CDP 合成事件假象）
    let helpOpened = false, muted = false, cardSelected = false;
    await evalJs(`(()=>{
      window.__t1 = false; window.__t2 = false; window.__t3 = false;
      if (!window._shortcuts) return;
      // 模拟 H 键
      window._shortcuts.handle({ key: 'h', preventDefault(){} });
      window.__t1 = !document.getElementById('shortcuts-help').classList.contains('hidden');
      // 模拟 Esc 关闭
      window._shortcuts.handle({ key: 'Escape', preventDefault(){} });
      window.__t2 = document.getElementById('shortcuts-help').classList.contains('hidden');
      // 模拟 M 键
      window._shortcuts.handle({ key: 'm', preventDefault(){} });
      window.__t3 = document.getElementById('audio-icon').textContent === '🔇';
    })()`);
    await sleep(300);
    check('H 打开帮助面板', await evalJs('window.__t1 === true'));
    check('帮助面板有内容', await evalJs(`document.querySelectorAll('#shortcuts-list div').length >= 8`));
    check('Esc 关闭帮助面板', await evalJs('window.__t2 === true'));
    check('M 切换静音', await evalJs('window.__t3 === true'));
    // 恢复静音
    await evalJs(`window._shortcuts.handle({ key: 'm', preventDefault(){} });`);
    await sleep(100);
    // 测试数字键选牌
    await evalJs(`window._shortcuts.handle({ key: '1', preventDefault(){} });`);
    await sleep(300);
    check('数字键1选牌生效', await evalJs(`document.querySelectorAll('#my-hand .card.selected').length`) >= 1);
    check('按钮有 data-key 标记', await evalJs(`document.querySelectorAll('#action-bar .btn[data-key]').length >= 3`));
    check('JS 零报错', errs.length === 0);
    if (errs.length) console.log('  错误:', errs.slice(0, 5));
    ws.close();
  } catch (e) {
    console.error('❌ 异常:', e.message); fails.push('异常');
  } finally { edge.kill(); }
  console.log(fails.length ? `❌ ${fails.length} 项失败: ${fails.join('、')}` : '🎉 快捷键测试全部通过');
  process.exit(fails.length ? 1 : 0);
})();
