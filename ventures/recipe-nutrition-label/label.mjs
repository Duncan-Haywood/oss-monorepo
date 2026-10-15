// Recipe -> FDA-style Nutrition Facts panel. Deterministic, no network, no deps.
// Rounding and Daily Values follow this tool's reading of 21 CFR 101.9 (2020
// panel, adults and children 4+). Check every figure against the rule or a lab
// before printing a label you sell under.

export const COLUMNS = ["calories", "fat", "satFat", "transFat", "cholesterol", "sodium", "carbs", "fiber", "sugars", "addedSugars", "protein", "vitD", "calcium", "iron", "potassium"];
export const CSV_HEADER = ["name", "grams", ...COLUMNS].join(",");
const CORE = ["calories", "fat", "carbs", "protein", "sodium"];

// Daily Values, 21 CFR 101.9(c)(9), 2020 label.
export const DV = { fat: 78, satFat: 20, cholesterol: 300, sodium: 2300, carbs: 275, fiber: 28, addedSugars: 50, vitD: 20, calcium: 1300, iron: 18, potassium: 4700 };
export const UNITS = { calories: "", fat: "g", satFat: "g", transFat: "g", cholesterol: "mg", sodium: "mg", carbs: "g", fiber: "g", sugars: "g", addedSugars: "g", protein: "g", vitD: "mcg", calcium: "mg", iron: "mg", potassium: "mg" };

// Approximate USDA FoodData Central values per 100 g (public domain data),
// typed here for convenience. Branded products differ: use your package label.
const P = (name, ...v) => ({ name, per100: Object.fromEntries(COLUMNS.map((c, i) => [c, v[i]])) });
//                               cal   fat   sat   trans chol  sodium carbs  fiber sug   addS  prot  vitD  ca   iron  K
export const PANTRY = [
  P("All-purpose flour",         364,  0.98, 0.15, 0,    0,    2,     76.3,  2.7,  0.27, 0,    10.3, 0,    15,  4.64, 107),
  P("Granulated sugar",          387,  0,    0,    0,    0,    1,     100,   0,    99.8, 99.8, 0,    0,    1,   0.05, 2),
  P("Brown sugar",               380,  0,    0,    0,    0,    28,    98.1,  0,    97,   97,   0.12, 0,    83,  0.71, 133),
  P("Unsalted butter",           717,  81.1, 51.4, 3.3,  215,  11,    0.06,  0,    0.06, 0,    0.85, 0,    24,  0.02, 24),
  P("Whole egg",                   143,  9.51, 3.13, 0,    372,  142,   0.72,  0,    0.37, 0,    12.6, 2,    56,  1.75, 138),
  P("Whole milk",                61,   3.2,  1.87, 0,    10,   43,    4.8,   0,    5.05, 0,    3.15, 1.3,  113, 0.03, 132),
  P("Rolled oats",               379,  6.52, 1.11, 0,    0,    6,     67.7,  10.1, 0.99, 0,    13.15,0,    52,  4.25, 362),
  P("Honey",                     304,  0,    0,    0,    0,    4,     82.4,  0.2,  82.1, 82.1, 0.3,  0,    6,   0.42, 52),
  P("Vegetable oil",             884,  100,  14.5, 0,    0,    0,     0,     0,    0,    0,    0,    0,    0,   0,    0),
  P("Olive oil",                 884,  100,  13.8, 0,    0,    2,     0,     0,    0,    0,    0,    0,    1,   0.56, 1),
  P("Table salt",                0,    0,    0,    0,    0,    38758, 0,     0,    0,    0,    0,    0,    24,  0.33, 8),
];

const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

function splitCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function pantryLine(name, grams) {
  const item = PANTRY.find((p) => p.name.toLowerCase() === String(name).toLowerCase());
  if (!item) throw new Error(`not in the pantry: ${name}`);
  const q = item.name.includes(",") ? `"${item.name}"` : item.name;
  return [q, grams, ...COLUMNS.map((c) => item.per100[c])].join(",");
}

