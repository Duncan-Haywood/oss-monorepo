// Sell the grapes or bottle them: compares what a vineyard acre nets as fruit sold by the ton with what it nets as
// wine you make and sell yourself, after the costs the wine path adds (winemaking, dry goods, labour, carrying the
// stock while it ages, excise tax, fixed winery overhead) and the share that does not sell.
// Pure functions, nothing leaves the browser.
//
// Both paths pay the same to grow and pick the fruit. The wine path then:
//   bottles   acres x tons/acre x (1 - process loss) x cases per ton
//   sells     bottled x sell-through (unsold stock is valued at zero here; it is a risk, not income)
//   earns     sold x 12 x blended net bottle price (direct-to-consumer net of its selling cost, wholesale as received)
//   costs     bottled x (production + labour) + carry on production over the ageing months + excise and marketing on what sells
//             + fixed winery overhead for the year.
// The default figures are placeholders, not your contract, your crush bill or your price list.

export const DEFAULTS = {
  acres: 5,               // planted acres in production
  tonsPerAcre: 3.5,       // crop yield, tons per acre
  grapePrice: 2400,       // what a buyer pays per ton, dollars
  growCostPerAcre: 6500,  // farming cost per acre either way: labour, spray, trellis upkeep, water, insurance
  harvestCostPerTon: 120, // picking and hauling per ton either way, dollars
  casesPerTon: 60,        // 12-bottle cases from a ton of fruit (about 150 gallons of wine)
  lossPct: 5,             // fruit and wine lost in processing, percent
  productionPerCase: 70,  // custom crush or own cellar, bottles, corks, labels, cartons, lab work, per case
  laborPerCase: 20,       // your own cellar, bottling and admin time per case, dollars
  marketingPerCase: 75,   // tasting-room staff, events, club, samples and advertising per case sold, dollars
  dtcPrice: 36,           // direct-to-consumer bottle price (tasting room, club, online), dollars
  dtcCostPct: 12,         // card fees, shipping and club costs on direct sales, percent
  wholesalePrice: 18,     // what you receive per bottle from a distributor or retailer, dollars
  dtcSharePct: 30,        // share of bottles sold direct, percent
  sellThroughPct: 70,     // share of the bottled wine that actually sells, percent
  agingMonths: 18,        // months the money in production sits in wine before it sells
  capitalRatePct: 8,      // what your money costs per year, percent
  exciseTaxPerCase: 2.5,  // federal excise plus state tax per case sold; small-producer credits may lower it
  fixedOverhead: 6000,    // yearly winery licences, insurance, accounting, label approval, storage, dollars
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

const BOTTLES_PER_CASE = 12;

// Net per bottle you keep from a blended mix of direct and wholesale sales.
export const blendedBottle = (o, dtcPrice = o.dtcPrice, share = o.dtcSharePct) =>
  (share / 100) * dtcPrice * (1 - o.dtcCostPct / 100) + (1 - share / 100) * o.wholesalePrice;

// What the acreage nets if you sell the fruit.
export function sellGrapes(o, price = o.grapePrice) {
  const tons = o.acres * o.tonsPerAcre;
  const revenue = tons * price;
  const growing = o.acres * o.growCostPerAcre + tons * o.harvestCostPerTon;
  return { tons, revenue, growing, net: revenue - growing, perAcre: o.acres > 0 ? (revenue - growing) / o.acres : NaN };
}

// What the same acreage nets as wine. `fixed` and `acres` can be overridden to solve for them.
export function bottleWine(o, { sellThrough = o.sellThroughPct, dtcPrice = o.dtcPrice, share = o.dtcSharePct, acres = o.acres, fixed = o.fixedOverhead, tonsPerAcre = o.tonsPerAcre } = {}) {
  const tons = acres * tonsPerAcre;
  const bottledCases = tons * (1 - o.lossPct / 100) * o.casesPerTon;
  const soldCases = bottledCases * sellThrough / 100;
  const perBottle = blendedBottle(o, dtcPrice, share);
  const revenue = soldCases * BOTTLES_PER_CASE * perBottle;
  const production = bottledCases * (o.productionPerCase + o.laborPerCase);
  const carry = bottledCases * o.productionPerCase * (o.capitalRatePct / 100) * (o.agingMonths / 12);
  const excise = soldCases * o.exciseTaxPerCase;
  const marketing = soldCases * o.marketingPerCase;
  const growing = acres * o.growCostPerAcre + tons * o.harvestCostPerTon;
  const beyond = production + carry + excise + marketing + fixed; // what the wine path adds on top of growing
  const net = revenue - beyond - growing;
  return { tons, bottledCases, soldCases, unsoldCases: bottledCases - soldCases, perBottle, revenue, production, carry, excise, marketing,
    fixed, growing, beyond, net, perAcre: acres > 0 ? net / acres : NaN,
    cashInWine: production + carry, bottlesSold: soldCases * BOTTLES_PER_CASE };
}

const diff = (o, ov = {}) => bottleWine(o, ov).net - sellGrapes({ ...o, acres: ov.acres ?? o.acres, tonsPerAcre: ov.tonsPerAcre ?? o.tonsPerAcre }, ov.grapePrice ?? o.grapePrice).net;

// Root of a function that is linear in x between two probes; NaN if it never crosses, bounds if one side already wins.
function root(f, lo, hi) {
  const a = f(lo), b = f(hi);
  if (a >= 0 && b >= 0) return lo;
  if (a < 0 && b < 0) return NaN;
  return lo + (-a) / (b - a) * (hi - lo);
}

// Sell-through at which bottling stops beating the fruit price (0 = beats it even at no sales; NaN = never at 100%).
export const breakEvenSellThrough = (o) => root((s) => diff(o, { sellThrough: s }), 0, 100);

// Direct-to-consumer bottle price at which the two paths tie, holding the mix and everything else.
export function breakEvenDtcPrice(o) {
  if (!(o.dtcSharePct > 0)) return NaN;
  const a = diff(o, { dtcPrice: 0 }), b = diff(o, { dtcPrice: 100 });
  if (!(b > a)) return NaN;
  return Math.max(0, -a / (b - a) * 100);
}

// Blended net per bottle you need for the wine path to match selling the fruit.
export function requiredBottleNet(o) {
  const w = bottleWine(o), g = sellGrapes(o);
  return w.bottlesSold > 0 ? (g.revenue + w.beyond) / w.bottlesSold : NaN;
}

// Grape price per ton at which selling the fruit matches bottling it.
export function breakEvenGrapePrice(o) {
  const w = bottleWine(o);
  const tons = o.acres * o.tonsPerAcre;
  return tons > 0 ? (w.revenue - w.beyond) / tons : NaN;
}

// Planted acres above which the wine path's per-acre margin has absorbed the fixed overhead (Infinity = never).
export function breakEvenAcres(o) {
  const noFixed = diff(o, { fixed: 0, acres: 1 });
  return noFixed > 0 && o.fixedOverhead > 0 ? o.fixedOverhead / noFixed : (noFixed > 0 ? 0 : Infinity);
}

const row = (o, ov) => { const w = bottleWine(o, ov), g = sellGrapes({ ...o, tonsPerAcre: ov.tonsPerAcre ?? o.tonsPerAcre }, ov.grapePrice ?? o.grapePrice); return { ...ov, wine: w.net, fruit: g.net, gain: w.net - g.net }; };
export const sellThroughLadder = (o, steps = [40, 55, 70, 85, 95, 100]) => steps.map((p) => ({ sellThroughPct: p, ...row(o, { sellThrough: p }) }));
export const directShareLadder = (o, steps = [0, 15, 30, 50, 70, 90]) => steps.map((p) => ({ dtcSharePct: p, ...row(o, { share: p }) }));
export const grapePriceLadder = (o, steps = [0.7, 0.85, 1, 1.2, 1.5]) => steps.map((k) => ({ grapePrice: Math.round(o.grapePrice * k), ...row(o, { grapePrice: o.grapePrice * k }) }));
export const yieldLadder = (o, steps = [0.6, 0.8, 1, 1.2]) => steps.map((k) => ({ tonsPerAcre: Math.round(o.tonsPerAcre * k * 100) / 100, ...row(o, { tonsPerAcre: o.tonsPerAcre * k }) }));

export function analyze(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) o[k] = num(raw[k]);
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  if (!(o.acres > 0)) warnings.push("Enter the planted acres above zero.");
  if (!(o.tonsPerAcre > 0)) warnings.push("Enter a yield above zero tons per acre.");
  if (!(o.casesPerTon > 0)) warnings.push("Enter the cases of wine per ton above zero.");
  for (const k of ["lossPct", "dtcCostPct", "dtcSharePct", "sellThroughPct"]) if (o[k] > 100) warnings.push(`${k} cannot be more than 100%.`);
  if (warnings.length) return { opts: o, warnings, result: null, sellThrough: [], directShare: [], grapePrice: [], yield: [] };
  const fruit = sellGrapes(o), wine = bottleWine(o);
  const gain = wine.net - fruit.net;
  const result = { fruit, wine, gain, winePays: gain > 0,
    breakEvenSellThrough: breakEvenSellThrough(o), breakEvenDtcPrice: breakEvenDtcPrice(o),
    requiredBottleNet: requiredBottleNet(o), breakEvenGrapePrice: breakEvenGrapePrice(o), breakEvenAcres: breakEvenAcres(o) };
  if (!result.winePays) warnings.push(`At these figures selling the fruit nets ${money(-gain)} more than bottling it.`);
  if (result.winePays && wine.unsoldCases > 0) warnings.push(`${Math.round(wine.unsoldCases)} cases stay unsold and are counted at zero; selling slower than planned eats the gain.`);
  if (Number.isNaN(result.breakEvenSellThrough)) warnings.push("Even selling every bottle does not beat the fruit price at these figures.");
  if (o.dtcPrice < o.wholesalePrice) warnings.push("Your direct price is below your wholesale price; check those two figures.");
  if (o.grapePrice > 0 && o.casesPerTon * 12 > 0 && result.requiredBottleNet > 0 && result.requiredBottleNet > o.dtcPrice * 1.0) warnings.push("You would need to net more per bottle than your own direct price to match the fruit price; the fruit buyer is paying well.");
  return { opts: o, warnings, result, sellThrough: sellThroughLadder(o), directShare: directShareLadder(o), grapePrice: grapePriceLadder(o), yield: yieldLadder(o) };
}

export function toCsv(a) {
  if (!a || !a.result) return "";
  const block = (title, key, rows) => [`${title},wine_net,fruit_net,wine_minus_fruit`,
    ...rows.map((r) => [r[key], r.wine.toFixed(0), r.fruit.toFixed(0), r.gain.toFixed(0)].join(","))].join("\n");
  return [block("sell_through_pct", "sellThroughPct", a.sellThrough), "", block("direct_share_pct", "dtcSharePct", a.directShare), "",
    block("grape_price_per_ton", "grapePrice", a.grapePrice), "", block("tons_per_acre", "tonsPerAcre", a.yield)].join("\n") + "\n";
}
