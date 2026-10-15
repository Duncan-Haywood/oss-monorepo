// Canada self-employed tax set-aside: CPP/CPP2 on net self-employment income,
// federal income tax, a user-supplied provincial rate, and the GST/HST
// small-supplier line. Figures are written from the published CRA tables
// (2025 and 2026); CRA decides. Pure functions, no I/O.

export const YEARS = {
  2025: {
    ympe: 71300, yampe: 81200, exemption: 3500,
    lowRate: 0.145, // blended 15% -> 14% for 2025
    brackets: [[57375, 0.145], [114750, 0.205], [177882, 0.26], [253414, 0.29], [Infinity, 0.33]],
    bpaMax: 16129, bpaMin: 14538, bpaFrom: 177882, bpaTo: 253414,
  },
  2026: {
    ympe: 74600, yampe: 85000, exemption: 3500,
    lowRate: 0.14,
    brackets: [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [Infinity, 0.33]],
    bpaMax: 16452, bpaMin: 14829, bpaFrom: 181440, bpaTo: 258482,
  },
};
export const CPP_BASE = 0.0495; // employee half, base
export const CPP_ENHANCED = 0.01; // employee half, first additional
export const CPP2 = 0.04; // employee half, second additional
export const SMALL_SUPPLIER = 30000;
export const INSTALMENT_LIMIT = 3000;

export const SAMPLE = {
  year: "2025",
  revenue: "85000",
  expenses: "18000",
  provincialRate: "9",
  otherCredits: "",
};

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function cpp(net, y) {
  const t = YEARS[y];
  const pens = Math.max(0, Math.min(net, t.ympe) - t.exemption);
  const base = r2(pens * CPP_BASE * 2);
  const enhanced = r2(pens * CPP_ENHANCED * 2);
  const cpp2 = r2(Math.max(0, Math.min(net, t.yampe) - t.ympe) * CPP2 * 2);
  return { pens, base, enhanced, cpp2, total: r2(base + enhanced + cpp2), credit: r2(pens * CPP_BASE) };
}

export function bpa(taxable, y) {
  const t = YEARS[y];
  if (taxable <= t.bpaFrom) return t.bpaMax;
  if (taxable >= t.bpaTo) return t.bpaMin;
  return r2(t.bpaMax - ((taxable - t.bpaFrom) / (t.bpaTo - t.bpaFrom)) * (t.bpaMax - t.bpaMin));
}

export function federalTax(taxable, y) {
  let tax = 0, lo = 0;
  for (const [hi, rate] of YEARS[y].brackets) {
    if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
    lo = hi;
  }
  return r2(tax);
}

export function compute(input) {
  const errors = [];
  const year = Object.hasOwn(YEARS, input.year) ? String(input.year) : "2025";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const provRate = num(input.provincialRate) ?? 0;
  const other = num(input.otherCredits) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your gross business revenue for the year (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (Number.isNaN(provRate) || provRate < 0 || provRate > 30) errors.push("Provincial tax rate must be between 0 and 30 percent.");
  if (Number.isNaN(other) || other < 0) errors.push("Other non-refundable credits must be 0 or more.");
  if (errors.length) return { errors };

  const t = YEARS[year];
  const net = r2(Math.max(0, revenue - expenses));
  const c = cpp(net, year);
  // CPP deduction: employer half (base+enhanced) + employee enhanced + employee&employer CPP2.
  const deduction = r2(c.pens * (CPP_BASE + CPP_ENHANCED) + c.pens * CPP_ENHANCED + c.cpp2);
  const taxable = r2(Math.max(0, net - deduction));
  const gross = federalTax(taxable, year);
  const credits = r2((bpa(taxable, year) + c.pens * CPP_BASE + other) * t.lowRate);
  const federal = r2(Math.max(0, gross - credits));
  const provincial = r2(taxable * (provRate / 100));
  const income = r2(federal + provincial);
  const total = r2(income + c.total);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfNet = net > 0 ? r2((total / net) * 100) : 0;
  const findings = [];
  const out = { errors: [], year, revenue, expenses, net, cpp: c, deduction, taxable, federal, provincial, income, total, setAsidePct, setAsideOfNet, afterTax: r2(net - total), monthly: r2(total / 12), perThousand: r2(total / Math.max(revenue, 1) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about $${total.toFixed(2)} (${setAsidePct}% of revenue, ${setAsideOfNet}% of profit): $${c.total.toFixed(2)} CPP, $${federal.toFixed(2)} federal tax and $${provincial.toFixed(2)} provincial. That is roughly $${out.perThousand.toFixed(0)} from every $1,000 you invoice.` });
  if (total > INSTALMENT_LIMIT) findings.push({ severity: "medium", title: `Estimated balance owing is above $${INSTALMENT_LIMIT.toLocaleString("en-CA")}. If it was also above that in either of the last two years, CRA expects quarterly instalments (Mar 15, Jun 15, Sep 15, Dec 15), and charges instalment interest if you skip them.` });
  if (revenue > SMALL_SUPPLIER) findings.push({ severity: "medium", title: `Revenue is above the $30,000 small-supplier limit. If taxable sales passed it over four consecutive quarters you must register for GST/HST, collect it, and remit it. That money is not yours and is not in the figure above.` });
  if (net > t.yampe) findings.push({ severity: "info", title: "Profit is above the year's additional pensionable earnings ceiling, so the second CPP tier (CPP2) is included." });
  findings.push({ severity: "info", title: "Provincial tax is estimated as a flat share of taxable income from the rate you entered. Real provincial brackets and credits differ, so treat it as a planning number." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`Canada self-employed tax set-aside, ${r.year} tax year`);
  L.push(`Revenue $${r.revenue.toFixed(2)}, expenses $${r.expenses.toFixed(2)}, net $${r.net.toFixed(2)}`);
  L.push(`CPP/CPP2: $${r.cpp.total.toFixed(2)}`);
  L.push(`Federal tax: $${r.federal.toFixed(2)}`);
  L.push(`Provincial (estimate): $${r.provincial.toFixed(2)}`);
  L.push(`Set aside: $${r.total.toFixed(2)} (${r.setAsidePct}% of revenue, $${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on canada.ca. Not tax advice.");
  return L.join("\n");
}
