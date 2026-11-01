import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../server/cloud/config.mjs";
import { generate } from "otplib";
import { createCloudApp } from "../server/cloud/app.mjs";
import { query, one } from "../server/cloud/database.mjs";
import {
  encryptSecret,
  decryptSecret,
  validateModelDestination,
  modelDispatcher,
  publicAddress,
} from "../server/cloud/security.mjs";
import { registerCloudAdapter } from "../server/cloud/models.mjs";
import { initialWorkspace, validWorkspace } from "../src/lib/workspace.js";
import { selectImport } from "../src/lib/cloudWorkspace.js";
import { getResumeDesign, releaseDesign } from "../src/lib/resumeDesign.js";
import { activeDocument, moveDocumentToTrash, restoreDocument } from '../src/lib/documents.js';
import { avatarFixture } from './fixtures/avatar.mjs';

test("account, workspace and administration enforce real session and ownership boundaries", async (t) => {
  const mailbox = new Map();
  const config = {
    memory: true,
    origin: "http://127.0.0.1:4174",
    authSecret: "integration-only-secret-with-at-least-32-random-characters",
    credentialKey: Buffer.alloc(32, 7).toString("base64"),
    adminEmail: "owner@example.test",
    allowedModelHosts: ["api.example.test"],
    modelDispatcher: async () => ({ close: async () => {} }),
    deliverOTP: async (value) => mailbox.set(value.email, value.otp),
  };
  const app = await createCloudApp(config);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const base = "http://127.0.0.1:" + app.server.address().port;
  function client() {
    const cookies = new Map();
    return {
      cookies,
      async request(path, method = "GET", body, extra = {}) {
        const response = await fetch(base + "/api/" + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Luli-Client": "workspace",
            Origin: config.origin,
            Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
            ...extra,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        for (const entry of response.headers.getSetCookie()) {
          const value = entry.split(";")[0],
            at = value.indexOf("=");
          cookies.set(value.slice(0, at), value.slice(at + 1));
        }
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        return { status: response.status, data, headers: response.headers };
      },
      async login(email, extra = {}) {
        let result = await this.request(
          "auth/email-otp/send-verification-otp",
          "POST",
          { email, type: "sign-in" },
        );
        assert.equal(result.status, 200, JSON.stringify(result.data));
        result = await this.request("auth/sign-in/email-otp", "POST", {
          email,
          otp: mailbox.get(email),
          ...extra,
        });
        assert.equal(result.status, 200, JSON.stringify(result.data));
        return (await this.request("cloud/me")).data.user;
      },
    };
  }
  const admin = client(),
    alice = client(),
    bob = client();
  let adminUser, aliceUser, bobUser, backupCodes, modelId;
  await t.test(
    "uninvited registration and foreign origins are rejected",
    async () => {
      assert.equal(
        (
          await alice.request("auth/email-otp/send-verification-otp", "POST", {
            email: "unknown@example.test",
            type: "sign-in",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await alice.request("auth/sign-up/email", "POST", {
            email: "evil@example.test",
            password: "something",
            role: "admin",
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await alice.request("cloud/workspace", "GET", undefined, {
            Origin: "https://untrusted.example",
          })
        ).status,
        403,
      );
      assert.equal((await alice.request("cloud/workspace")).status, 401);
    },
  );
  await t.test(
    "bootstrap admin must complete authenticator verification before management",
    async () => {
      adminUser = await admin.login(config.adminEmail);
      assert.equal(adminUser.role, "admin");
      let blocked = await admin.request("admin/users");
      assert.equal(blocked.status, 403);
      assert.equal(blocked.data.code, "STEP_UP_REQUIRED");
      const setup = await admin.request("admin/setup", "POST", {});
      assert.equal(setup.status, 200, JSON.stringify(setup.data));
      backupCodes = setup.data.backupCodes;
      const secret = new URL(setup.data.totpURI).searchParams.get("secret");
      const result = await admin.request("admin/verify", "POST", {
        code: await generate({ secret }),
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal((await admin.request("admin/users")).status, 200);
    },
  );
  await t.test(
    "invitation accepts normal users without trusting a requested role",
    async () => {
      for (const email of ["alice@example.test", "bob@example.test"])
        assert.equal(
          (
            await admin.request("admin/invitations", "POST", {
              email,
              reason: "虚构账号隔离验收",
            })
          ).status,
          200,
        );
      aliceUser = await alice.login("alice@example.test", { role: "admin" });
      bobUser = await bob.login("bob@example.test");
      assert.equal(aliceUser.role, "user");
      assert.equal((await alice.request("admin/users")).status, 403);
      assert.equal(
        (await alice.request("admin/setup", "POST", {})).status,
        403,
      );
    },
  );
  await t.test(
    "avatars persist across sessions, stay account-scoped and reject invalid uploads",
    async () => {
      const image = avatarFixture({ metadata: true }), clean = avatarFixture();
      assert.equal((await client().request("cloud/account/avatar", "PUT", { image })).status, 401);
      assert.equal((await alice.request("cloud/account/avatar", "PUT", { image }, { "X-Luli-Account": bobUser.id })).status, 409);
      assert.equal((await alice.request("cloud/account/avatar", "PUT", { image }, { Origin: "https://untrusted.example" })).status, 403);
      const saved = await alice.request("cloud/account/avatar", "PUT", { image, userId: bobUser.id });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      assert.equal(saved.data.avatar, clean);
      assert.equal((await alice.request("cloud/me")).data.user.avatar, clean);
      assert.equal((await bob.request("cloud/me")).data.user.avatar, null);
      const secondDevice = client();
      assert.equal((await secondDevice.login("alice@example.test")).avatar, clean);
      for (const invalid of ["https://example.test/avatar.png", "data:image/png;base64,AAAA"]) {
        assert.equal((await alice.request("cloud/account/avatar", "PUT", { image: invalid })).status, 400);
      }
      assert.equal((await alice.request("cloud/account/avatar", "PUT", { image: "A".repeat(250000) })).status, 413);
      assert.equal((await alice.request("auth/update-user", "POST", { image: "https://example.test/avatar.png" })).status, 404);
      assert.equal((await secondDevice.request("cloud/me")).data.user.avatar, clean);
      assert.equal((await alice.request("cloud/account/avatar", "PUT", { image: null })).data.avatar, null);
      assert.equal((await secondDevice.request("cloud/me")).data.user.avatar, null);
      await secondDevice.request("auth/sign-out", "POST", {});
    },
  );
  await t.test(
    "two accounts cannot read or overwrite each other and stale writes preserve both revisions",
    async () => {
      const a = (await alice.request("cloud/workspace")).data,
        b = (await bob.request("cloud/workspace")).data;
      assert.notEqual(a.state.activeId, b.state.activeId);
      a.state.documents[0].resume.summary = "Alice private resume";
      let saved = await alice.request("cloud/workspace", "PUT", {
        state: a.state,
        revision: a.revision,
        mutationId: "alice-1",
      });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.revision, 1);
      assert.equal(
        (
          await bob.request("cloud/workspace", "GET", undefined, {
            "X-Luli-Account": aliceUser.id,
          })
        ).status,
        409,
      );
      const bNow = (await bob.request("cloud/workspace")).data;
      assert.equal(bNow.state.documents[0].resume.summary, "");
      const stale = structuredClone(a.state);
      stale.documents[0].resume.summary = "other-device";
      const collision = await alice.request("cloud/workspace", "PUT", {
        state: stale,
        revision: 0,
        mutationId: "alice-stale",
      });
      assert.equal(collision.status, 409);
      assert.equal(
        collision.data.remote.state.documents[0].resume.summary,
        "Alice private resume",
      );
      assert.equal(
        (
          await alice.request("cloud/workspace", "PUT", {
            state: a.state,
            revision: 0,
            mutationId: "alice-1",
          })
        ).data.duplicate,
        true,
      );
      const resolved = await alice.request("cloud/workspace", "PUT", {
        state: stale,
        revision: 1,
        mutationId: "alice-resolved",
        resolve: true,
      });
      assert.equal(resolved.status, 200);
      const backups = await alice.request("cloud/backups");
      assert.equal(backups.data.items.length, 1);
      assert.equal(
        (await bob.request("cloud/backups/" + backups.data.items[0].id)).status,
        404,
      );
      const adminDetail = await admin.request("admin/users/" + aliceUser.id);
      assert.ok(!JSON.stringify(adminDetail.data).includes("private resume"));
    },
  );
  await t.test(
    "local migration is idempotent and does not replace existing material",
    async () => {
      const local = initialWorkspace();
      const payload = selectImport(local, {
        documents: local.documents.map((d) => d.id),
        projects: local.library.map((p) => p.id),
        profile: true,
      });
      const original = JSON.stringify(payload);
      const before = (await alice.request("cloud/workspace")).data;
      const first = await alice.request("cloud/import", "POST", {
        state: payload,
        revision: before.revision,
      });
      assert.equal(first.status, 200, JSON.stringify(first.data));
      assert.equal(first.data.state.documents.length, 2);
      assert.equal(
        first.data.state.documents[0].resume.summary,
        "other-device",
      );
      assert.ok(validWorkspace(first.data.state));
      const again = await alice.request("cloud/import", "POST", {
        state: payload,
        revision: before.revision,
      });
      assert.equal(again.status, 200);
      assert.equal(again.data.duplicate, true);
      assert.equal(again.data.state.documents.length, 2);
      assert.equal(JSON.stringify(payload), original);
    },
  );
  await t.test(
    "partial imports accept materials without a resume and preserve a JD-only draft",
    async () => {
      let before = (await bob.request("cloud/workspace")).data;
      before.state.documents[0].job.text = "Existing private job requirement";
      before.state.profile.name = "Existing name";
      assert.equal(
        (
          await bob.request("cloud/workspace", "PUT", {
            state: before.state,
            revision: before.revision,
            mutationId: "bob-job-only",
          })
        ).status,
        200,
      );
      const local = initialWorkspace();
      local.profile.name = "Imported name";
      local.profile.contact = "Fictional contact";
      const payload = selectImport(local, {
        documents: [],
        projects: [local.library[0].id],
        profile: true,
      });
      before = (await bob.request("cloud/workspace")).data;
      const result = await bob.request("cloud/import", "POST", {
        state: payload,
        revision: before.revision,
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal(result.data.state.documents.length, 1);
      assert.equal(
        result.data.state.documents[0].job.text,
        "Existing private job requirement",
      );
      assert.equal(result.data.state.profile.name, "Existing name");
      assert.equal(result.data.state.profile.contact, "Fictional contact");
      assert.equal(result.data.state.library.length, 1);
      assert.equal(
        (
          await bob.request("cloud/import", "POST", {
            state: payload,
            revision: before.revision,
          })
        ).data.duplicate,
        true,
      );
      const profileOnly = selectImport(local, {
        documents: [],
        projects: [],
        profile: true,
      });
      assert.equal(
        (
          await bob.request("cloud/import", "POST", {
            state: profileOnly,
            revision: result.data.revision,
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    "first resume import replaces only the pristine cloud placeholder and deduplicates equivalent JSON",
    async () => {
      const before = (await admin.request("cloud/workspace")).data,
        local = initialWorkspace();
      const payload = selectImport(local, {
        documents: [local.documents[0].id],
        projects: [],
        profile: false,
      });
      const first = await admin.request("cloud/import", "POST", {
        state: payload,
        revision: before.revision,
      });
      assert.equal(first.status, 200, JSON.stringify(first.data));
      assert.equal(first.data.state.documents.length, 1);
      assert.equal(
        first.data.state.documents[0].title,
        local.documents[0].title,
      );
      const reordered = Object.fromEntries(Object.entries(payload).reverse());
      const duplicate = await admin.request("cloud/import", "POST", {
        state: reordered,
        revision: before.revision,
      });
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.data.duplicate, true);
      assert.equal(duplicate.data.state.documents.length, 1);
    },
  );
  await t.test(
    "model keys are encrypted, destination rules apply, metadata logs never contain private text",
    async () => {
      const rejected = await alice.request("cloud/connections", "POST", {
        name: "local",
        model: "test",
        baseUrl: "http://127.0.0.1:1234/v1",
        apiKey: "secret",
      });
      assert.equal(rejected.status, 400);
      const saved = await alice.request("cloud/connections", "POST", {
        name: "My model",
        model: "fixture",
        baseUrl: "https://api.example.test/v1",
        apiKey: "integration-api-key",
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      assert.ok(!JSON.stringify(saved.data).includes("integration-api-key"));
      const id = saved.data.id;
      modelId = id;
      const stored = await one(
        app.db,
        "SELECT secret FROM model_connections WHERE owner_id=$1 AND id=$2",
        [aliceUser.id, id],
      );
      assert.notEqual(stored.secret, "integration-api-key");
      assert.equal(
        decryptSecret(
          stored.secret,
          config.credentialKey,
          aliceUser.id + ":" + id,
        ),
        "integration-api-key",
      );
      assert.throws(() =>
        decryptSecret(
          stored.secret,
          config.credentialKey,
          bobUser.id + ":" + id,
        ),
      );
      assert.equal(
        (
          await bob.request("cloud/chat", "POST", {
            connectionId: id,
            prompt: "test",
          })
        ).status,
        404,
      );
      await query(
        app.db,
        "UPDATE account_access SET monthly_limit=0 WHERE user_id=$1",
        [aliceUser.id],
      );
      assert.equal(
        (
          await alice.request("cloud/chat", "POST", {
            connectionId: id,
            prompt: "private prompt",
            context: {},
          })
        ).data.code,
        "QUOTA_EXCEEDED",
      );
      await query(
        app.db,
        "UPDATE account_access SET monthly_limit=100 WHERE user_id=$1",
        [aliceUser.id],
      );
      const malicious = await alice.request("cloud/chat", "POST", {
        connectionId: id,
        prompt: "test",
        context: {
          sources: [{ id: "source", details: { actions: "private material" } }],
        },
      });
      assert.equal(malicious.status, 400);
      assert.equal(
        (
          await one(
            app.db,
            "SELECT COUNT(*)::int AS count FROM model_usage WHERE user_id=$1",
            [aliceUser.id],
          )
        ).count,
        0,
      );
      const listed = await alice.request("cloud/connections");
      assert.equal(listed.data.connections[0].keyMask, "••••••••");
      assert.equal((await admin.request("admin/models")).data.items.length, 0);
    },
  );
  await t.test(
    "admin recovery is single use and an existing authenticator cannot be replaced through setup",
    async () => {
      assert.equal(
        (await admin.request("admin/setup", "POST", {})).status,
        409,
      );
      await query(app.db, "DELETE FROM admin_grants");
      assert.equal(
        (await admin.request("admin/overview")).data.code,
        "STEP_UP_REQUIRED",
      );
      assert.equal(
        (
          await admin.request("admin/verify", "POST", {
            backupCode: backupCodes[0],
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await admin.request("admin/verify", "POST", {
            backupCode: backupCodes[0],
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "concurrent model requests reserve quota atomically and stream errors are recorded without content",
    async () => {
      registerCloudAdapter("compatible", async ({ messages }) => {
        const content = messages.at(-1).content;
        const event =
          content === "emit-error"
            ? { error: { message: "fixture provider error" } }
            : { choices: [{ delta: { content: "fictional response" } }] };
        return new Response(
          "data: " +
            JSON.stringify(event) +
            "\n\ndata: " +
            JSON.stringify({
              usage: { prompt_tokens: 12, completion_tokens: 9 },
            }) +
            "\n\ndata: [DONE]\n\n",
          { headers: { "Content-Type": "text/event-stream" } },
        );
      });
      await query(
        app.db,
        "UPDATE account_access SET monthly_limit=1 WHERE user_id=$1",
        [aliceUser.id],
      );
      const results = await Promise.all(
        [1, 2].map(() =>
          alice.request("cloud/chat", "POST", {
            connectionId: modelId,
            prompt: "private fixture prompt",
            context: {},
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 429]);
      let rows = await query(
        app.db,
        "SELECT * FROM model_usage WHERE user_id=$1",
        [aliceUser.id],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, "succeeded");
      assert.equal(rows[0].input_tokens, 12);
      assert.equal(rows[0].output_tokens, 9);
      assert.ok(!JSON.stringify(rows).includes("private fixture prompt"));
      await query(
        app.db,
        "UPDATE account_access SET monthly_limit=100 WHERE user_id=$1",
        [aliceUser.id],
      );
      const failed = await alice.request("cloud/chat", "POST", {
        connectionId: modelId,
        prompt: "emit-error",
        context: {},
      });
      assert.equal(failed.status, 200);
      rows = await query(
        app.db,
        "SELECT * FROM model_usage WHERE user_id=$1 AND status='failed'",
        [aliceUser.id],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].error_type, "PROVIDER_STREAM_ERROR");
      const usage = (await admin.request("admin/usage")).data.items;
      assert.equal(usage.length, 2);
      assert.ok(!JSON.stringify(usage).includes("fixture provider error"));
    },
  );
  await t.test(
    "platform connections keep credentials private and enforce a shared quota across users",
    async () => {
      const created = await admin.request("admin/models", "POST", {
        name: "Fixture platform",
        model: "fixture-platform",
        baseUrl: "https://api.example.test/v1",
        apiKey: "platform-fixture-key",
        monthlyLimit: 1,
        reason: "平台模型隔离与总额度验收",
      });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      const connection = created.data;
      const requests = await Promise.all(
        [alice, bob].map((user) =>
          user.request("cloud/chat", "POST", {
            connectionId: connection.id,
            prompt: "fixture",
            context: {},
          }),
        ),
      );
      assert.deepEqual(requests.map((r) => r.status).sort(), [200, 429]);
      assert.ok(
        (await alice.request("cloud/connections")).data.connections.some(
          (c) => c.id === connection.id && c.source === "platform",
        ),
      );
      assert.ok(
        !JSON.stringify((await admin.request("admin/models")).data).includes(
          "platform-fixture-key",
        ),
      );
      assert.equal(
        (
          await admin.request("admin/models", "POST", {
            ...connection,
            enabled: false,
            reason: "验证停用平台模型",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await bob.request("cloud/chat", "POST", {
            connectionId: connection.id,
            prompt: "fixture",
            context: {},
          })
        ).status,
        404,
      );
      assert.ok(
        !(await bob.request("cloud/connections")).data.connections.some(
          (c) => c.id === connection.id,
        ),
      );
      assert.ok(
        !JSON.stringify((await admin.request("admin/audit")).data).includes(
          "platform-fixture-key",
        ),
      );
    },
  );
  await t.test(
    "published template versions stay pinned until an explicit update and can roll back",
    async () => {
      const catalog = (await alice.request("cloud/templates")).data.items;
      const first = catalog.find((t) => t.id === "builtin-modern");
      const pinned = releaseDesign(first);
      const draft = await admin.request("admin/templates", "POST", {
        id: first.id,
        name: "现代简约改版",
        description: "虚构发布验收",
        design: { ...first.design, lineHeight: 2 },
        reason: "检查固定版本",
      });
      assert.equal(draft.status, 200);
      assert.equal(
        (
          await admin.request("admin/templates", "POST", {
            id: first.id,
            version: draft.data.version,
            action: "publish",
            reason: "发布验收版本",
          })
        ).status,
        200,
      );
      assert.equal(
        getResumeDesign({ design: pinned }).lineHeight,
        first.design.lineHeight,
      );
      const next = (await alice.request("cloud/templates")).data.items.find(
        (t) => t.id === first.id,
      );
      assert.equal(next.version, 2);
      assert.equal(releaseDesign(next).lineHeight, 2);
      assert.equal(
        (
          await admin.request("admin/templates", "POST", {
            id: first.id,
            version: 1,
            action: "publish",
            reason: "回滚验收版本",
          })
        ).status,
        200,
      );
      assert.equal(
        (await alice.request("cloud/templates")).data.items.find(
          (t) => t.id === first.id,
        ).version,
        1,
      );
      assert.ok(
        !(await admin.request("admin/audit")).data.items.some((item) =>
          JSON.stringify(item).includes("integration-api-key"),
        ),
      );
    },
  );
  await t.test('deleted resumes survive cloud round trips and restore with drafts and history intact', async () => {
    const before = (await bob.request('cloud/workspace')).data;
    const id = before.state.activeId;
    before.state.documents.find(doc => doc.id === id).composer = '未发送的虚构草稿';
    const deleted = before.state.documents.reduce((state, doc) => moveDocumentToTrash(state, doc.id, 1700000000000), before.state);
    const saved = await bob.request('cloud/workspace', 'PUT', {state: deleted, revision: before.revision, mutationId: 'trash-roundtrip'});
    assert.equal(saved.status, 200);
    const remote = (await bob.request('cloud/workspace')).data;
    assert(validWorkspace(remote.state));
    assert.equal(activeDocument(remote.state), null);
    assert(remote.state.documents.every(doc => doc.archived));
    const restored = restoreDocument(remote.state, id);
    assert.equal((await bob.request('cloud/workspace', 'PUT', {state: restored, revision: remote.revision, mutationId: 'restore-roundtrip'})).status, 200);
    const after = (await bob.request('cloud/workspace')).data;
    const document = activeDocument(after.state), original = before.state.documents.find(doc => doc.id === id);
    assert.equal(document.id, id);
    assert.equal(document.composer, original.composer);
    assert.deepEqual(document.resume, original.resume);
    assert.deepEqual(document.messages, original.messages);
    assert.deepEqual(document.versions, original.versions);
    assert.deepEqual(after.state.library, before.state.library);
  });
  await t.test(
    "revocation and disabled accounts take effect on the next request",
    async () => {
      const secondDevice = client();
      await secondDevice.login("bob@example.test");
      assert.equal((await bob.request("cloud/sessions")).data.items.length, 2);
      assert.equal(
        (await bob.request("cloud/sessions/revoke", "POST", { others: true }))
          .status,
        200,
      );
      assert.equal((await secondDevice.request("cloud/workspace")).status, 401);
      assert.equal(
        (
          await admin.request("admin/users/" + aliceUser.id, "POST", {
            status: "disabled",
            monthlyLimit: 100,
            reason: "验证停用立即生效",
          })
        ).status,
        200,
      );
      assert.equal((await alice.request("cloud/workspace")).status, 401);
      assert.equal(
        (
          await alice.request("auth/email-otp/send-verification-otp", "POST", {
            email: "alice@example.test",
            type: "sign-in",
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    "account deletion requires a separate email code and erases private rows and sessions",
    async () => {
      assert.equal(
        (
          await bob.request("cloud/account/delete", "POST", {
            email: bobUser.email,
            otp: "000000",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await bob.request("auth/email-otp/send-verification-otp", "POST", {
            email: bobUser.email,
            type: "email-verification",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await bob.request("cloud/account/delete", "POST", {
            email: bobUser.email,
            otp: mailbox.get(bobUser.email),
          })
        ).status,
        200,
      );
      assert.equal(
        await one(app.db, 'SELECT id FROM "user" WHERE id=$1', [bobUser.id]),
        null,
      );
      assert.equal((await bob.request("cloud/workspace")).status, 401);
      for (const table of ["workspaces", "projects", "resumes", "sync_backups"])
        assert.equal(
          (
            await one(
              app.db,
              "SELECT COUNT(*)::int AS count FROM " +
                table +
                " WHERE owner_id=$1",
              [bobUser.id],
            )
          ).count,
          0,
        );
    },
  );
});

test("encrypted credentials bind to their owner and public model destinations pin DNS results", async () => {
  const key = Buffer.alloc(32, 2).toString("base64");
  const cipher = encryptSecret("key-value", key, "owner:connection");
  assert.equal(decryptSecret(cipher, key, "owner:connection"), "key-value");
  assert.throws(() => decryptSecret(cipher, key, "other:connection"));
  for (const host of [
    "http://api.example.test",
    "https://localhost/v1",
    "https://api.example.test:8080/v1",
    "https://name:pass@api.example.test/v1",
    "https://api.example.test/v1?key=secret",
  ])
    assert.throws(() => validateModelDestination(host, ["api.example.test"]));
  await assert.rejects(
    modelDispatcher(
      "https://api.example.test/v1",
      ["api.example.test"],
      async () => [{ address: "127.0.0.1", family: 4 }],
    ),
    /禁止/,
  );
  assert.equal(publicAddress("10.0.0.1"), false);
  assert.equal(publicAddress("::ffff:127.0.0.1"), false);
});

test("production refuses missing deployment dependencies and short authentication secrets", async () => {
  await assert.rejects(loadConfig({ NODE_ENV: "production" }), /正式环境/);
  await assert.rejects(loadConfig({ BETTER_AUTH_SECRET: "short" }), /32/);
});
