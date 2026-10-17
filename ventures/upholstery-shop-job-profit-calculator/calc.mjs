// Upholstery shop season profit. Pure arithmetic over what a shop owner types in: three job types (dining chair seat, armchair, sofa) with a price,
// bench minutes and materials (fabric at cost, foam, batting, webbing) each, the upholsterer's loaded pay, the tools and the rent the season has to carry, and an
// optional trade-account line (designers who prepay a block of dining chair seat jobs at a discount). It turns that into profit per job type, profit per bench hour,
// the season result, the volume at which the shop breaks even, the
// price each service needs for a target margin, and how the season moves with volume against the bench hours a winter really has.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const SERVICES = [
  { id: "seat", label: "Dining chair seat" },
  { id: "chair", label: "Armchair or accent chair" },
  { id: "sofa", label: "Sofa or sectional" },
];

const NUMERIC = [
  "seatQty", "seatPrice", "seatMin", "seatMat", "chairQty", "chairPrice", "chairMin", "chairMat", "sofaQty", "sofaPrice", "sofaMin", "sofaMat",
  "benchRate", "burdenPct", "machineCost", "machineSeasons", "rentPerMonth", "seasonMonths", "otherFixed", "benchHrsPerWeek",
  "tradeAccounts", "tradeBlockPrice", "tradeSeatJobs", "targetMarginPct",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    seatQty: f("seatQty"), seatPrice: f("seatPrice", 85), seatMin: f("seatMin", 40), seatMat: f("seatMat", 14),
    chairQty: f("chairQty"), chairPrice: f("chairPrice", 650), chairMin: f("chairMin", 360), chairMat: f("chairMat", 90),
    sofaQty: f("sofaQty"), sofaPrice: f("sofaPrice", 1400), sofaMin: f("sofaMin", 720), sofaMat: f("sofaMat", 220),
    benchRate: f("benchRate", 28), burdenPct: f("burdenPct", 14), machineCost: f("machineCost"), machineSeasons: f("machineSeasons", 5),
    rentPerMonth: f("rentPerMonth"), seasonMonths: f("seasonMonths", 12), otherFixed: f("otherFixed"), benchHrsPerWeek: f("benchHrsPerWeek", 32),
    tradeAccounts: f("tradeAccounts"), tradeBlockPrice: f("tradeBlockPrice"), tradeSeatJobs: f("tradeSeatJobs", 10), targetMarginPct: f("targetMarginPct", 40),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of ["seatQty", "chairQty", "sofaQty", "tradeAccounts"]) if (!Number.isInteger(v[k])) return { error: `${k} must be a whole number.` };
  if (v.seatQty + v.chairQty + v.sofaQty + v.tradeAccounts < 1) return { error: "Enter how many jobs you expect to sell this season, or trade accounts." };
  if (v.machineSeasons < 1) return { error: "The tools must be spread over at least 1 season." };
  if (v.seasonMonths < 0.5 || v.seasonMonths > 12) return { error: "Season length should be between 0.5 and 12 months." };
  if (v.targetMarginPct >= 90) return { error: "Target margin must be below 90 percent of the price." };
  if (v.benchHrsPerWeek > 168) return { error: "A week has 168 hours: check the bench hours." };
  if (v.seatQty + v.chairQty + v.sofaQty > 200000) return { error: "That volume is far beyond a single shop: check the quantities." };
  return { v };
}

const burden = (v) => v.benchRate * (1 + v.burdenPct / 100);

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

// Trade accounts prepay a block of N seat jobs at a discount: the plan is priced against the seat jobs it gives away, not the jobs you sell.
export function tradeLine(v) {
  const seatJob = serviceLine(v, SERVICES[0]);
  const revenue = v.tradeAccounts * v.tradeBlockPrice;
  const cost = v.tradeAccounts * v.tradeSeatJobs * seatJob.cost;
  return {
    customers: v.tradeAccounts, revenue: round2(revenue), cost: round2(cost), contribution: round2(revenue - cost), hours: (v.tradeAccounts * v.tradeSeatJobs * v.seatMin) / 60,
    perJob: v.tradeSeatJobs > 0 ? round2(v.tradeBlockPrice / v.tradeSeatJobs) : 0,
    breakEvenJobs: seatJob.cost > 0 ? round1(v.tradeBlockPrice / seatJob.cost) : 0,
  };
}

export function fixedCosts(v) {
  const machine = v.machineCost / v.machineSeasons;
  const rent = v.rentPerMonth * v.seasonMonths;
  return { machine: round2(machine), rent: round2(rent), other: round2(v.otherFixed), total: round2(machine + rent + v.otherFixed) };
}

