// FBA lost & damaged inventory reimbursement finder: reads the Seller Central
// FBA Inventory Ledger (summary view: Date, MSKU, FNSKU, Title, Disposition,
// Found, Lost, Damaged, Unknown Events ...) and, optionally, the Reimbursements
// report (approval-date, reason, sku, quantity-reimbursed-total, amount-total),
// nets lost + damaged units against units found and units already reimbursed,
// and lists what looks unclaimed per SKU, valued and aged against the claim
// window. Column names are matched by alias and no real export was available
// when this was written. Pure functions, no DOM, no network.

export const DEFAULT_UNIT_VALUE = 20;
// Amazon usually reimburses lost inventory on its own after a wait, so a very
// recent loss is not yet a claim. The window to file is commonly 18 months from
// the event; both are editable defaults because Amazon changes them.
export const WAIT_DAYS = 45;
export const WINDOW_MONTHS = 18;
export const EXPIRING_MONTHS = 3;
// Inbound shipments that arrive short have a much shorter claim window than lost inventory
// (commonly 9 months from the shipment), and Amazon keeps reconciling a shipment for a while
// after it closes, so a recent shortage is not yet a claim either. Both are editable defaults.
export const INBOUND_WINDOW_MONTHS = 9;
export const INBOUND_WAIT_DAYS = 30;

const LEDGER_ALIASES = {
  date: ["date", "event date", "snapshot date", "month"],
  sku: ["msku", "sku", "merchant sku", "seller sku", "merchant-sku"],
  fnsku: ["fnsku"],
  title: ["title", "product name", "product-name", "item name"],
  disposition: ["disposition"],
  found: ["found"],
  lost: ["lost"],
  damaged: ["damaged"],
  unknown: ["unknown events", "unknown event", "unknown"],
};
const SHIPMENT_ALIASES = {
  id: ["shipment id", "shipment-id", "shipmentid", "shipment"],
  name: ["shipment name", "name"],
  sku: ["msku", "sku", "merchant sku", "seller sku", "merchant-sku"],
  date: ["created", "date created", "created date", "shipment created", "creation date", "date"],
  shipped: ["units expected", "units shipped", "shipped", "quantity shipped", "expected", "units sent", "qty shipped"],
  received: ["units located", "units received", "received", "quantity received", "located", "qty received"],
};
const REIMB_ALIASES = {
  date: ["approval-date", "approval date", "date approved", "date"],
  sku: ["sku", "msku", "merchant sku"],
  reason: ["reason"],
  qty: ["quantity-reimbursed-total", "quantity reimbursed total", "quantity-reimbursed", "quantity reimbursed", "quantity"],
  cash: ["quantity-reimbursed-cash", "quantity reimbursed cash"],
  inv: ["quantity-reimbursed-inventory", "quantity reimbursed inventory"],
  amount: ["amount-total", "amount total", "total amount", "amount"],
  perUnit: ["amount-per-unit", "amount per unit"],
  id: ["reimbursement-id", "reimbursement id"],
};

export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

export function detectDelimiter(text) {
  const head = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join("\n");
  const n = (c) => head.split(c).length - 1;
  const best = [["\t", n("\t")], [";", n(";")], [",", n(",")]].sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function parseWhen(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let y, mo, d, rest = "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(.*)$/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
    rest = m[4];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let hh = 0, mm = 0, hasTime = false;
  const tm = rest.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
  if (tm) {
    hh = +tm[1]; mm = +tm[2]; hasTime = true;
    const ap = tm[3] ? tm[3][0].toLowerCase() : "";
    if (ap === "p" && hh < 12) hh += 12;
    if (ap === "a" && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
  }
  const t = Date.UTC(y, mo - 1, d, hh, mm);
  return new Date(t).getUTCDate() === d ? { t, hasTime } : null;
}

export function detectDmy(values) {
  let first = false, second = false;
  for (const v of values) {
    const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
  }
  return first && !second;
}

const DAY = 86400000;
const r2 = (n) => Math.round(n * 100) / 100;
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(0);
const addMonths = (t, m) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + m); return d.getTime(); };
const ymd = (t) => new Date(t).toISOString().slice(0, 10);

function findColumns(header, aliases) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

function findHeader(table, aliases, ok) {
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const cols = findColumns(table[i], aliases);
    if (ok(cols)) return { h: i, cols };
  }
  return null;
}

