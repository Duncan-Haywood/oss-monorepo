// Store-or-sell for harvested grain. Compares selling at harvest with storing
// to a later cash price, after the costs farmers actually pay: water shrink,
// drying, handling shrink, storage, interest on the money not received, and
// quality loss in the bin. Answers "what must the later bid be to break even?"
//
// Water shrink is the standard moisture formula: removing water from grain at
// moisture M down to target T leaves (100 - M) / (100 - T) of the weight, so
// the lost fraction is (M - T) / (100 - T). Corn 20% -> 15% loses 5.88%, which
// is the familiar 1.18% per point.

export const CROPS = {
  corn: { label: "Corn", saleMoisture: 15, storeMoisture: 15, dryRate: 0.04 },
  soybeans: { label: "Soybeans", saleMoisture: 13, storeMoisture: 13, dryRate: 0.04 },
  wheat: { label: "Wheat", saleMoisture: 13.5, storeMoisture: 13.5, dryRate: 0.04 },
  sorghum: { label: "Sorghum", saleMoisture: 14, storeMoisture: 14, dryRate: 0.04 },
};

export const MAX_BIDS = 6;

export function waterShrink(moisture, target) {
  if (!(moisture > target)) return 0;
  return (moisture - target) / (100 - target);
}

export function validateInput(i) {
  const e = [];
  const pos = (v) => Number.isFinite(v) && v > 0;
  const nonneg = (v) => Number.isFinite(v) && v >= 0;
  if (!CROPS[i.crop]) e.push("Pick a crop.");
  if (!pos(i.bushels)) e.push("Enter the bushels harvested as a number above zero.");
  if (!pos(i.harvestPrice)) e.push("Enter the price you could get at harvest, above zero.");
  if (!(Number.isFinite(i.harvestMoisture) && i.harvestMoisture >= 5 && i.harvestMoisture < 40)) e.push("Harvest moisture should be between 5% and 40%.");
  if (!(Number.isFinite(i.storeMoisture) && i.storeMoisture >= 5 && i.storeMoisture < 40)) e.push("Storage moisture should be between 5% and 40%.");
  if (!(nonneg(i.interestPct) && i.interestPct <= 40)) e.push("Interest rate must be between 0% and 40%.");
  for (const k of ["dryRate", "storageCostPerMonth", "otherCostPerBu"]) if (!nonneg(i[k])) e.push("Costs must be zero or more.");
  for (const k of ["handlingShrinkPct", "binLossPctPerMonth"]) if (!(nonneg(i[k]) && i[k] <= 20)) e.push("Shrink percentages must be between 0 and 20.");
  if (!Array.isArray(i.bids) || i.bids.length < 1) e.push("Add at least one later price to compare.");
  else if (i.bids.length > MAX_BIDS) e.push(`This tool compares up to ${MAX_BIDS} later prices.`);
  else i.bids.forEach((b, k) => {
    if (!(Number.isFinite(b.months) && b.months > 0 && b.months <= 24)) e.push(`Later price ${k + 1}: months stored must be between 0 and 24.`);
    if (!pos(b.price)) e.push(`Later price ${k + 1}: enter a price above zero.`);
  });
  return e;
}


export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const i = input;
  const wet = i.bushels;
  const handling = i.handlingShrinkPct / 100;
  const rate = i.interestPct / 100;

  // Sell at harvest: dry to sale moisture, deliver, get paid now.
  const saleShrink = waterShrink(i.harvestMoisture, CROPS[i.crop].saleMoisture);
  const saleBu = wet * (1 - saleShrink) * (1 - handling);
  const saleDry = Math.max(0, i.harvestMoisture - CROPS[i.crop].saleMoisture) * i.dryRate * wet;
  const saleNet = saleBu * i.harvestPrice - saleDry;

  const storeShrink = waterShrink(i.harvestMoisture, i.storeMoisture);
  const storeDry = Math.max(0, i.harvestMoisture - i.storeMoisture) * i.dryRate * wet;
  const storedBuStart = wet * (1 - storeShrink);

  const options = i.bids.map((b, k) => {
    const loss = Math.min(0.99, (i.binLossPctPerMonth / 100) * b.months);
    const sellBu = storedBuStart * (1 - loss) * (1 - handling);
    const revenue = sellBu * b.price;
    const storage = storedBuStart * (i.storageCostPerMonth + i.otherCostPerBu / b.months) * b.months;
    const interest = saleNet * rate * (b.months / 12);
    const net = revenue - storeDry - storage - interest;
    const advantage = net - saleNet;
    // Price per delivered bushel at which storing ties with selling now.
    const breakEven = (saleNet + storeDry + storage + interest) / sellBu;
    const carryNeeded = breakEven - i.harvestPrice;
    const annualReturn = saleNet > 0 ? (net / saleNet - 1) * (12 / b.months) : 0;
    return {
      index: k + 1, label: b.label || `${b.months} months`, months: b.months, price: b.price,
      sellBu, revenue, storageCost: storage, interestCost: interest, dryingCost: storeDry, binLossBu: storedBuStart * loss,
      net, advantage, advantagePerBu: advantage / wet, breakEven, carryNeeded, cushion: b.price - breakEven, annualReturn,
    };
  });
  const best = options.reduce((a, o) => (o.advantage > a.advantage ? o : a), options[0]);
  const verdict = best.advantage > 0 ? "store" : "sell";

  return {
    ok: true, input: i, verdict, bestIndex: best.index,
    sell: { bushels: saleBu, shrinkPct: saleShrink * 100, dryingCost: saleDry, net: saleNet, perWetBu: saleNet / wet },
    options,
    notes: buildNotes(i, options, best, verdict),
  };
}

