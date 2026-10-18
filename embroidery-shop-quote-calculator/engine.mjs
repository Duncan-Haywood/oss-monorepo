// Embroidery shop quote calculator: what to charge for an embroidery job so it
// hits a target margin, how the per-piece price falls with quantity, and
// whether a flat "per 1000 stitches" rule of thumb loses money on small runs.
//
// Model (all inputs are the shop's own numbers):
//   machine minutes per hoop  = stitches / (stitches-per-minute x efficiency) + thread changes x seconds
//   wall-clock minutes        = job setup + color setup x colors
//                               + ceil(pieces / heads) x minutes per hoop + pieces x hooping minutes
//   (one operator attends the whole job, hooping while the machine is stopped.)
//   cost = garments + thread/backing/topping + labor + machine overhead + digitizing
//   quote = max(cost / (1 - margin), minimum charge) x (1 + rush surcharge)
//
// Money is held in integer cents; the quote is rounded UP to a whole cent per
// piece so the margin is never undershot by rounding. Pure functions, no
// network, no dependencies.

export const MODEL_NOTE =
  "Cost = garments + thread/backing per 1000 stitches + labor and machine overhead for the clock time (setup + hoops + hooping) + digitizing. " +
  "Quote = cost / (1 - target margin), at least the minimum charge, plus any rush surcharge, rounded up to the cent per piece. " +
  "Every figure is the one you typed, not a forecast; hooping is assumed to happen while the machine is stopped.";

export const INPUT_NOTES = [
  { what: "Quantity, garment cost, stitches, colors", detail: "Pieces in the job, what each blank costs you (0 if the customer supplies them), stitches in one design and thread colors in it. One color needs no thread change." },
  { what: "Heads, stitches/minute, efficiency", detail: "Heads on the machine, its rated stitches per minute, and the share of rated speed you really get once trims, breaks and slow areas are counted (60-80% is common)." },
  { what: "Hooping, setup and color setup minutes", detail: "Minutes to hoop and load each piece, minutes to set up the job, and minutes per color to thread and tension it. These are the minutes that do not shrink when the run gets longer." },
  { what: "Thread, backing and topping", detail: "Dollars of consumables per 1000 stitches (thread, bobbin, backing, topping)." },
  { what: "Labor rate and overhead per machine hour", detail: "What an hour of the operator's time costs, and rent, power, maintenance and depreciation per hour the machine is tied up." },
  { what: "Target margin, minimum charge, rush", detail: "Margin is profit as a share of the quote. The minimum charge is the lowest job total you will take; the rush surcharge is a percentage added on top." },
  { what: "Minimum hourly rate", detail: "The least you will accept per hour of your own time after garments, thread, overhead and digitizing are paid. The take-the-job verdict is measured against it." },
  { what: "Flat per-1000-stitches rule", detail: "The rule of thumb you are comparing against: a decoration price of this many dollars per 1000 stitches added to the garment, ignoring setup." },
  { what: "Quantity breaks", detail: "Comma-separated quantities for the break table (for example 12, 24, 48, 100, 250). Your job quantity is added automatically." },
];

export const DEFAULTS = Object.freeze({
  quantity: 24, garmentCost: 4.5, stitches: 7500, colors: 4, digitizingFee: 25,
  heads: 2, spm: 650, efficiency: 75, hoopMin: 1.5, setupJobMin: 15, setupColorMin: 2, colorChangeSec: 8,
  materialPer1000: 0.1, laborRate: 20, overheadPerHour: 10,
  margin: 40, minCharge: 75, rushPct: 0, minHourly: 35, flatPer1000: 1, offerPerPiece: null,
  breakQtys: [12, 24, 48, 100, 250],
});

const MAX_QTY = 100000;
const SCAN_MAX = 5000;

// -- formatting ------------------------------------------------------------

