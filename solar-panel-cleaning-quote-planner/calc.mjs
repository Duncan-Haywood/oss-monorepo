// Solar panel cleaning quote planner: pure functions, no dependencies, nothing leaves the browser.
//
// Model, stated so the page can say it: a job's wall-clock time is setup + travel + (panels x minutes per panel x access
// factor) / crew size. Cost is crew labour over that whole time, plus consumables, plus vehicle cost per km, plus an
// overhead percentage on labour. Price is cost / (1 - target margin), never below the minimum call-out charge.
// The customer-payback side compares the clean price with the energy a clean array recovers, on the customer's numbers.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

// Minutes-per-panel multipliers against a ground-level or ground-mount array. Stated on the page; the user can override
// them by choosing "custom" and typing their own factor.
export const ACCESS = {
  ground: { label: "Ground mount / reachable from the ground", factor: 1.0 },
  single: { label: "Single-storey roof", factor: 1.4 },
  double: { label: "Two-storey or steep roof", factor: 1.9 },
  flat: { label: "Flat roof / commercial", factor: 1.15 },
};

export function jobCost(job, opts) {
  const crew = Math.max(1, Math.floor(opts.crew) || 1);
  const factor = ACCESS[job.access]?.factor ?? (Number.isFinite(job.factor) ? job.factor : 1);
  const panelMinutes = job.panels * opts.minPerPanel * factor;
  const wall = opts.setupMin + job.travelMin + panelMinutes / crew;
  const labour = (wall / 60) * opts.rate * crew;
  const overhead = labour * (opts.overheadPct / 100);
  const vehicle = (job.travelKm ?? 0) * opts.perKm;
  const total = labour + overhead + vehicle + opts.consumables;
  return { wall, labour, overhead, vehicle, consumables: opts.consumables, total, panelMinutes };
}

export function quote(job, opts) {
  const c = jobCost(job, opts);
  const margin = Math.min(Math.max(opts.marginPct, 0), 90) / 100;
  const atMargin = c.total / (1 - margin);
  const price = Math.max(atMargin, opts.minCharge);
  const profit = price - c.total;
  return {
    ...c,
    atMargin,
    price,
    minChargeApplies: opts.minCharge > atMargin,
    perPanel: price / job.panels,
    profit,
    marginPct: price > 0 ? (profit / price) * 100 : 0,
    revenuePerHour: price / (c.wall / 60),
    profitPerHour: profit / (c.wall / 60),
  };
}

// Lowest price per panel at which the job still earns the target margin, across panel counts -- shows where the
// minimum call-out stops mattering so the price list can be flat per panel above it.
export function priceCurve(base, opts, counts = [6, 10, 14, 20, 30, 40, 60, 100]) {
  return counts.map((panels) => {
    const q = quote({ ...base, panels }, opts);
    return { panels, price: q.price, perPanel: q.perPanel, minChargeApplies: q.minChargeApplies, wall: q.wall };
  });
}

// job line: label, panels, access (ground|single|double|flat), travel minutes, travel km
export function parseJobs(text) {
  const jobs = [], errors = [];
  String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).forEach((line, i) => {
    const p = line.split(/[,\t|]/).map((s) => s.trim());
    const [label, panels, access, travelMin, travelKm] = [p[0], num(p[1]), (p[2] || "ground").toLowerCase(), num(p[3]), num(p[4])];
    const key = Object.keys(ACCESS).find((k) => k === access || ACCESS[k].label.toLowerCase().startsWith(access));
    if (!label || !(panels >= 1) || !key || !(travelMin >= 0)) {
      errors.push(`Job line ${i + 1} ("${line}"): need label, panels (1 or more), access (ground, single, double or flat) and travel minutes.`);
      return;
    }
    jobs.push({ label, panels: Math.floor(panels), access: key, travelMin, travelKm: Number.isFinite(travelKm) ? travelKm : 0 });
  });
  return { jobs, errors };
}

// Pack a list of jobs into working days. Jobs are placed biggest-first into the first day with room (first-fit
// decreasing); a job longer than a whole day gets a day to itself and is flagged.
export function dayPlan(jobs, opts) {
  const cap = opts.dayHours * 60;
  const priced = jobs.map((j) => ({ job: j, q: quote(j, opts) })).sort((a, b) => b.q.wall - a.q.wall);
  const days = [];
  for (const item of priced) {
    let day = days.find((d) => d.minutes + item.q.wall <= cap);
    if (!day) { day = { minutes: 0, items: [], revenue: 0, profit: 0 }; days.push(day); }
    day.items.push(item);
    day.minutes += item.q.wall;
    day.revenue += item.q.price;
    day.profit += item.q.profit;
  }
  days.forEach((d) => { d.overrun = d.minutes > cap; d.utilisation = d.minutes / cap; });
  return {
    days,
    revenue: days.reduce((a, d) => a + d.revenue, 0),
    profit: days.reduce((a, d) => a + d.profit, 0),
    unquotable: priced.filter((x) => x.q.wall > cap).map((x) => x.job.label),
  };
}

// What an annual plan is worth: price per clean x cleans per year x customers, less the cost.
export function annualPlan(job, opts, cleansPerYear, customers) {
  const q = quote(job, opts);
  const cleans = cleansPerYear * customers;
  return { cleans, revenue: cleans * q.price, profit: cleans * q.profit, workDays: (cleans * q.wall) / 60 / opts.dayHours };
}

// Customer-side payback: does a clean pay for itself? The customer supplies the share of yearly output that dirt costs
// them (soiling loss); the value recovered is that share of annual output at their electricity rate, against what the
// cleans cost. The break-even loss is the soiling loss at which the two are equal.
export function customerPayback({ systemKw, yieldKwhPerKw, soilingLossPct, ratePerKwh, cleanPrice, cleansPerYear }) {
  const annual = systemKw * yieldKwhPerKw;
  const recoverKwh = annual * (soilingLossPct / 100);
  const recoverValue = recoverKwh * ratePerKwh;
  const spend = cleanPrice * cleansPerYear;
  return {
    annual, recoverKwh, recoverValue, spend,
    net: recoverValue - spend,
    worthIt: recoverValue > spend,
    breakEvenLossPct: annual * ratePerKwh > 0 ? (spend / (annual * ratePerKwh)) * 100 : Infinity,
  };
}

export const EXAMPLE_JOBS = `# label, panels, access, travel minutes, travel km
Oak St, 14, single, 15, 9
Maple Ct, 22, double, 25, 16
Farm barn, 60, flat, 35, 28
Lee house, 10, ground, 12, 7
Pine Rd, 18, single, 20, 13
Birch Ln, 12, ground, 10, 6`;
