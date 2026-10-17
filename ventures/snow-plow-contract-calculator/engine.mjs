// Snow plow contract calculator: pure functions, no I/O, no network.
//
// Everything here is arithmetic on numbers the user types: how many storms of
// each depth they expect in a low, normal and high year, what each contract
// model would bill the sites on their route, and what their truck, driver, fuel,
// blade and salt cost them. Nothing is a market rate and nothing is a forecast.

export const MAX_SITES = 200;
export const MAX_SEASONS = 500;

export const MODEL_NOTE =
  "Estimates, not market rates and not advice: every price, depth, storm count and cost is a number you typed. Check your contracts, insurance, local rules and what each customer will accept yourself.";

export const MODELS = ["perPush", "perInch", "flat", "cappedFlat", "hybrid"];

export const MODEL_LABELS = {
  perPush: "Per push",
  perInch: "Per inch (tiered)",
  flat: "Seasonal flat",
  cappedFlat: "Seasonal flat, capped events",
  hybrid: "Hybrid base + per push",
};

export const YEARS = ["low", "normal", "high"];
export const BANDS = ["light", "medium", "heavy"];

export const DEFAULTS = Object.freeze({
  lowEvents: [6, 3, 0],
  normalEvents: [10, 6, 2],
  highEvents: [14, 10, 5],
  probs: [25, 50, 25],
  lightDepth: 2,
  mediumDepth: 4,
  heavyDepth: 8,
  lightTime: 0.8,
  mediumTime: 1,
  heavyTime: 1.5,
  truckRate: 55,
  fuelPerHr: 15,
  bladeWearPerHr: 5,
  deadheadMin: 12,
  saltCostPerLb: 0.1,
  targetHourly: 35,
  walkAwayPct: 75,
  tierBreakInches: 6,
  tierUpliftPct: 25,
  capEvents: 10,
  hybridBasePct: 40,
  hybridPushPct: 60,
});

export const DEFAULT_SITES_CSV = `name,hours,perPush,seasonalFlat,perInch,trigger,saltLbs
Maple Plaza lot,1.5,230,3200,60,2,150
Dental office,0.75,130,1500,36,2,60
Oak Ridge HOA,3,420,5600,100,3,300
`;

export const INPUT_NOTES = [
  { what: "Sites", detail: "One row per site: name, hours to push it once at normal depth (lot size and layout), your per-push price, seasonal flat price, per-inch price, trigger depth in inches and pounds of salt per application." },
  { what: "Storms by depth band", detail: "How many light, medium and heavy storms you expect in a low-snow year, a normal year and a high-snow year, and the depth in inches you give each band. A storm shallower than a site's trigger depth is not plowed at that site." },
  { what: "Time by band", detail: "Heavy storms take longer per site than light ones. The multipliers scale each site's hours for that band (0.8, 1 and 1.5 by default). Replace them with what your route really takes." },
  { what: "Truck and driver, fuel, blade wear", detail: "Your cost per hour of running the rig. Include the driver's wage if you are the driver and want to be paid for it; the target hourly below is profit on top of these costs." },
  { what: "Deadhead and salt", detail: "Minutes of travel per site visit that nobody pays for, and your cost per pound of salt or ice melt. Salt is spread on every plowed visit to a site with pounds listed." },
  { what: "Per-inch tiers", detail: "Inches up to the break are billed at the per-inch price; inches beyond it are billed at that price plus the uplift percent." },
  { what: "Capped and hybrid", detail: "Capped: the seasonal flat covers up to the cap in storms plowed; each plow after that is billed at the per-push price. Hybrid: a base of a percent of the flat plus a percent of the per-push price each visit." },
  { what: "Target hourly and walk-away", detail: "Target is profit per hour you want after truck, fuel, blade, deadhead and salt. The walk-away price is normal-year cost plus hours x target x a floor percent of it." },
  { what: "Past-season rows", detail: "site,model,revenue,hours (and an optional season label). Net hourly = revenue / hours less your running cost per hour, grouped by contract model." },
];

