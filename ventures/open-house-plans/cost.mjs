// @ts-check
// Construction cost, anchored on one published survey and scaled by geometry.
//
// Anchor: NAHB, "Cost of Constructing a Home in 2024" (Eye on Housing,
// 2025-01-23; national table read 2026-10-21): average construction cost
// $428,215 for an average 2,647 sq ft finished area (about $162/sq ft), split
// into eight stages whose shares are below. The same shares anchor
// research/house-cost.
//
// Everything else is an ASSUMPTION of this tool, written out so anyone can
// change it: the reference house's geometry (two storeys, 1.5:1 footprint,
// an attached two-car garage, 13 plumbing fixtures, glazing 15% of floor
// area), and how each stage splits between a fixed part and parts that grow
// with a geometric driver. A stage's cost for a design is its anchored
// dollars times the weighted ratio of the design's drivers to the reference's.
// It is a model of where money goes, not a quote: local prices can be half or
// double, and the survey's builders are not a representative sample.

export const ANCHOR = {
  source: "NAHB, Cost of Constructing a Home in 2024 (Eye on Housing, 2025-01-23)",
  url: "https://eyeonhousing.org/2025/01/cost-of-constructing-a-home-in-2024/",
  construction: 428215,
  area: 2647,
  year: 2024,
};

export const STAGE_SHARES = {
  site_work: 0.076, foundations: 0.105, framing: 0.166, exterior_finishes: 0.134,
  rough_ins: 0.192, interior_finishes: 0.241, final_steps: 0.065, other: 0.021,
};

export const STAGE_LABELS = {
  site_work: "Site work", foundations: "Foundation", framing: "Framing", exterior_finishes: "Exterior finishes",
  rough_ins: "Plumbing, electrical, HVAC", interior_finishes: "Interior finishes", final_steps: "Final steps", other: "Other",
};

// Assumed drivers of each stage (weights sum to 1).
export const STAGE_DRIVERS = {
  site_work: { fixed: 0.6, footprint: 0.4 },
  foundations: { perimeter: 0.5, footprint: 0.5 },
  framing: { fixed: 0.1, wall: 0.3, roof: 0.25, framedFloor: 0.2, partitions: 0.15 },
  exterior_finishes: { wall: 0.45, roof: 0.25, openings: 0.3 },
  rough_ins: { fixed: 0.2, area: 0.5, fixtures: 0.3 },
  interior_finishes: { fixed: 0.1, area: 0.7, fixtures: 0.2 },
  final_steps: { fixed: 0.4, area: 0.4, footprint: 0.2 },
  other: { area: 1.0 },
};

// Assumed reference geometry for the anchor house, and the other assumed
// factors, in one object so verify/sensitivity.mjs can vary them.
export const ASSUMPTIONS = {
  drivers: STAGE_DRIVERS,
  ref: { storeys: 2, aspect: 1.5, garageSide: 22, wallHeight: 9.5, pitch: 6, overhang: 1, partitionsPerSqFt: 0.12, fixtures: 13, glazing: 0.15 },
  finish: { basic: 0.85, standard: 1.0, premium: 1.35 }, // interior finishes only
  foundation: { slab: 0.85, crawl: 1.05 }, // against the survey's mix of foundations
  porchShare: 0.3, // a covered porch costs this share of the anchor $/sq ft
};

/** The reference house's drivers under a set of assumptions. */
export function referenceDrivers(a = ASSUMPTIONS) {
  const r = a.ref;
  const area = ANCHOR.area;
  const fp = area / r.storeys;
  const w = Math.sqrt(fp / r.aspect), l = w * r.aspect;
  const g = r.garageSide;
  const perimeter = 2 * (w + l) + 2 * g; // the garage adds two sides' worth
  const wall = 2 * (w + l) * r.storeys * r.wallHeight + 3 * g * r.wallHeight;
  const footprint = fp + g * g;
  const roof = (footprint + perimeter * r.overhang) * Math.sqrt(1 + (r.pitch / 12) ** 2);
  return {
    fixed: 1, area, footprint, perimeter, wall, roof,
    framedFloor: fp, partitions: area * r.partitionsPerSqFt, fixtures: r.fixtures, openings: area * r.glazing + 3 * 20 + 16 * 7,
  };
}
export const REFERENCE_DRIVERS = referenceDrivers();
export const FINISH = ASSUMPTIONS.finish;
export const FOUNDATION = ASSUMPTIONS.foundation;
export const PORCH_SHARE = ASSUMPTIONS.porchShare;

