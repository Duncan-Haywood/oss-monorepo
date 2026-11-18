/**
 * Returns economics for a small clothing brand selling online: what each
 * order really earns once some come back, the return rate at which the line
 * stops making money, and what one point of fewer returns is worth.
 *
 * Model (an assumption, not your data): of every 100 orders a share `returnPct`
 * comes back. Of those, `exchangePct` are swapped for another size (the sale
 * stays, a second parcel goes out); the rest are refunded. Returned pieces that
 * pass inspection (`resaleablePct`) go back on the shelf at no cost; the rest
 * are sold off at `salvagePct` of landed cost. The payment fee on the first
 * charge is not refunded (typical for card processors; check yours). Every
 * return costs the return label (if you pay it) plus handling.
 * Profit is linear in the return rate and in the price, so the break-even rate
 * and the price needed for a target profit are solved exactly, not searched.
 */
const r2 = v => Math.round(v * 100) / 100;
const r1 = v => Math.round(v * 10) / 10;
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

function profitPerOrder(p, price, returnPct) {
  const r = returnPct / 100, e = p.exchangePct / 100, q = p.resaleablePct / 100, v = p.salvagePct / 100;
  const exchanged = r * e, kept = 1 - r;
  const sold = kept + exchanged;
  const revenue = price * sold;
  const cogs = p.landed * sold;
  const writeOff = p.landed * (1 - v) * r * (1 - q);
  const fees = (p.feePct / 100) * price + p.feeFixed;
  const outbound = p.shipOut * (1 + exchanged);
  const back = (p.returnLabel + p.handling) * r;
  return { revenue, cogs, writeOff, fees, outbound, back, profit: revenue - cogs - writeOff - fees - outbound - back };
}

/**
 * @param {{price:number, landed:number, shipOut?:number, feePct?:number, feeFixed?:number, returnPct:number,
 *   exchangePct?:number, resaleablePct?:number, salvagePct?:number, returnLabel?:number, handling?:number,
 *   orders?:number, targetProfit?:number}} o
 */
export function returnsPlan(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { error: "Give the price, the landed cost and the return rate." };
  try {
    const p = {
      price: num(o.price, "Price", 0.01, 1e6),
      landed: num(o.landed, "Landed cost per piece", 0, 1e6),
      shipOut: num(o.shipOut ?? 0, "Shipping you pay per parcel", 0, 1e4),
      feePct: num(o.feePct ?? 2.9, "Payment fee percent", 0, 50),
      feeFixed: num(o.feeFixed ?? 0.3, "Fixed payment fee", 0, 100),
      returnPct: num(o.returnPct, "Return rate percent", 0, 100),
      exchangePct: num(o.exchangePct ?? 0, "Share of returns swapped for another size", 0, 100),
      resaleablePct: num(o.resaleablePct ?? 85, "Share of returns you can resell", 0, 100),
      salvagePct: num(o.salvagePct ?? 30, "Salvage value percent of landed cost", 0, 100),
      returnLabel: num(o.returnLabel ?? 0, "Return label you pay", 0, 1e4),
      handling: num(o.handling ?? 0, "Handling per return", 0, 1e4),
    };
    const orders = num(o.orders ?? 100, "Orders", 1, 1e7);
    const target = num(o.targetProfit ?? 0, "Target profit per order", -1e6, 1e6);
    const at = r => profitPerOrder(p, p.price, r);
    const now = at(p.returnPct), clean = at(0);
    const slope = (at(100).profit - clean.profit) / 100; // profit change per return point
    let breakEvenReturnPct = null;
    if (clean.profit > 0 && slope < 0) { const x = -clean.profit / slope; breakEvenReturnPct = x <= 100 ? r1(x) : null; }
    // price for target profit at the typed return rate: profit is linear in price
    const p0 = profitPerOrder(p, 0, p.returnPct).profit;
    const p1 = profitPerOrder(p, 1, p.returnPct).profit;
    const perDollar = p1 - p0;
    const priceForTarget = perDollar > 0 ? r2((target - p0) / perDollar) : null;
    const notes = [];
    if (now.profit < 0) notes.push(`At ${p.returnPct}% returns each order loses ${r2(-now.profit)}.`);
    if (p.returnPct > 30) notes.push("Returns above 30% are common for fitted clothes bought without trying on; a size guide and a fit page are the cheapest fix.");
    if (p.exchangePct === 0 && p.returnPct > 0) notes.push("You counted every return as a refund. Offering a size swap keeps some sales.");
    if (slope >= 0) notes.push("Returns do not cost you on these numbers (salvage and resale outweigh the labels); check the inputs.");
    return {
      perOrder: { revenue: r2(now.revenue), cogs: r2(now.cogs), writeOff: r2(now.writeOff), fees: r2(now.fees), shippingOut: r2(now.outbound), returnCosts: r2(now.back), profit: r2(now.profit) },
      marginPct: now.revenue > 0 ? r1((now.profit / p.price) * 100) : null,
      withoutReturns: r2(clean.profit),
      lostToReturnsPerOrder: r2(clean.profit - now.profit),
      total: { orders, profit: r2(now.profit * orders), lostToReturns: r2((clean.profit - now.profit) * orders) },
      valueOfOnePointFewer: r2(-slope),
      breakEvenReturnPct,
      priceForTarget,
      notes,
    };
  } catch (e) { return { error: e.message }; }
}
