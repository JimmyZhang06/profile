import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { opportunityFixture } from '../fixtures/opportunities.mjs';
import { job, projects } from '../fixtures/delivery.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.LULI_PLAYWRIGHT_MODULE || 'playwright');
const { app, config, base, alice, aliceUser, bob, admin } = await opportunityFixture();
let browser;
try {
  config.allowedModelHosts = ['writer.example.test'];
  for (const n of [1, 2]) await admin.ok('admin/models', 'POST', {
    id: 'platform:fixture' + n, name: '内部连接' + n, model: 'hidden-engine-' + n,
    baseUrl: 'https://writer.example.test/v1', apiKey: 'fixture-only', enabled: true,
    monthlyLimit: 100, reason: '虚构浏览器验收',
  });
  const workspace = await alice.ok('cloud/workspace');
  workspace.state.library = projects;
  await alice.ok('cloud/workspace', 'PUT', { state: workspace.state, revision: workspace.revision, mutationId: crypto.randomUUID() });
  Object.assign(config, { production: true, staticRoot: resolve(process.env.LULI_TEST_CLIENT || 'dist/client'), origins: [...config.origins, base] });
  browser = await chromium.launch({ headless: true, channel: process.env.LULI_CHROMIUM_CHANNEL || undefined });
  const errors = [];
  async function device() {
    const context = await browser.newContext({ viewport: {width: 1280, height: 840}, locale: 'zh-CN' });
    await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(9000);
    return { context, page };
  }
  const signIn = (context, client) => context.addCookies([...client.cookies].map(([name, value]) => ({ name, value, url: base })));
  const {page, context} = await device();
  await page.goto(base + '/offers');
  const button = (p, name) => p.getByRole('button', {name, exact:true});
  await page.getByLabel('已确认税前报价（CNY）', {exact:true}).fill('10000');
  await button(page, '登录后保存').click();
  await page.locator('#account-panel').waitFor();
  await signIn(context, alice);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await button(page, '直接进入云工作区').click();
  await button(page, '确认保存到此账号').waitFor();
  assert.equal((await alice.ok('cloud/offers')).items.length, 0);
  const writes = [];
  // Simulate losing only the response to a successful POST, then revisit as another account.
  await page.route('**/api/cloud/offers', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    writes.push(route.request().postDataJSON());
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    return writes.length === 1 ? route.abort('connectionreset') : route.fulfill({response});
  });
  await button(page, '确认保存到此账号').click();
  await page.getByRole('status').filter({hasText:'恢复网络后会继续保存'}).waitFor();
  assert.equal((await alice.ok('cloud/offers')).items.length, 1);
  await context.clearCookies();
  await signIn(context, bob);
  await page.reload();
  await button(page, '进入当前账号的工作区').click();
  await page.getByRole('heading', {name:'我的测算记录'}).waitFor();
  assert.doesNotMatch(await page.locator('.offer-save').innerText(), /待同步 · 1|已保存的记录 · 1/);
  assert.equal((await bob.ok('cloud/offers')).items.length, 0);
  await context.clearCookies();
  await signIn(context, alice);
  await page.reload();
  await button(page, '进入当前账号的工作区').click();
  await page.getByRole('status').filter({hasText:'已保存到云端'}).waitFor();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], writes[1]);
  assert.equal((await alice.ok('cloud/offers')).items.length, 1);
  const second = await device();
  await signIn(second.context, alice);
  await second.page.goto(base + '/offers?view=living');
  await second.page.getByText('已保存的记录 · 1 份', {exact:true}).click();
  await button(second.page, '恢复到 A').click();
  await second.page.getByRole('link', {name: '返回收入测算'}).click();
  assert.equal(await second.page.getByLabel('已确认税前报价（CNY）', {exact:true}).inputValue(), '10000');

  await page.goto(base);
  await button(page, '设置').click();
  await page.getByRole('tab', {name:'外观', selected:true}).waitFor();
  assert.equal(await page.getByRole('tab', {name:'模型连接'}).count(), 0);
  await page.getByRole('tab', {name:'写作偏好'}).click();
  assert.doesNotMatch(await page.locator('.settings-tab-panel').innerText(), /writer\.example|hidden-engine|内部连接|••••/);
  await button(page, '保存设置').click();
  assert.equal(await button(page, '选择对话模型').count(), 0);
  const requests = [];
  await page.route('**/api/cloud/chat', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({status:429, json:{error:'测试写作暂停'}});
  });
  await button(page, '按 JD 生成投递版').click();
  await page.getByPlaceholder('例如：AI 产品实习生').fill(job.title);
  await page.getByPlaceholder('粘贴完整 JD…').fill(job.text);
  const generate = button(page, '发送所选资料并生成简历');
  await generate.waitFor();
  assert.ok(await generate.isEnabled());
  assert.doesNotMatch(await page.locator('.tailor-fields').innerText(), /次调用|writer\.example|hidden-engine|模型设置|内部连接/);
  await page.setViewportSize({width:390, height:844});
  await page.emulateMedia({colorScheme:'dark'});
  assert.ok(await generate.evaluate(el => {
    const box = el.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
  }));
  await page.getByText('调整候选经历与资料范围', {exact:false}).first().click();
  const project = page.locator('.tailor-source').filter({hasText:projects[0].name});
  const checked = project.locator('.tailor-scope input:checked').first();
  assert.ok(await checked.isChecked());
  await checked.uncheck();
  const expectedScopes = await project.locator('.tailor-scope input:checked').count();
  await page.getByText('查看发送范围与隐私', {exact:true}).click();
  assert.match(await page.locator('.tailor-context').innerText(), /writer\.example\.test/);
  assert.doesNotMatch(await page.locator('.tailor-context').innerText(), /PRIVATE-RAW-NOTE/);
  assert.equal(requests.length, 0);
  await generate.click();
  await page.getByRole('alert').filter({hasText:'测试写作暂停'}).waitFor();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].connectionId, 'platform:fixture1');
  assert.equal(requests[0].materialApproval.baseUrl, 'https://writer.example.test/v1');
  assert.equal(requests[0].materialApproval.scopes.atlas.length, expectedScopes);
  assert.ok(!requests[0].materialApproval.scopes.atlas.includes('notes'));
  assert.doesNotMatch(JSON.stringify(requests[0]), /PRIVATE-RAW-NOTE/);
  assert.equal((await alice.ok('cloud/me')).user.id, aliceUser.id);
  assert.deepEqual(errors, []);
  console.log('Verified guest handoff, account isolation, idempotent replay, second device restore, settings, and scoped generation.');
} finally {
  await browser?.close();
  await app.close();
}
