import { createServer } from "node:http";
import { readFile, stat, realpath } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

// An explicit browser-only release. No database, mailer, authentication or model
// proxy is initialized. Cloud production configuration remains fail-closed.
export async function createLocalApp(config) {
  const root = await realpath(resolve(config.staticRoot || "dist/client"));
  function json(res, status, body) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  }
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".woff2": "font/woff2",
  };
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    try {
      const path = decodeURIComponent(new URL(req.url, config.origin).pathname);
      if (["GET", "HEAD"].includes(req.method)) {
        if (path === "/api/cloud/health")
          return json(res, 200, {
            ok: true,
            mode: config.production ? "production" : "development",
            cloudEnabled: false,
            mailMode: "disabled",
          });
        if (path === "/api/cloud/me")
          return json(res, 200, { user: null, cloudEnabled: false });
      }
      if (path === "/api" || path.startsWith("/api/"))
        return json(res, 503, {
          code: "CLOUD_DISABLED",
          error: "云端账号与模型服务暂未开放，请使用本机编辑与内置整理。",
        });
      if (!["GET", "HEAD"].includes(req.method)) {
        res.setHeader("Allow", "GET, HEAD");
        return json(res, 405, { error: "请求方法不被允许" });
      }
      if (
        path.includes("\\") ||
        path.split("/").some((part) => part.startsWith("."))
      )
        return json(res, 404, { error: "页面不存在" });
      let file = resolve(root, "." + path);
      if (file !== root && !file.startsWith(root + sep))
        return json(res, 404, { error: "页面不存在" });
      try {
        file = await realpath(file);
        if (!file.startsWith(root + sep) || !(await stat(file)).isFile())
          file = null;
      } catch {
        file = null;
      }
      if (!file) {
        // Only application routes get the SPA shell. Unknown assets and source
        // paths must not look like successful downloads.
        if (!["/", "/admin", "/admin/"].includes(path))
          return json(res, 404, { error: "页面不存在" });
        file = resolve(root, "index.html");
      }
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Content-Length": body.length,
        "Cache-Control": path.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      json(res, 400, { error: "请求无法处理" });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    server,
    async close() {
      await new Promise((done) => server.close(done));
    },
  };
}
