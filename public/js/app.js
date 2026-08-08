// ============ 三国杀客户端 ============
(() => {
'use strict';

// ---------- 全局状态 ----------
let ws = null;
let myPid = localStorage.getItem('sgk_pid') || null;
let myName = localStorage.getItem('sgk_name') || '';
let roomState = null;
let gameState = null;
let _myTurnSound = false; // 回合开始语音去重：不随 gameState 同步重置
let meta = null; // {generals, diySkills, customs}
let view = 'home';
// 本地选择状态
let sel = freshSel();
let lastPromptKey = null;
let modalPromptKey = null;
function freshSel() { return { hand: [], mode: null, skill: null, targets: [], zhangbaRespond: false }; }
function promptKey(pr) {
  if (!pr) return null;
  return pr.kind + '|' + (pr.title || '') + '|' + (pr.need || '');
}

const $ = id => document.getElementById(id);
const SUIT = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
const RANK = r => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[r] || r);
const KINGDOM_NAME = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', god: '神' };
const IDENTITY_NAME = { zhu: '主公', zhong: '忠臣', fan: '反贼', nei: '内奸', landlord: '地主', farmer: '农民', cold: '冷色', warm: '暖色' };
const isRed = c => c.suit === 'heart' || c.suit === 'diamond';

// ============ 自定义技能编辑器 ============
let skillEditor = null;
let customSkills = [];
try { customSkills = JSON.parse(localStorage.getItem('sgk_custom_skills') || '[]'); } catch {}

function initSkillEditor() {
  if (typeof SkillEditor === 'undefined') return;
  skillEditor = new SkillEditor();
  skillEditor.onChange = updateSkillEditorPreview;
  renderTriggerOptions();
  renderConditionOptions();
  renderLimitationOptions();
  renderCostOptions();
  renderCustomSkillList();
  updateSkillEditorPreview();
}

function renderTriggerOptions() {
  const box = $('se-triggers');
  if (!box) return;
  box.innerHTML = '';
  window.SKILL_DSL.TRIGGERS.forEach(t => {
    const div = document.createElement('div');
    div.className = 'se-opt' + (skillEditor.skill.trigger === t.id ? ' selected' : '');
    div.innerHTML = `<div>${t.label}</div><div class="optdesc">${t.desc}</div>`;
    div.addEventListener('click', () => {
      skillEditor.skill.trigger = t.id;
      skillEditor.notify();
      renderTriggerOptions();
    });
    box.appendChild(div);
  });
}

function renderConditionOptions() {
  const box = $('se-condition-type');
  if (!box) return;
  box.innerHTML = '';
  window.SKILL_DSL.CONDITIONS.forEach(c => {
    const div = document.createElement('div');
    div.className = 'se-opt' + (skillEditor.skill.condition.type === c.id ? ' selected' : '');
    div.innerHTML = `<div>${c.label}</div><div class="optdesc">${c.desc}</div>`;
    div.addEventListener('click', () => {
      skillEditor.skill.condition.type = c.id;
      skillEditor.skill.condition.params = {};
      skillEditor.notify();
      renderConditionOptions();
      renderConditionParams();
    });
    box.appendChild(div);
  });
  renderConditionParams();
}

function renderConditionParams() {
  const box = $('se-condition-params');
  if (!box) return;
  box.innerHTML = '';
  const condDef = window.SKILL_DSL.CONDITIONS.find(c => c.id === skillEditor.skill.condition.type);
  if (!condDef || !condDef.params.length) return;
  condDef.params.forEach(p => {
    const val = skillEditor.skill.condition.params[p.key] ?? p.default;
    if (p.type === 'select') {
      const label = document.createElement('label');
      label.textContent = p.label;
      const sel = document.createElement('select');
      p.options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.v; opt.textContent = o.l;
        if (o.v == val) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => {
        skillEditor.skill.condition.params[p.key] = sel.value;
        skillEditor.notify();
      });
      label.appendChild(sel);
      box.appendChild(label);
    } else {
      const label = document.createElement('label');
      label.textContent = p.label;
      const inp = document.createElement('input');
      inp.type = p.type === 'number' ? 'number' : 'text';
      inp.value = val;
      if (p.min != null) inp.min = p.min;
      if (p.max != null) inp.max = p.max;
      inp.addEventListener('input', () => {
        const v = p.type === 'number' ? (+inp.value || p.default) : inp.value;
        skillEditor.skill.condition.params[p.key] = v;
        skillEditor.notify();
      });
      label.appendChild(inp);
      box.appendChild(label);
    }
  });
}

function renderLimitationOptions() {
  const box = $('se-limitations');
  if (!box) return;
  box.innerHTML = '';
  window.SKILL_DSL.LIMITATIONS.forEach(l => {
    const div = document.createElement('div');
    div.className = 'se-opt' + (skillEditor.skill.limitation === l.id ? ' selected' : '');
    div.innerHTML = `<div>${l.label}</div><div class="optdesc">${l.desc}</div>`;
    div.addEventListener('click', () => {
      skillEditor.skill.limitation = l.id;
      skillEditor.notify();
      renderLimitationOptions();
    });
    box.appendChild(div);
  });
}

function renderCostOptions() {
  const box = $('se-costs');
  if (!box) return;
  box.innerHTML = '';
  const costs = [{ id: null, label: '无消耗', desc: '发动时不付出代价' }, ...window.SKILL_DSL.LIMITATIONS.filter(l => l.cost)];
  costs.forEach(c => {
    const div = document.createElement('div');
    div.className = 'se-opt' + (skillEditor.skill.cost === c.id ? ' selected' : '');
    div.innerHTML = `<div>${c.label}</div><div class="optdesc">${c.desc}</div>`;
    div.addEventListener('click', () => {
      skillEditor.skill.cost = c.cost || null;
      skillEditor.notify();
      renderCostOptions();
    });
    box.appendChild(div);
  });
}

function renderEffectCard(index) {
  const box = $('se-effects');
  if (!box) return;
  const effects = skillEditor.skill.effects;
  if (index >= effects.length) return;
  const e = effects[index];
  const def = window.SKILL_DSL.EFFECTS.find(x => x.id === e.type);
  const card = document.createElement('div');
  card.className = 'se-effect-card';
  card.dataset.idx = index;

  let paramsHtml = '';
  if (def && def.params) {
    paramsHtml = def.params.map(p => {
      const val = e.params[p.key] ?? p.default;
      if (p.type === 'select') {
        const opts = p.options.map(o => `<option value="${o.v}" ${o.v == val ? 'selected' : ''}>${o.l}</option>`).join('');
        return `<label>${p.label} <select data-key="${p.key}">${opts}</select></label>`;
      }
      return `<label>${p.label} <input type="${p.type === 'number' ? 'number' : 'text'}" data-key="${p.key}" value="${val}" ${p.min != null ? 'min="' + p.min + '"' : ''} ${p.max != null ? 'max="' + p.max + '"' : ''}></label>`;
    }).join('');
  }

  card.innerHTML = `
    <div class="ef-header">
      <span class="ef-name">${def ? def.label : e.type}</span>
      <span class="ef-remove" data-idx="${index}">✕</span>
    </div>
    <div class="ef-params">${paramsHtml}</div>`;

  box.appendChild(card);
}

function renderAllEffects() {
  const box = $('se-effects');
  if (!box) return;
  box.innerHTML = '';
  skillEditor.skill.effects.forEach((e, i) => {
    renderEffectCard(i);
  });
  box.querySelectorAll('.ef-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      skillEditor.skill.effects.splice(idx, 1);
      skillEditor.notify();
      renderAllEffects();
      updateSkillEditorPreview();
    });
  });
  box.querySelectorAll('.ef-params input, .ef-params select').forEach(inp => {
    inp.addEventListener('change', () => {
      const card = inp.closest('.se-effect-card');
      const idx = +card.dataset.idx;
      const key = inp.dataset.key;
      const val = inp.type === 'number' ? (+inp.value || 0) : inp.value;
      if (!skillEditor.skill.effects[idx].params) skillEditor.skill.effects[idx].params = {};
      skillEditor.skill.effects[idx].params[key] = val;
      updateSkillEditorPreview();
    });
  });
}

function renderCustomSkillList() {
  const box = $('se-list');
  if (!box) return;
  box.innerHTML = '';
  if (!customSkills.length) { box.innerHTML = '<div class="hint">还没有自定义技能</div>'; return; }
  customSkills.forEach((sk, i) => {
    const div = document.createElement('div');
    div.className = 'se-list-item';
    div.innerHTML = `
      <span class="lname">${sk.name}</span>
      <span class="lactions">
        <button class="btn btn-small" data-act="edit" data-idx="${i}">编辑</button>
        <button class="btn btn-small" data-act="del" data-idx="${i}">删除</button>
      </span>`;
    box.appendChild(div);
  });
  box.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      if (btn.dataset.act === 'edit') {
        skillEditor.setSkill(JSON.parse(JSON.stringify(customSkills[idx])));
        syncEditorUI();
        updateSkillEditorPreview();
      } else if (btn.dataset.act === 'del') {
        customSkills.splice(idx, 1);
        saveCustomSkills();
        renderCustomSkillList();
      }
    });
  });
}

function syncEditorUI() {
  renderTriggerOptions();
  renderConditionOptions();
  renderLimitationOptions();
  renderCostOptions();
  renderAllEffects();
  const nameInput = $('se-name');
  if (nameInput) nameInput.value = skillEditor.skill.name;
  const typeSelect = $('se-type');
  if (typeSelect) typeSelect.value = skillEditor.skill.type;
}

function updateSkillEditorPreview() {
  if (!skillEditor) return;
  const preview = $('se-preview');
  const json = $('se-json');
  if (preview) preview.textContent = skillEditor.generateDesc();
  if (json) json.textContent = skillEditor.toJSON();
}

function saveCustomSkills() {
  localStorage.setItem('sgk_custom_skills', JSON.stringify(customSkills));
}

$('btn-skilleditor-back')?.addEventListener('click', () => showView('home'));
$('btn-add-effect')?.addEventListener('click', () => openEffectPicker());
$('btn-se-save')?.addEventListener('click', () => {
  const err = skillEditor.validate();
  if (err) { const m = $('se-msg'); if (m) m.textContent = '❌ ' + err; return; }
  const sk = skillEditor.getSkill();
  const existing = customSkills.findIndex(s => s.id === sk.id);
  if (existing >= 0) customSkills[existing] = sk; else customSkills.push(sk);
  saveCustomSkills();
  renderCustomSkillList();
  const m = $('se-msg'); if (m) m.textContent = '✅ 已保存：' + sk.name;
});
$('btn-se-test')?.addEventListener('click', () => {
  const m = $('se-msg'); if (m) m.textContent = '💡 在对局中装备此技能即可测试效果';
});
$('btn-se-clear')?.addEventListener('click', () => {
  skillEditor.setSkill(skillEditor.createEmptySkill());
  syncEditorUI();
  updateSkillEditorPreview();
});

function openEffectPicker() {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.style.zIndex = '350';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '500px';
  modal.innerHTML = `<div class="modal-title">选择效果</div><div class="se-options" style="max-height:400px"></div>`;
  const opts = modal.querySelector('.se-options');
  window.SKILL_DSL.EFFECTS.forEach(e => {
    const div = document.createElement('div');
    div.className = 'se-opt';
    div.innerHTML = `<div>${e.label}</div><div class="optdesc">${e.desc}</div>`;
    div.addEventListener('click', () => {
      skillEditor.skill.effects.push({ type: e.type, params: { ...getDefaultParams(e) }, needTarget: !!e.needTarget });
      renderAllEffects();
      updateSkillEditorPreview();
      mask.remove();
    });
    opts.appendChild(div);
  });
  mask.appendChild(modal);
  document.body.appendChild(mask);
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

function getDefaultParams(effectDef) {
  const p = {};
  (effectDef.params || []).forEach(pp => { p[pp.key] = pp.default; });
  return p;
}

// 名称和类型绑定
const _seName = $('se-name');
if (_seName) _seName.addEventListener('input', () => { skillEditor.skill.name = _seName.value; updateSkillEditorPreview(); });
const _seType = $('se-type');
if (_seType) _seType.addEventListener('change', () => { skillEditor.skill.type = _seType.value; });

// ---------- 连接 ----------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'hello', name: myName || '无名氏', pid: myPid }));
  };
  ws.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handle(msg);
  };
  ws.onclose = () => {
    toast('连接断开，2秒后重连…');
    setTimeout(connect, 2000);
  };
}

function send(msg) {
  // 观战者只读：拦截游戏操作（弹幕/退出除外），避免用户困惑"无法操作"
  if (isSpectating && msg.type !== 'danmaku' && msg.type !== 'leaveRoom') {
    toast('观战模式无法操作，请点击「退出观战」');
    return;
  }
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function handle(msg) {
  switch (msg.type) {
    case 'welcome':
      myPid = msg.pid;
      localStorage.setItem('sgk_pid', myPid);
      break;
    case 'rooms':
      renderRoomList(msg.rooms);
      break;
    case 'room':
      roomState = msg.room;
      if (msg.room.state === 'lobby' && view === 'game') {
        gameState = null;
        closeModal();
        showView('lobby');
      }
      if (view === 'lobby') renderLobby();
      break;
    case 'game': {
      gameState = msg.state;
      // 新对局开始（选将阶段）：清空上一局遗留的身份标记，避免误导本局判断
      if (msg.state.phase === 'picking') {
        try { localStorage.removeItem(ID_MARKS_KEY); } catch (e) {}
      }
      if (view !== 'game') showView('game');
      const key = promptKey(gameState.pendingForMe);
      if (key !== lastPromptKey) { sel = freshSel(); lastPromptKey = key; hideTurnTimer(); }
      if (window.renderScheduler) {
        window.renderScheduler.schedule(() => renderGame());
      } else {
        renderGame();
      }
      break;
    }
    case 'prompt': {
      if (gameState) {
        gameState.pendingForMe = msg.prompt;
        const key = promptKey(msg.prompt);
        if (key !== lastPromptKey) { sel = freshSel(); lastPromptKey = key; }
        if (window.renderScheduler) {
          window.renderScheduler.schedule(() => renderGame());
        } else {
          renderGame();
        }
      }
      break;
    }
    case 'event':
      handleEvent(msg.event);
      break;
    case 'batch': {
      for (const m of msg.messages) handle(m);
      break;
    }
    case 'stateSame':
      break;
    case 'timer':
      showTurnTimer(msg.remaining);
      break;
    case 'danmaku':
      if (msg.msg) spawnDanmaku(msg.msg.name, msg.msg.text);
      break;
    case 'spectator':
      showSpectatorCount(msg.count);
      break;
    case 'toast':
    case 'error':
      toast(msg.msg);
      break;
    case 'kicked':
      toast('你已被移出房间');
      roomState = null; gameState = null;
      showView('home');
      break;
  }
}

// ---------- 工具 ----------
let toastTimer = null;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2400);
}
function showView(v) {
  view = v;
  closeIdMarkMenu();
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  $('view-' + v).classList.add('active');
  if (v === 'diy') loadDiy();
  // 切换背景音乐场景
  if (sound) {
    try {
      if (v === 'game') sound.setScene('battle');
      else if (v === 'stats' || v === 'skilleditor') sound.setScene('menu');
      else sound.setScene('menu');
    } catch (e) {}
  }
}
function openModal(html) {
  $('modal').innerHTML = html;
  $('modal-mask').classList.remove('hidden');
}
function closeModal() { $('modal-mask').classList.add('hidden'); modalPromptKey = null; }
$('modal-mask').addEventListener('click', e => { if (e.target === $('modal-mask')) closeModal(); });

function avatarImg(id, cls) {
  const img = document.createElement('img');
  img.className = cls || '';
  // 先绑定 onerror 再设置 src：部分浏览器在元素插入 DOM 前设置 src 会立即发起请求，
  // 若 onerror 尚未绑定，png 404 后不会回退到 svg，导致头像空白。
  img.onerror = () => { img.onerror = null; img.src = `/assets/avatars/${id}.svg`; };
  img.src = `/assets/avatars/${id}.png`;
  return img;
}

function cardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card ' + (isRed(card) ? 'red' : 'black') + (opts.small ? ' small' : '') + (opts.selected ? ' selected' : '') + (opts.unplayable ? ' unplayable' : '');
  const typeName = { basic: '基本', trick: '锦囊', equip: '装备' }[card.type] || '';
  el.innerHTML = `<div class="ctype">${typeName}</div><div class="cname">${card.name}</div>
    <div class="csuit">${SUIT[card.suit]}</div><div class="crank">${RANK(card.rank)}</div>`;
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}

function hpHtml(hp, maxHp) {
  let s = '';
  for (let i = 0; i < maxHp; i++) s += `<span class="${i < hp ? 'hp-full' : 'hp-low'}">❤</span>`;
  return s;
}

// ============ 主页 ============
$('input-name').value = myName;
$('input-name').addEventListener('input', e => {
  myName = e.target.value.trim();
  localStorage.setItem('sgk_name', myName);
});
$('btn-create').addEventListener('click', () => {
  if (!myName) return toast('先输入昵称');
  send({ type: 'hello', name: myName, pid: myPid });
  send({ type: 'createRoom' });
  showView('lobby');
});
$('btn-refresh').addEventListener('click', () => send({ type: 'hello', name: myName, pid: myPid }));
$('btn-diy').addEventListener('click', () => showView('diy'));
$('btn-skilleditor-tab')?.addEventListener('click', () => showView('skilleditor'));
$('btn-cardeditor-tab')?.addEventListener('click', () => showView('cardeditor'));
$('btn-stats')?.addEventListener('click', () => { renderStats(); showView('stats'); });
$('btn-achievements')?.addEventListener('click', openAchievements);
$('btn-tutorial')?.addEventListener('click', openTutorial);
$('btn-stats-back')?.addEventListener('click', () => showView('home'));
$('btn-clear-stats')?.addEventListener('click', () => { if (confirm('确定清除所有战绩数据？')) { window.SGKData.clearData(); renderStats(); } });

function renderRoomList(rooms) {
  const box = $('room-list');
  if (!rooms || !rooms.length) {
    box.innerHTML = '<div class="empty">暂无房间，创建一个吧</div>';
    return;
  }
  box.innerHTML = '';
  for (const r of rooms) {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML = `<span><span class="rname">${esc(r.name)}</span><span class="rinfo">${r.players}/${r.maxPlayers} 人 · ${r.state === 'lobby' ? '等待中' : '游戏中'}</span></span>`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-small';
    btn.textContent = '加入';
    btn.disabled = r.state !== 'lobby';
    btn.addEventListener('click', () => {
      if (!myName) return toast('先输入昵称');
      send({ type: 'hello', name: myName, pid: myPid });
      send({ type: 'joinRoom', roomId: r.id });
      showView('lobby');
    });
    div.appendChild(btn);
    // 观战按钮
    if (r.state === 'playing' || r.state === 'ended') {
      const spectBtn = document.createElement('button');
      spectBtn.className = 'btn btn-small';
      spectBtn.textContent = `👁 观战`;
      spectBtn.addEventListener('click', () => {
        if (!myName) return toast('先输入昵称');
        send({ type: 'hello', name: myName, pid: myPid });
        send({ type: 'spectateRoom', roomId: r.id });
        showView('game');
      });
      div.appendChild(spectBtn);
    }
    box.appendChild(div);
  }
}
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

