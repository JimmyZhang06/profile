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
  nextPageAdjustment,
  deliveryChecks,
  deliveryIssues,
  localDelivery,
  deliveryMaterials,
  withApplicationAvailability,
} from "../src/lib/delivery.js";
import {
  initialWorkspace,
  validWorkspace,
  toMarkdown,
  fieldValue,
  setField,
  mutateResume,
  undoDocument,
} from "../src/lib/workspace.js";
import {requirementReview, reviewFields, reviewValue, setReviewValue, reviewExperiences, setReviewExperience} from "../src/lib/deliveryReview.js";
import { parseAnswer, runDelivery, runAssistant, rewriteField, refitDelivery } from "../src/lib/assistant.js";
import { deliveryFieldStream } from "../src/lib/deliveryStream.js";
import { composePage, paperOutline, writingPaper } from "../src/lib/deliveryComposition.js";
import { pageWritingBudget } from "../src/lib/deliverySpace.js";
import { deliveryMessages } from "../server/delivery-prompt.mjs";
import { changedSpan, rewriteIssue } from "../src/lib/revisionText.js";
import { chatDeliveryJob, jobFromListing, jobFromFragment, screeningBatches, restoreDeliveryIds, deliveryModelContext, shortlistedContext } from "../src/lib/deliverySelection.js";

const prepare = (approval) =>
  prepareDelivery({ job, profile, projects, approval, connection });
