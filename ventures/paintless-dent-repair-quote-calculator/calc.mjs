// Paintless dent repair (PDR) and hail quote. Pure arithmetic over what a PDR tech types in: dent counts by size band, how many sit on aluminum panels
// or body lines, the tech's minutes per dent, remove-and-install time, overhead per day, the comeback rate, and the shop's own per-dent matrix. It turns
// that into a cost-plus price, the matrix price, which one is higher, the tech days the car holds a stall, the effective hourly, and how the quote moves
// as the hail count changes, because a per-dent matrix is flat but the work is not.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// Dent size bands (the coin scale PDR techs quote by) and a starting number of tech minutes per dent on ordinary steel.
export const BANDS = {
  dime: { label: "Dime (up to 15 mm)", minutes: 12 },
  nickel: { label: "Nickel (about 21 mm)", minutes: 20 },
  quarter: { label: "Quarter (about 24 mm)", minutes: 35 },
  half: { label: "Half dollar and over (30 mm+)", minutes: 60 },
};
const BAND_KEYS = Object.keys(BANDS);
const NUMERIC = [
  "dimeCt", "nickelCt", "quarterCt", "halfCt", "rateDime", "rateNickel", "rateQuarter", "rateHalf", "alumPct", "alumUp", "linePct", "lineUp",
  "riHrs", "laborRate", "techs", "hoursPerDay", "consumables", "overheadPerDay", "comebackPct", "comebackCost", "marginPct", "minCharge", "bodyShopAlt", "acv", "totalLossPct",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    dimeCt: f("dimeCt"), nickelCt: f("nickelCt"), quarterCt: f("quarterCt"), halfCt: f("halfCt"),
    rateDime: f("rateDime"), rateNickel: f("rateNickel"), rateQuarter: f("rateQuarter"), rateHalf: f("rateHalf"),
    alumPct: f("alumPct"), alumUp: f("alumUp", 30), linePct: f("linePct"), lineUp: f("lineUp", 40),
    riHrs: f("riHrs"), laborRate: f("laborRate"), techs: f("techs", 1), hoursPerDay: f("hoursPerDay", 8), consumables: f("consumables", 25),
    overheadPerDay: f("overheadPerDay"), comebackPct: f("comebackPct", 4), comebackCost: f("comebackCost"), marginPct: f("marginPct", 35), minCharge: f("minCharge"),
    bodyShopAlt: f("bodyShopAlt"), acv: f("acv"), totalLossPct: f("totalLossPct", 75),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of ["dimeCt", "nickelCt", "quarterCt", "halfCt"]) if (!Number.isInteger(v[k])) return { error: "Dent counts must be whole numbers." };
  const dents = v.dimeCt + v.nickelCt + v.quarterCt + v.halfCt;
  if (dents === 0) return { error: "Enter at least one dent: there is nothing to repair." };
  if (dents > 2000) return { error: "That is over 2,000 dents: check the counts." };
  if (v.alumPct > 100 || v.linePct > 100) return { error: "The aluminum and body-line shares cannot be more than 100 percent." };
  if (v.comebackPct > 100) return { error: "Comeback rate cannot be more than 100 percent." };
  if (!Number.isInteger(v.techs) || v.techs < 1 || v.techs > 8) return { error: "Techs must be a whole number from 1 to 8." };
  if (v.hoursPerDay <= 0 || v.hoursPerDay > 16) return { error: "Productive hours per day should be above 0 and at most 16." };
  if (v.marginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  if (v.totalLossPct > 150) return { error: "Total-loss threshold should be a percentage of the vehicle value, usually 60 to 100." };
  return { v, dents };
}

// A flat per-dent matrix ignores that aluminum and body lines take longer, so the time multiplier is built from the shares the tech types.
export function timeMultiplier(v) {
  return 1 + (v.alumPct / 100) * (v.alumUp / 100) + (v.linePct / 100) * (v.lineUp / 100);
}

