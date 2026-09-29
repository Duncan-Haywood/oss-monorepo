// FBA aged-inventory and storage-fee analyzer: reads the Seller Central
// "Inventory Age" report (one row per SKU, units by age bucket, units shipped
// in the last 7/30/60/90 days, price, item volume), simulates the next months
// of storage fees and aged-inventory surcharges under four choices per SKU --
// hold, mark down, remove the aged units, remove everything -- and names the
// one with the best projected profit. Fee tables are editable defaults typed
// from memory of public fee pages and are NOT verified against a live account;
// Amazon changes them. Column names are matched by alias; no real export was
// available when this was written. Pure functions, no DOM, no network.

export const DEFAULTS = {
  horizonMonths: 6,
  unitCost: 8,
  fulfilmentFee: 4,
  referralPct: 15,
  cubicFeetPerUnit: 0.1,
  storageRate: 0.87,
  storageRatePeak: 2.4,
  removalFee: 0.8,
  salvagePct: 0,
  elasticity: 2,
  removeAgeDays: 271,
  velocityBasis: 90,
  ais: "181-210:0.5, 211-240:1, 241-270:1.5, 271-300:3.8, 301-330:4, 331-365:4.2, 366+:4.2",
};
export const MARKDOWNS = [0.1, 0.2, 0.3];
const MONTH_DAYS = 30;
// Profit is judged over the whole sell-through, not just the horizon shown: a
// short window would call holding 800 slow units free because their fees fall
// after it. Fees inside the horizon are reported separately.
const SIM_MONTHS = 36;

const ALIASES = {
  sku: ["sku", "msku", "merchant sku", "seller sku", "merchant-sku"],
  title: ["product-name", "product name", "title", "item name"],
  available: ["avail-sellable-quantity", "available", "sellable quantity", "units available", "quantity available", "afn-fulfillable-quantity"],
  t7: ["units-shipped-t7", "units shipped last 7 days", "units shipped t7"],
  t30: ["units-shipped-t30", "units shipped last 30 days", "units shipped t30"],
  t60: ["units-shipped-t60", "units shipped last 60 days", "units shipped t60"],
  t90: ["units-shipped-t90", "units shipped last 90 days", "units shipped t90"],
  price: ["your-price", "sales-price", "price", "your price"],
  volume: ["item-volume", "unit volume", "volume"],
  volumeUnit: ["volume-unit-measurement", "volume unit"],
  cost: ["unit cost", "cost", "cogs", "unit-cost", "cost per unit"],
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

const r2 = (n) => Math.round(n * 100) / 100;
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
export const money = (n) => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "181-210:0.5, 366+:4.2" -> [{from, to, rate}] sorted; `to` is Infinity for "N+".
export function parseAisTable(text) {
  const out = [];
  for (const part of String(text ?? "").split(/[,;\n]/)) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(\d+)\s*(?:-\s*(\d+)|\+)\s*:\s*([0-9.]+)$/);
    if (!m) return { error: `Surcharge table: could not read “${s}”. Use “181-210:0.50, 366+:4.20” (age in days : $ per cubic foot per month).` };
    out.push({ from: +m[1], to: m[2] === undefined ? Infinity : +m[2], rate: +m[3] });
  }
  out.sort((a, b) => a.from - b.from);
  return { table: out };
}
export const aisRate = (table, age) => {
  for (const t of table) if (age >= t.from && age <= t.to) return t.rate;
  return 0;
};

// Age columns: "inv-age-0-to-90-days", "inv-age-365-plus-days", "271 - 365 days".
function ageColumn(h) {
  const s = h.trim().toLowerCase();
  let m = s.match(/inv[- ]age[- ](\d+)[- ]to[- ](\d+)[- ]days/) || s.match(/^(\d+)\s*(?:-|to)\s*(\d+)\s*days$/);
  if (m) return { from: +m[1], to: +m[2] };
  m = s.match(/inv[- ]age[- ](\d+)[- ]plus[- ]days/) || s.match(/^(\d+)\s*(?:\+|plus)\s*days$/);
  if (m) return { from: +m[1], to: Infinity };
  return null;
}

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  const ages = [];
  header.forEach((h, i) => { const a = ageColumn(h); if (a) ages.push({ ...a, i }); });
  ages.sort((a, b) => a.from - b.from);
  return { cols, ages };
}

