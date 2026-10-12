// Scrap metal yard payout engine: what a load nets at each yard after the drive, which lots to
// split between two yards, what a price drop does, and whether stripping wire beats selling it
// insulated. Arithmetic on typed numbers only; no price feed, nothing fetched.

export const WEIGHT_TO_LB = { lb: 1, kg: 2.2046226218, ton: 2000 };
export const PRICE_PER_LB = { lb: 1, kg: 1 / 2.2046226218, ton: 1 / 2000, longton: 1 / 2240 };
export const MAX_LOTS = 8;

const num = (x) => typeof x === "number" && Number.isFinite(x);

export function validateInput(i) {
  const e = [];
  if (!i || typeof i !== "object") return ["Enter the numbers."];
  if (!Array.isArray(i.lots) || i.lots.length < 1 || i.lots.length > MAX_LOTS) e.push(`Enter between 1 and ${MAX_LOTS} lots.`);
  else {
    i.lots.forEach((l, n) => {
      const tag = `Lot ${n + 1}: `;
      if (!num(l.weight) || l.weight < 0 || l.weight > 1e7) e.push(tag + "weight must be between 0 and 10,000,000.");
      if (!(l.weightUnit in WEIGHT_TO_LB)) e.push(tag + "pick a weight unit.");
      if (!(l.priceUnit in PRICE_PER_LB)) e.push(tag + "pick a price unit.");
      for (const k of ["priceA", "priceB"]) if (!num(l[k]) || l[k] < 0 || l[k] > 1e6) e.push(tag + "prices must be between 0 and 1,000,000.");
    });
    if (!e.length && !i.lots.some((l) => l.weight > 0)) e.push("At least one lot needs a weight above zero.");
  }
  for (const y of ["yardA", "yardB"]) {
    const v = i[y];
    const tag = y === "yardA" ? "Yard A: " : "Yard B: ";
    if (!v || typeof v !== "object") { e.push(tag + "missing."); continue; }
    if (!num(v.oneWayMiles) || v.oneWayMiles < 0 || v.oneWayMiles > 2000) e.push(tag + "one-way miles must be between 0 and 2,000.");
    if (!num(v.minutes) || v.minutes < 0 || v.minutes > 2880) e.push(tag + "round-trip minutes must be between 0 and 2,880.");
    if (!num(v.fee) || v.fee < 0 || v.fee > 100000) e.push(tag + "visit fee must be between 0 and 100,000.");
    if (!num(v.deductPct) || v.deductPct < 0 || v.deductPct > 100) e.push(tag + "deduction must be between 0 and 100%.");
  }
  if (!num(i.perMile) || i.perMile < 0 || i.perMile > 50) e.push("Cost per mile must be between 0 and 50.");
  if (!num(i.hourly) || i.hourly < 0 || i.hourly > 10000) e.push("Value of your time must be between 0 and 10,000 an hour.");
  const s = i.strip;
  if (!s || typeof s !== "object") e.push("Wire stripping: missing.");
  else {
    if (!num(s.weightLb) || s.weightLb < 0 || s.weightLb > 1e7) e.push("Wire: weight must be between 0 and 10,000,000 lb.");
    if (!num(s.insulatedPrice) || s.insulatedPrice < 0 || s.insulatedPrice > 1e4) e.push("Wire: insulated price must be between 0 and 10,000 per lb.");
    if (!num(s.bareCopperPrice) || s.bareCopperPrice < 0 || s.bareCopperPrice > 1e4) e.push("Wire: bare copper price must be between 0 and 10,000 per lb.");
    if (!num(s.recoveryPct) || s.recoveryPct < 0 || s.recoveryPct > 100) e.push("Wire: recovery must be between 0 and 100%.");
    if (!num(s.minutesPerLb) || s.minutesPerLb < 0 || s.minutesPerLb > 600) e.push("Wire: minutes per lb must be between 0 and 600.");
  }
  return e;
}

export const lotLb = (l) => l.weight * WEIGHT_TO_LB[l.weightUnit];
export const lotPriceLb = (price, l) => price * PRICE_PER_LB[l.priceUnit];

function trip(y, i) {
  const miles = 2 * y.oneWayMiles;
  return { milesCost: miles * i.perMile, timeCost: (y.minutes / 60) * i.hourly, fee: y.fee, total: miles * i.perMile + (y.minutes / 60) * i.hourly + y.fee };
}

// Per-lot gross at each yard, after that yard's grading deduction, with prices scaled by `factor`.
function lotRows(i, factor) {
  return i.lots.map((l) => {
    const lb = lotLb(l);
    const a = lb * lotPriceLb(l.priceA, l) * factor * (1 - i.yardA.deductPct / 100);
    const b = lb * lotPriceLb(l.priceB, l) * factor * (1 - i.yardB.deductPct / 100);
    return { name: l.name || "", lb, grossA: a, grossB: b, best: a > b ? "A" : b > a ? "B" : "tie" };
  });
}

