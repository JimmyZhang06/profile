import { clone, fieldValue, makeDocument, setField } from "./workspace.js";
import {
  normalizeProfile,
  profileTextKeys,
  profileForResume,
  profileSnapshot,
  recordSections,
  recordHasContent,
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
// The cloud library can arrive after the JD form is opened. Keep only the
// user's choices in state and derive defaults from the current library.
export function deliveryMaterials(projects, example, projectChoices = {}, scopeChoices = {}) {
  const chosen = projects.filter((p) => Object.hasOwn(projectChoices, p.id)
    ? projectChoices[p.id] : !p.archived && (!p.example || example));
  const scopes = Object.fromEntries(chosen.map((p) => {
    const details = projectDetails(p);
    const keys = Object.hasOwn(scopeChoices, p.id) ? scopeChoices[p.id] : deliveryDetailKeys;
    return [p.id, keys.filter((key) => details[key])];
  }));
  return { chosen, scopes };
}
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
export function deliveryProfile(value, excludedRecords = []) {
  const keys = [...profileTextKeys, "profileVersion", "contactItems", ...recordSections.map((s) => s.key)];
  const personal = normalizeProfile(Object.fromEntries(
    keys.filter((key) => value?.[key] !== undefined).map((key) => [key, value[key]]),
  ));
  // "默认带入新简历" controls manual creation. Tailoring has its own reviewed
  // candidate list. Change visibility only on this private generation copy.
  for (const key of ["workEntries", "researchEntries"])
    personal[key] = personal[key]
      .filter((entry) => recordHasContent(entry) && !excludedRecords.includes(entry.id))
      .map((entry) => ({ ...entry, visible: true }));
  return profileForResume(personal);
}

export function withApplicationAvailability(profile, text) {
  const records = profile.contactItems || [];
  const existing = records.find((c) => c.type === "availability");
  const value = text.trim();
  if (existing?.value === value || (!existing && !value)) return profile;
  if (!existing && records.length >= 30) throw new Error("联系方式已达 30 条。请在资料库中将一条联系方式设为到岗安排。");
  const contactItems = existing ? records.map((c) => c.id === existing.id ? { ...c, value } : c)
    : [...records, { id: crypto.randomUUID(), type: "availability", label: "", value, visible: true }];
  return syncLegacyFields({ ...profile, contactItems });
}

// The context is assembled independently of makeDocument: its keyword draft may
// already contain detail fields which have NOT been approved for transmission.
export function buildDeliveryContext({ job, personal, projects, approval, connection }) {
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
        period: entry.period,
        ...(entry.sourceProjectId ? { sourceProjectId: entry.sourceProjectId } : {}),
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
  return restrictMaterialContext(
    { job: clone(job), fields, sources, selected: null },
    approval,
    connection,
  );
}

export function prepareDelivery({ job, profile, projects, excludedRecords, approval, connection, profileExample = false }) {
  const personal = deliveryProfile(profile, excludedRecords);
  return {
    seed: makeDocument({ job: clone(job), profile: personal, projects: clone(projects), example: projects.some((p) => p.example) }),
    context: buildDeliveryContext({ job, personal, projects, approval, connection }),
    profileExample,
  };
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
function sourceExcerpt(source, quote) {
  if (typeof quote !== "string" || quote.trim().length < 4) return null;
  const exact = quote.trim();
  if (source.includes(exact)) return exact;
  // Providers sometimes omit spaces around English terms. Recover the actual
  // contiguous source span; punctuation, words and quantities must still match.
  const needle = exact.replace(/\s/g, "");
  if (needle.length < 4) return null;
  const offsets = [], characters = [];
  for (let i = 0; i < source.length; i++) {
    if (!/\s/.test(source[i])) { offsets.push(i); characters.push(source[i]); }
  }
  const at = characters.join("").indexOf(needle);
  return at < 0 ? null : source.slice(offsets[at], offsets[at + needle.length - 1] + 1);
}
function citations(value, catalog, owner) {
  if (!Array.isArray(value) || !value.length || value.length > 12)
    fail("改写缺少可核对的原文依据");
  return value.map((cite) => {
    const source = catalog.find((item) => item.id === cite?.source);
    const quote = source && sourceExcerpt(source.text, cite.quote);
    if (
      !source?.factual ||
      (owner && source.owner !== owner) ||
      !quote
    )
      fail("资料引用不匹配");
    return { source: source.id, label: source.label, quote };
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

export function readDeliveryResult(raw, tag) {
  const value = raw.trim();
  const wrapped = new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">\\s*$").exec(value);
  const json = (wrapped?.[1] ?? value).trim();
  const fenced = /^\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60$/i.exec(json);
  if (!wrapped && !fenced && !json.startsWith("{")) fail("整份简历生成未完成");
  try { return JSON.parse(fenced?.[1] ?? json); }
  catch { fail("整份简历格式不完整"); }
}

export function parseDelivery(raw, prepared) {
  const plan = typeof raw === "string" ? readDeliveryResult(raw, "resume") : raw;
  if (
    !plan ||
    typeof plan !== "object" ||
    !Array.isArray(plan.changes) ||
    plan.changes.length > 20
  )
    fail("简历结构不正确");
  const { seed, context } = prepared,
    r = seed.resume;
  const projectIds = ids(plan.projectIds, context.sources.map((s) => s.id), 2, "项目");
  const workIds = ids(
    plan.workIds,
    context.fields.filter((f) => f.kind === "workEntries").map((f) => f.id.split(":")[0]),
    2,
    "实习",
  );
  const researchIds = ids(
    plan.researchIds,
    context.fields.filter((f) => f.kind === "researchEntries").map((f) => f.id.split(":")[0]),
    1,
    "研究",
  );
  const selectedRecords = [...r.workEntries, ...r.researchEntries].filter(
    (entry) => workIds.includes(entry.id) || researchIds.includes(entry.id),
  );
  if (selectedRecords.some((entry) => projectIds.includes(entry.sourceProjectId)))
    fail("同一段经历同时写入了项目与个人经历");
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
    if (!fieldValue(r, id + ":description")?.trim() || !seen.has(id + ":description"))
      fail("经历尚未完成精简");
  if (
    !Array.isArray(plan.requirements) ||
    plan.requirements.length > 6 ||
    !Array.isArray(plan.gaps) ||
    plan.gaps.length > 8
  )
    fail("岗位检查结果不完整");
  const requirements = plan.requirements.map((item) => {
    const requirement = sourceExcerpt(context.job.text, item?.requirement);
    if (
      !requirement || requirement.length > 200
    )
      fail("岗位要求与 JD 原文不一致");
    return {
      requirement,
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
  const records = (key) =>
    visibleRecords(r, key).filter((entry) => entry.description.trim())
      .sort((a, b) => rank(b.description) - rank(a.description))
      .slice(0, key === "workEntries" ? 2 : 1)
      .map((e) => e.id);
  const workIds = records("workEntries"), researchIds = records("researchEntries");
  const linkedProjects = new Set([...r.workEntries, ...r.researchEntries]
    .filter((e) => workIds.includes(e.id) || researchIds.includes(e.id)).map((e) => e.sourceProjectId));
  const projectIds = context.sources
    .filter((p) => !linkedProjects.has(p.id) && (p.facts.some(Boolean) ||
      ["responsibilities", "actions", "results"].some((key) => p.details?.[key])))
    .sort((a, b) => rank(projectSearchText(b)) - rank(projectSearchText(a)))
    .slice(0, 2)
    .map((p) => p.id);
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
    workIds,
    researchIds,
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
    sources: plan.projectIds.map((id) => doc.resume.sources.find((p) => p.id === id)),
    design: deliveryDesign(),
    font: "sans",
    sectionOrder: "application",
    overrides: {},
    projectIds: plan.projectIds,
    workEntries: plan.workIds.map((id) => doc.resume.workEntries.find((e) => e.id === id)),
    researchEntries: plan.researchIds.map((id) => doc.resume.researchEntries.find((e) => e.id === id)),
    projectBullets: Object.fromEntries(
      plan.projectIds.map((id) => [
        id,
        plan.changes
          .filter((c) => c.field.startsWith(id + ":"))
          .sort((a, b) => Number(a.field.split(":")[1]) - Number(b.field.split(":")[1]))
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
  doc.example = !!prepared.profileExample || r.sources.some((p) => p.example);
  doc.title =
    ([doc.job.company, doc.job.title].filter(Boolean).join(" · ") || "岗位") +
    (doc.example
      ? " · 示例草稿"
      : plan.mode === "model"
        ? " · 投递草稿"
        : " · 本地选材");
  doc.delivery = { ...clone(plan), considered: {
    projects: prepared.context.sources.length,
    work: prepared.seed.resume.workEntries.length,
    research: prepared.seed.resume.researchEntries.length,
  }, createdAt: Date.now(), layoutSteps: [] };
  doc.resume.profileSource = profileSnapshot(syncLegacyFields({
    ...prepared.seed.resume,
    workEntries: prepared.seed.resume.workEntries.filter((e) => plan.workIds.includes(e.id)),
    researchEntries: prepared.seed.resume.researchEntries.filter((e) => plan.researchIds.includes(e.id)),
  }));
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

// One change per measurement. A compact expression belongs only to its original
// generated text; applying a fit after a manual edit must preserve that edit.
export function nextPageAdjustment(r, changes = [], steps = []) {
  if (!steps.includes("compact")) {
    let next = r;
    const records = recordSections.flatMap(({ key }) => visibleRecords(r, key));
    const visible = new Set([...r.projectIds, ...records.map((entry) => entry.id)]);
    for (const c of changes)
      if (c.compact && c.compact.length < c.text.length && fieldValue(r, c.field) === c.text && !r.textStyles?.[c.field]?.marks?.length &&
          (!c.field.includes(":") || visible.has(c.field.split(":")[0])))
        next = setField(next, c.field, c.compact);
    if (next !== r) return {resume: next, step: "compact"};
  }
  const design = getResumeDesign(r);
  if (!steps.includes("spacing")) {
    const adjusted = {
      ...design, lineHeight: Math.min(design.lineHeight, 1.4),
      paragraphGap: Math.min(design.paragraphGap, 3), sectionGap: Math.min(design.sectionGap, 12),
      margin: Math.max(12, Math.min(design.margin, 14)),
    };
    if (Object.keys(adjusted).some((key) => adjusted[key] !== design[key]))
      return {resume: {...r, design: adjusted}, step: "spacing"};
  }
  if (!steps.includes("type") && design.fontSize !== 10.5)
    return {resume: {...r, design: {...design, fontSize: 10.5}}, step: "type"};
  return null;
}

export function nextDeliveryFit(doc) {
  const steps = doc.delivery.layoutSteps || [];
  const adjustment = nextPageAdjustment(doc.resume, doc.delivery.changes, steps);
  return adjustment && {...doc, resume: adjustment.resume, delivery: {...doc.delivery, layoutSteps: [...steps, adjustment.step]}};
}

export function deliveryChecks(resume, measurement, job) {
  const issues = [],
    design = getResumeDesign(resume);
  const add = (target, message) => issues.push({target, message});
  if (!resume.name?.trim()) add("name", "请填写姓名");
  const contacts = Array.isArray(resume.contactItems)
    ? visibleContacts(resume)
        .map((c) => c.value)
        .join(" ")
    : resume.contact || "";
  const contactCandidates = visibleContacts(normalizeProfile({contact: resume.contact || '', contactItems: resume.contactItems}))
    .filter((item) => ['email', 'phone', 'other'].includes(item.type));
  if (!contactCandidates.some(({value}) => {
    if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(value)) return true;
    const withoutDates = value.replace(/\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, '');
    return /\+?\d[\d ()-]{5,}\d/.test(withoutDates) && withoutDates.replace(/\D/g, '').length >= 7;
  }))
    add("@email", "请填写可联系的邮箱或电话");
  if (
    !visibleRecords(resume, "educationEntries").length &&
    !resume.school?.trim()
  )
    add("@school", "教育背景尚未填写");
  if (
    !resume.projectIds.length &&
    !visibleRecords(resume, "workEntries").length &&
    !visibleRecords(resume, "researchEntries").length &&
    !resume.experience?.trim()
  )
    add("experiences", "还没有可展示的经历");
  const emptyProject = resume.projectIds.find(
      (id) =>
        !(
          resume.projectBullets?.[id] ||
          resume.sources.find((p) => p.id === id)?.facts ||
          []
        ).some((_, index) => fieldValue(resume, id + ":" + index).trim()),
    );
  if (emptyProject) add(emptyProject + ":0", "部分项目尚未填写职责与成果");
  for (const key of ["workEntries", "researchEntries"])
    for (const entry of visibleRecords(resume, key))
      if (!entry.description.trim()) add(entry.id + ":description", (entry.organization || entry.title || "这段经历") + "还缺少具体行动或成果");
  if (design.fontSize < 10.5)
    add("layout", "正文小于推荐的 10.5 pt，请检查阅读效果");
  if (design.margin < 12) add("layout", "页边距过小，请检查打印边缘");
  if (measurement?.overflow)
    add("fit", "正文超出一页，请精简低相关内容或调整排版");
  if (measurement?.horizontal) add("layout", "存在超出纸面宽度的内容");
  const instructions = job?.text || "";
  const header = [contacts, resume.summary].filter(Boolean).join(" ");
  if (/毕业年份|毕业时间|毕业年限/.test(instructions)) {
    const education = [...visibleRecords(resume, "educationEntries").map((e) => e.period), resume.educationPeriod].join(" ");
    if (!/20\d{2}\s*(?:届|年毕业)/.test(header) && !/[-—–~至]\s*20\d{2}/.test(education))
      add("@availability", "JD 要求毕业年份，请在教育经历或页首注明");
  }
  if (/到岗时间|最早到岗|可到岗日期/.test(instructions) &&
      !/(?:到岗|入职|ASAP)/i.test(header)) add("@availability", "JD 要求到岗时间，请在页首填写");
  if (/实习时长|可实习多久|可实习时间/.test(instructions) &&
      !/\d+\s*个?月|[一二三四五六七八九十半两]+个?月/.test(header)) add("@availability", "JD 要求可实习时长，请在页首注明可持续几个月");
  if (/每周.{0,8}(天|到岗|出勤)|周出勤/.test(instructions) &&
      !/(?:每周|一周|周出勤|周到岗)\s*(?:可)?\s*(?:实习|到岗|出勤)?\s*[1-7一二三四五六七两](?:\s*[-–至]\s*[1-7一二三四五六七两])?\s*天|[1-7一二三四五六七两]\s*天\s*[/／每]\s*周/.test(header))
    add("@availability", "JD 要求每周出勤天数，请在页首注明");
  return issues;
}
export function deliveryIssues(resume, measurement, job) {
  return deliveryChecks(resume, measurement, job).map((issue) => issue.message);
}
