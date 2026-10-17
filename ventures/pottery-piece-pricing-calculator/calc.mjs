// Pottery piece pricing calculator: pure functions, no dependencies, nothing leaves the browser.
// A "piece" is one pot taken from clay to a sellable glazed item. Every piece pays for its clay and glaze, its share of
// a bisque firing and a glaze firing (shared across the pieces in the kiln), your hours, and its share of studio rent.
// Pieces that crack or glaze badly are lost after all of that money and time is spent, so cost is stated per SELLABLE piece.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

export const DEFAULTS = {
  clayLb: 2, clayPerLb: 0.9, glazePerPiece: 0.8,
  bisqueKwh: 60, glazeKwh: 85, kwhPrice: 0.16, wearPerFiring: 12,
  piecesPerBisque: 40, piecesPerGlaze: 30,
  lossPct: 10,
  minutesMake: 25, minutesFinish: 12, minutesGlaze: 10, minutesHandling: 6, wage: 25,
  studioPerMonth: 350, piecesPerMonth: 120,
  retailPrice: 38, wholesalePct: 50, feePct: 10, targetMarginPct: 40,
};

const clampPct = (p) => Math.min(99, Math.max(0, p));
const safe = (x) => Math.max(0, x);

// Cost of one piece as made (before losses), by line.
export function perMadePiece(o) {
  const clay = safe(o.clayLb) * safe(o.clayPerLb);
  const glaze = safe(o.glazePerPiece);
  const bisque = (safe(o.bisqueKwh) * safe(o.kwhPrice) + safe(o.wearPerFiring)) / Math.max(1, o.piecesPerBisque);
  const glazeFire = (safe(o.glazeKwh) * safe(o.kwhPrice) + safe(o.wearPerFiring)) / Math.max(1, o.piecesPerGlaze);
  const minutes = safe(o.minutesMake) + safe(o.minutesFinish) + safe(o.minutesGlaze) + safe(o.minutesHandling);
  const labour = (minutes / 60) * safe(o.wage);
  const studio = safe(o.studioPerMonth) / Math.max(1, o.piecesPerMonth);
  return { clay, glaze, bisque, glazeFire, labour, studio, minutes, materialsAndKiln: clay + glaze + bisque + glazeFire };
}

// Cost of one SELLABLE piece: every made piece is paid for, only (1 - loss) of them can be sold.
export function costPerSellable(o) {
  const m = perMadePiece(o);
  const keep = 1 - clampPct(o.lossPct) / 100;
  const lines = {
    clay: m.clay / keep, glaze: m.glaze / keep, bisque: m.bisque / keep, glazeFire: m.glazeFire / keep,
    labour: m.labour / keep, studio: m.studio / keep,
  };
  const total = lines.clay + lines.glaze + lines.bisque + lines.glazeFire + lines.labour + lines.studio;
  return { ...lines, total, keep, hoursPerSellable: m.minutes / 60 / keep, outOfPocket: total - lines.labour };
}

// What one sold piece nets, retail or wholesale. Fees (marketplace, card, booth commission) come off the sale price;
// wholesale is entered as a % of retail and carries no fee here.
export function channel(o, kind) {
  const c = costPerSellable(o);
  const price = kind === "wholesale" ? safe(o.retailPrice) * (safe(o.wholesalePct) / 100) : safe(o.retailPrice);
  const fee = kind === "wholesale" ? 0 : price * (safe(o.feePct) / 100);
  const net = price - fee;
  const profit = net - c.total;
  return {
    kind, price, fee, net, profit,
    marginPct: price > 0 ? (profit / price) * 100 : null,
    perHour: c.hoursPerSellable > 0 ? (net - c.outOfPocket) / c.hoursPerSellable : null,
  };
}

// Retail price needed to hit the target margin after fees; wholesale price needed to hit it with no fee.
export function priceForMargin(o) {
  const c = costPerSellable(o);
  const m = safe(o.targetMarginPct) / 100;
  const f = safe(o.feePct) / 100;
  const retailDen = 1 - m - f;
  const wholesaleDen = 1 - m;
  return {
    retail: retailDen > 0 ? c.total / retailDen : null,
    wholesale: wholesaleDen > 0 ? c.total / wholesaleDen : null,
    breakEvenRetail: 1 - f > 0 ? c.total / (1 - f) : null,
  };
}

export function monthly(o) {
  const c = costPerSellable(o);
  const sellable = Math.max(0, o.piecesPerMonth) * c.keep;
  const r = channel(o, "retail");
  return {
    sellable, revenue: sellable * r.net, profit: sellable * r.profit, hours: sellable * c.hoursPerSellable,
    profitBeforeLabour: sellable * (r.net - c.outOfPocket),
  };
}

// Cracks, glaze defects, kiln accidents: the cost of a lost piece is the whole piece.
export function lossSensitivity(o, levels = [0, 5, 10, 20, 30]) {
  return levels.map((lossPct) => {
    const c = costPerSellable({ ...o, lossPct });
    const r = channel({ ...o, lossPct }, "retail");
    return { lossPct, cost: c.total, profit: r.profit, marginPct: r.marginPct };
  });
}

// Firing cost is shared by whatever is in the kiln. fill is a % of the load size you entered.
export function loadSensitivity(o, fills = [50, 70, 85, 100, 120]) {
  return fills.map((fill) => {
    const k = fill / 100;
    const p = { ...o, piecesPerBisque: o.piecesPerBisque * k, piecesPerGlaze: o.piecesPerGlaze * k };
    const m = perMadePiece(p);
    const c = costPerSellable(p);
    return { fill, kilnPerPiece: m.bisque + m.glazeFire, cost: c.total, profit: channel(p, "retail").profit };
  });
}

export function electricitySensitivity(o, mults = [0.8, 1, 1.5, 2]) {
  return mults.map((mult) => {
    const p = { ...o, kwhPrice: o.kwhPrice * mult };
    return { mult, kwhPrice: p.kwhPrice, cost: costPerSellable(p).total, profit: channel(p, "retail").profit };
  });
}
