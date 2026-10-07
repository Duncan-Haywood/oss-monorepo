// Pure functions for the ad slot sell-through planner. No DOM, no network.

export const DEFAULT_ELASTICITY = -1.2;
export const ELASTICITY_RANGE = [-3, -0.3];
// A sold-out run only tells you demand was at least capacity. Assume a modest
// excess so the model can say "raise" without pretending to know how far.
export const SOLD_OUT_DEMAND = 1.15;
export const DEFAULT_CURVE = [
  { days: 28, share: 0.35 },
  { days: 14, share: 0.6 },
  { days: 7, share: 0.8 },
  { days: 3, share: 0.92 },
  { days: 0, share: 1 },
];

export function num(v) {
  if (typeof v === "string") v = v.replace(/[$,\s]/g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function money(n) {
  if (!Number.isFinite(n)) return "—";
  return (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US");
}

export function percent(x) {
  return Number.isFinite(x) ? `${Math.round(x * 100)}%` : "—";
}

// Paste from a spreadsheet: label, slots offered, slots sold, price per slot.
// Tab, comma or semicolon separated. A header row is skipped.
export function parseHistory(text) {
  const rows = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split(/\t|;|,(?!\d{3}(?:\D|$))/).map((s) => s.replace(/^"|"$/g, "").trim());
    if (parts.length < 4) { errors.push(`Line ${i + 1}: need label, slots offered, slots sold, price.`); return; }
    const [label, offeredRaw, soldRaw, priceRaw] = parts;
    const offered = num(offeredRaw), sold = num(soldRaw), price = num(priceRaw);
    if (i === 0 && [offered, sold, price].every(Number.isNaN)) return; // header
    if (!(offered > 0) || !Number.isInteger(offered)) { errors.push(`Line ${i + 1}: slots offered must be a whole number above 0.`); return; }
    if (!(sold >= 0) || sold > offered) { errors.push(`Line ${i + 1}: slots sold must be between 0 and slots offered.`); return; }
    if (!(price >= 0)) { errors.push(`Line ${i + 1}: price must be zero or more.`); return; }
    rows.push({ label: label || `Run ${rows.length + 1}`, offered, sold, price });
  });
  return { rows, errors };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export function summarize(rows) {
  if (!rows.length) return null;
  const offered = sum(rows.map((r) => r.offered));
  const sold = sum(rows.map((r) => r.sold));
  const revenue = sum(rows.map((r) => r.sold * r.price));
  const capacity = sum(rows.map((r) => r.offered * r.price));
  const perRow = rows.map((r) => ({ ...r, rate: r.sold / r.offered, revenue: r.sold * r.price }));
  const n = rows.length;
  const k = Math.min(4, Math.floor(n / 2));
  let recent = null, prior = null, trend = null;
  if (k >= 2) {
    const rate = (xs) => sum(xs.map((r) => r.sold)) / sum(xs.map((r) => r.offered));
    recent = rate(rows.slice(-k));
    prior = rate(rows.slice(-2 * k, -k));
    trend = recent - prior;
  }
  return {
    runs: n, offered, sold, rate: sold / offered, revenue, capacity, unsold: capacity - revenue,
    avgPrice: sold ? revenue / sold : 0, soldOutRuns: rows.filter((r) => r.sold === r.offered).length,
    emptyRuns: rows.filter((r) => r.sold === 0).length, perRow, recent, prior, trend,
  };
}

// Fit rate ~ price^e on the runs that were neither sold out nor empty
// (both are censored: they bound demand, they do not measure it).
export function fitElasticity(rows) {
  const usable = rows.filter((r) => r.price > 0 && r.sold > 0 && r.sold < r.offered);
  const prices = new Set(usable.map((r) => r.price));
  const fallback = (why) => ({ e: DEFAULT_ELASTICITY, source: "assumed", why, used: usable.length });
  if (usable.length < 4 || prices.size < 2) return fallback("Needs at least 4 runs that neither sold out nor sold nothing, at 2 or more different prices.");
  const xs = usable.map((r) => Math.log(r.price));
  const ys = usable.map((r) => Math.log(r.sold / r.offered));
  const mx = sum(xs) / xs.length, my = sum(ys) / ys.length;
  const sxx = sum(xs.map((x) => (x - mx) ** 2));
  if (sxx < 1e-9) return fallback("Prices are too close together to measure a response.");
  const b = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sxx;
  if (!(b < 0)) return fallback("Higher prices did not sell fewer slots in your history; that is more likely timing or audience than price, so the default response is used.");
  const e = Math.min(ELASTICITY_RANGE[1], Math.max(ELASTICITY_RANGE[0], b));
  return { e, source: "fitted", why: `Fitted from ${usable.length} runs, clamped to ${ELASTICITY_RANGE[0]}..${ELASTICITY_RANGE[1]}.`, used: usable.length };
}

// Expected sell-through at `price`, anchored at the current price and the
// recent observed rate. Capped at 1.
export function demandAt(price, anchorPrice, anchorRate, e) {
  if (!(price > 0) || !(anchorPrice > 0)) return 0;
  const base = anchorRate >= 0.999 ? SOLD_OUT_DEMAND : anchorRate;
  return Math.min(1, Math.max(0, base * Math.pow(price / anchorPrice, e)));
}

export function priceScenarios({ price, slots, anchorRate, e, runsPerMonth = 1 }) {
  const steps = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3];
  return steps.map((s) => {
    const p = price * (1 + s);
    const rate = demandAt(p, price, anchorRate, e);
    const soldSlots = slots * rate;
    return { change: s, price: p, rate, soldSlots, perRun: soldSlots * p, perMonth: soldSlots * p * runsPerMonth };
  });
}

// Revenue-maximising price on a fine grid, then limited to a move of at most
// `maxStep` so a single change stays inside what the fit can support.
export function recommend({ price, slots, anchorRate, e, maxStep = 0.25 }) {
  if (!(price > 0) || !(slots > 0)) return null;
  let best = { p: price, rev: -1 };
  for (let f = 0.5; f <= 2.0001; f += 0.01) {
    const p = price * f;
    const rev = slots * demandAt(p, price, anchorRate, e) * p;
    if (rev > best.rev + 1e-9) best = { p, rev };
  }
  const lo = price * (1 - maxStep), hi = price * (1 + maxStep);
  const p = Math.min(hi, Math.max(lo, best.p));
  const here = slots * demandAt(price, price, anchorRate, e) * price;
  const there = slots * demandAt(p, price, anchorRate, e) * p;
  const direction = Math.abs(p - price) < price * 0.015 ? "hold" : p > price ? "raise" : "lower";
  return { price: p, unconstrained: best.p, direction, perRunNow: here, perRunAfter: there, gain: there - here, rateAfter: demandAt(p, price, anchorRate, e) };
}

function curveShare(days, curve) {
  const pts = [...curve].sort((a, b) => b.days - a.days);
  if (days >= pts[0].days) return pts[0].share;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (days <= a.days && days >= b.days) {
      const t = (a.days - days) / (a.days - b.days || 1);
      return a.share + t * (b.share - a.share);
    }
  }
  return pts[pts.length - 1].share;
}

