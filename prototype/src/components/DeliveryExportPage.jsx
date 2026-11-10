import {useEffect, useMemo, useState} from 'react';
import {IconAlertCircle, IconArrowRight, IconCheck, IconDownload, IconEye, IconPrinter, IconArrowBackUp} from '@tabler/icons-react';
import {Page, Button} from './ui/index.jsx';
import {deliveryChecks, nextPageAdjustment} from '../lib/delivery.js';
import {getResumeDesign} from '../lib/resumeDesign.js';
import {visibleRecords} from '../lib/profile.js';
import {requirementReview, reviewFields} from '../lib/deliveryReview.js';
import {downloadFile, fieldLabel, fieldValue, proposalState, toMarkdown} from '../lib/workspace.js';
import {DeliveryPreview, DeliveryPrint} from './DeliveryPreview.jsx';
import {DeliveryProofread} from './DeliveryProofread.jsx';
import {DeliverySteps} from './DeliverySteps.jsx';

function DeliveryEvidence({doc, onLocate}) {
  const plan = doc.delivery;
  if (!plan) return null;
  const {resume} = doc;
  const visible = new Set(reviewFields(resume).map((option) => option.paperField));
  const included = [
    ...visibleRecords(resume, 'workEntries').map((e) => e.organization || e.title),
    ...resume.projectIds.map((id) => resume.sources.find((p) => p.id === id)?.name),
    ...visibleRecords(resume, 'researchEntries').map((e) => e.organization || e.title),
  ].filter(Boolean);
  return <section className="delivery-reasoning">
    <h2>{plan.mode === 'model' ? '岗位要求与原文依据' : '本地选材结果'}</h2>
    {plan.modelLabel && <p className="quiet-note">生成来源 · {plan.modelLabel}</p>}
    {plan.considered && <p className="quiet-note">比较了 {plan.considered.projects} 个项目和 {plan.considered.work + plan.considered.research} 段实习或研究。{included.length ? '当前收录' + included.join('、') + '。' : ''}</p>}
    {doc.revision > 0 && <p className="quiet-note">以下依据记录于生成时，请与当前正文核对。</p>}
    {plan.requirements.map((item, i) => {
      const result = requirementReview(resume, plan, item, visible);
      return <details key={i}><summary>{item.requirement}<small className="delivery-proof-state">{result.label}</small></summary>
        {item.evidence.map((e, j) => <blockquote key={j}><small>{e.label}</small>{e.quote}</blockquote>)}
        <Button variant="ghost" onClick={() => onLocate(result.field)}>{result.field === 'experiences' ? '调整展示的经历' : '定位到正文'}<IconArrowRight size={14} /></Button>
      </details>;
    })}
    {plan.gaps.length > 0 && <div className="delivery-gaps"><h3>需要本人核实</h3><ul>{plan.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></div>}
    {!!plan.changes.length && <details><summary>逐条核对改写与原文</summary>{plan.changes.map((c) =>
      <section className="delivery-change" key={c.field}><h3>{fieldLabel(resume, c.field)}</h3>
        <p>{visible.has(c.field) ? fieldValue(resume, c.field) || '当前正文为空' : '本稿未展示这段经历'}</p>
        {c.evidence.map((e, i) => <blockquote key={i}><small>{e.label}</small>{e.quote}</blockquote>)}
      </section>)}</details>}
  </section>;
}

const stepNames = {compact:'精简措辞', spacing:'收紧间距', type:'正文调整为 10.5 pt'};

export function DeliveryExportPage({doc, onBack, onTailor, onSave, onUndo, notify}) {
  const [step, setStep] = useState(2), [paperOnly, setPaperOnly] = useState(false);
  const [working, setWorking] = useState(null), [measurement, setMeasurement] = useState(null);
  const [field, setField] = useState('summary'), [jump, setJump] = useState(null);
  const [fitSteps, setFitSteps] = useState(null), [feedback, setFeedback] = useState('');
  const [reviewed, setReviewed] = useState(null);
  const resume = working?.resume ?? doc.resume, design = getResumeDesign(resume);
  const current = measurement?.resume === resume ? measurement : null;
  const busy = fitSteps !== null;
  const verified = !working && reviewed?.resume === doc.resume && reviewed?.job === doc.job;
  const issues = useMemo(() => [
    ...(doc.example ? [{target:'materials', message:'当前含虚构示例，请换用自己的资料生成正式投递稿'}] : []),
    ...deliveryChecks(resume, current, doc.job),
  ], [resume, current, doc.job, doc.example]);
  const pending = doc.messages.flatMap((m) => (m.proposals || []).filter((p) =>
    !m.dismissed?.includes(p.id) && proposalState(doc, p) === 'pending')).length;

  useEffect(() => {
    if (!fitSteps || !current) return;
    const next = current.overflow && nextPageAdjustment(resume, doc.delivery?.changes, fitSteps);
    if (next) {
      setWorking((old) => ({base: old?.base ?? doc.resume, resume: next.resume}));
      setFitSteps([...fitSteps, next.step]);
      return;
    }
    const adjustments = fitSteps.map((s) => stepNames[s]).join('、');
    setFeedback((adjustments ? '已' + adjustments + '。' : '') + (current.overflow
      ? '请继续缩短正文或取消展示一段相关性较低的经历。' : '当前内容已在一页范围内。'));
    setFitSteps(null);
  }, [fitSteps, current, resume, doc.resume, doc.delivery]);

  function change(next) {
    if (next === resume) return;
    setReviewed(null);
    setFeedback('');
    setWorking((old) => ({base: old?.base ?? doc.resume, resume: next}));
  }
  function save() {
    if (!working) return true;
    if (!onSave(working.resume, working.base)) {
      setFeedback('当前简历已有其他修改。本页的校稿还在，可以复制文字，或放弃本次调整后载入最新稿。');
      return false;
    }
    setWorking(null);
    setFeedback('已保存到当前简历。');
    return true;
  }
  function showStep(next) {
    if (busy) return;
    if (next === 1) { onTailor(); return; }
    if (next === 3 && !save()) return;
    setPaperOnly(false);
    setStep(next);
  }
  function locate(key) {
    if (key === 'materials') { onTailor(); return; }
    const area = key === 'fit' || key === 'layout' ? 'layout' : key === 'experiences' ? 'experiences' : 'field';
    setStep(2);
    setPaperOnly(false);
    if (area === 'field') setField(key);
    setJump({area});
  }
  function print() {
    if (!current || !verified) return;
    const previous = document.title;
    document.title = [doc.resume.name, doc.job.company, doc.job.title].filter(Boolean).join('_') || doc.title;
    window.addEventListener('afterprint', () => { document.title = previous; }, {once:true});
    window.print();
  }
  const status = !current ? '正在测量 A4 排版…' : current.overflow
    ? '超出一页约 ' + Math.ceil(current.overflowMm) + ' mm'
    : issues.length ? '一页范围内 · 有待核对项' : 'A4 一页预检通过';
  return <Page title="投递预览" description={doc.job.title ? [doc.job.company, doc.job.title].filter(Boolean).join(' · ') : doc.title}
    className={'page-wide delivery-export-page delivery-view-' + (paperOnly ? 'preview' : 'checks')}
    onBack={onBack} dirty={!!working || busy} navigation={<DeliverySteps current={step} onStep={showStep} busy={busy} />}
    footer={<>
      {step === 2 && working ? <Button variant="ghost" disabled={busy} onClick={() => {
        setWorking(null); setFeedback('已回到上次保存的文稿。'); setReviewed(null);
      }}>放弃本次调整</Button> : <Button variant="ghost" disabled={busy} onClick={step === 3 ? () => showStep(2) : onBack}>{step === 3 ? '返回校稿' : '返回编辑器'}</Button>}
      <div className="page-action-group">
        {step === 2 && working && <Button variant="secondary" disabled={busy} onClick={save}>保存调整</Button>}
        {step === 2 ? <Button disabled={!current || busy} onClick={() => showStep(3)}>{working ? '保存并核对' : '核对与导出'}<IconArrowRight size={16} /></Button>
          : <Button disabled={!verified || !current} onClick={print}><IconPrinter size={17} />{issues.length ? '保存草稿 PDF' : '保存为 PDF'}</Button>}
      </div>
    </>}>
    <div className="delivery-paper-switch">
      <Button variant="secondary" disabled={busy} onClick={() => setPaperOnly(!paperOnly)}><IconEye size={16} />{paperOnly ? (step === 2 ? '返回校稿工具' : '返回投递检查') : '查看 A4 纸面'}</Button>
    </div>
    <div className="delivery-review-layout">
      <aside className="delivery-checks">
        <section className="delivery-status" role="status">
          {current && !issues.length ? <IconCheck size={21} /> : <IconAlertCircle size={21} />}
          <div><strong>{status}</strong><p>{design.fontSize} pt 正文 · {design.margin} mm 页边距</p>
            {!!current?.overflowSections?.length && <p>越过页底的部分 · {current.overflowSections.join('、')}</p>}
          </div>
        </section>
        {!!issues.length && <ul className="delivery-action-issues">{issues.map(({target,message}) =>
          <li key={message}><button type="button" disabled={busy} onClick={() => locate(target)}><span>{message}</span><IconArrowRight size={15} /></button></li>)}</ul>}
        {step === 2 ? <>
          {current?.overflow && <Button variant="secondary" disabled={busy} onClick={() => {setReviewed(null); setFitSteps([]);}}>
            {busy ? '正在适配…' : '一键适配一页'}
          </Button>}
          <div className="delivery-panel-title"><h2>调整当前投递稿</h2>
            {!!doc.undo.length && !working && <Button variant="ghost" disabled={busy} onClick={() => {onUndo(); setReviewed(null); setFeedback('已撤销上一次修改。');}}><IconArrowBackUp size={15} />撤销</Button>}
          </div>
          <DeliveryProofread doc={doc} resume={resume} field={field} jump={jump} busy={busy} onField={setField}
            onChange={change} onTailor={onTailor} onError={setFeedback} />
          {(feedback || working || busy) && <p className="quiet-note delivery-feedback" role="status">{busy ? '正在按纸面高度重新测量…' : feedback || '正在预览本次调整，保存后写入当前简历。'}</p>}
        </> : <>
          <DeliveryEvidence doc={doc} onLocate={locate} />
          {!!pending && <p className="quiet-note">还有 {pending} 条聊天建议未采用，PDF 使用当前文稿。</p>}
          <label className="delivery-confirm"><input type="checkbox" checked={verified} onChange={(e) => setReviewed(e.target.checked ? {resume:doc.resume, job:doc.job} : null)} />
            <span>我已核对经历、数字、个人贡献和联系方式。</span></label>
          <p className="quiet-note">选择系统打印里的“另存为 PDF”，纸张选 A4、缩放 100%，关闭页眉页脚。请核对打印预览的页数。</p>
          <Button variant="ghost" onClick={() => {downloadFile(doc.title + '.md', toMarkdown(doc), 'text/markdown;charset=utf-8'); notify('已发起文字版下载');}}>
            <IconDownload size={16} />下载文字版
          </Button>
        </>}
      </aside>
      <section className="delivery-preview-column" aria-label="A4 投递预览">
        <div className="delivery-preview-label"><span>{step === 2 ? '点正文即可校改' : '投递纸面'}</span><span>A4 · 210 × 297 mm</span></div>
        <DeliveryPreview resume={resume} onMeasure={setMeasurement} onPick={step === 2 && !busy ? locate : undefined} />
      </section>
    </div>
    <DeliveryPrint resume={resume} />
  </Page>;
}
