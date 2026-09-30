// Self-employed health insurance deduction (Form 7206, Schedule 1 line 17):
// caps the deduction at the business's earned income after half of self-
// employment tax and retirement-plan contributions, drops months you could have
// joined an employer-subsidized plan, caps long-term-care premiums by age, and
// prices the federal and state income tax saved. Deterministic and local.
// Tax-year constants are 2026 figures and are exported so the page can name them.

export const TAX_YEAR = 2026;
export const SS_WAGE_BASE = 184500;
// Eligible long-term-care premium limit per person by age at year end (2026).
export const LTC_LIMITS = [
  { maxAge: 40, limit: 500 },
  { maxAge: 50, limit: 930 },
  { maxAge: 60, limit: 1860 },
  { maxAge: 70, limit: 4960 },
  { maxAge: Infinity, limit: 6200 },
];

export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
const blank = (v) => String(v ?? "").trim() === "";
const opt = (v, dflt = 0) => (blank(v) ? dflt : parseNum(v));

export function ltcLimit(age) {
  return LTC_LIMITS.find((r) => age <= r.maxAge).limit;
}

// Self-employment tax on net profit; `otherWages` already used Social Security room.
export function seTax(netProfit, otherWages = 0) {
  if (netProfit < 400) return 0;
  const base = netProfit * 0.9235;
  const room = Math.max(0, SS_WAGE_BASE - otherWages);
  return Math.min(base, room) * 0.124 + base * 0.029;
}

export function parseInput(raw) {
  const num = (k, dflt = 0) => opt(raw[k], dflt);
  const entityRaw = String(raw.entity ?? "").trim().toLowerCase();
  const p = {
    entity: /s.?corp|shareholder|2%/.test(entityRaw) ? "scorp" : "sole",
    netProfit: num("netProfit", NaN),
    wages: num("wages"),
    otherWages: num("otherWages"),
    retirement: num("retirement"),
    medical: num("medical"),
    medicare: num("medicare"),
    ltc: num("ltc"),
    age: num("age", 45),
    ineligibleMonths: num("ineligibleMonths"),
    fedRate: num("fedRate", 24) / 100,
    stateRate: num("stateRate") / 100,
  };
  return p;
}

