// Manual browser verification fixture. No external traffic and no real model.
// Start explicitly, configure localhost:4188/v1 in the test workspace, then
// remove that test connection and stop this process after verification.
import { createServer } from 'node:http';

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404); res.end(); return;
  }
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 1000000) { res.writeHead(413); res.end(); return; } }
  const request = JSON.parse(raw);
  if (!request.stream) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })); return; }
  const payload = request.messages.find(message => message.content?.startsWith('以下是当前资料：\n'));
  const context = JSON.parse(payload.content.slice('以下是当前资料：\n'.length));
  const source = context.sources.find(project => project.name === '验收示例 · 会员留存提升');
  if (!source || !source.details?.actions) { res.writeHead(400); res.end(); return; }
  const field = context.fields.find(field => field.id.startsWith(source.id + ':'));
  const answer = '【本机模拟验收，无外部模型】已收到本次勾选的详细素材，并为增长运营提供一条待审核表达。\n\n<changes>' + JSON.stringify([
    { field: field.id, after: '【虚构验收建议】基于用户行为进行分层，设计差异化触达方案，并通过活动复盘调整内容。', reason: '依据本次提供的行动过程，对应 JD 中的用户分层与活动复盘。' },
  ]) + '</changes>';
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end('data: ' + JSON.stringify({ choices: [{ delta: { content: answer } }] }) + '\n\ndata: [DONE]\n\n');
  console.log('Verified fictional material request; approved detail keys:', Object.keys(source.details).join(', '));
});
server.listen(4188, '127.0.0.1', () => console.log('Fictional browser verification fixture: http://127.0.0.1:4188/v1'));
