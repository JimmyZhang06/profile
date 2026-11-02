import { randomUUID } from "node:crypto";
import { fetch } from "undici";
import { query, one } from "./database.mjs";
import {
  assert,
  encryptSecret,
  decryptSecret,
  validateModelDestination,
  modelDispatcher,
  HttpError,
  audit,
} from "./security.mjs";
import { readModelDomains } from "./model-domains.mjs";
import { restrictMaterialContext } from "../../src/lib/materialScope.js";
import { systemPrompt } from "../ai.mjs";
import { deliveryPrompt } from "../delivery-prompt.mjs";

export function safeConnection(row) {
  return {
    ...row.data,
    id: row.id,
    source: row.scope,
    enabled: row.enabled,
    monthlyLimit: row.monthly_limit,
    keyMask: row.secret ? "••••••••" : "",
    credentialStored: !!row.secret,
  };
}
export async function listConnections(db, owner) {
  return (
    await query(
      db,
      "SELECT * FROM model_connections WHERE (owner_id=$1 AND scope='user') OR (scope='platform' AND enabled=TRUE) ORDER BY scope,id",
      [owner],
    )
  ).map(safeConnection);
}
export async function saveConnection(
  db,
  owner,
  input,
  config,
  platform = false,
) {
  const id = input.id || (platform ? "platform:" : "") + randomUUID();
  assert(
    typeof id === "string" &&
      id.length <= 100 &&
      (platform ? id.startsWith("platform:") : !id.startsWith("platform:")),
    400,
    "连接编号无效",
  );
  assert(
    typeof input.name === "string" &&
      input.name.trim() &&
      input.name.length <= 100 &&
      typeof input.model === "string" &&
      input.model.trim() &&
      input.model.length <= 150,
    400,
    "请填写连接名称与模型 ID",
  );
  const baseUrl = validateModelDestination(
      input.baseUrl,
      (await readModelDomains(db, config)).hosts,
    ),
    previous = await one(
      db,
      "SELECT * FROM model_connections WHERE owner_id=$1 AND id=$2",
      [owner, id],
    );
  const maxOutputTokens = Math.min(
    16384,
    Math.max(256, Number(input.maxOutputTokens ?? previous?.data.maxOutputTokens) || 8192),
  );
  const data = {
    name: input.name.trim(),
    model: input.model.trim(),
    baseUrl,
    adapter: "compatible",
    capabilities: ["rewrite"],
    maxOutputTokens,
  };
  const key = String(input.apiKey || "");
  assert(key.length <= 8192, 400, "凭据过长");
  const secret = key
    ? encryptSecret(key, config.credentialKey, owner + ":" + id)
    : previous?.data.baseUrl === baseUrl
      ? previous.secret
      : "";
  assert(secret, 400, "请提供 API Key；更换服务地址后需重新填写。");
  const monthlyLimit = Number(
    input.monthlyLimit ?? previous?.monthly_limit ?? 1000,
  );
  assert(
    Number.isInteger(monthlyLimit) &&
      monthlyLimit >= 0 &&
      monthlyLimit <= 1000000,
    400,
    "调用上限无效",
  );
  const row = await one(
    db,
    "INSERT INTO model_connections(id,scope,owner_id,data,secret,enabled,monthly_limit) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7) ON CONFLICT(owner_id,id) DO UPDATE SET data=EXCLUDED.data,secret=EXCLUDED.secret,enabled=EXCLUDED.enabled,monthly_limit=EXCLUDED.monthly_limit RETURNING *",
    [
      id,
      platform ? "platform" : "user",
      owner,
      JSON.stringify(data),
      secret,
      input.enabled !== false,
      monthlyLimit,
    ],
  );
  return safeConnection(row);
}
const adapters = new Map();
export function registerCloudAdapter(name, adapter) {
  adapters.set(name, adapter);
}
registerCloudAdapter(
  "compatible",
  async ({ connection, messages, signal, dispatcher, testing }) =>
    fetch(connection.baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + connection.apiKey,
      },
      body: JSON.stringify({
        model: connection.model,
        messages,
        stream: !testing,
        max_tokens: connection.maxOutputTokens,
        ...(!testing ? { stream_options: { include_usage: true } } : {}),
      }),
      signal,
      dispatcher,
      redirect: "error",
    }),
);
export async function streamModel(
  req,
  res,
  body,
  actor,
  db,
  config,
  { testing = false, platformTest = false, dispatcherFactory = modelDispatcher } = {},
) {
  assert(!platformTest || (testing && actor.access.role === "admin"), 403, "需要管理员权限");
  const connection = await one(
    db,
    "SELECT * FROM model_connections WHERE id=$1 AND ((owner_id=$2 AND scope='user') OR scope='platform')",
    [body.connectionId, actor.user.id],
  );
  assert(platformTest ? connection?.scope === "platform" : connection?.enabled, 404, "模型连接不存在或已停用");
  const allowedHosts = (await readModelDomains(db, config)).hosts;
  validateModelDestination(connection.data.baseUrl, allowedHosts);
  const safe = safeConnection(connection);
  let context;
  try {
    if (!testing)
      context = restrictMaterialContext(
        body.context,
        body.materialApproval,
        safe,
      );
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  const id = randomUUID(),
    started = Date.now();
  await db.transaction().execute(async (tx) => {
    const access = await one(
      tx,
      "SELECT * FROM account_access WHERE user_id=$1 FOR UPDATE",
      [actor.user.id],
    );
    assert(access?.status === "active", 403, "账号不可用");
    const used = await one(
      tx,
      "SELECT COUNT(*)::int AS count FROM model_usage WHERE user_id=$1 AND started_at>=date_trunc('month',NOW())",
      [actor.user.id],
    );
    assert(
      used.count < access.monthly_limit,
      429,
      "本月 AI 调用额度已用完",
      "QUOTA_EXCEEDED",
    );
    const inflight = await one(
      tx,
      "SELECT COUNT(*)::int AS count FROM model_usage WHERE user_id=$1 AND status='started' AND started_at>NOW()-INTERVAL '150 seconds'",
      [actor.user.id],
    );
    assert(inflight.count < 2, 429, "已有请求正在处理，请稍后再试");
    if (connection.scope === "platform") {
      const model = await one(
        tx,
        "SELECT * FROM model_connections WHERE owner_id=$1 AND id=$2 FOR UPDATE",
        [connection.owner_id, connection.id],
      );
      const total = await one(
        tx,
        "SELECT COUNT(*)::int AS count FROM model_usage WHERE model_id=$1 AND source='platform' AND started_at>=date_trunc('month',NOW())",
        [connection.id],
      );
      assert(
        (model.enabled || platformTest) && total.count < model.monthly_limit,
        429,
        "平台模型已达到本月调用上限",
      );
    }
    await query(
      tx,
      "INSERT INTO model_usage(id,user_id,model_id,model_name,source,status) VALUES($1,$2,$3,$4,$5,$6)",
      [
        id,
        actor.user.id,
        connection.id,
        connection.data.model,
        connection.scope,
        "started",
      ],
    );
  });
  const controller = new AbortController(),
    cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
  res.on("close", cancel);
  const timer = setTimeout(() => controller.abort(), testing ? 20000 : 120000);
  let dispatcher,
    status = "failed",
    errorType = "CONNECTION_ERROR",
    usage = {};
  try {
    dispatcher = await dispatcherFactory(
      connection.data.baseUrl,
      allowedHosts,
    );
    const messages = testing
      ? [{ role: "user", content: "Reply with OK." }]
      : [
          { role: "system", content: body.purpose === "delivery" ? deliveryPrompt : systemPrompt },
          {
            role: "user",
            content: "以下是当前资料：\n" + JSON.stringify(context),
          },
          ...(body.purpose !== "delivery" && Array.isArray(body.history)
            ? body.history
                .slice(-10)
                .filter(
                  (m) =>
                    ["user", "assistant"].includes(m.role) &&
                    typeof m.content === "string",
                )
                .map((m) => ({
                  role: m.role,
                  content: m.content.slice(0, 8000),
                }))
            : []),
          { role: "user", content: String(body.prompt || "").slice(0, 12000) },
        ];
    const response = await adapters.get(
      connection.data.adapter || "compatible",
    )({
      connection: {
        ...connection.data,
        ...(testing ? { maxOutputTokens: 64 } : {}),
        apiKey: decryptSecret(
          connection.secret,
          config.credentialKey,
          connection.owner_id + ":" + connection.id,
        ),
      },
      messages,
      signal: controller.signal,
      dispatcher,
      testing,
    });
    if (!response.ok) {
      await response.body?.cancel();
      errorType = "PROVIDER_" + response.status;
      throw new HttpError(
        502,
        response.status === 429 ? "模型服务限流或额度不足，请稍后重试。"
          : [401, 403].includes(response.status) ? "模型服务拒绝认证，请检查 API Key 和模型访问权限。"
          : response.status === 404 ? "未找到模型接口，请检查 API 地址的路径与模型 ID。"
          : "模型连接失败，请检查服务和凭据。",
        errorType,
      );
    }
    if (testing) {
      const data = await response.json();
      assert(typeof data.choices?.[0]?.message?.content === "string" && data.choices[0].message.content.trim(),
        502, "服务未返回有效的模型回复，请检查模型 ID 与接口兼容性。", "INVALID_MODEL_RESPONSE");
      usage = data.usage || {};
      status = "succeeded";
      errorType = null;
      return { ok: true, model: connection.data.model, durationMs: Date.now() - started };
    }
    assert(
      response.headers.get("content-type")?.includes("text/event-stream"),
      502,
      "模型未返回兼容的流式响应",
    );
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    });
    let buffer = "",
      ended = false,
      providerError = false;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      if (controller.signal.aborted) break;
      res.write(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith("data:")) {
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") ended = true;
          else
            try {
              const event = JSON.parse(raw);
              if (event.usage) usage = event.usage;
              if (event.error) providerError = true;
            } catch {
              /* Ignore extension events; the client validates response completion. */
            }
        }
      }
      if (buffer.length > 1_000_000) throw new Error("Invalid stream");
    }
    status =
      ended && !providerError && !controller.signal.aborted
        ? "succeeded"
        : controller.signal.aborted
          ? "cancelled"
          : "failed";
    errorType =
      status === "succeeded"
        ? null
        : providerError
          ? "PROVIDER_STREAM_ERROR"
          : "STREAM_INTERRUPTED";
    res.end();
  } catch (error) {
    if (controller.signal.aborted) {
      status = "cancelled";
      errorType = "CANCELLED";
      if (testing && !res.destroyed) throw new HttpError(504, "模型测试超时，请稍后重试。", "MODEL_TEST_TIMEOUT");
    }
    else if (error.code) errorType = error.code;
    if (res.headersSent) res.end();
    else
      throw error instanceof HttpError
        ? error
        : new HttpError(502, "模型连接未完成，请稍后重试。");
  } finally {
    clearTimeout(timer);
    res.off("close", cancel);
    await dispatcher?.close();
    await query(
      db,
      "UPDATE model_usage SET status=$2,duration_ms=$3,input_tokens=$4,output_tokens=$5,error_type=$6 WHERE id=$1",
      [
        id,
        status,
        Date.now() - started,
        Number.isInteger(usage.prompt_tokens) ? usage.prompt_tokens : null,
        Number.isInteger(usage.completion_tokens)
          ? usage.completion_tokens
          : null,
        errorType,
      ],
    );
    if (platformTest) await audit(db, actor.user, "model.test", connection.id, null,
      { status, errorType, model: connection.data.model, durationMs: Date.now() - started }, "管理员主动测试平台模型连接");
  }
}
