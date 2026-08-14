// 自定义技能持久化
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'custom-skills.json');

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; }
}

function save(list) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

const EFFECT_TYPES = ['drawCards', 'discardCards', 'damage', 'recover', 'recoverTarget', 'gainCard', 'discardTarget', 'discardTargetMulti', 'skipPhase', 'extraSha', 'addMark', 'removeMark', 'changeHpMax', 'peekTop', 'revealHand', 'stealCard', 'damageAll', 'healAll', 'drawForAll', 'discardAll', 'reduceDamage', 'reflectDamage', 'lock', 'extraPhase', 'immunity', 'swapHand'];
const TRIGGERS = ['phase:start', 'phase:draw', 'phase:play', 'phase:discard', 'phase:end', 'damage:after', 'damage:deal', 'loseHp', 'recover', 'die', 'kill', 'die:any'];

function validate(sk) {
  if (!sk.name || sk.name.length < 1 || sk.name.length > 6) return { ok: false, msg: '技能名称需为 1~6 个字符' };
  if (!sk.trigger || !TRIGGERS.includes(sk.trigger)) return { ok: false, msg: '触发时机不合法' };
  if (!Array.isArray(sk.effects) || !sk.effects.length || sk.effects.length > 4) return { ok: false, msg: '需 1~4 个效果' };
  for (const e of sk.effects) {
    if (!e.type || !EFFECT_TYPES.includes(e.type)) return { ok: false, msg: '效果类型不合法：' + e.type };
    const v = e.params && e.params.value;
    if (v != null) {
      if (typeof v !== 'number' || !isFinite(v)) return { ok: false, msg: '效果数值需为数字' };
      const bounded = ['damage', 'damageAll', 'recover', 'recoverTarget', 'healAll', 'drawCards', 'drawForAll', 'discardCards', 'discardTargetMulti', 'changeHpMax', 'extraSha'];
      if (bounded.includes(e.type) && (v < -5 || v > 5)) return { ok: false, msg: '效果数值超出范围' };
    }
  }
  return { ok: true };
}

function create(sk) {
  const v = validate(sk);
  if (!v.ok) return v;
  const list = load();
  // 服务端生成 id，不允许客户端指定 id 覆盖他人技能
  const id = 'cskill_' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  const skill = { id, ...sk };
  skill.id = id;
  list.push(skill);
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
