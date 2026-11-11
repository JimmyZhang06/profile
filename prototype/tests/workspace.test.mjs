import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { initialWorkspace, mutateResume, setField, undoDocument, validateSuggestions, acceptedProposal, proposalState, makeDocument, toMarkdown, validWorkspace } from '../src/lib/workspace.js';
import { parseAnswer, runAssistant } from '../src/lib/assistant.js';
import { aiMiddleware, validateConnection } from '../server/ai.mjs';
import {editManuscript,fieldValue} from '../src/lib/workspace.js';
import {conversationHistory} from '../src/lib/assistant.js';
import {moveProjectPoint,projectPointIndices} from '../src/lib/projects.js';

test('on-paper edits persist together, reordered points keep their IDs, structural suggestions survive a follow-up', () => {
  const original=initialWorkspace().documents[0], field='member:0';
  const session={field,id:'one-visit',initial:fieldValue(original.resume,field)};
  let d=editManuscript(original,session,'整理需求。',[]);
  d=editManuscript(d,session,'整理需求。跟进验收。',[]);
  assert.equal(d.undo.length,1);
  assert.deepEqual(undoDocument(d).resume,original.resume);
  const raw='<changes>'+JSON.stringify([{field,after:'整理需求。\n跟进验收。'}])+'</changes>';
  const [p]=parseAnswer(raw,d,true,{selected:field,prompt:'请分成两条'}).proposals;
  assert(p);assert.equal(parseAnswer(raw,d,true,{selected:field,prompt:'改写措辞'}).proposals.length,0);
  d=mutateResume(d,moveProjectPoint(d.resume,field,1),'移动');
  assert.equal(projectPointIndices(d.resume,'member')[1],0);
  d=acceptedProposal(d,p);
  assert(toMarkdown(d).includes('- 整理需求。\n- 跟进验收。'));
  d={...d,messages:[{role:'assistant',text:'调整分段',status:'done',proposals:[p],connectionId:'m'},
    {role:'user',text:'临时详细材料',status:'done',materialOptimization:true},
    {role:'user',text:'另一个连接',status:'done',connectionId:'another'}]};
  const history=conversationHistory(d,'m');
  assert.equal(history.length,1);assert(history[0].content.includes('applied'));assert(history[0].content.includes('跟进验收'));
  const concurrent=mutateResume(original,setField(original.resume,field,'另一端的新文字'));
  assert.equal(editManuscript(concurrent,session,'旧编辑器内容',[]),concurrent);
});

test('an expansion of unchanged wording must add a detail from the selected experience or the user', () => {
  const original = initialWorkspace().documents[0];
  const field = 'member:0', before = '把内容检索与协作需求整理成验收清单。';
  const doc = mutateResume(original, setField(original.resume, field, before));
  const detail = '整理例外流程并复核失败路径。';
  const context = {
    fields: [{id:field,text:before}],
    sources: [{id:'member',facts:[detail]}, {id:'another',facts:['访谈值班人员并记录交接问题。']}],
  };
  const suggestions = (extra, supplied) => validateSuggestions([{field,after:before + extra}], doc, {selected:field,context,supplied});
  assert.equal(suggestions('有效推动整体效率大幅提升。').length, 0);
  assert.equal(suggestions('访谈值班人员并记录交接问题。').length, 0);
  assert.equal(suggestions(detail).length, 1);
  assert.equal(suggestions('编写首轮试用的任务说明。','编写首轮试用的任务说明。').length, 1);
});

test('independent applications preserve source facts and support undo/redo', () => {
  const workspace = initialWorkspace(), original = workspace.documents[0];
  const next = makeDocument({ job: { company: '测试', title: '产品运营', text: '用户分层' }, projects: workspace.library.slice(0, 1), profile: workspace.profile });
  const changed = mutateResume(next, setField(next.resume, 'member:0', '由我确认的新描述'));
  assert.notEqual(changed.resume.overrides['member:0'], original.resume.overrides['member:0']);
  assert.equal(changed.resume.sources[0].facts[0], workspace.library[0].facts[0]);
  assert.deepEqual(undoDocument(changed).resume, next.resume);
  assert.deepEqual(undoDocument(undoDocument(changed), true).resume, changed.resume);
  assert.equal(validWorkspace(JSON.parse(JSON.stringify(workspace))), true);
});

