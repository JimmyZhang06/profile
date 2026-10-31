import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconX } from '@tabler/icons-react';
import { Sidebar } from './components/Sidebar.jsx';
import { Chat } from './components/Chat.jsx';
import { Canvas } from './components/Canvas.jsx';
import { ResumeDesignPanel } from './components/ResumeDesignPanel.jsx';
import { WorkspaceHeader } from './components/WorkspaceHeader.jsx';
import { SplitWorkspace } from './components/SplitWorkspace.jsx';
import { ProjectsPage, JobPage, ProfilePage, NewDocumentPage, SettingsPage, VersionsPage, ReviewPage, SourcePage, ExportPage, RenamePage } from './components/Pages.jsx';
import { Button, IconButton } from './components/ui/index.jsx';
import { AccountPage } from './components/account/AccountPage.jsx';
import { cloudRequest } from './lib/cloudClient.js';
import { useTheme } from './hooks/useTheme.js';
import { PageNavigationContext, usePageNavigation } from './hooks/usePageNavigation.js';
import { acceptedProposal, clone, downloadFile, fieldLabel, fieldValue, makeDocument, mutateResume, proposalState, setField, uid, undoDocument, validWorkspace } from './lib/workspace.js';
import { runAssistant } from './lib/assistant.js';
import { createTypewriter } from './lib/typewriter.js';
import { prepareProjectSelection } from './lib/projects.js';
import { marksForField, remapTextStyles } from './lib/richText.js';
import { getResumeDesign } from './lib/resumeDesign.js';

