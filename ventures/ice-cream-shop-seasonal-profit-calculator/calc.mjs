// Ice cream, frozen-dessert and other seasonal-shop maths: twelve months of days open and customers per open day become revenue,
// product cost, card fees, labor (sized to traffic, never below a minimum crew), utilities and fixed costs, then monthly profit,
// break-even customers per day for each open month, an open-or-close verdict for every month, loan payments, the cash reserve the
// slow months need and payback on the start-up cost. Pure functions, no DOM, no network.
// Every figure is the operator's own input; nothing here is a market rate, a traffic benchmark or a forecast.

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const SAMPLE = {
  ticket: "7.50", cogsPct: "28", feesPct: "2.9", wage: "15", burdenPct: "10", minHours: "16", custPerLaborHour: "14", utilitiesMonthly: "900",
  fixedMonthly: "3400", startupCost: "140000", loanAmount: "90000", loanApr: "9", loanYears: "7", ownerDrawTarget: "45000",
  months: ["Jan, 0, 0", "Feb, 0, 0", "Mar, 12, 45", "Apr, 26, 95", "May, 30, 150", "Jun, 30, 230", "Jul, 31, 290", "Aug, 31, 260", "Sep, 28, 140", "Oct, 14, 80", "Nov, 0, 0", "Dec, 0, 0"].join("\n"),
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
const whole = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const money2 = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function parseMonths(text) {
  const errors = [], seen = new Map();
  const lines = String(text ?? "").split(/\r?\n/).map((l, i) => [i + 1, l.trim()]).filter(([, l]) => l !== "");
  for (const [ln, line] of lines) {
    const p = line.split(/[,\t]/).map((s) => s.trim());
    if (p.length !== 3) { errors.push(`Line ${ln}: use month, days open, customers per open day.`); continue; }
    const idx = MONTHS.findIndex((m) => m.toLowerCase() === p[0].slice(0, 3).toLowerCase());
    if (idx < 0 || p[0].length < 3) { errors.push(`Line ${ln}: "${p[0]}" is not a month; use Jan to Dec.`); continue; }
    if (seen.has(idx)) { errors.push(`Line ${ln}: ${MONTHS[idx]} appears twice.`); continue; }
    const days = num(p[1]), cust = num(p[2]);
    if (!(Number.isInteger(days) && days >= 0 && days <= DAYS[idx])) { errors.push(`Line ${ln} (${MONTHS[idx]}): days open must be a whole number from 0 to ${DAYS[idx]}.`); continue; }
    if (!(cust >= 0 && cust <= 20000)) { errors.push(`Line ${ln} (${MONTHS[idx]}): customers per open day must be from 0 to 20,000.`); continue; }
    seen.set(idx, { month: MONTHS[idx], days, cust });
  }
  if (!errors.length && seen.size !== 12) errors.push(`Enter all 12 months, one per line (${seen.size} given). Use 0 days for a month you are closed.`);
  return { months: [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v), errors };
}

export function parse(raw) {
  const errors = [];
  const ticket = num(raw.ticket);
  if (!(ticket > 0)) errors.push("Enter the average spend per customer, in dollars (more than 0).");
  const cogsPct = opt(raw.cogsPct, 0), feesPct = opt(raw.feesPct, 0), wage = opt(raw.wage, 0), burdenPct = opt(raw.burdenPct, 0);
  const minHours = opt(raw.minHours, 0), custPerLaborHour = opt(raw.custPerLaborHour, 15), utilitiesMonthly = opt(raw.utilitiesMonthly, 0), fixedMonthly = opt(raw.fixedMonthly, 0);
  const startupCost = opt(raw.startupCost, 0), loanAmount = opt(raw.loanAmount, 0), loanApr = opt(raw.loanApr, 0), loanYears = opt(raw.loanYears, 5), ownerDrawTarget = opt(raw.ownerDrawTarget, 0);
  if (!(cogsPct >= 0 && cogsPct < 100)) errors.push("Product cost must be from 0 to under 100 percent of sales.");
  if (!(feesPct >= 0 && feesPct < 30)) errors.push("Card fees must be from 0 to under 30 percent of sales.");
  if (!(cogsPct + feesPct < 100)) errors.push("Product cost and card fees together must be under 100 percent of sales.");
  for (const [n, v] of [["Hourly wage", wage], ["Minimum crew hours per open day", minHours], ["Utilities per open month", utilitiesMonthly], ["Fixed costs per month", fixedMonthly], ["Start-up cost", startupCost], ["Loan amount", loanAmount], ["Owner draw target", ownerDrawTarget]]) if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(burdenPct >= 0 && burdenPct <= 60)) errors.push("Payroll taxes and extras must be from 0 to 60 percent of wages.");
  if (!(custPerLaborHour > 0 && custPerLaborHour <= 200)) errors.push("Customers served per labor hour must be more than 0 and at most 200.");
  if (!(loanApr >= 0 && loanApr <= 60)) errors.push("Loan interest rate must be from 0 to 60 percent.");
  if (!(loanYears > 0 && loanYears <= 30)) errors.push("Loan term must be more than 0 and at most 30 years.");
  if (loanAmount > 0 && startupCost > 0 && loanAmount > startupCost) errors.push("The loan cannot be more than the start-up cost.");
  const m = parseMonths(raw.months);
  errors.push(...m.errors);
  return { errors, input: { ticket, cogsPct, feesPct, wage, burdenPct, minHours, custPerLaborHour, utilitiesMonthly, fixedMonthly, startupCost, loanAmount, loanApr, loanYears, ownerDrawTarget }, months: m.months };
}

