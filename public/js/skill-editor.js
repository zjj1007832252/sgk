// 自定义技能编辑器
(function () {
  'use strict';

  // ==================== 技能 DSL 定义 ====================
  const TRIGGERS = [
    { id: 'phase:start', label: '回合开始阶段', desc: '你的回合开始时' },
    { id: 'phase:play', label: '出牌阶段', desc: '你的出牌阶段开始时' },
    { id: 'phase:playEnd', label: '出牌阶段结束', desc: '你的出牌阶段结束时' },
    { id: 'phase:draw', label: '摸牌阶段', desc: '你的摸牌阶段' },
    { id: 'phase:discard', label: '弃牌阶段', desc: '你的弃牌阶段' },
    { id: 'phase:end', label: '结束阶段', desc: '你的回合结束时' },
    { id: 'damage:after', label: '受到伤害后', desc: '当你受到伤害后' },
    { id: 'damage:before', label: '受到伤害时', desc: '当你即将受到伤害时' },
    { id: 'damage:deal', label: '造成伤害后', desc: '当你对一名角色造成伤害后' },
    { id: 'die', label: '死亡时', desc: '当你死亡时' },
    { id: 'kill', label: '杀死角色后', desc: '当你杀死一名角色后' },
    { id: 'judge:before', label: '判定前', desc: '当一名角色判定时' },
    { id: 'recover', label: '回复体力后', desc: '当你回复体力后' },
    { id: 'loseHp', label: '失去体力后', desc: '当你失去体力后' },
    { id: 'useCard', label: '使用牌时', desc: '当你使用一张牌时' },
    { id: 'respondCard', label: '打出牌时', desc: '当你打出一张牌时' },
    { id: 'equip', label: '装备牌后', desc: '当你装备一张装备牌后' },
    { id: 'unequip', label: '失去装备后', desc: '当你失去装备区的一张牌后' },
    { id: 'turnStart:any', label: '任意回合开始', desc: '任意一名角色的回合开始时' },
    { id: 'die:any', label: '任意角色死亡', desc: '任意一名角色死亡时' },
  ];

  const CONDITIONS = [
    { id: 'always', label: '无条件', desc: '始终满足', params: [] },
    { id: 'hpLessThan', label: '体力值小于', params: [{ key: 'value', label: '体力值', type: 'number', default: 3, min: 1, max: 10 }] },
    { id: 'hpMoreThan', label: '体力值大于', params: [{ key: 'value', label: '体力值', type: 'number', default: 1, min: 0, max: 10 }] },
    { id: 'handLessThan', label: '手牌数小于', params: [{ key: 'value', label: '手牌数', type: 'number', default: 2, min: 0, max: 20 }] },
    { id: 'handMoreThan', label: '手牌数大于', params: [{ key: 'value', label: '手牌数', type: 'number', default: 3, min: 0, max: 20 }] },
    { id: 'hasSha', label: '手牌中有【杀】', params: [] },
    { id: 'hasShan', label: '手牌中有【闪】', params: [] },
    { id: 'hasTao', label: '手牌中有【桃】', params: [] },
    { id: 'hasEquip', label: '装备区有牌', params: [] },
    { id: 'noEquip', label: '装备区无牌', params: [] },
    { id: 'inRange', label: '攻击范围内有目标', params: [] },
    { id: 'targetInjured', label: '目标已受伤', params: [] },
    { id: 'turnCount', label: '回合数达到', params: [{ key: 'value', label: '回合数', type: 'number', default: 3, min: 1, max: 20 }] },
    { id: 'aliveCount', label: '存活角色数', params: [{ key: 'value', label: '角色数', type: 'number', default: 3, min: 2, max: 8 }], op: 'lessEqual' },
    { id: 'identityIs', label: '身份为', params: [{ key: 'value', label: '身份', type: 'select', options: [{ v: 'zhu', l: '主公' }, { v: 'zhong', l: '忠臣' }, { v: 'fan', l: '反贼' }, { v: 'nei', l: '内奸' }] }] },
    { id: 'hasMark', label: '拥有标记', params: [{ key: 'mark', label: '标记名', type: 'text', default: 'mark' }] },
    { id: 'cardColor', label: '牌颜色为', params: [{ key: 'color', label: '颜色', type: 'select', options: [{ v: 'red', l: '红色' }, { v: 'black', l: '黑色' }] }] },
    { id: 'cardSuit', label: '牌花色为', params: [{ key: 'suit', label: '花色', type: 'select', options: [{ v: 'spade', l: '♠黑桃' }, { v: 'heart', l: '♥红桃' }, { v: 'club', l: '♣梅花' }, { v: 'diamond', l: '♦方块' }] }] },
    { id: 'distance', label: '与目标距离', params: [{ key: 'value', label: '距离', type: 'number', default: 1, min: 0, max: 10 }], op: 'lessEqual' },
    { id: 'hpPercent', label: '体力百分比', params: [{ key: 'value', label: '%', type: 'number', default: 50, min: 0, max: 100 }], op: 'less' },
  ];

  const EFFECTS = [
    { id: 'drawCards', label: '摸牌', desc: '摸X张牌', params: [{ key: 'value', label: '张数', type: 'number', default: 1, min: 1, max: 10 }] },
    { id: 'discardCards', label: '弃置手牌', desc: '弃置X张手牌', params: [{ key: 'value', label: '张数', type: 'number', default: 1, min: 1, max: 10 }] },
    { id: 'damage', label: '造成伤害', desc: '对目标造成X点伤害', params: [{ key: 'value', label: '伤害值', type: 'number', default: 1, min: 1, max: 5 }], needTarget: true },
    { id: 'recover', label: '回复体力', desc: '回复X点体力', params: [{ key: 'value', label: '回复量', type: 'number', default: 1, min: 1, max: 5 }], needTarget: false },
    { id: 'recoverTarget', label: '令目标回复', desc: '令一名角色回复X点体力', params: [{ key: 'value', label: '回复量', type: 'number', default: 1, min: 1, max: 5 }], needTarget: true },
    { id: 'gainCard', label: '获得牌', desc: '获得一名角色的一张牌', params: [], needTarget: true },
    { id: 'discardTarget', label: '弃置目标牌', desc: '弃置一名角色的一张牌', params: [], needTarget: true },
    { id: 'discardTargetMulti', label: '弃置目标多张牌', desc: '弃置一名角色的X张牌', params: [{ key: 'value', label: '张数', type: 'number', default: 1, min: 1, max: 10 }], needTarget: true },
    { id: 'skipPhase', label: '跳过阶段', desc: '跳过自己的某阶段', params: [{ key: 'phase', label: '阶段', type: 'select', options: [{ v: 'draw', l: '摸牌阶段' }, { v: 'play', l: '出牌阶段' }, { v: 'discard', l: '弃牌阶段' }] }] },
    { id: 'extraSha', label: '额外出杀', desc: '本回合可多使用X张【杀】', params: [{ key: 'value', label: '次数', type: 'number', default: 1, min: 1, max: 5 }] },
    { id: 'addMark', label: '添加标记', desc: '获得X枚标记', params: [{ key: 'mark', label: '标记名', type: 'text', default: 'mark' }, { key: 'value', label: '数量', type: 'number', default: 1, min: 1, max: 10 }] },
    { id: 'removeMark', label: '移除标记', desc: '移除X枚标记', params: [{ key: 'mark', label: '标记名', type: 'text', default: 'mark' }, { key: 'value', label: '数量', type: 'number', default: 1, min: 1, max: 10 }] },
    { id: 'immunity', label: '免疫', desc: '免疫某种效果', params: [{ key: 'type', label: '免疫类型', type: 'select', options: [{ v: 'damage', l: '伤害' }, { v: 'judge', l: '判定' }, { v: 'discard', l: '弃置' }] }] },
    { id: 'changeHpMax', label: '改变体力上限', desc: '改变自己的体力上限', params: [{ key: 'value', label: '变化值', type: 'number', default: 1, min: -3, max: 3 }] },
    { id: 'peekTop', label: '观看牌堆顶', desc: '观看牌堆顶的X张牌', params: [{ key: 'value', label: '张数', type: 'number', default: 3, min: 1, max: 10 }] },
    { id: 'moveCard', label: '移动场上牌', desc: '移动场上一张牌', params: [] },
    { id: 'revealHand', label: '展示手牌', desc: '展示一名角色的手牌', params: [], needTarget: true },
    { id: 'stealCard', label: '顺手牵羊', desc: '获得一名其他角色区域内的一张牌', params: [], needTarget: true },
    { id: 'indulgence', label: '乐不思蜀', desc: '将【乐不思蜀】置入一名角色的判定区', params: [], needTarget: true },
    { id: 'lightning', label: '闪电', desc: '将【闪电】置入一名角色的判定区', params: [], needTarget: true },
    { id: 'extraPhase', label: '额外阶段', desc: '获得一个额外阶段', params: [{ key: 'phase', label: '阶段', type: 'select', options: [{ v: 'play', l: '出牌阶段' }, { v: 'draw', l: '摸牌阶段' }] }] },
    { id: 'protect', label: '保护', desc: '成为【桃】的目标时多摸牌', params: [{ key: 'value', label: '摸牌数', type: 'number', default: 1, min: 1, max: 5 }] },
    { id: 'reduceDamage', label: '减伤', desc: '受到的伤害减少', params: [{ key: 'value', label: '减伤值', type: 'number', default: 1, min: 1, max: 5 }] },
    { id: 'reflectDamage', label: '反弹伤害', desc: '受到伤害时反弹给来源', params: [{ key: 'value', label: '反弹值', type: 'number', default: 1, min: 1, max: 3 }] },
    { id: 'healAll', label: '群体回复', desc: '令所有角色回复体力', params: [{ key: 'value', label: '回复量', type: 'number', default: 1, min: 1, max: 3 }] },
    { id: 'damageAll', label: '群体伤害', desc: '对所有其他角色造成伤害', params: [{ key: 'value', label: '伤害值', type: 'number', default: 1, min: 1, max: 3 }] },
    { id: 'swapHand', label: '交换手牌', desc: '与一名角色交换手牌', params: [], needTarget: true },
    { id: 'copySkill', label: '复制技能', desc: '临时获得一名角色的一个技能', params: [], needTarget: true },
    { id: 'lock', label: '锁定', desc: '令一名角色无法使用或打出牌', params: [{ key: 'value', label: '持续回合', type: 'number', default: 1, min: 1, max: 5 }], needTarget: true },
    { id: 'drawForAll', label: '群体摸牌', desc: '令所有角色摸牌', params: [{ key: 'value', label: '张数', type: 'number', default: 1, min: 1, max: 5 }] },
    { id: 'discardAll', label: '群体弃牌', desc: '令所有角色弃牌', params: [{ key: 'value', label: '张数', type: 'number', default: 1, min: 1, max: 5 }] },
  ];

  const LIMITATIONS = [
    { id: 'none', label: '无限制', desc: '每回合可发动多次' },
    { id: 'oncePerTurn', label: '每回合限一次', desc: '每回合只能发动一次' },
    { id: 'oncePerGame', label: '整局游戏限一次', desc: '整局游戏只能发动一次' },
    { id: 'costHp', label: '消耗体力', desc: '发动时失去1点体力', cost: 'hp' },
    { id: 'costCard', label: '弃置手牌', desc: '发动时弃置一张手牌', cost: 'card' },
    { id: 'costEquip', label: '弃置装备', desc: '发动时弃置一张装备', cost: 'equip' },
    { id: 'flip', label: '翻面', desc: '发动时将自己的武将牌翻面', cost: 'flip' },
  ];

  // ==================== 技能编辑器类 ====================
  class SkillEditor {
    constructor() {
      this.skill = this.createEmptySkill();
      this.onChange = null;
    }

    createEmptySkill() {
      return {
        id: 'custom_' + Date.now().toString(36),
        name: '自定义技能',
        desc: '',
        type: 'trigger',
        trigger: 'phase:play',
        condition: { type: 'always', params: {} },
        effects: [{ type: 'drawCards', params: { value: 1 }, needTarget: false }],
        limitation: 'oncePerTurn',
        cost: null,
        enabled: true,
      };
    }

    setSkill(skill) {
      this.skill = JSON.parse(JSON.stringify(skill));
      this.notify();
    }

    notify() {
      if (this.onChange) this.onChange(this.getSkill());
    }

    getSkill() {
      const s = this.skill;
      s.desc = this.generateDesc();
      return s;
    }

    generateDesc() {
      const trigger = TRIGGERS.find(t => t.id === this.skill.trigger);
      const cond = this.skill.condition.type !== 'always' ?
        '，' + (CONDITIONS.find(c => c.id === this.skill.condition.type)?.label || '') +
        (this.skill.condition.params.value != null ? this.skill.condition.params.value : '') : '';
      const effects = this.skill.effects.map(e => {
        const ef = EFFECTS.find(x => x.id === e.type);
        return (ef?.label || e.type) + (e.params?.value != null ? e.params.value : '');
      }).join('，');
      const limit = LIMITATIONS.find(l => l.id === this.skill.limitation);
      return `${trigger?.label || ''}${cond}，${effects}（${limit?.label || ''}）`;
    }

    validate() {
      if (!this.skill.name || this.skill.name.length < 1) return '技能名称不能为空';
      if (this.skill.name.length > 6) return '技能名称不能超过6个字';
      if (!this.skill.trigger) return '请选择触发时机';
      if (!this.skill.effects.length) return '请至少添加一个效果';
      for (const e of this.skill.effects) {
        const def = EFFECTS.find(x => x.id === e.type);
        if (!def) return '未知效果类型';
        if (def.needTarget && !e.needTarget) e.needTarget = true;
      }
      return null;
    }

    toJSON() {
      return JSON.stringify(this.getSkill(), null, 2);
    }
  }

  // ==================== 导出 ====================
  window.SkillEditor = SkillEditor;
  window.SKILL_DSL = { TRIGGERS, CONDITIONS, EFFECTS, LIMITATIONS };
})();
