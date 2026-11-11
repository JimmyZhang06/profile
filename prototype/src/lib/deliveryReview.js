import {contactLabel, newContact, newRecord, normalizeProfile, recordSections, syncLegacyFields, visibleRecords} from './profile.js';
import {getProjectBullets,projectPointIndices} from './projects.js';
import {fieldLabel, fieldValue, setField} from './workspace.js';

const headerTypes = {email: '邮箱', phone: '电话', availability: '到岗与实习安排'};
const contactsOf = (r) => r.contactItems ?? normalizeProfile({contact: r.contact || ''}).contactItems;
const primaryContact = (items, type) => items.find((item) => item.visible !== false && item.type === type);

export function reviewFields(r) {
  const options = [];
  const add = (value, label, paperField = value) => options.push({value, label, paperField});
  add('name', '姓名');
  add('target', '求职意向');
  const contacts = contactsOf(r);
  for (const [type, label] of Object.entries(headerTypes)) {
    const item = primaryContact(contacts, type);
    add('@' + type, label, item && item.id + ':value');
  }
  if (!Array.isArray(r.contactItems)) add('contact', '原有联系方式');
  else for (const c of contacts.filter((c) => c.visible !== false))
    if (!options.some((option) => option.paperField === c.id + ':value')) add(c.id + ':value', contactLabel(c));
  add('summary', '个人简介');
  for (const section of recordSections) {
    const records = visibleRecords(r, section.key);
    for (const [i, entry] of records.entries()) {
      const title = entry.organization || (section.singular + ' ' + (i + 1));
      for (const [key, label] of [['organization', section.organization], ['title', section.title], ['period', '起止时间'], ['description', '正文']])
        add(section.key === 'educationEntries' && i === 0 && key === 'organization' ? '@school' : entry.id + ':' + key,
          title + ' · ' + label, entry.id + ':' + key);
    }
    if (section.key === 'educationEntries' && !records.length) {
      if (Array.isArray(r.educationEntries)) add('@school', '教育背景 · 学校');
      else for (const key of ['school', 'major', 'educationPeriod']) add(key, fieldLabel(r, key));
    }
    if (section.key === 'workEntries' && !Array.isArray(r.workEntries))
      for (const key of ['company', 'period', 'experience']) add(key, fieldLabel(r, key));
  }
  for (const id of r.projectIds)
    for (const i of (getProjectBullets(r,id).length ? projectPointIndices(r,id) : [0]))
      add(id + ':' + i, fieldLabel(r, id + ':' + i));
  add('skills', '专业能力');
  return options;
}

export function reviewValue(r, key) {
  if (key === '@school') return visibleRecords(r, 'educationEntries')[0]?.organization || r.school || '';
  if (key.startsWith('@')) return primaryContact(contactsOf(r), key.slice(1))?.value || '';
  return fieldValue(r, key);
}

export function setReviewValue(r, key, text) {
  if (reviewValue(r, key) === text) return r;
  if (key === '@school') {
    if (!Array.isArray(r.educationEntries)) return setField(r, 'school', text);
    const first = visibleRecords(r, 'educationEntries')[0];
    if (first) return setField(r, first.id + ':organization', text);
    if (r.educationEntries.length >= 100) throw new Error('教育经历已达上限，请先在资料库整理。');
    return syncLegacyFields({...r, educationEntries: [...r.educationEntries, {...newRecord(), organization: text}]});
  }
  if (key.startsWith('@')) {
    const type = key.slice(1), items = contactsOf(r), item = primaryContact(items, type);
    if (!Object.hasOwn(headerTypes, type)) throw new Error('请选择可编辑的页首字段。');
    if (item) return setField({...r, contactItems: items}, item.id + ':value', text);
    if (items.length >= 30) throw new Error('联系方式已达上限，请编辑已有条目。');
    return syncLegacyFields({...r, contactItems: [...items, {...newContact(type), value: text}]});
  }
  const [id, index] = key.split(':');
  if (r.projectIds.includes(id) && index === '0' && !getProjectBullets(r, id).length)
    r = {...r, projectBullets: {...r.projectBullets, [id]: ['']}};
  return setField(r, key, text);
}

// Hide only in this document. The source snapshot and its original bullet IDs
// remain available for re-inclusion, evidence, undo and existing versions.
export function reviewExperiences(r) {
  return [
    ...(r.workEntries || []).map((entry) => ({id: entry.id, section: 'workEntries', name: entry.organization || entry.title || '实习经历', included: entry.visible !== false})),
    ...r.sources.map((p) => ({id: p.id, section: 'projects', name: p.name, included: r.projectIds.includes(p.id)})),
    ...(r.researchEntries || []).map((entry) => ({id: entry.id, section: 'researchEntries', name: entry.organization || entry.title || '研究经历', included: entry.visible !== false})),
  ];
}

export function setReviewExperience(r, item, included) {
  if (item.section === 'projects') {
    if (!r.sources.some((p) => p.id === item.id) || r.projectIds.includes(item.id) === included) return r;
    const ids = r.projectIds.filter((id) => id !== item.id);
    if (included) {
      const order = r.sources.map((p) => p.id);
      const next = ids.findIndex((id) => order.indexOf(id) > order.indexOf(item.id));
      ids.splice(next < 0 ? ids.length : next, 0, item.id);
    }
    return {...r, projectIds: ids};
  }
  return syncLegacyFields({...r, [item.section]: r[item.section].map((entry) =>
    entry.id === item.id ? {...entry, visible: included} : entry)});
}

// Trace a JD requirement to its quoted material and current wording. This is
// a reference check, not a semantic match score for text the user has edited.
export function requirementReview(r, plan, requirement, visible = new Set(reviewFields(r).map((f) => f.paperField))) {
  const matches = plan.changes.filter((change) => visible.has(change.field) && fieldValue(r,change.field).trim() && change.evidence.some((proof) =>
    requirement.evidence.some((e) => e.source === proof.source && (e.quote.includes(proof.quote) || proof.quote.includes(e.quote)))));
  const unchanged = matches.find((c) => [c.text, c.compact, c.expanded].includes(fieldValue(r, c.field)) && fieldValue(r, c.field).trim());
  if (unchanged) return {label:'可对照当前正文', field:unchanged.field};
  if (matches.length) return {label:'措辞已调整，请核对', field:matches[0].field};
  for (const e of requirement.evidence) {
    const owner = e.source.split(':')[0];
    const field = visible.has(e.source) ? e.source : r.projectIds.includes(owner) ? owner + ':0' : null;
    if (field) return {label:'请核对正文表述', field};
  }
  return {label:'关联经历未展示', field:'experiences'};
}
