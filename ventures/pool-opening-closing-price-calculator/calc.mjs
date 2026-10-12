// Pool opening and closing price. Pure arithmetic over what a pool service owner types in: the pool (size, shape, cover, plumbing lines), the visit
// (hours, crew, drive), the chemicals and supplies, how green the water is at opening, the redo risk, margin and a minimum charge. It prices each visit,
// the bundle for a customer who books both, and how many stops fill a crew day.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// Gallons per cubic foot of a pool's bounding box: a rectangle holds the most, a freeform the least.
export const SHAPES = { rectangle: 7.5, oval: 6.7, round: 5.9, freeform: 6.3 };
// Cover work at each end of the season, in extra crew hours.
export const COVERS = { none: { close: 0, open: 0 }, mesh: { close: 0.5, open: 0.3 }, solid: { close: 0.4, open: 0.7 }, safety: { close: 0.8, open: 0.5 } };
// Water at opening: how much longer the visit runs and how much more chemical it takes to clear it.
export const CONDITIONS = { clear: { hrs: 1, chem: 1 }, cloudy: { hrs: 1.3, chem: 1.6 }, green: { hrs: 2, chem: 3 } };

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const shape = String(input.shape ?? "rectangle"), cover = String(input.cover ?? "mesh"), condition = String(input.condition ?? "cloudy");
  const v = {
    lengthFt: f("lengthFt"), widthFt: f("widthFt"), avgDepthFt: f("avgDepthFt", 5), shape, cover, condition, lines: f("lines", 4),
    baseCloseHrs: f("baseCloseHrs", 1.5), baseOpenHrs: f("baseOpenHrs", 1.5), lineCloseHrs: f("lineCloseHrs", 0.15), driveHrs: f("driveHrs", 0.7), crew: f("crew", 2),
    laborRate: f("laborRate"), closeChemPer10k: f("closeChemPer10k", 14), openChemPer10k: f("openChemPer10k", 18), closeSupplies: f("closeSupplies", 28), openSupplies: f("openSupplies", 6),
    redoPct: f("redoPct", 6), redoCost: f("redoCost"), bundlePct: f("bundlePct", 5), marginPct: f("marginPct", 40), minCharge: f("minCharge"), dayHrs: f("dayHrs", 8),
  };
  for (const [k, x] of Object.entries(v)) if (!["shape", "cover", "condition"].includes(k) && (!Number.isFinite(x) || x < 0)) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (!SHAPES[shape]) return { error: "Shape must be rectangle, oval, round or freeform." };
  if (!COVERS[cover]) return { error: "Cover must be none, mesh, solid or safety." };
  if (!CONDITIONS[condition]) return { error: "Water condition must be clear, cloudy or green." };
  if (v.lengthFt <= 0 || v.widthFt <= 0) return { error: "Enter the pool length and width in feet (above zero)." };
  if (v.avgDepthFt < 2 || v.avgDepthFt > 12) return { error: "Average depth should be between 2 and 12 feet." };
  if (!Number.isInteger(v.crew) || v.crew < 1 || v.crew > 6) return { error: "Crew must be a whole number from 1 to 6." };
  if (v.redoPct > 100) return { error: "Redo rate cannot be more than 100 percent." };
  if (v.bundlePct >= 50) return { error: "Bundle discount must be below 50 percent." };
  if (v.marginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  if (v.dayHrs <= 0 || v.dayHrs > 16) return { error: "Crew day should be between 0 and 16 hours." };
  return { v };
}

export function gallons(v) {
  return Math.round(v.lengthFt * v.widthFt * v.avgDepthFt * SHAPES[v.shape]);
}

