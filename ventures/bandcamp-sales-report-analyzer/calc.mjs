// Sales analysis from a Bandcamp "sales report" CSV. Column names are matched by alias
// from memory of Bandcamp sales reports; no real export was available when this was
// written. Buyer emails and names are read only to count repeat buyers and are not kept.
// Money is analysed in the file's main currency only (no exchange rates are applied).
// Pure functions, no DOM, no network.

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

// "$5.00", "1,234.50", "5.00 USD", "(5)", "-5" and blanks (0). NaN for non-numbers.
export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  const m = s.match(/\d[\d.,]*/);
  if (!m) return NaN;
  s = m[0];
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

// Calendar dates. Returns UTC ms or null. `dmy` is decided once per file.
export function parseWhen(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let y, mo, d;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  return new Date(t).getUTCDate() === d ? t : null;
}

// Day-first only when unambiguous: some first part above 12, no second above 12.
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

const ALIASES = {
  date: ["date", "sale date", "date/time", "purchase date", "transaction date", "date (utc)"],
  itemType: ["item type", "item_type", "type", "sale type"],
  itemName: ["item name", "item", "item title", "title", "package"],
  quantity: ["quantity", "qty", "units"],
  itemPrice: ["item price", "price", "unit price", "sale price"],
  subTotal: ["sub total", "subtotal", "sub-total", "item total", "sale total"],
  shipping: ["shipping", "shipping amount", "shipping charged"],
  sellerTax: ["seller tax", "tax", "sales tax", "vat"],
  marketplaceTax: ["marketplace tax", "marketplace vat", "tax collected by bandcamp"],
  fee: ["transaction fee", "fee", "fees", "bandcamp fee", "processing fee"],
  net: ["net amount", "net", "amount you received", "net revenue", "payout amount"],
  currency: ["currency"],
  country: ["country", "ship to country", "buyer country", "country name"],
  discount: ["discount code", "discount", "coupon", "promo code"],
  contribution: ["additional fan contribution", "fan contribution", "tip"],
  buyer: ["buyer email", "email", "buyer name", "buyer"],
  refund: ["refunded", "refund", "is refund"],
};

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

export const MIN_GROUP = 5;
export const MICRO_SALE = 3;
export const DEFAULT_ASSUMPTIONS = Object.freeze({ unitCost: 0, postage: 0 });
const DAY = 86400000;

// Item wording -> digital | physical | subscription | other.
export function classifyItem(s) {
  const t = String(s ?? "").toLowerCase();
  if (/subscri/.test(t)) return "subscription";
  if (/vinyl|lp\b|cassette|tape|\bcd\b|merch|shirt|t-shirt|poster|package|physical|bundle|record|7"|12"/.test(t)) return "physical";
  if (/album|track|digital|download|song|ep\b|single|discography/.test(t)) return "digital";
  return t.trim() ? "other" : "none";
}

const isRefundText = (s) => /^(true|yes|y|1|refund|refunded)$/i.test(String(s ?? "").trim());

