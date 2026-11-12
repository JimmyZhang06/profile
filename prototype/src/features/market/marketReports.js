import { graduateJobs, hongKongDistricts, mainlandCities, mainlandIndustries, mainlandRegions } from './marketData.js';

// Amounts are in publisher units, never cents. One figure = one population definition,
// currency, period and statistic; a missing statistic has no field (never zero).
const labels = { private: '私营单位均值', public: '非私营单位均值', median: '中位数', mean: '平均数',
  p10: 'P10', p25: 'P25', p75: 'P75', p90: 'P90', low: '指南下限', high: '指南上限', allowance: '计划津贴' };
const range5 = ['p10', 'p25', 'median', 'p75', 'p90'];
const pair = ['private', 'public'];
const numbers = (keys, values) => Object.fromEntries(keys.map((key, i) => [key, values[i]]));
const row = (label, keys, values, extra = {}) => ({ label, values: numbers(keys, values), ...extra });
const rows = (keys, records) => records.map(([label, ...values]) => row(label, keys, values));
export const statLabel = key => labels[key];
export const topics = [{ id: 'place', name: '地区工资' }, { id: 'entry', name: '实习与校招' }, { id: 'role', name: '行业与岗位' }];
const unitText = { day: '天', month: '月', year: '年' };
export const moneyUnit = report => (report.region === 'HK' ? '港元' : '元') + ' / ' + unitText[report.unit];

// Shenzhen and Guangzhou: both 2025 editions report wages earned in calendar 2024.
const bay = [
  ['信息与软件', [82746,107062,162400,252850,370238], [50773,72575,113076,184173,289756]],
  ['批发和零售', [54326,70015,95760,144000,231140], [44390,60000,85900,131280,210741]],
  ['交通运输与仓储邮政', [60865,78902,106145,157302,243600], [49437,71536,98765,142938,216378]],
  ['住宿和餐饮', [45600,54000,69600,93792,132000], [36901,45600,60000,83664,117121]],
  ['建筑', [50700,66090,93476,132000,200355], [48000,63600,88320,134188,202219]],
];
const unitContext = '按单位登记类型分别统计，包含不同岗位和工龄。两类单位的平均不能再简单平均成全市工资。';
const guideContext = '这是招聘指南给出的岗位区间。指南上下限不是 P25、P75，也不能用区间中点充当中位数。';