export function analyze(raw) {
  const p = parseInput(raw);
  const bad = (m) => ({ error: m });
  const scorp = p.entity === "scorp";
  if (scorp) {
    if (Number.isNaN(p.wages) || p.wages <= 0) return bad("Enter the W-2 wages your S corporation pays you (Box 1 before the health insurance is added).");
  } else if (Number.isNaN(p.netProfit) || p.netProfit <= 0) {
    return bad("Enter the net profit from your business (Schedule C line 31, or your K-1 earnings) as a positive number.");
  }
  for (const k of ["medical", "medicare", "ltc", "retirement", "otherWages", "wages"]) if (Number.isNaN(p[k]) || p[k] < 0) return bad("Premiums, wages and contributions must be zero or more.");
  if (p.medical + p.medicare + p.ltc <= 0) return bad("Enter at least one premium you paid this year.");
  if (Number.isNaN(p.age) || p.age < 18 || p.age > 110) return bad("Age must be between 18 and 110.");
  if (Number.isNaN(p.ineligibleMonths) || p.ineligibleMonths < 0 || p.ineligibleMonths > 12) return bad("Months eligible for an employer plan must be between 0 and 12.");
  if ([p.fedRate, p.stateRate].some((r) => Number.isNaN(r) || r < 0 || r > 0.6)) return bad("Tax rates must be between 0 and 60 percent.");
  if (scorp) p.netProfit = p.wages;

  const cap = ltcLimit(p.age);
  const ltcAllowed = Math.min(p.ltc, cap);
  const paid = p.medical + p.medicare + p.ltc;
  const qualifying = p.medical + p.medicare + ltcAllowed;
  const monthsOk = 12 - p.ineligibleMonths;
  const eligiblePremiums = qualifying * (monthsOk / 12);
  const se = scorp ? 0 : seTax(p.netProfit, p.otherWages);
  const limit = scorp ? p.wages : Math.max(0, p.netProfit - se / 2 - p.retirement);
  const deduction = Math.min(eligiblePremiums, limit);
  const notDeducted = paid - deduction;
  const combined = p.fedRate + p.stateRate;
  const taxSaved = deduction * combined;
  const limitedByProfit = eligiblePremiums > limit;

  // Smallest profit (or wages) at which the full eligible premium fits under the ceiling.
  let needed = null;
  if (limitedByProfit) {
    if (scorp) needed = eligiblePremiums;
    else {
      let lo = 0, hi = Math.max(p.netProfit, 1);
      const fits = (np) => np - seTax(np, p.otherWages) / 2 - p.retirement >= eligiblePremiums;
      while (!fits(hi) && hi < 1e9) hi *= 2;
      for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
      needed = hi;
    }
  }

  const scenarios = [0.5, 0.75, 1, 1.25, 1.5].map((m) => {
    const income = p.netProfit * m;
    const lim = scorp ? income : Math.max(0, income - seTax(income, p.otherWages) / 2 - p.retirement);
    const d = Math.min(eligiblePremiums, lim);
    return { label: Math.round(m * 100) + "% of " + (scorp ? "wages" : "profit"), income, limit: lim, deduction: d, taxSaved: d * combined };
  });

  const findings = [];
  if (limitedByProfit) findings.push({ severity: "medium", title: "Your profit caps the deduction", detail: `The deduction can't exceed the earned income from the business after the adjustments, $${money(limit)} here, so $${money(eligiblePremiums - deduction)} of eligible premiums is not deductible this way. It would fit fully at about $${money(needed)} of ${scorp ? "wages" : "net profit"}.` });
  if (p.ineligibleMonths > 0) findings.push({ severity: "medium", title: "Months you could join an employer plan don't count", detail: `${p.ineligibleMonths} month(s) were removed. Any month you or your spouse were eligible for a subsidized employer plan is excluded, even if you did not enroll. This tool prorates by month; Form 7206 does the same month by month.` });
  if (p.ltc > cap) findings.push({ severity: "info", title: "Long-term-care premiums are capped by age", detail: `At age ${p.age} the ${TAX_YEAR} limit is $${money(cap)}, so $${money(p.ltc - cap)} of the long-term-care premium is not counted.` });
  if (notDeducted > 0.5) findings.push({ severity: "info", title: "Premiums not deducted here may still help elsewhere", detail: `$${money(notDeducted)} of premiums did not reduce your income through this deduction. Unreimbursed medical costs can be itemized on Schedule A, but only the part above 7.5% of adjusted gross income.` });
  if (!scorp) findings.push({ severity: "info", title: "This deduction does not lower self-employment tax", detail: `It is taken on Schedule 1, below the line, so it reduces income tax only. Your self-employment tax of about $${money(se)} is computed on profit before it. Do not also deduct the same premiums as a business expense.` });
  if (scorp) findings.push({ severity: "info", title: "S corporation shareholders: the premiums go in W-2 Box 1", detail: "For a more-than-2% shareholder the corporation must pay or reimburse the premiums and include them in Box 1 wages (not Boxes 3 and 5). If that was skipped, the deduction is generally not available. Ask your preparer." });
  findings.push({ severity: "info", title: "Marketplace subsidies are not modelled", detail: "If you claim the premium tax credit, the deduction and the credit depend on each other, and the correct figure needs an iterative calculation. Use Form 7206 and Form 8962, or your preparer, for that year." });

  return { p, scorp, cap, ltcAllowed, paid, qualifying, eligiblePremiums, se, limit, deduction, notDeducted, taxSaved, afterTaxCost: paid - taxSaved, needed, limitedByProfit, scenarios, findings };
}

export function sampleInput() {
  return { entity: "sole", netProfit: "58000", wages: "", otherWages: "", retirement: "4000", medical: "9600", medicare: "", ltc: "", age: "47", ineligibleMonths: "0", fedRate: "22", stateRate: "5" };
}

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
export function reportCsv(a) {
  const rows = [["Item", "Amount"],
    ["Premiums paid", round2(a.paid)],
    ["Premiums that qualify", round2(a.qualifying)],
    ["Premiums after employer-plan months removed", round2(a.eligiblePremiums)],
    ["Half of self-employment tax", round2(a.se / 2)],
    ["Retirement contributions", round2(a.p.retirement)],
    ["Deduction ceiling", round2(a.limit)],
    ["Deduction", round2(a.deduction)],
    ["Estimated income tax saved", round2(a.taxSaved)]];
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}
