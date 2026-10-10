// Shaved ice / lemonade / frozen-treat stand at a fair or festival: per-cup margin by size, the cups an event
// must sell to cover its costs, and how much booth fee the event can bear. Pure functions; no DOM.

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const money = (n) => Math.round(n * 100) / 100;
export const SIZES = ["small", "medium", "large"];

export function sampleInput() {
  return {
    smallPrice: 4, mediumPrice: 6, largePrice: 8,
    smallIceOz: 6, mediumIceOz: 10, largeIceOz: 14,
    smallSyrupOz: 1, mediumSyrupOz: 1.5, largeSyrupOz: 2,
    smallShare: 25, mediumShare: 45, largeShare: 30,
    cupCost: 0.18, strawSpoonCost: 0.06, iceCostPerLb: 0.35, syrupCostPerOz: 0.14, wastePct: 8, cardFeePct: 2.9, cardSharePct: 60,
    cupsPerHour: 45, hours: 8, staff: 2, wage: 15, boothFee: 150, boothPctOfSales: 0, fuelAndSupplies: 40, otherFixed: 25,
    weatherHot: 130, weatherMild: 100, weatherCool: 55, targetProfit: 400,
  };
}

function shares(i) {
  const s = SIZES.map((k) => Math.max(0, num(i[k + "Share"])));
  const t = s.reduce((a, b) => a + b, 0);
  return t > 0 ? s.map((x) => x / t) : null;
}

// Variable cost to make one cup of a size, with waste (spills, melt, dropped cups) added on top.
export function cupEconomics(i) {
  const waste = 1 + clamp(num(i.wastePct), 0, 100) / 100;
  const fee = (clamp(num(i.cardSharePct), 0, 100) / 100) * (num(i.cardFeePct) / 100);
  return SIZES.map((k) => {
    const price = num(i[k + "Price"]);
    const ice = (num(i[k + "IceOz"]) / 16) * num(i.iceCostPerLb);
    const syrup = num(i[k + "SyrupOz"]) * num(i.syrupCostPerOz);
    const make = (ice + syrup + num(i.cupCost) + num(i.strawSpoonCost)) * waste;
    const card = price * fee;
    const margin = price - make - card;
    return { size: k, price, make, card, margin, marginPct: price > 0 ? margin / price : 0 };
  });
}

export function analyze(i) {
  const sh = shares(i);
  if (!sh) return { error: "Enter a size mix: at least one of small, medium or large share must be above zero." };
  const cups = cupEconomics(i);
  const avgPrice = cups.reduce((a, c, n) => a + c.price * sh[n], 0);
  const avgMargin = cups.reduce((a, c, n) => a + c.margin * sh[n], 0);
  const hours = Math.max(0, num(i.hours));
  const labor = hours * num(i.staff) * num(i.wage);
  const fixed = num(i.boothFee) + num(i.fuelAndSupplies) + num(i.otherFixed) + labor;
  const pct = clamp(num(i.boothPctOfSales), 0, 100) / 100;
  // Percent-of-sales fee comes off the price too, so the effective margin per average cup shrinks.
  const marginAfterPct = avgMargin - avgPrice * pct;
  const breakEvenCups = marginAfterPct > 0 ? Math.ceil(fixed / marginAfterPct) : null;
  const base = num(i.cupsPerHour) * hours;
  const scenario = (name, pctOfBase) => {
    const sold = Math.round((base * num(pctOfBase)) / 100);
    const revenue = sold * avgPrice;
    const profit = sold * marginAfterPct - fixed;
    return { name, sold, revenue, profit };
  };
  const scenarios = [scenario("Hot, busy day", i.weatherHot), scenario("Normal day", i.weatherMild), scenario("Cool or rainy day", i.weatherCool)];
  const normal = scenarios[1];
  // The most flat booth fee that still leaves the target profit on a normal day.
  const maxFlatFee = normal.sold * marginAfterPct - (fixed - num(i.boothFee)) - num(i.targetProfit);
  // Percent fee that would cost the same as the flat fee on a normal day.
  const equivalentPct = normal.revenue > 0 ? (num(i.boothFee) / normal.revenue) * 100 : null;
  const best = [...cups].sort((a, b) => b.margin - a.margin)[0];
  const advice = [];
  advice.push(breakEvenCups === null ? "At these prices a cup earns nothing after ingredients, fees and the percent cut; raise prices before worrying about volume." : `You need ${breakEvenCups} cups to cover the day's costs of $${money(fixed).toFixed(2)}, about ${hours > 0 ? Math.ceil(breakEvenCups / hours) : 0} cups an hour over ${hours} hours.`);
  advice.push(`Normal day: ${normal.sold} cups, $${money(normal.revenue).toFixed(2)} in sales, ${normal.profit < 0 ? "a loss of" : "a profit of"} $${money(Math.abs(normal.profit)).toFixed(2)}. Cool or rainy: ${scenarios[2].profit < 0 ? "a loss of" : "a profit of"} $${money(Math.abs(scenarios[2].profit)).toFixed(2)}.`);
  advice.push(`The ${best.size} cup earns the most per cup ($${money(best.margin).toFixed(2)}); push it if the line is moving.`);
  if (normal.sold > 0) advice.push(maxFlatFee > 0 ? `To keep $${num(i.targetProfit).toFixed(0)} on a normal day the booth fee can be at most $${money(maxFlatFee).toFixed(2)} flat (you are quoted $${money(num(i.boothFee)).toFixed(2)}).` : `Even a free booth does not reach $${num(i.targetProfit).toFixed(0)} on a normal day; the issue is labour or volume, not the fee.`);
  if (equivalentPct !== null && num(i.boothFee) > 0) advice.push(`A flat $${money(num(i.boothFee)).toFixed(2)} equals ${equivalentPct.toFixed(1)}% of a normal day's sales; a percentage fee below that is better for you and above it is worse.`);
  return { cups, shares: sh, avgPrice, avgMargin, marginAfterPct, labor, fixed, breakEvenCups, scenarios, maxFlatFee, equivalentPct, best, advice };
}

export function toCsv(r) {
  const rows = [["size", "price", "make_cost", "card_fee", "margin", "margin_pct"]];
  for (const c of r.cups) rows.push([c.size, c.price, c.make, c.card, c.margin, Math.round(c.marginPct * 1000) / 10].map((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
  return rows.map((x) => x.join(",")).join("\n");
}