export function App({ workspace, account }) {
  const theme = useTheme();
  const { state, setState, saveState, error, conflict } = workspace;
  const [catalog, setCatalog] = useState(null);
  const doc = state.documents.find(d => d.id === state.activeId) || state.documents[0];
  const { page, pending, registerDirty, request, navigate, finish, discard, stay } = usePageNavigation();
  const [selected, setSelected] = useState(null), [edit, setEdit] = useState(null), [focus, setFocus] = useState(false), [mobileView, setMobileView] = useState('chat'), [busyId, setBusyId] = useState(null), [toast, setToast] = useState(''), [focusKey, setFocusKey] = useState(0);
  const [designOpen, setDesignOpen] = useState(false);
  const task = useRef(null), timer = useRef(null), workArea = useRef(null), latest = useRef(state);
  latest.current = state;
  const enabled = state.settings.enabled && state.settings.capabilities.rewrite;
  const updateDoc = (id, change) => setState(s => ({ ...s, documents: s.documents.map(d => d.id === id ? change(d) : d) }));
  const changeDoc = change => updateDoc(doc.id, change);
  function notify(message) { clearTimeout(timer.current); setToast(message); timer.current = setTimeout(() => setToast(''), 4200); }
  function guard() { if (edit) { notify('请先保存或取消正在编辑的文字'); return false; } if (conflict) return false; return true; }
  function open(name) {
    if (!guard() || name === page) return;
    request(() => {
      finish(name);
      if (window.matchMedia('(max-width: 1180px)').matches) setState(s => ({ ...s, ui: { ...s.ui, sidebar: false } }));
    });
  }
  function stop() {
    const active = task.current; if (!active) return;
    active.controller.abort(); task.current = null; setBusyId(null);
    updateDoc(active.docId, d => ({ ...d, messages: d.messages.map(m => m.id === active.messageId ? { ...m, status: 'stopped', proposals: [] } : m) }));
  }
  useEffect(() => () => { task.current?.controller.abort(); clearTimeout(timer.current); }, []);
  useEffect(() => { if(workspace.cloud&&saveState==='expired')account.refresh(); }, [workspace.cloud,saveState]);
  const previousPage = useRef(null);
  useEffect(() => {
    const titles = { account: '账号与安全', projects: '项目素材', job: '目标岗位', profile: '个人资料', new: '新建简历', settings: 'AI 与设置', versions: '版本记录', review: '修改记录', source: '原始依据', export: '导出简历', rename: '重命名简历' };
    document.title = page ? titles[page] + ' · 履历' : '履历 · 简历工作空间';
    if (previousPage.current && !page) workArea.current?.querySelector('.document-title-menu button')?.focus({ preventScroll: true });
    previousPage.current = page;
  }, [page]);
  useEffect(() => {
    if (!workspace.cloud || !workspace.ready) return;
    let cancelled = false;
    Promise.all([cloudRequest('cloud/connections', { ownerId: account.owner.id }), cloudRequest('cloud/templates', { ownerId: account.owner.id })]).then(([models, templates]) => {
      if (cancelled) return;
      setCatalog(templates.items);
      setState(s => JSON.stringify(s.settings.connections) === JSON.stringify(models.connections) ? s : ({ ...s, settings: { ...s.settings, connections: models.connections } }));
    }).catch(() => { /* Existing drafts and local rules remain usable while offline. */ });
    return () => { cancelled = true; };
  }, [workspace.cloud, workspace.ready, page === 'settings', account.owner?.id]);
  useEffect(() => {
    const broken = state.documents.some(d => d.messages.some(m => m.status === 'streaming'));
    if (broken && !task.current) setState(s => ({ ...s, documents: s.documents.map(d => ({ ...d, messages: d.messages.map(m => m.status === 'streaming' ? { ...m, status: 'stopped', proposals: [] } : m) })) }));
  }, []);
  async function send(text, retry = null, prepared = null, materialApproval = null) {
    if (!enabled || busyId || !text.trim() || conflict) return;
    const id = retry?.id || uid(), controller = new AbortController(), requestDoc = clone(prepared || doc), requestSelection = prepared ? null : retry?.selectedField || selected;
    const snapshot = { id, role: 'assistant', status: 'streaming', text: '', prompt: text, selectedField: requestSelection, offline: state.settings.bindings.rewrite === 'offline', materialOptimization: !!materialApproval };
    const user = { id: uid(), role: 'user', status: 'done', text, materialOptimization: !!materialApproval, selected: requestSelection ? { field: requestSelection, label: fieldLabel(doc.resume, requestSelection) } : null };
    task.current = { controller, messageId: id, docId: doc.id }; setBusyId(doc.id);
    changeDoc(d => ({ ...d, composer: retry ? d.composer : '', updatedAt: Date.now(), messages: retry ? d.messages.map(m => m.id === id ? snapshot : m) : [...d.messages, user, snapshot] }));
    requestDoc.messages = requestDoc.messages.filter(m => m.id !== id);
    const writer = createTypewriter({ signal: controller.signal,
      reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onText: value => {
        if (task.current?.controller !== controller) return;
        updateDoc(requestDoc.id, d => ({ ...d, messages: d.messages.map(m => m.id === id ? { ...m, text: value } : m) }));
      },
    });
    try {
      const result = await runAssistant({ prompt: text, doc: requestDoc, selected: requestSelection, library: state.library, settings: { ...state.settings, cloudAccount: workspace.cloud ? account.owner.id : null }, materialApproval, signal: controller.signal, onText: writer.push });
      await writer.finish(result.text);
      if (controller.signal.aborted || task.current?.controller !== controller) return;
      updateDoc(requestDoc.id, d => ({ ...d, updatedAt: Date.now(), messages: d.messages.map(m => m.id === id ? { ...m, ...result, status: 'done' } : m) }));
    } catch (e) {
      if (e.name !== 'AbortError' && task.current?.controller === controller) updateDoc(requestDoc.id, d => ({ ...d, messages: d.messages.map(m => m.id === id ? { ...m, status: 'error', error: e.message, proposals: [] } : m) }));
    } finally { writer.dispose(); if (task.current?.controller === controller) { task.current = null; setBusyId(null); } }
  }
  function selectDocument(id) {
    if (!guard()) return;
    request(() => { stop(); setState(s => ({ ...s, activeId: id })); setSelected(null); setEdit(null); setFocus(false); setMobileView('chat'); finish(null); });
  }
  function selectField(field) { if (!guard()) return; setSelected(field); }
  function startEdit(field) { if (!guard()) return; const value = fieldValue(doc.resume, field); setSelected(field); setEdit({ field, value, marks: marksForField(doc.resume, field, value) }); }
  function saveEdit() { if (!edit) return; changeDoc(d => mutateResume(d, setField(d.resume, edit.field, edit.value, edit.marks), '编辑' + fieldLabel(d.resume, edit.field))); setEdit(null); notify('文字与格式已保存'); }
  function changeDesign(design) { if (guard() && JSON.stringify(design) !== JSON.stringify(getResumeDesign(doc.resume))) changeDoc(d => mutateResume(d, { ...d.resume, design }, '调整排版与模板')); }
  function closeDesign() { setDesignOpen(false); workArea.current?.querySelector('.workspace-design-toggle')?.focus({ preventScroll: true }); }
  function locate(field) { if (!guard()) return; setSelected(field); setMobileView('document'); }
  function apply(proposal) {
    if (!guard()) return;
    if (proposalState(doc, proposal) !== 'pending') return notify('原文已经变化，请重新生成建议');
    changeDoc(d => acceptedProposal(d, proposal)); setSelected(proposal.field); notify('已采用建议，可在工具栏撤销');
  }
  function saveVersion(name = '') {
    if (!guard()) return;
    changeDoc(d => ({ ...d, versions: [...d.versions, { id: uid(), name: name || '版本 ' + (d.versions.length + 1), time: Date.now(), resume: clone(d.resume), job: clone(d.job) }] })); notify('版本已保存');
  }
  async function copy(text) { try { await navigator.clipboard.writeText(text); notify('已复制到剪贴板'); } catch { notify('复制未成功，可以选择文字后复制'); } }
  function applyProjects(ids, library, options = {}) {
    if (options.optimize && busyId) return notify('请先停止当前生成，再开始岗位优化');
    stop();
    const prepare = d => mutateResume(d, prepareProjectSelection(d.resume, ids, library, state.settings.capabilities.match ? d.job : {}, options), options.regenerate ? '按岗位重新选取原文' : '调整项目组合与资料');
    const prepared = prepare(doc);
    changeDoc(prepare);
    setSelected(null); finish(null); setMobileView('chat');
    if (options.optimize) send('请根据当前 JD 和本次确认的项目资料，优化已选项目的简历表达。突出岗位相关的个人职责、行动和真实结果，说明依据；只提出建议，供我逐项审核。', null, prepared, options.materialApproval);
    else notify(options.regenerate ? '已按岗位关键词提取原文，可继续编辑或连接 AI 改写' : '项目资料已同步，已编辑的表达保留');
  }
  function retryMessage(message) {
    if (message.materialOptimization) { open('projects'); notify('这条回复使用了详细素材，请重新确认模型和本次发送范围'); }
    else send(message.prompt, message);
  }
  function changeModel(id) { stop(); setState(s => ({ ...s, settings: { ...s.settings, enabled: true, capabilities: { ...s.settings.capabilities, rewrite: true }, bindings: { ...s.settings.bindings, rewrite: id } } })); }
  function importBackup(backup) {
    if (!validWorkspace(backup)) throw new Error('不是可识别的履历备份文件');
    const mappings = new Map(backup.library.map(p => [p.id, uid()]));
    const mapId = id => { if (!mappings.has(id)) mappings.set(id, uid()); return mappings.get(id); };
    const mapResume = r => ({ ...r, sources: r.sources.map(p => ({ ...p, id: mapId(p.id) })), projectIds: r.projectIds.map(mapId), ...(r.projectBullets ? { projectBullets: Object.fromEntries(Object.entries(r.projectBullets).map(([id, points]) => [mapId(id), points])) } : {}), textStyles: remapTextStyles(r.textStyles, mapId), overrides: Object.fromEntries(Object.entries(r.overrides).map(([field, value]) => { const [id, i] = field.split(':'); return [mapId(id) + ':' + i, value]; })) });
    const documents = backup.documents.map(d => ({ ...clone(d), id: uid(), title: d.title + '（导入）', resume: mapResume(d.resume), messages: [], undo: [], redo: [], versions: d.versions.map(v => ({ ...v, id: uid(), resume: mapResume(v.resume) })) }));
    setState(s => ({ ...s, library: [...s.library, ...backup.library.map(p => ({ ...p, id: mapId(p.id) }))], documents: [...s.documents, ...documents] })); notify('备份已导入，现有内容保持不变');
  }
  useEffect(() => {
    function key(event) {
      if (!(event.ctrlKey || event.metaKey) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable || page) return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (!edit && !conflict) updateDoc(latest.current.activeId, d => undoDocument(d, event.shiftKey)); }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); if (!edit) open('versions'); }
      if (event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); if (!edit) open('new'); }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [edit, conflict, page]);
  return <PageNavigationContext.Provider value={{ registerDirty, request, stay, documentTitle: doc.title }}><main className={'app-shell ' + (state.ui.sidebar ? 'sidebar-open ' : '')}>
    <Sidebar theme={theme} account={account} state={state} page={page} onHome={() => { if (guard()) navigate(null); }} onToggle={() => setState(s => ({ ...s, ui: { ...s.ui, sidebar: !s.ui.sidebar } }))} onNew={() => open('new')} onOpen={open} onSelect={selectDocument} />
    <div className={'work-area mobile-' + mobileView + (focus ? ' canvas-focused' : '')} ref={workArea}>
      {(error || conflict) ? <div className={'workspace-alert' + (workspace.remoteConflict ? ' sync-conflict' : '')} role="alert"><span>{workspace.remoteConflict ? '另一台设备修改了资料。双方内容已保留，请选择如何继续。' : conflict ? '另一窗口更新了这份工作空间。请重新载入后继续。' : error}</span>{workspace.remoteConflict ? <><div className="sync-conflict-versions"><div><strong>这台设备</strong><p>{state.documents.length} 份简历 · {state.library.length} 个项目</p><small>{state.documents.slice(0,3).map(d=>d.title).join('、')}</small></div><div><strong>云端版本 {workspace.remoteConflict.revision}</strong><p>{workspace.remoteConflict.state.documents.length} 份简历 · {workspace.remoteConflict.state.library.length} 个项目</p><small>{workspace.remoteConflict.state.documents.slice(0,3).map(d=>d.title).join('、')}</small></div></div><Button onClick={()=>workspace.resolveConflict('both')}>两个版本都保留</Button><Button variant="secondary" onClick={()=>workspace.resolveConflict('local')}>继续使用本机版本</Button><Button variant="secondary" onClick={()=>workspace.resolveConflict('cloud')}>使用云端版本</Button></> : null}<Button variant="secondary" onClick={() => downloadFile('履历恢复备份.json', JSON.stringify(state), 'application/json')}>导出当前内容</Button>{conflict && !workspace.cloud ? <Button onClick={() => window.location.reload()}>重新载入</Button> : null}{workspace.cloud && !conflict ? <Button onClick={()=>saveState==='expired'?open('account'):workspace.retry()}>{saveState==='expired'?'重新登录':'重试同步'}</Button> : null}</div> : null}
      {pending ? <div className="page-leave-notice" role="alert"><span>当前页面还有未保存的内容。</span><Button variant="secondary" onClick={stay}>继续编辑</Button><Button variant="ghost" onClick={discard}>放弃更改并离开</Button></div> : null}
      <div className="editor-workspace" hidden={!!page} inert={conflict || undefined}>
      <WorkspaceHeader doc={doc} saveState={saveState} edit={edit} mobileView={mobileView} onMobileView={view => { if (view === 'chat') setDesignOpen(false); setMobileView(view); }} onOpen={open} onUndo={() => changeDoc(d => undoDocument(d))} onRedo={() => changeDoc(d => undoDocument(d, true))} designOpen={designOpen} onDesignToggle={() => { if (designOpen) closeDesign(); else if (guard()) { setDesignOpen(true); setMobileView('document'); } }} />
      <SplitWorkspace ratio={state.ui.chatRatio} onRatioChange={chatRatio => setState(s => ({ ...s, ui: { ...s.ui, chatRatio } }))} inert={conflict || undefined} tools={designOpen ? <ResumeDesignPanel catalog={catalog} resume={doc.resume} disabled={!!edit} onChange={changeDesign} onClose={closeDesign} /> : null}>
        <Chat active={!page && !designOpen} doc={doc} settings={state.settings} selected={selected} busy={busyId === doc.id} focusKey={focusKey} onSend={send} onStop={stop} onInput={text => changeDoc(d => ({ ...d, composer: text }))} onRemoveSelection={() => selectField(null)} onOpen={open} onApply={apply} onDismiss={(id, proposalId) => changeDoc(d => ({ ...d, messages: d.messages.map(m => m.id === id ? { ...m, dismissed: [...(m.dismissed || []), proposalId] } : m) }))} onSource={field => { if (guard()) { setSelected(field); finish('source'); } }} onLocate={locate} onCopy={copy} onRetry={retryMessage} onModel={changeModel} />
        <Canvas active={!page} doc={doc} selected={selected} edit={edit} onSelect={selectField} onEdit={startEdit} onEditChange={draft => setEdit(e => ({ ...e, ...draft }))} onSaveEdit={saveEdit} onCancelEdit={() => setEdit(null)} onAsk={field => { setSelected(field); setDesignOpen(false); setFocus(false); setMobileView('chat'); setFocusKey(k => k + 1); }} onSource={field => { setSelected(field); open('source'); }} onOpen={open} focus={focus} onFocus={() => setFocus(!focus)} enabled={enabled} designOpen={designOpen} />
      </SplitWorkspace>
      </div>
      <div className="workspace-page-host" hidden={!page} inert={conflict || undefined}>
    {page === 'account' ? <AccountPage account={account} workspace={workspace} onBack={()=>navigate(null)}/> : null}
    {page === 'projects' ? <ProjectsPage busy={!!busyId} onOpenJob={() => open('job')} onConfigure={() => open('settings')} library={state.library} doc={doc} settings={state.settings} onBack={() => navigate(null)} onSaveProject={p => setState(s => ({ ...s, library: [...s.library.filter(old => old.id !== p.id), p] }))} onApply={applyProjects} onArchive={(id, archived) => setState(s => ({ ...s, library: s.library.map(p => p.id === id ? { ...p, archived } : p) }))} /> : null}
    {page === 'job' ? <JobPage job={doc.job} onBack={() => navigate(null)} onSave={(job, next = null) => { stop(); changeDoc(d => ({ ...d, job, title: d.title === d.job.title + ' · 定向简历' ? job.title + ' · 定向简历' : d.title, resume: { ...d.resume, target: d.resume.target === d.job.title ? job.title : d.resume.target }, updatedAt: Date.now() })); finish(next); notify('目标岗位已更新'); }} /> : null}
    {page === 'profile' ? <ProfilePage profile={state.profile} onBack={() => navigate(null)} onSave={profile => { setState(s => ({ ...s, profile })); finish(null); notify('个人资料已保存，新建简历时将自动带入'); }} /> : null}
    {page === 'new' ? <NewDocumentPage library={state.library} onBack={() => navigate(null)} onCreate={(job, projects) => { stop(); const next = makeDocument({ job, projects, profile: state.profile }); setState(s => ({ ...s, documents: [...s.documents, next], activeId: next.id })); finish(null); setSelected(null); setFocus(false); setMobileView('chat'); notify('新简历已创建'); }} /> : null}
    {page === 'settings' ? <SettingsPage modelServiceAvailable={account?.health?.cloudEnabled !== false && (account?.health?.mode !== 'production' || workspace.cloud)} cloudAccount={workspace.cloud ? account.owner.id : null} state={state} onBack={() => navigate(null)} onSave={settings => { stop(); setState(s => ({ ...s, settings })); finish(null); notify('设置已保存'); }} notify={notify} onImport={importBackup} /> : null}
    {page === 'versions' ? <VersionsPage doc={doc} onBack={() => navigate(null)} onSave={saveVersion} onRestore={version => { stop(); changeDoc(d => ({ ...mutateResume(d, clone(version.resume), '恢复版本'), job: clone(version.job || d.job), versions: [...d.versions, { id: uid(), name: '恢复前自动保存', time: Date.now(), resume: clone(d.resume), job: clone(d.job) }] })); finish(null); setSelected(null); notify('已恢复版本，原草稿已另存'); }} /> : null}
    {page === 'review' ? <ReviewPage doc={doc} onBack={() => navigate(null)} onApply={apply} onLocate={locate} /> : null}
    {page === 'source' ? <SourcePage doc={doc} selected={selected} onBack={() => navigate(null)} /> : null}
    {page === 'export' ? <ExportPage doc={doc} onBack={() => navigate(null)} notify={notify} onPrint={() => { finish(null); setSelected(null); requestAnimationFrame(() => requestAnimationFrame(() => window.print())); }} /> : null}
    {page === 'rename' ? <RenamePage doc={doc} onBack={() => navigate(null)} onSave={title => { changeDoc(d => ({ ...d, title })); finish(null); }} /> : null}
      </div>
    </div>
    {toast ? <div className="toast" role="status"><IconCheck size={16} /><span>{toast}</span><IconButton label="关闭提示" onClick={() => setToast('')}><IconX size={14} /></IconButton></div> : null}
  </main></PageNavigationContext.Provider>;
}
