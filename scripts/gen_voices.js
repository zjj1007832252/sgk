// 用 macOS say 生成武将配音文件（中文语音 Tingting）
// 生成 public/assets/audio/voices/<武将id>/select.wav、death.wav、<技能名>.wav
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { GENERALS } = require('../server/engine/generals');
const { SKILLS } = require('../server/engine/skills');

const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'audio', 'voices');
const VOICE = 'Tingting'; // zh_CN 语音

function sh(cmd) {
  try { execSync(cmd, { stdio: 'pipe' }); return true; }
  catch (e) { console.error('  命令失败:', cmd, e.message); return false; }
}

function generate(text, outWav) {
  const dir = path.dirname(outWav);
  fs.mkdirSync(dir, { recursive: true });
  const aiff = outWav.replace('.wav', '.aiff');
  // 生成 aiff
  sh(`say -v ${VOICE} -o ${JSON.stringify(aiff)} ${JSON.stringify(text)}`);
  if (!fs.existsSync(aiff)) return false;
  // 转为 wav
  const ok = sh(`afconvert ${JSON.stringify(aiff)} ${JSON.stringify(outWav)} -d LEI16 -f WAVE`);
  try { fs.unlinkSync(aiff); } catch {}
  return ok && fs.existsSync(outWav);
}

console.log(`使用语音: ${VOICE} (zh_CN)`);
console.log(`输出目录: ${OUT_DIR}\n`);

let total = 0, okCount = 0;
for (const g of GENERALS) {
  const dir = path.join(OUT_DIR, g.id);
  // select
  total++;
  process.stdout.write(`${g.name} 选将… `);
  if (generate(`${g.name}，${g.title || ''}`, path.join(dir, 'select.wav'))) { okCount++; console.log('✅'); }
  else console.log('❌');

  // death
  total++;
  process.stdout.write(`${g.name} 阵亡… `);
  if (generate(`${g.name}，呃啊……`, path.join(dir, 'death.wav'))) { okCount++; console.log('✅'); }
  else console.log('❌');

  // skills
  for (const sk of g.skills) {
    const def = SKILLS[sk];
    if (!def) continue;
    total++;
    process.stdout.write(`${g.name}·${def.name}… `);
    if (generate(def.name, path.join(dir, `${sk}.wav`))) { okCount++; console.log('✅'); }
    else console.log('❌');
  }
}

console.log(`\n完成：${okCount}/${total} 个音频文件生成`);
console.log(`提示：say/afconvert 仅在 macOS 可用；其他平台请手动放入 wav 文件或使用 Web Speech 回退`);