// ============ 音效与配音 ============
let audio = null;
let sound = null;
async function initAudio() {
  try {
    const r = await fetch('/api/meta');
    window._SGK_META = await r.json();
  } catch { window._SGK_META = { generals: [], diySkills: [], customs: [] }; }
  audio = new AudioManager();
  const enabled = localStorage.getItem('sgk_audio_enabled') !== 'false';
  const vol = parseFloat(localStorage.getItem('sgk_audio_volume') || '0.7');
  audio.setEnabled(enabled);
  audio.setVolume(vol);
  // 初始化音效管理器
  if (typeof SoundManager !== 'undefined') {
    sound = new SoundManager();
    window._sound = sound;
  }
  const icon = $('audio-icon');
  const slider = $('audio-volume');
  const ctl = $('audio-control');
  slider.value = Math.round(vol * 100);
  const renderIcon = () => { icon.textContent = audio.enabled ? '🔊' : '🔇'; ctl.classList.toggle('muted', !audio.enabled); };
  renderIcon();
  ctl.addEventListener('click', e => {
    if (e.target === slider) return;
    audio.init();
    audio.setEnabled(!audio.enabled);
    renderIcon();
    // 同时控制音效管理器
    if (sound) sound.setSfxEnabled(audio.enabled);
  });
  slider.addEventListener('input', e => {
    audio.setVolume(+e.target.value / 100);
    if (sound) sound.setSfxVolume(+e.target.value / 100);
  });
  // 设置按钮
  const settingsBtn = document.createElement('span');
  settingsBtn.textContent = '⚙';
  settingsBtn.style.cssText = 'cursor:pointer;font-size:14px;margin-left:4px;';
  settingsBtn.addEventListener('click', e => { e.stopPropagation(); toggleSoundSettings(); });
  ctl.appendChild(settingsBtn);
  // 任意用户交互后解锁音频上下文（浏览器策略）
  document.addEventListener('click', () => { if (audio) audio.init(); if (sound) sound.bgm.ensureCtx(); }, { once: true });
}

// ============ 音效设置面板 ============
function toggleSoundSettings() {
  const panel = $('sound-settings');
  if (!panel) return;
  const isHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !isHidden);
  if (isHidden) renderSoundSettings();
}

function renderSoundSettings() {
  if (typeof SoundManager === 'undefined' || !sound) return;
  // 音效包
  const packSel = $('ss-pack');
  if (packSel) {
    packSel.innerHTML = '';
    for (const [id, info] of Object.entries(SOUND_PACKS)) {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = `${info.name} - ${info.desc}`;
      if (id === sound.pack) opt.selected = true;
      packSel.appendChild(opt);
    }
    packSel.onchange = () => sound.setPack(packSel.value);
  }
  // 开关
  const bgmCb = $('ss-bgm');
  const sfxCb = $('ss-sfx');
  const bgmVol = $('ss-bgm-vol');
  const sfxVol = $('ss-sfx-vol');
  if (bgmCb) { bgmCb.checked = sound.bgmEnabled; bgmCb.onchange = () => sound.setBgmEnabled(bgmCb.checked); }
  if (sfxCb) { sfxCb.checked = sound.sfxEnabled; sfxCb.onchange = () => sound.setSfxEnabled(sfxCb.checked); }
  if (bgmVol) { bgmVol.value = Math.round(sound.bgmVolume * 100); bgmVol.oninput = () => sound.setBgmVolume(+bgmVol.value / 100); }
  if (sfxVol) { sfxVol.value = Math.round(sound.sfxVolume * 100); sfxVol.oninput = () => sound.setSfxVolume(+sfxVol.value / 100); }
  const closeBtn = $('ss-close');
  if (closeBtn) closeBtn.onclick = () => toggleSoundSettings();
}
// 音频/语音调用统一隔离异常：浏览器自动播放策略、speechSynthesis 限制等可能抛错，
// 绝不能中断渲染链（否则 prompt 不显示 → 真人无法响应 → 游戏挂起）
function sfx(name) { try { if (audio) audio.playSfx(name); } catch (e) {} }
function voice(generalId, kind, skillId) { try { if (audio) audio.playVoice(generalId, kind, skillId); } catch (e) {} }

// ============ 新手引导 ============
const TUTORIAL_STEPS = [
  { title: '🎮 欢迎来到三国杀！', content: '<h3>基本规则</h3><ul><li><b>身份</b>：每局游戏中，玩家分为<b>主公</b>、<b>忠臣</b>、<b>反贼</b>、<b>内奸</b>四种身份，各怀目的</li><li><b>胜利条件</b>：主公+忠臣获胜需消灭所有反贼和内奸；反贼只需击杀主公；内奸需最后存活并亲手击杀主公</li><li><b>回合</b>：每位玩家轮流行动，每回合依次进行：<b>准备阶段→判定阶段→摸牌阶段→出牌阶段→弃牌阶段→结束阶段</b></li></ul>' },
  { title: '🎯 选将与准备', content: '<h3>选将</h3><ul><li>进入游戏后，系统会随机分配武将供你选择（或自由点将）</li><li>每位武将拥有 <b>1~2 个技能</b>，技能说明在选将界面和游戏中都可查看</li><li>主公会获得 <b>+1 体力上限</b></li><li>开局每人摸 <b>4 张手牌</b></li></ul><h3>身份分配</h3><ul><li>主公身份公开，其他人身份隐藏</li><li>4人局：1主1忠2反 | 5人局：1主1忠2反1内 | 6~8人局依此类推</li></ul>' },
  { title: '🃏 出牌阶段', content: '<h3>基本操作</h3><ul><li>点击手牌选中 → 上方出现操作条 → 点击使用方式（如「杀」「武圣·红牌当杀」）→ 选择目标 → 点确定</li><li>每回合只能使用 <b>1次杀</b>（连弩除外），锦囊和装备无次数限制</li><li>出牌阶段可随时点「结束出牌」</li></ul><h3>卡牌类型</h3><ul><li><b>杀</b>：对攻击范围内角色使用，目标需出「闪」</li><li><b>闪</b>：抵消杀的效果</li><li><b>桃</b>：回复1点体力（或在他人濒死时救助）</li><li><b>锦囊</b>：各种策略牌（决斗/过河拆桥/无懈可击等）</li><li><b>装备</b>：武器/防具/坐骑，持续生效</li></ul>' },
  { title: '⚔️ 战斗与结算', content: '<h3>伤害与濒死</h3><ul><li>受到伤害后体力降至0以下 → 进入<b>濒死状态</b></li><li>濒死时，所有玩家依次可打出「桃」救助</li><li>被击杀后揭示身份，执行奖惩（杀反贼摸3张牌，主杀忠弃全部牌）</li></ul><h3>判定阶段</h3><ul><li>「乐不思蜀」「闪电」等延时锦囊在此阶段判定</li><li>判定牌从牌堆顶翻开，结果决定是否生效</li></ul>' },
  { title: '🧠 技能与策略', content: '<h3>技能类型</h3><ul><li><b>主动技</b>：出牌阶段按钮发动（如刘备「仁德」、黄盖「苦肉」）</li><li><b>触发技</b>：满足条件自动触发（如郭嘉「遗计」、甄姬「洛神」）</li><li><b>转化技</b>：将一张牌当另一张使用（如关羽「武圣」：红牌当杀）</li><li><b>锁定技</b>：始终生效（如张飞「咆哮」：无限出杀）</li></ul><h3>实用技巧</h3><ul><li>手牌上限 = 当前体力值，多的牌要弃掉</li><li>距离限制：杀只能打到攻击范围内的目标</li><li>无懈可击可抵消锦囊效果，且可连锁使用</li></ul>' },
  { title: '⌨️ 快捷键 & 提示', content: '<h3>快捷键</h3><ul><li><b>1~0</b>：选第1~10张手牌</li><li><b>Enter/Space</b>：确定</li><li><b>Esc</b>：取消</li><li><b>Q/E</b>：切换出牌方式</li><li><b>Tab</b>：切换目标</li><li><b>X</b>：结束出牌</li><li><b>F1~F4</b>：发动技能</li><li><b>H</b>：显示帮助 | <b>M</b>：静音</li></ul><h3>开始游戏</h3><ul><li>创建房间 → 添加AI或邀请好友 → 开始游戏！</li><li>可以先单人加AI练习，熟悉后再联机对战</li></ul>' },
];

