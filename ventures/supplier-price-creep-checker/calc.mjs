// Supplier price creep checker: invoice lines in, per-item price history, creep, one-off spikes, contract overcharges
// and an annualised cost out. Prices are integers in 1/10000 dollar (unit prices carry fractions of a cent: $0.4375/lb);
// extended amounts are rounded to the cent only for display.

export const DEFAULTS = { creepPct: 5, spikePct: 8, minDaysForAnnual: 28 };

const ALIASES = {
  date: ["date", "invoice date", "inv date", "delivery date", "order date"],
  supplier: ["supplier", "vendor", "distributor", "seller", "from"],
  item: ["item", "description", "product", "item description", "sku", "item name"],
  sku: ["sku", "item #", "item number", "item code", "product code", "code"],
  qty: ["qty", "quantity", "units", "ordered", "shipped", "case qty"],
  unit: ["unit", "uom", "pack", "unit of measure", "per"],
  price: ["unit price", "price", "cost", "unit cost", "price each", "price/unit"],
  total: ["total", "amount", "extended", "ext price", "line total", "extension"],
  contract: ["contract price", "quoted price", "agreed price", "contract", "quoted"],
};

export function parseCsv(text) {
  const rows = [];
  const src = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const delim = src.split("\n", 1)[0].includes("\t") ? "\t" : ",";
  let row = [], field = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

// Dollars to 1/10000 dollar. Up to four decimals; anything finer is refused rather than silently rounded.
export function parsePrice(s) {
  const t = String(s ?? "").trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,4})?$/.test(t)) return null;
  const [d, f = ""] = t.split(".");
  return parseInt(d, 10) * 10000 + parseInt((f + "0000").slice(0, 4), 10);
}

