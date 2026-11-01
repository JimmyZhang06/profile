import { useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconCheck, IconEye, IconMenu2, IconX } from '@tabler/icons-react';
import { Sidebar } from './components/Sidebar.jsx';
import { Chat } from './components/Chat.jsx';
import { Canvas } from './components/Canvas.jsx';
import { ResumeDesignPanel } from './components/ResumeDesignPanel.jsx';
import { WorkspaceHeader } from './components/WorkspaceHeader.jsx';
import { SplitWorkspace } from './components/SplitWorkspace.jsx';
import { JobPage, NewDocumentPage, SettingsPage, VersionsPage, ReviewPage, SourcePage, ExportPage, RenamePage } from './components/Pages.jsx';
import { LibraryPage } from './components/LibraryPage.jsx';
import { SelectedExperiencePage } from './components/ExperiencePreview.jsx';
import { DeleteDocumentPage, DocumentTrashPage, EmptyDocuments } from './components/DocumentTrash.jsx';
import { Button, IconButton } from './components/ui/index.jsx';
import { AccountPage } from './components/account/AccountPage.jsx';
import { cloudRequest } from './lib/cloudClient.js';
import { useTheme } from './hooks/useTheme.js';
import { useMediaQuery } from './hooks/useMediaQuery.js';
import { PageNavigationContext, usePageNavigation } from './hooks/usePageNavigation.js';
import { acceptedProposal, clone, downloadFile, fieldLabel, fieldValue, makeDocument, mutateResume, proposalState, setField, uid, undoDocument, validWorkspace } from './lib/workspace.js';
import { runAssistant } from './lib/assistant.js';
import { createTypewriter } from './lib/typewriter.js';
import { prepareProjectSelection } from './lib/projects.js';
import { marksForField } from './lib/richText.js';
import { mergeImportedWorkspace } from './lib/cloudWorkspace.js';
import { applyProfileSelection } from './lib/profile.js';
import { getResumeDesign } from './lib/resumeDesign.js';
import { activeDocument, moveDocumentToTrash, restoreDocument } from './lib/documents.js';

