// 生成全部标准武将的 SVG 占位头像
const fs = require('fs');
const path = require('path');
const { GENERALS } = require('../server/engine/generals');
const { avatarSVG } = require('../server/avatar');

const outDir = path.join(__dirname, '..', 'public', 'assets', 'avatars');
fs.mkdirSync(outDir, { recursive: true });

for (const g of GENERALS) {
  fs.writeFileSync(path.join(outDir, g.id + '.svg'), avatarSVG(g), 'utf8');
}
console.log(`已生成 ${GENERALS.length} 个头像 -> ${outDir}`);
