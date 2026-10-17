// Car lease deal checker: pure arithmetic, no I/O. Every figure on the page comes from here.
export const MAX_TERM = 84;

const r2 = (x) => Math.round(x * 100) / 100;
const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

export function money(x) {
  const v = r2(x);
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "-$" : "$") + s;
}

export function loanPayment(principal, aprPct, months) {
  if (principal <= 0) return 0;
  const i = aprPct / 1200;
  if (i === 0) return principal / months;
  return (principal * i) / (1 - Math.pow(1 + i, -months));
}

export function loanBalance(principal, aprPct, months, paid) {
  if (paid >= months) return 0;
  const i = aprPct / 1200;
  const p = loanPayment(principal, aprPct, months);
  if (i === 0) return Math.max(0, principal - p * paid);
  return Math.max(0, principal * Math.pow(1 + i, paid) - (p * (Math.pow(1 + i, paid) - 1)) / i);
}

// Pre-tax monthly lease payment from the dealer's own formula.
export function leasePayment({ adjCap, residual, term, mf }) {
  const dep = (adjCap - residual) / term;
  const fin = (adjCap + residual) * mf;
  return { dep, fin, pmt: dep + fin };
}

// Rate at which the lessee "borrows" the car's value: fees count, taxes and registration do not.
// V = upfront + sum_{t=0}^{n-1} pmt/(1+r)^t + (residual + disposition)/(1+r)^n, solved by bisection.
export function effectiveApr({ value, upfront, pmt, term, endCost }) {
  const f = (r) => {
    let pv = upfront;
    for (let t = 0; t < term; t++) pv += pmt / Math.pow(1 + r, t);
    return pv + endCost / Math.pow(1 + r, term) - value;
  };
  let lo = -0.01, hi = 0.05; // monthly
  if (f(lo) < 0 || f(hi) > 0) return null; // no sensible rate (e.g. payments exceed the car's value)
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 1200;
}

export function validate(i) {
  const e = [];
  const pos = (v, name) => { if (!(v > 0)) e.push(name + " must be greater than zero."); };
  const nonneg = (v, name) => { if (!(v >= 0)) e.push(name + " must be zero or more."); };
  pos(i.msrp, "MSRP"); pos(i.price, "Negotiated price"); pos(i.term, "Term");
  if (Number.isFinite(i.term) && (i.term < 6 || i.term > MAX_TERM || !Number.isInteger(i.term))) e.push("Term must be a whole number of months from 6 to " + MAX_TERM + ".");
  if (!(i.residualPct > 0 && i.residualPct < 100)) e.push("Residual must be between 0% and 100% of MSRP.");
  nonneg(i.down, "Down payment"); nonneg(i.rebates, "Rebates"); nonneg(i.acqFee, "Acquisition fee");
  nonneg(i.otherDue, "Other fees due at signing"); nonneg(i.dispositionFee, "Disposition fee"); nonneg(i.overageCents, "Overage rate");
  nonneg(i.taxRate, "Tax rate"); nonneg(i.allowanceMiles, "Mileage allowance"); nonneg(i.expectedMiles, "Expected miles");
  nonneg(i.buyApr, "Loan APR");
  if (i.mode === "payment") pos(i.quotedPayment, "Quoted payment");
  else if (!(i.moneyFactor >= 0)) e.push("Money factor must be zero or more.");
  if (!(i.buyTerm >= 12)) e.push("Loan term must be at least 12 months.");
  if (i.baseMoneyFactor !== null && !(i.baseMoneyFactor >= 0)) e.push("Base money factor must be zero or more.");
  if (!e.length && i.price - i.rebates - i.down <= 0) e.push("Rebates plus down payment cannot cover the whole price.");
  return e;
}

