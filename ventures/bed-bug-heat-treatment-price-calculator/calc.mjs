// Bed bug heat treatment bid. Pure arithmetic over what a pest control operator types in: the structure (floor area, ceiling, clutter), the equipment
// (heaters, fuel, fans, sensors), the time (prep, heat-up, hold at lethal temperature, teardown), the crew, a follow-up inspection and the callback risk.
// It turns that into a price, the heater count, the day's hours, the expected cost of a warranty retreat, and a comparison with a chemical programme.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// Clutter slows the heat-up (heat has to soak into piles) and adds prep time moving and bagging things.
export const CLUTTER = { light: { heatUp: 1, prep: 1 }, moderate: { heatUp: 1.3, prep: 1.6 }, heavy: { heatUp: 1.7, prep: 2.4 } };

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const clutter = String(input.clutter ?? "moderate");
  const v = {
    sqft: f("sqft"), ceilingFt: f("ceilingFt", 8), clutter, sqftPerHeater: f("sqftPerHeater", 500), baseHeatUpHrs: f("baseHeatUpHrs", 3), holdHrs: f("holdHrs", 4),
    prepHrs: f("prepHrs", 1.5), teardownHrs: f("teardownHrs", 1), driveHrs: f("driveHrs", 1), crew: f("crew", 2), laborRate: f("laborRate"),
    fuelPerHeaterHr: f("fuelPerHeaterHr"), heaterWearPerHr: f("heaterWearPerHr", 6), consumables: f("consumables", 35), followUpCost: f("followUpCost"),
    callbackPct: f("callbackPct", 8), retreatCost: f("retreatCost"), marginPct: f("marginPct", 35), minCharge: f("minCharge"),
    chemVisits: f("chemVisits", 3), chemVisitCost: f("chemVisitCost"),
  };
  for (const [k, x] of Object.entries(v)) if (k !== "clutter" && (!Number.isFinite(x) || x < 0)) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (!CLUTTER[clutter]) return { error: "Clutter must be light, moderate or heavy." };
  if (v.sqft <= 0) return { error: "Enter the floor area to be heated in square feet (above zero)." };
  if (v.ceilingFt < 6 || v.ceilingFt > 20) return { error: "Ceiling height should be between 6 and 20 feet." };
  if (v.sqftPerHeater <= 0) return { error: "Enter how many square feet one heater covers (above zero)." };
  if (!Number.isInteger(v.crew) || v.crew < 1 || v.crew > 6) return { error: "Crew must be a whole number from 1 to 6." };
  if (v.callbackPct > 100) return { error: "Callback rate cannot be more than 100 percent." };
  if (v.marginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  return { v };
}

// Heaters scale with floor area, and a tall ceiling means more air to heat than the usual 8 feet.
export function heaterCount(v) {
  return Math.max(1, Math.ceil((v.sqft * (v.ceilingFt / 8)) / v.sqftPerHeater - 1e-9));
}

