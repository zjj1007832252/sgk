// test/pindian.js — 拼点相关能力静态校验 + 端到端模拟
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { Game } = require('../server/engine/game');
const { GENERALS } = require('../server/engine/generals');

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, info) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name + (info ? ' | ' + info : '')); console.log('  ❌ ' + name + (info ? ' | ' + info : '')); }
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function exec(cmd) { return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }); }

console.log('\n=== 1. 静态断言（语法/签名/API 存在性） ===');

const gameSrc = read('server/engine/game.js');
const aiSrc = read('server/engine/ai.js');
const skSrc = read('server/engine/skills.js');
const appSrc = read('public/js/app.js');

// P1: 后端能力存在性
check('game.js 有 canTargetSha 支持 opts.noDistance', /canTargetSha\s*\([^)]*,\s*[^)]*,\s*opts/.test(gameSrc) && /noDistance/.test(gameSrc));
check('game.js useSha 有 xianzhenTarget 特殊放行', /xianzhenTarget/.test(gameSrc));
const getStateBlock = (gameSrc.match(/getState\s*\(\s*forPid\s*\)\s*\{[\s\S]*?^\s*\};\s*$/m) || [])[0] || '';
check('getState 暴露 turnFlags', /turnFlags:/.test(getStateBlock));
check('turnFlags 含 xianzhenTarget', /xianzhenTarget/.test(gameSrc));

// P2: skills.js 陷阵/双刃
const xianzhenBlock = (skSrc.match(/xianzhen:\s*\{[\s\S]*?\n\s*\},/) || [])[0] || '';
const shuangrenBlock = (skSrc.match(/shuangren:\s*\{[\s\S]*?\n\s*\},/) || [])[0] || '';
check('xianzhen.activate 存在', /async\s+activate\s*\(\s*game,\s*user,\s*\{\s*targets\s*\}\s*\)/.test(xianzhenBlock));
check('xianzhen activate 调 game.pindian', /game\.pindian\s*\(\s*user,\s*target/.test(xianzhenBlock));
check('xianzhen 赢设 xianzhenTarget', /xianzhenTarget\s*=\s*target\.seat/.test(xianzhenBlock));
check('xianzhen button 配置存在', /button:\s*\{[^}]*needTargets:\s*1/.test(xianzhenBlock));
check('shuangren.activate 存在', /async\s+activate\s*\(\s*game,\s*user,\s*\{\s*targets\s*\}\s*\)/.test(shuangrenBlock));
check('shuangren activate 调 game.pindian', /game\.pindian\s*\(\s*user,\s*target/.test(shuangrenBlock));
check('shuangren 赢 useSha', /useSha\s*\(\s*user,\s*target\s*,/.test(shuangrenBlock));

// P3: AI 决策
const xianzhenCase = (aiSrc.match(/case\s+'xianzhen':\s*\{[\s\S]*?\n\s{8}\}/) || [])[0] || '';
const shuangrenCase = (aiSrc.match(/case\s+'shuangren':\s*\{[\s\S]*?\n\s{8}\}/) || [])[0] || '';
const ganluCase = (aiSrc.match(/case\s+'ganlu':\s*\{[\s\S]*?\n\s{8}\}/) || [])[0] || '';
check('AI 有 xianzhen 决策', xianzhenCase.length > 0);
check('AI 有 shuangren 决策', shuangrenCase.length > 0);
check('AI 有 ganlu 决策', ganluCase.length > 0);
check('xianzhen AI 决策返回 action:skill', /action:\s*'skill',\s*skill:\s*'xianzhen'/.test(xianzhenCase));
check('shuangren AI 决策返回 action:skill', /action:\s*'skill',\s*skill:\s*'shuangren'/.test(shuangrenCase));

// P5: AI 拼点选牌选 rank 最大
check('AI 拼点选牌选 rank 最大', /t\.includes\(['"]拼点['"]\)/.test(aiSrc) && /\(b\.rank\s*\|\|\s*0\)\s*-\s*\(a\.rank\s*\|\|\s*0\)/.test(aiSrc));

// P5: 前端 modeRule('sha') 距离豁免
const shaRule = (appSrc.match(/case\s+'sha':\s*\{[\s\S]*?return\s*\{[\s\S]*?\};/) || [])[0] || '';
check('modeRule(sha) 读 myPlayer.turnFlags.xianzhenTarget', /m\.turnFlags\s*&&\s*m\.turnFlags\.xianzhenTarget/.test(shaRule));
check('modeRule(sha) 对 xianzhenTarget 豁免距离', /xianzhenTarget\s*!=\s*null\s*&&\s*p\.seat\s*===\s*xhenTarget/.test(shaRule) || /xianzhenTarget\s*!=\s*null\s*&&\s*p\.seat\s*===\s*xianzhenTarget/.test(shaRule));

// P6: 前端 pindian 事件
const pindianEvent = (appSrc.match(/case\s+'pindian':\s*\{[\s\S]*?\n\s{4}\}/) || [])[0] || '';
check('app.js 有 case pindian 事件', pindianEvent.length > 0);
check('pindian 事件调 cardFly', /cardFly\s*\(/.test(pindianEvent));

// P7: 语法
console.log('\n=== 2. 语法检查 ===');
const files = ['server/engine/game.js', 'server/engine/skills.js', 'server/engine/ai.js', 'public/js/app.js'];
let allSyntax = true;
for (const f of files) {
  try { exec('node -c ' + path.join(ROOT, f)); check(f + ' 语法 OK', true); }
  catch (e) { check(f + ' 语法 OK', false, e.message); allSyntax = false; }
}

// P8: 端到端直接模拟
console.log('\n=== 3. 端到端模拟（确认无运行时错误） ===');
function runDirect() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('模拟超时')), 20000);
    const game = new Game(
      [
        { pid: 'a', name: 'AI1', isAI: true },
        { pid: 'b', name: 'AI2', isAI: true },
        { pid: 'c', name: 'AI3', isAI: true },
        { pid: 'd', name: 'AI4', isAI: true },
        { pid: 'e', name: 'AI5', isAI: true },
      ],
      {
        pickMode: 'random',
        pickCount: 2,
        generalIds: GENERALS.map(g => g.id),
        generals: GENERALS,
        aiDelay: 0,
        stepDelay: 0,
        forceGenerals: { 0: 'caocao', 1: 'liubei', 2: 'sunquan', 3: 'zhouyu', 4: 'lvbu' },
      },
      {
        sendTo: () => {},
        broadcastAll: () => {},
        broadcastEvent: () => {},
        delay: () => Promise.resolve(),
        onEnd: winner => { clearTimeout(timer); resolve({ winner, game }); },
      }
    );
    game.start().catch(e => { clearTimeout(timer); e.logs = game.logs.slice(-30); reject(e); });
  });
}
(async () => {
  try {
    const r = await runDirect();
    check('直接模拟跑通', !!r.winner && r.winner);
    check('无异常错误', !(r.game.logs || []).some(l => /Error|error|TypeError|Typeerror/.test(l)));
  } catch (e) {
    check('直接模拟跑通', false, e.message);
  }

  console.log('\n' + '='.repeat(50));
  console.log(`结果: ${pass} 通过 / ${fail} 失败`);
  if (fail) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
  console.log('🎉 拼点相关能力检查全部通过');
})();
