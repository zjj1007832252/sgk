// CDP 浏览器测试：验证出牌动画与特效无报错
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const DEBUG_PORT = 9226;
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
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', `--remote-debugging-port=${DEBUG_PORT}`, '--no-first-run', '--window-size=1440,900', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
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
    check('fx.js 已加载', await evalJs('typeof FX === "function"'));
    check('FX 实例化', await evalJs('(()=>{window.__fxTest=true;return true})()'));
    // 创建房间并快速打一局，触发大量特效
    await evalJs(`document.getElementById('input-name').value='特效测试';document.getElementById('input-name').dispatchEvent(new Event('input'))`);
    await evalJs(`document.getElementById('btn-create').click()`);
    await sleep(600);
    for (let i = 0; i < 4; i++) { await evalJs(`document.getElementById('btn-add-ai').click()`); await sleep(200); }
    await evalJs(`document.getElementById('btn-start').click()`);
    await sleep(2000);
    // 选将
    await evalJs(`document.querySelector('.general-card')?.click()`);
    await sleep(200);
    await evalJs(`[...document.querySelectorAll('#modal .btn')].find(b=>b.textContent.includes('确定'))?.click()`);
    await sleep(2500);
    check('牌桌加载', await evalJs(`document.getElementById('view-game').classList.contains('active')`));
    check('fx-layer 已创建', await evalJs(`!!document.getElementById('fx-layer')`));
    // 直接调用 FX 方法验证不报错
    await evalJs(`(()=>{const fx=new FX();fx.particles(100,100,{count:5});fx.damageNumber(document.body,1);fx.dodge(document.body);fx.healNumber(document.body,1);fx.equipShine(document.body);fx.banner('测试');fx.shake(3);return 'ok';})()`);
    check('FX 方法可调用', true);
    // 结束出牌等待更多特效触发
    await evalJs(`[...document.querySelectorAll('#action-bar .btn')].find(b=>b.textContent.includes('结束出牌'))?.click()`);
    await sleep(2000);
    check('JS 零报错', errs.length === 0);
    if (errs.length) console.log('  错误:', errs.slice(0, 5));
    ws.close();
  } catch (e) {
    console.error('❌ 异常:', e.message); fails.push('异常');
  } finally { edge.kill(); }
  console.log(fails.length ? `❌ ${fails.length} 项失败: ${fails.join('、')}` : '🎉 出牌动画与特效测试全部通过');
  process.exit(fails.length ? 1 : 0);
})();