// Returns { members (sales), skipped, columns, currency, otherCurrencies, dmy, error }.
// A sale is { line, date, type, name, qty, gross, shipping, tax, fee, net, country,
// discounted, contribution, refund, buyerId }. Buyer identity is turned into an
// anonymous number at parse and the text is dropped.
export function normalizeRows(table) {
  const empty = { members: [], skipped: [], columns: {}, dmy: false, currency: null, otherCurrencies: [] };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.date !== undefined && (c.net !== undefined || c.subTotal !== undefined || c.itemPrice !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected the Bandcamp sales report columns, such as “date”, “item type”, “item name”, “quantity”, “item price”, “sub total”, “shipping”, “transaction fee” and “net amount”. Export from Bandcamp (Sales report, Download) or make a sheet with those headers." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const rowsIn = [];
  const skipped = [];
  const cur = new Map();
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const date = parseWhen(get(line, "date"), dmy);
    if (date === null) { skipped.push({ line: lineNo, reason: get(line, "date") ? "unreadable date" : "empty row" }); continue; }
    const num = (f) => parseNumber(get(line, f));
    const nums = { gross: null, shipping: num("shipping"), sellerTax: num("sellerTax"), marketplaceTax: num("marketplaceTax"), fee: num("fee"), net: cols.net === undefined ? null : num("net"), contribution: num("contribution") };
    const qtyRaw = get(line, "quantity");
    const qty = qtyRaw === "" ? 1 : parseNumber(qtyRaw);
    const price = cols.itemPrice === undefined ? null : num("itemPrice");
    const sub = cols.subTotal === undefined ? null : num("subTotal");
    if ([nums.shipping, nums.sellerTax, nums.marketplaceTax, nums.fee, nums.contribution, qty, price, sub, nums.net].some((x) => Number.isNaN(x))) { skipped.push({ line: lineNo, reason: "a money or quantity cell is not a number" }); continue; }
    const gross = sub !== null && (sub !== 0 || price === null) ? sub : (price ?? 0) * qty;
    const shipping = nums.shipping, tax = nums.sellerTax + nums.marketplaceTax, fee = Math.abs(nums.fee);
    const net = nums.net !== null && (nums.net !== 0 || gross === 0) ? nums.net : gross + shipping - fee;
    const currency = get(line, "currency").toUpperCase() || "?";
    const typeText = get(line, "itemType") + " " + get(line, "itemName");
    rowsIn.push({
      line: lineNo, date, type: classifyItem(get(line, "itemType")) === "none" ? classifyItem(typeText) : classifyItem(get(line, "itemType")),
      name: get(line, "itemName") || "(unnamed)", qty: qty || 1, gross, shipping, tax, fee, net, currency,
      country: get(line, "country"), discounted: get(line, "discount") !== "", contribution: nums.contribution,
      refund: isRefundText(get(line, "refund")) || gross < 0 || net < 0, buyerKey: get(line, "buyer").toLowerCase(),
    });
    cur.set(currency, (cur.get(currency) || 0) + 1);
  }
  const ranked = [...cur.entries()].sort((a, b) => b[1] - a[1]);
  const currency = ranked.length ? ranked[0][0] : null;
  const ids = new Map();
  const members = [];
  for (const r of rowsIn) {
    if (r.currency !== currency) { skipped.push({ line: r.line, reason: `in ${r.currency}, not ${currency}` }); continue; }
    let buyerId = -1;
    if (r.buyerKey) { if (!ids.has(r.buyerKey)) ids.set(r.buyerKey, ids.size); buyerId = ids.get(r.buyerKey); }
    const { buyerKey, ...rest } = r;
    members.push({ ...rest, buyerId });
  }
  return { members, skipped, columns: cols, dmy, currency, otherCurrencies: ranked.slice(1).map(([c, n]) => ({ currency: c, rows: n })) };
}

const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const monthKey = (t) => new Date(t).toISOString().slice(0, 7);

// Group sales (refund rows excluded) into a table with fee rate and net per unit.
function group(sales, keyOf) {
  const m = new Map();
  for (const s of sales) {
    const k = keyOf(s);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  }
  return [...m.entries()].map(([key, xs]) => {
    const gross = sum(xs, (x) => x.gross), shipping = sum(xs, (x) => x.shipping), fee = sum(xs, (x) => x.fee), net = sum(xs, (x) => x.net);
    const units = sum(xs, (x) => x.qty);
    return { key, sales: xs.length, units, gross, shipping, fee, net, feeRate: gross + shipping > 0 ? fee / (gross + shipping) : null, netPerUnit: units ? net / units : null, enough: xs.length >= MIN_GROUP };
  });
}

