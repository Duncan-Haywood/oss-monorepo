// Regional (purchasing-power) price tables for software sold worldwide.
// Pure functions, no network, no storage.

// Rounded, approximate price-level indexes (US = 100): roughly what a basket
// costs in each country relative to the US, in the spirit of the World Bank
// International Comparison Program price level. They are ESTIMATES for
// picking a starting price, not data to cite. Override any of them with your
// own numbers (parseIndexOverrides) before you publish a price.
export const COUNTRIES = [
  ["US", "United States", 100], ["CH", "Switzerland", 120], ["NO", "Norway", 105], ["IE", "Ireland", 98],
  ["DK", "Denmark", 95], ["SE", "Sweden", 90], ["FI", "Finland", 90], ["DE", "Germany", 88], ["AU", "Australia", 88],
  ["NL", "Netherlands", 86], ["AT", "Austria", 85], ["NZ", "New Zealand", 85], ["FR", "France", 85],
  ["CA", "Canada", 82], ["GB", "United Kingdom", 80], ["SG", "Singapore", 80], ["IL", "Israel", 88],
  ["IT", "Italy", 73], ["KR", "South Korea", 68], ["AE", "United Arab Emirates", 67], ["ES", "Spain", 66],
  ["JP", "Japan", 62], ["PT", "Portugal", 62], ["GR", "Greece", 62], ["CN", "China", 60], ["CZ", "Czechia", 58],
  ["SA", "Saudi Arabia", 55], ["CL", "Chile", 50], ["PL", "Poland", 48], ["RO", "Romania", 48], ["MX", "Mexico", 47],
  ["BR", "Brazil", 41], ["TH", "Thailand", 41], ["ZA", "South Africa", 40], ["MY", "Malaysia", 38], ["PE", "Peru", 38],
  ["PH", "Philippines", 36], ["CO", "Colombia", 36], ["AR", "Argentina", 36], ["KE", "Kenya", 33], ["ID", "Indonesia", 31],
  ["TR", "Turkey", 31], ["VN", "Vietnam", 29], ["UA", "Ukraine", 28], ["NG", "Nigeria", 28], ["BD", "Bangladesh", 27],
  ["IN", "India", 25], ["EG", "Egypt", 25], ["PK", "Pakistan", 22],
].map(([code, name, index]) => ({ code, name, index }));

export const DEFAULTS = {
  base: 29,        // price in the reference market (USD)
  strength: 0.7,   // 0 = one price everywhere, 1 = full proportional to price level
  floor: 0.35,     // never go below this fraction of the base price
  cap: 1,          // never go above this fraction (1 = no premium markets)
  rounding: "charm", // charm (.99) | whole | nine (19, 29, 39) | none
  tiers: 0,        // 0 = a price per country, N = collapse into N price points
};

export const ROUNDINGS = ["charm", "whole", "nine", "none"];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function validate(opts) {
  const o = { ...DEFAULTS, ...opts };
  const errs = [];
  if (!(o.base > 0)) errs.push("Base price must be above zero.");
  if (!(o.strength >= 0 && o.strength <= 1)) errs.push("Strength must be between 0 and 1.");
  if (!(o.floor > 0 && o.floor <= 1)) errs.push("Floor must be above 0 and at most 1 (as a fraction of base).");
  if (!(o.cap >= 1 && o.cap <= 2)) errs.push("Cap must be between 1 and 2 (1 = never charge more than the base price).");
  if (!ROUNDINGS.includes(o.rounding)) errs.push("Unknown rounding style.");
  if (!Number.isInteger(o.tiers) || o.tiers < 0 || o.tiers > 12) errs.push("Tiers must be a whole number from 0 to 12.");
  return errs;
}

// Fraction of the base price a market pays. index/refIndex is the price level
// relative to the reference market; strength dampens it so a market at a
// quarter of the price level pays more than a quarter of the price.
export function factor(index, refIndex, o) {
  const raw = Math.pow(index / refIndex, o.strength);
  return clamp(raw, o.floor, o.cap);
}

export function roundPrice(p, style) {
  if (style === "none") return Math.round(p * 100) / 100;
  if (style === "whole") return Math.max(1, Math.round(p));
  if (style === "nine") return Math.max(9, Math.round((p + 1) / 10) * 10 - 1);
  // charm: nearest x.99, never below 0.99
  return Math.max(0.99, Math.round(p - 0.99) + 0.99);
}

export function parseIndexOverrides(text) {
  const out = {};
  const bad = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z]{2})\s*[,:= \t]\s*([0-9]+(?:\.[0-9]+)?)$/);
    if (!m || Number(m[2]) <= 0) { bad.push(line); continue; }
    out[m[1].toUpperCase()] = Number(m[2]);
  }
  return { overrides: out, bad };
}

