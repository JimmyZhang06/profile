import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const dataDir = resolve(env.LULI_DATA_DIR || ".data/cloud");
  const origin = env.APP_ORIGIN || "http://127.0.0.1:4174";
  const cloudEnabled = env.CLOUD_ENABLED !== "false";
  if (production && new URL(origin).protocol !== "https:")
    throw new Error("正式环境必须使用 HTTPS APP_ORIGIN。");
  if (!cloudEnabled)
    return {
      production,
      cloudEnabled: false,
      origin,
      port: Number(env.API_PORT || 4175),
      host: production ? env.API_HOST || "127.0.0.1" : "127.0.0.1",
    };
  const origins = [origin];
  if (!production) {
    const alias = new URL(origin);
    if (["127.0.0.1", "localhost"].includes(alias.hostname)) {
      alias.hostname =
        alias.hostname === "localhost" ? "127.0.0.1" : "localhost";
      origins.push(alias.origin);
    }
  }
  if (
    production &&
    (!env.DATABASE_URL ||
      !env.BETTER_AUTH_SECRET ||
      !env.CREDENTIAL_KEY ||
      !env.BOOTSTRAP_ADMIN_EMAIL ||
      !origin.startsWith("https://"))
  )
    throw new Error(
      "正式环境必须配置 PostgreSQL、HTTPS、认证密钥、凭据加密密钥和管理员邮箱。",
    );
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length < 32)
    throw new Error("BETTER_AUTH_SECRET 至少需要 32 个字符。");
  await mkdir(dataDir, { recursive: true });
  let secrets = {};
  if (!production) {
    const path = resolve(dataDir, "development-secrets.json");
    try {
      secrets = JSON.parse(await readFile(path, "utf8"));
    } catch {
      secrets = {
        auth: randomBytes(48).toString("base64url"),
        credentials: randomBytes(32).toString("base64"),
      };
      await writeFile(path, JSON.stringify(secrets), {
        mode: 0o600,
        flag: "wx",
      });
    }
  }
  const credentialKey = env.CREDENTIAL_KEY || secrets.credentials;
  if (Buffer.from(credentialKey || "", "base64").length !== 32)
    throw new Error("CREDENTIAL_KEY 必须是 Base64 编码的 32 字节随机密钥。");
  return {
    production,
    cloudEnabled: true,
    dataDir,
    origin,
    origins,
    port: Number(env.API_PORT || 4175),
    host: production ? env.API_HOST || "127.0.0.1" : "127.0.0.1",
    databaseUrl: env.DATABASE_URL,
    trustProxy: env.TRUST_PROXY_LOOPBACK === "true",
    authSecret: env.BETTER_AUTH_SECRET || secrets.auth,
    credentialKey,
    adminEmail: String(
      env.BOOTSTRAP_ADMIN_EMAIL || (!production ? "owner@luli.local" : ""),
    )
      .trim()
      .toLowerCase(),
    allowedModelHosts: (env.MODEL_ALLOWED_HOSTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT || 587),
          secure: env.SMTP_SECURE === "true",
          requireTLS: production && env.SMTP_SECURE !== "true",
          auth: env.SMTP_USER
            ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
            : undefined,
        }
      : null,
    mailFrom: env.MAIL_FROM || "履历 <noreply@luli.local>",
  };
}