test("physical space changes the writer's line and section budgets without transmitting the private header", () => {
  const {context, seed} = prepare();
  const small = pageWritingBudget({lines:17,columns:42},context);
  const large = pageWritingBudget({lines:43,columns:42},context);
  assert(small.bodyLines < large.bodyLines && small.perWork < large.perWork);
  const messages = deliveryMessages({deliveryFormat:'short-ids', paperSpace:{lines:17,columns:42, extra:profile.contact}},context);
  assert.match(messages.at(-1).content, /约剩 17 行/);
  assert(!JSON.stringify(messages).includes(profile.contact));
  const outline = paperOutline(seed.resume);
  assert.equal(outline.contact,seed.resume.contact);
  assert.deepEqual(outline.projectIds,[]);
  assert.equal(outline.educationEntries[0].organization,profile.school);
  assert.equal(outline.workEntries.length,0);
  assert.equal(outline.educationEntries[0].description,'');
});
test("streaming reveals only complete, evidenced field objects ahead of the final JSON, including split quotes and braces", () => {
  const p = prepare(), collected = [];
  const receive = deliveryFieldStream(p,c => collected.push(c));
  const value = structuredClone(plan);
  value.changes[0].text = '整理“访谈”信息，使用 {"需求"} 清单。';
  const content = '<resume>' + JSON.stringify(value);
  const boundary = content.indexOf(',"requirements"');
  for (const ch of content.slice(0,boundary)) receive(ch);
  assert.deepEqual(collected.map((c) => c.field),plan.changes.map((c) => c.field));
  assert.equal(collected[0].text,value.changes[0].text);
  assert.throws(() => parseDelivery(content.slice(0,boundary),p));
  for (const ch of content.slice(boundary)+'</resume>') receive(ch);
  assert.equal(parseDelivery(content+'</resume>',p).changes.length,collected.length);
  const bad = structuredClone(plan); bad.changes[1].text = '增长 98765%';
  const only = []; deliveryFieldStream(p,c=>only.push(c))('<resume>'+JSON.stringify(bad)+'</resume>');
  assert.deepEqual(only.map((c) => c.field),['summary']);
  assert.throws(() => parseDelivery(bad,p),/数字/);
  const partial = writingPaper(paperOutline(p.seed.resume),p.seed.resume,[collected[3]],5);
  assert.equal(fieldValue(partial,'atlas:0'),collected[3].text.slice(0,5));
  assert.deepEqual(partial.projectIds,['atlas']);
  assert.equal(fieldValue(partial,'summary'),'');
});
test("composition adds an evidenced detail when there is room, measures it, and reverses it if it crowds the page", () => {
  const p = prepare(), value = structuredClone(plan);
  const lead = value.changes.find((c)=>c.field==='atlas:0');
  lead.evidence.push({source:'atlas:fact:1',quote:projects[0].facts[1]});
  lead.expanded = lead.text + projects[0].facts[1];
  const draft = assembleDelivery(p,parseDelivery(value,p));
  const first = composePage(draft,{heightMm:210,overflow:false,horizontal:false},{tried:[]});
  assert.equal(fieldValue(first.doc.resume,lead.field),lead.expanded);
  const rollback = composePage(first.doc,{heightMm:295,overflow:false,horizontal:false},first.pass);
  assert.equal(rollback.doc.resume,draft.resume);
  assert.equal(composePage(rollback.doc,{heightMm:240,overflow:false,horizontal:false},rollback.pass),null);
  const reduced = composePage(draft,{heightMm:300,overflow:true,overflowMm:3,horizontal:false},{tried:[]});
  const changed = plan.changes.filter((c)=>fieldValue(reduced.doc.resume,c.field)!==fieldValue(draft.resume,c.field));
  assert.equal(changed.length,1);
  assert.equal(reduced.doc.resume.design.fontSize,11);
  lead.expanded = lead.text + '提升 500% 的营收。';
  assert.equal(parseDelivery(value,p).changes.find((c)=>c.field===lead.field).expanded,undefined);
});
test("unused JD evidence can supply one complete project fact while preserving attribution and the raw archive", () => {
  const extra='根据访谈记录整理内容权限与审核节点，交付一份可供逐项复测的需求清单。';
  const sources=structuredClone(projects); sources[0].facts.push(extra);
  const p=prepareDelivery({job,profile,projects:sources,connection});
  const answer=structuredClone(plan);
  answer.requirements[0].evidence.push({source:'atlas:fact:2',quote:extra});
  const draft=assembleDelivery(p,parseDelivery(answer,p));
  const next=composePage(draft,{heightMm:230,overflow:false,horizontal:false},{tried:[]});
  assert.equal(fieldValue(next.doc.resume,'atlas:2'),extra);
  assert.equal(next.doc.delivery.changes.at(-1).evidence[0].source,'atlas:fact:2');
  const revert=composePage(next.doc,{heightMm:290,overflow:false,horizontal:false},next.pass);
  assert.deepEqual(revert.doc,draft);
  assert.equal(composePage(revert.doc,{heightMm:230,overflow:false,horizontal:false},revert.pass),null);
  assert.deepEqual(p.seed.resume.sources,sources);
});
test("a scoped revision sends only the selected paragraph, rejects cosmetic edits and can change the paper", async () => {
  const p = prepare(), doc = assembleDelivery(p,parseDelivery(plan,p)), original = globalThis.fetch;
  const settings = {enabled:true,capabilities:{rewrite:true},connections:[connection],bindings:{rewrite:connection.id}};
  const before = doc.resume.summary, after = '整理需求并验证方案。';
  let returned = before;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.history,[]); assert.deepEqual(body.context.sources,[]);
    assert.deepEqual(body.context.fields.map((f)=>f.id),['summary']);
    assert(!JSON.stringify(body).includes(profile.contact));
    const content = '<changes>'+JSON.stringify([{field:'summary',after:returned,reason:'合并重复的能力表述。'}])+'</changes>';
    return new Response('data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\ndata: [DONE]\n\n');
  };
  const run = () => rewriteField({doc,selected:'summary',settings,connectionId:connection.id,
    direction:'shorter',instruction:'',signal:new AbortController().signal});
  try {
    await assert.rejects(run(),/有效替换/);
    returned=after; const result=await run();
    assert.equal(setField(doc.resume,result.field,result.after).summary,after); assert.equal(doc.resume.summary,before);
    assert.deepEqual(changedSpan('整理材料','整理需求').after,{lead:'整理',edit:'需求',end:''});
    assert(rewriteIssue('转化率 5%','推广覆盖 5 万人','outcome'));
    assert(rewriteIssue('分析岗位和需求','分析岗位与需求','shorter'));
    assert(!parseAnswer('已优化<changes>'+JSON.stringify([{field:'summary',after:before+'！'}])+'</changes>',doc).text.includes('已优化'));
  } finally {globalThis.fetch=original;}
});
test("exceptional shortening reuses only selected materials in one writing call with a smaller measured budget", async () => {
  const p = prepare(), value = structuredClone(plan);
  value.projectIds=['atlas']; value.changes=value.changes.filter((c)=>c.field!=='campus:0');
  const draft=assembleDelivery(p,parseDelivery(value,p));
  const original=globalThis.fetch, calls=[];
  globalThis.fetch=async (_url,opts) => {
    const body=JSON.parse(opts.body); calls.push(body);
    const content='<resume>'+JSON.stringify(value)+'</resume>';
    return new Response('data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\ndata: [DONE]\n\n');
  };
  try {
    const input={prepared:p,connectionId:connection.id,settings:{connections:[connection]}};
    const result=await refitDelivery(input,draft,{lines:38,columns:45},14,new AbortController().signal);
    assert.equal(calls.length,1); assert(calls[0].condense); assert(calls[0].paperSpace.lines<38);
    assert.deepEqual(calls[0].context.sources.map((s)=>s.id),['atlas']); assert.deepEqual(result.projectIds,['atlas']);
  } finally {globalThis.fetch=original;}
});
test("in-product proofing preserves a manual rewrite, hidden sources, undo and the original archive", () => {
  const prepared = prepare(), doc = assembleDelivery(prepared, parseDelivery(plan, prepared));
  const source = structuredClone(doc.resume);
  let r = setReviewValue(doc.resume, "summary", "已由本人核对的表达");
  const item = reviewExperiences(r).find((p) => p.id === "atlas");
  r = setReviewExperience(r, item, false);
  const fit = nextPageAdjustment(r, doc.delivery.changes);
  assert.equal(fit.resume.summary, "已由本人核对的表达");
  assert.equal(fieldValue(fit.resume,"atlas:0"),fieldValue(source,"atlas:0"));
  assert(!reviewFields(fit.resume).some((f) => f.value === "atlas:0"));
  assert.deepEqual(setReviewExperience(fit.resume, item, true).projectIds, source.projectIds);
  const saved = mutateResume(doc, fit.resume, "一页校稿");
  assert.deepEqual(undoDocument(saved).resume, source);
  assert.deepEqual(doc.resume, source);
  assert.deepEqual(doc.resume.sources, prepared.seed.resume.sources);
  assert.equal(validWorkspace({...initialWorkspace(), documents:[saved], activeId:saved.id}), true);
});
test("JD evidence points to the current copy and distinguishes edited wording and hidden experience", () => {
  const prepared = prepare(), doc = assembleDelivery(prepared, parseDelivery(plan, prepared));
  const requirement = doc.delivery.requirements[0];
  const review = (r) => requirementReview(r, doc.delivery, requirement);
  assert.deepEqual(review(doc.resume), {label:'可对照当前正文', field:'atlas:0'});
  const marked = {...doc.resume, textStyles:{'atlas:0':{marks:[{start:0, end:2, bold:true}]}}};
  const fitted = nextPageAdjustment(marked, doc.delivery.changes);
  assert.equal(fieldValue(fitted.resume, 'atlas:0'), fieldValue(marked, 'atlas:0'));
  const edited = setReviewValue(doc.resume, 'atlas:0', '整理访谈记录与需求清单。');
  assert.deepEqual(review(edited), {label:'措辞已调整，请核对', field:'atlas:0'});
  const item = reviewExperiences(edited).find((p) => p.id === 'atlas');
  const hidden = setReviewExperience(edited, item, false);
  assert.deepEqual(review(hidden), {label:'关联经历未展示', field:'experiences'});
  assert.deepEqual(review(setReviewExperience(hidden, item, true)), review(edited));
});
test("actionable header and education fixes work on legacy and structured drafts without counting an arrival date as a phone", () => {
  const legacy = {...prepare().seed.resume, contact:"杭州", contactItems:undefined};
  const dated = setReviewValue(legacy, "@availability", "2028 届，2027-03-01 到岗，可实习 6 个月，每周 4 天");
  const target = {text:"请写毕业年份、到岗时间、可实习时长和每周出勤天数"};
  assert.deepEqual(deliveryChecks(dated, null, target).map((x) => x.target), ["@email"]);
  let r = setReviewValue({...dated, school:"", educationEntries:[]}, "@email", "apply@example.test");
  assert(deliveryChecks(r, null, target).some((x) => x.target === "@school"));
  r = setReviewValue(r, "@school", "测试大学");
  r = setReviewValue(r, "@school", "测试大学新校区");
  assert.equal(r.educationEntries.length, 1);
  assert(reviewFields(r).some((f) => f.value === "@school" && f.paperField === r.educationEntries[0].id + ":organization"));
  assert.equal(reviewValue(r, "@email"), "apply@example.test");
  assert(r.contact.includes("杭州"));
  assert.deepEqual(deliveryChecks(r, null, target), []);
  assert.equal(reviewValue(legacy, "@availability"), "");
  r = setField(r, "summary", "");
  assert.deepEqual(deliveryChecks(setReviewValue(r, "@availability", "2028 届，可到岗，6 个月"), null, target).map((x) => x.target), ["@availability"]);
});
test("materials arriving after the form opens use current defaults and preserve each explicit choice", () => {
  const archived = {...projects[1], id:"archived", archived:true};
  const sample = {...projects[0], id:"sample", example:true};
  const options = {campus:false};
  const scopeChoices = {atlas:[]};
  assert.deepEqual(deliveryMaterials([], false, options, scopeChoices).chosen, []);
  const library = [...projects, archived, sample, {...projects[0], id:"new"}];
  const incoming = deliveryMaterials(library, false, options, scopeChoices);
  assert.deepEqual(incoming.chosen.map((p) => p.id), ["atlas","new"]);
  assert.deepEqual(incoming.scopes.atlas, []);
  assert(incoming.scopes.new.includes("results"));
  assert(!incoming.scopes.new.includes("notes"));
  assert(deliveryMaterials(library, true).chosen.includes(sample));
  assert(deliveryMaterials(library, false, {archived:true}).chosen.includes(archived));
});
const parse = (value, prepared = prepare()) =>
  parseDelivery("<resume>" + JSON.stringify(value) + "</resume>", prepared);