export function buildTable(opts = {}, overrides = {}, refCode = "US") {
  const o = { ...DEFAULTS, ...opts };
  const errs = validate(o);
  if (errs.length) throw new Error(errs.join(" "));
  const countries = COUNTRIES.map((c) => ({ ...c, index: overrides[c.code] ?? c.index }));
  const ref = countries.find((c) => c.code === refCode) || countries[0];
  let rows = countries.map((c) => {
    const f = factor(c.index, ref.index, o);
    return { code: c.code, name: c.name, index: c.index, factor: f, raw: o.base * f };
  });
  if (o.tiers > 0) {
    // Equal-width bands over the factor range; every member pays the band mean.
    const lo = Math.min(...rows.map((r) => r.factor));
    const hi = Math.max(...rows.map((r) => r.factor));
    const width = (hi - lo) / o.tiers || 1;
    const band = (r) => Math.min(o.tiers - 1, Math.floor((r.factor - lo) / width));
    const groups = new Map();
    for (const r of rows) {
      const b = band(r);
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b).push(r);
    }
    for (const members of groups.values()) {
      const top = members.some((r) => r.factor >= hi);
      // The top band keeps the full price so the reference market is never discounted by averaging.
      const f = top ? hi : members.reduce((s, r) => s + r.factor, 0) / members.length;
      for (const r of members) r.raw = o.base * f;
    }
    const order = [...groups.keys()].sort((a, b) => b - a);
    for (const r of rows) r.tier = order.indexOf(band(r)) + 1;
  }
  rows = rows.map((r) => {
    const price = roundPrice(r.raw, o.rounding);
    return { ...r, price, discount: 1 - price / o.base };
  });
  rows.sort((a, b) => b.price - a.price || b.index - a.index || a.name.localeCompare(b.name));
  return rows;
}

// Extra conversion a discount must buy just to leave revenue per visitor flat.
export function breakEvenLift(discount) {
  if (!(discount < 1)) return Infinity;
  return 1 / (1 - Math.max(0, discount)) - 1;
}

// "IN 12" / "India 12%" per line -> { IN: 0.12 } (shares normalised to sum 1).
export function parseShares(text) {
  const byName = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.code]));
  const shares = {};
  const bad = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(.+?)[\s,:=]+([0-9]+(?:\.[0-9]+)?)\s*%?$/);
    const key = m && m[1].trim();
    const code = key && (/^[A-Za-z]{2}$/.test(key) ? key.toUpperCase() : byName.get(key.toLowerCase()));
    if (!m || !code || !COUNTRIES.some((c) => c.code === code)) { bad.push(line); continue; }
    shares[code] = (shares[code] || 0) + Number(m[2]);
  }
  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  if (total > 0) for (const k of Object.keys(shares)) shares[k] /= total;
  return { shares, bad };
}

// Revenue per 1,000 visitors. `elasticity` e: conversion scales as
// (price/base)^-e, so e = 1 leaves revenue flat, e < 1 means the discount
// loses money, e > 1 means it earns more. Same e for every market.
// Markets with no traffic share at all are ignored (never a guess).
export function revenueModel(rows, shares, { base, baseConversion = 0.02, elasticity = 1.5, visitors = 1000 }) {
  let before = 0, after = 0;
  const detail = [];
  for (const r of rows) {
    const s = shares[r.code];
    if (!s) continue;
    const v = visitors * s;
    const b = v * baseConversion * base;
    const newConv = baseConversion * Math.pow(r.price / base, -elasticity);
    const a = v * Math.min(1, newConv) * r.price;
    before += b; after += a;
    detail.push({ code: r.code, name: r.name, share: s, price: r.price, discount: r.discount, before: b, after: a, change: a - b, breakEvenLift: breakEvenLift(r.discount) });
  }
  detail.sort((x, y) => y.share - x.share);
  return { before, after, change: after - before, pct: before ? (after - before) / before : 0, detail };
}

// Group countries by discount rounded to the nearest 5% -- what you type
// into a processor's "regional discount code" or country-price screen.
export function discountGroups(rows) {
  const g = new Map();
  for (const r of rows) {
    const pct = Math.round((r.discount * 100) / 5) * 5;
    if (pct <= 0) continue;
    if (!g.has(pct)) g.set(pct, []);
    g.get(pct).push(r.code);
  }
  return [...g.entries()].sort((a, b) => a[0] - b[0]).map(([pct, codes]) => ({ pct, codes: codes.sort() }));
}

export const money = (n) => "$" + (Math.round(n * 100) / 100).toFixed(2);
export const pct = (x) => Math.round(x * 1000) / 10 + "%";

export function toCsv(rows) {
  return ["code,country,price_level_index,price_usd,discount_pct",
    ...rows.map((r) => `${r.code},"${r.name}",${r.index},${r.price.toFixed(2)},${Math.round(r.discount * 1000) / 10}`)].join("\n");
}

export function toJson(rows, o) {
  return JSON.stringify({ base_usd: o.base, prices: Object.fromEntries(rows.map((r) => [r.code, Number(r.price.toFixed(2))])) }, null, 2);
}

export function renderText(rows, o) {
  const lines = [`Base ${money(o.base)} · strength ${o.strength} · floor ${pct(o.floor)} · ${o.rounding}${o.tiers ? ` · ${o.tiers} tiers` : ""}`, ""];
  for (const r of rows) lines.push(`${r.code}  ${r.name.padEnd(22)} index ${String(r.index).padStart(3)}  ${money(r.price).padStart(8)}  ${r.discount > 0 ? "-" + pct(r.discount) : "base"}`);
  const groups = discountGroups(rows);
  if (groups.length) {
    lines.push("", "Regional discount groups (nearest 5%):");
    for (const g of groups) lines.push(`  ${g.pct}% off: ${g.codes.join(" ")}`);
  }
  lines.push("", "Index values are rounded estimates; use your own before publishing.");
  return lines.join("\n");
}

export const EXAMPLE_SHARES = "US 40\nGB 10\nDE 8\nIN 12\nBR 8\nPH 5\nPL 4\nNG 3\nID 5\nTR 5";
