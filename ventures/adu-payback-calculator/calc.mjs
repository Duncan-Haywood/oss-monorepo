// ADU (accessory dwelling unit) payback and return. Pure functions, no DOM.
// Arithmetic on figures the user types: build cost, financing, rent, operating
// costs, and an estimated value uplift. It ships no market data as fact.

export const DEFAULTS = Object.freeze({
  contingencyPct: 10,
  loanPct: 80,
  loanRate: 7,
  loanYears: 25,
  rentMonthly: 0,
  vacancyPct: 5,
  managementPct: 0,
  rentGrowthPct: 3,
  opexGrowthPct: 3,
  holdYears: 10,
  valueUplift: 0,
  appreciationPct: 3,
  sellingCostPct: 6,
  discountPct: 8,
  ownerUseMonths: 0,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// "name, amount" one per line. Used for build costs (one-time) and operating costs (annual).
export function parseItems(text, noun = "line") {
  const rows = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)[,\t]\s*"?(-?\$?[\d,]*\.?\d+)"?\s*$/);
    if (!m) { if (rows.length) skipped++; continue; }
    const name = m[1].trim().replace(/^"|"$/g, "") || "Item";
    const amount = num(m[2].replace("$", ""), NaN);
    if (!Number.isFinite(amount) || amount < 0) { skipped++; continue; }
    rows.push({ name, amount });
  }
  if (skipped) warnings.push(`${skipped} ${noun} line(s) skipped (need a name and a non-negative amount).`);
  return { rows, warnings };
}

