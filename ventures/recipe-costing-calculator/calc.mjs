// Recipe costing: pantry prices + recipe lines -> batch cost, cost per portion,
// food-cost %, and the menu price that hits a target. Pure functions, no I/O.

const MASS = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
const VOLUME = { ml: 1, l: 1000, tsp: 4.92892159375, tbsp: 14.78676478125, floz: 29.5735295625, cup: 236.5882365, pt: 473.176473, qt: 946.352946, gal: 3785.411784 };
const COUNT = { each: 1, dozen: 12 };
const ALIASES = {
  gram: "g", grams: "g", kilogram: "kg", kilograms: "kg", ounce: "oz", ounces: "oz", pound: "lb", pounds: "lb", lbs: "lb",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", litre: "l", liter: "l", liters: "l", litres: "l",
  teaspoon: "tsp", teaspoons: "tsp", tablespoon: "tbsp", tablespoons: "tbsp", tbs: "tbsp", "fl oz": "floz", "fl.oz": "floz", floz: "floz",
  cups: "cup", pint: "pt", pints: "pt", quart: "qt", quarts: "qt", gallon: "gal", gallons: "gal",
  ea: "each", pc: "each", pcs: "each", piece: "each", pieces: "each", unit: "each", units: "each", egg: "each", eggs: "each", doz: "dozen",
  portion: "portion", portions: "portion", serving: "portion", servings: "portion", batch: "batch", batches: "batch",
};

export const DEFAULTS = {
  targetFoodCostPct: 30,
  laborRate: 18,
  roundTo: 0.25,
};

export const EXAMPLE_PANTRY = `# name, pack size, pack price, yield % (usable after trim/waste), density g per ml (only to mix weight and volume)
All-purpose flour, 25 lb, 14.50, 100, 0.53
Granulated sugar, 25 lb, 19.00, 100, 0.85
Butter, 1 lb, 4.60, 100, 0.96
Eggs, 15 dozen, 41.00, 100
Cocoa powder, 5 lb, 31.00, 100, 0.45
Semisweet chips, 10 lb, 38.00, 100
Powdered sugar, 50 lb, 36.00, 100, 0.56
Vanilla extract, 32 floz, 78.00, 100
Walnuts, 5 lb, 31.50, 92
Salt, 3 lb, 2.40, 100, 1.2`;

export const EXAMPLE_RECIPES = `# Vanilla frosting | portions=24
Butter, 8 oz
Powdered sugar, 1 lb
Vanilla extract, 2 tsp
Salt, 0.5 tsp

# Fudge brownie | portions=24 | price=3.50 | labor=40 | pack=0.12
Butter, 12 oz
Granulated sugar, 2 cup
Eggs, 4 each
Vanilla extract, 1 tbsp
All-purpose flour, 1 cup
Cocoa powder, 0.75 cup
Salt, 0.5 tsp
Semisweet chips, 8 oz
Walnuts, 6 oz
@Vanilla frosting, 12 portion`;

