// Rental fleet size optimizer. Pure functions, no DOM.
//
// The question: you rent out identical units (party tents, kayaks, scaffold
// sets, camera bodies, tool kits). Every unit you own costs money whether or
// not it is out. A request that arrives when every unit is out is turned away.
// How many units should you own?
//
// Two models, both computed here and shown side by side:
//
//  1. Erlang loss (Erlang B). With Poisson booking requests at rate L per day
//     and rentals lasting D days on average, the offered load is a = L * E[D]
//     units. With c units the share of requests turned away is B(c, a), by the
//     recurrence B(0)=1, B(c) = a*B(c-1) / (c + a*B(c-1)). The result does not
//     depend on the shape of the rental-length distribution, only its mean,
//     which is why it is usable by a shop that does not know its distribution.
//     Seasons are handled by computing each season on its own and summing: the
//     fleet is fixed, demand is not.
//
//  2. Day-by-day simulation, seeded and repeatable. Requests per day are
//     Poisson, or negative binomial when the user says bookings cluster
//     (variance-to-mean ratio above 1). Each request draws a rental length from
//     the user's mix and takes a free unit if one is free, else is turned away.
//     Every candidate fleet size sees the same simulated years (common random
//     numbers), so the profit curve is not jittered by sampling noise between
//     sizes. It reports the spread between good and bad years, not just a mean.
//
// Profit(c) = rental revenue - cost per rental x rentals - cost of each
// turned-away customer x turn-aways - c x yearly cost of owning one unit.
//
// Which one drives the recommendation depends on how the rentals are booked.
// Booked by calendar date (a tent for Saturday): a unit returned on a day can
// go out again that day, and requests land together, so the day-by-day
// simulation is the closer model and Erlang B is the cautious one. Picked up at
// any hour (hourly or walk-up): Erlang B is the closer model.
//
// Arithmetic and simulation on figures the user types. No prices, demand or
// asset costs are asserted here.

export const DEFAULTS = Object.freeze({
  price: 85,          // revenue per unit per rental day
  costPerRental: 18,  // cleaning, delivery, wear, paid every rental
  unitCost: 1100,     // yearly cost of owning one unit
  lostCost: 0,        // extra cost of turning a customer away (goodwill)
  vmr: 1,             // variance-to-mean ratio of requests per day; 1 = Poisson
  bookingStyle: "date", // "date": booked by calendar day; "anytime": pickup at any hour
  maxTurnAway: "",    // optional cap on the share of requests turned away
  currentUnits: "",   // optional: how many you own today
  maxUnits: "",       // optional: most units to evaluate
  years: 200,         // simulated years
  seed: 1,
});

export const MAX_UNITS = 200;
export const MIN_YEARS = 20;
export const MAX_YEARS = 2000;
export const SIM_WORK_BUDGET = 40_000_000;

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const cellsOf = (line) =>
  (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));

// Seasons: "name, days in the season, new rental requests per day". Header
// optional. The seasons together should add up to about a year.
export function parseSeasons(text) {
  const rows = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = cellsOf(line);
    if (c.length < 3) { skipped++; continue; }
    const days = num(c[1], NaN), rate = num(c[2], NaN);
    if (!Number.isFinite(days) || !Number.isFinite(rate)) {
      if (rows.length || !/name|season|days|rate|requests/i.test(line)) skipped++;
      continue;
    }
    if (!(days > 0) || !(rate >= 0) || days !== Math.round(days)) { skipped++; continue; }
    rows.push({ name: c[0] || `Season ${rows.length + 1}`, days, rate });
  }
  if (skipped) warnings.push(`${skipped} season line(s) skipped (need a name, a whole number of days above zero, and requests per day of zero or more).`);
  if (!rows.length) return { error: "Add at least one season: name, days, new rental requests per day." };
  const total = rows.reduce((s, r) => s + r.days, 0);
  if (total > 366) return { error: `The seasons add up to ${total} days; a year has 365. Trim them.` };
  if (total < 365) warnings.push(`The seasons add up to ${total} days, not 365; the other ${365 - total} days are treated as having no demand. Add an off-season line if that is wrong.`);
  if (!rows.some((r) => r.rate > 0)) return { error: "At least one season needs requests per day above zero." };
  return { rows, warnings, totalDays: total };
}

