import test from "node:test";
import assert from "node:assert/strict";
import {
  importSource,
  importModelBlocks,
  validateImportContext,
} from "../shared/resumeImport.mjs";
import {
  attachImportSource,
  parseImportPlan,
  resolveImportPlan,
  combineImportPlans,
  organizeResume,
} from "../src/lib/resumeImportAI.js";
import {
  appendImportedResume,
  importedResume,
  parseResumeText,
} from "../src/lib/resumeImport.js";
import {
  importArchiveMatches,
  mergeImportRecord,
  moveImportRecord,
  splitImportRecord,
} from "../src/lib/resumeImportReview.js";
import { emptyCloudWorkspace } from "../src/lib/cloudWorkspace.js";
import { validWorkspace } from "../src/lib/workspace.js";
import { resumeImportMessages } from "../server/resume-import-prompt.mjs";

import { fictionalLines, fictionalPlan } from "./fixtures/resume-import.mjs";

function fixture() {
  const text = fictionalLines.join("\n"),
    source = importSource({ text }, "虚构简历.docx");
  const local = attachImportSource(parseResumeText(text), source);
  const blocks = importModelBlocks(source, local.profile);
  return { source, local, blocks };
}
const connection = { id: "fixture", baseUrl: "https://parse.example.test/v1" };
const importApproval = {
  connectionId: connection.id,
  baseUrl: connection.baseUrl,
};

test("nonstandard headings become separate grounded projects, preserving qualifiers, contacts, unmatched wording and source locations", () => {
  const { source, local, blocks } = fixture();
  assert.equal(local.projects.length, 0);
  const result = resolveImportPlan(
    parseImportPlan(fictionalPlan, blocks),
    local,
    source,
    blocks,
  );
  assert.equal(result.profile.workEntries.length, 1);
  assert.equal(result.projects.length, 2);
  assert.equal(result.profile.name, "林明");
  assert.equal(result.profile.contactItems.length, 2);
  assert.equal(
    result.projects[0].details.results,
    "• 完成 2 版原型，尚未上线。",
  );
  assert.match(result.additional, /另有资料待补充/);
  const uncertainHeading = structuredClone(fictionalPlan);
  uncertainHeading.headings.push("b12");
  assert.match(
    resolveImportPlan(
      parseImportPlan(uncertainHeading, blocks),
      local,
      source,
      blocks,
    ).additional,
    /另有资料待补充/,
  );
  assert.deepEqual(result.importSource.evidence[result.projects[0].id], [
    "b7",
    "b8",
    "b9",
  ]);
  const doc = importedResume(result, "解析稿");
  assert.equal(doc.importSource.blocks[6].location, "第 7 行");
  assert(
    validWorkspace(appendImportedResume(emptyCloudWorkspace(), doc, true)),
  );
});

test("model extraction cannot invent wording, reuse another record block, suppress dated content as a heading or quote hidden contacts", () => {
  const { blocks } = fixture();
  const cases = [];
  let plan = structuredClone(fictionalPlan);
  plan.records[0].name.quote = "不存在的公司";
  cases.push(plan);
  plan = structuredClone(fictionalPlan);
  plan.records[0].body.push("b8");
  cases.push(plan);
  plan = structuredClone(fictionalPlan);
  plan.headings.push("b12", "b1000");
  cases.push(plan);
  plan = structuredClone(fictionalPlan);
  plan.records[0].date.quote = "2026.01—2026.02";
  cases.push(plan);
  plan = structuredClone(fictionalPlan);
  plan.records[1].details.results = ["b11"];
  cases.push(plan);
  for (const value of cases)
    assert.throws(() => parseImportPlan(value, blocks), /原文/);
  assert.throws(() => parseImportPlan('<resume_import>{"records":[]}', blocks));
});

test("the client and server restrict this import to its confirmed destination and source blocks without conversation or private header fields", () => {
  const { blocks } = fixture();
  const serialized = JSON.stringify(blocks);
  assert(!serialized.includes("林明"));
  assert(!serialized.includes("liming@example"));
  assert(!serialized.includes("13800138000"));
  assert.throws(() => validateImportContext({ blocks }, null, connection));
  assert.throws(() =>
    validateImportContext(
      { blocks },
      { ...importApproval, connectionId: "other" },
      connection,
    ),
  );
  const body = {
    context: { blocks, private: "must-not-send" },
    importApproval,
    prompt: "must-not-send",
    history: [{ content: "must-not-send" }],
  };
  const messages = resumeImportMessages(body, connection);
  assert.equal(messages.length, 2);
  assert(!JSON.stringify(messages).includes("must-not-send"));
  assert.throws(() =>
    validateImportContext(
      { blocks: [blocks[0], blocks[0]] },
      importApproval,
      connection,
    ),
  );
});

test("overlapping page windows join only shared records and preserve every body block", () => {
  const { source, local, blocks } = fixture();
  const first = structuredClone(fictionalPlan);
  first.records = first.records.slice(0, 2);
  first.records[1].body = ["b8"];
  first.records[1].details = { actions: ["b8"] };
  const second = structuredClone(fictionalPlan);
  second.records = second.records.slice(1);
  second.headings = [];
  const combined = combineImportPlans([
    parseImportPlan(first, blocks),
    parseImportPlan(second, blocks),
  ]);
  const result = resolveImportPlan(combined, local, source, blocks);
  assert.equal(result.projects.length, 2);
  assert.equal(result.projects[0].facts.length, 2);
  second.records[0].date.quote = "2025.05—2025.08";
  second.records[0].date.id = "b10";
  assert.throws(() =>
    combineImportPlans([
      parseImportPlan(first, blocks),
      parseImportPlan(second, blocks),
    ]),
  );
});

