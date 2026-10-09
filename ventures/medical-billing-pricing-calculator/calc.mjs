// Medical billing company pricing: compares percent-of-collections, per-claim and flat monthly pricing for one client
// practice against what that client costs to serve. Pure functions, nothing leaves the browser.
//
// Cost to serve a month = claims x (staff minutes per claim x loaded hourly cost + clearinghouse fee)
//   + denied claims x rework minutes x hourly cost + software per client + onboarding hours amortised over the contract.
// Collections = claims x average amount collected per claim. Percent pricing earns pct x collections, per-claim pricing
// earns fee x claims, flat pricing earns the monthly fee. The crossover that matters: percent beats per-claim only when
// the average collected per claim is above fee / pct. Default figures are placeholders, not market rates.

export const DEFAULTS = {
  claims: 600,          // claims submitted per month for this client
  avgCollected: 95,     // average dollars collected per claim
  minutesPerClaim: 6,   // staff minutes to scrub, submit, post and follow up one clean claim
  hourly: 28,           // loaded hourly cost of a billing specialist (wage plus payroll costs)
  clearinghouse: 0.35,  // clearinghouse and eligibility fees per claim
  denialRate: 9,        // percent of claims denied or rejected and reworked
  reworkMinutes: 22,    // extra staff minutes per denied claim
  software: 180,        // practice-management and billing software cost per client per month
  onboardHours: 14,     // staff hours to onboard the client
  contractMonths: 24,   // months the onboarding cost is spread over
  targetMargin: 30,     // margin you want, percent of revenue
  pctRate: 6,           // offer 1: percent of collections
  claimFee: 6.5,        // offer 2: dollars per claim
  flatFee: 3200,        // offer 3: flat monthly fee
};

export const num = (v) => {
  const t = String(v ?? "").replace(/[$,%\s]/g, "").replace(/,/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

// Monthly cost of serving the client at a given claim volume.
export function costToServe(o, claims = o.claims) {
  const wage = o.hourly / 60; // dollars per staff minute
  const handling = claims * (o.minutesPerClaim * wage + o.clearinghouse);
  const denied = claims * o.denialRate / 100;
  const rework = denied * o.reworkMinutes * wage;
  const onboarding = o.contractMonths > 0 ? o.onboardHours * o.hourly / o.contractMonths : 0;
  return { handling, rework, software: o.software, onboarding, total: handling + rework + o.software + onboarding, denied };
}

export const OFFERS = [
  { key: "pct", label: "Percent of collections" },
  { key: "claim", label: "Per claim" },
  { key: "flat", label: "Flat monthly fee" },
];

// Revenue of each offer given the client's collections and claim volume.
export function revenue(o, claims = o.claims, avgCollected = o.avgCollected) {
  const collections = claims * avgCollected;
  return { pct: collections * o.pctRate / 100, claim: claims * o.claimFee, flat: o.flatFee, collections };
}

export function offerResult(o, key, claims = o.claims, avgCollected = o.avgCollected) {
  const cost = costToServe(o, claims).total;
  const rev = revenue(o, claims, avgCollected);
  const income = rev[key];
  const margin = income - cost;
  return {
    key, income, cost, margin,
    marginPct: income > 0 ? margin / income * 100 : NaN,
    effectivePct: rev.collections > 0 ? income / rev.collections * 100 : NaN,
    perClaim: claims > 0 ? income / claims : NaN,
  };
}

// Price each offer would need to reach the target margin at the current volume.
export function requiredPrices(o) {
  const cost = costToServe(o).total;
  const revNeeded = cost / (1 - o.targetMargin / 100);
  const collections = o.claims * o.avgCollected;
  return {
    revNeeded,
    pctRate: collections > 0 ? revNeeded / collections * 100 : NaN,
    claimFee: o.claims > 0 ? revNeeded / o.claims : NaN,
    flatFee: revNeeded,
  };
}

// Average collected per claim above which percent pricing out-earns the per-claim fee.
export function pctBeatsClaimAbove(o) {
  return o.pctRate > 0 ? o.claimFee / (o.pctRate / 100) : NaN;
}

// Smallest monthly claim volume (whole claims) at which an offer reaches the margin target, or null if never.
export function breakEvenClaims(o, key, target = 0) {
  for (let c = 1; c <= 20000; c++) {
    const r = offerResult(o, key, c);
    const ok = target > 0 ? r.income > 0 && r.marginPct >= target : r.margin >= 0;
    if (ok) return c;
  }
  return null;
}

// Flat pricing earns the same however many claims arrive, so its limit is a ceiling: the most claims a month that
// still leaves the target margin (0 = just break even). Null if the fee never covers even one claim's worth of cost.
export function flatCeiling(o, target = 0) {
  let best = null;
  for (let c = 1; c <= 20000; c++) {
    const r = offerResult(o, "flat", c);
    if (r.income > 0 && (target > 0 ? r.marginPct >= target : r.margin >= 0)) best = c; else break;
  }
  return best;
}

// Margin of each offer as the client's average collection per claim moves (denials, specialty mix, payer mix).
export function sensitivity(o, mult = [0.5, 0.75, 1, 1.25, 1.5, 2]) {
  return mult.map((m) => {
    const avg = o.avgCollected * m;
    const row = { mult: m, avg };
    for (const { key } of OFFERS) row[key] = offerResult(o, key, o.claims, avg).margin;
    return row;
  });
}

export function analyze(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) o[k] = num(raw[k]);
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  if (o.claims <= 0) warnings.push("Enter at least one claim a month.");
  if (o.avgCollected <= 0) warnings.push("Enter an average collected per claim above zero.");
  if (o.denialRate > 100) warnings.push("Denial rate cannot be above 100%.");
  if (o.targetMargin >= 100) warnings.push("Target margin must be below 100%.");
  if (warnings.length) return { opts: o, warnings, result: null, rows: [] };
  const offers = OFFERS.map(({ key, label }) => ({ ...offerResult(o, key), label }));
  const best = offers.reduce((a, b) => (b.margin > a.margin ? b : a));
  const cost = costToServe(o);
  const req = requiredPrices(o);
  const beat = pctBeatsClaimAbove(o);
  for (const f of offers) if (f.margin < 0) warnings.push(`${f.label} loses money on this client at these figures.`);
  if (o.pctRate > 0 && o.avgCollected < beat) warnings.push(`At ${pct(o.pctRate)}, percent pricing earns less per claim than your ${money2(o.claimFee)} fee because this client collects only ${money2(o.avgCollected)} a claim.`);
  const result = {
    offers, best, cost, req, beat,
    collections: o.claims * o.avgCollected,
    costPerClaim: cost.total / o.claims,
    // pct and claim: smallest volume that works. flat: the ceiling above which it stops working.
    breakEven: { pct: breakEvenClaims(o, "pct"), claim: breakEvenClaims(o, "claim"), flat: flatCeiling(o) },
    atTarget: { pct: breakEvenClaims(o, "pct", o.targetMargin), claim: breakEvenClaims(o, "claim", o.targetMargin), flat: flatCeiling(o, o.targetMargin) },
  };
  return { opts: o, warnings, result, rows: sensitivity(o) };
}

export function toCsv(a) {
  if (!a || !a.rows.length) return "";
  const head = "avg_collected_multiple,avg_collected_per_claim,pct_margin,per_claim_margin,flat_margin";
  const rows = a.rows.map((r) => [r.mult, r.avg.toFixed(2), r.pct.toFixed(2), r.claim.toFixed(2), r.flat.toFixed(2)].join(","));
  return [head, ...rows].join("\n") + "\n";
}
