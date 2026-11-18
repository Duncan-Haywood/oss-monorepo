// Simulated CBC answers with known utilities, for the bundled example and
// for the recovery and standard-error checks (eval/coverage.mjs).
//   node simulate.mjs > data/meal-kit-simulated.csv
// The page's example button calls simulate() and gets this same file.
import { generateDesign, parseAttributes, rng } from "./engine.mjs";

export const MEAL_KIT_ATTRIBUTES = `Price per serving#: 7, 9, 11, 13
Recipes per week: 2, 3, 4, 5
Menu: Classic, Vegetarian-friendly, Chef's premium
Delivery: Fixed weekly day, Pick any day
Packaging: Standard, Compostable`;

// Respondent-level utilities are drawn around these means (the coefficient
// order of parameters(): non-reference levels, price slope, none last).
export const TRUE_MEAN = {
  "Price per serving": -0.45, // per dollar
  "Recipes per week: 3": 0.35, "Recipes per week: 4": 0.55, "Recipes per week: 5": 0.6,
  "Menu: Vegetarian-friendly": 0.1, "Menu: Chef's premium": 0.5,
  "Delivery: Pick any day": 0.4,
  "Packaging: Compostable": 0.25,
  None: 0.3,
};
export const TRUE_SD = { "Price per serving": 0.15, None: 1.0, other: 0.5 };

function normal(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
const gumbel = (rand) => -Math.log(-Math.log(rand() || 1e-300));

/**
 * mean, sd: maps keyed as TRUE_MEAN ("Attr: level", numeric attribute name, "None").
 * Returns long-format CSV text.
 */
export function simulate({ attributes, mean = TRUE_MEAN, sd = TRUE_SD, n = 300, versions = 10, tasks = 12, concepts = 3, none = true, seed = 7, designSeed = 1 } = {}) {
  const atts = attributes ?? parseAttributes(MEAL_KIT_ATTRIBUTES);
  const d = generateDesign({ attributes: atts, versions, tasks, concepts, none, seed: designSeed, candidates: 10 });
  const rand = rng(seed);
  const sdOf = (k) => (sd[k] ?? sd.other ?? 0);
  const centre = d.attributes.map((a) => (a.numeric ? a.levels.reduce((t, l) => t + Number(l), 0) / a.levels.length : 0));
  const lines = [["respondent", "task", "concept", ...d.attributes.map((a) => a.name), "chosen"].map((s) => (/[",]/.test(s) ? `"${s}"` : s)).join(",")];
  for (let r = 0; r < n; r++) {
    const b = {};
    for (const k of Object.keys(mean)) b[k] = mean[k] + sdOf(k) * normal(rand);
    const version = d.design[r % versions];
    version.forEach((task, ti) => {
      const u = task.map((c) => c.reduce((t, l, j) => {
        const a = d.attributes[j];
        if (a.numeric) return t + (b[a.name] ?? 0) * (Number(l) - centre[j]);
        return t + (b[`${a.name}: ${l}`] ?? 0);
      }, 0) + gumbel(rand));
      if (none) u.push((b.None ?? 0) + gumbel(rand));
      const pick = u.indexOf(Math.max(...u));
      task.forEach((c, ci) => lines.push([`R${String(r + 1).padStart(3, "0")}`, ti + 1, ci + 1, ...c.map((x) => (/[",]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)), pick === ci ? 1 : 0].join(",")));
      if (none) lines.push([`R${String(r + 1).padStart(3, "0")}`, ti + 1, task.length + 1, ...d.attributes.map(() => "None"), pick === task.length ? 1 : 0].join(","));
    });
  }
  return lines.join("\n") + "\n";
}

if (typeof process !== "undefined" && /simulate\.mjs$/.test(process.argv?.[1] ?? "")) process.stdout.write(simulate());