// Rental lengths: "days, share". A bare number means one length. Shares are
// relative (counts or percentages) and are normalised.
export function parseDurations(text) {
  const rows = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = cellsOf(line);
    const days = num(c[0], NaN);
    if (!Number.isFinite(days)) {
      if (rows.length || !/day|length|share/i.test(line)) skipped++;
      continue;
    }
    const share = c.length > 1 && c[1] !== "" ? num(c[1], NaN) : 1;
    if (!(days >= 1) || days !== Math.round(days) || days > 365 || !(share >= 0) || !Number.isFinite(share)) { skipped++; continue; }
    rows.push({ days, share });
  }
  if (skipped) warnings.push(`${skipped} rental-length line(s) skipped (need a whole number of days from 1 to 365 and a share of zero or more).`);
  const total = rows.reduce((s, r) => s + r.share, 0);
  if (!rows.length || !(total > 0)) return { error: "Add at least one rental length: days, share of rentals (for example 2, 60)." };
  const norm = rows.map((r) => ({ days: r.days, share: r.share / total })).filter((r) => r.share > 0).sort((a, b) => a.days - b.days);
  const mean = norm.reduce((s, r) => s + r.days * r.share, 0);
  return { rows: norm, mean, warnings };
}

// Erlang B blocking probability for c servers and offered load a (in units).
export function erlangB(c, a) {
  if (!(a >= 0) || !Number.isInteger(c) || c < 0) return NaN;
  let b = 1;
  for (let k = 1; k <= c; k++) b = (a * b) / (k + a * b);
  return b;
}

function econOf(o = {}) {
  const e = {
    price: num(o.price, DEFAULTS.price),
    costPerRental: num(o.costPerRental, DEFAULTS.costPerRental),
    unitCost: num(o.unitCost, DEFAULTS.unitCost),
    lostCost: num(o.lostCost, DEFAULTS.lostCost),
    vmr: num(o.vmr, DEFAULTS.vmr),
    bookingStyle: o.bookingStyle === "anytime" ? "anytime" : "date",
    maxTurnAway: o.maxTurnAway === "" || o.maxTurnAway === undefined || o.maxTurnAway === null ? null : num(o.maxTurnAway, NaN),
    currentUnits: o.currentUnits === "" || o.currentUnits === undefined || o.currentUnits === null ? null : num(o.currentUnits, NaN),
    maxUnits: o.maxUnits === "" || o.maxUnits === undefined || o.maxUnits === null ? null : num(o.maxUnits, NaN),
    years: num(o.years, DEFAULTS.years),
    seed: num(o.seed, DEFAULTS.seed),
  };
  return e;
}

function validateEcon(e) {
  if (!(e.price > 0)) return "Price per rental day must be above zero.";
  if (!(e.costPerRental >= 0)) return "Cost per rental cannot be negative.";
  if (!(e.unitCost >= 0)) return "Yearly cost of owning a unit cannot be negative.";
  if (!(e.lostCost >= 0)) return "Cost of turning a customer away cannot be negative.";
  if (!(e.vmr >= 1)) return "Booking clustering (variance-to-mean ratio) must be 1 or more; 1 means bookings arrive independently.";
  if (e.vmr > 25) return "Booking clustering above 25 is not a usable input; use 1 to 5.";
  if (e.maxTurnAway !== null && !(e.maxTurnAway >= 0 && e.maxTurnAway < 100)) return "The turn-away cap is a percentage from 0 to under 100.";
  if (e.currentUnits !== null && !(e.currentUnits >= 0 && Number.isInteger(e.currentUnits))) return "Units you own today must be a whole number.";
  if (e.maxUnits !== null && !(e.maxUnits >= 1 && Number.isInteger(e.maxUnits))) return "Most units to evaluate must be a whole number of 1 or more.";
  if (!Number.isFinite(e.years) || !Number.isFinite(e.seed)) return "Simulated years and seed must be numbers.";
  return null;
}

// Closed-form (Erlang B) yearly figures for a fleet of c units.
export function analyticYear(c, seasons, meanDays, e) {
  let requests = 0, carried = 0, rentalDays = 0, days = 0;
  const bySeason = [];
  for (const s of seasons) {
    const a = s.rate * meanDays;
    const b = erlangB(c, a);
    const req = s.rate * s.days;
    const acc = req * (1 - b);
    const rd = acc * meanDays;
    requests += req; carried += acc; rentalDays += rd; days += s.days;
    bySeason.push({
      name: s.name, days: s.days, rate: s.rate, load: a, turnAway: b,
      utilization: c > 0 ? (a * (1 - b)) / c : 0, requests: req, rentals: acc,
    });
  }
  const turned = requests - carried;
  const revenue = rentalDays * e.price;
  const variable = carried * e.costPerRental;
  const lost = turned * e.lostCost;
  const owning = c * e.unitCost;
  return {
    units: c, requests, rentals: carried, turnedAway: turned, rentalDays, revenue, variable, lost, owning,
    profit: revenue - variable - lost - owning,
    turnAwayShare: requests > 0 ? turned / requests : 0,
    utilization: c > 0 && days > 0 ? rentalDays / (c * days) : 0,
    bySeason,
  };
}