export function analyze(sales, opts = {}) {
  const a = { ...DEFAULT_ASSUMPTIONS };
  for (const k of Object.keys(a)) {
    if (opts[k] !== undefined && opts[k] !== "") {
      const v = Number(opts[k]);
      if (!Number.isFinite(v) || v < 0) return { invalid: `${k === "unitCost" ? "Unit cost" : "Postage"} must be a number, zero or more.` };
      a[k] = v;
    }
  }
  const refunds = sales.filter((s) => s.refund);
  const live = sales.filter((s) => !s.refund);
  const gross = sum(live, (s) => s.gross), shipping = sum(live, (s) => s.shipping), tax = sum(live, (s) => s.tax);
  const fee = sum(live, (s) => s.fee), net = sum(live, (s) => s.net), units = sum(live, (s) => s.qty);
  const refundNet = sum(refunds, (s) => s.net);
  const contribution = sum(live, (s) => s.contribution);
  const byType = group(live, (s) => s.type).sort((x, y) => y.net - x.net);
  const byItem = group(live, (s) => s.name).sort((x, y) => y.net - x.net);
  const byMonth = group(live, (s) => monthKey(s.date)).sort((x, y) => (x.key < y.key ? -1 : 1));
  const byCountry = group(live.filter((s) => s.country), (s) => s.country).sort((x, y) => y.net - x.net);
  const counted = live.filter((s) => s.buyerId >= 0);
  const perBuyer = new Map();
  for (const s of counted) perBuyer.set(s.buyerId, (perBuyer.get(s.buyerId) || 0) + 1);
  const buyers = perBuyer.size;
  const repeatBuyers = [...perBuyer.values()].filter((n) => n > 1).length;
  const micro = live.filter((s) => s.gross > 0 && s.gross / Math.max(1, s.qty) < MICRO_SALE);
  const microFee = sum(micro, (s) => s.fee), microGross = sum(micro, (s) => s.gross + s.shipping);
  const disc = live.filter((s) => s.discounted);
  const dates = sales.map((s) => s.date);
  const physical = live.filter((s) => s.type === "physical");
  const pUnits = sum(physical, (s) => s.qty), pNet = sum(physical, (s) => s.net), pShip = sum(physical, (s) => s.shipping);
  const pGross = sum(physical, (s) => s.gross), pFee = sum(physical, (s) => s.fee);
  const costs = a.unitCost * pUnits + a.postage * physical.length;
  const pFeeRate = pGross + pShip > 0 ? pFee / (pGross + pShip) : null;
  const breakEven = pUnits && pFeeRate !== null && pFeeRate < 1 ? (a.unitCost + (a.postage * physical.length - pShip) / pUnits) / (1 - pFeeRate) : null;
  const out = {
    summary: {
      sales: live.length, units, gross, shipping, tax, fee, net, refunds: refunds.length, refundNet, contribution,
      feeRate: gross + shipping > 0 ? fee / (gross + shipping) : null, netPerSale: live.length ? net / live.length : null,
      firstDate: dates.length ? Math.min(...dates) : null, lastDate: dates.length ? Math.max(...dates) : null,
      buyers, repeatBuyers, repeatShare: buyers ? repeatBuyers / buyers : null,
      discountedShare: live.length ? disc.length / live.length : null, discountedCount: disc.length,
    },
    byType, byItem, byMonth, byCountry,
    micro: { count: micro.length, fee: microFee, gross: microGross, feeRate: microGross > 0 ? microFee / microGross : null },
    physical: { sales: physical.length, units: pUnits, net: pNet, shippingCollected: pShip, feeRate: pFeeRate, costs, profit: pNet - costs, breakEven, unitCost: a.unitCost, postage: a.postage },
    assumptions: a,
  };
  out.reconciles = Math.abs(out.byType.reduce((t, g) => t + g.net, 0) - net) < 0.005;
  out.findings = findings(out);
  return out;
}

