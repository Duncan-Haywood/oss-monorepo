// Screen-print job arithmetic. One job = one design run on one garment type.
// "Screens" are colour passes: colours per location x locations. Every screen is
// burned once per job and every piece passes under every screen once, so press
// time scales with pieces x screens. Spoiled garments are bought and printed, so
// they sit in the cost of the pieces that ship.

const num = (v, fallback = NaN) => {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const usd = (n) => "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ceilCent = (n) => Math.ceil(n * 100 - 1e-9) / 100;

export function validate(input) {
  const v = {
    qty: Math.round(num(input.qty)), colors: Math.round(num(input.colors)), locations: Math.round(num(input.locations, 1)),
    garmentCost: num(input.garmentCost), spoilPct: num(input.spoilPct, 0) / 100, screenCost: num(input.screenCost, 0),
    setupMinPerScreen: num(input.setupMinPerScreen, 0), jobSetupMin: num(input.jobSetupMin, 0), impressionsPerHour: num(input.impressionsPerHour),
    laborRate: num(input.laborRate, 0), overheadRate: num(input.overheadRate, 0), inkPerImpression: num(input.inkPerImpression, 0),
    marginPct: num(input.marginPct) / 100, screenFeeCharged: num(input.screenFeeCharged, 0), yourPrice: num(input.yourPrice, 0),
  };
  if (!(v.qty >= 1 && v.qty <= 100000)) return { error: "Enter how many pieces the customer ordered (1–100,000)." };
  if (!(v.colors >= 1 && v.colors <= 12)) return { error: "Enter colours per print location (1–12)." };
  if (!(v.locations >= 1 && v.locations <= 8)) return { error: "Enter print locations (1–8)." };
  if (!(v.garmentCost >= 0)) return { error: "Enter the blank garment cost each (0 or more)." };
  if (!(v.spoilPct >= 0 && v.spoilPct < 0.5)) return { error: "Spoilage should be 0–49%." };
  if (!(v.impressionsPerHour > 0)) return { error: "Enter press speed in impressions per hour (more than 0)." };
  if (!(v.marginPct >= 0 && v.marginPct < 0.95)) return { error: "Target margin should be 0–94%." };
  for (const k of ["screenCost", "setupMinPerScreen", "jobSetupMin", "laborRate", "overheadRate", "inkPerImpression", "screenFeeCharged", "yourPrice"]) {
    if (!(v[k] >= 0)) return { error: "Costs and fees cannot be negative." };
  }
  return v;
}

// Cost of one job at quantity `qty` with the other inputs held fixed.
export function jobCost(v, qty) {
  const screens = v.colors * v.locations;
  const pieces = Math.ceil(qty / (1 - v.spoilPct) - 1e-9);
  const impressions = pieces * screens;
  const setupHours = (screens * v.setupMinPerScreen + v.jobSetupMin) / 60;
  const printHours = impressions / v.impressionsPerHour;
  const hours = setupHours + printHours;
  const parts = {
    garments: pieces * v.garmentCost,
    screens: screens * v.screenCost,
    ink: impressions * v.inkPerImpression,
    labor: hours * v.laborRate,
    overhead: hours * v.overheadRate,
  };
  const total = parts.garments + parts.screens + parts.ink + parts.labor + parts.overhead;
  return { qty, screens, pieces, impressions, setupHours, printHours, hours, parts, total };
}

// Price per shipped piece that earns `marginPct` of total revenue, after the
// screen fees the customer pays on top.
export function unitPrice(v, qty) {
  const c = jobCost(v, qty);
  const screenFees = c.screens * v.screenFeeCharged;
  const revenue = c.total / (1 - v.marginPct);
  return { cost: c, screenFees, revenue, unit: (revenue - screenFees) / qty };
}

function profitAt(v, qty, price) {
  const c = jobCost(v, qty);
  const revenue = qty * price + c.screens * v.screenFeeCharged;
  return { revenue, profit: revenue - c.total, margin: revenue > 0 ? (revenue - c.total) / revenue : 0 };
}

// Smallest order that is not a loss at `price` per piece, or null within the cap.
export function breakEvenQty(v, price, cap = 20000) {
  if (profitAt(v, cap, price).profit < 0) return null;
  let lo = 1, hi = cap;
  // Profit is not strictly monotone (spoilage rounding), so settle on a scan from the bisected point.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (profitAt(v, mid, price).profit >= 0) hi = mid; else lo = mid + 1;
  }
  let q = lo;
  while (q > 1 && profitAt(v, q - 1, price).profit >= 0) q--;
  return q;
}

export const LADDER = [12, 24, 48, 96, 144, 288, 576, 1000];

export function plan(input) {
  const v = validate(input);
  if (v.error) return v;
  const base = unitPrice(v, v.qty);
  const c = base.cost;
  const unitCost = c.total / v.qty;
  const ladder = [...new Set([...LADDER, v.qty])].sort((a, b) => a - b).map((q) => {
    const u = unitPrice(v, q);
    return { qty: q, unit: ceilCent(u.unit), cost: u.cost.total / q, isOrder: q === v.qty };
  });
  const out = {
    input: v, cost: c, unitCost, unit: ceilCent(base.unit), revenue: base.revenue, screenFees: base.screenFees,
    profit: base.revenue - c.total, ladder, advice: [],
  };
  const setupShare = (c.parts.screens + (c.setupHours * (v.laborRate + v.overheadRate))) / c.total;
  out.setupShare = setupShare;
  if (setupShare > 0.3) out.advice.push(`Setup (screens plus setup time) is ${(setupShare * 100).toFixed(0)}% of this job's cost. Charge a screen fee or set a minimum order; the price ladder shows where the per-piece price flattens.`);
  if (c.parts.garments / c.total > 0.6) out.advice.push(`Blank garments are ${(c.parts.garments / c.total * 100).toFixed(0)}% of cost, so supplier price moves your quote more than press speed does.`);
  if (v.yourPrice > 0) {
    const p = profitAt(v, v.qty, v.yourPrice);
    out.yours = { price: v.yourPrice, ...p, breakEven: breakEvenQty(v, v.yourPrice) };
    out.advice.push(p.profit >= 0
      ? `At ${usd(v.yourPrice)} each you keep ${usd(p.profit)} (${(p.margin * 100).toFixed(1)}% margin) on this order.`
      : `At ${usd(v.yourPrice)} each this order loses ${usd(-p.profit)}. You need ${usd(out.unit)} each to hit your ${(v.marginPct * 100).toFixed(0)}% margin.`);
    out.advice.push(out.yours.breakEven
      ? `At ${usd(v.yourPrice)} each, orders under ${out.yours.breakEven} pieces lose money.`
      : `At ${usd(v.yourPrice)} each no order size up to 20,000 pieces breaks even.`);
  }
  return out;
}

export function sampleInput() {
  return {
    qty: 48, colors: 2, locations: 1, garmentCost: 3.5, spoilPct: 3, screenCost: 18, setupMinPerScreen: 10, jobSetupMin: 15,
    impressionsPerHour: 150, laborRate: 22, overheadRate: 18, inkPerImpression: 0.04, marginPct: 35, screenFeeCharged: 20, yourPrice: 9,
  };
}

export function toCsv(r) {
  const rows = [["quantity", "price_each", "your_cost_each"]];
  for (const l of r.ladder) rows.push([l.qty, l.unit.toFixed(2), l.cost.toFixed(2)]);
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
