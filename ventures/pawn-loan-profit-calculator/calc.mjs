// Pawn loan profit for a pawnbroker: what a typical loan earns once you count the redemption rate, the interest and
// fees you collect, what a forfeited item really sells for, the cost of money and the time the item sits. It also
// works backwards to the biggest loan an item can carry and the smallest loan worth writing.
// Pure functions, nothing leaves the browser.
//
// Per loan of L against an item you expect to resell for R (a retail estimate before markdowns):
//   redeemed (probability r):  interest + fees for `redeemMonths`, minus ticket cost, storage and the cost of money.
//   forfeited (1 - r):         interest + fees for `forfeitPaidMonths`, plus net sale proceeds minus L, minus the same costs
//                              over the longer time the money is out (forfeit wait + days to sell).
// Net sale proceeds = R x realization x (1 - selling cost) x (1 - shrink). The default figures are placeholders, not
// your rate card, your state's rate cap or your sell-through.

export const DEFAULTS = {
  avgLoan: 150,           // typical loan amount, dollars
  ltvPct: 45,             // loan as a percent of the item's expected resale price (R)
  redeemPct: 70,          // share of loans the customer pays off and takes back, percent
  monthlyRatePct: 10,     // interest/service charge per month on the loan, percent (check your state's cap)
  monthlyFee: 2,          // flat storage/insurance fee per ticket per month, dollars
  redeemMonths: 1.6,      // average months a redeemed loan is open, counting renewals
  forfeitMonths: 3,       // months from the loan until the item is yours (term plus grace)
  forfeitPaidMonths: 1.5, // months of interest and fees collected on loans that end up forfeited
  realizationPct: 75,     // what the item actually sells for, percent of your retail estimate (markdowns, haggling)
  sellCostPct: 8,         // fees and commissions on the sale, percent (online platform, card fees)
  shrinkPct: 5,           // forfeited items lost, damaged or returned unsold, percent of their value
  daysToSell: 60,         // average days a forfeited item sits before it sells
  ticketCost: 6,          // labour, paperwork and reporting per loan, dollars
  storagePerMonth: 0.5,   // vault and handling cost per item per month, dollars
  capitalRatePct: 12,     // what your money costs per year, percent
  loansPerMonth: 300,     // new loans written a month
  wantPct: 12,            // profit you want on each dollar lent, percent
  itemValue: 400,         // an item on the counter: your retail estimate, dollars
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

const DAYS_PER_MONTH = 30.4167;

// Net resale as a share of the retail estimate.
export const saleFactor = (o, realization = o.realizationPct) =>
  (realization / 100) * (1 - o.sellCostPct / 100) * (1 - o.shrinkPct / 100);

// Economics of one loan of `loan` dollars against an item worth `retail`, at redemption rate `redeem` percent.
export function loanEconomics(o, { loan = o.avgLoan, retail = loan / (o.ltvPct / 100), redeem = o.redeemPct, realization = o.realizationPct } = {}) {
  const r = redeem / 100;
  const rate = o.monthlyRatePct / 100;
  const sellMonths = o.daysToSell / DAYS_PER_MONTH;
  const holdF = o.forfeitMonths + sellMonths;
  const cap = o.capitalRatePct / 100 / 12;
  const intR = loan * rate * o.redeemMonths + o.monthlyFee * o.redeemMonths;
  const intF = loan * rate * o.forfeitPaidMonths + o.monthlyFee * o.forfeitPaidMonths;
  const net = retail * saleFactor(o, realization);
  const costR = o.ticketCost + loan * cap * o.redeemMonths + o.storagePerMonth * o.redeemMonths;
  const costF = o.ticketCost + loan * cap * holdF + o.storagePerMonth * holdF;
  const profitR = intR - costR;
  const profitF = intF + net - loan - costF;
  const profit = r * profitR + (1 - r) * profitF;
  const months = r * o.redeemMonths + (1 - r) * holdF;
  return { loan, retail, ltv: retail > 0 ? loan / retail * 100 : NaN, interestRedeemed: intR, interestForfeited: intF, netSale: net,
    profitRedeemed: profitR, profitForfeited: profitF, profit, months,
    margin: loan > 0 ? profit / loan * 100 : NaN,
    annualRoi: loan > 0 && months > 0 ? profit / (loan * months) * 12 * 100 : NaN,
    expectedInterest: r * intR + (1 - r) * intF, expectedLoss: (1 - r) * Math.max(0, loan - net) };
}

// Profit is linear in the loan for a fixed item: profit(L) = L*c1 + (1-r)*R*S - fixed.
function linear(o, redeem = o.redeemPct, realization = o.realizationPct) {
  const r = redeem / 100, rate = o.monthlyRatePct / 100, cap = o.capitalRatePct / 100 / 12;
  const holdF = o.forfeitMonths + o.daysToSell / DAYS_PER_MONTH;
  const c1 = r * (rate * o.redeemMonths - cap * o.redeemMonths)
    + (1 - r) * (rate * o.forfeitPaidMonths - cap * holdF - 1);
  const fixed = o.ticketCost + o.storagePerMonth * (r * o.redeemMonths + (1 - r) * holdF)
    - o.monthlyFee * (r * o.redeemMonths + (1 - r) * o.forfeitPaidMonths);
  return { c1, fixed, S: saleFactor(o, realization), r };
}

// Largest loan on an item worth `retail` that still earns `targetPct` of the loan.
export function maxLoan(o, retail = o.itemValue, targetPct = o.wantPct, redeem = o.redeemPct) {
  const { c1, fixed, S, r } = linear(o, redeem);
  const top = (1 - r) * retail * S - fixed;
  const d = targetPct / 100 - c1;
  if (d <= 0) return top > 0 ? retail : 0; // no loan size can miss the target; cap at the item's value
  return Math.min(retail, Math.max(0, top / d));
}

// Smallest loan that earns anything at the current loan-to-value.
export function minLoan(o, ltvPct = o.ltvPct, redeem = o.redeemPct) {
  const { c1, fixed, S, r } = linear(o, redeem);
  const perDollar = c1 + (1 - r) * S / (ltvPct / 100);
  return perDollar > 0 ? fixed / perDollar : Infinity;
}

// Redemption rate at which the average loan breaks even (profit is linear in the rate).
export function breakEvenRedemption(o) {
  const a = loanEconomics(o, { redeem: 0 }).profit, b = loanEconomics(o, { redeem: 100 }).profit;
  if (a >= 0 && b >= 0) return 0;
  if (a < 0 && b < 0) return NaN;
  if (a >= 0) return 100; // only a higher forfeit rate pays
  return Math.min(100, Math.max(0, -a / (b - a) * 100));
}

export const redemptionLadder = (o, steps = [50, 60, 70, 75, 80, 85, 90]) =>
  steps.map((p) => ({ redeemPct: p, ...loanEconomics(o, { redeem: p }) }));
export const ltvLadder = (o, steps = [25, 30, 35, 40, 45, 50, 60]) =>
  steps.map((p) => ({ ltvPct: p, ...loanEconomics(o, { retail: o.avgLoan / (p / 100) }) }));
export const realizationLadder = (o, steps = [60, 70, 80, 85, 90, 100]) =>
  steps.map((p) => ({ realizationPct: p, ...loanEconomics(o, { realization: p }) }));

export function analyze(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) o[k] = num(raw[k]);
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  if (!(o.avgLoan > 0)) warnings.push("Enter a typical loan amount above zero.");
  if (!(o.ltvPct > 0 && o.ltvPct <= 100)) warnings.push("Loan-to-value must be above 0% and no more than 100% of the item's resale price.");
  if (o.redeemPct > 100) warnings.push("The redemption rate cannot be more than 100%.");
  if (o.realizationPct > 150) warnings.push("Selling for more than 150% of your own retail estimate looks like a typo.");
  if (o.sellCostPct >= 100 || o.shrinkPct >= 100) warnings.push("Selling cost and shrink must be under 100%.");
  if (warnings.length) return { opts: o, warnings, result: null, redemption: [], ltv: [], realization: [] };
  if (o.forfeitPaidMonths > o.forfeitMonths) warnings.push("You collect interest on forfeited loans for longer than they stay open; check those two figures.");
  const base = loanEconomics(o);
  const be = breakEvenRedemption(o);
  const item = maxLoan(o);
  const want = o.itemValue > 0 ? item / o.itemValue * 100 : NaN;
  const capped = want >= 99.99;
  const result = { capped,
    base, breakEvenRedeem: be, itemMaxLoan: item, itemMaxLtv: want, smallest: minLoan(o),
    monthlyProfit: base.profit * o.loansPerMonth,
    capitalOut: o.loansPerMonth * o.avgLoan * base.months,
    effectiveApr: o.monthlyRatePct * 12,
  };
  if (base.profit < 0) warnings.push("The average loan loses money at these figures.");
  if (Number.isFinite(be) && be > o.redeemPct) warnings.push(`You need about ${pct(be)} of loans redeemed to break even and assume ${pct(o.redeemPct)}.`);
  if (capped) warnings.push("At these figures no loan size on this item misses your profit target, so the figure shown is the item's full value; in practice lend well below it.");
  if (Number.isNaN(be)) warnings.push("No redemption rate makes the average loan pay at these figures; lower the loan-to-value or raise the rate.");
  if (o.avgLoan < result.smallest) warnings.push(`Your typical loan is below the smallest loan that pays (${money2(result.smallest)}): per-ticket costs outrun the interest.`);
  if (base.profitForfeited < 0) warnings.push(`Each forfeited loan loses ${money(Math.abs(base.profitForfeited))} on average; the interest you collected does not cover the gap between the loan and the sale.`);
  if (result.effectiveApr > 300) warnings.push("The monthly rate you entered is above 25% a month. Most states cap pawn charges below this; check yours.");
  return { opts: o, warnings, result, redemption: redemptionLadder(o), ltv: ltvLadder(o), realization: realizationLadder(o) };
}

export function toCsv(a) {
  if (!a || !a.redemption.length) return "";
  const block = (title, key, rows) => [`${title},profit_per_loan,margin_on_loan_pct,annual_return_on_money_pct`,
    ...rows.map((r) => [r[key], r.profit.toFixed(2), Number.isFinite(r.margin) ? r.margin.toFixed(2) : "", Number.isFinite(r.annualRoi) ? r.annualRoi.toFixed(2) : ""].join(","))].join("\n");
  return [block("redemption_pct", "redeemPct", a.redemption), "", block("loan_to_value_pct", "ltvPct", a.ltv), "", block("sale_realization_pct", "realizationPct", a.realization)].join("\n") + "\n";
}