test("all work and research are candidates independently of manual visibility, and exclusions stay private", () => {
  const entry = { id: 'seasonal', organization: '测试团队', title: '研究实习', period: '2025.10',
    description: '设计按家庭分组的评估方案。', visible: false, sourceProjectId: 'atlas' };
  const archive = {...profile, workEntries: [entry]};
  const options = {job, profile:archive, projects, connection};
  const all = prepareDelivery(options);
  assert.equal(all.context.fields.find((f) => f.id === 'seasonal:description').period, entry.period);
  assert.equal(archive.workEntries[0].visible, false);
  const excluded = prepareDelivery({...options, excludedRecords: ['seasonal']});
  assert(!JSON.stringify(excluded.context).includes(entry.description));
  const both = {...plan, workIds:['seasonal']};
  assert.throws(() => parse(both, all), /同一段经历/);
  assert(!localDelivery(all).projectIds.includes('atlas'));
});
test("screening batches include a late match, writing cannot restore rejected IDs and each alias maps back to its own source", () => {
  const library = Array.from({length:9}, (_,i)=>({...projects[0], id:'stable-'+i, name:'记录 '+i,
    facts:['候选事实'.repeat(1400) + i]}));
  const prepared = prepareDelivery({job,profile,projects:library,connection});
  const batches = screeningBatches(prepared.context);
  assert(batches.length > 1);
  assert.deepEqual(batches.flatMap((b) => b.sources.map((s) => s.id)), library.map((p) => p.id));
  const last = library.at(-1);
  const chosen = shortlistedContext(prepared.context,[last.id]);
  const wire = deliveryModelContext(chosen);
  assert.deepEqual(wire.sources.map((s) => s.id), ['P1']);
  assert(!JSON.stringify(wire).includes('stable-'));
  const answer = {projectIds:['P1'], workIds:[], researchIds:[], gaps:[],
    changes:[{field:'P1:0',text:'候选事实',evidence:[{source:'P1:fact:0',quote:'候选事实'}]}],
    requirements:[{requirement:'用户访谈',evidence:[{source:'P1:fact:0',quote:'候选事实'}]}]};
  const restored = restoreDeliveryIds(answer,chosen);
  assert.equal(parseDelivery(restored,{...prepared,context:chosen}).changes[0].evidence[0].source,last.id+':fact:0');
  assert.throws(()=>parseDelivery({...restored,projectIds:['stable-0']},{...prepared,context:chosen}),/选材格式/);
});
test("recruiter-requested graduation and availability are checked locally and the reader accepts completed JSON", () => {
  const r = prepare().seed.resume;
  const target = {text:'请附毕业年份、到岗时间和可实习时长'};
  assert(deliveryIssues(r,null,target).some((issue)=>issue.includes('到岗时间')));
  r.contactItems.push({id:'schedule',type:'availability',label:'',visible:true,value:'2028 届 · 可尽快到岗 · 每周 4 天 · 可实习 6 个月'});
  assert.deepEqual(deliveryIssues(r,null,target),[]);
  assert.deepEqual(parseDelivery(JSON.stringify(plan),prepare()).projectIds,plan.projectIds);
});
test("a pasted listing opens the generation scope, while an ordinary edit stays in chat; the schedule belongs only to this draft", () => {
  const text = '❗远山 机器学习产品策划实习生急招\n岗位职责：设计训练数据流程。\n任职资格：能够分析研发需求。';
  assert.equal(chatDeliveryJob(text,job).title, '远山 机器学习产品策划实习生');
  assert.equal(jobFromListing(text,job).title, job.title);
  assert.deepEqual(chatDeliveryJob('帮我按 JD 生成整份简历',job), job);
  assert.equal(chatDeliveryJob('请帮我写简历中的个人简介',job), null);
  const linked = jobFromFragment('#tailor?' + new URLSearchParams({jd:text,title:'产品策划',company:'远山',model:'untrusted',approved:'true'}));
  assert.deepEqual(linked, {title:'产品策划',company:'远山',text});
  const prepared = prepare();
  const availability = '可尽快到岗，每周 4 天，可持续 6 个月';
  const p = withApplicationAvailability(prepared.seed.resume,availability);
  assert(p.contact.includes(availability));
  assert(!prepared.seed.resume.contact.includes(availability));
  assert(!JSON.stringify(prepareDelivery({job,profile:p,projects,connection}).context).includes(availability));
});
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
