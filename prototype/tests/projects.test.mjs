import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { buildProjectBullets, getProjectBullets, prepareProjectSelection } from '../src/lib/projects.js';
import { buildAssistantContext, matchProjects, runAssistant } from '../src/lib/assistant.js';
import { restrictMaterialContext } from '../src/lib/materialScope.js';
import { initialWorkspace, makeDocument, mutateResume, setField, fieldValue, undoDocument, validWorkspace, validateSuggestions, acceptedProposal, proposalState, toMarkdown } from '../src/lib/workspace.js';
import { aiMiddleware } from '../server/ai.mjs';

// All records, endpoints and credentials in these tests are fictional/local.
const productJob = { company: '测试企业', title: '产品经理', text: '需求调研、原型设计、需求评审、验收交付' };
const growthJob = { company: '测试企业', title: '增长运营', text: '用户分层、活动复盘、转化分析' };
const project = {
  id: 'detail-project', name: '验收示例 · 会员体验改进', role: '产品运营', date: '2025.01 — 2025.06', tags: [], facts: [],
  details: {
    background: '针对会员权益发现困难与新用户转化中断开展改进。',
    goals: '项目目标：转化率达到 99%。',
    responsibilities: '负责需求调研与原型设计。\n负责用户分层与转化分析。',
    actions: '组织需求评审并完成验收交付。\n根据用户分层设计触达方案并开展活动复盘。',
    results: '需求调研形成 12 项改进意见。\n活动复盘显示转化率从 21% 提高到 28%。',
    evidence: '测试数据；活动前后对比，不代表纯粹由个人贡献造成。',
    challenges: '合作团队对统计定义存在分歧，先确认共同口径。',
    collaboration: '与客服和数据同学合作。',
    reflection: '在下次实验开始前确定观察窗口。',
    notes: '原始访谈记录：内部标记 RAW_PRIVATE_TEST。',
  },
};
const connection = { id: 'scoped-test', name: '本机测试模型', model: 'test-only', baseUrl: 'http://127.0.0.1:8888/v1' };
const approval = { connectionId: connection.id, baseUrl: connection.baseUrl, scopes: { [project.id]: ['actions', 'results'] } };

test('the same full archive yields distinct JD drafts without changing its facts', () => {
  const original = structuredClone(project);
  const product = buildProjectBullets(project, productJob), growth = buildProjectBullets(project, growthJob);
  assert.notDeepEqual(product, growth);
  assert.ok(product.every(point => /需求|验收/.test(point)));
  assert.ok(growth.every(point => /分层|转化|活动/.test(point)));
  assert.ok([...product, ...growth].every(point => !point.includes('99%')));
  assert.deepEqual(project, original);
  const raw = { ...project, details: { notes: '只保存原始记录，尚未整理职责和结果。' } };
  assert.deepEqual(buildProjectBullets(raw, growthJob), ['', '', '']);
  assert.deepEqual(matchProjects([{ ...project, id: 'unrelated', details: { notes: '普通行政资料' } }, project], productJob).map(item => item.project.id), [project.id, 'unrelated']);
});

test('detailed and legacy archives both survive schema-2 backup round trips', () => {
  const state = initialWorkspace();
  const legacy = structuredClone(state);
  for (const doc of legacy.documents) {
    delete doc.resume.projectBullets;
    for (const version of doc.versions) delete version.resume.projectBullets;
  }
  assert.equal(validWorkspace(legacy), true);
  assert.deepEqual(getProjectBullets(legacy.documents[0].resume, legacy.library[0].id), legacy.library[0].facts);
  state.library.push(structuredClone(project));
  state.documents.push(makeDocument({ projects: [project], job: growthJob }));
  const roundTrip = JSON.parse(JSON.stringify(state));
  assert.equal(validWorkspace(roundTrip), true);
  assert.deepEqual(roundTrip.documents.at(-1).resume.sources[0].details, project.details);
  assert.deepEqual(roundTrip.documents.at(-1).resume.projectBullets, state.documents.at(-1).resume.projectBullets);
  roundTrip.library.at(-1).details.results = { invalid: true };
  assert.equal(validWorkspace(roundTrip), false);
  const invalid = structuredClone(state); invalid.documents[0].resume.projectBullets = 42;
  assert.equal(validWorkspace(invalid), false);
});

test('material updates and JD regeneration preserve independent documents and undo', () => {
  const library = [structuredClone(project)];
  const product = makeDocument({ projects: library, job: productJob });
  const growth = makeDocument({ projects: library, job: growthJob });
  const edited = mutateResume(growth, setField(growth.resume, project.id + ':0', '我已审核的当前岗位表达。'));
  const productBefore = structuredClone(product), sourceBefore = structuredClone(edited.resume.sources);
  library[0].details.actions += '\n新增经确认的行动。';
  assert.deepEqual(edited.resume.sources, sourceBefore);
  const synced = mutateResume(edited, prepareProjectSelection(edited.resume, [project.id], library, growthJob));
  assert.equal(fieldValue(synced.resume, project.id + ':0'), '我已审核的当前岗位表达。');
  assert.equal(synced.resume.sources[0].details.actions, library[0].details.actions);
  const regenerated = mutateResume(synced, prepareProjectSelection(synced.resume, [project.id], library, productJob, { regenerate: true }));
  assert.deepEqual(regenerated.resume.overrides, {});
  assert.deepEqual(undoDocument(regenerated).resume, synced.resume);
  assert.deepEqual(product, productBefore);
  assert.match(toMarkdown(synced), /我已审核的当前岗位表达/);
  assert.doesNotMatch(toMarkdown(synced), /RAW_PRIVATE_TEST|99%|统计定义/);
});

