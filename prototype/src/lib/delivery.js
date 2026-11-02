import { clone, fieldValue, makeDocument, setField } from "./workspace.js";
import {
  normalizeProfile,
  profileForResume,
  profileSnapshot,
  recordSections,
  visibleContacts,
  visibleRecords,
  syncLegacyFields,
} from "./profile.js";
import {
  keywordMatches,
  projectDetails,
  projectDetailFields,
  projectSearchText,
} from "./projects.js";
import { getResumeDesign, templateDesign } from "./resumeDesign.js";
import { restrictMaterialContext } from "./materialScope.js";

export const deliveryDetailKeys = [
  "background",
  "responsibilities",
  "actions",
  "results",
  "evidence",
  "challenges",
  "collaboration",
];
export const deliveryDesign = () => ({
  ...templateDesign("compact"),
  font: "sans",
  fontSize: 11,
  headingSize: 12,
  nameSize: 22,
  lineHeight: 1.5,
  paragraphGap: 4,
  sectionGap: 16,
  margin: 15,
});
export const deliveryProfile = (value) =>
  profileForResume(
    normalizeProfile(
      Object.fromEntries(
        [
          "name",
          "contact",
          "summary",
          "company",
          "period",
          "experience",
          "school",
          "major",
          "educationPeriod",
          "skills",
          "profileVersion",
          "contactItems",
          ...recordSections.map((s) => s.key),
        ]
          .filter((k) => value?.[k] !== undefined)
          .map((k) => [k, clone(value[k])]),
      ),
    ),
  );

// The context is assembled independently of makeDocument: its keyword draft may
// already contain detail fields which have NOT been approved for transmission.
export function prepareDelivery({
  job,
  profile,
  projects,
  approval,
  connection,
}) {
  const personal = deliveryProfile(profile);
  const seed = makeDocument({
    job: clone(job),
    profile: personal,
    projects: clone(projects),
    example: projects.some((p) => p.example),
  });
  const fields = ["summary", "skills"].map((id) => ({
    id,
    label: id === "summary" ? "个人简介" : "专业能力",
    kind: "profile",
    text: personal[id] || "",
  }));
  for (const section of recordSections)
    for (const entry of visibleRecords(personal, section.key)) {
      fields.push({
        id: entry.id + ":description",
        label: [section.label, entry.organization, entry.title]
          .filter(Boolean)
          .join(" · "),
        kind: section.key,
        text: entry.description,
      });
    }
  const sources = projects.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    date: p.date,
    tags: p.tags,
    facts: p.facts,
    ...(approval
      ? {
          details: Object.fromEntries(
            (approval.scopes[p.id] || [])
              .map((key) => [key, projectDetails(p)[key]])
              .filter(([, text]) => text),
          ),
        }
      : {}),
  }));
  for (const p of sources)
    for (let i = 0; i < 3; i++)
      fields.push({
        id: p.id + ":" + i,
        label: p.name + " · 要点 " + (i + 1),
        kind: "project",
        text: "",
      });
  const context = restrictMaterialContext(
    { job: clone(job), fields, sources, selected: null },
    approval,
    connection,
  );
  return { seed, context };
}

export function deliveryEvidence(context) {
  const items = (context.fields || [])
    .filter((f) => f.kind !== "project" && f.text)
    .map((f) => ({
      id: f.id,
      label: f.label,
      text: f.text,
      owner: f.id.split(":")[0],
      factual: true,
    }));
  for (const p of context.sources || []) {
    (p.facts || []).forEach((text, i) => {
      if (text)
        items.push({
          id: p.id + ":fact:" + i,
          label: p.name + " · 原始要点",
          text,
          owner: p.id,
          factual: true,
        });
    });
    for (const [key, text] of Object.entries(p.details || {}))
      if (text)
        items.push({
          id: p.id + ":details:" + key,
          label:
            p.name +
            " · " +
            (projectDetailFields.find((f) => f.key === key)?.label || key),
          text,
          owner: p.id,
          factual: !["goals", "reflection", "notes"].includes(key),
        });
  }
  return items;
}

function fail(message) {
  throw new Error(message + "，未覆盖原简历。请调整资料或重新生成。");
}
function ids(value, allowed, max, label) {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    new Set(value).size !== value.length ||
    value.some((id) => !allowed.includes(id))
  )
    fail(label + "选材格式不正确");
  return value;
}
function citations(value, catalog, owner) {
  if (!Array.isArray(value) || !value.length || value.length > 12)
    fail("改写缺少可核对的原文依据");
  return value.map((cite) => {
    const source = catalog.find((item) => item.id === cite?.source);
    if (
      !source?.factual ||
      (owner && source.owner !== owner) ||
      typeof cite.quote !== "string" ||
      cite.quote.trim().length < 4 ||
      !source.text.includes(cite.quote)
    )
      fail("资料引用不匹配");
    return { source: source.id, label: source.label, quote: cite.quote };
  });
}
const numbers = (text) =>
  (text.match(/[-+]?\d+(?:[.,]\d+)*(?:\s*[%％倍万亿])?/g) || []).map((n) =>
    n.replace(/\s/g, "").replace("％", "%"),
  );
