// PPF and ceramic coating bid. Pure arithmetic over what a detailing or wrap shop types in: the vehicle size, the package (film coverage and/or coating),
// paint correction stage, film cost and waste, bay time and cure days, bay overhead, and the redo/claim rate. It turns that into a price, the film you
// must cut, the bay days the car occupies, and what each package earns per bay day, because the bay is the scarce thing a shop sells.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// Film (linear feet of a 60 in roll for a compact car) and install hours (compact car) for each coverage.
export const PACKAGES = {
  none: { label: "Coating only (no film)", filmFt: 0, hours: 0 },
  partial: { label: "Partial front (bumper, part hood and fenders, mirrors)", filmFt: 14, hours: 8 },
  full_front: { label: "Full front (bumper, hood, fenders, mirrors, headlights)", filmFt: 24, hours: 14 },
  track: { label: "Track pack (full front, rockers, A-pillars, roof leading edge)", filmFt: 36, hours: 22 },
  full_body: { label: "Full body", filmFt: 70, hours: 40 },
};
export const SIZES = { compact: 1, sedan: 1.15, suv: 1.35, truck: 1.5 };
// Paint correction hours for a compact car, by stage (0 none, 1 one-step polish, 2 two-step cut and polish).
export const CORRECTION = { 0: 0, 1: 4, 2: 9 };

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const pkg = String(input.pkg ?? "full_front");
  const size = String(input.size ?? "sedan");
  const v = {
    pkg, size, correction: f("correction", 1), coating: String(input.coating ?? "yes") === "no" ? "no" : "yes",
    filmCostPerFt: f("filmCostPerFt"), wastePct: f("wastePct", 15), coatingCost: f("coatingCost"), coatingHrs: f("coatingHrs", 3),
    consumables: f("consumables", 40), laborRate: f("laborRate"), techs: f("techs", 1), hoursPerDay: f("hoursPerDay", 8), cureDays: f("cureDays", 1),
    bayOverheadPerDay: f("bayOverheadPerDay"), redoPct: f("redoPct", 6), redoCost: f("redoCost"), marginPct: f("marginPct", 40), minCharge: f("minCharge"),
  };
  for (const [k, x] of Object.entries(v)) if (!["pkg", "size", "coating"].includes(k) && (!Number.isFinite(x) || x < 0)) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (!PACKAGES[pkg]) return { error: "Package must be one of the listed coverages." };
  if (!SIZES[size]) return { error: "Vehicle size must be compact, sedan, suv or truck." };
  if (!(v.correction in CORRECTION) || !Number.isInteger(v.correction)) return { error: "Paint correction stage must be 0, 1 or 2." };
  if (pkg === "none" && v.coating === "no") return { error: "Pick a film package, a coating, or both: nothing is being sold." };
  if (v.wastePct > 100) return { error: "Waste cannot be more than 100 percent." };
  if (v.redoPct > 100) return { error: "Redo rate cannot be more than 100 percent." };
  if (!Number.isInteger(v.techs) || v.techs < 1 || v.techs > 6) return { error: "Techs must be a whole number from 1 to 6." };
  if (v.hoursPerDay <= 0 || v.hoursPerDay > 16) return { error: "Productive hours per day should be above 0 and at most 16." };
  if (v.marginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  return { v };
}

