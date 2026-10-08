// Qualified charitable distribution (QCD, IRC section 408(d)(8)) versus giving the same cash and deducting it.
// Pure functions, nothing leaves the browser.
//
// A QCD sends money straight from an IRA to a public charity (age 70 1/2 or older). The amount never enters AGI, counts toward
// the required minimum distribution, and needs no itemizing. A cash gift is paid from after-tax money: the IRA withdrawal
// stays in AGI, and the gift only helps if it is itemized or fits the new non-itemizer deduction. AGI is the number that drives
// taxable Social Security, the senior deduction phase-out, Medicare IRMAA and NIIT, so a QCD is worth more than its bracket.
//
// Tax-year figures live in FIGURES (statute / IRS inflation adjustments) and are inputs, so the page can be corrected without a
// code change. Ordinary-income brackets only: the model taxes everything at ordinary rates (preferential gain/dividend rates are
// not modelled), which slightly overstates tax but not the QCD-versus-cash difference.

export const FIGURES = {
  year: 2026,
  qcdLimit: 111000, // per person, indexed
  standard: { single: 16100, mfj: 32200 },
  extra65: { single: 2050, mfj: 1650 }, // per person 65+
  seniorBonus: 6000, // OBBBA temporary deduction, per person 65+, tax years 2025-2028
  seniorPhaseStart: { single: 75000, mfj: 150000 },
  seniorPhaseRate: 0.06,
  charityFloor: 0.005, // itemized charitable gifts are only deductible above 0.5% of AGI from 2026
  nonItemizerCap: { single: 1000, mfj: 2000 }, // cash gifts to public charities, from 2026
  ssBase: { single: [25000, 34000], mfj: [32000, 44000] }, // statutory, not indexed
  brackets: {
    single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
    mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  },
};

export const DEFAULTS = {
  filingStatus: "single",
  age: 74,
  numOver65: 1,
  iraDistribution: 40000,
  rmd: 40000,
  otherIncome: 30000,
  ssBenefits: 30000,
  itemizedOther: 8000,
  giving: 10000,
  stateRate: 0.05,
  qcdLimit: FIGURES.qcdLimit,
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

export function bracketTax(taxable, status, F = FIGURES) {
  let tax = 0, lo = 0;
  for (const [hi, rate] of F.brackets[status]) {
    if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
    lo = hi;
  }
  return tax;
}

// Taxable Social Security: provisional income = AGI before benefits + half the benefits (tax-exempt interest ignored).
export function taxableSocialSecurity(agiBefore, ss, status, F = FIGURES) {
  if (!(ss > 0)) return 0;
  const [b1, b2] = F.ssBase[status];
  const prov = agiBefore + ss / 2;
  if (prov <= b1) return 0;
  if (prov <= b2) return Math.min(ss * 0.5, 0.5 * (prov - b1));
  return Math.min(ss * 0.85, 0.85 * (prov - b2) + Math.min(ss * 0.5, 0.5 * (b2 - b1)));
}

// mode: "none" (no gift), "cash" (gift paid from after-tax money), "qcd" (gift paid straight from the IRA).
export function scenario(o, mode, F = FIGURES) {
  const s = o.filingStatus;
  const qcd = mode === "qcd" ? Math.max(0, Math.min(o.giving, o.qcdLimit, o.iraDistribution)) : 0;
  const cash = mode === "cash" ? Math.max(0, o.giving) : mode === "qcd" ? Math.max(0, o.giving - qcd) : 0; // any excess over the QCD cap is a cash gift
  const iraTaxable = o.iraDistribution - qcd;
  const before = iraTaxable + o.otherIncome;
  const ssTaxable = taxableSocialSecurity(before, o.ssBenefits, s, F);
  const agi = before + ssTaxable;
  const standard = F.standard[s] + F.extra65[s] * o.numOver65;
  const itemized = o.itemizedOther + Math.max(0, cash - F.charityFloor * agi);
  const standardPlus = standard + Math.min(cash, F.nonItemizerCap[s]);
  const itemizes = itemized > standardPlus;
  const deduction = Math.max(itemized, standardPlus);
  const senior = Math.max(0, F.seniorBonus * o.numOver65 - F.seniorPhaseRate * Math.max(0, agi - F.seniorPhaseStart[s]));
  const taxable = Math.max(0, agi - deduction - senior);
  const tax = bracketTax(taxable, s, F);
  const state = o.stateRate * agi;
  return { mode, qcd, cash, iraTaxable, ssTaxable, agi, deduction, itemizes, senior, taxable, tax, state, total: tax + state };
}

export function analyze(raw, F = FIGURES) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  if (!(o.filingStatus in F.standard)) warnings.push("Pick a filing status.");
  for (const k of ["age", "iraDistribution", "rmd", "otherIncome", "ssBenefits", "itemizedOther", "giving", "stateRate", "qcdLimit", "numOver65"]) {
    if (!Number.isFinite(o[k])) warnings.push(`${k} must be a number.`);
    else if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  }
  if (warnings.length) return { opts: o, warnings, result: null };
  if (o.age < 70.5) warnings.push("A QCD needs you to be 70 1/2 or older on the day of the transfer. Below that, the QCD column is not available to you.");
  if (o.giving > o.iraDistribution) warnings.push("The gift is larger than the IRA distribution entered: only the part that comes out of the IRA can be a QCD.");
  if (o.numOver65 > (o.filingStatus === "mfj" ? 2 : 1)) warnings.push("People 65 or older cannot exceed the number of people on the return.");
  const none = scenario(o, "none", F);
  const cash = scenario(o, "cash", F);
  const qcd = scenario(o, "qcd", F);
  const cost = (sc) => o.giving - (none.total - sc.total);
  const advantage = cash.total - qcd.total;
  const rmdLeft = Math.max(0, o.rmd - qcd.qcd);
  const grid = [0.5, 1, 2].map((m) => {
    const oo = { ...o, giving: o.giving * m };
    const c = scenario(oo, "cash", F), q = scenario(oo, "qcd", F);
    return { gift: oo.giving, cashTotal: c.total, qcdTotal: q.total, advantage: c.total - q.total };
  });
  const form = [
    ["IRA distribution (1099-R box 1)", o.iraDistribution], ["QCD excluded (1099-R box 2a lower by)", qcd.qcd],
    ["Taxable IRA distribution", qcd.iraTaxable], ["Other income", o.otherIncome], ["Taxable Social Security", qcd.ssTaxable],
    ["AGI with QCD", qcd.agi], ["AGI with cash gift", cash.agi], ["Deduction with QCD", qcd.deduction], ["Deduction with cash gift", cash.deduction],
    ["Federal tax with QCD", qcd.tax], ["Federal tax with cash gift", cash.tax], ["Federal tax with no gift", none.tax],
  ];
  return {
    opts: o, warnings, result: qcd, none, cash, qcd, advantage, costCash: cost(cash), costQcd: cost(qcd), rmdLeft,
    overCap: Math.max(0, o.giving - Math.min(o.qcdLimit, o.iraDistribution)), grid, form,
    agiDrop: cash.agi - qcd.agi,
  };
}

export function toCsv(a) {
  const rows = [["line", "usd"], ...a.form.map(([k, v]) => [k.replace(/,/g, ""), Number(v).toFixed(2)])];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
