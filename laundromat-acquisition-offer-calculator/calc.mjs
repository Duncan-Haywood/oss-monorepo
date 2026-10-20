// What a laundromat is worth to you, and the most you can offer. Starts from
// the seller's revenue, takes out every cost an absentee owner still pays
// (including a manager and a reserve for replacing machines), and prices the
// result two ways: a multiple of adjusted cash flow, and what the cash flow can
// actually service as a loan. Your walk-away price is the lower of the two.
//
//   adjusted cash flow  CF = revenue - utilities - rent - labor - repairs - other - manager - reserve
//   max annual debt     D  = CF / targetDscr
//   max loan            L  = (D / 12) * (1 - (1 + i)^-n) / i        i = rate / 12, n = years * 12
//   max price (debt)    P  = L / (1 - down%)        (the loan is the rest of the price)
//   max price (multiple)   = CF * multiple
//
// Debt service is a standard fully amortising monthly payment. When revenue is
// stressed, utilities fall with it (fewer loads, less water, gas and power) and
// every other cost is held fixed, the cautious reading for rent, labor and
// insurance, which do not shrink in a slow month.

export const MAX_OFFERS = 6;

export function validateInput(i) {
  const e = [];
  const pos = (v) => Number.isFinite(v) && v > 0;
  const nonneg = (v) => Number.isFinite(v) && v >= 0;
  if (!pos(i.revenue)) e.push("Enter the yearly revenue, above zero.");
  for (const k of ["utilities", "rent", "labor", "repairs", "other", "manager", "reserve", "closing"])
    if (!nonneg(i[k])) e.push("Costs must be zero or more.");
  if (!(Number.isFinite(i.multiple) && i.multiple > 0 && i.multiple <= 10)) e.push("The cash-flow multiple must be above 0 and at most 10.");
  if (!(Number.isFinite(i.downPct) && i.downPct >= 0 && i.downPct < 100)) e.push("Down payment must be at least 0% and under 100% of the price.");
  if (!(Number.isFinite(i.ratePct) && i.ratePct >= 0 && i.ratePct <= 30)) e.push("Interest rate must be between 0% and 30%.");
  if (!(Number.isFinite(i.years) && i.years >= 1 && i.years <= 30)) e.push("Loan term must be between 1 and 30 years.");
  if (!(Number.isFinite(i.dscr) && i.dscr >= 1 && i.dscr <= 3)) e.push("Required debt coverage must be between 1.0 and 3.0.");
  if (!Array.isArray(i.offers) || i.offers.length < 1) e.push("Add at least one price to test.");
  else if (i.offers.length > MAX_OFFERS) e.push(`This tool tests up to ${MAX_OFFERS} prices.`);
  else i.offers.forEach((o, k) => { if (!pos(o.price)) e.push(`Price ${k + 1}: enter an amount above zero.`); });
  return e;
}

// Monthly payment per $1 of loan.
function paymentFactor(ratePct, years) {
  const n = years * 12, r = ratePct / 100 / 12;
  return r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n));
}

export function adjustedCashFlow(i) {
  return i.revenue - i.utilities - i.rent - i.labor - i.repairs - i.other - i.manager - i.reserve;
}

export function annualDebtService(i, price) {
  const loan = price * (1 - i.downPct / 100);
  return loan * paymentFactor(i.ratePct, i.years) * 12;
}

export function maxPriceByDebt(i, cf = adjustedCashFlow(i)) {
  if (cf <= 0) return 0;
  const maxDebt = cf / i.dscr;
  const loan = maxDebt / 12 / paymentFactor(i.ratePct, i.years);
  return loan / (1 - i.downPct / 100);
}

function evalOffer(i, o, k, cf, walk) {
  const ds = annualDebtService(i, o.price);
  const cash = o.price * (i.downPct / 100) + i.closing;
  const free = cf - ds;
  const dscrAt = (drop) => (ds > 0 ? (cf - drop * (i.revenue - i.utilities)) / ds : Infinity);
  return {
    index: k + 1, label: o.label || `Price ${k + 1}`, price: o.price,
    loan: o.price * (1 - i.downPct / 100), cash, debtService: ds, freeCash: free,
    multiple: cf > 0 ? o.price / cf : null,
    dscr: dscrAt(0), dscr10: dscrAt(0.1), dscr20: dscrAt(0.2),
    cashOnCash: cash > 0 ? free / cash : 0,
    payback: free > 0 && cash > 0 ? cash / free : null,
    clears: cf > 0 && o.price <= walk + 1e-6,
  };
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const i = input;
  const cf = adjustedCashFlow(i);
  const byMultiple = Math.max(0, cf * i.multiple);
  const byDebt = maxPriceByDebt(i, cf);
  const walkAway = Math.min(byMultiple, byDebt);
  const binding = byDebt < byMultiple ? "debt" : "multiple";
  const offers = i.offers.map((o, k) => evalOffer(i, o, k, cf, walkAway));
  // revenue drop that takes coverage to 1.0x at the walk-away price (utilities flex with revenue)
  const dsWalk = annualDebtService(i, walkAway);
  const breakEvenDrop = walkAway > 0 ? ((cf - dsWalk) / (i.revenue - i.utilities)) * 100 : null;
  return { ok: true, input: i, cashFlow: cf, byMultiple, byDebt, walkAway, binding, breakEvenDropPct: breakEvenDrop, offers, notes: buildNotes(i, cf, offers, byMultiple, byDebt, walkAway, binding) };
}

