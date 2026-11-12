import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { offerLinkForOpportunity, readOpportunityRef } from '../shared/opportunityOffer.mjs';
import { privateDraftFromOpportunity } from '../src/features/offers/offerDrafts.mjs';
import { calculateOffer } from '../src/features/offers/offerEngine.mjs';
import { suggestedPosterFields } from '../src/features/opportunities/posterFields.js';
import { fictionalOpportunity, opportunityFixture } from './fixtures/opportunities.mjs';

test('poster suggestions preserve edited fields and leave conflicting or unlabeled private material in the original', () => {
  const poster = 'Company: Example Labs\nRole: Product Intern\n城市：深圳\n私人联系人：虚构备注\n产品运营';
  assert.deepEqual(suggestedPosterFields(poster, { company: '我填写的公司' }), { title: 'Product Intern', city: '深圳' });
  assert.deepEqual(suggestedPosterFields(poster + '\n岗位：研发实习', {}), { company: 'Example Labs', city: '深圳' });
});

test('the opportunity link carries only a stable public ID and a reviewed version', () => {
  const item = { ...fictionalOpportunity, id: 'example-post', version: 3, status: 'open' };
  const link = new URL(offerLinkForOpportunity(item), 'https://example.test');
  assert.equal(link.pathname, '/offers');
  assert.deepEqual([...link.searchParams.keys()], ['opportunity', 'version']);
  assert.deepEqual(readOpportunityRef(link.search), { id: item.id, version: 3 });
  assert.equal(offerLinkForOpportunity({ ...item, status: 'closed' }), '/offers');
  for (const search of ['', '?opportunity=example-post&version=0', '?opportunity=a&opportunity=b&version=1', '?opportunity=example-post&version=3.1']) {
    assert.equal(readOpportunityRef(search), null);
  }
});

test('a foreign posted salary does not become a range in the payroll currency', () => {
  const quote = { currency: 'CNY', unit: 'month', min: 8000, max: 10000 };
  const plan = privateDraftFromOpportunity({ ...fictionalOpportunity, id: 'hk', version: 1, status: 'open', compensation: quote });
  assert.deepEqual(plan.publicQuote, quote);
  assert.equal(plan.currency, 'HKD');
  Object.assign(plan, { start: '2026-11-01', end: '2026-11-30' });
  assert.equal(calculateOffer(plan).grossRange ?? null, null);
  plan.salary = 9200;
  assert.equal(calculateOffer(plan).gross, 920000);
});

test('a reviewed listing leads to an independent private offer through the normal cloud routes', async (t) => {
  const { alice, bob, admin, anonymous } = await opportunityFixture(t);
  const draft = (await alice.ok('cloud/opportunity-submissions', 'POST', {
    requestId: randomUUID(), data: fictionalOpportunity,
    source: { description: '虚构岗位集成验收', date: '2026-11-12', permission: '允许公开虚构测试邮箱' },
  })).item;
  const submissionPath = 'cloud/opportunity-submissions/' + draft.id;
  const publicPath = 'public/opportunities/' + draft.opportunity_id;
  const pending = (await alice.ok(submissionPath + '/submit', 'POST', {
    revision: draft.revision, requestId: randomUUID(),
  })).item;
  assert.equal((await anonymous.call(publicPath)).status, 404);
  await admin.ok('admin/opportunity-submissions/' + draft.id + '/review', 'POST', {
    revision: pending.revision, opportunityRevision: pending.opportunity_revision, requestId: randomUUID(),
    decision: 'publish', sourceVerified: true, channelApproved: true, reason: '已核对虚构来源',
  });
  const published = (await anonymous.ok(publicPath)).item;
  const ref = readOpportunityRef(new URL(offerLinkForOpportunity(published), 'https://example.test').search);
  assert.deepEqual(ref, { id: published.id, version: published.version });
  const imported = privateDraftFromOpportunity(published);
  assert.deepEqual(imported.opportunity, ref);
  assert.deepEqual(imported.publicQuote, fictionalOpportunity.compensation);
  assert.equal(imported.salary, null);
  assert.equal(imported.kind, 'internship');
  assert.equal(imported.period, 'contract');
  const plan = { ...imported, start: '2026-11-01', end: '2026-12-31', salary: 9100 };
  const saved = (await bob.ok('cloud/offers', 'POST', { plan })).item;
  const privatePath = 'cloud/offers/' + saved.id;
  const revised = { ...plan, salary: 9350 };
  await bob.ok(privatePath, 'PUT', { plan: revised, revision: saved.revision });
  assert.equal((await bob.ok(privatePath)).item.data.salary, 9350);
  assert.deepEqual((await anonymous.ok(publicPath)).item, published);
  assert.equal((await alice.call(privatePath)).status, 404);
  assert.equal((await anonymous.call(privatePath)).status, 401);
});
