import {useEffect, useMemo, useRef, useState} from 'react';
import {IconCheck, IconArrowRight} from '@tabler/icons-react';
import {Button, Page} from './ui/index.jsx';
import {AssistantIdentity} from './AssistantIdentity.jsx';
import {ResumeDocument} from './ResumeDocument.jsx';
import {DeliveryPreview} from './DeliveryPreview.jsx';
import {DeliveryProofread} from './DeliveryProofread.jsx';
import {assembleDelivery, finalizeDelivery} from '../lib/delivery.js';
import {composePage, paperOutline, paperWording, writingPaper} from '../lib/deliveryComposition.js';
import {refitDelivery, runDelivery} from '../lib/assistant.js';
import {createTypewriter} from '../lib/typewriter.js';
import {fieldLabel} from '../lib/workspace.js';
import {useMediaQuery} from '../hooks/useMediaQuery.js';

const stages = ['预留版面', '对照岗位选材', '逐段成稿', '检查一页排版'];
const mobileStages = ['留出版面', '筛选经历', '逐段成稿', '检查一页'];

export function DeliveryGeneration({run, onCancel, onReady, onError}) {
  const {prepared, connectionId} = run;
  const local = connectionId === 'offline';
  const narrow = useMediaQuery('(max-width: 760px)');
  const source = prepared.seed.resume;
  const outline = useMemo(() => paperOutline(source), [source]);
  const [space,setSpace] = useState(null), [phase,setPhase] = useState(0);
  const [status,setStatus] = useState('正在测量页首与教育背景。');
  const [live,setLive] = useState(null), [candidate,setCandidate] = useState(null);
  const [skipped,setSkipped] = useState(false), skip = useRef(false);
  const manuscript = useRef(null), follow = useRef(true), lastFollow = useRef(0);
  const [repair,setRepair] = useState(false), [room,setRoom] = useState(null);
  const [field,setField] = useState('summary'), [jump,setJump] = useState(null);
  const task = useRef(null), current = useRef(null), pass = useRef({tried:[]}), done = useRef(false);
  const refit = useRef(null);
  const callbacks = useRef({});
  callbacks.current = {onError,onReady};
  useEffect(() => {
    const scroller = manuscript.current?.closest('.page-scroll');
    if (!scroller) return;
    const takeControl = () => {follow.current = false;};
    const key = (e) => {if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key)) takeControl();};
    scroller.addEventListener('wheel',takeControl,{passive:true});
    scroller.addEventListener('touchmove',takeControl,{passive:true});
    scroller.addEventListener('keydown',key);
    return () => {scroller.removeEventListener('wheel',takeControl);scroller.removeEventListener('touchmove',takeControl);scroller.removeEventListener('keydown',key);};
  }, []);
  useEffect(() => {
    if (phase !== 2 || skipped || !follow.current || !live || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const now = performance.now();
    if (now - lastFollow.current < 220) return;
    lastFollow.current = now;
    const caret = manuscript.current?.querySelector('[data-writing] .resume-text-line:last-child');
    const scroller = manuscript.current?.closest('.page-scroll');
    if (caret && scroller) {
      const distance = caret.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom + 24;
      if (distance > 0) scroller.scrollTop += distance;
    }
  }, [live,phase,skipped]);

  useEffect(() => {
    if (!space) return;
    const abort = new AbortController();
    task.current = abort;
    const items = [], seen = new Set();
    let text = '';
    const writer = createTypewriter({signal:abort.signal,
      reducedMotion:() => skip.current || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches,
      onText:(shown) => {
        if (abort.signal.aborted) return;
        const currentItem = items.find((item) => item.end >= shown.length);
        setLive({resume:writingPaper(outline,source,items,shown.length), field:currentItem?.field});
      }});
    function append(item) {
      if (abort.signal.aborted || seen.has(item.field) || !item.text) return;
      seen.add(item.field);
      text += item.text;
      items.push({field:item.field, text:item.text, end:text.length});
      setPhase(2);
      writer.push(text,true);
    }
    async function generate() {
      if (space.lines < 6) throw new Error('页首与教育信息已占去大部分版面。请在「完善资料」中精简页首或调整带入的教育记录，再开始生成。');
      setPhase(1);
      setStatus(local ? '正在从本机资料选择相关原文。' : '正在比较候选经历与岗位要求。');
      const plan = await runDelivery({...run, paperSpace:space, signal:abort.signal, onField:append,
        onText:(message) => { if (!abort.signal.aborted) { setStatus(message); if (message.includes('改写正文')) setPhase(2); } }});
      abort.signal.throwIfAborted();
      if (!plan.projectIds.length && !plan.workIds.length && !plan.researchIds.length) throw new Error('当前素材没有可写入的具体经历。请先补充自己的行动或交付成果。');
      const draft = assembleDelivery(prepared,plan);
      for (const item of paperWording(draft)) append(item);
      await writer.finish(text);
      abort.signal.throwIfAborted();
      current.current = draft;
      setCandidate(draft);
      setPhase(3);
      setStatus('正在核对纸面高度、行距与页底留白。');
    }
    generate().catch((error) => { if (!abort.signal.aborted) callbacks.current.onError(error.message); });
    return () => { abort.abort(); writer.dispose(); };
  }, [space,run,source,outline,local,prepared]);

  function finish(draft) {
    if (done.current || task.current?.signal.aborted) return;
    done.current = true;
    callbacks.current.onReady(finalizeDelivery(draft));
  }
  function needRepair(draft, result, notice) {
    current.current = draft; setCandidate(draft); setRoom(result); setRepair(true); setStatus(notice);
  }
  async function tryShorter(draft, result) {
    const signal = task.current.signal;
    refit.current = {draft, result, pending:true};
    setStatus('已测出仍然超页，正请同一模型缩写入选经历。');
    try {
      const plan = await refitDelivery(run,draft,space,result.overflowMm,signal);
      signal.throwIfAborted();
      const next = assembleDelivery(prepared,plan);
      pass.current = {tried:[],shortened:true};
      current.current = next; setCandidate(next);
      setStatus('正在复核精简后的正文与页底。');
    } catch (error) {
      if (!signal.aborted) needRepair(draft,result,error.message + ' 已保留首稿，可以在这里继续精简。');
    } finally { refit.current.pending = false; }
  }
  function measure(result) {
    if (done.current) return;
    if (result.resume === outline) {
      setSpace((s) => s || {lines:result.lines,columns:result.columns});
      return;
    }
    const draft = current.current;
    if (!draft || result.resume !== draft.resume || task.current?.signal.aborted || refit.current?.pending) return;
    if (repair) { setRoom(result); return; }
    const next = composePage(draft,result,pass.current);
    if (next) {
      pass.current = next.pass;
      current.current = next.doc;
      setCandidate(next.doc);
    } else if (result.overflow && !local && !refit.current) {
      void tryShorter(draft,result);
    } else if (result.overflow || result.horizontal) {
      const first = refit.current;
      const keepFirst = first && !first.result.horizontal && (result.horizontal || first.result.heightMm < result.heightMm);
      needRepair(keepFirst ? first.draft : draft, keepFirst ? first.result : result,
        '当前内容仍需取舍。可以直接精简正文或收起一段经历，改好后继续。');
    } else finish(draft);
  }
  function editRepair(resume) {
    const next = {...current.current,resume};
    current.current = next;
    setCandidate(next);
    setRoom(null);
  }
  const fits = room?.resume === candidate?.resume && room && !room.overflow && !room.horizontal;
  const paper = candidate?.resume || live?.resume || outline;
  const paperProps = {resume:paper, writingField:phase === 2 && !skipped ? live?.field : undefined,
    onPick: repair ? (key) => {setField(key);setJump({area:'field'});} : undefined};
  return <Page className="page-wide generation-page" title={repair ? '调整到一页' : '正在生成简历'}
    description={[prepared.seed.job.company, prepared.seed.job.title].filter(Boolean).join(' · ')}
    onBack={onCancel} backLabel="返回岗位与选材" dirty
    footer={<><span className="footer-note">A4 · 单栏投递版</span><div className="page-action-group">
      {!repair && phase < 3 && !skipped && <Button variant="ghost" onClick={() => {skip.current = true; setSkipped(true);}}>跳过打字动效</Button>}
      <Button variant="secondary" onClick={onCancel}>{repair ? '返回选材' : '停止生成'}</Button>
      {repair && <Button disabled={!fits} onClick={() => finish(current.current)}>完成一页校稿<IconArrowRight size={16} /></Button>}
    </div></>}>
    <div className="generation-layout"><aside className="generation-progress">
      <AssistantIdentity offline={local} status={repair ? 'idle' : 'streaming'} hasText={phase >= 2 && !!live}
        phaseLabel={repair ? '等待校订' : ['测量中','选材中','写作中','核对版面'][phase]} />
      <ol aria-label="成稿进度">{stages.map((name,i) => <li key={name} aria-current={i === phase ? 'step' : undefined}>
        <span aria-hidden="true">{i < phase ? <IconCheck size={13} /> : i+1}</span>{narrow ? mobileStages[i] : name}
      </li>)}</ol>
      <p role="status">{phase === 2 && live?.field ? '正在写入' + fieldLabel(paper,live.field) : status}</p>
      {repair && <><p className="generation-fit" role="status">{!room ? '正在重新测量…' : room.horizontal ? '部分内容超出纸面宽度' : room.overflow ? '还需减少约 ' + Math.ceil(room.overflowMm) + ' mm' : '已排入一页'}</p>
        <DeliveryProofread doc={candidate} resume={paper} field={field} jump={jump} onField={setField}
          onChange={editRepair} onError={setStatus} onTailor={onCancel} />
      </>}
    </aside><section ref={manuscript} className="generation-manuscript" aria-label="正在成稿的简历" aria-live="off">
      <div className="generation-paper-label"><span>{repair ? '当前文稿' : '写作中的文稿'}</span><span>{local ? '本地整理' : run.modelName}</span></div>
      {narrow ? <ResumeDocument {...paperProps} readOnly className="generation-paper" /> : <DeliveryPreview {...paperProps} />}
    </section></div>
    <DeliveryPreview hidden resume={candidate?.resume || outline} onMeasure={measure} />
  </Page>;
}
