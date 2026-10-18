// Oyster-farm growout math. Pure functions, no I/O. All money in USD, all inputs entered by the user.

const r2 = (x) => Math.round(x * 100) / 100;
export const money = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US"));

const DEFAULTS = {
  seed: 100000,            // seed oysters planted
  seedCostPerK: 45,        // $ per 1,000 seed
  mortalityPct: 20,        // % lost between planting and harvest
  growoutMonths: 18,
  oystersPerBag: 250,      // density at final size
  bagCost: 28,             // bag or cage, each
  rackCostPerBag: 12,      // rack, line, float or stake share per bag
  gearLifeYears: 5,
  premiumPct: 70,          // % of survivors that make the premium grade
  standardPct: 25,         // % that make the standard grade; the rest are culls
  premiumPrice: 0.75,      // $ per oyster
  standardPrice: 0.5,
  cullPrice: 0.1,
  commissionPct: 0,        // distributor or market cut of sales
  hoursPerBagMonth: 0.15,  // tumbling, flipping, sorting
  laborRate: 22,
  boatCostPerMonth: 150,   // fuel and boat upkeep
  leasePerYear: 1200,      // lease, licence and water-quality fees
  otherPerYear: 600,       // insurance, permits, depuration access
  packPerOyster: 0.02,     // tags, bags, ice at sale
  interestPct: 8,          // annual cost of the money tied up in seed and gear
};

const NONNEG = ["seedCostPerK", "bagCost", "rackCostPerBag", "premiumPrice", "standardPrice", "cullPrice", "hoursPerBagMonth", "laborRate", "boatCostPerMonth", "leasePerYear", "otherPerYear", "packPerOyster", "interestPct"];

export function check(input = {}) {
  const v = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, x]) => x !== undefined && x !== null && x !== "")) };
  for (const k of Object.keys(DEFAULTS)) v[k] = Number(v[k]);
  if (!(v.seed >= 1) || !Number.isInteger(v.seed)) return { error: "Seed planted must be a whole number of at least 1." };
  if (v.mortalityPct < 0 || v.mortalityPct >= 100) return { error: "Mortality must be 0 to 99 percent." };
  if (!(v.growoutMonths >= 1)) return { error: "Growout must be at least 1 month." };
  if (!(v.oystersPerBag >= 1)) return { error: "Oysters per bag must be at least 1." };
  if (!(v.gearLifeYears > 0)) return { error: "Gear life must be more than 0 years." };
  if (v.premiumPct < 0 || v.standardPct < 0 || v.premiumPct + v.standardPct > 100) return { error: "Premium and standard grade percentages must be 0 or more and add to at most 100." };
  if (v.commissionPct < 0 || v.commissionPct >= 100) return { error: "Commission must be 0 to 99 percent." };
  for (const k of NONNEG) if (!(v[k] >= 0)) return { error: `${k} cannot be negative.` };
  if (!(v.premiumPrice > 0)) return { error: "Enter the premium-grade price per oyster." };

  return core(v, true);
}