function options(i, factor) {
  const rows = lotRows(i, factor);
  const ta = trip(i.yardA, i), tb = trip(i.yardB, i);
  const gA = rows.reduce((s, r) => s + r.grossA, 0);
  const gB = rows.reduce((s, r) => s + r.grossB, 0);
  // Split: each lot goes where it pays more; a lot that ties stays at A. Both trips are paid.
  const toB = rows.filter((r) => r.grossB > r.grossA);
  const toA = rows.filter((r) => !(r.grossB > r.grossA));
  const gSplit = toA.reduce((s, r) => s + r.grossA, 0) + toB.reduce((s, r) => s + r.grossB, 0);
  const real = toA.some((r) => r.lb > 0) && toB.some((r) => r.lb > 0);
  const opts = [
    { key: "A", label: `All at ${i.yardA.name || "Yard A"}`, gross: gA, cost: ta.total, net: gA - ta.total },
    { key: "B", label: `All at ${i.yardB.name || "Yard B"}`, gross: gB, cost: tb.total, net: gB - tb.total },
  ];
  if (real) opts.push({ key: "split", label: "Split: each lot to the higher payer", gross: gSplit, cost: ta.total + tb.total, net: gSplit - ta.total - tb.total });
  const best = opts.reduce((m, o) => (o.net > m.net + 1e-9 ? o : m), opts[0]);
  return { rows, ta, tb, gA, gB, opts, best, splitLots: { toA: toA.map((r) => r.name), toB: toB.map((r) => r.name) } };
}

export function stripAnalysis(i) {
  const s = i.strip;
  const sellInsulated = s.weightLb * s.insulatedPrice;
  const bareLb = (s.weightLb * s.recoveryPct) / 100;
  const sellBare = bareLb * s.bareCopperPrice;
  const hours = (s.weightLb * s.minutesPerLb) / 60;
  const timeCost = hours * i.hourly;
  const gain = sellBare - sellInsulated - timeCost;
  const extraPerHour = hours > 0 ? (sellBare - sellInsulated) / hours : null;
  const needRecovery = s.bareCopperPrice > 0 ? ((s.insulatedPrice + (s.minutesPerLb / 60) * i.hourly) / s.bareCopperPrice) * 100 : null;
  return { sellInsulated, bareLb, sellBare, hours, timeCost, gain, extraPerHour, breakevenRecoveryPct: needRecovery, strips: gain > 0.005 };
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const o = options(input, 1);
  const net = (k) => o.opts.find((x) => x.key === k)?.net ?? null;
  const other = o.opts.filter((x) => x.key !== o.best.key).sort((a, b) => b.net - a.net)[0] || null;
  const totalLb = o.rows.reduce((s, r) => s + r.lb, 0);
  // Price factor the losing single yard would need to match the best single-yard result.
  const bestSingle = o.opts[0].net >= o.opts[1].net ? "A" : "B";
  const loser = bestSingle === "A" ? "B" : "A";
  const gLoser = loser === "A" ? o.gA : o.gB;
  const tLoser = loser === "A" ? o.ta.total : o.tb.total;
  const target = Math.max(o.opts[0].net, o.opts[1].net);
  const catchUpFactor = gLoser > 0 ? (target + tLoser) / gLoser : null;
  const sensitivity = [10, 20].map((d) => {
    const f = options(input, 1 - d / 100);
    return { change: -d, bestKey: f.best.key, bestLabel: f.best.label, net: f.best.net, netA: f.opts[0].net, netB: f.opts[1].net };
  });
  const notes = [];
  if (o.best.net < 0) notes.push(`This load does not cover the trip: the best option loses ${money(-o.best.net)} after fuel, time and fees. Hold it until there is more to haul.`);
  if (o.best.key === "split") {
    const extra = o.best.net - Math.max(o.opts[0].net, o.opts[1].net);
    notes.push(`Splitting beats the best single yard by ${money(extra)} after paying for both trips.`);
  } else if (o.opts.length === 3 && o.opts[2].net < Math.max(o.opts[0].net, o.opts[1].net)) {
    const gap = Math.max(o.opts[0].net, o.opts[1].net) - o.opts[2].net;
    notes.push(`Splitting the load would pay ${money(o.opts[2].gross - Math.max(o.gA, o.gB))} more in gross but costs a second trip, leaving it ${money(gap)} behind ${o.best.label}.`);
  }
  if (other && Math.abs(o.best.net - other.net) < 0.01 * Math.max(1, Math.abs(o.best.net))) notes.push("The top two options are within 1% of each other; pick the closer or faster one.");
  if (sensitivity[1].netA < 0 && sensitivity[1].netB < 0) notes.push("If prices fall 20% before you sell, this load loses money at either yard.");
  const strip = stripAnalysis(input);
  return {
    ok: true, input, rows: o.rows, totalLb, tripA: o.ta, tripB: o.tb, grossA: o.gA, grossB: o.gB, options: o.opts, best: o.best,
    runnerUp: other, splitLots: o.splitLots, netA: net("A"), netB: net("B"), netSplit: net("split"),
    catchUp: { yard: loser, factor: catchUpFactor, pctChange: catchUpFactor === null ? null : (catchUpFactor - 1) * 100 },
    netPerLb: totalLb > 0 ? o.best.net / totalLb : null, sensitivity, strip, notes,
  };
}

