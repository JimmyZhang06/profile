export const initialJob = {
  company: '星桥科技',
  title: '增长运营',
  text: '负责用户分层与生命周期运营，设计并落地新用户激活活动；跟踪转化数据，开展运营复盘；协调产品、设计与业务团队推进项目。具有会员运营、精细化触达和数据分析经验。',
};

export const initialProjects = [
  {
    id: 'member', name: '会员权益优化', role: '用户运营', date: '2025.06 — 2025.11',
    tags: ['用户分层', '跨团队协作'],
    facts: [
      '通过会员访谈梳理权益使用问题，结合用户分层制定权益优化方案。',
      '协调产品、设计和运营团队推进方案上线，跟进执行中的问题。',
      '跟踪权益使用情况与用户反馈，整理运营复盘和后续优化建议。',
    ],
  },
  {
    id: 'activation', name: '新用户激活活动', role: '增长运营', date: '2025.01 — 2025.05',
    tags: ['活动策划', '数据复盘'],
    facts: [
      '基于新用户的使用路径，设计分阶段触达内容与活动方案。',
      '协同设计、产品与渠道团队完成活动上线，跟踪关键节点的执行情况。',
      '整理触达与转化数据，分析用户流失环节并形成活动复盘。',
    ],
  },
  {
    id: 'feedback', name: '客户反馈机制建设', role: '业务运营', date: '2024.08 — 2024.12',
    tags: ['客户洞察', '流程优化'],
    facts: [
      '汇总客户反馈并按问题类型分类，形成可持续更新的需求记录。',
      '协调业务和产品团队明确处理优先级，跟进问题闭环与客户反馈。',
    ],
  },
  {
    id: 'content', name: '内容增长实验', role: '内容运营', date: '2024.03 — 2024.07',
    tags: ['内容策略', '实验复盘'],
    facts: [
      '围绕不同用户群体策划内容主题，制定发布节奏和协作流程。',
      '整理内容触达和互动表现，复盘选题效果并调整后续内容计划。',
    ],
  },
];

export const initialResume = {
  name: '陈予安', target: '增长运营',
  summary: '具备用户运营与业务协作经验，关注从用户洞察、方案设计到落地复盘的完整过程。熟悉会员分层、新用户激活与活动运营，能够协调跨团队资源推进项目，并通过数据与用户反馈持续优化运营方案。',
  experience: '负责会员与新用户运营，围绕用户生命周期开展需求梳理、活动策划与效果复盘；协同产品、设计及业务团队推进项目落地。',
  company: '星桥科技', period: '2023.07 — 至今',
  school: '某大学', major: '市场营销 · 本科', educationPeriod: '2019.09 — 2023.06',
  skills: '用户分层与生命周期运营 / 活动策划与执行 / 数据分析与复盘 / 跨团队项目推进',
  projectIds: ['member', 'activation'], overrides: {},
};

export const initialMessages = [
  {
    id: 'welcome-user', role: 'user',
    text: '帮我根据这份 JD 调整简历，突出用户分层和活动复盘，项目保留两个就好。',
  },
  {
    id: 'welcome-assistant', role: 'assistant', initial: true,
    text: '已经根据这份岗位要求，整理好右侧的简历草稿。',
  },
];

export const capabilityLabels = {
  'project.match': '项目推荐',
  'resume.rewrite': '简历改写',
};

export function fieldText(resume, field, projects = initialProjects) {
  if (!field) return '';
  if (!field.includes(':')) return resume[field] ?? '';
  const [projectId, index] = field.split(':');
  return resume.overrides[field] ?? projects.find((p) => p.id === projectId)?.facts[Number(index)] ?? '';
}

export function changeField(resume, field, text) {
  return field.includes(':')
    ? { ...resume, overrides: { ...resume.overrides, [field]: text } }
    : { ...resume, [field]: text };
}

export function resumeMarkdown(resume) {
  const projects = initialProjects.filter((p) => resume.projectIds.includes(p.id));
  return [
    '# ' + resume.name, resume.target, '',
    '## 个人简介', resume.summary, '',
    '## 项目经历',
    ...projects.flatMap((p) => [
      '### ' + p.name + '｜' + p.role, p.date,
      ...p.facts.map((_, i) => '- ' + fieldText(resume, p.id + ':' + i)), '',
    ]),
    '## 工作经历', resume.company + '｜' + resume.period, resume.experience, '',
    '## 教育背景', resume.school + '｜' + resume.major + '｜' + resume.educationPeriod, '',
    '## 专业能力', resume.skills,
  ].join('\n');
}
