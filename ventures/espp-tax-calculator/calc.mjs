// ESPP tax: what an employee stock purchase plan lot really nets after tax if
// sold at purchase, held a year, or held to a qualifying disposition, and how far
// the price can fall before waiting loses to selling now. Deterministic and local.
// Federal ESPP rules (IRC 421 and 423); rates are supplied by the visitor.

export const LOSS_DEDUCTION_LIMIT = 3000;
export const ESPP_ANNUAL_LIMIT = 25000; // FMV at offering date, per calendar year, s.423(b)(8)

export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

// Price paid per share: discount off the lower of the two prices with a lookback,
// off the purchase-date price without one.
export function purchasePrice({ offerFmv, purchaseFmv, discount, lookback }) {
  const ref = lookback ? Math.min(offerFmv, purchaseFmv) : purchaseFmv;
  return ref * (1 - discount);
}

// Tax value of a capital result. Gains are taxed at `rate`; losses first cancel
// other gains, then deduct up to $3,000 against ordinary income; the rest carries
// forward and is valued at zero here (stated on the page).
function capitalTax(cap, rate, ord, otherGains) {
  if (cap >= 0) return cap * rate;
  const loss = -cap;
  const absorbed = Math.min(loss, otherGains);
  const deducted = Math.min(loss - absorbed, LOSS_DEDUCTION_LIMIT);
  return -(absorbed * rate + deducted * ord);
}

// One disposition of the whole lot. months = months held after purchase.
export function dispose(lot, salePrice, months) {
  const { shares, price, purchaseFmv, offerFmv, discount, offerMonths, rates, otherGains } = lot;
  const qualifying = months >= 12 && offerMonths + months >= 24;
  const gainPerShare = salePrice - price;
  const offerDiscount = offerFmv * discount;
  let ordinary, basis;
  if (qualifying) {
    ordinary = Math.max(0, Math.min(gainPerShare, offerDiscount));
    basis = price + ordinary;
  } else {
    ordinary = purchaseFmv - price;
    basis = purchaseFmv;
  }
  const cap = salePrice - basis;
  const longTerm = months >= 12;
  const capRate = longTerm ? rates.ltcg : rates.ord;
  const ordTax = ordinary * shares * rates.ord;
  const capTax = capitalTax(cap * shares, capRate, rates.ord, otherGains);
  const cost = price * shares;
  const proceeds = salePrice * shares;
  const tax = ordTax + capTax;
  return {
    qualifying, longTerm, months, salePrice, ordinary: ordinary * shares, capital: cap * shares,
    basis: basis * shares, ordTax, capTax, tax, proceeds, cost,
    pretaxProfit: proceeds - cost, netProfit: proceeds - cost - tax,
    carriedLoss: cap < 0 ? Math.max(0, -cap * shares - Math.min(-cap * shares, otherGains) - LOSS_DEDUCTION_LIMIT) : 0,
  };
}

// Earliest month, counted after purchase, at which a sale qualifies.
export const qualifyingMonths = (offerMonths) => Math.max(12, 24 - offerMonths);

// Sale price at which holding to the qualifying date leaves exactly as much
// after tax as selling at the purchase price today. Net profit from holding is
// nondecreasing in price, so bisection finds it.
export function breakevenPrice(lot, sellNowNet) {
  const qm = qualifyingMonths(lot.offerMonths);
  const f = (p) => dispose(lot, p, qm).netProfit - sellNowNet;
  if (f(0) >= 0) return 0;
  let lo = 0, hi = Math.max(lot.purchaseFmv, lot.price, 1) * 20;
  if (f(hi) < 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) hi = mid; else lo = mid;
  }
  return hi;
}

function optional(v, dflt, name, max) {
  if (String(v ?? "").trim() === "") return { v: dflt };
  const n = parseNum(v);
  if (!(n >= 0 && n <= max)) return { error: `${name} must be between 0 and ${max}.` };
  return { v: n };
}

