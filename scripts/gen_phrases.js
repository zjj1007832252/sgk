// 生成短句配音文件（使用 macOS say 命令）
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'audio', 'phrases');
fs.mkdirSync(OUT_DIR, { recursive: true });

const VOICE = 'Tingting'; // zh_CN 语音

// 短句配音列表
const phrases = [
  // 基本牌
  ['sha', '杀！'],
  ['shan', '闪！'],
  ['tao', '桃！'],
  ['jiu', '酒！'],
  // 锦囊
  ['wuxie', '无懈可击！'],
  ['juedou', '决斗！'],
  ['nanman', '南蛮入侵！'],
  ['wanjian', '万箭齐发！'],
  ['wugu', '五谷丰登！'],
  ['taoyuan', '桃园结义！'],
  ['guohe', '过河拆桥！'],
  ['shunshou', '顺手牵羊！'],
  ['jiedao', '借刀杀人！'],
  ['lebu', '乐不思蜀！'],
  ['shandian', '闪电！'],
  // 胜负
  ['shengli', '胜利！'],
  ['shibai', '失败！'],
  // 回合
  ['round_start', '回合开始！'],
  // 濒死
  ['dying', '救命！'],
  // 常用
  ['good', '打得好！'],
  ['nice', '好牌！'],
  ['threat', '小心！'],
];

let ok = 0, fail = 0;
for (const [id, text] of phrases) {
  const aiff = path.join(OUT_DIR, id + '.aiff');
  const wav = path.join(OUT_DIR, id + '.wav');
  try {
    execSync(`say -v ${VOICE} -o ${JSON.stringify(aiff)} ${JSON.stringify(text)}`);
    execSync(`afconvert ${JSON.stringify(aiff)} ${JSON.stringify(wav)} -d LEI16 -f WAVE`);
    try { fs.unlinkSync(aiff); } catch {}
    ok++;
    process.stdout.write(`✅ ${id}: ${text}\n`);
  } catch (e) {
    fail++;
    process.stdout.write(`❌ ${id}: ${e.message}\n`);
  }
}

console.log(`\n完成：${ok} 成功 / ${fail} 失败`);
console.log(`输出目录: ${OUT_DIR}`);
