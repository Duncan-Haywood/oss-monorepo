// Augusta rule (Internal Revenue Code section 280A(g)): a homeowner who rents
// a home to anyone for 14 days or fewer in a year excludes that rent from
// income. When the renter is the owner's own business (a board meeting, a
// retreat, a client event held at the house) and the rent is a fair market
// price, the business deducts the rent and the owner reports nothing. This
// tool prices that trade-off. Pure arithmetic on numbers the visitor types;
// no network, and no rate or rule is looked up: every tax rate is an input.

export const MAX_DAYS = 14;
export const QBI_SHARE = 0.2; // a deduction reduces qualified business income, and the 20% deduction with it
export const SE_BASE_SHARE = 0.9235; // self-employment tax applies to 92.35 percent of net earnings
export const SE_FULL = 15.3;
export const SE_MEDICARE_ONLY = 2.9;

export function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[$,\s]/g, "").replace(/%$/, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function money(n) {
  return Math.round(n).toLocaleString("en-US");
}

const ENTITIES = {
  se: "Sole proprietor, single-member LLC or general partner (self-employment tax applies)",
  s: "S corporation (deduction reduces income tax only)",
  c: "C corporation (deduction is taken at the corporate rate)",
};

// Savings from renting `days` at `rate` a day to the business.
export function savings(p, days = p.days, rate = p.rate) {
  const rent = days * rate;
  const fed = rent * (p.fedRate / 100) * (p.entity !== "c" && p.qbi ? 1 - QBI_SHARE : 1);
  const se = p.entity === "se" ? rent * SE_BASE_SHARE * (p.seRate / 100) : 0;
  const state = rent * (p.stateRate / 100);
  const gross = fed + se + state;
  return { rent, fed, se, state, gross, net: gross - p.annualCost };
}

export function parseInput(raw) {
  const num = (k, label, { min = 0, max = Infinity, blank = null } = {}) => {
    const n = parseNum(raw[k]);
    if (n === null) {
      if (blank === null) return { err: `${label} is required.` };
      return { v: blank };
    }
    if (Number.isNaN(n)) return { err: `${label} is not a number.` };
    if (n < min || n > max) return { err: `${label} must be between ${min} and ${max === Infinity ? "any amount" : max}.` };
    return { v: n };
  };
  const p = {};
  const fields = [
    ["days", "Days rented", { min: 0 }],
    ["rate", "Daily rent", { min: 0 }],
    ["fedRate", "Federal tax rate", { min: 0, max: 60 }],
    ["stateRate", "State tax rate", { min: 0, max: 25, blank: 0 }],
    ["setupCost", "Setup cost", { min: 0, blank: 0 }],
    ["annualCost", "Yearly cost", { min: 0, blank: 0 }],
    ["years", "Years", { min: 1, max: 30, blank: 5 }],
  ];
  for (const [k, label, opt] of fields) {
    const r = num(k, label, opt);
    if (r.err) return { error: r.err };
    p[k] = r.v;
  }
  if (p.days > MAX_DAYS) {
    return { error: `The rule covers at most ${MAX_DAYS} days a year. Above that the rent is taxable income, so this tool does not price it.` };
  }
  if (!Number.isInteger(p.days)) return { error: "Days rented must be a whole number." };
  p.entity = ["se", "s", "c"].includes(raw.entity) ? raw.entity : "se";
  p.qbi = raw.qbi === "yes";
  p.ssBase = raw.ssBase === "over" ? "over" : "under";
  const se = num("seRate", "Self-employment tax rate", { min: 0, max: 15.3, blank: p.ssBase === "over" ? SE_MEDICARE_ONLY : SE_FULL });
  if (se.err) return { error: se.err };
  p.seRate = se.v;
  return { p };
}

export function analyze(raw) {
  const { p, error } = parseInput(raw);
  if (error) return { error };
  const s = savings(p);
  const yearNet = s.net;
  const totalNet = yearNet * p.years - p.setupCost;
  const perDay = p.days > 0 ? s.gross / p.days : 0;
  const perDayCost = p.rate > 0 ? s.gross / s.rent : 0; // tax saved per dollar of rent
  const dayTable = [];
  for (const d of [1, 2, 4, 7, 10, 14]) dayTable.push({ days: d, ...savings(p, d) });
  const rateTable = [1, 0.75, 0.5, 0.25].map((f) => ({ label: f === 1 ? "Your rate" : `${Math.round(f * 100)}% of your rate`, rate: p.rate * f, ...savings(p, p.days, p.rate * f) }));
  const findings = [];
  if (p.days === 0 || p.rate === 0) {
    findings.push({ severity: "info", title: "Nothing to deduct", detail: "With zero days or a zero rent there is no deduction and no saving." });
  } else {
    if (yearNet <= 0) {
      findings.push({ severity: "medium", title: "Costs cancel the saving", detail: `At ${p.days} days and $${money(p.rate)} a day the yearly tax saved ($${money(s.gross)}) does not cover the yearly cost ($${money(p.annualCost)}).` });
    }
    if (p.setupCost > 0 && yearNet > 0) {
      const y = p.setupCost / yearNet;
      findings.push({ severity: "info", title: "Setup pays back", detail: `The one-time setup cost is recovered after about ${y < 1 ? "one year (under 12 months)" : y.toFixed(1) + " years"} of repeating the arrangement.` });
    }
    if (p.entity === "c") {
      findings.push({ severity: "info", title: "Corporate deduction, personal exclusion", detail: "The corporation deducts the rent at the rate you entered. The rent you receive is excluded from your own income, so the corporation-level saving is the whole benefit." });
    }
    if (p.entity === "s") {
      findings.push({ severity: "info", title: "No payroll-tax saving", detail: "An S corporation's rent deduction lowers income passed through to you, not your wages, so no self-employment or payroll tax is saved here." });
    }
    findings.push({ severity: "medium", title: "The rent must be a defensible fair price", detail: "A rate well above comparable local venues invites the deduction to be cut back. The table below shows what the saving would be at lower rates; keep written comparables for the rate you use." });
    findings.push({ severity: "info", title: "Paperwork that supports the deduction", detail: "A written rental agreement, a real business purpose for each day (minutes, agenda, attendee list), payment from the business to you, and a record of the days rented. The exclusion needs the 14-day limit respected in every year." });
  }
  return { p, ...s, yearNet, totalNet, perDay, perDollar: perDayCost, dayTable, rateTable, findings };
}

export function sampleInput() {
  return { days: "12", rate: "1200", entity: "s", fedRate: "32", stateRate: "5", qbi: "yes", ssBase: "under", seRate: "", setupCost: "600", annualCost: "250", years: "5" };
}

export function reportCsv(a) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const r = (label, v) => `${q(label)},${q(v)}`;
  const lines = [
    "Item,Value",
    r("Entity", ENTITIES[a.p.entity]),
    r("Days rented", a.p.days),
    r("Daily rent", a.p.rate.toFixed(2)),
    r("Rent (excluded from your income)", a.rent.toFixed(2)),
    r("Federal income tax saved", a.fed.toFixed(2)),
    r("Self-employment tax saved", a.se.toFixed(2)),
    r("State income tax saved", a.state.toFixed(2)),
    r("Total tax saved per year", a.gross.toFixed(2)),
    r("Yearly cost", a.p.annualCost.toFixed(2)),
    r("Net saving per year", a.yearNet.toFixed(2)),
    r(`Net saving over ${a.p.years} years after setup`, a.totalNet.toFixed(2)),
    "",
    "Days,Rent,Total tax saved",
    ...a.dayTable.map((d) => `${d.days},${d.rent.toFixed(2)},${d.gross.toFixed(2)}`),
  ];
  return lines.join("\n");
}
