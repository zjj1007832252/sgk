// 自定义技能持久化
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'custom-skills.json');

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; }
}

function save(list) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function validate(sk) {
  if (!sk.name || sk.name.length < 1 || sk.name.length > 6) return { ok: false, msg: '技能名称需为 1~6 个字符' };
  if (!sk.trigger) return { ok: false, msg: '触发时机不能为空' };
  if (!Array.isArray(sk.effects) || !sk.effects.length) return { ok: false, msg: '至少需要一个效果' };
  for (const e of sk.effects) {
    if (!e.type) return { ok: false, msg: '效果类型不能为空' };
  }
  return { ok: true };
}

function create(sk) {
  const v = validate(sk);
  if (!v.ok) return v;
  const list = load();
  const id = sk.id || 'cskill_' + Date.now().toString(36) + Math.floor(Math.random() * 100);
  const skill = { id, ...sk };
  const idx = list.findIndex(s => s.id === id);
  if (idx >= 0) list[idx] = skill; else list.push(skill);
  save(list);
  return { ok: true, value: skill };
}

function remove(id) {
  const list = load();
  const idx = list.findIndex(s => s.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  save(list);
  return true;
}

module.exports = { load, save, create, remove, validate };
