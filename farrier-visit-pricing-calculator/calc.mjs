// Farrier visit pricing maths. Pure functions, no DOM, no network.
// Every figure is the farrier's own input; nothing here is a market rate.

export const SAMPLE = {
  horses: "3", minPerHorse: "50", setupMin: "15", driveMin: "30", miles: "20", costPerMile: "0.80",
  materials: "18", dayHours: "9", workDays: "200", lostPct: "10", fixedYear: "9000", target: "70000",
  feePct: "3", currentPerHorse: "55",
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
  const horses = num(raw.horses), minPerHorse = num(raw.minPerHorse), driveMin = num(raw.driveMin);
  const dayHours = num(raw.dayHours), workDays = num(raw.workDays), fixedYear = num(raw.fixedYear), target = num(raw.target);
  if (!(horses >= 1)) errors.push("Enter horses per typical stop (1 or more).");
  if (!(minPerHorse > 0)) errors.push("Enter minutes of work per horse (more than 0).");
  if (!(driveMin >= 0)) errors.push("Enter drive minutes between stops (0 or more).");
  if (!(dayHours > 0 && dayHours <= 24)) errors.push("Enter working hours per day, including driving (more than 0, at most 24).");
  if (!(workDays > 0 && workDays <= 366)) errors.push("Enter working days per year (1 to 366).");
  if (!(fixedYear >= 0)) errors.push("Enter yearly fixed costs: insurance, tools, truck payment, forge, phone (0 or more).");
  if (!(target >= 0)) errors.push("Enter the income you want to take home per year (0 or more).");
  const setupMin = opt(raw.setupMin, 0), miles = opt(raw.miles, 0), costPerMile = opt(raw.costPerMile, 0);
  const materials = opt(raw.materials, 0), lostPct = opt(raw.lostPct, 0), feePct = opt(raw.feePct, 0);
  const currentPerHorse = opt(raw.currentPerHorse, NaN);
  for (const [n, v] of [["Setup minutes", setupMin], ["Miles between stops", miles], ["Cost per mile", costPerMile], ["Materials per horse", materials]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(lostPct >= 0 && lostPct < 100)) errors.push("Lost days must be from 0 to under 100 percent.");
  if (!(feePct >= 0 && feePct < 50)) errors.push("Card fee must be from 0 to under 50 percent.");
  if (currentPerHorse === currentPerHorse && !(currentPerHorse >= 0)) errors.push("Current price per horse must be 0 or more.");
  return { errors, horses, minPerHorse, setupMin, driveMin, miles, costPerMile, materials, dayHours, workDays, lostPct, feePct, fixedYear, target, currentPerHorse };
}

// Time-share pricing: a stop uses a share of the day equal to its minutes over the working minutes, and that share
// of the day's required revenue is its price. Two parts fall out: a trip charge (drive + setup + travel cost) and a
// per-horse rate (work minutes + materials).
function rates(p, dayRevenue) {
  const dayMin = p.dayHours * 60, k = 1 - p.feePct / 100;
  return {
    trip: (dayRevenue * (p.driveMin + p.setupMin) / dayMin + p.miles * p.costPerMile) / k,
    horse: (dayRevenue * p.minPerHorse / dayMin + p.materials) / k,
  };
}
const stopMinutes = (p, n) => p.driveMin + p.setupMin + n * p.minPerHorse;

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const paidDays = p.workDays * (1 - p.lostPct / 100);
  if (!(paidDays > 0)) return { errors: ["No paid days left after lost days."] };
  const dayMin = p.dayHours * 60;
  const dayRevenue = (p.fixedYear + p.target) / paidDays;
  const dayCost = p.fixedYear / paidDays;
  const minutes = stopMinutes(p, p.horses);
  if (minutes > dayMin) return { errors: [`One stop of ${p.horses} horses takes ${minutes} minutes, more than a ${p.dayHours}-hour day. Lower the horses per stop or raise the day length.`] };
  const target = rates(p, dayRevenue), even = rates(p, dayCost);
  const priceAt = (r, n) => r.trip + n * r.horse;
  const price = priceAt(target, p.horses);
  const stopsPerDay = dayMin / minutes;
  const sizes = [...new Set([1, 2, 3, 4, 6, 8, p.horses])].filter((n) => stopMinutes(p, n) <= dayMin).sort((a, b) => a - b);
  const sweep = sizes.map((n) => ({ n, minutes: stopMinutes(p, n), perDay: dayMin / stopMinutes(p, n), price: round2(priceAt(target, n)), perHorse: round2(priceAt(target, n) / n), breakEven: round2(priceAt(even, n)) }));
  const findings = [];
  let current = null;
  if (p.currentPerHorse >= 0) {
    const k = 1 - p.feePct / 100;
    const dayProfit = (n) => (dayMin / stopMinutes(p, n)) * (n * p.currentPerHorse * k - p.miles * p.costPerMile - n * p.materials) - dayCost;
    const takeHome = dayProfit(p.horses) * paidDays;
    const need = dayRevenue - dayCost;
    let minHorses = null;
    for (let n = 1; n <= 40 && stopMinutes(p, n) <= dayMin; n++) if (dayProfit(n) >= need) { minHorses = n; break; }
    current = { perHorse: p.currentPerHorse, takeHome, minHorses };
    if (takeHome < p.target)
      findings.push({ severity: takeHome < 0 ? "high" : "medium", title: `At ${dollars(p.currentPerHorse)} a horse and ${p.horses} horses a stop you take home about ${dollars(takeHome)} a year against your ${dollars(p.target)} target. Price for the target is ${dollars(price / p.horses)} a horse at this stop size.` });
    if (takeHome < p.target && minHorses && minHorses > p.horses)
      findings.push({ severity: "medium", title: `At ${dollars(p.currentPerHorse)} a horse you need stops of about ${minHorses} horses to reach the target. Smaller stops need a trip charge.` });
    if (takeHome < p.target && !minHorses)
      findings.push({ severity: "medium", title: `At ${dollars(p.currentPerHorse)} a horse no stop size fits the day and pays the target; the per-horse rate itself is too low.` });
  }
  findings.push({ severity: "info", title: `Two-part price for your target: a trip charge of ${dollars(target.trip)} per stop plus ${dollars(target.horse)} per horse. A ${p.horses}-horse stop comes to ${dollars(price)}.` });
  if (p.horses > 1) {
    const one = priceAt(target, 1);
    findings.push({ severity: "info", title: `A one-horse stop needs ${dollars(one)}, because drive and setup time are the same for one horse as for several. Quoting a flat rate per horse underprices small stops.` });
  }
  if (p.lostPct >= 15) {
    const noLoss = rates(p, (p.fixedYear + p.target) / p.workDays);
    findings.push({ severity: "info", title: `Losing ${p.lostPct}% of working days to weather, no-shows and injuries adds about ${dollars(price - priceAt(noLoss, p.horses))} to each stop. A late-cancel fee protects it.` });
  }
  return { errors: [], input: p, paidDays, dayRevenue, price: round2(price), perHorse: round2(price / p.horses), breakEven: round2(priceAt(even, p.horses)), tripCharge: round2(target.trip), horseRate: round2(target.horse), stopMinutes: minutes, stopsPerDay, current, findings, sweep };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Farrier pricing: ${p.horses} horses a stop, ${r.stopMinutes} min a stop, about ${r.stopsPerDay.toFixed(1)} stops a day, ${r.paidDays.toFixed(0)} paid days a year`,
    `Day revenue needed: ${dollars(r.dayRevenue)}; trip charge ${dollars(r.tripCharge)} plus ${dollars(r.horseRate)} a horse`,
    `Price for ${dollars(p.target)} a year: ${dollars(r.price)} a stop (${dollars(r.perHorse)} a horse); break-even ${dollars(r.breakEven)} a stop`,
    ...(r.current ? [`At ${dollars(r.current.perHorse)} a horse: about ${dollars(r.current.takeHome)} a year`] : []),
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["horses,minutes,stops_per_day,price_per_stop,price_per_horse,break_even_per_stop", ...r.sweep.map((x) => `${x.n},${x.minutes},${x.perDay.toFixed(1)},${x.price.toFixed(2)},${x.perHorse.toFixed(2)},${x.breakEven.toFixed(2)}`)].join("\n");
}
