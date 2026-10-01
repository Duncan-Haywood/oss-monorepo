// Landlord repair-or-replace planner. Pure functions, no DOM, no network.
// Each asset (water heater, furnace, roof, appliance...) wears out on a Weibull curve whose mean life is the
// typical life the user confirms or overrides. "Repair" keeps the asset at its current age (a minimal repair:
// it works again but is no younger); when it next fails it is replaced. "Replace" installs a new asset now.
// Both paths are costed over the same horizon with a yearly discount rate, and a straight-line credit for the
// remaining life of whatever is in service at the end, so a long-lived replacement is not punished for outliving
// the horizon. The break-even quote is the repair price at which the two paths cost the same.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_ASSETS = 1;
const MAX_ASSETS = 500;
export const DEFAULTS = { horizon: 10, discount: 0.05, shape: 3, failureExtra: 200, budget: null };

// Rule-of-thumb planning lives in years. They are starting points the user edits, not measured lives of any unit.
export const LIVES = [
  [/tankless/, 20, "tankless water heater"],
  [/water ?heater|hot water/, 12, "tank water heater"],
  [/heat ?pump/, 15, "heat pump"],
  [/furnace/, 18, "furnace"],
  [/boiler/, 25, "boiler"],
  [/a\/?c\b|air ?con|condenser|cooling/, 15, "central air conditioner"],
  [/roof|shingle/, 22, "asphalt roof"],
  [/refrigerator|fridge/, 14, "refrigerator"],
  [/dishwasher/, 10, "dishwasher"],
  [/washer|washing/, 10, "washing machine"],
  [/dryer/, 12, "dryer"],
  [/range|stove|oven/, 15, "range or oven"],
  [/disposal/, 10, "garbage disposal"],
  [/sump/, 10, "sump pump"],
  [/garage/, 15, "garage door opener"],
];
export const FALLBACK_LIFE = 12;

export function typicalLife(text) {
  const t = String(text || "").toLowerCase();
  for (const [re, life, label] of LIVES) if (re.test(t)) return { life, label };
  return { life: FALLBACK_LIFE, label: "unrecognised (12 years assumed)", guessed: true };
}

