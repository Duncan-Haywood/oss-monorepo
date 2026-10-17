// Ski and snowboard tune shop season profit. Pure arithmetic over what a shop owner types in: three tune services (wax, standard tune, full tune) with a
// price, bench minutes and materials each, the technician's loaded pay, the grinder and the rent the season has to carry, and an optional season-pass
// (unlimited wax) line. It turns that into profit per service, profit per bench hour, the season result, the volume at which the shop breaks even, the
// price each service needs for a target margin, and how the season moves with volume against the bench hours a winter really has.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const SERVICES = [
  { id: "wax", label: "Hot wax" },
  { id: "std", label: "Standard tune" },
  { id: "full", label: "Full tune" },
];

const NUMERIC = [
  "waxQty", "waxPrice", "waxMin", "waxMat", "stdQty", "stdPrice", "stdMin", "stdMat", "fullQty", "fullPrice", "fullMin", "fullMat",
  "techRate", "burdenPct", "machineCost", "machineSeasons", "rentPerMonth", "seasonMonths", "otherFixed", "benchHrsPerWeek",
  "passHolders", "passPrice", "passWaxVisits", "targetMarginPct",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    waxQty: f("waxQty"), waxPrice: f("waxPrice", 20), waxMin: f("waxMin", 12), waxMat: f("waxMat", 2.5),
    stdQty: f("stdQty"), stdPrice: f("stdPrice", 55), stdMin: f("stdMin", 30), stdMat: f("stdMat", 5),
    fullQty: f("fullQty"), fullPrice: f("fullPrice", 95), fullMin: f("fullMin", 55), fullMat: f("fullMat", 9),
    techRate: f("techRate", 20), burdenPct: f("burdenPct", 12), machineCost: f("machineCost"), machineSeasons: f("machineSeasons", 5),
    rentPerMonth: f("rentPerMonth"), seasonMonths: f("seasonMonths", 5), otherFixed: f("otherFixed"), benchHrsPerWeek: f("benchHrsPerWeek", 30),
    passHolders: f("passHolders"), passPrice: f("passPrice"), passWaxVisits: f("passWaxVisits", 6), targetMarginPct: f("targetMarginPct", 40),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of ["waxQty", "stdQty", "fullQty", "passHolders"]) if (!Number.isInteger(v[k])) return { error: `${k} must be a whole number.` };
  if (v.waxQty + v.stdQty + v.fullQty + v.passHolders < 1) return { error: "Enter how many tunes you expect to sell this season, or pass holders." };
  if (v.machineSeasons < 1) return { error: "The grinder must be spread over at least 1 season." };
  if (v.seasonMonths < 0.5 || v.seasonMonths > 12) return { error: "Season length should be between 0.5 and 12 months." };
  if (v.targetMarginPct >= 90) return { error: "Target margin must be below 90 percent of the price." };
  if (v.benchHrsPerWeek > 168) return { error: "A week has 168 hours: check the bench hours." };
  if (v.waxQty + v.stdQty + v.fullQty > 200000) return { error: "That volume is far beyond a single shop: check the quantities." };
  return { v };
}

const burden = (v) => v.techRate * (1 + v.burdenPct / 100);

export function serviceLine(v, s) {
  const qty = v[s.id + "Qty"], price = v[s.id + "Price"], min = v[s.id + "Min"], mat = v[s.id + "Mat"];
  const labor = (min / 60) * burden(v);
  const cost = labor + mat;
  const profit = price - cost;
  const benchHr = min > 0 ? (price - mat) / (min / 60) : 0;
  return {
    id: s.id, label: s.label, qty, price, min, mat, labor: round2(labor), cost: round2(cost), profit: round2(profit),
    marginPct: price > 0 ? round1((profit / price) * 100) : 0, perBenchHour: round2(benchHr),
    targetPrice: round2(cost / (1 - v.targetMarginPct / 100)), revenue: round2(qty * price), contribution: round2(qty * profit), hours: qty * min / 60,
  };
}

// Season-pass holders pay once and wax N times: the pass is priced against the wax visits it gives away, not the tunes you sell.
export function passLine(v) {
  const wax = serviceLine(v, SERVICES[0]);
  const revenue = v.passHolders * v.passPrice;
  const cost = v.passHolders * v.passWaxVisits * wax.cost;
  return {
    holders: v.passHolders, revenue: round2(revenue), cost: round2(cost), contribution: round2(revenue - cost), hours: (v.passHolders * v.passWaxVisits * v.waxMin) / 60,
    perVisit: v.passWaxVisits > 0 ? round2(v.passPrice / v.passWaxVisits) : 0,
    breakEvenVisits: wax.cost > 0 ? round1(v.passPrice / wax.cost) : 0,
  };
}

export function fixedCosts(v) {
  const machine = v.machineCost / v.machineSeasons;
  const rent = v.rentPerMonth * v.seasonMonths;
  return { machine: round2(machine), rent: round2(rent), other: round2(v.otherFixed), total: round2(machine + rent + v.otherFixed) };
}