export const money = (v) => {
  if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return "n/a";
  const r = Math.round(Math.abs(v) * 100) / 100;
  return `${v < -0.004 ? "-" : ""}$${r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const toNumber = (s) => {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
};

const SCALARS = [
  ["lightDepth", 0, 100], ["mediumDepth", 0, 100], ["heavyDepth", 0, 200],
  ["lightTime", 0, 20], ["mediumTime", 0, 20], ["heavyTime", 0, 20],
  ["truckRate", 0, 1e4], ["fuelPerHr", 0, 1e4], ["bladeWearPerHr", 0, 1e4], ["deadheadMin", 0, 600],
  ["saltCostPerLb", 0, 100], ["targetHourly", 0, 1e4], ["walkAwayPct", 0, 100],
  ["tierBreakInches", 0, 200], ["tierUpliftPct", 0, 1000], ["capEvents", 0, 1e4],
  ["hybridBasePct", 0, 1000], ["hybridPushPct", 0, 1000],
];

function toTriple(v, name) {
  const parts = Array.isArray(v) ? v : String(v).split(/[\s,/]+/).filter(Boolean);
  if (parts.length !== 3) throw new Error(`${name} needs three numbers: light, medium, heavy`);
  return parts.map((p) => {
    const n = toNumber(p);
    if (n === null || n < 0 || n > 1e4) throw new Error(`${name} must be three numbers between 0 and 10000`);
    return n;
  });
}

/** Merge user options over defaults and validate. Throws Error with a readable message. */
export function normalizeOptions(raw = {}) {
  const o = { ...DEFAULTS };
  for (const [k, lo, hi] of SCALARS) {
    const v = raw[k];
    if (v === undefined || v === null || v === "") continue;
    const n = toNumber(v);
    if (n === null) throw new Error(`${k} must be a number`);
    if (n < lo || n > hi) throw new Error(`${k} must be between ${lo} and ${hi}`);
    o[k] = n;
  }
  for (const k of ["lowEvents", "normalEvents", "highEvents"]) {
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "") o[k] = toTriple(raw[k], k);
  }
  if (raw.probs !== undefined && raw.probs !== null && raw.probs !== "") {
    o.probs = toTriple(raw.probs, "probs");
    if (o.probs.reduce((a, b) => a + b, 0) <= 0) throw new Error("probs must not all be zero");
  }
  if (!(o.lightDepth <= o.mediumDepth && o.mediumDepth <= o.heavyDepth)) throw new Error("depths must rise from light to heavy");
  return o;
}

function normalizeSites(sites) {
  if (!Array.isArray(sites) || !sites.length) throw new Error("Add at least one site");
  if (sites.length > MAX_SITES) throw new Error(`Too many sites: ${sites.length} (limit ${MAX_SITES})`);
  return sites;
}

/** Parse site rows: name,hours,perPush,seasonalFlat,perInch,trigger[,saltLbs]. Never throws. */
export function parseSites(text) {
  const sites = [];
  const errors = [];
  let seenHeader = false;
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = line.split(",").map((s) => s.trim());
    if (!seenHeader && /^(site|name)$/i.test(f[0])) { seenHeader = true; return; }
    seenHeader = true;
    const at = `Line ${i + 1}`;
    if (f.length < 6) { errors.push(`${at}: expected name,hours,perPush,seasonalFlat,perInch,trigger[,saltLbs]`); return; }
    const [hours, perPush, seasonalFlat, perInch, trigger] = f.slice(1, 6).map(toNumber);
    const saltLbs = f[6] === undefined || f[6] === "" ? 0 : toNumber(f[6]);
    if (!f[0]) errors.push(`${at}: site name is empty`);
    else if (hours === null || hours <= 0) errors.push(`${at}: hours must be greater than zero`);
    else if ([perPush, seasonalFlat, perInch].some((n) => n === null || n < 0)) errors.push(`${at}: prices must be dollars, zero or more`);
    else if (trigger === null || trigger < 0) errors.push(`${at}: trigger depth must be inches, zero or more`);
    else if (saltLbs === null || saltLbs < 0) errors.push(`${at}: salt pounds must be zero or more`);
    else sites.push({ name: f[0], hours, perPush, seasonalFlat, perInch, trigger, saltLbs });
  });
  if (sites.length > MAX_SITES) errors.push(`Too many sites: ${sites.length} (limit ${MAX_SITES})`);
  return { sites, errors };
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
const ratio = (p, h) => (h > 1e-12 ? p / h : null);

/** Revenue, hours and cost of one site for the given (possibly fractional) storm counts [light, medium, heavy]. */
function siteSeason(site, o, counts) {
  const depths = [o.lightDepth, o.mediumDepth, o.heavyDepth];
  const times = [o.lightTime, o.mediumTime, o.heavyTime];
  let plows = 0;
  let hours = 0;
  let inchesBilled = 0;
  depths.forEach((d, i) => {
    if (d < site.trigger || counts[i] <= 0) return;
    plows += counts[i];
    hours += counts[i] * (site.hours * times[i] + o.deadheadMin / 60);
    const billable = Math.min(d, o.tierBreakInches) + Math.max(0, d - o.tierBreakInches) * (1 + o.tierUpliftPct / 100);
    inchesBilled += counts[i] * billable;
  });
  const running = hours * (o.truckRate + o.fuelPerHr + o.bladeWearPerHr);
  const salt = plows * site.saltLbs * o.saltCostPerLb;
  const revenue = {
    perPush: plows * site.perPush,
    perInch: inchesBilled * site.perInch,
    flat: site.seasonalFlat,
    cappedFlat: site.seasonalFlat + Math.max(0, plows - o.capEvents) * site.perPush,
    hybrid: site.seasonalFlat * (o.hybridBasePct / 100) + plows * site.perPush * (o.hybridPushPct / 100),
  };
  return { plows, hours, running, salt, cost: running + salt, revenue };
}

function routeSeason(sites, o, counts) {
  const per = sites.map((s) => siteSeason(s, o, counts));
  const revenue = Object.fromEntries(MODELS.map((m) => [m, sum(per.map((p) => p.revenue[m]))]));
  return {
    per, revenue,
    plows: sum(per.map((p) => p.plows)), hours: sum(per.map((p) => p.hours)),
    running: sum(per.map((p) => p.running)), salt: sum(per.map((p) => p.salt)), cost: sum(per.map((p) => p.cost)),
  };
}

const countsFor = (o, y) => o[`${y}Events`];

/** Compare every contract model across a low, normal and high year. */
export function compare(rawSites, raw = {}) {
  const sites = normalizeSites(rawSites);
  const o = normalizeOptions(raw);
  const seasons = Object.fromEntries(YEARS.map((y) => [y, routeSeason(sites, o, countsFor(o, y))]));
  const probSum = sum(o.probs);
  const w = o.probs.map((p) => p / probSum);
  const weigh = (f) => sum(YEARS.map((y, i) => w[i] * f(seasons[y])));
  const weightedHours = weigh((s) => s.hours);
  const weightedCost = weigh((s) => s.cost);
  const normalStorms = sum(o.normalEvents);

  const models = MODELS.map((id) => {
    const revenue = Object.fromEntries(YEARS.map((y) => [y, seasons[y].revenue[id]]));
    revenue.weighted = weigh((s) => s.revenue[id]);
    const profit = Object.fromEntries(YEARS.map((y) => [y, revenue[y] - seasons[y].cost]));
    profit.weighted = revenue.weighted - weightedCost;
    const effective = Object.fromEntries(YEARS.map((y) => [y, ratio(profit[y], seasons[y].hours)]));
    effective.weighted = ratio(profit.weighted, weightedHours);
    const meets = (v) => v !== null && v >= o.targetHourly - 1e-9;
    // Scale the normal year's storm counts up and find where this model first stops paying.
    let breakEvenStorms = null;
    let targetStorms = null;
    let losesEveryStorm = false;
    if (normalStorms > 0) {
      for (let step = 1; step <= 300; step += 1) {
        const s = step * 0.02;
        const season = routeSeason(sites, o, o.normalEvents.map((n) => n * s));
        const p = season.revenue[id] - season.cost;
        if (targetStorms === null && season.hours > 0 && p / season.hours < o.targetHourly - 1e-9) targetStorms = s * normalStorms;
        if (breakEvenStorms === null && p < -1e-9) { breakEvenStorms = s * normalStorms; if (step === 1) losesEveryStorm = true; }
        if (breakEvenStorms !== null && targetStorms !== null) break;
      }
    }
    return {
      id, label: MODEL_LABELS[id], revenue, profit, effective,
      meetsTarget: Object.fromEntries(YEARS.map((y) => [y, meets(effective[y])])),
      worstYear: YEARS.reduce((a, y) => (effective[y] !== null && (a === null || effective[y] < a) ? effective[y] : a), null),
      breakEvenStorms, targetStorms, losesEveryStorm,
      sites: sites.map((s, i) => ({
        name: s.name,
        revenue: Object.fromEntries(YEARS.map((y) => [y, seasons[y].per[i].revenue[id]])),
        effective: Object.fromEntries(YEARS.map((y) => [y, ratio(seasons[y].per[i].revenue[id] - seasons[y].per[i].cost, seasons[y].per[i].hours)])),
      })),
    };
  });

  const rank = (key) => [...models].filter((m) => key(m) !== null).sort((a, b) => key(b) - key(a))[0] || null;
  const best = rank((m) => m.effective.weighted);
  const sturdiest = rank((m) => m.worstYear);

  // The seasonal flat price: what clears target in each year vs. where the year starts losing money.
  const currentFlat = sum(sites.map((s) => s.seasonalFlat));
  const need = (y) => seasons[y].cost + o.targetHourly * seasons[y].hours;
  const flat = {
    current: currentFlat,
    neededForTarget: Object.fromEntries(YEARS.map((y) => [y, need(y)])),
    loseMoneyBelow: Object.fromEntries(YEARS.map((y) => [y, seasons[y].cost])),
    walkAway: seasons.normal.cost + seasons.normal.hours * o.targetHourly * (o.walkAwayPct / 100),
    clearsTargetInLowYear: currentFlat >= need("low") - 1e-9,
    losesMoneyInHighYear: currentFlat < seasons.high.cost - 1e-9,
  };
  const perSite = sites.map((s, i) => {
    const sn = (y) => seasons[y].per[i];
    const needS = (y) => sn(y).cost + o.targetHourly * sn(y).hours;
    return {
      name: s.name, current: s.seasonalFlat,
      neededForTarget: Object.fromEntries(YEARS.map((y) => [y, needS(y)])),
      loseMoneyBelow: Object.fromEntries(YEARS.map((y) => [y, sn(y).cost])),
      walkAway: sn("normal").cost + sn("normal").hours * o.targetHourly * (o.walkAwayPct / 100),
      plows: Object.fromEntries(YEARS.map((y) => [y, sn(y).plows])),
      hours: Object.fromEntries(YEARS.map((y) => [y, sn(y).hours])),
    };
  });
  const brief = Object.fromEntries(YEARS.map((y) => [y, { plows: seasons[y].plows, hours: seasons[y].hours, running: seasons[y].running, salt: seasons[y].salt, cost: seasons[y].cost }]));
  return { options: o, sites, seasons: brief, models, best, sturdiest, flat, perSite };
}

export function summarizeCompare(c) {
  const o = c.options;
  const ok = c.models.filter((m) => m.meetsTarget.normal).length;
  const n = c.seasons.normal;
  let text = `A normal year is ${n.plows.toFixed(0)} plows and ${n.hours.toFixed(1)} hours across ${c.sites.length} site${c.sites.length === 1 ? "" : "s"}, costing ${money(n.cost)}. ${ok} of ${c.models.length} models meet ${money(o.targetHourly)} an hour in a normal year.`;
  if (c.best) text += ` Best on expected earnings: ${c.best.label} at ${money(c.best.effective.weighted)} an hour.`;
  if (c.sturdiest && c.best && c.sturdiest.id !== c.best.id) text += ` Sturdiest in its worst year: ${c.sturdiest.label} at ${money(c.sturdiest.worstYear)}.`;
  text += ` The seasonal flat total clears target in a low year at ${money(c.flat.neededForTarget.low)} but loses money in a high year below ${money(c.flat.loseMoneyBelow.high)}; walk away from a flat price under ${money(c.flat.walkAway)}.`;
  return { status: ok ? "ok" : "below", text };
}

/** Parse past-season rows: site,model,revenue,hours[,season]. Never throws; errors carry line numbers. */
export function parseSeasons(text) {
  const rows = [];
  const errors = [];
  let seenHeader = false;
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = line.split(",").map((s) => s.trim());
    if (!seenHeader && /^(site|name)$/i.test(f[0])) { seenHeader = true; return; }
    seenHeader = true;
    const at = `Line ${i + 1}`;
    if (f.length < 4) { errors.push(`${at}: expected site,model,revenue,hours`); return; }
    const revenue = toNumber(f[2]);
    const hours = toNumber(f[3]);
    if (!f[0]) errors.push(`${at}: site name is empty`);
    else if (!f[1]) errors.push(`${at}: model is empty (for example per-push, per-inch, seasonal)`);
    else if (revenue === null || revenue < 0) errors.push(`${at}: revenue must be a number of dollars, zero or more`);
    else if (hours === null || hours <= 0) errors.push(`${at}: hours must be greater than zero`);
    else rows.push({ name: f[0], model: f[1].toLowerCase(), revenue, hours, season: f[4] || "" });
  });
  if (rows.length > MAX_SEASONS) errors.push(`Too many rows: ${rows.length} (limit ${MAX_SEASONS})`);
  return { rows, errors };
}

/** Which contract model paid best per hour, net of your running cost per hour. */
export function audit(parsed, raw = {}) {
  const o = normalizeOptions(raw);
  const run = o.truckRate + o.fuelPerHr + o.bladeWearPerHr;
  const rows = (parsed.rows || []).map((r) => {
    const gross = r.revenue / r.hours;
    const net = gross - run;
    return { ...r, gross, net, atTarget: net >= o.targetHourly - 1e-9, shortfall: Math.max(0, (o.targetHourly - net) * r.hours) };
  }).sort((a, b) => a.net - b.net || a.name.localeCompare(b.name));
  const groups = new Map();
  for (const r of rows) {
    const g = groups.get(r.model) || { model: r.model, count: 0, revenue: 0, hours: 0 };
    g.count += 1; g.revenue += r.revenue; g.hours += r.hours;
    groups.set(r.model, g);
  }
  const byModel = [...groups.values()].map((g) => ({ ...g, gross: g.revenue / g.hours, net: g.revenue / g.hours - run })).sort((a, b) => b.net - a.net || a.model.localeCompare(b.model));
  const revenue = sum(rows.map((r) => r.revenue));
  const hours = sum(rows.map((r) => r.hours));
  return {
    options: o, runningPerHour: run, rows, byModel, revenue, hours,
    below: rows.filter((r) => !r.atTarget).length,
    shortfall: sum(rows.map((r) => r.shortfall)),
    blendedNet: hours > 0 ? revenue / hours - run : null,
  };
}

export function summarizeAudit(a) {
  if (!a.rows.length) return { status: "empty", text: "No rows." };
  const o = a.options;
  const best = a.byModel[0];
  const worst = a.byModel[a.byModel.length - 1];
  let text = `${a.below} of ${a.rows.length} site-seasons earned under ${money(o.targetHourly)} an hour after ${money(a.runningPerHour)} an hour of running cost (blended ${money(a.blendedNet)}).`;
  if (a.byModel.length > 1) text += ` Best model: ${best.model} at ${money(best.net)} an hour; worst: ${worst.model} at ${money(worst.net)}.`;
  return { status: a.below ? "below" : "ok", text };
}
