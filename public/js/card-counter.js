// 卡牌计数器模块
(function () {
  'use strict';

  class CardCounter {
    constructor() {
      this.allCards = []; // 所有卡牌定义
      this.playedCards = []; // 已出的牌
      this.discardedCards = []; // 弃置的牌
      this.playerHands = {}; // 座位 -> 手数数量
      this.enabled = localStorage.getItem('sgk_cardcounter_enabled') !== 'false';
      this._initCardDefs();
    }

    _initCardDefs() {
      // 标准版 108 张牌分布
      this.cardDefs = [
        // 杀 x30
        ...Array(30).fill().map((_, i) => ({ key: 'sha', name: '杀', type: 'basic' })),
        // 闪 x15
        ...Array(15).fill().map((_, i) => ({ key: 'shan', name: '闪', type: 'basic' })),
        // 桃 x8
        ...Array(8).fill().map((_, i) => ({ key: 'tao', name: '桃', type: 'basic' })),
        // 决斗 x3
        ...Array(3).fill().map((_, i) => ({ key: 'juedou', name: '决斗', type: 'trick' })),
        // 过河拆桥 x6
        ...Array(6).fill().map((_, i) => ({ key: 'guohe', name: '过河拆桥', type: 'trick' })),
        // 顺手牵羊 x5
        ...Array(5).fill().map((_, i) => ({ key: 'shunshou', name: '顺手牵羊', type: 'trick' })),
        // 无中生有 x4
        ...Array(4).fill().map((_, i) => ({ key: 'wuzhong', name: '无中生有', type: 'trick' })),
        // 南蛮入侵 x3
        ...Array(3).fill().map((_, i) => ({ key: 'nanman', name: '南蛮入侵', type: 'trick' })),
        // 万箭齐发 x1
        { key: 'wanjian', name: '万箭齐发', type: 'trick' },
        // 桃园结义 x1
        { key: 'taoyuan', name: '桃园结义', type: 'trick' },
        // 五谷丰登 x2
        ...Array(2).fill().map((_, i) => ({ key: 'wugu', name: '五谷丰登', type: 'trick' })),
        // 借刀杀人 x2
        ...Array(2).fill().map((_, i) => ({ key: 'jiedao', name: '借刀杀人', type: 'trick' })),
        // 无懈可击 x4 (含军争)
        ...Array(4).fill().map((_, i) => ({ key: 'wuxie', name: '无懈可击', type: 'trick' })),
        // 乐不思蜀 x3
        ...Array(3).fill().map((_, i) => ({ key: 'lebu', name: '乐不思蜀', type: 'trick' })),
        // 闪电 x2
        ...Array(2).fill().map((_, i) => ({ key: 'shandian', name: '闪电', type: 'trick' })),
        // 武器 x10
        ...Array(2).fill().map((_, i) => ({ key: 'zhuge', name: '诸葛连弩', type: 'equip', subtype: 'weapon' })),
        { key: 'qinggang', name: '青釭剑', type: 'equip', subtype: 'weapon' },
        { key: 'hanbing', name: '寒冰剑', type: 'equip', subtype: 'weapon' },
        { key: 'cixiong', name: '雌雄双股剑', type: 'equip', subtype: 'weapon' },
        { key: 'guanshi', name: '贯石斧', type: 'equip', subtype: 'weapon' },
        { key: 'qinglong', name: '青龙偃月刀', type: 'equip', subtype: 'weapon' },
        { key: 'zhangba', name: '丈八蛇矛', type: 'equip', subtype: 'weapon' },
        { key: 'fangtian', name: '方天画戟', type: 'equip', subtype: 'weapon' },
        { key: 'qilin', name: '麒麟弓', type: 'equip', subtype: 'weapon' },
        // 防具 x3
        ...Array(2).fill().map((_, i) => ({ key: 'bagua', name: '八卦阵', type: 'equip', subtype: 'armor' })),
        { key: 'renwang', name: '仁王盾', type: 'equip', subtype: 'armor' },
        // +1马 x3
        { key: 'dilu', name: '的卢', type: 'equip', subtype: 'horse_plus' },
        { key: 'jueying', name: '绝影', type: 'equip', subtype: 'horse_plus' },
        { key: 'zhuahuang', name: '爪黄飞电', type: 'equip', subtype: 'horse_plus' },
        // -1马 x3
        { key: 'chitu', name: '赤兔', type: 'equip', subtype: 'horse_minus' },
        { key: 'dawan', name: '大宛', type: 'equip', subtype: 'horse_minus' },
        { key: 'zixing', name: '紫骍', type: 'equip', subtype: 'horse_minus' },
      ];
    }

    reset() {
      this.playedCards = [];
      this.discardedCards = [];
      this.playerHands = {};
    }

    // 记录出的牌
    recordPlay(card) {
      this.playedCards.push({ ...card, time: Date.now() });
    }

    // 记录弃置的牌
    recordDiscard(cards) {
      if (Array.isArray(cards)) {
        cards.forEach(c => this.discardedCards.push({ ...c, time: Date.now() }));
      }
    }

    // 更新玩家手牌数
    updatePlayerHand(seat, count) {
      this.playerHands[seat] = count;
    }

    // 获取剩余牌数
    getRemaining() {
      const remaining = {};
      this.cardDefs.forEach(c => {
        const key = c.key;
        remaining[key] = (remaining[key] || 0) + 1;
      });
      // 减去已出和已弃
      this.playedCards.forEach(c => {
        remaining[c.key] = (remaining[c.key] || 0) - 1;
      });
      this.discardedCards.forEach(c => {
        remaining[c.key] = (remaining[c.key] || 0) - 1;
      });
      return remaining;
    }

    // 获取关键牌提示
    getKeyCards() {
      const remaining = this.getRemaining();
      return {
        sha: remaining.sha || 0,
        shan: remaining.shan || 0,
        tao: remaining.tao || 0,
        wuxie: remaining.wuxie || 0,
        juedou: remaining.juedou || 0,
        nanman: remaining.nanman || 0,
        wanjian: remaining.wanjian || 0,
        lebu: remaining.lebu || 0,
        shandian: remaining.shandian || 0,
      };
    }

    // 获取已出牌统计
    getPlayedStats() {
      const stats = {};
      this.playedCards.forEach(c => {
        stats[c.key] = (stats[c.key] || 0) + 1;
      });
      return stats;
    }

    // 获取总手牌数（所有存活玩家）
    getTotalHandCards() {
      return Object.values(this.playerHands).reduce((a, b) => a + b, 0);
    }

    setEnabled(v) {
      this.enabled = !!v;
      localStorage.setItem('sgk_cardcounter_enabled', v);
    }
  }

  window.CardCounter = CardCounter;
})();