// Where will this run finish, given what is booked and how late bookings
// usually arrive? `curve` is the share of final bookings in by N days out.
export function pacing({ slots, soldNow, daysOut, curve = DEFAULT_CURVE, typicalFinalRate = null }) {
  if (!(slots > 0) || !(soldNow >= 0) || !(daysOut >= 0)) return null;
  const share = curveShare(daysOut, curve);
  const projected = share > 0.05 ? Math.min(slots, soldNow / share) : null;
  const expectedNow = typicalFinalRate === null ? null : typicalFinalRate * slots * share;
  let status = "unknown";
  if (expectedNow !== null) status = soldNow >= expectedNow + 0.5 ? "ahead" : soldNow <= expectedNow - 0.5 ? "behind" : "on pace";
  return { share, projected, projectedUnsold: projected === null ? null : slots - projected, expectedNow, status };
}

// Cash from filling the remaining slots at a floor price. An empty slot earns
// nothing, so the question is only how far below the rate card to go and
// what that tells the next buyer.
export function lastMinute({ unsold, price, floorPct, fillChance }) {
  if (!(unsold >= 0) || !(price > 0)) return null;
  const floor = price * Math.min(1, Math.max(0, floorPct));
  const chance = Math.min(1, Math.max(0, fillChance));
  return { floor, expected: unsold * floor * chance, ifFilled: unsold * floor, erosionPerSlot: price - floor };
}

// Multi-run packages trade a discount for committed revenue and earlier booking.
export function packages({ price, tiers }) {
  return tiers.filter((t) => t.runs > 0).map((t) => {
    const d = Math.min(0.9, Math.max(0, t.discount));
    const each = price * (1 - d);
    return { runs: t.runs, discount: d, each, committed: each * t.runs, vsList: (price - each) * t.runs };
  });
}

// One screen of findings, ordered by what is worth acting on first.
export function diagnose({ summary, fit, rec, pace }) {
  const out = [];
  if (!summary) return out;
  if (summary.rate >= 0.9) out.push({ level: "high", title: "You are close to sold out", text: `${percent(summary.rate)} of slots sold. Slots that always sell are underpriced or capacity-constrained; test a higher price or add a slot.` });
  else if (summary.rate < 0.5) out.push({ level: "high", title: "More than half your inventory goes unsold", text: `${percent(summary.rate)} sold. Before cutting price, check whether the problem is reach, audience fit, or too many slots per run.` });
  else if (summary.rate < 0.7) out.push({ level: "medium", title: "Sell-through is soft", text: `${percent(summary.rate)} sold across ${summary.runs} runs.` });
  if (summary.trend !== null && summary.trend <= -0.1) out.push({ level: "high", title: "Sell-through is falling", text: `Recent runs sold ${percent(summary.recent)} against ${percent(summary.prior)} before. Check lead time and renewals before touching price.` });
  if (summary.trend !== null && summary.trend >= 0.1) out.push({ level: "info", title: "Sell-through is rising", text: `Recent runs sold ${percent(summary.recent)} against ${percent(summary.prior)} before; room to test a higher price.` });
  if (summary.emptyRuns > 0) out.push({ level: "medium", title: `${summary.emptyRuns} run(s) sold nothing`, text: "Check whether they fell in a holiday week or were announced late." });
  if (rec && rec.direction !== "hold") out.push({ level: "info", title: `Model says ${rec.direction} the price`, text: `About ${money(rec.price)} per slot (${percent(rec.rateAfter)} sold) is worth ${money(rec.gain)} more per run than today, on ${fit.source === "fitted" ? "a response fitted to your history" : "an assumed price response"}.` });
  if (fit.source === "assumed") out.push({ level: "info", title: "Price response is assumed", text: fit.why });
  if (pace && pace.status === "behind") out.push({ level: "high", title: "This run is behind pace", text: `About ${pace.projectedUnsold === null ? "?" : pace.projectedUnsold.toFixed(1)} slots projected unsold. Reach out to past buyers now rather than discounting at the deadline.` });
  return out;
}
