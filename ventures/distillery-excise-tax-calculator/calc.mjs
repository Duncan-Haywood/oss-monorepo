// Federal excise tax on distilled spirits for a domestic distiller (IRC 5001(a) and (c), Craft Beverage Modernization Act rates).
// Pure arithmetic over the volumes the distiller types in. A planning estimate, not a TTB return.
export const LITERS_PER_GAL = 3.785411784;
export const RATES = { reduced: 2.7, standard: 13.34, top: 13.5 };
export const TIERS = { reducedPG: 100000, standardCap: 22230000, smallDistillerCap: 22230000 };
export const QUARTERLY_LIMIT = 50000;

// Container sizes in liters; tax attaches to proof gallons, so size and strength both matter.
export const PACKAGES = [
  { id: "ml200", label: "200 mL", liters: 0.2 },
  { id: "ml375", label: "375 mL", liters: 0.375 },
  { id: "ml750", label: "750 mL", liters: 0.75 },
  { id: "l1", label: "1 L", liters: 1 },
  { id: "l175", label: "1.75 L", liters: 1.75 },
];

export const DEFAULTS = { ml200: 0, ml375: 0, ml750: 0, l1: 0, l175: 0, bulkWineGallons: 0, abv: 40, allotment: TIERS.reducedPG, small: true };

const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
const r2 = (x) => Math.round(x * 100) / 100;
const fmt = (x) => r2(x).toLocaleString("en-US");

// Proof gallons in a volume of liquid: wine gallons x proof / 100, and proof is twice the ABV.
export function proofGallons(wineGallons, abv) {
  return wineGallons * (abv * 2) / 100;
}

export function toProofGallons(v) {
  const abv = num(v.abv);
  let gal = 0;
  for (const p of PACKAGES) gal += (num(v[p.id]) * p.liters) / LITERS_PER_GAL;
  return proofGallons(gal + num(v.bulkWineGallons), abv);
}

export function exciseTax({ proofGal, allotment = TIERS.reducedPG, small = true }) {
  const reducedCap = small ? Math.max(0, Math.min(allotment, TIERS.reducedPG)) : 0;
  const t1 = Math.min(proofGal, reducedCap);
  const t2 = Math.min(Math.max(proofGal - t1, 0), TIERS.standardCap - t1);
  const t3 = Math.max(proofGal - TIERS.standardCap, 0);
  const tiers = [
    { label: `Reduced rate, first ${reducedCap.toLocaleString("en-US")} proof gal`, proofGal: t1, rate: RATES.reduced },
    { label: "Standard rate, up to 22.23 million proof gal", proofGal: t2, rate: RATES.standard },
    { label: "Top rate, over 22.23 million proof gal", proofGal: t3, rate: RATES.top },
  ].map((t) => ({ ...t, tax: t.proofGal * t.rate }));
  const tax = tiers.reduce((a, t) => a + t.tax, 0);
  const marginal = proofGal < reducedCap ? RATES.reduced : proofGal < TIERS.standardCap ? RATES.standard : RATES.top;
  return { tiers, tax, effective: proofGal > 0 ? tax / proofGal : 0, marginal, reducedCap, atTopRate: proofGal * RATES.top };
}

export function filingFrequency(tax) {
  if (tax <= QUARTERLY_LIMIT) return "Quarterly payment may be available (expected liability of $50,000 or less a year). Confirm eligibility with TTB.";
  return "Above $50,000 a year, tax is generally returned and paid on the semi-monthly schedule. Confirm with TTB.";
}