export function App({ workspace, account }) {
  const theme = useTheme();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const { state, setState, saveState, error, conflict } = workspace;
  const [catalog, setCatalog] = useState(null);
  const [emptyDoc] = useState(() => ({...makeDocument(), title: '尚未创建简历'}));
  const currentDoc = activeDocument(state), doc = currentDoc || emptyDoc;
  const { page, pending, registerDirty, request, navigate, finish, discard, stay } = usePageNavigation();
  const [selected, setSelected] = useState(null), [edit, setEdit] = useState(null), [focus, setFocus] = useState(false), [mobileView, setMobileView] = useState('chat'), [busyId, setBusyId] = useState(null), [toast, setToast] = useState(''), [focusKey, setFocusKey] = useState(0);
  const [designOpen, setDesignOpen] = useState(false);
  const [mobileDesignPreview, setMobileDesignPreview] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const sidebarOpen = isMobile ? mobileNavigationOpen : state.ui.sidebar;
  const navigationTrigger = useRef(null), navigationWasOpen = useRef(false);
  const task = useRef(null), timer = useRef(null), workArea = useRef(null), latest = useRef(state);
  latest.current = state;
  const enabled = state.settings.enabled && state.settings.capabilities.rewrite;
  const updateDoc = (id, change) => setState(s => ({ ...s, documents: s.documents.map(d => d.id === id && !d.archived ? change(d) : d) }));
  const changeDoc = change => updateDoc(doc.id, change);
  function notify(message) { clearTimeout(timer.current); setToast(message); timer.current = setTimeout(() => setToast(''), 4200); }
  function guard() { if (edit) { notify('请先保存或取消正在编辑的文字'); return false; } if (conflict) return false; return true; }
  function closeMobileNavigation() { setMobileNavigationOpen(false); }
  function openNavigation() { navigationTrigger.current = document.activeElement; setMobileNavigationOpen(true); }
  useEffect(() => {
    if (!isMobile) return;
    if (mobileNavigationOpen) document.querySelector('.sidebar-top > .icon-button')?.focus({ preventScroll: true });
    else if (navigationWasOpen.current && (document.activeElement === document.body || !document.activeElement?.getClientRects().length)) {
      const target = navigationTrigger.current?.getClientRects().length ? navigationTrigger.current : workArea.current?.querySelector('.mobile-navigation-button');
      target?.focus({ preventScroll: true });
    }
    navigationWasOpen.current = mobileNavigationOpen;
    const close = event => { if (event.key === 'Escape' && mobileNavigationOpen) { event.preventDefault(); setMobileNavigationOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [isMobile, mobileNavigationOpen]);
  useEffect(() => { if (pending) workArea.current?.querySelector('.page-leave-notice button')?.focus({ preventScroll: true }); }, [pending]);
  function open(name) {
    closeMobileNavigation();
    if (!guard() || name === page) return;
    if (!currentDoc && ['job', 'versions', 'review', 'source', 'experience', 'export', 'rename', 'delete'].includes(name)) name = 'new';
    request(() => {
      finish(name);
      if (window.matchMedia('(min-width: 761px) and (max-width: 1180px)').matches) setState(s => ({ ...s, ui: { ...s.ui, sidebar: false } }));
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
    const titles = { account: '账号与安全', library: '资料库', projects: '资料库', job: '目标岗位', profile: '资料库', new: '新建简历', settings: '设置', versions: '版本记录', review: '修改记录', source: '原始依据', export: '导出简历', rename: '重命名简历', delete: '删除简历', trash: '回收站' };
    document.title = page ? (page === 'experience' ? '完整经历预览' : titles[page]) + ' · 履历' : '履历 · 简历工作空间';
    if (previousPage.current && !page) workArea.current?.querySelector(previousPage.current === 'experience' ? '.composer-reference' : '.document-title-menu button')?.focus({ preventScroll: true });
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
  function selectDocument(id, destination = null) {
    closeMobileNavigation();
    if (!guard() || !state.documents.some(d => d.id === id && !d.archived)) return;
    request(() => { stop(); setState(s => ({ ...s, activeId: id })); setSelected(null); setEdit(null); setFocus(false); setDesignOpen(false); setMobileView('chat'); finish(destination); });
  }
  function trashCurrentDocument() {
    if (!currentDoc || !guard()) return;
    stop(); setState(s => moveDocumentToTrash(s, doc.id));
    setSelected(null); setEdit(null); setFocus(false); setDesignOpen(false); setMobileView('chat'); finish(null);
    notify('已移入回收站，可随时恢复');
  }
  function restoreDeletedDocument(id) {
    if (!guard()) return;
    stop(); setState(s => restoreDocument(s, id));
    setSelected(null); setEdit(null); setFocus(false); setDesignOpen(false); setMobileView('chat'); finish(null);
    notify('简历已恢复，正文、对话和版本记录均保留');
  }
  function selectField(field) { if (!guard()) return; setSelected(field); }
  function startEdit(field) { if (!guard()) return; const value = fieldValue(doc.resume, field); setSelected(field); setEdit({ field, value, marks: marksForField(doc.resume, field, value) }); }
  function saveEdit() { if (!edit) return; changeDoc(d => mutateResume(d, setField(d.resume, edit.field, edit.value, edit.marks), '编辑' + fieldLabel(d.resume, edit.field))); setEdit(null); notify('文字与格式已保存'); }
  function changeDesign(design) { if (guard() && JSON.stringify(design) !== JSON.stringify(getResumeDesign(doc.resume))) changeDoc(d => mutateResume(d, { ...d.resume, design }, '调整排版与模板')); }
  function closeDesign() { if (!guard()) return; setDesignOpen(false); workArea.current?.querySelector(isMobile ? '.mobile-design-tab' : '.workspace-design-toggle')?.focus({ preventScroll: true }); }
  function toggleDesign() { if (designOpen) closeDesign(); else if (guard()) { setDesignOpen(true); setMobileDesignPreview(false); setMobileView('document'); } }
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
    const incoming = {...clone(backup), documents: backup.documents.map(d => ({...clone(d), title: d.title + '（导入）'}))};
    setState(s => mergeImportedWorkspace(s, incoming)); notify('备份已导入，资料已合并，现有简历保持不变');
  }
  function saveProfile(profile, expected) {
    if (JSON.stringify(latest.current.profile) !== expected) {notify('资料已更新，请先载入最新内容'); return false;}
    setState(s => ({...s, profile})); return true;
  }
  function applyProfile(profile, selection, groups) {
    stop(); changeDoc(d => mutateResume(d, applyProfileSelection(d.resume, profile, selection, groups), '从资料库更新简历'));
    setSelected(null); finish(null); setMobileView('document'); notify('所选资料已更新到当前简历，可以撤销');
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
  return <PageNavigationContext.Provider value={{ registerDirty, request, stay, openNavigation, documentTitle: currentDoc?.title || '' }}><main className={'app-shell ' + (page ? 'has-page ' : '') + (sidebarOpen ? 'sidebar-open ' : '')}>
    <Sidebar sidebarOpen={sidebarOpen} isMobile={isMobile} saveState={saveState} account={account} state={state} page={page} onHome={() => { closeMobileNavigation(); if (guard()) navigate(null); }} onToggle={() => isMobile ? setMobileNavigationOpen(value => !value) : setState(s => ({ ...s, ui: { ...s.ui, sidebar: !s.ui.sidebar } }))} onNew={() => open('new')} onOpen={open} onSelect={selectDocument} />
    <div className={'work-area mobile-' + mobileView + (focus ? ' canvas-focused' : '')} ref={workArea}>
      {(error || conflict) ? <div className={'workspace-alert' + (workspace.remoteConflict ? ' sync-conflict' : '')} role="alert"><span>{workspace.remoteConflict ? '另一台设备修改了资料。双方内容已保留，请选择如何继续。' : conflict ? '另一窗口更新了这份工作空间。请重新载入后继续。' : error}</span>{workspace.remoteConflict ? <><div className="sync-conflict-versions"><div><strong>这台设备</strong><p>{state.documents.length} 份简历 · {state.library.length} 个项目</p><small>{state.documents.slice(0,3).map(d=>d.title).join('、')}</small></div><div><strong>云端版本 {workspace.remoteConflict.revision}</strong><p>{workspace.remoteConflict.state.documents.length} 份简历 · {workspace.remoteConflict.state.library.length} 个项目</p><small>{workspace.remoteConflict.state.documents.slice(0,3).map(d=>d.title).join('、')}</small></div></div><Button onClick={()=>workspace.resolveConflict('both')}>两个版本都保留</Button><Button variant="secondary" onClick={()=>workspace.resolveConflict('local')}>继续使用本机版本</Button><Button variant="secondary" onClick={()=>workspace.resolveConflict('cloud')}>使用云端版本</Button></> : null}<Button variant="secondary" onClick={() => downloadFile('履历恢复备份.json', JSON.stringify(state), 'application/json')}>导出当前内容</Button>{conflict && !workspace.cloud ? <Button onClick={() => window.location.reload()}>重新载入</Button> : null}{workspace.cloud && !conflict ? <Button onClick={()=>saveState==='expired'?open('account'):workspace.retry()}>{saveState==='expired'?'重新登录':'重试同步'}</Button> : null}</div> : null}
      {pending ? <div className="page-leave-notice" role="alert"><span>当前页面还有未保存的内容。</span><Button variant="secondary" onClick={stay}>继续编辑</Button><Button variant="ghost" onClick={discard}>放弃更改并离开</Button></div> : null}
      {!page && !currentDoc ? <><header className="mobile-empty-header"><IconButton label="打开简历列表" onClick={openNavigation}><IconMenu2 size={21} /></IconButton><span>我的工作空间</span></header><EmptyDocuments onNew={() => open('new')} onTrash={() => open('trash')} count={state.documents.filter(d => d.archived).length} /></> : null}
      <div className="editor-workspace" hidden={!!page || !currentDoc} inert={conflict || undefined}>
      <WorkspaceHeader doc={doc} saveState={saveState} edit={edit} isMobile={isMobile} mobileView={mobileView} onMobileView={view => { if (guard()) { setDesignOpen(false); setMobileView(view); } }} onNavigation={openNavigation} onOpen={open} onUndo={() => changeDoc(d => undoDocument(d))} onRedo={() => changeDoc(d => undoDocument(d, true))} designOpen={designOpen} onDesignToggle={toggleDesign} />
      <SplitWorkspace ratio={state.ui.chatRatio} onRatioChange={chatRatio => setState(s => ({ ...s, ui: { ...s.ui, chatRatio } }))} mobileDesignPreview={mobileDesignPreview} inert={conflict || undefined} tools={designOpen ? <ResumeDesignPanel catalog={catalog} resume={doc.resume} disabled={!!edit} onChange={changeDesign} onClose={closeDesign} /> : null}>
        <Chat active={!page && !!currentDoc && !designOpen} doc={doc} settings={state.settings} selected={selected} busy={busyId === doc.id} focusKey={focusKey} onSend={send} onStop={stop} onInput={text => changeDoc(d => ({ ...d, composer: text }))} onRemoveSelection={() => selectField(null)} onOpen={open} onApply={apply} onDismiss={(id, proposalId) => changeDoc(d => ({ ...d, messages: d.messages.map(m => m.id === id ? { ...m, dismissed: [...(m.dismissed || []), proposalId] } : m) }))} onSource={field => { if (guard()) { setSelected(field); finish('source'); } }} onLocate={locate} onCopy={copy} onRetry={retryMessage} onModel={changeModel} />
        <Canvas active={!page && !!currentDoc} doc={doc} selected={selected} edit={edit} onSelect={selectField} onEdit={startEdit} onEditChange={draft => setEdit(e => ({ ...e, ...draft }))} onSaveEdit={saveEdit} onCancelEdit={() => setEdit(null)} onAsk={field => { setSelected(field); setDesignOpen(false); setFocus(false); setMobileView('chat'); setFocusKey(k => k + 1); }} onSource={field => { setSelected(field); open('source'); }} onOpen={open} focus={focus} onFocus={() => setFocus(!focus)} enabled={enabled} designOpen={designOpen} />
      </SplitWorkspace>
      {designOpen && !edit ? <footer className="mobile-design-actions"><Button variant="secondary" onClick={() => setMobileDesignPreview(value => !value)}>{mobileDesignPreview ? <IconArrowLeft size={17} /> : <IconEye size={17} />}{mobileDesignPreview ? '返回设置' : '预览效果'}</Button><Button onClick={closeDesign}><IconCheck size={17} />完成排版</Button></footer> : null}
      </div>
      <div className="workspace-page-host" hidden={!page} inert={conflict || undefined}>
    {page === 'account' ? <AccountPage account={account} workspace={workspace} onBack={()=>navigate(null)}/> : null}
    {page === 'delete' && currentDoc ? <DeleteDocumentPage doc={doc} onBack={() => navigate(null)} onConfirm={trashCurrentDocument} /> : null}
    {page === 'trash' ? <DocumentTrashPage documents={state.documents} onBack={() => navigate(null)} onRestore={restoreDeletedDocument} /> : null}
    {['library', 'profile', 'projects'].includes(page) ? <LibraryPage hasActiveDocument={!!currentDoc} key={page + doc.id} profile={state.profile} library={state.library} doc={doc} saveState={saveState} initialTab={page === 'projects' ? 'projects' : 'basics'} onBack={() => navigate(null)} onSaveProfile={saveProfile} onApplyProfile={applyProfile} projectProps={{hasActiveDocument: !!currentDoc, busy: !!busyId, settings: state.settings, onOpenJob: () => open('job'), onConfigure: () => open('settings'), onSaveProject: p => setState(s => ({...s, library: s.library.some(old => old.id === p.id) ? s.library.map(old => old.id === p.id ? p : old) : [...s.library, p]})), onApply: applyProjects, onArchive: (id, archived) => setState(s => ({...s, library: s.library.map(p => p.id === id ? {...p, archived} : p)}))}} /> : null}
    {page === 'job' ? <JobPage job={doc.job} onBack={() => navigate(null)} onSave={(job, next = null) => { stop(); changeDoc(d => ({ ...d, job, title: d.title === d.job.title + ' · 定向简历' ? job.title + ' · 定向简历' : d.title, resume: { ...d.resume, target: d.resume.target === d.job.title ? job.title : d.resume.target }, updatedAt: Date.now() })); finish(next); notify('目标岗位已更新'); }} /> : null}
    {page === 'new' ? <NewDocumentPage profile={state.profile} library={state.library} onBack={() => navigate(null)} onCreate={(job, projects, personalProfile) => { stop(); const next = makeDocument({ job, projects, profile: personalProfile || state.profile }); setState(s => ({ ...s, documents: [...s.documents, next], activeId: next.id })); finish(null); setSelected(null); setFocus(false); setMobileView('chat'); notify('新简历已创建'); }} /> : null}
    {page === 'settings' ? <SettingsPage theme={theme} modelServiceAvailable={account?.health?.cloudEnabled !== false && (account?.health?.mode !== 'production' || workspace.cloud)} cloudAccount={workspace.cloud ? account.owner.id : null} state={state} onBack={() => navigate(null)} onSave={settings => { stop(); setState(s => ({ ...s, settings })); finish(null); notify('设置已保存'); }} notify={notify} onImport={importBackup} /> : null}
    {page === 'versions' ? <VersionsPage doc={doc} onBack={() => navigate(null)} onSave={saveVersion} onRestore={version => { stop(); changeDoc(d => ({ ...mutateResume(d, clone(version.resume), '恢复版本'), job: clone(version.job || d.job), versions: [...d.versions, { id: uid(), name: '恢复前自动保存', time: Date.now(), resume: clone(d.resume), job: clone(d.job) }] })); finish(null); setSelected(null); notify('已恢复版本，原草稿已另存'); }} /> : null}
    {page === 'review' ? <ReviewPage doc={doc} onBack={() => navigate(null)} onApply={apply} onLocate={locate} /> : null}
    {page === 'source' ? <SourcePage doc={doc} selected={selected} onBack={() => navigate(null)} /> : null}
    {page === 'experience' ? <SelectedExperiencePage doc={doc} selected={selected} onBack={() => navigate(null)} /> : null}
    {page === 'export' ? <ExportPage doc={doc} onBack={() => navigate(null)} notify={notify} onPrint={() => { finish(null); setSelected(null); requestAnimationFrame(() => requestAnimationFrame(() => window.print())); }} /> : null}
    {page === 'rename' ? <RenamePage key={doc.id} doc={doc} onBack={() => navigate(null)} onSave={title => { changeDoc(d => ({ ...d, title })); finish(null); }} /> : null}
      </div>
    </div>
    {toast ? <div className="toast" role="status"><IconCheck size={16} /><span>{toast}</span><IconButton label="关闭提示" onClick={() => setToast('')}><IconX size={14} /></IconButton></div> : null}
  </main></PageNavigationContext.Provider>;
}
