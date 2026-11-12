import test from 'node:test';
import assert from 'node:assert/strict';
import { reports, comparisonText, resolveReport, reportGroups, visibleRows, counterpart } from '../src/features/market/marketReports.js';
import { sources } from '../src/features/market/marketData.js';
import { salaryReferenceLink, referenceReturn } from '../src/features/market/marketLinks.js';
import { offerQuestions, baseMonthIllustration, employerQuestions } from '../src/features/offers/offerQuestions.mjs';

test('every published figure is attributable, comparable within its slice and missing percentiles stay absent',()=>{
  assert.equal(new Set(reports.map(r=>r.id)).size,reports.length);
  for(const r of reports){
    assert.ok(r.population && r.period && ['year','month','day'].includes(r.unit));
    for(const group of reportGroups(r).length ? reportGroups(r) : [undefined]){
      const data=visibleRows(r,group);
      assert.equal(new Set(data.map(d=>d.label)).size,data.length);
      for(const d of data){
        assert.match(sources[d.source||r.source][1],/^https:\/\//);
        assert.deepEqual(Object.keys(d.values),r.keys);
        const values=Object.values(d.values);assert.ok(values.every(v=>Number.isFinite(v)&&v>0));
        if(r.keys.includes('p10') || r.keys.includes('low'))assert.deepEqual(values,[...values].sort((a,b)=>a-b));
      }
    }
  }
  assert.equal(resolveReport('HK','cities').region,'HK');
  assert.equal(resolveReport('CN','cn-intern').rows[0].values.median,undefined);
  assert.equal(resolveReport('HK','hk-intern').rows[0].values.mean,undefined);
  assert.equal(resolveReport('HK','hk-districts').rows.filter(r=>r.group!=='三大地区').length,18);
  assert.equal(counterpart(resolveReport('CN','cn-grad'),'HK').id,'hk-grad');
  assert.equal(counterpart(resolveReport('HK','hk-industries'),'CN').id,'industries');
});
test('a typical range only comes from quartiles, not a mean or recruiting endpoints',()=>{
  const g=resolveReport('CN','bay'), city=g.rows[0];
  assert.match(comparisonText(g,city,city.values.p25),/中间 50%/);
  assert.match(comparisonText(g,city,city.values.p75+1),/高于.*P75/);
  const mean=resolveReport('CN','cities'); assert.match(comparisonText(mean,mean.rows[0],100000),/不能判断百分位/);
  const guide=resolveReport('HK','hk-guide'); assert.match(comparisonText(guide,guide.rows[0],50000),/指南/);
});
test('job and offer links preserve intent without copying a private amount or accepting arbitrary destinations',()=>{
  const path=salaryReferenceLink({region:'HK',kind:'internship',origin:'job',posting:'verified-42',salary:18888});
  const url=new URL(path,'https://example.test');assert.deepEqual([...url.searchParams.keys()],['region','report','job']);
  assert.equal(url.searchParams.get('report'),'hk-intern');assert.equal(referenceReturn(url.searchParams).href,'/opportunities/verified-42');
  assert.equal(referenceReturn(new URLSearchParams('job=https://elsewhere.test')).href,'/offers');
});
test('repeated payroll questions keep exact non-contiguous months and distinguish tax and contributions',()=>{
  const result=offerQuestions(['2025-12 个人缴费待确认','2026-01 个人缴费待确认','2026-03 个人缴费待确认','2026-03 单位预计扣税待确认','一次性条款']);
  assert.equal(result.length,3);assert.deepEqual(result[0],{text:'个人缴费待确认',period:'2025-12 至 2026-01、2026-03',section:'contributions'});
  assert.equal(result[1].section,'tax');
  const payroll=offerQuestions(['薪俸税预留按归属期估计，非每月工资代扣','2026/27 薪俸税：请补齐该课税年度收入','2026-07 单位强积金待确认']);
  assert.equal(payroll[0].section,null);
  assert.deepEqual(employerQuestions(payroll),['（2026-07）单位每月承担的强积金金额是多少？']);
  assert.equal(baseMonthIllustration({unit:'day',salary:220,days:12}),264000);
  for(const p of [{unit:'day',salary:220,days:null},{unit:'day',salary:220,days:32},{unit:'year',salary:240000}])assert.equal(baseMonthIllustration(p),null);
});
