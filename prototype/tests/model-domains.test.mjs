import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from 'otplib';
import { createCloudApp } from '../server/cloud/app.mjs';
import { one, query } from '../server/cloud/database.mjs';
import { registerCloudAdapter } from '../server/cloud/models.mjs';
import { readModelDomains } from '../server/cloud/model-domains.mjs';
import { checkModelAddress, normalizeModelHost, modelTestFailure } from '../src/lib/modelDestination.js';

test('domain entry and address hints distinguish a full API address from an allowed hostname', () => {
  assert.equal(normalizeModelHost(' API.Example.COM '), 'api.example.com');
  for (const value of ['*', '*.example.com', 'localhost', 'host.local', 'host.internal', '127.0.0.1', '2130706433', '0x7f000001', '[::1]', 'a..com', '-a.com', 'a-.com', 'https://api.example.com/v1', 'api.example.com:443', 'api.example.com/path']) {
    assert.equal(normalizeModelHost(value), null, value);
  }
  const address = checkModelAddress('https://api.example.com:443/v1/', ['api.example.com']);
  assert.equal(address.state, 'allowed');
  assert.equal(address.baseUrl, 'https://api.example.com/v1');
  assert.equal(checkModelAddress('https://api.example.com/v1', []).state, 'blocked');
  assert.equal(checkModelAddress('https://other.api.example.com/v1', ['api.example.com']).state, 'blocked');
  for (const value of ['http://api.example.com/v1', 'https://key@api.example.com/v1', 'https://api.example.com/v1?key=secret', 'https://api.example.com:8443/v1', 'https://127.0.0.1/v1']) {
    assert.equal(checkModelAddress(value, ['api.example.com']).state, 'invalid', value);
  }
});

