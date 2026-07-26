// 标准版 25 名武将
const GENERALS = [
  // ---- 魏 (7) ----
  { id: 'caocao',    name: '曹操',   kingdom: 'wei', hp: 4, gender: 'm', title: '魏武帝',   skills: ['jianxiong'] },
  { id: 'simayi',    name: '司马懿', kingdom: 'wei', hp: 3, gender: 'm', title: '狼顾之鬼', skills: ['fankui', 'guicai'] },
  { id: 'xiahoudun', name: '夏侯惇', kingdom: 'wei', hp: 4, gender: 'm', title: '独眼罗刹', skills: ['ganglie'] },
  { id: 'zhangliao', name: '张辽',   kingdom: 'wei', hp: 4, gender: 'm', title: '前将军',   skills: ['tuxi'] },
  { id: 'xuchu',     name: '许褚',   kingdom: 'wei', hp: 4, gender: 'm', title: '虎痴',     skills: ['luoyi'] },
  { id: 'guojia',    name: '郭嘉',   kingdom: 'wei', hp: 3, gender: 'm', title: '早逝先知', skills: ['tiandu', 'yiji'] },
  { id: 'zhenji',    name: '甄姬',   kingdom: 'wei', hp: 3, gender: 'f', title: '薄幸美人', skills: ['qingguo', 'luoshen'] },
  // ---- 蜀 (7) ----
  { id: 'liubei',    name: '刘备',   kingdom: 'shu', hp: 4, gender: 'm', title: '乱世人雄', skills: ['rende', 'jijiang'] },
  { id: 'guanyu',    name: '关羽',   kingdom: 'shu', hp: 4, gender: 'm', title: '美髯公',   skills: ['wusheng'] },
  { id: 'zhangfei',  name: '张飞',   kingdom: 'shu', hp: 4, gender: 'm', title: '万夫不当', skills: ['paoxiao'] },
  { id: 'zhugeliang',name: '诸葛亮', kingdom: 'shu', hp: 3, gender: 'm', title: '迟暮丞相', skills: ['guanxing', 'kongcheng'] },
  { id: 'zhaoyun',   name: '赵云',   kingdom: 'shu', hp: 4, gender: 'm', title: '少年将军', skills: ['longdan'] },
  { id: 'machao',    name: '马超',   kingdom: 'shu', hp: 4, gender: 'm', title: '一骑当千', skills: ['mashu', 'tieji'] },
  { id: 'huangyueying', name: '黄月英', kingdom: 'shu', hp: 3, gender: 'f', title: '归隐杰女', skills: ['jizhi', 'qicai'] },
  // ---- 吴 (8) ----
  { id: 'sunquan',   name: '孙权',   kingdom: 'wu', hp: 4, gender: 'm', title: '年轻贤君', skills: ['zhiheng', 'jiuyuan'] },
  { id: 'ganning',   name: '甘宁',   kingdom: 'wu', hp: 4, gender: 'm', title: '锦帆游侠', skills: ['qixi'] },
  { id: 'lvmeng',    name: '吕蒙',   kingdom: 'wu', hp: 4, gender: 'm', title: '白衣渡江', skills: ['keji'] },
  { id: 'huanggai',  name: '黄盖',   kingdom: 'wu', hp: 4, gender: 'm', title: '轻身为国', skills: ['kurou'] },
  { id: 'zhouyu',    name: '周瑜',   kingdom: 'wu', hp: 3, gender: 'm', title: '大都督',   skills: ['yingzi', 'fanjian'] },
  { id: 'daqiao',    name: '大乔',   kingdom: 'wu', hp: 3, gender: 'f', title: '矜持之花', skills: ['guose', 'liuli'] },
  { id: 'luxun',     name: '陆逊',   kingdom: 'wu', hp: 3, gender: 'm', title: '儒生雄才', skills: ['qianxun', 'lianying'] },
  { id: 'sunshangxiang', name: '孙尚香', kingdom: 'wu', hp: 3, gender: 'f', title: '弓腰姬', skills: ['jieyin', 'xiaoji'] },
  // ---- 群 (3) ----
  { id: 'huatuo',    name: '华佗',   kingdom: 'qun', hp: 3, gender: 'm', title: '神医',     skills: ['jijiu', 'qingnang'] },
  { id: 'lvbu',      name: '吕布',   kingdom: 'qun', hp: 4, gender: 'm', title: '武的化身', skills: ['wushuang'] },
  { id: 'diaochan',  name: '貂蝉',   kingdom: 'qun', hp: 3, gender: 'f', title: '绝色舞姬', skills: ['lijian', 'biyue'] },
];

const KINGDOMS = {
  wei: { name: '魏', color: '#4a6fa5' },
  shu: { name: '蜀', color: '#b03a2e' },
  wu:  { name: '吴', color: '#3e7d4e' },
  qun: { name: '群', color: '#8a7f8d' },
};

function getGeneral(id, customs) {
  const g = GENERALS.find(g => g.id === id);
  if (g) return g;
  if (customs) return customs.find(c => c.id === id) || null;
  return null;
}

module.exports = { GENERALS, KINGDOMS, getGeneral };
