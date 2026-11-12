import { useContext, useMemo, useState } from 'react';
import { IconArrowRight, IconChartBar, IconTable, IconArrowUpRight, IconChevronDown } from '@tabler/icons-react';
import { Page } from '../../components/ui/index.jsx';
import { CurvedTabs } from '../../components/ui/CurvedTabs.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { WorkspaceLink } from '../../components/ui/WorkspaceLink.jsx';
import { PageNavigationContext } from '../../hooks/usePageNavigation.js';
import { readOfferDrafts } from '../offers/offerDrafts.mjs';
import { sources } from './marketData.js';
import { reports, topics, statLabel, moneyUnit, visibleRows, resolveReport, reportGroups, comparisonText, counterpart } from './marketReports.js';
import { referenceReturn } from './marketLinks.js';
import './market.css';

const regions = [{value:'CN',label:'中国内地'}, {value:'HK',label:'中国香港'}];
const format = new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2});
const n = v => format.format(v);
const axisLabel = v => v >= 10000 ? n(v/10000)+'万' : n(v);
const width = v => ({width:v+'%'});
const left = v => ({left:v+'%'});
const sourceLink = id => <a className="mk-source" href={sources[id][1]} target="_blank" rel="noopener noreferrer"><span>{sources[id][0]}</span><IconArrowUpRight size={14}/></a>;

