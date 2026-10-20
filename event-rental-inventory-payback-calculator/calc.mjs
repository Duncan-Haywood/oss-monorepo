// Event rental inventory payback check. A party and event rental company owns chairs, tables,
// linens, dance floor and the like, and decides what to buy next. Every item has the same
// shape: units owned, what a unit cost, what one rental of a unit earns, how many times a
// year a unit goes out, what washing and loading a unit costs per rental, how many units
// break or go missing each year, and what storing a unit costs. This turns those into
// payback, annual return and break-even rentals per unit for each item, ranks the items by
// return on the money tied up, and finds the lowest rental price that pays an item back
// within the years the owner wants.
//
//   revenue      = units * rentals * price
//   handling     = units * rentals * handlingPerRental
//   processing   = processPct * revenue
//   losses       = units * unitCost * lossPct
//   storage      = units * storagePerUnit
//   cash         = revenue - handling - processing - losses - storage      (a year, before the item's own wear)
//   depreciation = units * unitCost / lifeYears
//   profit       = cash - depreciation
//   payback      = units * unitCost / cash   years
//   roi          = cash / (units * unitCost)
//   breakeven    = rentals per unit per year where profit is 0
//   minPrice     = ((unitCost/target + storage + unitCost*lossPct) / rentals + handling) / (1 - processPct)   (exact, per unit)

export function validateItem(it, label) {
  const e = [];
  const pre = label ? `${label}: ` : "";
  const nonneg = (v, max) => Number.isFinite(v) && v >= 0 && v <= max;
  const pos = (v, max) => Number.isFinite(v) && v > 0 && v <= max;
  if (!(typeof it.name === "string" && it.name.trim().length > 0 && it.name.length <= 60)) e.push(`${pre}Give the item a name of up to 60 characters.`);
  if (!(Number.isInteger(it.units) && it.units >= 1 && it.units <= 100000)) e.push(`${pre}Units owned must be a whole number from 1 to 100,000.`);
  if (!pos(it.unitCost, 100000)) e.push(`${pre}Cost per unit must be above $0 and at most $100,000.`);
  if (!pos(it.price, 100000)) e.push(`${pre}Price per unit per rental must be above $0 and at most $100,000.`);
  if (!pos(it.rentals, 365)) e.push(`${pre}Rentals per unit per year must be above 0 and at most 365.`);
  if (!nonneg(it.handling, 10000)) e.push(`${pre}Handling cost per unit per rental must be between $0 and $10,000.`);
  if (!nonneg(it.lossPct, 100)) e.push(`${pre}Yearly loss and damage must be between 0% and 100% of units.`);
  if (!nonneg(it.storage, 10000)) e.push(`${pre}Storage per unit per year must be between $0 and $10,000.`);
  if (!pos(it.lifeYears, 50)) e.push(`${pre}Useful life must be above 0 and at most 50 years.`);
  return e;
}

export function validateInput(i) {
  const e = [];
  if (!Array.isArray(i.items) || i.items.length < 1) e.push("Add at least one item.");
  else if (i.items.length > 30) e.push("Use at most 30 items.");
  else i.items.forEach((it, n) => e.push(...validateItem(it, `Item ${n + 1}`)));
  if (!(Number.isFinite(i.processPct) && i.processPct >= 0 && i.processPct <= 15)) e.push("Card fees must be between 0% and 15%.");
  if (!(Number.isFinite(i.targetYears) && i.targetYears > 0 && i.targetYears <= 20)) e.push("Target payback must be above 0 and at most 20 years.");
  return e;
}

function itemFigures(it, g) {
  const p = g.processPct / 100;
  const loss = it.lossPct / 100;
  const invested = it.units * it.unitCost;
  const revenue = it.units * it.rentals * it.price;
  const handling = it.units * it.rentals * it.handling;
  const processing = p * revenue;
  const losses = invested * loss;
  const storage = it.units * it.storage;
  const cash = revenue - handling - processing - losses - storage;
  const depreciation = invested / it.lifeYears;
  const profit = cash - depreciation;
  const perRentalNet = it.price * (1 - p) - it.handling;
  const fixedPerUnit = it.unitCost / it.lifeYears + it.storage + it.unitCost * loss;
  const breakeven = perRentalNet > 0 ? fixedPerUnit / perRentalNet : null;
  const minPrice = ((it.unitCost / g.targetYears + it.storage + it.unitCost * loss) / it.rentals + it.handling) / (1 - p);
  return {
    name: it.name.trim(), units: it.units, invested, revenue, handling, processing, losses, storage, cash, depreciation, profit,
    roi: cash / invested, paybackYears: cash > 0 ? invested / cash : null, breakevenRentals: breakeven,
    minPrice, priceGap: it.price - minPrice, meetsTarget: cash > 0 && invested / cash <= g.targetYears + 1e-12,
    profitPerUnit: profit / it.units, lifetimeProfit: profit * it.lifeYears, rentals: it.rentals, price: it.price,
    cushion: breakeven === null ? null : it.rentals / breakeven,
  };
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const items = input.items.map((it) => itemFigures(it, input));
  const ranked = items.map((x, index) => ({ ...x, index })).sort((a, b) => b.roi - a.roi || a.index - b.index);
  ranked.forEach((x, n) => { x.rank = n + 1; });
  const sum = (k) => items.reduce((s, x) => s + x[k], 0);
  const totals = {
    invested: sum("invested"), revenue: sum("revenue"), cash: sum("cash"), profit: sum("profit"),
    roi: sum("cash") / sum("invested"), paybackYears: sum("cash") > 0 ? sum("invested") / sum("cash") : null,
  };
  return { ok: true, input, items, ranked, best: ranked[0], worst: ranked[ranked.length - 1], totals, notes: buildNotes(input, items, ranked, totals) };
}