export function num(s) {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  if (t === "") return NaN;
  const m = t.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
}
export const money = (n, d = 2) => (Number.isFinite(n) ? (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
export const pct = (n, d = 1) => (Number.isFinite(n) ? (n * 100).toFixed(d) + "%" : "—");

export function normUnit(u) {
  const k = String(u ?? "").trim().toLowerCase().replace(/\.$/, "");
  const a = ALIASES[k] ?? k;
  return a;
}
export function dimension(u) {
  if (u in MASS) return "mass";
  if (u in VOLUME) return "volume";
  if (u in COUNT) return "count";
  if (u === "portion" || u === "batch") return u;
  return null;
}
const baseFactor = (u) => MASS[u] ?? VOLUME[u] ?? COUNT[u] ?? 1;

// "1 1/2 cup", "500g", "0.5 tsp" -> { qty, unit }
export function parseQty(text) {
  const t = String(text ?? "").trim().toLowerCase();
  const m = t.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*([a-z. ]*)$/);
  if (!m) return null;
  const parts = m[1].split(/\s+/);
  const qty = parts.length === 2 ? Number(parts[0]) + num(parts[1]) : num(parts[0]);
  const unit = normUnit(m[2] || "each");
  if (!Number.isFinite(qty) || !dimension(unit)) return null;
  return { qty, unit };
}

export function parsePantry(text) {
  const items = new Map();
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = line.split(/\t|,(?![^()]*\))/).map((s) => s.trim());
    if (f.length < 3) { errors.push(`Pantry line ${i + 1}: need name, pack size, pack price (${line})`); return; }
    const pack = parseQty(f[1]);
    const price = num(f[2]);
    const yieldPct = f[3] === undefined || f[3] === "" ? 100 : num(f[3]);
    const density = f[4] === undefined || f[4] === "" ? null : num(f[4]);
    if (!f[0]) { errors.push(`Pantry line ${i + 1}: missing name`); return; }
    if (!pack || !(pack.qty > 0)) { errors.push(`Pantry line ${i + 1}: cannot read pack size "${f[1]}" (${f[0]})`); return; }
    if (!(price >= 0)) { errors.push(`Pantry line ${i + 1}: cannot read price "${f[2]}" (${f[0]})`); return; }
    if (!(yieldPct > 0 && yieldPct <= 100)) { errors.push(`Pantry line ${i + 1}: yield must be above 0 and at most 100 (${f[0]})`); return; }
    if (density !== null && !(density > 0)) { errors.push(`Pantry line ${i + 1}: density must be a positive g/ml figure (${f[0]})`); return; }
    items.set(f[0].toLowerCase(), { name: f[0], pack, price, yieldPct, density });
  });
  return { items, errors };
}

export function parseRecipes(text) {
  const recipes = [];
  const errors = [];
  let cur = null;
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith("#")) {
      const parts = line.slice(1).split("|").map((s) => s.trim());
      cur = { name: parts[0], portions: 1, price: null, laborMin: 0, packPerPortion: 0, lines: [] };
      for (const p of parts.slice(1)) {
        const [k, v] = p.split("=").map((s) => s.trim().toLowerCase());
        const n = num(v);
        if (k === "portions" || k === "yield") cur.portions = n;
        else if (k === "price") cur.price = n;
        else if (k === "labor") cur.laborMin = n;
        else if (k === "pack") cur.packPerPortion = n;
        else errors.push(`Recipe "${parts[0]}": unknown setting "${k}"`);
      }
      if (!cur.name) errors.push(`Recipe line ${i + 1}: heading needs a name`);
      if (!(cur.portions > 0)) { errors.push(`Recipe "${cur.name}": portions must be above 0`); cur.portions = NaN; }
      recipes.push(cur);
      return;
    }
    if (!cur) { errors.push(`Recipe line ${i + 1}: start with "# Recipe name | portions=N" before ingredient lines`); return; }
    const sub = line.startsWith("@");
    const body = sub ? line.slice(1) : line;
    const at = body.lastIndexOf(",");
    if (at < 0) { errors.push(`Recipe "${cur.name}" line ${i + 1}: need "ingredient, quantity" (${line})`); return; }
    const q = parseQty(body.slice(at + 1));
    if (!q) { errors.push(`Recipe "${cur.name}" line ${i + 1}: cannot read quantity "${body.slice(at + 1).trim()}"`); return; }
    cur.lines.push({ name: body.slice(0, at).trim(), qty: q.qty, unit: q.unit, sub });
  });
  return { recipes, errors };
}

// Cost of `qty unit` of a pantry item, after yield loss.
export function lineCost(item, qty, unit) {
  const from = dimension(unit), to = dimension(item.pack.unit);
  let inPackUnits;
  if (from === to && (from === "mass" || from === "volume" || from === "count")) {
    inPackUnits = (qty * baseFactor(unit)) / baseFactor(item.pack.unit);
  } else if (from === "mass" && to === "volume") {
    if (!item.density) return { error: `${item.name} is bought by volume; add a density (g per ml) to use it by weight` };
    inPackUnits = (qty * baseFactor(unit)) / item.density / baseFactor(item.pack.unit);
  } else if (from === "volume" && to === "mass") {
    if (!item.density) return { error: `${item.name} is bought by weight; add a density (g per ml) to use it by volume` };
    inPackUnits = (qty * baseFactor(unit) * item.density) / baseFactor(item.pack.unit);
  } else {
    return { error: `${item.name} is bought in ${item.pack.unit}; "${unit}" cannot be converted` };
  }
  const packsUsed = inPackUnits / item.pack.qty;
  return { cost: (packsUsed * item.price) / (item.yieldPct / 100), packsUsed };
}

