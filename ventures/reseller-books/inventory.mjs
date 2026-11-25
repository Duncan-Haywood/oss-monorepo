// Inventory log -> Schedule C Part III (cost of goods sold), one tax year.
//
// A reseller's sourcing sheet (one row per purchase: item or SKU, quantity,
// cost, date bought, and optionally date sold) is matched against the units the
// marketplace reports say were sold. Each sold unit takes the oldest matching
// purchase still on hand (first in, first out). What is left at December 31 is
// the closing inventory. The Part III arithmetic is the form's own (2026
// Schedule C, read from irs.gov on 2026-11-25):
//
//   line 35  inventory at beginning of year
//   line 36  purchases less cost of items withdrawn for personal use
//   line 37  cost of labor; 38 materials and supplies; 39 other costs (not in a sourcing sheet)
//   line 40  add lines 35 through 39
//   line 41  inventory at end of year
//   line 42  cost of goods sold = line 40 - line 41, carried to line 4
//
// Valued at cost (line 33a). Not tax advice: a small business taxpayer may
// choose not to keep an inventory at all (Schedule C instructions, Part III).

import { parseCsv } from "./engines/ebay.mjs";
import { isoDate } from "./trips.mjs";

const norm = (s) => String(s ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");

const COLUMNS = {
  sku: ["sku", "custom label", "item sku", "seller sku", "item id", "item number", "listing id", "inventory id", "item code", "code"],
  item: ["item", "item name", "item title", "title", "name", "description", "product", "product name", "listing title"],
  qty: ["quantity", "qty", "units", "count", "quantity bought", "qty bought"],
  unitCost: ["unit cost", "cost each", "cost per item", "cost per unit", "cost", "price paid", "purchase price", "paid", "cost basis", "cogs", "buy price", "bought for"],
  totalCost: ["total cost", "total paid", "lot cost", "extended cost", "line total"],
  bought: ["date bought", "purchase date", "date purchased", "purchased", "bought", "buy date", "date acquired", "acquired", "sourced", "sourced date", "date sourced", "sourcing date"],
  sold: ["date sold", "sold date", "sold on", "sale date"],
  status: ["status", "disposition", "removed"],
};

function columns(head) {
  const h = head.map(norm);
  const out = {};
  for (const [field, names] of Object.entries(COLUMNS)) {
    for (const n of names) {
      const i = h.indexOf(n);
      if (i >= 0) { out[field] = i; break; }
    }
  }
  return out;
}

function firstRow(text) {
  const rows = parseCsv(String(text || "").split(/\r?\n/).find((l) => l.trim()) || "");
  return rows[0] || [];
}

/**
 * A sourcing sheet: a cost column, a purchase-date column and an item or SKU
 * column. Checked after the marketplace formats, none of which has a
 * purchase date.
 */
export function isInventoryLog(text) {
  const c = columns(firstRow(text));
  return c.bought !== undefined && (c.unitCost !== undefined || c.totalCost !== undefined) && (c.sku !== undefined || c.item !== undefined);
}

const amount = (s) => {
  let t = String(s ?? "").replace(/[$\s]/g, "");
  if (/^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)) t = t.split(",").join("");
  else if (/^-?\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  if (t === "") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

// Rows a seller marks as gone without a sale: kept out of closing inventory and
// listed, because Part III line 36 takes out items withdrawn for personal use
// and a donation or loss is the preparer's call, not ours.
const REMOVED = /^(personal|kept|donat|lost|stolen|damaged|trash|discard|written off|write-off|returned to seller|returned to store)/;

/**
 * Read one or more sourcing sheets. Each lot is { file, line, keys, sku, item,
 * qty, unitCost, bought, sold, removed }. `keys` are the lowercased SKU and item
 * name a sale can match.
 */
export function parseInventory(files) {
  const lots = [];
  const skipped = [];
  for (const f of files) {
    const rows = parseCsv(String(f.text || ""));
    const head = rows.findIndex((r) => r.some((x) => String(x).trim()));
    if (head < 0) continue;
    const c = columns(rows[head]);
    for (let i = head + 1; i < rows.length; i++) {
      const r = rows[i];
      const line = r.line ?? i + 1;
      if (!r.some((x) => String(x).trim())) continue;
      const sku = c.sku === undefined ? "" : String(r[c.sku] ?? "").trim();
      const item = c.item === undefined ? "" : String(r[c.item] ?? "").trim();
      if (!sku && !item) { skipped.push({ file: f.name, line, reason: "no item or SKU" }); continue; }
      if (/^(total|totals|subtotal|grand total)\b/i.test(sku || item)) { skipped.push({ file: f.name, line, reason: "total row" }); continue; }
      const qRaw = c.qty === undefined ? "" : String(r[c.qty] ?? "").trim();
      const qty = qRaw === "" ? 1 : amount(qRaw);
      if (!Number.isInteger(qty) || qty <= 0) { skipped.push({ file: f.name, line, reason: "quantity is not a whole number above zero" }); continue; }
      let unitCost = c.unitCost === undefined ? NaN : amount(r[c.unitCost]);
      if (Number.isNaN(unitCost) && c.totalCost !== undefined) {
        const total = amount(r[c.totalCost]);
        if (!Number.isNaN(total)) unitCost = total / qty;
      }
      if (Number.isNaN(unitCost) || unitCost < 0) { skipped.push({ file: f.name, line, reason: "cost not readable" }); continue; }
      const bRaw = c.bought === undefined ? "" : String(r[c.bought] ?? "").trim();
      const bought = isoDate(bRaw) || null;
      if (bRaw && !bought) { skipped.push({ file: f.name, line, reason: "purchase date not readable" }); continue; }
      const sold = c.sold === undefined ? null : isoDate(r[c.sold]) || null;
      const st = c.status === undefined ? "" : norm(r[c.status]);
      const removed = REMOVED.test(st) ? st : null;
      const keys = [...new Set([sku, item].filter(Boolean).map(norm))];
      lots.push({ file: f.name, line, keys, sku, item, qty, unitCost, bought, sold, removed });
    }
  }
  return { lots, skipped };
}

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Schedule C Part III for `year` from the lots and the units sold in that year.
 *
 * @param {object[]} lots       from parseInventory
 * @param {{channel: string, name?: string, keys: string[], units: number}[]} sold  units sold in `year`, per item
 * @param {{year: number, opening?: number|null}} opts
 *   `opening` is last year's line 41 when the seller has it; otherwise line 35
 *   is the cost of logged lots bought before the year and not sold before it.
 */
export function partThree(lots, sold, { year, opening = null } = {}) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  // Lots that exist during the year: bought by its end (or undated), not sold
  // before it started.
  const pool = lots
    .filter((l) => (l.bought === null || l.bought <= end) && !(l.sold && l.sold < start))
    .map((l) => ({ ...l, left: l.qty }))
    .sort((a, b) => (a.bought ?? "9999").localeCompare(b.bought ?? "9999") || a.line - b.line);
  const before = pool.filter((l) => l.bought !== null && l.bought < start);
  const during = pool.filter((l) => l.bought === null || l.bought >= start);
  const fromLog = r2(before.reduce((a, l) => a + l.qty * l.unitCost, 0));
  const purchases = r2(during.reduce((a, l) => a + l.qty * l.unitCost, 0));

  // Personal withdrawals and other removals during the year come out of the
  // pool before sales are matched, so a sale cannot take a unit the seller kept.
  let withdrawn = 0;
  const removedLots = [];
  for (const l of pool) {
    if (l.removed && (!l.sold || l.sold <= end)) {
      const cost = l.left * l.unitCost;
      if (/^(personal|kept)/.test(l.removed)) withdrawn += cost;
      removedLots.push({ item: l.item || l.sku, units: l.left, cost: r2(cost), why: l.removed });
      l.left = 0;
    }
  }

  // Match sold units, oldest matching purchase first.
  const index = new Map();
  for (const l of pool) for (const k of l.keys) (index.get(k) ?? index.set(k, []).get(k)).push(l);
  let matchedUnits = 0;
  let matchedCost = 0;
  const unmatched = [];
  for (const s of sold) {
    const keys = [...new Set(s.keys.filter(Boolean).map(norm))];
    const cands = [...new Set(keys.flatMap((k) => index.get(k) || []))].sort((a, b) => (a.bought ?? "9999").localeCompare(b.bought ?? "9999") || a.line - b.line);
    let need = s.units;
    for (const l of cands) {
      if (need <= 0) break;
      const take = Math.min(need, l.left);
      if (take <= 0) continue;
      l.left -= take;
      need -= take;
      matchedUnits += take;
      matchedCost += take * l.unitCost;
    }
    if (need > 0) unmatched.push({ channel: s.channel, item: s.name || s.keys.find(Boolean) || "(no name)", units: need, matchedAny: cands.length > 0 });
  }

  // A lot the sheet marks sold during the year that no report sale took was
  // sold somewhere the reports do not cover (a local sale, a show): it is not
  // on hand at year end.
  let elsewhereUnits = 0;
  let elsewhereCost = 0;
  for (const l of pool) {
    if (l.left > 0 && l.sold && l.sold >= start && l.sold <= end) {
      elsewhereUnits += l.left;
      elsewhereCost += l.left * l.unitCost;
      l.left = 0;
    }
  }
  const closing = r2(pool.reduce((a, l) => a + l.left * l.unitCost, 0));
  const closingUnits = pool.reduce((a, l) => a + l.left, 0);
  const line35 = opening === null || opening === undefined || Number.isNaN(Number(opening)) ? fromLog : r2(Number(opening));
  const line36 = r2(purchases - withdrawn);
  const line40 = r2(line35 + line36);
  const line42 = r2(line40 - closing);
  const removedOther = r2(removedLots.reduce((a, x) => a + x.cost, 0) - withdrawn);
  return {
    year,
    line35, openingSource: opening === null || opening === undefined || Number.isNaN(Number(opening)) ? "log" : "entered",
    openingFromLog: fromLog,
    line36, purchases, withdrawn: r2(withdrawn),
    line40, line41: closing, line42,
    closingUnits,
    matchedUnits, matchedCost: r2(matchedCost),
    elsewhereUnits, elsewhereCost: r2(elsewhereCost),
    removedLots, removedOther,
    unmatched,
    unmatchedUnits: unmatched.reduce((a, u) => a + u.units, 0),
    undated: pool.filter((l) => l.bought === null).length,
    boughtAfter: lots.filter((l) => l.bought !== null && l.bought > end).length,
  };
}

/** Average unit cost per key, as `key,cost` lines the marketplace engines read. */
export function costLines(lots) {
  const by = new Map();
  for (const l of lots) {
    for (const k of [l.sku, l.item].filter(Boolean)) {
      const a = by.get(k) || { units: 0, cost: 0 };
      a.units += l.qty;
      a.cost += l.qty * l.unitCost;
      by.set(k, a);
    }
  }
  return [...by].map(([k, a]) => `${k},${(a.cost / a.units).toFixed(2)}`).join("\n");
}

/** Plain-language notes for the worksheet and findings. */
export function partThreeNotes(p) {
  const out = [];
  const usd = (v) => {
    const format = (v) => `$${v.toFixed(2)}`;
    const text = format(Math.abs(v));
    return v < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  if (p.unmatchedUnits) {
    const names = p.unmatched.slice(0, 4).map((u) => `${u.item} (${u.channel}, ${u.units})`).join("; ");
    out.push(`${p.unmatchedUnits} sold unit(s) have no purchase in the inventory log, so their cost is not in line 42: ${names}${p.unmatched.length > 4 ? "; and more" : ""}. Add them to the log under the same SKU or title the marketplace shows.`);
  }
  if (p.openingSource === "entered" && Math.abs(p.line35 - p.openingFromLog) >= 0.01) {
    out.push(`Line 35 is the ${usd(p.line35)} you entered (last year's closing inventory); the log's purchases before ${p.year} that were not sold before it come to ${usd(p.openingFromLog)}. The form asks for an explanation if line 35 differs from last year's closing inventory, so the entered figure is used.`);
  }
  if (p.openingSource === "log" && p.line35 > 0) out.push(`Line 35 (${usd(p.line35)}) is figured from the log: purchases before ${p.year} not marked sold before it. It should equal line 41 of last year's Schedule C; if it does not, enter last year's figure.`);
  if (p.withdrawn) out.push(`${usd(p.withdrawn)} of goods marked personal or kept were taken out of purchases (line 36 is purchases less items withdrawn for personal use).`);
  if (p.removedOther > 0) out.push(`${usd(p.removedOther)} of goods marked donated, lost, damaged or similar are out of closing inventory, so they are inside line 42. Ask your preparer whether any belongs elsewhere.`);
  if (p.elsewhereUnits) out.push(`${p.elsewhereUnits} unit(s) (${usd(p.elsewhereCost)}) are marked sold in ${p.year} but match no sale in these reports, so they are treated as sold elsewhere; their sales must be in gross receipts too.`);
  if (p.undated) out.push(`${p.undated} log row(s) have no purchase date and are counted as ${p.year} purchases. Give a date so stock from earlier years is not counted again.`);
  if (p.boughtAfter) out.push(`${p.boughtAfter} log row(s) were bought after ${p.year} and are left out.`);
  return out;
}

/**
 * Synthetic sourcing sheet for the example. It covers the sample eBay store
 * only (made-up items, not a real seller), so the example also shows what the
 * page says about sales on other channels with no purchase in the log.
 */
export function sampleInventoryCsv() {
  return [
    "SKU,Item,Quantity,Unit cost,Date bought,Date sold,Status",
    "CAM-FM2,Vintage Nikon FM2 35mm Film Camera Body,4,135.00,2025-11-14,,",
    "CAM-FM2,Vintage Nikon FM2 35mm Film Camera Body,16,142.00,2026-02-03,,",
    "LEGO-75192,LEGO Star Wars 75192 Millennium Falcon Sealed,10,610.00,2026-01-20,,",
    "APP-J001L,Carhartt Detroit Jacket J001 Size L,45,22.00,2026-01-09,,",
    "APP-J001L,Carhartt Detroit Jacket J001 Size L,1,22.00,2026-01-09,,personal",
    "TCG-SLV,Pokemon Card Sleeves 100ct Lot,120,3.10,2026-01-05,,",
    "TCG-BIN,Bulk trading card lot,1,40.00,2026-03-02,2026-04-18,",
  ].join("\n");
}
