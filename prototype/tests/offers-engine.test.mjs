import test from "node:test";
import assert from "node:assert/strict";
import { calculateLiving, validLivingBudget } from "../src/features/offers/livingBudget.mjs";
import { livingCities } from "../src/features/offers/livingReferences.mjs";
import {
  calculateOffer,
  compareOffers,
  emptyOffer,
  firstYearEnd,
  RULESET,
  hkSalariesTax,
  snapshotOffer,
} from "../src/features/offers/offerEngine.mjs";
import {
  privateDraftFromOpportunity,
  draftHasInput,
  offerDraftKey,
  readOfferDrafts,
} from "../src/features/offers/offerDrafts.mjs";

test("living budget keeps unknown costs and pay distinct from zero and compares actual housing choices", () => {
  const p = emptyOffer();
  const run = () => calculateLiving(p, { months: [] });
  assert.equal(run().balance, null);
  p.livingBudget = { city: "shenzhen", wallets: { CN: { net: 8000, goal: 3000 } },
    places: { shenzhen: { shared: 1800, solo: 3500, daily: 2500, fixed: 500 } } };
  let b = run();
  assert.equal(b.balance, 320000);
  assert.equal(b.rentLimit, 200000);
  assert.equal(b.afterGoal, 20000);
  assert.equal(b.rentShare, 23);
  assert.equal(b.rentChange, 170000);
  p.livingBudget.places.shenzhen.housing = "solo";
  assert.equal(run().balance, 150000);
  p.livingBudget.city = "custom";
  assert.equal(run().rent, null);
  assert.equal(run().balance, null);
  p.livingBudget.places.custom = { shared: 0, daily: 0, fixed: 0 };
  p.livingBudget.wallets.CN.net = 0;
  assert.equal(run().balance, 0);
  assert.equal(run().rentShare, null);
  p.livingBudget.places.custom.daily = 300;
  assert.equal(run().balance, -30000);
  p.livingBudget.city = "kowloon";
  assert.equal(run().income.amount, null);
  assert.equal(run().goal, null);
  assert.equal(run().rent, 440 * 18 * 100);
  assert.equal(run().fixed, 39800);
  assert.equal(run().daily, 900500);
  p.livingBudget.city = "shenzhen";
  assert.equal(run().rent, 350000);
});

test("living budget can reuse a specific payroll month and marks incomplete deductions or Hong Kong tax reserves", () => {
  const p = { ...emptyOffer(), region: "HK", currency: "HKD", salary: 18000 };
  const noPayroll = { months: [] };
  let b = calculateLiving(p, noPayroll);
  assert.equal(b.income.mode, "offer");
  assert.equal(b.income.amount, 1800000);
  assert.equal(b.income.beforeDeductions, true);
  p.livingBudget = { wallets: { HK: { deductions: 1000 } } };
  assert.equal(calculateLiving(p, noPayroll).income.amount, 1700000);
  const payroll = { months: [
    { month: "2026-08", items: [{}], cash: 1830000 },
    { month: "2026-09", items: [{}], cash: 0 },
    { month: "2026-10", items: [{}], cash: null },
  ] };
  let wallet = p.livingBudget.wallets.HK;
  b = calculateLiving(p, payroll);
  assert.equal(b.income.amount, 1830000);
  assert.equal(b.income.beforeDeductions, true);
  wallet.reserve = 1300;
  assert.equal(calculateLiving(p, payroll).income.amount, 1700000);
  wallet.month = "2026-09"; wallet.reserve = 0;
  assert.equal(calculateLiving(p, payroll).income.amount, 0);
  wallet.month = "2026-10";
  assert.equal(calculateLiving(p, payroll).income.amount, null);
  wallet.mode = "gross"; wallet.gross = 300; wallet.deductions = 310;
  assert.equal(calculateLiving(p, payroll).income.amount, null);
  wallet.deductions = 0;
  assert.equal(calculateLiving(p, payroll).income.beforeDeductions, false);
  delete wallet.mode; wallet.net = 37.42;
  assert.equal(calculateLiving(p, payroll).income.amount, 3742);
  p.livingBudget.city = "beijing";
  assert.equal(calculateLiving(p, payroll).income.amount, null);
  assert.equal(calculateLiving(p, payroll).income.hasOffer, false);
});

