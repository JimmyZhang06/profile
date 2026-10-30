import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../server/cloud/config.mjs";
import { createLocalApp } from "../server/local.mjs";

test("browser-only production must be explicit and must not weaken cloud configuration", async () => {
  await assert.rejects(
    loadConfig({
      NODE_ENV: "production",
      APP_ORIGIN: "https://resume.example.test",
    }),
    /PostgreSQL/,
  );
  await assert.rejects(
    loadConfig({
      NODE_ENV: "production",
      CLOUD_ENABLED: "false",
      APP_ORIGIN: "http://resume.example.test",
    }),
    /HTTPS/,
  );
  const config = await loadConfig({
    NODE_ENV: "production",
    CLOUD_ENABLED: "false",
    APP_ORIGIN: "https://resume.example.test",
  });
  assert.equal(config.cloudEnabled, false);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.authSecret, undefined);
  assert.equal(config.databaseUrl, undefined);
});

test("public browser-only server serves the release but blocks authentication, models and private paths", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "luli-deploy-"));
  const root = join(dir, "client");
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), "<h1>Fictional release</h1>");
  await writeFile(
    join(root, "assets", "app-123.js"),
    "export const ready = true;",
  );
  await writeFile(join(dir, ".env"), "PRIVATE_FIXTURE_DO_NOT_SERVE");
  const app = await createLocalApp({
    origin: "https://resume.example.test",
    production: true,
    staticRoot: root,
  });
  await new Promise((done) => app.server.listen(0, "127.0.0.1", done));
  t.after(async () => {
    await app.close();
    assert.ok(basename(dir).startsWith("luli-deploy-"));
    await rm(dir, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + app.server.address().port;
  for (const path of ["/", "/admin", "/admin/"]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.match(await r.text(), /Fictional release/);
  }
  const asset = await fetch(base + "/assets/app-123.js");
  assert.match(asset.headers.get("cache-control"), /immutable/);
  assert.match(asset.headers.get("content-type"), /javascript/);
  const head = await fetch(base + "/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const health = await (await fetch(base + "/api/cloud/health")).json();
  assert.equal(health.mode, "production");
  assert.equal(health.cloudEnabled, false);
  assert.equal(health.mailMode, "disabled");
  assert.equal((await (await fetch(base + "/api/cloud/me")).json()).user, null);
  for (const path of [
    "/api/auth/email-otp/send-verification-otp",
    "/api/cloud/workspace",
    "/api/connections",
    "/api/admin/users",
  ]) {
    const r = await fetch(base + path, { method: "POST", body: "{}" });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).code, "CLOUD_DISABLED");
    assert.equal(r.headers.get("set-cookie"), null);
  }
  for (const path of [
    "/.env",
    "/%2eenv",
    "/.data/cloud/local-mailbox.json",
    "/%2e%2e%2f.env",
    "/server/api.mjs",
    "/assets/missing.js",
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 404, path);
    assert.doesNotMatch(await r.text(), /PRIVATE_FIXTURE|Fictional release/);
  }
  assert.equal((await fetch(base + "/", { method: "POST" })).status, 405);
  assert.equal((await fetch(base + "/%E0%A4%A")).status, 400);
});
