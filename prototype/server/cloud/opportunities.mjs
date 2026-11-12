import { randomUUID, createHash } from "node:crypto";
import { one, query } from "./database.mjs";
import { assert, audit, limit } from "./security.mjs";
import { normalizeEvidence } from "./opportunityImage.mjs";

const fields = [
  "title",
  "company",
  "regionCode",
  "city",
  "remote",
  "direction",
  "jd",
  "requirements",
  "graduationYear",
  "graduationCondition",
  "daysPerWeek",
  "durationMonths",
  "arrival",
  "compensation",
  "sourceType",
  "application",
  "applicationNotes",
  "deadlineDate",
  "deadlineAt",
];
const text = (value, max = 200) => {
  assert(value == null || typeof value === "string", 400, "文本字段格式无效");
  assert((value || "").length <= max, 400, "文本超过长度限制");
  return (value || "").trim();
};
const https = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export function opportunityData(input = {}) {
  assert(
    input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      Object.keys(input).every((k) => fields.includes(k)),
    400,
    "存在不允许的公开字段",
  );
  const data = {};
  for (const key of ["title", "company", "city", "direction", "arrival"])
    data[key] = text(input[key], 150);
  data.jd = text(input.jd, 16000);
  data.requirements = text(input.requirements, 4000);
  data.applicationNotes = text(input.applicationNotes, 2000);
  data.regionCode = input.regionCode || "CN";
  assert(["CN", "HK"].includes(data.regionCode), 400, "地区无效");
  data.remote = input.remote === true;
  data.sourceType = input.sourceType || "official";
  assert(
    ["official", "community", "employee"].includes(data.sourceType),
    400,
    "来源类型无效",
  );
  for (const [key, max] of [
    ["graduationYear", 2100],
    ["daysPerWeek", 7],
    ["durationMonths", 36],
  ]) {
    data[key] =
      input[key] === undefined || input[key] === null || input[key] === ""
        ? null
        : input[key];
    assert(
      data[key] === null ||
        (Number.isInteger(data[key]) && data[key] >= 1 && data[key] <= max),
      400,
      "结构化要求无效",
    );
  }
  data.graduationCondition = input.graduationCondition || "unspecified";
  assert(
    ["required", "preferred", "unspecified"].includes(data.graduationCondition),
    400,
    "毕业要求无效",
  );
  data.compensation = null;
  if (input.compensation != null) {
    const c = input.compensation;
    assert(
      c &&
        Object.keys(c).every((k) =>
          ["currency", "unit", "min", "max"].includes(k),
        ) &&
        ["CNY", "HKD"].includes(c.currency) &&
        ["hour", "day", "month", "year"].includes(c.unit),
      400,
      "薪酬单位无效",
    );
    for (const k of ["min", "max"])
      assert(
        c[k] == null ||
          (typeof c[k] === "number" &&
            Number.isFinite(c[k]) &&
            c[k] >= 0 &&
            c[k] <= 1e9),
        400,
        "薪酬金额无效",
      );
    assert(
      c.min == null || c.max == null || c.min <= c.max,
      400,
      "薪酬区间无效",
    );
    data.compensation = {
      currency: c.currency,
      unit: c.unit,
      min: c.min ?? null,
      max: c.max ?? null,
    };
  }
  data.application = null;
  if (input.application) {
    const a = input.application;
    assert(
      Object.keys(a).every((k) => ["type", "value"].includes(k)) &&
        ["url", "email"].includes(a.type),
      400,
      "投递渠道无效",
    );
    const value = text(a.value, 1000);
    assert(
      a.type === "url"
        ? https(value)
        : /^[^\s@<>?]+@[^\s@<>?]+\.[^\s@<>?]+$/.test(value) &&
            value.length <= 254,
      400,
      "请填写 HTTPS 官网地址或有效投递邮箱",
    );
    data.application = { type: a.type, value };
  }
  data.deadlineDate = text(input.deadlineDate, 10) || null;
  data.deadlineAt = text(input.deadlineAt, 40) || null;
  if (data.deadlineDate) {
    assert(
      /^\d{4}-\d{2}-\d{2}$/.test(data.deadlineDate) &&
        Number.isFinite(Date.parse(data.deadlineDate)) &&
        new Date(data.deadlineDate).toISOString().slice(0, 10) ===
          data.deadlineDate,
      400,
      "截止日期无效",
    );
    // CN and HK both use UTC+08. End exclusively at local next midnight.
    const boundary = new Date(
      Date.parse(data.deadlineDate + "T00:00:00+08:00") + 86400000,
    ).toISOString();
    assert(
      !data.deadlineAt || data.deadlineAt === boundary,
      400,
      "截止日期与时刻不一致",
    );
    data.deadlineAt = boundary;
  } else if (data.deadlineAt) {
    assert(
      /(?:Z|[+-]\d{2}:\d{2})$/.test(data.deadlineAt) &&
        Number.isFinite(Date.parse(data.deadlineAt)),
      400,
      "截止时刻必须带时区",
    );
    data.deadlineAt = new Date(data.deadlineAt).toISOString();
  }
  return data;
}
function sourceData(value = {}) {
  assert(
    value &&
      typeof value === "object" &&
      Object.keys(value).every((k) =>
        ["url", "description", "date", "permission"].includes(k),
      ),
    400,
    "来源字段无效",
  );
  const source = Object.fromEntries(
    ["url", "description", "date", "permission"].map((k) => [
      k,
      text(value[k], k === "date" ? 40 : 2000),
    ]),
  );
  assert(!source.url || https(source.url), 400, "来源链接须为 HTTPS");
  return source;
}
function ready(data, source) {
  assert(
    data.title &&
      data.company &&
      (data.city || data.remote) &&
      data.jd.length >= 20 &&
      data.application,
    400,
    "请补全公司、岗位、地点、完整 JD 和投递渠道",
  );
  assert(source.url || source.description, 400, "请提供可核对的来源");
  assert(source.permission, 400, "请说明投递渠道可公开的依据");
  assert(
    !data.deadlineAt || Date.parse(data.deadlineAt) > Date.now(),
    400,
    "岗位已截止，请核对来源",
  );
}
export function publicOpportunity(row) {
  const data = row.data;
  const status =
    row.status === "open" &&
    data.deadlineAt &&
    Date.parse(data.deadlineAt) <= Date.now()
      ? "closed"
      : row.status;
  const summary = {
    id: row.id,
    version: row.version,
    status,
    title: data.title,
    company: data.company,
    regionCode: data.regionCode,
    city: data.city,
    remote: data.remote,
    direction: data.direction,
    sourceType: data.sourceType,
    verifiedAt: row.verified_at,
    deadlineDate: data.deadlineDate,
    deadlineAt: data.deadlineAt,
    publishedAt: row.published_at,
  };
  if (status !== "open") return { ...summary, compensation: null };
  return {
    ...summary,
    ...opportunityData({
      ...data,
      deadlineAt: data.deadlineDate ? undefined : data.deadlineAt,
    }),
  };
}
const releaseSql =
  "SELECT o.*,r.version,r.data,r.published_at FROM opportunities o JOIN opportunity_releases r ON r.opportunity_id=o.id AND r.version=o.published_version";