const isTotal = (line) => /^(total|totals|subtotal|grand total|summary)\b/.test(String(line[0] ?? "").trim().toLowerCase());

// Ledger rows -> { items, skipped, error }. An item is
// { line, t, sku, fnsku, title, disposition, lost, damaged, found, unknown }, all
// unit counts as positive numbers (the ledger writes losses as negatives).
export function normalizeLedger(table, { decimalComma = false } = {}) {
  const empty = { items: [], skipped: [] };
  if (!table.length) return { ...empty, error: "The inventory ledger is empty." };
  const found = findHeader(table, LEDGER_ALIASES, (c) => c.date !== undefined && c.sku !== undefined && (c.lost !== undefined || c.damaged !== undefined));
  if (!found) return { ...empty, error: "No header row found in the ledger. Expected columns “Date”, “MSKU” (or “SKU”) and “Lost” and/or “Damaged”, as in Seller Central → Reports → Fulfillment → Inventory Ledger (summary view)." };
  const { h, cols } = found;
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const items = [], skipped = [];
  const units = (line, f, lineNo) => {
    const raw = get(line, f);
    if (isBlank(raw)) return 0;
    const n = parseNumber(raw, decimalComma);
    return Number.isFinite(n) ? Math.abs(n) : null;
  };
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i], lineNo = i + 1;
    if (isTotal(line)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const when = parseWhen(get(line, "date"), dmy);
    if (!when) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    const sku = get(line, "sku");
    if (!sku) { skipped.push({ line: lineNo, reason: "no SKU" }); continue; }
    const lost = units(line, "lost"), damaged = units(line, "damaged"), foundU = units(line, "found"), unknown = units(line, "unknown");
    if (lost === null || damaged === null || foundU === null || unknown === null) { skipped.push({ line: lineNo, reason: "unit count not readable" }); continue; }
    items.push({ line: lineNo, t: when.t, sku, fnsku: get(line, "fnsku"), title: get(line, "title"), disposition: get(line, "disposition"), lost, damaged, found: foundU, unknown });
  }
  if (!items.length) return { ...empty, skipped, error: "No ledger rows could be read. " + (skipped.length ? `${skipped.length} row(s) were skipped (first: line ${skipped[0].line}, ${skipped[0].reason}).` : "") };
  return { items, skipped, dmy };
}

// What a reimbursement reason pays for: units Amazon lost or damaged, a reversal
// of an earlier payment, or something else (customer returns, fee corrections)
// that says nothing about lost inventory and is left out of the netting.
export function reasonKind(raw) {
  const s = String(raw ?? "").toLowerCase();
  if (/revers|clawback|claw back/.test(s)) return "reversal";
  // Lost_Inbound / Damaged_Inbound pay for units that never reached (or were hurt on the way to) a
  // warehouse shelf, which the ledger's Lost and Damaged columns do not record, so they must not be
  // netted against warehouse losses.
  if (/inbound/.test(s)) return "inbound";
  if (/lost|missing|misplac/.test(s)) return "lost";
  if (/damag/.test(s)) return "damaged";
  return "other";
}

// Reimbursements report -> { items, skipped, error }; item = { line, t, sku, kind, qty, amount }
export function normalizeReimbursements(table, { decimalComma = false } = {}) {
  const empty = { items: [], skipped: [] };
  if (!table.length) return { ...empty, error: "The reimbursements file is empty." };
  const found = findHeader(table, REIMB_ALIASES, (c) => c.sku !== undefined && c.reason !== undefined && (c.qty !== undefined || c.cash !== undefined || c.inv !== undefined));
  if (!found) return { ...empty, error: "No header row found in the reimbursements file. Expected “sku”, “reason” and “quantity-reimbursed-total”, as in Seller Central → Reports → Fulfillment → Reimbursements." };
  const { h, cols } = found;
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const items = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i], lineNo = i + 1;
    if (isTotal(line)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const sku = get(line, "sku");
    if (!sku) { skipped.push({ line: lineNo, reason: "no SKU" }); continue; }
    const when = cols.date === undefined ? null : parseWhen(get(line, "date"), dmy);
    let qty;
    if (cols.qty !== undefined && !isBlank(get(line, "qty"))) qty = parseNumber(get(line, "qty"), decimalComma);
    else {
      const a = isBlank(get(line, "cash")) ? 0 : parseNumber(get(line, "cash"), decimalComma);
      const b = isBlank(get(line, "inv")) ? 0 : parseNumber(get(line, "inv"), decimalComma);
      qty = a + b;
    }
    const amt = isBlank(get(line, "amount")) ? 0 : parseNumber(get(line, "amount"), decimalComma);
    if (!Number.isFinite(qty) || !Number.isFinite(amt)) { skipped.push({ line: lineNo, reason: "quantity or amount not readable" }); continue; }
    const kind = reasonKind(get(line, "reason"));
    items.push({ line: lineNo, t: when ? when.t : null, sku, kind, qty: kind === "reversal" ? -Math.abs(qty) : qty, amount: kind === "reversal" ? -Math.abs(amt) : amt });
  }
  if (!items.length) return { ...empty, skipped, error: "No reimbursement rows could be read." };
  return { items, skipped };
}