export function solve(raw, noLevers = false) {
  const i = {
    mode: raw.mode === "payment" ? "payment" : "mf",
    msrp: num(raw.msrp), price: num(raw.price), residualPct: num(raw.residualPct), term: num(raw.term),
    moneyFactor: num(raw.moneyFactor), quotedPayment: num(raw.quotedPayment),
    down: num(raw.down ?? 0) || 0, rebates: num(raw.rebates ?? 0) || 0,
    acqFee: num(raw.acqFee ?? 0) || 0, acqCapitalized: Boolean(raw.acqCapitalized),
    otherDue: num(raw.otherDue ?? 0) || 0, dispositionFee: num(raw.dispositionFee ?? 0) || 0,
    taxRate: num(raw.taxRate ?? 0) || 0,
    allowanceMiles: num(raw.allowanceMiles ?? 12000) , expectedMiles: num(raw.expectedMiles ?? 12000), overageCents: num(raw.overageCents ?? 0) || 0,
    buyApr: num(raw.buyApr ?? 6), buyTerm: num(raw.buyTerm ?? 60),
    marketValue: raw.marketValue === "" || raw.marketValue == null ? null : num(raw.marketValue),
    baseMoneyFactor: raw.baseMoneyFactor === "" || raw.baseMoneyFactor == null ? null : num(raw.baseMoneyFactor),
  };
  const errors = validate(i);
  if (i.marketValue !== null && !(i.marketValue >= 0)) errors.push("Expected market value must be zero or more.");
  if (errors.length) return { ok: false, errors };

  const residual = r2((i.msrp * i.residualPct) / 100);
  const adjCap = i.price - i.rebates - i.down + (i.acqCapitalized ? i.acqFee : 0);
  const notes = [];
  if (residual >= adjCap) notes.push("The residual is at or above the capitalized cost, so there is no depreciation to pay; check the numbers.");

  let mf;
  if (i.mode === "payment") {
    mf = (i.quotedPayment - (adjCap - residual) / i.term) / (adjCap + residual);
    if (mf < 0) notes.push("The quoted payment is below straight depreciation, which implies a negative money factor. Something in the quote is lower than you entered (a bigger down payment, a rebate, or a lower price).");
  } else mf = i.moneyFactor;
  const { dep, fin, pmt } = leasePayment({ adjCap, residual, term: i.term, mf });
  const tax = (pmt * i.taxRate) / 100;
  const monthly = pmt + tax;

  const stated = mf * 2400;
  const upfrontFees = i.down + (i.acqCapitalized ? 0 : i.acqFee);
  const apr = effectiveApr({ value: i.price - i.rebates, upfront: upfrontFees, pmt, term: i.term, endCost: residual + i.dispositionFee });

  const years = i.term / 12;
  const overMiles = Math.max(0, i.expectedMiles * years - i.allowanceMiles * years);
  const overage = (overMiles * i.overageCents) / 100;
  const driveOff = i.down + (i.acqCapitalized ? 0 : i.acqFee) + i.otherDue + monthly;
  const leaseTotal = i.down + i.acqFee + i.otherDue + monthly * i.term + i.dispositionFee + overage;

  const mkt = i.marketValue === null ? residual : i.marketValue;
  const principal = i.price - i.rebates - i.down;
  const salesTax = ((i.price - i.rebates) * i.taxRate) / 100;
  const loanPmt = loanPayment(principal, i.buyApr, i.buyTerm);
  const paid = Math.min(i.term, i.buyTerm);
  const balance = loanBalance(principal, i.buyApr, i.buyTerm, i.term);
  const buyOut = i.down + salesTax + i.otherDue + loanPmt * paid + balance;
  const buyNet = buyOut - mkt;

  const out = {
    ok: true, input: i, notes, residual, adjCap, dep, fin, pmt, tax, monthly, mf, stated, apr,
    driveOff, leaseTotal, leasePerMonth: leaseTotal / i.term, overMiles, overage,
    onePercent: (pmt / i.msrp) * 100,
    buy: { loanPmt, salesTax, principal, balance, marketValue: mkt, cashOut: buyOut, net: buyNet, perMonth: buyNet / i.term },
    cheaper: leaseTotal < buyNet ? "lease" : "buy",
    difference: Math.abs(leaseTotal - buyNet),
  };
  if (i.baseMoneyFactor !== null) {
    const markupMf = mf - i.baseMoneyFactor;
    out.markup = { mf: markupMf, aprPoints: markupMf * 2400, perMonth: (adjCap + residual) * markupMf, overTerm: (adjCap + residual) * markupMf * i.term };
    if (markupMf > 0.00005) notes.push("This money factor is " + markupMf.toFixed(5) + " above the base rate you entered (" + (markupMf * 2400).toFixed(2) + " APR points), about " + money(out.markup.perMonth) + " a month before tax. Ask for the base rate in writing.");
  }
  // What each lever is worth, by re-running the same formula.
  const again = (patch) => solve({ ...raw, ...patch }, true);
  const deltaPmt = (r) => (r.ok ? out.monthly - r.monthly : null);
  if (i.mode === "mf" && !noLevers) {
    out.levers = {
      per1000Price: deltaPmt(again({ price: i.price - 1000 })),
      per1000Down: deltaPmt(again({ down: i.down + 1000 })),
      perMfPoint: deltaPmt(again({ moneyFactor: Math.max(0, mf - 0.0001) })),
      perResidualPoint: out.monthly - (again({ residualPct: Math.min(99, i.residualPct + 1) }).monthly ?? out.monthly),
    };
  }
  return out;
}