async function current(db, id) {
  const row = await one(db, releaseSql + " WHERE o.id=$1", [id]);
  assert(row, 404, "岗位不存在或尚未发布");
  return row;
}
const authorItem = ({ internal_note, ...row }) => row;
async function evidenceList(db, id) {
  return query(
    db,
    "SELECT id,media_type,bytes,digest,created_at FROM opportunity_evidence WHERE submission_id=$1 ORDER BY created_at,id",
    [id],
  );
}
async function owned(db, id, actor, admin = false) {
  const row = await one(
    db,
    "SELECT s.*,o.revision AS opportunity_revision,o.published_version,o.status AS opportunity_status FROM opportunity_submissions s JOIN opportunities o ON o.id=s.opportunity_id WHERE s.id=$1",
    [id],
  );
  assert(row && (admin || row.author_id === actor.user.id), 404, "投稿不存在");
  return row;
}
async function transaction(db, actor, body, target, run) {
  assert(
    typeof body.requestId === "string" &&
      /^[A-Za-z0-9_-]{8,100}$/.test(body.requestId),
    400,
    "缺少有效请求编号",
  );
  const fingerprint = hash(JSON.stringify(canonical({ target, body })));
  return db.transaction().execute(async (tx) => {
    const lockedAccess = await one(
      tx,
      "SELECT user_id,status FROM account_access WHERE user_id=$1 FOR UPDATE",
      [actor.user.id],
    );
    assert(lockedAccess?.status === "active", 403, "账号已停用");
    const receipt = await one(
      tx,
      "SELECT * FROM opportunity_receipts WHERE actor_id=$1 AND request_id=$2",
      [actor.user.id, body.requestId],
    );
    if (receipt) {
      assert(
        receipt.fingerprint === fingerprint,
        409,
        "请求编号已被其他操作使用",
      );
      return receipt.result;
    }
    const result = await run(tx);
    await query(
      tx,
      "INSERT INTO opportunity_receipts(actor_id,request_id,fingerprint,result) VALUES($1,$2,$3,$4::jsonb)",
      [actor.user.id, body.requestId, fingerprint, JSON.stringify(result)],
    );
    return result;
  });
}
async function lockSubmission(tx, id, actor, admin) {
  const before = await owned(tx, id, actor, admin);
  const opportunity = await one(
    tx,
    "SELECT * FROM opportunities WHERE id=$1 FOR UPDATE",
    [before.opportunity_id],
  );
  const submission = await owned(tx, id, actor, admin); // lock order: opportunity, then submission
  await one(
    tx,
    "SELECT id FROM opportunity_submissions WHERE id=$1 FOR UPDATE",
    [id],
  );
  return { submission, opportunity };
}
function revision(row, body) {
  assert(
    Number.isInteger(body.revision) && body.revision === row.revision,
    409,
    "内容已变化，请刷新后核对；本地文字仍保留",
  );
}