// --- seeded random numbers ------------------------------------------------

export function makeRng(seed) {
  let s = (Math.floor(seed) >>> 0) || 1;
  const uniform = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    let u = 0;
    while (u === 0) u = uniform();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
  const gamma = (shape) => {
    if (shape < 1) return gamma(shape + 1) * Math.pow(uniform() || 1e-12, 1 / shape);
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = uniform();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const poisson = (mean) => {
    let total = 0, left = mean;
    while (left > 0) {
      const m = Math.min(left, 15);
      left -= m;
      const limit = Math.exp(-m);
      let k = 0, p = 1;
      do { k++; p *= uniform(); } while (p > limit);
      total += k - 1;
    }
    return total;
  };
  return { uniform, normal, gamma, poisson };
}

// Requests in one day: Poisson, or Gamma-mixed Poisson (negative binomial)
// with mean `rate` and variance `vmr * rate`.
function dayRequests(rng, rate, vmr) {
  if (rate <= 0) return 0;
  if (vmr <= 1.0000001) return rng.poisson(rate);
  const theta = vmr - 1, shape = rate / theta;
  return rng.poisson(rng.gamma(shape) * theta);
}

// Day-by-day simulation of every fleet size from 1 to maxC against the same
// simulated years. Returns per-size statistics.
export function simulate(seasons, durations, e, maxC, years) {
  const rng = makeRng(e.seed);
  const dayRate = [];
  for (const s of seasons) for (let i = 0; i < s.days; i++) dayRate.push(s.rate);
  const yearDays = dayRate.length;
  const totalYears = years + 1; // the first year only warms the fleet up
  const cum = [];
  let acc = 0;
  for (const d of durations) { acc += d.share; cum.push(acc); }
  const drawDays = () => {
    const u = rng.uniform() * acc;
    for (let i = 0; i < cum.length; i++) if (u < cum[i]) return durations[i].days;
    return durations[durations.length - 1].days;
  };
  const counts = new Int32Array(totalYears * yearDays);
  const lens = [];
  for (let y = 0; y < totalYears; y++) {
    for (let d = 0; d < yearDays; d++) {
      const n = dayRequests(rng, dayRate[d], e.vmr);
      counts[y * yearDays + d] = n;
      for (let k = 0; k < n; k++) lens.push(drawDays());
    }
  }
  const maxLen = durations[durations.length - 1].days;
  const ring = maxLen + 1;
  const out = [];
  for (let c = 1; c <= maxC; c++) {
    const release = new Int32Array(ring);
    let free = c, idx = 0;
    const profits = [];
    let reqT = 0, accT = 0, busyT = 0;
    for (let y = 0; y < totalYears; y++) {
      let req = 0, accd = 0, rev = 0, busyDays = 0;
      for (let d = 0; d < yearDays; d++) {
        const t = y * yearDays + d;
        const slot = t % ring;
        free += release[slot];
        release[slot] = 0;
        const n = counts[t];
        for (let k = 0; k < n; k++) {
          const len = lens[idx++];
          req++;
          if (free > 0) {
            free--;
            accd++;
            rev += len * e.price;
            release[(t + len) % ring]++;
          }
        }
        busyDays += c - free;
      }
      if (y === 0) continue;
      const turned = req - accd;
      profits.push(rev - accd * e.costPerRental - turned * e.lostCost - c * e.unitCost);
      reqT += req; accT += accd; busyT += busyDays;
    }
    const sorted = [...profits].sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
    const mean = profits.reduce((s, x) => s + x, 0) / profits.length;
    out.push({
      units: c, profit: mean, p10: at(0.1), p90: at(0.9),
      turnAwayShare: reqT > 0 ? (reqT - accT) / reqT : 0,
      utilization: busyT / (c * yearDays * years),
      lossYears: profits.filter((x) => x < 0).length / profits.length,
    });
  }
  return out;
}

function bestOf(rows, key = "profit") {
  let best = null;
  for (const r of rows) if (best === null || r[key] > best[key] + 1e-9) best = r;
  return best;
}

// Best whole fleet size by the Erlang model alone, for the demand-sensitivity
// rows. Returns 0 when no size pays for itself.
export function bestAnalytic(seasons, meanDays, e, maxC) {
  let bestC = 0, bestP = 0;
  for (let c = 1; c <= maxC; c++) {
    const p = analyticYear(c, seasons, meanDays, e).profit;
    if (p > bestP + 1e-9) { bestP = p; bestC = c; }
  }
  return { units: bestC, profit: bestP };
}

export function analyze(seasons, durations, opts = {}) {
  const e = econOf(opts);
  const bad = validateEcon(e);
  if (bad) return { error: bad };
  const meanDays = durations.reduce((s, d) => s + d.days * d.share, 0);
  const warnings = [];
  const peakLoad = Math.max(...seasons.map((s) => s.rate * meanDays));
  let maxC = Math.min(MAX_UNITS, Math.ceil(peakLoad + 4 * Math.sqrt(peakLoad * e.vmr)) + 2);
  if (e.maxUnits !== null) maxC = Math.min(MAX_UNITS, Math.max(1, e.maxUnits));
  if (e.currentUnits !== null) maxC = Math.min(MAX_UNITS, Math.max(maxC, e.currentUnits));
  if (peakLoad > 150) warnings.push(`Your busiest season keeps about ${Math.round(peakLoad)} units out at once; that is a larger operation than this tool is checked on.`);

  const yearDays = seasons.reduce((s, x) => s + x.days, 0);
  const reqPerYear = seasons.reduce((s, x) => s + x.rate * x.days, 0);
  const requestedYears = Math.min(MAX_YEARS, Math.max(MIN_YEARS, Math.floor(e.years)));
  const perYearWork = maxC * (yearDays + reqPerYear * 2);
  const years = Math.max(MIN_YEARS, Math.min(requestedYears, Math.floor(SIM_WORK_BUDGET / Math.max(1, perYearWork))));
  if (years < requestedYears) warnings.push(`The simulation ran ${years} years instead of ${requestedYears} to keep the page responsive.`);

  const sim = simulate(seasons, durations, e, maxC, years);
  const curve = [];
  let prev = { analytic: { profit: 0, rentalDays: 0 }, sim: { profit: 0 } };
  for (let c = 1; c <= maxC; c++) {
    const analytic = analyticYear(c, seasons, meanDays, e);
    const s = sim[c - 1];
    const row = {
      units: c, analytic, sim: s,
      marginalAnalytic: analytic.profit - prev.analytic.profit,
      marginalSim: s.profit - prev.sim.profit,
      marginalDays: analytic.rentalDays - prev.analytic.rentalDays,
    };
    curve.push(row);
    prev = row;
  }

  const useSim = e.bookingStyle === "date";
  const primary = useSim ? "day-by-day simulation" : "Erlang B";
  if (!useSim && e.vmr > 1) warnings.push("Erlang B assumes bookings arrive independently, so the clustering you entered only shows in the simulated columns.");
  const val = (r) => (useSim ? r.sim.profit : r.analytic.profit);
  const share = (r) => (useSim ? r.sim.turnAwayShare : r.analytic.turnAwayShare);
  let best = null;
  for (const r of curve) if (best === null || val(r) > val(best) + 1e-9) best = r;
  const profitUnits = best && val(best) > 0 ? best.units : 0;

  let capUnits = null;
  if (e.maxTurnAway !== null) {
    const hit = curve.find((r) => share(r) * 100 <= e.maxTurnAway + 1e-9);
    capUnits = hit ? hit.units : null;
    if (!hit) warnings.push(`No fleet up to ${maxC} units keeps turn-aways under ${e.maxTurnAway}%; raise the cap or the most units to evaluate.`);
  }
  const recUnits = capUnits !== null ? Math.max(profitUnits, capUnits) : profitUnits;
  const rec = recUnits > 0 ? curve[recUnits - 1] : null;
  const profitAt = (u) => (u === 0 ? 0 : val(curve[u - 1]));

  const current = e.currentUnits === null ? null
    : e.currentUnits === 0 ? { units: 0, profit: 0, turnAwayShare: 1 }
    : (() => { const r = curve[e.currentUnits - 1]; return { units: e.currentUnits, profit: val(r), turnAwayShare: share(r), row: r }; })();

  const perUnitMargin = e.price - e.costPerRental / meanDays;
  const breakEvenDays = perUnitMargin > 0 ? e.unitCost / perUnitMargin : Infinity;
  if (!(perUnitMargin > 0)) warnings.push("Price per rental day does not cover the per-rental cost at this average rental length, so no fleet size can earn a profit.");

  const sensitivity = [0.7, 0.85, 1, 1.15, 1.3].map((f) => {
    if (f === 1) return { factor: f, units: profitUnits, profit: profitAt(profitUnits) };
    const scaled = seasons.map((s) => ({ ...s, rate: s.rate * f }));
    if (!useSim) {
      const b = bestAnalytic(scaled, meanDays, e, MAX_UNITS);
      return { factor: f, units: b.units, profit: b.profit };
    }
    const load = Math.max(...scaled.map((s) => s.rate * meanDays));
    const top = Math.min(MAX_UNITS, Math.ceil(load + 4 * Math.sqrt(load * e.vmr)) + 2);
    const rows = simulate(scaled, durations, e, top, Math.min(years, 80));
    const b = bestOf(rows);
    return b && b.profit > 0 ? { factor: f, units: b.units, profit: b.profit } : { factor: f, units: 0, profit: 0 };
  });

  const seasonRows = rec ? rec.analytic.bySeason : [];
  const verdict = makeVerdict({ rec, recUnits, profitUnits, capUnits, e, primary, current, profitAt, best, breakEvenDays, meanDays });
  return {
    inputs: e, meanDays, maxC, years, primary, useSim, curve, recommended: rec, recommendedUnits: recUnits,
    profitUnits, capUnits, current, seasonRows, sensitivity, breakEvenDays, perUnitMargin,
    peakLoad, yearDays, requestsPerYear: reqPerYear, warnings, verdict,
  };
}

function makeVerdict(v) {
  const { rec, recUnits, profitUnits, capUnits, e, primary, current, profitAt, breakEvenDays } = v;
  if (recUnits === 0) {
    return `At these figures no fleet size earns more than it costs to own: a unit needs about ${Number.isFinite(breakEvenDays) ? Math.ceil(breakEvenDays) : "more than a year of"} rental days a year to pay for itself, and demand does not keep a unit that busy.`;
  }
  const pf = (r) => (e.bookingStyle === "date" ? r.sim.profit : r.analytic.profit);
  const ts = (r) => (e.bookingStyle === "date" ? r.sim.turnAwayShare : r.analytic.turnAwayShare);
  let s = `Own ${recUnits} unit${recUnits === 1 ? "" : "s"}: about ${fmtMoney(pf(rec))} a year after the cost of owning them, with ${(ts(rec) * 100).toFixed(1)}% of requests turned away (${primary}).`;
  if (capUnits !== null && capUnits > profitUnits) s += ` That is more than the ${profitUnits} that maximise profit, because of your ${e.maxTurnAway}% turn-away cap; the cap costs ${fmtMoney(profitAt(profitUnits) - profitAt(recUnits))} a year.`;
  if (current && current.units !== recUnits) {
    const d = profitAt(recUnits) - current.profit;
    s += ` Against the ${current.units} you own today that is ${d >= 0 ? "+" : "−"}${fmtMoney(Math.abs(d))} a year.`;
  } else if (current) {
    s += ` That matches the ${current.units} you own today.`;
  }
  return s;
}

function fmtMoney(x) { return money(x); }

export function money(x) {
  if (!Number.isFinite(x)) return "—";
  const s = Math.abs(Math.round(x)).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (Math.round(x) < 0 ? "−$" : "$") + s;
}
export function money2(x) {
  if (!Number.isFinite(x)) return "—";
  return (x < 0 ? "−$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function pct(x, d = 0) { return Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "—"; }
export function fmtInt(x) { return Math.round(x).toLocaleString("en-US"); }

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(r) {
  const rows = [["units", "profit per year (Erlang B)", "turned away (Erlang B)", "utilization (Erlang B)", "profit per year (simulated mean)", "simulated bad year (10th percentile)", "simulated good year (90th percentile)", "turned away (simulated)", "utilization (simulated)", "share of simulated years at a loss"]];
  for (const c of r.curve) {
    rows.push([
      c.units, c.analytic.profit.toFixed(2), (c.analytic.turnAwayShare * 100).toFixed(2) + "%", (c.analytic.utilization * 100).toFixed(1) + "%",
      c.sim.profit.toFixed(2), c.sim.p10.toFixed(2), c.sim.p90.toFixed(2), (c.sim.turnAwayShare * 100).toFixed(2) + "%", (c.sim.utilization * 100).toFixed(1) + "%", (c.sim.lossYears * 100).toFixed(0) + "%",
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function sampleSeasons() {
  return [
    "Peak (May to Sep),150,2.4",
    "Shoulder (Apr and Oct),61,1",
    "Off-season,154,0.15",
  ].join("\n");
}

export function sampleDurations() {
  return ["1,25", "2,45", "3,20", "7,10"].join("\n");
}
