// Junk car offer: what a scrap or salvage buyer can pay a seller for a car and still make the money they need.
// Pure functions, nothing leaves the browser.
//
// A car bought for scrap pays out three ways and costs five:
//   hulk       (curb weight - parts pulled off) / 2000 x the crusher's price per ton
//   converter  what a recycler pays for the catalytic converter
//   parts      pulled parts x share that sells x (1 - listing and payment fees)
//   costs      tow (base + miles x rate), title and admin, fluids and disposal, yard storage while parts sell,
//              pulling and listing labour, and getting the stripped hulk to the crusher.
// Net before the offer = payouts - costs. Max offer = net - the profit you need. The default figures are
// placeholders, not your crusher's quote, your tow rate or your local scrap market.

export const DEFAULTS = {
  weightLbs: 3200,        // curb weight of the car, pounds
  removedLbs: 250,        // weight of parts you pull and sell separately (engine, transmission and battery stay if the crusher pays for them)
  scrapPricePerTon: 220,  // what the crusher or shredder pays per 2,000 lb ton for the stripped hulk, dollars
  converterValue: 150,    // what a recycler pays for this car's catalytic converter, dollars
  partsRetail: 450,       // what the parts you pull would bring if every one sold, dollars
  partsSellThroughPct: 60,// share of that parts value that actually sells, percent
  partsFeePct: 13,        // marketplace and payment fees on parts sold, percent
  partsHours: 1.5,        // hours to pull, clean, photograph and list the parts
  hourlyRate: 25,         // what an hour of your time or a helper costs, dollars
  towBase: 35,            // flat charge for each tow, dollars
  towMiles: 20,           // one-way miles from the car to your yard
  towPerMile: 3,          // tow cost per mile, dollars
  adminFee: 40,           // title transfer, paperwork and state fees per car, dollars
  disposal: 25,           // draining fluids, tires, mercury switches and other disposal, dollars
  storageDays: 14,        // days the car sits in the yard while parts sell
  storagePerDay: 2,       // yard space cost per car per day, dollars
  haulOut: 30,            // getting the hulk to the crusher, dollars
  sellerAsk: 300,         // what the seller wants for the car, dollars
  targetProfit: 100,      // profit you want on this car, dollars
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

// Everything the car brings in and costs you before you pay the seller anything.
export function carEconomics(o, ov = {}) {
  const p = { ...o, ...ov };
  const hulkLbs = Math.max(0, p.weightLbs - p.removedLbs);
  const hulk = hulkLbs / 2000 * p.scrapPricePerTon;
  const converter = p.converterValue;
  const parts = p.partsRetail * (p.partsSellThroughPct / 100) * (1 - p.partsFeePct / 100);
  const revenue = hulk + converter + parts;
  const tow = p.towBase + p.towMiles * p.towPerMile;
  const labour = p.partsHours * p.hourlyRate;
  const storage = p.storageDays * p.storagePerDay;
  const costs = tow + p.adminFee + p.disposal + storage + labour + p.haulOut;
  const net = revenue - costs; // what the car is worth to you before the seller is paid
  return { hulkLbs, hulk, converter, parts, revenue, tow, labour, storage, admin: p.adminFee, disposal: p.disposal, haulOut: p.haulOut, costs, net,
    breakEvenOffer: net, maxOffer: net - p.targetProfit, profitAtAsk: net - p.sellerAsk };
}

// Scrap price per ton at which the seller's ask just leaves your target profit (0 if the car clears it on converter and parts alone).
export function breakEvenScrapPrice(o) {
  const e = carEconomics(o);
  const need = o.sellerAsk + o.targetProfit - (e.net - e.hulk);
  return e.hulkLbs > 0 ? Math.max(0, need / (e.hulkLbs / 2000)) : NaN;
}

// Farthest tow, in one-way miles, at which the ask still leaves your target profit (negative = even a free tow is not enough).
export function maxTowMiles(o) {
  if (!(o.towPerMile > 0)) return NaN;
  const e = carEconomics(o);
  return o.towMiles + (e.profitAtAsk - o.targetProfit) / o.towPerMile;
}

// Share of the pulled parts that must sell for the ask to leave your target profit (NaN = even all of it is not enough, 0 = not needed).
export function breakEvenSellThrough(o) {
  const per = o.partsRetail * (1 - o.partsFeePct / 100) / 100; // dollars per sell-through point
  if (!(per > 0)) return NaN;
  const e = carEconomics(o);
  const need = o.sellerAsk + o.targetProfit - (e.net - e.parts);
  const s = need / per;
  if (s <= 0) return 0;
  return s > 100 ? NaN : s;
}

const rung = (o, ov) => { const e = carEconomics(o, ov); return { ...ov, profit: e.profitAtAsk, maxOffer: e.maxOffer }; };
export const scrapLadder = (o, steps = [0.6, 0.8, 1, 1.25, 1.5]) => steps.map((k) => ({ scrapPricePerTon: Math.round(o.scrapPricePerTon * k), ...rung(o, { scrapPricePerTon: o.scrapPricePerTon * k }) }));
export const converterLadder = (o, steps = [0, 0.5, 1, 2, 4]) => steps.map((k) => ({ converterValue: Math.round(o.converterValue * k), ...rung(o, { converterValue: o.converterValue * k }) }));
export const sellThroughLadder = (o, steps = [0, 25, 50, 75, 100]) => steps.map((s) => ({ partsSellThroughPct: s, ...rung(o, { partsSellThroughPct: s }) }));
export const towLadder = (o, steps = [5, 15, 30, 50, 80]) => steps.map((m) => ({ towMiles: m, ...rung(o, { towMiles: m }) }));
export const weightLadder = (o, steps = [0.6, 0.8, 1, 1.2, 1.5]) => steps.map((k) => ({ weightLbs: Math.round(o.weightLbs * k), ...rung(o, { weightLbs: o.weightLbs * k }) }));

export function analyze(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) o[k] = num(raw[k]);
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  if (!(o.weightLbs > 0)) warnings.push("Enter the car's weight above zero.");
  if (o.removedLbs > o.weightLbs) warnings.push("The parts you pull cannot weigh more than the car.");
  for (const k of ["partsSellThroughPct", "partsFeePct"]) if (o[k] > 100) warnings.push(`${k} cannot be more than 100%.`);
  if (warnings.length) return { opts: o, warnings, result: null, scrap: [], converter: [], sellThrough: [], tow: [], weight: [] };
  const e = carEconomics(o);
  const result = { ...e, buy: e.profitAtAsk >= o.targetProfit, breakEvenScrapPrice: breakEvenScrapPrice(o), maxTowMiles: maxTowMiles(o),
    breakEvenSellThrough: breakEvenSellThrough(o), counter: Math.max(0, Math.floor(e.maxOffer)) };
  if (e.maxOffer <= 0) warnings.push("At these figures the car is worth less than your target profit even for free; the only offer that works is a tow-away for nothing, or pass.");
  else if (!result.buy) warnings.push(`The seller's ask leaves ${money(e.profitAtAsk)}, short of your ${money(o.targetProfit)} target; counter at ${money(result.counter)} or less.`);
  if (e.parts > 0 && e.parts > e.hulk + e.converter) warnings.push("More than half of the value rides on parts that may not sell; check the sell-through figure against your last ten cars.");
  if (o.storageDays * o.storagePerDay > e.revenue * 0.25) warnings.push("Storage eats a quarter of what the car brings; shorten the time it sits.");
  return { opts: o, warnings, result, scrap: scrapLadder(o), converter: converterLadder(o), sellThrough: sellThroughLadder(o), tow: towLadder(o), weight: weightLadder(o) };
}

export function toCsv(a) {
  if (!a || !a.result) return "";
  const block = (title, key, rows) => [`${title},profit_at_ask,max_offer`, ...rows.map((r) => [r[key], r.profit.toFixed(0), r.maxOffer.toFixed(0)].join(","))].join("\n");
  return [block("scrap_price_per_ton", "scrapPricePerTon", a.scrap), "", block("converter_value", "converterValue", a.converter), "",
    block("parts_sell_through_pct", "partsSellThroughPct", a.sellThrough), "", block("tow_miles", "towMiles", a.tow), "", block("weight_lbs", "weightLbs", a.weight)].join("\n") + "\n";
}
