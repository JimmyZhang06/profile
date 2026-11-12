// Survey amounts retain the publisher's currency, pay interval and population.
export const sources = {
  szSurvey: ['深圳市人力资源和社会保障局 · 工资价位，分行业表', 'https://www.sz.gov.cn/attachment/1/1703/1703629/12735140.pdf'],
  gzSurvey: ['广州市人力资源和社会保障局 · 工资价位，分行业表', 'https://rsj.gz.gov.cn/attachment/7/7952/7952736/10619688.pdf'],
  mohrss: ['人力资源社会保障部 · 2025 年企业薪酬调查，表 1-3', 'https://www.mohrss.gov.cn/SYrlzyhshbzb/laodongguanxi_/fwyd/202607/t20260708_579822.html'],
  beijing: ['北京市人社局 · 2025 年四季度薪酬数据（首都之窗）', 'https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202601/t20260110_4416782.html'],
  nbs: ['国家统计局 · 2025 年城镇单位工资统计', 'https://www.stats.gov.cn/sj/zxfbhjd/202605/t20260515_1963707.html'],
  ciic: ['中智咨询 · 2025 年应届生招聘和薪酬管理趋势调研', 'https://www.ciicmc.com.cn/resource-report/208.html'],
  randstad: ['任仕达 · 2026 中国大陆薪酬指南', 'https://www.randstad.cn/s3fs-media/cn/public/2026-01/full_report-en-_2026_market_outlook_salary_guide.pdf?VersionId=wvyisfRjiKNRbC4JBvuqe0C_5_ovbrx3'],
  adecco: ['Adecco · 2026 香港薪酬指南', 'https://image.marketing.info.adecco.com/lib/fe32117175640474731478/m/1/044fa74e-de92-456e-b352-a498fecd27fa.pdf'],
  shenzhen: ['深圳市统计局', 'https://www.sz.gov.cn/cn/xxgk/zfxxgj/tjsj/tjgb/content/mpost_12907800.html'],
  guangzhou: ['广州市统计局', 'https://tjj.gz.gov.cn/zzfwzq/tjgb/content/post_10894735.html'],
  zhengzhou: ['郑州市统计局', 'https://tjj.zhengzhou.gov.cn/tjxx/10196049.jhtml'],
  chongqing: ['重庆市统计局', 'https://tjj.cq.gov.cn/zwgk_233/fdzdgknr/tjxx/sjzl_55471/tjgb_55472/202606/t20260618_15762815.html'],
  shenyang: ['沈阳市统计局', 'https://tjj.shenyang.gov.cn/sjfb/sqfx/202607/t20260716_5057852.html'],
  xian: ['西安市统计局 · 2025 年城镇单位工资', 'https://tjj.xa.gov.cn/tjsj/tjsj/ndsj/2025/2084099188928344065.html'],
  jiangsu: ['江苏省统计局 · 2025 年城镇单位工资', 'https://tj.jiangsu.gov.cn/art/2026/6/24/art_87595_11794085.html'],
  fujian: ['福建省统计局 · 2025 年城镇单位工资', 'https://tjj.fj.gov.cn/xxgk/tjxx/gzqk/202606/t20260617_7164491.htm'],
  hunan: ['湖南省统计局 · 2025 年城镇单位工资', 'https://tjj.hunan.gov.cn/hntj/tjgz/mthntj/202607/t20260708_34021939.html'],
  hkWage: ['香港政府统计处 · 2025 年收入及工时按年统计调查', 'https://www.info.gov.hk/gia/general/202603/23/P2026032300370.htm'],
  hkIndustry: ['香港政府统计处 · 收入及工时调查，表 2', 'https://gia.info.gov.hk/general/202603/23/P2026032300370_536894_1_1774250264080.pdf'],
  hkust: ['香港科技大学 · 2025 届本科毕业生就业调查，表 7–9', 'https://career.hkust.edu.hk/web/public/documents/SurveyFindings_UG_2025.pdf'],
  stem: ['香港创新科技署 · 创科实习计划', 'https://www.itf.gov.hk/en/support-measures/stem-internship-scheme/index.html'],
  hkDistricts: ['香港政府统计处 · 人口普查表 C201c（CSV）', 'https://www.census2021.gov.hk/data/static_file/en/Table%20C201c.csv'],
};

// First numeric column is private-sector units, second is non-private-sector units.
export const mainlandRegions = [
  ['东部', 80149, 149902], ['中部', 58627, 102645],
  ['西部', 60923, 114989], ['东北', 54430, 103803], ['全国', 71590, 129441],
];
export const mainlandIndustries = [
  ['信息传输、软件和信息技术服务', 128166, 248752], ['金融', 140451, 211164],
  ['科学研究和技术服务', 83560, 182064], ['制造', 76055, 113594],
];
export const mainlandCities = [
  { city: '深圳', privateWage: 99220, nonPrivateWage: 191367, source: 'shenzhen' },
  { city: '广州', privateWage: 86259, nonPrivateWage: 166790, source: 'guangzhou' },
  { city: '郑州', privateWage: 60104, nonPrivateWage: 111465, source: 'zhengzhou' },
  { city: '重庆', privateWage: 66197, nonPrivateWage: 121162, source: 'chongqing' },
  { city: '西安', privateWage: 66649, nonPrivateWage: 130904, source: 'xian' },
  { city: '沈阳', privateWage: 59564, nonPrivateWage: 118431, source: 'shenyang' },
];
// HKUST table 9: median and arithmetic mean of gross monthly income, in that order.
export const graduateJobs = [
  ['全体受访就业毕业生', 23267, 27795], ['系统分析与编程', 23000, 26626],
  ['行政与管理', 23863, 26725], ['工程', 24917, 24417],
  ['银行与金融', 33334, 42548], ['会计、审计与税务', 20200, 20979],
];
export const hongKongDistricts = [
  { area: '香港岛', median: 19800, districts: [['中西区', 21250], ['湾仔', 21000], ['东区', 19000], ['南区', 17000]] },
  { area: '九龙', median: 16500, districts: [['油尖旺', 18000], ['深水埗', 16000], ['九龙城', 18000], ['黄大仙', 16000], ['观塘', 16000]] },
  { area: '新界', median: 18000, districts: [['葵青', 16000], ['荃湾', 20000], ['屯门', 17500], ['元朗', 17800], ['北区', 16000], ['大埔', 18000], ['沙田', 18500], ['西贡', 20000], ['离岛', 18000]] },
];