function Plot({report, data, record, select, amount}) {
  const distribution=report.keys.includes('p25'), range=report.keys.includes('low'), main=report.primary||report.keys[0];
  const maximum=Math.max(...data.flatMap(r=>Object.values(r.values)),amount||0);
  const magnitude=10**Math.floor(Math.log10(maximum));
  const domain=Math.ceil(maximum/(magnitude/2))*(magnitude/2);
  const pct=v=>100*v/domain;
  function chooseKey(e,i) {
    if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
    const keys={ArrowDown:Math.min(data.length-1,i+1),ArrowUp:Math.max(0,i-1),Home:0,End:data.length-1};
    if (!(e.key in keys)) return;
    e.preventDefault(); const j=keys[e.key];select(data[j].label);
    e.currentTarget.parentNode.querySelectorAll('button')[j]?.focus();
  }
  return <div className="mk-figure" role="group" aria-label={report.title+'交互图表'}>
    <div className="mk-legend">{distribution ? <><span><i className="mk-swatch band"/>中间 50%（P25–P75）</span><span><i className="mk-swatch dot"/>中位数</span><span><i className="mk-swatch whisk"/>P10–P90</span></> :
      range ? <span><i className="mk-swatch band"/>指南下限至上限</span> :
      report.keys.map((key,i)=><span key={key}><i className={'mk-swatch s'+i}/>{statLabel(key)}</span>)}
      {amount>0 && <span><i className="mk-swatch mark"/>我的报价</span>}
    </div>
    <div className="mk-axis" aria-hidden="true"><span/><div>{[0,.25,.5,.75,1].map(x=><span key={x} style={left(x*100)}>{axisLabel(x*domain)}</span>)}</div><span/></div>
    <div className="mk-rows">{data.map((r,i)=>{
      const v=r.values, isSelected=record.label===r.label;
      return <button type="button" key={r.label} aria-pressed={isSelected} aria-label={r.label+'，'+report.keys.map(k=>statLabel(k)+' '+n(v[k])).join('，')+'，'+moneyUnit(report)}
        onClick={()=>select(r.label)} onKeyDown={e=>chooseKey(e,i)} className={'mk-row'+(isSelected?' is-current':'')}>
        <span className="mk-row-name">{r.label}</span>
        <span className="mk-track" aria-hidden="true">
          {distribution ? <><i className="mk-whisker" style={{...left(pct(v.p10)),...width(pct(v.p90-v.p10))}}/>
            <i className="mk-band" style={{...left(pct(v.p25)),...width(pct(v.p75-v.p25))}}/><i className="mk-median" style={left(pct(v.median))}/></> :
            range ? <i className="mk-range" style={{...left(pct(v.low)),...width(pct(v.high-v.low))}}/> :
            report.keys.map((k,j)=><i key={k} className={'mk-bar s'+j} style={width(pct(v[k]))}/>)}
          {amount>0 && <i className="mk-marker" style={left(pct(amount))}/>}
        </span>
        <span className="mk-row-value">{range ? n(v.low)+'–'+n(v.high) : n(v[main])}</span>
      </button>;
    })}</div>
    <p className="mk-foot">{range?'行末为指南范围':distribution?'行末为中位数':'行末为'+statLabel(main)} · {moneyUnit(report)}{data.length>1?'　点选一行查看明细':''}</p>
  </div>;
}
function Values({report, data, record, select}) {
  return <table className="mk-table" aria-label={report.title+'数据表'}><caption>{moneyUnit(report)} · {report.period}</caption>
    <thead><tr><th scope="col">样本</th>{report.keys.map(k=><th key={k} scope="col">{statLabel(k)}</th>)}</tr></thead>
    <tbody>{data.map(r=><tr key={r.label} className={record.label===r.label?'is-current':''}>
      <th scope="row"><button type="button" aria-pressed={record.label===r.label} onClick={()=>select(r.label)}>{r.label}</button></th>
      {report.keys.map(k=><td key={k} data-label={statLabel(k)}>{n(r.values[k])}</td>)}</tr>)}</tbody></table>;
}
function Inspector({report, record, amount, update, draft}) {
  const v=record.values, k=report.primary||report.keys[0], range=k==='low';
  const quartiles=v.p25!=null && v.p75!=null;
  const hasQuote=draft?.salary>0;
  const suitable=hasQuote && draft.region===report.region && draft.unit===report.unit && draft.currency===(report.region==='HK'?'HKD':'CNY') &&
    (draft.kind==='internship' ? ['cn-intern','hk-intern'].includes(report.id) : ['cn-guide','hk-guide'].includes(report.id));
  return <aside className="mk-inspector" aria-label="所选样本详情">
    <div className="mk-readout" aria-live="polite"><div className="mk-detail-title">{record.label} <span> / {range?'招聘区间':statLabel(k)}</span></div>
      <strong className={'mk-number'+(range?' is-range':'')}>{n(v[k])}{range?'–'+n(v.high):''}</strong><span className="mk-unit">{moneyUnit(report)}</span>
      {quartiles && <p className="mk-typical">中间一半（P25–P75）<strong>{n(v.p25)}–{n(v.p75)} <small>{moneyUnit(report)}</small></strong></p>}
      {report.keys.length>1 && !range && <dl className="mk-stats">{report.keys.filter(key=>key!==k && !(quartiles && ['p25','p75'].includes(key))).map(key=><div key={key}><dt>{statLabel(key)}</dt><dd>{n(v[key])}</dd></div>)}</dl>}
    </div>
    <p className="mk-note">{report.note}</p>{sourceLink(record.source||report.source)}
    <details className="mk-compare" onToggle={e=>{if(!e.currentTarget.open)update('');}}>
      <summary>在图上对照我的报价 <IconChevronDown size={15}/></summary>
      <label>同口径金额（{moneyUnit(report)}）<input type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" value={amount}
        onChange={e=>update(e.target.value)} placeholder="输入报价"/></label>
      {suitable && <button type="button" className="mk-text-action" onClick={()=>update(String(draft.salary))}>使用当前方案报价 · {n(draft.salary)}</button>}
      <p role="status">{amount!=='' && !(Number(amount)>0 && Number(amount)<=1e9)?'请填写大于零且不超过十亿的金额。':comparisonText(report,record,Number(amount))||(hasQuote && !suitable?'本图与方案的币种、计薪周期或收入口径不同。可手动输入同口径金额。':'按本图的币种、周期和收入口径填写。只在此处对照，不修改 Offer。')}</p>
    </details>
  </aside>;
}
function ReportView({report, group, changeGroup, draft}) {
  const [choice, setChoice]=useState(''), [view,setView]=useState('chart'), [amount,setAmount]=useState('');
  const groups=reportGroups(report), data=visibleRows(report,group);
  const record=data.find(r=>r.label===choice)||data[0];
  return <div className="mk-layout"><section className="mk-chart" aria-label="薪酬报告">
    <header className="mk-head"><div><p className="mk-kicker">{report.period} <span> / </span> {moneyUnit(report)}</p><h2>{report.title}</h2></div>
      <div className="mk-view" role="group" aria-label="展示形式">{[['chart','图表',IconChartBar],['table','数据表',IconTable]].map(([v,label,Icon])=><button key={v} type="button" title={label} aria-label={label} aria-pressed={view===v} onClick={()=>setView(v)}><Icon size={17}/></button>)}</div>
    </header>
    <p className="mk-population">{report.population}</p>
    {groups.length>0 && <div className="mk-subgroup"><SelectField label={report.id==='hk-districts'?'居住地区':'对比行业'} options={groups.map(x=>({value:x,label:x}))} value={group} onChange={changeGroup} viewportMenu/></div>}
    {view==='chart'?<Plot report={report} data={data} record={record} select={setChoice} amount={Number(amount)>0&&Number(amount)<=1e9?Number(amount):0}/>:<Values report={report} data={data} record={record} select={setChoice}/>}
  </section><Inspector report={report} record={record} amount={amount} update={setAmount} draft={draft}/></div>;
}
export default function MarketPage({ route, onBack, account }) {
  const { openLink }=useContext(PageNavigationContext), query=route.searchParams;
  const region=query.get('region')==='HK'?'HK':'CN', report=resolveReport(region,query.get('report'));
  const groups=reportGroups(report), group=groups.includes(query.get('group'))?query.get('group'):groups[0];
  const available=reports.filter(r=>r.region===region && r.topic===report.topic);
  const owner=account?.user?.id||account?.owner?.id||'guest';
  const fromOffer=query.get('from')==='offer';
  const snapshot=useMemo(()=>fromOffer&&!account?.loading?readOfferDrafts(localStorage,owner):null,[fromOffer,owner,account?.loading]);
  const back=referenceReturn(query);
  const contextual=fromOffer||back.href.startsWith('/opportunities/');
  function show(next, nextGroup) {
    const params=new URLSearchParams({region:next.region,report:next.id});
    if(nextGroup)params.set('group',nextGroup);
    if(query.get('from')==='offer')params.set('from','offer');
    if(back.href.startsWith('/opportunities/'))params.set('job',query.get('job'));
    openLink('/market?'+params,true);
  }
  return <Page title="薪酬参考" description="按地区和人群查看工资水平，再与同口径的报价对照。" className="career-page market-page"
    onBack={contextual?()=>openLink(back.href,true):onBack} backLabel={contextual?back.label:undefined}
    actions={!contextual && <WorkspaceLink className="button button-secondary" href={back.href}>{back.label} <IconArrowRight size={15}/></WorkspaceLink>}
    navigation={<CurvedTabs id="market" label="选择薪酬参考地区" items={regions} value={region} onChange={v=>show(counterpart(report,v))}/>}>
    <div role="tabpanel" id={'market-'+region+'-panel'} aria-labelledby={'market-'+region+'-tab'}>
      <div className="mk-tools"><div className="mk-topics" role="group" aria-label="查看哪类薪酬">{topics.map(t=><button type="button" key={t.id} aria-pressed={t.id===report.topic}
        onClick={()=>{if(t.id!==report.topic)show(reports.find(r=>r.region===region && r.topic===t.id));}}>{t.name}</button>)}</div>
        {available.length>1 && <SelectField label="数据集" value={report.id} options={available.map(r=>({value:r.id,label:r.option}))} onChange={v=>show(resolveReport(region,v))} viewportMenu/>}
      </div>
      <ReportView key={owner+':'+report.id} report={report} group={group} changeGroup={v=>show(report,v)} draft={snapshot?.plans?.[snapshot?.active===1?1:0]}/>
    </div>
  </Page>;
}