const VOLUME_TO_CUFT = (u) => {
  const s = String(u ?? "").toLowerCase();
  if (/cubic feet|cu\.? ?ft|ft3/.test(s)) return 1;
  if (/cubic inch|cu\.? ?in|in3/.test(s)) return 1 / 1728;
  if (/cubic cent|cm3|cu\.? ?cm/.test(s)) return 1 / 28316.85;
  if (/cubic met|m3/.test(s)) return 35.3147;
  return null;
};

// Inventory Age rows -> { items, skipped, notes, error }. An item is
// { line, sku, title, lots:[{age, units}], units, sold:{t7,t30,t60,t90}, price, cuft, cost }.
export function normalizeAge(table, { decimalComma = false } = {}) {
  const empty = { items: [], skipped: [], notes: [] };
  if (!table.length) return { ...empty, error: "The inventory age file is empty." };
  let hit = null;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const f = findColumns(table[i]);
    if (f.cols.sku !== undefined && f.ages.length >= 2) { hit = { h: i, ...f }; break; }
  }
  if (!hit) return { ...empty, error: "No header row found. Expected “sku” and the age columns (inv-age-0-to-90-days, inv-age-91-to-180-days …), as in Seller Central → Inventory → Inventory Planning → Inventory age (or Reports → Fulfillment → Inventory Age)." };
  const { h, cols, ages } = hit;
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const num = (raw) => { if (isBlank(raw)) return 0; const n = parseNumber(raw, decimalComma); return Number.isFinite(n) ? Math.max(0, n) : null; };
  const notes = [];
  if (cols.t30 === undefined && cols.t90 === undefined && cols.t60 === undefined && cols.t7 === undefined) notes.push("No units-shipped columns: sales speed is unknown, so every SKU is treated as not selling.");
  if (cols.volume === undefined) notes.push("No item-volume column: the default cubic feet per unit is used for every SKU.");
  if (cols.price === undefined) notes.push("No price column: margin and markdown options cannot be worked out, so every SKU is priced at $0.");
  const items = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i], lineNo = i + 1;
    if (/^(total|totals|grand total)\b/i.test(String(line[0] ?? "").trim())) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const sku = get(line, "sku");
    if (!sku) { skipped.push({ line: lineNo, reason: "no SKU" }); continue; }
    const lots = []; let bad = false;
    for (const a of ages) {
      const u = num((line[a.i] ?? "").trim());
      if (u === null) { bad = true; break; }
      if (u > 0) lots.push({ age: a.to === Infinity ? a.from + 45 : (a.from + a.to) / 2, units: u });
    }
    const sold = { t7: num(get(line, "t7")), t30: num(get(line, "t30")), t60: num(get(line, "t60")), t90: num(get(line, "t90")) };
    const price = num(get(line, "price"));
    if (bad || Object.values(sold).includes(null) || price === null) { skipped.push({ line: lineNo, reason: "number not readable" }); continue; }
    let cuft = null;
    const vol = num(get(line, "volume"));
    if (vol) { const k = VOLUME_TO_CUFT(get(line, "volumeUnit")); cuft = k === null ? vol : vol * k; }
    const cost = cols.cost !== undefined && !isBlank(get(line, "cost")) ? num(get(line, "cost")) : null;
    const units = lots.reduce((s, l) => s + l.units, 0);
    items.push({ line: lineNo, sku, title: get(line, "title"), lots, units, sold, price, cuft, cost });
  }
  if (!items.length) return { ...empty, skipped, error: "No rows could be read. " + (skipped.length ? `${skipped.length} row(s) were skipped (first: line ${skipped[0].line}, ${skipped[0].reason}).` : "") };
  return { items, skipped, notes };
}

