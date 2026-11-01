import { useContext, useState } from 'react';
import { IconArchive, IconArrowDown, IconArrowUp, IconArrowRight, IconBooks, IconBriefcase2, IconCheck, IconChevronDown, IconDots, IconFileText, IconPlus, IconSearch, IconSparkles, IconX } from '@tabler/icons-react';
import { Button, EmptyState, IconButton, Menu, Page } from './ui/index.jsx';
import { PageNavigationContext } from '../hooks/usePageNavigation.js';
import { matchProjects } from '../lib/assistant.js';
import { materialFingerprint, prepareProjectSelection, projectDetails, projectSearchText, projectSummary } from '../lib/projects.js';
import { ProjectEditor } from './ProjectEditor.jsx';
import { MaterialReview } from './MaterialReview.jsx';

export function ProjectsPage({ library, doc, settings, onBack, onSaveProject, onApply, onArchive, onConfigure, onOpenJob, busy, libraryNavigation, libraryTabsId, hasActiveDocument = true }) {
  const [selection, setSelection] = useState(doc.resume.projectIds), [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null), [archived, setArchived] = useState(false), [sort, setSort] = useState(false), [review, setReview] = useState(false), [saved, setSaved] = useState('');
  const [selectionOpen, setSelectionOpen] = useState(() => !window.matchMedia('(max-width: 1000px)').matches);
  const navigation = useContext(PageNavigationContext);
  const selectionDirty = JSON.stringify(selection) !== JSON.stringify(doc.resume.projectIds);
  const combined = [...library, ...doc.resume.sources.filter(project => !library.some(item => item.id === project.id))];
  const ranking = matchProjects(combined, doc.job);
  const ordered = sort && !archived ? ranking.map(item => item.project) : combined;
  const visible = ordered.filter(project => !!project.archived === archived && projectSearchText(project).toLowerCase().includes(query.trim().toLowerCase()));
  const connection = settings.enabled && settings.capabilities.rewrite && settings.connections.find(item => item.id === settings.bindings.rewrite);
  const selectedProjects = selection.map(id => combined.find(project => project.id === id)).filter(Boolean);
  const ready = selection.length > 0 && !!doc.job.text.trim();
  function move(id, shift) {
    setSelection(old => { const next = [...old], index = next.indexOf(id), position = index + shift; if (position >= 0 && position < next.length) [next[index], next[position]] = [next[position], next[index]]; return next; });
  }
  if (editing) return <ProjectEditor key={editing.id || 'new'} project={editing.id ? editing : null} selectionDirty={selectionDirty} onCancel={() => setEditing(null)} onSave={project => {
    navigation?.stay(); onSaveProject(project); setSaved('“' + project.name + '”已保存到素材库'); setEditing(null);
  }} />;
  if (review && connection) return <MaterialReview key={connection.id + connection.baseUrl} projects={selectedProjects} doc={{ ...doc, resume: prepareProjectSelection(doc.resume, selection, combined, settings.capabilities.match ? doc.job : {}) }} job={doc.job} connection={connection} selectionDirty={selectionDirty} busy={busy} onCancel={() => setReview(false)} onConfirm={materialApproval => onApply(selection, combined, { optimize: true, materialApproval })} />;
  return <Page title={libraryNavigation ? '资料库' : '项目素材库'} description="完整记录项目，再为当前岗位选择适合的内容。" className="page-wide projects-page" dirty={selectionDirty} onBack={onBack} navigation={libraryNavigation}
    actions={<Button variant="secondary" onClick={() => setEditing({})}><IconPlus size={16} />新增项目</Button>}
    footer={<><span className="footer-note">{selectionDirty ? '选材有变更 · ' : ''}已选 {selection.length} 个项目{!hasActiveDocument ? ' · 先新建简历再选择项目' : !doc.job.text.trim() ? ' · 补充 JD 后可生成草稿' : ''}</span><div className="project-footer-actions"><Button variant="secondary" disabled={!ready || busy} onClick={() => connection ? setReview(true) : onApply(selection, combined, { regenerate: true })}>{connection ? <IconSparkles size={16} /> : <IconFileText size={16} />}{connection ? '按 JD 优化' : '生成岗位草稿'}</Button><Button disabled={!hasActiveDocument} title={!hasActiveDocument ? "先新建简历，再选择项目" : undefined} onClick={() => onApply(selection, combined)}>应用选材<IconArrowRight size={15} /></Button></div></>}>
    {saved ? <div className="material-saved" role="status"><IconCheck size={16} />{saved}<IconButton label="关闭保存提示" onClick={() => setSaved('')}><IconX size={14} /></IconButton></div> : null}
    <div className="library-layout" role={libraryTabsId ? 'tabpanel' : undefined} id={libraryTabsId ? `${libraryTabsId}-projects-panel` : undefined} aria-labelledby={libraryTabsId ? `${libraryTabsId}-projects-tab` : undefined}>
      <div className="library-main">
        <div className="library-tools"><div className="search-input"><IconSearch size={17} /><input aria-label="搜索项目素材" placeholder="搜索项目、能力或资料内容" value={query} onChange={event => setQuery(event.target.value)} /></div></div>
        <div className="library-filters"><div role="group" aria-label="素材范围"><button aria-pressed={!archived} className={!archived ? 'active' : ''} onClick={() => setArchived(false)}>全部素材</button><button aria-pressed={archived} className={archived ? 'active' : ''} onClick={() => setArchived(true)}>已归档</button></div><button className={'sort-button ' + (sort ? 'active' : '')} aria-pressed={sort} disabled={!settings.capabilities.match || !doc.job.text.trim() || archived} onClick={() => setSort(!sort)}>{sort ? '已按 JD 排序' : '按 JD 排序'}</button></div>
        <div className="project-library">{visible.map(project => {
          const detailCount = Object.values(projectDetails(project)).filter(value => value.trim()).length;
          const old = doc.resume.sources.find(source => source.id === project.id);
          const updated = old && materialFingerprint(old) !== materialFingerprint(project);
          const matched = sort ? ranking.find(item => item.project.id === project.id)?.matches || [] : [];
          const chosen = selection.includes(project.id);
          return <article key={project.id} className={'material-item ' + (chosen ? 'chosen' : '')}>
            <div className="material-item-heading">
              <div className="material-identity"><button className="material-title" onClick={() => setEditing(project)}>{project.name}<IconArrowRight size={14} /></button><p>{project.role || '角色待补充'} · {project.date || '时间待补充'}{project.example ? <em>示例</em> : null}</p></div>
              <Menu label={'项目操作：' + project.name} className="material-item-menu" icon={<IconDots size={18} />} value="" items={[{ label: project.archived ? '恢复到素材库' : '归档项目', icon: <IconArchive size={16} />, onClick: () => onArchive(project.id, !project.archived) }]} />
            </div>
            <p className="material-summary">{projectSummary(project)}</p>
            <div className="material-item-footer">
              <button className="material-detail-link" onClick={() => setEditing(project)}>{detailCount ? detailCount + ' / 10 类资料' : '补充详细资料'}</button>
              <div className="material-tags">{project.tags.slice(0, 2).map(tag => <span key={tag}>{tag}</span>)}</div>
              <label className={'material-select ' + (chosen ? 'is-selected' : '')}><input aria-label={'选入' + project.name} type="checkbox" disabled={!hasActiveDocument} checked={chosen} onChange={event => setSelection(old => event.target.checked ? [...old, project.id] : old.filter(id => id !== project.id))} /><span>{chosen ? '已选入' : '选入简历'}</span></label>
            </div>
            {updated ? <p className="material-update-note">素材已更新，应用时同步资料并保留已编辑的表达。</p> : null}
            {sort ? <p className="material-match">{matched.length ? '关键词线索：' + matched.slice(0, 6).join('、') : '暂无直接关键词，仍可人工选择。'}</p> : null}
          </article>;
        })}{!visible.length ? <EmptyState icon={<IconBooks size={28} />} title={query ? '没有找到相关资料' : archived ? '还没有归档项目' : '先记录一段完整经历'}>可以换一个关键词，或从“新增项目”开始。</EmptyState> : null}</div>
      </div>
      <aside className="selection-panel" aria-label="当前简历选材">
        <button className="selection-panel-toggle" aria-expanded={selectionOpen} aria-controls="selected-materials" onClick={() => setSelectionOpen(value => !value)}><span>当前简历选材 <b>{selection.length}</b></span><IconChevronDown size={16} /></button>
        <div id="selected-materials" className={'selection-panel-body ' + (!selectionOpen ? 'collapsed' : '')}>
          <button className="selection-job" onClick={onOpenJob}><IconBriefcase2 size={16} /><span><small>目标岗位</small><strong>{!hasActiveDocument ? '先新建一份简历' : doc.job.title || '添加岗位 JD'}</strong></span><IconArrowRight size={14} /></button>
          <p className="selection-help">选择 2–3 个最相关的项目。下方顺序就是简历中的顺序。</p>
          {selection.length ? <ol className="selection-order">{selection.map((id, index) => <li key={id}><span className="order-number">{index + 1}</span><strong>{combined.find(project => project.id === id)?.name || '已移除素材'}</strong><div><IconButton label={'上移项目' + (index + 1)} disabled={!index} onClick={() => move(id, -1)}><IconArrowUp size={14} /></IconButton><IconButton label={'下移项目' + (index + 1)} disabled={index === selection.length - 1} onClick={() => move(id, 1)}><IconArrowDown size={14} /></IconButton><IconButton label={'移除项目' + (index + 1)} onClick={() => setSelection(old => old.filter(value => value !== id))}><IconX size={14} /></IconButton></div></li>)}</ol> : <p className="selection-empty">从素材列表勾选项目，选材会显示在这里。</p>}
          {!doc.job.text.trim() ? <Button variant="secondary" className="selection-add-job" onClick={onOpenJob}>补充岗位 JD<IconArrowRight size={15} /></Button> : null}
          <div className="material-method"><strong>{connection ? '模型辅助优化' : '本地整理'}</strong><p>{connection ? '发送前确认资料范围，生成的建议由你审核后采用。' : '按 JD 关键词提取已有原文。应用项目会保留你已修改的表达。'}</p>{!connection && onConfigure ? <button onClick={onConfigure}>连接 AI 模型<IconArrowRight size={14} /></button> : null}</div>
        </div>
      </aside>
    </div>
  </Page>;
}