let tutorialStep = 0;
function openTutorial() {
  tutorialStep = 0;
  $('tutorial-overlay').classList.remove('hidden');
  renderTutorialStep();
}
function closeTutorial() {
  $('tutorial-overlay').classList.add('hidden');
  localStorage.setItem('sgk_tutorial_done', 'true');
}
function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStep];
  const content = $('tutorial-content');
  const progress = $('tutorial-progress');
  const prev = $('tutorial-prev');
  const next = $('tutorial-next');
  if (!content) return;
  content.innerHTML = `<h3>${step.title}</h3>${step.content}`;
  if (progress) progress.textContent = `${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;
  if (prev) prev.disabled = tutorialStep === 0;
  if (next) next.textContent = tutorialStep === TUTORIAL_STEPS.length - 1 ? '完成' : '下一步';
}
$('tutorial-prev')?.addEventListener('click', () => { if (tutorialStep > 0) { tutorialStep--; renderTutorialStep(); } });
$('tutorial-next')?.addEventListener('click', () => {
  if (tutorialStep < TUTORIAL_STEPS.length - 1) { tutorialStep++; renderTutorialStep(); }
  else closeTutorial();
});
$('tutorial-close')?.addEventListener('click', closeTutorial);

// ============ 成就系统 ============
const ACHIEVEMENTS = [
  { id: 'first_win', name: '初露锋芒', desc: '赢得第一场对局', icon: '🏆', check: s => (s.wins || 0) >= 1 },
  { id: 'win_streak3', name: '三连胜', desc: '连续获胜3场', icon: '🔥', check: s => (s.maxStreak || 0) >= 3 },
  { id: 'win_streak5', name: '五连胜', desc: '连续获胜5场', icon: '🔥', check: s => (s.maxStreak || 0) >= 5 },
  { id: 'play_10', name: '老玩家', desc: '完成10场对局', icon: '⚔️', check: s => (s.totalGames || 0) >= 10 },
  { id: 'play_50', name: '身经百战', desc: '完成50场对局', icon: '🏅', check: s => (s.totalGames || 0) >= 50 },
  { id: 'lord_win', name: '君临天下', desc: '以主公身份获胜', icon: '👑', check: s => (s.lordWins || 0) >= 1 },
  { id: 'nei_win', name: '忍者无敌', desc: '以内奸身份获胜', icon: '🦊', check: s => (s.neiWins || 0) >= 1 },
  { id: 'first_blood', name: '一血', desc: '获得第一次击杀', icon: '🗡️', check: s => (s.firstBlood || 0) >= 1 },
  { id: 'three_kills', name: '三连杀', desc: '单局获得3次击杀', icon: '💀', check: s => (s.maxKills || 0) >= 3 },
  { id: 'healer', name: '医者仁心', desc: '累计治疗100点体力', icon: '💚', check: s => (s.totalHeal || 0) >= 100 },
  { id: 'destroyer', name: '破坏王', desc: '累计造成500点伤害', icon: '💥', check: s => (s.totalDamage || 0) >= 500 },
  { id: 'diy_master', name: 'DIY大师', desc: '创建5个以上自定义武将', icon: '🎨', check: s => (s.diyCount || 0) >= 5 },
  { id: 'card_master', name: '记牌大师', desc: '使用过所有108张标准牌', icon: '📊', check: s => (s.uniqueCards || 0) >= 108 },
  { id: 'fast_win', name: '闪电战', desc: '5回合内获胜', icon: '⚡', check: s => (s.minWinRound || 999) <= 5 },
  { id: 'survivor', name: '九命猫', desc: '从濒死状态被救回5次', icon: '🐱', check: s => (s.saves || 0) >= 5 },
  { id: 'full_general', name: '百将录', desc: '使用过25个不同武将', icon: '📜', check: s => (s.uniqueGenerals || 0) >= 25 },
];

let achievements = {};
try { achievements = JSON.parse(localStorage.getItem('sgk_achievements') || '{}'); } catch {}

function checkAchievements(stats) {
  let newUnlocks = [];
  ACHIEVEMENTS.forEach(a => {
    if (!achievements[a.id] && a.check(stats)) {
      achievements[a.id] = { unlockedAt: Date.now() };
      newUnlocks.push(a);
    }
  });
  localStorage.setItem('sgk_achievements', JSON.stringify(achievements));
  // 显示新解锁通知
  newUnlocks.forEach(a => showAchievementToast(a));
  return newUnlocks;
}

function showAchievementToast(ach) {
  const toast = $('achievement-toast');
  const text = $('ach-toast-text');
  if (!toast || !text) return;
  text.textContent = `解锁成就：${ach.icon} ${ach.name} — ${ach.desc}`;
  toast.classList.remove('hidden');
  sfx('win');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function openAchievements() {
  $('achievement-panel').classList.remove('hidden');
  renderAchievements();
}

function renderAchievements() {
  const stats = window.SGKData?.getStats() || {};
  const list = $('ach-list');
  const statsBox = $('ach-stats');
  if (!list) return;
  // 统计
  const unlocked = Object.keys(achievements).length;
  if (statsBox) {
    statsBox.innerHTML = `
      <div class="ach-stat"><div class="aval">${unlocked}</div><div class="alabel">已解锁</div></div>
      <div class="ach-stat"><div class="aval">${ACHIEVEMENTS.length}</div><div class="alabel">总数</div></div>
      <div class="ach-stat"><div class="aval">${Math.round(unlocked / ACHIEVEMENTS.length * 100)}%</div><div class="alabel">完成度</div></div>`;
  }
  list.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const done = !!achievements[a.id];
    const div = document.createElement('div');
    div.className = 'ach-item' + (done ? ' unlocked' : '');
    div.innerHTML = `<div class="ach-name">${a.icon} ${a.name}${done ? ' ✅' : ''}</div>
      <div class="ach-desc">${a.desc}</div>`;
    list.appendChild(div);
  });
}

$('ach-close')?.addEventListener('click', () => $('achievement-panel').classList.add('hidden'));

// ============ 卡牌计数器 ============
let cardCounter = null;
function initCardCounter() {
  if (typeof CardCounter === 'undefined') return;
  if (!cardCounter) cardCounter = new CardCounter();
  else cardCounter.reset();
  // 绑定面板开关
  const panel = $('card-counter-panel');
  const title = $('ccp-title');
  const content = $('ccp-content');
  if (panel && title && content) {
    // 默认显示
    if (cardCounter.enabled) panel.classList.remove('hidden');
    title.addEventListener('click', () => {
      content.classList.toggle('hidden');
      $('ccp-toggle').textContent = content.classList.contains('hidden') ? '▶' : '▼';
    });
  }
}

function updateCardCounter() {
  if (!cardCounter || !gameState || !cardCounter.enabled) return;
  const panel = $('card-counter-panel');
  if (panel) panel.classList.remove('hidden');

  // 更新手牌数
  gameState.players.forEach(p => cardCounter.updatePlayerHand(p.seat, p.handCount));

  // 关键牌
  const keyCards = cardCounter.getKeyCards();
  const keyBox = $('ccp-keycards');
  if (keyBox) {
    const names = { sha: '杀', shan: '闪', tao: '桃', wuxie: '无懈', juedou: '决斗', nanman: '南蛮', wanjian: '万箭', lebu: '乐不', shandian: '闪电' };
    keyBox.innerHTML = Object.entries(keyCards).map(([k, v]) =>
      `<div class="ccp-keycard"><span class="kname">${names[k] || k}</span><span class="kcount ${v === 0 ? 'zero' : ''}">${v}</span></div>`
    ).join('');
  }

  // 已出牌
  const played = cardCounter.getPlayedStats();
  const playedBox = $('ccp-played');
  if (playedBox) {
    const names = { sha: '杀', shan: '闪', tao: '桃', juedou: '决斗', guohe: '过拆', shunshou: '顺手', wuzhong: '无中', nanman: '南蛮', wanjian: '万箭', wugu: '五谷', taoyuan: '桃园', jiedao: '借刀', wuxie: '无懈', lebu: '乐不', shandian: '闪电' };
    playedBox.innerHTML = Object.entries(played).map(([k, v]) =>
      `<span class="ccp-played-item">${names[k] || k}×${v}</span>`
    ).join('');
  }

  // 牌堆信息
  const deckBox = $('ccp-deck');
  if (deckBox) {
    deckBox.innerHTML = `剩余: <span>${gameState.deckCount}</span> 张 | 总手牌: <span>${cardCounter.getTotalHandCards()}</span> 张`;
  }

  // 同步到侧栏记牌 tab
  const sKeyBox = $('side-ccp-keycards');
  if (sKeyBox) {
    const names = { sha: '杀', shan: '闪', tao: '桃', wuxie: '无懈', juedou: '决斗', nanman: '南蛮', wanjian: '万箭', lebu: '乐不', shandian: '闪电' };
    sKeyBox.innerHTML = Object.entries(keyCards).map(([k, v]) =>
      `<div class="ccp-keycard"><span class="kname">${names[k] || k}</span><span class="kcount ${v === 0 ? 'zero' : ''}">${v}</span></div>`
    ).join('');
  }
  const sPlayedBox = $('side-ccp-played');
  if (sPlayedBox) {
    const names = { sha: '杀', shan: '闪', tao: '桃', juedou: '决斗', guohe: '过拆', shunshou: '顺手', wuzhong: '无中', nanman: '南蛮', wanjian: '万箭', wugu: '五谷', taoyuan: '桃园', jiedao: '借刀', wuxie: '无懈', lebu: '乐不', shandian: '闪电' };
    sPlayedBox.innerHTML = Object.entries(played).map(([k, v]) =>
      `<span class="ccp-played-item">${names[k] || k}×${v}</span>`
    ).join('');
  }
  const sDeckBox = $('side-ccp-deck');
  if (sDeckBox) {
    sDeckBox.innerHTML = `剩余: <span>${gameState.deckCount}</span> 张 | 总手牌: <span>${cardCounter.getTotalHandCards()}</span> 张`;
  }
}

// ============ 皮肤系统 ============
let skinManager = null;
function initSkinSystem() {
  if (typeof SKIN_SYSTEM === 'undefined') return;
  skinManager = new SKIN_SYSTEM.SkinManager();
  window._skinManager = skinManager;
  // 绑定皮肤按钮（在音量控制旁边）
  const ctl = document.getElementById('audio-control');
  if (ctl) {
    const skinBtn = document.createElement('span');
    skinBtn.textContent = '🎨';
    skinBtn.style.cssText = 'cursor:pointer;font-size:14px;margin-left:4px;';
    skinBtn.addEventListener('click', e => { e.stopPropagation(); toggleSkinPanel(); });
    ctl.appendChild(skinBtn);
  }
}

function toggleSkinPanel() {
  const panel = $('skin-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) renderSkinPanel();
}

function renderSkinPanel() {
  if (!skinManager || typeof SKIN_SYSTEM === 'undefined') return;
  // 皮肤列表
  const skinsBox = $('sp-skins');
  if (skinsBox) {
    skinsBox.innerHTML = '';
    Object.entries(SKIN_SYSTEM.SKINS).forEach(([id, info]) => {
      const unlocked = skinManager.isSkinUnlocked(id);
      const active = skinManager.getSkin() === id;
      const div = document.createElement('div');
      div.className = `sp-item ${active ? 'active' : ''} ${!unlocked ? 'locked' : ''}`;
      div.innerHTML = `<div class="iname">${info.name}</div><div class="idesc">${info.desc}</div>${!unlocked ? `<div class="ilock">🔒 ${info.unlock}</div>` : ''}`;
      div.addEventListener('click', () => {
        if (unlocked) { skinManager.setSkin(id); renderSkinPanel(); applySkinToGame(); }
      });
      skinsBox.appendChild(div);
    });
  }
  // 头像框列表
  const framesBox = $('sp-frames');
  if (framesBox) {
    framesBox.innerHTML = '';
    Object.entries(SKIN_SYSTEM.AVATAR_FRAMES).forEach(([id, info]) => {
      const unlocked = skinManager.isFrameUnlocked(id);
      const active = skinManager.getFrame() === id;
      const div = document.createElement('div');
      div.className = `sp-item ${active ? 'active' : ''} ${!unlocked ? 'locked' : ''}`;
      div.innerHTML = `<div class="iname">${info.name}</div><div class="idesc">${info.desc}</div>${!unlocked ? `<div class="ilock">🔒</div>` : ''}`;
      div.addEventListener('click', () => {
        if (unlocked) { skinManager.setFrame(id); renderSkinPanel(); applySkinToGame(); }
      });
      framesBox.appendChild(div);
    });
  }
  // 特效开关
  const fxCb = $('sp-effects');
  if (fxCb) {
    fxCb.checked = skinManager.skinEffects;
    fxCb.onchange = () => { skinManager.setSkinEffects(fxCb.checked); applySkinToGame(); };
  }
  // 关闭按钮
  const closeBtn = $('sp-close');
  if (closeBtn) closeBtn.onclick = () => toggleSkinPanel();
}

function applySkinToGame() {
  if (!skinManager || !gameState) return;
  const table = document.getElementById('view-game');
  if (!table) return;
  // 移除旧皮肤类
  Object.keys(SKIN_SYSTEM.SKINS).forEach(s => table.classList.remove(`skin-${s}`));
  Object.keys(SKIN_SYSTEM.AVATAR_FRAMES).forEach(f => table.classList.remove(`frame-${f}`));
  // 应用新皮肤
  table.classList.add(skinManager.getSkinClass());
  table.classList.add(skinManager.getFrameClass());
}

// ============ 自定义卡牌编辑器 ============
let cardEditor = null;
let customCards = [];
try { customCards = JSON.parse(localStorage.getItem('sgk_custom_cards') || '[]'); } catch {}

function initCardEditor() {
  if (typeof CardEditor === 'undefined') return;
  cardEditor = new CardEditor();
  cardEditor.onChange = updateCardEditorPreview;
  renderCardTypeOptions();
  renderCardSuitOptions();
  renderCardSubtypeOptions();
  renderCustomCardList();
  bindCardEditorEvents();
  updateCardEditorPreview();
}

function renderCardTypeOptions() {
  const sel = $('ce-type');
  if (!sel) return;
  sel.innerHTML = '';
  window.CARD_DSL.CARD_TYPES.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.label;
    sel.appendChild(opt);
  });
  sel.onchange = () => {
    cardEditor.card.type = sel.value;
    renderCardSubtypeOptions();
    cardEditor.notify();
  };
}

function renderCardSubtypeOptions() {
  const sel = $('ce-subtype');
  if (!sel) return;
  sel.innerHTML = '';
  const type = cardEditor.card.type;
  const cards = type === 'basic' ? window.CARD_DSL.BASIC_CARDS :
    type === 'trick' ? window.CARD_DSL.TRICK_CARDS : window.CARD_DSL.EQUIP_CARDS;
  cards.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.label;
    sel.appendChild(opt);
  });
  sel.onchange = () => { cardEditor.card.subtype = sel.value; cardEditor.notify(); };
}

function renderCardSuitOptions() {
  const sel = $('ce-suit');
  if (!sel) return;
  sel.innerHTML = '';
  [{ v: 'spade', l: '♠黑桃' }, { v: 'heart', l: '♥红桃' }, { v: 'club', l: '♣梅花' }, { v: 'diamond', l: '♦方块' }].forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.v; opt.textContent = s.l;
    sel.appendChild(opt);
  });
  sel.onchange = () => { cardEditor.card.suit = sel.value; cardEditor.notify(); };
}

function renderCardEffectCard(index) {
  const box = $('ce-effects');
  if (!box) return;
  const effects = cardEditor.card.effects;
  if (index >= effects.length) return;
  const e = effects[index];
  const def = window.CARD_DSL.EFFECT_TYPES.find(x => x.id === e.type);
  const card = document.createElement('div');
  card.className = 'se-effect-card';
  card.dataset.idx = index;

  let paramsHtml = '';
  if (def && def.params) {
    paramsHtml = def.params.map(p => {
      const val = e.params[p.key] ?? p.default;
      if (p.type === 'select') {
        const opts = p.options.map(o => `<option value="${o.v}" ${o.v == val ? 'selected' : ''}>${o.l}</option>`).join('');
        return `<label>${p.label} <select data-key="${p.key}">${opts}</select></label>`;
      }
      if (p.type === 'checkbox') {
        return `<label>${p.label} <input type="checkbox" data-key="${p.key}" ${val ? 'checked' : ''}></label>`;
      }
      return `<label>${p.label} <input type="${p.type === 'number' ? 'number' : 'text'}" data-key="${p.key}" value="${val}" ${p.min != null ? 'min="' + p.min + '"' : ''} ${p.max != null ? 'max="' + p.max + '"' : ''}></label>`;
    }).join('');
  }

  card.innerHTML = `
    <div class="ef-header">
      <span class="ef-name">${def ? def.label : e.type}</span>
      <span class="ef-remove" data-idx="${index}">✕</span>
    </div>
    <div class="ef-params">${paramsHtml}</div>`;
  box.appendChild(card);
}

function renderAllCardEffects() {
  const box = $('ce-effects');
  if (!box) return;
  box.innerHTML = '';
  cardEditor.card.effects.forEach((e, i) => renderCardEffectCard(i));
  box.querySelectorAll('.ef-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      cardEditor.card.effects.splice(idx, 1);
      cardEditor.notify();
      renderAllCardEffects();
      updateCardEditorPreview();
    });
  });
  box.querySelectorAll('.ef-params input, .ef-params select').forEach(inp => {
    inp.addEventListener('change', () => {
      const card = inp.closest('.se-effect-card');
      const idx = +card.dataset.idx;
      const key = inp.dataset.key;
      let val;
      if (inp.type === 'checkbox') val = inp.checked;
      else if (inp.type === 'number') val = +inp.value || 0;
      else val = inp.value;
      if (!cardEditor.card.effects[idx].params) cardEditor.card.effects[idx].params = {};
      cardEditor.card.effects[idx].params[key] = val;
      updateCardEditorPreview();
    });
  });
}

function renderCustomCardList() {
  const box = $('ce-list');
  if (!box) return;
  box.innerHTML = '';
  if (!customCards.length) { box.innerHTML = '<div class="hint">还没有自定义卡牌</div>'; return; }
  customCards.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'ce-list-item';
    div.innerHTML = `
      <span class="lname">${c.name} <span class="hint">(${c.description.slice(0, 12)}...)</span></span>
      <span class="lactions">
        <button class="btn btn-small" data-act="edit" data-idx="${i}">编辑</button>
        <button class="btn btn-small" data-act="del" data-idx="${i}">删除</button>
      </span>`;
    box.appendChild(div);
  });
  box.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      if (btn.dataset.act === 'edit') {
        cardEditor.setCard(JSON.parse(JSON.stringify(customCards[idx])));
        syncCardEditorUI();
        updateCardEditorPreview();
      } else if (btn.dataset.act === 'del') {
        customCards.splice(idx, 1);
        saveCustomCards();
        renderCustomCardList();
      }
    });
  });
}

function syncCardEditorUI() {
  renderCardTypeOptions();
  renderCardSubtypeOptions();
  renderCardSuitOptions();
  renderAllCardEffects();
  const nameInput = $('ce-name');
  if (nameInput) nameInput.value = cardEditor.card.name;
  const rankInput = $('ce-rank');
  if (rankInput) rankInput.value = cardEditor.card.rank;
  const onceCb = $('ce-once');
  if (onceCb) onceCb.checked = cardEditor.card.oncePerTurn;
  const needTarget = $('ce-need-target');
  if (needTarget) needTarget.checked = cardEditor.card.needsTarget;
}

function updateCardEditorPreview() {
  if (!cardEditor) return;
  const preview = $('ce-preview');
  const json = $('ce-json');
  if (preview) preview.textContent = cardEditor.generateDesc();
  if (json) json.textContent = cardEditor.toJSON();
  // 卡牌视觉预览
  const cardPreview = $('ce-card-preview');
  if (cardPreview) {
    const c = cardEditor.card;
    const isRed = c.suit === 'heart' || c.suit === 'diamond';
    const rankLabel = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[c.rank] || c.rank;
    cardPreview.innerHTML = `<div class="card ${isRed ? 'red' : 'black'}" style="position:relative;transform:none;margin:0;">
      <div class="ctype">${c.type === 'basic' ? '基本' : c.type === 'trick' ? '锦囊' : '装备'}</div>
      <div class="cname">${c.name}</div>
      <div class="csuit">${{ spade: '♠', heart: '♥', club: '♣', diamond: '♦' }[c.suit]}</div>
      <div class="crank">${rankLabel}</div>
    </div>`;
  }
}

function saveCustomCards() {
  localStorage.setItem('sgk_custom_cards', JSON.stringify(customCards));
}

function bindCardEditorEvents() {
  $('btn-cardeditor-back')?.addEventListener('click', () => showView('home'));
  $('btn-add-card-effect')?.addEventListener('click', () => openCardEffectPicker());
  $('btn-ce-save')?.addEventListener('click', () => {
    const err = cardEditor.validate();
    if (err) { const m = $('ce-msg'); if (m) m.textContent = '❌ ' + err; return; }
    const c = cardEditor.getCard();
    const existing = customCards.findIndex(x => x.id === c.id);
    if (existing >= 0) customCards[existing] = c; else customCards.push(c);
    saveCustomCards();
    renderCustomCardList();
    const m = $('ce-msg'); if (m) m.textContent = '✅ 已保存：' + c.name;
  });
  $('btn-ce-test')?.addEventListener('click', () => {
    const m = $('ce-msg'); if (m) m.textContent = '💡 在房间设置中启用自定义卡牌即可测试';
  });
  $('btn-ce-clear')?.addEventListener('click', () => {
    cardEditor.setCard(cardEditor.createEmptyCard());
    syncCardEditorUI();
    updateCardEditorPreview();
  });
  const nameInput = $('ce-name');
  if (nameInput) nameInput.addEventListener('input', () => { cardEditor.card.name = nameInput.value; updateCardEditorPreview(); });
  const rankInput = $('ce-rank');
  if (rankInput) rankInput.addEventListener('input', () => { cardEditor.card.rank = +rankInput.value || 7; updateCardEditorPreview(); });
  const onceCb = $('ce-once');
  if (onceCb) onceCb.addEventListener('change', () => { cardEditor.card.oncePerTurn = onceCb.checked; updateCardEditorPreview(); });
  const needTarget = $('ce-need-target');
  if (needTarget) needTarget.addEventListener('change', () => { cardEditor.card.needsTarget = needTarget.checked; });
}

function openCardEffectPicker() {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.style.zIndex = '350';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '500px';
  modal.innerHTML = `<div class="modal-title">选择效果</div><div class="se-options" style="max-height:400px"></div>`;
  const opts = modal.querySelector('.se-options');
  window.CARD_DSL.EFFECT_TYPES.forEach(e => {
    const div = document.createElement('div');
    div.className = 'se-opt';
    div.innerHTML = `<div>${e.label}</div><div class="optdesc">${e.desc}</div>`;
    div.addEventListener('click', () => {
      const params = {};
      (e.params || []).forEach(p => { params[p.key] = p.default; });
      cardEditor.card.effects.push({ type: e.type, params });
      renderAllCardEffects();
      updateCardEditorPreview();
      mask.remove();
    });
    opts.appendChild(div);
  });
  mask.appendChild(modal);
  document.body.appendChild(mask);
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}
let fx = null;
function initFX() {
  if (typeof FX !== 'undefined') {
    fx = new FX();
    window._FX = fx;
  }
  // 初始化 Canvas 粒子渲染器
  if (typeof PerfUtils !== 'undefined') {
    window.canvasParticles = new PerfUtils.CanvasParticleRenderer();
    window.renderScheduler = new PerfUtils.RenderScheduler();
    window.resourcePreloader = new PerfUtils.ResourcePreloader();
    window.debouncedRender = new PerfUtils.DebouncedRenderer(16);
  }
}

// 性能优化的粒子发射函数
function spawnParticles(x, y, opts) {
  if (window.canvasParticles) {
    window.canvasParticles.emit(x, y, opts);
  }
}

// 资源预加载
function preloadGameResources() {
  if (typeof PerfUtils === 'undefined' || !window.resourcePreloader) return;
  const { GENERALS } = window._SGK_META || {};
  if (GENERALS && GENERALS.length) {
    // 预加载前 20 个武将头像
    window.resourcePreloader.preloadGenerals(GENERALS.slice(0, 20));
  }
}

// ============ 快捷键 ============
let shortcuts = null;
function initShortcuts() {
  if (typeof Shortcuts === 'undefined') return;
  shortcuts = new Shortcuts();
  window._shortcuts = shortcuts; // 调试/测试用
  shortcuts.setHandlers({
    onAction: handleShortcut,
    onHelp: toggleShortcutsHelp,
    onMute: () => { if (audio) audio.setEnabled(!audio.enabled); const icon = $('audio-icon'); const ctl = document.getElementById('audio-control'); if (audio) { icon.textContent = audio.enabled ? '🔊' : '🔇'; ctl.classList.toggle('muted', !audio.enabled); } },
    onVolume: (dir) => { const s = document.getElementById('audio-volume'); if (s) { const v = Math.max(0, Math.min(100, +s.value + dir * 10)); s.value = v; if (audio) audio.setVolume(v / 100); } },
  });
  // 同步选择状态
  setInterval(() => {
    if (shortcuts && gameState) {
      shortcuts.setSelection(sel);
      const pr = prompt();
      if (pr && pr.kind === 'play') shortcuts.setContext('play');
      else if (pr && pr.kind === 'respond') shortcuts.setContext('respond');
      else shortcuts.setContext('global');
    }
  }, 200);
}

function handleShortcut(action, payload) {
  const pr = prompt();
  if (!pr) return;
  switch (action) {
    case 'selectCard': {
      if (pr.kind === 'play') {
        const cards = gameState.myHand;
        const c = cards[payload];
        if (c) { toggleHand(c.uid); sfx('click'); }
      } else if (pr.kind === 'respond') {
        const opts = Array.from(document.querySelectorAll('#prompt-bar .prompt-options .btn'));
        // 1-9 → 选项 0-8，0 → 最后一个（不出）
        const idx = payload === 9 ? opts.length - 1 : payload;
        if (opts[idx]) { opts[idx].click(); sfx('click'); }
      }
      break;
    }
    case 'confirm': {
      if (pr.kind === 'play' && (sel.hand.length || sel.skill) && pendingInfo().canConfirm) { confirmPlay(); }
      else if (pr.kind === 'respond') { confirmRespond(); }
      break;
    }
    case 'cancel': {
      if (pr.kind === 'play') { sel = freshSel(); refreshAll(); sfx('click'); }
      else if (pr.kind === 'respond') { send({ type: 'action', pass: true }); }
      break;
    }
    case 'endTurn': {
      if (pr.kind === 'play') { send({ type: 'action', action: 'end' }); sel = freshSel(); }
      break;
    }
    case 'cycleMode': {
      if (pr.kind !== 'play') return;
      const modes = modesForSelection();
      if (modes.length <= 1) return;
      const curIdx = modes.findIndex(m => m.as === sel.mode);
      const next = curIdx + payload;
      sel.mode = modes[(next % modes.length + modes.length) % modes.length].as;
      sel.targets = [];
      refreshAll();
      break;
    }
    case 'cycleTarget': {
      const cands = targetCandidates();
      if (!cands.length) return;
      // 选中下一个目标
      const curIdx = sel.targets.length ? cands.indexOf(sel.targets[sel.targets.length - 1]) : -1;
      const next = (curIdx + payload + cands.length) % cands.length;
      sel.targets = [cands[next]];
      refreshAll();
      break;
    }
    case 'skill': {
      if (pr.kind !== 'play') return;
      const skills = (pr.skills || []).filter(s => !s.passive && s.usable);
      if (skills[payload]) {
        sel.skill = skills[payload].id; sel.mode = null; sel.hand = []; sel.targets = [];
        const need = skillButtonDef(sel.skill) || {};
        if (need.needCards === 0 && need.needTargets === 0) {
          send({ type: 'action', action: 'skill', skill: sel.skill, cardIds: [], targets: [] });
          sel = freshSel();
        } else {
          sel.hand = sel.hand.slice(0, need.needCards === 1 ? 1 : (need.needCards === '1+' ? 0 : need.needCards));
        }
        refreshAll();
      }
      break;
    }
  }
}

function confirmRespond() {  // 找到当前高亮的选项并点击
  const opts = document.querySelectorAll('#prompt-bar .prompt-options .btn');
  const highlighted = document.querySelector('#prompt-bar .prompt-options .btn.btn-primary');
  if (highlighted) highlighted.click();
  else if (opts.length) opts[0].click();
}

let shortcutsHelpVisible = false;
function toggleShortcutsHelp() {
  // Esc 关闭
  if (shortcutsHelpVisible) { shortcutsHelpVisible = false; window._sgkHelpVisible = false; $('shortcuts-help').classList.add('hidden'); return; }
  shortcutsHelpVisible = true; window._sgkHelpVisible = true;
  $('shortcuts-help').classList.remove('hidden');
  buildShortcutsHelp();
}
// Esc 关闭帮助
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && window._sgkHelpVisible) { toggleShortcutsHelp(); e.stopPropagation(); }
});

function buildShortcutsHelp() {
  const list = $('shortcuts-list');
  if (!list) return;
  const keys = [
    ['1-0', '选第 N 张手牌'],
    ['Enter / Space', '确定 / 打出'],
    ['Esc / ⌫', '取消选择'],
    ['Q / E', '切换出牌方式'],
    ['Tab / ← →', '切换目标'],
    ['X / End', '结束出牌'],
    ['F1-F4', '发动技能'],
    ['M', '静音 / 开启'],
    ['↑ / ↓', '音量增减'],
    ['H / ?', '显示/关闭帮助'],
  ];
  list.innerHTML = keys.map(([k, d]) =>
    `<div><span class="kkey">${k}</span><span class="kdesc">${d}</span></div>`).join('');
}

// ============ 大厅 ============
function renderLobby() {
  if (!roomState) return;
  $('lobby-room-name').textContent = roomState.name;
  $('lobby-state').textContent = roomState.state === 'lobby' ? '等待开始' : roomState.state === 'playing' ? '游戏中' : '已结束';
  const isHost = roomState.hostPid === myPid;
  // 座位
  const grid = $('seat-grid');
  grid.innerHTML = '';
  roomState.seats.forEach((s, i) => {
    if (i >= roomState.opts.maxPlayers) return;
    const div = document.createElement('div');
    if (s.name) {
      const pref = roomState.identityPrefs[s.pid];
      div.className = 'seat occupied' + (s.pid === myPid ? ' me' : '');
      div.innerHTML = `
        ${pref ? `<span class="sidentity">${IDENTITY_NAME[pref]}?</span>` : ''}
        ${isHost && s.pid !== myPid ? '<span class="skick">✕</span>' : ''}
        <div class="sname">${esc(s.name)}</div>
        <div class="stag ${s.isAI ? 'ai' : ''}">${s.isAI ? '电脑' : s.pid === roomState.hostPid ? '房主' : '玩家'}</div>`;
      if (isHost && s.pid !== myPid) {
        div.querySelector('.skick').addEventListener('click', () => send({ type: 'removeSeat', seat: i }));
      }
    } else {
      div.className = 'seat empty';
      div.textContent = '空位';
      div.addEventListener('click', () => {
        // 换座/坐下 = 先离开再加 AI 反向…简单：仅房主可加AI；玩家进房已自动落座
      });
    }
    grid.appendChild(div);
  });
  // 按钮
  $('btn-start').style.display = isHost && roomState.state !== 'playing' ? '' : 'none';
  $('btn-add-ai').style.display = isHost && roomState.state === 'lobby' ? '' : 'none';
  $('btn-start').textContent = roomState.state === 'ended' ? '返回大厅' : '开始游戏';
  // 设置
  renderOpts(isHost);
  // 点身份
  renderIdentityPick();
  // 聊天
  const cb = $('chat-box');
  cb.innerHTML = roomState.chat.map(c => `<div><span class="cname">${esc(c.name)}：</span>${esc(c.text)}</div>`).join('');
  cb.scrollTop = cb.scrollHeight;
}

function renderOpts(isHost) {
  const o = roomState.opts;
  const box = $('lobby-opts');
  const row = (label, inner) => `<div class="opt-row"><label>${label}</label><span>${inner}</span></div>`;
  let html = '';
  // 游戏模式选择
  const modeOptions = { identity: '身份局', '1v1': '1v1 单挑', '3v3': '3v3 对抗', guozhan: '国 战', doudizhu: '斗地主' };
  html += row('游戏模式', isHost ? `<select id="opt-mode">${Object.entries(modeOptions).map(([v, l]) => `<option value="${v}" ${o.gameMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : modeOptions[o.gameMode] || '身份局');
  // 根据模式限制人数
  const modeMinMax = { identity: [4,8], '1v1': [2,2], '3v3': [6,6], guozhan: [2,8], doudizhu: [3,3] };
  const [minP, maxP] = modeMinMax[o.gameMode] || [4, 8];
  if (isHost) {
    // 如果当前人数不在模式范围内，调整
    if (o.maxPlayers < minP) o.maxPlayers = minP;
    if (o.maxPlayers > maxP) o.maxPlayers = maxP;
  }
  html += row('人数', isHost ? `<select id="opt-max">${Array.from({length: maxP - minP + 1}, (_, i) => minP + i).map(n => `<option ${n === o.maxPlayers ? 'selected' : ''}>${n}</option>`).join('')}</select>` : `${o.maxPlayers} 人`);
  html += row('选将方式', isHost ? `<select id="opt-pickmode"><option value="random" ${o.pickMode === 'random' ? 'selected' : ''}>随机选将</option><option value="free" ${o.pickMode === 'free' ? 'selected' : ''}>自由点将</option></select>` : (o.pickMode === 'random' ? `随机选将（${o.pickCount}选1）` : '自由点将'));
  if (o.pickMode === 'random') {
    html += row('候选武将数', isHost ? `<select id="opt-pickcount">${[2,3,4,5,6,7].map(n => `<option ${n === o.pickCount ? 'selected' : ''}>${n}</option>`).join('')}</select>` : o.pickCount);
  }
  // 国战和1v1不显示点身份
  if (o.gameMode === 'identity' || o.gameMode === '3v3' || o.gameMode === 'doudizhu') {
    html += row('点身份', isHost ? `<input type="checkbox" id="opt-idpick" ${o.allowIdentityPick ? 'checked' : ''}>` : (o.allowIdentityPick ? '开' : '关'));
  }
  html += row('启用DIY武将', isHost ? `<input type="checkbox" id="opt-custom" ${o.includeCustoms ? 'checked' : ''}>` : (o.includeCustoms ? '开' : '关'));
  html += row('身份配置', (roomState.identityDist || []).map(id => IDENTITY_NAME[id] || id).join(' / '));
  // ---- 自定义规则 ----
  html += '<div style="width:100%;margin:6px 0;padding-top:6px;border-top:1px dashed #4a3c28"><span class="hint">— 自定义规则 —</span></div>';
  html += row('回合上限', isHost ? `<input type="number" id="opt-roundlimit" value="${o.roundLimit || 0}" min="0" max="100" style="width:60px"> <span class="hint">0=无限</span>` : `${o.roundLimit || '∞'}`);
  html += row('初始手牌', isHost ? `<input type="number" id="opt-startcards" value="${o.startCards || 4}" min="2" max="8" style="width:60px">` : (o.startCards || 4));
  html += row('手牌上限', isHost ? `<input type="number" id="opt-handlimit" value="${o.handLimit || 0}" min="0" max="20" style="width:60px"> <span class="hint">0=体力值</span>` : (o.handLimit || '体力值'));
  html += row('体力加成', isHost ? `<input type="number" id="opt-hpbonus" value="${o.hpBonus || 0}" min="-2" max="3" style="width:60px">` : (o.hpBonus || 0));
  html += row('主公加体力', isHost ? `<input type="checkbox" id="opt-lordhp" ${o.lordExtraHp !== false ? 'checked' : ''}>` : (o.lordExtraHp !== false ? '开' : '关'));
  html += row('弃牌限制', isHost ? `<input type="checkbox" id="opt-discardlimit" ${o.discardLimit !== false ? 'checked' : ''}>` : (o.discardLimit !== false ? '开' : '关'));
  html += row('允许决斗', isHost ? `<input type="checkbox" id="opt-juedou" ${o.allowJuedou !== false ? 'checked' : ''}>` : (o.allowJuedou !== false ? '开' : '关'));
  html += row('允许AOE', isHost ? `<input type="checkbox" id="opt-aoe" ${o.allowAoe !== false ? 'checked' : ''}>` : (o.allowAoe !== false ? '开' : '关'));
  html += row('揭示身份', isHost ? `<input type="checkbox" id="opt-reveal" ${o.revealOnDeath !== false ? 'checked' : ''}>` : (o.revealOnDeath !== false ? '开' : '关'));
  // AI 难度
  const diffNames = { easy: '简单', normal: '普通', hard: '困难' };
  html += row('AI 难度', isHost ? `<select id="opt-aidiff"><option value="easy" ${o.aiDifficulty === 'easy' ? 'selected' : ''}>简单</option><option value="normal" ${o.aiDifficulty === 'normal' || !o.aiDifficulty ? 'selected' : ''}>普通</option><option value="hard" ${o.aiDifficulty === 'hard' ? 'selected' : ''}>困难</option></select>` : (diffNames[o.aiDifficulty] || '普通'));
  // 游戏速度
  const speedNames = { fast: '快速', normal: '标准', slow: '慢速' };
  html += row('游戏速度', isHost ? `<select id="opt-speed"><option value="fast" ${o.gameSpeed === 'fast' ? 'selected' : ''}>快速</option><option value="normal" ${o.gameSpeed === 'normal' || !o.gameSpeed ? 'selected' : ''}>标准</option><option value="slow" ${o.gameSpeed === 'slow' ? 'selected' : ''}>慢速</option></select>` : (speedNames[o.gameSpeed] || '标准'));
  // 出牌倒计时
  html += row('出牌倒计时', isHost ? `<select id="opt-timer"><option value="0" ${!o.turnTimer ? 'selected' : ''}>无限</option><option value="30" ${o.turnTimer === 30 ? 'selected' : ''}>30秒</option><option value="60" ${o.turnTimer === 60 ? 'selected' : ''}>60秒</option><option value="90" ${o.turnTimer === 90 ? 'selected' : ''}>90秒</option></select>` : (o.turnTimer ? o.turnTimer + '秒' : '无限'));
  // ---- 胜利条件 (需在写入 DOM 前) ----
  if (typeof GameRules !== 'undefined') {
    const wc = o.winCondition || 'default';
    html += row('胜利条件', isHost ? `<select id="opt-wincond">${GameRules.WIN_CONDITIONS.map(c => `<option value="${c.id}" ${c.id === wc ? 'selected' : ''}>${c.label}</option>`).join('')}</select>` : (GameRules.WIN_CONDITIONS.find(c => c.id === (o.winCondition || 'default'))?.label || '默认'));
    // 胜利条件参数
    const condDef = GameRules.WIN_CONDITIONS.find(c => c.id === wc);
    if (condDef && condDef.params.length && isHost) {
      condDef.params.forEach(p => {
        const val = (o.winParams && o.winParams[p.key]) ?? p.default;
        if (p.type === 'textarea') {
          html += `<div style="width:100%;margin-top:4px"><label style="font-size:12px;color:#8a7a5f">${p.label}</label><textarea id="opt-winparam-${p.key}" style="width:100%;height:60px;background:#181310;color:#e8dcc0;border:1px solid #5a4a33;border-radius:4px;padding:4px;font-size:12px">${val}</textarea></div>`;
        } else {
          html += row(p.label, `<input type="${p.type === 'number' ? 'number' : 'text'}" id="opt-winparam-${p.key}" value="${val}" ${p.min != null ? 'min="' + p.min + '"' : ''} ${p.max != null ? 'max="' + p.max + '"' : ''} style="width:60px">`);
        }
      });
    }
  }
  // ---- 规则预设/禁将 按钮 (需在写入 DOM 前) ----
  if (isHost) {
    html += '<div style="width:100%;margin-top:8px"><button id="btn-rule-presets" class="btn btn-small">📋 规则预设</button> <button id="btn-share-rules" class="btn btn-small">🔗 分享规则</button></div>';
    html += '<div style="width:100%;margin-top:6px"><button id="btn-banlist" class="btn btn-small">🚫 禁将/禁牌</button></div>';
  }
  // ---- 投票禁将 / 死亡揭示（需在写入 DOM 前） ----
  if (isHost) {
    html += row('投票禁将', `<input type="checkbox" id="opt-voteban" ${o.allowVoteBan ? 'checked' : ''}>`);
    html += row('死亡揭示身份', `<input type="checkbox" id="opt-reveal" ${o.revealOnDeath ? 'checked' : ''}>`);
  }
  box.innerHTML = html;
  if (isHost) {
    const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', fn); };
    bind('opt-max', e => send({ type: 'setOpts', opts: { maxPlayers: +e.target.value } }));
    bind('opt-pickmode', e => send({ type: 'setOpts', opts: { pickMode: e.target.value } }));
    bind('opt-pickcount', e => send({ type: 'setOpts', opts: { pickCount: +e.target.value } }));
    bind('opt-idpick', e => send({ type: 'setOpts', opts: { allowIdentityPick: e.target.checked } }));
    bind('opt-custom', e => send({ type: 'setOpts', opts: { includeCustoms: e.target.checked } }));
    bind('opt-mode', e => send({ type: 'setOpts', opts: { gameMode: e.target.value } }));
    // 自定义规则绑定
    const numOpt = (id, key) => bind(id, e => { const v = parseInt(e.target.value, 10); send({ type: 'setOpts', opts: { [key]: isNaN(v) ? 0 : v } }); });
    const boolOpt = (id, key) => bind(id, e => send({ type: 'setOpts', opts: { [key]: e.target.checked } }));
    numOpt('opt-roundlimit', 'roundLimit');
    numOpt('opt-startcards', 'startCards');
    numOpt('opt-handlimit', 'handLimit');
    numOpt('opt-hpbonus', 'hpBonus');
    boolOpt('opt-lordhp', 'lordExtraHp');
    boolOpt('opt-discardlimit', 'discardLimit');
    boolOpt('opt-juedou', 'allowJuedou');
    boolOpt('opt-aoe', 'allowAoe');
    bind('opt-aidiff', e => send({ type: 'setOpts', opts: { aiDifficulty: e.target.value } }));
    bind('opt-speed', e => send({ type: 'setOpts', opts: { gameSpeed: e.target.value } }));
    bind('opt-timer', e => send({ type: 'setOpts', opts: { turnTimer: +e.target.value } }));
    // 胜利条件绑定
    if (typeof GameRules !== 'undefined') {
      bind('opt-wincond', e => send({ type: 'setOpts', opts: { winCondition: e.target.value, winParams: {} } }));
      const condDef = GameRules.WIN_CONDITIONS.find(c => c.id === (o.winCondition || 'default'));
      if (condDef && condDef.params.length) {
        condDef.params.forEach(p => {
          const el = $('opt-winparam-' + p.key);
          if (el) {
            el.addEventListener('change', () => {
              const params = {};
              params[p.key] = p.type === 'number' ? (+el.value || 0) : el.value;
              send({ type: 'setOpts', opts: { winParams: params } });
            });
          }
        });
      }
    }
    // 绑定 opt-reveal 和 opt-voteban
    boolOpt('opt-reveal', 'revealOnDeath');
    boolOpt('opt-voteban', 'allowVoteBan');
    // 绑定预设按钮
    bind('btn-rule-presets', () => openRulePresets());
    bind('btn-share-rules', () => openShareRules());
    bind('btn-banlist', () => openBanList());
  }
}

// ==================== 规则预设面板 ====================
let rulePresetManager = null;
function getPresetManager() {
  if (!rulePresetManager && typeof GameRules !== 'undefined') {
    rulePresetManager = new GameRules.RulePresetManager();
  }
  return rulePresetManager;
}

function openRulePresets() {
  const mgr = getPresetManager();
  if (!mgr) return;
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.style.zIndex = '310';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '500px';
  modal.innerHTML = `<div class="modal-title">规则预设 <span id="rp-close" style="cursor:pointer;color:#a05050">✕</span></div>
    <div id="rp-list" style="max-height:300px;overflow-y:auto"></div>
    <div style="margin-top:12px;padding-top:8px;border-top:1px dashed #4a3c28">
      <input id="rp-name" placeholder="预设名称" style="width:100%;margin-bottom:6px">
      <input id="rp-desc" placeholder="描述（可选）" style="width:100%;margin-bottom:6px">
      <button id="rp-save" class="btn btn-small btn-primary">保存当前设置为预设</button>
    </div>`;
  mask.appendChild(modal);
  document.body.appendChild(mask);

  const render = () => {
    const list = $('rp-list');
    if (!list) return;
    const presets = mgr.list();
    if (!presets.length) { list.innerHTML = '<div class="hint">暂无预设</div>'; return; }
    list.innerHTML = '';
    presets.forEach(p => {
      const div = document.createElement('div');
      div.className = 'ce-list-item';
      div.innerHTML = `<span class="lname">${p.name} <span class="hint">(${p.desc})</span></span>
        <span class="lactions">
          <button class="btn btn-small" data-act="load" data-id="${p.id}">加载</button>
          ${p.custom ? `<button class="btn btn-small" data-act="del" data-id="${p.id}">删除</button>` : ''}
        </span>`;
      list.appendChild(div);
    });
    list.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (btn.dataset.act === 'load') {
          const preset = mgr.load(id);
          if (preset && preset.opts) {
            send({ type: 'setOpts', opts: preset.opts });
            if (typeof renderOpts === 'function' && roomState) renderOpts(roomState.hostPid === myPid);
            addChatMessage('系统', `已加载预设：${preset.name}`);
          }
          mask.remove();
        } else if (btn.dataset.act === 'del') {
          mgr.remove(id);
          render();
        }
      });
    });
  };
  render();

  $('rp-close').onclick = () => mask.remove();
  $('rp-save').onclick = () => {
    const name = $('rp-name').value.trim();
    if (!name) return alert('请输入预设名称');
    if (!roomState) return;
    const desc = $('rp-desc').value.trim();
    const opts = { ...roomState.opts };
    mgr.save(name, desc, opts);
    render();
    $('rp-name').value = '';
    $('rp-desc').value = '';
  };
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

// ==================== 规则分享 ====================
function openShareRules() {
  const mgr = getPresetManager();
  if (!mgr || !roomState) return;
  const code = mgr.encode(roomState.opts);
  const url = window.location.origin + '#rules=' + code;
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.style.zIndex = '310';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '500px';
  modal.innerHTML = `<div class="modal-title">分享规则 <span id="rs-close" style="cursor:pointer;color:#a05050">✕</span></div>
    <div style="margin-bottom:8px;font-size:13px;color:#b39b74">分享码：</div>
    <textarea id="rs-code" readonly style="width:100%;height:80px;background:#0d0a08;color:#7fba7f;border:1px solid #33291d;border-radius:4px;padding:8px;font-size:11px;word-break:break-all">${esc(code)}</textarea>
    <div style="margin-top:8px;margin-bottom:8px;font-size:13px;color:#b39b74">分享链接：</div>
    <input id="rs-url" readonly style="width:100%;background:#0d0a08;color:#7fba7f;border:1px solid #33291d;border-radius:4px;padding:6px;font-size:12px">
    <div style="margin-top:10px">
      <button id="rs-copy" class="btn btn-small btn-primary">复制分享码</button>
      <button id="rs-import" class="btn btn-small">导入规则</button>
    </div>
    <div id="rs-import-area" style="display:none;margin-top:10px">
      <textarea id="rs-import-code" placeholder="粘贴分享码..." style="width:100%;height:60px;background:#181310;color:#e8dcc0;border:1px solid #5a4a33;border-radius:4px;padding:6px;font-size:12px"></textarea>
      <button id="rs-import-btn" class="btn btn-small btn-primary" style="margin-top:6px">导入</button>
    </div>`;
  mask.appendChild(modal);
  document.body.appendChild(mask);

  $('rs-close').onclick = () => mask.remove();
  // 通过 DOM 属性设置 URL（避免属性注入）
  const urlEl = $('rs-url');
  if (urlEl) urlEl.value = url;
  $('rs-copy').onclick = () => {
    navigator.clipboard.writeText(code).then(() => {
      $('rs-copy').textContent = '✅ 已复制';
      setTimeout(() => { $('rs-copy').textContent = '复制分享码'; }, 2000);
    });
  };
  $('rs-import').onclick = () => {
    const area = $('rs-import-area');
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
  };
  $('rs-import-btn').onclick = () => {
    const importCode = $('rs-import-code').value.trim();
    const opts = mgr.decode(importCode);
    if (opts) {
      send({ type: 'setOpts', opts });
      if (typeof renderOpts === 'function' && roomState) renderOpts(roomState.hostPid === myPid);
      addChatMessage('系统', '已导入规则');
      mask.remove();
    } else {
      alert('分享码无效');
    }
  };
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

// 从 URL 导入规则
function importRulesFromUrl() {
  if (location.hash.startsWith('#rules=')) {
    const code = location.hash.slice(7);
    const mgr = getPresetManager();
    if (mgr) {
      const opts = mgr.decode(code);
      if (opts && roomState) {
        send({ type: 'setOpts', opts });
        addChatMessage('系统', '已从链接导入规则');
      }
    }
    history.replaceState(null, '', location.pathname);
  }
}

// ==================== 禁将/禁牌面板 ====================
async function openBanList() {
  const generals = window._SGK_META?.generals || [];
  const o = roomState?.opts || {};
  const bannedG = new Set(o.bannedGenerals || []);
  const bannedC = new Set(o.bannedCards || []);

  const cardKeys = [
    ['sha','杀'], ['shan','闪'], ['tao','桃'], ['juedou','决斗'], ['guohe','过河拆桥'],
    ['shunshou','顺手牵羊'], ['wuzhong','无中生有'], ['nanman','南蛮入侵'], ['wanjian','万箭齐发'],
    ['taoyuan','桃园结义'], ['wugu','五谷丰登'], ['jiedao','借刀杀人'], ['wuxie','无懈可击'],
    ['lebu','乐不思蜀'], ['shandian','闪电'],
  ];

  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.style.zIndex = '310';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '600px';
  modal.innerHTML = `<div class="modal-title">禁将/禁牌 <span style="cursor:pointer;color:#a05050;float:right" id="bl-close">✕</span></div>
    <div style="max-height:400px;overflow-y:auto">
      <div class="panel-title" style="margin-top:0">禁将方案</div>
      <select id="bl-preset" style="width:100%;margin-bottom:8px">
        <option value="none">无</option>
        <option value="basic">禁用强力武将</option>
        <option value="cards">禁用极端卡牌</option>
        <option value="strict">严格模式</option>
      </select>
      <div class="panel-title">禁用武将（${generals.length} 可用）</div>
      <div id="bl-generals" style="display:flex;flex-wrap:wrap;gap:4px;max-height:150px;overflow-y:auto;padding:4px 0"></div>
      <div class="panel-title">禁用卡牌</div>
      <div id="bl-cards" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px"></div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;justify-content:center">
      <button id="bl-apply" class="btn btn-primary">应用</button>
      <button id="bl-cancel" class="btn">取消</button>
      <button id="bl-clear" class="btn">清空</button>
    </div>`;
  mask.appendChild(modal);
  document.body.appendChild(mask);

  const genBox = modal.querySelector('#bl-generals');
  const cardBox = modal.querySelector('#bl-cards');

  generals.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-small' + (bannedG.has(g.id) ? ' btn-primary' : '');
    btn.textContent = g.name;
    btn.onclick = () => { btn.classList.toggle('btn-primary'); bannedG.has(g.id) ? bannedG.delete(g.id) : bannedG.add(g.id); };
    genBox.appendChild(btn);
  });

  cardKeys.forEach(([key, name]) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-small' + (bannedC.has(key) ? ' btn-primary' : '');
    btn.textContent = name;
    btn.onclick = () => { btn.classList.toggle('btn-primary'); bannedC.has(key) ? bannedC.delete(key) : bannedC.add(key); };
    cardBox.appendChild(btn);
  });

  modal.querySelector('#bl-preset').onchange = e => {
    const presets = {
      none: { g: [], c: [] },
      basic: { g: ['lvbu','guojia','simayi','zhugeliang'], c: [] },
      cards: { g: [], c: ['shandian','wuxie'] },
      strict: { g: ['lvbu','guojia','simayi','zhugeliang','xiahoudun'], c: ['shandian','wuxie','lebu'] },
    };
    const p = presets[e.target.value] || presets.none;
    bannedG.clear(); bannedC.clear();
    p.g.forEach(id => bannedG.add(id));
    p.c.forEach(id => bannedC.add(id));
    // refresh UI
    genBox.querySelectorAll('button').forEach(b => { const g = generals.find(g => g.name === b.textContent); b.classList.toggle('btn-primary', !!(g && bannedG.has(g.id))); });
    cardBox.querySelectorAll('button').forEach(b => { const c = cardKeys.find(c => c[1] === b.textContent); b.classList.toggle('btn-primary', !!(c && bannedC.has(c[0]))); });
  };

  modal.querySelector('#bl-apply').onclick = () => {
    send({ type: 'setOpts', opts: { bannedGenerals: [...bannedG], bannedCards: [...bannedC] } });
    addChatMessage('系统', `已设置禁将${bannedG.size}名，禁牌${bannedC.size}张`);
    mask.remove();
  };
  modal.querySelector('#bl-cancel').onclick = () => mask.remove();
  modal.querySelector('#bl-close').onclick = () => mask.remove();
  modal.querySelector('#bl-clear').onclick = () => {
    bannedG.clear(); bannedC.clear();
    genBox.querySelectorAll('button').forEach(b => b.classList.remove('btn-primary'));
    cardBox.querySelectorAll('button').forEach(b => b.classList.remove('btn-primary'));
  };
  mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
}

function addChatMessage(name, text) {
  const box = $('chat-box');
  if (box) {
    const div = document.createElement('div');
    const span = document.createElement('span');
    span.className = 'cname';
    span.textContent = name + '：';
    div.appendChild(span);
    div.insertAdjacentHTML('beforeend', text); // text 已由调用方确保安全
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
}

function renderIdentityPick() {
  const box = $('identity-pick');
  if (!roomState.opts.allowIdentityPick || roomState.state !== 'lobby') {
    box.innerHTML = '<span class="hint">未开启或已开始</span>';
    return;
  }
  const myPref = roomState.identityPrefs[myPid];
  const taken = Object.entries(roomState.identityPrefs).filter(([pid]) => pid !== myPid).map(([, v]) => v);
  const dist = roomState.identityDist || [];
  const counts = {};
  dist.forEach(id => counts[id] = (counts[id] || 0) + 1);
  const takenCounts = {};
  taken.forEach(id => takenCounts[id] = (takenCounts[id] || 0) + 1);
  box.innerHTML = '';
  for (const id of Object.keys(IDENTITY_NAME)) {
    if (!counts[id]) continue;
    const btn = document.createElement('button');
    const full = (takenCounts[id] || 0) >= counts[id];
    btn.className = 'id-btn' + (myPref === id ? ' picked' : '') + (full && myPref !== id ? ' taken' : '');
    btn.textContent = IDENTITY_NAME[id] + (myPref === id ? ' ✓' : '');
    btn.disabled = full && myPref !== id;
    btn.addEventListener('click', () => {
      send({ type: 'pickIdentity', identity: myPref === id ? null : id });
    });
    box.appendChild(btn);
  }
  const clear = document.createElement('button');
  clear.className = 'id-btn';
  clear.textContent = '随机';
  clear.addEventListener('click', () => send({ type: 'pickIdentity', identity: null }));
  box.appendChild(clear);
}

$('btn-add-ai')?.addEventListener('click', () => send({ type: 'addAI' }));
$('btn-leave')?.addEventListener('click', () => { send({ type: 'leaveRoom' }); roomState = null; showView('home'); });
$('btn-start')?.addEventListener('click', () => {
  if (roomState && roomState.state === 'ended') send({ type: 'backToLobby' });
  else send({ type: 'startGame' });
});
$('btn-chat')?.addEventListener('click', sendChat);
$('chat-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
  const t = $('chat-input').value.trim();
  if (!t) return;
  $('chat-input').value = '';
  send({ type: 'chat', text: t });
}
$('btn-discard-pile')?.addEventListener('click', () => {
  if (window.openDiscardPile) window.openDiscardPile();
});
$('btn-quit-game').addEventListener('click', () => {
  toast('你已离开，本局由 AI 托管');
  gameState = null;
  showView('home');
  send({ type: 'leaveRoom' });
});

$('btn-end-game')?.addEventListener('click', () => {
  if (!roomState || !gameState) return;
  const isHost = roomState.hostPid === myPid;
  if (isHost) {
    if (confirm('确定结束当前对局，返回大厅？')) {
      send({ type: 'backToLobby' });
    }
  } else {
    if (confirm('确定认输并离开？本局将继续，你由 AI 托管。')) {
      toast('你已离开，本局由 AI 托管');
      gameState = null;
      showView('home');
      send({ type: 'leaveRoom' });
    }
  }
});

// ============ 牌桌渲染 ============
const SLOTS = {
  1: [[50, 18]],
  2: [[30, 16], [70, 16]],
  3: [[16, 40], [50, 14], [84, 40]],
  4: [[14, 48], [30, 14], [70, 14], [86, 48]],
  5: [[12, 52], [26, 15], [50, 11], [74, 15], [88, 52]],
  6: [[11, 55], [18, 22], [38, 12], [62, 12], [82, 22], [89, 55]],
  7: [[10, 58], [15, 26], [32, 13], [50, 10], [68, 13], [85, 26], [90, 58]],
};

function me() { return gameState ? gameState.players[gameState.mySeat] : null; }
function mySkillIds() { const m = me(); return m ? m.skills.map(s => s.id) : []; }
function prompt() { return gameState ? gameState.pendingForMe : null; }

function renderGame() {
  if (!gameState) return;
  window.gameState = gameState;
  if (gameState.pendingForMe && gameState.pendingForMe.kind === 'play') syncPlayMode(false);
  window._ATTACK_RANGE = attackRange();
  // 胜负结算
  if (gameState.finished) {
    if (!gameState._soundPlayed) {
      gameState._soundPlayed = true;
      sfx(gameState.winner === gameState.myIdentity || (gameState.winner === 'zhu' && gameState.myIdentity === 'zhong') ? 'win' : 'lose');
      if (sound) {
        try {
          const won = gameState.winner === gameState.myIdentity || (gameState.winner === 'zhu' && gameState.myIdentity === 'zhong');
          sound.onGameEvent(won ? 'victory' : 'defeat');
        } catch (e) {}
      }
      if (fx) {
        const me = gameState.myIdentity;
        const won = gameState.winner === me || (gameState.winner === 'zhu' && me === 'zhong');
        setTimeout(() => { try { fx.endGameOverlay(won); } catch (e) {} }, 300);
      }
      recordGameResult(gameState);
      // 显示查看回放按钮
      if (fx && roomState && roomState.lastReplayId) {
        setTimeout(() => {
          const btn = document.createElement('button');
          btn.className = 'btn btn-primary';
          btn.textContent = '📼 查看回放';
          btn.style.marginTop = '10px';
          btn.onclick = () => viewReplay(roomState.lastReplayId);
          const endOverlay = document.querySelector('.fx-end-title');
          if (endOverlay && endOverlay.parentElement) endOverlay.parentElement.appendChild(btn);
        }, 500);
      }
    }
  }
  // 我的回合高亮
  if (gameState.turnSeat === gameState.mySeat && gameState.phase === 'play' && !_myTurnSound) {
    _myTurnSound = true;
    sfx('phase');
    try {
      if (sound) sound.onGameEvent('round_start');
      if (fx) { fx.banner('出 牌 阶 段', { color: '#e6cf9a', size: 30, duration: 1100 }); fx.turnIndicator(gameState.mySeat); }
    } catch (e) {}
  } else if (gameState.turnSeat !== gameState.mySeat) {
    _myTurnSound = false;
  }
  renderOpponents();
  renderCenter();
  renderMyPanel();
  renderHand();
  renderActionBar();
  renderPromptBar();
  renderPendingZone();
  renderLog();
  updateCardCounter();
}

function orderedOpponents() {
  const n = gameState.players.length;
  const list = [];
  for (let i = 1; i < n; i++) {
    list.push(gameState.players[(gameState.mySeat + i) % n]);
  }
  return list;
}

// ---------- 身份标记（本地笔记，仅自己可见） ----------
const ID_MARKS_KEY = 'sgk_id_marks';
function loadIdMarks() {
  try { return JSON.parse(localStorage.getItem(ID_MARKS_KEY) || '{}') || {}; } catch { return {}; }
}
function idMarkOf(name) { return loadIdMarks()[name] || null; }
function saveIdMark(name, ident) {
  const marks = loadIdMarks();
  if (ident) marks[name] = ident; else delete marks[name];
  localStorage.setItem(ID_MARKS_KEY, JSON.stringify(marks));
  closeIdMarkMenu();
  renderOpponents();
}
let idMarkMenuEl = null;
function closeIdMarkMenu() {
  if (idMarkMenuEl) { idMarkMenuEl.remove(); idMarkMenuEl = null; }
  document.removeEventListener('click', idMarkMenuOutside);
}
function idMarkMenuOutside(e) {
  if (idMarkMenuEl && !idMarkMenuEl.contains(e.target)) closeIdMarkMenu();
}
function showIdMarkMenu(name, anchorEl) {
  closeIdMarkMenu();
  const menu = document.createElement('div');
  menu.className = 'id-mark-menu';
  const cur = idMarkOf(name);
  menu.innerHTML = ['zhu', 'zhong', 'fan', 'nei'].map(id =>
    `<div class="id-mark-opt ${cur === id ? 'cur' : ''}" data-id="${id}">${IDENTITY_NAME[id]}</div>`).join('') +
    '<div class="id-mark-opt clear" data-id="">清除标记</div>';
  const r = anchorEl.getBoundingClientRect();
  menu.style.left = Math.min(r.left, window.innerWidth - 120) + 'px';
  menu.style.top = (r.bottom + 4) + 'px';
  menu.addEventListener('click', e => {
    e.stopPropagation();
    const opt = e.target.closest('.id-mark-opt');
    if (!opt) return;
    saveIdMark(name, opt.dataset.id || null);
  });
  document.body.appendChild(menu);
  idMarkMenuEl = menu;
  // 同步注册外部点击关闭：打开菜单的本次点击已由锚点 handler stopPropagation，不会误关自身
  document.addEventListener('click', idMarkMenuOutside);
}
// 仅身份局启用身份标记
function identityMarkEnabled() { return gameState && gameState.gameMode === 'identity'; }

function renderOpponents() {
  const box = $('opponents');
  box.innerHTML = '';
  const opps = orderedOpponents();
  const slots = SLOTS[opps.length] || SLOTS[7];
  const cands = targetCandidates();
  opps.forEach((p, i) => {
    const [x, y] = slots[slots.length - 1 - i];
    const canTgt = cands.includes(p.seat);
    const selIdx = sel.targets.indexOf(p.seat);
    const div = document.createElement('div');
    div.className = 'opp' + (p.alive ? '' : ' dead') +
      (gameState.turnSeat === p.seat && gameState.phase !== 'picking' ? ' current' : '') +
      (canTgt ? ' targetable' : '') +
      (selIdx >= 0 ? ' selected' : '');
    div.style.left = x + '%';
    div.style.top = y + '%';
    div.dataset.seat = p.seat;
    // OL 经典目标标识：可指定角标 + 已选序号
    const tgtMark = canTgt ? '<span class="tgt-mark tgt-can">可指定</span>' : '';
    const selMark = selIdx >= 0 ? `<span class="tgt-mark tgt-selected">${selIdx + 1}</span>` : '';
    const idBadge = p.identity === 'zhu' ? '<span class="badge identity-zhu">主公</span>' :
      p.identity ? `<span class="badge identity">${IDENTITY_NAME[p.identity]}</span>` : '';
    const deadTag = p.alive ? '' : '<span class="badge dead-tag">死亡</span>';
    // 身份局：本地身份标记（仅自己可见）
    const mkRaw = identityMarkEnabled() ? idMarkOf(p.name) : null;
    // 白名单校验（localStorage 可能被篡改，非法值忽略）
    const mk = ['zhu', 'zhong', 'fan', 'nei'].includes(mkRaw) ? mkRaw : null;
    const markBadge = mk ? `<span class="badge id-mark id-mark-${mk}" title="你的身份标记（仅自己可见）">疑·${IDENTITY_NAME[mk]}</span>` : '';
    const markBtn = identityMarkEnabled() ? `<span class="id-mark-btn" title="标记身份（仅自己可见）">🏷</span>` : '';
    div.innerHTML = `
      ${tgtMark}${selMark}
      <div class="opp-top">
        <span class="opp-avatar-slot"></span>
        <div class="opp-info">
          <div class="opp-name">${esc(p.name)}</div>
          <div class="opp-general" style="color:var(--${p.kingdom})">${esc(p.generalName) || '？？'}</div>
          <div class="opp-hp">${hpHtml(p.hp, p.maxHp)}</div>
          <div class="opp-badges">
            <span class="badge kingdom-${p.kingdom}">${KINGDOM_NAME[p.kingdom]}</span>
            ${idBadge}${deadTag}${p.isAI ? '<span class="badge ai">AI</span>' : ''}${markBadge}${markBtn}
          </div>
        </div>
      </div>
      <div class="opp-row2">
        <span>${'<span class="hand-back"></span>'.repeat(Math.min(p.handCount, 6))}</span>
        <span class="hand-count">×${p.handCount}</span>
        ${Object.values(p.equips).filter(Boolean).map(e => `<span class="equip-mini ${e.subtype === 'weapon' ? 'weapon' : e.subtype === 'armor' ? 'armor' : 'horse'}" title="${e.name}${e.range ? ' 范围' + e.range : ''}">${e.name.slice(0, 2)}</span>`).join('')}
        ${p.judgeZone.map(j => `<span class="judge-mini">${j.name}</span>`).join('')}
      </div>`;
    div.querySelector('.opp-avatar-slot').replaceWith(avatarImg(p.generalId || 'unknown', 'opp-avatar'));
    if (identityMarkEnabled()) {
      const mb = div.querySelector('.id-mark-btn');
      if (mb) mb.addEventListener('click', e => { e.stopPropagation(); showIdMarkMenu(p.name, mb); });
      const mbadge = div.querySelector('.id-mark');
      if (mbadge) mbadge.addEventListener('click', e => { e.stopPropagation(); showIdMarkMenu(p.name, mbadge); });
    }
    if (canTgt) {
      div.addEventListener('click', () => toggleTarget(p.seat));
    }
    box.appendChild(div);
  });
}

// 游戏结束获胜方显示名（与 server/engine/game-modes.js 的 winner 值域一致）
// 覆盖：身份局 zhu/fan/nei、3v3 cold/warm、斗地主 landlord/farmer、国战势力名 shu/wei/wu/qun；未知值（自定义胜利条件的 seat 数字等）回退原文
const WINNER_NAMES = {
  zhu: '主公/忠臣', fan: '反贼', nei: '内奸',
  cold: '魏国', warm: '蜀国', landlord: '地主', farmer: '农民',
  shu: '蜀国', wei: '魏国', wu: '吴国', qun: '群雄',
};
function winnerName(w) { return WINNER_NAMES[w] || w; }

function renderCenter() {
  const phaseName = { picking: '选将阶段', prepare: '准备阶段', judge: '判定阶段', draw: '摸牌阶段', play: '出牌阶段', discard: '弃牌阶段', end: '结束阶段', dealing: '分发手牌', over: '已结束' };
  const cur = gameState.players[gameState.turnSeat];
  let status = `第 ${gameState.round} 轮 · ${phaseName[gameState.phase] || gameState.phase || ''} · 牌堆 ${gameState.deckCount}`;
  if (gameState.finished) {
    status = `🏆 游戏结束：${winnerName(gameState.winner)}获胜！`;
  } else if (cur) {
    status += ` — ${cur.seat === gameState.mySeat ? '你的回合' : '等待 ' + cur.name + ' 行动'}`;
  }
  $('center-status').textContent = status;
  // 当前回合玩家高亮
  if (fx && cur && !gameState.finished) {
    try { fx.turnIndicator(cur.seat); } catch (e) {}
  }
}

function renderMyPanel() {
  const p = me();
  const box = $('my-panel');
  if (!p) { box.innerHTML = ''; return; }
  const cands = targetCandidates();
  const canTgt = cands.includes(p.seat);
  const selIdx = sel.targets.indexOf(p.seat);
  box.className = 'my-panel' +
    (canTgt ? ' targetable' : '') +
    (selIdx >= 0 ? ' selected' : '');
  const tgtMark = canTgt ? '<span class="tgt-mark tgt-can">可指定</span>' : '';
  const selMark = selIdx >= 0 ? `<span class="tgt-mark tgt-selected">${selIdx + 1}</span>` : '';
  // 区分主动/被动/触发技能；主动技能可点击（与 action-bar 同源）
  const pr = (typeof prompt === 'function') ? prompt() : null;
  const liveSkills = pr?.skills || [];
  const liveById = Object.fromEntries(liveSkills.map(s => [s.id, s]));
  const skills = p.skills.map(s => {
    const live = liveById[s.id];
    const isActive = s.type === 'active' || s.type === 'lord' || s.type === 'convert';
    if (isActive && live && !live.passive) {
      const cls = 'skill-btn' + (sel.skill === s.id ? ' active' : '') + (live.usable ? '' : ' disabled');
      return `<button type="button" class="${cls}" data-skill="${esc(s.id)}" title="${esc(s.desc)}" ${live.usable ? '' : 'disabled'}>${esc(s.name)}</button>`;
    }
    // 被动/触发:虚线小标签,鼠标悬停看说明
    return `<span class="skill-btn passive" title="${esc(s.desc)}">${esc(s.name)}</span>`;
  }).join('');
  box.innerHTML = `
    ${tgtMark}${selMark}
    <div class="my-top">
      <span class="my-avatar-slot"></span>
      <div>
        <div class="my-name">${esc(p.name)}</div>
        <div class="my-general" style="color:var(--${p.kingdom})">${esc(p.generalName) || ''} <span class="badge kingdom-${p.kingdom}">${KINGDOM_NAME[p.kingdom]}</span></div>
        <div class="my-identity">身份：${IDENTITY_NAME[gameState.myIdentity] || '？'}</div>
        <div class="my-hp">${hpHtml(p.hp, p.maxHp)} <span style="font-size:12px;color:#9a8a6a">${p.hp}/${p.maxHp}</span></div>
      </div>
    </div>
    <div class="my-turn-bar-wrap"><div id="my-turn-bar" class="my-turn-bar"></div></div>
    <div class="my-equips">${Object.values(p.equips).filter(Boolean).map(e => `<span class="equip-mini" title="${e.name}${e.range ? ' 范围' + e.range : ''}">${e.name}</span>`).join('') || '<span style="font-size:11px;color:#5a4c3a">无装备</span>'}
    ${p.judgeZone.map(j => `<span class="judge-mini">${j.name}</span>`).join('')}</div>
    <div class="my-skills">${skills}</div>`;
  box.querySelector('.my-avatar-slot').replaceWith(avatarImg(p.generalId || 'unknown', 'my-avatar'));
  box.onclick = cands.includes(p.seat) ? () => toggleTarget(p.seat) : null;
  // 绑定技能按钮点击:与 action-bar 一致逻辑
  box.querySelectorAll('.skill-btn[data-skill]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.disabled) return;
      const skillId = btn.dataset.skill;
      if (sel.skill === skillId) { sel.skill = null; sel.targets = []; }
      else {
        sel.skill = skillId; sel.mode = null; sel.targets = [];
        const need = cardsNeededForSkill(skillId);
        sel.hand = sel.hand.slice(0, need === 1 ? 1 : need);
        if (skillId === 'kurou') {
          send({ type: 'action', action: 'skill', skill: 'kurou', cardIds: [], targets: [] });
          sel = freshSel();
          return;
        }
      }
      refreshAll();
    });
  });
}

// ---------- 手牌 ----------
function renderHand() {
  const box = $('my-hand');
  box.innerHTML = '';
  if (!gameState || !me()) return;
  // 排序栏
  if (window.SORT_MODES && window.setHandSortMode) {
    const sortBar = document.createElement('div');
    sortBar.className = 'hand-sort-bar';
    let sbHtml = '排序：';
    for (const m of window.SORT_MODES) {
      const active = window.getHandSortMode() === m.id ? ' active' : '';
      sbHtml += '<button class="' + active + '" data-sort="' + m.id + '">' + m.label + '</button>';
    }
    sortBar.innerHTML = sbHtml;
    sortBar.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        window.setHandSortMode(b.dataset.sort);
        renderHand();
      });
    });
    box.appendChild(sortBar);
  }
  const pr = prompt();
  const inPlay = pr && pr.kind === 'play';
  const inZhangba = pr && pr.kind === 'respond' && sel.zhangbaRespond;
  const numKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const handList = window.sortHand ? window.sortHand(gameState.myHand) : gameState.myHand;
  handList.forEach((c, i) => {
    const isSel = sel.hand.includes(c.uid);
    const cardNum = numKeys[i] || '';
    const el = cardEl(c, {
      selected: isSel,
      onClick: () => {
        if (!inPlay && !inZhangba) return;
        toggleHand(c.uid);
      },
    });
    // 右键查看卡牌详情
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (window.openCardDetail) window.openCardDetail(c);
    });
    el.title += ' · 右键查看详情';
    if (cardNum) el.setAttribute('data-num', cardNum);
    box.appendChild(el);
  });
}

function toggleHand(uid) {
  if (sel.skill) {
    const need = (skillButtonDef(sel.skill) || {}).needCards;
    const cap = need === '1+' ? 99 : (need || 0);
    const i = sel.hand.indexOf(uid);
    if (i >= 0) sel.hand.splice(i, 1);
    else {
      if (sel.hand.length >= cap) sel.hand.shift();
      sel.hand.push(uid);
    }
  } else if (sel.zhangbaRespond) {
    const i = sel.hand.indexOf(uid);
    if (i >= 0) sel.hand.splice(i, 1);
    else {
      if (sel.hand.length >= 2) sel.hand.shift();
      sel.hand.push(uid);
    }
  } else {
    const i = sel.hand.indexOf(uid);
    if (i >= 0) sel.hand.splice(i, 1);
    else {
      const w = me().equips.weapon;
      const zhangbaOk = w && w.key === 'zhangba' && prompt()?.canSha;
      if (zhangbaOk && sel.hand.length < 2) sel.hand.push(uid);
      else sel.hand = [uid];
    }
    syncPlayMode(false); // 不自动 confirm：所有主动使用都需要玩家点"确定"按钮
  }
  renderHand();
  renderOpponents();
  renderMyPanel();
  renderActionBar();
  renderPromptBar();
  renderPendingZone();
}

// ---------- 模式（出牌方式） ----------
function myHandCards() { return gameState.myHand.filter(c => sel.hand.includes(c.uid)); }
function attackRange() { const w = me().equips.weapon; return w ? w.range : 1; }
function seatDistance(fromSeat, toSeat) {
  const alive = gameState.players.filter(p => p.alive).sort((a, b) => a.seat - b.seat);
  const from = alive.find(p => p.seat === fromSeat);
  const to = alive.find(p => p.seat === toSeat);
  if (!from || !to || fromSeat === toSeat) return 0;
  const i = alive.indexOf(from), j = alive.indexOf(to), n = alive.length;
  let d = Math.min((i - j + n) % n, (j - i + n) % n);
  if (to.equips.horse_plus) d++;
  if (from.equips.horse_minus) d--;
  if (from.skills.some(s => s.id === 'mashu')) d--;
  return Math.max(1, d);
}
function canShaTargetFrom(fromSeat, toSeat) {
  const from = gameState.players[fromSeat];
  const to = gameState.players[toSeat];
  if (!from || !to || !to.alive || fromSeat === toSeat) return false;
  if (to.skills.some(s => s.id === 'kongcheng') && to.handCount === 0) return false;
  const range = from.equips.weapon ? from.equips.weapon.range : 1;
  return seatDistance(fromSeat, toSeat) <= range;
}
function kongchengImmune(p) { return p.skills.some(s => s.id === 'kongcheng') && p.handCount === 0; }
function qianxun(p) { return p.skills.some(s => s.id === 'qianxun'); }
function hasCardZone(p) { return p.handCount > 0 || Object.values(p.equips).some(Boolean) || p.judgeZone.length > 0; }

function modesForSelection() {
  const pr = prompt();
  if (!pr || pr.kind !== 'play') return [];
  const cards = myHandCards();
  const skills = mySkillIds();
  const modes = [];
  if (cards.length === 1) {
    const c = cards[0];
    const direct = key => !modes.some(m => m.as === key) && modes.push({ as: key, label: c.name, card: c });
    if (c.type === 'equip') direct('equip');
    else if (c.key === 'sha') { if (pr.canSha) direct('sha'); }
    else if (c.key === 'tao') { if (me().hp < me().maxHp) direct('tao'); }
    else if (['juedou', 'guohe', 'shunshou', 'wuzhong', 'nanman', 'wanjian', 'taoyuan', 'wugu', 'jiedao', 'lebu', 'shandian'].includes(c.key)) direct(c.key);
    // 转化
    if (isRed(c) && skills.includes('wusheng') && pr.canSha && !modes.some(m => m.as === 'sha')) modes.push({ as: 'sha', label: `武圣·${c.name}当杀`, virtual: true, card: c });
    if (c.key === 'shan' && skills.includes('longdan') && pr.canSha && !modes.some(m => m.as === 'sha')) modes.push({ as: 'sha', label: `龙胆·闪当杀`, virtual: true, card: c });
    if (!isRed(c) && skills.includes('qixi') && !modes.some(m => m.as === 'guohe')) modes.push({ as: 'guohe', label: `奇袭·当拆桥`, virtual: true, card: c });
    if (c.suit === 'diamond' && skills.includes('guose') && !modes.some(m => m.as === 'lebu')) modes.push({ as: 'lebu', label: `国色·当乐不思蜀`, virtual: true, card: c });
  } else if (cards.length === 2) {
    const w = me().equips.weapon;
    if (w && w.key === 'zhangba' && pr.canSha) modes.push({ as: 'sha', label: '丈八·两牌当杀', virtual: true });
  }
  return modes;
}

function syncPlayMode(autoUse = false) {
  if (sel.skill) return;
  const modes = modesForSelection();
  if (!sel.hand.length) {
    sel.mode = null;
    sel.targets = [];
    return;
  }
  if (modes.length === 1) {
    if (sel.mode !== modes[0].as) {
      sel.mode = modes[0].as;
      sel.targets = [];
    }
    return;
  }
  if (sel.mode && !modes.some(m => m.as === sel.mode)) sel.mode = null;
  if (!sel.mode) sel.targets = [];
}

function modeRule(mode) {
  const others = gameState.players.filter(p => p.seat !== gameState.mySeat && p.alive);
  const m = me();
  switch (mode) {
    case 'sha': {
      const fangtian = m.equips.weapon && m.equips.weapon.key === 'fangtian' && sel.hand.length >= gameState.myHand.length;
      // 陷阵对 xianzhenTarget 取消距离限制,但仍受空城免疫
      const xianzhenTarget = m.turnFlags && m.turnFlags.xianzhenTarget;
      const inRange = others.filter(p => (p.distance <= attackRange() || (xianzhenTarget != null && p.seat === xianzhenTarget)) && !kongchengImmune(p));
      return { min: 1, max: fangtian ? 3 : 1, cands: inRange.map(p => p.seat) };
    }
    case 'juedou': return { min: 1, max: 1, cands: others.filter(p => !kongchengImmune(p)).map(p => p.seat) };
    case 'guohe': return { min: 1, max: 1, cands: others.filter(hasCardZone).map(p => p.seat) };
    case 'shunshou': return { min: 1, max: 1, cands: others.filter(p => hasCardZone(p) && !qianxun(p) && (mySkillIds().includes('qicai') || p.distance <= 1)).map(p => p.seat) };
    case 'lebu': return { min: 1, max: 1, cands: others.filter(p => !qianxun(p) && !p.judgeZone.some(j => j.key === 'lebu')).map(p => p.seat) };
    case 'jiedao': {
      const holderSeat = sel.targets[0];
      if (holderSeat == null) {
        return { min: 2, max: 2, cands: others.filter(p => p.equips.weapon).map(p => p.seat), second: true, phase: 'holder' };
      }
      return {
        min: 2, max: 2, second: true, phase: 'victim',
        cands: gameState.players.filter(p => p.alive && p.seat !== holderSeat && canShaTargetFrom(holderSeat, p.seat)).map(p => p.seat),
      };
    }
    default: return { min: 0, max: 0, cands: [] };
  }
}

function skillButtonDef(skillId) {
  const pr = prompt();
  if (!pr || !pr.skills) return null;
  const s = pr.skills.find(x => x.id === skillId);
  return s ? (s.button || {}) : null;
}

function skillTargetRule(skillId) {
  const others = gameState.players.filter(p => p.seat !== gameState.mySeat && p.alive);
  const def = skillButtonDef(skillId) || {};
  const filter = def.targetFilter;
  let cands = [];
  if (filter === 'other') cands = others.map(p => p.seat);
  else if (filter === 'male') cands = others.filter(p => p.gender === 'm').map(p => p.seat);
  else if (filter === 'wounded') cands = gameState.players.filter(p => p.alive && p.hp < p.maxHp).map(p => p.seat);
  else if (filter === 'male_wounded') cands = others.filter(p => p.gender === 'm' && p.hp < p.maxHp).map(p => p.seat);
  return { min: def.needTargets || 0, max: def.needTargets || 0, cands };
}

function cardsNeededForSkill(skillId) {
  const def = skillButtonDef(skillId) || {};
  return def.needCards === '1+' ? 1 : (def.needCards || 0);
}

// ---------- 待用区（OL 经典操作样式） ----------
/** 当前选择状态的信息：提示文字、可确认性、目标规则 */
function pendingInfo() {
  const pr = prompt();
  const info = { hint: '', canConfirm: false, needTargets: 0, needCards: 0, rule: null };
  if (!pr || pr.kind !== 'play' || gameState.finished) return info;
  if (sel.skill) {
    const needCards = cardsNeededForSkill(sel.skill);
    const rule = sel.skill === 'jijiang' ? modeRule('sha') : skillTargetRule(sel.skill);
    info.needCards = needCards;
    info.needTargets = rule.min;
    info.rule = rule;
    info.canConfirm = sel.hand.length >= needCards && sel.targets.length >= rule.min && (needCards > 0 || rule.min > 0);
    const s = (pr.skills || []).find(x => x.id === sel.skill);
    info.hint = `【${s ? s.name : sel.skill}】${needCards ? (needCards === 1 ? '选一张牌' : `选 ${needCards} 张牌`) : ''}${rule.min ? '，并指定目标' : ''}`;
  } else if (sel.mode) {
    const rule = modeRule(sel.mode);
    info.rule = rule;
    info.needTargets = rule.min;
    info.canConfirm = sel.targets.length >= rule.min;
    if (sel.mode === 'jiedao') {
      info.hint = sel.targets.length ? '请选择其要【杀】的目标（第 2 个）' : '请选择装备武器的角色（第 1 个）';
    } else if (rule.second && rule.phase === 'victim') {
      info.hint = '请选择第二个目标';
    } else {
      info.hint = rule.min ? (sel.targets.length ? `已选 ${sel.targets.length}/${rule.max} 个目标，继续选择或点确定` : `请选择目标（${rule.min}${rule.max > rule.min ? '~' + rule.max : ''} 个）`) : '可直接使用，点确定';
    }
  } else {
    info.hint = sel.hand.length ? '请选择使用方式' : '';
  }
  return info;
}

function renderPendingZone() {
  const zone = $('pending-zone');
  if (!zone) return;
  const pr = prompt();
  // OL 经典：响应阶段（闪/桃/无懈等）也在中央待用区显示标题与「不出」
  if (pr && pr.kind === 'respond' && !gameState.finished) {
    zone.classList.add('active');
    const inner = document.createElement('div');
    inner.className = 'pending-inner';
    const title = document.createElement('div');
    title.className = 'pending-skill';
    title.innerHTML = `${esc(pr.title)}<span>点击高亮的手牌响应</span>`;
    inner.appendChild(title);
    const acts = document.createElement('div');
    acts.className = 'pending-actions';
    const pass = document.createElement('button');
    pass.className = 'btn pending-cancel';
    pass.textContent = '不 出 [0]';
    pass.setAttribute('data-key', '0');
    pass.addEventListener('click', () => { sel.zhangbaRespond = false; send({ type: 'action', pass: true }); });
    acts.appendChild(pass);
    inner.appendChild(acts);
    zone.innerHTML = '';
    zone.appendChild(inner);
    return;
  }
  const active = pr && pr.kind === 'play' && !gameState.finished && (sel.hand.length || sel.skill);
  if (!active) {
    zone.innerHTML = '';
    zone.classList.remove('active');
    return;
  }
  zone.classList.add('active');
  const info = pendingInfo();
  const cards = myHandCards();
  const div = document.createElement('div');
  div.className = 'pending-inner';

  // 选中牌（放大展示，OL 样式）
  if (cards.length) {
    const cardsRow = document.createElement('div');
    cardsRow.className = 'pending-cards';
    for (const c of cards) {
      const el = cardEl(c, { selected: true });
      el.classList.add('pending-card');
      cardsRow.appendChild(el);
    }
    div.appendChild(cardsRow);
  }

  // 技能信息
  if (sel.skill) {
    const s = (pr.skills || []).find(x => x.id === sel.skill);
    if (s) {
      const box = document.createElement('div');
      box.className = 'pending-skill';
      box.innerHTML = `【${esc(s.name)}】<span>${esc(s.desc)}</span>`;
      div.appendChild(box);
    }
  }

  // 使用方式选项（多方式时）
  const modes = sel.skill ? [] : modesForSelection();
  if (modes.length > 1) {
    const modesRow = document.createElement('div');
    modesRow.className = 'pending-modes';
    for (const m of modes) {
      const opt = document.createElement('span');
      opt.className = 'pending-mode' + (sel.mode === m.as ? ' cur' : '');
      opt.textContent = m.label;
      opt.addEventListener('click', () => {
        sel.mode = sel.mode === m.as ? null : m.as;
        sel.targets = [];
        renderPendingZone(); renderOpponents(); renderMyPanel(); renderActionBar();
      });
      modesRow.appendChild(opt);
    }
    div.appendChild(modesRow);
  }

  // 提示文字
  const hint = document.createElement('div');
  hint.className = 'pending-hint';
  hint.textContent = info.hint || (sel.skill ? '请选择目标' : '请选择目标或确定使用');
  div.appendChild(hint);

  // 确定 / 取消
  const acts = document.createElement('div');
  acts.className = 'pending-actions';
  const ok = document.createElement('button');
  ok.className = 'btn btn-primary pending-ok';
  ok.textContent = '确 定';
  ok.setAttribute('data-key', '↵');
  ok.disabled = !info.canConfirm;
  ok.addEventListener('click', confirmPlay);
  acts.appendChild(ok);
  const cancel = document.createElement('button');
  cancel.className = 'btn pending-cancel';
  cancel.textContent = '取 消';
  cancel.setAttribute('data-key', 'Esc');
  cancel.addEventListener('click', () => { sel = freshSel(); refreshAll(); });
  acts.appendChild(cancel);
  div.appendChild(acts);

  zone.innerHTML = '';
  zone.appendChild(div);
}

/** 全量刷新渲染（供交互函数复用） */
function refreshAll() {
  renderHand(); renderOpponents(); renderMyPanel(); renderActionBar(); renderPromptBar(); renderPendingZone();
}

// ---------- 操作条 ----------
function renderActionBar() {
  const bar = $('action-bar');
  bar.innerHTML = '';
  const pr = prompt();
  if (!pr || pr.kind !== 'play' || gameState.finished) return;
  // 单行提示（详细提示在待用区）
  const hint = document.createElement('span');
  hint.className = 'action-hint';
  if (sel.hand.length || sel.skill) {
    hint.textContent = pendingInfo().hint || '已选牌，请选择目标';
  } else {
    hint.textContent = '出牌阶段：点选手牌或技能 → 指定目标 → 确定';
  }
  bar.appendChild(hint);

  // 技能按钮
  let skillIdx = 0;
  for (const s of pr.skills || []) {
    if (s.passive) continue;
    const btn = document.createElement('button');
    btn.className = 'btn btn-small' + (sel.skill === s.id ? ' btn-primary' : '');
    btn.textContent = s.name;
    btn.disabled = !s.usable;
    btn.title = s.desc;
    const fkey = 'F' + (skillIdx + 1);
    btn.setAttribute('data-key', fkey);
    skillIdx++;
    btn.addEventListener('click', () => {
      if (sel.skill === s.id) { sel.skill = null; sel.targets = []; }
      else {
        sel.skill = s.id; sel.mode = null; sel.targets = [];
        sel.hand = sel.hand.slice(0, cardsNeededForSkill(s.id) === 1 ? 1 : cardsNeededForSkill(s.id));
        if (s.id === 'kurou') { // 无牌无目标直接发动
          send({ type: 'action', action: 'skill', skill: 'kurou', cardIds: [], targets: [] });
          sel = freshSel();
          return;
        }
      }
      refreshAll();
    });
    bar.appendChild(btn);
  }

  const end = document.createElement('button');
  end.className = 'btn btn-end';
  end.textContent = '结束出牌';
  end.setAttribute('data-key', 'X');
  end.addEventListener('click', () => { send({ type: 'action', action: 'end' }); sel = freshSel(); refreshAll(); });
  bar.appendChild(end);
}

function confirmPlay() {
  if (sel.skill) {
    send({ type: 'action', action: 'skill', skill: sel.skill, cardIds: sel.hand.slice(), targets: sel.targets.slice() });
  } else if (sel.mode) {
    send({ type: 'action', action: 'playCard', cardIds: sel.hand.slice(), as: sel.mode, targets: sel.targets.slice() });
  }
  sel = freshSel();
}

// ---------- 提示条 / 响应 ----------
function renderPromptBar() {
  const box = $('prompt-bar');
  const pr = prompt();
  if (gameState.finished) {
    box.innerHTML = `<div class="prompt-title">🏆 ${winnerName(gameState.winner)}获胜！</div><div class="prompt-options"></div>`;
    const isHost = roomState && roomState.hostPid === myPid;
    if (isHost) {
      // 房主：返回大厅（房间状态回到 lobby）
      box.querySelector('.prompt-options').appendChild(quickBtn('返回大厅', () => send({ type: 'backToLobby' }), true));
    } else {
      // 非房主：退出房间（自己离开，房间保持 ended 给房主）
      box.querySelector('.prompt-options').appendChild(quickBtn('退出房间', () => { send({ type: 'leaveRoom' }); roomState = null; gameState = null; closeModal(); showView('home'); }, true));
    }
    return;
  }
  if (!pr) {
    if (gameState && gameState.turnSeat === gameState.mySeat && gameState.phase === 'play') {
      box.innerHTML = '<div class="prompt-title">轮到你了：使用手牌或发动技能。<br>杀的距离看头像旁数字，技能说明见按钮悬浮。</div>';
    } else {
      box.innerHTML = '<div class="prompt-title">等待其他玩家行动…</div>';
    }
    return;
  }
  if (pr.kind === 'play') {
    box.innerHTML = '<div class="prompt-title">轮到你了：使用手牌或发动技能。<br>杀的距离看头像旁数字，技能说明见按钮悬浮。</div>';
    return;
  }
  if (pr.kind === 'respond') {
    renderRespond(box, pr);
    return;
  }
  if (pr.kind === 'confirm') {
    box.innerHTML = `<div class="prompt-title">${esc(pr.title)}</div><div class="prompt-options"></div>`;
    const opts = box.querySelector('.prompt-options');
    opts.appendChild(quickBtn('确定', () => send({ type: 'action', yes: true })));
    opts.appendChild(quickBtn('取消', () => send({ type: 'action', yes: false })));
    return;
  }
  if (pr.kind === 'chooseOption') {
    box.innerHTML = `<div class="prompt-title">${esc(pr.title)}</div><div class="prompt-options"></div>`;
    const opts = box.querySelector('.prompt-options');
    for (const o of pr.options || []) {
      opts.appendChild(quickBtn(o.label, () => send({ type: 'action', option: o.id })));
    }
    return;
  }
  if (pr.kind === 'chooseCards' || pr.kind === 'chooseCardOf' || pr.kind === 'arrange' || pr.kind === 'chooseGeneral') {
    if (modalPromptKey === promptKey(pr)) return; // 弹窗已打开，避免重绘打断选择
    modalPromptKey = promptKey(pr);
    if (pr.kind === 'chooseCards') openChooseCardsModal(pr);
    else if (pr.kind === 'chooseCardOf') openChooseCardOfModal(pr);
    else if (pr.kind === 'arrange') openArrangeModal(pr);
    else openChooseGeneralModal(pr);
    return;
  }
  modalPromptKey = null;
  if (pr.kind === 'choosePlayers') {
    renderChoosePlayers(box, pr);
    return;
  }
  box.innerHTML = `<div class="prompt-title">${esc(pr.title || '等待…')}</div>`;
}

function quickBtn(label, fn, primary) {
  const b = document.createElement('button');
  b.className = 'btn btn-small' + (primary ? ' btn-primary' : '');
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

function renderRespond(box, pr) {
  box.innerHTML = `<div class="prompt-title">${esc(pr.title)}</div><div class="prompt-options"></div>`;
  const opts = box.querySelector('.prompt-options');
  let optIdx = 0;
  for (const o of pr.options || []) {
    optIdx++;
    if (o.zhangba) {
      const b = quickBtn(o.label + ` [${optIdx}]`, () => {
        sel.zhangbaRespond = true;
        sel.hand = [];
        renderHand();
        renderRespondZhangba(box, pr);
      });
      opts.appendChild(b);
    } else {
      const b = quickBtn(o.label + ` [${optIdx}]`, () => {
        send({ type: 'action', cardIds: o.cardIds });
      });
      opts.appendChild(b);
    }
  }
  if (pr.bagua) opts.appendChild(quickBtn('八卦阵·判定', () => send({ type: 'action', skill: 'bagua' })));
  if (pr.jijiang) opts.appendChild(quickBtn('激将', () => send({ type: 'action', skill: 'jijiang' })));
  const passBtn = quickBtn('不出 [0]', () => { sel.zhangbaRespond = false; send({ type: 'action', pass: true }); });
  passBtn.setAttribute('data-key', '0');
  opts.appendChild(passBtn);
}

function renderRespondZhangba(box, pr) {
  box.innerHTML = `<div class="prompt-title">丈八蛇矛：请选择两张手牌当【杀】</div><div class="prompt-options"></div>`;
  const opts = box.querySelector('.prompt-options');
  const ok = quickBtn('确定（已选' + sel.hand.length + '/2）', () => {
    if (sel.hand.length === 2) {
      send({ type: 'action', cardIds: sel.hand.slice(), zhangba: true });
      sel.zhangbaRespond = false;
    }
  }, true);
  ok.disabled = sel.hand.length !== 2;
  opts.appendChild(ok);
  opts.appendChild(quickBtn('返回', () => { sel.zhangbaRespond = false; sel.hand = []; renderHand(); renderPromptBar(); }));
}

function renderChoosePlayers(box, pr) {
  // 高亮候选人，点选后确认
  sel.playerPick = { min: pr.min, max: pr.max, cands: pr.candidates || [] };
  box.innerHTML = `<div class="prompt-title">${esc(pr.title)}（已选 ${sel.targets.length}/${pr.max}）</div><div class="prompt-options"></div>`;
  const opts = box.querySelector('.prompt-options');
  const ok = quickBtn('确定', () => {
    if (sel.targets.length >= pr.min) {
      send({ type: 'action', targetIds: sel.targets.slice() });
      sel.targets = []; sel.playerPick = null;
    }
  }, true);
  ok.disabled = sel.targets.length < pr.min;
  opts.appendChild(ok);
  if (pr.min === 0) opts.appendChild(quickBtn('跳过', () => { send({ type: 'action', targetIds: [] }); sel.targets = []; sel.playerPick = null; }));
  // 复用对手面板点选
  renderOpponents();
}

// ---------- 弹窗类询问 ----------
function openChooseCardsModal(pr) {
  const selected = [];
  const render = () => {
    let html = `<div class="modal-title">${esc(pr.title)}（选 ${pr.min === pr.max ? pr.min : pr.min + '~' + pr.max} 张，已选 ${selected.length}）</div><div class="pick-cards">`;
    $('modal').innerHTML = html + '</div><div class="modal-actions"></div>';
    const box = $('modal').querySelector('.pick-cards');
    for (const c of pr.cards || []) {
      box.appendChild(cardEl(c, {
        selected: selected.includes(c.uid),
        onClick: () => {
          const i = selected.indexOf(c.uid);
          if (i >= 0) selected.splice(i, 1);
          else { if (selected.length >= pr.max) selected.shift(); selected.push(c.uid); }
          render();
        },
      }));
    }
    const acts = $('modal').querySelector('.modal-actions');
    const ok = quickBtn('确定', () => {
      if (selected.length >= pr.min) { closeModal(); send({ type: 'action', cardIds: selected.slice() }); }
    }, true);
    ok.disabled = selected.length < pr.min;
    acts.appendChild(ok);
    if (pr.min === 0) acts.appendChild(quickBtn('跳过', () => { closeModal(); send({ type: 'action', cardIds: [] }); }));
  };
  openModal('');
  render();
}

function openChooseCardOfModal(pr) {
  openModal(`<div class="modal-title">${esc(pr.title)}</div><div class="pick-cards"></div>`);
  const box = $('modal').querySelector('.pick-cards');
  if (pr.handCount > 0) {
    const back = document.createElement('div');
    back.className = 'card small';
    back.style.background = 'linear-gradient(135deg,#6d4a2a,#4a2f18)';
    back.innerHTML = `<div class="cname" style="color:#d8c49a;margin-top:24px">手牌<br>×${pr.handCount}</div>`;
    back.addEventListener('click', () => { closeModal(); send({ type: 'action', zone: 'hand' }); });
    box.appendChild(back);
  }
  for (const e of pr.equips || []) {
    box.appendChild(cardEl(e.card, { small: true, onClick: () => { closeModal(); send({ type: 'action', zone: e.slot, cardUid: e.card.uid }); } }));
  }
  for (const j of pr.judge || []) {
    box.appendChild(cardEl(j, { small: true, onClick: () => { closeModal(); send({ type: 'action', zone: 'judge', cardUid: j.uid }); } }));
  }
}

function openArrangeModal(pr) {
  let top = [], bottom = [], pool = (pr.cards || []).map(c => c.uid);
  const byUid = Object.fromEntries((pr.cards || []).map(c => [c.uid, c]));
  const render = () => {
    const zone = (title, uids, onCard) => {
      let h = `<div class="arrange-zone"><div class="ztitle">${title}</div><div class="pick-cards">`;
      return h + '</div></div>';
    };
    $('modal').innerHTML = `<div class="modal-title">${esc(pr.title)}</div>
      <div class="hint" style="text-align:center;margin-bottom:8px">点击「待分配」的牌放入牌堆顶；点击牌堆顶的牌移到牌堆底；点击牌堆底的牌放回</div>
      ${zone('牌堆顶（先摸）', top)}${zone('待分配', pool)}${zone('牌堆底', bottom)}
      <div class="modal-actions"></div>`;
    const zones = $('modal').querySelectorAll('.arrange-zone');
    const fill = (el, uids, fn) => {
      const box = el.querySelector('.pick-cards');
      for (const uid of uids) box.appendChild(cardEl(byUid[uid], { small: true, onClick: () => { fn(uid); render(); } }));
    };
    fill(zones[0], top, uid => { top = top.filter(u => u !== uid); bottom.push(uid); });
    fill(zones[1], pool, uid => { pool = pool.filter(u => u !== uid); top.push(uid); });
    fill(zones[2], bottom, uid => { bottom = bottom.filter(u => u !== uid); pool.push(uid); });
    const acts = $('modal').querySelector('.modal-actions');
    acts.appendChild(quickBtn('确定', () => {
      closeModal();
      send({ type: 'action', top: top.concat(pool), bottom });
    }, true));
  };
  openModal('');
  render();
}

function openChooseGeneralModal(pr) {
  let chosen = null;
  let searchQuery = '';
  let filterKingdom = 'all';
  let filterHp = 'all';
  let onlyFavorites = false;
  let favorites = [];
  try { favorites = JSON.parse(localStorage.getItem('sgk_fav_generals') || '[]'); } catch {}

  const allCandidates = pr.candidates || [];
  const kingdoms = ['all', ...[...new Set(allCandidates.map(g => g.kingdom))]];

  const getFiltered = () => {
    let list = allCandidates;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(g =>
        g.name.toLowerCase().includes(q) ||
        (g.title || '').toLowerCase().includes(q) ||
        (g.skills || []).some(s => (s.name || '').toLowerCase().includes(q) || (s.desc || '').toLowerCase().includes(q))
      );
    }
    if (filterKingdom !== 'all') list = list.filter(g => g.kingdom === filterKingdom);
    if (filterHp !== 'all') list = list.filter(g => String(g.hp) === filterHp);
    if (onlyFavorites) list = list.filter(g => favorites.includes(g.id));
    return list;
  };

  const render = () => {
    const filtered = getFiltered();
    const modal = $('modal');
    modal.innerHTML = '';

    // 标题
    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = pr.title;
    modal.appendChild(title);

    // 搜索筛选栏
    const bar = document.createElement('div');
    bar.className = 'gen-search-bar';
    bar.innerHTML = `
      <input id="gen-search" placeholder="搜索武将/技能/称号..." value="${esc(searchQuery)}" style="flex:1">
      <select id="gen-kingdom" style="width:80px">${kingdoms.map(k => `<option value="${k}" ${k === filterKingdom ? 'selected' : ''}>${k === 'all' ? '全部' : KINGDOM_NAME[k] || k}</option>`).join('')}</select>
      <select id="gen-hp" style="width:60px">${['all','2','3','4','5'].map(h => `<option value="${h}" ${h === filterHp ? 'selected' : ''}>${h === 'all' ? '体力' : h + '血'}</option>`).join('')}</select>
      <button id="gen-fav-only" class="btn btn-small ${onlyFavorites ? 'btn-primary' : ''}">${onlyFavorites ? '★ 已收藏' : '☆ 收藏'}</button>
      <button id="gen-clear" class="btn btn-small">清除</button>
    `;
    modal.appendChild(bar);

    // 计数
    const count = document.createElement('div');
    count.className = 'gen-count';
    count.style.cssText = 'font-size:12px;color:#8a7a5f;margin:4px 0';
    count.textContent = `共 ${filtered.length} 名武将`;
    modal.appendChild(count);

    // 武将网格
    const grid = document.createElement('div');
    grid.className = 'general-grid';
    for (const g of filtered) {
      const div = document.createElement('div');
      div.className = 'general-card' + (chosen === g.id ? ' selected' : '');
      div.appendChild(avatarImg(g.id));
      const isFav = favorites.includes(g.id);
      div.insertAdjacentHTML('beforeend', `
        <div class="gname">
          <span class="badge kingdom-${g.kingdom}">${KINGDOM_NAME[g.kingdom]}</span>
          ${esc(g.name)} ${'❤'.repeat(g.hp)}
          <span class="gen-fav ${isFav ? 'active' : ''}" data-id="${g.id}">${isFav ? '★' : '☆'}</span>
        </div>
        <div class="gskills">${(g.skills || []).map(s => `<b>${esc(s.name)}</b>：${esc(s.desc)}`).join('<br>')}</div>`);
      div.addEventListener('click', e => {
        if (e.target.classList.contains('gen-fav')) {
          e.stopPropagation();
          const idx = favorites.indexOf(g.id);
          if (idx >= 0) favorites.splice(idx, 1); else favorites.push(g.id);
          localStorage.setItem('sgk_fav_generals', JSON.stringify(favorites));
          render();
          return;
        }
        chosen = g.id; render();
      });
      grid.appendChild(div);
    }
    modal.appendChild(grid);

    // 操作区
    const acts = document.createElement('div');
    acts.className = 'modal-actions';
    const ok = quickBtn('确定选择', () => {
      if (chosen) { closeModal(); send({ type: 'action', generalId: chosen }); }
    }, true);
    ok.disabled = !chosen;
    acts.appendChild(ok);
    modal.appendChild(acts);

    // 绑定筛选控件事件
    const sInp = $('gen-search');
    if (sInp) sInp.addEventListener('input', () => { searchQuery = sInp.value; render(); });
    const kSel = $('gen-kingdom');
    if (kSel) kSel.addEventListener('change', () => { filterKingdom = kSel.value; render(); });
    const hSel = $('gen-hp');
    if (hSel) hSel.addEventListener('change', () => { filterHp = hSel.value; render(); });
    const favBtn = $('gen-fav-only');
    if (favBtn) favBtn.addEventListener('click', () => { onlyFavorites = !onlyFavorites; render(); });
    const clearBtn = $('gen-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => { searchQuery = ''; filterKingdom = 'all'; filterHp = 'all'; onlyFavorites = false; render(); });
  };
    openModal('');
  render();
}

// ---------- 日志 ----------
function renderLog() {
  const box = $('game-log');
  box.innerHTML = (gameState.logs || []).map(l => `<div>${esc(l)}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}

// ============ 出牌倒计时 ============
let turnTimerEl = null;
function showTurnTimer(remaining) {
  if (!turnTimerEl) {
    turnTimerEl = document.createElement('div');
    turnTimerEl.id = 'turn-timer';
    turnTimerEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-200px);' +
      'font-size:48px;font-weight:bold;color:#ffd700;text-shadow:0 0 20px #ff4400,0 4px 8px #000;' +
      'z-index:250;pointer-events:none;font-family:STKaiti,KaiTi,serif;transition:color .3s;';
    document.body.appendChild(turnTimerEl);
  }
  turnTimerEl.textContent = remaining;
  turnTimerEl.style.color = remaining <= 5 ? '#ff4444' : '#ffd700';
  turnTimerEl.style.display = 'block';
  if (remaining <= 5) {
    turnTimerEl.style.animation = 'timerPulse 0.5s ease-in-out infinite';
  } else {
    turnTimerEl.style.animation = '';
  }
  if (remaining <= 0) {
    turnTimerEl.style.display = 'none';
  }
  // 更新我的面板上的烧条
  const bar = document.getElementById('my-turn-bar');
  if (bar) {
    const total = (roomState && roomState.opts && roomState.opts.turnTimer) || window._turnTotal || 30;
    const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
    bar.style.width = pct + '%';
    bar.className = 'my-turn-bar ' + (remaining <= 5 ? 'danger' : remaining <= 10 ? 'warn' : '');
  }
}

