/**
 * Set / bundle pricing for a small clothing brand (second interview: full
 * wardrobe sets, started small and limited). One price for several pieces:
 * what the set earns, and whether the discount pays for itself.
 *
 * Model (arithmetic on typed numbers, not a forecast). One order earns
 *   contribution(price, cost, ship) = price x (1 - fee%) - feeFixed - cost - ship.
 * Three kinds of order are compared:
 *   - the set at the bundle price (cB),
 *   - the same pieces bought together at list price (cFull): a bundle buyer who
 *     would have paid full price anyway only costs you the discount,
 *   - one average piece at list price (c1): a bundle buyer who would only have
 *     bought one piece is where the extra profit comes from.
 * If a share f of bundle orders would have been single-piece orders and the
 * rest full-price sets, profit change per bundle order = f(cB - c1) + (1-f)(cB - cFull).
 * Setting that to zero gives the break-even share exactly,
 *   f* = (cFull - cB) / (cFull - c1),
 * and the biggest discount a given f pays for is solved the same way (the
 * bundle price is linear in cB), not searched. Returns, ad spend and demand
 * lifted beyond the shift in basket size are not modelled; f is your guess
 * until a test with and without the set tells you.
 */
const r2 = v => Math.round(v * 100) / 100;
const r1 = v => Math.round(v * 10) / 10;
const num = (v, name, min, max) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return v;
};

function check(p) {
  if (!Array.isArray(p.items) || p.items.length < 2 || p.items.length > 50) throw new Error("A set needs 2 to 50 pieces.");
  const items = p.items.map((it, i) => ({
    name: String(it?.name ?? `Piece ${i + 1}`).slice(0, 60),
    price: num(it?.price, `price of piece ${i + 1}`, 0.01, 1e6),
    landed: num(it?.landed, `landed cost of piece ${i + 1}`, 0, 1e6),
  }));
  return {
    items,
    ship: num(p.ship ?? 0, "shipping", 0, 1e6),
    shipBundle: num(p.shipBundle ?? p.ship ?? 0, "shipping for the set", 0, 1e6),
    feePct: num(p.feePct ?? 0, "payment fee %", 0, 50),
    feeFixed: num(p.feeFixed ?? 0, "fixed fee", 0, 1e3),
  };
}
const earn = (q, price, cost, ship) => price * (1 - q.feePct / 100) - q.feeFixed - cost - ship;

/** Pass `bundlePrice` or `discountPct` (off the list total). */
export function bundlePlan(params, opts = {}) { return plan(params, opts).out; }

function plan(params, { bundlePrice, discountPct } = {}) {
  const q = check(params);
  const list = q.items.reduce((s, it) => s + it.price, 0);
  const cost = q.items.reduce((s, it) => s + it.landed, 0);
  let price;
  if (bundlePrice !== undefined) price = num(bundlePrice, "bundle price", 0.01, 1e7);
  else price = list * (1 - num(discountPct ?? 0, "discount %", 0, 99.9) / 100);
  const n = q.items.length;
  const cB = earn(q, price, cost, q.shipBundle);
  const cFull = earn(q, list, cost, q.shipBundle);
  const c1 = earn(q, list / n, cost / n, q.ship);
  const notes = [];
  let breakEvenSinglePct = null;
  if (price > list) notes.push("The set costs more than its pieces added up; shoppers will buy the pieces alone.");
  if (cB <= 0) notes.push("At this price the set loses money on every order.");
  if (c1 <= 0) notes.push("A single piece at list price already loses money, so a set cannot fix it.");
  else if (cFull <= c1) notes.push("A full-price set earns no more than one piece, so shifting buyers into sets cannot add profit.");
  else if (cB > 0) {
    breakEvenSinglePct = cB >= cFull ? 0 : r1(((cFull - cB) / (cFull - c1)) * 100);
    if (breakEvenSinglePct > 100) { notes.push("Even if every bundle buyer would have bought one piece, the set earns less than that piece."); }
    else if (breakEvenSinglePct > 60) notes.push(`More than ${Math.floor(breakEvenSinglePct)}% of set buyers must be people who would otherwise have bought one piece; that is a hard bar.`);
  }
  const out = {
    listTotal: r2(list), bundlePrice: r2(price), discountPct: r1((1 - price / list) * 100), costTotal: r2(cost),
    contributionSet: r2(cB), contributionFullPrice: r2(cFull), contributionSingle: r2(c1),
    marginPct: r1((cB / price) * 100), breakEvenSinglePct, notes,
  };
  return { out, cB, cFull, c1 };
}

/** Profit change per set order if `singleSharePct` of set buyers would have bought one piece. */
export function setValue(params, opts, singleSharePct) {
  const f = num(singleSharePct, "share of set buyers who would have bought one piece %", 0, 100) / 100;
  const { out: r, cB, cFull, c1 } = plan(params, opts);
  const change = f * (cB - c1) + (1 - f) * (cB - cFull);
  return { ...r, changePerSetOrder: r2(change), pays: change >= -1e-9 };
}

/** Largest discount % off the list total that a given single-piece share still pays for. */
export function maxDiscountPct(params, singleSharePct) {
  const q = check(params);
  const f = num(singleSharePct, "share %", 0, 100) / 100;
  const list = q.items.reduce((s, it) => s + it.price, 0), cost = q.items.reduce((s, it) => s + it.landed, 0), n = q.items.length;
  const cFull = earn(q, list, cost, q.shipBundle), c1 = earn(q, list / n, cost / n, q.ship);
  const cBmin = f * c1 + (1 - f) * cFull; // contribution the set must keep
  // earn(price) = price(1-fee) - feeFixed - cost - shipBundle = cBmin
  const price = (cBmin + q.feeFixed + cost + q.shipBundle) / (1 - q.feePct / 100);
  return Math.max(0, r1((1 - price / list) * 100));
}

/** The set at 0 to 40% off in steps of 5, with the break-even share each needs. */
export function ladder(params) {
  return [0, 5, 10, 15, 20, 25, 30, 35, 40].map(d => {
    const r = bundlePlan(params, { discountPct: d });
    return { discountPct: d, bundlePrice: r.bundlePrice, contribution: r.contributionSet, marginPct: r.marginPct, breakEvenSinglePct: r.breakEvenSinglePct };
  });
}
