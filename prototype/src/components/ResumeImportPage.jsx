import {useEffect, useRef, useState} from 'react';
import {IconFileImport, IconUpload} from '@tabler/icons-react';
import {Button, Field, Page} from './ui/index.jsx';
import {contactTypes, newContact, recordSections} from '../lib/profile.js';
import {appendImportedResume, importedResume, parseResumeText} from '../lib/resumeImport.js';
import './resume-import.css';

const accepted = '.doc,.docx,.pdf';
export default function ResumeImportPage({onBack,onImport,archiveDefault,destination}) {
  const input = useRef(null), request = useRef(null), submit = useRef(false);
  const [text,setText] = useState(''), [title,setTitle] = useState(''), [parsed,setParsed] = useState(null);
  const [status,setStatus] = useState(''), [error,setError] = useState(''), [scan,setScan] = useState([]);
  const [manual,setManual] = useState(false), [drag,setDrag] = useState(false), [archive,setArchive] = useState(archiveDefault);
  const [filename,setFilename] = useState('');
  useEffect(() => () => request.current?.abort(),[]);
  const revise = (key,value) => setParsed(p => ({...p,[key]:value}));
  const profile = (key,value) => setParsed(p => ({...p,profile:{...p.profile,[key]:value}}));
  function review(raw, name) {
    const result = parseResumeText(raw);
    setParsed(result); setManual(false); setText(raw);
    setTitle(name || [result.profile.name,result.target].filter(Boolean).join(' · ') || '导入的简历');
  }
  function cancelRead() { request.current?.abort(); request.current = null; setStatus(''); }
  async function load(file) {
    if (!file) return;
    cancelRead(); setError('');
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['doc','docx','pdf'].includes(ext)) {setError('请选择 Word（.doc、.docx）或 PDF 文件。'); return;}
    if (!file.size || file.size > 20*1024*1024) {setError('请选择有内容且不超过 20 MB 的简历文件。'); return;}
    const ctrl = new AbortController(); request.current = ctrl;
    setStatus('正在读取 ' + file.name);
    try {
      const buffer = await file.arrayBuffer(); ctrl.signal.throwIfAborted();
      const result = ext === 'pdf'
        ? await (await import('../lib/readPdf.js')).readPdf(buffer,ctrl.signal,setStatus)
        : await (await import('../lib/readWord.js')).readWord(buffer,ctrl.signal);
      if (request.current !== ctrl) return;
      review(result.text,file.name.replace(/\.[^.]+$/,''));
      setFilename(file.name); setScan(result.ocrPages);
    } catch (e) {
      if (request.current === ctrl) setError(/[\u3400-\u9fff]/u.test(e.message) ? e.message : '未能完成文件解析。可以重试，或复制原简历的文字在这里校对。');
    } finally {if (request.current === ctrl) {request.current = null; setStatus('');}}
  }
  function confirm() {
    if (!parsed || !title.trim() || submit.current) return;
    try {
      submit.current = true;
      const doc = importedResume(parsed,title);
      const result = onImport(state => appendImportedResume(state,doc,archive),archive);
      if (result === false) submit.current = false;
    } catch (e) {submit.current = false; setError(e.message);}
  }
  const reviewSource = () => {setError(''); try {review(text,title);} catch(e) {setError(e.message);} };
  return <Page title="导入已有简历" description={parsed && !manual ? '核对识别结果，确认后就可以在纸面上继续修改。' : '选择 Word 或 PDF。文件在当前设备解析，扫描 PDF 支持中英文文字识别。'}
    className="page-wide resume-import-page" onBack={onBack} dirty={!!parsed || !!text.trim()}
    footer={parsed && !manual ? <><span className="footer-note">保存到{destination}</span><Button onClick={confirm} disabled={!title.trim()}>确认导入</Button></> : undefined}>
    {error && <p role="alert" className="info-banner">{error}</p>}
    {!parsed && !manual ? <>
      <div className={'resume-file-drop' + (drag ? ' is-dragging' : '')} onDragOver={e => {e.preventDefault(); setDrag(true);}} onDragLeave={() => setDrag(false)}
        onDrop={e => {e.preventDefault(); setDrag(false); load(e.dataTransfer.files[0]);}}>
        <IconFileImport size={32} stroke={1.4}/><h2>{status ? '正在解析简历' : '选择或拖入一份简历'}</h2>
        <p role="status">{status || 'DOC、DOCX、PDF · 最大 20 MB'}</p>
        {status ? <Button variant="secondary" onClick={cancelRead}>取消解析</Button>
          : <Button onClick={() => input.current?.click()}><IconUpload size={16}/>选择文件</Button>}
        <input hidden aria-label="选择简历文件" ref={input} type="file" accept={accepted} onChange={e => {load(e.target.files[0]); e.target.value='';}}/>
      </div>
      {!status && <Button variant="ghost" onClick={() => {setError('');setManual(true);}}>粘贴简历文字</Button>}
    </> : manual ? <div className="resume-import-source">
      <Field label="简历原文" hint="保留章节标题和换行。重新识别会以这里的文字替换本页的校对结果。"><textarea rows={15} value={text} maxLength={170000} onChange={e => setText(e.target.value)}/></Field>
      <div><Button variant="secondary" onClick={() => setManual(false)}>返回</Button><Button onClick={reviewSource} disabled={!text.trim()}>识别章节</Button></div>
    </div> : <>
      <div className="import-source-line"><span>{filename || '粘贴的简历文字'}</span><button className="text-button" onClick={() => setManual(true)}>查看与校正原文</button></div>
      {!!scan.length && <p className="info-banner">第 {scan.join('、')} 页经过文字识别，请重点核对姓名、日期和数字。</p>}
      <div className="field-grid"><Field label="简历名称"><input value={title} maxLength={160} onChange={e => setTitle(e.target.value)}/></Field><Field label="求职意向"><input value={parsed.target} onChange={e => revise('target',e.target.value)}/></Field></div>
      <details open className="import-group"><summary>基本信息与联系方式</summary><div>
        <Field label="姓名"><input value={parsed.profile.name} onChange={e => profile('name',e.target.value)}/></Field>
        {parsed.profile.contactItems.map((c,i) => <div key={c.id} className="import-contact"><Field label={'联系方式 '+(i+1)}><input value={c.value} onChange={e => profile('contactItems',parsed.profile.contactItems.map(item => item.id === c.id ? {...item,value:e.target.value} : item))}/></Field>
          <select aria-label={'联系方式 '+(i+1)+' 类型'} value={c.type} onChange={e => profile('contactItems',parsed.profile.contactItems.map(item => item.id === c.id ? {...item,type:e.target.value} : item))}>{contactTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>)}
        <Button variant="ghost" disabled={parsed.profile.contactItems.length >= 30} onClick={() => profile('contactItems',[...parsed.profile.contactItems,newContact('email')])}>添加联系方式</Button>
      </div></details>
      {recordSections.map(s => <details className="import-group" key={s.key}><summary>{s.label}<small>{parsed.profile[s.key].length} 段</small></summary><div>
        {parsed.profile[s.key].length === 0 && <p>原文中未识别到这个章节。</p>}
        {parsed.profile[s.key].map((r,i) => <fieldset key={r.id}><legend>{r.organization || '第 '+(i+1)+' 段'}</legend>
          {['organization','title','period','description'].map(key => {
            const label = key === 'period' ? '时间' : s[key], props = {value:r[key],onChange:e => profile(s.key,parsed.profile[s.key].map(item => item.id === r.id ? {...r,[key]:e.target.value} : item))};
            return <Field label={label} key={key}>{key === 'description' ? <textarea rows={3} {...props}/> : <input {...props}/>}</Field>;
          })}</fieldset>)}
      </div></details>)}
      <details className="import-group"><summary>项目经历<small>{parsed.projects.length} 个</small></summary><div>
        {!parsed.projects.length && <p>原文中未识别到项目经历。</p>}
        {parsed.projects.map((p,i) => <fieldset key={p.id}><legend>{p.name || '项目 '+(i+1)}</legend>
          {Object.entries({name:'项目名称',role:'角色',date:'时间',facts:'项目要点（每行一条）'}).map(([key,label]) => {
            const props={value:key === 'facts' ? p.facts.join('\n') : p[key],onChange:e => revise('projects',parsed.projects.map(item => item.id === p.id ? {...p,[key]:key === 'facts' ? e.target.value.split('\n') : e.target.value} : item))};
            return <Field label={label} key={key}>{key === 'facts' ? <textarea rows={3} {...props}/> : <input {...props}/>}</Field>;
          })}</fieldset>)}
      </div></details>
      <details className="import-group" open={!!parsed.additional || undefined}><summary>简介、技能与补充信息</summary><div>
        <Field label="个人简介"><textarea rows={2} value={parsed.profile.summary} onChange={e => profile('summary',e.target.value)}/></Field>
        <Field label="专业能力"><textarea rows={2} value={parsed.profile.skills} onChange={e => profile('skills',e.target.value)}/></Field>
        <Field label="补充信息" hint="未归类的原文会保留在这里，可校正后随简历保存。"><textarea rows={3} value={parsed.additional} onChange={e => revise('additional',e.target.value)}/></Field>
      </div></details>
      <label className="import-to-library"><input type="checkbox" checked={archive} onChange={e => setArchive(e.target.checked)}/><span>同时补充到资料库<small>追加联系方式、经历和项目，已有资料优先保留，之后可用于按 JD 选材。</small></span></label>
    </>}
  </Page>;
}