test('managed model domains and platform testing enforce authenticated, persistent runtime policy', async t => {
  const mailbox = new Map(), calls = [], dnsCalls = [];
  let providerMode = 'ok';
  const config = {
    memory: true, origin: 'http://127.0.0.1:4198',
    authSecret: 'fictional-domain-review-secret-of-sufficient-length',
    credentialKey: Buffer.alloc(32, 17).toString('base64'), adminEmail: 'admin@example.test',
    allowedModelHosts: ['seed.example.test'],
    deliverOTP: async value => mailbox.set(value.email, value.otp),
    modelLookup: async host => {
      dnsCalls.push(host);
      if (host === 'missing.example.test') throw new Error('fixture DNS failure');
      if (host === 'private.example.test') return [{ address: '127.0.0.1', family: 4 }];
      if (host === 'mixed.example.test') return [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }];
      return [{ address: '8.8.8.8', family: 4 }];
    },
    modelDispatcher: async () => ({ close: async () => {} }),
  };
  registerCloudAdapter('compatible', async request => {
    calls.push(request);
    if (providerMode === 'unauthorized') return new Response('fixture provider error', { status: 401 });
    if (providerMode === 'invalid') return Response.json({ ok: true });
    return Response.json({ choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 5, completion_tokens: 1 } });
  });
  const app = await createCloudApp(config);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  function client() {
    const cookies = new Map();
    return {
      async request(path, method = 'GET', body) {
        const response = await fetch(base + '/api/' + path, {
          method, headers: { 'Content-Type': 'application/json', 'X-Luli-Client': 'workspace', Origin: config.origin, Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; ') },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        for (const entry of response.headers.getSetCookie()) { const [key, ...value] = entry.split(';')[0].split('='); cookies.set(key, value.join('=')); }
        return { status: response.status, data: await response.json() };
      },
      async login(email) {
        assert.equal((await this.request('auth/email-otp/send-verification-otp', 'POST', { email, type: 'sign-in' })).status, 200);
        const result = await this.request('auth/sign-in/email-otp', 'POST', { email, otp: mailbox.get(email) });
        assert.equal(result.status, 200);
      },
    };
  }
  const admin = client(), member = client(), anonymous = client();
  await admin.login(config.adminEmail);
  await t.test('domain management and connection testing require administrator MFA', async () => {
    assert.equal((await anonymous.request('admin/model-domains')).status, 401);
    for (const [path, method, body] of [['admin/model-domains', 'GET'], ['admin/model-domains', 'PUT', { hosts: [] }], ['admin/models/test', 'POST', {}]]) {
      const result = await admin.request(path, method, body);
      assert.equal(result.status, 403); assert.equal(result.data.code, 'STEP_UP_REQUIRED');
    }
    const setup = await admin.request('admin/setup', 'POST', {});
    assert.equal(setup.status, 200);
    const secret = new URL(setup.data.totpURI).searchParams.get('secret');
    assert.equal((await admin.request('admin/verify', 'POST', { code: await generate({ secret }) })).status, 200);
    assert.equal((await admin.request('admin/invitations', 'POST', { email: 'member@example.test', reason: '虚构测试账号' })).status, 200);
    await member.login('member@example.test');
    assert.equal((await member.request('admin/model-domains')).status, 403);
    assert.equal((await member.request('admin/model-domains', 'PUT', { hosts: ['api.example.test'] })).status, 403);
    assert.equal((await member.request('admin/models/test', 'POST', {})).status, 403);
  });
  const domainBody = { revision: 0, reason: '虚构模型服务配置验收' };
  await t.test('invalid, private and mixed DNS destinations cannot be saved', async () => {
    for (const host of ['*.example.test', 'private.example.test', 'mixed.example.test', 'missing.example.test']) {
      const result = await admin.request('admin/model-domains', 'PUT', { ...domainBody, hosts: [host] });
      assert.equal(result.status, 400, host);
    }
    assert.equal((await admin.request('admin/model-domains', 'PUT', { ...domainBody, reason: '', hosts: ['api.example.test'] })).status, 400);
    const current = (await admin.request('admin/model-domains')).data;
    assert.equal(current.revision, 0); assert.deepEqual(current.hosts, ['seed.example.test']);
    assert.equal(dnsCalls.includes('*.example.test'), false);
  });
  let platform, personal;
  await t.test('saving domains makes them immediately usable and protects concurrent updates', async () => {
    const saved = await admin.request('admin/model-domains', 'PUT', { ...domainBody, hosts: ['seed.example.test', 'api.example.test'] });
    assert.equal(saved.status, 200, JSON.stringify(saved.data)); assert.equal(saved.data.revision, 1);
    assert.equal(saved.data.source, 'admin');
    assert.equal((await admin.request('admin/model-domains', 'PUT', { ...domainBody, hosts: ['seed.example.test'] })).status, 409);
    const input = { name: '虚构平台连接', model: 'fixture-model', baseUrl: 'https://api.example.test/v1', apiKey: 'fixture-key-never-exposed', enabled: false, reason: '虚构连接验收' };
    const created = await admin.request('admin/models', 'POST', input);
    assert.equal(created.status, 200, JSON.stringify(created.data)); platform = created.data;
    const savedPersonal = await member.request('cloud/connections', 'POST', { ...input, name: 'Private fixture label', enabled: true });
    assert.equal(savedPersonal.status, 200); personal = savedPersonal.data;
    const settings = (await admin.request('admin/model-domains')).data;
    assert.deepEqual(settings.usage['api.example.test'], { platform: 1, personal: 1 });
    assert.ok(!JSON.stringify(settings).includes('Private fixture label'));
  });
  await t.test('an administrator can test a disabled platform connection without forwarding supplied private content', async () => {
    const result = await admin.request('admin/models/test', 'POST', {
      connectionId: platform.id, context: { private: 'must-not-be-sent' }, prompt: 'must-not-be-sent', history: [{ role: 'user', content: 'must-not-be-sent' }],
    });
    assert.equal(result.status, 200, JSON.stringify(result.data)); assert.equal(result.data.ok, true);
    assert.equal(result.data.model, 'fixture-model'); assert.ok(result.data.durationMs >= 0);
    assert.deepEqual(calls.at(-1).messages, [{ role: 'user', content: 'Reply with OK.' }]);
    assert.equal(calls.at(-1).connection.maxOutputTokens, 64);
    assert.equal(calls.at(-1).connection.apiKey, 'fixture-key-never-exposed');
    assert.equal((await member.request('cloud/test', 'POST', { connectionId: platform.id })).status, 404);
    assert.equal((await admin.request('admin/models/test', 'POST', { connectionId: personal.id })).status, 404);
    assert.equal((await one(app.db, 'SELECT enabled FROM model_connections WHERE id=$1', [platform.id])).enabled, false);
  });
  await t.test('tests surface provider authentication and incompatible response failures and keep metadata only', async () => {
    providerMode = 'unauthorized';
    const failed = await admin.request('admin/models/test', 'POST', { connectionId: platform.id });
    assert.equal(failed.status, 502); assert.equal(failed.data.code, 'PROVIDER_401');
    assert.match(modelTestFailure({ code: failed.data.code, message: failed.data.error }), /认证/);
    providerMode = 'invalid';
    const invalid = await admin.request('admin/models/test', 'POST', { connectionId: platform.id });
    assert.equal(invalid.status, 502); assert.equal(invalid.data.code, 'INVALID_MODEL_RESPONSE');
    providerMode = 'ok';
    const logs = await query(app.db, 'SELECT * FROM audit_events');
    const usage = await query(app.db, 'SELECT * FROM model_usage');
    assert.equal(logs.filter(row => row.action === 'model.test').length, 3);
    assert.equal(usage.filter(row => row.status === 'succeeded').length, 1);
    assert.ok(usage.some(row => row.error_type === 'PROVIDER_401'));
    for (const forbidden of ['fixture-key-never-exposed', 'must-not-be-sent', 'Reply with OK.']) {
      assert.ok(!JSON.stringify({ logs, usage }).includes(forbidden));
    }
  });
  await t.test('revocation blocks existing personal and platform calls, and an empty saved list stays empty', async () => {
    const beforeCalls = calls.length;
    assert.equal((await admin.request('admin/model-domains', 'PUT', { ...domainBody, revision: 1, hosts: [] })).status, 200);
    for (const [actor, path, connectionId] of [[member, 'cloud/test', personal.id], [admin, 'admin/models/test', platform.id]]) {
      const result = await actor.request(path, 'POST', { connectionId });
      assert.equal(result.status, 400); assert.equal(result.data.code, 'DESTINATION_BLOCKED');
    }
    assert.equal(calls.length, beforeCalls);
    assert.deepEqual((await readModelDomains(app.db, { allowedModelHosts: ['would-reappear.example.test'] })).hosts, []);
    assert.deepEqual((await admin.request('admin/models')).data.allowedHosts, []);
    assert.deepEqual((await admin.request('admin/overview')).data.allowedModelHosts, []);
    assert.equal((await one(app.db, 'SELECT COUNT(*)::int AS count FROM model_connections')).count, 2);
  });
});
