/**
 * Repeat-customer value for a small clothing brand: what a new customer is
 * worth over several years, and how much you can pay to win one.
 *
 * Model (arithmetic on typed numbers, not a forecast). A new customer's first
 * order earns c1 = price x (1 - fee%) - feeFixed - landed - ship (the same
 * contribution the other price pages use). Each year a share r of the
 * customers still active stays, and an active customer places n orders a year
 * earning c each (repeat buyers often pay full price and ship together, so c
 * may differ from c1). Years are discounted at d. Value over H years:
 *   LTV = c1 + sum_{t=1..H} n x c x x^t,   x = r / (1 + d)
 *       = c1 + n x c x x (1 - x^H) / (1 - x)    (x = 1 gives n x c x H)
 * Allowed acquisition cost at a target LTV:CAC ratio k is LTV / k, and the
 * years to earn the cost back (undiscounted) are found by stepping year by
 * year. Returns, price changes, and customers who come back through a friend
 * rather than an ad are not modelled; r and n are your guess until you have
 * a year of orders.
 */
const r2 = v => Math.round(v * 100) / 100;
const r1 = v => Math.round(v * 10) / 10;
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

/** @param {{price:number, landed:number, ship?:number, feePct?:number, feeFixed?:number, repeatContribution?:number,
 *  retentionPct:number, ordersPerYear:number, years?:number, discountPct?:number, targetRatio?:number, cac?:number}} o */
export function repeatValue(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "Give the price, the landed cost, the yearly retention and orders per year." };
  try {
    const price = num(o.price, "Price", 0.01, 1e6), landed = num(o.landed, "Landed cost", 0, 1e6);
    const ship = num(o.ship ?? 0, "Shipping you pay", 0, 1e4);
    const feePct = num(o.feePct ?? 2.9, "Payment fee percent", 0, 50), feeFixed = num(o.feeFixed ?? 0.3, "Fixed fee", 0, 100);
    const c1 = price * (1 - feePct / 100) - feeFixed - landed - ship;
    const c = o.repeatContribution == null ? c1 : num(o.repeatContribution, "Profit per repeat order", -1e6, 1e6);
    const ret = num(o.retentionPct, "Yearly retention percent", 0, 100) / 100;
    const n = num(o.ordersPerYear, "Orders per active customer per year", 0, 100);
    const H = Math.round(num(o.years ?? 3, "Years", 1, 20));
    const d = num(o.discountPct ?? 10, "Yearly discount percent", 0, 100) / 100;
    const k = num(o.targetRatio ?? 3, "Target LTV:CAC ratio", 1, 100);
    const cac = o.cac == null || o.cac === "" ? null : num(o.cac, "Cost to win a customer", 0, 1e6);
    const x = ret / (1 + d);
    const tail = Math.abs(1 - x) < 1e-12 ? H : x * (1 - Math.pow(x, H)) / (1 - x);
    const repeat = n * c * tail;
    const ltv = c1 + repeat;
    const years = [];
    let cum = c1, active = 1;
    for (let t = 1; t <= H; t++) { active *= ret; cum += n * c * active; years.push({ year: t, active: r1(active * 100), cumulative: r2(cum) }); }
    let payback = null;
    if (cac !== null) {
      if (c1 >= cac) payback = 0;
      else { for (const y of years) if (y.cumulative >= cac) { payback = y.year; break; } }
    }
    const notes = [];
    if (c1 <= 0) notes.push("The first order loses money before any ad. Repeat orders have to carry the whole cost of winning the customer.");
    if (ret >= 0.6 && n >= 1) notes.push("Retention this high is rare for fashion (many brands report a minority buying again within a year). Use your own order history before relying on it.");
    if (cac !== null && ltv > 0 && ltv / cac < 1) notes.push("At this cost to win a customer, even the multi-year value does not pay it back.");
    if (cac !== null && cac > c1 && ltv >= cac) notes.push(`The first order does not cover the cost (${r2(c1)} vs ${r2(cac)}); you are lending to the customer until they reorder, so cash for ${payback} year(s) is tied up.`);
    return {
      firstOrderProfit: r2(c1), repeatOrderProfit: r2(c), ltv: r2(ltv), repeatShareOfLtv: ltv > 0 ? r1((repeat / ltv) * 100) : null,
      maxCacAtRatio: r2(Math.max(0, ltv / k)), maxCacFirstOrderOnly: r2(Math.max(0, c1)), targetRatio: k,
      years, cac, ltvToCac: cac ? r2(ltv / cac) : null, paybackYears: payback, notes,
    };
  } catch (e) { return { error: e.message }; }
}
