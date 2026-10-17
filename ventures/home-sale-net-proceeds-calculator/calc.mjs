// Home sale net proceeds: what you walk away with at closing, the federal and
// state tax the sale may trigger, and the list price needed to net a target.
// Pure arithmetic on typed numbers. Tax figures are tax-year 2026 and are an
// estimate, not a return.
export const TAX_YEAR = 2026;

export const TAX = {
  single: {
    std: 16100,
    ordinary: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
    zeroTop: 49450, fifteenTop: 545500, niit: 200000, exclusion: 250000,
  },
  mfj: {
    std: 32200,
    ordinary: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
    zeroTop: 98900, fifteenTop: 613700, niit: 250000, exclusion: 500000,
  },
};

export function money(x) {
  const n = Math.round(Number(x) * 100) / 100;
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "-$" : "$") + s;
}
const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
const band = (start, amount, lo, hi) => Math.max(0, Math.min(start + amount, hi) - Math.max(start, lo));

export function ordinaryTax(taxable, status) {
  let tax = 0, prev = 0;
  for (const [top, rate] of TAX[status].ordinary) {
    if (taxable > prev) tax += (Math.min(taxable, top) - prev) * rate;
    prev = top;
  }
  return tax;
}

export function validate(i) {
  const e = [];
  const n = (k) => num(i[k]);
  for (const k of ["salePrice", "mortgagePayoff", "listCommissionPct", "buyerCommissionPct", "concessions", "titleEscrowPct", "transferTaxPct", "prepCosts", "otherCosts", "proratedTaxes", "purchasePrice", "buyingCosts", "improvements", "depreciation", "otherIncome", "stateRatePct", "partialMonths", "targetNet"]) {
    if (!Number.isFinite(n(k)) || n(k) < 0) e.push(`${k} must be a number, zero or more.`);
  }
  if (!(n("salePrice") > 0)) e.push("Enter the sale price.");
  if (n("listCommissionPct") + n("buyerCommissionPct") + n("titleEscrowPct") + n("transferTaxPct") >= 50) e.push("Percentage costs add up to 50% or more of the price; check the percent fields.");
  if (n("stateRatePct") > 20) e.push("State tax rate looks too high (over 20%).");
  if (!["single", "mfj"].includes(i.filing)) e.push("Pick a filing status.");
  if (!["full", "partial", "none"].includes(i.exclusion)) e.push("Pick an exclusion choice.");
  if (!["closing", "aftertax"].includes(i.targetBasis)) e.push("Pick what the target applies to.");
  return e;
}

