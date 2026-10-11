// Hoarding and heavy-clutter cleanout bid. Pure arithmetic over what a cleanout contractor types in: the space (floor area, ceiling height, how full it is,
// how much the client keeps), the work rate (person-hours to sort and carry a cubic yard, minutes of sanitising per 100 sq ft), the crew, the containers and
// dump fees, a risk allowance, margin and a minimum. It turns that into a price, the days and containers the job needs, a price per cubic yard to write into
// the change-order clause, and how far the volume can overrun the walkthrough estimate before the quoted price stops covering cost.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    floorSqft: f("floorSqft"), ceilingFt: f("ceilingFt", 8), fillPct: f("fillPct"), keepPct: f("keepPct", 10), personHrPerYd: f("personHrPerYd", 1.2),
    sanitizeSqft: f("sanitizeSqft"), sanitizeMinPer100: f("sanitizeMinPer100", 90), crew: f("crew", 3), workdayHours: f("workdayHours", 8),
    driveMin: f("driveMin", 60), setupMin: f("setupMin", 45), laborRate: f("laborRate"), ppePerPersonDay: f("ppePerPersonDay", 18), mobilizationPerDay: f("mobilizationPerDay"),
    dumpsterYd: f("dumpsterYd", 30), loadPct: f("loadPct", 85), haulCost: f("haulCost"), tonsPerYd: f("tonsPerYd", 0.2), dumpFeePerTon: f("dumpFeePerTon"),
    riskPct: f("riskPct", 10), marginPct: f("marginPct", 30), minCharge: f("minCharge"),
  };
  for (const [k, x] of Object.entries(v)) if (!Number.isFinite(x) || x < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (v.floorSqft <= 0) return { error: "Enter the floor area to be cleared in square feet (above zero)." };
  if (v.ceilingFt <= 0 || v.ceilingFt > 30) return { error: "Ceiling height must be above 0 and at most 30 feet." };
  if (v.fillPct <= 0 || v.fillPct > 100) return { error: "Enter how full the space is, as a percent of its volume (above 0, at most 100)." };
  if (v.keepPct >= 100) return { error: "The client cannot keep everything: keep percent must be below 100." };
  if (v.personHrPerYd <= 0) return { error: "Enter the person-hours it takes to sort and carry out one cubic yard (above zero)." };
  if (v.sanitizeSqft > v.floorSqft) return { error: "The area to sanitise cannot be larger than the floor area." };
  if (!Number.isInteger(v.crew) || v.crew < 1 || v.crew > 12) return { error: "Crew must be a whole number from 1 to 12." };
  if (v.workdayHours <= 0 || v.workdayHours > 16) return { error: "Workday hours must be above 0 and at most 16." };
  if ((v.driveMin + v.setupMin) / 60 >= v.workdayHours) return { error: "Drive and setup time use up the whole workday. Shorten them or lengthen the day." };
  if (v.dumpsterYd <= 0) return { error: "Enter the container size in cubic yards (above zero)." };
  if (v.loadPct <= 0 || v.loadPct > 100) return { error: "Container load must be above 0 and at most 100 percent." };
  if (v.marginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  return { v };
}

// Loose debris to remove, in cubic yards: the space's volume, the share of it that is contents, less what the client keeps.
export function debrisYards(v) {
  return (v.floorSqft * v.ceilingFt * (v.fillPct / 100) * (1 - v.keepPct / 100)) / 27;
}

// The whole job. o.volMult scales the debris volume (the walkthrough was wrong); everything else is held.
export function jobCost(v, o = {}) {
  const yards = debrisYards(v) * (o.volMult ?? 1);
  const carryHours = yards * v.personHrPerYd;
  const sanitizeHours = (v.sanitizeSqft / 100) * (v.sanitizeMinPer100 / 60);
  const personHours = carryHours + sanitizeHours;
  const productive = v.workdayHours - (v.driveMin + v.setupMin) / 60;
  const days = Math.max(1, Math.ceil(personHours / v.crew / productive - 1e-9));
  const paidHours = days * v.crew * v.workdayHours;
  const labor = paidHours * v.laborRate;
  const ppe = days * v.crew * v.ppePerPersonDay;
  const mobilization = days * v.mobilizationPerDay;
  const containers = Math.max(1, Math.ceil(yards / (v.dumpsterYd * (v.loadPct / 100)) - 1e-9));
  const hauls = containers * v.haulCost;
  const tons = yards * v.tonsPerYd;
  const dumpFees = tons * v.dumpFeePerTon;
  const base = labor + ppe + mobilization + hauls + dumpFees;
  const risk = (base * v.riskPct) / 100;
  const cost = base + risk;
  const wanted = cost / (1 - v.marginPct / 100);
  const minApplied = wanted < v.minCharge;
  const price = Math.max(wanted, v.minCharge);
  return {
    yards: round1(yards), tons: round1(tons), carryHours: round1(carryHours), sanitizeHours: round1(sanitizeHours), personHours: round1(personHours), days, containers,
    labor: round2(labor), ppe: round2(ppe), mobilization: round2(mobilization), hauls: round2(hauls), dumpFees: round2(dumpFees), risk: round2(risk), cost: round2(cost),
    wanted: round2(wanted), minApplied, price: round2(price), profit: round2(price - cost), actualMarginPct: price > 0 ? round1(((price - cost) / price) * 100) : 0,
    perYd: yards > 0 ? round2(price / yards) : null, perSqft: round2(price / v.floorSqft),
  };
}

// The largest volume multiple at which the quoted price still covers cost (cost rises with volume, so bisect).
export function breakEvenMultiple(v, price) {
  if (jobCost(v).cost > price) return 1;
  let lo = 1, hi = 20;
  if (jobCost(v, { volMult: hi }).cost <= price) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (jobCost(v, { volMult: mid }).cost <= price) lo = mid; else hi = mid;
  }
  return Math.floor(lo * 100) / 100;
}

