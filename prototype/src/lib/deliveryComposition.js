import {deliveryDesign, nextPageAdjustment} from './delivery.js';
import {fieldValue, setField} from './workspace.js';
import {syncLegacyFields} from './profile.js';
import {addSupplement} from './deliverySupplement.js';
import {manuscriptText} from './deliveryWording.js';

export function paperOutline(r) {
  return syncLegacyFields({...r, design:deliveryDesign(), font:'sans', sectionOrder:'application',
    summary:'', skills:'', projectIds:[], sources:[], overrides:{}, projectBullets:{}, workEntries:[], researchEntries:[],
    educationEntries:r.educationEntries.map((e) => ({...e, description:''}))});
}

// This transient paper only displays fields that have already arrived.
// It never becomes a document in the workspace.
export function writingPaper(outline, source, items, count) {
  let r = outline;
  const entries = new Map([...source.workEntries, ...source.researchEntries].map((e) => [e.id, e]));
  for (const item of items) {
    if (count <= 0) break;
    const text = item.text.slice(0, count);
    count -= item.text.length;
    const [id, key] = item.field.split(':');
    if (key === 'description' && entries.has(id)) {
      const section = source.workEntries.some((e) => e.id === id) ? 'workEntries' : 'researchEntries';
      if (!r[section].some((e) => e.id === id)) r = {...r, [section]:[...r[section], {...entries.get(id), description:''}]};
    } else if (/^\d+$/.test(key)) {
      const p = source.sources.find((entry) => entry.id === id);
      if (!p) continue;
      if (!r.projectIds.includes(id)) r = {...r, projectIds:[...r.projectIds, id], sources:[...r.sources,p]};
      const bullets = [...(r.projectBullets[id] || [])];
      while (bullets.length <= Number(key)) bullets.push('');
      r = {...r, projectBullets:{...r.projectBullets, [id]:bullets}};
    }
    r = setField(r, item.field, text);
  }
  return r;
}

export function paperWording(doc) {
  const r = doc.resume;
  return ['summary', ...r.educationEntries.map((e) => e.id+':description'), ...r.workEntries.map((e) => e.id+':description'),
    ...r.projectIds.flatMap((id) => r.projectBullets[id].map((_,i) => id+':'+i)),
    ...r.researchEntries.map((e) => e.id+':description'), 'skills']
    .map((field) => ({field, text:fieldValue(r,field)})).filter((c) => c.text.trim());
}

const overlaps = (left, right) => left.source === right.source && (left.quote.includes(right.quote) || right.quote.includes(left.quote));
// A requirement sometimes cites a useful original fact which the model didn't
// put into any bullet. Only reuse a complete, approved project fact or action,
// never a fragment of a note or an inference drawn from the JD.
function supplementaryPoint(doc, tried) {
  const {resume:r, delivery:plan} = doc;
  if (plan.mode !== 'model' || plan.changes.length >= 20) return null;
  for (const requirement of plan.requirements) for (const proof of requirement.evidence) {
    const [id, kind, key] = proof.source.split(':');
    const project = r.sources.find((p) => p.id === id);
    if (!project || !r.projectIds.includes(id) || r.projectBullets[id].length >= 3 || tried.includes(proof.source)) continue;
    const original = kind === 'fact' ? project.facts[Number(key)]
      : kind === 'details' && ['actions','results','responsibilities','collaboration'].includes(key) ? project.details?.[key] : '';
    const text = proof.quote.trim();
    if (original?.trim() !== text || text.length < 18 || text.length > 140 || text.includes('\n') || manuscriptText(text) !== text) continue;
    if (plan.changes.some((c) => c.evidence.some((e) => overlaps(e,proof)) || c.text.includes(text) || text.includes(c.text))) continue;
    return {id, proof, text, field:id+':'+r.projectBullets[id].length};
  }
  return null;
}
function expendablePoint(doc) {
  const {resume:r, delivery:plan} = doc;
  const visible = plan.changes.filter((c) => fieldValue(r, c.field));
  // Only consider later project bullets. Keep the leading responsibility and
  // any bullet carrying the sole reference for a matched JD requirement.
  return [...visible].reverse().find((c) => {
    if (!r.projectIds.includes(c.field.split(':')[0]) || !/:[12]$/.test(c.field)) return false;
    const supports = (change, requirement) => change.evidence.some((e) => requirement.evidence.some((p) => overlaps(e,p)));
    return !plan.requirements.some((q) => supports(c,q) && !visible.some((other) => other !== c && supports(other,q)));
  });
}

