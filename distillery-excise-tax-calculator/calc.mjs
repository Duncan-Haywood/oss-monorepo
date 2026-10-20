// Federal excise tax on distilled spirits for a domestic distillery (IRC 5001, Craft Beverage Modernization Act rates).
// Pure arithmetic over the volumes the distiller types in. A planning estimate, not a TTB return.
export const RATES = { reduced: 2.7, standard: 13.34, top: 13.5 };
export const TIERS = { reducedPG: 100000, standardCap: 22130000 };
export const QUARTERLY_LIMIT = 50000;
const ML_PER_GAL = 3785.411784;

// Container sizes, in millilitres. Spirits are taxed per proof gallon: wine gallons x proof / 100.
export const SIZES = [
  { id: "ml50", label: "50 mL minis", ml: 50 },
  { id: "ml200", label: "200 mL flasks", ml: 200 },
  { id: "ml375", label: "375 mL bottles", ml: 375 },
  { id: "ml750", label: "750 mL bottles", ml: 750 },
  { id: "ml1000", label: "1 L bottles", ml: 1000 },
  { id: "ml1750", label: "1.75 L bottles", ml: 1750 },
];

export const DEFAULTS = { proof: 80, ...Object.fromEntries(SIZES.map((s) => [s.id, 0])), bulkProofGallons: 0, allotment: TIERS.reducedPG, small: true };

const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
const r2 = (x) => Math.round(x * 100) / 100;
const fmt = (x) => x.toLocaleString("en-US");

export const abvToProof = (abv) => abv * 2;
export const proofGallonsPerBottle = (ml, proof) => (ml / ML_PER_GAL) * (proof / 100);

export function toProofGallons(v) {
  let pg = 0;
  for (const s of SIZES) pg += num(v[s.id]) * proofGallonsPerBottle(s.ml, num(v.proof));
  return pg + num(v.bulkProofGallons);
}

export function exciseTax({ proofGallons, allotment = TIERS.reducedPG, small = true }) {
  const reducedCap = small ? Math.max(0, Math.min(allotment, TIERS.reducedPG)) : 0;
  const t1 = Math.min(proofGallons, reducedCap);
  const t2 = Math.min(Math.max(proofGallons - t1, 0), TIERS.standardCap - t1);
  const t3 = Math.max(proofGallons - TIERS.standardCap, 0);
  const tiers = [
    { label: `Reduced rate, first ${fmt(reducedCap)} proof gal`, proofGallons: t1, rate: RATES.reduced },
    { label: "Middle rate, up to 22.13 million proof gal", proofGallons: t2, rate: RATES.standard },
    { label: "Full rate, over 22.13 million proof gal", proofGallons: t3, rate: RATES.top },
  ].map((t) => ({ ...t, tax: t.proofGallons * t.rate }));
  const tax = tiers.reduce((a, t) => a + t.tax, 0);
  const marginal = proofGallons < reducedCap ? RATES.reduced : proofGallons < TIERS.standardCap ? RATES.standard : RATES.top;
  return { tiers, tax, effective: proofGallons > 0 ? tax / proofGallons : 0, marginal, reducedCap, atTopRate: proofGallons * RATES.top };
}

export function filingFrequency(tax) {
  if (tax <= QUARTERLY_LIMIT) return "Quarterly returns may be available (expected liability of $50,000 or less a year). Confirm eligibility with TTB.";
  return "Above $50,000 a year you generally file and pay on the semi-monthly schedule. Confirm with TTB.";
}

export function plan(input) {
  const v = { ...DEFAULTS, ...input };
  for (const k of [...SIZES.map((s) => s.id), "bulkProofGallons", "allotment", "proof"]) {
    const x = num(v[k]);
    if (!(x >= 0) || !Number.isFinite(x)) return { error: `Enter 0 or more for ${k}.` };
  }
  const proof = num(v.proof);
  if (proof > 200) return { error: "Proof cannot be above 200 (100% alcohol by volume)." };
  const small = v.small === true || v.small === "1" || v.small === 1;
  const proofGallons = toProofGallons(v);
  if (proofGallons <= 0) return { error: "Enter what you remove from the distillery in a year: bottles at a proof, or bulk proof gallons." };
  if (proofGallons > 5e7) return { error: "That is over 50 million proof gallons. Check the units." };
  const allotment = num(v.allotment);
  const base = exciseTax({ proofGallons, allotment, small });
  const saved = base.atTopRate - base.tax;

  const perBottle = (ml) => proofGallonsPerBottle(ml, proof) * base.effective;
  const perUnits = SIZES.filter((s) => num(v[s.id]) > 0).map((s) => ({ label: s.label, count: num(v[s.id]), each: perBottle(s.ml), total: num(v[s.id]) * perBottle(s.ml) }));
  const perShot = perBottle(44.36);
  const fullRatePer750 = proofGallonsPerBottle(750, proof) * RATES.top;
  const headroom = base.reducedCap - proofGallons;
  const growth = [1, 1.25, 1.5, 2, 3, 5].map((m) => {
    const pg = proofGallons * m;
    const t = exciseTax({ proofGallons: pg, allotment, small });
    return { multiple: m, proofGallons: pg, tax: t.tax, effective: t.effective, marginal: t.marginal };
  });
  const advice = [];
  advice.push(`Estimated federal spirits excise tax: $${fmt(r2(base.tax))} on ${fmt(r2(proofGallons))} proof gallons, an effective $${r2(base.effective)} per proof gallon.`);
  if (proof > 0) advice.push(`A 750 mL bottle at ${proof} proof holds ${proofGallonsPerBottle(750, proof).toFixed(4)} proof gallons: about $${r2(perBottle(750))} of federal tax at your effective rate (versus $${r2(fullRatePer750)} at the full $${RATES.top} rate), and about ${(perShot * 100).toFixed(0)} cents in a 1.5 oz pour.`);
  if (small) advice.push(`The reduced rates save about $${fmt(r2(saved))} compared with the full $${RATES.top} rate.`);
  if (small && headroom > 0) advice.push(`You have ${fmt(Math.round(headroom))} proof gallons left at $${RATES.reduced}. Beyond that, each proof gallon is taxed at $${RATES.standard}, which is ${(RATES.standard / RATES.reduced).toFixed(1)}x as much (+$${(RATES.standard - RATES.reduced).toFixed(2)} per proof gallon).`);
  if (small && headroom <= 0) advice.push(`You are past the reduced-rate allotment, so your marginal rate is $${base.marginal} per proof gallon.`);
  if (!small) advice.push("Producers above 22.13 million proof gallons a year do not get the reduced rates; the full $13.50 applies.");
  if (small && base.reducedCap < TIERS.reducedPG) advice.push(`Your share of the 100,000-proof-gallon allotment is ${fmt(base.reducedCap)}. Distilleries under common control divide one allotment.`);
  advice.push(filingFrequency(base.tax));
  return { ...base, proofGallons, saved, perUnits, perShot, headroom, growth, advice, small, proof };
}

export function sampleInput() {
  return { proof: 80, ml750: 18000, ml375: 3000, ml200: 2400, ml1750: 600, bulkProofGallons: 500, allotment: 100000, small: true };
}

export function toCsv(r) {
  const rows = [["tier", "proof_gallons", "rate_per_proof_gallon", "tax"]];
  for (const t of r.tiers) rows.push([`"${t.label}"`, r2(t.proofGallons), t.rate, r2(t.tax)]);
  rows.push(["total", r2(r.proofGallons), r2(r.effective), r2(r.tax)]);
  return rows.map((x) => x.join(",")).join("\n");
}
