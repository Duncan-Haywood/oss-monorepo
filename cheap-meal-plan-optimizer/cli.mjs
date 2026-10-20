#!/usr/bin/env node
// Cheapest meal plan from a foods file, in a terminal.
//
//   node cli.mjs --protein 120 foods.txt              # cheapest daily plan, weekly cost, what each target costs
//   node cli.mjs --style vegan --max-share 30 foods.txt
//   node cli.mjs --shopping --people 2 foods.txt      # the week's shopping list as plain text
//   node cli.mjs --csv foods.txt > plan.csv           # servings, cost and nutrition per food
//   node cli.mjs --json foods.txt                     # machine-readable
//   node cli.mjs --example                            # run on the built-in starter foods
//
// Foods file: one line per food, as on the web page ("Rice | 0.15 | 180 | 3.5 | 40 | 0.3 | 0.7").
// Zero dependencies, no network: your food list never leaves the machine. Same solver as the web
// page (calc.mjs); a planning aid, not nutrition advice.

import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  parseFoods, validateSpec, solve, verifyPlan, filterByStyle, STYLES, groceryText, planCsv,
  sampleSpec, DEFAULTS, SAMPLE_FOODS, NUTRIENTS, UNITS, money2, fmt,
} from "./calc.mjs";

const USAGE = `Find the lowest-cost servings per day that meet your calorie and nutrient targets.

Usage:
  node cli.mjs [options] <foods.txt | ->

Options:
  --kcal-min <n> --kcal-max <n>   calories per day (default ${DEFAULTS.kcalMin} to ${DEFAULTS.kcalMax}; minimum 1200)
  --protein <g>                   protein minimum in grams (default ${DEFAULTS.proteinMin})
  --fat-min <g> --fat-max <g>     fat bounds (default ${DEFAULTS.fatMin} to ${DEFAULTS.fatMax})
  --carbs-min <g> --carbs-max <g> carbohydrate bounds (default none)
  --fiber <g>                     fibre minimum (default ${DEFAULTS.fiberMin})
  --sodium-max <mg>               sodium cap
  --calcium <mg> --iron <mg> --potassium <mg>   minimums
  --max-share <pct>               most calories any one food may supply
  --max <n>                       default maximum servings per food (default ${DEFAULTS.defaultMax})
  --step <0|0.25|0.5|1>           serving step (default ${DEFAULTS.step}; 0 = any amount)
  --style <name>                  ${Object.keys(STYLES).join(", ")}
  --people <n>                    household size for --shopping (1 to 20)
  --shopping                      print the week's shopping list
  --csv | --json                  machine-readable output
  --example                       use the built-in starter foods (example prices)
  -h, --help                      this text

Not medical, dietary or nutrition advice. Prices in the starter foods are examples: use what you pay.
`;

const FLAGS = {
  "--kcal-min": "kcalMin", "--kcal-max": "kcalMax", "--protein": "proteinMin", "--fat-min": "fatMin", "--fat-max": "fatMax",
  "--carbs-min": "carbsMin", "--carbs-max": "carbsMax", "--fiber": "fiberMin", "--sodium-max": "sodiumMax",
  "--calcium": "calciumMin", "--iron": "ironMin", "--potassium": "potassiumMin", "--max-share": "maxShare",
  "--max": "defaultMax", "--step": "step", "--people": "people",
};

export function parseArgs(argv) {
  const o = { fields: {}, file: null, mode: "report", example: false, style: "any", help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--shopping") o.mode = "shopping";
    else if (a === "--csv") o.mode = "csv";
    else if (a === "--json") o.mode = "json";
    else if (a === "--example") o.example = true;
    else if (a === "--style") { o.style = argv[++i]; if (!STYLES[o.style]) throw new Error(`--style must be one of: ${Object.keys(STYLES).join(", ")}`); }
    else if (FLAGS[a]) {
      const v = argv[++i];
      if (v === undefined || v === "" || !Number.isFinite(Number(v))) throw new Error(`${a} needs a number`);
      o.fields[FLAGS[a]] = Number(v);
    } else if (a === "-" || !a.startsWith("--")) o.file = a;
    else throw new Error(`Unknown option ${a}. Try --help.`);
  }
  return o;
}

async function readInput(file) {
  if (file === "-") { const chunks = []; for await (const c of process.stdin) chunks.push(c); return Buffer.concat(chunks).toString("utf8"); }
  return readFile(file, "utf8");
}

/** Pure core: returns { code, out } so tests need no process. */
export function run(foodsText, opts) {
  const parsed = parseFoods(foodsText);
  const styled = filterByStyle(parsed.foods, opts.style || "any");
  const spec = { ...DEFAULTS, ...opts.fields, foods: styled.foods };
  const errors = [...parsed.errors, ...validateSpec(spec)];
  if (errors.length) return { code: 2, out: errors.join("\n") + "\n" };
  const res = solve(spec);
  if (res.status !== "optimal") return { code: 1, out: `No plan meets every bound (${res.status}). Loosen a target or add foods.\n` };
  const check = verifyPlan(spec, res);
  if (opts.mode === "csv") return { code: 0, out: planCsv(spec, res) };
  if (opts.mode === "shopping") return { code: 0, out: groceryText(spec, res) };
  if (opts.mode === "json") {
    return { code: 0, out: JSON.stringify({ dailyCost: res.cost, weeklyCost: res.weekly, exact: res.exact, verified: check, items: res.items.map((i) => ({ name: i.name, servings: i.servings, cost: i.cost })), totals: Object.fromEntries(NUTRIENTS.map((k, i) => [k, res.totals[i]])), marginal: res.marginal }, null, 2) + "\n" };
  }
  const lines = [`Cheapest plan: ${money2(res.cost)} a day, ${money2(res.weekly)} a week${res.exact ? "" : " (search stopped early; may not be the cheapest)"}`, ""];
  for (const it of res.items) lines.push(`  ${fmt(it.servings, 2).padStart(5)} x ${it.name}  ${money2(it.cost)}`);
  lines.push("", "Totals per day: " + NUTRIENTS.map((k, i) => `${k} ${fmt(res.totals[i], 0)}${UNITS[k] === "kcal" ? "" : UNITS[k]}`).join(", "));
  const marg = Object.entries(res.marginal).filter(([, m]) => m && m.extra > 0.005);
  if (marg.length) lines.push("", "What one more step of a target costs per day:", ...marg.map(([k, m]) => `  +${m.per}${UNITS[k]} ${k}: ${money2(m.extra)}`));
  lines.push("", "Planning aid, not nutrition advice. Prices are yours to check.");
  return { code: 0, out: lines.join("\n") + "\n" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) { process.stdout.write(USAGE); process.exit(0); }
    if (!o.example && !o.file) { process.stderr.write(USAGE); process.exit(2); }
    const text = o.example ? SAMPLE_FOODS : await readInput(o.file);
    const r = run(text, o);
    (r.code === 0 ? process.stdout : process.stderr).write(r.out);
    process.exit(r.code);
  } catch (e) { process.stderr.write(`${e.message}\n`); process.exit(2); }
}