test("living budget rejects malformed private extensions and an unlisted workplace has no assumed rent", () => {
  assert.ok(validLivingBudget({ city: "custom:虚构市", places: { "custom:虚构市": { housing: "free", daily: 0 } } }));
  for (const invalid of [null, [], { city: "unknown" }, { wallets: null }, { places: [] },
    { wallets: { CN: { gross: -1 } } }, { wallets: { HK: { month: "2026-13" } } },
    { places: { shenzhen: { shared: "2000" } } }, { city: "custom:"+"a".repeat(61) }])
    assert.equal(validLivingBudget(invalid), false);
  const p = { ...emptyOffer(), city: "虚构市" };
  assert.equal(calculateLiving(p, { months: [] }).rent, null);
  assert.equal(livingCities.filter(c => c.region === "CN" && c.rent).length, 50);
  assert.equal(new Set(livingCities.map(c => c.id)).size, livingCities.length);
  assert.equal(calculateLiving({ ...p, city: "重庆市" }, { months: [] }).rent, 89050);
});

test("public opportunity confirmation creates clean internship terms and keeps raw currency/unit/range; drafts isolate owners", () => {
  const item = {
    id: "public-fiction",
    version: 3,
    status: "open",
    regionCode: "HK",
    city: "香港",
    title: "虚构实习",
    company: "测试公司",
    compensation: { currency: "HKD", unit: "hour", min: 80, max: 100 },
  };
  const p = privateDraftFromOpportunity(item);
  assert.equal(p.kind, "internship");
  assert.equal(p.period, "contract");
  assert.equal(p.unit, "hour");
  assert.equal(p.currency, "HKD");
  assert.equal(p.salary, null);
  assert.equal(p.start, "");
  assert.equal(p.end, "");
  assert.equal(p.contributions.social, null);
  assert.equal(p.bonuses.length, 0);
  assert.equal(p.source, "个人假设");
  assert.deepEqual(p.publicQuote, item.compensation);
  assert.deepEqual(p.opportunity, { id: item.id, version: 3 });
  assert.equal(draftHasInput(emptyOffer()), false);
  assert.equal(draftHasInput({ ...emptyOffer(), salary: 10 }), true);
  const data = new Map(),
    storage = { getItem: (key) => data.get(key) };
  data.set(
    offerDraftKey("a"),
    JSON.stringify({ plans: [p, emptyOffer()], ruleSets: [RULESET, RULESET] }),
  );
  assert.equal(readOfferDrafts(storage, "a").plans[0].currency, "HKD");
  assert.equal(readOfferDrafts(storage, "b"), null);
  assert.equal(readOfferDrafts(storage, "guest"), null);
  assert.throws(() =>
    privateDraftFromOpportunity({ ...item, status: "expired" }),
  );
  const ranged = privateDraftFromOpportunity({
    ...item,
    compensation: { currency: "HKD", unit: "day", min: 500, max: 700 },
  });
  Object.assign(ranged, { start: "2026-04-01", end: "2026-09-30", days: 16 });
  const estimate = calculateOffer(ranged);
  assert.deepEqual(estimate.grossRange, { min: 4800000, max: 6720000 });
  assert.equal(estimate.cash, null);
  assert.equal(ranged.salary, null);
});

