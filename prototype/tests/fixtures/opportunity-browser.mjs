// Loopback only. Ephemeral database, test mail and fictional recruitment data.
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
import { fictionalOpportunity, opportunityFixture } from "./opportunities.mjs";
const f = await opportunityFixture(null, 4191);
const source = {
  description: "虚构测试岗位，不存在真实招聘，仅用于本地验收",
  permission: "虚构招聘人允许公开 example.test 测试邮箱",
  date: "2026-11-12",
};
let item = (
  await f.alice.ok("cloud/opportunity-submissions", "POST", {
    requestId: randomUUID(),
    data: fictionalOpportunity,
    source,
  })
).item;
item = (
  await f.alice.ok(
    "cloud/opportunity-submissions/" + item.id + "/submit",
    "POST",
    { revision: item.revision, requestId: randomUUID() },
  )
).item;
await f.admin.ok(
  "admin/opportunity-submissions/" + item.id + "/review",
  "POST",
  {
    revision: item.revision,
    opportunityRevision: item.opportunity_revision,
    requestId: randomUUID(),
    decision: "publish",
    sourceVerified: true,
    channelApproved: true,
    reason: "虚构岗位浏览器验收",
  },
);
process.env.LULI_API_ORIGIN = "http://127.0.0.1:4191";
const vite = await createServer({
  server: {
    host: "127.0.0.1",
    port: 4192,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4191" },
  },
});
await vite.listen();
await mkdir(".data/opportunity-qa", { recursive: true });
const timer = setInterval(
  () =>
    writeFile(
      ".data/opportunity-qa/mailbox.json",
      JSON.stringify(Object.fromEntries(f.mailbox)),
    ),
  500,
);
console.log(
  "Fictional opportunities ready: http://127.0.0.1:4192/opportunities/" +
    item.opportunity_id,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(timer);
    await vite.close();
    await f.app.close();
    process.exit(0);
  });