export async function opportunityRoute({
  db,
  config,
  actor,
  req,
  res,
  url,
  path,
  method,
  readBody,
}) {
  path = path.startsWith("/api/") ? path.slice(4) : path;
  res?.setHeader("Cache-Control", "no-store");
  const publicMatch =
    /^\/public\/opportunities(?:\/([^/]+)(?:\/(apply))?)?$/.exec(path);
  if (publicMatch) {
    assert(method === "GET", 404, "接口不存在");
    const [, id, action] = publicMatch;
    if (!id) {
      const q = (url.searchParams.get("q") || "").slice(0, 100),
        city = (url.searchParams.get("city") || "").slice(0, 100),
        direction = (url.searchParams.get("direction") || "").slice(0, 100);
      const offset = Math.min(
          100000,
          Math.max(0, Number(url.searchParams.get("offset")) || 0),
        ),
        size = 20;
      const where =
        " WHERE o.status='open' AND (r.data->>'deadlineAt' IS NULL OR (r.data->>'deadlineAt')::timestamptz>NOW()) AND ($1='' OR concat_ws(' ',r.data->>'title',r.data->>'company',r.data->>'jd') ILIKE $2) AND ($3='' OR r.data->>'city'=$3) AND ($4='' OR r.data->>'direction'=$4)";
      const rows = await query(
        db,
        releaseSql +
          where +
          " ORDER BY o.verified_at DESC,o.id LIMIT 21 OFFSET $5",
        [q, "%" + q + "%", city, direction, offset],
      );
      return {
        items: rows.slice(0, size).map(publicOpportunity),
        hasMore: rows.length > size,
        offset,
      };
    }
    let row = await current(db, id);
    const item = publicOpportunity(row);
    if (action) {
      assert(item.status === "open", 410, "岗位已暂停或截止，当前不可投递");
      assert(
        Number(url.searchParams.get("version")) === item.version,
        409,
        "岗位已更新，请重新查看详情",
      );
      return { application: item.application, version: item.version };
    }
    if (url.searchParams.has("version")) {
      const version = Number(url.searchParams.get("version"));
      const past = await one(
        db,
        "SELECT * FROM opportunity_releases WHERE opportunity_id=$1 AND version=$2",
        [id, version],
      );
      assert(past, 404, "公开版本不存在");
      row = { ...row, ...past, id, version, status: item.status };
      const historical = publicOpportunity(row);
      // Historical channels are never valid for applying to a current release.
      if (version !== item.version) {
        delete historical.application;
        historical.currentVersion = item.version;
      }
      return { item: historical };
    }
    return { item };
  }
  assert(actor?.user?.id, 401, "请先登录");
  const access = await one(
    db,
    "SELECT role,status FROM account_access WHERE user_id=$1",
    [actor.user.id],
  );
  assert(access?.status === "active", 403, "账号未获准或已停用");
  const admin = path.startsWith("/admin/");
  if (admin) assert(access.role === "admin", 403, "需要管理员权限");
  const body = ["GET", "HEAD"].includes(method) ? {} : await readBody(req);
  assert(
    body && typeof body === "object" && !Array.isArray(body),
    400,
    "请求字段格式无效",
  );
  const listPath = admin
    ? "/admin/opportunity-submissions"
    : "/cloud/opportunity-submissions";
  if (path === listPath && method === "GET") {
    const filter = url.searchParams.get("status") || "";
    return {
      items: await query(
        db,
        "SELECT s.id,s.opportunity_id,s.author_id,s.status,s.revision,s.base_version,s.created_at,s.submitted_at,s.feedback,s.data->>'title' AS title,s.data->>'company' AS company,o.revision AS opportunity_revision,o.published_version FROM opportunity_submissions s JOIN opportunities o ON o.id=s.opportunity_id WHERE ($1::boolean OR s.author_id=$2) AND ($3='' OR s.status=$3) ORDER BY s.created_at DESC,s.id LIMIT 100",
        [admin, actor.user.id, filter],
      ),
    };
  }
  if (path === listPath && method === "POST") {
    await limit(db, "opportunity-create:" + actor.user.id, 20, 3600);
    return transaction(db, actor, body, path, async (tx) => {
      const id = randomUUID(),
        opportunityId = body.opportunityId || randomUUID();
      if (body.opportunityId) {
        const o = await one(
          tx,
          "SELECT * FROM opportunities WHERE id=$1 FOR UPDATE",
          [opportunityId],
        );
        assert(
          o && (admin || o.owner_id === actor.user.id),
          404,
          "岗位不存在或无维护权限",
        );
        assert(
          !(await one(
            tx,
            "SELECT id FROM opportunity_submissions WHERE opportunity_id=$1 AND status IN ('draft','pending')",
            [opportunityId],
          )),
          409,
          "已有草稿或待审稿",
        );
      } else
        await query(
          tx,
          "INSERT INTO opportunities(id,owner_id) VALUES($1,$2)",
          [opportunityId, actor.user.id],
        );
      const o = await one(tx, "SELECT * FROM opportunities WHERE id=$1", [
        opportunityId,
      ]);
      const existing = o.published_version
        ? await current(tx, opportunityId)
        : null;
      const data = opportunityData(body.data || existing?.data || {}),
        source = sourceData(body.source);
      await query(
        tx,
        "INSERT INTO opportunity_submissions(id,opportunity_id,author_id,base_version,original_text,data,source) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)",
        [
          id,
          opportunityId,
          actor.user.id,
          o.published_version,
          text(body.originalText, 20000),
          JSON.stringify(data),
          JSON.stringify(source),
        ],
      );
      return { item: authorItem(await owned(tx, id, actor, admin)) };
    });
  }
  const match = new RegExp(
    "^" +
      listPath +
      "/([^/]+)(?:/(submit|withdraw|revise|review|evidence)(?:/([^/]+))?)?$",
  ).exec(path);
  if (match) {
    const [, id, action, evidenceId] = match;
    const before = await owned(db, id, actor, admin);
    if (!action && method === "GET") {
      const published = before.published_version
        ? publicOpportunity(await current(db, before.opportunity_id))
        : null;
      return {
        item: admin ? before : authorItem(before),
        evidence: await evidenceList(db, id),
        published,
      };
    }
    if (action === "evidence" && method === "GET") {
      assert(evidenceId, 404, "图片不存在");
      const evidence = await one(
        db,
        "SELECT media_type,image FROM opportunity_evidence WHERE id=$1 AND submission_id=$2",
        [evidenceId, id],
      );
      assert(evidence, 404, "图片不存在");
      res.writeHead(200, {
        "Content-Type": evidence.media_type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      });
      res.end(Buffer.from(evidence.image));
      return;
    }
    if (action === "evidence" && method === "POST") {
      assert(before.status === "draft", 409, "送审后不能再添加凭证");
      assert(
        typeof body.image === "string" &&
          /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.image),
        400,
        "请上传经浏览器处理的凭证图片",
      );
      const image = normalizeEvidence(
        Buffer.from(body.image.slice(22), "base64"),
      );
      return db.transaction().execute(async (tx) => {
        const { submission } = await lockSubmission(tx, id, actor, admin);
        assert(submission.status === "draft", 409, "送审后不能再添加凭证");
        assert(
          (await evidenceList(tx, id)).length < 3,
          400,
          "每稿最多 3 张图片",
        );
        const evidence = randomUUID();
        await query(
          tx,
          "INSERT INTO opportunity_evidence(id,submission_id,media_type,bytes,digest,image) VALUES($1,$2,'image/png',$3,$4,$5)",
          [evidence, id, image.length, hash(image), image],
        );
        await query(
          tx,
          "UPDATE opportunity_submissions SET revision=revision+1 WHERE id=$1",
          [id],
        );
        return {
          evidence: await evidenceList(tx, id),
          item: authorItem(await owned(tx, id, actor, admin)),
        };
      });
    }
    if (!action && method === "PUT")
      return db.transaction().execute(async (tx) => {
        const { submission } = await lockSubmission(tx, id, actor, admin);
        assert(submission.status === "draft", 409, "只有草稿可以编辑");
        revision(submission, body);
        const data = opportunityData(body.data),
          source = sourceData(body.source);
        await query(
          tx,
          "UPDATE opportunity_submissions SET data=$2::jsonb,source=$3::jsonb,original_text=$4,revision=revision+1 WHERE id=$1",
          [
            id,
            JSON.stringify(data),
            JSON.stringify(source),
            text(body.originalText, 20000),
          ],
        );
        return { item: authorItem(await owned(tx, id, actor, admin)) };
      });
    if (
      method === "POST" &&
      ["submit", "withdraw", "revise", "review"].includes(action)
    )
      return transaction(db, actor, body, path, async (tx) => {
        const { submission: s, opportunity: o } = await lockSubmission(
          tx,
          id,
          actor,
          admin,
        );
        revision(s, body);
        if (action === "revise") {
          assert(
            ["returned", "withdrawn", "rejected", "published"].includes(
              s.status,
            ),
            409,
            "当前稿件不能重提",
          );
          assert(
            !(await one(
              tx,
              "SELECT id FROM opportunity_submissions WHERE opportunity_id=$1 AND status IN ('draft','pending')",
              [o.id],
            )),
            409,
            "已有草稿或待审稿",
          );
          const next = randomUUID();
          await query(
            tx,
            "INSERT INTO opportunity_submissions(id,opportunity_id,author_id,base_version,previous_id,original_text,data,source) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)",
            [
              next,
              o.id,
              admin ? actor.user.id : s.author_id,
              o.published_version,
              id,
              s.original_text,
              JSON.stringify(s.data),
              JSON.stringify(s.source),
            ],
          );
          await query(
            tx,
            "INSERT INTO opportunity_evidence(id,submission_id,media_type,bytes,digest,image) SELECT $2||id,$3,media_type,bytes,digest,image FROM opportunity_evidence WHERE submission_id=$1",
            [id, randomUUID(), next],
          );
          return { item: authorItem(await owned(tx, next, actor, admin)) };
        }
        if (action === "submit") {
          assert(s.status === "draft", 409, "只有草稿可以送审");
          ready(s.data, s.source);
          assert(
            s.base_version === o.published_version,
            409,
            "当前公开版本已变化，请重新建立稿件",
          );
          await query(
            tx,
            "UPDATE opportunity_submissions SET status='pending',revision=revision+1,submitted_at=NOW() WHERE id=$1",
            [id],
          );
        } else if (action === "withdraw") {
          assert(s.status === "pending", 409, "当前稿件不能撤回");
          await query(
            tx,
            "UPDATE opportunity_submissions SET status='withdrawn',revision=revision+1 WHERE id=$1",
            [id],
          );
        } else {
          assert(admin, 403, "需要管理员权限");
          assert(s.status === "pending", 409, "稿件已被处理或撤回");
          assert(
            body.opportunityRevision === o.revision &&
              s.base_version === o.published_version,
            409,
            "岗位版本已变化，请刷新审核",
          );
          assert(
            ["publish", "return", "reject"].includes(body.decision),
            400,
            "审核决定无效",
          );
          const feedback = body.feedback || {};
          assert(
            typeof feedback === "object" &&
              !Array.isArray(feedback) &&
              Object.keys(feedback).length <= 30,
            400,
            "退回意见无效",
          );
          for (const [key, value] of Object.entries(feedback)) {
            assert(
              [
                ...fields,
                "source",
                "permission",
                "evidence",
                "general",
              ].includes(key),
              400,
              "意见字段无效",
            );
            text(value, 1000);
          }
          assert(
            body.decision === "publish" ||
              Object.values(feedback).some((v) => v.trim()),
            400,
            "请填写逐字段补充要求或拒绝原因",
          );
          let version = o.published_version;
          if (body.decision === "publish") {
            assert(
              body.sourceVerified === true && body.channelApproved === true,
              400,
              "请确认来源可核对且投递渠道获准公开",
            );
            const data = opportunityData(
              body.data || {
                ...s.data,
                deadlineAt: s.data.deadlineDate ? undefined : s.data.deadlineAt,
              },
            );
            ready(data, s.source);
            version = (
              await one(
                tx,
                "SELECT COALESCE(MAX(version),0)::int+1 AS next FROM opportunity_releases WHERE opportunity_id=$1",
                [o.id],
              )
            ).next;
            await query(
              tx,
              "INSERT INTO opportunity_releases(opportunity_id,version,submission_id,data) VALUES($1,$2,$3,$4::jsonb)",
              [o.id, version, id, JSON.stringify(data)],
            );
            await query(
              tx,
              "UPDATE opportunities SET published_version=$2,status=CASE WHEN status='unpublished' THEN 'open' ELSE status END,revision=revision+1,verified_at=NOW(),review_due_at=NOW()+INTERVAL '30 days' WHERE id=$1",
              [o.id, version],
            );
          }
          const after = {
            status:
              body.decision === "publish"
                ? "published"
                : body.decision === "return"
                  ? "returned"
                  : "rejected",
            version,
          };
          await query(
            tx,
            "UPDATE opportunity_submissions SET status=$2,feedback=$3::jsonb,internal_note=$4,revision=revision+1,reviewed_at=NOW() WHERE id=$1",
            [
              id,
              after.status,
              JSON.stringify(feedback),
              text(body.internalNote, 2000),
            ],
          );
          await audit(
            tx,
            actor.user,
            "opportunity." + body.decision,
            o.id,
            { status: s.status, version: o.published_version },
            after,
            body.reason,
          );
        }
        return {
          item: admin
            ? await owned(tx, id, actor, true)
            : authorItem(await owned(tx, id, actor)),
        };
      });
  }
  if (path === "/admin/opportunities" && method === "GET")
    return {
      items: await query(
        db,
        "SELECT o.*,r.data,(SELECT jsonb_agg(jsonb_build_object('version',v.version,'publishedAt',v.published_at) ORDER BY v.version DESC) FROM opportunity_releases v WHERE v.opportunity_id=o.id) AS versions FROM opportunities o LEFT JOIN opportunity_releases r ON r.opportunity_id=o.id AND r.version=o.published_version WHERE ($1::boolean=FALSE OR o.review_due_at<=NOW()) ORDER BY o.created_at DESC LIMIT 100",
        [url.searchParams.get("due") === "true"],
      ),
    };
  const state = /^\/admin\/opportunities\/([^/]+)$/.exec(path);
  if (state && method === "POST")
    return transaction(db, actor, body, path, async (tx) => {
      const o = await one(
        tx,
        "SELECT * FROM opportunities WHERE id=$1 FOR UPDATE",
        [state[1]],
      );
      assert(o?.published_version, 404, "岗位尚未发布");
      revision(o, body);
      assert(
        ["open", "paused", "closed"].includes(body.status),
        400,
        "岗位状态无效",
      );
      const version = body.version ?? o.published_version;
      assert(Number.isSafeInteger(version) && version > 0, 400, "公开版本无效");
      const release = await one(
        tx,
        "SELECT data FROM opportunity_releases WHERE opportunity_id=$1 AND version=$2",
        [o.id, version],
      );
      assert(release, 404, "该岗位的已审版本不存在");
      if (body.status === "open")
        ready(release.data, {
          description: "已审核公开版本",
          permission: "已审核公开渠道",
        });
      await query(
        tx,
        "UPDATE opportunities SET status=$2,published_version=$3,revision=revision+1,verified_at=CASE WHEN $2='open' THEN NOW() ELSE verified_at END,review_due_at=CASE WHEN $2='open' THEN NOW()+INTERVAL '30 days' ELSE review_due_at END WHERE id=$1",
        [o.id, body.status, version],
      );
      await audit(
        tx,
        actor.user,
        "opportunity.status",
        o.id,
        { status: o.status, version: o.published_version },
        { status: body.status, version },
        body.reason,
      );
      return { ok: true };
    });
  const report = /^\/cloud\/opportunities\/([^/]+)\/reports$/.exec(path);
  if (report && method === "POST") {
    await limit(db, "opportunity-report:" + actor.user.id, 10, 3600);
    assert(
      ["expired", "channel", "incorrect", "privacy", "other"].includes(
        body.category,
      ),
      400,
      "问题类别无效",
    );
    const description = text(body.description, 2000);
    assert(description.length >= 5, 400, "请具体描述问题");
    const released = await one(
      db,
      "SELECT version FROM opportunity_releases WHERE opportunity_id=$1 AND version=$2",
      [report[1], body.version],
    );
    assert(released, 404, "公开版本不存在");
    const id = randomUUID();
    await query(
      db,
      "INSERT INTO opportunity_reports(id,opportunity_id,version,author_id,category,description) VALUES($1,$2,$3,$4,$5,$6)",
      [id, report[1], body.version, actor.user.id, body.category, description],
    );
    return { id };
  }
  if (path === "/admin/opportunity-reports" && method === "GET")
    return {
      items: await query(
        db,
        "SELECT * FROM opportunity_reports ORDER BY created_at DESC LIMIT 100",
      ),
    };
  const reportAdmin = /^\/admin\/opportunity-reports\/([^/]+)$/.exec(path);
  if (reportAdmin && method === "POST")
    return transaction(db, actor, body, path, async (tx) => {
      const report = await one(
        tx,
        "SELECT * FROM opportunity_reports WHERE id=$1 FOR UPDATE",
        [reportAdmin[1]],
      );
      assert(report, 404, "反馈不存在");
      assert(report.status === "open", 409, "反馈已处理");
      assert(
        ["resolved", "dismissed"].includes(body.status),
        400,
        "处理结果无效",
      );
      const resolution = text(body.resolution, 2000);
      assert(resolution.length >= 2, 400, "请填写处理说明");
      await query(
        tx,
        "UPDATE opportunity_reports SET status=$2,resolution=$3,resolved_at=NOW() WHERE id=$1",
        [report.id, body.status, resolution],
      );
      await audit(
        tx,
        actor.user,
        "opportunity.report",
        report.id,
        { status: report.status },
        { status: body.status },
        body.reason,
      );
      return { ok: true };
    });
  assert(false, 404, "机会接口不存在");
}
