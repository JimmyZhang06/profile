import {deliverySelection, validatedChange} from './delivery.js';
import {sectionEvidence} from './deliverySections.js';
import {addsSupportedDetail, comparable, distinctPoint, reviewOnly} from './deliveryWording.js';
import {fieldValue, setField} from './workspace.js';

function printedPoints(resume, id) {
  if (id === 'skills' || id === 'summary') return resume[id]?.trim() ? [resume[id]] : [];
  const fields = resume.projectIds.includes(id)
    ? resume.projectBullets[id].map((_,i) => id+':'+i) : [id+':description'];
  return fields.flatMap((field) => fieldValue(resume,field).split('\n')).filter(Boolean);
}

function bodyPoints(doc) {
  return [...doc.delivery.workIds,...doc.delivery.projectIds,...doc.delivery.researchIds,'skills','summary']
    .flatMap((id) => printedPoints(doc.resume,id));
}

export function coveredPoints(draft,scope) {
  const owners = new Set(sectionEvidence(scope).map((e) => e.source.split(':')[0]));
  return Object.fromEntries([...owners].map((id) => [id,printedPoints(draft.resume,id)]));
}

// Start at the already-approved wire context. In particular, the project
// snapshot in the workspace may contain notes the writer never saw.
export function supplementContext(doc, approved) {
  const plan = doc.delivery;
  const owners = new Set([...plan.workIds,...plan.projectIds,...plan.researchIds]
    .filter((id) => { const points = printedPoints(doc.resume,id); return points.length < 3 || points.some((p) => p.length < 82); }));
  const body = bodyPoints(doc);
  const remaining = new Map();
  for (const {source,quote} of sectionEvidence(approved)) {
    const [id,kind,key] = source.split(':');
    const profile = (id === 'summary' || id === 'skills') && !doc.resume[id]?.trim();
    if (!profile && (!owners.has(id) || !['fact','description','details'].includes(kind))) continue;
    if (kind === 'details' && !['actions','responsibilities','results','collaboration','challenges'].includes(key)) continue;
    const quoted = plan.changes.filter((c) => c.field.startsWith(id+':')).flatMap((c) => c.evidence);
    if (reviewOnly(quote) || quoted.some((e) => e.source === source && comparable(e.quote) === comparable(quote)) ||
        !distinctPoint(quote,profile ? body : printedPoints(doc.resume,id))) continue;
    if (!remaining.has(source)) remaining.set(source,[]);
    remaining.get(source).push(quote);
  }
  if (!remaining.size) return null;
  const read = (source) => (remaining.get(source) || []).join('\n');
  return {job:approved.job,selected:null,
    fields:approved.fields.filter((f) => remaining.has(f.id)).map((f) => ({...f,text:read(f.id)})),
    sources:approved.sources.map((s) => ({...s,facts:s.facts.map((_,i) => read(s.id+':fact:'+i)),
      details:Object.fromEntries(Object.keys(s.details || {}).map((k) => [k,read(s.id+':details:'+k)]).filter(([,v]) => v))}))
      .filter((s) => s.facts.some(Boolean) || Object.keys(s.details).length)};
}

export function supplementPoints(result, context, doc, prepared) {
  if (!Array.isArray(result?.rows) || result.rows.length > 3) throw new Error('本轮补写未返回可核对的要点。');
  const table = sectionEvidence(context), selection = deliverySelection(doc.delivery,prepared);
  return result.rows.flatMap((row) => {
    if (!Array.isArray(row?.refs) || !row.refs.length || row.refs.length > 6 ||
        row.refs.some((n) => !Number.isInteger(n) || n < 1 || n > table.length)) return [];
    const evidence = [...new Set(row.refs)].map((n) => table[n-1]);
    const id = evidence[0].source.split(':')[0];
    if (evidence.some((e) => e.source.split(':')[0] !== id)) return [];
    const profile = id === 'summary' || id === 'skills';
    const field = profile ? id : id + (doc.resume.projectIds.includes(id) ? ':0' : ':description');
    try {
      const change = validatedChange({field,text:row.text,evidence},selection);
      const printed = profile ? bodyPoints(doc) : printedPoints(doc.resume,id);
      if (!distinctPoint(change.text,printed) || !addsSupportedDetail(printed.join(''),change.text,evidence)) return [];
      const extend = Number.isInteger(row.extend) && row.extend > 0 ? printed[row.extend-1] : undefined;
      if (row.extend != null && (!extend || profile) || !profile && printed.length >= 3 && !extend) return [];
      return [{id,...change,extend}];
    } catch { return []; } // An optional unsupported point cannot replace the checked draft.
  });
}

export function addSupplement(doc, point) {
  const r = doc.resume, plan = doc.delivery, id = point.id;
  if (id === 'summary' || id === 'skills') {
    if (r[id]?.trim() || plan.changes.length >= 20 || !distinctPoint(point.text,bodyPoints(doc))) return null;
    const change = {field:id,text:point.text,compact:point.text,evidence:point.evidence};
    return {...doc,resume:setField(r,id,point.text),delivery:{...plan,changes:[...plan.changes,change]}};
  }
  const old = printedPoints(r,id);
  if (!distinctPoint(point.text,old)) return null;
  const project = r.projectIds.includes(id);
  let field = id+':description', text;
  if (point.extend) {
    const index = old.indexOf(point.extend);
    if (index < 0 || point.extend.length + point.text.length > 165) return null;
    const joined = point.extend.replace(/[；;]$/u,'。') + (/[。；;.!?！？]$/u.test(point.extend) ? '' : '。') + point.text;
    if (project) {
      field = r.projectBullets[id].map((_,i) => id+':'+i).find((f) => fieldValue(r,f) === point.extend);
      if (!field) return null;
      text = joined;
    } else text = old.map((p,i) => i === index ? joined : p).join('\n');
  } else if (old.length >= 3) return null;
  else if (project) {
    const bullets = r.projectBullets[id];
    if (bullets.length >= 3 || plan.changes.length >= 20) return null;
    const change = {field:id+':'+bullets.length,text:point.text,compact:point.text,evidence:point.evidence};
    return {...doc,resume:{...r,projectBullets:{...r.projectBullets,[id]:[...bullets,point.text]}},
      delivery:{...plan,changes:[...plan.changes,change]}};
  } else text = [...old,point.text].join('\n');
  const record = plan.changes.find((c) => c.field === field);
  if (!record) return null;
  const evidence = [...new Map([...record.evidence,...point.evidence].map((e) => [JSON.stringify([e.source,e.quote]),e])).values()];
  if (evidence.length > 12 || text.length > 1200) return null;
  const change = {field,text,compact:record.compact,evidence};
  return {...doc,resume:setField(r,field,text),delivery:{...plan,changes:plan.changes.map((c) => c.field === field ? change : c)}};
}
