// A pasted listing can enter through the composer as well as the JD form.
// Keep the entire original JD. Only prefill a short, recognizable job heading.
export function jobFromListing(text, current = { company: '', title: '', text: '' }) {
  const firstLine = text.trim().split(/\r?\n/, 1)[0].replace(/^[\s\p{Extended_Pictographic}\uFE0F❗]+/u, '')
    .replace(/^(?:岗位名称|职位名称|招聘岗位)[：:]\s*/, '').replace(/\s*(?:急招|招聘中)[！!]?$/, '').trim();
  const heading = text.includes('\n') && firstLine.length <= 50 && /实习生|工程师|产品经理|产品策划|运营|设计师|分析师/.test(firstLine) &&
    !/[。；：:？?]/.test(firstLine) ? firstLine : '';
  const labeledCompany = /^(?:目标公司|招聘公司|公司名称|公司)[：:][ \t]*([^\n\r]{1,60})$/mu.exec(text)?.[1]?.trim();
  const labeledTitle = /^(?:岗位名称|职位名称|招聘岗位)[：:][ \t]*([^\n\r]{1,60})$/mu.exec(text)?.[1]?.trim();
  const pair = /^([\p{L}\d]{2,20})\s*(?:[|｜·]\s*|\s+)(.+)$/u.exec(heading);
  const body = text.slice(text.indexOf('\n')+1);
  const employer = pair && (pair[1] === labeledCompany || /公司|集团|科技|银行|大学|研究院/u.test(pair[1]) ||
    /[|｜·]/u.test(heading) || new RegExp('(?:参与|加入|来自|关于|就职于)'+pair[1],'u').test(body)) ? pair[1] : '';
  return {...current, title:current.title || labeledTitle || (employer ? pair[2] : heading), company:current.company || labeledCompany || employer, text};
}

export function chatDeliveryJob(text, job) {
  const listing = /岗位职责|工作职责|职位描述/.test(text) && /任职资格|任职要求|岗位要求|职位要求/.test(text);
  const requestsResume = /(?:生成|撰写|写|制作|做)[^。！？\n]{0,10}(?:整份|完整|一份|一版|投递版|定向)?简历/.test(text) &&
    /按|根据|针对|依据|帮我|请|直接|投递|整份|一份|一版/.test(text);
  if (/如何|怎么|为什么|不要|暂不|先不|只需|只想|帮我评|帮我分析/.test(text.split(/\r?\n/, 1)[0])) return null;
  if (!listing && /简历[中里上的]|个人简介|这一段|这段|这条/.test(text)) return null;
  if (listing) return jobFromListing(text);
  return requestsResume ? {...job} : null;
}

export function jobFromFragment(fragment) {
  if (!fragment.startsWith('#tailor?') || fragment.length > 160000) return null;
  const params = new URLSearchParams(fragment.slice(8));
  const text = params.get('jd')?.trim() || '';
  if (text.length < 20 || text.length > 16000) return null;
  return jobFromListing(text, {title:(params.get('title') || '').trim().slice(0,150), company:(params.get('company') || '').trim().slice(0,150)});
}

// Aliases exist only on the provider wire. Account data, consent, citations and
// saved resumes keep their original IDs. Each request has its own reference map.
export function deliveryReferences(context) {
  const byId = new Map(), byAlias = new Map();
  const add = (id, alias) => { byId.set(id, alias); byAlias.set(alias, id); };
  context.sources.forEach((source, i) => add(source.id, 'P' + (i + 1)));
  for (const [kind, prefix] of [['workEntries', 'W'], ['researchEntries', 'R'], ['educationEntries', 'E']]) {
    context.fields.filter((f) => f.kind === kind).forEach((f, i) => add(f.id.split(':')[0], prefix + (i + 1)));
  }
  function translate(id, map) {
    if (typeof id !== 'string') return id;
    const [owner, ...parts] = id.split(':');
    return [map.get(owner) ?? owner, ...parts].join(':');
  }
  return { encode: (id) => translate(id, byId), decode: (id) => translate(id, byAlias) };
}

