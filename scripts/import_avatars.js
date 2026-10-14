// 从本地无名杀仓库导入武将真实头像
// 用法: node scripts/import_avatars.js [无名杀仓库路径]
// 默认仓库路径: /Users/jjzhang/wumingsha (经典版布局, 头像位于 image/character/<拼音key>.jpg)
// 导入结果写入 public/assets/avatars/<本项目武将id>.jpg, 客户端 jpg -> png -> svg 依次回退
const fs = require('fs');
const path = require('path');

const NONAME_DIR = process.argv[2] || '/Users/jjzhang/wumingsha';
const SRC_DIR = path.join(NONAME_DIR, 'image', 'character');
const DEST_DIR = path.join(__dirname, '..', 'public', 'assets', 'avatars');

// 本项目武将 id -> 无名杀头像 key（不含扩展名）
// 大部分 id 与无名杀拼音 key 一致；仅列出特殊的：
const KEY_MAP = {
  // 神武将: 无名杀为 shen_ 前缀
  shenguan: 'shen_guanyu',
  shenmeng: 'shen_lvmeng',
  shenzhou: 'shen_zhouyu',
  shenliang: 'shen_zhugeliang',
  shencao: 'shen_caocao',
  shenlv: 'shen_lvbu',
  shenzhao: 'shen_zhaoyun',
  shensi: 'shen_simayi',
  // 同名变体武将复用本体头像
  guanyu_y: 'guanyu',
  zhangfei_y: 'zhangfei',
  // 无名杀中严颜的 key 是 yanyan；张昭基础头像缺失，用界/星火版本兜底
  yanshi: 'yanyan',
  // 拼音差异: 本项目 xuchu, 无名杀 xuzhu
  xuchu: 'xuzhu',
};

// 按 key 候选顺序查找（支持前缀风格兜底，如 zhangzhao -> jy_zhangzhao）
const KEY_FALLBACKS = {
  zhangzhao: ['jy_zhangzhao', 'star_zhangzhao', 'tw_zhangzhao'],
};

const GENERALS = require('../server/engine/generals.js').GENERALS;

let ok = 0, miss = [];
for (const g of GENERALS) {
  const candidates = [];
  if (KEY_MAP[g.id]) candidates.push(KEY_MAP[g.id]);
  else candidates.push(g.id);
  if (KEY_FALLBACKS[g.id]) candidates.push(...KEY_FALLBACKS[g.id]);
  const hit = candidates.find(k => fs.existsSync(path.join(SRC_DIR, k + '.jpg')));
  if (!hit) { miss.push(g.id + '(' + g.name + ')'); continue; }
  fs.copyFileSync(path.join(SRC_DIR, hit + '.jpg'), path.join(DEST_DIR, g.id + '.jpg'));
  ok++;
  if (hit !== g.id) console.log(`${g.id} <- ${hit}.jpg`);
}
console.log(`\n导入完成: ${ok}/${GENERALS.length}`);
if (miss.length) console.log('无对应头像(将回退到程序化SVG): ' + miss.join(', '));
