/**
 * Paid ads for a small clothing brand: what a customer may cost before the
 * ads lose money, and what a budget buys.
 *
 * Inputs you type: profit per order BEFORE ads (use returns.html: price less
 * landed cost, fees, shipping and the cost of returns), the order value, the
 * ad click price (cpc), the share of clicks that buy (conversion), extra
 * orders a customer places within a year (repeat) and a monthly budget.
 *
 *   cac           = cpc / conversion              (ad cost of one new customer)
 *   roas          = order value / cac             (revenue per unit of ad spend)
 *   break-even    : cac = profit per order        (first order only)
 *                   cac = profit * (1 + repeat)   (counting repeat orders, undiscounted)
 *   break-even roas = order value / profit
 *
 * What it is not: a forecast. CPC and conversion move with the ad, the season
 * and the spend (the next click is dearer than the average one), repeat is a
 * guess until you have a year of orders, and ad platforms' own "ROAS" counts
 * attributed sales, which can overlap. Arithmetic on typed numbers.
 */
const r2 = v => Math.round(v * 100) / 100;
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

/**
 * @param {{profit:number, orderValue:number, cpc:number, conversionPct:number, repeat?:number, budget?:number}} o
 */
export function adPlan(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "Give the profit per order, the order value, the click price and the conversion rate." };
  try {
    const profit = num(o.profit, "Profit per order before ads", -1e6, 1e6);
    const value = num(o.orderValue, "Order value", 0.01, 1e6);
    const cpc = num(o.cpc, "Cost per click", 0.001, 1e4);
    const conv = num(o.conversionPct, "Conversion rate percent", 0.001, 100);
    const repeat = num(o.repeat ?? 0, "Repeat orders per customer in a year", 0, 100);
    const budget = num(o.budget ?? 0, "Ad budget", 0, 1e9);
    const cac = cpc / (conv / 100);
    const life = profit * (1 + repeat);
    const notes = [];
    if (profit <= 0) notes.push("Profit per order before ads is zero or negative: no ad cost can pay back. Fix price or cost first (returns.html).");
    const out = {
      cac: r2(cac),
      roas: r2(value / cac),
      breakEvenRoasFirstOrder: profit > 0 ? r2(value / profit) : null,
      breakEvenRoasWithRepeat: life > 0 ? r2(value / life) : null,
      maxCacFirstOrder: profit > 0 ? r2(profit) : 0,
      maxCacWithRepeat: life > 0 ? r2(life) : 0,
      maxCpcFirstOrder: profit > 0 ? r2(profit * conv / 100) : 0,
      maxCpcWithRepeat: life > 0 ? r2(life * conv / 100) : 0,
      minConversionPctFirstOrder: profit > 0 ? r2(cpc / profit * 100) : null,
      minConversionPctWithRepeat: life > 0 ? r2(cpc / life * 100) : null,
      firstOrderResultPerCustomer: r2(profit - cac),
      yearResultPerCustomer: r2(life - cac),
      verdict: profit <= 0 ? "no" : cac <= profit ? "pays on the first order" : cac <= life ? "pays only with repeat orders" : "loses money",
      notes,
    };
    if (out.verdict === "pays only with repeat orders") notes.push(`You carry ${r2(cac - profit)} per customer until their repeat orders arrive, and only if ${repeat} repeat orders a year is true. Check it against real orders.`);
    if (budget > 0) {
      const customers = budget / cac;
      out.budget = { customers: r2(customers), revenue: r2(customers * value), firstOrderResult: r2(customers * (profit - cac)), yearResult: r2(customers * (life - cac)) };
    }
    // How the verdict moves if conversion or click price is off by a third either way.
    out.sensitivity = [0.67, 1, 1.5].map(f => ({ conversionTimes: f, cac: r2(cpc / (conv * f / 100)), yearResultPerCustomer: r2(life - cpc / (conv * f / 100)) }));
    return out;
  } catch (e) { return { error: e.message }; }
}