function groundedText(text, evidence, max) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > max ||
    /<\/?(?:resume|changes)>/.test(text)
  )
    fail("简历文字格式不完整");
  const allowed = new Set(numbers(evidence.map((e) => e.quote).join("\n")));
  if (numbers(text).some((n) => !allowed.has(n)))
    fail("出现资料依据中没有的数字或指标");
  return text.trim();
}

export function parseDelivery(raw, prepared) {
  const match = raw.match(/<resume>([\s\S]*?)<\/resume>/);
  if (!match) fail("整份简历生成未完成");
  let plan;
  try {
    plan = JSON.parse(match[1]);
  } catch {
    fail("整份简历格式不完整");
  }
  if (
    !plan ||
    typeof plan !== "object" ||
    !Array.isArray(plan.changes) ||
    plan.changes.length > 20
  )
    fail("简历结构不正确");
  const { seed, context } = prepared,
    r = seed.resume;
  const projectIds = ids(plan.projectIds, r.projectIds, 2, "项目");
  const workIds = ids(
    plan.workIds,
    visibleRecords(r, "workEntries").map((e) => e.id),
    2,
    "实习",
  );
  const researchIds = ids(
    plan.researchIds,
    visibleRecords(r, "researchEntries").map((e) => e.id),
    1,
    "研究",
  );
  if (!projectIds.length && !workIds.length && !researchIds.length)
    fail("没有选出可用于投递的经历");
  const selected = new Set([
    ...projectIds,
    ...workIds,
    ...researchIds,
    ...visibleRecords(r, "educationEntries").map((e) => e.id),
    "summary",
    "skills",
  ]);
  const catalog = deliveryEvidence(context).filter((e) =>
    selected.has(e.owner),
  );
  const allowedFields = new Set(
    context.fields
      .filter((f) => selected.has(f.id.split(":")[0]))
      .map((f) => f.id),
  );
  const seen = new Set();
  const changes = plan.changes.map((item) => {
    if (!allowedFields.has(item?.field) || seen.has(item.field))
      fail("改写包含未选择的字段");
    seen.add(item.field);
    const evidence = citations(
      item.evidence,
      catalog,
      item.field.includes(":") ? item.field.split(":")[0] : null,
    );
    const max =
      item.field === "summary" ? 360 : item.field === "skills" ? 500 : 1200;
    const text = groundedText(item.text, evidence, max);
    const compact = item.compact
      ? groundedText(item.compact, evidence, max)
      : text;
    return {
      field: item.field,
      text,
      compact: compact.length < text.length ? compact : text,
      evidence,
    };
  });
  for (const id of projectIds) {
    const points = changes.filter((c) => c.field.startsWith(id + ":"));
    if (
      points.length < 1 ||
      !seen.has(id + ":0") ||
      points.some((_, index) => !seen.has(id + ":" + index))
    )
      fail("项目要点不完整");
  }
  for (const id of [...workIds, ...researchIds])
    if (fieldValue(r, id + ":description") && !seen.has(id + ":description"))
      fail("经历尚未完成精简");
  if (
    !Array.isArray(plan.requirements) ||
    plan.requirements.length > 6 ||
    !Array.isArray(plan.gaps) ||
    plan.gaps.length > 8
  )
    fail("岗位检查结果不完整");
  const requirements = plan.requirements.map((item) => {
    if (
      typeof item.requirement !== "string" ||
      item.requirement.length < 4 ||
      item.requirement.length > 200 ||
      !context.job.text.includes(item.requirement)
    )
      fail("岗位要求与 JD 原文不一致");
    return {
      requirement: item.requirement,
      evidence: citations(item.evidence, catalog),
    };
  });
  if (!requirements.length) fail("没有提供岗位要求与经历的对应依据");
  const gaps = plan.gaps.map((text) => {
    if (typeof text !== "string" || text.length > 500)
      fail("待补充信息格式不正确");
    return text;
  });
  return {
    projectIds,
    workIds,
    researchIds,
    changes,
    requirements,
    gaps,
    mode: "model",
  };
}

export function localDelivery(prepared) {
  const { seed, context } = prepared,
    r = seed.resume;
  const rank = (text) => keywordMatches(text, seed.job).length;
  const projectIds = [...r.sources]
    .sort((a, b) => rank(projectSearchText(b)) - rank(projectSearchText(a)))
    .slice(0, 2)
    .map((p) => p.id);
  const records = (key) =>
    [...visibleRecords(r, key)]
      .sort((a, b) => rank(b.description) - rank(a.description))
      .slice(0, key === "workEntries" ? 2 : 1)
      .map((e) => e.id);
  const changes = [],
    evidence = deliveryEvidence(context);
  for (const id of projectIds) {
    const points = evidence.filter(
      (e) =>
        e.owner === id &&
        e.factual &&
        /:fact:|:details:(responsibilities|actions|results)$/.test(e.id),
    );
    const unique = [...new Map(points.map((p) => [p.text, p])).values()]
      .sort((a, b) => rank(b.text) - rank(a.text))
      .slice(0, 3);
    unique.forEach((p, i) =>
      changes.push({
        field: id + ":" + i,
        text: p.text,
        compact: p.text,
        evidence: [{ source: p.id, label: p.label, quote: p.text }],
      }),
    );
  }
  return {
    mode: "local",
    projectIds,
    workIds: records("workEntries"),
    researchIds: records("researchEntries"),
    changes,
    requirements: [],
    gaps: [
      "这是本地关键词选材与原文排版，尚未完成 AI 岗位改写。连接模型后可生成定向表达。",
    ],
  };
}

