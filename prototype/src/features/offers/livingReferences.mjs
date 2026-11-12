// Published inputs in local currency. Apartment samples are whole units.
const mainlandRent = {
  title: '中指研究院 · 2025 年 11 月百城价格指数报告，表 6',
  url: 'https://pdf.dfcfw.com/pdf/H3_AP202512261808574817_1.pdf?1766764599000.pdf=',
  note: '独居取 30–60 ㎡整套样本均租。合租按两人均摊一套 60–90 ㎡住宅估算。实际租金随街区、面积和租约而变。',
};
const hongKongRent = {
  title: '香港差饷物业估价署 · 香港物业报告 2026，表 12',
  url: 'https://www.rvd.gov.hk/doc/en/hkpr26/HKPR2026_Fullbook_TC.pdf',
  note: '按 2025 年各区 A 类私人住宅平均每平方米月租推算。独居按 25 ㎡，合租按两人平摊 36 ㎡。租金未含差饷和管理费。',
};
function dailyAverage(label, total, housing, title, url) {
  return { label, amount: Math.round((total - housing) / 12), title, url,
    note: '居民人均全年消费扣除居住支出，再折为每月，含餐饮、交通、休闲、医疗等。水电物业可在固定支出中补入。' };
}
const urban = dailyAverage('全国城镇 · 2025', 35869, 8095,
  '国家统计局 · 2025 年居民收入和消费支出情况，表 2',
  'https://www.stats.gov.cn/sj/zxfb/202601/t20260119_1962321.html');
const beijing = dailyAverage('北京全市 · 2025', 50667, 19433,
  '国家统计局北京调查总队 · 2025 年北京居民消费支出',
  'https://tjj.beijing.gov.cn/zxfbu/202601/t20260121_4452019.html');
const shenzhen = dailyAverage('深圳全市 · 2025', 53548, 13210.39,
  '深圳市统计局、国家统计局深圳调查队 · 2025 年统计公报，图 2',
  'https://www.sz.gov.cn/cn/xxgk/zfxxgj/tjsj/tjgb/content/post_12805133.html');
const shanghai = dailyAverage('上海全市 · 2024', 52722, 17867,
  '上海市统计局 · 上海统计年鉴 2025，表 9.11',
  'https://tjj.sh.gov.cn/tjnj/nj25.htm?d1=2025tjnj/C0911.htm');
const hongKongDaily = {
  label: '香港一人住户 · 2024/25', amount: 19715 - 10312 - 398,
  title: '香港政府统计处 · 2024/25 年住户开支统计调查，表 4.3',
  url: 'https://www.censtatd.gov.hk/wbr/B1060003/B10600032025XXXX/att/tc/B10600032025XXXX.pdf',
  note: '一人住户每月平均总开支 19,715 港元，扣除住屋 10,312 港元及水电燃气 398 港元。水电另列，管理费和差饷可填入固定支出。',
};
function mainland(id, label, solo, wholeShared, daily = urban) {
  return { id, label, region: 'CN', currency: 'CNY', solo, shared: wholeShared / 2,
    rent: mainlandRent, rentPeriod: '2025.11', daily };
}
function hongKong(id, label, rate) {
  return { id, label, region: 'HK', currency: 'HKD', solo: 25 * rate, shared: 36 * rate / 2,
    rent: hongKongRent, rentPeriod: '2025', daily: hongKongDaily, utilities: 398 };
}
export const livingCities = [
  mainland('shenzhen', '深圳', 3726, 5845, shenzhen),
  mainland('beijing', '北京', 4588, 5263, beijing),
  mainland('shanghai', '上海', 3949, 5106, shanghai),
  mainland('guangzhou', '广州', 2406, 3668),
  mainland('hangzhou', '杭州', 2680, 3769),
  mainland('chengdu', '成都', 1757, 2417),
  mainland('nanjing', '南京', 2296, 2658),
  mainland('wuhan', '武汉', 1506, 2013),
  hongKong('kowloon', '香港 · 九龙', 440),
  hongKong('island', '香港 · 港岛', 496),
  hongKong('territories', '香港 · 新界', 345),
  ...[
    ['xiamen', '厦门', 2046, 3000], ['sanya', '三亚', 2132, 2870],
    ['zhuhai', '珠海', 2145, 2808], ['suzhou', '苏州', 1868, 2650],
    ['fuzhou', '福州', 1762, 2419], ['ningbo', '宁波', 1715, 2350],
    ['haikou', '海口', 1494, 2175], ['tianjin', '天津', 1663, 2090],
    ['dongguan', '东莞', 1419, 2056], ['foshan', '佛山', 1299, 2028],
    ['dalian', '大连', 1482, 2007], ['changsha', '长沙', 1419, 1988],
    ['xian', '西安', 1423, 1967], ['wuxi', '无锡', 1443, 1966],
    ['hefei', '合肥', 1384, 1966], ['qingdao', '青岛', 1546, 1935],
    ['quanzhou', '泉州', 1213, 1921], ['changzhou', '常州', 1364, 1817],
    ['jinan', '济南', 1390, 1816], ['wenzhou', '温州', 1339, 1803],
    ['nanning', '南宁', 1163, 1791], ['wulumuqi', '乌鲁木齐', 1522, 1784],
    ['chongqing', '重庆（主城区）', 1295, 1781], ['jiaxing', '嘉兴', 1174, 1765],
    ['shaoxing', '绍兴', 1406, 1723], ['kunming', '昆明', 1225, 1688],
    ['xining', '西宁', 1548, 1671], ['haerbin', '哈尔滨', 1209, 1642],
    ['zhengzhou', '郑州', 1111, 1631], ['lanzhou', '兰州', 1184, 1621],
    ['shenyang', '沈阳', 1253, 1600], ['guiyang', '贵阳', 1147, 1567],
    ['shijiazhuang', '石家庄', 1057, 1538], ['nanchang', '南昌', 1232, 1532],
    ['changchun', '长春', 1202, 1516], ['huizhou', '惠州', 1073, 1504],
    ['nantong', '南通', 1213, 1501], ['huhehaote', '呼和浩特', 1254, 1364],
    ['taiyuan', '太原', 861, 1326], ['xuzhou', '徐州', 931, 1302],
    ['yinchuan', '银川', 1010, 1042], ['beihai', '北海', 674, 989],
  ].map(args => mainland(...args)),
  { id: 'custom', label: '其他内地城市', region: 'CN', currency: 'CNY', daily: urban },
];
export function namedLivingCity(id) {
  if (typeof id !== 'string' || !id.startsWith('custom:')) return null;
  const name = id.slice(7);
  if (!name || name.length > 60 || name !== name.trim() || /[\u0000-\u001f\u007f]/u.test(name)) return null;
  return { ...livingCities.at(-1), id, label: name };
}
export function budgetCity(plan, selectedId = plan.livingBudget?.city) {
  const selected = livingCities.find(c => c.id === selectedId) || namedLivingCity(selectedId);
  if (selected) return selected;
  const location = (plan.city || '').trim();
  if (plan.region === 'HK') {
    if (/新界/.test(location)) return livingCities.find(c => c.id === 'territories');
    return livingCities.find(c => c.id === (/港岛|港島|香港島|香港岛/.test(location) ? 'island' : 'kowloon'));
  }
  if (!location) return livingCities[0];
  return livingCities.find(c => c.region === 'CN' && location.includes(c.label.split('（')[0]))
    || namedLivingCity('custom:' + location) || livingCities.at(-1);
}
