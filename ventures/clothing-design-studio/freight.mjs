/**
 * Freight for a clothing order: how many cartons, how much they weigh and fill,
 * what sea (LCL or a full container), air and express each cost per piece, and
 * whether the days saved by air are worth the extra money.
 *
 * Carriers charge the larger of actual weight and volume weight, so a carton of
 * folded hoodies (light, bulky) is billed on size, not on the scale. The rates
 * are typed by the user from a forwarder's quote; nothing here is a price list.
 *
 *  - packCarton: pieces that fit a carton (grid packing, the 6 orientations)
 *  - cartons: carton count, gross weight and volume for an order
 *  - quoteModes: cost, per piece and days for each mode
 *  - airVsSea: the premium for air and the weekly profit that earns it back
 *
 * Volume-weight divisors are the usual conventions (air 6000 cm3 per kg, i.e.
 * 167 kg per cbm; express 5000); a forwarder's quote overrides them. Not
 * logistics, customs or legal advice.
 */

function pos(name, v) {
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be a number above 0.`);
}
function nonneg(name, v) {
  if (!Number.isFinite(v) || v < 0) throw new Error(`${name} must be 0 or more.`);
}

/** Pieces that fit one carton. piece/carton = [l, w, h] in cm (inside the carton).
 *  Tries all six orientations of the folded piece; returns the best count. */
export function packCarton(piece, carton) {
  piece.forEach((v, i) => pos(`piece side ${i + 1}`, v));
  carton.forEach((v, i) => pos(`carton side ${i + 1}`, v));
  const [a, b, c] = piece;
  const perms = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
  let best = 0, bestO = null;
  for (const p of perms) {
    const n = Math.floor(carton[0] / p[0] + 1e-9) * Math.floor(carton[1] / p[1] + 1e-9) * Math.floor(carton[2] / p[2] + 1e-9);
    if (n > best) { best = n; bestO = p; }
  }
  return { perCarton: best, orientation: bestO };
}

/** Cartons, gross weight (kg) and volume (cbm) for qty pieces. A part-full last
 *  carton is still a whole carton. cartonTareKg is the empty carton's weight. */
export function cartons({ qty, perCarton, pieceKg, carton, cartonTareKg = 0 }) {
  pos("quantity", qty); pos("pieces per carton", perCarton); pos("piece weight", pieceKg);
  nonneg("carton weight", cartonTareKg);
  const n = Math.ceil(qty / perCarton);
  const grossKg = qty * pieceKg + n * cartonTareKg;
  const cbm = carton ? n * carton[0] * carton[1] * carton[2] / 1e6 : null;
  return { cartons: n, grossKg, cbm, lastCarton: qty - (n - 1) * perCarton };
}

const r2 = x => Math.round(x * 100) / 100;

/**
 * Cost of each mode. rates (all typed from a quote; leave a mode out to skip it):
 *   sea:     { perCbm, minCbm=1, perShipment=0, days }   LCL: pay per cbm or per tonne, whichever is more
 *            { perTonne } optional; sea chargeable = max(cbm, tonnes) (the "W/M" rule)
 *   fcl:     { container: "20"|"40"|"40hc" or {cbm}, perContainer, perShipment=0, days, fill=0.85 }
 *   air:     { perKg, perShipment=0, days, divisor=6000 }
 *   express: { perKg, perShipment=0, days, divisor=5000 }
 * Returns the modes sorted by cost per piece.
 */
export function quoteModes({ qty, grossKg, cbm, rates }) {
  pos("quantity", qty); pos("gross weight", grossKg); pos("volume", cbm);
  const out = [];
  const tonnes = grossKg / 1000;
  if (rates.sea) {
    const s = rates.sea; pos("sea rate per cbm", s.perCbm);
    const billable = Math.max(cbm, s.perTonne ? tonnes : 0, s.minCbm ?? 1);
    const rate = s.perTonne && tonnes > cbm ? s.perTonne : s.perCbm;
    const cost = billable * rate + (s.perShipment ?? 0);
    out.push({ mode: "sea LCL", cost: r2(cost), perPiece: r2(cost / qty), days: s.days ?? null, basis: `${r2(billable)} ${s.perTonne && tonnes > cbm ? "tonnes (weight)" : "cbm"}` });
  }
  if (rates.fcl) {
    const f = rates.fcl;
    const size = typeof f.container === "object" ? f.container.cbm : { "20": 33, "40": 67, "40hc": 76 }[f.container];
    if (!size) throw new Error("Container must be 20, 40 or 40hc, or give its cbm.");
    pos("container rate", f.perContainer);
    const usable = size * (f.fill ?? 0.85);
    const n = Math.ceil(cbm / usable - 1e-9);
    const cost = n * f.perContainer + (f.perShipment ?? 0);
    out.push({ mode: `sea ${n} x ${f.container}`, cost: r2(cost), perPiece: r2(cost / qty), days: f.days ?? null, basis: `${r2(cbm)} cbm in ${n} container${n > 1 ? "s" : ""} (${r2(usable)} cbm usable each)`, fullness: r2(cbm / (n * usable)) });
  }
  for (const [key, label, div] of [["air", "air", 6000], ["express", "express courier", 5000]]) {
    const a = rates[key]; if (!a) continue;
    pos(`${key} rate per kg`, a.perKg);
    const d = a.divisor ?? div;
    const volKg = cbm * 1e6 / d;
    const billable = Math.max(grossKg, volKg);
    const cost = billable * a.perKg + (a.perShipment ?? 0);
    out.push({ mode: label, cost: r2(cost), perPiece: r2(cost / qty), days: a.days ?? null, basis: `${r2(billable)} kg billed (${volKg > grossKg ? "volume" : "actual"} weight; scale ${r2(grossKg)}, volume ${r2(volKg)})` });
  }
  return out.sort((x, y) => x.perPiece - y.perPiece);
}

/** Is air worth it? premium = extra freight (cost of the faster mode minus the
 *  slower). If the line sells profitPerWeek (profit/week while on the shelf),
 *  each week earlier is worth that much, so air pays when weeksSaved *
 *  profitPerWeek > premium. Also the weeks saved needed to break even. */
export function airVsSea(slow, fast, profitPerWeek = 0) {
  if (slow.days == null || fast.days == null) throw new Error("Both modes need a transit time in days.");
  const premium = r2(fast.cost - slow.cost);
  const weeksSaved = (slow.days - fast.days) / 7;
  const value = r2(weeksSaved * profitPerWeek);
  const breakEvenProfitPerWeek = weeksSaved > 0 ? r2(premium / weeksSaved) : null;
  return { premium, daysSaved: slow.days - fast.days, weeksSaved: r2(weeksSaved), valueOfTimeSaved: value, worthIt: weeksSaved > 0 && value > premium, breakEvenProfitPerWeek };
}