function buildNotes(i, cf, offers, byMultiple, byDebt, walkAway, binding) {
  const n = [];
  if (cf <= 0) n.push("After the costs you listed there is no cash flow left to buy. Re-check the revenue against meter or bank records, or skip this one.");
  else {
    n.push(`Do not offer above ${money(walkAway)}. ${binding === "debt" ? "The loan, not the multiple, sets the limit: above it the cash flow cannot cover the payment with your required cushion." : "The cash-flow multiple sets the limit; at that price the cash flow still services the loan with your required cushion."}`);
  }
  const over = offers.filter((o) => !o.clears);
  if (over.length) n.push(`${over.length} of your test prices sit above the walk-away price.`);
  const thin = offers.filter((o) => o.dscr20 < 1 && o.dscr >= 1);
  if (thin.length) n.push(`${thin.length} of your test prices cannot cover the loan payment if revenue falls 20%.`);
  if (i.manager === 0) n.push("You entered no manager cost. If you will not work the store yourself, price a paid attendant or manager; sellers' books often hide the owner's own hours.");
  if (i.reserve === 0) n.push("You entered no machine replacement reserve. Washers and dryers wear out on a schedule; leaving it at zero overstates cash flow.");
  n.push("Revenue should come from meter reads, vending and card-system reports and bank deposits, not the seller's summary. This tool only works with the numbers you type.");
  return n;
}

export function money(x) {
  const neg = x < 0;
  const s = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (neg ? "-$" : "$") + s;
}
export const pct = (x) => (x * 100).toFixed(1) + "%";
export const times = (x) => (Number.isFinite(x) ? x.toFixed(2) + "x" : "n/a");

export function sampleInput() {
  return {
    revenue: 360000, utilities: 98000, rent: 60000, labor: 42000, repairs: 18000, other: 14000,
    manager: 36000, reserve: 15000,
    multiple: 3.5, downPct: 15, ratePct: 10.5, years: 10, closing: 20000, dscr: 1.25,
    offers: [{ label: "Asking price", price: 340000 }, { label: "Counter", price: 290000 }, { label: "Opening offer", price: 250000 }],
  };
}

export function resultText(r) {
  const lines = [`Laundromat offer: adjusted cash flow ${money(r.cashFlow)} a year on ${money(r.input.revenue)} revenue`,
    `Walk-away price ${money(r.walkAway)} (${money(r.byMultiple)} by ${r.input.multiple}x cash flow, ${money(r.byDebt)} by loan coverage of ${r.input.dscr}x)`];
  for (const o of r.offers) lines.push(`${o.label} ${money(o.price)}: coverage ${times(o.dscr)}, cash-on-cash ${pct(o.cashOnCash)}, ${o.clears ? "within" : "above"} the walk-away price`);
  lines.push("Arithmetic on the numbers entered, not financial, tax, legal or lending advice.");
  return lines.join("\n");
}

export function resultCsv(r) {
  const head = "label,price,down_payment_and_closing_cash,loan,annual_debt_service,free_cash_after_debt,price_to_cash_flow,coverage,coverage_revenue_down_10pct,coverage_revenue_down_20pct,cash_on_cash,payback_years,within_walk_away";
  const f = (v) => (typeof v === "number" ? (Number.isFinite(v) ? Math.round(v * 100) / 100 : "") : v === true ? "yes" : v === false ? "no" : v === null ? "" : `"${String(v).replace(/"/g, '""')}"`);
  return [head, ...r.offers.map((o) => [o.label, o.price, o.cash, o.loan, o.debtService, o.freeCash, o.multiple, o.dscr, o.dscr10, o.dscr20, o.cashOnCash, o.payback, o.clears].map(f).join(","))].join("\n");
}

export function serializeState(input) { return JSON.stringify({ app: "laundromat-acquisition-offer-calculator", version: 1, input }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== "laundromat-acquisition-offer-calculator" || !d.input) return { error: "That file is not a saved offer scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input };
}
