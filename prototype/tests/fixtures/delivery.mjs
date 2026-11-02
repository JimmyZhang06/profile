export const job = {
  title: "产品运营实习生",
  company: "远山科技（测试）",
  text: "负责用户访谈与需求分析，协助迭代产品体验，使用数据验证方案；有内容运营和跨团队协作经验优先。",
};
export const profile = {
  name: "林予安（测试）",
  contact: "review@example.test",
  summary: "关注用户研究与产品体验，具备需求整理和方案验证经验。",
  skills: "能够使用访谈记录与问题清单整理需求。",
  school: "示例大学",
  major: "信息管理 · 本科",
  educationPeriod: "2024–2028",
  company: "示例工作室 · 产品实习生",
  period: "2026.06–2026.09",
  experience:
    "整理用户访谈记录，归纳内容检索问题，与设计和研发共同验证搜索体验改进方案。",
};
export const projects = [
  {
    id: "atlas",
    name: "Atlas · 内容协作工作台",
    role: "产品设计与验证",
    date: "2026.03–2026.06",
    tags: ["需求分析", "用户访谈"],
    facts: [
      "访谈 12 位内容创作者，归纳检索与协作中的重复问题。",
      "绘制核心任务流程，与设计和研发共同验证可交互原型。",
    ],
    details: {
      background: "内容团队需要在多个工具间重复整理素材。",
      actions: "梳理从资料收集到发布审核的协作流程，将重复操作整理为需求清单。",
      results: "完成原型与需求清单，验证主要任务路径。",
      goals: "目标将任务完成率提升至 99%。",
      notes: "PRIVATE-RAW-NOTE-DO-NOT-SEND",
    },
  },
  {
    id: "campus",
    name: "校园内容计划",
    role: "活动运营",
    date: "2025.09–2025.12",
    tags: ["内容运营"],
    facts: ["制定活动内容排期，整理报名反馈并完成复盘。"],
    details: { results: "完成 3 场活动。" },
  },
];
export const plan = {
  projectIds: ["atlas", "campus"],
  workIds: ["legacy-work"],
  researchIds: [],
  changes: [
    {
      field: "summary",
      text: "关注用户研究与产品体验，具备需求整理和方案验证经验。",
      compact: "具备需求整理和方案验证经验。",
      evidence: [{ source: "summary", quote: profile.summary }],
    },
    {
      field: "skills",
      text: profile.skills,
      compact: profile.skills,
      evidence: [{ source: "skills", quote: profile.skills }],
    },
    {
      field: "legacy-work:description",
      text: profile.experience,
      compact: "整理访谈记录与内容检索问题，与设计和研发验证改进方案。",
      evidence: [
        { source: "legacy-work:description", quote: profile.experience },
      ],
    },
    {
      field: "atlas:0",
      text: projects[0].facts[0],
      compact: "访谈 12 位创作者，归纳检索与协作问题。",
      evidence: [{ source: "atlas:fact:0", quote: projects[0].facts[0] }],
    },
    {
      field: "atlas:1",
      text: projects[0].facts[1],
      compact: "梳理任务流程，与设计和研发共同验证原型。",
      evidence: [{ source: "atlas:fact:1", quote: projects[0].facts[1] }],
    },
    {
      field: "campus:0",
      text: projects[1].facts[0],
      compact: projects[1].facts[0],
      evidence: [{ source: "campus:fact:0", quote: projects[1].facts[0] }],
    },
  ],
  requirements: [
    {
      requirement: "负责用户访谈与需求分析",
      evidence: [{ source: "atlas:fact:0", quote: projects[0].facts[0] }],
    },
    {
      requirement: "跨团队协作经验优先",
      evidence: [
        { source: "legacy-work:description", quote: profile.experience },
      ],
    },
  ],
  gaps: ["资料未提供上线后的业务效果数据，正文保留交付与验证事实。"],
};
export const connection = {
  id: "test-model",
  name: "本地测试模型",
  model: "fictional-model",
  baseUrl: "https://model.example.test/v1",
};