export function monthlyPayment(principal, apr, years) {
  if (!(principal > 0)) return 0;
  const n = Math.round(years * 12), r = apr / 100 / 12;
  return r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n));
}

// One month. `before` is profit after everything that moves with being open; the fixed cost is paid whether open or not.
function month(mo, i, scale = {}) {
  const cust = mo.cust * (scale.traffic ?? 1), ticket = i.ticket * (scale.price ?? 1);
  const open = mo.days > 0;
  const customers = open ? mo.days * cust : 0;
  const revenue = customers * ticket;
  const cogs = revenue * i.cogsPct / 100, fees = revenue * i.feesPct / 100;
  const hoursPerDay = open ? Math.max(i.minHours, cust / i.custPerLaborHour) : 0;
  const labor = mo.days * hoursPerDay * i.wage * (1 + i.burdenPct / 100);
  const utilities = open ? i.utilitiesMonthly : 0;
  const before = revenue - cogs - fees - labor - utilities;
  return { month: mo.month, days: mo.days, cust, customers, revenue, cogs, fees, labor, utilities, fixed: i.fixedMonthly, before, profit: before - i.fixedMonthly, open };
}

// Customers per open day that make `profit` zero for this month's days; profit rises with traffic, so bisect.
function breakEvenCust(mo, i) {
  if (mo.days === 0) return null;
  const f = (c) => month({ ...mo, cust: c }, i).profit;
  let lo = 0, hi = 1;
  while (f(hi) < 0 && hi < 1e6) hi *= 2;
  if (f(hi) < 0) return null;
  for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
  return hi;
}

