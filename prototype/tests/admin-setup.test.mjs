import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "otplib";
import { createCloudApp } from "../server/cloud/app.mjs";
import { issueBootstrap } from "../server/cloud/bootstrap.mjs";
import { one, query } from "../server/cloud/database.mjs";
import { smtpTarget } from "../server/cloud/mail.mjs";

test("administrator bootstrap, password MFA and encrypted SMTP administration", async (t) => {
  const messages = [],
    transports = [];
  const config = {
    memory: true,
    production: true,
    origin: "https://workspace.example.test",
    adminEmail: "owner@example.test",
    authSecret:
      "isolated-fixture-auth-secret-longer-than-thirty-two-characters",
    credentialKey: Buffer.alloc(32, 9).toString("base64"),
    allowedModelHosts: [],
    smtpLookup: async (host) => [
      {
        address: host === "internal.example.test" ? "127.0.0.1" : "8.8.8.8",
        family: 4,
      },
    ],
    mailTransport: (options) => {
      transports.push(options);
      return {
        verify: async () => true,
        sendMail: async (message) => {
          messages.push(message);
          return {};
        },
        close() {},
      };
    },
  };
  if (process.env.LULI_TEST_DATABASE_URL) {
    assert.match(
      new URL(process.env.LULI_TEST_DATABASE_URL).pathname,
      /^\/luli_test_[a-z0-9_]+$/,
    );
    config.databaseUrl = process.env.LULI_TEST_DATABASE_URL;
  }
  const app = await createCloudApp(config);
  await new Promise((done) => app.server.listen(0, "127.0.0.1", done));
  t.after(() => app.close());
  const base = "http://127.0.0.1:" + app.server.address().port;
  function client() {
    const cookies = new Map();
    return {
      async request(path, method = "GET", body, headers = {}) {
        const r = await fetch(base + "/api/" + path, {
          method,
          headers: {
            Origin: config.origin,
            "X-Luli-Client": "workspace",
            "Content-Type": "application/json",
            Cookie: [...cookies]
              .map(([key, value]) => key + "=" + value)
              .join("; "),
            ...headers,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        for (const entry of r.headers.getSetCookie()) {
          const part = entry.split(";")[0],
            at = part.indexOf("=");
          cookies.set(part.slice(0, at), part.slice(at + 1));
        }
        return { status: r.status, data: await r.json(), headers: r.headers };
      },
    };
  }
  const anonymous = client();
  let admin, backupCodes, adminId, settings;
  const password = "fixture-admin-password-12-plus";
  const smtpPassword = "fixture-smtp-secret-never-returned";
  await t.test(
    "production without SMTP has no public mailbox or password signup",
    async () => {
      assert.equal(
        (await anonymous.request("cloud/health")).data.mailReady,
        false,
      );
      assert.equal(
        (
          await anonymous.request(
            "auth/email-otp/send-verification-otp",
            "POST",
            { email: config.adminEmail, type: "sign-in" },
          )
        ).data.code,
        "MAIL_NOT_CONFIGURED",
      );
      assert.equal(
        (
          await anonymous.request("auth/sign-up/email", "POST", {
            email: config.adminEmail,
            password,
            name: "Owner",
          })
        ).status,
        404,
      );
      assert.equal((await anonymous.request("admin/mail")).status, 401);
    },
  );
  await t.test(
    "setup codes are hashed, expire, and can only create the deployment administrator once",
    async () => {
      const first = await issueBootstrap(app.db);
      const initial = await anonymous.request("setup/status");
      assert.deepEqual(initial.data, { required: true, available: true });
      assert.ok(!JSON.stringify(initial.data).includes(config.adminEmail));
      const record = await one(app.db, "SELECT * FROM admin_bootstrap");
      assert.notEqual(record.token_hash, first.token);
      await query(
        app.db,
        "UPDATE admin_bootstrap SET expires_at=NOW()-INTERVAL '1 minute'",
      );
      assert.equal(
        (
          await anonymous.request("setup/complete", "POST", {
            email: config.adminEmail,
            password,
            token: first.token,
          })
        ).status,
        400,
      );
      const setup = await issueBootstrap(app.db);
      assert.equal(
        (
          await anonymous.request("setup/complete", "POST", {
            email: "other@example.test",
            password,
            token: setup.token,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await anonymous.request("setup/complete", "POST", {
            email: config.adminEmail,
            password: "short",
            token: setup.token,
          })
        ).status,
        400,
      );
      const contenders = [client(), client()];
      const results = await Promise.all(
        contenders.map((c) =>
          c.request("setup/complete", "POST", {
            email: config.adminEmail,
            password,
            token: setup.token,
          }),
        ),
      );
      assert.equal(
        results.filter((r) => r.status === 200).length,
        1,
        JSON.stringify(results.map((r) => r.data)),
      );
      admin = contenders[results.findIndex((r) => r.status === 200)];
      const me = await admin.request("cloud/me");
      assert.equal(me.data.user.role, "admin");
      adminId = me.data.user.id;
      assert.match(
        results
          .find((r) => r.status === 200)
          .headers.getSetCookie()
          .join(";"),
        /Secure/,
      );
      assert.deepEqual((await anonymous.request("setup/status")).data, {
        required: false,
        available: false,
      });
      await assert.rejects(issueBootstrap(app.db), /已初始化/);
      assert.notEqual(
        (
          await anonymous.request("setup/complete", "POST", {
            email: config.adminEmail,
            password,
            token: setup.token,
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    "new password administrator must bind MFA before configuring services",
    async () => {
      assert.equal(
        (await admin.request("admin/mail")).data.code,
        "STEP_UP_REQUIRED",
      );
      assert.equal(
        (await admin.request("admin/gate")).data.passwordRequired,
        true,
      );
      assert.equal(
        (await admin.request("admin/setup", "POST", {})).status,
        400,
      );
      const setup = await admin.request("admin/setup", "POST", { password });
      assert.equal(setup.status, 200, JSON.stringify(setup.data));
      backupCodes = setup.data.backupCodes;
      const secret = new URL(setup.data.totpURI).searchParams.get("secret");
      assert.equal(
        (
          await admin.request("admin/verify", "POST", {
            code: await generate({ secret }),
          })
        ).status,
        200,
      );
      assert.equal(
        (await admin.request("admin/setup", "POST", { password })).status,
        409,
      );
    },
  );
  await t.test(
    "SMTP settings mask and encrypt credentials, reject internal destinations, and check revisions",
    async () => {
      const input = {
        enabled: false,
        host: "smtp.example.test",
        port: 587,
        username: "mailer@example.test",
        password: smtpPassword,
        fromAddress: "sender@example.test",
        fromName: "Fixture",
        revision: 0,
        reason: "配置测试邮件服务",
      };
      const rejected = await admin.request("admin/mail", "PUT", {
        ...input,
        password: "",
      });
      assert.equal(rejected.status, 400);
      assert.equal(
        await one(app.db, "SELECT * FROM platform_settings WHERE key='smtp'"),
        null,
      );
      assert.equal(
        (await admin.request("admin/mail")).data.source,
        "unconfigured",
      );
      const result = await admin.request("admin/mail", "PUT", input);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      settings = result.data;
      assert.equal(settings.passwordConfigured, true);
      assert.ok(!JSON.stringify(settings).includes(smtpPassword));
      const record = await one(
        app.db,
        "SELECT * FROM platform_settings WHERE key='smtp'",
      );
      assert.ok(record.secret.startsWith("v1."));
      assert.ok(!JSON.stringify(record).includes(smtpPassword));
      assert.ok(
        !JSON.stringify(
          await query(app.db, "SELECT * FROM audit_events"),
        ).includes(smtpPassword),
      );
      assert.equal(
        (
          await admin.request("admin/mail", "PUT", {
            ...input,
            password: "",
            revision: 1,
            host: "other.example.test",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await admin.request("admin/mail", "PUT", {
            ...input,
            revision: 1,
            host: "internal.example.test",
          })
        ).data.code,
        "DESTINATION_BLOCKED",
      );
      assert.equal(
        (await admin.request("admin/mail", "PUT", input)).data.code,
        "SETTINGS_CONFLICT",
      );
      assert.equal(
        (await admin.request("admin/mail/verify", "POST", {})).status,
        200,
      );
      assert.equal(transports.at(-1).host, "8.8.8.8");
      assert.equal(transports.at(-1).tls.servername, "smtp.example.test");
      assert.equal(transports.at(-1).requireTLS, true);
      assert.equal(transports.at(-1).auth.pass, smtpPassword);
      const sent = await admin.request("admin/mail/test", "POST", {
        to: "unrelated@example.test",
      });
      assert.equal(sent.data.recipient, config.adminEmail);
      assert.equal(messages.at(-1).to, config.adminEmail);
      settings = (
        await admin.request("admin/mail", "PUT", {
          ...settings,
          enabled: true,
          password: "",
          reason: "启用验证码邮件",
        })
      ).data;
      assert.equal(
        (await anonymous.request("cloud/health")).data.mailMode,
        "smtp",
      );
    },
  );
  await t.test(
    "invited users receive OTP through the saved service but cannot use password login or SMTP APIs",
    async () => {
      const user = client(),
        email = "guest@example.test";
      assert.equal(
        (
          await admin.request("admin/invitations", "POST", {
            email,
            reason: "测试普通用户权限",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await user.request("auth/email-otp/send-verification-otp", "POST", {
            email,
            type: "sign-in",
          })
        ).status,
        200,
      );
      const otp = messages.at(-1).text.match(/\d{6}/)[0];
      assert.equal(
        (await user.request("auth/sign-in/email-otp", "POST", { email, otp }))
          .status,
        200,
      );
      assert.equal((await user.request("admin/mail")).status, 403);
      assert.equal(
        (await user.request("admin/mail/test", "POST", {})).status,
        403,
      );
      assert.equal(
        (await user.request("auth/sign-in/email", "POST", { email, password }))
          .status,
        401,
      );
      assert.equal(
        (
          await user.request("cloud/workspace", "GET", undefined, {
            "X-Luli-Account": adminId,
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    "subsequent administrator password login requires MFA and grants management only after verification",
    async () => {
      const next = client();
      const login = await next.request("auth/sign-in/email", "POST", {
        email: config.adminEmail,
        password,
      });
      assert.equal(login.status, 200, JSON.stringify(login.data));
      assert.equal(login.data.twoFactorRedirect, true);
      assert.equal((await next.request("cloud/me")).data.user, null);
      assert.equal((await next.request("admin/mail")).status, 401);
      const verified = await next.request(
        "auth/two-factor/verify-backup-code",
        "POST",
        { code: backupCodes[0] },
      );
      assert.equal(verified.status, 200, JSON.stringify(verified.data));
      assert.equal((await next.request("admin/mail")).status, 200);
      assert.equal((await next.request("admin/gate")).data.verified, true);
      await query(
        app.db,
        "UPDATE admin_grants SET expires_at=NOW()-INTERVAL '1 minute'",
      );
      assert.equal(
        (await next.request("admin/mail")).data.code,
        "STEP_UP_REQUIRED",
      );
    },
  );
  await assert.rejects(
    smtpTarget("mixed.example.test", async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    /内网/,
  );
});
