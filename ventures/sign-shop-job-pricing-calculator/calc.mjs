// Sign and banner job pricing for a small sign shop: what a job costs once you count material with waste, print and
// finishing time, design time, install and travel, shop overhead and card fees, and the price that earns your target
// margin. It also shows what the same job earns at the market's per-square-foot price, and how the price per piece
// falls with quantity because design and setup are spread over more pieces.
// Pure functions, nothing leaves the browser.
//
// Cost of a job = material (area x (1 + waste) x per-sq-ft cost of substrate, print media and laminate)
//               + shop labour and overhead over print + finishing + design hours
//               + install labour and travel.
// Price = cost / (1 - card fee - target margin), never below the minimum charge.
// The default figures are placeholders, not your rate card or your suppliers' prices.

export const DEFAULTS = {
  widthIn: 48,            // width of one piece, inches
  heightIn: 24,           // height of one piece, inches
  qty: 2,                 // number of identical pieces
  substrateCostSqft: 3.5, // board, banner or vinyl backing, dollars per sq ft
  printCostSqft: 1.2,     // print media and ink, dollars per sq ft
  laminateCostSqft: 0.6,  // laminate or clear coat, dollars per sq ft (0 if none)
  wastePct: 15,           // trim loss, misprints and test strips, percent of material
  printSqftPerHour: 60,   // sq ft you print per hour including loading and unloading
  finishMinPerPiece: 10,  // trim, weed, mount, hem or grommet one piece, minutes
  designMinutes: 30,      // design and proof time for the job, minutes
  laborRate: 28,          // loaded cost of shop labour, dollars per hour
  overheadPerHour: 22,    // rent, equipment, software and utilities spread over a shop hour, dollars
  installHours: 0,        // hours on site, 0 for pickup
  installRate: 65,        // what an install hour costs you, dollars
  travelCost: 20,         // fuel and van wear for the trip, dollars
  cardFeePct: 3,          // card processing, percent of the price
  marginPct: 40,          // margin you want on the price, percent
  minCharge: 45,          // smallest job you will take, dollars
  marketPerSqft: 12,      // what other shops charge, dollars per sq ft, for comparison
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

// Cost breakdown of a job of `qty` pieces at `margin` percent target margin.
export function jobCost(o, { qty = o.qty, widthIn = o.widthIn, heightIn = o.heightIn } = {}) {
  const areaEach = (widthIn * heightIn) / 144;
  const area = areaEach * qty;
  const materialArea = area * (1 + o.wastePct / 100);
  const material = materialArea * (o.substrateCostSqft + o.printCostSqft + o.laminateCostSqft);
  const printHours = o.printSqftPerHour > 0 ? materialArea / o.printSqftPerHour : 0;
  const finishHours = (qty * o.finishMinPerPiece) / 60;
  const designHours = o.designMinutes / 60;
  const shopHours = printHours + finishHours + designHours;
  const labor = shopHours * o.laborRate;
  const overhead = shopHours * o.overheadPerHour;
  const install = o.installHours * o.installRate + (o.installHours > 0 ? o.travelCost : 0);
  const cost = material + labor + overhead + install;
  return { areaEach, area, materialArea, material, printHours, finishHours, designHours, shopHours, labor, overhead, install, cost };
}

// Price that earns `marginPct` of the price after card fees, floored at the minimum charge.
export function priceFor(o, c, marginPct = o.marginPct) {
  const denom = 1 - o.cardFeePct / 100 - marginPct / 100;
  const raw = denom > 0 ? c.cost / denom : Infinity;
  return Math.max(raw, o.minCharge);
}

// What a given price leaves you.
export function outcome(o, c, price) {
  const net = price * (1 - o.cardFeePct / 100);
  const profit = net - c.cost;
  return {
    price, profit,
    margin: price > 0 ? (profit / price) * 100 : NaN,
    perSqft: c.area > 0 ? price / c.area : NaN,
    perPiece: price,
    // Dollars left per shop hour after materials and install, the number that says whether the work pays you.
    perShopHour: c.shopHours > 0 ? (net - c.material - c.install) / c.shopHours : NaN,
  };
}

export const breakEvenPrice = (o, c) => c.cost / (1 - o.cardFeePct / 100);

export function quantityLadder(o, steps = [1, 2, 5, 10, 25, 50, 100]) {
  return steps.map((q) => {
    const c = jobCost(o, { qty: q });
    const price = priceFor(o, c);
    return { qty: q, total: price, each: price / q, perSqft: c.area > 0 ? price / c.area : NaN, cost: c.cost };
  });
}

export function marginLadder(o, c, steps = [20, 30, 40, 50, 60]) {
  return steps.map((m) => {
    const price = priceFor(o, c, m);
    return { marginPct: m, price, perSqft: c.area > 0 ? price / c.area : NaN, profit: price * (1 - o.cardFeePct / 100) - c.cost };
  });
}

export function analyze(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) o[k] = num(raw[k]);
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  if (!(o.widthIn > 0 && o.heightIn > 0)) warnings.push("Enter a width and height above zero.");
  if (!(o.qty >= 1)) warnings.push("Enter at least one piece.");
  if (o.cardFeePct + o.marginPct >= 100) warnings.push("Card fee plus target margin must be under 100%.");
  if (warnings.length) return { opts: o, warnings, result: null, quantity: [], margin: [] };
  const c = jobCost(o);
  const price = priceFor(o, c);
  const atPrice = outcome(o, c, price);
  const floored = c.cost / (1 - o.cardFeePct / 100 - o.marginPct / 100) < o.minCharge;
  const marketPrice = o.marketPerSqft * c.area;
  const atMarket = outcome(o, c, marketPrice);
  const result = { cost: c, price, atPrice, floored, breakEven: breakEvenPrice(o, c), marketPrice, atMarket };
  if (floored) warnings.push("The minimum charge, not your margin, sets this price. The job is small enough that a floor matters.");
  if (atMarket.profit < 0) warnings.push(`At ${money2(o.marketPerSqft)} per sq ft this job loses money; the market rate does not cover your costs on a job this size.`);
  else if (atMarket.margin < o.marginPct) warnings.push(`Matching the market rate leaves ${pct(atMarket.margin)}, below your ${pct(o.marginPct)} target.`);
  if (c.designHours * (o.laborRate + o.overheadPerHour) > 0.3 * c.cost) warnings.push("Design time is over 30% of the cost of this job; charge it as a separate line or raise the minimum.");
  return { opts: o, warnings: warnings.filter(Boolean), result, quantity: quantityLadder(o), margin: marginLadder(o, c) };
}

export function toCsv(a) {
  if (!a || !a.quantity.length) return "";
  return [
    "quantity,total_price,price_each,price_per_sqft,cost",
    ...a.quantity.map((r) => [r.qty, r.total.toFixed(2), r.each.toFixed(2), Number.isFinite(r.perSqft) ? r.perSqft.toFixed(2) : "", r.cost.toFixed(2)].join(",")),
    "",
    "target_margin_pct,price,price_per_sqft,profit",
    ...a.margin.map((r) => [r.marginPct, r.price.toFixed(2), Number.isFinite(r.perSqft) ? r.perSqft.toFixed(2) : "", r.profit.toFixed(2)].join(",")),
  ].join("\n") + "\n";
}
