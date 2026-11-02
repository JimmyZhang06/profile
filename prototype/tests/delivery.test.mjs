import test from "node:test";
import assert from "node:assert/strict";
import {
  job,
  profile,
  projects,
  plan,
  connection,
} from "./fixtures/delivery.mjs";
import {
  prepareDelivery,
  parseDelivery,
  assembleDelivery,
  nextDeliveryFit,
  deliveryIssues,
  localDelivery,
} from "../src/lib/delivery.js";
import {
  initialWorkspace,
  validWorkspace,
  toMarkdown,
} from "../src/lib/workspace.js";
import { runDelivery, runAssistant } from "../src/lib/assistant.js";

const prepare = (approval) =>
  prepareDelivery({ job, profile, projects, approval, connection });
const parse = (value, prepared = prepare()) =>
  parseDelivery("<resume>" + JSON.stringify(value) + "</resume>", prepared);
test("ordinary whole-resume context never smuggles project details through generated bullets or contacts", () => {
  const p = prepare();
  const sent = JSON.stringify(p.context);
  assert(!sent.includes(projects[0].details.actions));
  assert(!sent.includes("PRIVATE-RAW"));
  assert(!sent.includes(profile.contact));
  assert(!sent.includes(profile.name));
  assert(p.seed.resume.sources[0].details.notes.includes("PRIVATE-RAW"));
});
test("detailed scope is exact and bound to its destination", () => {
  const approval = {
    connectionId: connection.id,
    baseUrl: connection.baseUrl,
    scopes: { atlas: ["actions"] },
  };
  assert.deepEqual(prepare(approval).context.sources[0].details, {
    actions: projects[0].details.actions,
  });
  assert.throws(
    () =>
      prepare({ ...approval, baseUrl: "https://different.example.test/v1" }),
    /接收模型/,
  );
});
test("whole draft preserves identities, originals, independent sources and persistent workspace compatibility", () => {
  const p = prepare(),
    original = structuredClone(p);
  const next = assembleDelivery(p, parse(plan, p));
  assert.deepEqual(p, original);
  assert.equal(next.resume.name, profile.name);
  assert.equal(next.resume.contact, profile.contact);
  assert.equal(next.resume.workEntries[0].period, profile.period);
  assert.equal(next.resume.educationEntries[0].organization, profile.school);
  const markdown = toMarkdown(next);
  assert(
    markdown.indexOf("## 教育背景") < markdown.indexOf("## 实习与工作经历"),
  );
  assert(
    markdown.indexOf("## 实习与工作经历") < markdown.indexOf("## 项目经历"),
  );
  const workspace = initialWorkspace();
  workspace.documents.push(next);
  assert(validWorkspace(workspace));
  const broken = structuredClone(workspace);
  broken.documents.at(-1).delivery.requirements = null;
  assert.equal(validWorkspace(broken), false);
  next.resume.sources[0].details.actions = "changed only in this draft";
  assert.equal(
    p.seed.resume.sources[0].details.actions,
    projects[0].details.actions,
  );
});
test("rejects foreign selections, duplicate fields, identity changes and unfinished responses atomically", () => {
  for (const mutate of [
    (p) => p.projectIds.push("unknown"),
    (p) => p.changes.push(p.changes[0]),
    (p) => (p.changes[0].field = "name"),
    (p) => (p.changes[3].field = "atlas:2"),
  ]) {
    const value = structuredClone(plan);
    mutate(value);
    assert.throws(() => parse(value), /未覆盖原简历/);
  }
  assert.throws(() => parseDelivery("<resume>{", prepare()), /未完成/);
});
test("rejects invented numbers, changed units, cross-project proof, goals as outcomes and unrelated JD claims", () => {
  for (const mutate of [
    (p) => (p.changes[3].text = "访谈 99 位创作者。"),
    (p) => (p.changes[3].text = "任务完成率提升 12%。"),
    (p) => (p.changes[3].evidence = p.changes[5].evidence),
    (p) => (p.changes[3].evidence[0].quote = "没有提供过的原文"),
    (p) => (p.requirements[0].requirement = "精通财务建模"),
    (p) => {
      p.projectIds = ["campus"];
      p.changes = p.changes.filter((c) => !c.field.startsWith("atlas:"));
    },
  ]) {
    const value = structuredClone(plan);
    mutate(value);
    assert.throws(() => parse(value), /未覆盖原简历/);
  }
  const p = prepare({
    connectionId: connection.id,
    baseUrl: connection.baseUrl,
    scopes: { atlas: ["goals"] },
  });
  const value = structuredClone(plan);
  value.changes[3].evidence = [
    { source: "atlas:details:goals", quote: projects[0].details.goals },
  ];
  assert.throws(() => parse(value, p), /资料引用不匹配/);
});
test("fitting is finite, uses approved shorter expressions first and preserves essential identities with a font floor", () => {
  let draft = assembleDelivery(prepare(), parse(plan));
  const originalSource = structuredClone(draft.resume.sources);
  draft = nextDeliveryFit(draft);
  assert.equal(draft.resume.summary, plan.changes[0].compact);
  assert.equal(draft.resume.design.fontSize, 11);
  draft = nextDeliveryFit(draft);
  draft = nextDeliveryFit(draft);
  assert.equal(draft.resume.design.fontSize, 10.5);
  assert.equal(nextDeliveryFit(draft), null);
  assert.deepEqual(draft.resume.sources, originalSource);
  assert.equal(draft.resume.name, profile.name);
  assert.equal(draft.resume.contact, profile.contact);
  assert.equal(draft.resume.educationEntries[0].organization, profile.school);
});
test("local path is honest and preflight flags missing contacts and real paper overflow", () => {
  const p = prepare();
  const local = localDelivery(p);
  const doc = assembleDelivery(p, local);
  assert.equal(local.mode, "local");
  assert.equal(local.requirements.length, 0);
  assert.match(doc.title, /本地选材/);
  assert.deepEqual(
    deliveryIssues(doc.resume, { overflow: false, horizontal: false }),
    [],
  );
  assert(
    deliveryIssues(
      { ...doc.resume, contactItems: [] },
      { overflow: true },
    ).some((s) => s.includes("邮箱或电话")),
  );
  assert(
    deliveryIssues(doc.resume, { overflow: true }).some((s) =>
      s.includes("超出一页"),
    ),
  );
});
test("delivery shares the streaming adapter, sends no history, rejects truncation and keeps regular chat parsing", async () => {
  const realFetch = globalThis.fetch;
  const settings = {
    enabled: true,
    capabilities: { rewrite: true },
    bindings: { rewrite: connection.id },
    connections: [connection],
  };
  const p = prepare();
  let request,
    truncate = false,
    lengthLimited = false;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    const raw =
      request.purpose === "delivery"
        ? "<resume>" + JSON.stringify(plan) + "</resume>"
        : "普通回答<changes>[]</changes>";
    const data =
      "data: " +
      JSON.stringify({
        choices: [
          {
            delta: { content: raw },
            finish_reason: lengthLimited ? "length" : null,
          },
        ],
      }) +
      "\n\n" +
      (truncate ? "" : "data: [DONE]\n\n");
    return new Response(data, {
      headers: { "content-type": "text/event-stream" },
    });
  };
  try {
    const result = await runDelivery({
      settings,
      prepared: p,
      signal: new AbortController().signal,
    });
    assert.deepEqual(result.projectIds, plan.projectIds);
    assert.deepEqual(request.history, []);
    assert.equal(request.purpose, "delivery");
    truncate = true;
    await assert.rejects(
      runDelivery({
        settings,
        prepared: p,
        signal: new AbortController().signal,
      }),
      /连接中断/,
    );
    truncate = false;
    lengthLimited = true;
    await assert.rejects(
      runDelivery({
        settings,
        prepared: p,
        signal: new AbortController().signal,
      }),
      /输出已达到长度上限/,
    );
    lengthLimited = false;
    const chat = await runAssistant({
      settings,
      doc: p.seed,
      prompt: "普通对话",
      signal: new AbortController().signal,
      onText() {},
    });
    assert.equal(chat.text, "普通回答");
    assert.equal(request.purpose, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});
