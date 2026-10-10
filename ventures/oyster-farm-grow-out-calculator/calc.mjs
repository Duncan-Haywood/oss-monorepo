// Oyster grow-out math. Pure functions, no I/O. All money in USD, all inputs entered by the user.
// One cycle = one batch of seed from stocking to market size.

const r2 = (x) => Math.round(x * 100) / 100;
export const money = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US"));
export const money2 = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2));

const DEFAULTS = {
  seedCount: 100000,
  seedCostPer1000: 30,   // $ per 1,000 seed (size and hatchery vary widely)
  survivalPct: 65,       // % of seed alive at harvest
  marketablePct: 92,     // % of survivors that make the grade you sell at the price below
  pricePerOyster: 0.65,  // farm-gate $ per marketable oyster
  growMonths: 18,
  stockingPerBag: 200,   // average oysters per bag over the cycle (starts crowded with small seed, ends with few big ones)
  bagCost: 38,           // $ per bag including floats, frame or share of line
  gearLifeYears: 5,
  handlingsPerBag: 14,   // flips, sorts, thinning and grading passes per bag over the cycle
  minutesPerHandling: 6,
  laborRate: 22,         // $ per hour, yours included
  leasePerYear: 1800,    // water lease, licence and permits
  boatPerMonth: 160,     // fuel and boat upkeep attributed to this crop
  capitalRatePct: 8,     // cost of money tied up in seed and gear, per year
};

function clean(input) {
  const v = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, x]) => x !== undefined && x !== null && x !== "")) };
  for (const k of Object.keys(DEFAULTS)) v[k] = Number(v[k]);
  return v;
}

function validate(v) {
  if (!(v.seedCount >= 1)) return "Enter the seed count.";
  if (!(v.survivalPct > 0 && v.survivalPct <= 100)) return "Survival must be above 0 and at most 100 percent.";
  if (!(v.marketablePct > 0 && v.marketablePct <= 100)) return "Marketable share must be above 0 and at most 100 percent.";
  if (!(v.growMonths >= 1 && v.growMonths <= 60)) return "Grow-out must be 1 to 60 months.";
  if (!(v.stockingPerBag >= 1)) return "Oysters per bag must be at least 1.";
  if (!(v.gearLifeYears > 0)) return "Gear life must be above 0 years.";
  for (const k of ["seedCostPer1000", "pricePerOyster", "bagCost", "handlingsPerBag", "minutesPerHandling", "laborRate", "leasePerYear", "boatPerMonth", "capitalRatePct"])
    if (!(v[k] >= 0)) return `${k} cannot be negative.`;
  return null;
}

function core(v) {
  const years = v.growMonths / 12;
  const sold = v.seedCount * (v.survivalPct / 100) * (v.marketablePct / 100);
  const bags = Math.max(1, Math.ceil((v.seedCount * (1 + v.survivalPct / 100)) / 2 / v.stockingPerBag - 1e-9));
  const seed = (v.seedCount / 1000) * v.seedCostPer1000;
  const gearPurchase = bags * v.bagCost;
  const gear = (gearPurchase * years) / v.gearLifeYears;
  const laborHours = (bags * v.handlingsPerBag * v.minutesPerHandling) / 60;
  const labor = laborHours * v.laborRate;
  const lease = v.leasePerYear * years;
  const boat = v.boatPerMonth * v.growMonths;
  const interest = (seed + gearPurchase) * (v.capitalRatePct / 100) * years;
  const total = seed + gear + labor + lease + boat + interest;
  const revenue = sold * v.pricePerOyster;
  return { years, sold, bags, seed, gearPurchase, gear, laborHours, labor, lease, boat, interest, total, revenue, profit: revenue - total };
}

