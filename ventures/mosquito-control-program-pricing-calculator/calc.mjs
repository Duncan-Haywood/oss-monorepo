// Mosquito control (barrier spray) program pricing for a one-truck operator: what a visit and a season program
// must cost to leave the profit you want after product, labour, drive time, truck, free re-treats after rain,
// overhead and card fees -- and what a customer is worth over the years they renew.
// Pure functions, nothing leaves the browser. Default figures are placeholders, not your costs or local prices.
//
// Per visit: product = yard thousands of sq ft x product cost per 1,000 sq ft; labour = (on-site + drive) minutes at
// your loaded hourly cost; truck = drive minutes at the truck's cost per hour; a share of visits are re-treated free
// after rain; overhead and card fees are a percent of price. Season price = visits x visit price, less a prepay discount.

export const DEFAULTS = {
  yardSqft: 15000,       // treated area of the average yard, square feet
  productPer1k: 1.6,     // spray product cost per 1,000 sq ft per visit, dollars
  onSiteMin: 25,         // minutes on the property per visit
  driveMin: 14,          // average drive minutes between stops (one way, route average)
  laborHour: 28,         // loaded hourly cost of the applicator (wage, payroll tax, insurance), dollars
  truckHour: 11,         // truck and equipment cost per hour on the road (fuel, wear, sprayer), dollars
  callbackPct: 6,        // share of visits re-treated free after rain or a complaint, percent
  overheadPct: 12,       // insurance, licence, software, marketing as percent of revenue
  cardPct: 3,            // card processing percent of revenue
  visitsPerSeason: 6,    // visits in a season program
  visitPrice: 95,        // price you charge per visit, dollars
  prepayDiscountPct: 8,  // discount for paying the season up front, percent
  renewPct: 72,          // share of customers who renew next season, percent
  seasonsCap: 8,         // stop counting customer value after this many seasons
  stopsPerDay: 11,       // visits you complete on a full route day
  routeDaysPerWeek: 4,   // days a week you spray (the rest is selling and weather)
  seasonWeeks: 24,       // weeks in your season
  startupCost: 6500,     // sprayer, licence, insurance deposit and branding, dollars
  wantPct: 40,           // profit margin you want on price, percent
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

// Direct cost of one visit (before the percent-of-price costs), including the free re-treat share.
export function visitCost(o) {
  const product = (o.yardSqft / 1000) * o.productPer1k;
  const labor = ((o.onSiteMin + o.driveMin) / 60) * o.laborHour;
  const truck = (o.driveMin / 60) * o.truckHour;
  const one = product + labor + truck;
  const callback = one * (o.callbackPct / 100);
  return { product, labor, truck, callback, direct: one + callback };
}

// Profit on one visit at a given price. Overhead and card fees scale with price.
export function visit(o, price = o.visitPrice) {
  const c = visitCost(o);
  const feeRate = (o.overheadPct + o.cardPct) / 100;
  const fees = price * feeRate;
  const profit = price - c.direct - fees;
  return { ...c, price, fees, profit, margin: price > 0 ? (profit / price) * 100 : 0 };
}

// Lowest per-visit price that leaves the wanted margin: price = direct / (1 - fees - want).
// With a prepay discount d the customer pays price x (1 - d), so the list price must rise by that factor.
export function minVisitPrice(o, wantPct = o.wantPct, discountPct = 0) {
  const denom = (1 - (o.overheadPct + o.cardPct + wantPct) / 100) * (1 - discountPct / 100);
  return denom > 0 ? visitCost(o).direct / denom : Infinity;
}

// The prepay price a customer pays for the season, and what it does to the margin.
export function season(o, price = o.visitPrice) {
  const list = price * o.visitsPerSeason;
  const paid = list * (1 - o.prepayDiscountPct / 100);
  const c = visitCost(o);
  const direct = c.direct * o.visitsPerSeason;
  const fees = paid * (o.overheadPct + o.cardPct) / 100;
  const profit = paid - direct - fees;
  return { list, paid, direct, fees, profit, margin: paid > 0 ? (profit / paid) * 100 : 0 };
}

// Profit over the years a customer renews. Season n is kept with probability renew^(n-1).
export function lifetime(o, price = o.visitPrice) {
  const s = season(o, price);
  const r = Math.min(Math.max(o.renewPct / 100, 0), 1);
  // Closed form of sum_{n=1..cap} r^(n-1). A loop to a typed 1e12 froze the tab.
  const cap = Math.max(0, Math.floor(o.seasonsCap));
  const expectedSeasons = r === 1 ? cap : (1 - Math.pow(r, cap)) / (1 - r);
  return { expectedSeasons, perSeason: s.profit, value: s.profit * expectedSeasons, revenue: s.paid * expectedSeasons };
}

// A full spraying day and the season capacity of one truck.
export function route(o, price = o.visitPrice) {
  const v = visit(o, price);
  const dayRevenue = price * o.stopsPerDay;
  const dayProfit = v.profit * o.stopsPerDay;
  const visitsSeason = o.stopsPerDay * o.routeDaysPerWeek * o.seasonWeeks;
  const customers = o.visitsPerSeason > 0 ? visitsSeason / o.visitsPerSeason : 0;
  const seasonProfit = customers * season(o, price).profit;
  const payback = o.startupCost > 0 && seasonProfit > 0 ? (o.startupCost / seasonProfit) * o.seasonWeeks : 0;
  const breakEvenCustomers = season(o, price).profit > 0 ? Math.ceil(o.startupCost / season(o, price).profit) : Infinity;
  return { dayRevenue, dayProfit, visitsSeason, customers, seasonProfit, payback, breakEvenCustomers };
}

export function priceLadder(o, prices = [65, 75, 85, 95, 105, 115, 130]) {
  return prices.map((p) => {
    const v = visit(o, p), s = season(o, p);
    return { price: p, visitProfit: v.profit, visitMargin: v.margin, seasonPaid: s.paid, seasonProfit: s.profit, seasonMargin: s.margin };
  });
}

// What one wrong assumption does to the season profit per customer.
export function sensitivity(o) {
  const base = season(o).profit;
  const tweak = (patch) => season({ ...o, ...patch }).profit - base;
  return [
    { label: "Product cost +25%", delta: tweak({ productPer1k: o.productPer1k * 1.25 }) },
    { label: "Re-treats double", delta: tweak({ callbackPct: o.callbackPct * 2 }) },
    { label: "Drive time +30%", delta: tweak({ driveMin: o.driveMin * 1.3 }) },
    { label: "Prepay discount +5 points", delta: tweak({ prepayDiscountPct: o.prepayDiscountPct + 5 }) },
    { label: "One fewer visit sold", delta: tweak({ visitsPerSeason: Math.max(1, o.visitsPerSeason - 1) }) },
  ];
}

export function analyze(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (raw && Number.isFinite(raw[k])) o[k] = raw[k];
  const warnings = [];
  for (const k of ["productPer1k", "onSiteMin", "driveMin", "laborHour", "overheadPct", "cardPct", "wantPct"]) if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  if (!(o.yardSqft > 0)) warnings.push("Enter the treated yard size in square feet.");
  if (!(o.visitPrice > 0)) warnings.push("Enter the price you charge per visit.");
  if (o.overheadPct + o.cardPct + o.wantPct >= 100) warnings.push("Overhead, card fees and wanted margin add to 100% or more, so no price can reach them.");
  if (o.prepayDiscountPct < 0 || o.prepayDiscountPct >= 100) warnings.push("The prepay discount should be between 0 and 100 percent.");
  if (warnings.length) return { opts: o, warnings, result: null };
  const v = visit(o);
  const min = minVisitPrice(o);
  const s = season(o);
  if (o.callbackPct > 25) warnings.push("More than a quarter of visits re-treated is unusual; check that number.");
  if (v.margin < o.wantPct) warnings.push("Your pay-per-visit price is below the price that reaches your wanted margin.");
  if (s.margin < o.wantPct) warnings.push("After the prepay discount, the season program is below your wanted margin.");
  return {
    opts: o, warnings,
    result: {
      visit: v, minPrice: min,
      minListPrice: minVisitPrice(o, o.wantPct, o.prepayDiscountPct),
      season: s, lifetime: lifetime(o), route: route(o),
      ladder: priceLadder(o), sensitivity: sensitivity(o),
    },
  };
}

export function toCsv(a) {
  if (!a || !a.result) return "";
  const r = a.result;
  const rows = [
    ["line", "amount"],
    ["visit_price", r.visit.price.toFixed(2)],
    ["product", r.visit.product.toFixed(2)],
    ["labor", r.visit.labor.toFixed(2)],
    ["truck", r.visit.truck.toFixed(2)],
    ["free_retreats", r.visit.callback.toFixed(2)],
    ["overhead_and_card_fees", r.visit.fees.toFixed(2)],
    ["visit_profit", r.visit.profit.toFixed(2)],
    ["min_visit_price_for_target_margin", r.minPrice.toFixed(2)],
    ["min_list_price_with_prepay_discount", r.minListPrice.toFixed(2)],
    ["season_price_paid", r.season.paid.toFixed(2)],
    ["season_profit", r.season.profit.toFixed(2)],
    ["customer_lifetime_profit", r.lifetime.value.toFixed(2)],
    ["break_even_customers", String(r.route.breakEvenCustomers)],
  ];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
