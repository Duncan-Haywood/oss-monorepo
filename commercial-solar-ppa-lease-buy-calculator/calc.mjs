// Commercial solar: buy vs. PPA vs. lease, as after-tax cash flow against doing nothing (keep paying the utility).
// A business, nonprofit, farm or landlord gets quotes in three shapes that are hard to compare: a purchase price, a
// $/kWh PPA with an escalator, and a monthly lease with an escalator. This puts all three on one set of annual cash
// flows, then reports NPV, payback, and the PPA price at which buying stops being better.
// Arithmetic on the numbers the user types. Incentive percentages and depreciation are inputs, not rulings: the tool
// does not decide what credit or depreciation anyone qualifies for.

export const MACRS_5 = [0.2, 0.32, 0.192, 0.1152, 0.1152, 0.0576];
export const OM_ESCALATION = 0.02; // operations and maintenance cost growth, held fixed and stated on the page
export const INVERTER_YEAR = 12;
export const MAX_YEARS = 40;

export const SHARED_DEFAULTS = {
  kw: "100", costPerW: "2.10", yield: "1350", degr: "0.5", util: "0.14", utilEsc: "3", om: "15", inverter: "100",
  itc: "30", stateIncent: "0", taxRate: "21", macrs: "yes", financed: "0", apr: "7", loanYears: "15",
  ppaRate: "0.105", ppaEsc: "2.5", ppaTerm: "20", leasePay: "1250", leaseEsc: "2", leaseTerm: "20",
  buyout: "10", disc: "8", years: "25",
};
export const EXAMPLE_SHARED = { ...SHARED_DEFAULTS };

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const cents = (n) => "$" + n.toFixed(3);