test("output-limit retries use shorter overlapping windows and cancellation or quota failure retains the original review", async () => {
  const { source, local } = fixture(),
    snapshot = structuredClone(local);
  let calls = 0;
  await assert.rejects(
    organizeResume({
      source,
      local,
      settings: {},
      connection,
      signal: new AbortController().signal,
      ask: async () => {
        calls++;
        const error = Error("limit");
        error.code = "OUTPUT_LIMIT";
        throw error;
      },
    }),
  );
  assert(calls > 1 && calls <= 12);
  assert.deepEqual(local, snapshot);
  calls = 0;
  await assert.rejects(
    organizeResume({
      source,
      local,
      settings: {},
      connection,
      signal: new AbortController().signal,
      ask: async () => {
        calls++;
        throw Error("本月额度用完");
      },
    }),
    /额度/,
  );
  assert.equal(calls, 1);
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(
    organizeResume({
      source,
      local,
      settings: {},
      connection,
      signal: ctrl.signal,
      ask: async () => assert.fail(),
    }),
  );
  assert.deepEqual(local, snapshot);
});

test("manual reclassification, splitting and merging preserve wording and source references", () => {
  const { source, local, blocks } = fixture();
  const result = resolveImportPlan(
      parseImportPlan(fictionalPlan, blocks),
      local,
      source,
      blocks,
    ),
    id = result.projects[0].id;
  const moved = moveImportRecord(result, id, "researchEntries");
  assert.equal(moved.projects.length, 1);
  assert.match(moved.profile.researchEntries[0].description, /尚未上线/);
  const back = moveImportRecord(moved, id, "projects");
  assert.match(back.projects.at(-1).details.results, /尚未上线/);
  const split = splitImportRecord(result, "projects", id, 1);
  assert.equal(split.projects.length, 3);
  assert.deepEqual(
    split.importSource.evidence[split.projects[1].id],
    result.importSource.evidence[id],
  );
  const merged = mergeImportRecord(split, "projects", split.projects[1].id);
  assert.equal(merged.projects.length, 2);
  assert.match(merged.projects[0].facts.join("\n"), /尚未上线/);
});

test("repeated imports reuse archive entries; a reviewed merge appends new facts while older resume snapshots retain their wording", () => {
  const { source, local, blocks } = fixture();
  const result = resolveImportPlan(
    parseImportPlan(fictionalPlan, blocks),
    local,
    source,
    blocks,
  );
  const doc = importedResume(result, "原稿"),
    state = appendImportedResume(emptyCloudWorkspace(), doc, true);
  const repeated = appendImportedResume(
    state,
    importedResume(result, "再次导入"),
    true,
  );
  assert.equal(repeated.library.length, 2);
  assert.equal(repeated.profile.workEntries.length, 1);
  const spaced = structuredClone(result);
  spaced.projects[0].facts[0] += "  ";
  const whitespaceRepeat = appendImportedResume(
    state,
    importedResume(spaced, "空格变化"),
    true,
  );
  assert.equal(whitespaceRepeat.library.length, 2);
  const changed = structuredClone(result);
  changed.projects[0].facts.push("新增一次需求评审。");
  changed.projects[0].details.actions += "\n新增一次需求评审。";
  const similar = importArchiveMatches(
    changed,
    state.profile,
    state.library,
  ).find((m) => m.id === changed.projects[0].id);
  assert.equal(similar.exact, false);
  const next = appendImportedResume(
    state,
    importedResume(changed, "更新稿"),
    true,
    { [changed.projects[0].id]: "merge" },
  );
  assert.equal(next.library.length, 2);
  assert(next.library[0].facts.includes("新增一次需求评审。"));
  assert(
    !next.documents
      .find((d) => d.id === doc.id)
      .resume.sources[0].facts.includes("新增一次需求评审。"),
  );
  assert(validWorkspace(next));
  const skipped = appendImportedResume(
    state,
    importedResume(changed, "仅存简历"),
    true,
    { [changed.projects[0].id]: "skip" },
  );
  assert.deepEqual(skipped.library, state.library);
  const concurrent = structuredClone(state);
  concurrent.library[0].facts.push("另一设备刚补充的内容。");
  assert.throws(
    () =>
      appendImportedResume(
        concurrent,
        importedResume(changed, "并发导入"),
        true,
        {
          [changed.projects[0].id]: {
            action: "merge",
            targetId: state.library[0].id,
            expected: JSON.stringify(state.library[0]),
          },
        },
      ),
    /已更新/,
  );
});

test("a completed shorter-window retry reconstructs a single grounded result", async () => {
  const { source, local } = fixture();
  let calls = 0;
  const result = await organizeResume({
    source,
    local,
    settings: {},
    connection,
    signal: new AbortController().signal,
    ask: async ({ prepared }) => {
      if (++calls === 1) {
        const error = Error("length");
        error.code = "OUTPUT_LIMIT";
        throw error;
      }
      const available = new Set(prepared.context.blocks.map((b) => b.id)),
        plan = structuredClone(fictionalPlan);
      plan.headings = plan.headings.filter((id) => available.has(id));
      plan.records = plan.records
        .map((r) => {
          for (const key of ["name", "role", "date"])
            if (!available.has(r[key]?.id)) r[key] = null;
          r.body = r.body.filter((id) => available.has(id));
          for (const key of Object.keys(r.details || {}))
            r.details[key] = r.details[key].filter((id) => r.body.includes(id));
          return r;
        })
        .filter((r) => r.name || r.body.length);
      return plan;
    },
  });
  assert.equal(calls, 3);
  assert.equal(result.profile.workEntries.length, 1);
  assert.equal(result.projects.length, 2);
  assert.equal(result.projects[0].facts.length, 2);
});
