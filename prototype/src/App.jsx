import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconArrowLeft, IconCheck, IconEye, IconMenu2, IconX } from '@tabler/icons-react';
import { Sidebar } from './components/Sidebar.jsx';
import { Chat } from './components/Chat.jsx';
import { Canvas } from './components/Canvas.jsx';
import { ResumeDesignPanel } from './components/ResumeDesignPanel.jsx';
import { WorkspaceHeader } from './components/WorkspaceHeader.jsx';
import { SplitWorkspace } from './components/SplitWorkspace.jsx';
import { JobPage, NewDocumentPage, SettingsPage, VersionsPage, ReviewPage, SourcePage, RenamePage } from './components/Pages.jsx';
import { TailorPage } from './components/TailorPage.jsx';
import { LibraryPage } from './components/LibraryPage.jsx';
import { SelectedExperiencePage } from './components/ExperiencePreview.jsx';
import { DeleteDocumentPage, DocumentTrashPage, EmptyDocuments } from './components/DocumentTrash.jsx';
import { Button, IconButton, Page } from './components/ui/index.jsx';
import { AccountPage } from './components/account/AccountPage.jsx';
import { cloudRequest } from './lib/cloudClient.js';
import { useTheme } from './hooks/useTheme.js';
import { useMediaQuery } from './hooks/useMediaQuery.js';
import { PageNavigationContext, usePageNavigation } from './hooks/usePageNavigation.js';
import { acceptedProposal, assistantFieldIds, clone, downloadFile, editManuscript, fieldLabel, fieldValue, makeDocument, mutateResume, proposalState, uid, undoDocument, validWorkspace } from './lib/workspace.js';
import { writingConnectionId } from './lib/writingService.js';
import { runAssistant } from './lib/assistant.js';
import { createTypewriter } from './lib/typewriter.js';
import { moveProjectPoint, prepareProjectSelection } from './lib/projects.js';
import { marksForField } from './lib/richText.js';
import { mergeImportedWorkspace } from './lib/cloudWorkspace.js';
import { applyProfileSelection, profileHasContent } from './lib/profile.js';
import { getResumeDesign } from './lib/resumeDesign.js';
import { chatDeliveryJob, jobFromFragment } from './lib/deliverySelection.js';
import { reviewValue, setReviewValue } from './lib/deliveryReview.js';
import { activeDocument, emptyDocumentTrash, moveDocumentToTrash, opensOnPaper, restoreDocument } from './lib/documents.js';
import { opportunityResumeRef, snapshotOpportunity, jobForOpportunity, resumesForOpportunity } from './lib/opportunityResume.js';
import { careerPages } from '../shared/careerPaths.mjs';
import { WorkspaceLink } from './components/ui/WorkspaceLink.jsx';
import './features/opportunities/opportunities.css';

const DeliveryExportPage = lazy(() => import('./components/DeliveryExportPage.jsx').then((m) => ({default:m.DeliveryExportPage})));
const ResumeImportPage = lazy(() => import('./components/ResumeImportPage.jsx'));
const careerViews = {
  opportunities: lazy(() => import('./features/opportunities/OpportunitiesPage.jsx')),
  offers: lazy(() => import('./features/offers/OffersPage.jsx')),
  market: lazy(() => import('./features/market/MarketPage.jsx')),
};

