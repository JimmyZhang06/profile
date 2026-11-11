import { assistantFieldIds, fieldValue, fieldLabel, validateSuggestions } from './workspace.js';
import { visibleRecords } from './profile.js';
import { getProjectBullets, keywordMatches, projectDetails, projectSearchText } from './projects.js';
import { restrictMaterialContext, validateMaterialApproval } from './materialScope.js';
import { localDelivery, parseDelivery, readDeliveryResult } from './delivery.js';
import { deliveryCallPlan, isDeliveryPurpose, restoreDeliveryIds, screeningBatches, shortlistedContext, validateShortlist } from './deliverySelection.js';
import { deliveryFieldStream } from './deliveryStream.js';
import { rewriteDirections, rewriteIssue, sameWording } from './revisionText.js';

export const modelName = (settings, capability = 'rewrite') => settings.bindings[capability] === 'offline' ? '本地整理' : settings.connections.find(c => c.id === settings.bindings[capability])?.name || '选择模型';
export async function api(path, payload, signal, ownerId) {
  const response = await fetch('/api/' + (ownerId ? 'cloud/' : '') + path, { method: payload ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Luli-Client': 'workspace', ...(ownerId ? { 'X-Luli-Account': ownerId } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求未完成，请重试。');
  return result;
}
export function matchProjects(library, job) {
  return library.filter(p => !p.archived).map(project => {
    const matches = keywordMatches(projectSearchText(project), job);
    return { project, score: matches.length, matches };
  }).sort((a, b) => b.score - a.score);
}
export function buildAssistantContext(doc, selected, materialApproval = null, connection = null) {
  const selectedProjects = doc.resume.sources.filter(p => doc.resume.projectIds.includes(p.id));
  const fields = assistantFieldIds(doc.resume)
    .map(id => ({ id, label: fieldLabel(doc.resume, id), text: fieldValue(doc.resume, id) }));
  // Ordinary conversation sends existing resume content, never the newly added
  // detailed archive. Extended material needs a separate, explicit review step.
  const sources = selectedProjects.map(p => ({ id: p.id, name: p.name, role: p.role, date: p.date, tags: p.tags, facts: getProjectBullets(doc.resume, p.id).map((_, i) => fieldValue(doc.resume, p.id + ':' + i)) }));
  if (materialApproval) {
    validateMaterialApproval(materialApproval, connection);
    for (const source of sources) {
      const details = projectDetails(selectedProjects.find(project => project.id === source.id));
      source.details = Object.fromEntries((materialApproval.scopes[source.id] || []).filter(key => details[key]).map(key => [key, details[key]]));
    }
  }
  const resume = doc.resume;
  const headerPresent = {
    name: !!resume.name?.trim(), contact: !!resume.contact?.trim(),
    workIdentity: !!resume.company?.trim() || visibleRecords(resume, 'workEntries').some((e) => e.organization || e.title),
    workDates: !!resume.period?.trim() || visibleRecords(resume, 'workEntries').some((e) => e.period),
  };
  return restrictMaterialContext({ job: doc.job, fields, selected, sources, headerPresent }, materialApproval, connection);
}
export function parseAnswer(raw, doc, editRequested = false) {
  const match = raw.match(/<changes>([\s\S]*?)<\/changes>/);
  let changes = [];
  if (match) { try { changes = JSON.parse(match[1]); } catch { throw new Error('建议格式不完整，未修改简历。请重试。'); } }
  if (!Array.isArray(changes)) throw new Error('建议格式不完整，未修改简历。请重试。');
  if (raw.includes('<changes>') && !match) throw new Error('生成中断，建议未完成。请重试。');
  const proposals = validateSuggestions(changes, doc);
  let text = raw.split('<changes>')[0].trim();
  if (changes.length && !proposals.length) {
    text = changes.every((c) => typeof c?.after === 'string' && typeof c.field === 'string' && assistantFieldIds(doc.resume).includes(c.field) && sameWording(c.after,fieldValue(doc.resume,c.field)))
      ? '这次返回的措辞与原文相同，没有可采用的改动。可以指出要突出的一项行动或结果。'
      : '这次没有通过字段或事实检查的改写，简历已保留原文。';
  } else if (editRequested && !proposals.length) {
    text = '这次模型没有给出可采用的正文改写。请指出要删减的内容或希望突出的个人贡献。';
  }
  return { text: text || '已整理修改建议，请核对后采用。', proposals };
}
async function localResult({ prompt, doc, selected, library }) {
  const r = doc.resume;
  if (/检查|完整|缺少|缺口/.test(prompt)) {
    const missing = [['姓名', r.name], ['联系方式', r.contact], ['个人简介', r.summary], ['实习与工作经历', Array.isArray(r.workEntries) ? visibleRecords(r, 'workEntries').map(item => item.description).join('') : r.experience], ['教育背景', Array.isArray(r.educationEntries) ? visibleRecords(r, 'educationEntries').map(item => item.organization).join('') : r.school]].filter(([, v]) => !v?.trim()).map(([label]) => label);
    const quantified = r.projectIds.some(id => getProjectBullets(r, id).some((_, i) => /\d/.test(fieldValue(r, id + ':' + i))));
    return { text: '已经检查当前简历的基础信息。\n\n' + (missing.length ? '待补充：' + missing.join('、') + '。' : '姓名、联系方式、个人简介、工作经历和教育背景均已填写。') + '\n\n' + (!r.projectIds.length ? '还没有选择项目，可以先从素材库添加相关经历。' : '当前选择了 ' + r.projectIds.length + ' 个项目。' + (!quantified ? '项目中尚未填写量化结果；如有真实数据，可以补充统计口径与结果。' : '已有带数字的描述，请确认数据口径和个人贡献。')) + '\n\n这是本地规则检查，岗位语义分析可在连接模型后进行。', proposals: [] };
  }
  if (/选|匹配|保留.*项目|推荐.*项目/.test(prompt)) {
    const ranking = matchProjects(library, doc.job).slice(0, 3);
    return { text: '按 JD 和项目文字的关键词，建议先查看这些经历：\n\n' + ranking.map((p, i) => (i + 1) + '. ' + p.project.name + ' — ' + p.project.tags.join('、')).join('\n') + '\n\n可以在“项目素材”中确认组合。这是关键词排序，连接模型后可做更深入的匹配分析。', recommendations: ranking.map(p => p.project.id), proposals: [] };
  }
  if (/精简|简短|压缩|简洁/.test(prompt)) {
    const field = selected || 'summary', before = fieldValue(r, field);
    const clauses = before.split(/(?<=[。；])/).filter(Boolean);
    const after = clauses.length > 1 ? clauses.slice(0, Math.max(1, clauses.length - 1)).join('').trim() : before.replace(/能够|持续|相关|具体|的完整过程/g, '').trim();
    const proposals = validateSuggestions([{ field, after, reason: '删除末尾补充句或冗余修饰，原有事实未新增。' }], doc);
    return { text: proposals.length ? '对“' + fieldLabel(r, field) + '”做了一次保守精简。请确认删去的内容是否仍需要保留。' : '这段文字已经比较精简。可以直接编辑，或连接模型进行更细致的改写。', proposals };
  }
  return { text: '你可以选中右侧的一段文字，再告诉我想怎样调整。\n\n本地整理支持精简原文、按关键词选择项目和检查基础信息。自由对话与岗位定向改写需要先连接模型，所有建议都会保留原文供你审核。', proposals: [], connect: true };
}
const adapters = new Map();
export function registerAdapter(name, adapter) { adapters.set(name, adapter); }
class ModelOutputLimit extends Error {
  constructor() { super('模型输出已达到长度上限，本轮未完成。'); }
}
registerAdapter('compatible', async ({ prompt, doc, selected, connectionId, settings, materialApproval, signal, onText, purpose, prepared, paperSpace, onField, direction, condense, brief, part, characters }) => {
  const connection = settings.connections.find(item => item.id === connectionId);
  const delivery = isDeliveryPurpose(purpose);
  const scoped = purpose === 'field-rewrite';
  let context;
  if (delivery) context = restrictMaterialContext(prepared.context, materialApproval, connection);
  else if (scoped) context = {job:doc.job, selected, sources:[],
    fields:[{id:selected, label:fieldLabel(doc.resume,selected), text:fieldValue(doc.resume,selected)}]};
  else context = buildAssistantContext(doc, selected, materialApproval, connection);
  const request = {connectionId, prompt, context, history:[]};
  if (materialApproval) request.materialApproval = materialApproval;
  if (delivery) {
    request.purpose = purpose;
    request.deliveryFormat = 'short-ids';
    if (brief) request.brief = true;
    if (purpose === 'delivery-section') Object.assign(request,{part,characters});
    if (purpose === 'delivery' && paperSpace) request.paperSpace = {lines:paperSpace.lines, columns:paperSpace.columns};
    if (condense) request.condense = true;
  } else if (!scoped) {
    request.history = doc.messages.filter(m => m.status === 'done' && !m.kind && !m.materialOptimization)
      .map(m => ({role:m.role, content:m.text}));
  }
  const response = await fetch(settings.cloudAccount ? '/api/cloud/chat' : '/api/chat', {
    method:'POST', signal, body:JSON.stringify(request),
    headers:{'Content-Type':'application/json','X-Luli-Client':'workspace', ...(settings.cloudAccount ? {'X-Luli-Account':settings.cloudAccount} : {})},
  });
  if (!response.ok) { const error = await response.json(); throw new Error(error.error || '模型暂时不可用'); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', raw = '', ended = false, limited = false;
  const fieldStream = purpose === 'delivery' && onField ? deliveryFieldStream(prepared, onField) : null;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const payload = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
        if (!payload) continue;
        if (payload === '[DONE]') { ended = true; continue; }
        let chunk; try { chunk = JSON.parse(payload); } catch { throw new Error('无法读取模型响应，请重试。'); }
        if (chunk.error) throw new Error('模型返回异常，请重试。');
        if (chunk.choices?.some(choice => choice.finish_reason === 'length')) limited = true;
        if (limited) continue;
        const delta = chunk.choices?.[0]?.delta?.content || '';
        raw += delta;
        if (raw.length > 200_000) throw new Error('模型返回内容过长，已停止生成。');
        fieldStream?.(delta);
        if (!delivery && !scoped) onText?.(raw.split('<changes>')[0].replace(/<[^>]*$/, '').trim());
      }
      if (done) break;
    }
    signal.throwIfAborted();
    if (limited) throw new ModelOutputLimit();
    if (!ended || !raw.trim()) throw new Error('连接中断，回答未完成。请重试。');
    if (!delivery) {
      const answer = parseAnswer(raw, doc, /精简|改写|帮我改|优化.{0,10}(简历|表述|措辞)/.test(prompt));
      if (!scoped) return answer;
      const proposal = answer.proposals.find((p) => p.field === selected);
      if (!proposal) throw new Error('模型没有给出这段正文的有效替换。请具体指出要突出或删减的内容。');
      const issue = rewriteIssue(proposal.before, proposal.after, direction);
      if (issue) throw new Error(issue);
      return proposal;
    }
    if (purpose === 'delivery-section') return readDeliveryResult(raw,'section');
    const selecting = purpose === 'delivery-selection';
    const plan = restoreDeliveryIds(readDeliveryResult(raw, selecting ? 'selection' : 'resume'), context);
    return selecting ? validateShortlist(plan, context) : parseDelivery(plan, prepared);
  } finally { reader.releaseLock(); }
});
export async function runAssistant(input) {
  if (!input.settings.enabled || !input.settings.capabilities.rewrite) throw new Error('对话辅助已关闭，仍可手工编辑。');
  const connectionId = input.settings.bindings.rewrite;
  if (input.signal.aborted) throw new DOMException('已停止', 'AbortError');
  if (connectionId === 'offline') return { ...await localResult(input), offline: true };
  return adapters.get('compatible')({ ...input, connectionId });
}
export async function rewriteField(input) {
  const {doc, selected, direction, instruction, settings, connectionId, signal} = input;
  signal.throwIfAborted();
  if (!settings.enabled || !settings.capabilities.rewrite || !settings.connections.some((c) => c.id === connectionId && c.enabled !== false))
    throw new Error('请选择已启用的 AI 连接。');
  if (!assistantFieldIds(doc.resume).includes(selected) || !fieldValue(doc.resume,selected).trim() || !Object.hasOwn(rewriteDirections,direction))
    throw new Error('请先选择一段已有的简历正文。');
  const prompt = ['只改写当前选中段落。方向为' + rewriteDirections[direction] + '。', instruction,
    '仅用这段已有事实，保留归因、数字及单位。给出一条可直接替换的完整新文字并说明改了什么。精简时减少至少约 15%；突出贡献或结果时重组句子，把具体行动或交付前移。只调整标点、附加套话或复述原文都不能算修改。'].filter(Boolean).join('\n');
  return adapters.get('compatible')({...input, purpose:'field-rewrite', prompt});
}
export async function runDelivery(input) {
  if (input.signal.aborted) throw new DOMException('已停止', 'AbortError');
  const connectionId = input.connectionId ?? input.settings.bindings.rewrite;
  if (connectionId === 'offline') return localDelivery(input.prepared);
  if (!input.settings.enabled || !input.settings.capabilities.rewrite) throw new Error('请先在设置中开启 AI 改写，或切换到本地整理。');
  const adapter = adapters.get('compatible');
  const { context } = input.prepared;
  const connection = input.settings.connections.find((c) => c.id === connectionId && c.enabled !== false);
  if (!connection) throw new Error('当前模型连接不可用，请重新选择。');
  const batches = screeningBatches(context);
  const strategy = deliveryCallPlan(context,connection.maxOutputTokens,batches.length);
  let calls = 0;
  const ask = async (scope, options) => {
    input.signal.throwIfAborted();
    // Reserve the last authorized call for a measured page overflow.
    if (calls >= strategy.maximum - 1) throw new Error('已达到本次确认的调用次数，已停止生成。');
    calls++;
    return adapter({...input, prepared:{...input.prepared,context:scope}, connectionId, ...options});
  };
  const shortFormat = {'delivery-selection':false, 'delivery-section':connection.maxOutputTokens > 0 && connection.maxOutputTokens <= 768};
  async function requestPart(scope, options, label) {
    const purpose = options.purpose;
    try { return await ask(scope,{...options,brief:shortFormat[purpose]}); }
    catch (error) {
      if (!(error instanceof ModelOutputLimit)) throw error;
      if (shortFormat[purpose]) throw smallLimit(label);
      shortFormat[purpose] = true;
      if (purpose === 'delivery-selection') input.onText?.('本轮选材达到输出上限，正在用编号目录核对候选经历。',1);
      else input.onText?.('正在用短格式完成' + label + '，已写好的段落会保留。',2);
      try { return await ask(scope,{...options,brief:true}); }
      catch (retry) { if (retry instanceof ModelOutputLimit) throw smallLimit(label); throw retry; }
    }
  }
  const choose = (scope) => requestPart(scope,{purpose:'delivery-selection'},'选材清单');
  const section = (task) => requestPart(task.context,{purpose:'delivery-section',part:task.kind,characters:task.characters},
    task.kind === 'review' ? '岗位核对' : '单条经历');
  const selected = [];
  for (const [index, batch] of batches.entries()) {
    input.signal.throwIfAborted();
    input.onText?.(batches.length === 1 ? '正在比较全部候选经历与 JD…' : `正在比较第 ${index + 1} / ${batches.length} 批候选经历…`);
    selected.push(...await choose(batch));
  }
  input.signal.throwIfAborted();
  const writing = batches.length ? shortlistedContext(context, selected) : context;
  let plan;
  if (!strategy.bySection && !shortFormat['delivery-selection']) {
    input.onText?.('正在根据入选经历改写正文，并核对 JD 与原文依据…',2);
    try { plan = await ask(writing,{purpose:'delivery'}); }
    catch (error) {
      if (!(error instanceof ModelOutputLimit)) throw error;
      input.onResetFields?.();
      input.onText?.('整篇回复达到上限，正在按入选经历分段成稿。',2);
    }
  }
  if (!plan) {
    const {pickedLists,writeDeliverySections} = await import('./deliverySections.js');
    let finalists = selected;
    if (batches.length !== 1) {
      input.onText?.(batches.length ? '正在从各批入围经历中确定最终选材。' : '正在确定与岗位最相关的经历。',1);
      finalists = await choose({...writing,fields:writing.fields.filter((f) => ['workEntries','researchEntries'].includes(f.kind))});
    }
    plan = await writeDeliverySections({prepared:{...input.prepared,context:writing}, picked:pickedLists(writing,finalists),
      paperSpace:input.paperSpace, ask:section, onText:input.onText, onField:input.onField, signal:input.signal});
  }
  input.signal.throwIfAborted();
  return { ...plan, modelId:connection.id, modelLabel: [connection.name, connection.model].filter(Boolean).join(' · ') };
}

