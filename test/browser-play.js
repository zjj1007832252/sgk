// CDP 全流程：创建房间 → 加 AI → 开始 → 选将 → 验证牌桌 UI
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const DEBUG_PORT = 9224;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getTargetWs() {
  for (let i = 0; i < 30; i++) {
    try {
      const json = await new Promise((resolve, reject) => {
        http.get({ host: 'localhost', port: DEBUG_PORT, path: '/json' }, res => {
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
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', `--remote-debugging-port=${DEBUG_PORT}`, '--no-first-run', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  const fails = [];
  const check = (name, cond) => { console.log((cond ? '✅' : '❌') + ' ' + name); if (!cond) fails.push(name); };
  try {
    const wsUrl = await getTargetWs();
    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.on('open', r));
    await cdp(ws, 'Page.enable');
    await cdp(ws, 'Page.navigate', { url: 'http://localhost:3000/' });
    await sleep(2000);
    const evalJs = async (expr) => {
      const r = await cdp(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面JS错误: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result ? r.result.value : undefined;
    };
    // 主页
    check('主页加载', await evalJs('!!document.querySelector(".game-title")'));
    // 输入昵称并创建房间
    await evalJs(`document.getElementById('input-name').value='浏览器玩家';document.getElementById('input-name').dispatchEvent(new Event('input'))`);
    await evalJs(`document.getElementById('btn-create').click()`);
    await sleep(1200);
    check('进入大厅', await evalJs(`document.getElementById('view-lobby').classList.contains('active')`));
    // 房主设置 AI 速度为 0
    await evalJs(`(()=>{const els=[...document.querySelectorAll('.opt-row')];return true})()`);
    // 加 4 个 AI
    for (let i = 0; i < 4; i++) { await evalJs(`document.getElementById('btn-add-ai').click()`); await sleep(300); }
    const seatCount = await evalJs(`document.querySelectorAll('.seat.occupied').length`);
    check('座位 5 人（含AI）', seatCount === 5);
    // 点身份界面
    check('点身份按钮存在', await evalJs(`document.querySelectorAll('.id-btn').length >= 4`));
    // 开始游戏
    await evalJs(`document.getElementById('btn-start').click()`);
    await sleep(2000);
    check('进入牌桌', await evalJs(`document.getElementById('view-game').classList.contains('active')`));
    // 选将弹窗
    await sleep(1500);
    const hasGeneralModal = await evalJs(`!document.getElementById('modal-mask').classList.contains('hidden') && document.querySelectorAll('.general-card').length >= 2`);
    check('选将弹窗出现', hasGeneralModal);
    // 选一个武将
    await evalJs(`document.querySelector('.general-card').click()`);
    await sleep(300);
    await evalJs(`[...document.querySelectorAll('#modal .btn')].find(b=>b.textContent.includes('确定'))?.click()`);
    await sleep(1500);
    // 牌桌元素
    check('对手面板 4 个', await evalJs(`document.querySelectorAll('.opp').length`) === 4);
    check('我的手牌 ≥4 张（含开局摸牌）', await evalJs(`document.querySelectorAll('#my-hand .card').length`) >= 4);
    check('我的面板存在', await evalJs(`!!document.querySelector('.my-avatar')`));
    check('战报日志滚动', await evalJs(`document.getElementById('game-log').children.length > 0`));
    // 等到我的回合（最多 60s）
    let myTurn = false;
    for (let i = 0; i < 60 && !myTurn; i++) {
      await sleep(1000);
      myTurn = await evalJs(`document.getElementById('action-bar').children.length > 0`);
    }
    check('轮到我的出牌阶段（出现操作条）', myTurn);
    if (myTurn) {
      const btns = await evalJs(`[...document.querySelectorAll('#action-bar .btn')].map(b=>b.textContent)`);
      console.log('  操作按钮:', JSON.stringify(btns));
      check('有「结束出牌」', btns.some(b => b.includes('结束出牌')));
      // 结束出牌
      await evalJs(`[...document.querySelectorAll('#action-bar .btn')].find(b=>b.textContent.includes('结束出牌')).click()`);
      await sleep(1000);
      check('出牌阶段结束', await evalJs(`document.getElementById('action-bar').children.length`) === 0);
    }
    // 截图
    const shot = await cdp(ws, 'Page.captureScreenshot', { format: 'png' });
    require('fs').writeFileSync('/tmp/sgk-game.png', Buffer.from(shot.data, 'base64'));
    console.log('截图已保存 /tmp/sgk-game.png');
    ws.close();
  } catch (e) {
    console.error('❌ 异常:', e.message);
    fails.push('异常');
  } finally {
    edge.kill();
  }
  console.log(fails.length ? `❌ ${fails.length} 项失败: ${fails.join('、')}` : '🎉 浏览器全流程通过');
  process.exit(fails.length ? 1 : 0);
})();
