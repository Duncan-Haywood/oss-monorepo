// Residential solar payback: turns system cost, upfront incentives, production,
// self-consumption and the utility's import and export rates into yearly
// savings, payback year, 25-year net gain, NPV and IRR, then re-runs the same
// system under other export-credit and rate-escalation assumptions. Deterministic
// and local. Pre-tax; incentives are a dollar amount the user enters.

export const YEARS_MAX = 40;

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

// Level monthly payment on `amount` at `aprPct` over `years`.
export function loanPayment(amount, aprPct, years) {
  if (amount <= 0 || years <= 0) return 0;
  const n = years * 12, r = aprPct / 100 / 12;
  return r === 0 ? amount / n : (amount * r) / (1 - Math.pow(1 + r, -n));
}

export function irr(flows) {
  const npv = (rate) => flows.reduce((a, f, t) => a + f / Math.pow(1 + rate, t), 0);
  let lo = -0.9, hi = 1;
  if (!(npv(lo) > 0 && npv(hi) < 0)) return null;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// p: { netCost, loan, apr, loanYears, production, degradation, selfShare,
//      importRate, exportRate, escalation, om, inverterCost, inverterYear,
//      years, discount } with percents as 0..1.
export function simulate(p) {
  const pay = loanPayment(p.loan, p.apr * 100, p.loanYears) * 12;
  const flows = [-(p.netCost - p.loan)];
  const rows = [];
  let cum = flows[0], payback = null;
  for (let y = 1; y <= p.years; y++) {
    const prod = p.production * Math.pow(1 - p.degradation, y - 1);
    const esc = Math.pow(1 + p.escalation, y - 1);
    const self = prod * p.selfShare * p.importRate * esc;
    const exp = prod * (1 - p.selfShare) * p.exportRate * esc;
    const om = p.om + (y === p.inverterYear ? p.inverterCost : 0);
    const loanPaid = y <= p.loanYears ? pay : 0;
    const net = self + exp - om - loanPaid;
    const prev = cum;
    cum += net;
    if (payback === null && cum >= 0) payback = y - 1 + (net > 0 ? -prev / net : 0);
    flows.push(net);
    rows.push({ year: y, production: prod, savings: self + exp, om, loanPaid, net, cumulative: cum });
  }
  const npv = flows.reduce((a, f, t) => a + f / Math.pow(1 + p.discount, t), 0);
  return { rows, flows, payback, npv, irr: irr(flows), gain: cum, year1: rows[0].savings, upfront: -flows[0] };
}

function parseInput(raw) {
  const req = (key, name, max = Infinity) => {
    const v = parseNum(raw[key]);
    return v > 0 && v <= max ? { v } : { error: `Enter ${name}, above zero${max < Infinity ? ` and up to ${max}` : ""}.` };
  };
  const o = {};
  for (const [key, name, max] of [["systemKw", "the system size in kW", 100], ["costPerWatt", "the installed cost per watt", 20], ["kwhPerKw", "yearly kWh produced per kW installed", 3000], ["importRate", "the electricity price you pay per kWh", 2]]) {
    const r = req(key, name, max);
    if (r.error) return r;
    o[key] = r.v;
  }
  const num = (key, name, dflt, max = Infinity) => {
    const v = opt(raw[key], dflt);
    if (!(v >= 0 && v <= max)) return { error: `${name} must be a number between 0 and ${max === Infinity ? "any amount" : max}, or blank.` };
    return { v };
  };
  for (const [key, name, dflt, max] of [["incentives", "Upfront incentives", 0], ["selfShare", "Share of production you use yourself, percent", 60, 100], ["exportRate", "Export credit per kWh", null, 2], ["escalation", "Yearly electricity price increase, percent", 3, 20], ["degradation", "Yearly panel degradation, percent", 0.5, 5], ["om", "Yearly maintenance and insurance", 0], ["inverterCost", "Inverter replacement cost", 0], ["inverterYear", "Inverter replacement year", 13, 40], ["years", "Years to analyse", 25, YEARS_MAX], ["discount", "Discount rate, percent", 4, 30], ["loan", "Loan amount", 0], ["apr", "Loan interest rate, percent", 7, 40], ["loanYears", "Loan term in years", 10, 30]]) {
    if (key === "exportRate") { o.exportRate = blank(raw.exportRate) ? o.importRate : parseNum(raw.exportRate); if (!(o.exportRate >= 0 && o.exportRate <= 2)) return { error: "Export credit per kWh must be a number between 0 and 2, or blank to use your import price (full net metering)." }; continue; }
    const r = num(key, name, dflt, max);
    if (r.error) return r;
    o[key] = r.v;
  }
  if (o.years < 1) return { error: "Years to analyse must be at least 1." };
  const total = o.systemKw * 1000 * o.costPerWatt;
  const netCost = total - o.incentives;
  if (!(netCost > 0)) return { error: "Incentives are as large as the system cost, so there is nothing to pay back." };
  if (o.loan > netCost) return { error: "The loan cannot be larger than the cost after incentives." };
  return { p: { total, netCost, loan: o.loan, apr: o.apr / 100, loanYears: Math.round(o.loanYears), production: o.systemKw * o.kwhPerKw, degradation: o.degradation / 100, selfShare: o.selfShare / 100, importRate: o.importRate, exportRate: o.exportRate, escalation: o.escalation / 100, om: o.om, inverterCost: o.inverterCost, inverterYear: Math.round(o.inverterYear), years: Math.round(o.years), discount: o.discount / 100, usage: parseNum(raw.usage) } };
}

export function analyze(raw) {
  const r = parseInput(raw);
  if (r.error) return r;
  const p = r.p;
  const base = simulate(p);
  const scenarios = [
    ["Your assumptions", p],
    ["Full net metering (export = import price)", { ...p, exportRate: p.importRate }],
    ["Export credit at half your import price", { ...p, exportRate: p.importRate / 2 }],
    ["Export credit at a quarter of your import price", { ...p, exportRate: p.importRate / 4 }],
    ["No yearly price increase", { ...p, escalation: 0 }],
    ["Price increase 5% a year", { ...p, escalation: 0.05 }],
    ["Production 15% below estimate", { ...p, production: p.production * 0.85 }],
  ].map(([label, q]) => ({ label, ...simulate(q) }));
  const findings = [];
  findings.push({ severity: "info", title: base.payback === null ? `No payback within ${p.years} years` : `Simple payback in about ${base.payback.toFixed(1)} years`, detail: `You put in $${money(base.upfront)} up front; year-1 savings are about $${money(base.year1)}. After ${p.years} years the cash position is $${money(base.gain)} (before tax).` });
  if (base.payback === null) findings.push({ severity: "medium", title: "This system does not pay for itself on these numbers", detail: "Check the installed price per watt, the incentives, and your electricity price. A quote well above the local average, or a low import price, is what usually stretches payback past the panel warranty." });
  const half = scenarios[2], full = scenarios[1];
  if (p.exportRate >= p.importRate * 0.99 && p.selfShare < 1) findings.push({ severity: "medium", title: "Your export credit equals your import price", detail: `That is full net metering. Where utilities pay less for exports (net billing), payback moves: at half the import price it is ${half.payback === null ? "not reached" : half.payback.toFixed(1) + " years"}, against ${full.payback === null ? "not reached" : full.payback.toFixed(1) + " years"} here. Confirm your utility's current export rule before relying on this.` });
  if (p.selfShare < 0.5) findings.push({ severity: "medium", title: `You use only ${Math.round(p.selfShare * 100)}% of the production yourself`, detail: "The rest is sold back at the export credit. If that credit is low, a smaller system or a battery can change the answer; this tool does not model batteries." });
  if (Number.isFinite(p.usage) && p.usage > 0 && p.production > p.usage * 1.1) findings.push({ severity: "medium", title: "The system produces more than you use", detail: `Estimated ${money(p.production)} kWh a year against ${money(p.usage)} kWh used. Many utilities cap or zero out credit for excess production; savings here may be overstated.` });
  if (p.loan > 0) findings.push({ severity: "info", title: `Loan payments run ${p.loanYears} years`, detail: `The payments are $${money(loanPayment(p.loan, p.apr * 100, p.loanYears))} a month, and are counted in the yearly cash flow, so payback is later than for a cash purchase.` });
  return { p, base, scenarios, findings };
}

export function sampleInput() {
  return { systemKw: "8", costPerWatt: "3", kwhPerKw: "1400", usage: "11000", importRate: "0.24", exportRate: "0.08", selfShare: "55", escalation: "3", degradation: "0.5", incentives: "0", om: "150", inverterCost: "3000", inverterYear: "13", years: "25", discount: "4", loan: "0", apr: "7", loanYears: "10" };
}

const csvCell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(a) {
  const rows = [["Year", "Production kWh", "Savings", "Maintenance and inverter", "Loan payments", "Net cash flow", "Cumulative"]];
  for (const r of a.base.rows) rows.push([r.year, Math.round(r.production), round2(r.savings), round2(r.om), round2(r.loanPaid), round2(r.net), round2(r.cumulative)]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
