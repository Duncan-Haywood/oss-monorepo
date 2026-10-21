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

// Assumed reference geometry for the anchor house.
const REF = (() => {
  const area = ANCHOR.area, storeys = 2, aspect = 1.5;
  const fp = area / storeys;
  const w = Math.sqrt(fp / aspect), l = w * aspect;
  const garage = 22 * 22;
  const perimeter = 2 * (w + l) + 2 * 22; // the garage adds two sides' worth
  const wall = 2 * (w + l) * storeys * 9.5 + 3 * 22 * 9.5;
  const footprint = fp + garage;
  const roof = (footprint + perimeter * 1.0) * Math.sqrt(1 + (6 / 12) ** 2);
  return {
    fixed: 1, area, footprint, perimeter, wall, roof,
    framedFloor: fp, partitions: area * 0.12, fixtures: 13, openings: area * 0.15 + 3 * 20 + 16 * 7,
  };
})();
export const REFERENCE_DRIVERS = REF;

export const FINISH = { basic: 0.85, standard: 1.0, premium: 1.35 }; // assumed, interior finishes only
export const FOUNDATION = { slab: 0.85, crawl: 1.05 }; // assumed, against the survey's mix
export const PORCH_SHARE = 0.3; // assumed: a covered porch costs 30% of the anchor $/sq ft

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
export function estimate(d, brief, porchArea = 0) {
  const stages = {};
  let total = 0;
  for (const [stage, split] of Object.entries(STAGE_DRIVERS)) {
    let ratio = 0;
    for (const [k, w] of Object.entries(split)) ratio += (w * d[k]) / REF[k];
    let v = ANCHOR.construction * STAGE_SHARES[stage] * ratio;
    if (stage === "interior_finishes") v *= FINISH[brief.finish] ?? 1;
    if (stage === "foundations") v *= FOUNDATION[brief.foundation] ?? 1;
    v *= brief.region ?? 1;
    stages[stage] = v;
    total += v;
  }
  const porch = porchArea * (ANCHOR.construction / ANCHOR.area) * PORCH_SHARE * (brief.region ?? 1);
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
