// DIY 武将持久化
const fs = require('fs');
const path = require('path');
const { SKILLS, DIY_SKILLS } = require('./engine/skills');
const { avatarSVG } = require('./avatar');

const DATA_FILE = path.join(__dirname, 'data', 'customs.json');
const AVATAR_DIR = path.join(__dirname, '..', 'public', 'assets', 'avatars');

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function save(list) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}

const KINGDOMS = ['wei', 'shu', 'wu', 'qun'];

function validate(g) {
  const name = String(g.name || '').trim();
  if (!name || [...name].length > 4) return { ok: false, msg: '名字需为 1~4 个汉字' };
  if (!KINGDOMS.includes(g.kingdom)) return { ok: false, msg: '势力不合法' };
  const hp = parseInt(g.hp, 10);
  if (!(hp >= 3 && hp <= 5)) return { ok: false, msg: '体力需为 3~5' };
  const skills = Array.isArray(g.skills) ? g.skills.filter(s => SKILLS[s] && SKILLS[s].type !== 'lord') : [];
  if (!skills.length || skills.length > 2) return { ok: false, msg: '需选择 1~2 个技能' };
  const title = String(g.title || '自制武将').slice(0, 8);
  return { ok: true, value: { name, kingdom: g.kingdom, hp, title, skills, gender: g.gender === 'f' ? 'f' : 'm' } };
}

function create(g) {
  const v = validate(g);
  if (!v.ok) return v;
  const list = load();
  const id = 'diy_' + Date.now().toString(36) + Math.floor(Math.random() * 100);
  const general = { id, custom: true, ...v.value };
  list.push(general);
  save(list);
  // 自动生成占位头像（可被上传图片覆盖）
  try {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
    fs.writeFileSync(path.join(AVATAR_DIR, id + '.svg'), avatarSVG(general), 'utf8');
  } catch (e) { console.error('生成 DIY 头像失败', e); }
  return { ok: true, value: general };
}

function remove(id) {
  const list = load();
  const idx = list.findIndex(g => g.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  save(list);
  return true;
}

module.exports = { load, create, remove, validate, DIY_SKILLS };