const norm = (s) => String(s ?? "").trim().toLowerCase();

// Inbound shipment shortages -> { items, skipped, error }. Reads a CSV of what you sent and what Amazon
// counted in, one row per shipment and SKU (Seller Central → Shipping Queue → a shipment → Track
// shipment, or your own sheet). item = { line, t, id, sku, shipped, received }.
export function normalizeShipments(table, { decimalComma = false } = {}) {
  const empty = { items: [], skipped: [] };
  if (!table.length) return { ...empty, error: "The shipments file is empty." };
  const found = findHeader(table, SHIPMENT_ALIASES, (c) => c.sku !== undefined && c.shipped !== undefined && c.received !== undefined);
  if (!found) return { ...empty, error: "No header row found in the shipments file. Expected “Shipment ID”, “SKU” (or “MSKU”), “Units expected” (shipped) and “Units located” (received), plus a created date." };
  const { h, cols } = found;
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const items = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i], lineNo = i + 1;
    if (isTotal(line)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const sku = get(line, "sku");
    if (!sku) { skipped.push({ line: lineNo, reason: "no SKU" }); continue; }
    const when = parseWhen(get(line, "date"), dmy);
    if (!when) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    const shipped = parseNumber(get(line, "shipped"), decimalComma), received = parseNumber(get(line, "received"), decimalComma);
    if (!Number.isFinite(shipped) || !Number.isFinite(received) || shipped < 0 || received < 0) { skipped.push({ line: lineNo, reason: "unit count not readable" }); continue; }
    items.push({ line: lineNo, t: when.t, id: get(line, "id") || get(line, "name"), sku, shipped, received });
  }
  if (!items.length) return { ...empty, skipped, error: "No shipment rows could be read." + (skipped.length ? ` ${skipped.length} row(s) were skipped (first: line ${skipped[0].line}, ${skipped[0].reason}).` : "") };
  return { items, skipped, dmy };
}

