import {
  importBatches,
  importKinds,
  importLimit,
  importModelBlocks,
} from "../../shared/resumeImport.mjs";
import { newRecord } from "./profile.js";
import { projectDetailFields } from "./projects.js";
import { requestResumeImport } from "./assistant.js";

const detailKeys = projectDetailFields.map((f) => f.key);
const clean = (text) => text.replace(/[\s•●▪◦◆◇·*|｜—–-]/gu, "");
const fail = () => {
  throw Error("AI 返回的经历与原文未能对应，请重试或继续手动校对。");
};

export function attachImportSource(parsed, source) {
  const evidence = {};
  const find = (values) =>
    source.blocks
      .filter((b) =>
        values.some(
          (v) =>
            v &&
            clean(v).length > 1 &&
            (clean(b.text).includes(clean(v)) ||
              clean(v).includes(clean(b.text))),
        ),
      )
      .map((b) => b.id);
  for (const kind of importKinds) {
    const records =
      kind === "projects" ? parsed.projects : parsed.profile[kind];
    for (const r of records)
      evidence[r.id] = find(
        kind === "projects"
          ? [r.name, r.role, r.date, ...r.facts]
          : [r.organization, r.title, r.period, ...r.description.split("\n")],
      );
  }
  return { ...parsed, importSource: { ...source, evidence, method: "local" } };
}

export function parseImportPlan(raw, blocks) {
  let plan = raw;
  if (typeof raw === "string") {
    const body =
      raw.match(/<resume_import>([\s\S]*?)<\/resume_import>/)?.[1] ??
      raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try {
      plan = JSON.parse(body);
    } catch {
      fail();
    }
  }
  if (!plan || !Array.isArray(plan.records) || plan.records.length > 100)
    fail();
  const byId = new Map(blocks.map((b) => [b.id, b])),
    owners = new Map();
  function ids(value = [], owner) {
    if (!Array.isArray(value) || value.length > blocks.length) fail();
    return [...new Set(value)].map((id) => {
      if (!byId.has(id) || (owners.has(id) && owners.get(id) !== owner)) fail();
      owners.set(id, owner);
      return id;
    });
  }
  const records = plan.records.map((r, index) => {
    if (!r || !importKinds.includes(r.kind)) fail();
    const refs = [];
    const excerpt = (value) => {
      if (value == null) return "";
      if (
        !value ||
        typeof value.quote !== "string" ||
        !value.quote.trim() ||
        value.quote.length > 1000 ||
        !byId.get(value.id)?.text.includes(value.quote) ||
        /\[(?:个人信息|联系方式)已隐藏\]/u.test(value.quote)
      )
        fail();
      ids([value.id], index);
      refs.push(value.id);
      return value.quote;
    };
    const name = excerpt(r.name),
      role = excerpt(r.role),
      date = excerpt(r.date);
    const body = ids(r.body, index);
    if (!refs.length && !body.length) fail();
    const details = {};
    if (r.details) {
      if (typeof r.details !== "object" || Array.isArray(r.details)) fail();
      for (const [key, values] of Object.entries(r.details)) {
        if (
          !detailKeys.includes(key) ||
          r.kind !== "projects" ||
          !Array.isArray(values) ||
          values.some((id) => !body.includes(id))
        )
          fail();
        details[key] = [...new Set(values)];
      }
    }
    return {
      kind: r.kind,
      name,
      role,
      date,
      body,
      details,
      refs: [...new Set([...refs, ...body])],
    };
  });
  const result = { records };
  for (const key of ["summary", "skills", "additional", "headings"])
    result[key] = ids(plan[key], key);
  if (
    result.headings.some((id) => {
      const text = byId.get(id).text;
      return text.length > 36 || /[\d。；;！？!?\t]/u.test(text);
    })
  )
    fail();
  // Unknown short lines remain reviewable instead of being discarded just
  // because the model called them headings.
  result.headings = result.headings.filter((id) =>
    /^(?:.{0,8}(?:经历|经验|背景|技能|能力|简介|评价|总结|作品|作品选|代表作|项目|实践|研究|荣誉|奖项|证书|信息|联系方式|技术栈|教育)|education|academic background|work experience|professional experience|internships|experience|projects|selected projects|research|research experience|skills|summary|profile|awards|certifications)$/iu.test(
      byId.get(id).text,
    ),
  );
  return result;
}

export function combineImportPlans(plans) {
  const result = {
    records: [],
    summary: [],
    skills: [],
    additional: [],
    headings: [],
  };
  for (const plan of plans) {
    for (const incoming of plan.records) {
      const prior = result.records.find((r) =>
        r.refs.some((id) => incoming.refs.includes(id)),
      );
      if (!prior) {
        result.records.push(structuredClone(incoming));
        continue;
      }
      // Shared identity/body across overlapping windows is the only automatic
      // join. A repeated company name alone must not merge two internships.
      if (
        prior.kind !== incoming.kind ||
        (prior.name && incoming.name && prior.name !== incoming.name) ||
        (prior.date && incoming.date && prior.date !== incoming.date)
      )
        fail();
      for (const field of ["name", "role", "date"])
        prior[field] ||= incoming[field];
      for (const field of ["body", "refs"])
        prior[field] = [...new Set([...prior[field], ...incoming[field]])];
      for (const [key, ids] of Object.entries(incoming.details))
        prior.details[key] = [
          ...new Set([...(prior.details[key] || []), ...ids]),
        ];
    }
    for (const key of ["summary", "skills", "additional", "headings"])
      result[key].push(...plan[key]);
  }
  const owners = new Map();
  for (const [index, record] of result.records.entries()) {
    for (const id of record.refs) {
      if (owners.has(id) && owners.get(id) !== index) fail();
      owners.set(id, index);
    }
  }
  for (const key of ["summary", "skills", "headings"])
    result[key] = [...new Set(result[key])].filter((id) => !owners.has(id));
  result.additional = [...new Set(result.additional)];
  return result;
}

