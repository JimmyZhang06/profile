import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconCheck, IconUpload } from '@tabler/icons-react';
import { Button, Field, Page } from './ui/index.jsx';
import { PageNavigationContext } from '../hooks/usePageNavigation.js';
import { projectDetailFields, projectDetails } from '../lib/projects.js';
import { uid } from '../lib/workspace.js';

const sections = [
  { id: 'basics', title: '基本信息', fields: [] },
  { id: 'context', title: '背景与目标', fields: ['background', 'goals'] },
  { id: 'process', title: '职责与行动', fields: ['responsibilities', 'actions', 'challenges'] },
  { id: 'outcomes', title: '成果与依据', fields: ['results', 'evidence'] },
  { id: 'learning', title: '协作与复盘', fields: ['collaboration', 'reflection'] },
  { id: 'materials', title: '原始资料', fields: ['notes'] },
];

function fitMaterialTextArea(element) {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = Math.min(element.scrollHeight + 2, 480) + 'px';
}

export function MaterialTextArea({ value, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => { fitMaterialTextArea(ref.current); }, [value]);
  useLayoutEffect(() => {
    let lastWidth = 0;
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width !== lastWidth) { lastWidth = width; fitMaterialTextArea(ref.current); }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <textarea ref={ref} value={value} {...props} />;
}

export function ProjectRecord({ project }) {
  const details = projectDetails(project);
  return <div className="project-record">{projectDetailFields.filter(field => details[field.key]).map(field =>
    <section key={field.key}><h3>{field.label}</h3><p>{details[field.key]}</p></section>
  )}{project.facts.length ? <section><h3>已有候选要点</h3><ul>{project.facts.map((fact, i) => <li key={i}>{fact}</li>)}</ul></section> : null}</div>;
}

export function ProjectEditor({ project, selectionDirty, onCancel, onSave }) {
  const navigation = useContext(PageNavigationContext), fileRef = useRef(null), headings = useRef({});
  const [initial] = useState(() => ({
    ...(project || { name: '', role: '', date: '', tags: [], facts: [] }),
    tags: project?.tags.join('、') || '', facts: project?.facts.join('\n') || '', details: projectDetails(project),
  }));
  const [draft, setDraft] = useState(initial), [error, setError] = useState(''), [activeSection, setActiveSection] = useState('basics');
  useEffect(() => {
    const scroll = headings.current.basics?.closest('.page-scroll');
    if (!scroll) return;
    const update = () => {
      const top = scroll.getBoundingClientRect().top + 70;
      const section = [...sections].reverse().find(item => headings.current[item.id]?.getBoundingClientRect().top <= top);
      setActiveSection(section?.id || 'basics');
    };
    scroll.addEventListener('scroll', update, { passive: true });
    return () => scroll.removeEventListener('scroll', update);
  }, []);
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  const filled = Object.values(draft.details).filter(value => value.trim()).length;
  const canSave = draft.name.trim() && (draft.facts.trim() || filled);
  const change = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const cancel = () => changed && navigation ? navigation.request(onCancel) : onCancel();
  function save() {
    if (!canSave) return;
    navigation?.stay();
    onSave({
      ...draft, id: project?.id || uid(), name: draft.name.trim(), role: draft.role.trim(), date: draft.date.trim(),
      tags: [...new Set(draft.tags.split(/[,，、]/).map(value => value.trim()).filter(Boolean))],
      facts: draft.facts.split('\n').map(value => value.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean),
      details: Object.fromEntries(Object.entries(draft.details).map(([key, value]) => [key, value.trim()])),
      example: project?.example || false, updatedAt: Date.now(),
    });
  }
  async function importText(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1_000_000) return setError('请使用小于 1 MB 的 TXT 或 Markdown 文件。');
    try {
      const text = await file.text();
      if ((draft.details.notes + text).length > 200000) return setError('追加后超过 20 万字，请拆分资料或保留相关部分。');
      setDraft(old => ({ ...old, details: { ...old.details, notes: [old.details.notes, '资料：' + file.name + '\n' + text].filter(Boolean).join('\n\n') } }));
      setError('');
    } catch { setError('读取失败，可以直接粘贴文字。'); }
  }
  return <Page title={project ? '编辑项目资料' : '记录一段完整经历'} description="把经过和证据留在这里。面向不同岗位时，再从中选择适合写进简历的内容。"
    className="page-wide project-editor-page" onBack={cancel} backLabel="返回素材库" dirty={changed || selectionDirty}
    footer={<><span className="footer-note">保存到素材库，不会覆盖已有简历</span><div className="project-footer-actions"><Button variant="ghost" onClick={cancel}>取消</Button><Button disabled={!canSave} onClick={save}>保存项目资料<IconCheck size={15} /></Button></div></>}>
    <div className="project-editor-layout">
      <nav className="project-section-nav" aria-label="项目资料章节">
        {sections.map((section, index) => <button key={section.id} type="button" aria-current={activeSection === section.id ? 'location' : undefined} onClick={() => {
          const heading = headings.current[section.id];
          heading?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
          heading?.focus({ preventScroll: true });
        }}><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</button>)}
        <p>已记录 {filled} / 10 类资料<br />不必一次填完，随时可以补充。</p>
      </nav>
      <div className="project-editor-sections">
        {sections.map(section => <section className="project-detail-section" key={section.id}>
          <h2 tabIndex={-1} ref={element => { headings.current[section.id] = element; }}>{section.title}</h2>
          {section.id === 'basics' ? <div className="field-grid">
            <Field label="项目名称"><input autoFocus value={draft.name} onChange={event => change('name', event.target.value)} placeholder="例如：会员权益优化" maxLength={160} /></Field>
            <Field label="我的角色"><input value={draft.role} onChange={event => change('role', event.target.value)} placeholder="例如：用户运营 / 项目负责人" maxLength={160} /></Field>
            <Field label="起止时间"><input value={draft.date} onChange={event => change('date', event.target.value)} placeholder="2025.03 — 2025.08" maxLength={80} /></Field>
            <Field label="能力标签"><input value={draft.tags} onChange={event => change('tags', event.target.value)} placeholder="用户分层、数据分析、项目推进" maxLength={500} /></Field>
          </div> : null}
          {section.fields.map(key => {
            const field = projectDetailFields.find(item => item.key === key);
            return <Field key={key} label={field.label} hint={field.hint}>
              <MaterialTextArea rows={key === 'notes' ? 9 : key === 'actions' ? 5 : 3} value={draft.details[key]} maxLength={key === 'notes' ? 200000 : 60000}
                placeholder={key === 'notes' ? '直接粘贴资料全文，或从下方追加文件…' : '可以先写关键事实，之后随时补充…'} onChange={event => setDraft(old => ({ ...old, details: { ...old.details, [key]: event.target.value } }))} />
            </Field>;
          })}
          {section.id === 'materials' ? <>
            <div className="material-import"><Button variant="secondary" onClick={() => fileRef.current?.click()}><IconUpload size={16} />追加 TXT / Markdown</Button><span>保留已有内容，文件文字追加到上方。</span><input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" hidden onChange={importText} /></div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <Field label="已有简历要点（可选）" hint="旧版保存的要点保留在这里。每行一条，不需要先将完整资料压缩成简历。"><MaterialTextArea rows={5} value={draft.facts} onChange={event => change('facts', event.target.value)} /></Field>
          </> : null}
        </section>)}
      </div>
    </div>
  </Page>;
}
