import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { createDatabase, one, query } from "./database.mjs";
import {
  createAuthentication,
  identity,
  verifyAdmin,
  grantAdminResponse,
} from "./auth.mjs";
import { createMailService } from "./mail.mjs";
import { bootstrapStatus, completeBootstrap } from "./bootstrap.mjs";
import { isIP } from "node:net";
import { assert, HttpError, limit, audit } from "./security.mjs";
import {
  ensureWorkspace,
  readWorkspace,
  saveWorkspace,
  importWorkspace,
} from "./workspace.mjs";
import { listConnections, saveConnection, streamModel } from "./models.mjs";
import { adminRoute, seedTemplates, publicTemplates } from "./admin.mjs";
import { normalizeAvatar, storedAvatar } from "./avatar.mjs";

export function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
async function readBody(req, maximum = 9_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    assert(size <= maximum, 413, "请求内容过大");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "请求格式不正确");
  }
}
export async function createCloudApp(config) {
  const database = await createDatabase(config),
    db = database.db;
  const mail = createMailService(db, config);
  const authentication = createAuthentication(db, config, mail);
  await authentication.migrate();
  await database.migrate();
  await seedTemplates(db);
  const auth = authentication.auth,
    authHandler = toNodeHandler(auth);
  const publicAuthPaths = new Set([
    "/get-session",
    "/sign-in/email-otp",
    "/sign-in/email",
    "/email-otp/send-verification-otp",
    "/sign-out",
  ]);
  async function handler(req, res) {
    // Apache overwrites X-Forwarded-For. Only an explicitly trusted loopback
    // proxy may supply it; clients cannot supply our private identity header.
    const peer = req.socket.remoteAddress;
    const forwarded = String(req.headers["x-forwarded-for"] || "").trim();
    req.headers["x-luli-peer-ip"] =
      config.trustProxy &&
      ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer) &&
      isIP(forwarded)
        ? forwarded
        : peer;
    const url = new URL(req.url, config.origin),
      path = url.pathname;
    try {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "same-origin");
      res.setHeader("X-Frame-Options", "DENY");
      if (path === "/api/cloud/health")
        return json(res, 200, {
          ok: true,
          cloudEnabled: true,
          mode: config.production ? "production" : "development",
          ...(await mail.status()),
        });
      if (path.startsWith("/api/")) {
        const origin = req.headers.origin;
        assert(
          !origin || (config.origins || [config.origin]).includes(origin),
          403,
          "请求来源不被允许",
        );
        if (req.method !== "GET")
          assert(
            req.headers["x-luli-client"] === "workspace",
            403,
            "请求缺少客户端标识",
          );
      }
      if (path === "/api/setup/status" && req.method === "GET")
        return json(res, 200, await bootstrapStatus(db));
      if (path === "/api/setup/complete" && req.method === "POST") {
        await limit(db, "setup:" + req.headers["x-luli-peer-ip"], 6, 300);
        const response = await completeBootstrap(
          db,
          authentication,
          config,
          await readBody(req),
        );
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader("Set-Cookie", cookies);
        return json(res, 200, { initialized: true });
      }
      if (
        [
          "/api/auth/two-factor/verify-totp",
          "/api/auth/two-factor/verify-backup-code",
        ].includes(path) &&
        req.method === "POST"
      ) {
        await limit(db, "login-totp:" + req.headers["x-luli-peer-ip"], 8, 300);
        const body = await readBody(req);
        const response = await auth.api[
          path.endsWith("verify-totp") ? "verifyTOTP" : "verifyBackupCode"
        ]({
          headers: fromNodeHeaders(req.headers),
          body: { code: String(body.code || ""), trustDevice: false },
          asResponse: true,
        });
        assert(response.ok, 400, "验证器代码不正确或已失效。");
        return json(
          res,
          200,
          await grantAdminResponse(req, res, response, auth, db),
        );
      }
      if (path.startsWith("/api/auth/")) {
        assert(publicAuthPaths.has(path.slice(9)), 404, "认证接口未开放");
        await limit(db, "auth-ip:" + req.headers["x-luli-peer-ip"], 60, 60);
        if (
          [
            "/api/auth/email-otp/send-verification-otp",
            "/api/auth/sign-in/email-otp",
          ].includes(path)
        )
          assert(
            (await mail.status()).mailReady,
            503,
            "邮箱登录暂未开放，请稍后再试。",
            "MAIL_NOT_CONFIGURED",
          );
        return await authHandler(req, res);
      }
      if (!path.startsWith("/api/")) {
        if (!config.production)
          return json(res, 404, { error: "请访问前端开发地址" });
        const root = resolve(config.staticRoot || "dist/client"),
          requested = resolve(root, "." + decodeURIComponent(path));
        assert(
          requested === root || requested.startsWith(root + sep),
          403,
          "路径无效",
        );
        let file = requested;
        try {
          if (!(await stat(file)).isFile()) file = null;
        } catch {
          file = null;
        }
        if (!file) {
          assert(!extname(requested), 404, "文件不存在");
          file = resolve(root, "index.html");
        }
        const types = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".ico": "image/x-icon",
          ".webmanifest": "application/manifest+json; charset=utf-8",
        };
        res.writeHead(200, {
          "Content-Type": types[extname(file)] || "application/octet-stream",
          "Cache-Control":
            [".html", ".webmanifest"].includes(extname(file)) || path === "/apple-touch-icon.png" ? "no-cache" : "public,max-age=3600",
        });
        return res.end(await readFile(file));
      }
      const isAdmin = path.startsWith("/api/admin/");
      if (
        path === "/api/cloud/me" &&
        req.method === "GET" &&
        !(await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))
      )
        return json(res, 200, { user: null });
      const actor = await identity(req, auth, db, {
        admin: isAdmin,
        stepUp: ![
          "/api/admin/verify",
          "/api/admin/setup",
          "/api/admin/gate",
        ].includes(path),
      });
      await limit(db, "api:" + actor.user.id, 300, 60);
      const body = ["POST", "PUT", "DELETE"].includes(req.method)
        ? await readBody(req, path === "/api/cloud/account/avatar" ? 240000 : undefined)
        : {};
      let result;
      if (path === "/api/cloud/me" && req.method === "GET") {
        await query(
          db,
          "UPDATE account_access SET last_active=NOW() WHERE user_id=$1 AND last_active<NOW()-INTERVAL '5 minutes'",
          [actor.user.id],
        );
        result = {
          user: {
            id: actor.user.id,
            email: actor.user.email,
            name: actor.user.name,
            avatar: storedAvatar(actor.user.image),
            role: actor.access.role,
            twoFactorEnabled: !!actor.user.twoFactorEnabled,
          },
          session: { id: actor.session.id, expiresAt: actor.session.expiresAt },
          quota: {
            limit: actor.access.monthly_limit,
            used: (
              await one(
                db,
                "SELECT COUNT(*)::int AS count FROM model_usage WHERE user_id=$1 AND started_at>=date_trunc('month',NOW())",
                [actor.user.id],
              )
            ).count,
          },
        };
      } else if (path === "/api/cloud/account/avatar" && req.method === "PUT") {
        await limit(db, "avatar:" + actor.user.id, 20, 300);
        const avatar = normalizeAvatar(body.image);
        await query(db, 'UPDATE "user" SET image=$2,"updatedAt"=NOW() WHERE id=$1', [actor.user.id, avatar]);
        result = { avatar };
      } else if (path === "/api/cloud/workspace" && req.method === "GET")
        result = await ensureWorkspace(db, actor.user.id);
      else if (path === "/api/cloud/workspace" && req.method === "PUT")
        result = await saveWorkspace(db, actor.user.id, body);
      else if (path === "/api/cloud/import" && req.method === "POST")
        result = await importWorkspace(db, actor.user.id, body);
      else if (path === "/api/cloud/backups" && req.method === "GET")
        result = {
          items: await query(
            db,
            "SELECT id,revision,created_at FROM sync_backups WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30",
            [actor.user.id],
          ),
        };
      else if (path.startsWith("/api/cloud/backups/") && req.method === "GET") {
        result = await one(
          db,
          "SELECT data,revision,created_at FROM sync_backups WHERE owner_id=$1 AND id=$2",
          [actor.user.id, path.split("/").at(-1)],
        );
        assert(result, 404, "恢复副本不存在");
      } else if (path === "/api/cloud/connections" && req.method === "GET")
        result = { connections: await listConnections(db, actor.user.id) };
      else if (path === "/api/cloud/connections" && req.method === "POST")
        result = await saveConnection(db, actor.user.id, body, config);
      else if (
        ["/api/cloud/chat", "/api/cloud/test"].includes(path) &&
        req.method === "POST"
      ) {
        result = await streamModel(req, res, body, actor, db, config, {
          testing: path.endsWith("/test"),
          dispatcherFactory: config.modelDispatcher,
        });
        if (res.headersSent) return;
      } else if (path === "/api/cloud/templates" && req.method === "GET")
        result = { items: await publicTemplates(db) };
      else if (path === "/api/cloud/sessions" && req.method === "GET")
        result = {
          items: await query(
            db,
            'SELECT id,"userAgent" AS user_agent,"ipAddress" AS ip_address,"createdAt" AS created_at,"expiresAt" AS expires_at FROM session WHERE "userId"=$1 AND "expiresAt">NOW() ORDER BY "createdAt" DESC',
            [actor.user.id],
          ),
          currentId: actor.session.id,
        };
      else if (path === "/api/cloud/sessions/revoke" && req.method === "POST") {
        if (body.others)
          await query(db, 'DELETE FROM session WHERE "userId"=$1 AND id<>$2', [
            actor.user.id,
            actor.session.id,
          ]);
        else {
          assert(
            body.id !== actor.session.id,
            400,
            "请使用退出登录结束当前会话",
          );
          await query(db, 'DELETE FROM session WHERE "userId"=$1 AND id=$2', [
            actor.user.id,
            body.id,
          ]);
        }
        result = { ok: true };
      } else if (
        path === "/api/cloud/account/delete" &&
        req.method === "POST"
      ) {
        assert(
          actor.access.role !== "admin",
          400,
          "管理员请先完成账号交接，再通过部署维护流程注销。",
        );
        assert(body.email === actor.user.email, 400, "请完整输入当前邮箱");
        await limit(db, "delete:" + actor.user.id, 5, 300);
        const verified = await auth.api.verifyEmailOTP({
          headers: fromNodeHeaders(req.headers),
          body: { email: actor.user.email, otp: String(body.otp || "") },
          asResponse: true,
        });
        assert(verified.ok, 400, "邮箱验证码无效");
        await db.transaction().execute(async (tx) => {
          await audit(
            tx,
            actor.user,
            "account.delete",
            actor.user.id,
            null,
            { deleted: true },
            "用户验证邮箱后主动注销",
          );
          await query(
            tx,
            "DELETE FROM model_connections WHERE owner_id=$1 AND scope='user'",
            [actor.user.id],
          );
          await query(tx, 'DELETE FROM "user" WHERE id=$1', [actor.user.id]);
        });
        result = { ok: true };
      } else if (path === "/api/admin/gate" && req.method === "GET")
        result = {
          enabled: !!actor.user.twoFactorEnabled,
          passwordRequired: !!(await one(
            db,
            'SELECT id FROM account WHERE "userId"=$1 AND "providerId"=\'credential\' AND password IS NOT NULL',
            [actor.user.id],
          )),
          verified: !!(await one(
            db,
            "SELECT session_id FROM admin_grants WHERE session_id=$1 AND expires_at>NOW()",
            [actor.session.id],
          )),
        };
      else if (path === "/api/admin/setup" && req.method === "POST") {
        assert(
          !actor.user.twoFactorEnabled,
          409,
          "此账号已经绑定验证器，请使用验证器或恢复代码。",
        );
        assert(
          new Date(actor.session.createdAt).getTime() > Date.now() - 600000,
          403,
          "请重新登录后绑定验证器",
        );
        result = await auth.api.enableTwoFactor({
          headers: fromNodeHeaders(req.headers),
          body: {
            method: "totp",
            ...(body.password ? { password: String(body.password) } : {}),
          },
        });
      } else if (path === "/api/admin/verify" && req.method === "POST")
        result = await verifyAdmin(req, res, body, auth, db);
      else if (isAdmin)
        result = await adminRoute({
          db,
          config,
          mail,
          actor,
          path: path.slice(10),
          method: req.method,
          body,
          url,
        });
      else throw new HttpError(404, "接口不存在");
      return json(res, 200, result);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const status = Number(error.status) || Number(error.statusCode) || 500;
      json(res, status >= 400 && status < 600 ? status : 500, {
        error: status < 500 ? error.message : "服务暂时不可用，请稍后重试。",
        code: error.code || "SERVER_ERROR",
        ...(error.details || {}),
      });
      if (status >= 500) console.error("[api]", error.code || error.name);
    }
  }
  const server = createServer(handler);
  server.requestTimeout = 130000;
  server.headersTimeout = 15000;
  return {
    server,
    db,
    auth,
    config,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await database.close();
    },
  };
}
