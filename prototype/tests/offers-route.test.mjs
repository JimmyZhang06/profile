import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabase, query, one } from "../server/cloud/database.mjs";
import {
  offerRoute,
  validateOffer,
  validateRuleSet,
} from "../server/cloud/offers.mjs";
import { emptyOffer, RULESET } from "../src/features/offers/offerEngine.mjs";

test("private offer persistence is owner-bound, versioned and independent from resume tables", async (t) => {
  const database = await createDatabase({ memory: true });
  t.after(() => database.close());
  const db = database.db;
  await query(db, 'CREATE TABLE "user" (id TEXT PRIMARY KEY)');
  await query(
    db,
    "INSERT INTO \"user\"(id) VALUES('fictional-a'),('fictional-b')",
  );
  await query(
    db,
    "CREATE TABLE audit_events (id TEXT,actor_id TEXT,actor_email TEXT,action TEXT,target TEXT,before_value JSONB,after_value JSONB,reason TEXT)",
  );
  const source = await readFile(
    new URL("../server/cloud/offers.sql", import.meta.url),
    "utf8",
  );
  for (const sql of source
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await query(db, sql);
  const a = { id: "fictional-a", email: "a@example.test" },
    b = { id: "fictional-b", email: "b@example.test" };
  const route = (actor, path, method = "GET", input = {}) =>
    offerRoute({
      db,
      actor,
      req: {},
      path: new URL(path, "http://localhost").pathname,
      url: new URL(path, "http://localhost"),
      method,
      readBody: async () => input,
    });
  assert.equal(
    (await route(null, "/api/public/offer-rules")).ruleset.version,
    RULESET.version,
  );
  await assert.rejects(
    () => route(null, "/api/cloud/offers"),
    (e) => e.status === 401,
  );
  const plan = emptyOffer("虚构测试方案");
  plan.start = "2026-01-01";
  plan.livingBudget = { city: "shenzhen", wallets: { CN: { net: 8000, goal: 1500 } },
    places: { shenzhen: { shared: 1600, daily: 2100, fixed: 100 } } };
  const requestId = "fictional-save";
  const { item } = await route(a, "/api/cloud/offers", "POST", { plan, requestId });
  assert.deepEqual((await route(a, "/api/cloud/offers", "POST", { plan, requestId })).item, item);
  assert.equal((await route(a, "/api/cloud/offers")).items.length, 1);
  await assert.rejects(() => route(a, "/api/cloud/offers", "POST", { plan: { ...plan, name: "另一份" }, requestId }), e => e.status === 409);
  assert.equal(item.revision, 1);
  assert.equal(item.snapshot.algorithm, "offers-1.0.0");
  assert.deepEqual((await route(a, "/api/cloud/offers/" + item.id)).item.data.livingBudget, plan.livingBudget);
  await assert.rejects(() => route(a, "/api/cloud/offers", "POST", { plan: { ...plan, livingBudget: { city: "invalid" } } }),
    (e) => e.status === 400);
  assert.equal((await route(b, "/api/cloud/offers")).items.length, 0);
  await assert.rejects(
    () => route(b, "/api/cloud/offers/" + item.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () =>
      route(b, "/api/cloud/offers/" + item.id, "PUT", { plan, revision: 1 }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () => route(b, "/api/cloud/offers/" + item.id + "?revision=1", "DELETE"),
    (e) => e.status === 409,
  );
  const changed = { ...plan, name: "私人修改" };
  assert.equal(
    (
      await route(a, "/api/cloud/offers/" + item.id, "PUT", {
        plan: changed,
        revision: 1,
      })
    ).item.revision,
    2,
  );
  await assert.rejects(
    () =>
      route(a, "/api/cloud/offers/" + item.id, "PUT", { plan, revision: 1 }),
    (e) => e.status === 409,
  );
  assert.equal(
    (await route(a, "/api/cloud/offers/" + item.id)).item.data.name,
    "私人修改",
  );
  await assert.rejects(
    () => route(a, "/api/admin/offer-rules"),
    (e) => e.status === 403,
  );
  const admin = { ...a, role: "admin" },
    ruleset = { ...structuredClone(RULESET), version: "test-reviewed-rules" };
  const checked = await route(admin, "/api/admin/offer-rules/check", "POST", {
    ruleset,
  });
  assert.equal(checked.checks.passed, true);
  await route(admin, "/api/admin/offer-rules", "POST", {
    ruleset,
    state: "draft",
    reason: "虚构测试",
  });
  assert.equal(
    (await route(null, "/api/public/offer-rules")).ruleset.version,
    RULESET.version,
  );
  await assert.rejects(
    () =>
      route(admin, "/api/admin/offer-rules", "POST", {
        ruleset,
        state: "published",
        revision: 0,
        reason: "虚构测试",
      }),
    (e) => e.status === 409,
  );
  await route(admin, "/api/admin/offer-rules", "POST", {
    ruleset,
    state: "published",
    revision: 1,
    reason: "虚构测试发布",
  });
  assert.equal(
    (await route(null, "/api/public/offer-rules")).ruleset.version,
    "test-reviewed-rules",
  );
  await assert.rejects(
    () =>
      route(admin, "/api/admin/offer-rules", "POST", {
        ruleset,
        state: "draft",
        revision: 2,
        reason: "虚构测试",
      }),
    (e) => e.status === 409,
  );
  assert.equal(
    (await route(a, "/api/cloud/offers/" + item.id)).item.snapshot.ruleset
      .version,
    RULESET.version,
  );
  const audit = await one(db, "SELECT COUNT(*) AS count FROM audit_events");
  assert.equal(+audit.count, 2);
  const fromOldDevice = await route(b, "/api/cloud/offers", "POST", { plan, requestId, ruleVersion: RULESET.version });
  assert.equal(fromOldDevice.item.snapshot.ruleset.version, RULESET.version);
  await assert.rejects(() => route(b, "/api/cloud/offers", "POST", { plan, requestId, ruleVersion: ruleset.version }), e => e.status === 409);
  await assert.rejects(() => route(b, "/api/cloud/offers", "POST", { plan, ruleVersion: "unknown-unpublished" }), e => e.status === 409);
  await route(a, "/api/cloud/offers/" + item.id + "?revision=2", "DELETE");
  assert.equal((await route(a, "/api/cloud/offers")).items.length, 0);
});
test("rules reject overlapping dates, unsafe sources and incomplete tax parameters; offers reject bad dates/currency", () => {
  const overlap = structuredClone(RULESET);
  overlap.rules.push(structuredClone(overlap.rules[0]));
  assert.throws(
    () => validateRuleSet(overlap),
    (e) => e.status === 409,
  );
  const fake = structuredClone(RULESET);
  fake.rules[0].source = "https://example.test";
  assert.throws(
    () => validateRuleSet(fake),
    (e) => e.status === 400,
  );
  const broken = structuredClone(RULESET);
  broken.rules[0].parameters.brackets = [];
  assert.throws(
    () => validateRuleSet(broken),
    (e) => e.status === 400,
  );
  const p = emptyOffer();
  p.start = "2026-02-30";
  assert.throws(
    () => validateOffer(p),
    (e) => e.status === 400,
  );
  p.start = "";
  p.currency = "HKD";
  assert.throws(
    () => validateOffer(p),
    (e) => e.status === 400,
  );
});
