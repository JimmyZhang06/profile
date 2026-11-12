import { randomUUID } from "node:crypto";
import { one, query } from "./database.mjs";
import { assert, audit } from "./security.mjs";
import {
  calculateOffer,
  emptyOffer,
  RULESET,
  snapshotOffer,
  validDate,
} from "../../src/features/offers/offerEngine.mjs";

const idValid = (id) =>
  typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id);
const bounded = (value) => JSON.stringify(value).length <= 160000;
export function validateOffer(plan) {
  assert(
    plan && typeof plan === "object" && !Array.isArray(plan) && bounded(plan),
    400,
    "方案格式或容量不正确",
  );
  assert(
    ["CN", "HK"].includes(plan.region) &&
      plan.currency === (plan.region === "HK" ? "HKD" : "CNY"),
    400,
    "请使用地区本币",
  );
  assert(
    typeof plan.name === "string" &&
      plan.name.length <= 160 &&
      ["employment", "internship"].includes(plan.kind) &&
      ["month", "day", "hour", "year"].includes(plan.unit),
    400,
    "名称、工作类型或薪资单位不正确",
  );
  assert(
    ["first12", "contract"].includes(plan.period) &&
      (!plan.start || validDate(plan.start)) &&
      (!plan.end || validDate(plan.end)),
    400,
    "日期格式不正确",
  );
  assert(
    !plan.end || !plan.start || plan.end >= plan.start,
    400,
    "合同结束日期不能早于入职",
  );
  assert(
    plan.contributions &&
      plan.tax &&
      plan.monthly &&
      !Array.isArray(plan.monthly) &&
      Object.keys(plan.monthly).length <= 40 &&
      Array.isArray(plan.bonuses) &&
      plan.bonuses.length <= 30,
    400,
    "条款格式或容量不正确",
  );
  const checkNumbers = (v, depth = 0) => {
    assert(depth < 12, 400, "方案嵌套过深");
    if (typeof v === "number")
      assert(
        Number.isFinite(v) && v >= 0 && v <= 1000000000,
        400,
        "金额必须是有效非负数",
      );
    else if (v && typeof v === "object")
      for (const [k, item] of Object.entries(v)) {
        assert(
          !["__proto__", "constructor", "prototype"].includes(k),
          400,
          "字段不正确",
        );
        checkNumbers(item, depth + 1);
      }
    else if (typeof v === "string") assert(v.length <= 4000, 400, "字段过长");
  };
  checkNumbers(plan);
  assert(
    Number.isInteger(Number(plan.payOffset)) &&
      Number(plan.payOffset) <= 12 &&
      Number.isInteger(Number(plan.payDay)) &&
      +plan.payDay >= 1 &&
      +plan.payDay <= 31,
    400,
    "发薪月份或日期不正确",
  );
  assert(
    +plan.trialPercent >= 0 && +plan.trialPercent <= 100,
    400,
    "试用比例应在 0–100%",
  );
  assert(
    Number.isInteger(Number(plan.tax.priorMonths || 0)) &&
      Number(plan.tax.priorMonths || 0) <= 12,
    400,
    "已有任职月份应为 0–12 的整数",
  );
  for (const [month, record] of Object.entries(plan.monthly))
    assert(
      /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
        record &&
        typeof record === "object",
      400,
      "逐月条款格式不正确",
    );
  for (const b of plan.bonuses)
    assert(
      b && typeof b === "object" && (!b.payDate || validDate(b.payDate)),
      400,
      "奖金日期不正确",
    );
  return plan;
}
export function validateRuleSet(set) {
  assert(
    set &&
      typeof set.version === "string" &&
      idValid(set.version) &&
      validDate(set.reviewedAt) &&
      Array.isArray(set.rules) &&
      set.rules.length > 0 &&
      set.rules.length <= 60 &&
      bounded(set),
    400,
    "规则版本格式不正确",
  );
  for (const r of set.rules) {
    assert(
      idValid(r.key) &&
        ["CN", "HK"].includes(r.region) &&
        typeof r.category === "string" &&
        typeof r.audience === "string" &&
        r.audience.length < 100 &&
        validDate(r.from) &&
        validDate(r.to) &&
        r.from <= r.to &&
        ["cent", "dollar-down"].includes(r.rounding),
      400,
      "填写规则适用对象、有效期与取整方式",
    );
    let u;
    try {
      u = new URL(r.source);
    } catch {}
    assert(
      u?.protocol === "https:" &&
        !u.username &&
        !u.password &&
        /(^|\.)(gov\.cn|chinatax\.gov\.cn|mpfa\.org\.hk|ird\.gov\.hk|gov\.hk)$/.test(
          u.hostname,
        ),
      400,
      "规则需有官方 HTTPS 来源",
    );
    assert(
      r.parameters &&
        typeof r.parameters === "object" &&
        !Array.isArray(r.parameters),
      400,
      "规则参数不正确",
    );
    const numbers = [];
    const walk = (v) => {
      if (typeof v === "number") numbers.push(v);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
      else assert(v === null, 400, "参数只允许数值或数组");
    };
    walk(r.parameters);
    assert(
      numbers.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e12),
      400,
      "规则参数使用非负整数（金额为分，比例为万分比）",
    );
    if (r.key === "cn-wage")
      assert(
        Number.isSafeInteger(r.parameters.monthlyAllowance) &&
          r.parameters.brackets?.length === 7 &&
          r.parameters.brackets.every(
            (x) => Array.isArray(x) && x.length === 3 && x[1] <= 10000,
          ) &&
          r.parameters.brackets.at(-1)[0] === null,
        400,
        "累计预扣税表不完整",
      );
    if (r.category === "salaries")
      assert(
        r.parameters.bands?.length === 5 &&
          r.parameters.bands.every(
            (x) => Array.isArray(x) && x.length === 2 && x[1] <= 10000,
          ) &&
          r.parameters.bands.at(-1)[0] === null &&
          [
            "allowance",
            "mpfLimit",
            "reduction",
            "standardThreshold",
            "standardLowBps",
            "standardHighBps",
          ].every((k) => Number.isSafeInteger(r.parameters[k])),
        400,
        "薪俸税参数不完整",
      );
    if (r.key === "hk-mpf")
      assert(
        ["minimum", "maximum", "bps"].every((k) =>
          Number.isSafeInteger(r.parameters[k]),
        ) &&
          r.parameters.bps <= 10000 &&
          r.parameters.minimum <= r.parameters.maximum,
        400,
        "强积金参数不完整",
      );
    if (r.key === "cn-student")
      assert(
        Number.isSafeInteger(r.parameters.incomeBps) &&
          r.parameters.incomeBps <= 10000,
        400,
        "学生实习收入额比例不完整",
      );
    if (r.key === "sz-medical-1")
      assert(
        ["floor", "ceiling", "employeeBps", "employerBps"].every((k) =>
          Number.isSafeInteger(r.parameters[k]),
        ) &&
          r.parameters.floor <= r.parameters.ceiling &&
          r.parameters.employeeBps <= 10000 &&
          r.parameters.employerBps <= 10000,
        400,
        "医保参数不完整",
      );
    assert(
      !set.rules.some(
        (other) =>
          other !== r &&
          other.key === r.key &&
          other.from <= r.to &&
          other.to >= r.from,
      ),
      409,
      "同一规则适用日期重叠",
    );
  }
  return set;
}
function sampleChecks(ruleset) {
  const a = emptyOffer();
  Object.assign(a, { start: "2026-01-01", salary: 20000, allowance: 0 });
  a.contributions = {
    mode: "manual",
    social: 2000,
    fundEmployee: 2000,
    fundEmployer: 2000,
    deductible: 4000,
    other: 0,
  };
  a.tax.mode = "resident";
  a.bonuses = [
    {
      id: "sample",
      clauseKey: "sample",
      amount: 40000,
      fixed: false,
      payDate: "2026-12-28",
    },
  ];
  const target = calculateOffer(a, { ruleset }).cash,
    fixed = calculateOffer(a, { ruleset, scenario: "fixed" }).cash;
  const b = structuredClone(a);
  b.salary = 22000;
  b.contributions.fundEmployee = 1200;
  b.contributions.fundEmployer = 1200;
  b.contributions.deductible = 3200;
  b.bonuses = [
    { id: "fixed", amount: 16000, fixed: true, payDate: "2026-12-28" },
  ];
  return {
    target,
    fixed,
    b: calculateOffer(b, { ruleset }).cash,
    passed:
      target === 21452000 &&
      fixed === 18132000 &&
      calculateOffer(b, { ruleset }).cash === 22220000,
  };
}
export async function publicOfferRules(db) {
  const published = await one(
    db,
    "SELECT data FROM offer_rule_versions WHERE state='published' ORDER BY published_at DESC,id DESC LIMIT 1",
  );
  return { ruleset: published?.data || RULESET };
}
// Authentication, CSRF/origin and current administrator MFA grant are enforced by app.mjs.
// Return data for the entry point's JSON responder; no private input is logged or audited.
export async function offerRoute({
  db,
  actor,
  req,
  url,
  path,
  method,
  readBody,
}) {
  if (path === "/api/public/offer-rules" && method === "GET")
    return publicOfferRules(db);
  const owner = actor?.user?.id || actor?.id;
  assert(owner, 401, "请先登录");
  if (path.startsWith("/api/admin/offer-rules")) {
    assert((actor.access?.role || actor.role) === "admin", 403, "没有管理权限");
    if (path === "/api/admin/offer-rules" && method === "GET")
      return {
        builtin: RULESET,
        items: await query(
          db,
          "SELECT id,state,revision,data,created_at,published_at FROM offer_rule_versions ORDER BY created_at DESC LIMIT 100",
        ),
      };
    const input = await readBody(req);
    const ruleset = validateRuleSet(input.ruleset);
    if (path === "/api/admin/offer-rules/check" && method === "POST")
      return { checks: sampleChecks(ruleset) };
    assert(
      path === "/api/admin/offer-rules" && method === "POST",
      404,
      "规则接口不存在",
    );
    assert(["draft", "published"].includes(input.state), 400, "规则状态不正确");
    const id = ruleset.version;
    return db.transaction().execute(async (tx) => {
      const old = await one(
        tx,
        "SELECT * FROM offer_rule_versions WHERE id=$1 FOR UPDATE",
        [id],
      );
      assert(
        !old || old.state === "draft",
        409,
        "已发布版本不可修改，请另建版本",
      );
      assert(
        !old || old.revision === input.revision,
        409,
        "规则草稿已更新，请重新载入",
      );
      const checks = sampleChecks(ruleset);
      // Historical benchmark changes require explicit review and a recorded explanation.
      assert(
        input.state !== "published" || checks.passed,
        400,
        "设计稿回归算例未通过，请保留草稿并核对历史规则",
      );
      const row = await one(
        tx,
        "INSERT INTO offer_rule_versions(id,state,data,created_by,published_at) VALUES($1,$2,$3::jsonb,$4,CASE WHEN $2='published' THEN NOW() ELSE NULL END) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,data=EXCLUDED.data,revision=offer_rule_versions.revision+1,published_at=EXCLUDED.published_at RETURNING id,state,revision,data",
        [id, input.state, JSON.stringify(ruleset), owner],
      );
      await audit(
        tx,
        actor.user || actor,
        "offer.rules." + input.state,
        id,
        old ? { version: old.id, state: old.state } : null,
        { version: id, state: row.state },
        input.reason,
      );
      return { item: row, checks };
    });
  }
  assert(
    path === "/api/cloud/offers" || path.startsWith("/api/cloud/offers/"),
    404,
    "接口不存在",
  );
  const id = path.slice("/api/cloud/offers/".length);
  if (path === "/api/cloud/offers" && method === "GET")
    return {
      items: await query(
        db,
        "SELECT id,revision,data,snapshot,updated_at FROM offer_plans WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 50",
        [owner],
      ),
    };
  if (method === "GET" && idValid(id)) {
    const item = await one(
      db,
      "SELECT id,revision,data,snapshot,updated_at FROM offer_plans WHERE owner_id=$1 AND id=$2",
      [owner, id],
    );
    assert(item, 404, "方案不存在");
    return { item };
  }
  if (method === "DELETE" && idValid(id)) {
    const revision = Number(url?.searchParams.get("revision"));
    const item = await one(
      db,
      "DELETE FROM offer_plans WHERE owner_id=$1 AND id=$2 AND revision=$3 RETURNING id",
      [owner, id, revision],
    );
    assert(item, 409, "方案不存在或已更新，请重新载入");
    return { deleted: true };
  }
  assert(
    (method === "POST" && path === "/api/cloud/offers") ||
      (method === "PUT" && idValid(id)),
    404,
    "方案接口不存在",
  );
  const input = await readBody(req),
    plan = validateOffer(input.plan);
  const ruleset = (await publicOfferRules(db)).ruleset;
  const snapshot = snapshotOffer(plan, ruleset);
  return db.transaction().execute(async (tx) => {
    const key = method === "POST" ? randomUUID() : id;
    let row;
    if (method === "POST") {
      // Lock owner to make the per-account capacity check atomic.
      await one(tx, 'SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [owner]);
      const count = await one(
        tx,
        "SELECT COUNT(*) AS count FROM offer_plans WHERE owner_id=$1",
        [owner],
      );
      assert(+count.count < 50, 413, "最多保存 50 份私人方案");
      row = await one(
        tx,
        "INSERT INTO offer_plans(owner_id,id,data,snapshot) VALUES($1,$2,$3::jsonb,$4::jsonb) RETURNING id,revision,data,snapshot,updated_at",
        [owner, key, JSON.stringify(plan), JSON.stringify(snapshot)],
      );
    } else
      row = await one(
        tx,
        "UPDATE offer_plans SET data=$3::jsonb,snapshot=$4::jsonb,revision=revision+1,updated_at=NOW() WHERE owner_id=$1 AND id=$2 AND revision=$5 RETURNING id,revision,data,snapshot,updated_at",
        [
          owner,
          key,
          JSON.stringify(plan),
          JSON.stringify(snapshot),
          input.revision,
        ],
      );
    assert(row, 409, "方案不存在或已更新，当前草稿仍可保存为新方案");
    return { item: row };
  });
}