// Lanczos approximation, g = 7.
const G = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function gamma(x) {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  x -= 1;
  let a = G[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += G[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

// Probability an asset of age `age` (years) fails within the next year, mean life `life`, Weibull shape `shape`.
export function failureChance(age, life, shape) {
  const scale = life / gamma(1 + 1 / shape);
  const s0 = Math.exp(-Math.pow(age / scale, shape));
  const s1 = Math.exp(-Math.pow((age + 1) / scale, shape));
  if (s0 <= 1e-300) return 1;
  return Math.min(1, Math.max(0, 1 - s1 / s0));
}

function model(asset, o) {
  const { life } = asset;
  const beta = 1 / (1 + o.discount);
  const C = asset.replace;
  const D = asset.failureExtra;
  const credit = (age) => C * Math.max(0, 1 - age / life);
  const memo = new Map();
  // Expected discounted cost of owning an asset of integer-rounded `age` for `n` more years, replacing it when it fails.
  const h = (age, n, isNew) => {
    if (n === 0) return -credit(age);
    const key = `${age}|${n}|${isNew}`;
    if (memo.has(key)) return memo.get(key);
    const q = failureChance(age, life, o.shape);
    const running = isNew ? -asset.savings : 0;
    const v = beta * (running + q * (C + D + h(0, n - 1, true)) + (1 - q) * h(age + 1, n - 1, isNew));
    memo.set(key, v);
    return v;
  };
  const repairNpv = asset.repair + h(asset.age, o.horizon, false);
  const replaceNpv = C + h(0, o.horizon, true);
  // Mean remaining years, from the survival curve at yearly steps.
  let remaining = 0, surv = 1;
  for (let t = 0; t < 60; t++) {
    surv *= 1 - failureChance(asset.age + t, life, o.shape);
    remaining += surv;
    if (surv < 1e-6) break;
  }
  return {
    repairNpv, replaceNpv,
    breakEven: replaceNpv - h(asset.age, o.horizon, false),
    pFail1: failureChance(asset.age, life, o.shape),
    pFail3: 1 - [0, 1, 2].reduce((s, t) => s * (1 - failureChance(asset.age + t, life, o.shape)), 1),
    remaining,
  };
}

const annuity = (o) => (o.discount === 0 ? o.horizon : (1 - Math.pow(1 + o.discount, -o.horizon)) / o.discount);

const moneyNum = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

// Rows: asset, type (optional), age, repair quote (blank = no quote, working unit), replacement cost, savings per year, life.
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload one row per asset: name, type, age in years, repair quote, replacement cost, and optionally yearly savings from a new one and a life in years." };
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = (l) => {
    const cells = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === delim && !q) { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  let rows = lines.map(split);
  let ci = { name: 0, type: 1, age: 2, repair: 3, replace: 4, savings: 5, life: 6 };
  const looksHeader = rows[0].some((c) => /[a-z]/i.test(c)) && rows[0].slice(2, 5).every((c) => Number.isNaN(moneyNum(c)));
  if (looksHeader) {
    const head = rows[0].map((h) => h.toLowerCase());
    const used = new Set();
    const pick = (re, fallback) => {
      const i = head.findIndex((h, k) => !used.has(k) && re.test(h));
      const r = i >= 0 ? i : fallback;
      if (r >= 0) used.add(r);
      return r;
    };
    const name = pick(/name|asset|unit|item|property|address/, 0);
    const age = pick(/age|old|years old|installed/, 2);
    const repair = pick(/repair|quote|fix/, 3);
    const replace = pick(/replace|new|install|cost/, 4);
    const savings = pick(/saving|energy|efficien|utility/, 5);
    const life = pick(/life|lifespan|expected/, 6);
    const type = pick(/type|kind|system|category/, 1);
    ci = { name, type, age, repair, replace, savings, life };
    rows = rows.slice(1);
  }
  const assets = [];
  rows.forEach((cells, i) => {
    const get = (k) => (ci[k] >= 0 && ci[k] < cells.length ? cells[ci[k]] : "");
    const name = get("name") || `Asset ${i + 1}`;
    const age = moneyNum(get("age"));
    const replace = moneyNum(get("replace"));
    const repairRaw = get("repair");
    const repair = repairRaw === "" ? 0 : moneyNum(repairRaw);
    const savingsRaw = get("savings");
    const savings = savingsRaw === "" ? 0 : moneyNum(savingsRaw);
    const lifeRaw = get("life");
    const lifeOver = lifeRaw === "" ? null : moneyNum(lifeRaw);
    const bad = (why) => warnings.push(`Skipped "${name}": ${why}.`);
    if (!Number.isFinite(age) || age < 0 || age > 100) return bad("age must be 0 to 100 years");
    if (!Number.isFinite(replace) || replace <= 0) return bad("replacement cost must be more than zero");
    if (!Number.isFinite(repair) || repair < 0) return bad("repair quote must be zero or more (leave blank for no quote)");
    if (!Number.isFinite(savings) || savings < 0) return bad("yearly savings must be zero or more");
    if (lifeOver !== null && (!Number.isFinite(lifeOver) || lifeOver < 2 || lifeOver > 80)) return bad("life must be 2 to 80 years");
    const t = typicalLife(`${get("type")} ${name}`);
    const life = lifeOver !== null ? lifeOver : t.life;
    if (lifeOver === null && t.guessed) warnings.push(`"${name}": type not recognised, so a ${FALLBACK_LIFE}-year life is assumed. Put a life in years in the last column.`);
    assets.push({ name, type: lifeOver !== null ? "your life" : t.label, age, repair, repairBlank: repairRaw === "", replace, savings, life, failureExtra: null });
  });
  if (assets.length < MIN_ASSETS) return { error: "No usable rows. " + warnings.slice(0, 3).join(" "), warnings };
  if (assets.length > MAX_ASSETS) return { error: `At most ${MAX_ASSETS} assets at a time.`, warnings };
  return { assets, warnings };
}

export function analyze(assets, options = {}) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (options[k] !== undefined && options[k] !== null && !Number.isNaN(options[k])) o[k] = options[k];
  if (!Array.isArray(assets) || assets.length < MIN_ASSETS) return { error: "Add at least one asset." };
  if (!(o.horizon >= 1 && o.horizon <= 30)) return { error: "Horizon must be 1 to 30 years." };
  if (!(o.discount >= 0 && o.discount <= 0.3)) return { error: "Discount rate must be 0% to 30%." };
  if (!(o.shape >= 1 && o.shape <= 8)) return { error: "Wear-out sharpness must be 1 to 8." };
  if (!(o.failureExtra >= 0)) return { error: "Extra cost of an unplanned failure cannot be negative." };
  o.horizon = Math.round(o.horizon);
  const warnings = [];
  const ann = annuity(o);
  const rows = assets.map((a) => {
    const asset = { ...a, failureExtra: a.failureExtra ?? o.failureExtra };
    const m = model(asset, o);
    const lo = model({ ...asset, life: asset.life * 0.75 }, o);
    const hi = model({ ...asset, life: asset.life * 1.25 }, o);
    const advantage = m.repairNpv - m.replaceNpv;
    const verdictOf = (x) => (x.repairNpv - x.replaceNpv > 0 ? "replace" : "repair");
    const close = Math.abs(advantage) < 0.05 * asset.replace;
    const action = close ? "close" : advantage > 0 ? "replace" : "repair";
    const fiftyRule = asset.repair / asset.replace > 0.5 || asset.age / asset.life > 0.5 && asset.repair / asset.replace > 0.3;
    return {
      ...asset, ...m, advantage, action, close,
      repairAnnual: m.repairNpv / ann, replaceAnnual: m.replaceNpv / ann,
      overLife: asset.age >= asset.life,
      fiftyRule,
      sensitive: verdictOf(lo) !== verdictOf(hi) || verdictOf(lo) !== verdictOf(m),
      lowVerdict: verdictOf(lo), highVerdict: verdictOf(hi),
    };
  });
  rows.sort((a, b) => b.advantage / b.replace - a.advantage / a.replace);
  // Budget: replace, best advantage per dollar first, only assets where replacing beats repairing.
  let spent = 0;
  const plan = [];
  if (o.budget !== null && o.budget > 0) {
    for (const r of rows) {
      if (r.advantage <= 0 || r.close) continue;
      if (spent + r.replace <= o.budget) { spent += r.replace; plan.push(r.name); }
    }
  }
  rows.forEach((r) => { r.inPlan = plan.includes(r.name); });
  const replaceRows = rows.filter((r) => r.action === "replace");
  if (assets.some((a) => a.repairBlank)) warnings.push("Rows with no repair quote are treated as running the unit as it is: the comparison is replace now against keep it until it fails.");
  if (rows.some((r) => r.overLife)) warnings.push("Some assets are already past their typical life. The curve then assumes failure is likely within a year or two; a unit that has outlived it is a coin you keep flipping.");
  return {
    options: o, warnings, rows, n: rows.length,
    replaceCount: replaceRows.length,
    repairCount: rows.filter((r) => r.action === "repair").length,
    closeCount: rows.filter((r) => r.action === "close").length,
    savingsIfReplaced: replaceRows.reduce((s, r) => s + r.advantage, 0),
    spendToReplace: replaceRows.reduce((s, r) => s + r.replace, 0),
    plan, planSpent: spent,
    sensitiveCount: rows.filter((r) => r.sensitive).length,
  };
}

export function reportCsv(result) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["asset", "type", "age_years", "life_years", "repair_quote", "replacement_cost", "verdict", "break_even_repair_quote", "chance_fail_1yr", "chance_fail_3yr", "repair_cost_per_year", "replace_cost_per_year", "advantage_of_replacing"];
  const lines = [head.join(",")];
  for (const r of result.rows) {
    lines.push([q(r.name), q(r.type), r.age, r.life, r.repairBlank ? "" : r.repair, r.replace, r.action, Math.round(r.breakEven), r.pFail1.toFixed(3), r.pFail3.toFixed(3), Math.round(r.repairAnnual), Math.round(r.replaceAnnual), Math.round(r.advantage)].join(","));
  }
  return lines.join("\n") + "\n";
}

export function sampleText() {
  return [
    "asset,type,age,repair quote,replacement cost,savings per year",
    "Unit 2 water heater,water heater,13,420,1450,40",
    "Unit 4 water heater,water heater,6,380,1450,40",
    "Main St furnace,furnace,19,1100,5200,180",
    "Elm St furnace,furnace,11,650,5200,180",
    "Condo AC,central air,14,890,5600,150",
    "Duplex A refrigerator,refrigerator,12,260,900,35",
    "Duplex B refrigerator,refrigerator,5,310,900,35",
    "Unit 3 dishwasher,dishwasher,9,190,650,15",
    "Elm St roof,roof,21,1800,11500,0",
    "Unit 2 dryer,dryer,8,,700,0",
  ].join("\n");
}