// Shortages per shipment and SKU (units sent minus units received), netted oldest-first against that
// SKU's inbound reimbursements, then aged against the inbound window. reimbItems may be null.
export function analyzeInbound(shipItems, reimbItems, { asOf = Date.now(), defaultUnitValue = DEFAULT_UNIT_VALUE, windowMonths = INBOUND_WINDOW_MONTHS, waitDays = INBOUND_WAIT_DAYS } = {}) {
  const unitDefault = Number.isFinite(defaultUnitValue) && defaultUnitValue >= 0 ? defaultUnitValue : DEFAULT_UNIT_VALUE;
  const expiringBefore = addMonths(asOf, EXPIRING_MONTHS);
  const paid = new Map(), price = new Map();
  for (const r of Array.isArray(reimbItems) ? reimbItems : []) {
    const k = norm(r.sku);
    if (r.kind === "inbound") paid.set(k, (paid.get(k) || 0) + r.qty);
    if (r.qty > 0 && r.amount > 0 && r.kind !== "other") { const p = price.get(k) || { q: 0, a: 0 }; p.q += r.qty; p.a += r.amount; price.set(k, p); }
  }
  const bySku = new Map();
  for (const x of shipItems) {
    const k = norm(x.sku);
    if (!bySku.has(k)) bySku.set(k, []);
    bySku.get(k).push(x);
  }
  const rows = [];
  for (const [k, list] of bySku) {
    list.sort((a, b) => a.t - b.t);
    let left = Math.max(0, paid.get(k) || 0);
    const p = price.get(k);
    const unitValue = p ? p.a / p.q : unitDefault;
    for (const x of list) {
      const short = Math.max(0, x.shipped - x.received);
      if (!short) continue;
      const take = Math.min(left, short);
      left -= take;
      const open = short - take;
      const end = addMonths(x.t, windowMonths);
      const state = open === 0 ? "paid" : asOf - x.t < waitDays * DAY ? "wait" : end < asOf ? "expired" : end < expiringBefore ? "expiring" : "claim";
      rows.push({ sku: x.sku, id: x.id, t: x.t, shipped: x.shipped, received: x.received, short, reimbursed: take, open, state, end, unitValue: r2(unitValue), value: r2(open * unitValue), valueSource: p ? "your reimbursements" : "default value" });
    }
  }
  rows.sort((a, b) => (b.state === "expiring") - (a.state === "expiring") || b.value - a.value || a.t - b.t);
  const sumState = (st, f) => rows.filter((r) => st.includes(r.state)).reduce((n, r) => n + f(r), 0);
  const summary = {
    shipments: new Set(rows.map((r) => r.id || r.sku + r.t)).size, short: rows.reduce((n, r) => n + r.short, 0),
    claimUnits: sumState(["claim", "expiring"], (r) => r.open), claimValue: r2(sumState(["claim", "expiring"], (r) => r.value)),
    expiringUnits: sumState(["expiring"], (r) => r.open), expiringValue: r2(sumState(["expiring"], (r) => r.value)),
    waitUnits: sumState(["wait"], (r) => r.open), waitValue: r2(sumState(["wait"], (r) => r.value)),
    expiredUnits: sumState(["expired"], (r) => r.open), expiredValue: r2(sumState(["expired"], (r) => r.value)),
    paidUnits: rows.reduce((n, r) => n + r.reimbursed, 0), windowMonths, waitDays,
  };
  return { rows, summary };
}

export function inboundClaimText(r) {
  return [
    `Please review an inbound shipment discrepancy.`,
    `Shipment ID: ${r.id || "(see below)"}  SKU: ${r.sku}`,
    `I sent ${r.shipped} unit(s) and the shipment shows ${r.received} received, a difference of ${r.short}${r.reimbursed ? `; ${r.reimbursed} of those are already reimbursed, leaving ${r.open}` : ""}. Shipment created ${ymd(r.t)}.`,
    `Please check the carrier's delivery record and the receiving count and reimburse any units that were lost or damaged while in transit to or in Amazon's care, or tell me where they were received.`,
  ].join("\n");
}

