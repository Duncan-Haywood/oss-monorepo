// Cafe drink margin: what each drink on the menu really earns after beans, milk, cup, card fee and the barista's time,
// which drinks earn the most per barista-hour, and how many drinks a day cover rent and fixed costs.
// Arithmetic on the numbers the user types. Prices and costs are inputs, not benchmarks.

export const ROWS = 5;
export const ROW_FIELDS = ["name", "price", "beans", "milk", "flavor", "pack", "secs", "perDay"];

export const GLOBAL_DEFAULTS = {
  beanLb: "14", milkGal: "4.50", waste: "8", cardPct: "2.6", cardFixed: "0.10", wage: "17", burden: "12",
  fixedMonth: "9500", days: "30", target: "65", altMilkGal: "9.50",
};
const ROW_DEFAULTS = [
  ["Drip coffee 12 oz", "3.25", "20", "0", "0", "0.22", "25", "70"],
  ["Latte 12 oz", "5.25", "18", "10", "0.00", "0.26", "75", "90"],
  ["Flavored latte 16 oz", "6.25", "36", "13", "0.45", "0.30", "95", "45"],
  ["Cold brew 16 oz", "4.75", "40", "0", "0.00", "0.28", "35", "35"],
  ["Cappuccino 8 oz", "4.50", "18", "5", "0.00", "0.22", "70", "30"],
];
export const SHARED_DEFAULTS = { ...GLOBAL_DEFAULTS };
ROW_DEFAULTS.forEach((r, i) => ROW_FIELDS.forEach((f, j) => { SHARED_DEFAULTS[`${f}${i + 1}`] = r[j]; }));
export const EXAMPLE_SHARED = { ...SHARED_DEFAULTS };

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
export const pct = (n) => (n * 100).toFixed(1) + "%";

const OZ_PER_GAL = 128;
const G_PER_LB = 453.592;

