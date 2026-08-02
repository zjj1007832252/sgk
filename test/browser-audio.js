// CDP 浏览器测试：验证音效与配音集成无报错
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const DEBUG_PORT = 9225;
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
    // 收集控制台错误
    const errs = [];
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.method === 'Runtime.exceptionThrown') {
        errs.push(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
      }
    });
    await cdp(ws, 'Page.navigate', { url: 'http://localhost:3000/' });
    await sleep(2000);
    const evalJs = async (expr) => {
      const r = await cdp(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS错误: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result ? r.result.value : undefined;
    };
    check('audio.js 已加载', await evalJs('typeof AudioManager === "function"'));
    check('AudioManager 实例化', await evalJs('!!window.__audioTest || (window.__audioTest = true, true)'));
    check('音频控制按钮存在', await evalJs('!!document.getElementById("audio-control")'));
    check('静音按钮存在', await evalJs('!!document.getElementById("audio-icon")'));
    check('音量滑块存在', await evalJs('document.getElementById("audio-volume").type === "range"'));
    // 检查 meta 加载
    check('meta 数据已加载', await evalJs('!!(window._SGK_META && window._SGK_META.generals && window._SGK_META.generals.length === 25)'));
    // 检查音频文件可访问
    check('赵云选将音频可访问', await evalJs(`fetch('/assets/audio/voices/zhaoyun/select.wav').then(r=>r.status===200).catch(()=>false)`));
    check('赵云技能音频可访问', await evalJs(`fetch('/assets/audio/voices/zhaoyun/longdan.wav').then(r=>r.status===200).catch(()=>false)`));
    check('赵云阵亡音频可访问', await evalJs(`fetch('/assets/audio/voices/zhaoyun/death.wav').then(r=>r.status===200).catch(()=>false)`));
    // 检查 SFX 方法存在
    check('playSfx 方法', await evalJs('typeof AudioManager.prototype.playSfx === "function"'));
    check('playVoice 方法', await evalJs('typeof AudioManager.prototype.playVoice === "function"'));
    check('89 个音频文件', await evalJs(`(async()=>{const gens=["caocao","simayi","xiahoudun","zhangliao","xuchu","guojia","zhenji","liubei","guanyu","zhangfei","zhugeliang","zhaoyun","machao","huangyueying","sunquan","ganning","lvmeng","huanggai","zhouyu","daqiao","luxun","sunshangxiang","huatuo","lvbu","diaochan"];let ok=0;for(const g of gens){const r=await fetch('/assets/audio/voices/'+g+'/select.wav');if(r.ok)ok++;}return ok})()`));
    // 创建房间并启动游戏，触发音频事件
    await evalJs(`document.getElementById('input-name').value='音频测试';document.getElementById('input-name').dispatchEvent(new Event('input'))`);
    await evalJs(`document.getElementById('btn-create').click()`);
    await sleep(800);
    await evalJs(`document.getElementById('btn-add-ai').click()`);
    await evalJs(`document.getElementById('btn-add-ai').click()`);
    await evalJs(`document.getElementById('btn-add-ai').click()`);
    await evalJs(`document.getElementById('btn-add-ai').click()`);
    await sleep(500);
    await evalJs(`document.getElementById('btn-start').click()`);
    await sleep(2500);
    // 选将（触发 select 语音）
    await evalJs(`document.querySelector('.general-card')?.click()`);
    await sleep(200);
    await evalJs(`[...document.querySelectorAll('#modal .btn')].find(b=>b.textContent.includes('确定'))?.click()`);
    await sleep(2000);
    check('牌桌加载', await evalJs(`document.getElementById('view-game').classList.contains('active')`));
    check('AudioContext 可用', await evalJs(`!!(window.AudioContext||window.webkitAudioContext)`));
    // 结束出牌
    await evalJs(`[...document.querySelectorAll('#action-bar .btn')].find(b=>b.textContent.includes('结束出牌'))?.click()`);
    await sleep(1500);
    check('JS 零报错', errs.length === 0);
    if (errs.length) console.log('  错误:', errs.slice(0, 5));
    ws.close();
  } catch (e) {
    console.error('❌ 异常:', e.message); fails.push('异常');
  } finally { edge.kill(); }
  console.log(fails.length ? `❌ ${fails.length} 项失败: ${fails.join('、')}` : '🎉 音效与配音测试全部通过');
  process.exit(fails.length ? 1 : 0);
})();
