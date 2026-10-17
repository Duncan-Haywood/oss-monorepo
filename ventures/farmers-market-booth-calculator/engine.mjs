// Farmers market booth profit: arithmetic on the numbers the user types. No network, no dependencies.
export const DEFAULTS = {
  cogsPct: 35,
  wastePct: 6,
  cardSharePct: 70,
  cardFeePct: 2.6,
  mileCost: 0.7,
  targetWage: 25,
  markets: [
    { name: "Saturday downtown", sales: 900, boothFee: 45, feePct: 0, hours: 9, miles: 30 },
    { name: "Wednesday evening", sales: 450, boothFee: 20, feePct: 0, hours: 6, miles: 14 },
    { name: "Big weekend festival", sales: 1100, boothFee: 200, feePct: 10, hours: 16, miles: 140 },
  ],
};

export const INPUT_NOTES = [
  { what: "Sales per market day", detail: "Typical gross sales at that market, average of your last few visits, not your best day." },
  { what: "Booth fee and percent of sales", detail: "Flat stall fee, plus any percentage the market or festival takes. Some do one, some both." },
  { what: "Hours", detail: "Everything the day costs you: loading, drive, setup, selling, teardown, unloading. Not just the hours the market is open." },
  { what: "Round-trip miles", detail: "Drive to the market and back. Cost per mile covers fuel and wear; the IRS standard business rate is one published reference, but enter your own." },
  { what: "Product cost percent", detail: "Ingredients, materials and packaging as a share of sales. Include only what you would not spend if you stayed home." },
  { what: "Waste or unsold percent", detail: "Product that spoils or comes home unsold, as a share of sales, on top of the product cost of what sold." },
  { what: "Card sales share and fee", detail: "Share of sales paid by card, and the processor's percentage. Cash costs nothing; card readers do." },
  { what: "Target wage", detail: "What an hour of your time should earn. A market that clears this is worth the day; one under it is a hobby." },
];

const num = (v, name, { min = 0 } = {}) => {
  const n = v === "" || v == null ? NaN : Number(v);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number of ${min} or more.`);
  return n;
};

export function money(v) {
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}$${s}`;
}
export const pct = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;

function market(m, g, salesFactor = 1) {
  const name = String(m.name || "").trim() || "Market";
  const sales = num(m.sales, `${name}: sales`) * salesFactor;
  const boothFee = num(m.boothFee, `${name}: booth fee`);
  const feePct = num(m.feePct, `${name}: percent of sales`) / 100;
  const hours = num(m.hours, `${name}: hours`, { min: 0.25 });
  const miles = num(m.miles, `${name}: miles`);
  if (feePct >= 1) throw new Error(`${name}: percent of sales must be under 100.`);
  const cogs = sales * g.cogs;
  const waste = sales * g.waste;
  const card = sales * g.cardShare * g.cardFee;
  const pctFee = sales * feePct;
  const drive = miles * g.mileCost;
  const profit = sales - cogs - waste - card - pctFee - boothFee - drive;
  const variableMargin = 1 - g.cogs - g.waste - g.cardShare * g.cardFee - feePct;
  const fixedCost = boothFee + drive;
  const breakEven = variableMargin > 0 ? fixedCost / variableMargin : null;
  const targetSales = variableMargin > 0 ? (fixedCost + g.targetWage * hours) / variableMargin : null;
  const perHour = profit / hours;
  return {
    name, sales, boothFee, hours, miles, cogs, waste, card, pctFee, drive, profit, perHour,
    margin: sales > 0 ? profit / sales : null, breakEven, targetSales,
    gapToTarget: perHour - g.targetWage,
    verdict: perHour >= g.targetWage ? "keep" : perHour > 0 ? "reprice-or-cut" : "losing",
  };
}

export function computeMarkets(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const g = {
    cogs: num(o.cogsPct, "Product cost") / 100,
    waste: num(o.wastePct, "Waste") / 100,
    cardShare: num(o.cardSharePct, "Card share") / 100,
    cardFee: num(o.cardFeePct, "Card fee") / 100,
    mileCost: num(o.mileCost, "Cost per mile"),
    targetWage: num(o.targetWage, "Target wage"),
  };
  if (g.cogs + g.waste >= 1) throw new Error("Product cost plus waste must be under 100%.");
  if (g.cardShare > 1) throw new Error("Card share cannot be over 100%.");
  if (!Array.isArray(o.markets) || o.markets.length === 0) throw new Error("Add at least one market.");
  if (o.markets.length > 12) throw new Error("12 markets or fewer.");
  const rows = o.markets.map((m) => ({ ...market(m, g), down20: market(m, g, 0.8), up20: market(m, g, 1.2) }));
  const ranked = [...rows].sort((a, b) => b.perHour - a.perHour);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const dropWorst = rows.length > 1 && worst.perHour < g.targetWage;
  return { rows, ranked, best, worst, totalProfit, totalHours, blendedPerHour: totalProfit / totalHours, targetWage: g.targetWage, dropWorst };
}

export function summarize(r) {
  const parts = [
    `${r.best.name} earns the most per hour, ${money(r.best.perHour)} (${money(r.best.profit)} over ${r.best.hours} hours).`,
  ];
  if (r.rows.length > 1) {
    parts.push(`${r.worst.name} earns the least, ${money(r.worst.perHour)} an hour${r.worst.perHour < 0 ? ", so every visit loses money" : ""}.`);
    parts.push(`Across all of them you clear ${money(r.totalProfit)} for ${Math.round(r.totalHours * 10) / 10} hours, ${money(r.blendedPerHour)} an hour against your ${money(r.targetWage)} target.`);
  }
  if (r.dropWorst) {
    const w = r.worst;
    const without = (r.totalProfit - w.profit) / (r.totalHours - w.hours);
    parts.push(`Dropping ${w.name} would move your blended rate to ${money(without)} an hour; staying needs about ${w.targetSales == null ? "more than your margin allows" : money(w.targetSales)} in sales there.`);
  }
  return { status: r.blendedPerHour >= r.targetWage ? "ok" : "warn", text: parts.join(" ") };
}