export function App({ workspace, account }) {
  const theme = useTheme();
  const [incomingJob] = useState(() => jobFromFragment(window.location.hash));
  const [opportunity,setOpportunity] = useState(null), [opportunityError,setOpportunityError] = useState(''), [opportunitySource,setOpportunitySource] = useState(null);
  const [tailorJob, setTailorJob] = useState(incomingJob);
  const [tailorOptions, setTailorOptions] = useState(null);
  const [tailorInstance, setTailorInstance] = useState(0), [tailorReturn, setTailorReturn] = useState(null);
  const isMobile = useMediaQuery('(max-width: 760px)');
  const { state, setState, saveState, error, conflict } = workspace;
  const [catalog, setCatalog] = useState(null);
  const [services, setServices] = useState(null);
  const [importFrom,setImportFrom] = useState('tailor');
  const [tailorFileId,setTailorFileId] = useState(null);
  const [emptyDoc] = useState(() => ({...makeDocument(), title: '尚未创建简历'}));
  const currentDoc = activeDocument(state), doc = currentDoc || emptyDoc;
  const hasProfile = profileHasContent(state.profile);
  const sampleProfile = !hasProfile && !!doc.example && !state.library.some((p) => !p.example && !p.archived);
  const useFileMaterials = doc.origin === 'file' && tailorFileId === doc.id;
  const candidateLibrary = useFileMaterials ? [...doc.resume.sources,...state.library.filter(p => !doc.resume.projectIds.includes(p.id))] : state.library;
  const { page, href, pending, registerDirty, request, navigate, openLink, finish, discard, stay } = usePageNavigation(incomingJob ? 'tailor' : null);
  const route = useMemo(() => new URL(href, location.origin), [href]);
  const opportunityRef = useMemo(() => page === 'opportunity-start' ? opportunityResumeRef(route.search) : null, [page, route.search]);
  const CareerView = careerViews[page];
  const opportunityRequest = useRef(null);
  useEffect(() => {
    setOpportunity(null); setOpportunityError('');
    if(!opportunityRef) return;
    const controller=new AbortController();
    opportunityRequest.current = controller;
    cloudRequest('public/opportunities/'+opportunityRef.id,{signal:controller.signal}).then(value=>setOpportunity(value.item)).catch(e=>{if(e.name!=='AbortError')setOpportunityError(e.message);});
    return()=>controller.abort();
  },[opportunityRef,account.owner?.id]);
  useEffect(() => {
    if (incomingJob && window.location.hash.startsWith('#tailor?'))
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, [incomingJob]);
  const [selected, setSelected] = useState(null), [edit, setEdit] = useState(null), [focus, setFocus] = useState(false), [mobileView, setMobileView] = useState(() => opensOnPaper(doc) ? 'document' : 'chat'), [busyId, setBusyId] = useState(null), [toast, setToast] = useState(''), [focusKey, setFocusKey] = useState(0);
  const [designOpen, setDesignOpen] = useState(false);
  const [mobileDesignPreview, setMobileDesignPreview] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(!workspace.cloud && !!account.user);
  useEffect(() => { if (!workspace.cloud && account.user) setAccountOpen(true); }, [workspace.cloud, account.user?.id]);
  const accountOrigin = useRef(null), accountCloseRequest = useRef(null);
  const registerAccountClose = useCallback(handler => { accountCloseRequest.current = handler; return () => { accountCloseRequest.current = null; }; }, []);
  const closeAccount = useCallback((restore = true) => {
    setAccountOpen(false);
    if (!restore) return;
    const origin = accountOrigin.current;
    if (isMobile && origin?.navigation) setMobileNavigationOpen(true);
    requestAnimationFrame(() => {
      const target = origin?.trigger?.getClientRects().length ? origin.trigger : document.querySelector('.mobile-navigation-button, .sidebar-account');
      target?.focus({ preventScroll: true });
    });
  }, [isMobile]);
  const sidebarOpen = isMobile ? mobileNavigationOpen : state.ui.sidebar;
  const navigationTrigger = useRef(null), navigationWasOpen = useRef(false);
  const task = useRef(null), timer = useRef(null), workArea = useRef(null), latest = useRef(state);
  latest.current = state;
  const settings = workspace.cloud && services !== null ? { ...state.settings, connections: services } : state.settings;
  const enabled = settings.enabled && settings.capabilities.rewrite;
  const preferredChat = doc.chatConnectionId ?? (doc.delivery?.mode === 'local' ? 'offline' : doc.delivery?.modelId);
  const chatSettings = { ...settings, bindings: { ...settings.bindings,
    rewrite: writingConnectionId(settings, { preferredId: preferredChat }) } };
  const updateDoc = (id, change) => setState(s => ({ ...s, documents: s.documents.map(d => d.id === id && !d.archived ? change(d) : d) }));
  const changeDoc = change => updateDoc(doc.id, change);
  function notify(message) { clearTimeout(timer.current); setToast(message); timer.current = setTimeout(() => setToast(''), 4200); }
  function guard() { if (conflict) return false; if (edit) setEdit(null); return true; }
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
    const close = event => { if (event.key === 'Escape' && !event.defaultPrevented && mobileNavigationOpen) { event.preventDefault(); setMobileNavigationOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [isMobile, mobileNavigationOpen]);
  useEffect(() => { if (pending) workArea.current?.querySelector('.page-leave-notice button')?.focus({ preventScroll: true }); }, [pending]);
  function withAccountClosed(action) {
    if (!accountOpen) return action();
    const next = () => { closeAccount(false); action(); };
    if (accountCloseRequest.current) accountCloseRequest.current(next); else next();
  }
  function open(name) {
    if (name === 'account') {
      if (accountOpen) return accountCloseRequest.current?.();
      accountOrigin.current = { trigger: document.activeElement, navigation: mobileNavigationOpen };
      closeMobileNavigation(); setAccountOpen(true); return;
    }
    withAccountClosed(() => openPage(name));
  }
  function openPage(name) {
    closeMobileNavigation();
    if (!guard() || (name === page && (!Object.hasOwn(careerPages, name) || href === '/' + name))) return;
    if (!currentDoc && ['job', 'versions', 'review', 'source', 'experience', 'export', 'rename', 'delete'].includes(name)) name = 'new';
    request(() => {
      if (Object.hasOwn(careerPages, name)) {
        finish(name);
        return;
      }
      const newJob = name === 'new';
      if (newJob || name === 'tailor') setTailorFileId(doc.origin === 'file' && (!newJob || !hasProfile) ? doc.id : null);
      if (newJob) setTailorInstance((n) => n + 1);
      if (newJob || name === 'tailor') setOpportunitySource(newJob ? null : doc.opportunitySource || null);
      setTailorReturn(name === 'tailor' && page === 'export' ? 'export' : null);
      setTailorJob(newJob ? {company: '', title: '', text: ''} : null);
      setTailorOptions(null);
      if (newJob || name === 'tailor') stop();
      finish(newJob ? 'tailor' : name);
      if (window.matchMedia('(min-width: 761px) and (max-width: 1180px)').matches) setState(s => ({ ...s, ui: { ...s.ui, sidebar: false } }));
    });
  }
  function visitFromTailor(page, job, options) {
    setTailorJob(job);
    setTailorOptions(options);
    finish(page);
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
    const titles = { ...careerPages, 'opportunity-start':'用岗位制作简历', account: '账号与安全', library: '资料库', projects: '资料库', job: '目标岗位', tailor: '按 JD 生成', profile: '资料库', new: '新建简历', 'file-import':'导入已有简历', settings: '设置', versions: '版本记录', review: '修改记录', source: '原始依据', export: '导出简历', rename: '重命名简历', delete: '删除简历', trash: '回收站' };
    document.title = accountOpen ? '账号与安全 · 履历' : page ? (page === 'experience' ? '完整经历预览' : titles[page]) + ' · 履历' : '履历 · 简历工作空间';
    if (previousPage.current && !page) workArea.current?.querySelector(previousPage.current === 'experience' ? '.composer-reference' : '.document-title-menu button')?.focus({ preventScroll: true });
    previousPage.current = page;
  }, [page, accountOpen]);
  useEffect(() => {
    if (!workspace.cloud || !workspace.ready) return;
    let cancelled = false;
    const options = { ownerId: account.owner.id };
    cloudRequest('cloud/connections', options).then(({ connections }) => {
      if (!cancelled) setServices(connections);
    }).catch(() => { if (!cancelled) setServices(current => current ?? latest.current.settings.connections); });
    cloudRequest('cloud/templates', options).then(({ items }) => { if (!cancelled) setCatalog(items); })
      .catch(() => { /* Built-in templates remain available. */ });
    return () => { cancelled = true; };
  }, [workspace.cloud, workspace.ready, page === 'settings', account.owner?.id, account.user?.id]);
  useEffect(() => {
    const broken = state.documents.some(d => d.messages.some(m => m.status === 'streaming'));
    if (broken && !task.current) setState(s => ({ ...s, documents: s.documents.map(d => ({ ...d, messages: d.messages.map(m => m.status === 'streaming' ? { ...m, status: 'stopped', proposals: [] } : m) })) }));
  }, []);
  async function send(text, retry = null, prepared = null, materialApproval = null) {
    if (!enabled || busyId || !text.trim() || conflict) return;
    const targetJob = !retry && !prepared && !materialApproval && !selected && chatDeliveryJob(text, doc.job);
    if (targetJob) {
      if (!guard()) return;
      setTailorFileId(doc.origin === 'file' ? doc.id : null);
      setTailorJob(targetJob);
      setTailorOptions(null);
      finish('tailor');
      return;
    }
    const id = retry?.id || uid(), controller = new AbortController(), requestDoc = clone(prepared || doc);
    const choice = prepared ? null : retry?.selectedField || selected;
    const requestSelection = assistantFieldIds(requestDoc.resume).includes(choice) ? choice : null;
    const settings = chatSettings;
    const connectionId = settings.bindings.rewrite;
    const snapshot = { id, role: 'assistant', status: 'streaming', text: '', prompt: text, selectedField: requestSelection, offline: connectionId === 'offline', connectionId, materialOptimization: !!materialApproval };
    const user = { id: uid(), role: 'user', status: 'done', text, connectionId, materialOptimization: !!materialApproval, selected: requestSelection ? { field: requestSelection, label: fieldLabel(doc.resume, requestSelection) } : null };
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
      const result = await runAssistant({ prompt: text, doc: requestDoc, selected: requestSelection, library: state.library, settings: { ...settings, cloudAccount: workspace.cloud ? account.owner.id : null }, materialApproval, signal: controller.signal, onText: writer.push });
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
    request(() => { stop(); setState(s => ({ ...s, activeId: id })); setSelected(null); setEdit(null); setFocus(false); setDesignOpen(false); setMobileView(opensOnPaper(state.documents.find((d) => d.id === id)) ? 'document' : 'chat'); finish(destination); });
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
  function saveFileImport(applyImport, archive, tailor = false) {
    if (!guard()) return false;
    const next = applyImport(latest.current);
    if (!validWorkspace(next) || (workspace.cloud && (next.documents.length > 100 || next.library.length > 500 || JSON.stringify(next).length > 8000000))) {
      throw Error('这次导入超出工作区容量，请减少资料或整理回收站。');
    }
    stop(); setState(applyImport);
    if(tailor || (importFrom==='tailor'&&opportunitySource)) {
      if(importFrom!=='tailor') {setTailorJob(null);setTailorOptions(null);setOpportunitySource(null);}
      setTailorFileId(next.activeId); setTailorInstance(n=>n+1); finish('tailor');
    } else finish(null);
    setSelected(null); setEdit(null); setDesignOpen(false); setFocus(false); setMobileView('document');
    notify(archive ? '简历已导入，资料库已补充' : '简历已导入，可以在纸面上继续修改');
    return true;
  }
  function selectField(field) { if (!guard()) return; setSelected(field); }
  function startEdit(field) {
    if (!guard()) return;
    const value = fieldValue(doc.resume,field);
    setSelected(field); setEdit({id:uid(),field,initial:value,value,marks:marksForField(doc.resume,field,value)});
  }
  function updateEdit(draft) {
    if (!edit || conflict) return;
    changeDoc((d) => editManuscript(d,edit,draft.value,draft.marks));
    setEdit((e) => e?.id === edit.id ? {...e,...draft} : e);
  }
  function cancelEdit() {
    if (edit && !conflict) changeDoc((d) => d.undo.at(-1)?.editSession === edit.id ? undoDocument(d) : d);
    setEdit(null);
  }
  function finishDelivery(next) {
    if(opportunitySource) next={...next,opportunitySource:clone(opportunitySource)};
    stop(); setState((s) => ({...s,documents:[...s.documents,next],activeId:next.id}));
    setOpportunitySource(null); setTailorJob(null); setTailorOptions(null); setSelected(null); setEdit(null); setFocus(false); setDesignOpen(false);
    setMobileView('document'); finish(null); notify('一页草稿已生成，点正文即可编辑');
  }
  async function startOpportunity() {
    setOpportunityError('');
    try {
      const {item}=await cloudRequest('public/opportunities/'+opportunityRef.id, {signal:opportunityRequest.current?.signal});
      if(item.version!==opportunity.version||item.status!=='open') {setOpportunity(item);throw Error('岗位状态或版本已更新，请重新核对。');}
      const source=snapshotOpportunity(item);setOpportunitySource(source);setTailorJob(jobForOpportunity(item));setTailorOptions(null);setTailorInstance(n=>n+1);setTailorFileId(null);stop();finish('tailor');
    } catch(e) {if(e.name!=='AbortError') setOpportunityError(e.message);}
  }
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
    else notify(options.regenerate ? '已按岗位关键词提取原文，可以继续编辑' : '项目资料已同步，已编辑的表达保留');
  }
  function retryMessage(message) {
    if (message.materialOptimization) { open('projects'); notify('这条回复使用了详细素材，请重新确认本次发送范围'); }
    else send(message.prompt, message);
  }
  function importBackup(backup) {
    if (!validWorkspace(backup)) throw new Error('不是可识别的履历备份文件');
    const incoming = {...clone(backup), documents: backup.documents.map(d => ({...clone(d), title: d.title + '（导入）'}))};
    setState(s => mergeImportedWorkspace(s, incoming)); notify('备份已导入，资料已合并，现有简历保持不变');
  }
  function saveProfile(profile, expected) {
    if (JSON.stringify(latest.current.profile) !== expected) {notify('资料已更新，请先载入最新内容'); return false;}
    setState(s => ({...s, profile})); return true;
  }
  function saveReviewedResume(resume, base) {
    const current = latest.current.documents.find((item) => item.id === doc.id && !item.archived);
    if (!current || conflict || (current.resume !== base && JSON.stringify(current.resume) !== JSON.stringify(base))) return false;
    if (JSON.stringify(resume) !== JSON.stringify(base)) {
      changeDoc((d) => d.resume === base || JSON.stringify(d.resume) === JSON.stringify(base) ? mutateResume(d, resume, '一页校稿') : d);
    }
    return true;
  }
  function rememberAvailability(value) {
    try {
      const profile = latest.current.profile;
      if (reviewValue(profile, '@availability') !== value) {
        // The form explicitly saves this one field. Never copy the current
        // resume or its tailored wording back into the source library.
        const next = setReviewValue(profile, '@availability', value);
        const {textStyles, ...personal} = next;
        if (!saveProfile(personal, JSON.stringify(profile))) return false;
      }
      notify('已保存到个人资料，下次投递会自动带入');
      return true;
    } catch (error) { notify(error.message); return false; }
  }
  function applyProfile(profile, selection, groups) {
    stop(); changeDoc(d => mutateResume(d, applyProfileSelection(d.resume, profile, selection, groups), '从资料库更新简历'));
    setSelected(null); finish(null); setMobileView('document'); notify('所选资料已更新到当前简历，可以撤销');
  }
  useEffect(() => {
    function key(event) {
      if (!(event.ctrlKey || event.metaKey) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable || page || accountOpen) return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (!edit && !conflict) updateDoc(latest.current.activeId, d => undoDocument(d, event.shiftKey)); }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); if (!edit) open('versions'); }
      if (event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); if (!edit) open('new'); }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [edit, conflict, page, accountOpen]);
  return <PageNavigationContext.Provider value={{ registerDirty, request, stay, openLink, openNavigation, documentTitle: currentDoc?.title || '' }}><main className={'app-shell ' + (page ? 'has-page ' : '') + (sidebarOpen ? 'sidebar-open ' : '')}>
    <Sidebar sidebarOpen={sidebarOpen} isMobile={isMobile} saveState={saveState} account={account} state={state} page={page} accountOpen={accountOpen} onHome={() => withAccountClosed(() => { closeMobileNavigation(); if (guard()) navigate(null); })} onToggle={() => isMobile ? setMobileNavigationOpen(value => !value) : setState(s => ({ ...s, ui: { ...s.ui, sidebar: !s.ui.sidebar } }))} onNew={() => open('new')} onOpen={open} onSelect={(id, destination) => withAccountClosed(() => selectDocument(id, destination))} />
    {isMobile && mobileNavigationOpen ? <button type="button" className="mobile-navigation-dismiss" aria-label="关闭工作区导航" onClick={closeMobileNavigation} /> : null}
    <div className={'work-area mobile-' + mobileView + (focus ? ' canvas-focused' : '')} ref={workArea} inert={isMobile && mobileNavigationOpen || undefined} aria-hidden={isMobile && mobileNavigationOpen || undefined}>
      <div className="workspace-content" inert={accountOpen || undefined} aria-hidden={accountOpen || undefined}>
      {(error || conflict) ? <div className={'workspace-alert' + (workspace.remoteConflict ? ' sync-conflict' : '')} role="alert"><span>{workspace.remoteConflict ? '另一台设备修改了资料。双方内容已保留，请选择如何继续。' : conflict ? '另一窗口更新了这份工作空间。请重新载入后继续。' : error}</span>{workspace.remoteConflict ? <><div className="sync-conflict-versions"><div><strong>这台设备</strong><p>{state.documents.length} 份简历 · {state.library.length} 个项目</p><small>{state.documents.slice(0,3).map(d=>d.title).join('、')}</small></div><div><strong>云端版本 {workspace.remoteConflict.revision}</strong><p>{workspace.remoteConflict.state.documents.length} 份简历 · {workspace.remoteConflict.state.library.length} 个项目</p><small>{workspace.remoteConflict.state.documents.slice(0,3).map(d=>d.title).join('、')}</small></div></div><Button onClick={()=>workspace.resolveConflict('both')}>两个版本都保留</Button><Button variant="secondary" onClick={()=>workspace.resolveConflict('local')}>继续使用本机版本</Button><Button variant="secondary" onClick={()=>workspace.resolveConflict('cloud')}>使用云端版本</Button></> : null}<Button variant="secondary" onClick={() => downloadFile('履历恢复备份.json', JSON.stringify(state), 'application/json')}>导出当前内容</Button>{conflict && !workspace.cloud ? <Button onClick={() => window.location.reload()}>重新载入</Button> : null}{workspace.cloud && !conflict ? <Button onClick={()=>saveState==='expired'?open('account'):workspace.retry()}>{saveState==='expired'?'重新登录':'重试同步'}</Button> : null}</div> : null}
      {pending ? <div className="page-leave-notice" role="alert"><span>当前页面还有未保存的内容。</span><Button variant="secondary" onClick={stay}>继续编辑</Button><Button variant="ghost" onClick={discard}>放弃更改并离开</Button></div> : null}
      {!page && !currentDoc ? <><header className="mobile-empty-header"><IconButton label="打开工作区导航" onClick={openNavigation}><IconMenu2 size={21} /></IconButton><span>我的工作空间</span></header><EmptyDocuments onNew={() => open('new')} onTrash={() => open('trash')} count={state.documents.filter(d => d.archived).length} /></> : null}
      <div className="editor-workspace" hidden={!!page || !currentDoc} inert={conflict || undefined}>
      <WorkspaceHeader doc={doc} saveState={saveState} edit={edit} isMobile={isMobile} mobileView={mobileView} onMobileView={view => { if (guard()) { setDesignOpen(false); setMobileView(view); } }} onNavigation={openNavigation} onOpen={open} onUndo={() => changeDoc(d => undoDocument(d))} onRedo={() => changeDoc(d => undoDocument(d, true))} designOpen={designOpen} onDesignToggle={toggleDesign} />
      <SplitWorkspace ratio={state.ui.chatRatio} onRatioChange={chatRatio => setState(s => ({ ...s, ui: { ...s.ui, chatRatio } }))} mobileDesignPreview={mobileDesignPreview} inert={conflict || undefined} tools={designOpen ? <ResumeDesignPanel catalog={catalog} resume={doc.resume} disabled={!!edit} onChange={changeDesign} onClose={closeDesign} /> : null}>
        <Chat active={!page && !!currentDoc && !designOpen} doc={doc} settings={chatSettings} selected={selected} busy={busyId === doc.id} focusKey={focusKey} onSend={send} onStop={stop} onInput={text => changeDoc(d => ({ ...d, composer: text }))} onRemoveSelection={() => selectField(null)} onOpen={open} onApply={apply} onDismiss={(id, proposalId) => changeDoc(d => ({ ...d, messages: d.messages.map(m => m.id === id ? { ...m, dismissed: [...(m.dismissed || []), proposalId] } : m) }))} onSource={field => { if (guard()) { setSelected(field); finish('source'); } }} onLocate={locate} onCopy={copy} onRetry={retryMessage} />
        <Canvas key={doc.id} active={!page && !!currentDoc} doc={doc} selected={selected} edit={edit} onSelect={selectField} onEdit={startEdit} onMovePoint={direction => { if (guard()) changeDoc(d => mutateResume(d,moveProjectPoint(d.resume,selected,direction),'调整项目要点顺序')); }} onEditChange={updateEdit} onSaveEdit={() => setEdit(null)} onCancelEdit={cancelEdit} onAsk={field => { setEdit(null); setSelected(field); setDesignOpen(false); setFocus(false); setMobileView('chat'); setFocusKey(k => k + 1); }} onSource={field => { setSelected(field); open('source'); }} onOpen={open} focus={focus} onFocus={() => setFocus(!focus)} enabled={enabled} designOpen={designOpen} />
      </SplitWorkspace>
      {designOpen && !edit ? <footer className="mobile-design-actions"><Button variant="secondary" onClick={() => setMobileDesignPreview(value => !value)}>{mobileDesignPreview ? <IconArrowLeft size={17} /> : <IconEye size={17} />}{mobileDesignPreview ? '返回设置' : '预览效果'}</Button><Button onClick={closeDesign}><IconCheck size={17} />完成排版</Button></footer> : null}
      </div>
      <div className="workspace-page-host" hidden={!page} inert={conflict || undefined}>
    {CareerView ? <Suspense fallback={<Page title={careerPages[page]} onBack={() => navigate(null)}><p role="status">正在读取…</p></Page>}><CareerView key={page === 'opportunities' ? (account.user?.id || 'guest') : page} account={account} route={route} onAccount={() => open('account')} onBack={() => navigate(null)}
      {...(page === 'opportunities' && {onNewResume:()=>open('new'),findResume:id=>resumesForOpportunity(state.documents,id)[0],onResume:id=>withAccountClosed(()=>selectDocument(id))})} /></Suspense> : null}
    {page === 'opportunity-start' ? <Page title="用岗位制作简历" onBack={()=>opportunityRef ? openLink('/opportunities/'+opportunityRef.id) : navigate(null)} backLabel="返回岗位"><div className="op-resume-source">本次岗位提供 JD。下一步选择要用于写作的个人资料。</div>{opportunityError?<p className="form-error" role="alert">{opportunityError}</p>:null}{opportunity?<><h2>{opportunity.title}</h2><p>{opportunity.company} · 公开版本 {opportunity.version} · {opportunity.status==='open'?'在招':'已暂停或截止'}</p>{opportunity.version!==opportunityRef.version?<p className="op-notice">你打开的版本为 V{opportunityRef.version}，当前为 V{opportunity.version}。请核对下面的现行 JD 后继续。</p>:null}<div className="op-prose">{opportunity.jd||'当前岗位不再提供可导入的 JD。'}</div>{opportunity.status==='open'?<div className="op-actions"><Button onClick={startOpportunity}>确认 JD，另建一份投递简历</Button></div>:null}{resumesForOpportunity(state.documents,opportunity.id).map(d=><div className="op-notice" key={d.id}><strong>{d.title}</strong><p>已使用 V{d.opportunitySource.version}{d.opportunitySource.version!==opportunity.version?' · 岗位有更新，原稿仍保留':''}</p><Button variant="secondary" onClick={()=>selectDocument(d.id)}>继续打磨这份简历</Button></div>)}<WorkspaceLink href={'/opportunities/'+opportunity.id}>返回岗位详情与当前投递渠道</WorkspaceLink></>:!opportunityError?<p>正在核对岗位当前状态…</p>:null}</Page>:null}
    {page === 'file-import' ? <Suspense fallback={<Page title="正在打开文件导入" onBack={() => navigate(importFrom)} />}><ResumeImportPage key={account.owner?.id || 'local'} settings={{...settings,...(workspace.cloud ? {cloudAccount:account.owner.id} : {})}} existingProfile={state.profile} library={state.library} archiveDefault={importFrom === 'library'} destination={workspace.cloud ? '云工作区 · '+account.owner.email : '本机工作区'} onBack={() => navigate(importFrom)} onImport={saveFileImport}/></Suspense> : null}
    {page === 'delete' && currentDoc ? <DeleteDocumentPage doc={doc} onBack={() => navigate(null)} onConfirm={trashCurrentDocument} /> : null}
    {page === 'trash' ? <DocumentTrashPage documents={state.documents} onBack={() => navigate(null)} onRestore={restoreDeletedDocument} onEmpty={confirmed => { if (guard()) setState(s => emptyDocumentTrash(s, confirmed)); }} /> : null}
    {['library', 'profile', 'projects'].includes(page) ? <LibraryPage onImport={() => request(() => { setImportFrom('library'); finish('file-import'); })} hasActiveDocument={!!currentDoc} key={page + doc.id} profile={state.profile} library={state.library} doc={doc} saveState={saveState} initialTab={page === 'projects' ? 'projects' : 'basics'} onBack={() => navigate(tailorOptions ? 'tailor' : null)} onSaveProfile={saveProfile} onApplyProfile={applyProfile} projectProps={{hasActiveDocument: !!currentDoc, busy: !!busyId, settings: chatSettings, onOpenJob: () => open('job'), onSaveProject: p => setState(s => ({...s, library: s.library.some(old => old.id === p.id) ? s.library.map(old => old.id === p.id ? p : old) : [...s.library, p]})), onApply: applyProjects, onArchive: (id, archived) => setState(s => ({...s, library: s.library.map(p => p.id === id ? {...p, archived} : p)}))}} /> : null}
    {page === 'job' ? <JobPage opportunitySource={doc.opportunitySource} onTailor={job => { setOpportunitySource(doc.opportunitySource || null); setTailorFileId(doc.origin === 'file' ? doc.id : null); setTailorOptions(null); setTailorJob(job); stop(); finish('tailor'); }} job={doc.job} onBack={() => navigate(null)} onSave={(job, next = null) => { stop(); changeDoc(d => ({ ...d, job, title: d.title === d.job.title + ' · 定向简历' ? job.title + ' · 定向简历' : d.title, resume: { ...d.resume, target: d.resume.target === d.job.title ? job.title : d.resume.target }, updatedAt: Date.now() })); finish(next); notify('目标岗位已更新'); }} /> : null}
    {page === 'new' ? <NewDocumentPage initialJob={tailorJob} onTailor={job => { setTailorOptions(null); setTailorJob(job); finish('tailor'); }} profile={state.profile} library={state.library} onBack={() => navigate('tailor')} onCreate={(job, projects, personalProfile) => { stop(); const next = {...makeDocument({ job, projects, profile: personalProfile || state.profile, template:'application' }), ...(opportunitySource ? {opportunitySource:clone(opportunitySource)} : {})}; setOpportunitySource(null); setState(s => ({ ...s, documents: [...s.documents, next], activeId: next.id })); finish(null); setSelected(null); setFocus(false); setMobileView('chat'); notify('新简历已创建'); }} /> : null}
    {page === 'settings' ? <SettingsPage theme={theme} modelServiceAvailable={workspace.cloud ? !!account.user : account.health?.cloudEnabled !== false && account.health?.mode === 'development'} cloudAccount={workspace.cloud ? account.owner.id : null} state={{ ...state, settings }} onBack={() => navigate(tailorOptions ? 'tailor' : null)} onSave={next => {
      stop();
      if (workspace.cloud) setServices(next.connections);
      setState(s => ({ ...s, settings: workspace.cloud ? { ...next, connections: [] } : next }));
      finish(tailorOptions ? 'tailor' : null); notify('设置已保存');
    }} notify={notify} onImport={importBackup} /> : null}
    {page === 'versions' ? <VersionsPage doc={doc} onBack={() => navigate(null)} onSave={saveVersion} onRestore={version => { stop(); changeDoc(d => ({ ...mutateResume(d, clone(version.resume), '恢复版本'), job: clone(version.job || d.job), versions: [...d.versions, { id: uid(), name: '恢复前自动保存', time: Date.now(), resume: clone(d.resume), job: clone(d.job) }] })); finish(null); setSelected(null); notify('已恢复版本，原草稿已另存'); }} /> : null}
    {page === 'review' ? <ReviewPage doc={doc} onBack={() => navigate(null)} onApply={apply} onLocate={locate} /> : null}
    {page === 'source' ? <SourcePage doc={doc} selected={selected} onBack={() => navigate(null)} /> : null}
    {page === 'experience' ? <SelectedExperiencePage doc={doc} selected={selected} onBack={() => navigate(null)} /> : null}
    {page === 'tailor' ? <TailorPage opportunitySource={opportunitySource} example={sampleProfile} key={(account.owner?.id || 'local') + ':' + tailorInstance} job={tailorJob || currentDoc?.job} fromFile={useFileMaterials} profile={useFileMaterials ? doc.resume : hasProfile || (doc.example && !sampleProfile) ? state.profile : doc.resume} library={candidateLibrary} settings={{ ...settings, ...(workspace.cloud ? { cloudAccount: account.owner.id } : {}) }} onBack={() => navigate(tailorReturn)} onManual={(job, options) => visitFromTailor('new', job, options)} onImport={(job,options) => {setImportFrom('tailor'); visitFromTailor('file-import',job,options);}} savedOptions={tailorOptions} defaultAvailability={reviewValue(state.profile, '@availability')} onRememberAvailability={hasProfile || !profileHasContent(doc.resume) ? rememberAvailability : undefined} sessionExpired={workspace.cloud && (saveState === 'expired' || !account.user)} checkingService={workspace.cloud && !!account.user && services === null && !['offline','expired','error'].includes(saveState)} onLibrary={(job, options) => visitFromTailor('library', job, options)} onReady={finishDelivery} /> : null}
    {page === 'export' ? <Suspense fallback={<Page title="正在打开一页校稿" onBack={() => navigate(null)} />}><DeliveryExportPage key={doc.id} doc={doc} settings={{...chatSettings, ...(workspace.cloud ? {cloudAccount:account.owner.id} : {})}} onSave={saveReviewedResume} onUndo={() => changeDoc(d => undoDocument(d))} onBack={() => navigate(null)} onTailor={() => open('tailor')} notify={notify} /></Suspense> : null}
    {page === 'rename' ? <RenamePage key={doc.id} doc={doc} onBack={() => navigate(null)} onSave={title => { changeDoc(d => ({ ...d, title })); finish(null); }} /> : null}
      </div>
      </div>
      {accountOpen ? <AccountPage key={account.user?.id || account.owner?.id || 'local'} account={account} workspace={workspace} onBack={closeAccount} registerClose={registerAccountClose} onWorkspaceChange={action => {
        if (!guard()) { closeAccount(); return; }
        closeAccount(false);
        request(async () => { try { await action(); } catch (e) { notify(e.message || '账号操作失败，请重试。'); } });
      }} /> : null}
    </div>
    {toast ? <div className="toast" role="status"><IconCheck size={16} /><span>{toast}</span><IconButton label="关闭提示" onClick={() => setToast('')}><IconX size={14} /></IconButton></div> : null}
  </main></PageNavigationContext.Provider>;
}
