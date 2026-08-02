// CDP 浏览器测试：验证自定义技能编辑器
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const DEBUG_PORT = 9228;
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

    check('skill-editor.js 已加载', await evalJs('typeof SkillEditor === "function"'));
    check('SkillEditor 实例化', await evalJs('typeof SKILL_DSL !== "undefined"'));
    check('触发选项数量', await evalJs('SKILL_DSL.TRIGGERS.length >= 15'));
    check('条件选项数量', await evalJs('SKILL_DSL.CONDITIONS.length >= 15'));
    check('效果选项数量', await evalJs('SKILL_DSL.EFFECTS.length >= 25'));
    // 打开技能编辑器
    await evalJs(`document.getElementById('btn-skilleditor-tab').click()`);
    await sleep(500);
    check('技能编辑器页面显示', await evalJs(`document.getElementById('view-skilleditor').classList.contains('active')`));
    check('编辑器表单存在', await evalJs(`!!document.getElementById('se-name')`));
    check('触发选项渲染', await evalJs(`document.querySelectorAll('#se-triggers .se-opt').length >= 15`));
    check('条件选项渲染', await evalJs(`document.querySelectorAll('#se-condition-type .se-opt').length >= 15`));
    check('效果列表存在', await evalJs(`!!document.getElementById('se-effects')`));
    check('预览区域存在', await evalJs(`!!document.getElementById('se-preview')`));
    check('JSON 输出存在', await evalJs(`!!document.getElementById('se-json')`));
    // 测试创建一个技能
    await evalJs(`document.getElementById('se-name').value='测试技能';document.getElementById('se-name').dispatchEvent(new Event('input'))`);
    await sleep(200);
    check('技能名称已设置', await evalJs(`document.getElementById('se-preview').textContent.includes('测试技能')`));
    // 测试保存
    await evalJs(`document.getElementById('btn-se-save').click()`);
    await sleep(300);
    check('技能保存成功', await evalJs(`document.querySelectorAll('#se-list .se-list-item').length >= 1`));
    check('localStorage 已保存', await evalJs(`JSON.parse(localStorage.getItem('sgk_custom_skills')||'[]').length >= 1`));
    // 测试 JSON 输出
    const jsonStr = await evalJs(`document.getElementById('se-json').textContent`);
    check('JSON 包含 trigger', typeof jsonStr === 'string' && jsonStr.includes('trigger'));
    check('JSON 包含 effects', typeof jsonStr === 'string' && jsonStr.includes('effects'));
    check('JS 零报错', errs.length === 0);
    if (errs.length) console.log('  错误:', errs.slice(0, 3));
    ws.close();
  } catch (e) {
    console.error('❌ 异常:', e.message); fails.push('异常');
  } finally { edge.kill(); }
  console.log(fails.length ? `❌ ${fails.length} 项失败: ${fails.join('、')}` : '🎉 自定义技能编辑器测试全部通过');
  process.exit(fails.length ? 1 : 0);
})();
