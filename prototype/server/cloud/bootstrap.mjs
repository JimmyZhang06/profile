import { createHash, randomBytes } from "node:crypto";
import { one, query } from "./database.mjs";
import { assert, audit } from "./security.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
async function administratorExists(db) {
  return !!(await one(
    db,
    "SELECT user_id FROM account_access WHERE role='admin' LIMIT 1",
  ));
}
export async function bootstrapStatus(db) {
  if (await administratorExists(db))
    return { required: false, available: false };
  return {
    required: true,
    available: !!(await one(
      db,
      "SELECT id FROM admin_bootstrap WHERE id=1 AND consumed_at IS NULL AND expires_at>NOW()",
    )),
  };
}
export async function issueBootstrap(db) {
  assert(
    !(await administratorExists(db)),
    409,
    "管理员已初始化，不能重新签发初始化码。",
  );
  const token = randomBytes(32).toString("base64url");
  const row = await one(
    db,
    "INSERT INTO admin_bootstrap(id,token_hash,expires_at) VALUES(1,$1,NOW()+INTERVAL '24 hours') ON CONFLICT(id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,consumed_at=NULL RETURNING expires_at",
    [digest(token)],
  );
  return { token, expiresAt: row.expires_at };
}
export async function completeBootstrap(db, authentication, config, body) {
  assert(
    typeof body.token === "string" &&
      body.token.length >= 32 &&
      body.token.length <= 100,
    400,
    "初始化码无效或已失效。",
  );
  assert(
    typeof body.password === "string" &&
      body.password.length >= 12 &&
      body.password.length <= 128,
    400,
    "管理员密码需要 12 至 128 个字符。",
  );
  assert(
    String(body.email || "")
      .trim()
      .toLowerCase() === config.adminEmail,
    400,
    "请使用部署时指定的管理员邮箱。",
  );
  const hash = digest(body.token);
  assert(!(await administratorExists(db)), 409, "管理员已初始化，请直接登录。");
  const claimed = await one(
    db,
    "UPDATE admin_bootstrap SET consumed_at=NOW() WHERE id=1 AND token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() RETURNING id",
    [hash],
  );
  assert(claimed, 400, "初始化码无效或已失效。");
  try {
    const response = await authentication.bootstrapSignup({
      email: config.adminEmail,
      password: body.password,
      name: "管理员",
    });
    assert(response.ok, 400, "初始化未完成，请重新登录或联系部署维护者。");
    const user = await one(
      db,
      'SELECT id,email FROM "user" WHERE LOWER(email)=$1',
      [config.adminEmail],
    );
    await audit(
      db,
      user,
      "admin.initialize",
      user.id,
      null,
      { initialized: true },
      "通过一次性部署初始化码创建管理员",
    );
    return response;
  } catch (error) {
    // Do not reopen a consumed token if an account has already been created.
    if (!(await administratorExists(db)))
      await query(
        db,
        "UPDATE admin_bootstrap SET consumed_at=NULL WHERE id=1 AND token_hash=$1",
        [hash],
      );
    throw error;
  }
}
