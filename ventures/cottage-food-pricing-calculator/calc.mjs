/**
 * What a home baker or cottage-food maker should charge per item, per sales
 * channel, and what they really earn per hour at today's prices.
 *
 * Home bakers, candle-less food makers, jam and sauce sellers and cottage-food
 * cooks price from the grocery bill ("flour and butter came to $9, so $3 a
 * loaf"). That leaves out their own hours, the kitchen and insurance, the
 * packaging, the loaves that do not sell, the card fee, and, at a farmers'
 * market, the booth. Each of those is small; together they commonly turn a
 * "40% margin" into a few dollars an hour.
 *
 * ## Three design decisions are load-bearing
 *
 * **Cost is per sellable unit, not per baked unit.** Unsold or spoiled units
 * (the waste share) still cost ingredients and time, so the batch cost is
 * divided by `units x (1 - waste)`. Dividing by units baked is the usual
 * error and always prices too low.
 *
 * **The margin is a share of the price, not a markup on cost.** A price built
 * as `cost x 1.4` leaves a 28.6% margin, not 40%. Required price is solved as
 * `cost / (1 - margin - feeShare)` so fees that scale with price (card, market
 * platform, marketplace) are paid out of the price they are charged on.
 *
 * **Fixed costs are spread over what is sold.** A market booth fee is divided
 * by the units a stall sells in a day, so a slow stall prices higher and a
 * second product at the same stall shares the booth. The tool asks for units
 * sold per market day across all products, and says so, rather than guessing.
 *
 * Nothing here is tax, legal, licensing or food-safety advice. Cottage-food
 * rules (what may be sold, labels, sales caps, permits) differ by state and
 * country and are not modelled. It is arithmetic on figures the user typed.
 */

const round2 = (n) => Math.round(n * 100) / 100;

export const DEFAULTS = Object.freeze({
  wage: 20,
  overheadPct: 10,
  wastePct: 8,
  marginPct: 40,
  cardFeePct: 3,
  boothFee: 0,
  unitsPerMarket: 60,
  wholesaleMarginPct: 30,
});

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

