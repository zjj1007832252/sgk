// 标准版 108 张牌堆
// type: basic(基本) / trick(锦囊) / equip(装备)
// subtype(trick): normal / delayed(延时)
// subtype(equip): weapon / armor / horse_plus(+1马) / horse_minus(-1马)

const CARD_DEFS = {
  // ---- 基本牌 ----
  sha:      { name: '杀', type: 'basic' },
  shan:     { name: '闪', type: 'basic' },
  tao:      { name: '桃', type: 'basic' },
  // ---- 锦囊 ----
  juedou:   { name: '决斗', type: 'trick' },
  guohe:    { name: '过河拆桥', type: 'trick' },
  shunshou: { name: '顺手牵羊', type: 'trick' },
  wuzhong:  { name: '无中生有', type: 'trick' },
  nanman:   { name: '南蛮入侵', type: 'trick' },
  wanjian:  { name: '万箭齐发', type: 'trick' },
  taoyuan:  { name: '桃园结义', type: 'trick' },
  wugu:     { name: '五谷丰登', type: 'trick' },
  jiedao:   { name: '借刀杀人', type: 'trick' },
  wuxie:    { name: '无懈可击', type: 'trick' },
  lebu:     { name: '乐不思蜀', type: 'trick', subtype: 'delayed' },
  shandian: { name: '闪电', type: 'trick', subtype: 'delayed' },
  // ---- 武器 ----
  zhuge:     { name: '诸葛连弩', type: 'equip', subtype: 'weapon', range: 1 },
  qinggang:  { name: '青釭剑', type: 'equip', subtype: 'weapon', range: 2 },
  hanbing:   { name: '寒冰剑', type: 'equip', subtype: 'weapon', range: 2 },
  cixiong:   { name: '雌雄双股剑', type: 'equip', subtype: 'weapon', range: 2 },
  guanshi:   { name: '贯石斧', type: 'equip', subtype: 'weapon', range: 3 },
  qinglong:  { name: '青龙偃月刀', type: 'equip', subtype: 'weapon', range: 3 },
  zhangba:   { name: '丈八蛇矛', type: 'equip', subtype: 'weapon', range: 3 },
  fangtian:  { name: '方天画戟', type: 'equip', subtype: 'weapon', range: 4 },
  qilin:     { name: '麒麟弓', type: 'equip', subtype: 'weapon', range: 5 },
  // ---- 防具 ----
  bagua:    { name: '八卦阵', type: 'equip', subtype: 'armor' },
  renwang:  { name: '仁王盾', type: 'equip', subtype: 'armor' },
  // ---- +1 马 ----
  dilu:      { name: '的卢', type: 'equip', subtype: 'horse_plus' },
  jueying:   { name: '绝影', type: 'equip', subtype: 'horse_plus' },
  zhuahuang: { name: '爪黄飞电', type: 'equip', subtype: 'horse_plus' },
  // ---- -1 马 ----
  chitu:  { name: '赤兔', type: 'equip', subtype: 'horse_minus' },
  dawan:  { name: '大宛', type: 'equip', subtype: 'horse_minus' },
  zixing: { name: '紫骍', type: 'equip', subtype: 'horse_minus' },
};

const SUITS = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
const RANKS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

