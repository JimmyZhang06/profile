import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { aiMiddleware } from "../server/ai.mjs";
import { mergeImportedWorkspace } from "../src/lib/cloudWorkspace.js";
import { initialWorkspace } from "../src/lib/workspace.js";
import { query, one } from "../server/cloud/database.mjs";
import { avatarFixture } from "./fixtures/avatar.mjs";
import { opportunityData } from "../server/cloud/opportunities.mjs";
import { normalizeEvidence } from "../server/cloud/opportunityImage.mjs";
import {
  jobForOpportunity,
  snapshotOpportunity,
  resumesForOpportunity,
  opportunityResumeRef,
} from "../src/lib/opportunityResume.js";

import {
  fictionalOpportunity,
  opportunityFixture,
} from "./fixtures/opportunities.mjs";

test("development proxy leaves anonymous public recruitment GETs with the cloud API", async () => {
  let forwarded = false;
  await aiMiddleware()(
    { url: "/api/public/opportunities?city=香港", method: "GET", headers: {} },
    {},
    () => {
      forwarded = true;
    },
  );
  assert.equal(forwarded, true);
});

test("importing a workspace remaps private document IDs and preserves the external opportunity reference", () => {
  const incoming = initialWorkspace(),
    current = initialWorkspace();
  incoming.documents[0].opportunitySource = snapshotOpportunity(
    {
      ...fictionalOpportunity,
      id: "published-posting-id",
      version: 1,
      status: "open",
    },
    123,
  );
  const result = mergeImportedWorkspace(current, incoming, () => randomUUID());
  const imported = result.documents.find((d) => d.opportunitySource);
  assert.notEqual(imported.id, incoming.documents[0].id);
  assert.deepEqual(
    imported.opportunitySource,
    incoming.documents[0].opportunitySource,
  );
});

