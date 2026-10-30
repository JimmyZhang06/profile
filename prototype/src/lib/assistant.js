import { fieldValue, fieldLabel, validateSuggestions } from './workspace.js';
import { getProjectBullets, keywordMatches, projectDetails, projectSearchText } from './projects.js';
import { restrictMaterialContext, validateMaterialApproval } from './materialScope.js';

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
  const fields = ['summary', 'experience', 'skills', ...selectedProjects.flatMap(p => getProjectBullets(doc.resume, p.id).map((_, i) => p.id + ':' + i))]
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
  return restrictMaterialContext({ job: doc.job, fields, selected, sources }, materialApproval, connection);
}
export function parseAnswer(raw, doc) {
  const match = raw.match(/<changes>([\s\S]*?)<\/changes>/);
  let changes = [];
  if (match) { try { changes = JSON.parse(match[1]); } catch { throw new Error('建议格式不完整，未修改简历。请重试。'); } }
  if (raw.includes('<changes>') && !match) throw new Error('生成中断，建议未完成。请重试。');
  const proposals = validateSuggestions(changes, doc);
  let text = raw.split('<changes>')[0].trim();
  if (changes.length && !proposals.length) text += '\n\n部分建议未通过字段或数字检查，已保留原文。';
  return { text: text || '已整理修改建议，请核对后采用。', proposals };
}
async function localResult({ prompt, doc, selected, library }) {
  const r = doc.resume;
  if (/检查|完整|缺少|缺口/.test(prompt)) {
    const missing = [['姓名', r.name], ['联系方式', r.contact], ['个人简介', r.summary], ['工作经历', r.experience], ['教育背景', r.school]].filter(([, v]) => !v?.trim()).map(([label]) => label);
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
registerAdapter('compatible', async ({ prompt, doc, selected, connectionId, settings, materialApproval, signal, onText }) => {
  const connection = settings.connections.find(item => item.id === connectionId);
  const context = buildAssistantContext(doc, selected, materialApproval, connection);
  const response = await fetch(settings.cloudAccount ? '/api/cloud/chat' : '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Luli-Client': 'workspace', ...(settings.cloudAccount ? { 'X-Luli-Account': settings.cloudAccount } : {}) }, signal, body: JSON.stringify({ connectionId, prompt, context, ...(materialApproval ? { materialApproval } : {}), history: doc.messages.filter(m => m.status === 'done' && !m.kind && !m.materialOptimization).map(m => ({ role: m.role, content: m.text })) }) });
  if (!response.ok) { const error = await response.json(); throw new Error(error.error || '模型暂时不可用'); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', raw = '', ended = false;
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
        raw += chunk.choices?.[0]?.delta?.content || '';
        onText(raw.split('<changes>')[0].replace(/<[^>]*$/, '').trim());
      }
      if (done) break;
    }
    if (!ended || !raw.trim()) throw new Error('连接中断，回答未完成。请重试。');
    return parseAnswer(raw, doc);
  } finally { reader.releaseLock(); }
});
export async function runAssistant(input) {
  if (!input.settings.enabled || !input.settings.capabilities.rewrite) throw new Error('对话辅助已关闭，仍可手工编辑。');
  const connectionId = input.settings.bindings.rewrite;
  if (input.signal.aborted) throw new DOMException('已停止', 'AbortError');
  if (connectionId === 'offline') return { ...await localResult(input), offline: true };
  return adapters.get('compatible')({ ...input, connectionId });
}