export function analyze(input = {}) {
  const v = clean(input);
  const err = validate(v);
  if (err) return { error: err };
  const c = core(v);
  const costPerOyster = c.sold > 0 ? c.total / c.sold : null;
  const margin = c.revenue > 0 ? (c.profit / c.revenue) * 100 : null;
  const profitPerBag = c.profit / c.bags;
  const profitPerMonth = c.profit / v.growMonths;

  // Survival at which this cycle breaks even, holding the price and everything else.
  let breakEvenSurvival = null;
  const at = (s) => core({ ...v, survivalPct: s }).profit;
  if (at(100) >= 0) {
    let lo = 0.1, hi = 100;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (at(mid) >= 0) hi = mid; else lo = mid; }
    breakEvenSurvival = r2(hi);
  }

  const lines = [
    ["seed", c.seed], ["gear wear", c.gear], ["labor", c.labor], ["lease and permits", c.lease], ["boat", c.boat], ["cost of money", c.interest],
  ];
  const biggest = lines.slice().sort((a, b) => b[1] - a[1])[0];

  const advice = [];
  advice.push(`${v.seedCount.toLocaleString("en-US")} seed at ${v.survivalPct}% survival and ${v.marketablePct}% making grade gives about ${Math.round(c.sold).toLocaleString("en-US")} oysters to sell, on ${c.bags} bags.`);
  advice.push(`The cycle costs about ${money(c.total)} over ${v.growMonths} months, or ${money2(costPerOyster)} per oyster sold. The largest line is ${biggest[0]} at ${money(biggest[1])} (${Math.round((biggest[1] / c.total) * 100)}%).`);
  if (c.profit >= 0) advice.push(`At ${money2(v.pricePerOyster)} each that is ${money(c.revenue)} of sales and ${money(c.profit)} of profit (${Math.round(margin)}% margin), about ${money(profitPerMonth)} a month of grow-out and ${money(profitPerBag)} a bag.`);
  else advice.push(`At ${money2(v.pricePerOyster)} each that is ${money(c.revenue)} of sales against ${money(c.total)} of cost, a loss of ${money(-c.profit)}. The price needs to reach ${money2(costPerOyster)} to break even.`);
  if (breakEvenSurvival == null) advice.push("Even with every seed surviving, this cycle does not cover its costs at this price.");
  else if (breakEvenSurvival > v.survivalPct) advice.push(`Survival needs to reach ${breakEvenSurvival}% to break even; you entered ${v.survivalPct}%.`);
  else advice.push(`The cycle breaks even down to ${breakEvenSurvival}% survival; you entered ${v.survivalPct}%, a cushion of ${r2(v.survivalPct - breakEvenSurvival)} points.`);
  if (v.survivalPct > 85) advice.push("Survival above 85% from seed to market is rare; check it against your own past batches before relying on it.");
  if (v.marketablePct < 80) advice.push("A low marketable share usually means shape, shell or size problems. Culls sold cheaper than the price entered are not credited here.");

  return {
    inputs: v, ...Object.fromEntries(Object.entries(c).map(([k, x]) => [k, r2(x)])),
    sold: Math.round(c.sold), bags: c.bags, costPerOyster: costPerOyster == null ? null : r2(costPerOyster),
    breakEvenPrice: costPerOyster == null ? null : r2(costPerOyster), breakEvenSurvival, margin: margin == null ? null : r2(margin),
    profitPerBag: r2(profitPerBag), profitPerMonth: r2(profitPerMonth), viable: c.profit >= 0, advice,
  };
}

/** Profit grid: rows are survival rates, columns are prices (fractions of the entered price). */
export function sensitivity(input, survivals = [45, 55, 65, 75, 85], priceFactors = [0.8, 1, 1.2]) {
  const v = clean(input);
  return survivals.map((s) => ({
    survivalPct: s,
    cells: priceFactors.map((f) => {
      const c = core({ ...v, survivalPct: s, pricePerOyster: v.pricePerOyster * f });
      return { price: r2(v.pricePerOyster * f), profit: r2(c.profit) };
    }),
  }));
}

/** Seed to buy so that, at the entered survival and grade, you have `target` oysters to sell. */
export function seedFor(target, input = {}) {
  const v = clean(input);
  return Math.ceil(target / ((v.survivalPct / 100) * (v.marketablePct / 100)));
}

export function sampleInput() {
  return { ...DEFAULTS, seedCount: 150000, survivalPct: 70, pricePerOyster: 0.7, growMonths: 16 };
}

export function toCsv(r) {
  const rows = [["line", "value"], ["oysters sold", r.sold], ["bags", r.bags], ["seed", r.seed], ["gear wear", r.gear], ["labor", r.labor], ["lease and permits", r.lease], ["boat", r.boat], ["cost of money", r.interest], ["total cost", r.total], ["revenue", r.revenue], ["profit", r.profit], ["cost per oyster", r.costPerOyster], ["break-even survival %", r.breakEvenSurvival ?? ""]];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