export function roundPrice(price, step) {
  if (!(step > 0) || !Number.isFinite(price)) return price;
  return Math.ceil(price / step - 1e-9) * step;
}

export function costRecipes(pantry, recipes, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const byName = new Map(recipes.map((r) => [r.name.toLowerCase(), r]));
  const done = new Map();
  const walking = new Set();

  function cost(r) {
    const key = r.name.toLowerCase();
    if (done.has(key)) return done.get(key);
    if (walking.has(key)) return { name: r.name, errors: [`"${r.name}" uses itself through a sub-recipe loop`], batchCost: NaN };
    walking.add(key);
    const errors = [];
    const lines = [];
    for (const l of r.lines) {
      if (l.sub) {
        const s = byName.get(l.name.toLowerCase());
        if (!s) { errors.push(`Sub-recipe "${l.name}" is not defined`); continue; }
        const sc = cost(s);
        if (sc.errors.length) errors.push(`Sub-recipe "${s.name}" has a problem, so its cost here is incomplete: ${sc.errors[0]}`);
        let c;
        if (l.unit === "portion") c = l.qty * sc.perPortion;
        else if (l.unit === "batch") c = l.qty * sc.batchCost;
        else { errors.push(`Sub-recipe "${s.name}": use portion or batch, not ${l.unit}`); continue; }
        lines.push({ name: s.name, qty: l.qty, unit: l.unit, cost: c, sub: true });
        continue;
      }
      const item = pantry.get(l.name.toLowerCase());
      if (!item) { errors.push(`"${l.name}" is not in the pantry`); continue; }
      const c = lineCost(item, l.qty, l.unit);
      if (c.error) { errors.push(c.error); continue; }
      lines.push({ name: item.name, qty: l.qty, unit: l.unit, cost: c.cost, yieldPct: item.yieldPct });
    }
    walking.delete(key);
    const ingredientCost = lines.reduce((s, l) => s + l.cost, 0);
    const laborCost = (r.laborMin / 60) * o.laborRate;
    const packagingCost = r.packPerPortion * r.portions;
    const batchCost = ingredientCost + laborCost + packagingCost;
    const perPortion = batchCost / r.portions;
    for (const l of lines) l.share = ingredientCost > 0 ? l.cost / ingredientCost : 0;
    const ranked = [...lines].sort((a, b) => b.cost - a.cost);
    const target = o.targetFoodCostPct / 100;
    const foodPerPortion = (ingredientCost + packagingCost) / r.portions;
    const suggested = foodPerPortion / target;
    const res = {
      name: r.name, portions: r.portions, lines, ranked, errors,
      ingredientCost, laborCost, packagingCost, batchCost, perPortion, foodPerPortion,
      suggestedPrice: suggested, suggestedRounded: roundPrice(suggested, o.roundTo),
      price: r.price,
    };
    if (r.price > 0) {
      res.foodCostPct = foodPerPortion / r.price;
      res.primeCostPct = perPortion / r.price;
      res.marginPerPortion = r.price - perPortion;
      res.marginBatch = res.marginPerPortion * r.portions;
      res.breakEvenCost = r.price * target;
      res.overTarget = res.foodCostPct > target + 1e-9;
    }
    done.set(key, res);
    return res;
  }
  return recipes.map(cost);
}

// What a 10% rise in each ingredient does to the cost of one portion.
export function priceShock(result, rise = 0.1) {
  return result.ranked.slice(0, 5).map((l) => ({ name: l.name, perPortion: (l.cost * rise) / result.portions }));
}

export function analyze(pantryText, recipesText, opts = {}) {
  const p = parsePantry(pantryText);
  const r = parseRecipes(recipesText);
  const results = costRecipes(p.items, r.recipes, opts);
  return { results, errors: [...p.errors, ...r.errors, ...results.flatMap((x) => x.errors.map((e) => `${x.name}: ${e}`))], pantryCount: p.items.size };
}