export function parseQty(s) {
  const t = String(s ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return n > 0 ? n : null;
}

export function parseDate(s) {
  const t = String(s ?? "").trim();
  let y, m, d, x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [m, d, y] = [+x[1], +x[2], +x[3]];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export const iso = (dt) => dt.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000);
// 1/10000-dollar integer to a dollar string; whole-cent values show two decimals, others four.
export const money = (p) => {
  const whole = p % 100 === 0;
  const format = (p) => `$${(p / 10000).toLocaleString("en-US", { minimumFractionDigits: whole ? 2 : 4, maximumFractionDigits: whole ? 2 : 4 })}`;
  const text = format(Math.abs(p));
  return p < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
export const dollars = (p) => {
  const format = (p) => `$${(Math.round(p / 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(p));
  return p < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
const pctOf = (a, b) => (b === 0 ? 0 : ((a - b) / b) * 100);
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function mapHeader(header) {
  const h = header.map(norm);
  const idx = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const i = h.indexOf(n);
      if (i !== -1 && !Object.values(idx).includes(i)) { idx[key] = i; break; }
    }
  }
  return idx;
}

// Parse invoice lines. Returns { lines, errors } where each line is
// { row, date, supplier, key, label, unit, qty, price, contract }.
export function parseLines(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { lines: [], errors: ["Need a header row and at least one invoice line."] };
  const idx = mapHeader(rows[0]);
  const errors = [];
  for (const need of ["date", "item"]) if (idx[need] === undefined) errors.push(`Missing a "${need}" column.`);
  if (idx.price === undefined && (idx.total === undefined || idx.qty === undefined)) errors.push('Need a "unit price" column, or both "total" and "qty".');
  if (idx.qty === undefined) errors.push('Missing a "qty" column.');
  if (errors.length) return { lines: [], errors };
  const lines = [];
  rows.slice(1).forEach((r, n) => {
    const row = n + 2;
    const get = (k) => (idx[k] === undefined ? "" : (r[idx[k]] ?? "").trim());
    const date = parseDate(get("date"));
    const qty = parseQty(get("qty"));
    let price = idx.price !== undefined ? parsePrice(get("price")) : null;
    if (price === null && idx.total !== undefined && qty) {
      const tot = parsePrice(get("total"));
      if (tot !== null) price = Math.round(tot / qty);
    }
    const label = get("item");
    if (!date) return errors.push(`Row ${row}: date "${get("date")}" is not YYYY-MM-DD or M/D/YYYY.`);
    if (!label) return errors.push(`Row ${row}: no item.`);
    if (qty === null) return errors.push(`Row ${row}: quantity "${get("qty")}" is not a positive number.`);
    if (price === null) return errors.push(`Row ${row}: no readable unit price.`);
    const contractRaw = get("contract");
    const contract = contractRaw ? parsePrice(contractRaw) : null;
    if (contractRaw && contract === null) return errors.push(`Row ${row}: contract price "${contractRaw}" is unreadable.`);
    const supplier = get("supplier") || "(one supplier)";
    const sku = idx.sku !== undefined && idx.sku !== idx.item ? get("sku") : "";
    lines.push({ row, date, supplier, label, key: `${norm(supplier)}|${norm(sku || label)}`, unit: norm(get("unit")), qty, price, contract });
  });
  return { lines, errors };
}

// Group lines by supplier+item, oldest first, then judge each item.
export function check(text, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { lines, errors } = parseLines(text);
  const groups = new Map();
  for (const l of lines) {
    if (!groups.has(l.key)) groups.set(l.key, []);
    groups.get(l.key).push(l);
  }
  const items = [];
  for (const [key, g] of groups) {
    g.sort((a, b) => a.date - b.date || a.row - b.row);
    items.push(judge(key, g, o));
  }
  items.sort((a, b) => b.annualImpact - a.annualImpact || b.overchargeTotal - a.overchargeTotal || a.label.localeCompare(b.label));

  const first = lines.length ? lines.reduce((a, l) => (l.date < a ? l.date : a), lines[0].date) : null;
  const last = lines.length ? lines.reduce((a, l) => (l.date > a ? l.date : a), lines[0].date) : null;
  const spanDays = first ? daysBetween(first, last) : 0;
  const multi = items.filter((i) => i.purchases >= 2);
  const baseSpend = multi.reduce((s, i) => s + i.baselinePrice * i.recentQty, 0);
  const nowSpend = multi.reduce((s, i) => s + i.latestPrice * i.recentQty, 0);
  const supplierIndex = new Map();
  for (const i of multi) {
    const e = supplierIndex.get(i.supplier) || { supplier: i.supplier, base: 0, now: 0, items: 0 };
    e.base += i.baselinePrice * i.recentQty; e.now += i.latestPrice * i.recentQty; e.items++;
    supplierIndex.set(i.supplier, e);
  }
  const suppliers = [...supplierIndex.values()].map((e) => ({ ...e, indexPct: pctOf(e.now, e.base) })).sort((a, b) => b.indexPct - a.indexPct);
  const summary = {
    lines: lines.length, items: items.length, spanDays,
    creeping: items.filter((i) => i.creeping).length,
    spikes: items.filter((i) => i.spikes.length).length,
    contractBreaches: items.filter((i) => i.overchargeTotal > 0).length,
    overchargeTotal: items.reduce((s, i) => s + i.overchargeTotal, 0),
    annualImpact: items.reduce((s, i) => s + i.annualImpact, 0),
    paidExtra: items.reduce((s, i) => s + i.paidExtra, 0),
    indexPct: pctOf(nowSpend, baseSpend),
    annualReliable: spanDays >= o.minDaysForAnnual,
    unitMixups: items.filter((i) => i.unitMixup).length,
  };
  return { items, suppliers, summary, errors, options: o };
}

function judge(key, g, o) {
  const first = g[0], last = g[g.length - 1];
  const units = new Set(g.map((l) => l.unit).filter(Boolean));
  const unitMixup = units.size > 1;
  const baselinePrice = first.price;
  const latestPrice = last.price;
  const changePct = pctOf(latestPrice, baselinePrice);
  const spanDays = daysBetween(first.date, last.date);

  // A "step" is a purchase whose price differs from the previous purchase of the same item.
  const steps = [];
  for (let i = 1; i < g.length; i++) {
    if (g[i].price !== g[i - 1].price) steps.push({ date: iso(g[i].date), from: g[i - 1].price, to: g[i].price, pct: pctOf(g[i].price, g[i - 1].price) });
  }
  // A spike is one purchase well above both neighbours that are within a few percent of each other: a price that came
  // back down is more likely an invoice error or a one-off surcharge than creep, and is worth a credit request.
  const spikes = [];
  for (let i = 1; i < g.length - 1; i++) {
    const a = g[i - 1].price, b = g[i].price, c = g[i + 1].price;
    const neighbourGap = Math.abs(pctOf(c, a));
    if (pctOf(b, Math.max(a, c)) >= o.spikePct && neighbourGap <= o.spikePct / 2) {
      const ref = Math.max(a, c);
      spikes.push({ date: iso(g[i].date), row: g[i].row, price: b, reference: ref, pct: pctOf(b, ref), excess: Math.round((b - ref) * g[i].qty) });
    }
  }
  const spikeRows = new Set(spikes.map((s) => s.row));

  // Overcharge against a contract/quoted price, line by line.
  const overcharges = [];
  for (const l of g) {
    if (l.contract !== null && l.price > l.contract) {
      overcharges.push({ date: iso(l.date), row: l.row, price: l.price, contract: l.contract, excess: Math.round((l.price - l.contract) * l.qty), qty: l.qty });
    }
  }
  const overchargeTotal = overcharges.reduce((s, x) => s + x.excess, 0);

  // Cash actually paid above the first price seen, excluding lines already counted as spikes or contract breaches.
  const overchargeRows = new Set(overcharges.map((x) => x.row));
  let paidExtra = 0;
  for (const l of g.slice(1)) if (l.price > baselinePrice && !spikeRows.has(l.row) && !overchargeRows.has(l.row)) paidExtra += Math.round((l.price - baselinePrice) * l.qty);

  // Annualised cost of the move: the gap between the latest and first price times the quantity bought per year. The
  // quantity bought before the last delivery covers exactly the span between first and last delivery.
  const totalQty = g.reduce((s, l) => s + l.qty, 0);
  const perYear = spanDays >= o.minDaysForAnnual ? (totalQty - last.qty) * (365 / spanDays) : 0;
  const recentQty = totalQty / g.length; // typical order size, the weight for the supplier price index
  const latestIsSpike = spikes.some((s) => s.price === latestPrice);
  const annualImpact = perYear && latestPrice > baselinePrice && !latestIsSpike ? Math.round((latestPrice - baselinePrice) * perYear) : 0;
  return {
    key, label: first.label, supplier: first.supplier, unit: [...units][0] || "", purchases: g.length,
    firstDate: iso(first.date), lastDate: iso(last.date), baselinePrice, latestPrice, changePct,
    steps, spikes, overcharges, overchargeTotal, paidExtra, annualImpact, recentQty,
    creeping: g.length >= 2 && changePct >= o.creepPct && !(spikes.length && spikes.every((s) => s.price === latestPrice)),
    unitMixup, units: [...units],
  };
}

export function claimText(result, opts = {}) {
  const who = opts.business || "[Your business]";
  const parts = [];
  const by = new Map();
  for (const i of result.items) {
    if (!i.overcharges.length && !i.spikes.length) continue;
    if (!by.has(i.supplier)) by.set(i.supplier, []);
    by.get(i.supplier).push(i);
  }
  for (const [supplier, items] of by) {
    let total = 0;
    const lines = [];
    for (const i of items) {
      for (const x of i.overcharges) { total += x.excess; lines.push(`- ${x.date}  ${i.label}: invoiced ${money(x.price)}, agreed ${money(x.contract)}, ${x.qty} units, difference ${dollars(x.excess)}`); }
      for (const s of i.spikes) { total += s.excess; lines.push(`- ${s.date}  ${i.label}: invoiced ${money(s.price)}; the invoices either side were ${money(s.reference)}; difference ${dollars(s.excess)}`); }
    }
    parts.push(`To: ${supplier}\nSubject: Pricing discrepancies on recent invoices\n\nHello,\n\nWhile reviewing recent invoices we found lines priced above the agreed or usual price:\n\n${lines.join("\n")}\n\nTotal difference: ${dollars(total)}\n\nPlease confirm the correct price for each line and issue a credit for any overcharge, or send the price-change notice that applies.\n\nThank you,\n${who}`);
  }
  return parts.length ? parts.join("\n\n----------------------------------------\n\n") : "No contract overcharges or one-off spikes were found, so there is nothing to send.";
}

const csvCell = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
export function reportCsv(result) {
  const head = ["Supplier", "Item", "Unit", "Purchases", "First date", "Last date", "First price", "Latest price", "Change %", "Annualised impact", "Contract overcharge", "Spikes", "Flag"];
  const rows = result.items.map((i) => [i.supplier, i.label, i.unit, i.purchases, i.firstDate, i.lastDate, (i.baselinePrice / 10000).toFixed(4), (i.latestPrice / 10000).toFixed(4), i.changePct.toFixed(2), (i.annualImpact / 10000).toFixed(2), (i.overchargeTotal / 10000).toFixed(2), i.spikes.length, flagOf(i)]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function flagOf(i) {
  if (i.overchargeTotal > 0) return "over contract";
  if (i.spikes.length) return "one-off spike";
  if (i.creeping) return "creeping up";
  if (i.purchases < 2) return "one purchase";
  if (i.changePct <= -1) return "cheaper";
  return "steady";
}

export function sampleList() {
  return [
    "Date,Supplier,Item,Unit,Qty,Unit price,Contract price",
    "2026-07-06,Harbor Foods,Chicken thigh bone-in,case,20,38.40,38.40",
    "2026-07-20,Harbor Foods,Chicken thigh bone-in,case,20,38.40,38.40",
    "2026-08-03,Harbor Foods,Chicken thigh bone-in,case,22,39.90,38.40",
    "2026-08-17,Harbor Foods,Chicken thigh bone-in,case,20,41.25,38.40",
    "2026-09-07,Harbor Foods,Chicken thigh bone-in,case,24,42.10,38.40",
    "2026-07-06,Harbor Foods,Fryer oil 35lb,jug,10,31.00,",
    "2026-07-20,Harbor Foods,Fryer oil 35lb,jug,10,31.00,",
    "2026-08-03,Harbor Foods,Fryer oil 35lb,jug,10,44.50,",
    "2026-08-17,Harbor Foods,Fryer oil 35lb,jug,10,31.25,",
    "2026-09-07,Harbor Foods,Fryer oil 35lb,jug,12,31.25,",
    "2026-07-06,Valley Produce,Roma tomato 25lb,case,15,18.00,",
    "2026-07-20,Valley Produce,Roma tomato 25lb,case,15,19.50,",
    "2026-08-03,Valley Produce,Roma tomato 25lb,case,18,21.00,",
    "2026-08-17,Valley Produce,Roma tomato 25lb,case,18,22.50,",
    "2026-09-07,Valley Produce,Roma tomato 25lb,case,18,24.00,",
    "2026-07-06,Valley Produce,Yellow onion 50lb,sack,6,14.20,",
    "2026-09-07,Valley Produce,Yellow onion 50lb,sack,6,14.20,",
  ].join("\n");
}

export const SAMPLE_SETTINGS = { business: "Example Bistro" };