export function money(x) {
  const neg = Math.round(x) < 0;
  return (neg ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
}
export const cents = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
export const pct = (x) => (x * 100).toFixed(1) + "%";

export function sampleInput() {
  return {
    lots: [
      { name: "#2 copper tubing", weight: 85, weightUnit: "lb", priceA: 3.55, priceB: 3.7, priceUnit: "lb" },
      { name: "Clean aluminum", weight: 140, weightUnit: "lb", priceA: 0.52, priceB: 0.48, priceUnit: "lb" },
      { name: "Yellow brass", weight: 60, weightUnit: "lb", priceA: 1.95, priceB: 2.05, priceUnit: "lb" },
      { name: "Stainless 304", weight: 120, weightUnit: "lb", priceA: 0.62, priceB: 0.55, priceUnit: "lb" },
      { name: "Heavy steel", weight: 0.9, weightUnit: "ton", priceA: 210, priceB: 190, priceUnit: "ton" },
    ],
    yardA: { name: "Yard A", oneWayMiles: 9, minutes: 55, fee: 0, deductPct: 0 },
    yardB: { name: "Yard B", oneWayMiles: 22, minutes: 85, fee: 5, deductPct: 0 },
    perMile: 0.7, hourly: 25,
    strip: { weightLb: 60, insulatedPrice: 1.1, bareCopperPrice: 3.55, recoveryPct: 55, minutesPerLb: 1.5 },
  };
}

export function resultText(r) {
  const L = [
    `Scrap load check: ${r.totalLb.toFixed(0)} lb across ${r.input.lots.length} lots`,
    ...r.options.map((o) => `${o.label}: gross ${cents(o.gross)}, trip and fees ${cents(o.cost)}, net ${cents(o.net)}`),
    `Best: ${r.best.label}, net ${cents(r.best.net)}${r.netPerLb === null ? "" : ` (${cents(r.netPerLb)} per lb)`}`,
    ...(r.catchUp.factor === null ? [] : [`${r.catchUp.yard === "A" ? (r.input.yardA.name || "Yard A") : (r.input.yardB.name || "Yard B")} would need to pay ${Math.abs(r.catchUp.pctChange).toFixed(1)}% ${r.catchUp.pctChange >= 0 ? "more" : "less"} across the board to match the best single yard`]),
    ...r.sensitivity.map((s) => `Prices ${s.change}%: best is ${s.bestLabel}, net ${cents(s.net)}`),
    `Wire: stripping ${r.strip.strips ? "beats" : "does not beat"} selling insulated by ${cents(Math.abs(r.strip.gain))} after your time`,
    "Arithmetic on the prices entered, not tax, legal or financial advice. Prices change daily; use your yard's board.",
  ];
  return L.join("\n");
}

export function resultCsv(r) {
  const rows = [
    ["total_lb", r.totalLb], ["net_all_a", r.netA], ["net_all_b", r.netB], ["net_split", r.netSplit === null ? "" : r.netSplit], ["best_option", r.best.key],
    ["best_net", r.best.net], ["trip_cost_a", r.tripA.total], ["trip_cost_b", r.tripB.total],
    ["wire_sell_insulated", r.strip.sellInsulated], ["wire_sell_stripped", r.strip.sellBare], ["wire_strip_time_cost", r.strip.timeCost], ["wire_strip_gain", r.strip.gain],
    ...r.sensitivity.map((s) => [`best_net_at_${-s.change}pct_lower_prices`, s.net]),
  ];
  const lots = r.rows.map((x) => `"${String(x.name).replace(/"/g, '""')}",${x.lb.toFixed(2)},${x.grossA.toFixed(2)},${x.grossB.toFixed(2)},${x.best}`);
  return ["item,amount", ...rows.map(([k, v]) => `${k},${typeof v === "number" ? Math.round(v * 10000) / 10000 : v}`), "", "lot,pounds,gross_a,gross_b,pays_more", ...lots].join("\n");
}

const APP = "scrap-metal-yard-payout-calculator";
export function serializeState(input) { return JSON.stringify({ app: APP, version: 1, input }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved scrap load." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input };
}
