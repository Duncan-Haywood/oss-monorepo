// Ireland self-employed tax set-aside: income tax (20%/40%), tax credits,
// Universal Social Charge (with the 3% self-employed surcharge above
// EUR 100,000) and Class S PRSI. Figures are written from the published
// Revenue and Budget 2026 tables for the 2026 tax year (calendar year) without a
// live lookup; Revenue decides. Pure functions.

export const YEARS = {
  "2026": {
    standardBand: 44000,
    rates: [0.2, 0.4],
    credits: { personal: 2000, earnedIncome: 2000 },
    usc: [[12012, 0.005], [28700, 0.02], [70044, 0.03], [Infinity, 0.08]],
    uscExempt: 13000,
    uscSurchargeFrom: 100000,
    uscSurcharge: 0.03,
    prsiRate: 0.042,
    prsiMin: 500,
    prsiFloor: 5000,
  },
};

export const SAMPLE = { year: "2026", revenue: "90000", expenses: "18000" };

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[€,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function incomeTax(profit, y) {
  const Y = YEARS[y];
  const gross = Math.min(profit, Y.standardBand) * Y.rates[0] + Math.max(0, profit - Y.standardBand) * Y.rates[1];
  const credits = Y.credits.personal + Y.credits.earnedIncome;
  return { gross: r2(gross), credits, net: r2(Math.max(0, gross - credits)) };
}

export function usc(profit, y) {
  const Y = YEARS[y];
  if (profit <= Y.uscExempt) return 0;
  let tax = 0, lo = 0;
  for (const [hi, rate] of Y.usc) {
    if (profit > lo) tax += (Math.min(profit, hi) - lo) * rate;
    lo = hi;
  }
  if (profit > Y.uscSurchargeFrom) tax += (profit - Y.uscSurchargeFrom) * Y.uscSurcharge;
  return r2(tax);
}

export function prsi(profit, y) {
  const Y = YEARS[y];
  if (profit <= Y.prsiFloor) return 0;
  return r2(Math.max(Y.prsiMin, profit * Y.prsiRate));
}

export function compute(input) {
  const errors = [];
  const year = Object.hasOwn(YEARS, input.year) ? String(input.year) : "2026";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year, excluding VAT (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (errors.length) return { errors };

  const profit = r2(Math.max(0, revenue - expenses));
  const it = incomeTax(profit, year);
  const uscAmt = usc(profit, year);
  const prsiAmt = prsi(profit, year);
  const total = r2(it.net + uscAmt + prsiAmt);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfProfit = profit > 0 ? r2((total / profit) * 100) : 0;
  const findings = [];
  const out = { errors: [], year, revenue, expenses, profit, grossTax: it.gross, credits: it.credits, tax: it.net, usc: uscAmt, prsi: prsiAmt, total, setAsidePct, setAsideOfProfit, afterTax: r2(profit - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about €${total.toFixed(2)} (${setAsidePct}% of income, ${setAsideOfProfit}% of profit): €${it.net.toFixed(2)} income tax, €${uscAmt.toFixed(2)} USC and €${prsiAmt.toFixed(2)} Class S PRSI. That is roughly €${out.perThousand.toFixed(0)} from every €1,000 you invoice.` });
  if (revenue > 42500) findings.push({ severity: "medium", title: "Turnover above €42,500 from services (€85,000 for goods) means you are generally required to register for VAT. VAT you charge belongs to Revenue and is not in the figure above." });
  findings.push({ severity: "medium", title: "Self-assessed taxpayers file Form 11 and pay preliminary tax by 31 October (mid-November if filing and paying through ROS) for the current year, with the balance of the previous year due the same day. Preliminary tax is generally 100% of the current year, 105% of the prior year, or 90% of the current year, depending on your situation." });
  if (profit > 100000) findings.push({ severity: "medium", title: "Profit above €100,000 attracts an extra 3% USC surcharge on the part above €100,000 for self-employed income, included in the figure above." });
  findings.push({ severity: "info", title: "Class S PRSI is shown at 4.2% (minimum €500). Employee and self-employed PRSI rates rise by 0.15 points from 1 October 2026, so the real blended 2026 rate is slightly higher; the model does not apportion it." });
  findings.push({ severity: "info", title: "Other income, pension contributions, capital allowances, losses, rent-a-room and other reliefs, and marital or other credits are not modelled. The personal and earned income credits are assumed for a single person." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`Ireland self-employed tax set-aside, ${r.year} tax year`);
  L.push(`Income €${r.revenue.toFixed(2)}, expenses €${r.expenses.toFixed(2)}, profit €${r.profit.toFixed(2)}`);
  L.push(`Income tax after credits: €${r.tax.toFixed(2)}`);
  L.push(`USC: €${r.usc.toFixed(2)}`);
  L.push(`Class S PRSI: €${r.prsi.toFixed(2)}`);
  L.push(`Set aside: €${r.total.toFixed(2)} (${r.setAsidePct}% of income, €${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on revenue.ie. Not tax advice.");
  return L.join("\n");
}
