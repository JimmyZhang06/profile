import { randomUUID } from "node:crypto";
import { one, query } from "./database.mjs";
import { assert, audit } from "./security.mjs";
import { safeConnection, saveConnection } from "./models.mjs";
import {
  resumeTemplates,
  templateDesign,
  validResumeDesign,
} from "../../src/lib/resumeDesign.js";

export async function seedTemplates(db) {
  for (const template of resumeTemplates) {
    const id = "builtin-" + template.id;
    await query(
      db,
      "INSERT INTO template_releases(id,version,name,description,design,state,published_at) VALUES($1,1,$2,$3,$4::jsonb,'published',NOW()) ON CONFLICT DO NOTHING",
      [
        id,
        template.name,
        template.description,
        JSON.stringify(templateDesign(template.id)),
      ],
    );
    await query(
      db,
      "INSERT INTO template_catalog(id,published_version) VALUES($1,1) ON CONFLICT DO NOTHING",
      [id],
    );
  }
}
export function publicTemplates(db) {
  return query(
    db,
    "SELECT r.id,r.version,r.name,r.description,r.design,r.published_at FROM template_catalog c JOIN template_releases r ON r.id=c.id AND r.version=c.published_version WHERE c.enabled=TRUE ORDER BY r.name",
  );
}
export async function adminRoute({
  db,
  config,
  actor,
  path,
  method,
  body,
  url,
}) {
  const reason = body.reason,
    offset = Math.max(
      0,
      Math.min(100000, Number(url.searchParams.get("offset")) || 0),
    );
  if (path === "/overview" && method === "GET")
    return {
      counts: await one(
        db,
        `SELECT (SELECT COUNT(*)::int FROM account_access) AS users,(SELECT COUNT(*)::int FROM account_access WHERE last_active>NOW()-INTERVAL '7 days') AS active_users,(SELECT COUNT(*)::int FROM invitations WHERE status='pending' AND expires_at>NOW()) AS invitations,(SELECT COUNT(*)::int FROM model_usage WHERE started_at>=date_trunc('month',NOW())) AS calls,(SELECT COUNT(*)::int FROM model_usage WHERE started_at>=date_trunc('month',NOW()) AND status='succeeded') AS succeeded,(SELECT COUNT(*)::int FROM model_usage WHERE started_at>=date_trunc('month',NOW()) AND status='failed') AS failed`,
      ),
      issues: await query(
        db,
        "SELECT id,model_name,error_type,started_at FROM model_usage WHERE status='failed' ORDER BY started_at DESC LIMIT 8",
      ),
      mailConfigured: !!config.smtp,
      database: config.databaseUrl ? "PostgreSQL" : "本机开发数据库",
      allowedModelHosts: config.allowedModelHosts,
    };
  if (path === "/users" && method === "GET")
    return {
      items: await query(
        db,
        'SELECT u.id,u.email,u.name,u."createdAt" AS created_at,a.role,a.status,a.monthly_limit,a.last_active,(SELECT COUNT(*)::int FROM model_usage m WHERE m.user_id=u.id AND m.started_at>=date_trunc(\'month\',NOW())) AS used FROM "user" u JOIN account_access a ON a.user_id=u.id WHERE u.email ILIKE $1 AND ($2=\'\' OR a.status=$2) ORDER BY u."createdAt" DESC LIMIT 50 OFFSET $3',
        [
          "%" + (url.searchParams.get("q") || "").slice(0, 100) + "%",
          url.searchParams.get("status") || "",
          offset,
        ],
      ),
    };
  if (path.startsWith("/users/")) {
    const id = decodeURIComponent(path.slice(7));
    const target = await one(
      db,
      'SELECT u.id,u.email,u.name,a.role,a.status,a.monthly_limit,a.last_active FROM "user" u JOIN account_access a ON a.user_id=u.id WHERE u.id=$1',
      [id],
    );
    assert(target, 404, "用户不存在");
    if (method === "GET")
      return {
        user: target,
        sessionCount: (
          await one(
            db,
            'SELECT COUNT(*)::int AS count FROM session WHERE "userId"=$1 AND "expiresAt">NOW()',
            [id],
          )
        ).count,
      };
    if (method === "POST")
      return db.transaction().execute(async (tx) => {
        if (body.action === "revoke-sessions") {
          await audit(
            tx,
            actor.user,
            "user.revoke-sessions",
            id,
            null,
            { revoked: true },
            reason,
          );
          await query(tx, 'DELETE FROM session WHERE "userId"=$1', [id]);
          return { ok: true };
        }
        assert(
          ["active", "disabled"].includes(body.status) &&
            Number.isInteger(body.monthlyLimit) &&
            body.monthlyLimit >= 0 &&
            body.monthlyLimit <= 1000000,
          400,
          "账号状态或额度无效",
        );
        assert(
          !(id === actor.user.id && body.status === "disabled"),
          400,
          "不能停用当前管理员",
        );
        const after = { status: body.status, monthlyLimit: body.monthlyLimit };
        await audit(
          tx,
          actor.user,
          "user.update",
          id,
          { status: target.status, monthlyLimit: target.monthly_limit },
          after,
          reason,
        );
        await query(
          tx,
          "UPDATE account_access SET status=$2,monthly_limit=$3 WHERE user_id=$1",
          [id, body.status, body.monthlyLimit],
        );
        if (body.status === "disabled")
          await query(tx, 'DELETE FROM session WHERE "userId"=$1', [id]);
        return { ok: true };
      });
  }
  if (path === "/invitations" && method === "GET")
    return {
      items: await query(
        db,
        "SELECT email,status,expires_at,created_at FROM invitations ORDER BY created_at DESC LIMIT 50 OFFSET $1",
        [offset],
      ),
    };
  if (path === "/invitations" && method === "POST")
    return db.transaction().execute(async (tx) => {
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      assert(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254,
        400,
        "请输入有效邮箱",
      );
      const before = await one(
        tx,
        "SELECT email,status,expires_at FROM invitations WHERE email=$1",
        [email],
      );
      const status = body.action === "revoke" ? "revoked" : "pending";
      assert(
        !(await one(tx, 'SELECT id FROM "user" WHERE email=$1', [email])),
        400,
        "该邮箱已有账号，请到用户详情管理",
      );
      await audit(
        tx,
        actor.user,
        "invitation." + status,
        email,
        before,
        { status },
        reason,
      );
      await query(
        tx,
        "INSERT INTO invitations(email,status,expires_at,created_by) VALUES($1,$2,NOW()+INTERVAL '7 days',$3) ON CONFLICT(email) DO UPDATE SET status=EXCLUDED.status,expires_at=EXCLUDED.expires_at,created_by=EXCLUDED.created_by",
        [email, status, actor.user.id],
      );
      return { ok: true };
    });
  if (path === "/models" && method === "GET")
    return {
      items: (
        await query(
          db,
          "SELECT * FROM model_connections WHERE scope='platform' ORDER BY id",
        )
      ).map(safeConnection),
      allowedHosts: config.allowedModelHosts,
    };
  if (path === "/models" && method === "POST")
    return db.transaction().execute(async (tx) => {
      const previous = body.id
        ? await one(
            tx,
            "SELECT * FROM model_connections WHERE owner_id='platform' AND id=$1",
            [body.id],
          )
        : null;
      const next = await saveConnection(tx, "platform", body, config, true);
      await audit(
        tx,
        actor.user,
        "model.save",
        next.id,
        previous ? safeConnection(previous) : null,
        next,
        reason,
      );
      return next;
    });
  if (path === "/templates" && method === "GET")
    return {
      items: await query(
        db,
        "SELECT r.*,c.published_version,c.enabled FROM template_releases r LEFT JOIN template_catalog c ON c.id=r.id ORDER BY r.created_at DESC LIMIT 100",
      ),
    };
  if (path === "/templates" && method === "POST")
    return db.transaction().execute(async (tx) => {
      const id = body.id || randomUUID();
      assert(
        typeof id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(id),
        400,
        "模板编号无效",
      );
      await query(
        tx,
        "INSERT INTO template_catalog(id) VALUES($1) ON CONFLICT DO NOTHING",
        [id],
      );
      const catalog = await one(
        tx,
        "SELECT * FROM template_catalog WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (body.action === "publish") {
        const release = await one(
          tx,
          "SELECT * FROM template_releases WHERE id=$1 AND version=$2",
          [id, body.version],
        );
        assert(release, 404, "模板版本不存在");
        await audit(
          tx,
          actor.user,
          "template.publish",
          id,
          catalog,
          { version: release.version, enabled: true },
          reason,
        );
        await query(
          tx,
          "UPDATE template_releases SET state='published',published_at=COALESCE(published_at,NOW()) WHERE id=$1 AND version=$2",
          [id, release.version],
        );
        await query(
          tx,
          "UPDATE template_catalog SET published_version=$2,enabled=TRUE WHERE id=$1",
          [id, release.version],
        );
        return { ok: true };
      }
      if (body.action === "retire") {
        await audit(
          tx,
          actor.user,
          "template.retire",
          id,
          catalog,
          { enabled: false },
          reason,
        );
        await query(
          tx,
          "UPDATE template_catalog SET enabled=FALSE WHERE id=$1",
          [id],
        );
        return { ok: true };
      }
      assert(
        validResumeDesign(body.design) &&
          typeof body.name === "string" &&
          body.name.trim() &&
          body.name.length <= 80 &&
          typeof body.description === "string" &&
          body.description.length <= 200,
        400,
        "模板名称或排版参数无效",
      );
      const version = (
        await one(
          tx,
          "SELECT COALESCE(MAX(version),0)::int+1 AS next FROM template_releases WHERE id=$1",
          [id],
        )
      ).next;
      await query(
        tx,
        "INSERT INTO template_releases(id,version,name,description,design,state) VALUES($1,$2,$3,$4,$5::jsonb,'draft')",
        [
          id,
          version,
          body.name.trim(),
          body.description,
          JSON.stringify(body.design),
        ],
      );
      await audit(
        tx,
        actor.user,
        "template.draft",
        id,
        null,
        { version, name: body.name, design: body.design },
        reason,
      );
      return { id, version };
    });
  if (path === "/usage" && method === "GET")
    return {
      items: await query(
        db,
        "SELECT m.id,u.email,m.model_name,m.source,m.status,m.duration_ms,m.input_tokens,m.output_tokens,m.error_type,m.started_at FROM model_usage m LEFT JOIN \"user\" u ON u.id=m.user_id WHERE ($1='' OR m.status=$1) ORDER BY m.started_at DESC LIMIT 50 OFFSET $2",
        [url.searchParams.get("status") || "", offset],
      ),
    };
  if (path === "/audit" && method === "GET")
    return {
      items: await query(
        db,
        "SELECT id,actor_email,action,target,before_value,after_value,reason,created_at FROM audit_events ORDER BY created_at DESC LIMIT 50 OFFSET $1",
        [offset],
      ),
    };
  assert(false, 404, "管理接口不存在");
}