export const reports = [
  { id:'cities', region:'CN', topic:'place', option:'城市平均工资', title:'城市年平均工资', period:'2025 年', unit:'year', keys:pair,
    population:'城镇单位就业人员，税前年工资', note:unitContext, source:'nbs',
    rows:mainlandCities.map(c => row(c.city, pair, [c.privateWage, c.nonPrivateWage], {source:c.source})) },
  { id:'bay', region:'CN', topic:'place', option:'深广同行业分位数', title:'深圳与广州的工资分布', period:'2024 年', unit:'year', keys:range5, primary:'median',
    population:'当地企业从业人员 · 同行业全年工资报酬', note:'两地 2025 版报告均调查 2024 全年。深圳调查 4,794 家企业，广州调查 5,009 家；行业相同，两地样本分别统计。', source:'szSurvey',
    rows:bay.flatMap(([group, s, g]) => [row('深圳', range5, s, {group, source:'szSurvey'}),row('广州', range5, g, {group, source:'gzSurvey'})]) },
  { id:'provinces', region:'CN', topic:'place', option:'分省与行业均值', title:'三省同行业年平均工资', period:'2025 年', unit:'year', keys:pair,
    population:'江苏、福建、湖南城镇单位就业人员 · 全行业或指定行业', note:unitContext, source:'jiangsu',
    rows:[
      ['江苏','jiangsu',[79868,134969],[117368,193855],[128433,228255]],
      ['福建','fujian',[70581,116510],[104740,176094],[113444,182595]],
      ['湖南','hunan',[60679,102468],[82752,157171],[100218,145000]],
    ].flatMap(([name,source,all,it,finance])=>[['全行业',all],['信息与软件',it],['金融',finance]].map(([group,values])=>row(name,pair,values,{source,group}))) },
  { id:'regions', region:'CN', topic:'place', option:'四大地区与全国', title:'四大地区与全国年均工资', period:'2025 年', unit:'year', keys:pair,
    population:'全国及四大地区的城镇单位就业人员', note:unitContext, source:'nbs', rows:rows(pair, mainlandRegions) },
  { id:'cn-intern', region:'CN', topic:'entry', option:'实习日薪', title:'实习日薪参考', period:'2025 年调研', unit:'day', keys:['mean'],
    population:'采用统一实习薪资标准的受访企业 · 全国样本', note:'49% 的受访企业采用统一实习薪资标准。报告给出这组企业的均值，未公布日薪中位数或城市分位数。', source:'ciic', rows:rows(['mean'], [['统一实习标准',181]]) },
  { id:'cn-grad', region:'CN', topic:'entry', option:'应届生起薪', title:'应届生的平均月起薪', period:'2025 年调研', unit:'month', keys:['mean'],
    population:'受访企业提供的应届生月起薪 · 全国样本', note:'按学历分别统计起薪。这里只比较月起薪，不含自行推算的额外薪数或奖金。', source:'ciic', rows:rows(['mean'], [['本科',6695],['硕士',9426]]) },
  { id:'digital', region:'CN', topic:'role', option:'数字职业工资分布', title:'数字职业的工资分布', period:'2025 年', unit:'year', keys:range5, primary:'median',
    population:'全国企业从业人员 · 数字职业，全年工资报酬', note:'同一职业包括不同资历。工资报酬包含奖金、津贴补贴等；不能把全年收入直接当作月基本工资。', source:'mohrss',
    rows:rows(range5,[['计算机软件工程技术人员',58500,90000,143300,220100,331300],['计算机程序设计员',59300,80000,129300,215300,361900],['计算机软件测试员',46800,73900,98800,150500,208000],['电子商务师',37200,51000,70000,105100,156400],['计算机网络工程技术人员',45000,59100,88200,132000,201600]]) },
  { id:'industries', region:'CN', topic:'role', option:'全国行业均值', title:'行业年平均工资', period:'2025 年', unit:'year', keys:pair,
    population:'全国城镇单位就业人员 · 按行业', note:unitContext, source:'nbs', rows:rows(pair, mainlandIndustries) },
  { id:'beijing', region:'CN', topic:'role', option:'北京技术人才月薪', title:'北京技术人才月薪中位数', period:'2025 年第四季度', unit:'month', keys:['median'],
    population:'北京企业在岗的专业技术与技能人才', note:'先计算每人季度内的平均月薪，再取人群中位数。含月度奖金等，不含年终奖、股权及分红。', source:'beijing',
    rows:rows(['median'],[['专业技术人员',13264],['高级技师',13273],['技师',11996],['高级技能人才',11593]]) },
  { id:'cn-guide', region:'CN', topic:'role', option:'AI 产品招聘区间', title:'AIGC 产品经理基本月薪', period:'2026 年指南', unit:'month', keys:['low','high'],
    population:'任仕达招聘市场 · 全职 AIGC 产品经理', note:guideContext+' 二线城市采用指南分组，包括苏州、杭州、南京等。', source:'randstad',
    rows:rows(['low','high'], [['北上广深',40000,80000],['指南所列二线城市',20000,60000]]) },
  { id:'hk-wages', region:'HK', topic:'place', option:'全港工资分布', title:'全港雇员月工资分布', period:'2025 年 5–6 月', unit:'month', keys:range5, primary:'median',
    population:'香港收入及工时按年统计调查中的雇员', note:'工资不含年终酬金；调查排除获豁免的学生实习人员、留宿家庭佣工及政府雇员。中间一半指工资在 P25 至 P75 之间的雇员。', source:'hkWage',
    rows:rows(range5,[['全港雇员',11000,15300,21200,33000,51300]]) },
  { id:'hk-districts', region:'HK', topic:'place', option:'十八区居住地中位数', title:'香港十八区职业收入', period:'2021 年人口普查', unit:'month', keys:['median'],
    population:'按居住地划分的工作人口 · 每月主要职业收入', note:'剔除无酬家庭从业员。居住地不等于工作地点；这是人口普查历史数据，不能用来判断某区今天的实习报价。', source:'hkDistricts',
    rows:[...hongKongDistricts.map(a=>row(a.area,['median'],[a.median],{group:'三大地区'})),...hongKongDistricts.flatMap(a=>a.districts.map(([district, v])=>row(district,['median'],[v],{group:a.area})))] },
  { id:'hk-intern', region:'HK', topic:'entry', option:'创科实习津贴', title:'创科实习计划津贴', period:'2026 年 4 月起', unit:'month', keys:['allowance'],
    population:'参加香港创科实习计划并符合条件的学生', note:'这是指定计划的资助标准。只有单位确认岗位参与该计划时才适用；全港实习工资均值、中位数均未由该来源给出。', source:'stem', rows:rows(['allowance'],[['计划内实习生',11790]]) },
  { id:'hk-grad', region:'HK', topic:'entry', option:'科大应届生收入', title:'香港科大毕业生月收入', period:'2025 届', unit:'month', keys:['median','mean'],
    population:'香港科大受访全职及自雇本科毕业生 · 按工作性质', note:'整份就业调查收到 2,353 份毕业生回复。收入表只覆盖适用受访者，含奖金、佣金及津贴，不代表所有香港毕业生。', source:'hkust', rows:rows(['median','mean'],graduateJobs) },
  { id:'hk-guide', region:'HK', topic:'role', option:'产品与运营招聘区间', title:'产品、运营与业务分析月薪', period:'2026 年指南', unit:'month', keys:['low','high'],
    population:'Adecco 香港招聘市场 · 全职岗位', note:guideContext, source:'adecco',
    rows:rows(['low','high'],[['IT 产品经理',45000,75000],['电商运营 · 2 年以上',20000,35000],['电商数据及业务分析 · 1–4 年',28000,42000]]) },
  { id:'hk-industries', region:'HK', topic:'role', option:'香港行业月薪中位数', title:'香港同行业雇员月薪', period:'2025 年 5–6 月', unit:'month', keys:['median'],
    population:'香港收入及工时调查 · 按雇主行业划分的雇员', note:'含基本工资及规定内的佣金、津贴和加班费，不含年终酬金。与岗位名称、资历无关；获豁免的学生实习人员不在样本内。', source:'hkIndustry',
    rows:rows(['median'],[['资讯及通讯',28600],['专业、科学及技术服务',28900],['金融及保险',34000],['进出口贸易',21400],['行政及支援服务',20000],['零售',15000]]) },
];

