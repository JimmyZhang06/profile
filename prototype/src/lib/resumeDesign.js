export const designLimits = {
  fontSize: [9, 16], headingSize: [10, 22], nameSize: [18, 36],
  lineHeight: [1.2, 2.4], paragraphGap: [0, 18], sectionGap: [10, 40], margin: [10, 26],
};
export const fontOptions = [
  { value: 'serif', label: '经典宋体' }, { value: 'sans', label: '现代黑体' }, { value: 'humanist', label: '人文楷体' },
];
const classic = { font: 'serif', fontSize: 10.5, headingSize: 13, nameSize: 22, lineHeight: 1.8, paragraphGap: 6, sectionGap: 24, margin: 16 };
export const resumeTemplates = [
  { id: 'classic', name: '经典商务', description: '居中页眉 · 细线分节', tag: '通用', defaults: classic },
  { id: 'modern', name: '现代简约', description: '左对齐 · 清晰的黑体层级', tag: '产品 / 运营', defaults: { ...classic, font: 'sans', headingSize: 12, nameSize: 25, lineHeight: 1.65, sectionGap: 26, margin: 18 } },
  { id: 'editorial', name: '编辑叙事', description: '侧边章节 · 留白与衬线', tag: '业务 / 策略', defaults: { ...classic, headingSize: 11.5, nameSize: 28, lineHeight: 1.75, sectionGap: 28, margin: 18 } },
  { id: 'sidebar', name: '清晰双栏', description: '经历为主 · 教育能力侧列', tag: '信息分层', defaults: { ...classic, font: 'sans', fontSize: 10, headingSize: 12, nameSize: 24, lineHeight: 1.7, paragraphGap: 6, sectionGap: 24, margin: 15 } },
  { id: 'compact', name: '紧凑专业', description: '精简页眉 · 更紧凑的节奏', tag: '经历较多', defaults: { ...classic, font: 'sans', fontSize: 10, headingSize: 11.5, nameSize: 21, lineHeight: 1.5, paragraphGap: 4, sectionGap: 17, margin: 13 } },
];
export function templateDesign(id) {
  const template = resumeTemplates.find(item => item.id === id) || resumeTemplates[0];
  return { template: template.id, ...template.defaults };
}
export function getResumeDesign(resume) {
  const legacy = { ...templateDesign('classic'), ...(resume.font === 'sans' ? { font: 'sans', fontSize: 10 } : {}), ...(resume.density === 'compact' ? { lineHeight: 1.65, sectionGap: 16, paragraphGap: 4 } : {}) };
  if (!resume.design || typeof resume.design !== 'object') return legacy;
  const base = { ...legacy, ...templateDesign(resume.design.template) };
  if (fontOptions.some(font => font.value === resume.design.font)) base.font = resume.design.font;
  for (const [key, [min, max]] of Object.entries(designLimits)) {
    const value = resume.design[key];
    if (Number.isFinite(value)) base[key] = Math.min(max, Math.max(min, value));
  }
  for (const key of ['catalogId', 'catalogVersion', 'catalogName', 'catalogDefaults']) if (resume.design[key] !== undefined) base[key] = resume.design[key];
  return base;
}
export function validResumeDesign(value) {
  if (value === undefined) return true;
  return value && typeof value === 'object' && !Array.isArray(value)
    && resumeTemplates.some(t => t.id === value.template)
    && fontOptions.some(font => font.value === value.font)
    && Object.entries(designLimits).every(([key, [min, max]]) => Number.isFinite(value[key]) && value[key] >= min && value[key] <= max)
    && (value.catalogId === undefined || (typeof value.catalogId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value.catalogId) && Number.isInteger(value.catalogVersion) && value.catalogVersion > 0 && typeof value.catalogName === 'string' && value.catalogName.length <= 80 && value.catalogDefaults && value.catalogDefaults.catalogId === undefined && validResumeDesign(value.catalogDefaults)));
}
export function releaseDesign(release) { return { ...release.design, catalogId: release.id, catalogVersion: release.version, catalogName: release.name, catalogDefaults: { ...release.design } }; }
export function resetResumeDesign(resume) { const current = getResumeDesign(resume); return current.catalogDefaults ? { ...current, ...current.catalogDefaults } : templateDesign(current.template); }
export function resumeDesignStyle(resume) {
  const d = getResumeDesign(resume);
  return {
    '--resume-body-size': d.fontSize + 'pt', '--resume-heading-size': d.headingSize + 'pt', '--resume-name-size': d.nameSize + 'pt',
    '--resume-line-height': d.lineHeight, '--resume-paragraph-gap': d.paragraphGap + 'px',
    '--resume-section-gap': d.sectionGap + 'px', '--resume-margin': d.margin + 'mm',
  };
}