function hideTurnTimer() {
  if (turnTimerEl) turnTimerEl.style.display = 'none';
  const bar = document.getElementById('my-turn-bar');
  if (bar) bar.style.width = '0%';
}

// ---------- 视觉特效 ----------
function seatEl(seat) {
  if (seat === gameState.mySeat) return $('my-panel');
  return document.querySelector(`.opp[data-seat="${seat}"]`);
}
function handleEvent(ev) {
  if (!ev || !gameState || !fx) return;
  switch (ev.type) {
    case 'cardUse': {
      const fromEl = seatEl(ev.from);
      const card = ev.card || { name: '出牌' };
      if (fromEl) {
        fx.casterGlow(fromEl, ev.key);
        if (!ev.targets || !ev.targets.length) {
          const r = fx.rectOf(fromEl);
          fx.particles(r.x, r.y, { count: 18, color: '#ffd700', size: 5, speed: 80, shape: 'star' });
        }
      }
      const targets = ev.targets || [];
      targets.forEach(seat => {
        const el = seatEl(seat);
        if (el) fx.targetHighlight(el, ev.key);
      });
      const flyTargets = ev.key === 'jiedao' ? targets.slice(0, 1) : targets;
      const symbols = { juedou: '⚔', guohe: '拆', shunshou: '牵', jiedao: '借', lebu: '乐', shandian: '电', wuzhong: '无', taoyuan: '桃', wugu: '谷' };
      flyTargets.forEach((seat, i) => setTimeout(() => {
        const toEl = seatEl(seat);
        if (fromEl && toEl) fx.cardFly(fromEl, toEl, card, { type: ev.key, symbol: symbols[ev.key] });
      }, i * 130));
      if (card.key) cardCounter?.recordPlay(card);
      if (sound && card.key) sound.onGameEvent(card.key);
      if (ev.key !== 'sha') sfx(ev.key === 'tao' ? 'heal' : 'phase');
      break;
    }
    case 'sha': {
      const from = seatEl(ev.from), to = seatEl(ev.to);
      if (from && to) {
        fx.casterGlow(from, 'sha');
        fx.targetHighlight(to, 'sha');
        fx.cardFly(from, to, ev.card || { name: '杀', suit: 'spade', rank: 7 }, { type: 'sha', symbol: '⚔' });
        if (ev.card) {
          fx.hitEffect(to, 'sha');
        }
        sfx('sha');
      }
      break;
    }
    case 'pindian': {
      // 拼点事件：双方各出一张牌比大小
      const initEl = seatEl(ev.initiator), tgtEl = seatEl(ev.target);
      if (initEl && tgtEl) {
        // 飞向中间
        const midX = (initEl.getBoundingClientRect().left + tgtEl.getBoundingClientRect().left) / 2;
        const midY = (initEl.getBoundingClientRect().top + tgtEl.getBoundingClientRect().top) / 2;
        if (ev.initiatorCard) fx.cardFly(initEl, { getBoundingClientRect: () => ({ left: midX, top: midY, right: midX, bottom: midY, width: 0, height: 0 }) }, ev.initiatorCard, { type: 'pindian', symbol: '⚐' });
        if (ev.targetCard) setTimeout(() => fx.cardFly(tgtEl, { getBoundingClientRect: () => ({ left: midX + 40, top: midY, right: midX + 40, bottom: midY, width: 0, height: 0 }) }, ev.targetCard, { type: 'pindian', symbol: '⚑' }), 200);
        sfx('phase');
      }
      break;
    }
    case 'hit': {
      const el = seatEl(ev.seat);
      if (el) fx.damageNumber(el, 1, { prefix: '-', amount: 1 });
      break;
    }
    case 'damage': {
      const el = seatEl(ev.seat);
      if (el) {
        fx.damageNumber(el, ev.amount, { shake: true });
        el.classList.add('dmg-flash');
        setTimeout(() => el.classList.remove('dmg-flash'), 550);
      }
      sfx('damage');
      break;
    }
    case 'dodge': {
      const el = seatEl(ev.seat);
      if (el) fx.dodge(el);
      sfx('shan');
      break;
    }
    case 'recover': {
      const el = seatEl(ev.seat);
      if (el) fx.healNumber(el, 1);
      sfx('heal');
      break;
    }
    case 'death': {
      const el = seatEl(ev.seat);
      if (el) fx.death(el);
      sfx('death');
      if (ev.generalId) voice(ev.generalId, 'death');
      break;
    }
    case 'selectGeneral': {
      if (ev.generalId) voice(ev.generalId, 'select');
      break;
    }
    case 'skillVoice': {
      if (ev.generalId && ev.skillId) voice(ev.generalId, 'skill', ev.skillId);
      break;
    }
    case 'equip': {
      fx.equipAnim(ev.seat, { equipName: ev.equipName });
      sfx('equip');
      break;
    }
    case 'aoe': {
      const from = seatEl(ev.from);
      if (ev.aoeType === 'nanman') fx.nanmanSweep(from);
      else fx.wanjianSweep(from);
      break;
    }
    case 'dying': {
      fx.dyingEffect(ev.seat);
      break;
    }
    case 'skillAnim': {
      // 技能专属动画
      const from = seatEl(ev.from), to = seatEl(ev.to);
      if (ev.skillId === 'longdan' && from && to) fx.longdanAnim(from, to);
      else if (ev.skillId === 'wusheng' && from && to) fx.wushengAnim(from, to);
      break;
    }
    case 'judge': {
      if (ev.card) fx.judgment(ev.card);
      sfx('judge');
      break;
    }
    case 'wugu':
    case 'draw':
      sfx('draw');
      break;
    case 'win':
      sfx('win');
      break;
    case 'lose':
      sfx('lose');
      break;
  }
}

