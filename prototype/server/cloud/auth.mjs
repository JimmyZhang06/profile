import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { emailOTP, twoFactor } from "better-auth/plugins";
import { getMigrations } from "better-auth/db/migration";
import { fromNodeHeaders } from "better-auth/node";
import { appendFile } from "node:fs/promises";
import nodemailer from "nodemailer";
import { one, query } from "./database.mjs";
import { assert, limit } from "./security.mjs";

export function createAuthentication(db, config) {
  const mailer = config.smtp ? nodemailer.createTransport(config.smtp) : null;
  async function allowed(email) {
    const access = await one(
      db,
      'SELECT a.status FROM "user" u JOIN account_access a ON a.user_id=u.id WHERE LOWER(u.email)=$1',
      [email],
    );
    if (access) return access.status === "active";
    if (email === config.adminEmail) return true;
    return !!(await one(
      db,
      "SELECT email FROM invitations WHERE email=$1 AND status='pending' AND expires_at>NOW()",
      [email],
    ));
  }
  const options = {
    appName: "履历",
    baseURL: config.origin,
    basePath: "/api/auth",
    secret: config.authSecret,
    database: { db, type: "postgres" },
    trustedOrigins: config.origins || [config.origin],
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 12,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-luli-peer-ip"] },
      useSecureCookies: config.production,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.production,
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 5,
        rateLimit: { window: 60, max: 20 },
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          if (!(await allowed(email.toLowerCase())))
            throw new APIError("FORBIDDEN", {
              message: "此邮箱尚未获邀，或账号已停用。",
            });
          if (config.deliverOTP) await config.deliverOTP({ email, otp, type });
          else if (mailer)
            await mailer.sendMail({
              from: config.mailFrom,
              to: email,
              subject: "履历 · 邮箱验证码",
              text: `你的验证码是 ${otp}，5 分钟内有效。若非本人操作，请忽略。`,
            });
          else {
            assert(!config.production, 503, "邮件服务未配置");
            await appendFile(
              config.dataDir + "/development-mailbox.jsonl",
              JSON.stringify({
                email,
                otp,
                type,
                time: new Date().toISOString(),
              }) + "\n",
              { mode: 0o600 },
            );
          }
        },
      }),
      twoFactor({ issuer: "履历管理后台", allowPasswordless: true }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ["/email-otp/send-verification-otp", "/sign-in/email-otp"].includes(
            ctx.path,
          )
        ) {
          const email = String(ctx.body?.email || "")
            .trim()
            .toLowerCase();
          try {
            await limit(
              db,
              "email:" + ctx.path + ":" + email,
              ctx.path.includes("send-verification") ? 3 : 8,
              60,
            );
          } catch {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "验证码操作过于频繁，请稍后再试。",
            });
          }
          if (!(await allowed(email)))
            throw new APIError("FORBIDDEN", {
              message: "此邮箱尚未获邀，或账号已停用。",
            });
          if (ctx.body) ctx.body.email = email;
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!(await allowed(user.email.toLowerCase())))
              throw new APIError("FORBIDDEN", { message: "请先获取邀请" });
            return { data: { ...user, email: user.email.toLowerCase() } };
          },
          after: async (user) => {
            await query(
              db,
              "INSERT INTO account_access(user_id,role) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING",
              [
                user.id,
                user.email.toLowerCase() === config.adminEmail
                  ? "admin"
                  : "user",
              ],
            );
            await query(
              db,
              "UPDATE invitations SET status='accepted' WHERE email=$1 AND status='pending'",
              [user.email.toLowerCase()],
            );
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const access = await one(
              db,
              "SELECT status FROM account_access WHERE user_id=$1",
              [session.userId],
            );
            if (!access || access.status !== "active")
              throw new APIError("FORBIDDEN", { message: "账号不可用" });
            return { data: session };
          },
        },
      },
    },
  };
  let auth;
  return {
    get auth() {
      return (auth ||= betterAuth(options));
    },
    options,
    async migrate() {
      const migration = await getMigrations(options);
      await migration.runMigrations();
    },
  };
}
export async function identity(
  req,
  auth,
  db,
  { admin = false, stepUp = true } = {},
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  assert(
    session?.user && session?.session,
    401,
    "登录已过期，草稿仍保留在本机，请重新登录。",
    "SESSION_EXPIRED",
  );
  const access = await one(
    db,
    "SELECT * FROM account_access WHERE user_id=$1",
    [session.user.id],
  );
  assert(
    access?.status === "active",
    403,
    "账号已停用，请联系管理员。",
    "ACCOUNT_DISABLED",
  );
  assert(
    !req.headers["x-luli-account"] ||
      req.headers["x-luli-account"] === session.user.id,
    409,
    "当前登录账号已变化，请切换到正确账号后同步。",
    "ACCOUNT_CHANGED",
  );
  if (admin) {
    assert(access.role === "admin", 403, "没有管理权限", "ADMIN_REQUIRED");
    if (stepUp)
      assert(
        await one(
          db,
          "SELECT session_id FROM admin_grants WHERE session_id=$1 AND expires_at>NOW()",
          [session.session.id],
        ),
        403,
        "请先完成管理员二次验证",
        "STEP_UP_REQUIRED",
      );
  }
  return { ...session, access };
}
export async function verifyAdmin(req, res, body, auth, db) {
  const current = await identity(req, auth, db, { admin: true, stepUp: false });
  await limit(db, "totp:" + current.user.id, 8, 300);
  const result = body.backupCode
    ? await auth.api.verifyBackupCode({
        headers: fromNodeHeaders(req.headers),
        body: { code: String(body.backupCode), trustDevice: false },
        asResponse: true,
      })
    : await auth.api.verifyTOTP({
        headers: fromNodeHeaders(req.headers),
        body: { code: String(body.code || ""), trustDevice: false },
        asResponse: true,
      });
  assert(
    result.ok,
    400,
    "验证器代码不正确或已失效，请重新输入。",
    "INVALID_TOTP",
  );
  const headers = fromNodeHeaders(req.headers),
    cookies = result.headers.getSetCookie();
  const cookieMap = new Map(
    (headers.get("cookie") || "")
      .split(";")
      .filter(Boolean)
      .map((part) => {
        const at = part.indexOf("=");
        return [part.slice(0, at).trim(), part.slice(at + 1)];
      }),
  );
  for (const value of cookies) {
    const part = value.split(";")[0],
      at = part.indexOf("=");
    cookieMap.set(part.slice(0, at), part.slice(at + 1));
  }
  headers.set("cookie", [...cookieMap].map(([k, v]) => k + "=" + v).join("; "));
  const verified = await auth.api.getSession({ headers });
  assert(
    verified?.user.id === current.user.id && verified.user.twoFactorEnabled,
    403,
    "二次验证未完成",
  );
  await query(
    db,
    "INSERT INTO admin_grants(session_id,expires_at) VALUES($1,NOW()+INTERVAL '30 minutes') ON CONFLICT(session_id) DO UPDATE SET expires_at=EXCLUDED.expires_at",
    [verified.session.id],
  );
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  return { verified: true, expiresIn: 1800 };
}
