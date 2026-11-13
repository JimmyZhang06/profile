// Real local readers and authenticated API, with fictional documents and an
// in-process provider. No real resumes, remote models or production writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { opportunityFixture } from "../fixtures/opportunities.mjs";
import { fictionalLines, fictionalPlan } from "../fixtures/resume-import.mjs";
import { registerCloudAdapter } from "../../server/cloud/models.mjs";

const { chromium } = createRequire(import.meta.url)(
  process.env.LULI_PLAYWRIGHT_MODULE || "playwright",
);
const { app, config, base, alice, aliceUser, bob, anonymous, admin } =
  await opportunityFixture();
let browser,
  mode = "ok";
const requests = [];
const restore = registerCloudAdapter(
  "compatible",
  async ({ messages, signal }) => {
    requests.push(messages);
    assert(!JSON.stringify(messages).includes("liming@example.test"));
    assert(!JSON.stringify(messages).includes("13800138000"));
    assert(!JSON.stringify(messages).includes("林明"));
    const plan = structuredClone(fictionalPlan);
    if (mode === "bad") plan.records[0].name.quote = "模型编造的公司";
    const text = "<resume_import>" + JSON.stringify(plan) + "</resume_import>";
    const delay = mode === "slow" ? 120 : 1;
    return new Response(
      new ReadableStream({
        async start(controller) {
          for (let i = 0; i < text.length; i += 100) {
            if (signal.aborted) break;
            controller.enqueue(
              new TextEncoder().encode(
                "data: " +
                  JSON.stringify({
                    choices: [{ delta: { content: text.slice(i, i + 100) } }],
                  }) +
                  "\n\n",
              ),
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  },
);
function wordFile() {
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const xml =
    '<w:document xmlns:w="' +
    ns +
    '"><w:body>' +
    fictionalLines
      .map((s) => "<w:p><w:r><w:t>" + s + "</w:t></w:r></w:p>")
      .join("") +
    "</w:body></w:document>";
  return {
    name: "虚构简历.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(zipSync({ "word/document.xml": strToU8(xml) })),
  };
}
function pdfFile(objects, name) {
  const chunks = [Buffer.from("%PDF-1.4\n")],
    offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((object, i) => {
    offsets.push(offset);
    const b = Buffer.concat([
      Buffer.from(i + 1 + " 0 obj\n"),
      Buffer.from(object),
      Buffer.from("\nendobj\n"),
    ]);
    chunks.push(b);
    offset += b.length;
  });
  const xref =
    "xref\n0 " +
    (objects.length + 1) +
    "\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("");
  chunks.push(
    Buffer.from(
      xref +
        "trailer\n<< /Size " +
        (objects.length + 1) +
        " /Root 1 0 R >>\nstartxref\n" +
        offset +
        "\n%%EOF",
    ),
  );
  return { name, mimeType: "application/pdf", buffer: Buffer.concat(chunks) };
}
const stream = (data) =>
  Buffer.concat([
    Buffer.from("<< /Length " + data.length + " >>\nstream\n"),
    data,
    Buffer.from("\nendstream"),
  ]);
const button = (page, name) => page.getByRole("button", { name, exact: true });
async function openImport(page) {
  await button(page, "新建岗位简历").click();
  await button(page, "导入已有简历").click();
}
async function upload(page, file) {
  await page.getByLabel("选择简历文件").setInputFiles(file);
  await button(page, "保存简历").waitFor();
}
async function ready(page, text) {
  await page.getByText(text, { exact: true }).waitFor();
}

try {
  config.allowedModelHosts = ["parser.example.test"];
  config.modelDispatcher = async () => ({ close: async () => {} });
  const connection = await admin.ok("admin/models", "POST", {
    name: "内部解析连接",
    model: "fixture-parser",
    baseUrl: "https://parser.example.test/v1",
    apiKey: "fictional-only",
    enabled: true,
    reason: "虚构导入全流程验收",
  });
  Object.assign(config, {
    production: true,
    staticRoot: resolve(process.env.LULI_TEST_CLIENT || "dist/client"),
    origins: [...config.origins, base],
  });
  const invalidBody = {
    purpose: "resume-import",
    connectionId: connection.id,
    context: { blocks: [{ id: "b1", text: "项目经历" }] },
  };
  assert.equal(
    (await anonymous.call("cloud/chat", "POST", invalidBody)).status,
    401,
  );
  assert.equal(
    (await alice.call("cloud/chat", "POST", invalidBody)).status,
    400,
  );
  assert.equal(requests.length, 0);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.LULI_CHROMIUM_CHANNEL || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1380, height: 940 },
    locale: "zh-CN",
  });
  await context.route("**/*", (r) =>
    r
      .request()
      .url()
      .startsWith(base + "/")
      ? r.continue()
      : r.abort(),
  );
  await context.addCookies(
    [...alice.cookies].map(([name, value]) => ({ name, value, url: base })),
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(base);
  await openImport(page);
  await upload(page, wordFile());
  assert.equal(await page.locator(".import-experience").count(), 3);
  await button(page, "用 AI 整理").click();
  await ready(page, "已按原文整理经历");
  assert.equal(await page.locator(".import-experience").count(), 3);
  await page
    .locator(".import-experience-heading")
    .filter({ hasText: "星图手账" })
    .click();
  const card = page.locator(".import-experience.is-open");
  const wording = card.getByLabel(/^职责、行动与成果/);
  const original = await wording.inputValue();
  await wording.fill(original + "\n手动核对了要点。");
  await button(page, "用 AI 整理").click();
  await button(page, "保留当前校对").click();
  assert.match(await wording.inputValue(), /手动核对/);
  await wording.fill(original);
  await card.getByText("查看对应原文", { exact: true }).click();
  await card.getByText("Word 第 7 段", { exact: true }).waitFor();
  await button(card, "拆分经历").click();
  await card.locator(".import-split button").first().click();
  assert.equal(await page.locator(".import-experience").count(), 4);
  await page
    .locator(".import-experience-heading")
    .filter({ hasText: "补充经历名称" })
    .click();
  await button(
    page.locator(".import-experience.is-open").last(),
    "合并到上一段",
  ).click();
  assert.equal(await page.locator(".import-experience").count(), 3);
  await page.getByLabel("同时补充到资料库").check();
  for (const heading of await page
    .locator('.import-experience-heading[aria-expanded="true"]')
    .all())
    await heading.click();
  await page
    .locator(".resume-import-page .page-scroll")
    .evaluate((node) => (node.scrollTop = 0));
  await mkdir(".data/resume-import-qa", { recursive: true });
  await page.screenshot({ path: ".data/resume-import-qa/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: ".data/resume-import-qa/mobile-dark.png" });
  assert(await button(page, "保存简历").isEnabled());
  assert(
    await page
      .locator(".resume-import-page .page-scroll")
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  );
  await page.setViewportSize({ width: 1380, height: 940 });
  const firstSave = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/cloud/workspace") &&
      r.request().method() === "PUT" &&
      r.status() === 200,
  );
  await button(page, "保存并按 JD 生成").click();
  await page
    .getByRole("heading", { name: "按 JD 生成简历", exact: true })
    .waitFor();
  await firstSave;
  const saved = await alice.ok("cloud/workspace"),
    doc = saved.state.documents.find((d) => d.origin === "file");
  assert.equal(doc.resume.sources.length, 2);
  assert.equal(doc.resume.workEntries.length, 1);
  assert.equal(saved.state.library.length, 2);
  assert.equal(doc.importSource.method, "ai");
  assert.equal(doc.importSource.blocks[6].location, "Word 第 7 段");
  assert.equal((await bob.ok("cloud/workspace")).state.library.length, 0);
  // Import the exact same wording again; archive deduplication works through
  // the save action and database, independently of new document/source IDs.
  await button(page, "导入已有简历").click();
  await upload(page, wordFile());
  await button(page, "用 AI 整理").click();
  await ready(page, "已按原文整理经历");
  await page.getByLabel("同时补充到资料库").check();
  const secondSave = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/cloud/workspace") &&
      r.request().method() === "PUT" &&
      r.status() === 200,
  );
  await button(page, "保存简历").click();
  await secondSave;
  const repeated = await alice.ok("cloud/workspace");
  assert.equal(repeated.state.library.length, 2);
  assert.equal(repeated.state.profile.workEntries.length, 1);
  assert.equal(
    repeated.state.documents.filter((d) => d.origin === "file").length,
    2,
  );
  // A wrong model quote and a stopped request both keep the local review.
  await openImport(page);
  await upload(page, wordFile());
  mode = "bad";
  await button(page, "用 AI 整理").click();
  await page.getByRole("alert").filter({ hasText: "原文未能对应" }).waitFor();
  assert.equal(await page.locator(".import-experience").count(), 3);
  mode = "slow";
  await button(page, "用 AI 整理").click();
  await button(page, "停止整理").click();
  assert.equal(await page.locator(".import-experience").count(), 3);
  assert(await button(page, "保存简历").isEnabled());
  // Text PDF and scanned PDF both run the shipped on-device readers.
  const pdfPage = await context.newPage();
  pdfPage.setDefaultTimeout(60000);
  await pdfPage.goto(base);
  await openImport(pdfPage);
  const text = Buffer.from(
    "BT /F1 15 Tf 50 760 Td (Lin Ming) Tj 0 -40 Td (Projects) Tj 0 -35 Td (Aurora | Product Design | 2025.01-2025.03) Tj 0 -35 Td (Interviewed 8 users and reviewed two prototype iterations.) Tj ET",
  );
  const pdf = pdfFile(
    [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      stream(text),
    ],
    "fictional-text.pdf",
  );
  await upload(pdfPage, pdf);
  await pdfPage
    .locator(".import-experience-heading")
    .filter({ hasText: "Aurora" })
    .waitFor();
  await pdfPage.locator(".import-experience-heading").first().click();
  await pdfPage.getByText("查看对应原文", { exact: true }).click();
  await pdfPage
    .getByText(/PDF 第 1 页 · 第/)
    .first()
    .waitFor();
  const scanPage = await context.newPage();
  scanPage.setDefaultTimeout(60000);
  await scanPage.goto(base);
  await openImport(scanPage);
  const jpeg = Buffer.from(
    await scanPage.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1250;
      canvas.height = 1760;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 1250, 1760);
      ctx.fillStyle = "black";
      ctx.font = "38px Arial";
      [
        "Lin Ming",
        "Projects",
        "Aurora | Product Designer | 2025.01-2025.03",
        "Interviewed 8 users.",
        "Reviewed two prototype iterations.",
      ].forEach((s, i) => ctx.fillText(s, 80, 110 + i * 90));
      return canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
    }),
    "base64",
  );
  const draw = Buffer.from("q 595 0 0 842 0 0 cm /Scan Do Q");
  const image = Buffer.concat([
    Buffer.from(
      "<< /Type /XObject /Subtype /Image /Width 1250 /Height 1760 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
        jpeg.length +
        " >>\nstream\n",
    ),
    jpeg,
    Buffer.from("\nendstream"),
  ]);
  await upload(
    scanPage,
    pdfFile(
      [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>",
        stream(draw),
        image,
      ],
      "fictional-scan.pdf",
    ),
  );
  await scanPage.getByText("3 段经历", { exact: true }).count();
  assert.match(
    await scanPage.locator(".import-review-summary").innerText(),
    /扫描识别/,
  );
  assert.match(
    await scanPage
      .locator(".import-experience")
      .allTextContents()
      .then((v) => v.join("\n")),
    /Aurora/,
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: real DOCX, text PDF, scanned PDF/OCR, authenticated AI stream, manual edits, source links, split/merge, cancellation, invalid results, cloud save, duplicate imports, account isolation, JD handoff and narrow dark layout.",
  );
} finally {
  restore();
  await browser?.close();
  await app.close();
}