test("reviewed opportunities remain private until release and preserve pinned revisions through the full lifecycle", async (t) => {
  const { app, admin, alice, bob, anonymous, aliceUser } =
    await opportunityFixture(t);
  const source = {
    description: "虚构群内招聘信息，仅用于本机测试",
    permission: "虚构招聘人明确允许公开测试邮箱",
    date: "2026-11-12",
  };
  let s = (
    await alice.ok("cloud/opportunity-submissions", "POST", {
      requestId: randomUUID(),
      data: fictionalOpportunity,
      source,
      originalText: "PRIVATE-ORIGINAL-13600000000",
    })
  ).item;
  const id = s.opportunity_id,
    url = "public/opportunities/" + id,
    path = "cloud/opportunity-submissions/" + s.id;
  assert.equal((await anonymous.call(url)).status, 404);
  assert.equal((await bob.call(path)).status, 404);
  assert.equal((await anonymous.call(path)).status, 401);
  const image = avatarFixture();
  const upload = await alice.ok(path + "/evidence", "POST", { image });
  s = upload.item;
  const evidence = upload.evidence[0];
  assert.equal(
    (await alice.call(path + "/evidence/" + evidence.id)).status,
    200,
  );
  assert.equal((await bob.call(path + "/evidence/" + evidence.id)).status, 404);
  assert.equal(
    (await anonymous.call(path + "/evidence/" + evidence.id)).status,
    401,
  );
  const submit = { revision: s.revision, requestId: randomUUID() };
  s = (await alice.ok(path + "/submit", "POST", submit)).item;
  assert.equal(
    (await alice.ok(path + "/submit", "POST", submit)).item.revision,
    s.revision,
  );
  assert.equal(
    (
      await alice.call(path, "PUT", {
        revision: s.revision,
        data: fictionalOpportunity,
        source,
      })
    ).status,
    409,
  );
  assert.equal(
    (await alice.call(path + "/evidence", "POST", { image })).status,
    409,
  );
  assert.equal((await anonymous.ok("public/opportunities")).items.length, 0);
  const reviewPath = "admin/opportunity-submissions/" + s.id + "/review";
  const review = {
    revision: s.revision,
    opportunityRevision: s.opportunity_revision,
    requestId: randomUUID(),
    decision: "return",
    feedback: { permission: "补充获准公开邮箱的说明" },
    reason: "凭证需要补充",
    internalNote: "PRIVATE-ADMIN-NOTE",
  };
  s = (await admin.ok(reviewPath, "POST", review)).item;
  assert(
    !JSON.stringify((await alice.ok(path)).item).includes("PRIVATE-ADMIN-NOTE"),
  );
  assert.equal((await alice.call(reviewPath, "POST", review)).status, 403);
  s = (
    await alice.ok(path + "/revise", "POST", {
      revision: s.revision,
      requestId: randomUUID(),
    })
  ).item;
  let nextPath = "cloud/opportunity-submissions/" + s.id;
  assert.equal((await alice.ok(nextPath)).evidence.length, 1);
  s = (
    await alice.ok(nextPath + "/submit", "POST", {
      revision: s.revision,
      requestId: randomUUID(),
    })
  ).item;
  const publish = {
    revision: s.revision,
    opportunityRevision: s.opportunity_revision,
    requestId: randomUUID(),
    decision: "publish",
    sourceVerified: true,
    channelApproved: true,
    reason: "核对来源和公开渠道",
  };
  s = (
    await admin.ok(
      "admin/opportunity-submissions/" + s.id + "/review",
      "POST",
      publish,
    )
  ).item;
  await admin.ok(
    "admin/opportunity-submissions/" + s.id + "/review",
    "POST",
    Object.fromEntries(Object.entries(publish).reverse()),
  );
  assert.equal(
    (
      await one(
        app.db,
        "SELECT COUNT(*)::int AS count FROM opportunity_releases",
      )
    ).count,
    1,
  );
  assert.equal(
    (
      await one(
        app.db,
        "SELECT COUNT(*)::int AS count FROM audit_events WHERE action='opportunity.publish'",
      )
    ).count,
    1,
  );
  assert.equal(
    (
      await admin.call(
        "admin/opportunity-submissions/" + s.id + "/review",
        "POST",
        { ...publish, decision: "reject" },
      )
    ).status,
    409,
  );
  const visible = (await anonymous.ok(url)).item;
  assert.equal(visible.version, 1);
  assert.equal(visible.status, "open");
  assert.deepEqual(visible.compensation, fictionalOpportunity.compensation);
  assert(!JSON.stringify(visible).includes("PRIVATE"));
  assert(!("source" in visible));
  assert(!("author_id" in visible));
  const workspace=await alice.ok('cloud/workspace');
  const selected=workspace.state.documents.find(d=>d.id===workspace.state.activeId);
  selected.job=jobForOpportunity(visible);selected.opportunitySource=snapshotOpportunity(visible,123);
  await alice.ok('cloud/workspace','PUT',{state:workspace.state,revision:workspace.revision,mutationId:randomUUID()});
  const savedWorkspace=await alice.ok('cloud/workspace');
  assert.deepEqual(savedWorkspace.state.documents.find(d=>d.id===selected.id).opportunitySource,selected.opportunitySource);
  assert.deepEqual(savedWorkspace.state.library,workspace.state.library);
  assert.equal(
    (await anonymous.ok("public/opportunities?city=香港&direction=产品&q=研究"))
      .items.length,
    1,
  );
  assert.equal(
    (await anonymous.ok("public/opportunities?city=上海")).items.length,
    0,
  );
  assert.equal(
    (await anonymous.ok(url + "/apply?version=1")).application.value,
    "careers@example.test",
  );
  s = (
    await alice.ok(nextPath + "/revise", "POST", {
      revision: s.revision,
      requestId: randomUUID(),
    })
  ).item;
  nextPath = "cloud/opportunity-submissions/" + s.id;
  const v2 = {
    ...s.data,
    application: { type: "email", value: "new-careers@example.test" },
  };
  s = (
    await alice.ok(nextPath, "PUT", {
      revision: s.revision,
      data: v2,
      source,
      originalText: "PRIVATE-NEW",
    })
  ).item;
  s = (
    await alice.ok(nextPath + "/submit", "POST", {
      revision: s.revision,
      requestId: randomUUID(),
    })
  ).item;
  assert.equal(
    (await anonymous.ok(url)).item.application.value,
    "careers@example.test",
  );
  let o = await one(app.db, "SELECT * FROM opportunities WHERE id=$1", [id]);
  await admin.ok("admin/opportunities/" + id, "POST", {
    revision: o.revision,
    status: "paused",
    reason: "核对变更中的渠道",
    requestId: randomUUID(),
  });
  assert.equal((await anonymous.call(url + "/apply?version=1")).status, 410);
  const paused = (await anonymous.ok(url)).item;
  assert.equal(paused.compensation, null);
  assert(!paused.jd);
  assert(!paused.application);
  assert.equal((await anonymous.ok("public/opportunities")).items.length, 0);
  const detail = (await admin.ok("admin/opportunity-submissions/" + s.id)).item;
  await admin.ok("admin/opportunity-submissions/" + s.id + "/review", "POST", {
    ...publish,
    requestId: randomUUID(),
    revision: detail.revision,
    opportunityRevision: detail.opportunity_revision,
  });
  assert.equal((await anonymous.ok(url)).item.status, "paused");
  o = await one(app.db, "SELECT * FROM opportunities WHERE id=$1", [id]);
  await admin.ok("admin/opportunities/" + id, "POST", {
    revision: o.revision,
    status: "open",
    reason: "新渠道已核对并恢复",
    requestId: randomUUID(),
  });
  assert.equal((await anonymous.call(url + "/apply?version=1")).status, 409);
  assert.equal(
    (await anonymous.ok(url + "/apply?version=2")).application.value,
    "new-careers@example.test",
  );
  const historical = (await anonymous.ok(url + "?version=1")).item;
  assert.equal(historical.version, 1);
  assert.equal(historical.currentVersion, 2);
  assert(!historical.application);
  for (const version of [1, 2]) {
    o = await one(app.db, "SELECT * FROM opportunities WHERE id=$1", [id]);
    await admin.ok("admin/opportunities/" + id, "POST", {
      revision: o.revision,
      status: "open",
      version,
      reason: "复查并切换已审核版本",
      requestId: randomUUID(),
    });
    assert.equal((await anonymous.ok(url)).item.version, version);
  }
  assert.deepEqual(
    (await admin.ok("admin/opportunities")).items[0].versions.map(
      (v) => v.version,
    ),
    [2, 1],
  );
  await bob.ok("cloud/opportunities/" + id + "/reports", "POST", {
    version: 1,
    category: "channel",
    description: "旧版本邮箱已变更，请复核该公开版本",
  });
  assert.equal(
    (await admin.ok("admin/opportunity-reports")).items[0].version,
    1,
  );
  await query(
    app.db,
    "UPDATE opportunities SET review_due_at=NOW()-INTERVAL '1 day' WHERE id=$1",
    [id],
  );
  assert.equal(
    (await admin.ok("admin/opportunities?due=true")).items.length,
    1,
  );
  await query(
    app.db,
    "UPDATE opportunity_releases SET data=jsonb_set(data,'{deadlineAt}',to_jsonb((NOW()-INTERVAL '1 day')::text)) WHERE opportunity_id=$1 AND version=2",
    [id],
  );
  assert.equal((await anonymous.ok(url)).item.status, "closed");
  assert.equal((await anonymous.call(url + "/apply?version=2")).status, 410);
  assert.equal((await anonymous.ok("public/opportunities")).items.length, 0);
  let race = (
    await alice.ok("cloud/opportunity-submissions", "POST", {
      requestId: randomUUID(),
      data: fictionalOpportunity,
      source,
    })
  ).item;
  race = (
    await alice.ok(
      "cloud/opportunity-submissions/" + race.id + "/submit",
      "POST",
      { revision: race.revision, requestId: randomUUID() },
    )
  ).item;
  const decision = {
    ...publish,
    requestId: randomUUID(),
    revision: race.revision,
    opportunityRevision: race.opportunity_revision,
  };
  assert.equal(
    (
      await admin.call(
        "admin/opportunity-submissions/" + race.id + "/review",
        "POST",
        { ...decision, reason: "" },
      )
    ).status,
    400,
  );
  assert.equal(
    (await anonymous.call("public/opportunities/" + race.opportunity_id))
      .status,
    404,
  );
  assert.equal(
    (await alice.ok("cloud/opportunity-submissions/" + race.id)).item.status,
    "pending",
  );
  const competing = await Promise.all([
    admin.call(
      "admin/opportunity-submissions/" + race.id + "/review",
      "POST",
      decision,
    ),
    alice.call(
      "cloud/opportunity-submissions/" + race.id + "/withdraw",
      "POST",
      { revision: race.revision, requestId: randomUUID() },
    ),
  ]);
  assert.deepEqual(competing.map((v) => v.status).sort(), [200, 409]);
  assert(
    (
      await one(
        app.db,
        "SELECT COUNT(*)::int AS count FROM opportunity_releases WHERE opportunity_id=$1",
        [race.opportunity_id],
      )
    ).count <= 1,
  );
  await query(app.db, "DELETE FROM admin_grants");
  assert.equal((await admin.call("admin/opportunity-submissions")).status, 403);
  assert.equal(
    (
      await admin.call(
        "admin/opportunity-submissions/" + s.id + "/evidence/" + evidence.id,
      )
    ).status,
    403,
  );
  await query(
    app.db,
    "UPDATE account_access SET status='disabled' WHERE user_id=$1",
    [aliceUser.id],
  );
  assert.equal((await alice.call("cloud/opportunity-submissions")).status, 403);
});

