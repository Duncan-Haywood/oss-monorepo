// Standby generator install bid. Pure arithmetic over what an electrician or generator installer types in: the equipment, the gas and electrical runs,
// the permit, the crew hours, the margin and the callback risk. It turns that into a price, the cash the job needs before the final payment, what an
// overrun does to the profit, the lifetime value of a service plan, and a rough size check from the loads the customer wants to keep running.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// Common air-cooled and liquid-cooled home standby sizes, in kW.
export const SIZES_KW = [7, 9, 11, 13, 14, 16, 18, 20, 22, 24, 26, 36, 38, 48];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    genCost: f("genCost"), switchCost: f("switchCost"), padCost: f("padCost", 150), gasRunFt: f("gasRunFt"), gasPerFt: f("gasPerFt", 14), gasFee: f("gasFee"),
    elecRunFt: f("elecRunFt"), elecPerFt: f("elecPerFt", 9), permitFee: f("permitFee"), subCost: f("subCost"), commissionCost: f("commissionCost", 120),
    installHrs: f("installHrs", 14), crew: f("crew", 2), laborRate: f("laborRate"), driveHrs: f("driveHrs", 2),
    callbackPct: f("callbackPct", 5), callbackCost: f("callbackCost"), marginPct: f("marginPct", 30), depositPct: f("depositPct", 30), minCharge: f("minCharge"),
    planPrice: f("planPrice"), planCost: f("planCost"), planAttachPct: f("planAttachPct", 40), planYears: f("planYears", 5),
    acTons: f("acTons"), wellHp: f("wellHp"), sumpPumps: f("sumpPumps"), range: f("range"), waterHeater: f("waterHeater"), baseWatts: f("baseWatts", 3500),
  };
  for (const [k, x] of Object.entries(v)) if (!Number.isFinite(x) || x < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  if (v.genCost <= 0) return { error: "Enter what the generator costs you (above zero)." };
  if (!Number.isInteger(v.crew) || v.crew < 1 || v.crew > 8) return { error: "Crew must be a whole number from 1 to 8." };
  if (v.callbackPct > 100) return { error: "Callback rate cannot be more than 100 percent." };
  if (v.marginPct >= 90) return { error: "Margin must be below 90 percent of the price." };
  if (v.depositPct > 100) return { error: "Deposit cannot be more than 100 percent." };
  if (v.planAttachPct > 100) return { error: "Plan take-up cannot be more than 100 percent." };
  return { v };
}

// Everything the job costs you, with labour hours optionally stretched to test an overrun.
export function jobCost(v, o = {}) {
  const hours = v.installHrs * (1 + (o.overrun ?? 0) / 100);
  const labor = (hours + v.driveHrs) * v.crew * v.laborRate;
  const equipment = v.genCost + v.switchCost + v.padCost;
  const gas = v.gasRunFt * v.gasPerFt + v.gasFee;
  const elec = v.elecRunFt * v.elecPerFt;
  const expectedCallback = (v.callbackPct / 100) * v.callbackCost;
  const cost = equipment + gas + elec + v.permitFee + v.subCost + v.commissionCost + labor + expectedCallback;
  return {
    hours: round1(hours), labor: round2(labor), equipment: round2(equipment), gas: round2(gas), elec: round2(elec), expectedCallback: round2(expectedCallback),
    cost: round2(cost),
  };
}

export function price(v, margin = v.marginPct) {
  const c = jobCost(v);
  const wanted = c.cost / (1 - margin / 100);
  return { ...c, wanted: round2(wanted), minApplied: wanted < v.minCharge, price: round2(Math.max(wanted, v.minCharge)) };
}