// ledgerItems: normalizeLedger(...).items. reimbItems: normalizeReimbursements(...).items or null when no
// reimbursement file was given. asOf is "today" in ms so the aging is testable.
export function analyze(ledgerItems, reimbItems, { asOf = Date.now(), defaultUnitValue = DEFAULT_UNIT_VALUE, waitDays = WAIT_DAYS, windowMonths = WINDOW_MONTHS } = {}) {
  const haveReimb = Array.isArray(reimbItems);
  const unitDefault = Number.isFinite(defaultUnitValue) && defaultUnitValue >= 0 ? defaultUnitValue : DEFAULT_UNIT_VALUE;
  const expiringBefore = addMonths(asOf, EXPIRING_MONTHS);
  const bySku = new Map();
  const slot = (sku) => { const k = norm(sku); if (!bySku.has(k)) bySku.set(k, { sku, title: "", fnsku: "", events: [], found: 0, unknown: 0, reimbUnits: 0, reimbCash: 0, reimbPaidUnits: 0 }); return bySku.get(k); };
  for (const x of ledgerItems) {
    const s = slot(x.sku);
    if (!s.title && x.title) s.title = x.title;
    if (!s.fnsku && x.fnsku) s.fnsku = x.fnsku;
    s.found += x.found;
    s.unknown += x.unknown;
    if (x.lost + x.damaged > 0) s.events.push({ t: x.t, lost: x.lost, damaged: x.damaged, missing: x.lost + x.damaged });
  }
  const reimbOnlySkus = new Set();
  const ledgerKeys = new Set(bySku.keys());
  if (haveReimb) for (const r of reimbItems) {
    if (r.kind === "other" || r.kind === "inbound") continue;
    if (!ledgerKeys.has(norm(r.sku))) { reimbOnlySkus.add(r.sku); continue; }
    const s = bySku.get(norm(r.sku));
    s.reimbUnits += r.qty;
    if (r.qty > 0) { s.reimbPaidUnits += r.qty; s.reimbCash += r.amount; }
  }
  const rows = [];
  for (const s of bySku.values()) {
    s.events.sort((a, b) => a.t - b.t);
    const lost = s.events.reduce((n, e) => n + e.lost, 0);
    const damaged = s.events.reduce((n, e) => n + e.damaged, 0);
    const missing = lost + damaged;
    if (!missing && !s.unknown && !s.reimbUnits) continue;
    const offset = s.found + Math.max(0, s.reimbUnits);
    let left = offset;
    const open = [];
    for (const e of s.events) {
      const take = Math.min(left, e.missing);
      left -= take;
      if (e.missing - take > 0) open.push({ t: e.t, units: e.missing - take });
    }
    const overpaid = left;
    const unitValue = s.reimbPaidUnits > 0 ? s.reimbCash / s.reimbPaidUnits : unitDefault;
    const valueSource = s.reimbPaidUnits > 0 ? "your reimbursements" : "default value";
    const bucket = { wait: 0, claim: 0, expiring: 0, expired: 0 };
    let claimBy = null;
    for (const o of open) {
      const end = addMonths(o.t, windowMonths);
      const state = asOf - o.t < waitDays * DAY ? "wait" : end < asOf ? "expired" : end < expiringBefore ? "expiring" : "claim";
      bucket[state] += o.units;
      o.state = state; o.end = end;
      if (state === "claim" || state === "expiring") claimBy = claimBy === null ? end : Math.min(claimBy, end);
    }
    const unclaimed = open.reduce((n, o) => n + o.units, 0);
    rows.push({
      sku: s.sku, title: s.title, fnsku: s.fnsku, lost, damaged, found: s.found, reimbursed: Math.max(0, s.reimbUnits), overpaid,
      unclaimed, wait: bucket.wait, claim: bucket.claim, expiring: bucket.expiring, expired: bucket.expired,
      unitValue: r2(unitValue), valueSource, claimNowValue: r2((bucket.claim + bucket.expiring) * unitValue),
      expiredValue: r2(bucket.expired * unitValue), waitValue: r2(bucket.wait * unitValue), claimBy,
      open, unknown: s.unknown,
      from: s.events.length ? s.events[0].t : null, to: s.events.length ? s.events[s.events.length - 1].t : null,
    });
  }
  if (!rows.length) return { invalid: "The ledger shows no lost or damaged units for any SKU in this file." };
  rows.sort((a, b) => (b.claimNowValue - a.claimNowValue) || (b.unclaimed - a.unclaimed) || (a.sku < b.sku ? -1 : 1));
  const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
  const ledgerDates = ledgerItems.map((x) => x.t);
  const summary = {
    skus: rows.length, lost: sum((r) => r.lost), damaged: sum((r) => r.damaged), found: sum((r) => r.found), reimbursed: sum((r) => r.reimbursed),
    unclaimed: sum((r) => r.unclaimed), claimNowUnits: sum((r) => r.claim + r.expiring), expiringUnits: sum((r) => r.expiring), waitUnits: sum((r) => r.wait), expiredUnits: sum((r) => r.expired),
    claimNowValue: r2(sum((r) => r.claimNowValue)), expiringValue: r2(sum((r) => r.expiring * r.unitValue)), waitValue: r2(sum((r) => r.waitValue)), expiredValue: r2(sum((r) => r.expiredValue)),
    from: Math.min(...ledgerDates), to: Math.max(...ledgerDates), haveReimb, asOf, windowMonths, waitDays, defaultUnitValue: unitDefault,
    unknown: sum((r) => r.unknown),
  };
  const withClaim = rows.filter((r) => r.claim + r.expiring > 0);
  const findings = [];
  if (!haveReimb) findings.push({ severity: "high", title: "No reimbursements file was given, so every lost and damaged unit shows as unclaimed", detail: "Amazon pays for a lot of lost and damaged inventory on its own. Add the Reimbursements report (Seller Central → Reports → Fulfillment → Reimbursements) to see what is really left; until then treat the figures below as an upper bound." });
  if (summary.claimNowUnits > 0) findings.push({ severity: "high", title: `About ${summary.claimNowUnits} unit${summary.claimNowUnits === 1 ? "" : "s"} worth ${usd(summary.claimNowValue)} look unclaimed and are still inside the ${windowMonths}-month window`, detail: withClaim.slice(0, 5).map((r) => `${r.sku}: ${r.claim + r.expiring} unit(s) at ${usd(r.unitValue)} (${r.valueSource})`).join("; ") + `. Units are counted as missing when the ledger shows them lost or damaged and neither found later nor reimbursed. Check each against Seller Central before opening a case; Amazon decides every claim.` });
  if (summary.expiringUnits > 0) {
    const soon = withClaim.filter((r) => r.expiring > 0);
    findings.push({ severity: "high", title: `${summary.expiringUnits} unit${summary.expiringUnits === 1 ? "" : "s"} (${usd(summary.expiringValue)}) reach the ${windowMonths}-month limit within ${EXPIRING_MONTHS} months`, detail: "File these first: " + soon.slice(0, 5).map((r) => `${r.sku} by ${ymd(r.claimBy)}`).join("; ") + `. The ${windowMonths}-month limit is a common Amazon rule and is editable above because Amazon changes it.` });
  }
  if (summary.waitUnits > 0) findings.push({ severity: "info", title: `${summary.waitUnits} unit${summary.waitUnits === 1 ? "" : "s"} (${usd(summary.waitValue)}) went missing in the last ${waitDays} days`, detail: "Amazon often reimburses these automatically after an investigation. Check again once they are older." });
  if (summary.expiredUnits > 0) findings.push({ severity: "info", title: `${summary.expiredUnits} unit${summary.expiredUnits === 1 ? "" : "s"} (${usd(summary.expiredValue)}) are older than ${windowMonths} months`, detail: "Probably past the claim window. Some sellers still ask and are refused; the tool does not count them in the claim total." });
  const over = rows.filter((r) => r.overpaid > 0 && r.unclaimed === 0 && r.reimbursed > 0);
  if (over.length) findings.push({ severity: "info", title: `${over.length} SKU${over.length === 1 ? " was" : "s were"} reimbursed for more units than the ledger shows missing`, detail: over.slice(0, 5).map((r) => `${r.sku}: ${r.reimbursed} reimbursed vs ${r.lost + r.damaged} missing`).join("; ") + ". Nothing to claim there. The extra payments may relate to inbound shipments or periods outside this ledger." });
  if (summary.unknown > 0) findings.push({ severity: "medium", title: `${summary.unknown} unit${summary.unknown === 1 ? "" : "s"} appear as “Unknown Events” in the ledger`, detail: "The ledger does not balance for these units. That is a question for Seller Support rather than a lost or damaged claim, and they are not counted above." });
  if (haveReimb && reimbOnlySkus.size) findings.push({ severity: "info", title: `${reimbOnlySkus.size} SKU${reimbOnlySkus.size === 1 ? "" : "s"} in the reimbursements file are not in the ledger`, detail: "Typically SKUs whose losses fall outside the ledger dates. They are left out." });
  if (haveReimb) {
    const rd = reimbItems.map((r) => r.t).filter((t) => t !== null);
    if (rd.length && Math.min(...rd) > summary.from + 60 * DAY) findings.push({ severity: "medium", title: "The reimbursements file starts later than the ledger", detail: `Ledger from ${ymd(summary.from)}, reimbursements from ${ymd(Math.min(...rd))}. Older payments are missing from the netting, so older claims may be overstated. Download the Reimbursements report for the same dates.` });
  }
  return { rows, findings, summary };
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const dateStr = ymd;

// A case text a seller can adapt for Seller Support; it states only what the
// ledger shows and asks Amazon to check, and does not assert a claim is owed.
export function claimText(r) {
  const units = r.claim + r.expiring;
  const events = r.open.filter((o) => o.state === "claim" || o.state === "expiring").map((o) => `${o.units} on or around ${ymd(o.t)}`).join("; ");
  return [
    `Please review possible unreimbursed lost or damaged FBA inventory.`,
    `SKU: ${r.sku}${r.fnsku ? ` (FNSKU ${r.fnsku})` : ""}${r.title ? ` — ${r.title}` : ""}`,
    `My Inventory Ledger shows ${r.lost} unit(s) lost and ${r.damaged} unit(s) damaged in the fulfillment network, ${r.found} found and ${r.reimbursed} reimbursed over the period, leaving ${units} unit(s) I cannot match to a reimbursement: ${events}.`,
    `Please check these units and reimburse any that were lost or damaged while in Amazon's care, or tell me which reimbursement covers them.`,
  ].join("\n");
}

export function summaryText(r) {
  const s = r.summary;
  const lines = [
    `FBA inventory ledger ${ymd(s.from)} to ${ymd(s.to)}: ${s.skus} SKU(s), ${s.lost} lost and ${s.damaged} damaged unit(s), ${s.found} found, ${s.reimbursed} reimbursed`,
    s.haveReimb ? `Possibly unclaimed and still inside the ${s.windowMonths}-month window: ${s.claimNowUnits} unit(s), about ${usd(s.claimNowValue)}` : `No reimbursements file: upper bound of ${s.unclaimed} unit(s) unmatched`,
  ];
  for (const x of r.rows.filter((q) => q.claim + q.expiring > 0).slice(0, 8)) lines.push(`  ${x.sku}: ${x.claim + x.expiring} unit(s) at ${usd(x.unitValue)}${x.claimBy ? `, file by ${ymd(x.claimBy)}` : ""}`);
  lines.push("Made with the FBA Reimbursement Claim Finder (nothing uploaded). Estimates from the files supplied; Amazon decides every claim.");
  return lines.join("\n");
}

// Synthetic, invented data for the "Load an example" button, dated relative to asOf so it never ages
// out. Not a real business.
export function sampleCsv(asOf = Date.now()) {
  const d = (days) => ymd(asOf - days * DAY);
  const ledger = ["Date,FNSKU,ASIN,MSKU,Title,Disposition,Starting Warehouse Balance,Receipts,Customer Shipments,Customer Returns,Found,Lost,Damaged,Unknown Events,Ending Warehouse Balance"];
  const row = (date, msku, title, lost, damaged, found, unknown = 0) => ledger.push([date, "X00" + msku.slice(-3), "B0EXAMPLE1", msku, title, "SELLABLE", 100, 0, -20, 0, found, lost ? -lost : 0, damaged ? -damaged : 0, unknown, 60].join(","));
  row(d(520), "MUG-BLU-001", "Blue enamel camp mug 4-pack", 6, 0, 0);
  row(d(200), "MUG-BLU-001", "Blue enamel camp mug 4-pack", 3, 2, 1);
  row(d(30), "MUG-BLU-001", "Blue enamel camp mug 4-pack", 2, 0, 0);
  row(d(120), "YOGA-STR-002", "Cork yoga strap", 4, 0, 0);
  row(d(80), "LAMP-DSK-003", "Bamboo desk lamp", 0, 3, 0, 2);
  row(d(20), "LAMP-DSK-003", "Bamboo desk lamp", 1, 0, 0);
  row(d(300), "TEA-SMP-004", "Loose tea sampler", 5, 0, 0);
  const reimb = ["approval-date,reimbursement-id,reason,sku,fnsku,asin,product-name,quantity-reimbursed-cash,quantity-reimbursed-inventory,quantity-reimbursed-total,amount-per-unit,amount-total"];
  const pay = (date, sku, reason, qty, each) => reimb.push([date, "R" + Math.abs(date.length * qty * 7), reason, sku, "", "B0EXAMPLE1", "", qty, 0, qty, each.toFixed(2), (each * qty).toFixed(2)].join(","));
  pay(d(500), "MUG-BLU-001", "Lost_Warehouse", 4, 17.5);
  pay(d(110), "YOGA-STR-002", "Lost_Warehouse", 4, 11.2);
  pay(d(280), "TEA-SMP-004", "Lost_Warehouse", 5, 9.4);
  const ship = ["Shipment ID,Created,MSKU,Units expected,Units located"];
  ship.push(["FBA15EXAMP1", d(120), "MUG-BLU-001", 200, 188].join(","));
  ship.push(["FBA15EXAMP1", d(120), "YOGA-STR-002", 150, 150].join(","));
  ship.push(["FBA15EXAMP2", d(60), "LAMP-DSK-003", 80, 71].join(","));
  ship.push(["FBA15EXAMP3", d(10), "TEA-SMP-004", 300, 290].join(","));
  ship.push(["FBA15EXAMP4", d(240), "TEA-SMP-004", 100, 94].join(","));
  return { ledger: ledger.join("\n"), reimbursements: reimb.join("\n"), shipments: ship.join("\n") };
}