test('stale suggestions never overwrite newer edits or a different JD', () => {
  const doc = initialWorkspace().documents[0];
  const [proposal] = validateSuggestions([{ field: 'summary', after: '关注用户分层与活动复盘。' }], doc);
  const edited = mutateResume(doc, setField(doc.resume, 'summary', '用户刚写入的内容。'));
  assert.equal(proposalState(edited, proposal), 'stale');
  assert.deepEqual(acceptedProposal(edited, proposal), edited);
  assert.equal(proposalState({ ...doc, job: { ...doc.job, text: '另一个 JD' } }, proposal), 'stale');
  const applied = acceptedProposal(doc, proposal);
  assert.equal(proposalState(applied, proposal), 'applied');
  assert.equal(proposalState(undoDocument(applied), proposal), 'pending');
});

test('external suggestions reject unknown fields, duplicate fields and unsupported new numbers', () => {
  const doc = initialWorkspace().documents[0];
  const result = validateSuggestions([{ field: 'name', after: '不能修改身份' }, { field: 'summary', after: '转化率提高 999%' }, { field: 'skills', after: '用户分层 / 数据分析' }, { field: 'skills', after: '重复字段' }], doc);
  assert.equal(result.length, 1); assert.equal(result[0].field, 'skills');
  assert.throws(() => parseAnswer('说明<changes>oops</changes>', doc), /格式不完整/);
  assert.throws(() => parseAnswer('说明<changes>[', doc), /生成中断/);
});

test('Markdown follows selected project order and uses revised text', () => {
  let doc = initialWorkspace().documents[0];
  doc = { ...doc, resume: { ...doc.resume, projectIds: ['activation', 'member'] } };
  doc = mutateResume(doc, setField(doc.resume, 'activation:0', '已确认的最新描述'));
  const text = toMarkdown(doc);
  assert.ok(text.indexOf('新用户激活活动') < text.indexOf('会员权益优化'));
  assert.match(text, /已确认的最新描述/);
  assert.doesNotMatch(text, /客户反馈机制建设/);
});

test('local capabilities are explicit, input-dependent and work without network', async () => {
  const state = initialWorkspace(), input = { doc: state.documents[0], settings: state.settings, library: state.library, signal: new AbortController().signal };
  const result = await runAssistant({ ...input, prompt: '精简个人简介' });
  assert.equal(result.offline, true); assert.equal(result.proposals.length, 1);
  assert.ok(result.proposals[0].before.startsWith(result.proposals[0].after));
  await assert.rejects(runAssistant({ ...input, settings: { ...state.settings, enabled: false }, prompt: '检查' }), /已关闭/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runAssistant({ ...input, signal: controller.signal, prompt: '检查' }), { name: 'AbortError' });
});

test('connection URLs reject insecure remote endpoints and embedded credentials', () => {
  const c = { id: 'test', model: 'test-model' };
  assert.throws(() => validateConnection({ ...c, baseUrl: 'http://example.com/v1' }));
  assert.throws(() => validateConnection({ ...c, baseUrl: 'https://user:password@example.com/v1' }));
  assert.equal(validateConnection({ ...c, baseUrl: 'http://127.0.0.1:8888/v1/' }).baseUrl, 'http://127.0.0.1:8888/v1');
});