export function analyze(input) {
  const offerFmv = parseNum(input.offerFmv), purchaseFmv = parseNum(input.purchaseFmv);
  if (!(offerFmv > 0)) return { error: "Enter the stock price on the first day of the offering period, above zero." };
  if (!(purchaseFmv > 0)) return { error: "Enter the stock price on the purchase date, above zero." };
  const disc = parseNum(input.discount);
  if (!(disc > 0 && disc <= 15)) return { error: "Enter your plan discount as a percentage above 0 and up to 15 (the legal maximum for a qualified plan)." };
  const lookback = input.lookback === "yes";
  if (input.lookback !== "yes" && input.lookback !== "no") return { error: "Say whether your plan has a lookback." };
  const shares = parseNum(input.shares);
  if (!(shares > 0)) return { error: "Enter the number of shares you bought, above zero." };
  const om = parseNum(input.offerMonths);
  if (!(om >= 0 && om <= 27)) return { error: "Enter the months from the start of the offering period to the purchase date (0 to 27)." };
  const ord = parseNum(input.ordRate), ltcg = parseNum(input.ltcgRate);
  if (!(ord >= 0 && ord <= 60)) return { error: "Enter your combined marginal income tax rate as a percentage, 0 to 60." };
  if (!(ltcg >= 0 && ltcg <= 40)) return { error: "Enter your long-term capital gains rate as a percentage, 0 to 40." };
  const sp = String(input.salePrice ?? "").trim() === "" ? purchaseFmv : parseNum(input.salePrice);
  if (!(sp >= 0)) return { error: "The price you expect to sell at must be a number, or blank." };
  const og = optional(input.otherGains, 0, "Other capital gains this year", 1e10);
  if (og.error) return { error: og.error };

  const discount = disc / 100;
  const price = purchasePrice({ offerFmv, purchaseFmv, discount, lookback });
  const lot = { shares, price, purchaseFmv, offerFmv, discount, offerMonths: om, rates: { ord: ord / 100, ltcg: ltcg / 100 }, otherGains: og.v };

  const qm = qualifyingMonths(om);
  const sellNow = dispose(lot, purchaseFmv, 0);
  const hold12 = qm > 12 ? dispose(lot, sp, 12) : null;
  const holdQ = dispose(lot, sp, qm);
  const be = breakevenPrice(lot, sellNow.netProfit);
  const bePct = be === null ? null : (be / purchaseFmv - 1) * 100;

  const shocks = [-50, -30, -15, 0, 15, 30, 50];
  const sensitivity = shocks.map((s) => {
    const p = purchaseFmv * (1 + s / 100);
    const h = dispose(lot, p, qm);
    return { shock: s, price: p, holdNet: h.netProfit, sellNowNet: sellNow.netProfit, diff: h.netProfit - sellNow.netProfit, tax: h.tax };
  });

  // Tax prize for waiting: the same sale taxed as disqualifying instead of qualifying.
  const taxPrize = disqualifyingAt(lot, sp, qm).tax - holdQ.tax;

  // The classic overpayment: entering the broker's 1099-B basis (the price paid) unadjusted
  // taxes the ordinary income a second time, at the capital rate of that sale.
  const sellNowBasisOverpay = sellNow.ordinary * lot.rates.ord;
  const holdBasisOverpay = holdQ.ordinary * (holdQ.longTerm ? lot.rates.ltcg : lot.rates.ord);
  const basisOverpay = Math.max(sellNowBasisOverpay, holdBasisOverpay);

  const cash = shares * price;
  const returnOnCash = sellNow.pretaxProfit / cash;
  const halfPeriod = Math.max(om / 2, 0.5);
  const annualized = Math.pow(1 + returnOnCash, 12 / halfPeriod) - 1;
  const purchaseOfferValue = shares * offerFmv;

  const findings = [];
  findings.push({ severity: "info", title: `Selling right away locks in $${money(sellNow.netProfit)} after tax`, detail: `You paid $${money(cash)} (about $${price.toFixed(2)} a share) for stock worth $${money(shares * purchaseFmv)}. That gain is a ${money(returnOnCash * 100)}% return on your cash in roughly ${om >= 1 ? om : "a few"} months. It is taxed as ordinary income, about $${money(sellNow.tax)}.` });
  if (be !== null) findings.push({ severity: "medium", title: bePct < 0 ? `Waiting to qualify beats selling now only if the price stays above $${be.toFixed(2)} (${Math.abs(bePct).toFixed(0)}% below today)` : `Waiting to qualify needs the price to rise to $${be.toFixed(2)} (${bePct.toFixed(0)}% above today) to beat selling now`, detail: `The qualifying date is ${qm} months after purchase. Below that price you end up with less after tax than if you had sold at purchase. Holding is a bet on your employer's stock on top of the salary you already depend on it for.` });
  if (taxPrize > 0.5) findings.push({ severity: "info", title: `Qualifying saves $${money(taxPrize)} of tax at a $${sp.toFixed(2)} sale price`, detail: "That is the difference between disqualifying treatment (the discount at purchase is ordinary income and the rest is capital gain) and qualifying treatment (less ordinary income, more long-term gain) for the same sale. It is the whole prize for waiting; compare it with what a price move does to the same shares." });
  if (sellNow.ordinary > 0) findings.push({ severity: "medium", title: "Your 1099-B and Form 3922 will not agree; fix the cost basis or you pay twice", detail: `Brokers usually report the price you paid as your cost basis. The ordinary income (about $${money(sellNow.ordinary)} on a sale at purchase) is already taxed as wages, so it must be added to the basis on Form 8949 (adjustment code B). Skipping it overpays roughly $${money(basisOverpay)} in this scenario.` });
  if (purchaseOfferValue > ESPP_ANNUAL_LIMIT) findings.push({ severity: "medium", title: "This looks over the $25,000 yearly limit", detail: `The IRS limit counts shares at the stock price on the first day of the offering period. ${money(shares)} shares at $${offerFmv.toFixed(2)} is $${money(purchaseOfferValue)}; a plan normally cuts back purchases above $25,000 a calendar year. Check the shares you actually received.` });
  return { lot, price, cash, qm, sellNow, hold12, holdQ, breakeven: be, breakevenPct: bePct, sensitivity, taxPrize, returnOnCash, annualized, basisOverpay, findings, salePrice: sp, shares, lookback };
}