function core(v, full) {
  const years = v.growoutMonths / 12;
  const survivors = v.seed * (1 - v.mortalityPct / 100);
  const bags = Math.max(1, Math.ceil(survivors / v.oystersPerBag));
  const culls = 100 - v.premiumPct - v.standardPct;
  const revenue = survivors * (v.premiumPct / 100 * v.premiumPrice + v.standardPct / 100 * v.standardPrice + culls / 100 * v.cullPrice);
  const commission = revenue * (v.commissionPct / 100);

  const seedCost = (v.seed / 1000) * v.seedCostPerK;
  const gearTotal = bags * (v.bagCost + v.rackCostPerBag);
  const gearUsed = Math.min(gearTotal, gearTotal * years / v.gearLifeYears); // wear charged to this crop
  const labor = bags * v.hoursPerBagMonth * v.growoutMonths * v.laborRate;
  const boat = v.boatCostPerMonth * v.growoutMonths;
  const lease = v.leasePerYear * years;
  const other = v.otherPerYear * years;
  const pack = survivors * v.packPerOyster;
  const interest = (seedCost + gearTotal) * (v.interestPct / 100) * years;
  const costs = { seed: seedCost, gearWear: gearUsed, labor, boat, lease, other, packaging: pack, interest, commission };
  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);
  const net = revenue - totalCost;
  const margin = revenue > 0 ? net / revenue : null;
  const netPerThousand = net / (survivors / 1000);
  const netPerYear = net / years;
  // Blended price per surviving oyster at which net is zero, holding grade mix and everything else.
  const blended = revenue / survivors;
  const breakEvenBlended = (totalCost - commission) / (survivors * (1 - v.commissionPct / 100));
  const cashBeforeFirstSale = seedCost + gearTotal + labor + boat + lease + other + interest;

  if (!full) return { net };

  // Survival at which net is zero with prices and mix unchanged (bisection; net rises with survival).
  let breakEvenSurvivalPct = null;
  if (core({ ...v, mortalityPct: 0 }, false).net > 0) {
    let lo = 0, hi = 100; // survival %
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (core({ ...v, mortalityPct: Math.min(99.99, 100 - mid) }, false).net >= 0) hi = mid; else lo = mid;
    }
    breakEvenSurvivalPct = r2(hi);
  }

  const worse = core({ ...v, mortalityPct: Math.min(99, v.mortalityPct + 10) }, false);
  const biggest = Object.entries(costs).filter(([k]) => k !== "commission").sort((a, b) => b[1] - a[1])[0];
  const advice = [];
  if (net < 0) advice.push(`This crop loses about ${money(-net)} (${money(-netPerThousand)} per 1,000 oysters sold). You need a blended $${r2(breakEvenBlended).toFixed(2)} per oyster against the $${r2(blended).toFixed(2)} your mix earns.`);
  else if (margin < 0.15) advice.push(`Thin: ${money(net)} on ${money(revenue)} of sales (${Math.round(margin * 100)}%). Break-even blended price is $${r2(breakEvenBlended).toFixed(2)} per oyster against $${r2(blended).toFixed(2)} earned.`);
  else advice.push(`${money(net)} left after every cost (${Math.round(margin * 100)}% of sales), about ${money(netPerYear)} a year of growout. Break-even blended price is $${r2(breakEvenBlended).toFixed(2)} per oyster.`);
  advice.push(`Cash out before the first sale: about ${money(cashBeforeFirstSale)}. Growout is ${v.growoutMonths} months with no sales income.`);
  advice.push(`Largest cost: ${biggest[0]} at ${money(biggest[1])}.`);
  if (breakEvenSurvivalPct != null) advice.push(`The crop breaks even at about ${breakEvenSurvivalPct}% survival; you entered ${r2(100 - v.mortalityPct)}%.`);
  advice.push(`Ten more points of mortality would move net by ${money(worse.net - net)}.`);
  if (v.mortalityPct === 0) advice.push("0% mortality assumes no losses to predation, siltation, heat or disease. Few farms see that; test 15–30%.");

  const round = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, r2(x)]));
  return { inputs: v, survivors: Math.round(survivors), bags, revenue: r2(revenue), costs: round(costs), totalCost: r2(totalCost), net: r2(net), margin: margin === null ? null : r2(margin), netPerThousand: r2(netPerThousand), netPerYear: r2(netPerYear), blendedPrice: r2(blended), breakEvenBlendedPrice: r2(breakEvenBlended), breakEvenSurvivalPct, cashBeforeFirstSale: r2(cashBeforeFirstSale), loses: net < 0, thin: net >= 0 && margin < 0.15, advice };
}

/** Compare gear/density options: pass the same inputs with different overrides. */
export function compare(base, options) {
  return options.map((o) => ({ name: o.name, result: check({ ...base, ...o.overrides }) })).sort((a, b) => (b.result.net ?? -Infinity) - (a.result.net ?? -Infinity));
}

export function sampleInput() {
  return { ...DEFAULTS, seed: 250000, mortalityPct: 25, growoutMonths: 20, commissionPct: 10, premiumPrice: 0.85 };
}

export function toCsv(r) {
  const rows = [["line", "usd"], ["sales", r.revenue], ...Object.entries(r.costs).map(([k, x]) => [k, -x]), ["net", r.net], ["net per 1,000 oysters sold", r.netPerThousand], ["break-even blended price per oyster", r.breakEvenBlendedPrice], ["cash out before first sale", r.cashBeforeFirstSale]];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