// [key, suit, rank] —— 标准版 108 张
const DECK_LIST = [
  // 杀 x30
  ['sha','spade',7],['sha','spade',8],['sha','spade',8],['sha','spade',9],['sha','spade',9],['sha','spade',10],['sha','spade',10],
  ['sha','heart',10],['sha','heart',10],['sha','heart',11],
  ['sha','club',2],['sha','club',3],['sha','club',4],['sha','club',5],['sha','club',6],['sha','club',7],
  ['sha','club',8],['sha','club',8],['sha','club',9],['sha','club',9],['sha','club',10],['sha','club',10],
  ['sha','club',11],['sha','club',11],
  ['sha','diamond',6],['sha','diamond',7],['sha','diamond',8],['sha','diamond',9],['sha','diamond',10],['sha','diamond',13],
  // 闪 x15
  ['shan','heart',2],['shan','heart',2],['shan','heart',13],
  ['shan','diamond',2],['shan','diamond',2],['shan','diamond',3],['shan','diamond',4],['shan','diamond',5],
  ['shan','diamond',6],['shan','diamond',7],['shan','diamond',8],['shan','diamond',9],['shan','diamond',10],
  ['shan','diamond',11],['shan','diamond',11],
  // 桃 x8
  ['tao','heart',3],['tao','heart',4],['tao','heart',6],['tao','heart',7],['tao','heart',8],['tao','heart',9],['tao','heart',12],
  ['tao','diamond',12],
  // 决斗 x3
  ['juedou','spade',1],['juedou','club',1],['juedou','diamond',1],
  // 过河拆桥 x6
  ['guohe','spade',3],['guohe','spade',4],['guohe','spade',12],['guohe','club',3],['guohe','club',4],['guohe','heart',12],
  // 顺手牵羊 x5
  ['shunshou','spade',3],['shunshou','spade',4],['shunshou','spade',11],['shunshou','diamond',3],['shunshou','diamond',4],
  // 无中生有 x4
  ['wuzhong','heart',7],['wuzhong','heart',8],['wuzhong','heart',9],['wuzhong','heart',11],
  // 南蛮入侵 x3
  ['nanman','spade',7],['nanman','spade',13],['nanman','club',7],
  // 万箭齐发 x1
  ['wanjian','heart',1],
  // 桃园结义 x1
  ['taoyuan','heart',1],
  // 五谷丰登 x2
  ['wugu','heart',3],['wugu','heart',4],
  // 借刀杀人 x2
  ['jiedao','club',12],['jiedao','club',13],
  // 无懈可击 x4
  ['wuxie','spade',11],['wuxie','club',12],['wuxie','diamond',12],['wuxie','club',13],
  // 乐不思蜀 x3
  ['lebu','heart',6],['lebu','club',6],['lebu','spade',6],
  // 闪电 x2
  ['shandian','spade',1],['shandian','heart',12],
  // 武器 x10
  ['zhuge','club',1],['zhuge','diamond',1],
  ['qinggang','spade',6],['hanbing','spade',2],['cixiong','spade',2],['guanshi','diamond',5],
  ['qinglong','spade',5],['zhangba','spade',12],['fangtian','diamond',12],['qilin','heart',5],
  // 防具 x3
  ['bagua','spade',2],['bagua','club',2],['renwang','club',2],
  // +1 马 x3
  ['dilu','club',5],['jueying','spade',5],['zhuahuang','heart',13],
  // -1 马 x3
  ['chitu','heart',5],['dawan','spade',13],['zixing','diamond',13],
];

let uidCounter = 1;

function buildDeck(bannedCards = [], customCards = []) {
  const banned = new Set(bannedCards);
  const extra = [];
  customCards.forEach(c => {
    if (!c || !c.id || !c.key) return;
    if (!c.name || !['spade','heart','club','diamond'].includes(c.suit) || !(c.rank >= 1 && c.rank <= 13)) return;
    // 自定义卡牌也受禁卡列表限制
    if (banned.has(c.key)) return;
    const type = c.type || 'basic';
    extra.push({ uid: 'c' + (uidCounter++), id: c.id, key: c.key, suit: c.suit, rank: c.rank, name: c.name, type, subtype: c.subtype || null, range: c.range || null });
  });
  const deck = DECK_LIST
    .filter(([key]) => !banned.has(key))
    .map(([key, suit, rank]) => ({
      uid: 'c' + (uidCounter++),
      key,
      suit,
      rank,
      name: CARD_DEFS[key].name,
      type: CARD_DEFS[key].type,
      subtype: CARD_DEFS[key].subtype || null,
      range: CARD_DEFS[key].range || null,
    }));
  deck.push(...extra);
  shuffle(deck);
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardColor(card) {
  return (card.suit === 'heart' || card.suit === 'diamond') ? 'red' : 'black';
}

function rankLabel(rank) {
  return RANKS[rank] || String(rank);
}

function publicCard(c) {
  return c ? { uid: c.uid, key: c.key, name: c.name, suit: c.suit, rank: c.rank, type: c.type, subtype: c.subtype, range: c.range || null } : null;
}

module.exports = { CARD_DEFS, SUITS, DECK_LIST, buildDeck, shuffle, cardColor, rankLabel, publicCard };