// A fresh generated draft is composed before handoff. Every probe is followed
// by a fresh font-ready DOM measurement. Never run this on an existing draft.
export function composePage(doc, measurement, pass) {
  const {resume, delivery} = doc;
  const attempt = (next, state) => ({doc:{...doc, resume:next}, pass:{...pass, ...state}});
  if (pass.beforeExpansion && (measurement.overflow || measurement.horizontal || measurement.heightMm > 286))
    return {doc:pass.beforeExpansion, pass:{...pass,beforeExpansion:null}};
  if (measurement.overflow) {
    const variants = delivery.changes.filter((c) => c.compact.length < c.text.length && fieldValue(resume,c.field) === c.text);
    if (variants.length) {
      const excess = measurement.overflowMm * 5;
      const saving = (c) => c.text.length - c.compact.length;
      variants.sort((a,b) => Math.abs(saving(a)-excess) - Math.abs(saving(b)-excess));
      const best = variants[0];
      return attempt(setField(resume,best.field,best.compact), {shortened:true});
    }
    const adjustment = nextPageAdjustment(resume, [], delivery.layoutSteps);
    if (adjustment?.step !== 'spacing') {
      const optionalEducation = resume.educationEntries.find((entry) => {
        const id = entry.id + ':description';
        return entry.description && !delivery.changes.some((c) => c.field === id)
          && !delivery.requirements.some((r) => r.evidence.some((e) => e.source === id));
      });
      if (optionalEducation) return attempt(setField(resume,optionalEducation.id + ':description',''), {shortened:true});
      const point = expendablePoint(doc);
      if (point) return attempt(setField(resume,point.field,''), {shortened:true});
    }
    if (adjustment) return {doc:{...doc,resume:adjustment.resume,delivery:{...delivery,layoutSteps:[...delivery.layoutSteps,adjustment.step]}},pass:{...pass,shortened:true}};
  }
  if (!measurement.horizontal && !pass.shortened && measurement.heightMm < 278) {
    const richer = delivery.changes.filter((c) => c.expanded && c.text === fieldValue(resume,c.field) && !pass.tried.includes(c.field));
    // Give space to what the applicant actually did before extending an intro.
    richer.sort((a,b) => Number(b.field.includes(':')) - Number(a.field.includes(':')));
    if (richer.length) {
      const c = richer[0];
      return attempt(setField(resume,c.field,c.expanded), {tried:[...pass.tried,c.field],beforeExpansion:doc});
    }
    const point = supplementaryPoint(doc,pass.tried);
    if (point) {
      const {id,field,text,proof} = point;
      const projectBullets = {...resume.projectBullets,[id]:[...resume.projectBullets[id],text]};
      const change = {field,text,compact:text,evidence:[proof]};
      return {doc:{...doc,resume:{...resume,projectBullets},delivery:{...delivery,changes:[...delivery.changes,change]}},
        pass:{...pass,tried:[...pass.tried,proof.source],beforeExpansion:doc}};
    }
    for (const [i, addition] of (pass.additions || []).entries()) {
      const key = 'supplement:' + i;
      if (pass.tried.includes(key)) continue;
      const next = addSupplement(doc,addition);
      if (next) return {doc:next,pass:{...pass,tried:[...pass.tried,key],beforeExpansion:doc}};
    }
  }
  return null;
}
