import {deliveryEvidence, deliverySelection, parseDelivery, validatedChange} from './delivery.js';
import {shortlistedContext} from './deliverySelection.js';
import {pageWritingBudget} from './deliverySpace.js';
import {fieldValue} from './workspace.js';

// Numbers refer to this one lookup only. The model never needs to reproduce
// an entire source quote. The client and the proxy build the same table.
export function sectionEvidence(context) {
  const result = [];
  for (const source of deliveryEvidence(context)) {
    if (!source.factual || typeof source.text !== 'string') continue;
    const seen = new Set();
    for (const sentence of source.text.split(/\r?\n|(?<=[。；！？])/u)) {
      const quote = sentence.trim();
      if (quote.length < 4 || seen.has(quote)) continue;
      seen.add(quote);
      result.push({source:source.id, label:source.label, quote});
    }
    if (!seen.size && source.text.trim().length >= 4)
      result.push({source:source.id, label:source.label, quote:source.text.trim()});
  }
  return result;
}

function evidenceFor(refs, table) {
  if (!Array.isArray(refs) || !refs.length || refs.length > 6 || new Set(refs).size !== refs.length ||
      refs.some((n) => !Number.isInteger(n) || n < 1 || n > table.length)) {
    throw new Error('模型引用了本段材料以外的依据，未写入简历。');
  }
  return refs.map((n) => table[n - 1]);
}

function experienceTasks(context, selection, budget) {
  const sections = [];
  for (const [kind, ids, characters] of [
    ['work',selection.workIds,budget.perWork], ['project',selection.projectIds,budget.perProject],
    ['research',selection.researchIds,budget.perResearch],
  ]) {
    for (const id of ids) {
      const sources = context.sources.filter((s) => s.id === id);
      const fields = context.fields.filter((f) => f.id.split(':')[0] === id);
      sections.push({id, kind, characters, label:sources[0]?.name || fields[0]?.label,
        context:{job:context.job, sources, fields, selected:null}});
    }
  }
  return sections;
}

// The closing review sees the chosen excerpts and the two approved profile
// fields. Preserve fact indices so that every review citation still resolves
// to its original in the final full-document validation.
function reviewContext(context, changes) {
  const excerpts = new Map();
  for (const change of changes) for (const {source, quote} of change.evidence) {
    if (!excerpts.has(source)) excerpts.set(source, new Set());
    excerpts.get(source).add(quote);
  }
  const used = (id) => [...(excerpts.get(id) || [])].join('\n');
  const fields = context.fields.filter((f) => f.kind === 'profile' || excerpts.has(f.id))
    .map((f) => f.kind === 'profile' ? f : {...f, text:used(f.id)});
  const sources = [];
  for (const source of context.sources) {
    const facts = (source.facts || []).map((_, i) => used(source.id + ':fact:' + i));
    const details = Object.fromEntries(Object.keys(source.details || {}).map((key) => [key, used(source.id + ':details:' + key)]).filter(([,quote]) => quote));
    if (facts.some(Boolean) || Object.keys(details).length) sources.push({...source, facts, details});
  }
  return {job:context.job, fields, sources, selected:null};
}

function readRows(rows, task, selection, table) {
  const review = task.kind === 'review';
  const maxRows = review ? 2 : 3;
  if (!Array.isArray(rows) || rows.length > maxRows || (!review && !rows.length))
    throw new Error('这一段没有返回完整的正文，未写入简历。');
  const points = rows.map((row, index) => {
    if (review && !['summary','skills'].includes(row?.field)) throw new Error('校对结果包含未允许的字段。');
    const field = review ? row.field : task.id + (task.kind === 'project' ? ':' + index : ':description');
    return validatedChange({field, text:row?.text, compact:row?.compact, expanded:row?.expanded, evidence:evidenceFor(row?.refs,table)},selection,!review);
  }).filter(Boolean);
  if (!review && !points.length) throw new Error('这段经历只有审阅说明，缺少能写入正文的行动。');
  if (task.kind === 'project') points.forEach((p,i) => {p.field = task.id+':'+i;});
  if (review || task.kind === 'project' || points.length === 1) return points;
  const unique = new Map(points.flatMap((p) => p.evidence).map((e) => [JSON.stringify([e.source,e.quote]),e]));
  return [validatedChange({field:points[0].field, text:points.map((p) => p.text).join('\n'),
    compact:points.map((p) => p.compact).join('\n'), evidence:[...unique.values()]},selection)];
}