const num = (t) => {
  const s = String(t ?? "").replace(/[$%\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

export function parseInputs(input, warnings) {
  const spec = {
    beanLb: [0, 200, "Bean cost ($/lb)"], milkGal: [0, 50, "Milk cost ($/gallon)"], waste: [0, 50, "Waste (%)"],
    cardPct: [0, 10, "Card fee (%)"], cardFixed: [0, 1, "Card fee per sale ($)"], wage: [0, 100, "Barista wage ($/hr)"],
    burden: [0, 60, "Payroll taxes and extras (%)"], fixedMonth: [0, 1e7, "Fixed costs ($/month)"], days: [1, 31, "Days open per month"],
    target: [0, 95, "Target margin (%)"], altMilkGal: [0, 80, "Alternative milk cost ($/gallon)"],
  };
  const v = {};
  for (const [k, [lo, hi, label]] of Object.entries(spec)) {
    const n = num(input[k]);
    if (n === null || Number.isNaN(n) || n < lo || n > hi) { warnings.push(`${label} must be a number from ${lo} to ${hi}.`); v[k] = NaN; } else v[k] = n;
  }
  v.rows = [];
  for (let i = 1; i <= ROWS; i++) {
    const name = String(input[`name${i}`] ?? "").trim();
    const price = num(input[`price${i}`]);
    if (!name && (price === null || price === 0)) continue; // empty row
    const r = { name: name || `Drink ${i}` };
    const rspec = { price: [0.01, 200, "price"], beans: [0, 200, "beans (g)"], milk: [0, 64, "milk (oz)"], flavor: [0, 20, "flavor and extras ($)"], pack: [0, 10, "cup and lid ($)"], secs: [1, 3600, "make time (seconds)"], perDay: [0, 100000, "drinks per day"] };
    for (const [f, [lo, hi, label]] of Object.entries(rspec)) {
      const n = num(input[`${f}${i}`]);
      if (n === null || Number.isNaN(n) || n < lo || n > hi) { warnings.push(`${r.name}: ${label} must be a number from ${lo} to ${hi}.`); r[f] = NaN; } else r[f] = n;
    }
    v.rows.push(r);
  }
  if (!v.rows.length) warnings.push("Enter at least one drink with a price.");
  return v;
}

// Per-drink economics for one drink under the given globals.
export function drinkEconomics(v, r, over = {}) {
  const g = { ...v, ...over };
  const keep = 1 + g.waste / 100;
  const beans = r.beans * (g.beanLb / G_PER_LB) * keep;
  const milk = r.milk * (g.milkGal / OZ_PER_GAL) * keep;
  const price = r.price + (over.priceAdd || 0);
  const card = price * (g.cardPct / 100) + g.cardFixed;
  const ingredients = beans + milk + r.flavor + r.pack;
  const labor = (r.secs / 3600) * g.wage * (1 + g.burden / 100);
  const beforeLabor = price - ingredients - card;
  const contribution = beforeLabor - labor;
  return { price, beansCost: beans, milkCost: milk, card, ingredients, labor, beforeLabor, contribution, margin: contribution / price, perBaristaHour: (beforeLabor * 3600) / r.secs };
}

// Price at which contribution after labor reaches the target share of the price. Null if card fees alone exceed the target room.
export function priceForTarget(v, r) {
  const e = drinkEconomics(v, r);
  const room = 1 - v.cardPct / 100 - v.target / 100;
  if (room <= 0) return null;
  return (e.ingredients + e.labor + v.cardFixed) / room;
}

function totals(v, over = {}) {
  let revenue = 0, contribution = 0, drinks = 0;
  for (const r of v.rows) {
    const e = drinkEconomics(v, r, over);
    revenue += e.price * r.perDay;
    contribution += e.contribution * r.perDay;
    drinks += r.perDay;
  }
  const fixedDay = v.fixedMonth / v.days;
  const profitDay = contribution - fixedDay;
  return { revenue, contribution, drinks, fixedDay, profitDay, profitMonth: profitDay * v.days };
}

export function analyze(input) {
  const warnings = [];
  const v = parseInputs(input, warnings);
  if (warnings.length) return { ok: false, warnings };
  const rows = v.rows.map((r) => {
    const e = drinkEconomics(v, r);
    return { ...r, ...e, targetPrice: priceForTarget(v, r), daily: e.contribution * r.perDay };
  });
  const t = totals(v);
  const avgContribution = t.drinks > 0 ? t.contribution / t.drinks : 0;
  let breakEvenDrinks = null;
  if (t.contribution > 0) breakEvenDrinks = Math.ceil(t.fixedDay / avgContribution);
  const withMilk = rows.filter((r) => r.milk > 0 && r.perDay > 0);
  const milkOz = withMilk.reduce((a, r) => a + r.milk * r.perDay, 0) / Math.max(1, withMilk.reduce((a, r) => a + r.perDay, 0));
  const keep = 1 + v.waste / 100;
  const altDelta = ((v.altMilkGal - v.milkGal) / OZ_PER_GAL) * keep;
  const altSurchargeBreakEven = Math.max(0, altDelta * milkOz) / (1 - v.cardPct / 100);
  const scenarios = [
    ["Milk costs 20% more", { milkGal: v.milkGal * 1.2 }],
    ["Beans cost 25% more", { beanLb: v.beanLb * 1.25 }],
    ["Wage up $2 an hour", { wage: v.wage + 2 }],
    ["Every price up $0.25", { priceAdd: 0.25 }],
  ].map(([label, over]) => {
    const s = totals(v, over);
    return { label, profitMonth: s.profitMonth, change: s.profitMonth - t.profitMonth };
  });
  const lowMargin = rows.filter((r) => r.margin < v.target / 100);
  if (lowMargin.length) warnings.push(`${lowMargin.map((r) => r.name).join(", ")} ${lowMargin.length === 1 ? "is" : "are"} below your ${v.target}% target margin after labor.`);
  if (t.profitDay < 0) warnings.push("At these volumes the cafe loses money each day before owner pay: contribution does not cover fixed costs.");
  warnings.push("Labor here is only the time spent making each drink. Idle barista hours, cleaning and prep are in the fixed costs you enter. Prices, volumes and costs are your numbers, not benchmarks.");
  const best = [...rows].sort((a, b) => b.perBaristaHour - a.perBaristaHour);
  return { ok: true, warnings, v, rows, totals: t, breakEvenDrinks, avgContribution, scenarios, alt: { milkOz, delta: altDelta * milkOz, surcharge: altSurchargeBreakEven }, bestPerHour: best[0], worstPerHour: best[best.length - 1] };
}

export function toCsv(a) {
  const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const head = ["Drink", "Price", "Beans", "Milk", "Flavor", "Cup", "Card fee", "Labor", "Contribution", "Margin %", "Per barista hour", "Price for target"];
  const rows = a.rows.map((r) => [r.name, r.price, r.beansCost, r.milkCost, r.flavor, r.pack, r.card, r.labor, r.contribution, r.margin * 100, r.perBaristaHour, r.targetPrice ?? ""].map((x) => (typeof x === "number" ? x.toFixed(2) : x)));
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
}
