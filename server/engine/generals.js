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
  { id: 'diaochan',  name: '貂蝉', kingdom: 'qun', hp: 3, gender: 'f', title: '绝色舞姬', skills: ['lijian', 'biyue'] },

  // ================= 军争篇 =================
  { id: 'zhangchunhua', name: '张春华', kingdom: 'wei', hp: 3, gender: 'f', title: '冷血皇后', skills: ['jueqing', 'shangshi'] },
  { id: 'caozhi',       name: '曹植',   kingdom: 'wei', hp: 3, gender: 'm', title: '八斗之才', skills: ['luoying', 'jiushi'] },
  { id: 'xiahoushi',    name: '夏侯氏', kingdom: 'shu', hp: 3, gender: 'f', title: '疾恶夫人', skills: ['qiaohui', 'yanling'] },
  { id: 'yujin',        name: '于禁',   kingdom: 'wei', hp: 4, gender: 'm', title: '毅重将军', skills: ['jieyue'] },
  { id: 'zhanghe',      name: '张郃',   kingdom: 'wei', hp: 4, gender: 'm', title: '巧变将军', skills: ['qiaobian'] },
  { id: 'dianwei',      name: '典韦',   kingdom: 'wei', hp: 4, gender: 'm', title: '古之恶来', skills: ['qiangxi'] },
  { id: 'taishici',     name: '太史慈', kingdom: 'wu',  hp: 4, gender: 'm', title: '信义笃烈', skills: ['tianyi'] },
  { id: 'litong',       name: '李通',   kingdom: 'wei', hp: 4, gender: 'm', title: '万亿吾身', skills: ['tuifeng'] },
  { id: 'guanping',     name: '关平',   kingdom: 'shu', hp: 4, gender: 'm', title: '忠臣孝子', skills: ['longyin'] },
  { id: 'liufeng',      name: '刘封',   kingdom: 'shu', hp: 4, gender: 'm', title: '骑虎之殇', skills: ['xiansi'] },
  { id: 'madai',        name: '马岱',   kingdom: 'shu', hp: 4, gender: 'm', title: '临危受命', skills: ['mashu', 'qianxi'] },
  { id: 'xusheng',      name: '徐盛',   kingdom: 'wu',  hp: 4, gender: 'm', title: '江东铁壁', skills: ['pojun'] },
  { id: 'handang',      name: '韩当',   kingdom: 'wu',  hp: 4, gender: 'm', title: '石城侯',   skills: ['gongqi', 'jiefan'] },
  { id: 'chenqun',      name: '陈群',   kingdom: 'wei', hp: 3, gender: 'm', title: '清流雅望', skills: ['faen', 'dingpin'] },
  { id: 'guyong',       name: '顾雍',   kingdom: 'wu',  hp: 3, gender: 'm', title: '庙堂之量', skills: ['shenxing', 'lianji'] },
  { id: 'wangyi',       name: '王异',   kingdom: 'qun', hp: 3, gender: 'f', title: '决烈巾帼', skills: ['miji', 'zhenlie'] },
  { id: 'xunyou',       name: '荀攸',   kingdom: 'wei', hp: 3, gender: 'm', title: '曹魏的谋主', skills: ['qice', 'zhiyu'] },
  { id: 'bulianshi',    name: '步练师', kingdom: 'wu',  hp: 3, gender: 'f', title: '无冕之后', skills: ['anxu', 'zhuiyi'] },
  { id: 'sunluban',     name: '孙鲁班', kingdom: 'wu',  hp: 3, gender: 'f', title: '悍妻',     skills: ['zenghui', 'jiaozi'] },
  { id: 'zhuhuan',      name: '朱桓',   kingdom: 'wu',  hp: 4, gender: 'm', title: '中洲绝壁', skills: ['pingkou', 'fenli'] },
  { id: 'cenhun',       name: '岑昏',   kingdom: 'wu',  hp: 3, gender: 'm', title: '铸币祸国', skills: ['lianhuo', 'jishe'] },
  { id: 'guanyu_y',     name: '关羽(将)', kingdom: 'shu', hp: 4, gender: 'm', title: '美髯公', skills: ['wusheng', 'weidai'] },
  { id: 'zhangfei_y',   name: '张飞(将)', kingdom: 'shu', hp: 4, gender: 'm', title: '万夫不当', skills: ['paoxiao', 'xisheng'] },

  // ================= 一将成名 =================
  { id: 'fazheng',      name: '法正',   kingdom: 'shu', hp: 3, gender: 'm', title: '蜀汉谋主', skills: ['xuanhuo', 'enyuan'] },
  { id: 'xushu',        name: '徐庶',   kingdom: 'shu', hp: 3, gender: 'm', title: '走马荐诸葛', skills: ['wuyan', 'jujian'] },
  { id: 'lingtong',     name: '凌统',   kingdom: 'wu',  hp: 4, gender: 'm', title: '豪情烈胆', skills: ['xuanfeng', 'xinshuang'] },
  { id: 'masu',         name: '马谡',   kingdom: 'shu', hp: 3, gender: 'm', title: '言过其实', skills: ['xingong', 'huilei'] },
  { id: 'gaoshun',      name: '高顺',   kingdom: 'qun', hp: 4, gender: 'm', title: '攻无不克', skills: ['xianzhen', 'jinjiu'] },
  { id: 'jiling',       name: '纪灵',   kingdom: 'qun', hp: 4, gender: 'm', title: '袁术上将', skills: ['shuangren'] },
  { id: 'wuguotai',     name: '吴国太', kingdom: 'wu',  hp: 3, gender: 'f', title: '武烈皇后', skills: ['ganlu', 'buyi'] },
  { id: 'zhangzhao',    name: '张昭',   kingdom: 'wu',  hp: 3, gender: 'm', title: '辅吴将军', skills: ['zhijian', 'guzheng'] },
  { id: 'yufan',        name: '虞翻',   kingdom: 'wu',  hp: 3, gender: 'm', title: '狂直之士', skills: ['zongxuan', 'zhiyan'] },
  { id: 'caoyi',        name: '曹轶',   kingdom: 'qun', hp: 3, gender: 'f', title: '巾帼花舞', skills: ['guijin', 'furen'] },
  { id: 'pangtong',     name: '庞统',   kingdom: 'shu', hp: 3, gender: 'm', title: '凤雏',     skills: ['lianhuan', 'niepan'] },
  { id: 'weiyan',       name: '魏延',   kingdom: 'shu', hp: 4, gender: 'm', title: '汉中太守', skills: ['kuanggu', 'qimou'] },
  { id: 'hetaihou',     name: '何太后', kingdom: 'qun', hp: 3, gender: 'f', title: '灵思皇后', skills: ['yudu', 'qiluan'] },
  { id: 'yanshi',       name: '严颜',   kingdom: 'shu', hp: 4, gender: 'm', title: '断头将军', skills: ['shike'] },

  // ================= 神武将 =================
  { id: 'shenguan',     name: '神关羽', kingdom: 'god', hp: 5, gender: 'm', title: '鬼神再临', skills: ['wuhun', 'wushen_s'] },
  { id: 'shenmeng',     name: '神吕蒙', kingdom: 'god', hp: 3, gender: 'm', title: '国士无双', skills: ['shelie', 'gongxin'] },
  { id: 'shenzhou',     name: '神周瑜', kingdom: 'god', hp: 4, gender: 'm', title: '赤壁的火神', skills: ['qinyin', 'yanye'] },
  { id: 'shenliang',    name: '神诸葛亮', kingdom: 'god', hp: 3, gender: 'm', title: '赤壁的妖术师', skills: ['qixing', 'kuangfeng', 'dawu'] },
  { id: 'shencao',      name: '神曹操', kingdom: 'god', hp: 3, gender: 'm', title: '超世之杰', skills: ['guixin', 'feiying'] },
  { id: 'shenlv',       name: '神吕布', kingdom: 'god', hp: 6, gender: 'm', title: '修罗之道', skills: ['wuqiang', 'shenwei'] },
  { id: 'shenzhao',     name: '神赵云', kingdom: 'god', hp: 2, gender: 'm', title: '神威如龙', skills: ['juejing', 'longhun'] },
  { id: 'shensi',       name: '神司马懿', kingdom: 'god', hp: 4, gender: 'm', title: '晋国之祖', skills: ['renjie', 'baiyin', 'jilue'] },
];

const KINGDOMS = {
  wei: { name: '魏', color: '#4a6fa5' },
  shu: { name: '蜀', color: '#b03a2e' },
  wu:  { name: '吴', color: '#3e7d4e' },
  qun: { name: '群', color: '#8a7f8d' },
  god: { name: '神', color: '#d4a017' },
};

function getGeneral(id, customs) {
  const g = GENERALS.find(g => g.id === id);
  if (g) return g;
  if (customs) return customs.find(c => c.id === id) || null;
  return null;
}

module.exports = { GENERALS, KINGDOMS, getGeneral };