export function assembleDelivery(prepared, plan) {
  const doc = clone(prepared.seed);
  let r = {
    ...doc.resume,
    sources: doc.resume.sources.filter((p) => plan.projectIds.includes(p.id)),
    design: deliveryDesign(),
    font: "sans",
    sectionOrder: "application",
    overrides: {},
    projectIds: plan.projectIds,
    workEntries: doc.resume.workEntries.filter((e) =>
      plan.workIds.includes(e.id),
    ),
    researchEntries: doc.resume.researchEntries.filter((e) =>
      plan.researchIds.includes(e.id),
    ),
    projectBullets: Object.fromEntries(
      plan.projectIds.map((id) => [
        id,
        plan.changes
          .filter((c) => c.field.startsWith(id + ":"))
          .map((c) => c.text),
      ]),
    ),
  };
  // An optional summary/skills block should not silently retain a long generic
  // paragraph when the model deliberately left it out of this application.
  if (plan.mode === "model") {
    r.summary = "";
    r.skills = "";
  }
  for (const change of plan.changes) r = setField(r, change.field, change.text);
  doc.resume = syncLegacyFields(r);
  doc.title =
    (doc.job.title || "岗位") +
    (doc.example
      ? " · 示例草稿"
      : plan.mode === "model"
        ? " · 投递草稿"
        : " · 本地选材");
  doc.delivery = { ...clone(plan), createdAt: Date.now(), layoutSteps: [] };
  doc.resume.profileSource = profileSnapshot(prepared.seed.resume);
  return finalizeDelivery(doc);
}

export function finalizeDelivery(doc) {
  return {
    ...doc,
    versions: [
      {
        ...doc.versions[0],
        name: "定向生成 · 待核对",
        resume: clone(doc.resume),
        job: clone(doc.job),
      },
    ],
  };
}

// Fit only new generated drafts. Original records and manually edited resumes
// are never shortened by these automatic steps, and font size has a hard floor.
export function nextDeliveryFit(doc) {
  const steps = doc.delivery.layoutSteps || [],
    r = doc.resume;
  if (!steps.includes("compact")) {
    let next = r;
    for (const c of doc.delivery.changes)
      if (c.compact && c.compact.length < c.text.length)
        next = setField(next, c.field, c.compact);
    return {
      ...doc,
      resume: next,
      delivery: { ...doc.delivery, layoutSteps: [...steps, "compact"] },
    };
  }
  if (!steps.includes("spacing"))
    return {
      ...doc,
      resume: {
        ...r,
        design: {
          ...r.design,
          lineHeight: 1.4,
          paragraphGap: 3,
          sectionGap: 12,
          margin: 14,
        },
      },
      delivery: { ...doc.delivery, layoutSteps: [...steps, "spacing"] },
    };
  if (!steps.includes("type"))
    return {
      ...doc,
      resume: { ...r, design: { ...r.design, fontSize: 10.5 } },
      delivery: { ...doc.delivery, layoutSteps: [...steps, "type"] },
    };
  return null;
}

export function deliveryIssues(resume, measurement) {
  const issues = [],
    design = getResumeDesign(resume);
  if (!resume.name?.trim()) issues.push("请填写姓名");
  const contacts = Array.isArray(resume.contactItems)
    ? visibleContacts(resume)
        .map((c) => c.value)
        .join(" ")
    : resume.contact || "";
  if (!/[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d ()-]{6,}\d/.test(contacts))
    issues.push("请填写可联系的邮箱或电话");
  if (
    !visibleRecords(resume, "educationEntries").length &&
    !resume.school?.trim()
  )
    issues.push("教育背景尚未填写");
  if (
    !resume.projectIds.length &&
    !visibleRecords(resume, "workEntries").length &&
    !visibleRecords(resume, "researchEntries").length &&
    !resume.experience?.trim()
  )
    issues.push("还没有可展示的经历");
  if (
    resume.projectIds.some(
      (id) =>
        !(
          resume.projectBullets?.[id] ||
          resume.sources.find((p) => p.id === id)?.facts ||
          []
        ).some((_, index) => fieldValue(resume, id + ":" + index).trim()),
    )
  )
    issues.push("部分项目尚未填写职责与成果");
  if (design.fontSize < 10.5)
    issues.push("正文小于推荐的 10.5 pt，请检查阅读效果");
  if (design.margin < 12) issues.push("页边距过小，请检查打印边缘");
  if (measurement?.overflow)
    issues.push("正文超出一页，请精简低相关内容或调整排版");
  if (measurement?.horizontal) issues.push("存在超出纸面宽度的内容");
  return issues;
}