export const reportGroups = report => [...new Set(report.rows.map(r=>r.group).filter(Boolean))];
export const visibleRows = (report, group) => report.rows.filter(r=>!r.group || r.group===group);
export function resolveReport(region, id) {
  return reports.find(r=>r.region===region && r.id===id) || reports.find(r=>r.region===region) || reports[0];
}
// Preserve the question when changing region; the populations still have their own definitions.
export function counterpart(report,region) {
  if (report.region===region) return report;
  const pairs=[['cn-intern','hk-intern'],['cn-grad','hk-grad'],['cn-guide','hk-guide'],['industries','hk-industries'],['cities','hk-wages'],['bay','hk-wages']];
  const id=pairs.find(p=>p.includes(report.id))?.find(x=>x!==report.id);
  return reports.find(r=>r.region===region && r.id===id) || reports.find(r=>r.region===region && r.topic===report.topic) || resolveReport(region);
}
export function comparisonText(report, record, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const v = record.values;
  if (v.p25 != null && v.p75 != null) return amount < v.p25 ? '低于这个样本的 P25。' : amount > v.p75 ? '高于这个样本的 P75。' : '在这个样本中间 50% 的工资区间内。';
  if (v.low != null) return amount < v.low ? '低于指南列出的下限。' : amount > v.high ? '高于指南列出的上限。' : '在指南列出的招聘区间内。';
  if (report.keys[0] === 'private') return '可分别对照两类单位的平均工资；仅凭平均数不能判断百分位。';
  const key=report.primary || report.keys[0];
  const distance=Math.round(Math.abs(amount-v[key])*100)/100;
  return distance===0 ? '与样本的'+statLabel(key)+'相同。' : '比'+statLabel(key)+(amount<v[key]?'低 ':'高 ')+distance.toLocaleString('zh-CN')+' '+moneyUnit(report)+'。';
}