test("evidence verifies actual decoded scanlines and removes metadata", () => {
  const bytes = Buffer.from(
    avatarFixture({ width: 400, height: 600, metadata: true }).slice(22),
    "base64",
  );
  const clean = normalizeEvidence(bytes);
  assert(!clean.includes(Buffer.from("Test metadata")));
  assert.deepEqual(normalizeEvidence(clean), clean);
  assert.throws(() => normalizeEvidence(Buffer.from("not a PNG")));
  assert.throws(() =>
    normalizeEvidence(
      Buffer.from(
        avatarFixture({ width: 2001, height: 2 }).slice(22),
        "base64",
      ),
    ),
  );
  assert.throws(() =>
    normalizeEvidence(
      Buffer.from(avatarFixture({ inflatedSize: 25 }).slice(22), "base64"),
    ),
  );
});

test("deadline boundaries, source snapshots and resume recovery retain public facts without URL text", () => {
  const data = opportunityData({
    ...fictionalOpportunity,
    deadlineDate: "2027-02-01",
  });
  assert.equal(data.deadlineAt, "2027-02-01T16:00:00.000Z");
  assert.deepEqual(opportunityData(data), data);
  assert.throws(() =>
    opportunityData({ ...fictionalOpportunity, privatePhone: "13600000000" }),
  );
  assert.throws(() =>
    opportunityData({ ...fictionalOpportunity, deadlineDate: "2027-99-99" }),
  );
  const item = { ...data, id: "fictional-1", version: 2, status: "open" };
  const snapshot = snapshotOpportunity(item, 123);
  item.jd = "changed";
  assert.equal(snapshot.jd, data.jd);
  assert.equal(snapshot.takenAt, 123);
  assert(jobForOpportunity(item).text.includes("投递须知"));
  assert.throws(() => snapshotOpportunity({ ...item, status: "paused" }));
  assert.deepEqual(opportunityResumeRef("?opportunity=fictional-1&version=2"), {
    id: "fictional-1",
    version: 2,
  });
  assert.equal(
    resumesForOpportunity(
      [
        { id: "a", opportunitySource: snapshot, archived: true },
        { id: "b", opportunitySource: snapshot },
      ],
      item.id,
    )[0].id,
    "b",
  );
});
