export const projectDetailFields = [
  { key: 'background', label: '业务背景与问题', hint: '面向哪些用户或业务？当时有什么问题，为什么需要做这个项目？' },
  { key: 'goals', label: '项目目标', hint: '希望解决什么，如何判断成功？目标与实际结果分开记录。' },
  { key: 'responsibilities', label: '我的职责与贡献边界', hint: '我具体负责什么？哪些决策由我做，哪些工作由团队其他人完成？' },
  { key: 'actions', label: '行动过程与关键决策', hint: '按阶段记录调研、分析、方案、实验和执行；说明做法及选择原因。' },
  { key: 'results', label: '实际成果与数据', hint: '填写已发生、可确认的结果。可写基线、最终值、时间范围；没有数据也可以描述真实产出。' },
  { key: 'evidence', label: '数据口径与依据', hint: '数据来源、统计口径、归因限制、文档链接。无法确认的信息请标明待核实。' },
  { key: 'challenges', label: '难点与解决方式', hint: '遇到哪些约束、阻力或失败？如何判断、调整和推进？' },
  { key: 'collaboration', label: '协作与使用的方法', hint: '协作对象、团队分工、使用的工具和分析方法。' },
  { key: 'reflection', label: '复盘与可复用经验', hint: '哪些判断得到验证，哪些没有？下次会做什么调整？' },
  { key: 'notes', label: '原始资料与补充记录', hint: '粘贴项目复盘、会议记录、研究过程等长资料。保留细节，不需要先写成简历。' },
];

export function projectDetails(project) {
  return Object.fromEntries(projectDetailFields.map(({ key }) => [key, project?.details?.[key] || '']));
}

export function projectSearchText(project) {
  return [project.name, project.role, project.date, ...project.tags, ...project.facts, ...Object.values(projectDetails(project))].join('\n');
}

export function jobKeywords(job) {
  const chunks = ((job?.title || '') + ' ' + (job?.text || '')).toLowerCase().match(/[\u4e00-\u9fff]{2,}|[a-z][a-z0-9+#.-]+/g) || [];
  return [...new Set(chunks.flatMap(word => /^[\u4e00-\u9fff]+$/.test(word)
    ? Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)) : [word]))];
}

export function keywordMatches(text, job) {
  const lower = text.toLowerCase();
  return jobKeywords(job).filter(word => lower.includes(word));
}

function statements(text) {
  return text.split(/\n+|(?<=[。；])/u).map(line => line.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
}

// Drafts are selected verbatim from recorded actions/results, never from goals.
// Long raw material stays in the source snapshot for model-assisted rewriting.
export function buildProjectBullets(project, job) {
  const details = projectDetails(project);
  const candidates = [...new Set([
    ...project.facts, ...statements(details.responsibilities),
    ...statements(details.actions), ...statements(details.results),
  ].map(text => text.trim()).filter(Boolean))];
  if (!candidates.length) return ['', '', ''];
  return candidates.map((text, index) => ({ text, index, score: keywordMatches(text, job).length }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 3).map(item => item.text);
}

export function getProjectBullets(resume, projectId) {
  return resume.projectBullets?.[projectId] ?? resume.sources.find(project => project.id === projectId)?.facts ?? [];
}

export function materialFingerprint(project) {
  if (!project) return '';
  const text = JSON.stringify([project.id, project.name, project.role, project.date, project.tags, project.facts, projectDetails(project)]);
  let a = 2166136261, b = 2654435769;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 2246822507);
  }
  return text.length + ':' + (a >>> 0).toString(16) + ':' + (b >>> 0).toString(16);
}

export function projectEvidenceText(project) {
  const detail = projectDetails(project);
  return [...project.facts, detail.responsibilities, detail.actions, detail.results, detail.notes].join('\n');
}

export function projectSummary(project) {
  const detail = projectDetails(project);
  return detail.background || detail.actions || detail.results || project.facts[0] || detail.notes || '尚未补充项目资料';
}

export function prepareProjectSelection(resume, ids, library, job, { regenerate = false } = {}) {
  const sources = ids.map(id => library.find(project => project.id === id)).filter(Boolean).map(project => structuredClone(project));
  const projectBullets = Object.fromEntries(sources.map(project => [project.id,
    !regenerate && resume.projectIds.includes(project.id)
      ? [...getProjectBullets(resume, project.id)] : buildProjectBullets(project, job),
  ]));
  const overrides = Object.fromEntries(Object.entries(resume.overrides).filter(([field]) => {
    const [id, index] = field.split(':');
    return !regenerate && sources.some(project => project.id === id) && Number(index) < projectBullets[id].length;
  }));
  return { ...resume, sources, projectIds: sources.map(project => project.id), projectBullets, overrides };
}