// Level monthly payment on a fully amortising loan.
export function monthlyPayment(principal, annualRatePct, years) {
  const n = Math.round(years * 12);
  if (!(principal > 0) || n <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

// Balance remaining after k payments.
export function loanBalance(principal, annualRatePct, years, monthsPaid) {
  const n = Math.round(years * 12);
  if (!(principal > 0) || n <= 0) return 0;
  if (monthsPaid >= n) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal * (1 - monthsPaid / n);
  const pmt = monthlyPayment(principal, annualRatePct, years);
  return principal * Math.pow(1 + r, monthsPaid) - pmt * ((Math.pow(1 + r, monthsPaid) - 1) / r);
}

export function npv(rate, flows) {
  return flows.reduce((s, f, t) => s + f / Math.pow(1 + rate, t), 0);
}

// IRR by bisection. null when the flows never change sign (no meaningful rate).
export function irr(flows) {
  const hasNeg = flows.some((f) => f < 0), hasPos = flows.some((f) => f > 0);
  if (!hasNeg || !hasPos) return null;
  let lo = -0.99, hi = 10;
  let flo = npv(lo, flows), fhi = npv(hi, flows);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid, flows);
    if (fm === 0) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

// Core projection. Annual steps; year 1 is the first full year of operation.
// Cash flows are to the owner's equity: -equity at t=0, yearly cash after debt service,
// and net sale proceeds (uplift after selling costs, less loan balance) at the horizon.
function project(o, buildTotal, opexYear1) {
  const loan = buildTotal * (o.loanPct / 100);
  const equity = buildTotal - loan;
  const pmt = monthlyPayment(loan, o.loanRate, o.loanYears);
  const years = [];
  let rent = o.rentMonthly * 12;
  let opex = opexYear1;
  let cum = -equity;
  let payback = null;
  for (let y = 1; y <= o.holdYears; y++) {
    const ownerRentLoss = rent * (o.ownerUseMonths / 12);
    const collected = (rent - ownerRentLoss) * (1 - o.vacancyPct / 100);
    const mgmt = collected * (o.managementPct / 100);
    const noi = collected - mgmt - opex;
    const monthsPaid = Math.min(y * 12, Math.round(o.loanYears * 12));
    const prevPaid = Math.min((y - 1) * 12, Math.round(o.loanYears * 12));
    const debt = pmt * (monthsPaid - prevPaid);
    const cash = noi - debt;
    cum += cash;
    if (payback === null && cum >= 0) payback = y;
    years.push({ year: y, rent: collected, opex: opex + mgmt, noi, debt, cash, cumulative: cum, balance: loanBalance(loan, o.loanRate, o.loanYears, monthsPaid) });
    rent *= 1 + o.rentGrowthPct / 100;
    opex *= 1 + o.opexGrowthPct / 100;
  }
  const last = years[years.length - 1];
  const value = o.valueUplift * Math.pow(1 + o.appreciationPct / 100, o.holdYears);
  const saleNet = value * (1 - o.sellingCostPct / 100) - last.balance;
  const flows = [-equity, ...years.map((y) => y.cash)];
  flows[flows.length - 1] += saleNet;
  return { loan, equity, pmt, years, value, saleNet, flows, firstYear: years[0] };
}

export function analyze(costs, opexItems, options = {}) {
  const o = {};
  for (const k of Object.keys(DEFAULTS)) o[k] = num(options[k], DEFAULTS[k]);
  for (const k of Object.keys(o)) if (Number.isNaN(o[k])) return { error: `Check the number in "${k}".` };
  for (const k of ["contingencyPct", "loanPct", "loanRate", "loanYears", "rentMonthly", "vacancyPct", "managementPct", "holdYears", "valueUplift", "sellingCostPct", "discountPct", "ownerUseMonths"]) {
    if (o[k] < 0) return { error: `"${k}" cannot be negative.` };
  }
  if (!costs || !costs.length) return { error: "Add at least one build cost line (name, amount)." };
  if (o.loanPct > 100) return { error: "Financed share cannot exceed 100% of the build cost." };
  if (o.vacancyPct >= 100) return { error: "Vacancy must be under 100%." };
  if (o.ownerUseMonths > 12) return { error: "Months of your own use per year cannot exceed 12." };
  if (!(o.rentMonthly > 0)) return { error: "Enter the monthly rent (or the rent you would otherwise pay, or the value of the space to you)." };
  o.holdYears = Math.round(o.holdYears);
  if (o.holdYears < 1 || o.holdYears > 40) return { error: "Hold period must be between 1 and 40 years." };
  if (o.loanYears > 40) return { error: "Loan term cannot exceed 40 years." };

  const warnings = [];
  const hard = costs.reduce((s, c) => s + c.amount, 0);
  if (!(hard > 0)) return { error: "Build cost lines add up to zero." };
  const contingency = hard * (o.contingencyPct / 100);
  const buildTotal = hard + contingency;
  const opexYear1 = (opexItems || []).reduce((s, c) => s + c.amount, 0);

  const base = project(o, buildTotal, opexYear1);
  const cost = buildTotal;
  const first = base.firstYear;

  // Unlevered view (no loan): what the unit earns on its own cost.
  const un = project({ ...o, loanPct: 0 }, buildTotal, opexYear1);
  const unleveredYield = first.noi / cost;
  const grossRentYear1 = o.rentMonthly * 12;

  // Payback measured on the whole build cost, ignoring financing and the sale.
  let cum = -cost, simplePayback = null;
  for (let y = 1; y <= 60; y++) {
    const rentY = o.rentMonthly * 12 * Math.pow(1 + o.rentGrowthPct / 100, y - 1);
    const lost = rentY * (o.ownerUseMonths / 12);
    const collected = (rentY - lost) * (1 - o.vacancyPct / 100);
    const noi = collected * (1 - o.managementPct / 100) - opexYear1 * Math.pow(1 + o.opexGrowthPct / 100, y - 1);
    cum += noi;
    if (cum >= 0) { simplePayback = y - 1 + (noi > 0 ? 1 - cum / noi : 1); break; }
  }

  const equityIrr = base.equity > 0 ? irr(base.flows) : null;
  const unleveredIrr = irr(un.flows);
  const equityNpv = base.equity > 0 ? npv(o.discountPct / 100, base.flows) : null;

  // Rent at which the equity NPV at the discount rate is zero (bisection on rent).
  const npvAtRent = (rentMonthly) => {
    const p = project({ ...o, rentMonthly }, buildTotal, opexYear1);
    return npv(o.discountPct / 100, p.flows);
  };
  let breakEvenRent = null;
  {
    let lo = 0, hi = Math.max(o.rentMonthly * 10, 1000);
    if (npvAtRent(hi) > 0 && npvAtRent(lo) < 0) {
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        if (npvAtRent(mid) > 0) hi = mid; else lo = mid;
      }
      breakEvenRent = (lo + hi) / 2;
    } else if (npvAtRent(lo) >= 0) breakEvenRent = 0;
  }
  // Rent at which year-1 cash flow after debt is zero.
  const cashBreakEvenRent = (() => {
    const need = base.pmt * 12 + opexYear1;
    const keep = (1 - o.vacancyPct / 100) * (1 - o.managementPct / 100) * (1 - o.ownerUseMonths / 12);
    return keep > 0 ? need / keep / 12 : null;
  })();

  const sensitivity = [-20, -10, 0, 10, 20].map((d) => {
    const rentMonthly = o.rentMonthly * (1 + d / 100);
    const p = project({ ...o, rentMonthly }, buildTotal, opexYear1);
    return { delta: d, rentMonthly, cashYear1: p.firstYear.cash, irr: base.equity > 0 ? irr(p.flows) : null, npv: base.equity > 0 ? npv(o.discountPct / 100, p.flows) : null };
  });
  const costSens = [-20, -10, 0, 10, 20].map((d) => {
    const p = project(o, buildTotal * (1 + d / 100), opexYear1);
    const eq = p.equity;
    return { delta: d, cost: buildTotal * (1 + d / 100), cashYear1: p.firstYear.cash, irr: eq > 0 ? irr(p.flows) : null, npv: eq > 0 ? npv(o.discountPct / 100, p.flows) : null };
  });

  if (o.valueUplift === 0) warnings.push("Value uplift is zero, so the return counts rent only. An ADU usually adds appraised value; get a local appraiser or agent's estimate rather than assuming one.");
  if (o.valueUplift > 0 && o.valueUplift > buildTotal * 1.5) warnings.push(`The value uplift (${Math.round(o.valueUplift).toLocaleString("en-US")}) is more than 1.5x the build cost. Check it with an appraiser; ADU uplift is often at or below cost.`);
  if (unleveredYield > 0.12) warnings.push(`A ${(unleveredYield * 100).toFixed(1)}% yield on cost is high. Check rent against comparable listings and that all costs are included.`);
  if (o.loanPct > 0 && first.cash < 0) warnings.push("Rent does not cover operating costs and loan payments in year 1; you would add cash each month.");
  if (o.holdYears < 5) warnings.push("A short hold makes the sale assumptions dominate the result.");

  let verdict;
  if (equityNpv === null) verdict = `All-cash build: yield on cost ${(unleveredYield * 100).toFixed(1)}% in year 1.`;
  else if (equityNpv > 0) verdict = `On these figures the build returns more than your ${o.discountPct}% discount rate over ${o.holdYears} years.`;
  else verdict = `On these figures the build returns less than your ${o.discountPct}% discount rate over ${o.holdYears} years.`;

  return {
    options: o,
    cost: { hard, contingency, total: buildTotal, perMonthOfRent: buildTotal / o.rentMonthly },
    financing: { loan: base.loan, equity: base.equity, payment: base.pmt },
    year1: { grossRent: grossRentYear1, collected: first.rent, opex: first.opex, noi: first.noi, debt: first.debt, cash: first.cash },
    unleveredYield,
    simplePayback,
    equityPaybackYear: base.years.find((y) => y.cumulative >= 0)?.year ?? null,
    irr: equityIrr,
    unleveredIrr,
    npv: equityNpv,
    sale: { value: base.value, net: base.saleNet },
    breakEvenRent,
    cashBreakEvenRent,
    years: base.years,
    sensitivity,
    costSens,
    verdict,
    warnings,
  };
}

export function sampleCosts() {
  return "Design and engineering,12000\nPermits and impact fees,18000\nUtility connections,15000\nFoundation and framing,70000\nMEP, finishes and fixtures,75000\nSite work and landscaping,10000";
}
export function sampleOpex() {
  return "Property tax increase,2400\nInsurance increase,700\nMaintenance reserve,1500\nUtilities you pay,1200";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Year", "Rent collected", "Operating costs", "NOI", "Debt service", "Cash after debt", "Cumulative cash", "Loan balance"]];
  for (const y of r.years) out.push([y.year, f2(y.rent), f2(y.opex), f2(y.noi), f2(y.debt), f2(y.cash), f2(y.cumulative), f2(y.balance)]);
  out.push([]);
  out.push(["Total build cost", f2(r.cost.total)]);
  out.push(["Equity put in", f2(r.financing.equity)]);
  out.push(["Yield on cost, year 1", (r.unleveredYield * 100).toFixed(2) + "%"]);
  out.push(["Equity IRR", r.irr === null ? "" : (r.irr * 100).toFixed(2) + "%"]);
  out.push(["Break-even rent per month", r.breakEvenRent === null ? "" : f2(r.breakEvenRent)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US");
export const money2 = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v === null || v === undefined ? "n/a" : (v * 100).toFixed(d) + "%");
export const yrs = (v) => (v === null || v === undefined ? "over 60 years" : v.toFixed(1) + " years");