export function plan(input) {
  const v = { ...DEFAULTS, ...input };
  for (const k of [...PACKAGES.map((p) => p.id), "bulkWineGallons", "allotment"]) {
    const x = num(v[k]);
    if (!(x >= 0) || !Number.isFinite(x)) return { error: `Enter 0 or more for ${k}.` };
  }
  const abv = num(v.abv);
  if (!(abv > 0) || abv > 95) return { error: "Enter an alcohol by volume above 0 and at most 95 percent." };
  const small = v.small === true || v.small === "1" || v.small === 1;
  const proofGal = toProofGallons(v);
  if (proofGal <= 0) return { error: "Enter what you remove from bonded premises in a year: bottles of each size or bulk gallons." };
  if (proofGal > 5e8) return { error: "That is over 500 million proof gallons. Check the units." };
  const allotment = num(v.allotment);
  const base = exciseTax({ proofGal, allotment, small });
  const saved = base.atTopRate - base.tax;

  const pgPerLiter = proofGallons(1 / LITERS_PER_GAL, abv);
  const perUnits = PACKAGES.filter((p) => num(v[p.id]) > 0).map((p) => {
    const pg = pgPerLiter * p.liters;
    return { label: p.label, count: num(v[p.id]), proofGalEach: pg, each: pg * base.effective, atNextRate: pg * base.marginal, total: num(v[p.id]) * pg * base.effective };
  });
  const bottle750 = pgPerLiter * 0.75;
  const headroom = base.reducedCap - proofGal;
  const growth = [1, 1.25, 1.5, 2, 3].map((m) => {
    const pg = proofGal * m;
    const t = exciseTax({ proofGal: pg, allotment, small });
    return { multiple: m, proofGal: pg, tax: t.tax, effective: t.effective, marginal: t.marginal };
  });
  const advice = [];
  advice.push(`Estimated federal distilled spirits excise tax: $${fmt(base.tax)} on ${fmt(proofGal)} proof gallons, an effective $${r2(base.effective)} per proof gallon.`);
  advice.push(`That is about $${r2(bottle750 * base.effective)} on a 750 mL bottle at ${abv}% ABV (${r2(bottle750)} proof gallons), rising to $${r2(bottle750 * RATES.standard)} per bottle once you are past the reduced-rate allotment.`);
  if (small) advice.push(`The reduced rate saves about $${fmt(saved)} compared with the $${RATES.top} top rate.`);
  if (small && headroom > 0) advice.push(`You have ${fmt(headroom)} proof gallons left at $${RATES.reduced}. Beyond that, each proof gallon is taxed at $${RATES.standard}, which is ${(RATES.standard / RATES.reduced).toFixed(1)}x as much (+$${(RATES.standard - RATES.reduced).toFixed(2)} per proof gallon, about +$${r2((RATES.standard - RATES.reduced) * bottle750)} per 750 mL bottle).`);
  if (small && headroom <= 0) advice.push(`You are past the reduced-rate allotment, so your marginal rate is $${base.marginal} per proof gallon.`);
  if (!small) advice.push("Distillers producing more than 22.23 million proof gallons a year do not get the $2.70 rate; the first 22.23 million proof gallons are taxed at $13.34.");
  if (small && base.reducedCap < TIERS.reducedPG) advice.push(`Your share of the 100,000-proof-gallon allotment is ${base.reducedCap.toLocaleString("en-US")}. Distillers under common control divide one 100,000-proof-gallon allotment.`);
  advice.push(filingFrequency(base.tax));
  return { ...base, proofGal, abv, saved, perUnits, bottle750, headroom, growth, advice, small };
}

export function sampleInput() {
  return { ml200: 1200, ml375: 3000, ml750: 42000, l1: 0, l175: 2400, bulkWineGallons: 0, abv: 45, allotment: 100000, small: true };
}

export function toCsv(r) {
  const rows = [["tier", "proof_gallons", "rate_per_proof_gallon", "tax"]];
  for (const t of r.tiers) rows.push([`"${t.label}"`, r2(t.proofGal), t.rate, r2(t.tax)]);
  rows.push(["total", r2(r.proofGal), r2(r.effective), r2(r.tax)]);
  return rows.map((x) => x.join(",")).join("\n");
}