// Disqualifying treatment at a month count that would otherwise qualify (used for the tax prize).
function disqualifyingAt(lot, salePrice, months) {
  const { shares, price, purchaseFmv, rates, otherGains } = lot;
  const ordinary = purchaseFmv - price;
  const cap = salePrice - purchaseFmv;
  const ordTax = ordinary * shares * rates.ord;
  const capTax = capitalTax(cap * shares, months >= 12 ? rates.ltcg : rates.ord, rates.ord, otherGains);
  return { tax: ordTax + capTax };
}

export function sampleInput() {
  return { offerFmv: "40", purchaseFmv: "52", discount: "15", lookback: "yes", shares: "250", offerMonths: "6", salePrice: "60", ordRate: "35", ltcgRate: "18.8", otherGains: "" };
}

const csvCell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(a) {
  const rows = [["Strategy", "Months held", "Treatment", "Ordinary income", "Capital gain or loss", "Tax", "Net profit after tax"]];
  const line = (name, d) => rows.push([name, d.months, d.qualifying ? "qualifying" : "disqualifying", round2(d.ordinary), round2(d.capital), round2(d.tax), round2(d.netProfit)]);
  line("Sell at purchase", a.sellNow);
  if (a.hold12) line("Hold 12 months", a.hold12);
  line("Hold to qualifying date", a.holdQ);
  rows.push([], ["Price paid per share", round2(a.price)], ["Breakeven sale price for waiting", a.breakeven === null ? "" : round2(a.breakeven)]);
  rows.push([], ["Price move from purchase price", "Sale price", "Net if held to qualify", "Net if sold at purchase", "Difference"]);
  for (const s of a.sensitivity) rows.push([s.shock + "%", round2(s.price), round2(s.holdNet), round2(s.sellNowNet), round2(s.diff)]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
