// 自定义卡牌持久化
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'custom-cards.json');
const IMAGE_DIR = path.join(__dirname, '..', 'public', 'assets', 'cards');

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; }
}

function save(list) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function validate(card) {
  if (!card.name || card.name.length < 1 || card.name.length > 8) return { ok: false, msg: '名称需为1~8个字符' };
  if (!['spade', 'heart', 'club', 'diamond'].includes(card.suit)) return { ok: false, msg: '花色不合法' };
  if (card.rank < 1 || card.rank > 13) return { ok: false, msg: '点数需在1-13之间' };
  if (!Array.isArray(card.effects) || !card.effects.length) return { ok: false, msg: '至少需要一个效果' };
  if (!['basic', 'trick', 'equip'].includes(card.type)) return { ok: false, msg: '类型不合法' };
  return { ok: true };
}

function create(card) {
  const v = validate(card);
  if (!v.ok) return v;
  const list = load();
  const id = card.id || 'ccard_' + Date.now().toString(36) + Math.floor(Math.random() * 100);
  const newCard = { id, ...card, createdAt: Date.now() };
  const idx = list.findIndex(c => c.id === id);
  if (idx >= 0) list[idx] = newCard; else list.push(newCard);
  save(list);
  return { ok: true, value: newCard };
}

function remove(id) {
  const list = load();
  const idx = list.findIndex(c => c.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  save(list);
  return true;
}

function getImageData(id) {
  const files = fs.readdirSync(IMAGE_DIR);
  const file = files.find(f => f.startsWith(id + '.'));
  return file ? '/assets/cards/' + file : null;
}

module.exports = { load, save, create, remove, validate, getImageData, IMAGE_DIR };