// Units per month from the recent shipped counts. basis 30/60/90 picks the
// window; a shorter window is the fallback when the chosen one is absent.
export function monthlyVelocity(sold, basis) {
  const order = basis === 30 ? [30, 60, 90, 7] : basis === 60 ? [60, 30, 90, 7] : [90, 60, 30, 7];
  for (const d of order) {
    const v = sold["t" + d];
    if (v > 0) return (v / d) * MONTH_DAYS;
  }
  return 0;
}

// One option over the horizon. Sales take the oldest lots first, as FBA does.
// Storage and surcharge are charged on the average of the units held at the
// start and end of each 30-day step.
function simulate(lots0, { velocity, margin, cuft, opt, table, startMonth, removeNow }) {
  let lots = lots0.map((l) => ({ ...l })).filter((l) => l.units > 0);
  let removed = 0;
  if (removeNow) {
    const keep = [];
    for (const l of lots) (removeNow(l) ? (removed += l.units) : keep.push(l));
    lots = keep;
  }
  let sold = 0, storage = 0, surcharge = 0, storageH = 0, surchargeH = 0, leftH = null;
  for (let m = 0; m < SIM_MONTHS; m++) {
    if (m === opt.horizonMonths) leftH = lots.reduce((s, l) => s + l.units, 0);
    const before = lots.map((l) => l.units);
    let want = velocity;
    for (const l of lots) { const t = Math.min(l.units, want); l.units -= t; want -= t; sold += t; }
    const rate = ((startMonth + m) % 12) >= 9 ? opt.storagePeak : opt.storage;
    lots.forEach((l, k) => {
      const avg = (before[k] + l.units) / 2;
      const st = avg * cuft * rate;
      const a = avg * cuft * aisRate(table, l.age + 15);
      storage += st; surcharge += a;
      if (m < opt.horizonMonths) { storageH += st; surchargeH += a; }
      l.age += MONTH_DAYS;
    });
  }
  const left = lots.reduce((s, l) => s + l.units, 0);
  return { sold, removed, left, leftH: leftH ?? left, storage, surcharge, storageH, surchargeH };
}

