// Grease trap pumping bid. Pure arithmetic over what a pumper types in: the trap (size, how full of grease and solids it was and how long that took),
// the truck (tank size, dump trip), the site (drive, setup, pump rate), crew and truck cost, disposal fee, margin and minimum.
// It turns that into a price per visit, the interval that keeps the trap under the usual 25% grease-and-solids rule, what each interval costs per year,
// how many stops one truckload serves, and what the disposal fee does to the price.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    trapGal: f("trapGal"), fogPct: f("fogPct"), weeksSince: f("weeksSince"), limitPct: f("limitPct", 25), truckGal: f("truckGal"),
    driveMin: f("driveMin"), siteMin: f("siteMin", 20), pumpGpm: f("pumpGpm", 60), dumpMin: f("dumpMin", 60), disposalPerGal: f("disposalPerGal"),
    crew: f("crew", 1), laborRate: f("laborRate"), truckRate: f("truckRate"), manifestFee: f("manifestFee"), marginPct: f("marginPct", 30),
    minCharge: f("minCharge"), workdayHours: f("workdayHours", 8), targetAnnual: f("targetAnnual"),
  };
  for (const [k, x] of Object.entries(v)) if (!Number.isFinite(x) || x < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (v.trapGal <= 0) return { error: "Enter the trap's liquid capacity in gallons (above zero)." };
  if (v.truckGal < v.trapGal) return { error: "The truck's tank has to hold at least one full trap. Enter the truck tank size in gallons." };
  if (v.fogPct > 100) return { error: "Grease and solids cannot fill more than 100 percent of the trap." };
  if (v.limitPct <= 0 || v.limitPct > 100) return { error: "The pump-out limit is usually 25 percent; enter a value between 0 and 100." };
  if (v.pumpGpm <= 0) return { error: "Enter a pump rate above zero gallons per minute." };
  if (!Number.isInteger(v.crew) || v.crew < 1 || v.crew > 4) return { error: "Crew must be a whole number from 1 to 4." };
  if (v.marginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  if (v.workdayHours <= 0 || v.workdayHours > 16) return { error: "Workday hours must be above 0 and at most 16." };
  return { v };
}

// Weeks until the trap reaches the limit, from one inspection: it held fogPct percent when it was pumped weeksSince weeks after the last pump-out.
export function interval(v) {
  if (!(v.fogPct > 0) || !(v.weeksSince > 0)) return null;
  const perWeek = v.fogPct / v.weeksSince;
  const raw = v.limitPct / perWeek;
  const weeks = Math.max(1, Math.min(52, Math.floor(raw + 1e-9)));
  return { perWeek: round2(perWeek), rawWeeks: round1(raw), weeks, overdue: v.fogPct > v.limitPct };
}

// One visit.
export function visitCost(v, o = {}) {
  const trapGal = o.trapGal ?? v.trapGal;
  const disposal = o.disposalPerGal ?? v.disposalPerGal;
  const stopsPerLoad = Math.max(1, Math.floor(v.truckGal / trapGal));
  const pumpMin = trapGal / v.pumpGpm;
  const dumpShare = v.dumpMin / stopsPerLoad;
  const minutes = v.driveMin + v.siteMin + pumpMin + dumpShare;
  const hours = minutes / 60;
  const labor = hours * v.crew * v.laborRate;
  const truck = hours * v.truckRate;
  const disposalCost = trapGal * disposal;
  const cost = labor + truck + disposalCost + v.manifestFee;
  const wanted = cost / (1 - v.marginPct / 100);
  const minApplied = wanted < v.minCharge;
  const price = Math.max(wanted, v.minCharge);
  return {
    stopsPerLoad, pumpMin: round1(pumpMin), dumpShare: round1(dumpShare), minutes: round1(minutes), hours: round2(hours),
    labor: round2(labor), truck: round2(truck), disposalCost: round2(disposalCost), manifest: round2(v.manifestFee), cost: round2(cost),
    wanted: round2(wanted), minApplied, price: round2(price), perGal: round2(price / trapGal), profit: round2(price - cost),
    actualMarginPct: price > 0 ? round1(((price - cost) / price) * 100) : 0, revenuePerHour: hours > 0 ? round2(price / hours) : null,
    stopsPerDay: Math.floor(v.workdayHours / Math.max(hours, 1e-9)),
  };
}

const INTERVALS = [4, 6, 8, 12, 13, 26, 52];

// Annual price at each interval; compliant means the interval is no longer than the weeks the trap takes to reach the limit.
export function intervalTable(v, visit, iv) {
  const weeks = [...new Set([...INTERVALS, ...(iv ? [iv.weeks] : [])])].sort((a, b) => a - b);
  return weeks.map((w) => ({
    weeks: w, visitsPerYear: round1(52 / w), annual: round2(visit.price * (52 / w)), compliant: iv ? w <= iv.weeks : null, recommended: iv ? w === iv.weeks : false,
  }));
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const visit = visitCost(v);
  const iv = interval(v);
  const advice = [];
  advice.push(`Quote ${usd(visit.price)} per visit (${usd(visit.perGal)} per gallon) for a ${v.trapGal}-gallon trap. It costs you ${usd(visit.cost)} and leaves ${usd(visit.profit)} (${visit.actualMarginPct}% of the price).`);
  if (visit.minApplied) advice.push(`Your ${usd(v.minCharge)} minimum charge sets this price: the cost-plus price is only ${usd(visit.wanted)}.`);
  const parts = [["labour", visit.labor], ["truck", visit.truck], ["disposal", visit.disposalCost], ["paperwork", visit.manifest]].sort((a, b) => b[1] - a[1]);
  if (visit.cost > 0) advice.push(`The biggest cost is ${parts[0][0]} at ${usd(parts[0][1])}, ${Math.round((parts[0][1] / visit.cost) * 100)}% of the visit.`);
  advice.push(`The visit takes ${visit.minutes} minutes: ${v.driveMin} driving, ${v.siteMin} on setup and cleaning, ${visit.pumpMin} pumping and ${visit.dumpShare} as this stop's share of the dump trip. One load serves ${visit.stopsPerLoad} stop${visit.stopsPerLoad === 1 ? "" : "s"} of this size, about ${visit.stopsPerDay} a day.`);
  if (visit.stopsPerLoad === 1 && v.dumpMin > 0) advice.push(`A trap this size fills the truck, so every stop carries a whole ${v.dumpMin}-minute dump trip (${usd((v.dumpMin / 60) * (v.crew * v.laborRate + v.truckRate))}). Pairing it with a smaller trap on the same route, or a bigger tank, spreads that.`);
  let table = [];
  if (iv) {
    table = intervalTable(v, visit, iv);
    if (iv.overdue) advice.push(`The trap was already ${v.fogPct}% full of grease and solids after ${v.weeksSince} weeks, over the ${v.limitPct}% limit. At that rate it reaches ${v.limitPct}% in ${iv.rawWeeks} weeks, so the interval should be ${iv.weeks} weeks or shorter, not the ${v.weeksSince} it ran.`);
    else advice.push(`At ${iv.perWeek}% of the trap per week, grease and solids reach ${v.limitPct}% after ${iv.rawWeeks} weeks. Pump every ${iv.weeks} week${iv.weeks === 1 ? "" : "s"} or sooner: ${round1(52 / iv.weeks)} visits and ${usd(visit.price * (52 / iv.weeks))} a year.`);
    if (v.targetAnnual > 0) {
      const a = visit.price * (52 / iv.weeks);
      advice.push(a >= v.targetAnnual ? `That annual price is ${usd(a - v.targetAnnual)} above the ${usd(v.targetAnnual)} the customer wants to pay.` : `The customer wants ${usd(v.targetAnnual)} a year; the compliant interval prices at ${usd(a)}, ${usd(v.targetAnnual - a)} short. A longer interval would not be compliant, so the fix is the price per visit, not the schedule.`);
    }
  } else {
    advice.push("Add the grease and solids percentage and the weeks since the last pump-out to get the compliant interval and the annual price.");
    table = intervalTable(v, visit, null);
  }
  const sens = [0.75, 1, 1.5, 2, 3].map((m) => {
    const c = visitCost(v, { disposalPerGal: round2(v.disposalPerGal * m) });
    return { multiplier: m, disposalPerGal: round2(v.disposalPerGal * m), cost: c.cost, price: c.price, perGal: c.perGal };
  });
  return { error: null, input: v, visit, iv, table, sensitivity: sens, advice };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sampleInput() {
  return {
    trapGal: "1000", fogPct: "20", weeksSince: "8", limitPct: "25", truckGal: "3000", driveMin: "30", siteMin: "25", pumpGpm: "60", dumpMin: "70",
    disposalPerGal: "0.12", crew: "1", laborRate: "32", truckRate: "55", manifestFee: "4", marginPct: "30", minCharge: "250", workdayHours: "8", targetAnnual: "1500",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = ["trapGal", "fogPct", "weeksSince", "limitPct", "truckGal", "driveMin", "siteMin", "pumpGpm", "dumpMin", "disposalPerGal", "crew", "laborRate", "truckRate", "manifestFee", "marginPct", "minCharge", "workdayHours", "targetAnnual"];

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
  const head = "interval_weeks,visits_per_year,price_per_visit,annual,compliant";
  return [head, ...result.table.map((r) => [r.weeks, r.visitsPerYear, result.visit.price, r.annual, r.compliant === null ? "" : r.compliant].join(","))].join("\n");
}