// CSV: name, grams, then the 15 per-100 g columns in COLUMNS order. A header
// row is optional. Blank cells are kept as null so they can be reported.
export function parseRecipe(text) {
  const ingredients = [], warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  lines.forEach((line, idx) => {
    const cells = splitCsvLine(line);
    if (idx === 0 && /^name$/i.test(cells[0]) ) return;
    const [name, g, ...rest] = cells;
    const grams = num(g);
    if (!name || grams == null || grams <= 0) { warnings.push(`Skipped line ${idx + 1}: needs a name and a weight in grams (${line.slice(0, 40)}).`); return; }
    if (rest.length > COLUMNS.length) warnings.push(`Line ${idx + 1} (${name}) has extra columns; ignored after ${COLUMNS[COLUMNS.length - 1]}.`);
    const per100 = {};
    COLUMNS.forEach((c, i) => { per100[c] = num(rest[i]); if (per100[c] != null && per100[c] < 0) per100[c] = null; });
    ingredients.push({ name, grams, per100 });
  });
  for (const ing of ingredients) {
    const blank = CORE.filter((c) => ing.per100[c] == null);
    if (blank.length) warnings.push(`${ing.name}: no value for ${blank.join(", ")}; counted as 0, which understates the label. Enter 0 if it really is zero.`);
  }
  return { ingredients, warnings };
}

// ---- rounding (this tool's reading of 21 CFR 101.9(c)) ----
const snap = (x, step) => Math.round(x / step + 1e-9) * step;
const clean = (x) => Math.round(x * 100) / 100;

export function roundAmount(key, x) {
  if (key === "calories") return x < 5 ? 0 : x <= 50 ? snap(x, 5) : snap(x, 10);
  if (key === "fat" || key === "satFat" || key === "transFat") return x < 0.5 ? 0 : x < 5 ? clean(snap(x, 0.5)) : snap(x, 1);
  if (key === "cholesterol") return x < 2 ? 0 : x <= 5 ? "lt5" : snap(x, 5);
  if (key === "sodium") return x < 5 ? 0 : x <= 140 ? snap(x, 5) : snap(x, 10);
  if (key === "potassium") return x < 5 ? 0 : snap(x, 10);
  if (key === "calcium") return x < 5 ? 0 : snap(x, 10);
  if (key === "iron") return clean(snap(x, 0.1));
  if (key === "vitD") return clean(snap(x, 0.1));
  // carbs, fiber, sugars, added sugars, protein
  return x < 0.5 ? 0 : x < 1 ? "lt1" : snap(x, 1);
}

const INCREMENT_DV = new Set(["vitD", "calcium", "iron", "potassium"]);
export function roundPercentDV(key, pct) {
  if (INCREMENT_DV.has(key)) {
    if (pct <= 10) return snap(pct, 2);
    if (pct <= 50) return snap(pct, 5);
    return snap(pct, 10);
  }
  return Math.round(pct + 1e-9);
}

export function formatAmount(key, v) {
  if (v === "lt5") return "less than 5 mg";
  if (v === "lt1") return "less than 1 g";
  return key === "calories" ? String(v) : `${v} ${UNITS[key]}`;
}

export function servingsPerContainer(yieldG, servingG) {
  const n = yieldG / servingG;
  if (n < 2) return clean(snap(n, 0.1));
  if (n < 5) return snap(n, 0.5);
  return snap(n, 1);
}

// ---- allergens ----
const ALLERGENS = {
  Milk: /\b(milk|butter|buttermilk|cream|cheese|yogurt|yoghurt|whey|casein|caseinate|ghee|lactose|custard|ice cream|half and half|half-and-half|kefir|paneer|ricotta|mozzarella|parmesan|cheddar)\b/i,
  Eggs: /\b(eggs?|albumen|mayonnaise|mayo|meringue|egg whites?|egg yolks?|aioli)\b/i,
  Wheat: /\b(wheat|flour|semolina|durum|farina|spelt|bread|breadcrumbs?|pasta|couscous|bulgur|seitan|noodles?|crackers?|graham|kamut|einkorn)\b/i,
  Soybeans: /\b(soy|soya|soybeans?|tofu|edamame|miso|tempeh|shoyu|tamari)\b/i,
  Peanuts: /\b(peanuts?|groundnuts?)\b/i,
  "Tree nuts": /\b(almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|filberts?|macadamias?|brazil nuts?|pine nuts?|pinon|chestnuts?|praline|marzipan|nutella)\b/i,
  Fish: /\b(fish|salmon|tuna|cod|anchov(y|ies)|sardines?|trout|tilapia|halibut|haddock|mackerel|bass|snapper|pollock|herring|fish sauce|worcestershire)\b/i,
  "Crustacean shellfish": /\b(shrimps?|prawns?|crabs?|lobsters?|crawfish|crayfish|langoustines?)\b/i,
  Sesame: /\b(sesame|tahini|halva|halvah|gomasio)\b/i,
};
// Phrases that contain an allergen word but are not that allergen.
const NOT_MILK = /\b(coconut|almond|oat|soy|soya|rice|cashew|hemp|pea|macadamia) (milk|cream|yogurt|butter)\b|\bcocoa butter\b|\bshea butter\b|\bcream of tartar\b|\b(peanut|almond|cashew|sunflower seed|nut) butter\b/gi;
const NOT_EGG = /\beggplant\b/gi;
const NOT_WHEAT = /\b(buckwheat|rice|almond|coconut|oat|chickpea|corn|tapioca|potato|sorghum|millet|teff|cassava|quinoa|amaranth|gluten[- ]free)( (flour|starch|pasta|noodles?|bread))?\b|\bcorn ?starch\b/gi;
const NOT_NUT = /\b(nutmeg|butternut|water chestnuts?|coconut)\b/gi;

