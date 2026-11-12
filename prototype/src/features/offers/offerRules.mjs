// Reviewed 2026-11-12. Open-ended statutory rules are bounded to this review horizon.
// No inferred Shenzhen pension, unemployment, injury or housing-fund parameters.
export const ALGORITHM_VERSION = "offers-1.0.0";
export const RULESET = {
  version: "official-2026-11-12",
  reviewedAt: "2026-11-12",
  rules: [
    {
      key: "cn-wage",
      region: "CN",
      category: "tax",
      audience: "resident-wage",
      from: "2019-01-01",
      to: "2027-12-31",
      source:
        "https://www.chinatax.gov.cn/n810341/n810760/c3959585/content.html",
      rounding: "cent",
      parameters: {
        monthlyAllowance: 500000,
        brackets: [
          [3600000, 300, 0],
          [14400000, 1000, 252000],
          [30000000, 2000, 1692000],
          [42000000, 2500, 3192000],
          [66000000, 3000, 5292000],
          [96000000, 3500, 8592000],
          [null, 4500, 18192000],
        ],
      },
    },
    {
      key: "cn-bonus",
      region: "CN",
      category: "bonus",
      audience: "eligible-once-year",
      from: "2023-01-01",
      to: "2027-12-31",
      source: "https://fgk.chinatax.gov.cn/zcfgk/c102416/c5211524/content.html",
      rounding: "cent",
      parameters: {},
    },
    {
      key: "cn-student",
      region: "CN",
      category: "student",
      audience: "confirmed-fulltime-student",
      from: "2020-07-01",
      to: "2027-12-31",
      source: "https://fgk.chinatax.gov.cn/zcfgk/c100012/c5194937/content.html",
      rounding: "cent",
      parameters: { incomeBps: 8000 },
    },
    {
      key: "sz-medical-1",
      region: "CN",
      category: "medical",
      audience: "深圳一档职工",
      from: "2026-01-01",
      to: "2026-12-31",
      source:
        "https://hsa.sz.gov.cn/gkmlpt/content/12/12567/post_12567884.html",
      rounding: "cent",
      parameters: {
        floor: 672700,
        ceiling: 3363300,
        employeeBps: 200,
        employerBps: 600,
      },
    },
    {
      key: "hk-mpf",
      region: "HK",
      category: "mpf",
      audience: "regular-monthly-18-64-60days",
      from: "2026-04-01",
      to: "2027-03-31",
      source:
        "https://www.mpfa.org.hk/en/mpf-system/mandatory-contributions/employees",
      rounding: "cent",
      parameters: {
        minimum: 710000,
        maximum: 3000000,
        bps: 500,
        dailyMinimum: 28000,
        dailyMaximum: 100000,
      },
    },
    {
      key: "hk-tax-2025",
      region: "HK",
      category: "salaries",
      audience: "basic",
      from: "2025-04-01",
      to: "2026-03-31",
      source: "https://www.ird.gov.hk/eng/pdf/pam61e.pdf",
      rounding: "dollar-down",
      parameters: {
        allowance: 13200000,
        mpfLimit: 1800000,
        reduction: 300000,
        bands: [
          [5000000, 200],
          [5000000, 600],
          [5000000, 1000],
          [5000000, 1400],
          [null, 1700],
        ],
        standardThreshold: 500000000,
        standardLowBps: 1500,
        standardHighBps: 1600,
      },
    },
    {
      key: "hk-tax-2026",
      region: "HK",
      category: "salaries",
      audience: "basic",
      from: "2026-04-01",
      to: "2027-03-31",
      source: "https://www.ird.gov.hk/eng/pdf/pam61e.pdf",
      rounding: "dollar-down",
      parameters: {
        allowance: 14500000,
        mpfLimit: 1800000,
        reduction: 0,
        bands: [
          [5000000, 200],
          [5000000, 600],
          [5000000, 1000],
          [5000000, 1400],
          [null, 1700],
        ],
        standardThreshold: 500000000,
        standardLowBps: 1500,
        standardHighBps: 1600,
      },
    },
  ],
};
export function ruleFor(ruleset, key, date) {
  return (
    ruleset?.rules?.find(
      (r) => r.key === key && r.from <= date && r.to >= date,
    ) || null
  );
}