function smallLimit(part) {
  return new Error('模型输出已达到长度上限，连最短的' + part + '也未完整返回。可提高此连接的单次输出上限，或换一个模型重试。');
}

export async function refitDelivery(run, draft, paperSpace, overflowMm, signal) {
  signal.throwIfAborted();
  const selected = [...draft.delivery.projectIds,...draft.delivery.workIds,...draft.delivery.researchIds];
  const context = shortlistedContext(run.prepared.context,selected);
  const space = {...paperSpace, lines:Math.max(6,paperSpace.lines - Math.ceil(overflowMm / 5.5) - 2)};
  const prepared = {...run.prepared,context};
  const adapter = adapters.get('compatible');
  const connectionId = run.connectionId ?? draft.delivery.modelId ?? run.settings.bindings.rewrite;
  let plan;
  if (draft.delivery.writingMethod === 'sections') {
    const {shortenDeliverySection} = await import('./deliverySections.js');
    plan = await shortenDeliverySection({prepared,draft,space,ask:(task) => adapter({...run,connectionId,
      prepared:{...prepared,context:task.context}, part:task.kind, characters:task.characters, brief:true, purpose:'delivery-section',signal})});
  } else plan = await adapter({...run, connectionId, prepared, paperSpace:space, condense:true, purpose:'delivery', signal});
  signal.throwIfAborted();
  return {...plan, modelId:draft.delivery.modelId, modelLabel:draft.delivery.modelLabel};
}