const num = (t) => {
  const s = String(t ?? "").replace(/[$%\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

export function parseInputs(input, warnings) {
  const spec = {
    kw: [0.1, 100000, "System size (kW DC)"], costPerW: [0.1, 20, "Installed cost ($/W)"], yield: [100, 3000, "Annual production (kWh per kW)"],
    degr: [0, 5, "Degradation (%/yr)"], util: [0.001, 5, "Utility rate ($/kWh)"], utilEsc: [-10, 20, "Utility escalation (%/yr)"],
    om: [0, 1000, "O&M ($/kW-yr)"], inverter: [0, 2000, "Inverter replacement ($/kW)"], itc: [0, 100, "Tax credit (%)"],
    stateIncent: [0, 1e9, "Upfront incentive ($)"], taxRate: [0, 60, "Tax rate (%)"], financed: [0, 100, "Share financed (%)"],
    apr: [0, 40, "Loan APR (%)"], loanYears: [1, 40, "Loan term (years)"], ppaRate: [0, 5, "PPA rate ($/kWh)"], ppaEsc: [-10, 20, "PPA escalator (%/yr)"],
    ppaTerm: [1, MAX_YEARS, "PPA term (years)"], leasePay: [0, 1e7, "Lease payment ($/month)"], leaseEsc: [-10, 20, "Lease escalator (%/yr)"],
    leaseTerm: [1, MAX_YEARS, "Lease term (years)"], buyout: [0, 200, "End-of-term buyout (% of cost)"], disc: [0, 40, "Discount rate (%)"], years: [5, MAX_YEARS, "Years to analyze"],
  };
  const v = {};
  for (const [k, [lo, hi, label]] of Object.entries(spec)) {
    const n = num(input[k]);
    if (n === null || Number.isNaN(n) || n < lo || n > hi) { warnings.push(`${label} must be a number from ${lo} to ${hi}.`); v[k] = NaN; } else v[k] = n;
  }
  v.macrs = input.macrs === "no" ? false : true;
  return v;
}

const annuity = (principal, rate, n) => (rate === 0 ? principal / n : (principal * rate) / (1 - Math.pow(1 + rate, -n)));

export function npv(flows, d) { return flows.reduce((a, c, y) => a + c / Math.pow(1 + d, y), 0); }

export function irr(flows) {
  const f = (r) => flows.reduce((a, c, y) => a + c / Math.pow(1 + r, y), 0);
  let lo = -0.9, hi = 1;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

export function payback(flows) {
  let cum = 0;
  for (let y = 0; y < flows.length; y++) {
    const prev = cum; cum += flows[y];
    if (cum >= 0 && y > 0 && prev < 0) return y - 1 + -prev / flows[y];
    if (cum >= 0 && y === 0 && flows[0] >= 0 && flows.slice(1).every((c) => c >= 0)) return 0;
  }
  return null;
}

// Annual cash flows, index 0..years, for one option, relative to paying the utility.
export function flows(v, option, over = {}) {
  const p = { ...v, ...over };
  const H = Math.round(p.years);
  const tax = p.taxRate / 100;
  const cost = p.kw * 1000 * p.costPerW;
  const out = new Array(H + 1).fill(0);
  const prod = (y) => p.kw * p.yield * Math.pow(1 - p.degr / 100, y - 1);
  const rate = (y) => p.util * Math.pow(1 + p.utilEsc / 100, y - 1);
  const om = (y) => p.om * p.kw * Math.pow(1 + OM_ESCALATION, y - 1);
  const owned = (y) => {
    // cost of running a system you own in year y, after tax, with no purchase price attached
    const s = prod(y) * rate(y);
    const o = om(y);
    return { s, o };
  };

  if (option === "buy") {
    const net = cost - p.stateIncent;
    const loan = net * (p.financed / 100);
    out[0] = -(net - loan);
    const pmt = loan > 0 ? annuity(loan, p.apr / 100, Math.min(p.loanYears, H)) : 0;
    const n = Math.min(p.loanYears, H);
    let bal = loan;
    const itc = tax > 0 ? (p.itc / 100) * cost : 0;
    const basis = cost - 0.5 * itc;
    for (let y = 1; y <= H; y++) {
      const { s, o } = owned(y);
      const inv = y === INVERTER_YEAR ? p.inverter * p.kw : 0;
      let interest = 0, pay = 0;
      if (loan > 0 && y <= n) { interest = bal * (p.apr / 100); pay = pmt; bal = bal + interest - pay; }
      const dep = tax > 0 && p.macrs ? basis * (MACRS_5[y - 1] ?? 0) : 0;
      const taxable = s - o - inv - interest - dep;
      out[y] = s - o - inv - pay - tax * taxable + (y === 1 ? itc : 0);
    }
    return out;
  }

  const term = option === "ppa" ? p.ppaTerm : p.leaseTerm;
  for (let y = 1; y <= H; y++) {
    const { s, o } = owned(y);
    let pre;
    if (y <= term) {
      const pay = option === "ppa" ? prod(y) * p.ppaRate * Math.pow(1 + p.ppaEsc / 100, y - 1) : 12 * p.leasePay * Math.pow(1 + p.leaseEsc / 100, y - 1);
      pre = s - pay;
    } else {
      pre = s - o; // the customer owns it after the buyout
    }
    out[y] = pre - tax * pre;
    if (y === term && term < H) out[y] -= (p.buyout / 100) * cost; // buyout is capital; no deduction taken
  }
  return out;
}

const summarize = (fl, d, firstYearBase) => {
  const cum = fl.reduce((a, c) => a + c, 0);
  return { flows: fl, npv: npv(fl, d), total: cum, payback: payback(fl), irr: fl[0] < 0 ? irr(fl) : null, year1: fl[1], upfront: -Math.min(0, fl[0]), firstYearBase };
};

// PPA starting rate at which its NPV equals buying; null when buying wins even against a free PPA, or the PPA wins at any rate up to the cap.
export function breakevenPpaRate(v, buyNpv, d) {
  const at = (r) => npv(flows(v, "ppa", { ppaRate: r }), d);
  const cap = Math.max(v.util * 3, 0.5);
  if (at(0) < buyNpv) return { rate: null, why: "Buying beats the PPA even at a $0 rate on these numbers." };
  if (at(cap) > buyNpv) return { rate: null, why: "The PPA beats buying at any rate up to " + cents(cap) + "." };
  let lo = 0, hi = cap;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (at(mid) > buyNpv) lo = mid; else hi = mid; }
  return { rate: (lo + hi) / 2, why: null };
}

export function analyze(input) {
  const warnings = [];
  const v = parseInputs(input, warnings);
  if (warnings.length) return { ok: false, warnings };
  const d = v.disc / 100;
  const opts = {};
  for (const o of ["buy", "ppa", "lease"]) opts[o] = summarize(flows(v, o), d);
  const best = Object.entries(opts).sort((a, b) => b[1].npv - a[1].npv)[0][0];
  const be = breakevenPpaRate(v, opts.buy.npv, d);
  const sens = [0, 2, 4, 6].map((e) => {
    const r = {};
    for (const o of ["buy", "ppa", "lease"]) r[o] = npv(flows(v, o, { utilEsc: e }), d);
    return { esc: e, ...r, best: Object.entries(r).sort((a, b) => b[1] - a[1])[0][0] };
  });
  const cost = v.kw * 1000 * v.costPerW;
  const year1Prod = v.kw * v.yield;
  if (v.ppaRate >= v.util) warnings.push("The PPA starting rate is at or above your utility rate, so the PPA saves nothing in year 1. It only wins if the utility escalates faster than the PPA.");
  if (v.taxRate === 0) warnings.push("Tax rate is 0, so the tax credit and depreciation are ignored for buying and nothing is taxed. Tax-exempt owners may have other routes to the credit; this tool does not model them.");
  if (v.ppaTerm < v.years || v.leaseTerm < v.years) warnings.push(`After the term the tool assumes you buy the system out at ${v.buyout}% of the installed cost and run it yourself. Real buyouts are priced at fair market value, or you may have to remove the system. Change the buyout % to match your contract.`);
  if (v.financed > 0 && v.loanYears > v.years) warnings.push("Loan term was cut to the years analyzed.");
  warnings.push("Tax credit %, depreciation and who may claim them depend on current law, your tax status and when construction starts. The tool takes your percentages as given.");
  return { ok: true, warnings, v, opts, best, breakeven: be, sens, cost, year1Prod };
}

export function toCsv(a) {
  const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const head = ["Year", "Buy cash flow", "PPA cash flow", "Lease cash flow"];
  const rows = a.opts.buy.flows.map((_, y) => [y, a.opts.buy.flows[y].toFixed(2), a.opts.ppa.flows[y].toFixed(2), a.opts.lease.flows[y].toFixed(2)]);
  rows.push(["NPV", a.opts.buy.npv.toFixed(2), a.opts.ppa.npv.toFixed(2), a.opts.lease.npv.toFixed(2)]);
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
}