export function money(n) {
  const v = Math.round(n * 100) / 100;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${abs}`;
}

export function cents(c) {
  return money(c / 100);
}

export function pct(n, digits = 0) {
  return Number.isFinite(n) ? `${(Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)}%` : "n/a";
}

const toCents = (dollars) => Math.round(dollars * 100 + 1e-9);

// -- input -----------------------------------------------------------------

const FIELDS = [
  // key, label, min, max, integer, exclusiveMin
  ["quantity", "quantity", 1, MAX_QTY, true],
  ["garmentCost", "garment cost", 0, 100000, false],
  ["stitches", "stitches", 1, 10000000, true],
  ["colors", "colors", 1, 99, true],
  ["digitizingFee", "digitizing fee", 0, 100000, false],
  ["heads", "heads", 1, 99, true],
  ["spm", "stitches per minute", 1, 3000, false],
  ["efficiency", "efficiency", 1, 100, false],
  ["hoopMin", "hooping minutes", 0, 600, false],
  ["setupJobMin", "job setup minutes", 0, 6000, false],
  ["setupColorMin", "setup minutes per color", 0, 600, false],
  ["colorChangeSec", "seconds per thread change", 0, 3600, false],
  ["materialPer1000", "thread and backing per 1000 stitches", 0, 1000, false],
  ["laborRate", "labor rate", 0, 10000, false],
  ["overheadPerHour", "overhead per machine hour", 0, 10000, false],
  ["margin", "target margin", 0, 90, false],
  ["minCharge", "minimum charge", 0, 10000000, false],
  ["rushPct", "rush surcharge", 0, 500, false],
  ["minHourly", "minimum hourly rate", 0, 10000, false],
  ["flatPer1000", "flat rate per 1000 stitches", 0, 1000, false],
];

export function parseQtyList(v) {
  if (Array.isArray(v)) return v.map(Number);
  return String(v ?? "").split(/[\s,;]+/).filter(Boolean).map(Number);
}

// Returns { job, errors }. Missing or blank fields take the default; present
// but unusable fields are errors, never silently replaced.
export function normalizeJob(input = {}) {
  const errors = [];
  const job = {};
  for (const [key, label, lo, hi, integer] of FIELDS) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === "") { job[key] = DEFAULTS[key]; continue; }
    const v = Number(String(raw).replace(/[$,%\s]/g, ""));
    if (!Number.isFinite(v) || v < lo || v > hi || (integer && !Number.isInteger(v))) {
      errors.push(`${label} must be ${integer ? "a whole number" : "a number"} from ${lo} to ${hi}`);
      job[key] = DEFAULTS[key];
    } else job[key] = v;
  }
  const offer = input.offerPerPiece;
  if (offer === undefined || offer === null || offer === "") job.offerPerPiece = null;
  else {
    const v = Number(String(offer).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(v) || v < 0) { errors.push("offered price per piece must be a number, zero or more"); job.offerPerPiece = null; }
    else job.offerPerPiece = v;
  }
  const rawQtys = input.breakQtys === undefined || input.breakQtys === null || input.breakQtys === "" ? DEFAULTS.breakQtys : parseQtyList(input.breakQtys);
  const bad = rawQtys.filter((q) => !Number.isInteger(q) || q < 1 || q > MAX_QTY);
  if (bad.length) errors.push(`quantity breaks must be whole numbers from 1 to ${MAX_QTY}`);
  job.breakQtys = [...new Set([...rawQtys.filter((q) => Number.isInteger(q) && q >= 1 && q <= MAX_QTY), job.quantity])].sort((a, b) => a - b).slice(0, 20);
  return { job, errors };
}

// -- cost and quote --------------------------------------------------------

// Clock minutes for `qty` pieces: closed form (the tests replay it hoop by hoop).
export function jobMinutes(job, qty) {
  const efficiency = job.efficiency / 100;
  const stitchMin = job.stitches / (job.spm * efficiency);
  const changes = Math.max(job.colors - 1, 0);
  const hoopRunMin = stitchMin + (changes * job.colorChangeSec) / 60;
  const setup = job.setupJobMin + job.setupColorMin * job.colors;
  const hoops = Math.ceil(qty / job.heads);
  const run = hoops * hoopRunMin;
  const handling = qty * job.hoopMin;
  return { setup, run, handling, total: setup + run + handling, hoopRunMin, stitchMin, hoops };
}

export function jobCost(job, qty) {
  const m = jobMinutes(job, qty);
  const hours = m.total / 60;
  const c = {
    garments: toCents(job.garmentCost) * qty,
    materials: toCents((job.materialPer1000 * job.stitches / 1000) * qty),
    labor: toCents(hours * job.laborRate),
    overhead: toCents(hours * job.overheadPerHour),
    digitizing: toCents(job.digitizingFee),
  };
  c.total = c.garments + c.materials + c.labor + c.overhead + c.digitizing;
  return { ...c, minutes: m, hours };
}

export function quoteJob(job, qty) {
  const cost = jobCost(job, qty);
  const mBp = Math.round(job.margin * 100);
  const rBp = Math.round(job.rushPct * 100);
  const targetTotal = Math.ceil((cost.total * 10000) / (10000 - mBp));
  const minCents = toCents(job.minCharge);
  const minBound = minCents > targetTotal;
  const afterMin = Math.max(targetTotal, minCents);
  const withRush = Math.ceil((afterMin * (10000 + rBp)) / 10000);
  let total;
  let perPieceCents;
  if (minBound) { total = withRush; perPieceCents = total / qty; }
  else { perPieceCents = Math.ceil(withRush / qty); total = perPieceCents * qty; }
  const profit = total - cost.total;
  const fixed = cost.digitizing + toCents(job.setupJobMin / 60 * (job.laborRate + job.overheadPerHour)) + toCents(job.setupColorMin * job.colors / 60 * (job.laborRate + job.overheadPerHour));
  return {
    qty, cost, targetTotal, minBound, rushed: rBp > 0, total, perPieceCents, perPiece: perPieceCents / 100,
    profit, margin: total > 0 ? (profit / total) * 100 : 0,
    effectiveHourly: effectiveHourly(cost, total),
    setupShare: cost.total > 0 ? (fixed / cost.total) * 100 : 0,
  };
}

// What the owner is left per clock hour of their own time: everything except the
// labor line (which is what the hour is being paid from) is subtracted.
export function effectiveHourly(cost, totalCents) {
  if (!(cost.hours > 0)) return 0;
  const left = totalCents - cost.garments - cost.materials - cost.overhead - cost.digitizing;
  return left / 100 / cost.hours;
}

// -- the flat per-1000-stitches rule ----------------------------------------

export function flatRule(job, qty) {
  const cost = jobCost(job, qty);
  const perPieceCents = Math.round(toCents(job.garmentCost) + (job.flatPer1000 * job.stitches) / 10);
  const total = perPieceCents * qty;
  const profit = total - cost.total;
  return {
    qty, perPieceCents, perPiece: perPieceCents / 100, total, profit,
    margin: total > 0 ? (profit / total) * 100 : 0,
    effectiveHourly: effectiveHourly(cost, total),
    losesMoney: profit < 0,
  };
}

// -- verdict ---------------------------------------------------------------

export function verdict(job, qty, priceTotalCents) {
  const cost = jobCost(job, qty);
  const eff = effectiveHourly(cost, priceTotalCents);
  const profit = priceTotalCents - cost.total;
  const nonLabor = cost.garments + cost.materials + cost.overhead + cost.digitizing;
  const needTotal = Math.ceil(nonLabor + job.minHourly * cost.hours * 100);
  const needPerPiece = Math.ceil(needTotal / qty);
  const minTotalCents = needPerPiece * qty;
  let status;
  if (eff >= job.minHourly) status = "take";
  else if (eff >= 0) status = "counter";
  else status = "pass";
  const text = status === "take"
    ? `Take it: ${money(eff)} an hour for your time at ${cents(priceTotalCents)} (${cents(Math.round(priceTotalCents / qty))} a piece), above your ${money(job.minHourly)} floor.`
    : status === "counter"
      ? `Counter: at ${cents(priceTotalCents)} you clear only ${money(eff)} an hour, under your ${money(job.minHourly)} floor. You need ${cents(minTotalCents)} (${cents(needPerPiece)} a piece) to reach it.`
      : `Pass: at ${cents(priceTotalCents)} the job does not even cover garments, thread, overhead and digitizing (${money(eff)} an hour). The floor needs ${cents(minTotalCents)} (${cents(needPerPiece)} a piece).`;
  return { status, effectiveHourly: eff, profit, margin: priceTotalCents > 0 ? (profit / priceTotalCents) * 100 : 0, minTotalCents, minPerPieceCents: needPerPiece, priceTotalCents, text };
}

// -- tables ----------------------------------------------------------------

export function quantityBreaks(job, qtys = job.breakQtys) {
  const rows = [];
  let prev = null;
  for (const q of qtys) {
    const quote = quoteJob(job, q);
    const flat = flatRule(job, q);
    rows.push({
      qty: q, quote, flat,
      dropPct: prev ? ((prev.quote.perPieceCents - quote.perPieceCents) / prev.quote.perPieceCents) * 100 : null,
      minChargeBinds: quote.minBound,
      setupDominates: quote.setupShare >= 50,
      flatShortfall: flat.total - quote.total,
    });
    prev = rows[rows.length - 1];
  }
  return rows;
}

export const STITCH_FACTORS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function stitchSensitivity(job, qty = job.quantity) {
  const rows = STITCH_FACTORS.map((f) => {
    const stitches = Math.max(1, Math.round(job.stitches * f));
    const j = { ...job, stitches };
    const quote = quoteJob(j, qty);
    const flat = flatRule(j, qty);
    return { factor: f, stitches, quote, flat };
  });
  const first = rows[0];
  const last = rows[rows.length - 1];
  const span = last.stitches - first.stitches;
  const per1000 = span > 0 ? ((last.quote.perPieceCents - first.quote.perPieceCents) / 100 / (span / 1000)) : 0;
  return { rows, pricePer1000: per1000 };
}

// Smallest quantity (1..SCAN_MAX) at which `pred(quantity)` holds and keeps holding
// to SCAN_MAX; null when it never settles.
function settlesAt(pred) {
  let at = null;
  for (let q = SCAN_MAX; q >= 1; q -= 1) {
    if (pred(q)) at = q; else break;
  }
  return at;
}

export function analyze(input = {}) {
  const { job, errors } = normalizeJob(input);
  if (errors.length) { const e = new Error(errors.join("; ")); e.errors = errors; throw e; }
  const quote = quoteJob(job, job.quantity);
  const offerTotal = job.offerPerPiece === null ? null : toCents(job.offerPerPiece) * job.quantity;
  const priced = offerTotal === null ? quote.total : offerTotal;
  const v = verdict(job, job.quantity, priced);
  const breaks = quantityBreaks(job);
  const sens = stitchSensitivity(job);
  const flat = flatRule(job, job.quantity);
  const findings = [];

  const minQ = breaks.filter((b) => b.minChargeBinds).map((b) => b.qty);
  const minStops = settlesAt((q) => !quoteJob(job, q).minBound);
  if (minQ.length) {
    findings.push({ severity: "warn", rule: "minimum-charge-binds", message: `The ${money(job.minCharge)} minimum charge, not the margin, sets the price at ${minQ.join(", ")} pieces; the margin takes over from ${minStops ?? "a very large"} pieces.` });
  }
  const setupQ = breaks.filter((b) => b.setupDominates).map((b) => b.qty);
  const setupStops = settlesAt((q) => quoteJob(job, q).setupShare < 50);
  if (setupQ.length) {
    findings.push({ severity: "warn", rule: "setup-dominates", message: `Digitizing and setup are at least half of your cost at ${setupQ.join(", ")} pieces; they fall below half from ${setupStops ?? "a very large"} pieces. Charge a setup fee or a higher minimum there.` });
  }
  const loseQ = breaks.filter((b) => b.flat.losesMoney).map((b) => b.qty);
  const flatCoversFrom = settlesAt((q) => !flatRule(job, q).losesMoney);
  if (loseQ.length) {
    findings.push({ severity: "warn", rule: "flat-rule-loses-money", message: `The ${money(job.flatPer1000)} per 1000 stitches rule loses money at ${loseQ.join(", ")} pieces and only covers your cost from ${flatCoversFrom ?? "a very large"} pieces.` });
  }
  const flatLow = breaks.filter((b) => !b.flat.losesMoney && b.flat.effectiveHourly < job.minHourly).map((b) => b.qty);
  if (flatLow.length) {
    findings.push({ severity: "info", rule: "flat-rule-below-floor", message: `The flat rule covers cost but pays under your ${money(job.minHourly)} hourly floor at ${flatLow.join(", ")} pieces.` });
  }
  const drops = breaks.filter((b) => b.dropPct !== null);
  if (drops.length) {
    const big = drops.reduce((a, b) => (b.dropPct > a.dropPct ? b : a));
    if (big.dropPct > 0.5) {
      const idx = breaks.indexOf(big);
      findings.push({ severity: "info", rule: "biggest-break", message: `The biggest price drop is from ${breaks[idx - 1].qty} to ${big.qty} pieces: ${cents(Math.round(breaks[idx - 1].quote.perPieceCents))} to ${cents(Math.round(big.quote.perPieceCents))} a piece (${pct(big.dropPct)} lower).` });
    }
  }
  if (quote.margin + 1e-9 < job.margin && !quote.minBound) {
    findings.push({ severity: "error", rule: "margin-missed", message: `The quote lands at ${pct(quote.margin, 1)} margin, below the ${pct(job.margin, 1)} target.` });
  }
  return {
    job, quote, offerTotal, priced, verdict: v, breaks, sensitivity: sens, flat,
    flatVsQuote: { flatTotal: flat.total, quoteTotal: quote.total, shortfall: quote.total - flat.total, flatLosesMoney: flat.losesMoney },
    flatLosesBelow: flatCoversFrom,
    minChargeStopsAt: minStops, setupFallsBelowHalfAt: setupStops,
    findings,
  };
}

export function summarize(a) {
  const q = a.quote;
  const ofJob = `${a.job.quantity} pieces`;
  const base = `Quote ${cents(q.total)} for ${ofJob} (${cents(Math.round(q.perPieceCents))} a piece${q.minBound ? ", set by the minimum charge" : ""}) on a true cost of ${cents(q.cost.total)}: ${cents(q.profit)} profit, ${pct(q.margin, 1)} margin, ${money(q.effectiveHourly)} an hour for your time over ${(q.cost.hours).toFixed(2)} clock hours.`;
  return { status: a.verdict.status, text: `${base} ${a.verdict.text}` };
}

// -- batch input -----------------------------------------------------------

const COLUMNS = { name: "name", quantity: "quantity", garment_cost: "garmentCost", stitches: "stitches", colors: "colors", digitizing_fee: "digitizingFee", offer_per_piece: "offerPerPiece" };

// CSV: name,quantity,garment_cost,stitches,colors,digitizing_fee[,offer_per_piece]. A header row is optional.
export function parseJobs(text) {
  const jobs = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^name$/i.test(cells[0])) return;
    const where = `line ${i + 1}`;
    if (!cells[0]) { errors.push(`${where}: the job needs a name`); return; }
    const keys = Object.keys(COLUMNS).slice(1);
    const fields = {};
    keys.forEach((k, idx) => { if (cells[idx + 1] !== undefined && cells[idx + 1] !== "") fields[COLUMNS[k]] = cells[idx + 1]; });
    jobs.push({ name: cells[0], fields, line: i + 1 });
  });
  return { jobs, errors };
}