// kind is "close" or "open". o can override the gallons and the water condition, for the sensitivity tables.
export function visitCost(v, kind, o = {}) {
  const gal = o.gallons ?? gallons(v);
  const scale = gal / 20000;
  const cond = CONDITIONS[kind === "open" ? o.condition ?? v.condition : "clear"];
  const base = kind === "open" ? v.baseOpenHrs : v.baseCloseHrs;
  const lineHrs = v.lines * (kind === "open" ? v.lineCloseHrs * 0.6 : v.lineCloseHrs);
  // Half of the base visit is fixed (arrive, set up, pack out) and half grows with the water.
  const onSiteHrs = (base * (0.5 + 0.5 * scale) + lineHrs + COVERS[v.cover][kind]) * cond.hrs;
  const elapsedHrs = onSiteHrs + v.driveHrs;
  const labor = elapsedHrs * v.crew * v.laborRate;
  const chem = ((kind === "open" ? v.openChemPer10k : v.closeChemPer10k) * gal) / 10000 * cond.chem;
  const supplies = kind === "open" ? v.openSupplies : v.closeSupplies;
  const expectedRedo = (v.redoPct / 100) * v.redoCost;
  const cost = labor + chem + supplies + expectedRedo;
  const wanted = cost / (1 - v.marginPct / 100);
  const minApplied = wanted < v.minCharge;
  const price = Math.max(wanted, v.minCharge);
  return {
    kind, gallons: gal, onSiteHrs: round1(onSiteHrs), elapsedHrs: round1(elapsedHrs), labor: round2(labor), chem: round2(chem), supplies: round2(supplies),
    expectedRedo: round2(expectedRedo), cost: round2(cost), wanted: round2(wanted), minApplied, price: round2(price), profit: round2(price - cost),
    marginPct: price > 0 ? round1(((price - cost) / price) * 100) : 0, stopsPerDay: Math.max(0, Math.floor(v.dayHrs / elapsedHrs + 1e-9)),
    dayRevenue: round2(Math.floor(v.dayHrs / elapsedHrs + 1e-9) * price), revenuePerCrewHr: elapsedHrs > 0 ? round2(price / (elapsedHrs * v.crew)) : null,
  };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const close = visitCost(v, "close"), open = visitCost(v, "open");
  const listTotal = close.price + open.price;
  const bundlePrice = round2(listTotal * (1 - v.bundlePct / 100));
  const bundleCost = round2(close.cost + open.cost);
  const bundle = { price: bundlePrice, cost: bundleCost, saving: round2(listTotal - bundlePrice), profit: round2(bundlePrice - bundleCost), marginPct: bundlePrice > 0 ? round1(((bundlePrice - bundleCost) / bundlePrice) * 100) : 0 };
  const advice = [];
  advice.push(`This is a ${close.gallons.toLocaleString("en-US")} gallon pool. Charge ${usd(close.price)} to close it and ${usd(open.price)} to open it (${v.condition} water). Closing costs you ${usd(close.cost)} and opening ${usd(open.cost)}.`);
  advice.push(`Booked together at ${v.bundlePct}% off, the season is ${usd(bundle.price)}: it saves the customer ${usd(bundle.saving)} and leaves you ${usd(bundle.profit)} (${bundle.marginPct}% of the price).`);
  if (close.minApplied || open.minApplied) advice.push(`Your ${usd(v.minCharge)} minimum charge sets the ${close.minApplied && open.minApplied ? "closing and opening prices" : close.minApplied ? "closing price" : "opening price"}. Small pools are where a minimum is doing the work.`);
  const parts = [["labour", open.labor], ["chemicals", open.chem], ["supplies", open.supplies], ["expected redo", open.expectedRedo]].sort((a, b) => b[1] - a[1]);
  if (open.cost > 0) advice.push(`At opening the biggest cost is ${parts[0][0]} at ${usd(parts[0][1])}, ${Math.round((parts[0][1] / open.cost) * 100)}% of the visit.`);
  advice.push(`A crew day of ${v.dayHrs} hours fits ${close.stopsPerDay} closings (${usd(close.dayRevenue)}) or ${open.stopsPerDay} openings (${usd(open.dayRevenue)}). The week you open is the week the whole route wants you, so the day's revenue is the number to protect.`);
  const g = CONDITIONS.green, c0 = visitCost(v, "open", { condition: "clear" }), c2 = visitCost(v, "open", { condition: "green" });
  if (v.condition !== "green") advice.push(`If the cover leaked and the pool is green, opening costs ${usd(c2.cost)} instead of ${usd(c0.cost)} (${g.hrs}x the time, ${g.chem}x the chemical). Quote clear-water opening and say green water is extra.`);
  const conditions = Object.keys(CONDITIONS).map((k) => {
    const j = visitCost(v, "open", { condition: k });
    return { condition: k, onSiteHrs: j.onSiteHrs, cost: j.cost, price: j.price, stopsPerDay: j.stopsPerDay };
  });
  const sizes = [10000, 15000, 20000, 30000, 40000].map((gal) => {
    const c = visitCost(v, "close", { gallons: gal }), o = visitCost(v, "open", { gallons: gal });
    return { gallons: gal, closePrice: c.price, openPrice: o.price, season: round2((c.price + o.price) * (1 - v.bundlePct / 100)) };
  });
  return { error: null, input: v, close, open, bundle, conditions, sizes, advice };
}

export function sampleInput() {
  return {
    lengthFt: "32", widthFt: "16", avgDepthFt: "5", shape: "rectangle", cover: "mesh", condition: "cloudy", lines: "4", baseCloseHrs: "1.5", baseOpenHrs: "1.5",
    lineCloseHrs: "0.15", driveHrs: "0.7", crew: "2", laborRate: "26", closeChemPer10k: "14", openChemPer10k: "18", closeSupplies: "28", openSupplies: "6",
    redoPct: "6", redoCost: "180", bundlePct: "5", marginPct: "40", minCharge: "250", dayHrs: "8",
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
  const head = "water_condition,on_site_hours,cost,price,stops_per_day";
  return [head, ...result.conditions.map((r) => [r.condition, r.onSiteHrs, r.cost, r.price, r.stopsPerDay].join(","))].join("\n");
}
