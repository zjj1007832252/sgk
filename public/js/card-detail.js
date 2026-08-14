// 卡牌详情 / 手牌排序 / 弃牌堆面板
(function () {
  'use strict';

  const CARD_DETAILS = {
    sha:     { type: '基本牌', desc: '出牌阶段，对攻击范围内的一名角色使用。目标需出【闪】，否则受到1点伤害。每回合限用1次。' },
    shan:    { type: '基本牌', desc: '响应【杀】或【万箭齐发】时使用，抵消其效果。' },
    tao:     { type: '基本牌', desc: '出牌阶段对自己使用，回复1点体力；或有角色濒死时使用，为其回复1点体力。' },
    juedou:  { type: '锦囊牌', desc: '出牌阶段，对一名其他角色使用。由目标开始，双方轮流打出【杀】，未打出者受到1点伤害。' },
    guohe:   { type: '锦囊牌', desc: '出牌阶段，对一名其他角色使用。弃置其一张牌（手牌/装备/判定区）。' },
    shunshou:{ type: '锦囊牌', desc: '出牌阶段，对距离1以内的一名其他角色使用。获得其一张牌。' },
    wuzhong: { type: '锦囊牌', desc: '出牌阶段使用，摸2张牌。' },
    nanman:  { type: '锦囊牌·AOE', desc: '出牌阶段使用。所有其他角色依次需打出【杀】，否则受到1点伤害。' },
    wanjian: { type: '锦囊牌·AOE', desc: '出牌阶段使用。所有其他角色依次需打出【闪】，否则受到1点伤害。' },
    taoyuan: { type: '锦囊牌·群体', desc: '出牌阶段使用。所有角色回复1点体力。' },
    wugu:    { type: '锦囊牌·群体', desc: '出牌阶段使用。从牌堆顶亮出X张牌（X为存活角色数），按行动顺序各选一张。' },
    jiedao:  { type: '锦囊牌', desc: '出牌阶段，对装备武器的一名其他角色和攻击范围内的另一名角色使用。前者需对后者使用【杀】，否则你获得其武器。' },
    wuxie:   { type: '锦囊牌', desc: '在锦囊生效前使用，抵消其对一名角色的效果。可连锁使用。' },
    lebu:    { type: '延时锦囊', desc: '出牌阶段，对一名其他角色使用，置于其判定区。该角色判定阶段判定：若不为红桃，跳过出牌阶段。' },
    shandian:{ type: '延时锦囊', desc: '出牌阶段使用，置于自己判定区。判定阶段判定：若为黑桃2~9，受到3点雷电伤害并移到下家判定区；否则移到下家。' },
    zhuge:   { type: '装备·武器', desc: '攻击范围1。出牌阶段你可以使用任意张【杀】。' },
    qinggang:{ type: '装备·武器', desc: '攻击范围2。当你使用【杀】指定目标后，无视其防具。' },
    hanbing: { type: '装备·武器', desc: '攻击范围2。当你使用【杀】造成伤害时，你可以防止此伤害，改为弃置目标两张牌。' },
    cixiong: { type: '装备·武器', desc: '攻击范围2。当你使用【杀】指定异性目标后，你可令其选择：弃置一张牌，或令你摸一张牌。' },
    guanshi: { type: '装备·武器', desc: '攻击范围3。当你使用的【杀】被【闪】抵消时，你可以弃置两张牌，令此【杀】强制命中。' },
    qinglong:{ type: '装备·武器', desc: '攻击范围3。当你使用的【杀】被【闪】抵消时，你可以对其再使用一张【杀】。' },
    zhangba: { type: '装备·武器', desc: '攻击范围3。你可以将两张手牌当【杀】使用。' },
    fangtian:{ type: '装备·武器', desc: '攻击范围4。当你使用的【杀】是你的最后一张手牌时，你可以额外指定至多两名目标。' },
    qilin:   { type: '装备·武器', desc: '攻击范围5。当你使用【杀】造成伤害后，你可以弃置目标的一张坐骑牌。' },
    bagua:   { type: '装备·防具', desc: '当你需要使用或打出【闪】时，你可以进行判定：若为红色，视为你使用或打出了【闪】。' },
    renwang: { type: '装备·防具', desc: '黑色【杀】对你无效。' },
    dilu:    { type: '装备·+1马', desc: '其他角色与你的距离+1。' },
    jueying:  { type: '装备·+1马', desc: '其他角色与你的距离+1。' },
    zhuahuang:{ type: '装备·+1马', desc: '其他角色与你的距离+1。' },
    chitu:   { type: '装备·-1马', desc: '你与其他角色的距离-1。' },
    dawan:   { type: '装备·-1马', desc: '你与其他角色的距离-1。' },
    zixing:  { type: '装备·-1马', desc: '你与其他角色的距离-1。' },
  };

  const SORT_MODES = [
    { id: 'type', label: '按类型' },
    { id: 'suit', label: '按花色' },
    { id: 'key',  label: '按牌名' },
  ];

  let sortMode = (function(){
    try {
      const s = localStorage.getItem('sgk_hand_sort');
      return s && SORT_MODES.some(m => m.id === s) ? s : 'type';
    } catch (e) { return 'type'; }
  })();

  const typeOrder = { basic: 0, trick: 1, equip: 2 };
  const suitOrder = { spade: 0, heart: 1, club: 2, diamond: 3 };
  const rankNum = r => (r === 1 ? 14 : r);

  function sortHand(hand) {
    const arr = [...hand];
    if (sortMode === 'type') {
      arr.sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) ||
        (suitOrder[a.suit] ?? 0) - (suitOrder[b.suit] ?? 0) ||
        rankNum(a.rank) - rankNum(b.rank));
    } else if (sortMode === 'suit') {
      arr.sort((a, b) => (suitOrder[a.suit] ?? 0) - (suitOrder[b.suit] ?? 0) ||
        rankNum(a.rank) - rankNum(b.rank) ||
        (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9));
    } else {
      arr.sort((a, b) => (a.key || '').localeCompare(b.key || '') ||
        (suitOrder[a.suit] ?? 0) - (suitOrder[b.suit] ?? 0) ||
        rankNum(a.rank) - rankNum(b.rank));
    }
    return arr;
  }

  function openCardDetail(card) {
    const info = CARD_DETAILS[card.key] || {};
    const modal = document.getElementById('card-detail-modal');
    if (!modal) return;
    const cdmCard = document.getElementById('cdm-card');
    document.getElementById('cdm-name').textContent = card.name || '';
    const typeLabel = info.type || (card.type ? { basic: '基本牌', trick: '锦囊牌', equip: '装备牌' }[card.type] : '');
    document.getElementById('cdm-type').textContent = typeLabel;
    document.getElementById('cdm-desc').textContent = info.desc || '暂无详细描述';
    cdmCard.innerHTML = '';
    // 用现有的 cardEl 函数（全局）
    if (typeof window.cardEl === 'function') {
      const c = window.cardEl(card, {});
      c.style.transform = 'none';
      c.style.position = 'relative';
      cdmCard.appendChild(c);
    } else {
      cdmCard.textContent = card.name;
    }
    modal.classList.remove('hidden');
  }

  function closeCardDetail() {
    const m = document.getElementById('card-detail-modal');
    if (m) m.classList.add('hidden');
  }

  function openDiscardPile() {
    const modal = document.getElementById('discard-pile-modal');
    const countEl = document.getElementById('cdp-count');
    const cardsEl = document.getElementById('cdp-cards');
    if (!modal || !window.gameState) return;
    const gs = window.gameState;
    countEl.textContent = gs.discardCount || 0;
    cardsEl.innerHTML = '';
    const hint = document.createElement('div');
    hint.style.cssText = 'width:100%;color:#8a7a5f;font-size:12px;';
    hint.textContent = '注：为防窥屏，客户端只可见弃牌堆顶（最新一张）。完整历史见战报。';
    cardsEl.appendChild(hint);

    if (gs.discardTop) {
      const label = document.createElement('div');
      label.style.cssText = 'color:var(--gold-light);font-size:13px;margin:8px 0 4px;width:100%;';
      label.textContent = '牌堆顶（最新弃置）';
      cardsEl.appendChild(label);
      const cardWrap = document.createElement('div');
      cardWrap.style.marginBottom = '8px';
      if (typeof window.cardEl === 'function') {
        const c = window.cardEl(gs.discardTop, {});
        c.style.transform = 'none';
        c.style.position = 'relative';
        c.style.cursor = 'pointer';
        c.addEventListener('click', () => openCardDetail(gs.discardTop));
        cardWrap.appendChild(c);
      } else {
        cardWrap.textContent = gs.discardTop.name;
      }
      cardsEl.appendChild(cardWrap);
    }
    modal.classList.remove('hidden');
  }

  function closeDiscardPile() {
    const m = document.getElementById('discard-pile-modal');
    if (m) m.classList.add('hidden');
  }

  // 给卡片元素加上右键详情 + 点击详情能力
  function enhanceCardEl(el, card) {
    if (!el) return;
    el.title = (el.title || '') + ' · 右键查看详情';
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCardDetail(card);
    });
  }

  // 用事件委托给 .equip-mini / .judge-mini 加详情点击
  function setupMiniCardClicks() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('.equip-mini, .judge-mini');
      if (!target) return;
      const key = target.dataset.key;
      if (!key) return;
      const info = CARD_DETAILS[key];
      const name = target.textContent.trim() + (target.title ? '' : '');
      openCardDetail({
        key,
        name: info ? (key === 'sha' ? '杀' : key === 'shan' ? '闪' : key === 'tao' ? '桃' : name) : name,
        type: info ? (info.type.includes('装备') ? 'equip' : info.type.includes('延时') ? 'trick' : 'trick') : '',
        suit: 'spade', rank: 1,
      });
    });
  }

  // 暴露给全局
  window.CARD_DETAILS = CARD_DETAILS;
  window.SORT_MODES = SORT_MODES;
  window.getHandSortMode = () => sortMode;
  window.setHandSortMode = (m) => {
    if (SORT_MODES.some(x => x.id === m)) {
      sortMode = m;
      try { localStorage.setItem('sgk_hand_sort', m); } catch (e) {}
    }
  };
  window.sortHand = sortHand;
  window.openCardDetail = openCardDetail;
  window.closeCardDetail = closeCardDetail;
  window.openDiscardPile = openDiscardPile;
  window.closeDiscardPile = closeDiscardPile;
  window.enhanceCardEl = enhanceCardEl;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMiniCardClicks);
  } else {
    setupMiniCardClicks();
  }
})();
