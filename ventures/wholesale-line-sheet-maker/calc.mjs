// Wholesale line-sheet maths in integer cents so prices never drift by a penny.
// Pure functions only: the page owns storage, rendering and printing.
//
// Percent inputs are plain numbers (50 means 50%). Every rate in here --
// marketplace commission, tier discounts, target margins -- is a number the
// user types, never a claim about what any marketplace charges today.

export const STRATEGIES = {
  keystone: "Keystone: 50% of MSRP",
  margin: "Target margin on your cost",
  multiplier: "Multiplier on your cost",
  manual: "Manual only (per-product price)",
};

export const ROUNDINGS = { none: "No rounding", "00": "Nearest $1.00", "50": "Nearest $0.50", "95": "Nearest $x.95" };

export const DEFAULT_SETTINGS = {
  strategy: "keystone",
  targetMarginPct: 55, // gross margin you want at wholesale, as a share of the wholesale price
  multiplier: 2.2, // wholesale = cost x multiplier
  rounding: "none",
  commissionPct: 0, // optional marketplace commission on the order total, user-editable
  retailerMarginFloorPct: 45, // flag when a retailer would keep less than this of MSRP
  minOrderCents: 0,
  minOrderUnits: 0,
  tiers: [], // [{ minSubtotalCents, minUnits, pct }]
  casePackMode: "up", // "up" or "nearest"
};

export function toCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9));
}

export function fromCents(cents) {
  return Math.round(cents) / 100;
}

export function formatMoney(cents, currency = "USD", locale = "en-US") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

