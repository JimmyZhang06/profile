export const careerPages = {
  opportunities: '实习机会',
  offers: 'Offer 测算',
  market: '薪酬参考',
};

export function careerSectionForPath(path) {
  if (/^\/opportunities(?:\/[A-Za-z0-9_-]{1,128})*\/?$/.test(path)) return 'opportunities';
  if (/^\/offers\/?$/.test(path)) return 'offers';
  if (/^\/market\/?$/.test(path)) return 'market';
  return null;
}