// Net for one price. `concessions` overrides the input's when given (offer compare).
export function netFor(i, price, concessions = num(i.concessions)) {
  const status = i.filing === "mfj" ? "mfj" : "single";
  const t = TAX[status];
  const listC = price * num(i.listCommissionPct) / 100;
  const buyC = price * num(i.buyerCommissionPct) / 100;
  const title = price * num(i.titleEscrowPct) / 100;
  const transfer = price * num(i.transferTaxPct) / 100;
  const other = num(i.otherCosts);
  const sellingCosts = listC + buyC + title + transfer + concessions + other;
  const prep = num(i.prepCosts);
  const prorated = num(i.proratedTaxes);
  const payoff = num(i.mortgagePayoff);
  const closingNet = price - sellingCosts - payoff - prorated;
  const cashAfterPrep = closingNet - prep;

  // Tax. Fix-up and proration costs do not reduce the gain; selling costs do.
  const realized = price - sellingCosts;
  const basis = num(i.purchasePrice) + num(i.buyingCosts) + num(i.improvements) - num(i.depreciation);
  const gain = num(i.purchasePrice) > 0 ? realized - basis : 0;
  const recapture = Math.min(num(i.depreciation), Math.max(gain, 0));
  let exclusion = 0;
  if (i.exclusion === "full") exclusion = t.exclusion;
  else if (i.exclusion === "partial") exclusion = t.exclusion * Math.min(num(i.partialMonths), 24) / 24;
  const ltcgGain = Math.max(0, gain - recapture - exclusion);
  const excluded = Math.max(0, Math.min(gain - recapture, exclusion));
  const short = i.heldOverYear === false || i.heldOverYear === "no";
  const income = num(i.otherIncome);
  const ordTaxable = Math.max(0, income - t.std);
  let federal = 0, recaptureTax = 0, ltcgTax = 0;
  if (short) {
    federal = ordinaryTax(ordTaxable + recapture + ltcgGain, status) - ordinaryTax(ordTaxable, status);
  } else {
    recaptureTax = recapture > 0 ? Math.min(ordinaryTax(ordTaxable + recapture, status) - ordinaryTax(ordTaxable, status), recapture * 0.25) : 0;
    const base = ordTaxable + recapture;
    const a0 = band(base, ltcgGain, 0, t.zeroTop);
    const a15 = band(base, ltcgGain, t.zeroTop, t.fifteenTop);
    const a20 = Math.max(0, ltcgGain - a0 - a15);
    ltcgTax = a15 * 0.15 + a20 * 0.20;
    federal = recaptureTax + ltcgTax;
  }
  const taxableGain = recapture + ltcgGain;
  const niit = Math.min(taxableGain, Math.max(0, income + taxableGain - t.niit)) * 0.038;
  const state = taxableGain * num(i.stateRatePct) / 100;
  const tax = federal + niit + state;
  return {
    price, listC, buyC, title, transfer, concessions, other, sellingCosts, prep, prorated, payoff,
    closingNet, cashAfterPrep, realized, basis, gain, recapture, exclusion: excluded, ltcgGain, taxableGain,
    federal, recaptureTax, ltcgTax, niit, state, tax, afterTax: cashAfterPrep - tax,
    costPct: price > 0 ? (sellingCosts / price) * 100 : 0,
  };
}

// Price whose net hits the target. Net is increasing in price, so bisect.
export function priceForTarget(i, target, basis = i.targetBasis) {
  const f = (p) => { const r = netFor(i, p); return basis === "aftertax" ? r.afterTax : r.closingNet; };
  let lo = 0, hi = Math.max(1e6, (target + num(i.mortgagePayoff) + 1e6) * 4);
  if (f(hi) < target) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid; else hi = mid;
  }
  return hi;
}

export function solve(raw) {
  const i = { filing: "single", exclusion: "full", targetBasis: "closing", heldOverYear: true, ...raw };
  const errors = validate(i);
  if (errors.length) return { ok: false, errors };
  const r = netFor(i, num(i.salePrice));
  const notes = [];
  if (r.closingNet < 0) notes.push("The sale does not cover the payoff and costs; you would need to bring cash to closing.");
  if (num(i.purchasePrice) <= 0) notes.push("No purchase price entered, so no tax is estimated. Enter it to see the capital gains estimate.");
  if (r.gain > 0 && i.exclusion === "none") notes.push("You chose no exclusion, so the whole gain is taxed. Most people who lived in the home two of the last five years qualify for the exclusion.");
  if (r.recapture > 0) notes.push("Depreciation you took on a rental or home office is taxed up to 25% and is not covered by the exclusion.");
  if (i.heldOverYear === false || i.heldOverYear === "no") notes.push("Owned a year or less, so the gain is taxed as ordinary income.");
  const target = num(i.targetNet) > 0 ? priceForTarget(i, num(i.targetNet)) : undefined;
  const price = num(i.salePrice);
  const per = (d) => netFor(i, price + d).closingNet - r.closingNet;
  const levers = {
    per10k: per(10000),
    perHalfPointCommission: price * 0.005,
    perPointPrice: per(price * 0.01),
  };
  const grid = [-0.1, -0.05, -0.025, 0, 0.025, 0.05].map((d) => {
    const x = netFor(i, price * (1 + d));
    return { delta: d * 100, price: x.price, closingNet: x.closingNet, afterTax: x.afterTax };
  });
  const offers = (raw.offers || []).filter((o) => num(o.price) > 0).map((o) => {
    const x = netFor(i, num(o.price), num(o.concessions));
    return { label: o.label || "Offer", price: x.price, concessions: x.concessions, closingNet: x.closingNet, afterTax: x.afterTax };
  });
  if (offers.length) {
    const best = Math.max(...offers.map((o) => o.afterTax));
    for (const o of offers) { o.best = o.afterTax === best; o.behind = best - o.afterTax; }
  }
  return { ok: true, input: i, r, notes, target, levers, grid, offers };
}