export function deliveryModelContext(context) {
  const { encode } = deliveryReferences(context);
  return {
    job: context.job,
    fields: context.fields.map(({sourceProjectId, ...field}) => ({
      ...field, id: encode(field.id),
      ...(sourceProjectId && context.sources.some((s) => s.id === sourceProjectId)
        ? {sourceProjectId: encode(sourceProjectId)} : {}),
    })),
    sources: context.sources.map((source) => ({ ...source, id: encode(source.id) })),
  };
}

export function restoreDeliveryIds(result, context) {
  if (!result || typeof result !== 'object') return result;
  const { decode } = deliveryReferences(context);
  const restoreEvidence = (list) => Array.isArray(list)
    ? list.map((entry) => ({ ...entry, source: decode(entry?.source) })) : list;
  const restored = { ...result };
  for (const key of ['projectIds', 'workIds', 'researchIds'])
    if (Array.isArray(result[key])) restored[key] = result[key].map(decode);
  if (Array.isArray(result.changes))
    restored.changes = result.changes.map((c) => ({...c, field: decode(c?.field), evidence: restoreEvidence(c?.evidence)}));
  if (Array.isArray(result.requirements))
    restored.requirements = result.requirements.map((r) => ({...r, evidence: restoreEvidence(r?.evidence)}));
  return restored;
}

const experienceField = (f) => f.kind === 'workEntries' || f.kind === 'researchEntries';

// Only skip the comparison call when every eligible record already fits its
// section. The writer still decides whether each record is relevant.
export function screeningBatches(context) {
  const records = context.fields.filter(experienceField);
  const candidates = [
    ...context.sources.map((source) => ({ source })),
    ...records.map((field) => ({ field })),
  ];
  const batches = [];
  let current, size = 0;
  for (const item of candidates) {
    const length = JSON.stringify(item).length;
    if (!current || (size && size + length > 24000)) {
      current = { job: context.job, fields: [], sources: [], selected: null };
      batches.push(current);
      size = 0;
    }
    if (item.source) current.sources.push(item.source);
    else current.fields.push(item.field);
    size += length;
  }
  if (batches.length <= 1 && context.sources.length <= 2 &&
    records.filter((f) => f.kind === 'workEntries').length <= 2 &&
    records.filter((f) => f.kind === 'researchEntries').length <= 1) return [];
  return batches;
}

export const isDeliveryPurpose = (purpose) => ['delivery', 'delivery-selection', 'delivery-section'].includes(purpose);

// Two short retries are shared by the entire run: one ballot and one section.
// Reserve one call each for unused evidence and exceptional shortening.
export function deliveryCallPlan(context, maxOutputTokens, batches = screeningBatches(context).length) {
  const experiences = Math.min(2, context.sources.length)
    + Math.min(2, context.fields.filter((f) => f.kind === 'workEntries').length)
    + Math.min(1, context.fields.filter((f) => f.kind === 'researchEntries').length);
  const bySection = maxOutputTokens > 0 && maxOutputTokens < 8192;
  const sectionCalls = Math.max(1, batches) + Number(batches > 1) + experiences + 1;
  return {bySection, usual: bySection ? sectionCalls : batches + 1,
    maximum: sectionCalls + Number(!bySection) + 2 + 2};
}

export function validateShortlist(result, context) {
  const chosen = [];
  for (const [key, kind, max] of [['projectIds','project',2], ['workIds','workEntries',2], ['researchIds','researchEntries',1]]) {
    const allowed = kind === 'project' ? context.sources.map((s) => s.id)
      : context.fields.filter((f) => f.kind === kind).map((f) => f.id.split(':')[0]);
    const list = result?.[key];
    if (!Array.isArray(list) || list.length > max || new Set(list).size !== list.length ||
        list.some((id) => !allowed.includes(id))) throw new Error('模型返回了本批候选以外的经历，请重新生成。');
    chosen.push(...list);
  }
  return chosen;
}

export function shortlistedContext(context, selected) {
  const ids = new Set(selected);
  if (!ids.size) throw new Error('这份 JD 暂时没有可用经历。请补充相关行动或成果后再生成。');
  return {
    ...context,
    sources: context.sources.filter((s) => ids.has(s.id)),
    fields: context.fields.filter((f) => (!experienceField(f) && f.kind !== 'project') || ids.has(f.id.split(':')[0])),
  };
}
