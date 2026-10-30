import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";
import ipaddr from "ipaddr.js";
import { one, query } from "./database.mjs";

export class HttpError extends Error {
  constructor(status, message, code = "REQUEST_FAILED", details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function assert(condition, status, message, code) {
  if (!condition) throw new HttpError(status, message, code);
}
export function encryptSecret(value, key, identity) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  cipher.setAAD(Buffer.from(identity));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}
export function decryptSecret(value, key, identity) {
  const [version, iv, tag, data] = value.split(".");
  assert(version === "v1", 500, "凭据版本无法读取");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "base64"),
    Buffer.from(iv, "base64"),
  );
  cipher.setAAD(Buffer.from(identity));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(data, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
export async function limit(db, key, max, seconds) {
  const row = await one(
    db,
    `INSERT INTO app_limits(key,count,expires_at) VALUES($1,1,NOW()+$2*INTERVAL '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN app_limits.expires_at < NOW() THEN 1 ELSE app_limits.count+1 END, expires_at=CASE WHEN app_limits.expires_at < NOW() THEN EXCLUDED.expires_at ELSE app_limits.expires_at END RETURNING count`,
    [key, seconds],
  );
  assert(row.count <= max, 429, "操作过于频繁，请稍后再试", "RATE_LIMIT");
}
export async function audit(db, actor, action, target, before, after, reason) {
  assert(
    typeof reason === "string" &&
      reason.trim().length >= 2 &&
      reason.length <= 500,
    400,
    "请填写操作原因",
  );
  await query(
    db,
    "INSERT INTO audit_events(id,actor_id,actor_email,action,target,before_value,after_value,reason) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)",
    [
      randomUUID(),
      actor.id,
      actor.email,
      action,
      target,
      JSON.stringify(before ?? null),
      JSON.stringify(after ?? null),
      reason.trim(),
    ],
  );
}
export function publicAddress(address) {
  try {
    return ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function validateModelDestination(baseUrl, hosts) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new HttpError(400, "模型地址无效");
  }
  assert(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!url.port || url.port === "443") &&
      !isIP(url.hostname.replace(/^\[|\]$/g, "")) &&
      hosts.includes(url.hostname.toLowerCase()),
    400,
    "云端模型仅支持部署配置中允许的 HTTPS 域名，不能访问 localhost 或内网地址",
    "DESTINATION_BLOCKED",
  );
  return url.href.replace(/\/+$/, "");
}
export async function modelDispatcher(baseUrl, hosts, resolve = lookup) {
  const url = new URL(validateModelDestination(baseUrl, hosts));
  const addresses = await resolve(url.hostname, { all: true, verbatim: true });
  assert(
    addresses.length && addresses.every((item) => publicAddress(item.address)),
    400,
    "模型域名解析到禁止访问的地址",
    "DESTINATION_BLOCKED",
  );
  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        const candidates = addresses.filter(
          (item) => !options.family || item.family === options.family,
        );
        if (!candidates.length) return callback(new Error("No public address"));
        if (options.all) callback(null, candidates);
        else callback(null, candidates[0].address, candidates[0].family);
      },
    },
  });
}
