// test/run-all.js — 聚合所有 Node 端测试 (canonical suite 入口)
//
// 跑:
//   npm test        -> 跑全部
//   npm run test:fast  -> 只跑快速路径(verify + pindian)
//
// 跳过:
//   test/browser-*.js  — 需 CDP + Chrome 启动
//   test/e2e.js        — 需服务在 :3000
//
// 退出码:0 = 全部通过, 1 = 至少 1 项失败

'use strict';
const { spawn } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const FAST = process.argv.includes('--fast');

// 顺序定义:前面的失败会中断后面的
const SUITE = FAST
  ? [
      { name: 'verify',     script: 'test/verify.js',     timeout: 240_000, desc: '86 项数据完整性 (武将/技能/卡牌/模式)' },
      { name: 'pindian',    script: 'test/pindian.js',    timeout: 90_000,  desc: '拼点引擎 + 距离豁免 + AI 选牌' },
    ]
  : [
      { name: 'verify',     script: 'test/verify.js',     timeout: 300_000, desc: '86 项数据完整性 (武将/技能/卡牌/模式)' },
      { name: 'pindian',    script: 'test/pindian.js',    timeout: 90_000,  desc: '拼点引擎 + 距离豁免 + AI 选牌' },
      { name: 'ai-test',    script: 'test/ai-test.js',    timeout: 180_000, desc: 'AI 决策智能 (4 局统计)' },
      { name: 'simulate',   script: 'test/simulate.js',   timeout: 180_000, desc: '10 局全 AI 对战' },
    ];

let pass = 0, fail = 0;
const results = [];
const startTime = Date.now();

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function color(s, c) {
  if (!process.stdout.isTTY) return s;
  const C = { red: 31, green: 32, yellow: 33, gray: 90, bold: 1 };
  return `\x1b[${C[c] || 0}m${s}\x1b[0m`;
}

async function runOne({ name, script, timeout, desc }) {
  const t0 = Date.now();
  process.stdout.write(`\n${color('▶', 'bold')} ${color(pad(name, 10), 'yellow')}  ${color(desc, 'gray')}\n`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, script)], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let settled = false;
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    const finish = (ok, dt, tail) => {
      if (settled) return;
      settled = true;
      if (ok) {
        console.log(color('  ✓', 'green') + ` ${pad(dt + 's', 6)}  ${tail.split('\n')[0]}`);
        if (tail.split('\n').length > 1) console.log(color('         ' + tail.split('\n').slice(1).join(' / '), 'gray'));
        pass++;
        results.push({ name, ok: true, dt });
      } else {
        console.log(color('  ✗', 'red') + ` ${pad(dt + 's', 6)}  FAILED`);
        if (tail) console.log(color(tail.split('\n').map(l => '         ' + l).join('\n'), 'red'));
        fail++;
        results.push({ name, ok: false, dt, tail });
      }
      resolve(ok);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(false, ((Date.now() - t0) / 1000).toFixed(1), '⏱ 超时');
    }, timeout);
    child.on('close', code => {
      clearTimeout(timer);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const tail = out.trimEnd().split('\n').slice(-4).join('\n');
      finish(code === 0, dt, tail);
    });
  });
}

(async () => {
  console.log(color('═══════════════════════════════════════════════════════', 'bold'));
  console.log(color(`  Sanguosha Test Suite ${FAST ? '(fast)' : '(full)'}`, 'bold'));
  console.log(color('═══════════════════════════════════════════════════════', 'bold'));
  console.log(color(`  Root: ${ROOT}`, 'gray'));
  console.log(color(`  时间: ${new Date().toISOString()}`, 'gray'));
  console.log(color(`  跳过的脚本: test/browser-*.js (需 CDP), test/e2e.js (需 :3000 服务)`, 'gray'));

  for (const s of SUITE) {
    const ok = await runOne(s);
    if (!ok && !FAST) {
      // 完整模式:一失败立即停(快速反馈)
      console.log(color('\n⚠  失败，后续测试跳过', 'yellow'));
      break;
    }
  }

  const dt = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + color('═══════════════════════════════════════════════════════', 'bold'));
  console.log(color(`  结果: ${pass} 通过 / ${fail} 失败 (${dt}s)`, pass === 0 && fail === 0 ? 'gray' : (fail === 0 ? 'green' : 'red')));
  console.log(color('═══════════════════════════════════════════════════════', 'bold'));

  for (const r of results) {
    const tag = r.ok ? color('  PASS', 'green') : color('  FAIL', 'red');
    console.log(`${tag}  ${pad(r.name, 12)} ${r.dt}s`);
  }

  console.log('');
  if (fail) {
    console.log(color('  Suite: FAILED', 'red'));
    process.exit(1);
  } else {
    console.log(color('  Suite: PASS', 'green'));
    process.exit(0);
  }
})();