function num(v, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[%,\s]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function normalizeSettings(raw = {}) {
  const d = DEFAULT_SETTINGS;
  const tiers = (Array.isArray(raw.tiers) ? raw.tiers : [])
    .map((t) => ({
      minSubtotalCents: Math.max(0, Math.round(num(t && t.minSubtotalCents))),
      minUnits: Math.max(0, Math.round(num(t && t.minUnits))),
      pct: clamp(num(t && t.pct), 0, 100),
    }))
    .filter((t) => t.pct > 0 && (t.minSubtotalCents > 0 || t.minUnits > 0));
  return {
    strategy: Object.hasOwn(STRATEGIES, raw.strategy) ? raw.strategy : d.strategy,
    targetMarginPct: clamp(num(raw.targetMarginPct, d.targetMarginPct), 0, 99),
    multiplier: Math.max(0, num(raw.multiplier, d.multiplier)),
    rounding: Object.hasOwn(ROUNDINGS, raw.rounding) ? raw.rounding : d.rounding,
    commissionPct: clamp(num(raw.commissionPct, d.commissionPct), 0, 99),
    retailerMarginFloorPct: clamp(num(raw.retailerMarginFloorPct, d.retailerMarginFloorPct), 0, 99),
    minOrderCents: Math.max(0, Math.round(num(raw.minOrderCents))),
    minOrderUnits: Math.max(0, Math.round(num(raw.minOrderUnits))),
    tiers,
    casePackMode: raw.casePackMode === "nearest" ? "nearest" : "up",
  };
}

export function normalizeProduct(p = {}) {
  return {
    id: String(p.id ?? ""),
    name: String(p.name ?? "").trim(),
    sku: String(p.sku ?? "").trim(),
    costCents: Math.max(0, Math.round(num(p.costCents))),
    msrpCents: Math.max(0, Math.round(num(p.msrpCents))),
    casePack: Math.max(1, Math.round(num(p.casePack, 1)) || 1),
    overrideCents: Math.max(0, Math.round(num(p.overrideCents))),
  };
}

// Round a wholesale price (cents) by the chosen rule. ".95" means the nearest
// price ending in .95, which is how many wholesale catalogues are written.
export function roundPrice(cents, rule) {
  if (!(cents > 0)) return 0;
  if (rule === "00") return Math.max(100, Math.round(cents / 100) * 100);
  if (rule === "50") return Math.max(50, Math.round(cents / 50) * 50);
  if (rule === "95") return Math.max(95, Math.round((cents + 5) / 100) * 100 - 5);
  return Math.round(cents);
}

// The price before rounding and before any per-product override.
export function strategyPrice(product, settings) {
  const s = normalizeSettings(settings);
  const p = normalizeProduct(product);
  if (s.strategy === "keystone") return p.msrpCents / 2;
  if (s.strategy === "margin") return p.costCents / (1 - s.targetMarginPct / 100);
  if (s.strategy === "multiplier") return p.costCents * s.multiplier;
  return 0;
}

// Wholesale price in cents and where it came from.
export function wholesalePrice(product, settings) {
  const s = normalizeSettings(settings);
  const p = normalizeProduct(product);
  if (p.overrideCents > 0) return { cents: p.overrideCents, source: "override" };
  const raw = strategyPrice(p, s);
  if (!(raw > 0)) return { cents: 0, source: "missing" };
  return { cents: roundPrice(raw, s.rounding), source: s.strategy };
}

// The MSRP at which a retailer keeps `retailerMarginPct` of the shelf price.
export function msrpForRetailerMargin(wholesaleCents, retailerMarginPct) {
  const m = clamp(num(retailerMarginPct), 0, 99) / 100;
  return Math.round(wholesaleCents / (1 - m));
}

// Everything about one product at wholesale.
export function analyzeProduct(product, settings) {
  const s = normalizeSettings(settings);
  const p = normalizeProduct(product);
  const w = wholesalePrice(p, s);
  const flags = [];
  const price = w.cents;
  const retailerProfit = p.msrpCents - price;
  const retailerMarginPct = p.msrpCents > 0 && price > 0 ? (retailerProfit / p.msrpCents) * 100 : null;
  const gross = price - p.costCents;
  const grossMarginPct = price > 0 && p.costCents > 0 ? (gross / price) * 100 : null;
  const commission = Math.round((price * s.commissionPct) / 100);
  const net = gross - commission;
  const netMarginPct = price > 0 && p.costCents > 0 ? (net / price) * 100 : null;
  if (!p.name) flags.push("no_name");
  if (price <= 0) flags.push("no_price");
  if (p.costCents <= 0) flags.push("no_cost");
  if (p.msrpCents <= 0) flags.push("no_msrp");
  if (price > 0 && p.costCents > 0 && price < p.costCents) flags.push("below_cost");
  else if (price > 0 && p.costCents > 0 && net < 0) flags.push("loss_after_commission");
  if (retailerMarginPct !== null && retailerMarginPct < s.retailerMarginFloorPct) flags.push("retailer_margin_low");
  if (price > 0 && p.msrpCents > 0 && price > p.msrpCents) flags.push("wholesale_above_msrp");
  if (s.strategy === "margin" && grossMarginPct !== null && grossMarginPct + 0.005 < s.targetMarginPct) flags.push("below_target_margin");
  return {
    wholesaleCents: price,
    source: w.source,
    retailerProfitCents: p.msrpCents > 0 ? retailerProfit : null,
    retailerMarginPct,
    keystone: p.msrpCents > 0 && price > 0 ? price <= p.msrpCents / 2 : null,
    grossCents: p.costCents > 0 ? gross : null,
    grossMarginPct,
    commissionCents: commission,
    netCents: p.costCents > 0 ? net : null,
    netMarginPct,
    msrpForFloorCents: price > 0 ? msrpForRetailerMargin(price, s.retailerMarginFloorPct) : null,
    flags,
  };
}

export const FLAG_TEXT = {
  no_name: "No product name",
  no_price: "No wholesale price (add MSRP, cost or an override)",
  no_cost: "No unit cost, so margin cannot be computed",
  no_msrp: "No MSRP, so the retailer's margin cannot be computed",
  below_cost: "Wholesale price is below your cost",
  loss_after_commission: "Loses money once the marketplace commission is taken",
  retailer_margin_low: "Retailer margin is below your floor",
  wholesale_above_msrp: "Wholesale price is above the MSRP",
  below_target_margin: "Your margin is below target (rounding or an override moved it)",
};

// Round a quantity to the case pack: "up" always orders full cases, "nearest" rounds either way (never to zero if qty > 0).
export function roundToCasePack(qty, casePack, mode = "up") {
  const q = Math.max(0, Math.round(num(qty)));
  const c = Math.max(1, Math.round(num(casePack, 1)) || 1);
  if (c === 1 || q === 0) return q;
  if (mode === "nearest") return Math.max(c, Math.round(q / c) * c);
  return Math.ceil(q / c) * c;
}

// The best volume tier an order qualifies for. Thresholds are checked on the
// pre-discount subtotal and unit count; a tier qualifies when it meets either
// threshold it sets. The highest discount wins.
export function tierFor(subtotalCents, units, tiers) {
  let best = null;
  for (const t of normalizeSettings({ tiers }).tiers) {
    const ok = (t.minSubtotalCents > 0 && subtotalCents >= t.minSubtotalCents) || (t.minUnits > 0 && units >= t.minUnits);
    if (ok && (!best || t.pct > best.pct)) best = t;
  }
  return best;
}

// lines: [{ product, qty }]. Returns what the order is worth to you and to the retailer.
export function simulateOrder(lines, settings) {
  const s = normalizeSettings(settings);
  const rows = [];
  let subtotal = 0, units = 0, cogs = 0, msrpTotal = 0;
  const warnings = [];
  for (const l of lines || []) {
    const p = normalizeProduct(l.product);
    const qty = Math.max(0, Math.round(num(l.qty)));
    if (qty === 0) continue;
    const a = analyzeProduct(p, s);
    const amount = a.wholesaleCents * qty;
    const notPack = p.casePack > 1 && qty % p.casePack !== 0;
    if (notPack) warnings.push(`${p.name || "Product"}: ${qty} is not a multiple of the case pack of ${p.casePack}`);
    rows.push({ name: p.name, sku: p.sku, qty, unitCents: a.wholesaleCents, amountCents: amount, notCasePack: notPack });
    subtotal += amount;
    units += qty;
    cogs += p.costCents * qty;
    msrpTotal += p.msrpCents * qty;
  }
  const tier = tierFor(subtotal, units, s.tiers);
  const discount = tier ? Math.round((subtotal * tier.pct) / 100) : 0;
  const total = subtotal - discount;
  const commission = Math.round((total * s.commissionPct) / 100);
  const profit = total - cogs;
  const netProfit = profit - commission;
  const meetsMinDollar = total >= s.minOrderCents;
  const meetsMinUnits = units >= s.minOrderUnits;
  if (rows.length && !meetsMinDollar) warnings.push("Below your dollar minimum");
  if (rows.length && !meetsMinUnits) warnings.push("Below your unit minimum");
  return {
    rows,
    units,
    subtotalCents: subtotal,
    tierPct: tier ? tier.pct : 0,
    discountCents: discount,
    totalCents: total,
    cogsCents: cogs,
    profitCents: profit,
    commissionCents: commission,
    netProfitCents: netProfit,
    netMarginPct: total > 0 ? (netProfit / total) * 100 : null,
    meetsMinDollar,
    meetsMinUnits,
    meetsMinimum: meetsMinDollar && meetsMinUnits,
    retailerRevenueCents: msrpTotal,
    retailerProfitCents: msrpTotal - total,
    retailerMarginPct: msrpTotal > 0 ? ((msrpTotal - total) / msrpTotal) * 100 : null,
    warnings,
  };
}

// "What order does a retailer need to place for me to clear $X profit?"
// `mix` is a base assortment [{ product, qty }] (quantities are the proportions).
// The assortment is scaled in whole "sets" (1, 2, 3...), each line rounded up to
// its case pack, until the order clears the target (net of commission when
// `afterCommission`) and meets your minimums. Returns null when no number of
// sets ever gets there, e.g. every product sells at a loss.
export function ordersToClear(mix, settings, targetProfitCents, { afterCommission = true, maxSets = 5000 } = {}) {
  const s = normalizeSettings(settings);
  const base = (mix || []).map((l) => ({ product: normalizeProduct(l.product), qty: Math.max(0, Math.round(num(l.qty))) })).filter((l) => l.qty > 0);
  if (!base.length) return null;
  const target = Math.max(0, Math.round(num(targetProfitCents)));
  const huge = simulateOrder(base.map((l) => ({ ...l, qty: l.qty * 1000 })), s);
  if ((afterCommission ? huge.netProfitCents : huge.profitCents) <= 0) return null;
  for (let k = 1; k <= maxSets; k++) {
    const lines = base.map((l) => ({ product: l.product, qty: roundToCasePack(l.qty * k, l.product.casePack, "up") }));
    const sim = simulateOrder(lines, s);
    const profit = afterCommission ? sim.netProfitCents : sim.profitCents;
    if (profit >= target && sim.meetsMinimum) return { sets: k, lines, order: sim };
  }
  return null;
}

// ---------- CSV ----------

// Neutralise spreadsheet formula injection in text cells and quote as needed.
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const delim = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const HEADERS = {
  name: ["name", "product", "productname", "title", "item", "description"],
  sku: ["sku", "itemnumber", "item#", "code", "style", "stylenumber"],
  cost: ["cost", "unitcost", "cogs", "yourcost", "costofgoods"],
  msrp: ["msrp", "retail", "retailprice", "price", "srp", "suggestedretail"],
  casePack: ["casepack", "case", "casesize", "packsize", "pack", "caseqty", "unitspercase"],
  override: ["wholesale", "wholesaleprice", "override", "wholesaleoverride"],
};

function headerKey(h) {
  const k = String(h).toLowerCase().replace(/[^a-z0-9#]/g, "");
  for (const [field, names] of Object.entries(HEADERS)) if (names.includes(k)) return field;
  return null;
}

// Parse pasted or uploaded CSV/TSV into products. A header row is detected by
// name; without one the column order is name, sku, cost, msrp, case pack, wholesale.
export function importProducts(text) {
  const rows = parseCsv(text);
  const errors = [];
  if (!rows.length) return { products: [], errors: ["Nothing to import."] };
  let map = rows[0].map(headerKey);
  let start = 1;
  if (!map.includes("name")) {
    const fields = ["name", "sku", "cost", "msrp", "casePack", "override"];
    map = rows[0].map((_, i) => fields[i] || null);
    start = 0;
  }
  const products = [];
  for (let r = start; r < rows.length; r++) {
    const rec = {};
    rows[r].forEach((cell, i) => { if (map[i]) rec[map[i]] = cell.trim(); });
    if (!rec.name) { errors.push(`Row ${r + 1}: no product name, skipped.`); continue; }
    for (const f of ["cost", "msrp", "override"]) {
      if (rec[f] && !Number.isFinite(Number(String(rec[f]).replace(/[$,\s]/g, "")))) errors.push(`Row ${r + 1}: "${rec[f]}" is not a number for ${f}; treated as blank.`);
    }
    products.push(normalizeProduct({
      name: rec.name, sku: rec.sku,
      costCents: toCents(rec.cost), msrpCents: toCents(rec.msrp),
      casePack: rec.casePack ? Math.round(num(rec.casePack, 1)) || 1 : 1,
      overrideCents: toCents(rec.override),
    }));
  }
  return { products, errors };
}

const money = (c) => (c / 100).toFixed(2);

export function productsToCsv(products) {
  const out = [["Name", "SKU", "Unit cost", "MSRP", "Case pack", "Wholesale override"].join(",")];
  for (const raw of products) {
    const p = normalizeProduct(raw);
    out.push([csvCell(p.name), csvCell(p.sku), p.costCents ? money(p.costCents) : "", p.msrpCents ? money(p.msrpCents) : "", p.casePack, p.overrideCents ? money(p.overrideCents) : ""].join(","));
  }
  return out.join("\n") + "\n";
}

// The buyer-facing sheet as CSV: no cost, no margins.
export function lineSheetCsv(products, settings) {
  const out = [["SKU", "Product", "Wholesale", "MSRP", "Case pack"].join(",")];
  for (const raw of products) {
    const p = normalizeProduct(raw);
    const a = analyzeProduct(p, settings);
    out.push([csvCell(p.sku), csvCell(p.name), a.wholesaleCents ? money(a.wholesaleCents) : "", p.msrpCents ? money(p.msrpCents) : "", p.casePack].join(","));
  }
  return out.join("\n") + "\n";
}

// Summary across a catalogue, for the top-of-page KPIs.
export function catalogueSummary(products, settings) {
  const items = products.map((p) => analyzeProduct(p, settings));
  const priced = items.filter((a) => a.wholesaleCents > 0);
  const margins = priced.map((a) => a.grossMarginPct).filter((x) => x !== null);
  const rm = priced.map((a) => a.retailerMarginPct).filter((x) => x !== null);
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    count: products.length,
    priced: priced.length,
    flagged: items.filter((a) => a.flags.some((f) => !["no_cost", "no_msrp"].includes(f))).length,
    avgGrossMarginPct: avg(margins),
    avgRetailerMarginPct: avg(rm),
    lowestGrossMarginPct: margins.length ? Math.min(...margins) : null,
  };
}