function year(p, scale = {}) {
  const i = p.input, rows = p.months.map((mo) => month(mo, i, scale));
  const pay = monthlyPayment(i.loanAmount, i.loanApr, i.loanYears);
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const operating = sum("profit");
  return { rows, pay, revenue: sum("revenue"), customers: sum("customers"), operating, debt: pay * 12, netAfterDebt: operating - pay * 12 };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const i = p.input, y = year(p);
  const rows = y.rows.map((r, k) => ({ ...r, breakEvenCust: breakEvenCust(p.months[k], i), verdict: !r.open ? "closed" : r.before > 0 ? "open" : "close" }));
  // Cash through two repeating years, starting from the first month of the cycle: the deepest fall below a prior high is the reserve the slow months need.
  let cash = 0, peak = 0, reserve = 0;
  for (let k = 0; k < 24; k++) { cash += rows[k % 12].profit - y.pay; peak = Math.max(peak, cash); reserve = Math.max(reserve, peak - cash); }
  const losers = rows.filter((r) => r.verdict === "close");
  const savedByClosing = losers.reduce((a, r) => a + -r.before, 0);
  const totals = {
    revenue: y.revenue, customers: y.customers, operating: y.operating, debt: y.debt, netAfterDebt: y.netAfterDebt, monthlyPayment: y.pay, reserve,
    cogs: rows.reduce((a, r) => a + r.cogs, 0), fees: rows.reduce((a, r) => a + r.fees, 0), labor: rows.reduce((a, r) => a + r.labor, 0), utilities: rows.reduce((a, r) => a + r.utilities, 0), fixed: i.fixedMonthly * 12,
    margin: y.revenue > 0 ? y.operating / y.revenue : null,
    dscr: y.debt > 0 ? y.operating / y.debt : null,
    paybackYears: y.operating > 0 && i.startupCost > 0 ? i.startupCost / y.operating : null,
    daysOpen: rows.reduce((a, r) => a + r.days, 0),
  };
  const sweep = (key) => [-20, -10, 0, 10, 20].map((pct) => { const s = year(p, { [key]: 1 + pct / 100 }); return { pct, operating: s.operating, netAfterDebt: s.netAfterDebt, revenue: s.revenue }; });
  const findings = [];
  if (totals.operating <= 0) findings.push({ severity: "high", title: `The year loses ${whole(-totals.operating)} before any loan payment. Traffic or spend per customer would have to rise, or costs fall, before the shop pays for itself.` });
  else if (totals.netAfterDebt < 0) findings.push({ severity: "high", title: `Operating profit of ${whole(totals.operating)} does not cover ${whole(totals.debt)} of loan payments; the shortfall is ${whole(-totals.netAfterDebt)} a year.` });
  if (totals.dscr !== null && totals.dscr < 1.25 && totals.operating > 0) findings.push({ severity: "medium", title: `Operating profit covers the loan ${totals.dscr.toFixed(2)} times. Many lenders look for 1.25 or more; yours may differ.` });
  if (i.ownerDrawTarget > 0 && totals.netAfterDebt < i.ownerDrawTarget) findings.push({ severity: "medium", title: `After the loan the shop leaves ${whole(totals.netAfterDebt)} a year against your ${whole(i.ownerDrawTarget)} owner draw target, a gap of ${whole(i.ownerDrawTarget - totals.netAfterDebt)}.` });
  for (const r of losers) findings.push({ severity: "medium", title: `${r.month}: open ${r.days} days it loses ${whole(-r.before)} even before fixed costs, because labor and utilities exceed what ${Math.round(r.cust)} customers a day leave. Closing that month saves ${whole(-r.before)}.` });
  if (reserve > 0) findings.push({ severity: "medium", title: `Across the slow months cash falls ${whole(reserve)} below its earlier high, counting rent, fixed costs and loan payments. That is the reserve to hold before opening.` });
  const best = [...rows].sort((a, b) => b.profit - a.profit)[0];
  findings.push({ severity: "info", title: `${best.month} is the strongest month at ${whole(best.profit)}; the shop is open ${totals.daysOpen} days and serves about ${Math.round(totals.customers).toLocaleString("en-US")} customers a year.` });
  if (i.startupCost > 0) findings.push({ severity: "info", title: totals.paybackYears === null ? "Start-up cost does not pay back at this level of operating profit." : `Start-up cost of ${whole(i.startupCost)} is recovered in ${totals.paybackYears.toFixed(1)} years of operating profit at this level, before tax.` });
  return { errors: [], input: i, rows, totals, priceSweep: sweep("price"), trafficSweep: sweep("traffic"), findings, savedByClosing };
}

export function summaryText(r) {
  const t = r.totals, L = [];
  L.push("SEASONAL SHOP PROFIT SUMMARY");
  L.push(`Open ${t.daysOpen} days; about ${Math.round(t.customers).toLocaleString("en-US")} customers; revenue ${whole(t.revenue)}`);
  L.push(`Product ${whole(t.cogs)}, card fees ${whole(t.fees)}, labor ${whole(t.labor)}, utilities ${whole(t.utilities)}, fixed ${whole(t.fixed)}`);
  L.push(`Operating profit ${whole(t.operating)} (${t.margin === null ? "n/a" : (t.margin * 100).toFixed(1) + "% margin"}); loan payments ${whole(t.debt)}; left after loan ${whole(t.netAfterDebt)}`);
  L.push(`Cash reserve for the slow months: ${whole(t.reserve)}`);
  L.push("");
  L.push("By month (profit after fixed costs, break-even customers per day, verdict):");
  for (const x of r.rows) L.push(`  ${x.month}: ${money2(x.profit)}, ${x.breakEvenCust === null ? "n/a" : Math.ceil(x.breakEvenCust) + "/day"}, ${x.verdict.toUpperCase()}`);
  L.push("");
  for (const f of r.findings) L.push(`[${f.severity}] ${f.title}`);
  L.push("");
  L.push("Your own figures; not a forecast, not advice.");
  return L.join("\n");
}

const csvCell = (v) => { const s = String(v); return /^[=+\-@\t\r]/.test(s) || /[",\n]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
export function monthsCsv(r) {
  const head = ["month", "days_open", "customers_per_day", "revenue", "product_cost", "card_fees", "labor", "utilities", "fixed", "profit", "break_even_customers_per_day", "verdict"];
  const lines = [head.join(",")];
  for (const x of r.rows) lines.push([x.month, x.days, x.cust, x.revenue.toFixed(2), x.cogs.toFixed(2), x.fees.toFixed(2), x.labor.toFixed(2), x.utilities.toFixed(2), x.fixed.toFixed(2), x.profit.toFixed(2), x.breakEvenCust === null ? "" : x.breakEvenCust.toFixed(1), x.verdict].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
