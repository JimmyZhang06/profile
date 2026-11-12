import { baseMonthIllustration } from './offerQuestions.mjs';
import { budgetCity, livingCities, namedLivingCity } from './livingReferences.mjs';

const modes = ['net', 'gross', 'offer'];
export const housingModes = [['shared', '合租'], ['solo', '独居'], ['free', '免租']];
const validAmount = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e9;
const cents = n => validAmount(n) ? Math.round(n * 100) : null;

// Older private plans have no budget. Keep this optional extension bounded on both sides.
export function validLivingBudget(b) {
  const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const fields = (x, allowed) => record(x) && Object.keys(x).every(k => allowed.includes(k));
  const dates = m => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
  const cityIds = livingCities.map(c => c.id);
  const validCity = id => cityIds.includes(id) || !!namedLivingCity(id);
  if (!fields(b, ['city', 'wallets', 'places']) || (b.city !== undefined && !validCity(b.city))) return false;
  const wallets = b.wallets === undefined ? {} : b.wallets, places = b.places === undefined ? {} : b.places;
  if (!fields(wallets, ['CN', 'HK']) || !record(places) || !Object.keys(places).every(validCity)) return false;
  return Object.values(wallets).every(w => fields(w, ['mode', 'net', 'gross', 'deductions', 'reserve', 'month', 'goal'])
    && Object.entries(w).every(([k,v]) => k === 'mode' ? modes.includes(v) : k === 'month' ? dates(v) : validAmount(v)))
    && Object.values(places).every(p => fields(p, ['housing', 'shared', 'solo', 'daily', 'fixed'])
      && Object.entries(p).every(([k,v]) => k === 'housing' ? housingModes.some(([mode]) => mode === v) : validAmount(v)));
}

export function budgetIncome(plan, result, city, wallet) {
  const sameCurrency = city.currency === plan.currency;
  const rows = sameCurrency ? (result.months || []).filter(r => r.items.length && Number.isSafeInteger(r.cash)) : [];
  const base = sameCurrency ? baseMonthIllustration(plan) : null;
  const hasOffer = rows.length > 0 || base !== null;
  const requested = wallet.mode ?? (wallet.net != null || !hasOffer ? 'net' : 'offer');
  const mode = requested === 'offer' && !sameCurrency ? 'net' : requested;
  const month = wallet.month || rows[0]?.month;
  const row = rows.find(r => r.month === month);
  let amount = null, beforeDeductions = false, note = '', offsetField = null;
  if (mode === 'net') {
    amount = cents(wallet.net);
    note = city.region === 'HK' ? '填写扣除个人强积金、并留出薪俸税后可用于生活的月收入。' : '填写工资实际到账的金额。';
  } else if (mode === 'gross' || (!rows.length && mode === 'offer' && base !== null)) {
    const gross = mode === 'gross' ? cents(wallet.gross) : base;
    const deduction = cents(wallet.deductions);
    beforeDeductions = deduction === null;
    offsetField = 'deductions';
    if (gross !== null && (deduction === null || deduction <= gross)) amount = gross - (deduction ?? 0);
    if (gross !== null && deduction !== null && deduction > gross) note = '每月扣缴超过了税前工资，请核对金额。';
    else if (mode === 'offer') note = '取自本方案一个完整计薪月的固定税前工资。';
    else note = '可按工资单填写个人缴费和税款。';
    if (beforeDeductions) note += ' 填入扣缴后可看到实际预算余量。';
  } else if (row) {
    amount = row.cash;
    note = '采用 ' + month + ' 本方案的预计发薪现金，含所选收入情景当月到账的奖金或津贴。';
    if (city.region === 'HK') {
      const reserve = cents(wallet.reserve);
      offsetField = 'reserve';
      beforeDeductions = reserve === null;
      amount -= reserve ?? 0;
      note += ' 香港薪俸税另行结算。';
    }
  } else {
    note = rows.length ? '请重新选择一个有发薪记录的月份。' : '本方案尚无可用月薪，可直接填写工资。';
  }
  return { mode, amount, note, beforeDeductions, offsetField, rows, month, hasOffer, sameCurrency, base };
}

export function calculateLiving(plan, result) {
  const b = plan.livingBudget || {}, city = budgetCity(plan);
  const wallet = b.wallets?.[city.region] || {}, place = b.places?.[city.id] || {};
  const housing = place.housing ?? 'shared';
  const rentFor = mode => mode === 'free' ? 0 : cents(place[mode] ?? city[mode]);
  const rent = rentFor(housing), daily = cents(place.daily ?? city.daily.amount);
  const fixed = cents(place.fixed ?? city.utilities ?? 0);
  const income = budgetIncome(plan, result, city, wallet);
  const costs = rent === null ? null : rent + daily + fixed;
  const balance = income.amount === null || costs === null ? null : income.amount - costs;
  const goal = cents(wallet.goal);
  const afterGoal = balance === null || goal === null ? null : balance - goal;
  const rentLimit = income.amount === null || goal === null ? null : income.amount - daily - fixed - goal;
  const rentShare = rent === null || !(income.amount > 0) ? null : Math.round(100 * rent / income.amount);
  const alternative = housing === 'solo' ? 'shared' : 'solo';
  const otherRent = rentFor(alternative);
  const rentChange = rent === null || otherRent === null ? null : otherRent - rent;
  return { city, wallet, place, housing, rent, daily, fixed, income, costs, balance, goal, afterGoal,
    rentLimit, rentShare, alternative, rentChange };
}
