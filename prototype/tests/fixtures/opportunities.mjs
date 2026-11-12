import assert from "node:assert/strict";
import { generate } from "otplib";
import { createCloudApp } from "../../server/cloud/app.mjs";
export const fictionalOpportunity = {
  title: "虚构产品研究实习生",
  company: "星屿实验室（虚构）",
  regionCode: "HK",
  city: "香港",
  remote: false,
  direction: "产品",
  jd: "岗位职责：整理虚构用户访谈，参与产品研究与原型验证。任职要求：熟悉数据整理和清晰书面表达。每周三天，2028 届优先。",
  graduationYear: 2028,
  graduationCondition: "preferred",
  daysPerWeek: 3,
  durationMonths: 3,
  sourceType: "community",
  application: { type: "email", value: "careers@example.test" },
  applicationNotes: "主题注明岗位与可到岗日期。",
  compensation: { currency: "HKD", unit: "month", min: 8000, max: 10000 },
};
export async function opportunityFixture(t, port = 0) {
  const mailbox = new Map(),
    config = {
      memory: true,
      origin: "http://127.0.0.1:4190",
      origins: ["http://127.0.0.1:4190", "http://127.0.0.1:4192"],
      authSecret: "fictional-opportunity-test-secret-at-least-32-characters",
      credentialKey: Buffer.alloc(32, 9).toString("base64"),
      adminEmail: "op-admin@example.test",
      allowedModelHosts: [],
      deliverOTP: async (v) => mailbox.set(v.email, v.otp),
    };
  const app = await createCloudApp(config);
  await new Promise((resolve) => app.server.listen(port, "127.0.0.1", resolve));
  t?.after(() => app.close());
  const base = "http://127.0.0.1:" + app.server.address().port;
  function client() {
    const cookies = new Map();
    return {
      cookies,
      async call(path, method = "GET", body, headers = {}) {
        const res = await fetch(base + "/api/" + path, {
          method,
          headers: {
            Origin: config.origin,
            "X-Luli-Client": "workspace",
            "Content-Type": "application/json",
            Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
            ...headers,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        for (const raw of res.headers.getSetCookie()) {
          const pair = raw.split(";")[0],
            i = pair.indexOf("=");
          cookies.set(pair.slice(0, i), pair.slice(i + 1));
        }
        const content = await res.text();
        let data;
        try {
          data = JSON.parse(content);
        } catch {
          data = content;
        }
        return { status: res.status, data, headers: res.headers };
      },
      async ok(path, method = "GET", body) {
        const res = await this.call(path, method, body);
        assert.equal(res.status, 200, JSON.stringify(res.data));
        return res.data;
      },
      async login(email) {
        await this.ok("auth/email-otp/send-verification-otp", "POST", {
          email,
          type: "sign-in",
        });
        await this.ok("auth/sign-in/email-otp", "POST", {
          email,
          otp: mailbox.get(email),
        });
        return (await this.ok("cloud/me")).user;
      },
    };
  }
  const admin = client(),
    alice = client(),
    bob = client(),
    anonymous = client();
  const adminUser = await admin.login(config.adminEmail);
  const setup = await admin.ok("admin/setup", "POST", {});
  await admin.ok("admin/verify", "POST", {
    code: await generate({
      secret: new URL(setup.totpURI).searchParams.get("secret"),
    }),
  });
  for (const email of ["op-alice@example.test", "op-bob@example.test"])
    await admin.ok("admin/invitations", "POST", {
      email,
      reason: "虚构机会全链路验收",
    });
  const aliceUser = await alice.login("op-alice@example.test"),
    bobUser = await bob.login("op-bob@example.test");
  return {
    app,
    base,
    config,
    admin,
    alice,
    bob,
    anonymous,
    aliceUser,
    bobUser,
    adminUser,
    mailbox,
  };
}