// Price of an extra cubic yard found after the contract is signed: the cost of the next yard, loaded with the same margin, averaged over a +25% overrun.
export function changeOrderPerYd(v) {
  const a = jobCost(v), b = jobCost(v, { volMult: 1.25 });
  const extra = b.yards - a.yards;
  if (extra <= 0) return null;
  return round2((b.cost - a.cost) / extra / (1 - v.marginPct / 100));
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const job = jobCost(v);
  const advice = [];
  advice.push(`Quote ${usd(job.price)} for about ${job.yards} cubic yards (${usd(job.perYd)} a cubic yard, ${usd(job.perSqft)} a square foot). It costs you ${usd(job.cost)} and leaves ${usd(job.profit)} (${job.actualMarginPct}% of the price).`);
  if (job.minApplied) advice.push(`Your ${usd(v.minCharge)} minimum charge sets this price: the cost-plus price is only ${usd(job.wanted)}.`);
  advice.push(`The work is ${job.personHours} person-hours (${job.carryHours} sorting and carrying out, ${job.sanitizeHours} sanitising), which is ${job.days} day${job.days === 1 ? "" : "s"} for a crew of ${v.crew}, and ${job.containers} container${job.containers === 1 ? "" : "s"} of ${v.dumpsterYd} yards at ${v.loadPct}% full. About ${job.tons} tons go to the dump.`);
  const parts = [["labour", job.labor], ["container hauls", job.hauls], ["dump fees", job.dumpFees], ["risk allowance", job.risk], ["protective gear", job.ppe], ["mobilisation", job.mobilization]].sort((a, b) => b[1] - a[1]);
  if (job.cost > 0) advice.push(`The biggest cost is ${parts[0][0]} at ${usd(parts[0][1])}, ${Math.round((parts[0][1] / job.cost) * 100)}% of the job.`);
  const be = breakEvenMultiple(v, job.price);
  advice.push(be >= 20 ? "The quoted price covers cost even at twenty times the estimated volume, so check the inputs." : `The price covers cost until the real volume is ${Math.round((be - 1) * 100)}% above your estimate (${round1(job.yards * be)} cubic yards). Past that you work at a loss unless the contract lets you bill the extra.`);
  const co = changeOrderPerYd(v);
  if (co !== null) advice.push(`Put ${usd(co)} per extra cubic yard in the change-order clause: that is the cost of the next yard at your margin, so a bigger pile than the walkthrough showed does not eat the job.`);
  if (job.days >= 5) advice.push(`At ${job.days} days, ask for a deposit or weekly billing instead of one payment at the end.`);
  const sens = [0.75, 1, 1.25, 1.5, 2].map((m) => {
    const c = jobCost(v, { volMult: m });
    return { multiplier: m, yards: c.yards, days: c.days, containers: c.containers, cost: c.cost, quotePrice: c.price, profitAtQuote: round2(job.price - c.cost), marginAtQuotePct: job.price > 0 ? round1(((job.price - c.cost) / job.price) * 100) : 0 };
  });
  return { error: null, input: v, job, breakEven: be, changeOrder: co, sensitivity: sens, advice };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sampleInput() {
  return {
    floorSqft: "1100", ceilingFt: "8", fillPct: "30", keepPct: "10", personHrPerYd: "1.2", sanitizeSqft: "400", sanitizeMinPer100: "90", crew: "3", workdayHours: "8",
    driveMin: "60", setupMin: "45", laborRate: "28", ppePerPersonDay: "18", mobilizationPerDay: "40", dumpsterYd: "30", loadPct: "85", haulCost: "550",
    tonsPerYd: "0.2", dumpFeePerTon: "75", riskPct: "10", marginPct: "30", minCharge: "1500",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = ["floorSqft", "ceilingFt", "fillPct", "keepPct", "personHrPerYd", "sanitizeSqft", "sanitizeMinPer100", "crew", "workdayHours", "driveMin", "setupMin", "laborRate", "ppePerPersonDay", "mobilizationPerDay", "dumpsterYd", "loadPct", "haulCost", "tonsPerYd", "dumpFeePerTon", "riskPct", "marginPct", "minCharge"];

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
  const head = "volume_multiple,cubic_yards,days,containers,cost,quote_price_at_that_volume,profit_at_your_quote,margin_at_your_quote_pct";
  return [head, ...result.sensitivity.map((r) => [r.multiplier, r.yards, r.days, r.containers, r.cost, r.quotePrice, r.profitAtQuote, r.marginAtQuotePct].join(","))].join("\n");
}