function splitLine(line, sep) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function num(s) {
  if (s === undefined || s === null) return NaN;
  const t = String(s).replace(/[$,\s]/g, "");
  if (t === "") return NaN;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

/**
 * Columns: product, ingredients per batch, units per batch, minutes of your
 * time per batch, packaging per unit (optional), current price (optional).
 */
export function parseRows(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste at least one product row first." };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const rows = [];
  let skipped = 0;
  lines.forEach((line, i) => {
    const c = splitLine(line, sep);
    const ingredients = num(c[1]), units = num(c[2]), minutes = num(c[3]);
    if (i === 0 && Number.isNaN(ingredients) && Number.isNaN(units)) return; // header
    const packaging = c[4] === undefined || c[4] === "" ? 0 : num(c[4]);
    const price = c[5] === undefined || c[5] === "" ? null : num(c[5]);
    if (!c[0] || !(ingredients >= 0) || !(units > 0) || !(minutes >= 0) || !(packaging >= 0) || (price !== null && !(price > 0))) {
      skipped++;
      return;
    }
    rows.push({ product: c[0], ingredients, units, minutes, packaging, price });
  });
  if (!rows.length) return { error: "No usable rows. Each row needs: product, ingredients per batch, units per batch, minutes per batch." };
  const warnings = skipped ? [`${skipped} row(s) skipped: a product, ingredient cost, units above zero and minutes are required.`] : [];
  return { rows, warnings };
}

function readOpts(opts = {}) {
  const o = {};
  for (const k of Object.keys(DEFAULTS)) {
    const raw = opts[k];
    const v = raw === undefined || raw === null || raw === "" ? DEFAULTS[k] : num(raw);
    o[k] = Number.isNaN(v) ? DEFAULTS[k] : v;
  }
  return o;
}

export function analyze(rows, opts) {
  if (!rows || !rows.length) return { error: "No products to analyse." };
  const o = readOpts(opts);
  if (o.wastePct < 0 || o.wastePct >= 100) return { error: "Waste must be between 0 and 99 percent." };
  if (o.marginPct < 0 || o.marginPct >= 100) return { error: "Margin must be between 0 and 99 percent." };
  if (o.wholesaleMarginPct < 0 || o.wholesaleMarginPct >= 100) return { error: "Wholesale margin must be between 0 and 99 percent." };
  if (o.unitsPerMarket <= 0) return { error: "Units sold per market day must be above zero." };
  const margin = o.marginPct / 100, wMargin = o.wholesaleMarginPct / 100, card = o.cardFeePct / 100;
  if (margin + card >= 1) return { error: "Margin plus card fee must be below 100 percent." };
  const boothPerUnit = o.boothFee / o.unitsPerMarket;
  const warnings = [];

  const out = rows.map((r) => {
    const sellable = r.units * (1 - o.wastePct / 100);
    const laborCost = (r.minutes / 60) * o.wage;
    const direct = r.ingredients + r.packaging * r.units;
    const overhead = (direct + laborCost) * (o.overheadPct / 100);
    const batchCost = direct + laborCost + overhead;
    const costPerUnit = batchCost / sellable;
    const groceryOnly = r.ingredients / r.units;
    // Required prices. Price-scaled fees come out of the price; the booth is a per-unit amount.
    const online = costPerUnit / (1 - margin - card);
    const market = (costPerUnit + boothPerUnit) / (1 - margin - card);
    const wholesale = costPerUnit / (1 - wMargin);
    const out = { ...r, sellable, laborCost, overhead, batchCost, costPerUnit, groceryOnly, prices: { online, market, wholesale }, shelfPrice: wholesale * 2 };
    if (r.price !== null) {
      const netPerUnit = r.price * (1 - card);
      const cashOutBatch = r.ingredients + r.packaging * r.units + overhead;
      const earned = netPerUnit * sellable - cashOutBatch;
      out.earnedPerHour = r.minutes > 0 ? earned / (r.minutes / 60) : null;
      out.marginAtPrice = 1 - (costPerUnit / r.price) - card;
      out.underpriced = r.price < online;
      if (out.earnedPerHour !== null && out.earnedPerHour < o.wage) {
        warnings.push(`${r.product}: at ${money2(r.price)} you earn about ${money2(out.earnedPerHour)} an hour, below the ${money2(o.wage)} you set.`);
      }
    }
    return out;
  });
  out.sort((a, b) => (b.earnedPerHour ?? Infinity) - (a.earnedPerHour ?? Infinity) || b.costPerUnit - a.costPerUnit);
  const totals = {
    products: out.length,
    avgCostPerUnit: out.reduce((s, r) => s + r.costPerUnit, 0) / out.length,
    avgGroceryShare: out.reduce((s, r) => s + r.groceryOnly / r.costPerUnit, 0) / out.length,
    boothPerUnit,
  };
  return { rows: out, opts: o, totals, warnings };
}

export function reportCsv(result) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["product", "ingredients_per_unit", "full_cost_per_sellable_unit", "price_online", "price_market", "price_wholesale", "shelf_price_for_store", "current_price", "earned_per_hour"];
  const lines = result.rows.map((r) => [q(r.product), round2(r.groceryOnly), round2(r.costPerUnit), round2(r.prices.online), round2(r.prices.market), round2(r.prices.wholesale), round2(r.shelfPrice), r.price === null ? "" : round2(r.price), r.earnedPerHour == null ? "" : round2(r.earnedPerHour)].join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}

export function sampleText() {
  return [
    "product,ingredients per batch,units per batch,minutes per batch,packaging per unit,current price",
    "Sourdough loaf,9,6,150,0.35,8",
    "Cinnamon rolls (box of 4),14,6,120,1.10,12",
    "Sugar cookies (dozen),11,5,210,0.90,18",
    "Strawberry jam jar,18,12,95,0.85,9",
    "Banana bread,7,4,90,0.40,10",
  ].join("\n");
}
