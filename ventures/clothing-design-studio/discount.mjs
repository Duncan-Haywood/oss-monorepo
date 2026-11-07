/**
 * Discount planner for a small clothing brand: what a sale costs in profit,
 * how many more orders it must bring to break even, and the biggest discount
 * a lift you expect can pay for.
 *
 * Model (arithmetic on typed numbers, not a forecast): each order earns
 *   contribution(price) = price x (1 - feePct/100) - feeFixed - landed - ship.
 * A sale code is open to everyone, so every order, including the ones that
 * would have come anyway, is paid at the lower price. Orders go from N to
 * N x (1 + lift). Profit is compared before and after. The break-even lift
 * is c0 / c1 - 1 (c0, c1 = contribution before and after); the largest
 * discount a given lift pays for is solved exactly, not searched:
 *   c(P(1-d)) x (1+lift) = c0  =>  d = 1 - (c0/(1+lift) + fixed) / (P(1-fee)).
 * Returns, ad spend and brand damage from constant sales are not modelled.
 */
const r2 = v => Math.round(v * 100) / 100;
const r1 = v => Math.round(v * 10) / 10;
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

function check(p) {
  return {
    price: num(p.price, "price", 0.01, 1e6),
    landed: num(p.landed, "landed cost", 0, 1e6),
    ship: num(p.ship ?? 0, "shipping", 0, 1e6),
    feePct: num(p.feePct ?? 0, "payment fee %", 0, 50),
    feeFixed: num(p.feeFixed ?? 0, "fixed fee", 0, 1e3),
    orders: num(p.orders ?? 100, "orders", 1, 1e7),
  };
}
const contribution = (q, price) => price * (1 - q.feePct / 100) - q.feeFixed - q.landed - q.ship;

/** Discount `discountPct` with an expected order lift `liftPct`. */
export function discountPlan(params, discountPct, liftPct = 0) {
  const q = check(params);
  const d = num(discountPct, "discount %", 0, 99.9) / 100;
  const lift = num(liftPct, "lift %", 0, 1e4) / 100;
  const newPrice = q.price * (1 - d);
  const c0 = contribution(q, q.price), c1 = contribution(q, newPrice);
  const baseProfit = c0 * q.orders;
  const newOrders = q.orders * (1 + lift);
  const newProfit = c1 * newOrders;
  const notes = [];
  let breakEvenLiftPct = null;
  if (c0 <= 0) notes.push("At full price an order already loses money; a discount only deepens that.");
  else if (c1 <= 0) notes.push("At the sale price each order loses money: no lift in orders can pay for it.");
  else breakEvenLiftPct = r1((c0 / c1 - 1) * 100);
  if (c1 > 0 && d > 0 && c0 > 0 && breakEvenLiftPct > 100) notes.push(`This sale needs more than ${Math.floor(breakEvenLiftPct)}% more orders just to stand still.`);
  return {
    newPrice: r2(newPrice), contributionBefore: r2(c0), contributionAfter: r2(c1),
    baseProfit: r2(baseProfit), newOrders: r1(newOrders), newProfit: r2(newProfit),
    profitChange: r2(newProfit - baseProfit), breakEvenLiftPct, pays: newProfit >= baseProfit, notes,
  };
}

/** Largest discount % that an expected lift % still pays for (profit not lower). */
export function maxDiscountPct(params, liftPct) {
  const q = check(params);
  const lift = num(liftPct, "lift %", 0, 1e4) / 100;
  const c0 = contribution(q, q.price);
  if (c0 <= 0) return 0;
  const priceNeeded = (c0 / (1 + lift) + q.feeFixed + q.landed + q.ship) / (1 - q.feePct / 100);
  return r1(Math.max(0, (1 - priceNeeded / q.price) * 100));
}

/** Table of discounts 5..50 by break-even lift. */
export function ladder(params, steps = [5, 10, 15, 20, 25, 30, 40, 50]) {
  return steps.map(s => {
    const r = discountPlan(params, s, 0);
    return { discountPct: s, newPrice: r.newPrice, contribution: r.contributionAfter, breakEvenLiftPct: r.breakEvenLiftPct };
  });
}

/** Buy-more offer: second piece at `secondOffPct` off, share of buyers who add it. */
export function secondPieceOffer(params, secondOffPct, takePct) {
  const q = check(params);
  const off = num(secondOffPct, "second-piece discount %", 0, 100) / 100;
  const take = num(takePct, "share who add it %", 0, 100) / 100;
  const c0 = contribution(q, q.price);
  // one parcel: the shipping is paid once, the second piece pays fee on its own price
  const second = q.price * (1 - off) * (1 - q.feePct / 100) - q.landed;
  const perOrder = c0 + take * second;
  return { secondPieceEarns: r2(second), extraPerOrder: r2(take * second), profitPerOrder: r2(perOrder), profit: r2(perOrder * q.orders), vsNoOffer: r2(take * second * q.orders) };
}
