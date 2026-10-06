// Horse boarding rate maths. Pure functions, no DOM, no network.
// Every figure is the barn owner's own input; nothing here is a market rate.

export const SAMPLE = {
  stalls: "16", occupancy: "88", hayLbs: "20", hayTon: "320", grain: "45", bedding: "70",
  laborHrs: "5", wage: "18", land: "2400", insuranceYear: "4800", utilities: "450", repairsYear: "6000",
  feePct: "3", target: "20000", currentRate: "650",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;
const DAYS = 365 / 12;

export function parse(raw) {
  const errors = [];
  const stalls = num(raw.stalls), occupancy = num(raw.occupancy), land = num(raw.land), target = num(raw.target);
  if (!(Number.isInteger(stalls) && stalls >= 1)) errors.push("Enter the number of stalls you board in (a whole number, 1 or more).");
  if (!(occupancy > 0 && occupancy <= 100)) errors.push("Enter average occupancy as a percent (more than 0, at most 100).");
  if (!(land >= 0)) errors.push("Enter monthly mortgage, lease or land cost (0 or more).");
  if (!(target >= 0)) errors.push("Enter the profit you want per year after paying yourself for chores (0 or more).");
  const hayLbs = opt(raw.hayLbs, 0), hayTon = opt(raw.hayTon, 0), grain = opt(raw.grain, 0), bedding = opt(raw.bedding, 0);
  const laborHrs = opt(raw.laborHrs, 0), wage = opt(raw.wage, 0), insuranceYear = opt(raw.insuranceYear, 0);
  const utilities = opt(raw.utilities, 0), repairsYear = opt(raw.repairsYear, 0), feePct = opt(raw.feePct, 0);
  const currentRate = opt(raw.currentRate, NaN);
  for (const [n, v] of [["Hay per horse per day", hayLbs], ["Hay price per ton", hayTon], ["Grain and supplements per horse", grain], ["Bedding per stall", bedding],
    ["Chore hours per day", laborHrs], ["Hourly wage for chores", wage], ["Insurance per year", insuranceYear], ["Utilities per month", utilities], ["Repairs per year", repairsYear]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(feePct >= 0 && feePct < 50)) errors.push("Card fee must be from 0 to under 50 percent.");
  if (currentRate === currentRate && !(currentRate >= 0)) errors.push("Current monthly board rate must be 0 or more.");
  return { errors, stalls, occupancy, hayLbs, hayTon, grain, bedding, laborHrs, wage, land, insuranceYear, utilities, repairsYear, feePct, target, currentRate };
}

// Per occupied stall per month: hay, grain and bedding. Fixed per month: chore labour, land, insurance,
// utilities and repairs. The board rate is what spreads fixed cost and the profit target over the horses
// actually in the barn, plus their variable cost, grossed up for the card fee.
function monthly(p) {
  const hay = (p.hayLbs * DAYS * p.hayTon) / 2000;
  const variable = hay + p.grain + p.bedding;
  const labor = p.laborHrs * DAYS * p.wage;
  const fixed = labor + p.land + p.insuranceYear / 12 + p.utilities + p.repairsYear / 12;
  return { hay, variable, labor, fixed };
}
const rateFor = (p, m, occ, profitMonthly) => ((m.fixed + profitMonthly) / (p.stalls * occ) + m.variable) / (1 - p.feePct / 100);

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const m = monthly(p), occ = p.occupancy / 100, k = 1 - p.feePct / 100;
  const horses = p.stalls * occ;
  const rate = rateFor(p, m, occ, p.target / 12);
  const breakEven = rateFor(p, m, occ, 0);
  const profitAt = (r, o) => p.stalls * o * (r * k - m.variable) - m.fixed;
  const sweep = [60, 70, 80, 90, 100, p.occupancy].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)
    .map((o) => ({ occupancy: o, horses: p.stalls * (o / 100), rate: round2(rateFor(p, m, o / 100, p.target / 12)), breakEven: round2(rateFor(p, m, o / 100, 0)) }));
  const findings = [];
  let current = null;
  if (p.currentRate >= 0) {
    const profit = profitAt(p.currentRate, occ) * 12;
    const margin = p.currentRate * k - m.variable;
    const beOcc = margin > 0 ? m.fixed / (p.stalls * margin) : Infinity;
    current = { rate: p.currentRate, profitYear: profit, breakEvenOccupancy: beOcc <= 1 ? beOcc * 100 : null };
    if (profit < p.target)
      findings.push({ severity: profit < 0 ? "high" : "medium", title: `At ${dollars(p.currentRate)} a month and ${p.occupancy}% full the barn makes about ${dollars(profit)} a year against your ${dollars(p.target)} target. The rate for the target is ${dollars(rate)}.` });
    if (beOcc > 1 || !(margin > 0))
      findings.push({ severity: "high", title: `At ${dollars(p.currentRate)} a month the barn loses money even when every stall is full.` });
    else if (beOcc > occ)
      findings.push({ severity: "high", title: `At ${dollars(p.currentRate)} a month you need about ${(beOcc * 100).toFixed(0)}% occupancy just to cover costs, and you average ${p.occupancy}%.` });
  }
  findings.push({ severity: "info", title: `Rate for your target: ${dollars(rate)} per stall per month at ${p.occupancy}% occupancy (${horses.toFixed(1)} horses). Break-even is ${dollars(breakEven)}.` });
  findings.push({ severity: "info", title: `Feed and bedding cost ${dollars(m.variable)} per horse per month; fixed costs including your chore labour are ${dollars(m.fixed)} a month, about ${dollars(m.fixed / horses)} per horse before profit.` });
  const lowOcc = Math.max(1, p.occupancy - 10);
  if (p.occupancy > 10) {
    const lowRate = rateFor(p, m, lowOcc / 100, p.target / 12);
    findings.push({ severity: "info", title: `Each empty stall raises the rate the other horses must cover: at ${lowOcc}% occupancy the rate for the same profit is ${dollars(lowRate)}, ${dollars(lowRate - rate)} more.` });
  }
  return { errors: [], input: p, variable: m.variable, hay: m.hay, labor: m.labor, fixed: m.fixed, horses, rate: round2(rate), breakEven: round2(breakEven), current, findings, sweep };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Horse boarding: ${p.stalls} stalls, ${p.occupancy}% full (${r.horses.toFixed(1)} horses)`,
    `Per horse per month: feed and bedding ${dollars(r.variable)}; fixed costs per month ${dollars(r.fixed)} (chore labour ${dollars(r.labor)})`,
    `Rate for ${dollars(p.target)} a year profit: ${dollars(r.rate)} per stall per month; break-even ${dollars(r.breakEven)}`,
    ...(r.current ? [`At ${dollars(r.current.rate)} a month: about ${dollars(r.current.profitYear)} a year`] : []),
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["occupancy_pct,horses,rate_for_target,break_even_rate", ...r.sweep.map((x) => `${x.occupancy},${x.horses.toFixed(1)},${x.rate.toFixed(2)},${x.breakEven.toFixed(2)}`)].join("\n");
}
