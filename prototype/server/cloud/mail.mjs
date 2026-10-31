import nodemailer from "nodemailer";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { one, query } from "./database.mjs";
import {
  assert,
  audit,
  encryptSecret,
  decryptSecret,
  publicAddress,
  HttpError,
} from "./security.mjs";

const identity = (data) =>
  "smtp:" + JSON.stringify([data.host, data.port, data.username]);
const empty = {
  enabled: false,
  host: "",
  port: 587,
  username: "",
  fromAddress: "",
  fromName: "履历",
};
const addressPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
function normalize(body) {
  const data = {
    enabled: body.enabled === true,
    host: String(body.host || "")
      .trim()
      .toLowerCase(),
    port: Number(body.port),
    username: String(body.username || "").trim(),
    fromAddress: String(body.fromAddress || "").trim(),
    fromName: String(body.fromName || "履历").trim(),
  };
  assert(
    data.host.length <= 253 &&
      /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+$/.test(data.host) &&
      !isIP(data.host),
    400,
    "请填写邮件服务商的 SMTP 域名。",
  );
  assert(
    [465, 587].includes(data.port),
    400,
    "请选择 TLS 465 或 STARTTLS 587 端口。",
  );
  assert(
    data.username.length > 0 &&
      data.username.length <= 320 &&
      !/[\r\n]/.test(data.username),
    400,
    "请填写 SMTP 登录账号。",
  );
  assert(
    data.fromAddress.length <= 320 && addressPattern.test(data.fromAddress),
    400,
    "发件邮箱格式不正确。",
  );
  assert(
    data.fromName.length <= 80 && !/[\r\n]/.test(data.fromName),
    400,
    "发件人名称格式不正确。",
  );
  return data;
}
export async function smtpTarget(host, resolver = lookup) {
  const addresses = await resolver(host, { all: true, verbatim: true });
  assert(
    addresses.length &&
      addresses.every(({ address }) => publicAddress(address)),
    400,
    "邮件服务器不能指向本机、内网或保留地址。",
    "DESTINATION_BLOCKED",
  );
  return addresses.find((item) => item.family === 4) || addresses[0];
}
export function createMailService(db, config) {
  async function stored() {
    const row = await one(
      db,
      "SELECT * FROM platform_settings WHERE key='smtp'",
    );
    if (row) return { ...row, source: "admin" };
    if (config.smtp) {
      const from = String(config.mailFrom || ""),
        match = from.match(/^(.*?)<([^<>]+)>$/);
      return {
        data: {
          enabled: true,
          host: config.smtp.host,
          port: config.smtp.port,
          username: config.smtp.auth?.user || "",
          fromAddress: match ? match[2].trim() : from,
          fromName: match ? match[1].trim() : "履历",
        },
        revision: 0,
        source: "environment",
        password: config.smtp.auth?.pass || "",
      };
    }
    return { data: empty, secret: "", revision: 0, source: "unconfigured" };
  }
  function safe(row) {
    return {
      ...row.data,
      revision: row.revision,
      source: row.source,
      passwordConfigured: !!(row.secret || row.password),
      updatedAt: row.updated_at || null,
    };
  }
  function password(row) {
    return row.secret
      ? decryptSecret(row.secret, config.credentialKey, identity(row.data))
      : row.password || "";
  }
  async function transport(row) {
    const target = await smtpTarget(row.data.host, config.smtpLookup || lookup);
    const options = {
      host: target.address,
      port: row.data.port,
      secure: row.data.port === 465,
      requireTLS: true,
      auth: { user: row.data.username, pass: password(row) },
      tls: {
        servername: row.data.host,
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    };
    return config.mailTransport
      ? config.mailTransport(options)
      : nodemailer.createTransport(options);
  }
  async function run(row, action) {
    assert(row.data.host && password(row), 400, "请先保存完整的邮件服务配置。");
    let mailer;
    try {
      mailer = await transport(row);
      return await action(mailer);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        400,
        error.code === "EAUTH"
          ? "邮件服务认证失败，请检查登录账号与授权码。"
          : "无法连接邮件服务，请检查服务器地址、端口和加密方式。",
        "SMTP_FAILED",
      );
    } finally {
      mailer?.close();
    }
  }
  return {
    async status() {
      const row = await stored();
      const ready = !!(
        row.data.enabled &&
        row.data.host &&
        (row.secret || row.password)
      );
      return {
        mailReady: ready || !!config.deliverOTP || !config.production,
        mailMode: ready
          ? "smtp"
          : config.production
            ? "unconfigured"
            : "local-mailbox",
      };
    },
    async get() {
      return safe(await stored());
    },
    async save(body, actor) {
      const data = normalize(body);
      assert(
        body.password === undefined ||
          (typeof body.password === "string" && body.password.length <= 4000),
        400,
        "邮件授权码格式无效。",
      );
      await smtpTarget(data.host, config.smtpLookup || lookup);
      const prior = await stored();
      return db.transaction().execute(async (tx) => {
        await query(
          tx,
          "INSERT INTO platform_settings(key,data,secret) VALUES('smtp',$1::jsonb,'') ON CONFLICT DO NOTHING",
          [JSON.stringify(empty)],
        );
        const current = await one(
          tx,
          "SELECT * FROM platform_settings WHERE key='smtp' FOR UPDATE",
        );
        assert(
          Number(body.revision) === current.revision,
          409,
          "邮件设置已被其他页面更新，请刷新后重试。",
          "SETTINGS_CONFLICT",
        );
        const old = current.revision === 0 ? prior : current;
        assert(
          body.password || identity(data) === identity(old.data),
          400,
          "更换服务器、端口或登录账号时，请重新填写授权码。",
        );
        const credential = body.password || password(old);
        assert(credential, 400, "请填写 SMTP 密码或授权码。");
        const secret = encryptSecret(
          credential,
          config.credentialKey,
          identity(data),
        );
        await audit(
          tx,
          actor,
          "mail.save",
          "smtp",
          safe(old),
          {
            ...data,
            passwordConfigured: true,
            passwordChanged: !!body.password,
          },
          body.reason,
        );
        await query(
          tx,
          "UPDATE platform_settings SET data=$1::jsonb,secret=$2,revision=revision+1,updated_at=NOW() WHERE key='smtp'",
          [JSON.stringify(data), secret],
        );
        return safe({
          data,
          secret,
          revision: current.revision + 1,
          source: "admin",
          updated_at: new Date().toISOString(),
        });
      });
    },
    async verify(actor) {
      const row = await stored();
      await run(row, (mailer) => mailer.verify());
      await audit(
        db,
        actor,
        "mail.verify",
        "smtp",
        null,
        { verified: true },
        "管理员验证已保存的 SMTP 连接",
      );
      return { ok: true };
    },
    async test(actor) {
      const row = await stored();
      await run(row, (mailer) =>
        mailer.sendMail({
          from: { name: row.data.fromName, address: row.data.fromAddress },
          to: actor.email,
          subject: "履历 · 邮件服务测试",
          text: "这是一封由你在履历管理后台发起的测试邮件。邮件服务已完成发送。",
        }),
      );
      await audit(
        db,
        actor,
        "mail.test",
        "smtp",
        null,
        { recipient: actor.email },
        "管理员向自己的账号邮箱发送测试邮件",
      );
      return { ok: true, recipient: actor.email };
    },
    async sendOTP({ email, otp }) {
      const row = await stored();
      if (!row.data.enabled) return false;
      await run(row, (mailer) =>
        mailer.sendMail({
          from: { name: row.data.fromName, address: row.data.fromAddress },
          to: email,
          subject: "履历 · 邮箱验证码",
          text: `你的验证码是 ${otp}，5 分钟内有效。若非本人操作，请忽略。`,
        }),
      );
      return true;
    },
  };
}
