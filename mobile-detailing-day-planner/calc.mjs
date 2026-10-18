// Mobile detailing day planner: pure functions, no dependencies, nothing leaves the browser.
//
// Model, stated so the page can say it: every job sits somewhere along one road out from the shop, `driveMin` minutes
// away. A day is one outbound sweep and one trip back, so the drive for any set of jobs is twice the farthest job.
// That under-counts a day that zigzags and over-counts one with two jobs on the same street, which is why the page
// calls it an estimate and lets the user override with a flat extra-drive allowance.

export const MAX_JOBS = 14;

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const percent = (x) => `${Math.round(x * 100)}%`;
export const hours = (h) => `${Math.floor(h + 1e-9)}h ${String(Math.round((h - Math.floor(h + 1e-9)) * 60) % 60).padStart(2, "0")}m`;

// label, price, hours on site, drive minutes from the shop, supplies cost (optional)
export function parseJobs(text) {
  const jobs = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || /^label\b/i.test(line)) return;
    const parts = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 4) { errors.push(`Line ${i + 1}: need label, price, hours on site, drive minutes (supplies optional)`); return; }
    const [label, p, h, d, s] = parts;
    const price = num(p), onsite = num(h), driveMin = num(d), supplies = s === undefined || s === "" ? 0 : num(s);
    if (!(price >= 0) || !(onsite > 0) || !(driveMin >= 0) || !(supplies >= 0)) { errors.push(`Line ${i + 1}: price, hours, drive minutes and supplies must be numbers (hours above zero)`); return; }
    jobs.push({ label: label || `Job ${jobs.length + 1}`, price, onsite, driveMin, supplies });
  });
  if (jobs.length > MAX_JOBS) {
    errors.push(`Only the first ${MAX_JOBS} jobs are planned; the rest were left out.`);
    jobs.length = MAX_JOBS;
  }
  return { jobs, errors };
}

// The economics of one chosen set of jobs.
export function evaluate(set, o) {
  if (!set.length) return { set, jobs: 0, revenue: 0, supplies: 0, onsite: 0, driveHours: 0, hoursUsed: 0, vehicle: 0, fixed: 0, profit: 0, perHour: 0 };
  const farthest = Math.max(...set.map((j) => j.driveMin));
  const driveHours = (2 * farthest) / 60 + (o.extraDriveMin || 0) / 60;
  const onsite = set.reduce((a, j) => a + j.onsite, 0);
  const revenue = set.reduce((a, j) => a + j.price, 0);
  const supplies = set.reduce((a, j) => a + j.supplies, 0);
  const vehicle = driveHours * (o.vehicleCostPerHour || 0);
  const fixed = o.dailyFixed || 0;
  const hoursUsed = onsite + driveHours;
  const profit = revenue - supplies - vehicle - fixed;
  return { set, jobs: set.length, revenue, supplies, onsite, driveHours, hoursUsed, vehicle, fixed, profit, perHour: hoursUsed > 0 ? profit / hoursUsed : 0 };
}

function subsets(jobs, o) {
  const out = [];
  const n = jobs.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const set = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) set.push(jobs[i]);
    const e = evaluate(set, o);
    if (e.hoursUsed <= o.hoursAvailable + 1e-9) out.push(e);
  }
  return out;
}

// Best set to take, by take-home profit for the day, and best by profit per hour worked.
export function planDay(jobs, o) {
  const options = { hoursAvailable: 8, targetHourly: 30, vehicleCostPerHour: 20, dailyFixed: 0, extraDriveMin: 0, ...o };
  const feasible = subsets(jobs, options);
  if (!feasible.length) return { options, best: evaluate([], options), bestHourly: null, declined: jobs.slice(), none: true, perJob: [] };
  const better = (a, b) => (a.profit > b.profit + 1e-9 || (Math.abs(a.profit - b.profit) <= 1e-9 && a.hoursUsed < b.hoursUsed) ? a : b);
  const best = feasible.reduce(better);
  const bestHourly = feasible.reduce((a, b) => (b.perHour > a.perHour + 1e-9 ? b : a));
  const inBest = new Set(best.set);
  const declined = jobs.filter((j) => !inBest.has(j));
  const perJob = best.set.map((j) => {
    const without = evaluate(best.set.filter((x) => x !== j), options);
    const marginalHours = best.hoursUsed - without.hoursUsed;
    const marginalVehicle = best.vehicle - without.vehicle;
    const contribution = best.profit - (without.jobs ? without.profit : -options.dailyFixed);
    const needed = options.targetHourly * marginalHours + j.supplies + marginalVehicle;
    return { job: j, marginalHours, contribution, perHour: marginalHours > 0 ? contribution / marginalHours : 0, priceToHitTarget: needed, gap: needed - j.price };
  });
  return { options, best, bestHourly, declined, perJob, none: false };
}