// Film is bought by the linear foot of roll, so waste (cut offcuts, a ruined panel) is bought too.
export function jobCost(v, o = {}) {
  const pkg = PACKAGES[o.pkg ?? v.pkg];
  const coating = (o.coating ?? v.coating) === "yes";
  const redoPct = o.redoPct ?? v.redoPct;
  const k = SIZES[v.size];
  const filmFt = pkg.filmFt * k;
  const filmBought = filmFt * (1 + v.wastePct / 100);
  const film = filmBought * v.filmCostPerFt;
  const installHrs = pkg.hours * k;
  const correctionHrs = CORRECTION[v.correction] * k;
  const coatingHrs = coating ? v.coatingHrs * k : 0;
  const coatingMaterial = coating ? v.coatingCost : 0;
  const techHrs = installHrs + correctionHrs + coatingHrs;
  const labor = techHrs * v.laborRate;
  const workDays = Math.max(1, Math.ceil(techHrs / (v.techs * v.hoursPerDay) - 1e-9));
  const bayDays = workDays + (coating ? v.cureDays : 0);
  const overhead = bayDays * v.bayOverheadPerDay;
  const expectedRedo = (redoPct / 100) * v.redoCost;
  const cost = film + coatingMaterial + v.consumables + labor + overhead + expectedRedo;
  const wanted = cost / (1 - v.marginPct / 100);
  const minApplied = wanted < v.minCharge;
  const price = Math.max(wanted, v.minCharge);
  return {
    filmFt: round1(filmFt), filmBought: round1(filmBought), film: round2(film), coatingMaterial: round2(coatingMaterial), consumables: round2(v.consumables),
    techHrs: round1(techHrs), labor: round2(labor), workDays, bayDays, overhead: round2(overhead), expectedRedo: round2(expectedRedo), cost: round2(cost),
    wanted: round2(wanted), minApplied, price: round2(price), profit: round2(price - cost), actualMarginPct: price > 0 ? round1(((price - cost) / price) * 100) : 0,
    profitPerBayDay: round2((price - cost) / bayDays),
  };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const job = jobCost(v);
  const what = [v.pkg !== "none" ? PACKAGES[v.pkg].label.split(" (")[0].toLowerCase() + " PPF" : null, v.coating === "yes" ? "ceramic coating" : null].filter(Boolean).join(" + ");
  const advice = [];
  advice.push(`Quote ${usd(job.price)} for ${what} on a ${v.size}. It costs you ${usd(job.cost)} and leaves ${usd(job.profit)} (${job.actualMarginPct}% of the price), ${usd(job.profitPerBayDay)} per bay day over ${job.bayDays} bay day${job.bayDays === 1 ? "" : "s"}.`);
  if (job.minApplied) advice.push(`Your ${usd(v.minCharge)} minimum charge sets this price: the cost-plus price is only ${usd(job.wanted)}.`);
  const parts = [["film", job.film], ["labour", job.labor], ["bay overhead", job.overhead], ["coating", job.coatingMaterial], ["expected redo", job.expectedRedo], ["consumables", job.consumables]].sort((a, b) => b[1] - a[1]);
  if (job.cost > 0) advice.push(`The biggest cost is ${parts[0][0]} at ${usd(parts[0][1])}, ${Math.round((parts[0][1] / job.cost) * 100)}% of the job.`);
  if (job.filmBought > 0) advice.push(`Cut ${job.filmFt} linear feet of film and buy ${job.filmBought} with ${v.wastePct}% waste: ${usd(job.film)} of film. Waste covers offcuts and the odd ruined panel; raise it for a new installer.`);
  advice.push(`${job.techHrs} tech hours over ${job.workDays} work day${job.workDays === 1 ? "" : "s"} with ${v.techs} tech${v.techs === 1 ? "" : "s"}${v.coating === "yes" && v.cureDays > 0 ? `, then ${v.cureDays} cure day${v.cureDays === 1 ? "" : "s"} with the bay blocked` : ""}.`);
  if (v.redoPct > 0 && v.redoCost > 0) advice.push(`At ${v.redoPct}% redos costing ${usd(v.redoCost)} each (lifting edges, a contaminated panel), warranty work adds ${usd(job.expectedRedo)} to every job.`);
  const packages = Object.keys(PACKAGES).filter((p) => !(p === "none" && v.coating === "no")).map((p) => {
    const j = jobCost(v, { pkg: p });
    return { pkg: p, label: PACKAGES[p].label, bayDays: j.bayDays, cost: j.cost, price: j.price, profitPerBayDay: j.profitPerBayDay };
  });
  const best = [...packages].sort((a, b) => b.profitPerBayDay - a.profitPerBayDay)[0];
  if (best) advice.push(`Per bay day, "${best.label}" earns the most at ${usd(best.profitPerBayDay)}. If the bay is booked solid, sell that one first.`);
  const redos = [0, 3, 6, 12, 20].map((p) => {
    const j = jobCost(v, { redoPct: p });
    return { redoPct: p, cost: j.cost, price: j.price };
  });
  return { error: null, input: v, job, packages, redos, advice };
}

export function sampleInput() {
  return {
    pkg: "full_front", size: "sedan", coating: "yes", correction: "1", filmCostPerFt: "24", wastePct: "15", coatingCost: "90", coatingHrs: "3", consumables: "40",
    laborRate: "35", techs: "1", hoursPerDay: "8", cureDays: "1", bayOverheadPerDay: "120", redoPct: "6", redoCost: "450", marginPct: "40", minCharge: "500",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = ["pkg", "size", "coating", "correction", "filmCostPerFt", "wastePct", "coatingCost", "coatingHrs", "consumables", "laborRate", "techs", "hoursPerDay", "cureDays", "bayOverheadPerDay", "redoPct", "redoCost", "marginPct", "minCharge"];

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
  const head = "package,bay_days,cost,price,profit_per_bay_day";
  return [head, ...result.packages.map((r) => [`"${r.label.split(" (")[0]}"`, r.bayDays, r.cost, r.price, r.profitPerBayDay].join(","))].join("\n");
}