function buildNotes(i, items, ranked, t) {
  const n = [];
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (ranked.length > 1) n.push(`${best.name} earns the most on the money tied up: ${pct(best.roi)} a year, paid back in ${best.paybackYears === null ? "never" : best.paybackYears.toFixed(1) + " years"}. Put the next purchase here first.`);
  else n.push(`${best.name} earns ${pct(best.roi)} a year on the money tied up.`);
  for (const x of items) {
    if (x.cash <= 0) n.push(`${x.name} never pays for itself at ${cents(x.price)} a rental: handling, losses and storage eat everything it brings in.`);
    else if (!x.meetsTarget) n.push(`${x.name} pays back in ${x.paybackYears.toFixed(1)} years, past your ${i.targetYears}-year target. Rent it for at least ${cents(x.minPrice)} a unit to hit the target, ${cents(-x.priceGap)} more than now.`);
    if (x.cash > 0 && x.profit < 0) n.push(`${x.name} returns cash but does not cover its own wear over ${(x.invested / x.depreciation).toFixed(1)} years: it loses ${money(-x.profit)} a year after depreciation.`);
  }
  if (ranked.length > 1 && worst.roi < best.roi / 2) n.push(`${worst.name} returns less than half of ${best.name} on every dollar tied up. Do not add to it until the better item is stocked.`);
  return n;
}

export function money(x) {
  const neg = Math.round(x) < 0;
  return (neg ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
}
export const cents = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
export const pct = (x) => (x * 100).toFixed(1) + "%";

export function sampleInput() {
  return {
    processPct: 3, targetYears: 2,
    items: [
      { name: "Folding chairs", units: 300, unitCost: 22, price: 1.5, rentals: 28, handling: 0.15, lossPct: 3, storage: 0.6, lifeYears: 8 },
      { name: "60-inch round tables", units: 40, unitCost: 135, price: 10, rentals: 24, handling: 1.2, lossPct: 1, storage: 4, lifeYears: 10 },
      { name: "Linen tablecloths", units: 80, unitCost: 26, price: 9, rentals: 9, handling: 4.5, lossPct: 8, storage: 0.5, lifeYears: 3 },
      { name: "Chiavari chairs", units: 150, unitCost: 48, price: 6.5, rentals: 14, handling: 0.6, lossPct: 2, storage: 1.1, lifeYears: 8 },
      { name: "Dance floor panels", units: 36, unitCost: 210, price: 14, rentals: 6, handling: 2, lossPct: 1, storage: 8, lifeYears: 10 },
    ],
  };
}

export function resultText(r) {
  const lines = [
    `Rental inventory payback: ${r.items.length} items, ${money(r.totals.invested)} invested, ${money(r.totals.cash)} cash a year (${pct(r.totals.roi)}), payback ${r.totals.paybackYears === null ? "never" : r.totals.paybackYears.toFixed(1) + " years"}`,
    ...r.ranked.map((x) => `${x.rank}. ${x.name}: ${pct(x.roi)} a year, payback ${x.paybackYears === null ? "never" : x.paybackYears.toFixed(1) + " years"}, break-even ${x.breakevenRentals === null ? "n/a" : x.breakevenRentals.toFixed(1)} rentals per unit a year, lowest price for ${r.input.targetYears}-year payback ${cents(x.minPrice)}`),
    "Arithmetic on the numbers entered, not tax, legal, insurance or financial advice.",
  ];
  return lines.join("\n");
}

export function resultCsv(r) {
  const head = "rank,item,units,invested,revenue,handling,card_fees,losses,storage,cash_per_year,depreciation,profit_per_year,roi,payback_years,breakeven_rentals,minimum_price";
  const num = (v) => (v === null ? "" : Math.round(v * 10000) / 10000);
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = r.ranked.map((x) => [x.rank, q(x.name), x.units, num(x.invested), num(x.revenue), num(x.handling), num(x.processing), num(x.losses), num(x.storage), num(x.cash), num(x.depreciation), num(x.profit), num(x.roi), num(x.paybackYears), num(x.breakevenRentals), num(x.minPrice)].join(","));
  return [head, ...rows].join("\n");
}

const APP = "event-rental-inventory-payback-calculator";
export function serializeState(input) { return JSON.stringify({ app: APP, version: 1, input }, null, 2); }
export function parseState(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== APP || !d.input) return { error: "That file is not a saved rental inventory scenario." };
  const errs = validateInput(d.input);
  if (errs.length) return { error: errs[0] };
  return { state: d.input };
}
