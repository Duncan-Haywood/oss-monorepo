// Mushroom fruiting-room planner: per-block economics for N flushes, how many
// flushes to run, how many blocks a room can carry, the weekly harvest and
// cash timeline, and the contamination rate and price that break even.
// Pure functions; everything is the user's own numbers.

export const DEFAULTS = {
  blockCost: 3.2, handlingMin: 10, harvestMinPerLb: 3, wage: 18,
  incubationWeeks: 2, contaminationPct: 8,
  flushYields: "1.4, 0.8, 0.4, 0.2", firstFlushWeeks: 2, flushGapWeeks: 2, turnaroundWeeks: 1,
  pricePerLb: 9, sellThroughPct: 95, packCostPerLb: 0.4,
  slots: 200, startsPerWeek: 40, weeklyFixed: 150, weeks: 26,
};

function numOrNaN(v) { return typeof v === "number" ? v : parseFloat(String(v).trim()); }

export function parseInputs(raw = {}) {
  const errors = [];
  const src = { ...DEFAULTS, ...raw };
  const p = {};
  const need = (key, { min = 0, max = Infinity, int = false, label = key } = {}) => {
    const v = numOrNaN(src[key]);
    if (!Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) {
      errors.push(`${label} must be ${int ? "a whole number " : "a number "}${max < Infinity ? `from ${min} to ${max}` : `of at least ${min}`}.`);
      p[key] = NaN;
    } else p[key] = v;
  };
  need("blockCost", { label: "Cost per block" });
  need("handlingMin", { label: "Handling minutes per block" });
  need("harvestMinPerLb", { label: "Harvest minutes per lb" });
  need("wage", { label: "Hourly labor value" });
  need("incubationWeeks", { int: true, max: 12, label: "Incubation weeks" });
  need("contaminationPct", { max: 95, label: "Contamination %" });
  need("firstFlushWeeks", { min: 1, int: true, max: 12, label: "Weeks to first flush" });
  need("flushGapWeeks", { min: 1, int: true, max: 12, label: "Weeks between flushes" });
  need("turnaroundWeeks", { int: true, max: 8, label: "Turnaround weeks" });
  need("pricePerLb", { label: "Price per lb" });
  need("sellThroughPct", { min: 1, max: 100, label: "Sell-through %" });
  need("packCostPerLb", { label: "Packaging cost per lb" });
  need("slots", { min: 1, int: true, label: "Fruiting slots" });
  need("startsPerWeek", { int: true, label: "Blocks started per week" });
  need("weeklyFixed", { label: "Weekly fixed cost" });
  need("weeks", { min: 4, max: 104, int: true, label: "Weeks to simulate" });
  const yields = String(src.flushYields).split(/[,\s]+/).filter(Boolean).map(Number);
  if (!yields.length || yields.some((y) => !Number.isFinite(y) || y < 0) || yields.length > 8) {
    errors.push("Flush yields must be 1 to 8 numbers (lb per block per flush), separated by commas.");
  }
  p.yields = yields;
  return { p, errors };
}

// Economics of one started block if it is taken through `n` flushes.
export function perBlock(p, n) {
  const c = p.contaminationPct / 100;
  const survive = 1 - c;
  const yieldLb = p.yields.slice(0, n).reduce((a, b) => a + b, 0);
  const soldLb = yieldLb * (p.sellThroughPct / 100);
  const revenue = soldLb * (p.pricePerLb - p.packCostPerLb);
  const harvestLabor = (yieldLb * p.harvestMinPerLb / 60) * p.wage;
  const startCost = p.blockCost + (p.handlingMin / 60) * p.wage;
  const profit = survive * (revenue - harvestLabor) - startCost;
  const slotWeeks = p.firstFlushWeeks + (n - 1) * p.flushGapWeeks + p.turnaroundWeeks;
  return {
    flushes: n, yieldLb, soldLb, revenue, harvestLabor, startCost,
    survive, profit, slotWeeks, slotWeeksPerStart: survive * slotWeeks,
    profitPerSlotWeek: survive > 0 ? profit / (survive * slotWeeks) : 0,
    marginalPerAdded: 0,
  };
}

