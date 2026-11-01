import { getProjectBullets, projectDetailFields, projectDetails } from './projects.js';
import { findRecordField, recordSections } from './profile.js';
import { fieldLabel, fieldValue } from './workspace.js';

// Reading models are derived copies. Opening a preview never saves or applies data.
export function projectPreview(project) {
  const details = projectDetails(project);
  const facts = Array.isArray(project.facts) ? project.facts : (project.facts || '').split('\n').filter(line => line.trim());
  return {
    title: project.name || '未命名项目', role: project.role, period: project.date,
    tags: [...new Set((Array.isArray(project.tags) ? project.tags : (project.tags || '').split(/[,，、]/)).map(tag => tag.trim()).filter(Boolean))],
    sections: [
      ...projectDetailFields.filter(field => details[field.key].trim()).map(field => ({ title: field.label, text: details[field.key] })),
      ...(facts.length ? [{ title: '已有简历要点', items: [...facts] }] : []),
    ],
  };
}

export function recordPreview(entry = {}, section) {
  return { title: entry.organization || '未命名经历', role: entry.title, period: entry.period,
    sections: entry.description?.trim() ? [{ title: section.description, text: entry.description }] : [] };
}

export function selectionPreview(resume, field) {
  const record = findRecordField(resume, field);
  const section = recordSections.find(item => item.key === record?.section);
  if (section) return { ...recordPreview(record.entry, section), kind: 'experience' };
  const [id, index] = (field || '').split(':');
  const project = resume.projectIds.includes(id) && resume.sources.find(item => item.id === id);
  if (project) return { title: project.name, role: project.role, period: project.date, kind: 'experience',
    sections: [{ title: '简历中的表达', items: getProjectBullets(resume, id).map((_, i) => fieldValue(resume, id + ':' + i)), highlighted: Number(index) }] };
  if (['company', 'period', 'experience'].includes(field)) return {
    title: resume.company || '工作经历', period: resume.period, kind: 'experience',
    sections: resume.experience ? [{ title: '职责、行动与成果', text: resume.experience }] : [],
  };
  return { title: fieldLabel(resume, field), kind: 'field', sections: [{ text: fieldValue(resume, field) }] };
}
