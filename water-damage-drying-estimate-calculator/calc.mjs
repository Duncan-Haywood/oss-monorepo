// Water damage drying estimate. Pure arithmetic over what a restoration contractor types in: the affected floor, wall and ceiling area, the water class,
// the equipment ratios they dry to, their equipment day rates and what the equipment costs them, labour, drying days and what the carrier approved.
// It turns that into air movers and dehumidifiers, an equipment-day bill, a job invoice and margin, and shows what an extra drying day or a short
// approval does to the margin.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// Cubic feet one dehumidifier pint of capacity covers per class (the common LGR starting factors; the factors are inputs-adjacent defaults, not a standard of record).
export const CLASS_FACTOR = { 1: 100, 2: 50, 3: 40, 4: 40 };

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    floorSf: f("floorSf"), ceilingFt: f("ceilingFt", 8), wallLf: f("wallLf"), ceilingSf: f("ceilingSf"), waterClass: f("waterClass", 2),
    sfPerMover: f("sfPerMover", 50), lfPerMover: f("lfPerMover", 14), ceilingSfPerMover: f("ceilingSfPerMover", 150), dehuPints: f("dehuPints", 70),
    dryDays: f("dryDays", 3), approvedDays: f("approvedDays"), moverRate: f("moverRate", 28), dehuRate: f("dehuRate", 85), moverCost: f("moverCost", 5), dehuCost: f("dehuCost", 16),
    setupMinPerUnit: f("setupMinPerUnit", 10), monitorMin: f("monitorMin", 30), techRate: f("techRate", 38), driveHours: f("driveHours", 1.5), extractHours: f("extractHours"),
    demoHours: f("demoHours"), laborBill: f("laborBill", 75), laborCrew: f("laborCrew", 2), consumables: f("consumables", 40), targetMarginPct: f("targetMarginPct", 35),
  };
  for (const [k, x] of Object.entries(v)) if (!Number.isFinite(x) || x < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (v.floorSf + v.wallLf + v.ceilingSf <= 0) return { error: "Enter the affected floor area, wall length or ceiling area (something above zero)." };
  if (![1, 2, 3, 4].includes(v.waterClass)) return { error: "Water class must be 1, 2, 3 or 4." };
  if (v.sfPerMover <= 0 || v.lfPerMover <= 0 || v.ceilingSfPerMover <= 0) return { error: "Square feet or linear feet per air mover must be above zero." };
  if (v.dehuPints <= 0) return { error: "Enter the dehumidifier's pint rating (above zero)." };
  if (v.ceilingFt <= 0 || v.ceilingFt > 30) return { error: "Ceiling height must be above 0 and at most 30 feet." };
  if (!Number.isInteger(v.dryDays) || v.dryDays < 1 || v.dryDays > 30) return { error: "Drying days must be a whole number from 1 to 30." };
  if (v.approvedDays > 30) return { error: "Approved days must be 30 or fewer (0 means no cap)." };
  if (v.laborCrew < 1 || v.laborCrew > 8) return { error: "Crew must be from 1 to 8 people." };
  if (v.targetMarginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  return { v };
}

// How much equipment the affected area needs.
export function equipment(v) {
  const floorMovers = v.floorSf / v.sfPerMover;
  const wallMovers = v.wallLf / v.lfPerMover;
  const ceilMovers = v.ceilingSf / v.ceilingSfPerMover;
  const movers = Math.max(1, Math.ceil(floorMovers + wallMovers + ceilMovers - 1e-9));
  const cuft = v.floorSf * v.ceilingFt;
  const factor = CLASS_FACTOR[v.waterClass];
  const pintsNeeded = cuft / factor;
  const dehus = cuft > 0 ? Math.max(1, Math.ceil(pintsNeeded / v.dehuPints - 1e-9)) : 0;
  return { movers, dehus, cuft: round1(cuft), factor, pintsNeeded: round1(pintsNeeded), floorMovers: round2(floorMovers), wallMovers: round2(wallMovers), ceilMovers: round2(ceilMovers) };
}

// One job at a given drying-day count.
export function jobCost(v, eq, o = {}) {
  const days = o.days ?? v.dryDays;
  const billedDays = v.approvedDays > 0 ? Math.min(days, v.approvedDays) : days;
  const unpaidDays = days - billedDays;
  const dayBill = eq.movers * v.moverRate + eq.dehus * v.dehuRate;
  const dayCost = eq.movers * v.moverCost + eq.dehus * v.dehuCost;
  const equipBill = dayBill * billedDays;
  const equipCost = dayCost * days;
  const units = eq.movers + eq.dehus;
  const setupHours = (units * v.setupMinPerUnit * 2) / 60; // set and pick up
  const monitorHours = (days * v.monitorMin) / 60;
  const visitHours = days + 1; // each monitor visit plus pickup
  const driveHours = visitHours * v.driveHours;
  const techHours = setupHours + monitorHours + driveHours;
  const techCost = techHours * v.techRate;
  const workHours = v.extractHours + v.demoHours;
  const workBill = workHours * v.laborCrew * v.laborBill;
  const workCost = workHours * v.laborCrew * v.techRate;
  const bill = equipBill + workBill + v.consumables * 2; // consumables billed at 2x cost
  const cost = equipCost + techCost + workCost + v.consumables;
  const profit = bill - cost;
  return {
    days, billedDays, unpaidDays, dayBill: round2(dayBill), dayCost: round2(dayCost), equipBill: round2(equipBill), equipCost: round2(equipCost),
    techHours: round1(techHours), techCost: round2(techCost), workBill: round2(workBill), workCost: round2(workCost), bill: round2(bill), cost: round2(cost),
    profit: round2(profit), marginPct: bill > 0 ? round1((profit / bill) * 100) : 0,
  };
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const eq = equipment(v);
  const job = jobCost(v, eq);
  const advice = [];
  advice.push(`Dry this with ${eq.movers} air mover${eq.movers === 1 ? "" : "s"} and ${eq.dehus} dehumidifier${eq.dehus === 1 ? "" : "s"}. Class ${v.waterClass}: ${eq.cuft} cubic feet over a factor of ${eq.factor} needs about ${eq.pintsNeeded} pints a day against ${v.dehuPints} per unit.`);
  advice.push(`At ${v.dryDays} drying day${v.dryDays === 1 ? "" : "s"} the equipment bills ${usd(job.equipBill)} (${usd(job.dayBill)} a day). The job bills ${usd(job.bill)}, costs you ${usd(job.cost)} and leaves ${usd(job.profit)}, a ${job.marginPct}% margin.`);
  if (v.approvedDays > 0 && v.dryDays > v.approvedDays) {
    advice.push(`The carrier approved ${v.approvedDays} day${v.approvedDays === 1 ? "" : "s"} but you plan ${v.dryDays}. The ${job.unpaidDays} extra day${job.unpaidDays === 1 ? "" : "s"} cost you ${usd(job.unpaidDays * job.dayCost)} in equipment and bill nothing. Document the readings that justify the extra time before you run past the approval.`);
  }
  if (job.marginPct < v.targetMarginPct) {
    const gap = v.targetMarginPct / 100 * job.bill - job.profit;
    advice.push(`The margin is ${round1(v.targetMarginPct - job.marginPct)} points under your ${v.targetMarginPct}% target. Closing it takes roughly ${usd(Math.max(0, gap / (1 - v.targetMarginPct / 100)))} more billed on the job.`);
  } else {
    advice.push(`That clears your ${v.targetMarginPct}% target by ${round1(job.marginPct - v.targetMarginPct)} points.`);
  }
  const parts = [["equipment", job.equipCost], ["technician time", job.techCost], ["demo and extraction labour", job.workCost], ["consumables", v.consumables]].sort((a, b) => b[1] - a[1]);
  if (job.cost > 0) advice.push(`The biggest cost is ${parts[0][0]} at ${usd(parts[0][1])}, ${Math.round((parts[0][1] / job.cost) * 100)}% of the job.`);
  const table = [];
  for (const d of [...new Set([2, 3, 4, 5, 6, 7, v.dryDays])].sort((a, b) => a - b)) {
    const c = jobCost(v, eq, { days: d });
    table.push({ days: d, billedDays: c.billedDays, bill: c.bill, cost: c.cost, profit: c.profit, marginPct: c.marginPct, current: d === v.dryDays });
  }
  return { error: null, input: v, eq, job, table, advice };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sampleInput() {
  return {
    floorSf: "600", ceilingFt: "8", wallLf: "70", ceilingSf: "0", waterClass: "2", sfPerMover: "50", lfPerMover: "14", ceilingSfPerMover: "150", dehuPints: "70",
    dryDays: "4", approvedDays: "3", moverRate: "28", dehuRate: "85", moverCost: "5", dehuCost: "16", setupMinPerUnit: "10", monitorMin: "30", techRate: "38",
    driveHours: "1", extractHours: "2", demoHours: "3", laborBill: "75", laborCrew: "2", consumables: "40", targetMarginPct: "35",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = Object.keys(sampleInput());

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
  const head = "drying_days,billed_days,invoice,cost,profit,margin_pct";
  return [head, ...result.table.map((r) => [r.days, r.billedDays, r.bill, r.cost, r.profit, r.marginPct].join(","))].join("\n");
}
