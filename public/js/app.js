// ============ 三国杀客户端 ============
(() => {
'use strict';

// ---------- 全局状态 ----------
let ws = null;
let myPid = localStorage.getItem('sgk_pid') || null;
let myName = localStorage.getItem('sgk_name') || '';
let roomState = null;
let gameState = null;
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
const KINGDOM_NAME = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };
const IDENTITY_NAME = { zhu: '主公', zhong: '忠臣', fan: '反贼', nei: '内奸' };
const isRed = c => c.suit === 'heart' || c.suit === 'diamond';

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

function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

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
      if (view !== 'game') showView('game');
      const key = promptKey(gameState.pendingForMe);
      if (key !== lastPromptKey) { sel = freshSel(); lastPromptKey = key; }
      renderGame();
      break;
    }
    case 'prompt': {
      // 状态里也有 pendingForMe，以 game 消息为准；此处仅触发刷新
      if (gameState) {
        gameState.pendingForMe = msg.prompt;
        const key = promptKey(msg.prompt);
        if (key !== lastPromptKey) { sel = freshSel(); lastPromptKey = key; }
        renderGame();
      }
      break;
    }
    case 'event':
      handleEvent(msg.event);
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
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  $('view-' + v).classList.add('active');
  if (v === 'diy') loadDiy();
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
  img.src = `/assets/avatars/${id}.png`;
  img.onerror = () => { img.onerror = null; img.src = `/assets/avatars/${id}.svg`; };
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
    box.appendChild(div);
  }
}
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

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
  html += row('人数', isHost ? `<select id="opt-max">${[4,5,6,7,8].map(n => `<option ${n === o.maxPlayers ? 'selected' : ''}>${n}</option>`).join('')}</select>` : `${o.maxPlayers} 人`);
  html += row('选将方式', isHost ? `<select id="opt-pickmode"><option value="random" ${o.pickMode === 'random' ? 'selected' : ''}>随机选将</option><option value="free" ${o.pickMode === 'free' ? 'selected' : ''}>自由点将</option></select>` : (o.pickMode === 'random' ? `随机选将（${o.pickCount}选1）` : '自由点将'));
  if (o.pickMode === 'random') {
    html += row('候选武将数', isHost ? `<select id="opt-pickcount">${[2,3,4,5,6,7].map(n => `<option ${n === o.pickCount ? 'selected' : ''}>${n}</option>`).join('')}</select>` : o.pickCount);
  }
  html += row('点身份', isHost ? `<input type="checkbox" id="opt-idpick" ${o.allowIdentityPick ? 'checked' : ''}>` : (o.allowIdentityPick ? '开' : '关'));
  html += row('启用DIY武将', isHost ? `<input type="checkbox" id="opt-custom" ${o.includeCustoms ? 'checked' : ''}>` : (o.includeCustoms ? '开' : '关'));
  html += row('身份配置', (roomState.identityDist || []).map(id => IDENTITY_NAME[id]).join(' / '));
  box.innerHTML = html;
  if (isHost) {
    const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', fn); };
    bind('opt-max', e => send({ type: 'setOpts', opts: { maxPlayers: +e.target.value } }));
    bind('opt-pickmode', e => send({ type: 'setOpts', opts: { pickMode: e.target.value } }));
    bind('opt-pickcount', e => send({ type: 'setOpts', opts: { pickCount: +e.target.value } }));
    bind('opt-idpick', e => send({ type: 'setOpts', opts: { allowIdentityPick: e.target.checked } }));
    bind('opt-custom', e => send({ type: 'setOpts', opts: { includeCustoms: e.target.checked } }));
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

$('btn-add-ai').addEventListener('click', () => send({ type: 'addAI' }));
$('btn-leave').addEventListener('click', () => { send({ type: 'leaveRoom' }); roomState = null; showView('home'); });
$('btn-start').addEventListener('click', () => {
  if (roomState && roomState.state === 'ended') send({ type: 'backToLobby' });
  else send({ type: 'startGame' });
});
$('btn-chat').addEventListener('click', sendChat);
$('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
  const t = $('chat-input').value.trim();
  if (!t) return;
  $('chat-input').value = '';
  send({ type: 'chat', text: t });
}
$('btn-quit-game').addEventListener('click', () => {
  toast('你已离开，本局由 AI 托管');
  gameState = null;
  showView('home');
  send({ type: 'leaveRoom' });
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
  renderOpponents();
  renderCenter();
  renderMyPanel();
  renderHand();
  renderActionBar();
  renderPromptBar();
  renderLog();
}

function orderedOpponents() {
  const n = gameState.players.length;
  const list = [];
  for (let i = 1; i < n; i++) {
    list.push(gameState.players[(gameState.mySeat + i) % n]);
  }
  return list;
}

function renderOpponents() {
  const box = $('opponents');
  box.innerHTML = '';
  const opps = orderedOpponents();
  const slots = SLOTS[opps.length] || SLOTS[7];
  const cands = targetCandidates();
  opps.forEach((p, i) => {
    const [x, y] = slots[i];
    const div = document.createElement('div');
    div.className = 'opp' + (p.alive ? '' : ' dead') +
      (gameState.turnSeat === p.seat && gameState.phase !== 'picking' ? ' current' : '') +
      (cands.includes(p.seat) ? ' targetable' : '') +
      (sel.targets.includes(p.seat) ? ' selected' : '');
    div.style.left = x + '%';
    div.style.top = y + '%';
    div.dataset.seat = p.seat;
    const idBadge = p.identity === 'zhu' ? '<span class="badge identity-zhu">主公</span>' :
      p.identity ? `<span class="badge identity">${IDENTITY_NAME[p.identity]}</span>` : '';
    div.innerHTML = `
      <div class="opp-top">
        <span class="opp-avatar-slot"></span>
        <div class="opp-info">
          <div class="opp-name">${esc(p.name)}</div>
          <div class="opp-general" style="color:var(--${p.kingdom})">${p.generalName || '？？'}</div>
          <div class="opp-hp">${hpHtml(p.hp, p.maxHp)}</div>
          <div class="opp-badges">
            <span class="badge kingdom-${p.kingdom}">${KINGDOM_NAME[p.kingdom]}</span>
            ${idBadge}${p.isAI ? '<span class="badge ai">AI</span>' : ''}
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
    if (cands.includes(p.seat)) {
      div.addEventListener('click', () => toggleTarget(p.seat));
    }
    box.appendChild(div);
  });
}

function renderCenter() {
  const phaseName = { picking: '选将阶段', prepare: '准备阶段', judge: '判定阶段', draw: '摸牌阶段', play: '出牌阶段', discard: '弃牌阶段', end: '结束阶段', dealing: '分发手牌', over: '已结束' };
  const cur = gameState.players[gameState.turnSeat];
  let status = `第 ${gameState.round} 轮 · ${phaseName[gameState.phase] || gameState.phase || ''} · 牌堆 ${gameState.deckCount}`;
  if (gameState.finished) {
    status = `🏆 游戏结束：${{ zhu: '主公/忠臣', fan: '反贼', nei: '内奸' }[gameState.winner]}获胜！`;
  } else if (cur) {
    status += ` — ${cur.seat === gameState.mySeat ? '你的回合' : '等待 ' + cur.name + ' 行动'}`;
  }
  $('center-status').textContent = status;
}

function renderMyPanel() {
  const p = me();
  const box = $('my-panel');
  if (!p) { box.innerHTML = ''; return; }
  const skills = p.skills.map(s =>
    `<span class="skill-btn passive" title="${esc(s.desc)}">${s.name}</span>`).join('');
  box.innerHTML = `
    <div class="my-top">
      <span class="my-avatar-slot"></span>
      <div>
        <div class="my-name">${esc(p.name)}</div>
        <div class="my-general" style="color:var(--${p.kingdom})">${p.generalName || ''} <span class="badge kingdom-${p.kingdom}">${KINGDOM_NAME[p.kingdom]}</span></div>
        <div class="my-identity">身份：${IDENTITY_NAME[gameState.myIdentity] || '？'}</div>
        <div class="my-hp">${hpHtml(p.hp, p.maxHp)} <span style="font-size:12px;color:#9a8a6a">${p.hp}/${p.maxHp}</span></div>
      </div>
    </div>
    <div class="my-equips">${Object.values(p.equips).filter(Boolean).map(e => `<span class="equip-mini" title="${e.name}${e.range ? ' 范围' + e.range : ''}">${e.name}</span>`).join('') || '<span style="font-size:11px;color:#5a4c3a">无装备</span>'}
    ${p.judgeZone.map(j => `<span class="judge-mini">${j.name}</span>`).join('')}</div>
    <div class="my-skills">${skills}</div>`;
  box.querySelector('.my-avatar-slot').replaceWith(avatarImg(p.generalId || 'unknown', 'my-avatar'));
}

// ---------- 手牌 ----------
function renderHand() {
  const box = $('my-hand');
  box.innerHTML = '';
  if (!gameState || !me()) return;
  const pr = prompt();
  const inPlay = pr && pr.kind === 'play';
  const inZhangba = pr && pr.kind === 'respond' && sel.zhangbaRespond;
  gameState.myHand.forEach(c => {
    const isSel = sel.hand.includes(c.uid);
    const el = cardEl(c, {
      selected: isSel,
      onClick: () => {
        if (!inPlay && !inZhangba) return;
        toggleHand(c.uid);
      },
    });
    box.appendChild(el);
  });
}

function toggleHand(uid) {
  const i = sel.hand.indexOf(uid);
  if (i >= 0) sel.hand.splice(i, 1);
  else {
    let cap = 2;
    if (sel.skill) {
      const need = (skillButtonDef(sel.skill) || {}).needCards;
      cap = need === '1+' ? 99 : (need || 0);
    } else if (sel.zhangbaRespond) cap = 2;
    if (sel.hand.length >= cap) sel.hand.shift();
    sel.hand.push(uid);
  }
  renderHand();
  renderActionBar();
  renderPromptBar();
}

// ---------- 模式（出牌方式） ----------
function myHandCards() { return gameState.myHand.filter(c => sel.hand.includes(c.uid)); }
function attackRange() { const w = me().equips.weapon; return w ? w.range : 1; }
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
    if (isRed(c) && skills.includes('wusheng') && pr.canSha) modes.push({ as: 'sha', label: `武圣·${c.name}当杀`, virtual: true, card: c });
    if (c.key === 'shan' && skills.includes('longdan') && pr.canSha) modes.push({ as: 'sha', label: `龙胆·闪当杀`, virtual: true, card: c });
    if (!isRed(c) && skills.includes('qixi')) modes.push({ as: 'guohe', label: `奇袭·当拆桥`, virtual: true, card: c });
    if (c.suit === 'diamond' && skills.includes('guose')) modes.push({ as: 'lebu', label: `国色·当乐不思蜀`, virtual: true, card: c });
  } else if (cards.length === 2) {
    const w = me().equips.weapon;
    if (w && w.key === 'zhangba' && pr.canSha) modes.push({ as: 'sha', label: '丈八·两牌当杀', virtual: true });
  }
  return modes;
}

function modeRule(mode) {
  const others = gameState.players.filter(p => p.seat !== gameState.mySeat && p.alive);
  const m = me();
  switch (mode) {
    case 'sha': {
      const fangtian = m.equips.weapon && m.equips.weapon.key === 'fangtian' && sel.hand.length >= gameState.myHand.length;
      return { min: 1, max: fangtian ? 3 : 1, cands: others.filter(p => p.distance <= attackRange() && !kongchengImmune(p)).map(p => p.seat) };
    }
    case 'juedou': return { min: 1, max: 1, cands: others.filter(p => !kongchengImmune(p)).map(p => p.seat) };
    case 'guohe': return { min: 1, max: 1, cands: others.filter(hasCardZone).map(p => p.seat) };
    case 'shunshou': return { min: 1, max: 1, cands: others.filter(p => hasCardZone(p) && !qianxun(p) && (mySkillIds().includes('qicai') || p.distance <= 1)).map(p => p.seat) };
    case 'lebu': return { min: 1, max: 1, cands: others.filter(p => !qianxun(p) && !p.judgeZone.some(j => j.key === 'lebu')).map(p => p.seat) };
    case 'jiedao': return { min: 2, max: 2, cands: others.filter(p => p.equips.weapon).map(p => p.seat), second: true };
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

// ---------- 操作条 ----------
function renderActionBar() {
  const bar = $('action-bar');
  bar.innerHTML = '';
  const pr = prompt();
  if (!pr || pr.kind !== 'play' || gameState.finished) return;
  const hint = document.createElement('span');
  hint.className = 'action-hint';
  bar.appendChild(hint);

  // 技能按钮
  for (const s of pr.skills || []) {
    if (s.passive) continue;
    const btn = document.createElement('button');
    btn.className = 'btn btn-small' + (sel.skill === s.id ? ' btn-primary' : '');
    btn.textContent = s.name;
    btn.disabled = !s.usable;
    btn.title = s.desc;
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
      renderHand(); renderActionBar(); renderOpponents();
    });
    bar.appendChild(btn);
  }

  // 模式按钮
  if (!sel.skill) {
    for (const m of modesForSelection()) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-small' + (sel.mode === m.as ? ' btn-primary' : '');
      btn.textContent = m.label;
      btn.addEventListener('click', () => {
        sel.mode = sel.mode === m.as ? null : m.as;
        sel.targets = [];
        renderActionBar(); renderOpponents();
      });
      bar.appendChild(btn);
    }
  }

  // 提示 & 确认
  let needCards = 0, needTargets = 0, canConfirm = false;
  if (sel.skill) {
    needCards = cardsNeededForSkill(sel.skill);
    const rule = sel.skill === 'jijiang' ? modeRule('sha') : skillTargetRule(sel.skill);
    needTargets = rule.min;
    canConfirm = sel.hand.length >= needCards && sel.targets.length >= needTargets && (needCards > 0 || needTargets > 0);
    const s = (pr.skills || []).find(x => x.id === sel.skill);
    hint.textContent = `【${s ? s.name : sel.skill}】${needCards ? `选 ${needCards === 1 ? '一' : needCards}张牌` : ''}${needTargets ? ' 并选目标' : ''}`;
  } else if (sel.mode) {
    const rule = modeRule(sel.mode);
    needTargets = rule.min;
    canConfirm = sel.targets.length >= needTargets;
    hint.textContent = needTargets ? `请选择 ${needTargets > 1 ? needTargets + ' 个' : ''}目标` : '可直接使用';
  } else {
    hint.textContent = sel.hand.length ? '选择使用方式' : '出牌阶段：点选手牌，或点技能，或结束出牌';
  }

  const ok = document.createElement('button');
  ok.className = 'btn btn-primary';
  ok.textContent = '确定';
  ok.disabled = !canConfirm;
  ok.addEventListener('click', confirmPlay);
  bar.appendChild(ok);

  const cancel = document.createElement('button');
  cancel.className = 'btn';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => { sel = freshSel(); renderHand(); renderActionBar(); renderOpponents(); });
  bar.appendChild(cancel);

  const end = document.createElement('button');
  end.className = 'btn';
  end.textContent = '结束出牌';
  end.addEventListener('click', () => { send({ type: 'action', action: 'end' }); sel = freshSel(); });
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
    const names = { zhu: '主公/忠臣 阵营', fan: '反贼 阵营', nei: '内奸' };
    const isHost = roomState && roomState.hostPid === myPid;
    box.innerHTML = `<div class="prompt-title">🏆 ${names[gameState.winner]}获胜！</div><div class="prompt-options"></div>`;
    if (isHost) {
      box.querySelector('.prompt-options').appendChild(quickBtn('返回大厅', () => send({ type: 'backToLobby' }), true));
    }
    return;
  }
  if (!pr) {
    box.innerHTML = '<div class="prompt-title">等待其他玩家行动…</div>';
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
  for (const o of pr.options || []) {
    if (o.zhangba) {
      const b = quickBtn(o.label, () => {
        sel.zhangbaRespond = true;
        sel.hand = [];
        renderHand();
        renderRespondZhangba(box, pr);
      });
      opts.appendChild(b);
    } else {
      opts.appendChild(quickBtn(o.label, () => {
        send({ type: 'action', cardIds: o.cardIds });
      }));
    }
  }
  if (pr.bagua) opts.appendChild(quickBtn('八卦阵·判定', () => send({ type: 'action', skill: 'bagua' })));
  if (pr.jijiang) opts.appendChild(quickBtn('激将', () => send({ type: 'action', skill: 'jijiang' })));
  opts.appendChild(quickBtn('不出', () => { sel.zhangbaRespond = false; send({ type: 'action', pass: true }); }));
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
  const render = () => {
    $('modal').innerHTML = `<div class="modal-title">${esc(pr.title)}</div><div class="general-grid"></div><div class="modal-actions"></div>`;
    const grid = $('modal').querySelector('.general-grid');
    for (const g of pr.candidates || []) {
      const div = document.createElement('div');
      div.className = 'general-card' + (chosen === g.id ? ' selected' : '');
      const img = avatarImg(g.id);
      div.appendChild(img);
      div.insertAdjacentHTML('beforeend', `
        <div class="gname"><span class="badge kingdom-${g.kingdom}">${KINGDOM_NAME[g.kingdom]}</span> ${esc(g.name)} ${'❤'.repeat(g.hp)}</div>
        <div class="gskills">${(g.skills || []).map(s => `<b>${esc(s.name)}</b>：${esc(s.desc)}`).join('<br>')}</div>`);
      div.addEventListener('click', () => { chosen = g.id; render(); });
      grid.appendChild(div);
    }
    const acts = $('modal').querySelector('.modal-actions');
    const ok = quickBtn('确定选择', () => {
      if (chosen) { closeModal(); send({ type: 'action', generalId: chosen }); }
    }, true);
    ok.disabled = !chosen;
    acts.appendChild(ok);
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

// ---------- 事件动画 ----------
function seatEl(seat) {
  if (seat === gameState.mySeat) return $('my-panel');
  return document.querySelector(`.opp[data-seat="${seat}"]`);
}
function handleEvent(ev) {
  if (!ev || !gameState) return;
  if (ev.type === 'sha') {
    const from = seatEl(ev.from), to = seatEl(ev.to);
    if (!from || !to) return;
    const r1 = from.getBoundingClientRect(), r2 = to.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'fly-card';
    fly.textContent = '杀';
    fly.style.left = r1.left + r1.width / 2 - 30 + 'px';
    fly.style.top = r1.top + r1.height / 2 - 41 + 'px';
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      fly.style.left = r2.left + r2.width / 2 - 30 + 'px';
      fly.style.top = r2.top + r2.height / 2 - 41 + 'px';
      fly.style.transform = 'rotate(720deg)';
    });
    setTimeout(() => fly.remove(), 600);
  } else if (ev.type === 'damage') {
    const el = seatEl(ev.seat);
    if (el) { el.classList.add('dmg-flash'); setTimeout(() => el.classList.remove('dmg-flash'), 550); }
  }
}

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
$('btn-diy-back').addEventListener('click', () => showView('home'));
$('btn-diy-save').addEventListener('click', async () => {
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
  renderActionBar();
  if (pr && pr.kind === 'choosePlayers') renderChoosePlayers($('prompt-bar'), pr);
}

// ---------- 启动 ----------
connect();
})();