export function analyze(raw) {
  const { p, errors } = parseInputs(raw);
  if (errors.length) return { errors, summary: null };
  const maxN = p.yields.length;
  const table = [];
  for (let n = 1; n <= maxN; n++) table.push(perBlock(p, n));
  table.forEach((r, i) => { r.marginalPerAdded = i === 0 ? r.profit : r.profit - table[i - 1].profit; });
  const bestPerBlock = table.reduce((a, b) => (b.profit > a.profit ? b : a));
  const bestPerSlot = table.reduce((a, b) => (b.profitPerSlotWeek > a.profitPerSlotWeek ? b : a));

  // Run as many flushes as pay when the room has spare slots; fall back to the
  // best profit per slot-week when the chosen starts would overfill it.
  const fits = (r) => p.startsPerWeek * r.survive * r.slotWeeks <= p.slots + 1e-9;
  const plan = fits(bestPerBlock) ? bestPerBlock : bestPerSlot;
  const n = plan.flushes;
  const survive = plan.survive;
  const maxStarts = survive > 0 ? Math.floor(p.slots / (survive * plan.slotWeeks) + 1e-9) : 0;

  // Weekly simulation over the horizon.
  const horizon = p.weeks;
  const occ = new Array(horizon).fill(0), harvest = new Array(horizon).fill(0);
  const spend = new Array(horizon).fill(0), income = new Array(horizon).fill(0);
  for (let t = 0; t < horizon; t++) {
    const s = p.startsPerWeek;
    spend[t] += s * plan.startCost;
    const enter = t + p.incubationWeeks;
    const live = s * survive;
    for (let w = enter; w < enter + plan.slotWeeks && w < horizon; w++) occ[w] += live;
    for (let k = 0; k < n; k++) {
      const wk = enter + p.firstFlushWeeks + k * p.flushGapWeeks - 1;
      if (wk >= 0 && wk < horizon) {
        const lb = live * p.yields[k];
        harvest[wk] += lb;
        income[wk] += lb * (p.sellThroughPct / 100) * (p.pricePerLb - p.packCostPerLb) - (lb * p.harvestMinPerLb / 60) * p.wage;
      }
    }
  }
  let cash = 0, low = 0, lowWeek = 0, payback = null;
  const weeksOut = [];
  for (let t = 0; t < horizon; t++) {
    const net = income[t] - spend[t] - p.weeklyFixed;
    cash += net;
    if (cash < low) { low = cash; lowWeek = t + 1; }
    if (payback === null && t > lowWeek && low < 0 && cash >= 0) payback = t + 1;
    weeksOut.push({ week: t + 1, starts: p.startsPerWeek, occupied: occ[t], harvestLb: harvest[t], income: income[t], spend: spend[t] + p.weeklyFixed, net, cash });
  }
  const peak = Math.max(...occ);
  const firstSale = weeksOut.find((w) => w.harvestLb > 0)?.week ?? null;

  // Steady-state weekly profit at the chosen starts, and break-evens.
  const weeklyProfit = p.startsPerWeek * plan.profit - p.weeklyFixed;
  const startsAtMax = maxStarts * plan.profit - p.weeklyFixed;
  const A = plan.revenue - plan.harvestLabor; // per surviving block
  const breakEvenContam = A > 0 ? Math.max(0, (1 - plan.startCost / A) * 100) : 0;
  const unitLb = plan.yieldLb * (p.sellThroughPct / 100);
  const breakEvenPrice = unitLb > 0 && survive > 0
    ? ((plan.startCost / survive + plan.harvestLabor) / unitLb) + p.packCostPerLb : null;
  const breakEvenStarts = plan.profit > 0 ? Math.ceil(p.weeklyFixed / plan.profit) : null;

  // Sensitivity of weekly profit at the chosen starts: contamination x price.
  const sens = [];
  for (const dc of [-4, 0, 4, 8, 12]) {
    const row = { contamination: Math.max(0, p.contaminationPct + dc), cells: [] };
    for (const dp of [-2, -1, 0, 1, 2]) {
      const q = { ...p, contaminationPct: row.contamination, pricePerLb: Math.max(0, p.pricePerLb + dp) };
      const b = perBlock(q, n);
      row.cells.push({ price: q.pricePerLb, weekly: q.startsPerWeek * b.profit - q.weeklyFixed });
    }
    sens.push(row);
  }

  const warnings = [];
  if (peak > p.slots + 1e-9) warnings.push({ level: "high", text: `Starting ${p.startsPerWeek} blocks a week needs about ${Math.ceil(peak)} fruiting slots at the busiest week and you have ${p.slots}. With ${n} flush${n === 1 ? "" : "es"} per block the room carries about ${maxStarts} starts a week.` });
  if (plan.profit <= 0) warnings.push({ level: "high", text: `At these numbers each block started loses ${money(-plan.profit)}. Contamination, price or yield has to move; the break-even table below shows how far.` });
  else if (weeklyProfit < 0) warnings.push({ level: "medium", text: `Each block earns ${money(plan.profit)} but ${p.startsPerWeek} a week does not cover the ${money(p.weeklyFixed)} weekly fixed cost; you need about ${breakEvenStarts} starts a week.` });
  if (bestPerBlock.flushes !== bestPerSlot.flushes) warnings.push({ level: "info", text: `If the room has spare slots, ${bestPerBlock.flushes} flush${bestPerBlock.flushes === 1 ? "" : "es"} earns the most per block; when slots are the limit, ${bestPerSlot.flushes} earns the most per slot-week. The plan uses ${n} because ${n === bestPerBlock.flushes ? "your starts fit in the room" : "your starts would overfill the room"}.` });
  if (low < 0) warnings.push({ level: "info", text: `Cash is lowest around week ${lowWeek} at ${money(low)} before sales catch up${payback ? `; it is back above zero in week ${payback}` : " and is not back above zero inside the weeks simulated"}.` });
  if (p.contaminationPct > 20) warnings.push({ level: "medium", text: "Contamination above 20% usually means the process, not the price, is the problem; check it before scaling starts." });

  return {
    errors: [], summary: {
      flushes: n, profitPerBlock: plan.profit, profitPerSlotWeek: plan.profitPerSlotWeek, slotWeeks: plan.slotWeeks,
      maxStarts, peakSlots: peak, slots: p.slots, weeklyProfit, weeklyProfitAtMax: startsAtMax,
      breakEvenContam, breakEvenPrice, breakEvenStarts, lowCash: low, lowWeek, payback, firstSale,
      totalLb: harvest.reduce((a, b) => a + b, 0),
    },
    table, bestPerBlock: bestPerBlock.flushes, bestPerSlot: bestPerSlot.flushes, weeks: weeksOut, sens, warnings,
  };
}

export function money(v) {
  const s = Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${v < 0 ? "-" : ""}$${s}`;
}

export function weeksCsv(r) {
  const head = "week,blocks_started,slots_used,harvest_lb,income,spend,net,cumulative_cash";
  const rows = r.weeks.map((w) => [w.week, w.starts, w.occupied.toFixed(1), w.harvestLb.toFixed(1), w.income.toFixed(2), w.spend.toFixed(2), w.net.toFixed(2), w.cash.toFixed(2)].join(","));
  return [head, ...rows].join("\n") + "\n";
}