// 全局按钮点击音效
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn');
  if (btn && !btn.closest('#audio-control')) sfx('click');
});

// ============ DIY ============
async function loadDiy() {
  const res = await fetch('/api/meta');
  meta = await res.json();
  renderDiySkills();
  renderDiyList();
}
let diySelSkills = [];
function renderDiySkills() {
  const box = $('diy-skill-list');
  box.innerHTML = '';
  for (const s of meta.diySkills) {
    const div = document.createElement('div');
    div.className = 'diy-skill-item' + (diySelSkills.includes(s.id) ? ' selected' : '');
    div.innerHTML = `<span class="sname">${s.name}</span><span class="hint">（${{ passive: '锁定', trigger: '触发', active: '主动', convert: '转化' }[s.type] || s.type}）</span><div class="sdesc">${s.desc}</div>`;
    div.addEventListener('click', () => {
      const i = diySelSkills.indexOf(s.id);
      if (i >= 0) diySelSkills.splice(i, 1);
      else { if (diySelSkills.length >= 2) diySelSkills.shift(); diySelSkills.push(s.id); }
      renderDiySkills();
    });
    box.appendChild(div);
  }
}
function renderDiyList() {
  const box = $('diy-list');
  box.innerHTML = '';
  if (!meta.customs.length) {
    box.innerHTML = '<div class="hint">还没有 DIY 武将，来创建一个吧</div>';
    return;
  }
  for (const g of meta.customs) {
    const div = document.createElement('div');
    div.className = 'diy-item general-card';
    div.appendChild(avatarImg(g.id));
    div.insertAdjacentHTML('beforeend', `
      <div class="gname"><span class="badge kingdom-${g.kingdom}">${KINGDOM_NAME[g.kingdom]}</span> ${esc(g.name)} ${'❤'.repeat(g.hp)}</div>
      <div class="gskills">${g.skills.map(id => { const s = meta.diySkills.find(x => x.id === id); return s ? `<b>${s.name}</b>：${s.desc}` : ''; }).join('<br>')}</div>
      <button class="del">删除</button>`);
    div.querySelector('.del').addEventListener('click', async () => {
      await fetch('/api/customs/' + g.id, { method: 'DELETE' });
      loadDiy();
    });
    box.appendChild(div);
  }
}
$('btn-diy-back')?.addEventListener('click', () => showView('home'));
$('btn-diy-save')?.addEventListener('click', async () => {
  const g = {
    name: $('diy-name').value.trim(),
    title: $('diy-title').value.trim(),
    kingdom: $('diy-kingdom').value,
    hp: +$('diy-hp').value,
    gender: $('diy-gender').value,
    skills: diySelSkills.slice(),
  };
  const res = await fetch('/api/customs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(g),
  });
  const data = await res.json();
  if (!res.ok) { $('diy-msg').textContent = data.error || '保存失败'; return; }
  // 上传头像
  const file = $('diy-avatar').files[0];
  if (file) {
    const fd = new FormData();
    fd.append('avatar', file);
    await fetch('/api/avatar/' + data.general.id, { method: 'POST', body: fd });
  }
  $('diy-msg').textContent = `已保存：${g.name}`;
  $('diy-name').value = ''; $('diy-title').value = ''; $('diy-avatar').value = '';
  diySelSkills = [];
  loadDiy();
});

