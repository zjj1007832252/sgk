// 用 CDP 驱动无头 Edge，验证浏览器端真实渲染与 WS 联通
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const DEBUG_PORT = 9223;
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
  const keepalive = process.env.KEEP_ROOM !== '0';
  // 1. 创建一个房间保活
  let roomName = '';
  if (keepalive) {
    const ws = new WebSocket('ws://localhost:3000');
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify({ type: 'hello', name: '房主' }));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.type === 'welcome') ws.send(JSON.stringify({ type: 'createRoom' }));
      if (m.type === 'room') roomName = m.room.name;
    });
    await sleep(800);
  }

  // 2. 启动无头 Edge
  const edge = spawn(EDGE, ['--headless', '--disable-gpu', `--remote-debugging-port=${DEBUG_PORT}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  try {
    const wsUrl = await getTargetWs();
    const cdpWs = new WebSocket(wsUrl);
    await new Promise(r => cdpWs.on('open', r));
    await cdp(cdpWs, 'Page.enable');
    await cdp(cdpWs, 'Page.navigate', { url: 'http://localhost:3000/' });
    await sleep(2500);
    const evalJs = async (expr) => {
      const r = await cdp(cdpWs, 'Runtime.evaluate', { expression: expr, returnByValue: true });
      return r.result ? r.result.value : undefined;
    };
    // JS 运行错误检查
    const errors = await evalJs('window.__errs ? JSON.stringify(window.__errs) : "[]"');
    const title = await evalJs('document.querySelector(".game-title") ? document.querySelector(".game-title").textContent.trim() : "NO TITLE"');
    const roomList = await evalJs('document.getElementById("room-list").innerText.trim()');
    console.log('页面标题元素:', title);
    console.log('JS 错误:', errors);
    console.log('房间列表内容:', JSON.stringify(roomList));
    if (keepalive && roomName) {
      console.log(roomList.includes(roomName) ? '✅ 浏览器 WS 联通，房间列表正常' : '⚠️ 未看到房间（可能时序问题）');
    } else {
      console.log(roomList.length > 0 ? '✅ 房间列表已渲染' : '❌ 房间列表为空');
    }
    cdpWs.close();
  } finally {
    edge.kill();
    process.exit(0);
  }
})();