export function pickedLists(context, chosen) {
  const owners = new Map(context.fields.map((f) => [f.id.split(':')[0], f.kind]));
  const projects = new Set(context.sources.map((s) => s.id));
  return {projectIds:chosen.filter((id) => projects.has(id)), workIds:chosen.filter((id) => owners.get(id) === 'workEntries'),
    researchIds:chosen.filter((id) => owners.get(id) === 'researchEntries')};
}

export async function writeDeliverySections({prepared, picked, paperSpace, ask, onText, onField, signal}) {
  const selection = deliverySelection(picked,prepared);
  const scoped = shortlistedContext(prepared.context,[...picked.projectIds,...picked.workIds,...picked.researchIds]);
  const budget = pageWritingBudget(paperSpace,scoped);
  const tasks = experienceTasks(scoped,selection,budget);
  const changes = [];
  for (const [index,task] of tasks.entries()) {
    onText?.('正在撰写第 ' + (index + 1) + ' / ' + tasks.length + ' 段经历 · ' + task.label, 2);
    const result = await ask(task);
    signal.throwIfAborted();
    const rows = readRows(result?.rows,task,selection,sectionEvidence(task.context));
    changes.push(...rows);
    rows.forEach((row) => onField?.(row));
  }
  onText?.('经历已写好，正在对照岗位要求核对引用。', 2);
  const review = {kind:'review', characters:budget.summary + budget.skills, context:reviewContext(scoped,changes)};
  const result = await ask(review);
  signal.throwIfAborted();
  const table = sectionEvidence(review.context);
  const profile = readRows(result?.rows ?? [],review,selection,table);
  if (!Array.isArray(result?.matches) || !result.matches.length || result.matches.length > 6)
    throw new Error('尚未核对出这份 JD 与经历之间的原文依据，未写入简历。');
  const requirements = result.matches.map((m) => ({requirement:m?.jd, evidence:evidenceFor(m?.refs,table)}));
  const plan = parseDelivery({...picked, changes:[...changes,...profile], requirements, gaps:result.gaps ?? []},prepared);
  profile.forEach((row) => onField?.(row));
  return {...plan, writingMethod:'sections'};
}

// Fitting has exactly one model call available. Keep the reviewed document
// and shorten just its longest visible experience using that record's sources.
export async function shortenDeliverySection({prepared, draft, space, ask}) {
  const plan = draft.delivery;
  const tasks = experienceTasks(prepared.context,plan,pageWritingBudget(space,prepared.context));
  const textLength = (task) => plan.changes.filter((c) => c.field.split(':')[0] === task.id)
    .reduce((sum,c) => sum + fieldValue(draft.resume,c.field).length,0);
  const longest = tasks.sort((a,b) => textLength(b) - textLength(a))[0];
  if (!longest) throw new Error('没有可继续精简的经历。');
  const task = {...longest, characters:Math.max(16,Math.min(longest.characters,Math.floor(textLength(longest) * 0.6)))};
  const result = await ask(task);
  const selection = deliverySelection(plan,prepared);
  const replacement = readRows(result?.rows,task,selection,sectionEvidence(task.context));
  if (replacement.reduce((n,row) => n + row.text.length,0) >= textLength(longest)) throw new Error('模型没有进一步缩短这段经历。');
  const keep = plan.changes.filter((c) => c.field.split(':')[0] !== longest.id);
  return {...parseDelivery({...plan,changes:[...keep,...replacement]},prepared), writingMethod:'sections'};
}
