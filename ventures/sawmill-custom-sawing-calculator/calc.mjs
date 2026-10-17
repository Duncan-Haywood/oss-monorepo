// Portable-sawmill custom sawing math. Pure functions, no I/O. USD, inches, feet, board feet; every input is entered by the user.
// Answers: what does a sawing hour cost me, what must I charge per board foot or per hour, and which logs lose money at a flat rate.

const r2 = (x) => Math.round(x * 100) / 100;
export const money = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US"));
export const money2 = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2));

export const DEFAULTS = {
  millPrice: 22000,       // purchase price of the mill and its trailer
  resalePct: 40,          // % of price recovered at resale
  years: 8,               // years you expect to run it
  annualHours: 600,       // sawing hours per year, not counting travel
  interestPct: 6,         // cost of money on the average balance, % a year
  fuelGalPerHour: 1,
  fuelPrice: 4,
  bladePrice: 18,
  resharpensPerBlade: 4,  // times a blade is sharpened before it is scrapped
  hoursPerSharpen: 3,     // sawing hours between sharpenings
  sharpenCost: 5,
  maintPerHour: 4,        // oil, belts, guides, repairs per sawing hour
  helpers: 1,
  helperWage: 18,         // $/hr loaded
  ownerWage: 30,          // $/hr you want to pay yourself
  bfPerHour: 150,         // sawn board feet per sawing hour with the crew above
  handlingMinPerLog: 4,   // loading, turning, clamping, per log
  setupHours: 1.5,        // set up and tear down on a site, per job
  tripMiles: 25,          // one-way
  perMile: 0.7,
  logs: 20,
  smallEndIn: 16,
  lengthFt: 10,
  taperInPer8Ft: 1,
  recoveryPct: 55,        // sawn lumber as % of the log's true volume (kerf, slabs, edgings)
  ratePerBf: 0.55,        // what you charge per sawn board foot
  hourlyRate: 85,         // what you charge per hour on the clock
  marginPct: 20,          // margin you want over cost when quoting
};

const num = (o, k) => (o[k] === undefined || o[k] === null || o[k] === "" ? DEFAULTS[k] : Number(o[k]));

/** Doyle log rule, board feet from small-end diameter inches and length feet. Zero below 5 in. */
export function doyle(smallEndIn, lengthFt) {
  if (!(smallEndIn > 4) || !(lengthFt > 0)) return 0;
  return ((smallEndIn - 4) / 4) ** 2 * lengthFt;
}

/** Sawn board feet estimated from true log volume: mid diameter, 12 board feet per cubic foot, times recovery. */
export function sawnBf(smallEndIn, lengthFt, taperInPer8Ft, recoveryPct) {
  const mid = smallEndIn + (taperInPer8Ft * (lengthFt / 8)) / 2;
  const cuFt = Math.PI / 4 * (mid / 12) ** 2 * lengthFt;
  return cuFt * 12 * (recoveryPct / 100);
}

export function costPerHour(v) {
  const ownership = (v.millPrice * (1 - v.resalePct / 100)) / v.years / v.annualHours
    + (v.millPrice * (1 + v.resalePct / 100) / 2 * (v.interestPct / 100)) / v.annualHours;
  const fuel = v.fuelGalPerHour * v.fuelPrice;
  const blade = (v.bladePrice + v.sharpenCost * v.resharpensPerBlade) / (v.hoursPerSharpen * (v.resharpensPerBlade + 1));
  const machine = ownership + fuel + blade + v.maintPerHour;
  const labor = v.helpers * v.helperWage + v.ownerWage;
  return { ownership: r2(ownership), fuel: r2(fuel), blade: r2(blade), maint: r2(v.maintPerHour), machine: r2(machine), labor: r2(labor), total: r2(machine + labor) };
}

function validate(v) {
  const pos = ["millPrice", "years", "annualHours", "bfPerHour", "lengthFt", "recoveryPct"];
  for (const k of pos) if (!(v[k] > 0)) return `Enter a value above 0 for ${k}.`;
  const nonneg = ["fuelGalPerHour", "fuelPrice", "bladePrice", "resharpensPerBlade", "sharpenCost", "maintPerHour", "helpers", "helperWage", "ownerWage", "handlingMinPerLog", "setupHours", "tripMiles", "perMile", "ratePerBf", "hourlyRate", "interestPct", "taperInPer8Ft", "marginPct"];
  for (const k of nonneg) if (!(v[k] >= 0)) return `${k} cannot be negative.`;
  if (!(v.hoursPerSharpen > 0)) return "Hours per sharpening must be above 0.";
  if (!(v.resalePct >= 0 && v.resalePct <= 100)) return "Resale value must be 0 to 100 percent.";
  if (!(v.recoveryPct <= 100)) return "Recovery cannot exceed 100 percent.";
  if (!(v.logs >= 1)) return "Enter at least one log.";
  if (!(v.smallEndIn > 4)) return "Small-end diameter must be above 4 inches.";
  if (v.marginPct >= 100) return "Margin must stay below 100 percent.";
  return null;
}

