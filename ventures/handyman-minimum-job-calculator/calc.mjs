// Smallest job worth driving to, price floor per job, and effective hourly for a handyman or
// small repair business. Pure functions, no DOM. Arithmetic on figures the user types; no market
// rate, licence rule or tax treatment is asserted anywhere in here.

export const DEFAULTS = Object.freeze({
  ownerHourly: 0,
  overheadPerMonth: 0,
  billableHoursPerMonth: 0,
  driveMinutesOneWay: 0,
  milesRoundTrip: 0,
  costPerMile: 0,
  quoteMinutes: 0,
  supplyRunMinutes: 0,
  cardFeePct: 3,
  quotedRate: 0,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const cells = (line) => (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));

// Lines: "job, work hours, materials cost $, price you quote $". Price may be blank (floor only).
// Header optional.
export function parseJobs(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = cells(line);
    const hours = num(c[1], NaN);
    if (c.length < 2 || !Number.isFinite(hours)) { if (rows.length || !/job|hours|label|name/i.test(line)) skipped++; continue; }
    const materials = num(c[2], 0), price = num(c[3], 0);
    if (!(hours > 0) || !(materials >= 0) || !(price >= 0)) { skipped++; continue; }
    rows.push({ label: c[0] || "Job", workHours: hours, materials, price });
  }
  const warnings = skipped ? [`${skipped} job line(s) skipped (need a name, work hours above 0, and materials and price of 0 or more).`] : [];
  if (!rows.length) return { error: "Add at least one job line: name, work hours, materials $, price you quote $ (price may be blank)." };
  return { rows, warnings };
}

const clean = (s) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (s && s[k] !== undefined) o[k] = num(s[k], DEFAULTS[k]);
  return o;
};

const HOUR_STEPS = [0.5, 1, 1.5, 2, 3, 4, 6, 8];

export function analyze(settingsIn, jobs) {
  const o = clean(settingsIn);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.ownerHourly <= 0) return { error: "Enter the hourly pay you want for your own time." };
  if (o.overheadPerMonth > 0 && o.billableHoursPerMonth <= 0) return { error: "Enter the billable work hours you do in a typical month so overhead can be spread over them." };
  if (o.cardFeePct >= 100) return { error: "Payment fee must be under 100%." };

  const warnings = [];
  const fee = o.cardFeePct / 100;
  const overheadPerHour = o.overheadPerMonth > 0 ? o.overheadPerMonth / o.billableHoursPerMonth : 0;
  // Time you spend on a job that you cannot put on the clock: driving, estimating, supply runs.
  const tripHours = (2 * o.driveMinutesOneWay + o.quoteMinutes + o.supplyRunMinutes) / 60;
  const mileage = o.milesRoundTrip * o.costPerMile;
  const tripCost = tripHours * o.ownerHourly + mileage;
  const minimumTripCharge = tripCost / (1 - fee);

  const lines = jobs.map((j) => {
    const totalHours = j.workHours + tripHours;
    const labor = j.workHours * o.ownerHourly + tripHours * o.ownerHourly;
    const overhead = j.workHours * overheadPerHour;
    const cost = labor + overhead + j.materials + mileage;
    const floor = cost / (1 - fee);
    const hasPrice = j.price > 0;
    const cardFee = j.price * fee;
    const profit = hasPrice ? j.price - cardFee - cost : null;
    // What you actually keep per hour of your whole time on this job, drive and estimate included.
    const effectiveHourly = hasPrice ? (j.price - cardFee - j.materials - mileage - overhead) / totalHours : null;
    return {
      ...j, totalHours, labor, overhead, mileage, cost, floor, hasPrice, cardFee, profit, effectiveHourly,
      meetsFloor: hasPrice ? j.price + 1e-9 >= floor : null,
      statedHourly: hasPrice ? j.price / j.workHours : null,
    };
  });

  const priced = lines.filter((l) => l.hasPrice);
  const below = priced.filter((l) => !l.meetsFloor);
  let verdict;
  if (!priced.length) verdict = "No prices entered, so only the floor for each job is shown.";
  else if (!below.length) verdict = `All ${priced.length} priced job(s) clear the price that pays your hourly target and overhead.`;
  else verdict = `${below.length} of ${priced.length} priced job(s) are under the price that pays your hourly target and overhead: ${below.map((l) => l.label).join(", ")}.`;

  // Smallest job at your quoted hourly rate: each work hour contributes the rate after fees, minus
  // your pay target and overhead; the trip has to be paid for out of that.
  let minimumJob = null;
  const contributionPerHour = o.quotedRate * (1 - fee) - o.ownerHourly - overheadPerHour;
  if (o.quotedRate > 0) {
    if (contributionPerHour <= 0) {
      warnings.push(`At a ${money2(o.quotedRate)} quoted hourly rate, each hour of work earns no more than your pay target and overhead after fees, so no job size covers the trip. The rate has to rise.`);
    } else {
      const hours = tripCost / contributionPerHour;
      minimumJob = { hours, price: hours * o.quotedRate, contributionPerHour };
    }
  }

  const ladder = o.quotedRate > 0 ? HOUR_STEPS.map((h) => {
    const price = h * o.quotedRate;
    const keep = price - price * fee - h * overheadPerHour - mileage;
    const effectiveHourly = keep / (h + tripHours);
    return { hours: h, price, effectiveHourly, coversTarget: effectiveHourly + 1e-9 >= o.ownerHourly };
  }) : [];

  const losing = priced.filter((l) => l.profit < 0);
  if (losing.length) warnings.push(`${losing.map((l) => l.label).join(", ")} pays you less than your hourly target once drive, estimate and supply time are counted.`);

  return { settings: o, overheadPerHour, tripHours, mileage, tripCost, minimumTripCharge, lines, verdict, minimumJob, ladder, warnings };
}

export function sampleJob() {
  return {
    jobs: "job,work hours,materials,price\nHang a TV and hide the cable,1.5,25,150\nReplace a bathroom faucet,2,60,210\nPatch and paint a drywall hole,3,40,260\nAssemble two bookcases,1,0,70\nFix a sticking door,0.5,5,60",
    settings: { ownerHourly: 40, overheadPerMonth: 600, billableHoursPerMonth: 90, driveMinutesOneWay: 25, milesRoundTrip: 22, costPerMile: 0.65, quoteMinutes: 20, supplyRunMinutes: 30, cardFeePct: 3, quotedRate: 85 },
  };
}

const f2 = (v) => (v === null || !Number.isFinite(v) ? "" : v.toFixed(2));
export function reportCsv(r) {
  const out = [["Job", "Work hours", "Total hours incl. drive and estimate", "Materials", "Your price", "Cost to you", "Price floor", "Profit over your pay target", "Effective hourly (all your time)", "Vs floor"]];
  for (const l of r.lines) out.push([l.label, l.workHours, f2(l.totalHours), f2(l.materials), l.hasPrice ? f2(l.price) : "", f2(l.cost), f2(l.floor), f2(l.profit), f2(l.effectiveHourly), l.meetsFloor === null ? "" : l.meetsFloor ? "meets" : "under"]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => v.toFixed(d) + "%";