export function jobCost(v, o = {}) {
  const scale = o.scale ?? 1;
  const counts = { dime: v.dimeCt * scale, nickel: v.nickelCt * scale, quarter: v.quarterCt * scale, half: v.halfCt * scale };
  const rates = { dime: v.rateDime, nickel: v.rateNickel, quarter: v.rateQuarter, half: v.rateHalf };
  const mult = timeMultiplier(v);
  const dents = BAND_KEYS.reduce((s, b) => s + counts[b], 0);
  const repairHrs = (BAND_KEYS.reduce((s, b) => s + counts[b] * BANDS[b].minutes, 0) / 60) * mult;
  const techHrs = repairHrs + v.riHrs;
  const labor = techHrs * v.laborRate;
  const workDays = Math.max(1, Math.ceil(techHrs / (v.techs * v.hoursPerDay) - 1e-9));
  const overhead = workDays * v.overheadPerDay;
  const expectedComeback = (v.comebackPct / 100) * v.comebackCost;
  const cost = labor + v.consumables + overhead + expectedComeback;
  const wanted = cost / (1 - v.marginPct / 100);
  const matrix = BAND_KEYS.reduce((s, b) => s + counts[b] * rates[b], 0);
  const matrixUsed = matrix > 0;
  const base = Math.max(wanted, matrix);
  const minApplied = base < v.minCharge;
  const price = Math.max(base, v.minCharge);
  const matrixShort = matrixUsed && matrix < wanted;
  return {
    dents: round1(dents), multiplier: round2(mult), repairHrs: round1(repairHrs), techHrs: round1(techHrs), labor: round2(labor), workDays,
    overhead: round2(overhead), expectedComeback: round2(expectedComeback), consumables: round2(v.consumables), cost: round2(cost),
    wanted: round2(wanted), matrix: round2(matrix), matrixUsed, matrixShort, minApplied, price: round2(price), profit: round2(price - cost),
    actualMarginPct: price > 0 ? round1(((price - cost) / price) * 100) : 0,
    pricePerHour: techHrs > 0 ? round2(price / techHrs) : 0,
    profitPerTechDay: round2((price - cost) / workDays),
  };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, dents, error } = readInput(input);
  if (error) return { error };
  const job = jobCost(v);
  const advice = [];
  advice.push(`Quote ${usd(job.price)} for ${dents} dent${dents === 1 ? "" : "s"}. It costs you ${usd(job.cost)} and leaves ${usd(job.profit)} (${job.actualMarginPct}% of the price), ${usd(job.pricePerHour)} of price per tech hour.`);
  if (job.matrixUsed) {
    if (job.matrixShort) advice.push(`Your per-dent matrix gives only ${usd(job.matrix)}, below the ${usd(job.wanted)} this car needs for your margin. The matrix is flat; the work is ${job.multiplier}x slower than steel with no body lines. Charge the higher figure or raise the matrix for aluminum and lines.`);
    else advice.push(`Your matrix gives ${usd(job.matrix)}, which already covers the ${usd(job.wanted)} cost-plus price, so the matrix is the right quote here.`);
  } else advice.push("No per-dent rates entered, so this is cost plus margin only. Enter your matrix rates to see whether it underprices this car.");
  if (job.minApplied) advice.push(`Your ${usd(v.minCharge)} minimum charge sets this price.`);
  advice.push(`${job.techHrs} tech hours (${job.repairHrs} repairing at ${job.multiplier}x for aluminum and body lines, ${v.riHrs} remove-and-install) over ${job.workDays} work day${job.workDays === 1 ? "" : "s"} with ${v.techs} tech${v.techs === 1 ? "" : "s"}.`);
  if (v.comebackPct > 0 && v.comebackCost > 0) advice.push(`At ${v.comebackPct}% comebacks costing ${usd(v.comebackCost)} each, expect ${usd(job.expectedComeback)} of rework on every job.`);
  if (v.bodyShopAlt > 0) {
    const saved = v.bodyShopAlt - job.price;
    advice.push(saved >= 0 ? `A conventional body-shop repair is ${usd(v.bodyShopAlt)}, so this quote saves the customer or the insurer ${usd(saved)}. Say so in the estimate.` : `A conventional repair of ${usd(v.bodyShopAlt)} is cheaper than this PDR quote. Check the counts before sending it.`);
  }
  if (v.acv > 0) {
    const limit = (v.totalLossPct / 100) * v.acv;
    const ratio = Math.round((job.price / v.acv) * 100);
    advice.push(job.price >= limit ? `At ${ratio}% of the vehicle's ${usd(v.acv)} value, this quote is over the ${v.totalLossPct}% total-loss line of ${usd(limit)}. An insurer may total the car instead: expect a pushback and have photos of the dent count ready.` : `At ${ratio}% of the vehicle's ${usd(v.acv)} value, this stays under the ${v.totalLossPct}% total-loss line of ${usd(limit)}.`);
  }
  const severity = [0.5, 1, 1.5, 2].map((s) => {
    const j = jobCost(v, { scale: s });
    return { scale: s, dents: j.dents, techHrs: j.techHrs, workDays: j.workDays, cost: j.cost, wanted: j.wanted, matrix: j.matrix, price: j.price, profitPerTechDay: j.profitPerTechDay };
  });
  const bands = BAND_KEYS.map((b) => {
    const count = v[b + "Ct"];
    const hrs = (count * BANDS[b].minutes / 60) * job.multiplier;
    return { band: b, label: BANDS[b].label, count, hours: round1(hrs), costPerDent: count ? round2((hrs * v.laborRate) / count) : 0 };
  });
  return { error: null, input: v, job, bands, severity, advice };
}

export function sampleInput() {
  return {
    dimeCt: "60", nickelCt: "45", quarterCt: "20", halfCt: "4", rateDime: "35", rateNickel: "55", rateQuarter: "85", rateHalf: "150",
    alumPct: "20", alumUp: "30", linePct: "15", lineUp: "40", riHrs: "2", laborRate: "65", techs: "1", hoursPerDay: "8", consumables: "25",
    overheadPerDay: "90", comebackPct: "4", comebackCost: "350", marginPct: "35", minCharge: "150", bodyShopAlt: "9500", acv: "14000", totalLossPct: "75",
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
  const head = "hail_severity,dents,tech_hours,work_days,cost,matrix_price,price,profit_per_tech_day";
  return [head, ...result.severity.map((r) => [`${r.scale}x`, r.dents, r.techHrs, r.workDays, r.cost, r.matrix, r.price, r.profitPerTechDay].join(","))].join("\n");
}
