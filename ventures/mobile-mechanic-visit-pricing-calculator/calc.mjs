// Mobile mechanic visit pricing maths. Pure functions, no DOM, no network.
// Every figure is the mobile mechanic's own input; nothing here is a market rate.

export const SAMPLE = {
  jobs: "3", minPerJob: "50", setupMin: "15", driveMin: "30", miles: "20", costPerMile: "0.80",
  materials: "60", dayHours: "9", workDays: "200", lostPct: "10", fixedYear: "9000", target: "70000",
  feePct: "3", markup: "30", currentPerJob: "95",
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

export function parse(raw) {
  const errors = [];
  const jobs = num(raw.jobs), minPerJob = num(raw.minPerJob), driveMin = num(raw.driveMin);
  const dayHours = num(raw.dayHours), workDays = num(raw.workDays), fixedYear = num(raw.fixedYear), target = num(raw.target);
  if (!(jobs >= 1)) errors.push("Enter jobs per typical stop (1 or more).");
  if (!(minPerJob > 0)) errors.push("Enter minutes of work per job (more than 0).");
  if (!(driveMin >= 0)) errors.push("Enter drive minutes between stops (0 or more).");
  if (!(dayHours > 0 && dayHours <= 24)) errors.push("Enter working hours per day, including driving (more than 0, at most 24).");
  if (!(workDays > 0 && workDays <= 366)) errors.push("Enter working days per year (1 to 366).");
  if (!(fixedYear >= 0)) errors.push("Enter yearly fixed costs: insurance, tools, van payment, tools, scan-tool subscriptions, phone (0 or more).");
  if (!(target >= 0)) errors.push("Enter the income you want to take home per year (0 or more).");
  const setupMin = opt(raw.setupMin, 0), miles = opt(raw.miles, 0), costPerMile = opt(raw.costPerMile, 0);
  const materials = opt(raw.materials, 0), markup = opt(raw.markup, 0), lostPct = opt(raw.lostPct, 0), feePct = opt(raw.feePct, 0);
  const currentPerJob = opt(raw.currentPerJob, NaN);
  for (const [n, v] of [["Setup minutes", setupMin], ["Miles between stops", miles], ["Cost per mile", costPerMile], ["Parts cost per job", materials], ["Parts markup", markup]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(lostPct >= 0 && lostPct < 100)) errors.push("Lost days must be from 0 to under 100 percent.");
  if (!(feePct >= 0 && feePct < 50)) errors.push("Card fee must be from 0 to under 50 percent.");
  if (currentPerJob === currentPerJob && !(currentPerJob >= 0)) errors.push("Current price per job must be 0 or more.");
  return { errors, jobs, minPerJob, setupMin, driveMin, miles, costPerMile, materials, markup, dayHours, workDays, lostPct, feePct, fixedYear, target, currentPerJob };
}

// Time-share pricing: a stop uses a share of the day equal to its minutes over the working minutes, and that share
// of the day's required revenue is its price. Two parts fall out: a trip charge (drive + setup + travel cost) and a
// per-job rate (work minutes + parts cost). Parts markup does not change the total; it decides how much of each job is parts and how much labor.
function rates(p, dayRevenue) {
  const dayMin = p.dayHours * 60, k = 1 - p.feePct / 100;
  return {
    trip: (dayRevenue * (p.driveMin + p.setupMin) / dayMin + p.miles * p.costPerMile) / k,
    job: (dayRevenue * p.minPerJob / dayMin + p.materials) / k,
  };
}
const stopMinutes = (p, n) => p.driveMin + p.setupMin + n * p.minPerJob;

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const paidDays = p.workDays * (1 - p.lostPct / 100);
  if (!(paidDays > 0)) return { errors: ["No paid days left after lost days."] };
  const dayMin = p.dayHours * 60;
  const dayRevenue = (p.fixedYear + p.target) / paidDays;
  const dayCost = p.fixedYear / paidDays;
  const minutes = stopMinutes(p, p.jobs);
  if (minutes > dayMin) return { errors: [`One stop of ${p.jobs} jobs takes ${minutes} minutes, more than a ${p.dayHours}-hour day. Lower the jobs per stop or raise the day length.`] };
  const target = rates(p, dayRevenue), even = rates(p, dayCost);
  const priceAt = (r, n) => r.trip + n * r.job;
  const price = priceAt(target, p.jobs);
  const stopsPerDay = dayMin / minutes;
  const sizes = [...new Set([1, 2, 3, 4, 6, 8, p.jobs])].filter((n) => stopMinutes(p, n) <= dayMin).sort((a, b) => a - b);
  const sweep = sizes.map((n) => ({ n, minutes: stopMinutes(p, n), perDay: dayMin / stopMinutes(p, n), price: round2(priceAt(target, n)), perJob: round2(priceAt(target, n) / n), breakEven: round2(priceAt(even, n)) }));
  const findings = [];
  let current = null;
  if (p.currentPerJob >= 0) {
    const k = 1 - p.feePct / 100;
    const dayProfit = (n) => (dayMin / stopMinutes(p, n)) * (n * (p.currentPerJob + p.materials * (1 + p.markup / 100)) * k - p.miles * p.costPerMile - n * p.materials) - dayCost;
    const takeHome = dayProfit(p.jobs) * paidDays;
    const need = dayRevenue - dayCost;
    let minJobs = null;
    for (let n = 1; n <= 40 && stopMinutes(p, n) <= dayMin; n++) if (dayProfit(n) >= need) { minJobs = n; break; }
    current = { perJob: p.currentPerJob, takeHome, minJobs };
    if (takeHome < p.target)
      findings.push({ severity: takeHome < 0 ? "high" : "medium", title: `At ${dollars(p.currentPerJob)} a job in labor and ${p.jobs} jobs a stop you take home about ${dollars(takeHome)} a year against your ${dollars(p.target)} target. Price for the target is ${dollars(price / p.jobs)} a job, parts included, at this stop size.` });
    if (takeHome < p.target && minJobs && minJobs > p.jobs)
      findings.push({ severity: "medium", title: `At ${dollars(p.currentPerJob)} a job you need stops of about ${minJobs} jobs to reach the target. Smaller stops need a trip charge.` });
    if (takeHome < p.target && !minJobs)
      findings.push({ severity: "medium", title: `At ${dollars(p.currentPerJob)} a job no stop size fits the day and pays the target; the per-job rate itself is too low.` });
  }
  const partsPrice = p.materials * (1 + p.markup / 100);
  if (p.materials > 0)
    findings.push({ severity: "info", title: `Each job carries ${dollars(partsPrice)} of parts (${dollars(p.materials)} cost, ${p.markup}% markup), so the labor charge for the target is ${dollars(target.job - partsPrice)} a job.` });
  findings.push({ severity: "info", title: `Two-part price for your target: a trip charge of ${dollars(target.trip)} per stop plus ${dollars(target.job)} per job. A ${p.jobs}-job stop comes to ${dollars(price)}.` });
  if (p.jobs > 1) {
    const one = priceAt(target, 1);
    findings.push({ severity: "info", title: `A one-job stop needs ${dollars(one)}, because drive and setup time are the same for one job as for several. Quoting a flat rate per job underprices small stops.` });
  }
  if (p.lostPct >= 15) {
    const noLoss = rates(p, (p.fixedYear + p.target) / p.workDays);
    findings.push({ severity: "info", title: `Losing ${p.lostPct}% of working days to weather, no-shows and parts delays adds about ${dollars(price - priceAt(noLoss, p.jobs))} to each stop. A late-cancel fee protects it.` });
  }
  return { errors: [], input: p, paidDays, dayRevenue, price: round2(price), perJob: round2(price / p.jobs), breakEven: round2(priceAt(even, p.jobs)), tripCharge: round2(target.trip), jobRate: round2(target.job), partsPrice: round2(partsPrice), laborRate: round2(target.job - partsPrice), stopMinutes: minutes, stopsPerDay, current, findings, sweep };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Mobile mechanic pricing: ${p.jobs} jobs a stop, ${r.stopMinutes} min a stop, about ${r.stopsPerDay.toFixed(1)} stops a day, ${r.paidDays.toFixed(0)} paid days a year`,
    `Day revenue needed: ${dollars(r.dayRevenue)}; trip charge ${dollars(r.tripCharge)} plus ${dollars(r.jobRate)} a job`,
    `Price for ${dollars(p.target)} a year: ${dollars(r.price)} a stop (${dollars(r.perJob)} a job); break-even ${dollars(r.breakEven)} a stop`,
    ...(r.current ? [`At ${dollars(r.current.perJob)} a job: about ${dollars(r.current.takeHome)} a year`] : []),
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["jobs,minutes,stops_per_day,price_per_stop,price_per_job,break_even_per_stop", ...r.sweep.map((x) => `${x.n},${x.minutes},${x.perDay.toFixed(1)},${x.price.toFixed(2)},${x.perJob.toFixed(2)},${x.breakEven.toFixed(2)}`)].join("\n");
}