export function analyze(items, o = {}) {
  const opt = {
    horizonMonths: o.horizonMonths ?? DEFAULTS.horizonMonths,
    storage: o.storageRate ?? DEFAULTS.storageRate,
    storagePeak: o.storageRatePeak ?? DEFAULTS.storageRatePeak,
  };
  const p = { ...DEFAULTS, ...o };
  if (!(opt.horizonMonths >= 1 && opt.horizonMonths <= 24)) return { invalid: "Horizon must be between 1 and 24 months." };
  for (const k of ["unitCost", "fulfilmentFee", "referralPct", "cubicFeetPerUnit", "storageRate", "storageRatePeak", "removalFee", "salvagePct", "elasticity"]) {
    if (!Number.isFinite(+p[k]) || +p[k] < 0) return { invalid: `Check the value for “${k}”: it must be zero or more.` };
  }
  if (p.referralPct >= 100) return { invalid: "Referral fee must be under 100%." };
  const parsed = parseAisTable(p.ais);
  if (parsed.error) return { invalid: parsed.error };
  const table = parsed.table;
  const asOf = o.asOf ?? Date.now();
  const startMonth = new Date(asOf).getUTCMonth();
  const rows = [];
  for (const it of items) {
    const cuft = it.cuft ?? p.cubicFeetPerUnit;
    const cost = it.cost ?? p.unitCost;
    const velocity = monthlyVelocity(it.sold, p.velocityBasis);
    const marginAt = (disc) => it.price * (1 - disc) * (1 - p.referralPct / 100) - p.fulfilmentFee - cost;
    const salvage = (p.salvagePct / 100) * cost;
    const run = (disc, removeNow) => {
      const vel = velocity * (1 + p.elasticity * disc);
      const s = simulate(it.lots, { velocity: vel, margin: marginAt(disc), cuft, opt, table, startMonth, removeNow });
      const removalCost = s.removed * p.removalFee;
      const profit = s.sold * marginAt(disc) - s.storage - s.surcharge - removalCost + (s.removed + s.left) * salvage;
      return { ...s, discount: disc, velocity: vel, removalCost, profit: r2(profit), fees: r2(s.storageH + s.surchargeH + removalCost) };
    };
    const hold = run(0, null);
    const options = [
      { key: "hold", label: "Hold at current price", ...hold },
      ...MARKDOWNS.map((d) => ({ key: "markdown", label: `Mark down ${Math.round(d * 100)}%`, ...run(d, null) })),
      { key: "remove-aged", label: `Remove units aged ${p.removeAgeDays}+ days`, ...run(0, (l) => l.age >= p.removeAgeDays) },
      { key: "remove-all", label: "Remove everything", ...run(0, () => true) },
    ];
    const hasAged = it.lots.some((l) => l.age >= p.removeAgeDays);
    const eligible = options.filter((x) => x.key !== "remove-aged" || hasAged);
    let best = hold;
    let bestOpt = options[0];
    for (const x of eligible) if (x.profit > bestOpt.profit + 0.005) { bestOpt = x; best = x; }
    const aged = it.lots.filter((l) => l.age >= 181).reduce((s, l) => s + l.units, 0);
    rows.push({
      sku: it.sku, title: it.title, units: it.units, aged, velocity: r2(velocity),
      monthsOfCover: velocity > 0 ? r2(it.units / velocity) : null,
      price: it.price, cuft: r2(cuft), cost, margin: r2(marginAt(0)),
      holdFees: hold.fees, holdSurcharge: r2(hold.surchargeH), holdStorage: r2(hold.storageH),
      holdProfit: hold.profit, holdLeft: Math.round(hold.leftH),
      best: bestOpt.key, bestLabel: bestOpt.label, bestProfit: best.profit,
      gain: r2(best.profit - hold.profit), bestDiscount: bestOpt.key === "markdown" ? bestOpt.discount : 0,
      removeUnits: bestOpt.key === "remove-all" ? it.units : bestOpt.key === "remove-aged" ? Math.round(bestOpt.removed) : 0,
      newPrice: bestOpt.key === "markdown" ? r2(it.price * (1 - bestOpt.discount)) : it.price,
      options: options.map((x) => ({ key: x.key, label: x.label, profit: x.profit, fees: x.fees })),
    });
  }
  rows.sort((a, b) => b.gain - a.gain || b.holdFees - a.holdFees);
  const sum = (f) => r2(rows.reduce((s, r) => s + f(r), 0));
  const summary = {
    skus: rows.length, units: sum((r) => r.units), aged: sum((r) => r.aged),
    holdFees: sum((r) => r.holdFees), holdSurcharge: sum((r) => r.holdSurcharge), holdStorage: sum((r) => r.holdStorage),
    gain: sum((r) => r.gain), actions: rows.filter((r) => r.best !== "hold").length,
    horizonMonths: opt.horizonMonths,
  };
  const findings = [];
  const neg = rows.filter((r) => r.price > 0 && r.margin <= 0);
  if (neg.length) findings.push({ severity: "high", title: `${neg.length} SKU(s) lose money on every sale at the current price`, detail: `Margin per unit is zero or negative after referral fee, fulfilment fee and unit cost: ${neg.slice(0, 5).map((r) => `${r.sku} (${money(r.margin)})`).join(", ")}. Check the unit cost and fulfilment fee you entered; the storage numbers below do not fix a negative margin.` });
  const still = rows.filter((r) => r.velocity === 0 && r.units > 0);
  if (still.length) findings.push({ severity: "high", title: `${still.length} SKU(s) show no units shipped in the report windows`, detail: `${still.reduce((s, r) => s + r.units, 0)} unit(s) sit unsold: ${still.slice(0, 5).map((r) => r.sku).join(", ")}. With no sales they only accrue fees, so removal is compared against holding on fees alone.` });
  const heavy = rows.filter((r) => r.holdSurcharge > 0 && r.holdSurcharge >= r.holdStorage);
  if (heavy.length) findings.push({ severity: "medium", title: `${heavy.length} SKU(s) pay more aged surcharge than storage`, detail: `Surcharge over storage on ${heavy.slice(0, 5).map((r) => r.sku).join(", ")} if held, at the surcharge table you set.` });
  if (rows.every((r) => r.best === "hold")) findings.push({ severity: "info", title: "Holding wins on every SKU", detail: "At these fee tables and this sales speed no option beat holding over the horizon." });
  return { rows, summary, findings, params: p };
}