export function seasonResult(v, scale = 1) {
  const lines = SERVICES.map((s) => serviceLine({ ...v, [s.id + "Qty"]: Math.round(v[s.id + "Qty"] * scale) }, s));
  const pass = passLine({ ...v, passHolders: Math.round(v.passHolders * scale) });
  const fixed = fixedCosts(v);
  const revenue = lines.reduce((a, l) => a + l.revenue, 0) + pass.revenue;
  const contribution = lines.reduce((a, l) => a + l.contribution, 0) + pass.contribution;
  const hours = lines.reduce((a, l) => a + l.hours, 0) + pass.hours;
  const weeks = v.seasonMonths * 4.345;
  const capacity = weeks * v.benchHrsPerWeek;
  const profit = contribution - fixed.total;
  return {
    scale, lines, pass, fixed, revenue: round2(revenue), contribution: round2(contribution), profit: round2(profit), hours: round1(hours), capacity: round1(capacity),
    utilizationPct: capacity > 0 ? round1((hours / capacity) * 100) : 0, tunes: lines.reduce((a, l) => a + l.qty, 0),
  };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const res = seasonResult(v);
  const advice = [];
  advice.push(`Season result: ${usd(res.revenue)} of revenue, ${usd(res.contribution)} after tech labor and materials, and ${usd(res.profit)} after ${usd(res.fixed.total)} of grinder, rent and other fixed cost (${usd(res.fixed.machine)} grinder share, ${usd(res.fixed.rent)} rent).`);
  const active = res.lines.filter((l) => l.qty > 0);
  const best = [...res.lines].sort((a, b) => b.perBenchHour - a.perBenchHour)[0];
  const worst = [...res.lines].sort((a, b) => a.perBenchHour - b.perBenchHour)[0];
  advice.push(`Per bench hour (before your tech's pay): ${res.lines.map((l) => `${l.label.toLowerCase()} ${usd(l.perBenchHour)}`).join(", ")}. ${best.id !== worst.id ? `The ${best.label.toLowerCase()} earns the most for the time on the bench and the ${worst.label.toLowerCase()} the least.` : ""}`);
  for (const l of active) {
    if (l.price < l.targetPrice) advice.push(`${l.label} at ${usd(l.price)} earns ${l.marginPct}% after labor and materials. For a ${v.targetMarginPct}% margin it would need ${usd(l.targetPrice)}.`);
  }
  if (res.profit < 0) {
    const perTune = res.tunes > 0 ? res.contribution / res.tunes : 0;
    advice.push(res.contribution > 0 && perTune > 0
      ? `You lose ${usd(-res.profit)} at this volume. Fixed costs of ${usd(res.fixed.total)} need about ${Math.ceil(res.fixed.total / res.contribution * res.tunes)} paid tunes at this mix to break even, against the ${res.tunes} you entered.`
      : `You lose ${usd(-res.profit)}: the services do not cover their own labor and materials, so more volume makes it worse. Raise a price first.`);
  } else if (res.contribution > 0) {
    const be = Math.ceil((res.fixed.total / res.contribution) * res.tunes);
    advice.push(`Break-even is about ${be} paid tunes at this mix; you plan ${res.tunes}, a cushion of ${Math.max(0, res.tunes - be)}.`);
  }
  if (v.passHolders > 0) {
    advice.push(`Season passes: ${v.passHolders} holders at ${usd(v.passPrice)} come to ${usd(res.pass.revenue)}. If each waxes ${v.passWaxVisits} times, a pass earns ${usd(res.pass.perVisit)} a visit against a wax that costs you ${usd(res.lines[0].cost)}. ${v.passWaxVisits > res.pass.breakEvenVisits ? `It loses money past ${res.pass.breakEvenVisits} visits.` : `It stays profitable up to ${res.pass.breakEvenVisits} visits.`}`);
  }
  if (res.utilizationPct > 100) advice.push(`The plan needs ${res.hours} bench hours against ${res.capacity} available (${res.utilizationPct}%). You cannot do this volume without more bench hours or a second tech.`);
  else advice.push(`The plan uses ${res.hours} of ${res.capacity} bench hours (${res.utilizationPct}%). Most shops jam on weekends: an average near 70% usually means peak weeks turn work away.`);
  const table = [0.5, 0.75, 1, 1.25, 1.5].map((s) => {
    const r = seasonResult(v, s);
    return { pct: Math.round(s * 100), tunes: r.tunes, revenue: r.revenue, profit: r.profit, hours: r.hours, utilizationPct: r.utilizationPct };
  });
  return { error: null, input: v, season: res, table, advice };
}

export function sampleInput() {
  return {
    waxQty: "500", waxPrice: "20", waxMin: "12", waxMat: "2.5", stdQty: "260", stdPrice: "55", stdMin: "30", stdMat: "5", fullQty: "60", fullPrice: "95", fullMin: "55", fullMat: "9",
    techRate: "20", burdenPct: "12", machineCost: "14000", machineSeasons: "6", rentPerMonth: "1800", seasonMonths: "5", otherFixed: "1500", benchHrsPerWeek: "40",
    passHolders: "25", passPrice: "129", passWaxVisits: "6", targetMarginPct: "40",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = [...NUMERIC];

export function encodeShare(input) {
  const p = new URLSearchParams();
  for (const k of SHARE_KEYS) if (input[k] !== undefined && input[k] !== "") p.set(k, String(input[k]).slice(0, 200));
  return p.toString();
}

export function decodeShare(text) {
  const p = new URLSearchParams(String(text ?? "").replace(/^#/, ""));
  const out = {};
  for (const k of SHARE_KEYS) if (p.has(k)) out[k] = p.get(k).slice(0, 200);
  return out;
}

export function toCsv(result) {
  const head = "volume_pct,tunes,revenue,profit,bench_hours,utilization_pct";
  return [head, ...result.table.map((r) => [r.pct, r.tunes, r.revenue, r.profit, r.hours, r.utilizationPct].join(","))].join("\n");
}
