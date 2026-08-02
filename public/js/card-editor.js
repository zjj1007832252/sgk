// 自定义卡牌 DSL 与编辑器
(function () {
  'use strict';

  // ==================== 卡牌类型 ====================
  const CARD_TYPES = [
    { id: 'basic', label: '基本牌', desc: '杀、闪、桃等' },
    { id: 'trick', label: '锦囊牌', desc: '决斗、过河拆桥等' },
    { id: 'equip', label: '装备牌', desc: '武器、防具、马' },
  ];

  const BASIC_CARDS = [
    { id: 'sha', label: '杀' }, { id: 'shan', label: '闪' },
    { id: 'tao', label: '桃' }, { id: 'jiu', label: '酒' },
  ];

  const TRICK_CARDS = [
    { id: 'juedou', label: '决斗' }, { id: 'guohe', label: '过河拆桥' },
    { id: 'shunshou', label: '顺手牵羊' }, { id: 'wuzhong', label: '无中生有' },
    { id: 'nanman', label: '南蛮入侵' }, { id: 'wanjian', label: '万箭齐发' },
    { id: 'taoyuan', label: '桃园结义' }, { id: 'wugu', label: '五谷丰登' },
    { id: 'jiedao', label: '借刀杀人' }, { id: 'wuxie', label: '无懈可击' },
    { id: 'lebu', label: '乐不思蜀' }, { id: 'shandian', label: '闪电' },
  ];

  const EQUIP_CARDS = [
    { id: 'weapon', label: '武器' }, { id: 'armor', label: '防具' },
    { id: 'horse_plus', label: '+1马' }, { id: 'horse_minus', label: '-1马' },
  ];

  // ==================== 效果定义 ====================
  const EFFECT_TYPES = [
    { id: 'damage', label: '造成伤害', desc: '对目标造成X点伤害', params: [
      { key: 'value', label: '伤害值', type: 'number', default: 1, min: 1, max: 5 },
      { key: 'needTarget', label: '需要目标', type: 'checkbox', default: true },
    ]},
    { id: 'recover', label: '回复体力', desc: '回复X点体力', params: [
      { key: 'value', label: '回复量', type: 'number', default: 1, min: 1, max: 5 },
      { key: 'needTarget', label: '需要目标', type: 'checkbox', default: false },
    ]},
    { id: 'draw', label: '摸牌', desc: '摸X张牌', params: [
      { key: 'value', label: '张数', type: 'number', default: 1, min: 1, max: 10 },
    ]},
    { id: 'discard', label: '弃牌', desc: '弃置X张牌', params: [
      { key: 'value', label: '张数', type: 'number', default: 1, min: 1, max: 10 },
      { key: 'needTarget', label: '需要目标', type: 'checkbox', default: false },
    ]},
    { id: 'discardTarget', label: '弃置目标牌', desc: '弃置目标一张牌', params: [
      { key: 'needTarget', label: '需要目标', type: 'checkbox', default: true },
    ]},
    { id: 'gainCard', label: '获得牌', desc: '获得目标一张牌', params: [
      { key: 'needTarget', label: '需要目标', type: 'checkbox', default: true },
    ]},
    { id: 'stealCard', label: '获得区域牌', desc: '获得目标区域内一张牌', params: [
      { key: 'needTarget', label: '需要目标', type: 'checkbox', default: true },
    ]},
    { id: 'skipPhase', label: '跳过阶段', desc: '跳过目标一个阶段', params: [
      { key: 'phase', label: '阶段', type: 'select', options: [
        { v: 'draw', l: '摸牌' }, { v: 'play', l: '出牌' }, { v: 'discard', l: '弃牌' },
      ]},
      { key: 'needTarget', label: '需要目标', type: 'checkbox', default: true },
    ]},
    { id: 'extraSha', label: '额外出杀', desc: '本回合可多出X张杀', params: [
      { key: 'value', label: '次数', type: 'number', default: 1, min: 1, max: 5 },
    ]},
    { id: 'judge', label: '判定', desc: '进行判定', params: [
      { key: 'condition', label: '判定条件', type: 'select', options: [
        { v: 'always', l: '总是生效' }, { v: 'heart', l: '红桃生效' },
        { v: 'red', l: '红色生效' }, { v: 'black', l: '黑色生效' },
      ]},
    ]},
    { id: 'aoe', label: 'AOE', desc: '对所有其他角色生效', params: [
      { key: 'effect', label: '效果', type: 'select', options: [
        { v: 'sha', l: '视为杀' }, { v: 'shan', l: '视为闪' },
        { v: 'damage', l: '受到伤害' },
      ]},
    ]},
    { id: 'healAll', label: '群体回复', desc: '所有角色回复体力', params: [
      { key: 'value', label: '回复量', type: 'number', default: 1, min: 1, max: 3 },
    ]},
    { id: 'damageAll', label: '群体伤害', desc: '所有其他角色受到伤害', params: [
      { key: 'value', label: '伤害值', type: 'number', default: 1, min: 1, max: 3 },
    ]},
    { id: 'moveCard', label: '移动牌', desc: '移动场上一张牌', params: [
      { key: 'needTarget', label: '需要目标', type: 'checkbox', default: true },
    ]},
    { id: 'peekTop', label: '观看牌堆', desc: '观看牌堆顶X张牌', params: [
      { key: 'value', label: '张数', type: 'number', default: 3, min: 1, max: 10 },
    ]},
    { id: 'extraPhase', label: '额外阶段', desc: '获得一个额外阶段', params: [
      { key: 'phase', label: '阶段', type: 'select', options: [
        { v: 'play', l: '出牌阶段' }, { v: 'draw', l: '摸牌阶段' },
      ]},
    ]},
    { id: 'lock', label: '锁定', desc: '令目标无法使用打出牌', params: [
      { key: 'value', label: '持续回合', type: 'number', default: 1, min: 1, max: 5 },
      { key: 'needTarget', label: '需要目标', type: 'checkbox', default: true },
    ]},
    { id: 'reduceDamage', label: '减伤', desc: '受到的伤害减少', params: [
      { key: 'value', label: '减伤值', type: 'number', default: 1, min: 1, max: 5 },
    ]},
    { id: 'reflectDamage', label: '反弹伤害', desc: '受到伤害时反弹给来源', params: [
      { key: 'value', label: '反弹值', type: 'number', default: 1, min: 1, max: 3 },
    ]},
    { id: 'swapHand', label: '交换手牌', desc: '与目标交换手牌', params: [
      { key: 'needTarget', label: '需要目标', type: 'checkbox', default: true },
    ]},
    { id: 'copyCard', label: '复制牌', desc: '复制一张牌的效果', params: [
      { key: 'target', label: '复制目标', type: 'select', options: [
        { v: 'last', l: '上一张牌' }, { v: 'choose', l: '选择一张牌' },
      ]},
    ]},
  ];

  // ==================== 卡牌编辑器类 ====================
  class CardEditor {
    constructor() {
      this.card = this.createEmptyCard();
      this.onChange = null;
    }

    createEmptyCard() {
      return {
        id: 'ccard_' + Date.now().toString(36),
        name: '自定义卡牌',
        suit: 'spade',
        rank: 7,
        type: 'basic',
        subtype: 'sha', // 关联的基础牌类型
        cost: 0, // 消耗（锦囊可用）
        effects: [{ type: 'damage', params: { value: 1, needTarget: true } }],
        description: '',
        image: null, // 自定义图片
        oncePerTurn: false,
        needsTarget: true,
        range: 0, // 0=无限制
        enabled: true,
      };
    }

    setCard(card) {
      this.card = JSON.parse(JSON.stringify(card));
      this.notify();
    }

    notify() {
      if (this.onChange) this.onChange(this.getCard());
    }

    getCard() {
      const c = this.card;
      c.description = this.generateDesc();
      return c;
    }

    generateDesc() {
      const parts = [];
      const c = this.card;
      if (c.cost > 0) parts.push(`消耗：${c.cost}`);
      for (const e of c.effects) {
        const def = EFFECT_TYPES.find(x => x.id === e.type);
        if (def) {
          let desc = def.label;
          if (e.params.value != null) desc += ` ${e.params.value}`;
          if (e.params.needTarget) desc += '（指定目标）';
          parts.push(desc);
        }
      }
      if (c.oncePerTurn) parts.push('每回合限一次');
      if (c.range > 0) parts.push(`范围${c.range}`);
      return parts.join('；');
    }

    validate() {
      if (!this.card.name || this.card.name.length < 1) return '卡牌名称不能为空';
      if (this.card.name.length > 8) return '名称不能超过8个字';
      if (!this.card.effects.length) return '至少需要一个效果';
      const validSuits = ['spade', 'heart', 'club', 'diamond'];
      if (!validSuits.includes(this.card.suit)) return '花色不合法';
      if (this.card.rank < 1 || this.card.rank > 13) return '点数需在1-13之间';
      return null;
    }

    toJSON() {
      return JSON.stringify(this.getCard(), null, 2);
    }
  }

  window.CardEditor = CardEditor;
  window.CARD_DSL = { CARD_TYPES, BASIC_CARDS, TRICK_CARDS, EQUIP_CARDS, EFFECT_TYPES };
})();