function buildNotes(i, options, best, verdict) {
  const n = [];
  if (verdict === "sell") n.push("No later price listed beats selling at harvest after costs. Selling now, or a higher later bid, is what the numbers favour.");
  else n.push(`Storing to the ${best.label} price beats selling at harvest by about ${money(best.advantage)} (${cents(best.advantagePerBu)} per bushel harvested).`);
  const thin = options.filter((o) => o.advantage > 0 && o.cushion < 0.1);
  if (thin.length) n.push("A later price that wins by less than ten cents a bushel is within a normal basis or quality surprise; treat it as a tie.");
  if (i.harvestMoisture > 25) n.push("Grain this wet is risky to hold. Dry it to storage moisture quickly.");
  return n;
}

export function money(x) {
  const neg = x < 0;
  const s = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (neg ? "-$" : "$") + s;
}
export const cents = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);

export function sampleInput() {
  return {
    crop: "corn", bushels: 50000, harvestMoisture: 18, storeMoisture: 15, harvestPrice: 3.85,
    dryRate: 0.04, handlingShrinkPct: 0.25, binLossPctPerMonth: 0.1, storageCostPerMonth: 0.03,
    otherCostPerBu: 0, interestPct: 7.5,
    bids: [{ label: "Dec", months: 2, price: 4.0 }, { label: "Mar", months: 5, price: 4.22 }, { label: "Jul", months: 9, price: 4.45 }],
  };
}

export function resultText(r) {
  const lines = [`Store or sell: ${CROPS[r.input.crop].label}, ${r.input.bushels.toLocaleString("en-US")} bu at ${r.input.harvestMoisture}% moisture`,
    `Sell at harvest (${cents(r.input.harvestPrice)}): ${money(r.sell.net)} net, ${Math.round(r.sell.bushels).toLocaleString("en-US")} bu delivered`];
  for (const o of r.options) lines.push(`Store to ${o.label} (${cents(o.price)}): ${money(o.net)} net, ${o.advantage >= 0 ? "+" : ""}${money(o.advantage)} vs selling now; break-even ${cents(o.breakEven)}`);
  lines.push("Arithmetic on the numbers entered, not marketing or financial advice.");
  return lines.join("\n");
}

export function resultCsv(r) {
  const head = "option,months,price,delivered_bu,revenue,drying,storage,interest,net,advantage_vs_sell_now,break_even_price";
  const rows = [["sell at harvest", 0, r.input.harvestPrice, r.sell.bushels, r.sell.bushels * r.input.harvestPrice, r.sell.dryingCost, 0, 0, r.sell.net, 0, r.input.harvestPrice]];
  for (const o of r.options) rows.push([o.label, o.months, o.price, o.sellBu, o.revenue, o.dryingCost, o.storageCost, o.interestCost, o.net, o.advantage, o.breakEven]);
  const f = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : `"${String(v).replace(/"/g, '""')}"`);
  return [head, ...rows.map((r2) => r2.map(f).join(","))].join("\n");
}

export function serializeState(input) { return JSON.stringify({ app: "grain-store-or-sell-calculator", version: 1, input }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== "grain-store-or-sell-calculator" || !d.input) return { error: "That file is not a saved store-or-sell scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input };
}
