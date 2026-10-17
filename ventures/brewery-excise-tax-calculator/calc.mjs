// Federal excise tax on beer for a domestic brewer (IRC 5051(a), Craft Beverage Modernization Act rates).
// Pure arithmetic over the volumes the brewer types in. A planning estimate, not a TTB return.
export const BARREL_GAL = 31;
export const RATES = { reduced: 3.5, standard: 16, top: 18 };
export const TIERS = { reducedBarrels: 60000, standardCap: 6000000, smallBrewerCap: 2000000 };
export const QUARTERLY_LIMIT = 50000;
export const ANNUAL_LIMIT = 1000;

// Gallons per package, for converting what leaves the bonded premises into barrels.
export const PACKAGES = [
  { id: "halfKegs", label: "1/2 bbl kegs (15.5 gal)", gal: 15.5 },
  { id: "quarterKegs", label: "1/4 bbl kegs (7.75 gal)", gal: 7.75 },
  { id: "sixthKegs", label: "1/6 bbl kegs (5.17 gal)", gal: 31 / 6 },
  { id: "cases12", label: "Cases of 24 x 12 oz", gal: 24 * 12 / 128 },
  { id: "cases16", label: "Cases of 24 x 16 oz", gal: 24 * 16 / 128 },
  { id: "growlers", label: "64 oz growlers filled", gal: 0.5 },
];

export const DEFAULTS = { halfKegs: 0, quarterKegs: 0, sixthKegs: 0, cases12: 0, cases16: 0, growlers: 0, otherBarrels: 0, allotment: TIERS.reducedBarrels, small: true };

const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
const r2 = (x) => Math.round(x * 100) / 100;

export function toBarrels(v) {
  let gal = 0;
  for (const p of PACKAGES) gal += num(v[p.id]) * p.gal;
  return gal / BARREL_GAL + num(v.otherBarrels);
}

export function exciseTax({ barrels, allotment = TIERS.reducedBarrels, small = true }) {
  const reducedCap = small ? Math.max(0, Math.min(allotment, TIERS.reducedBarrels)) : 0;
  const t1 = Math.min(barrels, reducedCap);
  const t2 = Math.min(Math.max(barrels - t1, 0), TIERS.standardCap - t1);
  const t3 = Math.max(barrels - TIERS.standardCap, 0);
  const tiers = [
    { label: `Reduced rate, first ${reducedCap.toLocaleString("en-US")} bbl`, barrels: t1, rate: RATES.reduced },
    { label: "Standard rate, up to 6 million bbl", barrels: t2, rate: RATES.standard },
    { label: "Top rate, over 6 million bbl", barrels: t3, rate: RATES.top },
  ].map((t) => ({ ...t, tax: t.barrels * t.rate }));
  const tax = tiers.reduce((a, t) => a + t.tax, 0);
  const marginal = barrels < reducedCap ? RATES.reduced : barrels < TIERS.standardCap ? RATES.standard : RATES.top;
  return { tiers, tax, effective: barrels > 0 ? tax / barrels : 0, marginal, reducedCap, atTopRate: barrels * RATES.top };
}

export function filingFrequency(tax) {
  if (tax <= ANNUAL_LIMIT) return "Annual return may be available (liability of $1,000 or less a year). Confirm eligibility with TTB.";
  if (tax <= QUARTERLY_LIMIT) return "Quarterly returns may be available (liability of $50,000 or less a year). Confirm eligibility with TTB.";
  return "Above $50,000 a year you generally file and pay on the semi-monthly schedule. Confirm with TTB.";
}

export function plan(input) {
  const v = { ...DEFAULTS, ...input };
  for (const k of [...PACKAGES.map((p) => p.id), "otherBarrels", "allotment"]) {
    const x = num(v[k]);
    if (!(x >= 0) || !Number.isFinite(x)) return { error: `Enter 0 or more for ${k}.` };
  }
  const small = v.small === true || v.small === "1" || v.small === 1;
  const barrels = toBarrels(v);
  if (barrels <= 0) return { error: "Enter what you remove from the brewery in a year: kegs, cases or barrels." };
  if (barrels > 2e7) return { error: "That is over 20 million barrels. Check the units." };
  const allotment = num(v.allotment);
  const base = exciseTax({ barrels, allotment, small });
  const saved = base.atTopRate - base.tax;

  const perUnit = (gal) => (gal / BARREL_GAL) * base.effective;
  const perUnits = PACKAGES.filter((p) => num(v[p.id]) > 0).map((p) => ({ label: p.label, count: num(v[p.id]), each: perUnit(p.gal), total: num(v[p.id]) * perUnit(p.gal) }));
  const perPint = perUnit(1 / 8);

  const headroom = base.reducedCap - barrels;
  const growth = [1, 1.25, 1.5, 2, 3].map((m) => {
    const b = barrels * m;
    const t = exciseTax({ barrels: b, allotment, small });
    return { multiple: m, barrels: b, tax: t.tax, effective: t.effective, marginal: t.marginal };
  });
  const advice = [];
  advice.push(`Estimated federal beer excise tax: $${r2(base.tax).toLocaleString("en-US")} on ${r2(barrels).toLocaleString("en-US")} barrels, an effective $${r2(base.effective)} per barrel.`);
  advice.push(`That is about $${r2(perUnit(15.5))} per half-barrel keg and about ${(perPint * 100).toFixed(1)} cents per pint.`);
  if (small) advice.push(`The reduced rate saves about $${r2(saved).toLocaleString("en-US")} compared with the $${RATES.top} top rate.`);
  if (small && headroom > 0) advice.push(`You have ${Math.round(headroom).toLocaleString("en-US")} barrels left at $${RATES.reduced}. Beyond that, each barrel is taxed at $${RATES.standard}, which is ${(RATES.standard / RATES.reduced).toFixed(1)}x as much (+$${(RATES.standard - RATES.reduced).toFixed(2)} per barrel, +$${((RATES.standard - RATES.reduced) / 2).toFixed(2)} per half-barrel keg).`);
  if (small && headroom <= 0) advice.push(`You are past the reduced-rate allotment, so your marginal rate is $${base.marginal} per barrel.`);
  if (!small) advice.push("Brewers producing more than 2 million barrels a year do not get the $3.50 rate; the first 6 million barrels are taxed at $16.");
  if (small && base.reducedCap < TIERS.reducedBarrels) advice.push(`Your share of the 60,000-barrel allotment is ${base.reducedCap.toLocaleString("en-US")} barrels. Brewers under common control divide one 60,000-barrel allotment.`);
  advice.push(filingFrequency(base.tax));
  return { ...base, barrels, saved, perUnits, perPint, headroom, growth, advice, small };
}

export function sampleInput() {
  return { halfKegs: 2400, quarterKegs: 300, sixthKegs: 900, cases12: 6000, cases16: 14000, growlers: 3000, otherBarrels: 0, allotment: 60000, small: true };
}

export function toCsv(r) {
  const rows = [["tier", "barrels", "rate_per_barrel", "tax"]];
  for (const t of r.tiers) rows.push([`"${t.label}"`, r2(t.barrels), t.rate, r2(t.tax)]);
  rows.push(["total", r2(r.barrels), r2(r.effective), r2(r.tax)]);
  return rows.map((x) => x.join(",")).join("\n");
}