/** One job: n logs of one size. Sawing time = board feet / rate + handling per log; setup is labor only; trip is cash. */
export function jobEconomics(v, c = costPerHour(v)) {
  const bf = sawnBf(v.smallEndIn, v.lengthFt, v.taperInPer8Ft, v.recoveryPct) * v.logs;
  const doyleBf = doyle(v.smallEndIn, v.lengthFt) * v.logs;
  const sawHours = bf / v.bfPerHour + (v.logs * v.handlingMinPerLog) / 60;
  const trip = v.tripMiles * 2 * v.perMile;
  const cost = sawHours * c.total + v.setupHours * c.labor + trip;
  const clock = sawHours + v.setupHours;
  const perBf = { revenue: bf * v.ratePerBf };
  const hourly = { revenue: clock * v.hourlyRate };
  for (const o of [perBf, hourly]) { o.net = o.revenue - cost; o.netPerClockHour = o.net / clock; }
  return {
    bf: r2(bf), doyleBf: r2(doyleBf), overrunPct: doyleBf > 0 ? r2((bf / doyleBf - 1) * 100) : null,
    sawHours: r2(sawHours), clockHours: r2(clock), trip: r2(trip), cost: r2(cost), costPerBf: r2(cost / bf),
    perBf: { revenue: r2(perBf.revenue), net: r2(perBf.net), netPerClockHour: r2(perBf.netPerClockHour) },
    hourly: { revenue: r2(hourly.revenue), net: r2(hourly.net), netPerClockHour: r2(hourly.netPerClockHour) },
    breakEvenPerBf: r2(cost / bf),
    breakEvenHourly: r2(cost / clock),
    quotePerBf: r2(cost / bf / (1 - v.marginPct / 100)),
    quoteHourly: r2(cost / clock / (1 - v.marginPct / 100)),
    better: perBf.net >= hourly.net ? "perBf" : "hourly",
  };
}

/** Net at your flat per-board-foot rate by log diameter: small logs cost the same handling time for few board feet. */
export function byDiameter(v, diameters = [8, 10, 12, 14, 16, 20, 24, 30], c = costPerHour(v)) {
  return diameters.map((d) => {
    const bf = sawnBf(d, v.lengthFt, v.taperInPer8Ft, v.recoveryPct);
    const hours = bf / v.bfPerHour + v.handlingMinPerLog / 60;
    const cost = hours * c.total;
    const revenue = bf * v.ratePerBf;
    return { diameter: d, bf: r2(bf), minutes: Math.round(hours * 60), cost: r2(cost), revenue: r2(revenue), net: r2(revenue - cost), netPerHour: r2((revenue - cost) / hours), breakEvenPerBf: r2(cost / bf) };
  });
}

export function analyze(input = {}) {
  const v = {};
  for (const k of Object.keys(DEFAULTS)) v[k] = num(input, k);
  const err = validate(v);
  if (err) return { error: err };
  const c = costPerHour(v);
  const job = jobEconomics(v, c);
  const table = byDiameter(v, undefined, c);
  const minPaying = table.find((r) => r.net >= 0);
  const advice = [];
  advice.push(`A sawing hour costs ${money2(c.total)} (${money2(c.machine)} machine, ${money2(c.labor)} labor). At ${v.bfPerHour} board feet an hour that is ${money2(c.total / v.bfPerHour)} per board foot before log handling, setup and travel.`);
  advice.push(`This job: ${v.logs} logs of ${v.smallEndIn} in. x ${v.lengthFt} ft, about ${Math.round(job.bf)} sawn board feet in ${job.clockHours} clock hours. It costs you ${money(job.cost)}; break-even is ${money2(job.breakEvenPerBf)}/bf or ${money2(job.breakEvenHourly)}/hr.`);
  advice.push(`To clear a ${v.marginPct}% margin quote ${money2(job.quotePerBf)}/bf or ${money2(job.quoteHourly)}/hr. At your ${money2(v.ratePerBf)}/bf you net ${money(job.perBf.net)} (${money2(job.perBf.netPerClockHour)}/clock hour); at ${money2(v.hourlyRate)}/hr you net ${money(job.hourly.net)}. ${job.better === "perBf" ? "Per board foot" : "Hourly"} pays more on this job.`);
  if (minPaying && minPaying.diameter > table[0].diameter) advice.push(`At a flat ${money2(v.ratePerBf)}/bf, logs under ${minPaying.diameter} in. at the small end lose money. Charge a minimum per log or switch small logs to hourly.`);
  else if (!minPaying) advice.push(`At a flat ${money2(v.ratePerBf)}/bf no log size up to 30 in. covers your cost. Raise the rate or check board feet per hour.`);
  return { inputs: v, cost: c, job, byDiameter: table, minPayingDiameter: minPaying ? minPaying.diameter : null, advice, profitable: job[job.better].net >= 0, costPerBfNoHandling: r2(c.total / v.bfPerHour) };
}

export function sampleInput() {
  return { logs: 24, smallEndIn: 14, lengthFt: 10, ratePerBf: 0.55,hourlyRate: 85 };
}

export function toCsv(r) {
  const rows = [["diameter in", "sawn bf", "minutes", "cost", "revenue", "net", "net per hour", "break-even per bf"]];
  for (const t of r.byDiameter) rows.push([t.diameter, t.bf, t.minutes, t.cost, t.revenue, t.net, t.netPerHour, t.breakEvenPerBf]);
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
