// Equipment lease vs buy: after-tax present-value cost of each path over the lease term.
//
// Every figure is a deterministic function of the user's own inputs. Timing conventions (all stated on the page):
//  - loan and lease payments are made at the end of each month; "due at signing" is paid at month 0;
//  - interest and lease payments save tax in the month they are paid; depreciation saves tax at the end of each ownership year
//    (capped at the horizon), which is slightly conservative for buying;
//  - the equipment is sold (or, after a buyout, kept and valued) at the end of the horizon for the stated resale value, and the gain
//    or loss against the remaining tax basis is taxed at the same rate (depreciation recapture treated as ordinary income).

export const DEPRECIATION_METHODS = {
  expense: { label: 'Expense it all in year 1 (Section 179 or 100% bonus, if you qualify)', schedule: [1] },
  macrs5: { label: '5-year MACRS (half-year convention)', schedule: [0.2, 0.32, 0.192, 0.1152, 0.1152, 0.0576] },
  macrs7: { label: '7-year MACRS (half-year convention)', schedule: [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446] },
  sl5: { label: '5-year straight line (half-year convention)', schedule: [0.1, 0.2, 0.2, 0.2, 0.2, 0.1] },
  none: { label: 'No tax deduction for depreciation', schedule: [] },
};

function num(label, value, { min = 0, max = Infinity, integer = false, exclusiveMin = false } = {}) {
  if (value === '' || value === null || value === undefined) throw new Error(`${label} is required.`);
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,%\s]/g, '').replace(/,/g, ''));
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number.`);
  if (exclusiveMin ? n <= min : n < min) throw new Error(`${label} must be ${exclusiveMin ? 'greater than' : 'at least'} ${min}.`);
  if (n > max) throw new Error(`${label} must be at most ${max}.`);
  if (integer && !Number.isInteger(n)) throw new Error(`${label} must be a whole number.`);
  return n;
}

export function normalizeInputs(raw) {
  const method = raw.depreciation === undefined || raw.depreciation === '' ? 'expense' : String(raw.depreciation);
  if (!DEPRECIATION_METHODS[method]) throw new Error('Choose a depreciation method from the list.');
  const n = {
    price: num('Equipment price', raw.price, { exclusiveMin: true }),
    salesTaxPct: num('Sales tax', raw.salesTaxPct, { max: 20 }),
    downPaymentPct: num('Down payment', raw.downPaymentPct, { max: 100 }),
    loanAprPct: num('Loan APR', raw.loanAprPct, { max: 60 }),
    loanTermMonths: num('Loan term', raw.loanTermMonths, { min: 1, max: 120, integer: true }),
    leaseMonthlyPayment: num('Lease monthly payment', raw.leaseMonthlyPayment),
    leaseTermMonths: num('Lease term', raw.leaseTermMonths, { min: 1, max: 120, integer: true }),
    leaseDueAtSigning: num('Lease due at signing', raw.leaseDueAtSigning),
    leaseEndBuyout: num('Lease-end buyout price', raw.leaseEndBuyout),
    resaleValue: num('Expected resale value at the end of the lease term', raw.resaleValue),
    taxRatePct: num('Marginal tax rate', raw.taxRatePct, { max: 60 }),
    discountRatePct: num('Discount rate', raw.discountRatePct, { max: 60 }),
    depreciation: method,
  };
  return n;
}

export function loanPayment(principal, aprPct, months) {
  if (principal === 0) return 0;
  const r = aprPct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - (1 + r) ** -months);
}

const round2 = (x) => Math.round(x * 100) / 100;

// After-tax present value of owning. residual overrides the resale value (the cost is linear in it).
function buyCost(n, residual, discountPct, method) {
  const h = n.leaseTermMonths;
  const mr = (1 + discountPct / 100) ** (1 / 12) - 1;
  const df = (m) => (1 + mr) ** -m;
  const t = n.taxRatePct / 100;
  const total = n.price * (1 + n.salesTaxPct / 100);
  const down = total * (n.downPaymentPct / 100);
  const principal = total - down;
  const pay = loanPayment(principal, n.loanAprPct, n.loanTermMonths);
  const r = n.loanAprPct / 100 / 12;
  let pvPay = 0; let pvInterestSaving = 0; let balance = principal;
  for (let m = 1; m <= Math.min(h, n.loanTermMonths); m += 1) {
    const interest = balance * r;
    balance = balance + interest - pay;
    if (m === n.loanTermMonths) balance = 0;
    pvPay += pay * df(m);
    pvInterestSaving += interest * t * df(m);
  }
  const payoff = h < n.loanTermMonths ? balance : 0; // remaining loan balance repaid out of the sale at the horizon
  const years = Math.ceil(h / 12);
  const sched = DEPRECIATION_METHODS[method].schedule;
  let deducted = 0; let pvDepSaving = 0;
  for (let y = 1; y <= years; y += 1) {
    const d = total * (sched[y - 1] ?? 0);
    deducted += d;
    pvDepSaving += d * t * df(Math.min(12 * y, h));
  }
  const basisLeft = total - deducted;
  const saleTax = (residual - basisLeft) * t; // negative = a deductible loss
  const pvSale = (residual - saleTax - payoff) * df(h);
  return down + pvPay - pvInterestSaving - pvDepSaving - pvSale;
}

function leaseCost(n, residual, discountPct) {
  const h = n.leaseTermMonths;
  const mr = (1 + discountPct / 100) ** (1 / 12) - 1;
  const df = (m) => (1 + mr) ** -m;
  const t = n.taxRatePct / 100;
  let pv = n.leaseDueAtSigning;
  const deductionPerMonth = (n.leaseDueAtSigning / h) * t; // signing costs deducted evenly over the term
  for (let m = 1; m <= h; m += 1) {
    pv += (n.leaseMonthlyPayment - n.leaseMonthlyPayment * t - deductionPerMonth) * df(m);
  }
  if (n.leaseEndBuyout > 0) {
    // Keep the equipment: pay the buyout, then value it at resale less tax on the gain over the buyout price.
    pv += n.leaseEndBuyout * df(h);
    pv -= (residual - (residual - n.leaseEndBuyout) * t) * df(h);
  }
  return pv;
}

// Annual rate at which the lease payments, signing amount and end value equal the equipment price.
export function impliedLeaseApr(n) {
  const end = n.leaseEndBuyout > 0 ? n.leaseEndBuyout : n.resaleValue;
  const f = (r) => {
    let pv = n.leaseDueAtSigning;
    for (let m = 1; m <= n.leaseTermMonths; m += 1) pv += n.leaseMonthlyPayment / (1 + r) ** m;
    return pv + end / (1 + r) ** n.leaseTermMonths - n.price;
  };
  // f falls as r rises. If even r = 0 leaves the lessor short, the rate is negative; if it is far above price, bail out.
  let lo = -0.02; let hi = 0.5;
  if (f(lo) < 0) return null;
  if (f(hi) > 0) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (((lo + hi) / 2) * 12) * 100;
}

export const RESIDUAL_MULTIPLIERS = [0, 0.5, 1, 1.5];
export const DISCOUNT_DELTAS = [-4, 0, 4];

export function compareLeaseVsBuy(raw) {
  const n = normalizeInputs(raw);
  const notes = [];
  const diff = (residual, discount, method) => leaseCost(n, residual, discount) - buyCost(n, residual, discount, method);
  const buy = buyCost(n, n.resaleValue, n.discountRatePct, n.depreciation);
  const lease = leaseCost(n, n.resaleValue, n.discountRatePct);
  const advantage = lease - buy; // positive: buying is cheaper
  const winner = Math.abs(advantage) < 0.5 ? 'tie' : advantage > 0 ? 'buy' : 'lease';

  const f0 = diff(0, n.discountRatePct, n.depreciation);
  const f1 = diff(1, n.discountRatePct, n.depreciation);
  const slope = f1 - f0;
  let breakEvenResale = null;
  if (Math.abs(slope) > 1e-9) {
    const r = -f0 / slope;
    breakEvenResale = r < 0 ? null : r;
    if (r < 0) notes.push(slope > 0 ? 'Buying wins even if the equipment is worth nothing at the end.' : 'Leasing wins even if the equipment keeps full value.');
  }

  const total = n.price * (1 + n.salesTaxPct / 100);
  const down = total * (n.downPaymentPct / 100);
  const pay = loanPayment(total - down, n.loanAprPct, n.loanTermMonths);
  const paidInTerm = Math.min(n.leaseTermMonths, n.loanTermMonths) * pay;
  const buyNominal = down + paidInTerm;
  const leaseNominal = n.leaseDueAtSigning + n.leaseMonthlyPayment * n.leaseTermMonths + n.leaseEndBuyout;

  const methods = Object.keys(DEPRECIATION_METHODS).map((key) => {
    const c = buyCost(n, n.resaleValue, n.discountRatePct, key);
    return { key, label: DEPRECIATION_METHODS[key].label, buyCost: round2(c), advantage: round2(lease - c) };
  });

  const sensitivity = [];
  for (const dd of DISCOUNT_DELTAS) {
    const disc = Math.max(0, n.discountRatePct + dd);
    for (const m of RESIDUAL_MULTIPLIERS) {
      sensitivity.push({ discountRatePct: disc, residualMultiplier: m, residual: round2(n.resaleValue * m), advantage: round2(diff(n.resaleValue * m, disc, n.depreciation)) });
    }
  }

  if (n.leaseEndBuyout === 0) notes.push('The lease path assumes you return the equipment at the end of the term and own nothing afterwards.');
  if (n.loanTermMonths > n.leaseTermMonths) notes.push('The loan is longer than the comparison period, so the remaining balance is repaid out of the sale at the end.');
  if (n.downPaymentPct >= 100) notes.push('A 100% down payment means no loan; the interest rate has no effect.');

  return {
    inputs: n,
    winner,
    buyCost: round2(buy),
    leaseCost: round2(lease),
    advantage: round2(advantage),
    breakEvenResale: breakEvenResale === null ? null : round2(breakEvenResale),
    impliedLeaseAprPct: (() => { const v = impliedLeaseApr(n); return v === null ? null : Math.round(v * 100) / 100; })(),
    monthlyLoanPayment: round2(pay),
    buyCashOutNominal: round2(buyNominal),
    leaseCashOutNominal: round2(leaseNominal),
    methods,
    sensitivity,
    notes,
  };
}

function csvCell(v) {
  const s = String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formulas
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(result) {
  const rows = [['item', 'value'],
    ['winner', result.winner], ['after_tax_pv_cost_buy', result.buyCost], ['after_tax_pv_cost_lease', result.leaseCost],
    ['buy_advantage', result.advantage], ['break_even_resale_value', result.breakEvenResale ?? ''], ['implied_lease_apr_pct', result.impliedLeaseAprPct ?? ''],
    [], ['depreciation_method', 'after_tax_pv_cost_buy', 'buy_advantage']];
  for (const m of result.methods) rows.push([m.label, m.buyCost, m.advantage]);
  rows.push([], ['discount_rate_pct', 'resale_value', 'buy_advantage']);
  for (const s of result.sensitivity) rows.push([s.discountRatePct, s.residual, s.advantage]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const STATE_KEYS = ['price', 'salesTaxPct', 'downPaymentPct', 'loanAprPct', 'loanTermMonths', 'leaseMonthlyPayment', 'leaseTermMonths', 'leaseDueAtSigning', 'leaseEndBuyout', 'resaleValue', 'taxRatePct', 'discountRatePct', 'depreciation'];

export function encodeState(values) {
  const p = new URLSearchParams();
  for (const k of STATE_KEYS) if (values[k] !== undefined && values[k] !== '') p.set(k, String(values[k]));
  return p.toString();
}

export function decodeState(search) {
  const p = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const out = {};
  for (const k of STATE_KEYS) if (p.has(k)) out[k] = p.get(k);
  return out;
}
