// Keep the original wording and the exact affected months, but ask each question once.
function monthRuns(months) {
  const spans=[];
  for (const month of [...new Set(months)].sort()) {
    const [year,m]=month.split('-').map(Number), ix=year*12+m-1, last=spans.at(-1);
    if(last && last.ix+1===ix){last.end=month;last.ix=ix;} else spans.push({start:month,end:month,ix});
  }
  return spans.map(s=>s.start===s.end?s.start:s.start+' 至 '+s.end).join('、');
}
function destination(text) {
  if (/薪俸税预留按归属期估计/.test(text)) return null;
  if (/单位预计扣税|累计预扣|全年一次性奖金资格|个税|薪俸税|课税|税前可扣|扣税额/.test(text)) return 'tax';
  if (/缴费|公积金|强积金|医保/.test(text)) return 'contributions';
  if (/出勤/.test(text)) return 'days';
  if (/实际报价|实际月薪/.test(text)) return 'salary';
  if (/支付日|非整月|试用期按自然日/.test(text)) return 'monthly';
  return null;
}
export function offerQuestions(issues) {
  const grouped=new Map();
  for(const issue of issues){
    const match=/^(\d{4}-(?:0[1-9]|1[0-2]))\s+(.+)$/u.exec(issue), text=match?.[2]||issue;
    if(!grouped.has(text))grouped.set(text,[]);
    if(match)grouped.get(text).push(match[1]);
  }
  return [...grouped].map(([text,months])=>({text,period:monthRuns(months),section:destination(text)}));
}
// Payroll can clarify contractual terms; tax planning and personal annual income stay private.
export function employerQuestions(grouped) {
  const lines=[];
  for(const {text,period} of grouped){
    let ask;
    if (/个人缴费待确认/.test(text)) ask='每月由个人承担的缴费项目和金额是多少？';
    else if (/单位(强积金|公积金)待确认/.test(text)) ask='单位每月承担的'+(text.includes('强积金')?'强积金':'公积金')+'金额是多少？';
    else if (/强积金规则|强积金供款期|额外薪酬的强积金/.test(text)) ask='这段期间的强积金按什么基数和期间计算？';
    else if (/医保基数/.test(text)) ask='医疗保险的缴费基数和档次如何确定？';
    else if (/预计出勤/.test(text)) ask='约定日薪是多少，哪些出勤日计薪？';
    else if (/实际报价|实际月薪/.test(text)) ask='约定的税前固定月薪或日薪是多少？';
    else if (/非整月|试用期按自然日/.test(text)) ask='试用期或非整月的工资如何折算？';
    else if (/单位预计扣税/.test(text)) ask='单位预计代扣的税额是多少？';
    else if (/发放日期待确认/.test(text)) ask='请确认'+text.split(/\s+(?:金额及)?发放日期/)[0]+'的金额和发放日期。';
    if(ask)lines.push((period?'（'+period+'）':'')+ask);
  }
  return [...new Set(lines)];
}
// A monthly illustration without a start date is deliberately independent of annual payroll.
export function baseMonthIllustration(plan) {
  if (typeof plan.salary!=='number'||!Number.isFinite(plan.salary)||plan.salary<=0) return null;
  if (plan.unit==='month') return Math.round(plan.salary*100);
  if (plan.unit==='day' && Number.isFinite(plan.days)&&plan.days>0&&plan.days<=31) return Math.round(Math.round(plan.salary*100)*plan.days);
  return null;
}