export function resolveImportPlan(plan, local, source, modelBlocks) {
  const byId = new Map(source.blocks.map((b) => [b.id, b]));
  const order = (ids) =>
    [...new Set(ids)].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const text = (ids) =>
    order(ids)
      .map((id) => byId.get(id).text)
      .join("\n");
  const result = { ...local, profile: { ...local.profile }, projects: [] };
  for (const kind of importKinds)
    if (kind !== "projects") result.profile[kind] = [];
  const evidence = {},
    used = new Set([...plan.summary, ...plan.skills, ...plan.headings]);
  const remainders = [];
  for (const r of plan.records) {
    // Model fields must also occur in the unredacted source.
    if (
      [r.name, r.role, r.date].some(
        (v) => v && !r.refs.some((id) => byId.get(id)?.text.includes(v)),
      )
    )
      fail();
    const id = crypto.randomUUID();
    for (const ref of r.refs) used.add(ref);
    evidence[id] = order(r.refs);
    const body = order(r.body).map((id) =>
      byId.get(id).text.replace(/^[•●▪◦◆◇·*–-]\s*/u, ""),
    );
    if (r.kind === "projects")
      result.projects.push({
        id,
        name: r.name,
        role: r.role,
        date: r.date,
        tags: [],
        facts: body,
        details: Object.fromEntries(
          Object.entries(r.details).map(([key, ids]) => [key, text(ids)]),
        ),
      });
    else
      result.profile[r.kind].push({
        ...newRecord(() => id),
        organization: r.name,
        title: r.role,
        period: r.date,
        description: body.join("\n"),
      });
    // A model may quote only a part of an identity line. Keep meaningful
    // leftovers available so courses, qualifiers and extra dates are not lost.
    for (const ref of r.refs.filter((id) => !r.body.includes(id))) {
      let rest = byId.get(ref).text;
      for (const value of [r.name, r.role, r.date].filter(Boolean))
        rest = rest.replace(value, "");
      if (rest.replace(/[\s|｜·/：:()（）—–-]/gu, "").length > 1)
        remainders.push(rest.trim());
    }
  }
  result.profile.summary = text(plan.summary);
  result.profile.skills = text(plan.skills);
  const remaining = order([
    ...plan.additional.filter((id) => !used.has(id)),
    ...modelBlocks.filter((b) => !used.has(b.id)).map((b) => b.id),
  ]);
  result.additional = [
    ...remaining.map((id) => byId.get(id).text),
    ...remainders,
  ].join("\n");
  result.importSource = {
    ...source,
    evidence,
    method: "ai",
    unmatched: remaining,
  };
  return result;
}

export async function organizeResume({
  source,
  local,
  settings,
  connection,
  signal,
  onProgress,
  ask = requestResumeImport,
}) {
  const blocks = importModelBlocks(source, local.profile);
  if (!blocks.length) throw Error("没有可供整理的经历正文，可以继续手动补充。");
  if (blocks.reduce((n, b) => n + b.text.length, 0) > importLimit.characters)
    throw Error(
      "本次正文较长，请按简历页拆分后使用 AI 整理。已读取的内容可以继续手动校对。",
    );
  const batches = importBatches(blocks),
    plans = [];
  let calls = 0;
  async function run(batch) {
    signal.throwIfAborted();
    if (calls >= importLimit.calls)
      throw Error(
        "本次 AI 整理已达到调用上限，可以继续手动校对或拆分文件后重试。",
      );
    calls++;
    onProgress?.(
      "正在整理经历 · " + calls + " / " + Math.max(batches.length, calls),
    );
    try {
      const raw = await ask({
        settings,
        connectionId: connection.id,
        signal,
        importApproval: {
          connectionId: connection.id,
          baseUrl: connection.baseUrl,
        },
        prepared: { context: { blocks: batch } },
      });
      return [parseImportPlan(raw, batch)];
    } catch (error) {
      signal.throwIfAborted();
      if (error.code !== "OUTPUT_LIMIT" || batch.length < 8) throw error;
      onProgress?.("正在分段核对较长的经历…");
      const midpoint = Math.ceil(batch.length / 2);
      return [
        ...(await run(batch.slice(0, midpoint + 1))),
        ...(await run(batch.slice(midpoint - 1))),
      ];
    }
  }
  for (const batch of batches) plans.push(...(await run(batch)));
  signal.throwIfAborted();
  return resolveImportPlan(combineImportPlans(plans), local, source, blocks);
}

export function importIssues(parsed) {
  return importKinds
    .flatMap((kind) =>
      (kind === "projects" ? parsed.projects : parsed.profile[kind]).map(
        (r) => ({
          id: r.id,
          kind,
          messages: [
            !(kind === "projects" ? r.name : r.organization)?.trim() &&
              "名称待确认",
            !(kind === "projects" ? r.date : r.period)?.trim() && "时间待补充",
            parsed.importSource?.evidence?.[r.id]?.some(
              (id) => parsed.importSource.blocks.find((b) => b.id === id)?.ocr,
            ) && "核对识别文字",
          ].filter(Boolean),
        }),
      ),
    )
    .filter((item) => item.messages.length);
}
