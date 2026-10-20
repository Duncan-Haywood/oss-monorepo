// Pastured poultry profit planner: pure functions, no dependencies, nothing leaves the browser.
// A season is `batches` runs of `birdsPerBatch` meat chickens. Each batch costs chicks, feed, processing, bedding/fuel and
// labour, and sells dressed birds by the pound through a retail/direct channel and a wholesale/restaurant channel.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  batches: 6, birdsPerBatch: 100, mortalityPct: 6, weeks: 8,
  chickCost: 2.1, feedPerBirdLb: 16, feedPricePerLb: 0.42,
  processingPerBird: 4.5, suppliesPerBatch: 90,
  dressedLb: 4.2, directSharePct: 70, directPricePerLb: 6.5, wholesalePricePerLb: 4.25,
  hoursPerBatch: 28, wage: 18,
  fixedYear: 900, startupEquip: 5500, equipLifeYears: 6,
};

const clampPct = (p) => Math.min(100, Math.max(0, p));

export function birdsSold(o) {
  return Math.max(0, o.birdsPerBatch) * (1 - clampPct(o.mortalityPct) / 100);
}
export function blendedPricePerLb(o) {
  const s = clampPct(o.directSharePct) / 100;
  return s * o.directPricePerLb + (1 - s) * o.wholesalePricePerLb;
}

// One batch, start to freezer. Labour is shown separately so "profit" can be read with or without paying yourself.
export function batch(o) {
  const sold = birdsSold(o);
  const lb = sold * o.dressedLb;
  const price = blendedPricePerLb(o);
  const revenue = lb * price;
  // Feed goes into every chick placed, including those that die part-way (they eat roughly half a bird's feed).
  const dead = Math.max(0, o.birdsPerBatch) - sold;
  const feed = (sold + dead * 0.5) * o.feedPerBirdLb * o.feedPricePerLb;
  const chicks = o.birdsPerBatch * o.chickCost;
  const processing = sold * o.processingPerBird;
  const direct = chicks + feed + processing + o.suppliesPerBatch;
  const labour = o.hoursPerBatch * o.wage;
  return {
    sold, lb, price, revenue, chicks, feed, processing, supplies: o.suppliesPerBatch, direct, labour,
    profitBeforeLabour: revenue - direct, profit: revenue - direct - labour,
    costPerLb: lb > 0 ? (direct + labour) / lb : null,
    feedPerLbGain: lb > 0 ? feed / lb : null,
  };
}

export function season(o) {
  const b = batch(o);
  const n = Math.max(0, Math.round(o.batches));
  const equipPerYear = o.startupEquip / Math.max(1, o.equipLifeYears);
  const fixed = o.fixedYear + equipPerYear;
  const profitBeforeLabour = n * b.profitBeforeLabour - fixed;
  const profit = n * b.profit - fixed;
  const hours = n * o.hoursPerBatch;
  return {
    batch: b, batches: n, birds: n * b.sold, lb: n * b.lb, revenue: n * b.revenue, fixed, equipPerYear,
    profitBeforeLabour, profit, perBird: n * b.sold > 0 ? profit / (n * b.sold) : null,
    perHour: hours > 0 ? profitBeforeLabour / hours : null, hours,
    paybackSeasons: profitBeforeLabour > 0 ? Math.ceil(o.startupEquip / (profitBeforeLabour + equipPerYear)) : null,
  };
}

// Dressed-weight price (blended) at which a season's profit, labour included, is zero. null if impossible.
export function breakEvenPricePerLb(o) {
  const s = season(o);
  if (s.lb <= 0) return null;
  const b = s.batch;
  const costs = s.batches * (b.direct + b.labour) + s.fixed;
  return costs / s.lb;
}

export function mortalitySensitivity(o, levels = [2, 6, 10, 15, 25]) {
  return levels.map((mortalityPct) => {
    const s = season({ ...o, mortalityPct });
    return { mortalityPct, profit: s.profit, birds: s.birds, perBird: s.perBird };
  });
}

// Feed is the largest cost line and the one that moves: price per lb and how many lb a bird eats.
export function feedSensitivity(o, mults = [0.8, 1, 1.2, 1.4, 1.6]) {
  return mults.map((m) => {
    const s = season({ ...o, feedPricePerLb: o.feedPricePerLb * m });
    return { mult: m, feedPrice: o.feedPricePerLb * m, profit: s.profit, perBird: s.perBird };
  });
}

export function channelScenarios(o) {
  return [["All wholesale / restaurant", 0], ["As entered", o.directSharePct], ["All direct to customers", 100]].map(([label, directSharePct]) => {
    const s = season({ ...o, directSharePct });
    return { label, price: blendedPricePerLb({ ...o, directSharePct }), profit: s.profit, perHour: s.perHour };
  });
}

// How profit changes with flock size per batch, holding batches and labour-per-bird-batch scale (hours grow with sqrt of size).
export function scaleScenarios(o, sizes = [50, 100, 200, 300, 500]) {
  return sizes.map((birdsPerBatch) => {
    const hoursPerBatch = o.hoursPerBatch * Math.sqrt(birdsPerBatch / Math.max(1, o.birdsPerBatch));
    const s = season({ ...o, birdsPerBatch, hoursPerBatch });
    return { birdsPerBatch, hours: s.hours, profit: s.profit, perHour: s.perHour };
  });
}