export function resultText(R) {
  const r = R.r;
  const L = [
    "Home sale net proceeds estimate",
    `Sale price: ${money(r.price)}`,
    `Agent commissions: -${money(r.listC + r.buyC)}`,
    `Title, escrow, transfer tax: -${money(r.title + r.transfer)}`,
    `Seller concessions and other costs: -${money(r.concessions + r.other)}`,
    `Mortgage payoff: -${money(r.payoff)}`,
    `Prorated taxes and dues: -${money(r.prorated)}`,
    `Cash at closing: ${money(r.closingNet)}`,
    `Prep and repairs paid beforehand: -${money(r.prep)}`,
    `Estimated tax on the sale: -${money(r.tax)}`,
    `Estimated net after tax: ${money(r.afterTax)}`,
    `Cost of selling: ${r.costPct.toFixed(2)}% of price`,
  ];
  if (R.target) L.push(`List price needed to hit your target: ${money(R.target)}`);
  L.push("Estimate only; not tax or legal advice.");
  return L.join("\n");
}

export function resultCsv(R) {
  const r = R.r;
  const rows = [["Line", "Amount"], ["Sale price", r.price], ["Listing agent", -r.listC], ["Buyer agent", -r.buyC], ["Title and escrow", -r.title], ["Transfer tax", -r.transfer], ["Concessions", -r.concessions], ["Other selling costs", -r.other], ["Mortgage payoff", -r.payoff], ["Prorated taxes and dues", -r.prorated], ["Cash at closing", r.closingNet], ["Prep and repairs", -r.prep], ["Federal tax", -(r.federal)], ["Net investment income tax", -r.niit], ["State tax", -r.state], ["Net after tax", r.afterTax]];
  return rows.map((x) => x.map((c) => (typeof c === "number" ? c.toFixed(2) : c)).join(",")).join("\n");
}

export function serializeState(raw) { return JSON.stringify({ kind: "home-sale-net-proceeds-calculator", version: 1, ...raw }, null, 2); }

export function parseState(text) {
  let o;
  try { o = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!o || o.kind !== "home-sale-net-proceeds-calculator") return { error: "That is not a saved home sale estimate." };
  if (!Number.isFinite(Number(o.salePrice))) return { error: "The saved file is missing fields." };
  const { kind, version, ...state } = o;
  return { state };
}

export function sampleInput() {
  return {
    salePrice: 450000, mortgagePayoff: 212000, listCommissionPct: 2.5, buyerCommissionPct: 2.5, concessions: 0,
    titleEscrowPct: 1, transferTaxPct: 0.5, prepCosts: 3500, otherCosts: 500, proratedTaxes: 1800,
    purchasePrice: 120000, buyingCosts: 4000, improvements: 25000, depreciation: 0, heldOverYear: true,
    filing: "single", exclusion: "full", partialMonths: 12, otherIncome: 95000, stateRatePct: 4, targetNet: 250000, targetBasis: "closing",
    offers: [
      { label: "Offer A", price: 450000, concessions: 0 },
      { label: "Offer B", price: 462000, concessions: 9000 },
      { label: "Offer C", price: 441000, concessions: 0 },
    ],
  };
}
