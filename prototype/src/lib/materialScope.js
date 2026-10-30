import { projectDetailFields } from './projects.js';

const detailKeys = new Set(projectDetailFields.map(field => field.key));
function destination(value) {
  try { return new URL(value).href.replace(/\/+$/, ''); } catch { return null; }
}

export function validateMaterialApproval(approval, connection) {
  const valid = approval && connection && approval.connectionId === connection.id
    && destination(approval.baseUrl) && destination(approval.baseUrl) === destination(connection.baseUrl)
    && approval.scopes && typeof approval.scopes === 'object' && !Array.isArray(approval.scopes)
    && Object.values(approval.scopes).every(fields => Array.isArray(fields) && fields.every(key => detailKeys.has(key)));
  if (!valid) throw new Error('接收模型或资料范围已变化，请回到项目素材库重新确认本次发送。');
}

// The local server independently enforces the destination and field allowlist.
// Ordinary chat cannot silently expand into detailed/raw project material.
export function restrictMaterialContext(context = {}, approval, connection) {
  if (approval) validateMaterialApproval(approval, connection);
  const sources = (Array.isArray(context.sources) ? context.sources : []).map(source => {
    const base = { id: source.id, name: source.name, role: source.role, date: source.date, tags: source.tags, facts: source.facts };
    if (source.details && Object.keys(source.details).length) {
      validateMaterialApproval(approval, connection);
      const allowed = approval.scopes[source.id] || [];
      if (Object.entries(source.details).some(([key, value]) => !allowed.includes(key) || typeof value !== 'string')) {
        throw new Error('包含本次未确认的详细资料，未发送给模型。请重新选择发送范围。');
      }
      base.details = Object.fromEntries(Object.entries(source.details));
    }
    return base;
  });
  return { job: context.job, fields: context.fields, selected: context.selected, sources };
}