function findings(r) {
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const s = r.summary;
  const $ = money, p = (x) => (x === null ? "–" : (x * 100).toFixed(1) + "%");
  if (!s.sales) return [{ severity: "info", title: "No sales found", detail: "Every row was a refund or was skipped." }];
  add("info", `Fees took ${p(s.feeRate)} of what buyers paid`, `${$(s.fee)} in transaction fees on ${$(s.gross + s.shipping)} of sales and shipping, leaving ${$(s.net)} net. Sales tax collected for buyers (${$(s.tax)}) is not counted as yours.`);
  const m = r.micro;
  if (m.count >= MIN_GROUP && m.feeRate !== null && s.feeRate !== null && m.feeRate > s.feeRate * 1.25) add("high", `${m.count} sales under ${$(MICRO_SALE)} each lost ${p(m.feeRate)} to fees`, `The fixed part of the payment fee weighs most on small purchases. Across all sales fees are ${p(s.feeRate)}, but on these ${$(m.gross)} of small sales they were ${p(m.feeRate)} (${$(m.fee)}). A higher minimum price, or selling tracks inside an album, keeps more of each sale.`);
  const top = r.byItem[0];
  if (top && s.net > 0 && r.byItem.length > 1 && top.net / s.net > 0.5) add("medium", `${top.key} brings in ${p(top.net / s.net)} of your net`, "Most of the money rides on one release. Use it to point buyers at the rest of the catalogue, and treat a fall in its sales as the main risk.");
  const digital = r.byType.find((g) => g.key === "digital"), phys = r.byType.find((g) => g.key === "physical");
  if (digital && phys && digital.enough && phys.enough && digital.feeRate !== null && phys.feeRate !== null && Math.abs(digital.feeRate - phys.feeRate) > 0.03) add("info", `Digital fees ${p(digital.feeRate)}, physical fees ${p(phys.feeRate)}`, "The share Bandcamp and the payment processor keep differs by item type in your file. Compare the net per unit column, not the sticker price.");
  const ph = r.physical;
  if (ph.units >= MIN_GROUP && (ph.unitCost > 0 || ph.postage > 0)) {
    if (ph.profit < 0) add("high", `Physical items lose ${$(-ph.profit)} after the costs you entered`, `Net ${$(ph.net)} against ${$(ph.costs)} of unit cost and postage. The price that breaks even at the fee rate in your file is about ${$(ph.breakEven)} per unit.`);
    else add("info", `Physical items clear ${$(ph.profit)} after the costs you entered`, `Net ${$(ph.net)} less ${$(ph.costs)} of unit cost and postage. Break-even price at the fee rate in your file is about ${$(ph.breakEven)} per unit.`);
  } else if (ph.units >= MIN_GROUP) add("info", "Enter what a physical item costs you", "Add your unit cost and average postage below to see profit and a break-even price for vinyl, CDs and merch.");
  if (s.repeatShare !== null && s.buyers >= 20) add("info", `${p(s.repeatShare)} of buyers bought more than once`, `${s.repeatBuyers} of ${s.buyers} buyers appear in more than one sale. Buyers are counted by an anonymous number made while reading the file; no email or name is kept.`);
  if (s.discountedShare > 0.25 && s.discountedCount >= MIN_GROUP) add("medium", `${p(s.discountedShare)} of sales used a discount code`, "Codes cut the price on a large share of sales. Check whether they bring in buyers who would not have paid full price.");
  if (s.refunds) add("medium", `${s.refunds} refund row(s) worth ${$(s.refundNet)}`, "Refunds are left out of the totals above and shown here so they are not hidden.");
  if (s.contribution > 0) add("info", `Fans paid ${$(s.contribution)} above the asking price`, "Name-your-price contributions are already inside the net figure; this is the part above the minimum.");
  return out;
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) && n !== null ? (n * 100).toFixed(1) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Synthetic sales for the "Load an example" button: not a real artist.
export function sampleCsv() {
  const lines = ["date,item type,item name,quantity,item price,discount code,shipping,currency,sub total,seller tax,marketplace tax,transaction fee,net amount,country,buyer email"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const start = Date.UTC(2026, 0, 1);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const items = [
    ["album", "Night Bus (digital album)", 8, 0.55], ["track", "Night Bus (single track)", 1, 0.2],
    ["vinyl", "Night Bus LP", 24, 0.12], ["merch", "Tour shirt", 20, 0.08], ["album", "Early demos (digital album)", 5, 0.05],
  ];
  const countries = ["United States", "United Kingdom", "Germany", "Canada", "Australia"];
  const r2 = (x) => Math.round(x * 100) / 100;
  for (let i = 0; i < 320; i++) {
    let pick = rnd(), it = items[0];
    for (const x of items) { if (pick < x[3]) { it = x; break; } pick -= x[3]; }
    const physical = it[0] === "vinyl" || it[0] === "merch";
    const qty = physical && rnd() < 0.15 ? 2 : 1;
    const code = rnd() < 0.12 ? "FRIEND" : "";
    const price = r2(it[2] * (code ? 0.8 : 1) * (it[0] === "album" && rnd() < 0.3 ? 1.5 : 1));
    const gross = r2(price * qty);
    const shipping = physical ? 5 : 0;
    const fee = r2((gross + shipping) * (physical ? 0.1 : 0.15) + (gross + shipping) * 0.029 + 0.3);
    const net = r2(gross + shipping - fee);
    const day = start + Math.floor(rnd() * 240) * DAY;
    lines.push([iso(day), it[0], `"${it[1]}"`, qty, price.toFixed(2), code, shipping.toFixed(2), "USD", gross.toFixed(2), "0.00", "0.00", fee.toFixed(2), net.toFixed(2), countries[Math.floor(rnd() * countries.length)], `fan${Math.floor(rnd() * 240)}@example.org`].join(","));
  }
  return lines.join("\n") + "\n";
}