export function seasonResult(v, scale = 1) {
  const lines = SERVICES.map((s) => serviceLine({ ...v, [s.id + "Qty"]: Math.round(v[s.id + "Qty"] * scale) }, s));
  const trade = tradeLine({ ...v, tradeAccounts: Math.round(v.tradeAccounts * scale) });
  const fixed = fixedCosts(v);
  const revenue = lines.reduce((a, l) => a + l.revenue, 0) + trade.revenue;
  const contribution = lines.reduce((a, l) => a + l.contribution, 0) + trade.contribution;
  const hours = lines.reduce((a, l) => a + l.hours, 0) + trade.hours;
  const weeks = v.seasonMonths * 4.345;
  const capacity = weeks * v.benchHrsPerWeek;
  const profit = contribution - fixed.total;
  return {
    scale, lines, trade, fixed, revenue: round2(revenue), contribution: round2(contribution), profit: round2(profit), hours: round1(hours), capacity: round1(capacity),
    utilizationPct: capacity > 0 ? round1((hours / capacity) * 100) : 0, jobs: lines.reduce((a, l) => a + l.qty, 0),
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
  advice.push(`Season result: ${usd(res.revenue)} of revenue, ${usd(res.contribution)} after upholsterer labor and materials, and ${usd(res.profit)} after ${usd(res.fixed.total)} of tools, rent and other fixed cost (${usd(res.fixed.machine)} tools share, ${usd(res.fixed.rent)} rent).`);
  const active = res.lines.filter((l) => l.qty > 0);
  const best = [...res.lines].sort((a, b) => b.perBenchHour - a.perBenchHour)[0];
  const worst = [...res.lines].sort((a, b) => a.perBenchHour - b.perBenchHour)[0];
  advice.push(`Per bench hour (before your upholsterer's pay): ${res.lines.map((l) => `${l.label.toLowerCase()} ${usd(l.perBenchHour)}`).join(", ")}. ${best.id !== worst.id ? `The ${best.label.toLowerCase()} earns the most for the time on the bench and the ${worst.label.toLowerCase()} the least.` : ""}`);
  for (const l of active) {
    if (l.price < l.targetPrice) advice.push(`${l.label} at ${usd(l.price)} earns ${l.marginPct}% after labor and materials. For a ${v.targetMarginPct}% margin it would need ${usd(l.targetPrice)}.`);
  }
  if (res.profit < 0) {
    const perJob = res.jobs > 0 ? res.contribution / res.jobs : 0;
    advice.push(res.contribution > 0 && perJob > 0
      ? `You lose ${usd(-res.profit)} at this volume. Fixed costs of ${usd(res.fixed.total)} need about ${Math.ceil(res.fixed.total / res.contribution * res.jobs)} paid jobs at this mix to break even, against the ${res.jobs} you entered.`
      : `You lose ${usd(-res.profit)}: the services do not cover their own labor and materials, so more volume makes it worse. Raise a price first.`);
  } else if (res.contribution > 0) {
    const be = Math.ceil((res.fixed.total / res.contribution) * res.jobs);
    advice.push(`Break-even is about ${be} paid jobs at this mix; you plan ${res.jobs}, a cushion of ${Math.max(0, res.jobs - be)}.`);
  }
  if (v.tradeAccounts > 0) {
    advice.push(`Trade blocks: ${v.tradeAccounts} accounts at ${usd(v.tradeBlockPrice)} come to ${usd(res.trade.revenue)}. If each block is ${v.tradeSeatJobs} seat jobs, a block earns ${usd(res.trade.perJob)} a job against a seat job that costs you ${usd(res.lines[0].cost)}. ${v.tradeSeatJobs > res.trade.breakEvenJobs ? `It loses money beyond ${res.trade.breakEvenJobs} jobs in a block.` : `It stays profitable up to ${res.trade.breakEvenJobs} jobs in a block.`}`);
  }
  if (res.utilizationPct > 100) advice.push(`The plan needs ${res.hours} bench hours against ${res.capacity} available (${res.utilizationPct}%). You cannot do this volume without more bench hours or a second upholsterer.`);
  else advice.push(`The plan uses ${res.hours} of ${res.capacity} bench hours (${res.utilizationPct}%). Upholstery jobs sit in the shop for weeks and fall behind when one big piece runs over: an average near 70% usually means the queue is already too long for a quoted turnaround.`);
  const table = [0.5, 0.75, 1, 1.25, 1.5].map((s) => {
    const r = seasonResult(v, s);
    return { pct: Math.round(s * 100), jobs: r.jobs, revenue: r.revenue, profit: r.profit, hours: r.hours, utilizationPct: r.utilizationPct };
  });
  return { error: null, input: v, season: res, table, advice };
}

export function sampleInput() {
  return {
    seatQty: "150", seatPrice: "85", seatMin: "40", seatMat: "14", chairQty: "70", chairPrice: "650", chairMin: "360", chairMat: "90", sofaQty: "30", sofaPrice: "1400", sofaMin: "720", sofaMat: "220",
    benchRate: "28", burdenPct: "14", machineCost: "6000", machineSeasons: "10", rentPerMonth: "2200", seasonMonths: "12", otherFixed: "3000", benchHrsPerWeek: "32",
    tradeAccounts: "10", tradeBlockPrice: "800", tradeSeatJobs: "10", targetMarginPct: "40",
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
  const head = "volume_pct,jobs,revenue,profit,bench_hours,utilization_pct";
  return [head, ...result.table.map((r) => [r.pct, r.jobs, r.revenue, r.profit, r.hours, r.utilizationPct].join(","))].join("\n");
}