export function jobCost(v, o = {}) {
  const clutter = CLUTTER[o.clutter ?? v.clutter];
  const callbackPct = o.callbackPct ?? v.callbackPct;
  const heaters = heaterCount(v);
  const heatUp = v.baseHeatUpHrs * clutter.heatUp * (v.ceilingFt / 8);
  const prep = v.prepHrs * clutter.prep;
  const heatHrs = heatUp + v.holdHrs;
  const onSiteHrs = prep + heatHrs + v.teardownHrs;
  const crewHrs = onSiteHrs + v.driveHrs;
  const labor = crewHrs * v.crew * v.laborRate;
  const fuel = heaters * heatHrs * v.fuelPerHeaterHr;
  const wear = heaters * heatHrs * v.heaterWearPerHr;
  const expectedCallback = (callbackPct / 100) * v.retreatCost;
  const cost = labor + fuel + wear + v.consumables + v.followUpCost + expectedCallback;
  const wanted = cost / (1 - v.marginPct / 100);
  const minApplied = wanted < v.minCharge;
  const price = Math.max(wanted, v.minCharge);
  return {
    heaters, heatUpHrs: round1(heatUp), prepHrs: round1(prep), heatHrs: round1(heatHrs), onSiteHrs: round1(onSiteHrs), crewHrs: round1(crewHrs),
    labor: round2(labor), fuel: round2(fuel), wear: round2(wear), consumables: round2(v.consumables), followUp: round2(v.followUpCost),
    expectedCallback: round2(expectedCallback), cost: round2(cost), wanted: round2(wanted), minApplied, price: round2(price), perSqft: round2(price / v.sqft),
    profit: round2(price - cost), actualMarginPct: price > 0 ? round1(((price - cost) / price) * 100) : 0,
    revenuePerCrewHr: crewHrs > 0 ? round2(price / crewHrs) : null,
  };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const job = jobCost(v);
  const advice = [];
  advice.push(`Quote ${usd(job.price)} (${usd(job.perSqft)} per square foot) for ${v.sqft.toLocaleString("en-US")} sq ft with ${job.heaters} heater${job.heaters === 1 ? "" : "s"}. It costs you ${usd(job.cost)} and leaves ${usd(job.profit)} (${job.actualMarginPct}% of the price).`);
  if (job.minApplied) advice.push(`Your ${usd(v.minCharge)} minimum charge sets this price: the cost-plus price is only ${usd(job.wanted)}.`);
  const parts = [["labour", job.labor], ["fuel", job.fuel], ["heater wear", job.wear], ["follow-up inspection", job.followUp], ["expected warranty retreat", job.expectedCallback], ["consumables", job.consumables]].sort((a, b) => b[1] - a[1]);
  if (job.cost > 0) advice.push(`The biggest cost is ${parts[0][0]} at ${usd(parts[0][1])}, ${Math.round((parts[0][1] / job.cost) * 100)}% of the job.`);
  advice.push(`The day: ${job.prepHrs} hours of prep, ${job.heatUpHrs} hours to heat up through the clutter, ${v.holdHrs} hours holding temperature and ${v.teardownHrs} to pack out, ${job.onSiteHrs} on site and ${job.crewHrs} crew hours with the drive. ${job.revenuePerCrewHr === null ? "" : `That earns ${usd(job.revenuePerCrewHr)} per crew hour.`}`);
  if (v.callbackPct > 0 && v.retreatCost > 0) advice.push(`At ${v.callbackPct}% callbacks costing ${usd(v.retreatCost)} each, the warranty adds ${usd(job.expectedCallback)} to every job. If your callbacks are higher than that, this price is too low; if you decline cluttered units, it is lower.`);
  const chemTotal = v.chemVisits * v.chemVisitCost;
  let chem = null;
  if (chemTotal > 0) {
    chem = { total: round2(chemTotal), premium: round2(job.price - chemTotal), visits: v.chemVisits };
    advice.push(job.price > chemTotal
      ? `A chemical programme of ${v.chemVisits} visits at ${usd(v.chemVisitCost)} comes to ${usd(chemTotal)}. Heat costs ${usd(job.price - chemTotal)} more, but is one day instead of ${v.chemVisits} visits and weeks of waiting: that is the pitch, and the number to defend.`
      : `A chemical programme of ${v.chemVisits} visits at ${usd(v.chemVisitCost)} comes to ${usd(chemTotal)}, more than this heat price by ${usd(chemTotal - job.price)}. Heat is both faster for the customer and cheaper to them here.`);
  }
  const sens = Object.keys(CLUTTER).map((c) => {
    const j = jobCost(v, { clutter: c });
    return { clutter: c, onSiteHrs: j.onSiteHrs, cost: j.cost, price: j.price, perSqft: j.perSqft };
  });
  const callbacks = [0, 5, 10, 20, 30].map((p) => {
    const j = jobCost(v, { callbackPct: p });
    return { callbackPct: p, cost: j.cost, price: j.price };
  });
  return { error: null, input: v, job, chem, sensitivity: sens, callbacks, advice };
}

export function sampleInput() {
  return {
    sqft: "1200", ceilingFt: "8", clutter: "moderate", sqftPerHeater: "500", baseHeatUpHrs: "3", holdHrs: "4", prepHrs: "1.5", teardownHrs: "1", driveHrs: "1",
    crew: "2", laborRate: "28", fuelPerHeaterHr: "6", heaterWearPerHr: "6", consumables: "35", followUpCost: "60", callbackPct: "8", retreatCost: "700",
    marginPct: "35", minCharge: "900", chemVisits: "3", chemVisitCost: "275",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = ["sqft", "ceilingFt", "clutter", "sqftPerHeater", "baseHeatUpHrs", "holdHrs", "prepHrs", "teardownHrs", "driveHrs", "crew", "laborRate", "fuelPerHeaterHr", "heaterWearPerHr", "consumables", "followUpCost", "callbackPct", "retreatCost", "marginPct", "minCharge", "chemVisits", "chemVisitCost"];

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
  const head = "clutter,on_site_hours,cost,price,price_per_sqft";
  return [head, ...result.sensitivity.map((r) => [r.clutter, r.onSiteHrs, r.cost, r.price, r.perSqft].join(","))].join("\n");
}
