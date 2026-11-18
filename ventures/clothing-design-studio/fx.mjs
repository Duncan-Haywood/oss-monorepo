/**
 * Currency exposure on a factory order. The factory quotes in one currency
 * (say USD), the designer's money and shelf prices are in another (say EUR).
 * The deposit is paid at today's rate; the balance is paid weeks later at a
 * rate nobody knows. This shows the cost and profit if the factory's currency
 * gets stronger or weaker by the time the balance is due, the move that wipes
 * out the profit, and what a forward rate (typed from a bank or payment
 * provider's quote) would lock.
 *
 * Rate = home currency per 1 unit of the factory's currency (0.92 EUR per USD).
 * Move = fractional change in that rate between deposit and balance
 * (0.10 = factory currency 10% stronger, so the balance costs 10% more).
 * Cost = deposit x rate + balance x rate x (1 + move) + other costs already in
 * the home currency. No forecast is made: moves are scenarios the designer
 * picks. Not financial advice; check any forward contract's terms and fees.
 */
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

function check(o) {
  num(o.orderForeign, "Order total", 0, 1e9); num(o.depositPct, "Deposit %", 0, 100);
  num(o.rate, "Rate", 1e-9, 1e6); num(o.otherHome, "Other costs", 0, 1e9); num(o.revenueHome, "Expected revenue", 0, 1e10);
  return o;
}

/** Home-currency cost and profit when the balance is paid at rate x (1 + move). */
export function atMove(o, move = 0) {
  check(o); num(move, "Move", -0.9, 10);
  const dep = o.orderForeign * o.depositPct / 100, bal = o.orderForeign - dep;
  const depositHome = dep * o.rate, balanceHome = bal * o.rate * (1 + move);
  const cost = depositHome + balanceHome + o.otherHome, profit = o.revenueHome - cost;
  return { move, depositHome, balanceHome, cost, profit, marginPct: o.revenueHome > 0 ? profit / o.revenueHome * 100 : 0 };
}

/** The scenario table: each move against the no-move case. */
export function stress(o, moves = [-0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2]) {
  const base = atMove(o, 0);
  return moves.map(m => { const r = atMove(o, m); return { ...r, costChange: r.cost - base.cost, profitChange: r.profit - base.profit }; });
}

/**
 * The move in the balance rate at which profit is zero, or null if the balance is
 * zero (all paid up front, nothing left to move). Negative means a fall
 * in the rate is enough; below -100% means no rate loses money.
 */
export function breakEvenMove(o) {
  check(o);
  const bal = o.orderForeign * (1 - o.depositPct / 100);
  if (bal <= 0) return null;
  const rateNeeded = (o.revenueHome - o.otherHome - o.orderForeign * o.depositPct / 100 * o.rate) / bal;
  return rateNeeded / o.rate - 1;
}

/** A forward quote locks the balance rate. Compare it with paying at spot-after-move. */
export function forward(o, forwardRate, feeHome = 0) {
  check(o); num(forwardRate, "Forward rate", 1e-9, 1e6); num(feeHome, "Fee", 0, 1e9);
  const bal = o.orderForeign * (1 - o.depositPct / 100);
  const lockedCost = o.orderForeign * o.depositPct / 100 * o.rate + bal * forwardRate + feeHome + o.otherHome;
  const premiumPct = (forwardRate / o.rate - 1) * 100;
  // the move at which paying spot costs the same as the forward, fee included
  const evenMove = bal > 0 ? (forwardRate * bal + feeHome) / (bal * o.rate) - 1 : null;
  return { lockedCost, lockedProfit: o.revenueHome - lockedCost, premiumPct, evenMove };
}

/** Extra price per garment that would cover a move's added cost, before any margin target. */
export function priceToCover(o, move, garments) {
  num(garments, "Garments", 1, 1e7);
  const extra = Math.max(0, atMove(o, move).cost - atMove(o, 0).cost);
  return extra / garments;
}

export function notes(o) {
  check(o);
  const out = [], be = breakEvenMove(o);
  if (o.depositPct >= 100) out.push("Fully paid up front: the rate risk is already taken. It is now the risk of the rate you paid at, not of a later move.");
  if (be !== null && be > 1) out.push("Profit survives a doubling of the rate; currency is not the main risk on these numbers.");
  if (be !== null && be < 0.05) out.push("A rate move of under 5% erases the profit. Price in a buffer, pay more of the order up front at a rate you accept, or ask a bank or payment provider for a forward quote.");
  if (o.revenueHome < o.orderForeign * o.rate + o.otherHome) out.push("Expected revenue is below cost even at today's rate; this is not a currency problem.");
  out.push("Revenue is shown as typed; if it is itself in a third currency, its moves are not modelled here.");
  return out;
}
