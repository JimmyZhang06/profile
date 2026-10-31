import { initialJob, initialProjects, initialResume } from '../data.js';
import { buildProjectBullets, getProjectBullets, materialFingerprint, projectDetailFields, projectEvidenceText } from './projects.js';
import { templateDesign, validResumeDesign } from './resumeDesign.js';
import { formattedMarkdown, marksForField, normalizeMarks, validTextStyles } from './richText.js';
import { descriptionFields, findRecordField, profileForResume, profileSnapshot, syncLegacyFields, validProfile, validProfileSections, visibleContacts, visibleRecords } from './profile.js';

export const STORAGE_KEY = 'luli.workspace.v2';
export const DEFAULT_CHAT_RATIO = 0.32;
export const MIN_CHAT_RATIO = 0.2;
export const MAX_CHAT_RATIO = 0.72;
export function normalizeLayout(workspace) {
  if (workspace.ui.layoutVersion === 1) return workspace;
  return { ...workspace, ui: { ...workspace.ui, layoutVersion: 1, sidebar: false, chatRatio: DEFAULT_CHAT_RATIO } };
}
export const uid = () => crypto.randomUUID();
export const clone = (value) => structuredClone(value);
export const blankProfile = { name: '', contact: '', summary: '', experience: '', company: '', period: '', school: '', major: '', educationPeriod: '', skills: '' };
export const fieldLabels = { name: '姓名', target: '求职意向', contact: '联系方式', summary: '个人简介', experience: '工作经历', company: '公司与职位', period: '工作时间', school: '学校', major: '专业与学历', educationPeriod: '教育时间', skills: '专业能力' };
export function fieldValue(resume, field) {
  if (!field) return '';
  const record = findRecordField(resume, field);
  if (record) return record.entry[record.key];
  if (!field.includes(':')) return resume[field] || '';
  const [id, index] = field.split(':');
  return resume.overrides?.[field] ?? (resume.sources ? getProjectBullets(resume, id)[Number(index)] : '') ?? '';
}
export function fieldLabel(resume, field) {
  const record = findRecordField(resume, field);
  if (record) return [record.entry.organization, record.label].filter(Boolean).join(' · ');
  if (!field?.includes(':')) return fieldLabels[field] || '简历内容';
  const [id, index] = field.split(':');
  return (resume.sources.find(p => p.id === id)?.name || '项目') + ' · 第 ' + (Number(index) + 1) + ' 条';
}
export function setField(resume, field, value, marks) {
  const record = findRecordField(resume, field);
  const next = record ? syncLegacyFields({...resume, [record.section]: resume[record.section].map(item => item.id === record.entry.id ? {...item, [record.key]: value} : item)})
    : field.includes(':') ? { ...resume, overrides: { ...resume.overrides, [field]: value } } : { ...resume, [field]: value };
  if (marks !== undefined || value !== fieldValue(resume, field)) {
    const textStyles = { ...resume.textStyles };
    const normalized = normalizeMarks(value, marks);
    if (normalized.length) textStyles[field] = { text: value, marks: normalized };
    else delete textStyles[field];
    if (Object.keys(textStyles).length || resume.textStyles) next.textStyles = textStyles;
  }
  return next;
}
export function makeDocument({ job = { company: '', title: '', text: '' }, projects = [], profile = blankProfile, example = false } = {}) {
  const resume = { ...profileForResume(profile), target: job.title, sources: clone(projects), projectIds: projects.map(p => p.id), projectBullets: Object.fromEntries(projects.map(p => [p.id, buildProjectBullets(p, job)])), overrides: {}, density: 'comfortable', font: 'serif', design: templateDesign('classic'), textStyles: {} };
  const doc = { id: uid(), title: job.title ? job.title + ' · 定向简历' : '我的简历', job, resume, example, messages: [], versions: [], undo: [], redo: [], composer: '', revision: 0, updatedAt: Date.now() };
  if (profile.profileVersion === 1) resume.profileSource = profileSnapshot(resume);
  if (example) doc.messages = [
    { id: uid(), role: 'user', text: '我想申请增长运营，帮我挑选最相关的项目，突出用户分层和活动复盘。', status: 'done' },
    { id: uid(), role: 'assistant', kind: 'overview', text: '这份简历，先突出两件事。', status: 'done', offline: true },
  ];
  doc.versions = [{ id: uid(), name: '初始版本', time: Date.now(), resume: clone(resume), job: clone(job) }];
  return doc;
}
export function initialWorkspace() {
  const doc = makeDocument({ job: clone(initialJob), projects: initialProjects.slice(0, 2), profile: { ...initialResume, contact: '杭州 · 本科 · 3 年工作经验' }, example: true });
  return { schema: 2, activeId: doc.id, library: initialProjects.map(p => ({ ...clone(p), example: true })), profile: clone(blankProfile), documents: [doc], settings: { enabled: true, capabilities: { rewrite: true, match: true }, bindings: { rewrite: 'offline', match: 'offline' }, connections: [] }, ui: { layoutVersion: 1, sidebar: false, chatRatio: DEFAULT_CHAT_RATIO } };
}
export function validWorkspace(value) {
  const string = v => typeof v === 'string';
  const project = p => p && string(p.id) && string(p.name) && string(p.role) && string(p.date) && Array.isArray(p.facts) && p.facts.every(string) && Array.isArray(p.tags) && p.tags.every(string) && (p.details === undefined || (p.details && typeof p.details === 'object' && !Array.isArray(p.details) && projectDetailFields.every(({ key }) => p.details[key] === undefined || string(p.details[key]))));
  const resume = r => r && validProfileSections(r) && (r.profileSource === undefined || validProfile(r.profileSource)) && Array.isArray(r.sources) && r.sources.every(project) && Array.isArray(r.projectIds) && r.projectIds.every(id => r.sources.some(p => p.id === id)) && (r.projectBullets === undefined || (r.projectBullets && typeof r.projectBullets === 'object' && !Array.isArray(r.projectBullets) && Object.values(r.projectBullets).every(points => Array.isArray(points) && points.every(string)))) && r.overrides && Object.values(r.overrides).every(string) && Object.keys(fieldLabels).every(key => r[key] === undefined || string(r[key])) && validResumeDesign(r.design) && validTextStyles(r.textStyles);
  const job = j => j && ['company', 'title', 'text'].every(key => string(j[key]));
  const message = m => m && string(m.id) && ['assistant', 'user'].includes(m.role) && string(m.text) && (!m.proposals || (Array.isArray(m.proposals) && m.proposals.every(p => p && ['id', 'field', 'before', 'after', 'jobText'].every(key => string(p[key]))))) && (!m.dismissed || (Array.isArray(m.dismissed) && m.dismissed.every(string)));
  return value?.schema === 2 && Array.isArray(value.documents) && value.documents.length > 0 && value.documents.every(d => string(d.id) && string(d.title) && job(d.job) && resume(d.resume) && Array.isArray(d.messages) && d.messages.every(message) && Array.isArray(d.versions) && d.versions.every(v => string(v.id) && string(v.name) && resume(v.resume)) && Array.isArray(d.undo) && d.undo.every(v => resume(v.resume)) && Array.isArray(d.redo) && d.redo.every(v => resume(v.resume))) && Array.isArray(value.library) && value.library.every(project) && validProfile(value.profile) && typeof value.settings?.enabled === 'boolean' && value.settings?.capabilities && value.settings?.bindings && Array.isArray(value.settings.connections) && value.settings.connections.every(c => c && ['id', 'name', 'model', 'baseUrl'].every(key => string(c[key])) && !('apiKey' in c)) && Number.isFinite(value.ui?.chatRatio) && value.ui.chatRatio >= MIN_CHAT_RATIO && value.ui.chatRatio <= MAX_CHAT_RATIO && value.documents.some(d => d.id === value.activeId);
}
export function mutateResume(doc, resume, label = '编辑简历') {
  if (resume.textStyles) resume = { ...resume, textStyles: Object.fromEntries(Object.entries(resume.textStyles).filter(([field, saved]) => saved.text === fieldValue(resume, field))) };
  return { ...doc, resume, revision: doc.revision + 1, updatedAt: Date.now(), undo: [...doc.undo.slice(-29), { resume: clone(doc.resume), label }], redo: [] };
}
export function undoDocument(doc, redo = false) {
  const from = redo ? 'redo' : 'undo', to = redo ? 'undo' : 'redo';
  const item = doc[from].at(-1);
  if (!item) return doc;
  return { ...doc, resume: clone(item.resume), revision: doc.revision + 1, updatedAt: Date.now(), [from]: doc[from].slice(0, -1), [to]: [...doc[to], { resume: clone(doc.resume), label: item.label }] };
}
export function proposalState(doc, proposal) {
  const current = fieldValue(doc.resume, proposal.field);
  if (current === proposal.after) return 'applied';
  if (proposal.sourceFingerprint && proposal.sourceFingerprint !== sourceFingerprint(doc, proposal.field)) return 'stale';
  if (doc.job.text !== proposal.jobText || current !== proposal.before || (proposal.field.includes(':') && !findRecordField(doc.resume, proposal.field) && !doc.resume.projectIds.includes(proposal.field.split(':')[0]))) return 'stale';
  return 'pending';
}
export function acceptedProposal(doc, proposal) {
  if (proposalState(doc, proposal) !== 'pending') return doc;
  return mutateResume(doc, setField(doc.resume, proposal.field, proposal.after), '采用建议');
}
export function validateSuggestions(items, doc) {
  const sources = doc.resume.sources.filter(p => doc.resume.projectIds.includes(p.id));
  const allowed = new Set(assistantFieldIds(doc.resume));
  const seen = new Set();
  return (Array.isArray(items) ? items : []).slice(0, 8).filter(p => {
    if (!p || !allowed.has(p.field) || seen.has(p.field) || typeof p.after !== 'string' || !p.after.trim() || p.after.length > 4000) return false;
    const record = findRecordField(doc.resume, p.field);
    const evidence = record ? record.entry.description : p.field.includes(':')
      ? projectEvidenceText(sources.find(source => source.id === p.field.split(':')[0]))
      : ['summary', 'experience', 'skills', ...descriptionFields(doc.resume)].map(key => fieldValue(doc.resume, key)).join(' ') + sources.map(projectEvidenceText).join(' ');
    const numbers = new Set((evidence + ' ' + fieldValue(doc.resume, p.field)).match(/\d+(?:\.\d+)?/g) || []);
    if ((p.after.match(/\d+(?:\.\d+)?/g) || []).some(n => !numbers.has(n))) return false;
    seen.add(p.field); return p.after !== fieldValue(doc.resume, p.field);
  }).map(p => ({ id: uid(), field: p.field, before: fieldValue(doc.resume, p.field), after: p.after.trim(), reason: String(p.reason || '根据当前经历调整表达').slice(0, 600), jobText: doc.job.text, sourceFingerprint: sourceFingerprint(doc, p.field) }));
}
function sourceFingerprint(doc, field) {
  const record = findRecordField(doc.resume, field);
  if (record) return JSON.stringify(record.entry);
  const sources = doc.resume.sources.filter(p => doc.resume.projectIds.includes(p.id) && (!field.includes(':') || p.id === field.split(':')[0]));
  return JSON.stringify([sources.map(materialFingerprint), ...(!field.includes(':') ? descriptionFields(doc.resume).map(id => findRecordField(doc.resume, id).entry) : [])]);
}
export function assistantFieldIds(resume) {
  return ['summary', ...(!Array.isArray(resume.workEntries) ? ['experience'] : []), 'skills', ...descriptionFields(resume), ...resume.sources.filter(p => resume.projectIds.includes(p.id)).flatMap(p => getProjectBullets(resume, p.id).map((_, i) => p.id + ':' + i))];
}
export function toMarkdown(doc) {
  const r = doc.resume;
  const text = field => { const value = fieldValue(r, field); return formattedMarkdown(value, marksForField(r, field, value)); };
  const records = (key, title) => visibleRecords(r, key).length ? ['', '## ' + title, ...visibleRecords(r, key).flatMap(entry => ['### ' + text(entry.id + ':organization') + (entry.title ? ' · ' + text(entry.id + ':title') : ''), text(entry.id + ':period'), text(entry.id + ':description'), ''])] : [];
  const contact = Array.isArray(r.contactItems) ? visibleContacts(r).map(item => (item.label ? formattedMarkdown(item.label) + '：' : '') + text(item.id + ':value')).join(' | ') : text('contact');
  return ['# ' + (text('name') || '姓名'), text('target'), contact, '', '## 个人简介', text('summary'), '', '## 项目经历', ...r.projectIds.flatMap(id => {
    const p = r.sources.find(s => s.id === id); return p ? ['### ' + formattedMarkdown(p.name) + ' · ' + formattedMarkdown(p.role), formattedMarkdown(p.date), ...getProjectBullets(r, id).map((_, i) => text(id + ':' + i)).filter(Boolean).map(value => '- ' + value), ''] : [];
  }), ...records('researchEntries', '研究经历'), ...(Array.isArray(r.workEntries) ? records('workEntries', '实习与工作经历') : ['## 工作经历', text('company') + ' · ' + text('period'), text('experience')]), ...(Array.isArray(r.educationEntries) ? records('educationEntries', '教育背景') : ['', '## 教育背景', text('school') + ' · ' + text('educationPeriod'), text('major')]), '', '## 专业能力', text('skills')].join('\n');
}
export function downloadFile(name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '-'); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
