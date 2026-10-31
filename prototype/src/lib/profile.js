// The archive and each resume own separate copies. Reading legacy data never
// writes it back or guesses where an unstructured description should be split.
export const profileTextKeys = ['name', 'contact', 'summary', 'company', 'period', 'experience', 'school', 'major', 'educationPeriod', 'skills'];
export const recordSections = [
  { key: 'workEntries', label: '实习与工作', organization: '公司 / 机构', title: '职位', description: '职责、行动与成果', singular: '经历' },
  { key: 'educationEntries', label: '教育背景', organization: '学校', title: '专业与学历', description: '课程、荣誉与补充说明', singular: '教育经历' },
  { key: 'researchEntries', label: '研究经历', organization: '研究 / 课题名称', title: '角色 / 研究方向', description: '研究问题、方法与进展', singular: '研究经历' },
];
export const contactTypes = [
  { value: 'phone', label: '电话' }, { value: 'email', label: '邮箱' },
  { value: 'city', label: '所在城市' }, { value: 'link', label: '作品链接' },
  { value: 'availability', label: '到岗 / 实习安排' }, { value: 'other', label: '其他信息' },
];
const strings = keys => item => keys.every(key => typeof item?.[key] === 'string');
const entryKeys = ['id', 'organization', 'title', 'period', 'description'];
const idValid = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
export const recordHasContent = item => ['organization', 'title', 'period', 'description'].some(key => item[key]?.trim());
export const visibleRecords = (value, key) => (value[key] || []).filter(item => item.visible !== false && recordHasContent(item));
export const visibleContacts = value => (value.contactItems || []).filter(item => item.visible !== false && item.value.trim());
export function validProfileSections(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.profileVersion !== undefined && value.profileVersion !== 1) return false;
  for (const {key} of recordSections) {
    if (value[key] !== undefined && (
      !Array.isArray(value[key]) || value[key].length > 100 ||
      !value[key].every(item => strings(entryKeys)(item) && idValid(item.id) && typeof item.visible === 'boolean' && (item.sourceProjectId === undefined || typeof item.sourceProjectId === 'string'))
    )) return false;
  }
  if (value.contactItems !== undefined && (!Array.isArray(value.contactItems) || value.contactItems.length > 30 || !value.contactItems.every(item => strings(['id', 'type', 'label', 'value'])(item) && idValid(item.id) && typeof item.visible === 'boolean' && contactTypes.some(type => type.value === item.type)))) return false;
  const ids = [...(value.contactItems || []), ...recordSections.flatMap(({key}) => value[key] || [])].map(item => item.id);
  return new Set(ids).size === ids.length;
}
export function validProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !validProfileSections(value)) return false;
  const structuredKeys = new Set(['profileVersion', 'contactItems', ...recordSections.map(s => s.key)]);
  return Object.entries(value).every(([key, item]) => structuredKeys.has(key) || typeof item === 'string');
}
export function newRecord(makeId = () => crypto.randomUUID()) {
  return {id: makeId(), organization: '', title: '', period: '', description: '', visible: true};
}
export function newContact(type = 'other', makeId = () => crypto.randomUUID()) {
  return {id: makeId(), type, label: '', value: '', visible: true};
}
function splitTitle(value) {
  const match = value.match(/^(.+?)\s+[·|｜/]\s+(.+)$/);
  return match ? [match[1], match[2]] : [value, ''];
}
function migrateContacts(text) {
  // Only explicit separators are split. Unrecognized pieces stay editable as
  // "other" so unusual contacts or availability notes are never discarded.
  return text.split(/\r?\n|\s*[|｜]\s*/).filter(part => part.trim()).map((part, index) => {
    const value = part.trim();
    const type = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'email'
      : /^\+?[\d\s()-]{7,}$/.test(value) ? 'phone'
      : /^(?:https?:\/\/|(?:GitHub|作品集)[：:])/i.test(value) ? 'link'
      : /实习|到岗|每周/.test(value) ? 'availability' : 'other';
    const labeled = type === 'link' && value.match(/^([^：:/]+)[：:](?!\/\/)(.+)$/);
    return {id: 'legacy-contact-' + index, type, label: labeled ? labeled[1] : '', value: labeled ? labeled[2].trim() : value, visible: true};
  });
}
export function normalizeProfile(profile = {}) {
  const result = {...Object.fromEntries(profileTextKeys.map(key => [key, ''])), ...structuredClone(profile), profileVersion: 1};
  if (!Array.isArray(result.contactItems)) result.contactItems = migrateContacts(result.contact);
  if (!Array.isArray(result.workEntries)) {
    const [organization, title] = splitTitle(result.company);
    result.workEntries = [organization, title, result.period, result.experience].some(Boolean) ? [{id: 'legacy-work', organization, title, period: result.period, description: result.experience, visible: true}] : [];
  }
  if (!Array.isArray(result.educationEntries)) result.educationEntries = [result.school, result.major, result.educationPeriod].some(Boolean)
    ? [{id: 'legacy-education', organization: result.school, title: result.major.split('\n')[0], period: result.educationPeriod, description: result.major.split('\n').slice(1).join('\n'), visible: true}] : [];
  if (!Array.isArray(result.researchEntries)) result.researchEntries = [];
  return result;
}
export function contactLabel(item) { return item.label || contactTypes.find(type => type.value === item.type)?.label || '联系方式'; }
export function contactText(item) { return item.label ? item.label + '：' + item.value : item.value; }
export function profileHasContent(profile) {
  return profileTextKeys.some(key => profile[key]?.trim()) || recordSections.some(({key}) => (profile[key] || []).some(recordHasContent)) || (profile.contactItems || []).some(item => item.value.trim());
}
export function syncLegacyFields(value) {
  const next = {...value};
  if (Array.isArray(value.contactItems)) next.contact = visibleContacts(value).map(contactText).join('  |  ');
  if (Array.isArray(value.workEntries)) {
    const first = visibleRecords(value, 'workEntries')[0];
    next.company = first ? [first.organization, first.title].filter(Boolean).join(' · ') : '';
    next.period = first?.period || ''; next.experience = first?.description || '';
  }
  if (Array.isArray(value.educationEntries)) {
    const first = visibleRecords(value, 'educationEntries')[0];
    next.school = first?.organization || ''; next.educationPeriod = first?.period || '';
    next.major = first ? [first.title, first.description].filter(Boolean).join('\n') : '';
  }
  return next;
}
export function profileForResume(profile) {
  const next = structuredClone(profile);
  for (const {key} of recordSections) if (Array.isArray(next[key])) next[key] = visibleRecords(next, key);
  if (Array.isArray(next.contactItems)) next.contactItems = visibleContacts(next);
  return syncLegacyFields(next);
}
export function profileSnapshot(value) {
  return structuredClone(Object.fromEntries([...profileTextKeys, 'profileVersion', 'contactItems', ...recordSections.map(s => s.key)].filter(key => value[key] !== undefined).map(key => [key, value[key]])));
}
export function findRecordField(resume, field) {
  const [id, key, extra] = String(field).split(':');
  if (!key || extra) return null;
  for (const section of recordSections) {
    const entry = resume[section.key]?.find(item => item.id === id);
    if (entry && ['organization', 'title', 'period', 'description'].includes(key)) return {section: section.key, entry, key, label: key === 'period' ? '起止时间' : section[key]};
  }
  const contact = resume.contactItems?.find(item => item.id === id);
  return contact && key === 'value' ? {section: 'contactItems', entry: contact, key, label: contactLabel(contact)} : null;
}
export function descriptionFields(resume) {
  return recordSections.flatMap(({key}) => visibleRecords(resume, key).map(item => item.id + ':description'));
}
export function profileSelections(profile) {
  const p = normalizeProfile(profile);
  return {name: true, contactItems: visibleContacts(p).map(item => item.id), workEntries: visibleRecords(p, 'workEntries').map(item => item.id), educationEntries: visibleRecords(p, 'educationEntries').map(item => item.id), researchEntries: visibleRecords(p, 'researchEntries').map(item => item.id), summary: false, skills: false};
}
export function applyProfileSelection(resume, profile, selection, groups) {
  const p = normalizeProfile(profile), next = {...resume}, source = profileSnapshot(resume.profileSource || resume), replaced = new Set();
  for (const key of groups) {
    if (['name', 'summary', 'skills'].includes(key)) { next[key] = p[key]; source[key] = p[key]; replaced.add(key); }
    else if (['contactItems', ...recordSections.map(s => s.key)].includes(key)) {
      for (const item of next[key] || []) for (const prop of Object.keys(item)) replaced.add(item.id + ':' + prop);
      next[key] = p[key].filter(item => selection[key]?.includes(item.id)).map(item => ({...item, visible: true}));
      source[key] = structuredClone(next[key]);
      for (const item of next[key]) for (const prop of Object.keys(item)) replaced.add(item.id + ':' + prop);
      const legacy = {contactItems: ['contact'], workEntries: ['company', 'period', 'experience'], educationEntries: ['school', 'educationPeriod', 'major']}[key] || [];
      legacy.forEach(field => replaced.add(field));
    }
  }
  next.textStyles = Object.fromEntries(Object.entries(resume.textStyles || {}).filter(([field]) => !replaced.has(field)));
  next.profileSource = syncLegacyFields(source);
  return syncLegacyFields(next);
}
export function mergeProfiles(current, incoming, makeId = () => crypto.randomUUID()) {
  if (!profileHasContent(incoming)) return structuredClone(current);
  const a = normalizeProfile(current), b = normalizeProfile(incoming);
  const combined = {...a};
  const ids = new Set([...a.contactItems, ...recordSections.flatMap(({key}) => a[key])].map(item => item.id));
  for (const key of profileTextKeys) combined[key] = a[key] || b[key];
  const contentKey = item => JSON.stringify(Object.entries(item).filter(([key]) => key !== 'id').sort(([a], [b]) => a.localeCompare(b)));
  for (const key of ['contactItems', ...recordSections.map(s => s.key)]) {
    const seen = new Set(a[key].map(contentKey));
    combined[key] = [...a[key], ...b[key].filter(item => { const text = contentKey(item); if (seen.has(text)) return false; seen.add(text); return true; }).map(item => { const id = ids.has(item.id) ? makeId() : item.id; ids.add(id); return {...item, id}; })];
  }
  return syncLegacyFields(combined);
}