export function detectAllergens(names) {
  const found = {}, notes = [];
  for (const raw of names) {
    const n = String(raw);
    const test = (label, re, cleaned) => { if (re.test(cleaned ?? n)) (found[label] ||= []).push(n); };
    test("Milk", ALLERGENS.Milk, n.replace(NOT_MILK, " "));
    test("Eggs", ALLERGENS.Eggs, n.replace(NOT_EGG, " "));
    const wheatText = n.replace(NOT_WHEAT, " ");
    test("Wheat", ALLERGENS.Wheat, wheatText);
    for (const k of ["Soybeans", "Peanuts", "Fish", "Crustacean shellfish", "Sesame"]) test(k, ALLERGENS[k]);
    test("Tree nuts", ALLERGENS["Tree nuts"], n.replace(NOT_NUT, " "));
    if (/\bflour\b/i.test(wheatText) && !/\bwheat\b/i.test(n)) notes.push(`"${n}" is treated as wheat. If it is another flour, name it (for example "rice flour").`);
    if (/\b(nuts?|mixed nuts)\b/i.test(n) && !ALLERGENS["Tree nuts"].test(n) && !/\bpeanut/i.test(n)) notes.push(`"${n}": name the nut. Tree nuts must be declared by type (almond, walnut, ...).`);
    if (/\b(natural flavou?rs?|spices?|seasoning|lecithin|vegetable shortening|margarine|chocolate|sprinkles)\b/i.test(n)) notes.push(`"${n}" can hide milk, soy or other allergens. Check your supplier's label.`);
  }
  return { found, notes };
}

export function allergenStatement(found) {
  const keys = Object.keys(found);
  return keys.length ? `Contains: ${keys.join(", ")}.` : "";
}

const sentenceCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function ingredientStatement(ingredients) {
  const merged = new Map();
  for (const i of ingredients) {
    const k = i.name.trim().toLowerCase();
    merged.set(k, (merged.get(k) || 0) + i.grams);
  }
  const parts = [...merged.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  return parts.length ? `Ingredients: ${sentenceCase(parts.join(", "))}.` : "";
}

// ---- compute ----
export function buildLabel(ingredients, opts = {}) {
  const warnings = [];
  if (!ingredients.length) throw new Error("no ingredients");
  const rawG = ingredients.reduce((s, i) => s + i.grams, 0);
  const servingG = Number(opts.servingG);
  if (!(servingG > 0)) throw new Error("serving size in grams is required");
  const yieldG = opts.yieldG != null && Number(opts.yieldG) > 0 ? Number(opts.yieldG) : rawG;
  if (opts.yieldG == null) warnings.push("No finished weight given: using the total ingredient weight. Baked or cooked food loses water, so weigh the finished batch and enter it, or every serving is understated.");
  else if (yieldG > rawG * 1.05) warnings.push("Finished weight is more than the ingredients weigh. If you added water, add it as an ingredient.");
  else if (yieldG < rawG * 0.4) warnings.push("Finished weight is under 40% of the ingredient weight. Check that it is in grams.");
  if (servingG > yieldG) warnings.push("Serving size is larger than the whole batch.");

  const totals = {};
  for (const c of COLUMNS) totals[c] = ingredients.reduce((s, i) => s + (i.per100[c] ?? 0) * i.grams / 100, 0);
  const factor = servingG / yieldG;
  const raw = Object.fromEntries(COLUMNS.map((c) => [c, totals[c] * factor]));

  if (opts.fillCalories !== false && ingredients.some((i) => i.per100.calories == null)) {
    for (const i of ingredients) if (i.per100.calories == null) {
      const p = i.per100;
      i.per100 = { ...p, calories: 9 * (p.fat ?? 0) + 4 * (p.protein ?? 0) + 4 * (p.carbs ?? 0) };
      warnings.push(`${i.name}: calories estimated from fat, protein and carbohydrate (9/4/4).`);
    }
    for (const c of ["calories"]) { totals[c] = ingredients.reduce((s, i) => s + (i.per100[c] ?? 0) * i.grams / 100, 0); raw[c] = totals[c] * factor; }
  }

  const check = 9 * raw.fat + 4 * raw.protein + 4 * raw.carbs;
  if (raw.calories > 0 && check > 0 && Math.abs(check - raw.calories) / raw.calories > 0.25) warnings.push(`Calories (${Math.round(raw.calories)}) differ from fat, protein and carbohydrate (about ${Math.round(check)}) by more than 25%. A typo in one ingredient's row is the usual cause.`);
  if (raw.satFat > raw.fat + 0.05) warnings.push("Saturated fat is higher than total fat. Check the ingredient rows.");
  if (raw.transFat + raw.satFat > raw.fat + 0.05) warnings.push("Saturated plus trans fat is higher than total fat.");
  if (raw.sugars > raw.carbs + 0.05) warnings.push("Total sugars are higher than total carbohydrate.");
  if (raw.addedSugars > raw.sugars + 0.05) warnings.push("Added sugars are higher than total sugars.");
  if (raw.fiber + raw.sugars > raw.carbs + 0.05) warnings.push("Fiber plus sugars is higher than total carbohydrate.");

  const rows = {};
  for (const c of COLUMNS) {
    const amount = roundAmount(c, raw[c]);
    const row = { amount, display: formatAmount(c, amount), raw: raw[c] };
    if (DV[c]) row.dv = roundPercentDV(c, raw[c] / DV[c] * 100);
    rows[c] = row;
  }
  const names = ingredients.map((i) => i.name);
  const allergens = detectAllergens(names);
  const spc = servingsPerContainer(yieldG, servingG);
  return {
    name: opts.name || "Recipe",
    serving: { grams: servingG, text: opts.servingText || "", perContainer: spc },
    yieldG, rawG, rows, warnings,
    ingredientStatement: ingredientStatement(ingredients),
    allergens: allergens.found, allergenStatement: allergenStatement(allergens.found), allergenNotes: allergens.notes,
  };
}

export const LABELS = { calories: "Calories", fat: "Total Fat", satFat: "Saturated Fat", transFat: "Trans Fat", cholesterol: "Cholesterol", sodium: "Sodium", carbs: "Total Carbohydrate", fiber: "Dietary Fiber", sugars: "Total Sugars", addedSugars: "Added Sugars", protein: "Protein", vitD: "Vitamin D", calcium: "Calcium", iron: "Iron", potassium: "Potassium" };

export function toText(label) {
  const r = label.rows, L = [];
  L.push("Nutrition Facts");
  L.push(`${label.serving.perContainer} servings per container`);
  L.push(`Serving size  ${label.serving.text ? label.serving.text + " " : ""}(${label.serving.grams}g)`);
  L.push(`Calories ${r.calories.amount}`);
  L.push("                         % Daily Value*");
  const line = (k, indent = 0) => `${" ".repeat(indent)}${LABELS[k]} ${r[k].display}${r[k].dv != null ? `  ${r[k].dv}%` : ""}`;
  L.push(line("fat"), line("satFat", 2), line("transFat", 2), line("cholesterol"), line("sodium"), line("carbs"), line("fiber", 2), line("sugars", 2));
  L.push(`${" ".repeat(4)}Includes ${r.addedSugars.display} Added Sugars${r.addedSugars.dv != null ? `  ${r.addedSugars.dv}%` : ""}`);
  L.push(line("protein"), line("vitD"), line("calcium"), line("iron"), line("potassium"));
  L.push("* The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.");
  if (label.ingredientStatement) L.push("", label.ingredientStatement);
  if (label.allergenStatement) L.push(label.allergenStatement);
  return L.join("\n");
}

const csvCell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(label) {
  const out = [["Nutrient", "Per serving (rounded)", "% Daily Value", "Unrounded"].map(csvCell).join(",")];
  for (const c of COLUMNS) out.push([LABELS[c], label.rows[c].display, label.rows[c].dv ?? "", Math.round(label.rows[c].raw * 100) / 100].map(csvCell).join(","));
  return out.join("\n") + "\n";
}