// 目标候选人集合（驱动对手面板高亮）
function targetCandidates() {
  const pr = prompt();
  if (pr && pr.kind === 'choosePlayers' && sel.playerPick) return sel.playerPick.cands;
  if (sel.skill === 'jijiang') return modeRule('sha').cands;
  if (sel.skill) {
    const r = skillTargetRule(sel.skill);
    return r.max > 0 && sel.hand.length >= cardsNeededForSkill(sel.skill) ? r.cands : [];
  }
  if (sel.mode) {
    const r = modeRule(sel.mode);
    return r.max > 0 ? r.cands : [];
  }
  return [];
}
function toggleTarget(seat) {
  const pr = prompt();
  let max = 1;
  if (pr && pr.kind === 'choosePlayers' && sel.playerPick) max = sel.playerPick.max;
  else if (sel.skill === 'jijiang') max = 1;
  else if (sel.skill) max = skillTargetRule(sel.skill).max;
  else if (sel.mode) max = modeRule(sel.mode).max;
  const i = sel.targets.indexOf(seat);
  if (i >= 0) sel.targets.splice(i, 1);
  else {
    if (sel.targets.length >= max) sel.targets.shift();
    sel.targets.push(seat);
  }
  renderOpponents();
  renderMyPanel();
  renderActionBar();
  renderPendingZone();
  if (pr && pr.kind === 'choosePlayers') renderChoosePlayers($('prompt-bar'), pr);
  if (i < 0) {
    requestAnimationFrame(() => {
      const el = seatEl(seat);
      if (el && fx) fx.targetHighlight(el, sel.mode || sel.skill || 'sha');
    });
  }
}

