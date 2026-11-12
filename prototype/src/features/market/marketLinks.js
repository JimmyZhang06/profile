// Only public context belongs in a reference link. The private amount never travels in a URL.
export function salaryReferenceLink({ region, kind, origin, posting }) {
  const hk = region === 'HK';
  const params = new URLSearchParams({ region: hk ? 'HK' : 'CN' });
  if (kind === 'internship') params.set('report', hk ? 'hk-intern' : 'cn-intern');
  if (origin === 'offer') params.set('from', 'offer');
  if (origin === 'job' && /^[\w-]{1,128}$/.test(posting || '')) params.set('job', posting);
  return '/market?' + params;
}
export function referenceReturn(params) {
  const job=params.get('job');
  if (job && /^[\w-]{1,128}$/.test(job)) return {href:'/opportunities/'+job,label:'返回岗位'};
  return {href:'/offers',label:params.get('from')==='offer'?'返回我的方案':'录入我的 Offer'};
}