test("HK period-after bonus has explicit MPF confirmation instead of silently zero deductions", () => {
  const p = hk();
  p.salary = 10000;
  p.end = "2026-06-30";
  p.bonuses = [
    { id: "after", amount: 10000, fixed: true, payDate: "2026-07-28" },
  ];
  const window = { start: "2026-04-01", end: "2026-07-31" };
  let r = calculateOffer(p, { window });
  assert.equal(r.cash, null);
  assert.match(r.issues.join(), /期后额外薪酬/);
  p.monthly["2026-07"] = {
    contributions: { fundEmployee: 500, fundEmployer: 500 },
  };
  r = calculateOffer(p, { window });
  assert.equal(r.months.at(-1).cash, 950000);
  assert.equal(r.cash, 3850000);
});
function sample(which = "A") {
  const p = emptyOffer(which);
  Object.assign(p, {
    start: "2026-01-01",
    salary: which === "A" ? 20000 : 22000,
    allowance: 0,
  });
  p.tax.mode = "resident";
  p.contributions = {
    mode: "manual",
    social: 2000,
    fundEmployee: which === "A" ? 2000 : 1200,
    fundEmployer: which === "A" ? 2000 : 1200,
    deductible: which === "A" ? 4000 : 3200,
    other: 0,
  };
  p.bonuses = [
    {
      id: "bonus",
      clauseKey: "bonus",
      label: "年终额外薪酬",
      amount: which === "A" ? 40000 : 16000,
      fixed: which !== "A",
      payDate: "2026-12-28",
    },
  ];
  return p;
}
test("design benchmark: 214520 / 181320 / 222200 and each payslip reconcile", () => {
  const a = calculateOffer(sample()),
    fixed = calculateOffer(sample(), { scenario: "fixed" }),
    b = calculateOffer(sample("B"));
  assert.equal(a.cash, 21452000);
  assert.equal(fixed.cash, 18132000);
  assert.equal(b.cash, 22220000);
  assert.equal(a.fund, 4800000);
  assert.equal(b.fund, 2880000);
  assert.equal(a.tax, 1748000);
  assert.equal(b.tax, 1940000);
  assert.equal(a.months[0].tax, 33000);
  assert.equal(a.months[0].cash, 1567000);
  assert.equal(a.months.at(-1).tax, 790000);
  assert.equal(a.months.at(-1).cash, 4810000);
  assert.equal(
    a.months.reduce((s, r) => s + r.cash, 0),
    a.cash,
  );
  assert.equal(compareOffers(sample(), sample("B")).cashDifference, 768000);
});
test("outside-window award is earned/pending; unknown date does not become zero", () => {
  const p = sample();
  p.bonuses[0].payDate = "2027-03-28";
  const r = calculateOffer(p);
  assert.equal(r.cash, 18132000);
  assert.equal(r.pendingGross, 4000000);
  p.bonuses[0].payDate = "";
  const unknown = calculateOffer(p);
  assert.equal(unknown.cash, null);
  assert.equal(unknown.knownGross, 24000000);
  assert.equal(calculateOffer(p, { scenario: "fixed" }).cash, 18132000);
});
test("first twelve months are inclusive, including leap start and mid-month", () => {
  assert.equal(firstYearEnd("2026-07-15"), "2027-07-14");
  assert.equal(firstYearEnd("2024-02-29"), "2025-02-28");
  const p = sample();
  p.start = "2026-07-15";
  p.bonuses = [];
  assert.deepEqual(calculateOffer(p).window, {
    start: "2026-07-15",
    end: "2027-07-14",
  });
});
test("cumulative withholding restarts by payment year and new-employer start", () => {
  const p = sample();
  p.start = "2026-12-01";
  p.end = "2027-02-28";
  p.period = "contract";
  p.bonuses = [];
  const r = calculateOffer(p);
  assert.equal(r.months[0].tax, 33000);
  assert.equal(r.months[1].tax, 33000);
  assert.equal(r.months[2].tax, 33000);
  p.payOffset = 1;
  const shifted = calculateOffer(p);
  assert.equal(shifted.months[0].month, "2027-01");
  assert.equal(shifted.cash, 3134000);
  assert.equal(shifted.pendingGross, 2000000);
});
test("daily internship defaults to full contract and requires attendance / deduction confirmation", () => {
  const p = emptyOffer();
  Object.assign(p, {
    start: "2026-01-01",
    end: "2026-06-30",
    kind: "internship",
    period: "contract",
    unit: "day",
    salary: 300,
    days: 16,
  });
  const r = calculateOffer(p);
  assert.equal(r.gross, 2880000);
  assert.equal(r.cash, null);
  p.monthly["2026-02"] = { days: 0 };
  assert.equal(calculateOffer(p).gross, 2400000);
  p.end = "2026-04-30";
  p.monthly = {};
  assert.equal(calculateOffer(p).gross, 1920000);
  p.days = null;
  assert.equal(calculateOffer(p).gross, null);
});
test("unknown is distinct from explicitly zero, with unit tax and deductions editable", () => {
  const p = emptyOffer();
  Object.assign(p, {
    start: "2026-01-01",
    end: "2026-01-31",
    period: "contract",
    salary: 4800,
  });
  p.tax = { ...p.tax, mode: "manual", manual: 0 };
  assert.equal(calculateOffer(p).cash, null);
  Object.assign(p.contributions, {
    social: 0,
    fundEmployee: 0,
    fundEmployer: 0,
    deductible: 0,
  });
  assert.equal(calculateOffer(p).cash, 480000);
  p.monthly["2026-01"] = { tax: 20, contributions: { other: 50 } };
  assert.equal(calculateOffer(p).cash, 473000);
});
test("trial proration is visible and exact employer monthly override wins", () => {
  const p = sample();
  p.end = "2026-01-31";
  p.period = "contract";
  p.bonuses = [];
  p.trialEnd = "2026-01-15";
  p.trialPercent = 80;
  assert.equal(
    calculateOffer(p).gross,
    Math.round((2000000 * (16 + 15 * 0.8)) / 31),
  );
  p.monthly["2026-01"] = { gross: 18000 };
  assert.equal(calculateOffer(p).gross, 1800000);
});
test("duplicate bonus source only counted once; separate annual award expiry and annual use", () => {
  const p = sample();
  p.bonuses.push({ ...p.bonuses[0], id: "second" });
  assert.equal(calculateOffer(p).gross, 28000000);
  assert.match(calculateOffer(p).issues.join(), /重复/);
  p.bonuses = [{ ...p.bonuses[0], separate: true }];
  assert.equal(calculateOffer(p).months.at(-1).tax, 489000);
  p.tax.bonusUsedYears = ["2026"];
  assert.equal(calculateOffer(p).cash, null);
  p.tax.bonusUsedYears = [];
  p.bonuses[0].payDate = "2028-01-28";
  const r = calculateOffer(p, {
    window: { start: "2026-01-01", end: "2028-12-31" },
  });
  assert.equal(r.cash, null);
  assert.match(r.issues.join(), /有效期/);
});
test("Shenzhen medical has its own clamped base and effective period; missing branches remain unknown", () => {
  const p = sample();
  p.city = "深圳";
  p.bonuses = [];
  p.contributions.mode = "itemized";
  p.contributions.items = { medical: { rule: "sz-medical-1", base: 3000 } };
  let r = calculateOffer(p);
  const medical = r.months[0].breakdown.find((x) => x.name === "医疗");
  assert.equal(medical.base, 672700);
  assert.equal(medical.employee, 13454);
  assert.equal(medical.employer, 40362);
  assert.equal(r.cash, null);
  p.start = "2027-01-01";
  p.period = "contract";
  p.end = "2027-01-31";
  r = calculateOffer(p);
  assert.equal(
    r.months[0].breakdown.find((x) => x.name === "医疗").employee,
    null,
  );
});
function hk() {
  const p = emptyOffer();
  Object.assign(p, {
    region: "HK",
    currency: "HKD",
    start: "2026-04-01",
    end: "2027-03-31",
    period: "contract",
    salary: 40000,
  });
  Object.assign(p.tax, { hkMpf: "regular", hkAnnualComplete: true });
  return p;
}
test("Hong Kong cash excludes salaries tax; MPF holiday and cap shown on both sides", () => {
  const r = calculateOffer(hk());
  assert.equal(r.months[0].fundEmployee, 0);
  assert.equal(r.months[0].fundEmployer, 150000);
  assert.equal(r.months[1].fundEmployee, 150000);
  assert.equal(r.months[0].cash, 4000000);
  assert.equal(r.months[1].cash, 3850000);
  assert.equal(r.tax, 0);
  assert.equal(r.cash, 46350000);
  assert.equal(r.reserve, 3614500);
});
test("MPF lower bound, 60-day threshold, employee holiday incomplete period and exemption", () => {
  const p = hk();
  p.salary = 7000;
  let r = calculateOffer(p);
  assert.equal(r.months[1].fundEmployee, 0);
  assert.equal(r.months[1].fundEmployer, 35000);
  p.end = "2026-04-30";
  r = calculateOffer(p);
  assert.equal(r.fund, 0);
  p.end = "2026-07-31";
  p.start = "2026-04-15";
  r = calculateOffer(p);
  assert.equal(r.months[0].fundEmployee, null);
  assert.equal(r.months[1].fundEmployee, 0);
  assert.equal(r.months[2].fundEmployee, 0); // low income
  p.salary = 40000;
  r = calculateOffer(p);
  assert.equal(r.months[1].fundEmployee, 0);
  assert.equal(r.months[2].fundEmployee, 150000);
  p.tax.hkMpf = "exempt";
  assert.equal(calculateOffer(p).fund, 0);
});
test("HK salaries tax uses April tax years, published allowances, MPF deduction cap and two-tier standard", () => {
  const rule = RULESET.rules.find((r) => r.key === "hk-tax-2026");
  assert.equal(hkSalariesTax(50000000, 3000000, rule.parameters), 3929000);
  assert.equal(hkSalariesTax(1000000000, 0, rule.parameters), 155000000);
  const p = hk();
  p.start = "2026-03-01";
  p.end = "2026-05-31";
  p.tax.hkMpf = "exempt";
  assert.deepEqual(
    calculateOffer(p).taxYears.map((y) => y.year),
    ["2025/26", "2026/27"],
  );
  p.tax.hkAnnualComplete = false;
  assert.equal(calculateOffer(p).reserve, null);
});
test("different currencies or periods do not get cash ranking; snapshot pins reproducible rules", () => {
  assert.equal(compareOffers(sample(), hk()).comparable, false);
  assert.match(compareOffers(sample(), hk()).reason, /原币/);
  const p = sample("B");
  p.start = "2026-02-01";
  assert.equal(compareOffers(sample(), p).cashDifference, null);
  const snapshot = snapshotOffer(sample());
  assert.equal(snapshot.target.cash, 21452000);
  const changed = structuredClone(RULESET);
  changed.rules[0].parameters.monthlyAllowance = 0;
  assert.notEqual(
    calculateOffer(snapshot.plan, { ruleset: changed }).cash,
    snapshot.target.cash,
  );
  assert.equal(
    calculateOffer(snapshot.plan, { ruleset: snapshot.ruleset }).cash,
    snapshot.target.cash,
  );
});