// ============ 观战模式 ============
let isSpectating = false;
let danmakuTimer = null;

function enterSpectatorMode() {
  isSpectating = true;
  const bar = $('spectator-bar');
  if (bar) bar.classList.remove('hidden');
  const danmakuLayer = $('danmaku-layer');
  if (danmakuLayer) danmakuLayer.innerHTML = '';
  // 弹幕输入
  const input = $('danmaku-input');
  const sendBtn = $('danmaku-send');
  if (input && sendBtn) {
    const sendDanmaku = () => {
      const text = input.value.trim();
      if (text) { send({ type: 'danmaku', text }); input.value = ''; }
    };
    sendBtn.onclick = sendDanmaku;
    input.onkeydown = e => { if (e.key === 'Enter') sendDanmaku(); };
  }
  const leaveBtn = $('btn-leave-spectate');
  if (leaveBtn) leaveBtn.onclick = () => { leaveSpectatorMode(); };
}

function leaveSpectatorMode() {
  isSpectating = false;
  const bar = $('spectator-bar');
  if (bar) bar.classList.add('hidden');
  send({ type: 'leaveRoom' });
  showView('home');
}

function spawnDanmaku(name, text) {
  const layer = $('danmaku-layer');
  if (!layer) return;
  const msg = document.createElement('div');
  msg.className = 'danmaku-msg';
  msg.textContent = `${name}: ${text}`;
  msg.style.top = (Math.random() * 70 + 10) + '%';
  layer.appendChild(msg);
  setTimeout(() => msg.remove(), 7000);
}