/** Plumbing fixtures: toilet, basin, tub or shower per bath, and so on. */
export function fixtureCount(rooms) {
  let n = 1; // water heater
  for (const r of rooms) {
    if (r.kind === "bath") n += 3;
    else if (r.kind === "ensuite") n += 4;
    else if (r.kind === "half") n += 2;
    else if (r.kind === "kitchen") n += 2;
    else if (r.kind === "laundry" || r.kind === "mud") n += 1;
  }
  return n;
}

/** Cost drivers measured from a finished plan (or a skeleton, with openings estimated). */
export function planDrivers(plan, brief, style) {
  const Wg = plan.p.Wg || 0;
  const conditioned = (plan.W - Wg) * plan.D;
  const footprint = plan.W * plan.D;
  const perimeter = 2 * (plan.W + plan.D);
  const ceiling = plan.ceiling || brief.ceiling || style.ceiling;
  const wallH = ceiling + (brief.foundation === "crawl" ? 2.5 : 1.0);
  const wall = perimeter * wallH;
  const slope = Math.sqrt(1 + (style.pitch / 12) ** 2);
  const roof = (plan.W + 2 * style.rake) * (plan.D + 2 * style.eave) * slope;
  let openings;
  if (plan.openings) openings = plan.openings.filter((o) => o.kind !== "door" || o.exterior).filter((o) => o.exterior || o.kind === "window").reduce((s, o) => s + o.width * o.height, 0);
  else openings = conditioned * 0.13 + 20 + (Wg ? (brief.garage === 2 ? 112 : 63) : 0);
  let partitions = 0;
  if (plan.walls) partitions = plan.walls.filter((w) => w.type === "int" || w.type === "fire").reduce((s, w) => s + (w.b - w.a), 0);
  else partitions = conditioned * 0.14;
  return {
    fixed: 1, area: conditioned, footprint, perimeter, wall, roof, openings, partitions,
    framedFloor: brief.foundation === "crawl" ? conditioned : 0,
    fixtures: fixtureCount(plan.rooms),
  };
}

/** Dollar estimate by stage from drivers. */
export function estimate(d, brief, porchArea = 0, a = ASSUMPTIONS) {
  const REF = a === ASSUMPTIONS ? REFERENCE_DRIVERS : referenceDrivers(a);
  const stages = {};
  let total = 0;
  for (const [stage, split] of Object.entries(a.drivers)) {
    let ratio = 0;
    for (const [k, w] of Object.entries(split)) ratio += (w * d[k]) / REF[k];
    let v = ANCHOR.construction * STAGE_SHARES[stage] * ratio;
    if (stage === "interior_finishes") v *= a.finish[brief.finish] ?? 1;
    if (stage === "foundations") v *= a.foundation[brief.foundation] ?? 1;
    v *= brief.region ?? 1;
    stages[stage] = v;
    total += v;
  }
  const porch = porchArea * (ANCHOR.construction / ANCHOR.area) * a.porchShare * (brief.region ?? 1);
  if (porch) { stages.porch = porch; total += porch; }
  return {
    stages,
    total,
    perSqFt: total / d.area,
    anchorPerSqFt: ANCHOR.construction / ANCHOR.area,
    year: ANCHOR.year,
    // NAHB's price shares: construction is 64.4% of the sale price, the lot 13.7%.
    priceExLot: (total / 0.644) * (1 - 0.137),
  };
}