test('local proxy forwards streaming responses and protects connection credentials', async t => {
  let received, cancelled = false;
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received = JSON.parse(raw);
    if (received.messages.at(-1).content === 'slow') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: {"choices":[{"delta":{"content":"开始"}}]}\n\n');
      res.on('close', () => { cancelled = true; }); return;
    }
    if (received.model === 'bad') { res.writeHead(401); return res.end('unauthorized'); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: {"choices":[{"delta":{"content":"已检查。"}}]}\n\ndata: [DONE]\n\n');
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const middleware = aiMiddleware(), server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); upstream.closeAllConnections(); upstream.close(); });
  const url = 'http://127.0.0.1:' + server.address().port, headers = { 'Content-Type': 'application/json', 'X-Luli-Client': 'workspace' };
  const post = (path, body, extra = {}) => fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body), ...extra });
  const config = { id: 'integration-test', model: 'test-model', baseUrl: 'http://127.0.0.1:' + upstream.address().port + '/v1', apiKey: 'TEST_ONLY_NOT_A_REAL_SECRET' };
  assert.equal((await post('/api/connections', config)).status, 200);
  const response = await post('/api/chat', { connectionId: config.id, context: {}, prompt: '检查', history: [] });
  assert.match(await response.text(), /已检查/);
  assert.equal(received.stream, true);
  assert.equal(received.max_tokens, 8192);
  const delivery = await post('/api/chat', { connectionId: config.id, purpose: 'delivery', context: {}, prompt: '整份投递稿', history: [{role: 'user', content: 'OLD_PRIVATE_HISTORY'}] });
  await delivery.text();
  assert.match(received.messages[0].content, /<resume>/);
  assert.doesNotMatch(JSON.stringify(received.messages), /OLD_PRIVATE_HISTORY/);
  const listed = await fetch(url + '/api/connections', { headers }).then(r => r.text());
  assert.doesNotMatch(listed, /TEST_ONLY/);
  assert.equal((await post('/api/chat', { connectionId: config.id }, { headers: { ...headers, Origin: 'https://unrelated.example' } })).status, 403);
  await post('/api/connections', { ...config, model: 'bad' });
  assert.equal((await post('/api/chat', { connectionId: config.id, prompt: '测试' })).status, 401);
  await post('/api/connections', config);
  const controller = new AbortController();
  const slow = await post('/api/chat', { connectionId: config.id, prompt: 'slow' }, { signal: controller.signal });
  const reader = slow.body.getReader(); await reader.read(); controller.abort();
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(cancelled, true);
});

// Transport boundary checks use a mock Fetch response, never an external model.
test('local model middleware leaves account and administrator setup requests to the cloud API', async () => {
  const middleware = aiMiddleware();
  for (const url of ['/api/setup/status', '/api/setup/complete', '/api/auth/sign-in/email', '/api/admin/mail', '/api/cloud/health']) {
    let forwarded = false;
    await middleware({ url, headers: {} }, {}, () => { forwarded = true; });
    assert.equal(forwarded, true, url);
  }
});

test('stream parser handles split UTF-8 and CRLF event boundaries', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const state = initialWorkspace(), doc = state.documents[0];
  const answer = '只做基于事实的精简。<changes>' + JSON.stringify([{ field: 'summary', after: '关注用户分层与活动复盘。' }]) + '</changes>';
  const wire = answer.split('').map(c => 'data: ' + JSON.stringify({ choices: [{ delta: { content: c } }] }) + '\r\n\r\n').join('') + 'data: [DONE]\r\n\r\n';
  const bytes = new TextEncoder().encode(wire);
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
  let visible = '';
  const result = await runAssistant({ doc, library: state.library, settings: { ...state.settings, bindings: { rewrite: 'test-connection' } }, prompt: '精简', signal: new AbortController().signal, onText: text => { visible = text; } });
  assert.equal(visible, '只做基于事实的精简。');
  assert.equal(result.proposals.length, 1);
  assert.doesNotMatch(result.text, /changes/);
});

test('unfinished remote stream cannot be treated as a completed suggestion', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"部分文字"}}]}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  const state = initialWorkspace();
  await assert.rejects(runAssistant({ doc: state.documents[0], library: state.library, settings: { ...state.settings, bindings: { rewrite: 'test' } }, prompt: '检查', signal: new AbortController().signal, onText: () => {} }), /连接中断/);
});