function showSpectatorCount(count) {
  if (!roomState) return;
  const info = document.querySelector('.lobby-state');
  if (info && count > 0) info.textContent += ` | 👁 ${count} 人观战`;
}

// ============ 战绩统计 ============
function renderStats() {
  if (typeof SGKData === 'undefined') return;
  const stats = window.SGKData.getStats();
  const history = window.SGKData.getHistory(20);
  const ranking = window.SGKData.getGeneralRanking().slice(0, 10);

  // 概览
  const ov = $('stats-overview');
  if (ov) {
    const winRate = stats.totalGames ? ((stats.wins || 0) / stats.totalGames * 100).toFixed(1) : '0.0';
    ov.innerHTML = `
      <div class="stat-card"><div class="sval">${stats.totalGames || 0}</div><div class="slabel">总场次</div></div>
      <div class="stat-card"><div class="sval">${stats.wins || 0}</div><div class="slabel">胜利</div></div>
      <div class="stat-card"><div class="sval">${stats.losses || 0}</div><div class="slabel">失败</div></div>
      <div class="stat-card"><div class="sval">${winRate}%</div><div class="slabel">胜率</div></div>`;
  }

  // 武将排行
  const genBox = $('stats-generals');
  if (genBox) {
    if (!ranking.length) { genBox.innerHTML = '<div class="hint">暂无数据</div>'; }
    else {
      genBox.innerHTML = '';
      ranking.forEach((g, i) => {
        const wr = g.count ? (g.wins / g.count * 100).toFixed(0) : 0;
        const div = document.createElement('div');
        div.className = 'stats-row';
        div.innerHTML = `<span class="r-rank">${i + 1}</span><span class="r-name">${g.name}</span><span class="r-stat">${g.count}场 · ${wr}%胜率 · ${g.kills}击杀</span>`;
        genBox.appendChild(div);
      });
    }
  }

  // 身份统计
  const idBox = $('stats-identities');
  if (idBox) {
    const ids = stats.identityStats || {};
    if (!Object.keys(ids).length) { idBox.innerHTML = '<div class="hint">暂无数据</div>'; }
    else {
      idBox.innerHTML = '';
      Object.entries(ids).forEach(([id, d]) => {
        const wr = d.count ? (d.wins / d.count * 100).toFixed(0) : 0;
        const div = document.createElement('div');
        div.className = 'stats-row';
        div.innerHTML = `<span class="r-name">${IDENTITY_NAME[id] || id}</span><span class="r-stat">${d.count}场 · ${wr}%胜率</span>`;
        idBox.appendChild(div);
      });
    }
  }

  // 历史
  const histBox = $('stats-history');
  if (histBox) {
    if (!history.length) { histBox.innerHTML = '<div class="hint">暂无对局记录</div>'; }
    else {
      histBox.innerHTML = '';
      history.forEach(rec => {
        const div = document.createElement('div');
        div.className = 'hist-item ' + (rec.myResult || '');
        div.innerHTML = window.SGKData.formatRecord(rec);
        histBox.appendChild(div);
      });
    }
  }

  // 服务器回放列表
  const srvBox = $('stats-replays');
  if (srvBox) {
    srvBox.innerHTML = '<div class="hint">加载中...</div>';
    loadReplayList().then(replays => {
      if (!replays.length) { srvBox.innerHTML = '<div class="hint">暂无服务器回放</div>'; return; }
      srvBox.innerHTML = '';
      replays.forEach(r => {
        const div = document.createElement('div');
        div.className = 'hist-item';
        const date = new Date(r.createdAt);
        div.innerHTML = `<span style="color:var(--gold)">${(r.roomName || '对局').slice(0, 10)}</span>
          <span style="color:#8a7a5f">${date.getMonth() + 1}/${date.getDate()} ${r.rounds}回合</span>
          <button class="btn btn-small" style="float:right;padding:1px 6px">查看</button>`;
        div.querySelector('button').onclick = () => viewReplay(r.id);
        srvBox.appendChild(div);
      });
    });
  }
}

// ============ 回放查看器 ============
let currentReplay = null;

async function loadReplayList() {
  try {
    const res = await fetch('/api/replays');
    const data = await res.json();
    return data.replays || [];
  } catch { return []; }
}

async function viewReplay(replayId) {
  try {
    const res = await fetch('/api/replays/' + replayId);
    const data = await res.json();
    if (!data.replay) return;
    currentReplay = data.replay;
    renderReplayViewer(data.replay, data.analysis);
  } catch (e) { console.error('加载回放失败', e); }
}

function renderReplayViewer(replay, analysis) {
  const viewer = $('replay-viewer');
  const content = $('rv-content');
  if (!viewer || !content) return;

  let html = '';
  // 基本信息
  html += `<div class="rv-section"><div class="rv-section-title">基本信息</div>
    <div style="color:#c9b98a;font-size:13px">
      模式: ${replay.gameMode} | 回合: ${replay.rounds} | 胜者: ${replay.winner}
      | 时长: ${((replay.duration || 0) / 1000).toFixed(0)}秒
    </div></div>`;

  // 玩家统计
  if (analysis && analysis.players) {
    html += `<div class="rv-section"><div class="rv-section-title">玩家数据</div><div class="rv-player-stats">`;
    analysis.players.forEach(p => {
      const mvpClass = analysis.mvp === p.seat ? 'rv-mvp' : '';
      html += `<div class="rv-stat-card ${mvpClass}">
        <div class="pname">${p.name} (${p.generalName}) ${p.isWinner ? '🏆' : ''} ${analysis.mvp === p.seat ? '⭐MVP' : ''}</div>
        <div class="pstats">击杀: ${p.kills} | 伤害: ${p.damageDealt} | 受击: ${p.damageTaken} | 治疗: ${p.healDone}</div>
        <div class="pstats">出牌: ${p.cardsPlayed} | 摸牌: ${p.cardsDrawn} | 技能: ${p.skillsUsed}</div>
      </div>`;
    });
    html += '</div></div>';
  }

  // 关键事件
  if (analysis && analysis.keyEvents && analysis.keyEvents.length) {
    html += `<div class="rv-section"><div class="rv-section-title">关键事件</div><div class="rv-events">`;
    analysis.keyEvents.forEach(ev => {
      html += `<div class="rv-event"><span class="ev-type">[${ev.type}]</span> ${JSON.stringify(ev).slice(0, 100)}</div>`;
    });
    html += '</div></div>';
  }

  // 战斗统计
  if (analysis) {
    html += `<div class="rv-section"><div class="rv-section-title">战斗统计</div>
      <div style="color:#8a7a5f;font-size:13px">
        总伤害: ${analysis.totalDamage} | 总治疗: ${analysis.totalHeal} | 事件数: ${analysis.totalEvents}
      </div></div>`;
  }

  content.innerHTML = html;
  viewer.classList.remove('hidden');
}

function closeReplayViewer() {
  $('replay-viewer').classList.add('hidden');
  currentReplay = null;
}

function exportReplay(format) {
  if (!currentReplay || !currentReplay.id) return;
  window.open(`/api/replays/${currentReplay.id}/export?format=${format}`, '_blank');
}

function shareReplay() {
  if (!currentReplay || !currentReplay.id) return;
  const url = window.location.origin + '#replay=' + currentReplay.id;
  navigator.clipboard.writeText(url).then(() => {
    alert('分享链接已复制: ' + url);
  });
}

// 绑定回放按钮
$('rv-close')?.addEventListener('click', closeReplayViewer);
$('rv-export-text')?.addEventListener('click', () => exportReplay('text'));
$('rv-export-json')?.addEventListener('click', () => exportReplay('json'));
$('rv-share')?.addEventListener('click', shareReplay);

// 记录对局结果（游戏结束时调用）
function recordGameResult(gameState) {
  if (typeof SGKData === 'undefined' || !gameState) return;
  const me = gameState.players.find(p => p.seat === gameState.mySeat);
  if (!me) return;
  const lord = gameState.players.find(p => p.identity === 'zhu');
  const iWon = (gameState.winner === me.identity) ||
    (gameState.winner === 'zhu' && me.identity === 'zhong');
  const players = gameState.players.map(p => ({
    name: p.name, identity: p.identity, generalId: p.generalId, generalName: p.generalName,
    isMe: p.seat === gameState.mySeat, alive: p.alive,
  }));
  window.SGKData.recordGame({
    winner: gameState.winner,
    myIdentity: me.identity,
    myGeneral: me.generalName,
    myResult: iWon ? 'win' : 'lose',
    rounds: gameState.round,
    players,
    log: (gameState.logs || []).slice(-50),
  });

  // 检查成就
  if (typeof checkAchievements === 'function') {
    const stats = window.SGKData.getStats();
    checkAchievements(stats);
  }
}

// ---------- 启动 ----------
initAudio();
initFX();
initShortcuts();
// OL 经典交互：出牌阶段右键任意处收回当前选择（取消选牌/技能/目标）
// 手牌区与详情/弃牌堆弹窗是右键查看/操作区，不触发收回（避免误清选择）
document.addEventListener('contextmenu', (e) => {
  const pr = prompt();
  if (!pr || pr.kind !== 'play' || gameState.finished) return;
  if (e.target && e.target.closest && e.target.closest('#my-hand, #pending-zone, #card-detail-modal, #discard-pile-modal')) return;
  if (sel.hand.length || sel.skill || sel.targets.length) {
    e.preventDefault();
    sel = freshSel();
    refreshAll();
  }
});
initSkillEditor();
initCardEditor();
initCardCounter();
initSkinSystem();

// 侧边栏 tab 切换
document.querySelectorAll('.side-tabs .side-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.side-tabs .side-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.side-tab-content').forEach(c => c.classList.remove('active'));
    if (target === 'log') document.getElementById('game-log').classList.add('active');
    if (target === 'counter') document.getElementById('side-counter').classList.add('active');
  });
});

// 首次进入显示新手引导
if (!localStorage.getItem('sgk_tutorial_done')) {
  setTimeout(openTutorial, 500);
}

setTimeout(preloadGameResources, 1000);
connect();
})();