test('suggestions use own-project actual results, reject goals, and expire after source changes', () => {
  const other = { ...project, id: 'other', facts: ['另一项目新增 456 个客户。'], details: {} };
  const doc = makeDocument({ job: growthJob, projects: [project, other] });
  const field = project.id + ':0';
  const proposals = validateSuggestions([
    null, { field, after: '目标转化率达到 99%。' }, { field, after: '新增 456 个客户。' },
    { field, after: '通过活动复盘，观察到转化率从 21% 提高到 28%。', reason: '依据实际成果，对应转化分析要求。' },
  ], doc);
  assert.equal(proposals.length, 1);
  const adopted = acceptedProposal(doc, proposals[0]);
  assert.equal(fieldValue(adopted.resume, field), proposals[0].after);
  assert.deepEqual(adopted.resume.sources, doc.resume.sources);
  const updated = structuredClone(doc); updated.resume.sources[0].details.results = '数据口径待核实。';
  assert.equal(proposalState(updated, proposals[0]), 'stale');
  assert.deepEqual(acceptedProposal(updated, proposals[0]), updated);
});

test('ordinary context contains only current resume points; approved details stay request-scoped', () => {
  const doc = makeDocument({ projects: [project], job: growthJob });
  doc.resume.contact = 'PRIVATE_CONTACT_TEST';
  const before = structuredClone(doc);
  const ordinary = buildAssistantContext(doc, null);
  assert.equal('details' in ordinary.sources[0], false);
  assert.doesNotMatch(JSON.stringify(ordinary), /RAW_PRIVATE_TEST|PRIVATE_CONTACT_TEST|99%/);
  const scoped = buildAssistantContext(doc, null, approval, connection);
  assert.deepEqual(Object.keys(scoped.sources[0].details).sort(), ['actions', 'results']);
  assert.doesNotMatch(JSON.stringify(scoped), /RAW_PRIVATE_TEST|PRIVATE_CONTACT_TEST|99%/);
  assert.deepEqual(doc, before);
  assert.equal('details' in buildAssistantContext(doc, null).sources[0], false);
  assert.throws(() => restrictMaterialContext(scoped), /重新确认/);
  assert.throws(() => restrictMaterialContext(scoped, approval, { ...connection, baseUrl: 'http://127.0.0.1:9999/v1' }), /重新确认/);
  assert.throws(() => restrictMaterialContext(scoped, { ...approval, scopes: { [project.id]: ['actions'] } }, connection), /未确认/);
});

test('transport sends only the chosen details and does not reuse detailed-material chat history', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response('data: {"choices":[{"delta":{"content":"请审核当前建议。<changes>[]</changes>"}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const state = initialWorkspace(), doc = makeDocument({ projects: [project], job: growthJob });
  doc.messages = [
    { role: 'user', status: 'done', text: '普通对话' },
    { role: 'assistant', status: 'done', text: 'RAW_PRIVATE_TEST', materialOptimization: true },
  ];
  const input = { doc, library: [project], settings: { ...state.settings, connections: [connection], bindings: { rewrite: connection.id } }, prompt: '优化当前岗位表达', signal: new AbortController().signal, onText: () => {} };
  await runAssistant({ ...input, materialApproval: approval });
  assert.deepEqual(sent.context.sources[0].details, { actions: project.details.actions, results: project.details.results });
  assert.deepEqual(sent.history, [{ role: 'user', content: '普通对话' }]);
  await runAssistant(input);
  assert.equal('materialApproval' in sent, false);
  assert.equal('details' in sent.context.sources[0], false);
  assert.doesNotMatch(JSON.stringify(sent), /RAW_PRIVATE_TEST/);
});

test('local proxy blocks unapproved scopes or a changed destination before forwarding', async t => {
  let calls = 0, received;
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    calls++; received = JSON.parse(raw);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: {"choices":[{"delta":{"content":"测试响应"}}]}\n\ndata: [DONE]\n\n');
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const middleware = aiMiddleware(), server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); upstream.closeAllConnections(); upstream.close(); });
  const url = 'http://127.0.0.1:' + server.address().port;
  const headers = { 'Content-Type': 'application/json', 'X-Luli-Client': 'workspace' };
  const post = (path, body) => fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const config = { ...connection, baseUrl: 'http://127.0.0.1:' + upstream.address().port + '/v1', apiKey: 'TEST_ONLY_NOT_A_REAL_SECRET' };
  assert.equal((await post('/api/connections', config)).status, 200);
  const approved = { ...approval, baseUrl: config.baseUrl };
  const doc = makeDocument({ projects: [project], job: growthJob });
  const context = buildAssistantContext(doc, null, approved, config);
  const body = { connectionId: config.id, context, prompt: '优化测试资料' };
  assert.equal((await post('/api/chat', body)).status, 400);
  assert.equal((await post('/api/chat', { ...body, materialApproval: approval })).status, 400);
  assert.equal((await post('/api/chat', { ...body, materialApproval: { ...approved, scopes: { [project.id]: [] } } })).status, 400);
  assert.equal(calls, 0);
  const response = await post('/api/chat', { ...body, materialApproval: approved });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /测试响应/);
  assert.equal(calls, 1);
  assert.match(received.messages[1].content, /活动复盘/);
  assert.doesNotMatch(received.messages[1].content, /RAW_PRIVATE_TEST|99%/);
});