export function diagnose(plan) {
  const out = [];
  const { best, options, perJob, declined } = plan;
  if (plan.none) {
    out.push({ level: "high", title: "No single job fits the day", text: `Every job on its own needs more than ${options.hoursAvailable} hours including the drive. Lengthen the day, split the job, or quote it as a multi-visit job.` });
    return out;
  }
  if (best.profit <= 0) out.push({ level: "high", title: "The best day on this list loses money", text: `After supplies, vehicle cost and ${money(best.fixed)} of daily fixed costs, the best set of jobs leaves ${money(best.profit)}. Raise prices or skip the day.` });
  else if (best.perHour < options.targetHourly) out.push({ level: "high", title: `Below your ${money(options.targetHourly)} an hour`, text: `The best set leaves ${money(best.profit)} over ${hours(best.hoursUsed)} worked, ${money(best.perHour)} an hour including the drive. The jobs below show which ones to reprice.` });
  for (const p of perJob.filter((p) => p.gap > 0.5 && p.contribution > 0)) out.push({ level: "medium", title: `${p.job.label} is under target`, text: `It adds ${money(p.contribution)} for ${hours(p.marginalHours)} of added time (${money(p.perHour)} an hour). To earn ${money(options.targetHourly)} an hour it would need ${money(p.priceToHitTarget)}, ${money(p.gap)} more than ${money(p.job.price)}.` });
  for (const p of perJob.filter((p) => p.contribution <= 0)) out.push({ level: "high", title: `${p.job.label} costs more than it earns`, text: `Taking it changes the day by ${money(p.contribution)}. It only made the list because nothing better fit; consider declining it.` });
  const far = best.set.reduce((a, j) => (j.driveMin > a.driveMin ? j : a), best.set[0]);
  if (best.set.length > 1 && (2 * far.driveMin) / 60 > 0.25 * options.hoursAvailable) out.push({ level: "medium", title: `${far.label} stretches the whole day`, text: `At ${far.driveMin} minutes out it sets a ${hours(best.driveHours)} round trip for every job. Charge a travel fee on it, or batch far jobs onto one day.` });
  const spare = options.hoursAvailable - best.hoursUsed;
  if (declined.length && spare > 0.25) {
    const cand = declined.filter((j) => j.onsite + Math.max(0, (2 * j.driveMin) / 60 - best.driveHours) <= spare + 1e-9);
    if (!cand.length) out.push({ level: "info", title: `${hours(spare)} unused`, text: "None of the declined jobs fits the leftover time, so the gap is either a gap to fill with a new booking or time off." });
  }
  if (declined.length) out.push({ level: "info", title: `Declined for this day: ${declined.map((j) => j.label).join(", ")}`, text: "They did not make the most profitable set that fits your hours. Offer them another day rather than dropping them." });
  if (!out.length) out.push({ level: "info", title: "This day clears your target", text: `${money(best.profit)} take-home over ${hours(best.hoursUsed)}, ${money(best.perHour)} an hour.` });
  return out;
}

// What a package should cost to hit a target, from the time it takes. Used by the quote line on the page.
export function priceFor({ onsite, driveMin, supplies, targetHourly, vehicleCostPerHour, sharedDriveFraction = 0 }) {
  const driveHours = (2 * driveMin) / 60 * (1 - Math.min(1, Math.max(0, sharedDriveFraction)));
  return targetHourly * (onsite + driveHours) + supplies + driveHours * vehicleCostPerHour;
}