// Rough size check, not an electrical load calculation: running watts of what the customer wants backed up, then the biggest motor's starting surge on top.
export function sizeCheck(v) {
  const motors = [
    { name: "air conditioner", run: v.acTons * 1200, start: v.acTons * 1200 * 3.5 },
    { name: "well pump", run: v.wellHp * 1000, start: v.wellHp * 1000 * 3 },
    { name: "sump pump", run: v.sumpPumps * 800, start: v.sumpPumps * 800 * 2.5 },
  ].filter((m) => m.run > 0);
  const fixed = v.baseWatts + (v.range > 0 ? 5000 : 0) + (v.waterHeater > 0 ? 4500 : 0);
  const running = fixed + motors.reduce((s, m) => s + m.run, 0);
  const biggest = motors.reduce((b, m) => (m.start - m.run > b.start - b.run ? m : b), { name: null, run: 0, start: 0 });
  const peak = running - biggest.run + biggest.start;
  const neededKw = Math.max(running, peak) / 1000;
  const recommended = SIZES_KW.find((k) => k >= neededKw) ?? null;
  return { runningW: Math.round(running), peakW: Math.round(peak), neededKw: round1(neededKw), recommendedKw: recommended, biggest: biggest.name };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const job = price(v);
  const profit = round2(job.price - job.cost);
  const marginPct = job.price > 0 ? round1((profit / job.price) * 100) : 0;
  const deposit = round2((job.price * v.depositPct) / 100);
  const upfront = round2(job.equipment + job.gas + v.permitFee + v.subCost);
  const gap = round2(Math.max(0, upfront - deposit));
  const perCrewHr = (job.hours + v.driveHrs) * v.crew > 0 ? round2(job.price / ((job.hours + v.driveHrs) * v.crew)) : null;
  const advice = [];
  advice.push(`Quote ${usd(job.price)}. It costs you ${usd(job.cost)} and leaves ${usd(profit)} (${marginPct}% of the price).`);
  if (job.minApplied) advice.push(`Your ${usd(v.minCharge)} minimum charge sets this price: the cost-plus price is only ${usd(job.wanted)}.`);
  const parts = [["the generator, switch and pad", job.equipment], ["labour", job.labor], ["the gas run", job.gas], ["the electrical run", job.elec], ["permit and subcontractors", v.permitFee + v.subCost], ["the expected callback", job.expectedCallback], ["commissioning", v.commissionCost]].sort((a, b) => b[1] - a[1]);
  advice.push(`The biggest cost is ${parts[0][0]} at ${usd(parts[0][1])}, ${Math.round((parts[0][1] / job.cost) * 100)}% of the job.${perCrewHr === null ? "" : ` The price earns ${usd(perCrewHr)} per person-hour including the drive.`}`);
  advice.push(deposit >= upfront
    ? `A ${v.depositPct}% deposit of ${usd(deposit)} covers the ${usd(upfront)} you buy before the install day (generator, switch, pad, gas materials, permit, subcontractors).`
    : `A ${v.depositPct}% deposit of ${usd(deposit)} leaves you ${usd(gap)} out of pocket on the ${usd(upfront)} you buy before the install day. Ask for ${Math.min(100, Math.ceil((upfront / job.price) * 100))}% up front to carry none of it.`);
  const overruns = [0, 25, 50, 100].map((p) => {
    const c = jobCost(v, { overrun: p });
    const pr = round2(job.price - c.cost);
    return { overrunPct: p, hours: c.hours, cost: c.cost, profit: pr, marginPct: round1((pr / job.price) * 100) };
  });
  advice.push(`If the install runs 50% over its ${v.installHrs} hours, a fixed price keeps ${usd(overruns[2].profit)} (${overruns[2].marginPct}%) instead of ${usd(profit)}. Double the hours and it keeps ${usd(overruns[3].profit)}.`);
  let service = null;
  if (v.planPrice > 0) {
    const perYear = v.planPrice - v.planCost;
    const expected = round2((v.planAttachPct / 100) * perYear * v.planYears);
    service = { perYear: round2(perYear), expected, years: v.planYears, attachPct: v.planAttachPct };
    advice.push(`A ${usd(v.planPrice)} a year service plan nets ${usd(perYear)} a year. At ${v.planAttachPct}% take-up over ${v.planYears} years it adds ${usd(expected)} of expected profit to every install.`);
  }
  const margins = [20, 25, 30, 35, 40].map((m) => {
    const p = price(v, m);
    return { marginPct: m, price: p.price, profit: round2(p.price - p.cost) };
  });
  const size = sizeCheck(v);
  if (size.recommendedKw) advice.push(`Size check: the loads you listed run about ${size.runningW.toLocaleString("en-US")} W and peak near ${size.peakW.toLocaleString("en-US")} W when the ${size.biggest ?? "largest motor"} starts, so look at ${size.recommendedKw} kW or larger. This is a rough screen, not a load calculation: size from the manufacturer's tables and the electrical code.`);
  else advice.push(`Size check: the loads you listed need about ${size.neededKw} kW, above the common home sizes. Split the loads or use a commercial unit.`);
  return { error: null, input: v, job: { ...job, profit, marginPct, deposit, upfront, gap, perCrewHr }, overruns, margins, service, size, advice };
}

export function sampleInput() {
  return {
    genCost: "3600", switchCost: "650", padCost: "180", gasRunFt: "40", gasPerFt: "14", gasFee: "250", elecRunFt: "30", elecPerFt: "9", permitFee: "225", subCost: "400",
    commissionCost: "120", installHrs: "14", crew: "2", laborRate: "48", driveHrs: "2", callbackPct: "5", callbackCost: "450", marginPct: "30", depositPct: "30",
    minCharge: "6000", planPrice: "349", planCost: "170", planAttachPct: "40", planYears: "5", acTons: "3", wellHp: "0.75", sumpPumps: "1", range: "0", waterHeater: "0", baseWatts: "3500",
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
  const head = "overrun_pct,hours,cost,profit,margin_pct";
  return [head, ...result.overruns.map((r) => [r.overrunPct, r.hours, r.cost, r.profit, r.marginPct].join(","))].join("\n");
}
