import { ALGORITHM_VERSION, RULESET, ruleFor } from "./offerRules.mjs";
export { ALGORITHM_VERSION, RULESET };
const DAY = 86400000;
export const cents = (value) =>
  value === "" || value === null || value === undefined
    ? null
    : Number.isFinite(Number(value)) && Number(value) >= 0
      ? Math.round(Number(value) * 100)
      : null;
export const validDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
export const addDays = (d, n) => iso(Date.parse(d) + n * DAY);
const lastDay = (m) =>
  new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
const monthDay = (m, d) =>
  m + "-" + String(Math.min(d, lastDay(m))).padStart(2, "0");
const shiftMonth = (m, n) =>
  iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)).slice(0, 7);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;
const rate = (n, bps) => Math.round((n * bps) / 10000);
const sum = (rows, key) =>
  rows.some((r) => r[key] === null)
    ? null
    : rows.reduce((n, r) => n + (r[key] || 0), 0);
const valueAt = (o, key, fallback) =>
  Object.hasOwn(o || {}, key) ? o[key] : fallback;
export function firstYearEnd(start) {
  const next = +start.slice(0, 4) + 1 + start.slice(4);
  return validDate(next)
    ? addDays(next, -1)
    : +start.slice(0, 4) + 1 + "-02-28";
}
export function emptyOffer(name = "方案 A") {
  return {
    schema: 1,
    name,
    region: "CN",
    currency: "CNY",
    city: "",
    kind: "employment",
    start: "",
    end: "",
    period: "first12",
    salary: null,
    unit: "month",
    payOffset: 0,
    payDay: 28,
    days: null,
    source: "个人假设",
    quote: "",
    trialEnd: "",
    trialPercent: 100,
    allowance: null,
    allowanceTaxable: true,
    bonuses: [],
    monthly: {},
    contributions: {
      mode: "manual",
      social: null,
      fundEmployee: null,
      fundEmployer: null,
      deductible: null,
      other: 0,
    },
    tax: {
      mode: "unknown",
      special: 0,
      otherDeduction: 0,
      priorIncome: 0,
      priorDeductions: 0,
      priorWithheld: 0,
      priorMonths: 0,
      bonusUsedYears: [],
      hkMpf: "unknown",
      hkAnnualComplete: false,
      hkOtherIncome: 0,
      hkOtherMpf: 0,
      hkOtherDeduction: 0,
      hkExtraAllowance: 0,
    },
  };
}
export function offerWindow(plan) {
  if (!validDate(plan.start)) return null;
  const end = plan.period === "contract" ? plan.end : firstYearEnd(plan.start);
  return validDate(end) && end >= plan.start && days(plan.start, end) <= 1100
    ? { start: plan.start, end }
    : null;
}
export function offerMonths(plan) {
  const window = offerWindow(plan);
  if (!window) return [];
  const end =
    validDate(plan.end) && plan.end < window.end ? plan.end : window.end;
  const out = [];
  for (
    let m = plan.start.slice(0, 7);
    m <= end.slice(0, 7);
    m = shiftMonth(m, 1)
  )
    out.push(m);
  return out;
}
function cnTax(taxable, rule) {
  taxable = Math.max(0, taxable);
  const [, bps, quick] = rule.parameters.brackets.find(
    ([limit]) => limit === null || taxable <= limit,
  );
  return Math.max(0, rate(taxable, bps) - quick);
}
export function hkSalariesTax(income, mpf, parameters, extra = {}) {
  const net = Math.max(
    0,
    income - Math.min(mpf, parameters.mpfLimit) - (extra.deduction || 0),
  );
  let left = Math.max(0, net - parameters.allowance - (extra.allowance || 0)),
    progressive = 0;
  for (const [width, bps] of parameters.bands) {
    const part = width === null ? left : Math.min(left, width);
    progressive += rate(part, bps);
    left -= part;
  }
  const standard =
    rate(
      Math.min(net, parameters.standardThreshold),
      parameters.standardLowBps,
    ) +
    rate(
      Math.max(0, net - parameters.standardThreshold),
      parameters.standardHighBps,
    );
  return (
    Math.floor(
      Math.max(0, Math.min(progressive, standard) - parameters.reduction) / 100,
    ) * 100
  );
}
function contributions(plan, m, income, rules, issues) {
  const c = { ...plan.contributions, ...plan.monthly?.[m]?.contributions };
  const manual = (key) => cents(c[key]);
  let social = manual("social"),
    fundEmployee = manual("fundEmployee"),
    fundEmployer = manual("fundEmployer"),
    employerSocial = manual("employerSocial");
  let breakdown = [];
  if (plan.region === "HK") {
    social = 0;
    employerSocial = 0;
    if (plan.tax.hkMpf === "exempt") {
      fundEmployee = 0;
      fundEmployer = 0;
    } else if (plan.tax.hkMpf === "regular") {
      const rule = ruleFor(rules, "hk-mpf", monthDay(m, 1));
      // Only regular monthly wage periods; casual workers and unconfirmed exemptions use manual amounts.
      const termEnd = validDate(plan.end) ? plan.end : offerWindow(plan).end;
      if (days(plan.start, termEnd) < 60) {
        fundEmployee = 0;
        fundEmployer = 0;
      } else if (!rule || income === null) {
        fundEmployee = null;
        fundEmployer = null;
        issues.add(`${m} 强积金规则或相关入息待确认，请填单位金额`);
      } else {
        const partialStart =
          plan.start.slice(0, 7) === m && +plan.start.slice(8) > 1;
        const partialEnd =
          termEnd.slice(0, 7) === m && +termEnd.slice(8) < lastDay(m);
        // Partial wage periods have daily limits; require employer confirmation instead of silently using monthly caps.
        if (partialStart || partialEnd) {
          fundEmployee = manual("fundEmployee");
          fundEmployer = manual("fundEmployer");
          issues.add(`${m} 非完整强积金供款期：请核实按日上下限并填单位金额`);
        } else {
          const p = rule.parameters;
          fundEmployer = rate(Math.min(income, p.maximum), p.bps);
          const holidayEnd = addDays(plan.start, 29);
          const firstContribution =
            +holidayEnd.slice(8) === lastDay(holidayEnd.slice(0, 7))
              ? addDays(holidayEnd, 1)
              : shiftMonth(holidayEnd.slice(0, 7), 1) + "-01";
          fundEmployee =
            m < firstContribution.slice(0, 7) || income < p.minimum
              ? 0
              : rate(Math.min(income, p.maximum), p.bps);
        }
      }
    }
    const corrections = plan.monthly?.[m]?.contributions;
    if (corrections && Object.hasOwn(corrections, "fundEmployee"))
      fundEmployee = cents(corrections.fundEmployee);
    if (corrections && Object.hasOwn(corrections, "fundEmployer"))
      fundEmployer = cents(corrections.fundEmployer);
    breakdown = [
      {
        name: "强积金",
        employee: fundEmployee,
        employer: fundEmployer,
        source: corrections
          ? "逐月单位金额更正"
          : plan.tax.hkMpf === "regular"
            ? "积金局普通按月雇员规则（雇主自首日计提）"
            : plan.tax.hkMpf === "exempt"
              ? "用户确认豁免"
              : "单位金额 / 资格待确认",
      },
    ];
  } else if (c.mode === "itemized") {
    for (const key of [
      "pension",
      "medical",
      "unemployment",
      "injury",
      "maternity",
      "fund",
    ]) {
      const item = { ...(c.items?.[key] || {}) };
      let employee = cents(item.employee),
        employer = cents(item.employer),
        base = cents(item.base);
      let source = item.source || "单位确认金额";
      if (item.rule === "sz-medical-1") {
        const rule =
          plan.city === "深圳"
            ? ruleFor(rules, "sz-medical-1", m + "-01")
            : null;
        if (rule && base !== null) {
          base = Math.max(
            rule.parameters.floor,
            Math.min(base, rule.parameters.ceiling),
          );
          employee = rate(base, rule.parameters.employeeBps);
          employer = rate(base, rule.parameters.employerBps);
          source = rule.source;
        } else {
          employee = null;
          employer = null;
          issues.add(`${m} 深圳一档医保基数或有效规则待确认`);
        }
      }
      breakdown.push({
        name: {
          pension: "养老",
          medical: "医疗",
          unemployment: "失业",
          injury: "工伤",
          maternity: "生育",
          fund: "公积金",
        }[key],
        employee,
        employer,
        base,
        source,
      });
    }
    social = sum(breakdown.slice(0, 5), "employee");
    employerSocial = sum(breakdown.slice(0, 5), "employer");
    fundEmployee = breakdown[5].employee;
    fundEmployer = breakdown[5].employer;
  } else
    breakdown = [
      {
        name: "社保合计（待补险种明细）",
        employee: social,
        employer: employerSocial,
        source: "单位实扣",
      },
      {
        name: "公积金",
        employee: fundEmployee,
        employer: fundEmployer,
        source: "单位金额",
      },
    ];
  const deductible = plan.region === "HK" ? fundEmployee : manual("deductible");
  if (social === null || fundEmployee === null)
    issues.add(`${m} 个人缴费待确认（明确不缴请填 0）`);
  if (fundEmployer === null)
    issues.add(`${m} 单位${plan.region === "HK" ? "强积金" : "公积金"}待确认`);
  return {
    social,
    fundEmployee,
    fundEmployer,
    employerSocial,
    deductible,
    other: manual("other"),
    breakdown,
  };
}
export function calculateOffer(
  plan,
  {
    scenario = "target",
    ruleset = RULESET,
    window: compareWindow,
    skipRange = false,
  } = {},
) {
  const window = compareWindow || offerWindow(plan),
    issues = new Set(),
    flows = [],
    months = offerMonths(plan);
  const result = {
    algorithm: ALGORITHM_VERSION,
    ruleVersion: ruleset.version,
    currency: plan.currency,
    window,
    scenario,
    flows,
    months: [],
    issues: [],
    taxYears: [],
  };
  if (!window || !months.length)
    return {
      ...result,
      gross: null,
      cash: null,
      fund: null,
      issues: ["填写有效的入职日期与测算期间（最长三年）"],
    };
  if (plan.currency !== (plan.region === "HK" ? "HKD" : "CNY"))
    issues.add("地区与币种不符，请改为地区本币");
  for (const m of months) {
    const override = plan.monthly?.[m] || {};
    const start = plan.start > m + "-01" ? plan.start : m + "-01";
    const employmentEnd = validDate(plan.end)
      ? plan.end
      : offerWindow(plan).end;
    const end =
      employmentEnd < monthDay(m, 31) ? employmentEnd : monthDay(m, 31);
    const count = days(start, end),
      total = lastDay(m);
    let salary = cents(plan.salary);
    if (plan.unit === "day") {
      const attendance = valueAt(override, "days", plan.days);
      salary =
        salary === null || cents(attendance) === null
          ? null
          : Math.round(salary * Number(attendance));
      if (salary === null) issues.add(`${m} 日薪或预计出勤天数待确认`);
    } else if (plan.unit !== "month") {
      salary = null;
      issues.add("请确认实际月薪或日薪，年薪/时薪报价不能直接当月薪");
    } else if (salary !== null) {
      if (plan.trialEnd && validDate(plan.trialEnd)) {
        const trialDays =
          plan.trialEnd < start
            ? 0
            : days(start, plan.trialEnd < end ? plan.trialEnd : end);
        salary = Math.round(
          (salary *
            (count -
              trialDays +
              (trialDays * Number(plan.trialPercent)) / 100)) /
            total,
        );
        if (trialDays)
          issues.add(`${m} 试用期按自然日暂估；可按单位计薪金额更正`);
      } else salary = Math.round((salary * count) / total);
      if (count < total)
        issues.add(
          `${m} 非整月按 ${count}/${total} 自然日暂估，请核对单位计薪天数`,
        );
    }
    if (Object.hasOwn(override, "gross")) salary = cents(override.gross);
    if (salary === null) issues.add(`${m} 实际报价待确认`);
    const allowance =
      cents(valueAt(override, "allowance", plan.allowance)) ?? 0;
    const payDate =
      override.payDate ||
      monthDay(
        shiftMonth(m, Number(plan.payOffset) || 0),
        Number(plan.payDay) || 28,
      );
    if (!validDate(payDate)) issues.add(`${m} 支付日无效`);
    flows.push({
      id: "salary-" + m,
      clauseId: "salary",
      month: m,
      earnedStart: start,
      earnedEnd: end,
      payDate,
      gross: salary === null ? null : salary + allowance,
      taxable:
        salary === null
          ? null
          : salary + (plan.allowanceTaxable ? allowance : 0),
      kind: "salary",
      label: "工资与定额补贴",
      days: count,
      source: plan.source,
    });
  }
  const seen = new Set();
  for (const b of plan.bonuses || []) {
    if (scenario === "fixed" && !b.fixed) continue;
    const dedupe = String(b.clauseKey || b.id || "").trim();
    if (dedupe && seen.has(dedupe)) {
      issues.add("额外薪酬条款重复：同一条款只计一次，请核对报价组成");
      continue;
    }
    seen.add(dedupe);
    let amount = cents(b.amount);
    if (b.prorate)
      amount =
        amount === null ? null : Math.round((amount * months.length) / 12);
    if (
      b.requiresEmployed &&
      validDate(b.payDate) &&
      validDate(plan.end) &&
      b.payDate > plan.end
    ) {
      issues.add(`${b.label || "奖金"}发放时已离职，依约不计入`);
      continue;
    }
    const unknown = !validDate(b.payDate);
    if (unknown)
      issues.add(
        `${b.label || "奖金"} ${amount === null ? "金额及" : ""}发放日期待确认；可假设期内或期外发放`,
      );
    flows.push({
      id: b.id,
      clauseId: dedupe,
      month:
        b.earnedMonth ||
        (plan.region === "HK" && !unknown
          ? b.payDate.slice(0, 7)
          : months.at(-1)),
      earnedStart: plan.start,
      earnedEnd: validDate(plan.end) ? plan.end : offerWindow(plan).end,
      payDate: unknown ? null : b.payDate,
      gross: amount,
      taxable: amount,
      kind: b.separate ? "separate" : "bonus",
      label: b.label || "额外薪酬",
      source: b.source || plan.source,
      unknown,
    });
  }
  const contributionByMonth = {};
  const contributionMonths = [
    ...new Set([
      ...months,
      ...(plan.region === "HK"
        ? flows.filter((f) => f.payDate).map((f) => f.month)
        : []),
    ]),
  ].sort();
  for (const m of contributionMonths) {
    const bonusOnly = !months.includes(m);
    if (bonusOnly)
      issues.add(
        `${m} 期后额外薪酬的强积金归属与供款，请填单位金额（不自动套工资月上限）`,
      );
    contributionByMonth[m] = contributions(
      bonusOnly
        ? {
            ...plan,
            tax: { ...plan.tax, hkMpf: "unknown" },
            contributions: {
              ...plan.contributions,
              fundEmployee: null,
              fundEmployer: null,
            },
          }
        : plan,
      m,
      sum(
        flows.filter((f) => f.month === m),
        "gross",
      ),
      ruleset,
      issues,
    );
    const salary = flows.find((f) => f.kind === "salary" && f.month === m);
    const deductionFlow =
      salary || flows.find((f) => f.month === m && f.payDate);
    if (deductionFlow) deductionFlow.deductionMonth = m;
  }
  const payMonths = [
    ...new Set(
      flows
        .filter((f) => validDate(f.payDate))
        .map((f) => f.payDate.slice(0, 7)),
    ),
  ].sort();
  const cumulatives = {},
    bonusUses = new Set(plan.tax.bonusUsedYears || []);
  for (const m of payMonths) {
    const items = flows.filter((f) => f.payDate?.slice(0, 7) === m),
      salaryItems = items.filter((f) => f.deductionMonth);
    const c = {};
    for (const key of [
      "social",
      "fundEmployee",
      "fundEmployer",
      "employerSocial",
      "deductible",
      "other",
    ])
      c[key] = sum(
        salaryItems.map((f) => contributionByMonth[f.month]),
        key,
      );
    const gross = sum(items, "gross");
    let tax = null;
    if (plan.region === "HK") tax = 0;
    else if (plan.tax.mode === "manual") {
      tax = cents(valueAt(plan.monthly?.[m], "tax", plan.tax.manual));
      if (tax === null) issues.add(`${m} 单位预计扣税待确认`);
    } else if (["resident", "student"].includes(plan.tax.mode)) {
      const rule = ruleFor(ruleset, "cn-wage", m + "-01");
      const year = m.slice(0, 4),
        initialYear = payMonths[0].slice(0, 4);
      const state = (cumulatives[year] ||= {
        income: year === initialYear ? cents(plan.tax.priorIncome) || 0 : 0,
        deductions:
          year === initialYear ? cents(plan.tax.priorDeductions) || 0 : 0,
        withheld: year === initialYear ? cents(plan.tax.priorWithheld) || 0 : 0,
      });
      let taxable = sum(
          items.filter((f) => f.kind !== "separate"),
          "taxable",
        ),
        separateTax = 0;
      if (plan.tax.mode === "student") {
        const studentRule = ruleFor(ruleset, "cn-student", m + "-01");
        if (studentRule && taxable !== null)
          taxable = rate(taxable, studentRule.parameters.incomeBps);
        else taxable = null;
      }
      for (const b of items.filter((f) => f.kind === "separate")) {
        if (
          b.gross === null ||
          !rule ||
          !ruleFor(ruleset, "cn-bonus", b.payDate) ||
          bonusUses.has(year)
        ) {
          separateTax = null;
          issues.add(`${year} 全年一次性奖金资格、有效期或每年一次额度待确认`);
        } else {
          const [, bps, quick] = rule.parameters.brackets.find(
            ([limit]) => limit === null || b.gross <= limit,
          );
          // Annual brackets equal twelve monthly thresholds; annual quick deduction divided by 12.
          if (separateTax !== null)
            separateTax += Math.max(
              0,
              rate(b.gross, bps) - Math.round(quick / 12),
            );
          bonusUses.add(year);
        }
      }
      if (
        rule &&
        taxable !== null &&
        c.deductible !== null &&
        state.income !== null
      ) {
        state.income += taxable;
        state.deductions += c.deductible;
        const employedFrom =
          plan.start.slice(0, 4) === year ? +plan.start.slice(5, 7) : 1;
        const employedTo =
          validDate(plan.end) && plan.end.slice(0, 4) === year
            ? Math.min(+m.slice(5, 7), +plan.end.slice(5, 7))
            : +m.slice(5, 7);
        const employedMonths =
          Math.max(0, employedTo - employedFrom + 1) +
          (year === initialYear ? Number(plan.tax.priorMonths) || 0 : 0);
        const allowance = rule.parameters.monthlyAllowance * employedMonths;
        const additional =
          ((cents(plan.tax.special) || 0) +
            (cents(plan.tax.otherDeduction) || 0)) *
          employedMonths;
        const current = Math.max(
          0,
          cnTax(
            state.income - state.deductions - allowance - additional,
            rule,
          ) - state.withheld,
        );
        state.withheld += current;
        tax = separateTax === null ? null : current + separateTax;
      } else {
        state.income = null;
        issues.add(`${m} 累计预扣规则、税前可扣缴费或收入待确认`);
      }
    } else
      issues.add("请确认居民工资 / 全日制学生累计预扣口径，或填单位扣税额");
    const deductions =
      c.social === null || c.fundEmployee === null || c.other === null
        ? null
        : c.social + c.fundEmployee + c.other;
    const cash =
      gross === null || tax === null || deductions === null
        ? null
        : gross - tax - deductions;
    // Each wage-month is a single bank payment unless the user supplies an explicit payment date.
    const row = {
      month: m,
      items,
      gross,
      tax,
      cash,
      ...c,
      breakdown: salaryItems.flatMap(
        (f) => contributionByMonth[f.month].breakdown,
      ),
    };
    result.months.push(row);
    // Allocate payroll deductions only to the salary transfer. Bonus taxes are settled on the last transfer of the month.
    const last = items
      .toSorted((a, b) => a.payDate.localeCompare(b.payDate))
      .at(-1);
    for (const f of items) {
      const ownC = f.deductionMonth
        ? contributionByMonth[f.deductionMonth]
        : null;
      const ownD = ownC
        ? ownC.social === null ||
          ownC.fundEmployee === null ||
          ownC.other === null
          ? null
          : ownC.social + ownC.fundEmployee + ownC.other
        : 0;
      f.tax = f === last ? tax : 0;
      f.social = ownC ? ownC.social : 0;
      f.other = ownC ? ownC.other : 0;
      f.employeeFund = ownC ? ownC.fundEmployee : 0;
      f.cash =
        f.gross === null || ownD === null || f.tax === null
          ? null
          : f.gross - ownD - f.tax;
    }
    const splitBoundary =
      items.some((f) => f.payDate >= window.start && f.payDate <= window.end) &&
      items.some((f) => f.payDate < window.start || f.payDate > window.end);
    if (plan.region === "CN" && splitBoundary && tax !== 0) {
      issues.add(
        `${m} 同月多笔付款跨过比较窗口，请向单位核实每笔预扣分配；暂不确定窗口内净额`,
      );
      for (const f of items)
        if (f.payDate >= window.start && f.payDate <= window.end) f.cash = null;
    }
  }
  const inWindow = flows.filter(
      (f) => f.payDate && f.payDate >= window.start && f.payDate <= window.end,
    ),
    undated = flows.some((f) => !f.payDate);
  result.gross = undated ? null : sum(inWindow, "gross");
  result.cash = undated ? null : sum(inWindow, "cash");
  result.knownGross = sum(inWindow, "gross");
  result.pendingGross = sum(
    flows.filter((f) => !f.payDate || f.payDate > window.end),
    "gross",
  );
  const earned = contributionMonths
    .filter((m) => m >= window.start.slice(0, 7) && m <= window.end.slice(0, 7))
    .map((m) => contributionByMonth[m]);
  result.fund = earned.some(
    (c) => c.fundEmployee === null || c.fundEmployer === null,
  )
    ? null
    : earned.reduce((n, c) => n + c.fundEmployee + c.fundEmployer, 0);
  result.employeeFund = sum(earned, "fundEmployee");
  result.employerFund = sum(earned, "fundEmployer");
  result.social = sum(inWindow, "social");
  result.other = sum(inWindow, "other");
  result.cashEmployeeFund = sum(inWindow, "employeeFund");
  result.tax = sum(inWindow, "tax");
  if (plan.region === "HK") {
    issues.add(
      "薪俸税预留按归属期估计，非每月工资代扣；暂缴税通知可能另含下一年度暂缴款",
    );
    for (const year of [
      ...new Set(
        flows
          .map((f) => {
            const d = f.kind === "salary" ? f.earnedEnd : f.payDate;
            return d ? +d.slice(0, 4) - (+d.slice(5, 7) < 4 ? 1 : 0) : null;
          })
          .filter(Boolean),
      ),
    ]) {
      const start = year + "-04-01",
        end = year + 1 + "-03-31",
        rule = ruleFor(ruleset, "hk-tax-" + year, start);
      const relevant = flows.filter((f) => {
        const d = f.kind === "salary" ? f.earnedEnd : f.payDate;
        return d >= start && d <= end;
      });
      const gross = sum(relevant, "taxable"),
        mpf = sum(
          contributionMonths
            .filter((m) => m >= start.slice(0, 7) && m <= end.slice(0, 7))
            .map((m) => contributionByMonth[m]),
          "fundEmployee",
        );
      let reserve = null;
      if (rule && gross !== null && mpf !== null && plan.tax.hkAnnualComplete)
        reserve = hkSalariesTax(
          gross + (cents(plan.tax.hkOtherIncome) || 0),
          mpf + (cents(plan.tax.hkOtherMpf) || 0),
          rule.parameters,
          {
            deduction: cents(plan.tax.hkOtherDeduction) || 0,
            allowance: cents(plan.tax.hkExtraAllowance) || 0,
          },
        );
      else
        issues.add(
          `${year}/${String(year + 1).slice(2)} 薪俸税：请补齐该课税年度收入、强积金及适用规则后确认`,
        );
      result.taxYears.push({
        year: `${year}/${String(year + 1).slice(2)}`,
        gross,
        mpf,
        reserve,
        rule: rule?.key,
      });
    }
    result.reserve = sum(result.taxYears, "reserve");
  } else
    result.taxYears = Object.entries(cumulatives).map(([year, c]) => ({
      year,
      withheld: c.withheld,
      annualSettlement: null,
    }));
  if (plan.currency !== (plan.region === "HK" ? "HKD" : "CNY"))
    result.cash = null;
  if (
    !skipRange &&
    cents(plan.salary) === null &&
    plan.publicQuote?.unit === plan.unit &&
    plan.publicQuote.currency === plan.currency &&
    ["day", "month"].includes(plan.unit) &&
    plan.publicQuote.min != null &&
    plan.publicQuote.max != null
  ) {
    const lower = calculateOffer(
      { ...plan, salary: plan.publicQuote.min },
      { scenario, ruleset, window, skipRange: true },
    );
    const upper = calculateOffer(
      { ...plan, salary: plan.publicQuote.max },
      { scenario, ruleset, window, skipRange: true },
    );
    if (lower.gross !== null && upper.gross !== null)
      result.grossRange = { min: lower.gross, max: upper.gross };
  }
  result.issues = [...issues];
  return result;
}
export function compareOffers(a, b, options = {}) {
  const left = calculateOffer(a, {
      ...options,
      ...(options.rulesets ? { ruleset: options.rulesets[0] } : {}),
    }),
    right = calculateOffer(b, {
      ...options,
      ...(options.rulesets ? { ruleset: options.rulesets[1] } : {}),
    });
  const comparable =
    left.currency === right.currency &&
    left.window?.start === right.window?.start &&
    left.window?.end === right.window?.end &&
    left.cash !== null &&
    right.cash !== null;
  return {
    left,
    right,
    comparable,
    cashDifference: comparable ? right.cash - left.cash : null,
    reason:
      left.currency !== right.currency
        ? "原币并列：未指定同日汇率，不计算到手差额"
        : !comparable
          ? "期间或必要资料不同，暂不计算到手差额"
          : "",
  };
}
export function snapshotOffer(plan, ruleset = RULESET) {
  return {
    plan: structuredClone(plan),
    ruleset: structuredClone(ruleset),
    algorithm: ALGORITHM_VERSION,
    fixed: calculateOffer(plan, { scenario: "fixed", ruleset }),
    target: calculateOffer(plan, { scenario: "target", ruleset }),
  };
}
