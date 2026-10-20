// Payback and monthly profit for a laundromat's machine lines. Pure functions, no DOM.
// Arithmetic on figures the user types; nothing here is a market price, a utility rate or a legal rate.

export const DEFAULTS = Object.freeze({
  daysPerMonth: 30,
  cardFeePct: 3,
  overheadMonthly: 0,
  targetPaybackMonths: 60,
  retentionIfRaised: 97,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Lines: "name, count, price per cycle, turns per machine per day, utility cost per cycle, installed cost per machine".
// Header optional.
export function parseMachines(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 4) { skipped++; continue; }
    const count = num(cells[1], NaN), price = num(cells[2], NaN), turns = num(cells[3], NaN);
    if (!Number.isFinite(count) || !Number.isFinite(price) || !Number.isFinite(turns)) { if (rows.length || !/count|machine|name|type/i.test(line)) skipped++; continue; }
    const util = num(cells[4], 0), install = num(cells[5], 0);
    if (count <= 0 || price <= 0 || turns < 0 || !(util >= 0) || !(install >= 0)) { skipped++; continue; }
    rows.push({ name: cells[0] || "Machine", count, price, turns, util, install });
  }
  const warnings = skipped ? [`${skipped} machine line(s) skipped (need a name, a count, a positive price and turns per day).`] : [];
  if (!rows.length) return { error: "Add at least one machine line: name, count, price per cycle, turns per day, utility cost per cycle, installed cost per machine." };
  return { rows, warnings };
}

const clean = (opts) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts && opts[k] !== undefined) o[k] = num(opts[k], DEFAULTS[k]);
  return o;
};

export function analyze(machines, opts = {}) {
  const o = clean(opts);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.cardFeePct >= 100) return { error: "Card fee must be under 100%." };
  if (o.daysPerMonth <= 0 || o.daysPerMonth > 31) return { error: "Days open per month must be between 1 and 31." };
  if (o.targetPaybackMonths <= 0) return { error: "Target payback months must be above zero." };
  const warnings = [];
  const fee = o.cardFeePct / 100;

  const lines = machines.map((m) => {
    const cycles = m.count * m.turns * o.daysPerMonth;
    const revenue = cycles * m.price;
    const feeCost = revenue * fee;
    const utilCost = cycles * m.util;
    const contribution = revenue - feeCost - utilCost;
    const perCycle = m.price * (1 - fee) - m.util;
    const invested = m.count * m.install;
    const paybackMonths = contribution > 0 && invested > 0 ? invested / contribution : null;
    const neededTurns = perCycle > 0 && m.install > 0 ? m.install / o.targetPaybackMonths / (perCycle * o.daysPerMonth) : null;
    const meetsPayback = invested === 0 ? true : paybackMonths !== null && paybackMonths <= o.targetPaybackMonths + 1e-9;
    return { ...m, cycles, revenue, feeCost, utilCost, contribution, perCycle, invested, paybackMonths, neededTurns, meetsPayback, contributionPerMachine: contribution / m.count };
  });

  const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
  const revenue = sum("revenue"), feeCost = sum("feeCost"), utilCost = sum("utilCost"), contribution = sum("contribution"), invested = sum("invested");
  const net = contribution - o.overheadMonthly;
  const breakEvenVolume = contribution > 0 ? o.overheadMonthly / contribution : null;
  if (contribution <= 0) warnings.push("Machine contribution is zero or negative, so the store cannot cover overhead at these figures.");
  if (lines.some((l) => l.perCycle <= 0)) warnings.push("At least one line costs more in fees and utilities per cycle than it charges, so more turns lose more money.");

  // A price rise changes revenue and fees on every cycle that stays; utilities fall with the cycles that leave.
  const raises = [3, 5, 10, 15].map((pct) => {
    const c1 = revenue * (1 + pct / 100) * (1 - fee) - utilCost;
    const breakEvenLoss = c1 > contribution && c1 > 0 ? (c1 - contribution) / c1 : 0;
    const keep = o.retentionIfRaised / 100;
    return { pct, extraPerMonth: c1 - contribution, breakEvenLoss, atRetention: c1 * keep - contribution };
  });

  const slow = lines.filter((l) => !l.meetsPayback);
  let verdict;
  if (!slow.length) verdict = `Every line pays back inside ${o.targetPaybackMonths} months at these turns.`;
  else {
    const worst = slow.reduce((a, b) => ((b.paybackMonths ?? Infinity) > (a.paybackMonths ?? Infinity) ? b : a));
    verdict = worst.paybackMonths === null
      ? `${slow.length} of ${lines.length} line(s) miss ${o.targetPaybackMonths} months; ${worst.name} never pays back at these figures.`
      : `${slow.length} of ${lines.length} line(s) miss ${o.targetPaybackMonths} months; the slowest is ${worst.name} at ${worst.paybackMonths.toFixed(0)} months.`;
  }

  return { options: o, lines, store: { revenue, feeCost, utilCost, contribution, overhead: o.overheadMonthly, net, annual: net * 12, invested, breakEvenVolume }, raises, verdict, warnings };
}

export function sampleMachines() {
  return "line,count,price per cycle,turns per machine per day,utility cost per cycle,installed cost per machine\nWasher 20 lb,8,4.25,4.5,0.95,4800\nWasher 40 lb,6,7.50,3.5,1.70,7200\nWasher 60 lb,2,11.00,2.5,2.60,10500\nDryer 30 lb stack,16,0.25,6.0,0.14,3600";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Line", "Machines", "Cycles per month", "Revenue", "Contribution", "Installed cost", "Payback months", "Turns per day for target payback"]];
  for (const l of r.lines) out.push([l.name, l.count, f2(l.cycles), f2(l.revenue), f2(l.contribution), f2(l.invested), l.paybackMonths === null ? "" : f2(l.paybackMonths), l.neededTurns === null ? "" : f2(l.neededTurns)]);
  out.push([]);
  out.push(["Store per month", "Revenue", "Fees", "Utilities", "Contribution", "Overhead", "Net"]);
  out.push(["", f2(r.store.revenue), f2(r.store.feeCost), f2(r.store.utilCost), f2(r.store.contribution), f2(r.store.overhead), f2(r.store.net)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
