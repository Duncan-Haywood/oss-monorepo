// Hay selling math. Pure functions, no I/O. All money in USD, all inputs entered by the user.
// Compares selling channels (small square, large square, round) on net per ton and per acre.

const r2 = (x) => Math.round(x * 100) / 100;
export const money = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US"));

const COMMON = {
  acres: 60,
  tonsPerAcre: 3.5,       // total tons per acre per year across cuttings, as baled
  growCostPerAcre: 210,   // fertiliser, seed (amortised), herbicide, land cost, per acre per year
  makeCostPerTon: 28,     // cutting, raking, fuel, labour, repairs before baling (not the baler/twine)
  storageLossPct: 6,      // % of baled tons lost to weather and storage before sale
};

// Each channel: what a bale weighs, what it costs to bale/handle per ton, shrink and what the buyer pays per bale.
export const CHANNELS = [
  { key: "small", label: "Small squares", baleLbs: 55, baleCostPerTon: 22, sellCostPerTon: 14, lossExtraPct: 0, pricePerBale: 7.5 },
  { key: "large", label: "Large squares (3x3x8)", baleLbs: 850, baleCostPerTon: 14, sellCostPerTon: 9, lossExtraPct: 1, pricePerBale: 120 },
  { key: "round", label: "Round bales (5x5)", baleLbs: 1000, baleCostPerTon: 10, sellCostPerTon: 6, lossExtraPct: 4, pricePerBale: 105 },
];

const num = (o, k, d) => (o[k] === undefined || o[k] === null || o[k] === "" ? d : Number(o[k]));

export function analyzeChannel(common, ch) {
  const acres = common.acres, tpa = common.tonsPerAcre;
  const lossPct = common.storageLossPct + ch.lossExtraPct;
  const soldTons = acres * tpa * (1 - lossPct / 100);
  const bales = (soldTons * 2000) / ch.baleLbs;
  const revenue = bales * ch.pricePerBale;
  const pricePerTon = ch.pricePerBale / (ch.baleLbs / 2000);
  const growCost = acres * common.growCostPerAcre;
  const perTonVariable = common.makeCostPerTon + ch.baleCostPerTon + ch.sellCostPerTon;
  const producedTons = acres * tpa;
  const totalCost = growCost + producedTons * (common.makeCostPerTon + ch.baleCostPerTon) + soldTons * ch.sellCostPerTon;
  const net = revenue - totalCost;
  // Break-even sale price per ton: the price at which net is 0, spreading all cost over tons actually sold.
  const breakEvenPerTon = totalCost / soldTons;
  return {
    key: ch.key, label: ch.label, lossPct: r2(lossPct), soldTons: r2(soldTons), bales: Math.round(bales), pricePerTon: r2(pricePerTon),
    revenue: r2(revenue), totalCost: r2(totalCost), net: r2(net), netPerAcre: r2(net / acres), netPerTon: r2(net / soldTons),
    breakEvenPerTon: r2(breakEvenPerTon), breakEvenPerBale: r2(breakEvenPerTon * (ch.baleLbs / 2000)), perTonVariable: r2(perTonVariable),
  };
}

export function analyze(input = {}) {
  const common = {};
  for (const k of Object.keys(COMMON)) common[k] = num(input, k, COMMON[k]);
  if (!(common.acres > 0)) return { error: "Enter the acres." };
  if (!(common.tonsPerAcre > 0)) return { error: "Enter tons per acre." };
  if (common.growCostPerAcre < 0 || common.makeCostPerTon < 0) return { error: "Costs cannot be negative." };
  if (!(common.storageLossPct >= 0 && common.storageLossPct < 100)) return { error: "Storage loss must be 0 to 99 percent." };
  const channels = [];
  for (const base of CHANNELS) {
    const ch = {
      ...base,
      baleLbs: num(input, base.key + "BaleLbs", base.baleLbs),
      baleCostPerTon: num(input, base.key + "BaleCost", base.baleCostPerTon),
      sellCostPerTon: num(input, base.key + "SellCost", base.sellCostPerTon),
      pricePerBale: num(input, base.key + "Price", base.pricePerBale),
    };
    if (!(ch.baleLbs > 0)) return { error: `${base.label}: bale weight must be above 0.` };
    if (ch.pricePerBale < 0 || ch.baleCostPerTon < 0 || ch.sellCostPerTon < 0) return { error: `${base.label}: price and costs cannot be negative.` };
    if (common.storageLossPct + ch.lossExtraPct >= 100) return { error: "Total loss must stay below 100 percent." };
    channels.push(analyzeChannel(common, ch));
  }
  const ranked = [...channels].sort((a, b) => b.net - a.net);
  const best = ranked[0], worst = ranked[ranked.length - 1];
  const advice = [];
  advice.push(`${common.acres} acres at ${common.tonsPerAcre} t/acre. Best channel on your prices: ${best.label}, netting ${money(best.net)} (${money(best.netPerAcre)}/acre, ${money(best.netPerTon)}/ton sold), against ${money(worst.net)} for ${worst.label}.`);
  for (const c of channels) {
    if (c.net < 0) advice.push(`${c.label} loses ${money(-c.net)} at ${money(c.pricePerTon)}/ton. It needs ${money(c.breakEvenPerTon)}/ton (${money(c.breakEvenPerBale)} a bale) to break even.`);
    else advice.push(`${c.label}: ${money(c.pricePerTon)}/ton equivalent, break-even ${money(c.breakEvenPerTon)}/ton (${money(c.breakEvenPerBale)} a bale), margin ${money(c.pricePerTon - c.breakEvenPerTon)}/ton.`);
  }
  if (best.net < 0) advice.push("No channel covers your costs on these numbers. Look at growing cost per acre and yield first; they move the result more than the bale type does.");
  return { inputs: common, channels, best: best.key, ranked: ranked.map((c) => c.key), advice, anyProfit: best.net >= 0 };
}

/** Net for the best-priced channel as price per ton and yield move together: rows yield factors, columns price factors. */
export function sensitivity(input, key, yieldFactors = [0.8, 1, 1.2], priceFactors = [0.8, 1, 1.2]) {
  const base = analyze(input);
  if (base.error) return [];
  const ch = CHANNELS.find((c) => c.key === key);
  const price0 = num(input, key + "Price", ch.pricePerBale);
  return yieldFactors.map((yf) => ({
    yieldFactor: yf,
    cells: priceFactors.map((pf) => {
      const r = analyze({ ...input, tonsPerAcre: base.inputs.tonsPerAcre * yf, [key + "Price"]: price0 * pf });
      return { priceFactor: pf, net: r.error ? null : r.channels.find((c) => c.key === key).net };
    }),
  }));
}

export function sampleInput() {
  return { acres: 80, tonsPerAcre: 4, growCostPerAcre: 240, makeCostPerTon: 30, storageLossPct: 5, smallPrice: 8, largePrice: 130, roundPrice: 95 };
}

export function toCsv(r) {
  const rows = [["channel", "tons sold", "bales", "price per ton", "revenue", "total cost", "net", "net per acre", "break-even per ton", "break-even per bale"]];
  for (const c of r.channels) rows.push([c.label, c.soldTons, c.bales, c.pricePerTon, c.revenue, c.totalCost, c.net, c.netPerAcre, c.breakEvenPerTon, c.breakEvenPerBale]);
  return rows.map((x) => x.map((v) => (String(v).includes(",") ? `"${v}"` : v)).join(",")).join("\n") + "\n";
}
