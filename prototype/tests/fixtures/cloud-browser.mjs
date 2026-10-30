// Disposable browser QA fixture: loopback only, in-memory database, fictional accounts.
// Never use this process or its test credentials for deployment.
import { createCloudApp } from "../../server/cloud/app.mjs";
import { generate } from "otplib";
import { mkdir, writeFile } from "node:fs/promises";
const directory = ".data/browser-qa";
await mkdir(directory, { recursive: true });
const mailbox = {};
const config = {
  memory: true,
  origin: "http://localhost:4176",
  origins: ["http://localhost:4176", "http://127.0.0.1:4176"],
  authSecret: "isolated-browser-test-only-secret-never-deploy",
  credentialKey: Buffer.alloc(32, 13).toString("base64"),
  adminEmail: "qa-owner@example.test",
  allowedModelHosts: [],
  deliverOTP: async ({ email, otp }) => {
    mailbox[email] = otp;
    await writeFile(directory + "/mailbox.json", JSON.stringify(mailbox));
  },
};
const app = await createCloudApp(config);
await new Promise((resolve) => app.server.listen(4177, "127.0.0.1", resolve));
const cookies = new Map();
async function api(path, body) {
  const response = await fetch("http://127.0.0.1:4177/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: config.origin,
      "X-Luli-Client": "workspace",
      "Content-Type": "application/json",
      Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const entry of response.headers.getSetCookie()) {
    const raw = entry.split(";")[0],
      index = raw.indexOf("=");
    cookies.set(raw.slice(0, index), raw.slice(index + 1));
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message);
  return data;
}
await api("auth/email-otp/send-verification-otp", {
  email: config.adminEmail,
  type: "sign-in",
});
await api("auth/sign-in/email-otp", {
  email: config.adminEmail,
  otp: mailbox[config.adminEmail],
});
const setup = await api("admin/setup", {}),
  secret = new URL(setup.totpURI).searchParams.get("secret");
await api("admin/verify", { code: await generate({ secret }) });
await writeFile(
  directory + "/authenticator.json",
  JSON.stringify({ secret, backupCodes: setup.backupCodes }),
);
await api("admin/invitations", {
  email: "qa-user@example.test",
  reason: "独立浏览器验收，全部为虚构账号",
});
console.log("QA fixture ready: loopback 4177, ephemeral database");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
