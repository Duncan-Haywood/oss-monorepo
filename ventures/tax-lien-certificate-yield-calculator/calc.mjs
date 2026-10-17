// Tax lien certificate yield (US county tax lien sales). Pure functions, no dependencies, nothing
// leaves the browser. Rules differ by state and county, so no state table is embedded: the user
// types the interest rule printed in their county's sale terms and this works out what a
// certificate returns if it is redeemed at each month, and what it returns if it is not.
//
// Interest rules modelled (percent of the certificate face, for a redemption after `m` months):
//   simple   rate is an annual percent, accrued pro rata by the month: rate x m / 12.
//   monthly  rate is a percent per month, charged for every started month: rate x ceil(m).
//   penalty  rate is a percent per period of `periodMonths`, charged for every started period:
//            rate x ceil(m / periodMonths).
// Then capped at `capPct` (0 = no cap) and floored at `minPct` (0 = no floor).
// Subsequent taxes the investor pays earn the same rule from the month they were paid, with
// the floor not applied.

export const MODES = {
  simple: "Simple annual rate (percent per year)",
  monthly: "Percent per started month",
  penalty: "Percent per started period (penalty style)",
};

export const DEFAULTS = {
  mode: "simple",
  face: 4000,
  premium: 0,
  premiumRefunded: "yes",
  rate: 16,
  periodMonths: 6,
  capPct: 0,
  minPct: 0,
  purchaseFee: 50,
  redemptionFee: 25,
  subsequentTaxes: 1800,
  subsequentMonth: 12,
  redeemMonth: 14,
  windowMonths: 36,
  redeemChance: 95,
  propertyValue: 60000,
  foreclosureCosts: 3500,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

export function money(x) {
  if (!Number.isFinite(x)) return "—";
  const r = Math.round(x);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

export function money2(x) {
  if (!Number.isFinite(x)) return "—";
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const nn = (v, d) => {
  const n = num(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

// Percent of face owed on redemption after `months`.
export function interestPct(o, months, applyFloor = true) {
  const m = Math.max(0, months);
  const rate = nn(o.rate, 0);
  let pct;
  if (o.mode === "monthly") pct = rate * Math.ceil(m);
  else if (o.mode === "penalty") pct = rate * Math.ceil(m / Math.max(1, nn(o.periodMonths, 6)));
  else pct = (rate * m) / 12;
  const cap = nn(o.capPct, 0);
  if (cap > 0) pct = Math.min(pct, cap);
  const min = nn(o.minPct, 0);
  if (applyFloor && m > 0 && min > 0) pct = Math.max(pct, min);
  return pct;
}

function norm(o) {
  const d = DEFAULTS;
  return {
    mode: Object.hasOwn(MODES, o.mode) ? o.mode : "simple",
    face: nn(o.face, d.face),
    premium: nn(o.premium, 0),
    premiumRefunded: o.premiumRefunded === "no" ? "no" : "yes",
    rate: nn(o.rate, 0),
    periodMonths: Math.max(1, nn(o.periodMonths, 6)),
    capPct: nn(o.capPct, 0),
    minPct: nn(o.minPct, 0),
    purchaseFee: nn(o.purchaseFee, 0),
    redemptionFee: nn(o.redemptionFee, 0),
    subsequentTaxes: nn(o.subsequentTaxes, 0),
    subsequentMonth: nn(o.subsequentMonth, 0),
    redeemMonth: Math.max(1, nn(o.redeemMonth, 12)),
    windowMonths: Math.max(1, nn(o.windowMonths, 36)),
    redeemChance: Math.min(100, nn(o.redeemChance, 100)),
    propertyValue: nn(o.propertyValue, 0),
    foreclosureCosts: nn(o.foreclosureCosts, 0),
  };
}

// Cash in and out if the owner redeems after `months`. Subsequent taxes count only if they were
// paid before the redemption.
export function redeemedAt(o, months) {
  const p = norm(o);
  const subPaid = p.subsequentMonth < months ? p.subsequentTaxes : 0;
  const invested = p.face + p.premium + p.purchaseFee + subPaid;
  const faceInterest = (p.face * interestPct(p, months)) / 100;
  const subInterest = subPaid > 0 ? (subPaid * interestPct(p, months - p.subsequentMonth, false)) / 100 : 0;
  const received =
    p.face + subPaid + faceInterest + subInterest + (p.premiumRefunded === "yes" ? p.premium : 0) - p.redemptionFee;
  const net = received - invested;
  const roi = invested > 0 ? net / invested : NaN;
  const annualSimple = Number.isFinite(roi) ? (roi * 12) / months : NaN;
  const annualCompound = Number.isFinite(roi) && roi > -1 ? Math.pow(1 + roi, 12 / months) - 1 : NaN;
  return { months, invested, faceInterest, subInterest, received, net, roi, annualSimple, annualCompound, subPaid };
}

// If nobody redeems and the investor ends up owning the parcel: value less the cost to get clear
// title, against everything put in (including any subsequent taxes and the premium, which is not
// refunded when there is no redemption).
export function unredeemed(o) {
  const p = norm(o);
  const invested = p.face + p.premium + p.purchaseFee + p.subsequentTaxes;
  const net = p.propertyValue - p.foreclosureCosts - invested;
  return { invested, net, breakEvenValue: invested + p.foreclosureCosts };
}

export function analyze(o) {
  const p = norm(o);
  const marks = [3, 6, 12, 18, 24, 36, 48].filter((m) => m <= p.windowMonths);
  if (!marks.includes(p.redeemMonth) && p.redeemMonth <= p.windowMonths) marks.push(p.redeemMonth);
  marks.sort((a, b) => a - b);
  const table = marks.map((m) => redeemedAt(p, m));
  const chosen = redeemedAt(p, p.redeemMonth);
  const fail = unredeemed(p);
  const q = p.redeemChance / 100;
  const expectedNet = q * chosen.net + (1 - q) * fail.net;
  return {
    inputs: p,
    table,
    chosen,
    fail,
    expectedNet,
    expectedRoi: chosen.invested > 0 ? expectedNet / (q * chosen.invested + (1 - q) * fail.invested) : NaN,
    outsideWindow: p.redeemMonth > p.windowMonths,
    faceIsZero: p.face <= 0,
  };
}