export const ACTION_TEXT = {
  hold: "Keep selling at the current price.",
  markdown: "Lower the price",
  "remove-aged": "Create a removal order for the aged units",
  "remove-all": "Create a removal order for all units",
};

export function actionLine(r) {
  if (r.best === "markdown") return `${r.sku}: lower the price from $${money(r.price)} to $${money(r.newPrice)} (${Math.round(r.bestDiscount * 100)}% off); projected profit rises by about $${money(r.gain)} over the horizon versus holding.`;
  if (r.best === "remove-aged") return `${r.sku}: remove the ${r.removeUnits} oldest unit(s) now; projected profit rises by about $${money(r.gain)} versus holding.`;
  if (r.best === "remove-all") return `${r.sku}: remove all ${r.removeUnits} unit(s) now; projected profit rises by about $${money(r.gain)} versus holding.`;
  return `${r.sku}: hold.`;
}

export function summaryText(a) {
  const s = a.summary;
  const lines = [
    `FBA aged-inventory and storage-fee analysis, next ${s.horizonMonths} month(s), ${s.skus} SKU(s), ${s.units} unit(s) of which ${s.aged} are 181+ days old.`,
    `If everything is held: about $${money(s.holdFees)} in fees ($${money(s.holdStorage)} storage, $${money(s.holdSurcharge)} aged surcharge).`,
    `Following the best option per SKU improves projected profit by about $${money(s.gain)} across ${s.actions} SKU(s).`,
    "",
  ];
  for (const r of a.rows.filter((x) => x.best !== "hold").slice(0, 15)) lines.push(actionLine(r));
  lines.push("", "Estimates from the fee tables and assumptions entered, not Amazon's bill. Fee tables are typed defaults; check them against Seller Central.");
  return lines.join("\n");
}

export function sampleCsv() {
  const head = "sku,product-name,avail-sellable-quantity,inv-age-0-to-90-days,inv-age-91-to-180-days,inv-age-181-to-270-days,inv-age-271-to-365-days,inv-age-365-plus-days,units-shipped-t7,units-shipped-t30,units-shipped-t60,units-shipped-t90,your-price,item-volume,volume-unit-measurement";
  const rows = [
    "YOGA-MAT-BLK,Yoga mat black 6mm,400,150,100,80,50,20,30,120,230,340,29.99,0.45,cubic feet",
    "PHONE-CASE-14,Phone case iPhone 14 clear,900,50,100,250,300,200,2,8,20,30,16.99,0.02,cubic feet",
    "DESK-LAMP-LED,LED desk lamp,120,20,30,40,20,10,10,40,75,110,34.99,0.35,cubic feet",
    "CHEW-TOY-XL,Dog chew toy XL,300,0,0,50,120,130,0,0,0,0,19.99,0.08,cubic feet",
    "SILICONE-LID-6,Silicone lids set of 6,600,300,200,60,30,10,60,240,470,700,15.99,0.06,cubic feet",
  ];
  return [head, ...rows].join("\n");
}