export function resultText(R) {
  const i = R.input;
  const L = [
    "Car lease check: " + money(i.price) + " price on a " + money(i.msrp) + " MSRP, " + i.term + " months",
    "Monthly: " + money(R.pmt) + " before tax" + (i.taxRate ? ", " + money(R.monthly) + " with tax" : ""),
    "Money factor " + R.mf.toFixed(5) + " = " + R.stated.toFixed(2) + "% APR on the rate sheet" + (R.apr !== null ? "; " + R.apr.toFixed(2) + "% once fees are counted" : ""),
    "Due at signing: " + money(R.driveOff),
    "Total lease cost over the term: " + money(R.leaseTotal) + " (" + money(R.leasePerMonth) + "/mo)",
    "Buying instead (" + i.buyApr + "% loan, keep " + i.term + " months then sell): " + money(R.buy.net) + " net (" + money(R.buy.perMonth) + "/mo)",
    "Cheaper over this term: " + R.cheaper + " by " + money(R.difference),
  ];
  if (R.markup) L.push("Versus base money factor: " + (R.markup.aprPoints >= 0 ? "+" : "") + R.markup.aprPoints.toFixed(2) + " APR points (" + money(R.markup.overTerm) + " over the term)");
  return L.join("\n");
}

export function resultCsv(R) {
  const rows = [
    ["Item", "Amount"], ["Price", R.input.price], ["Rebates", R.input.rebates], ["Down payment", R.input.down],
    ["Capitalized cost", r2(R.adjCap)], ["Residual", R.residual], ["Money factor", R.mf.toFixed(6)], ["Rate-sheet APR", R.stated.toFixed(3)],
    ["Depreciation per month", r2(R.dep)], ["Rent charge per month", r2(R.fin)], ["Payment before tax", r2(R.pmt)], ["Tax per month", r2(R.tax)], ["Payment with tax", r2(R.monthly)],
    ["Due at signing", r2(R.driveOff)], ["Total lease cost", r2(R.leaseTotal)], ["Net cost of buying", r2(R.buy.net)],
  ];
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}

export function serializeState(raw) { return JSON.stringify({ kind: "car-lease-deal-checker", version: 1, ...raw }, null, 2); }

export function parseState(text) {
  let o;
  try { o = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!o || o.kind !== "car-lease-deal-checker") return { error: "That is not a saved lease check." };
  if (!Number.isFinite(Number(o.msrp)) || !Number.isFinite(Number(o.price))) return { error: "The saved file is missing fields." };
  const { kind, version, ...state } = o;
  return { state };
}

export function sampleInput() {
  return {
    mode: "mf", msrp: 35000, price: 33000, residualPct: 60, term: 36, moneyFactor: 0.00125, quotedPayment: 427,
    down: 0, rebates: 0, acqFee: 895, acqCapitalized: true, otherDue: 300, dispositionFee: 395, taxRate: 7,
    allowanceMiles: 12000, expectedMiles: 14000, overageCents: 25, buyApr: 6.5, buyTerm: 60, marketValue: "", baseMoneyFactor: 0.00085,
  };
}
