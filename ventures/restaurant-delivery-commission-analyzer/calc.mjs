// Per-platform and per-order effective take rate, net cash and profit for a
// restaurant, from a DoorDash / Uber Eats / Grubhub merchant payout or
// order-level financial report CSV. Column names are matched by alias from
// memory of those exports; no real export was available when this was written.
// Pure functions, no DOM, no network.

const ALIASES = {
  id: ["order id", "doordash order id", "order number", "order #", "order no", "order_id", "uber order id", "order", "transaction id", "id", "delivery id"],
  platform: ["platform", "channel", "order source", "source", "marketplace", "app", "provider"],
  store: ["store name", "store", "location", "restaurant", "merchant store id"],
  when: ["timestamp local time", "order received local time", "order date", "order placed", "date", "transaction date", "created at", "order time", "timestamp", "order date/time", "date & time", "time", "timestamp utc time", "order accepted time", "payout date"],
  status: ["order status", "final order status", "status", "order state", "state", "transaction type"],
  gross: ["subtotal", "food sales", "sales (excl. tax)", "sales", "order subtotal", "food & beverage sales", "gross sales", "subtotal (excl. tax)", "food and beverage sales", "item subtotal", "food subtotal", "menu subtotal", "sales excl. tax", "gross"],
  commission: ["commission", "marketplace fee", "marketplace fees", "commission fee", "platform fee", "service commission", "commission (incl. tax)", "marketplace facilitator fee", "uber eats fee", "doordash commission", "commission rate fee"],
  delivery: ["delivery fee", "delivery fees", "service fee", "delivery commission", "processing fee", "merchant delivery fee", "delivery and service fees", "delivery fee (merchant)", "payment processing fee", "processing fees", "delivery charge", "merchant delivery charge", "small order fee"],
  marketing: ["marketing fees", "marketing fee", "promotions", "merchant funded promotions", "promotion", "promo", "promotions on items", "discount", "discounts", "offer", "offers", "merchant funded discount", "marketing", "promotion cost", "promotions on delivery", "marketing fees | (including any applicable taxes)"],
  ads: ["ads spend", "ad spend", "advertising", "ads", "sponsored listing", "ad fees", "advertising fees", "sponsored listings", "ads fee", "promoted listings"],
  errors: ["error charges", "error charge", "refunds", "customer refunds", "refund", "order refunds", "merchant error", "missing or incorrect items", "error adjustments", "refunds and errors", "order error charges", "error charges and refunds"],
  payout: ["net total", "net payout", "total payout", "merchant total", "payout", "net", "net sales", "total", "total payout (excl. tax)", "net earnings", "net payment", "deposit"],
};

const PLATFORMS = [
  { key: "doordash", label: "DoorDash", re: /door\s*dash|\bdd\b/i },
  { key: "ubereats", label: "Uber Eats", re: /uber/i },
  { key: "grubhub", label: "Grubhub", re: /grub\s*hub|seamless|\bgh\b/i },
];
export const PLATFORM_LABELS = { doordash: "DoorDash", ubereats: "Uber Eats", grubhub: "Grubhub", other: "Unlabelled platform" };
export const MIN_ORDERS = 5;

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

// "1,234.56", "$12", "(5.00)", "-5" and blanks (0). NaN only for non-numbers.
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

// Wall-clock timestamps only: the file's own clock is the driver's clock, so no
// time zone conversion is attempted. Returns { t (UTC ms of the wall clock),
// hasTime } or null. `dmy` is decided once per file (see detectDmy).
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


// Exact header match first, then the header with any "(…)" or "| …" tail cut
// off, so "Marketing fees | (including any applicable taxes)" still finds
// "marketing fees".
function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const short = norm.map((h) => h.replace(/\s*[|(].*$/, "").trim());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    outer: for (const pass of [norm, short]) {
      for (const n of names) {
        const at = pass.indexOf(n);
        if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break outer; }
      }
    }
  }
  return cols;
}

const DAY = 86400000;
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);

export function platformFromText(s) {
  const p = PLATFORMS.find((x) => x.re.test(String(s ?? "")));
  return p ? p.key : null;
}

// Returns { orders, skipped, cancelledCount, columns, dmy, platformSource, error }.
// An order is { line, id, platform, store, t, hasTime, hour, cancelled, gross,
// commission, delivery, marketing, ads, errors, payout }. Charges are read as
// positive costs whatever their sign in the file (exports show fees as
// negatives); payout is null when the file has no payout column.
// opts.platform: "auto" | "doordash" | "ubereats" | "grubhub" | "other".
// opts.hint: text (a file name) used to name the platform when auto finds none.
export function normalizeRows(table, { decimalComma = false, platform = "auto", hint = "" } = {}) {
  const empty = { orders: [], skipped: [], cancelledCount: 0, columns: {}, dmy: false, platformSource: "none" };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.when !== undefined && c.gross !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Timestamp local time” (or “Order date”) and “Subtotal” (or “Food sales”), plus ideally “Commission”, “Delivery fee”, “Marketing fees”, “Error charges” and “Net total”. Export the payout or order-level financial report from your DoorDash, Uber Eats or Grubhub merchant portal, or make a sheet with those headers." };
  const cols = findColumns(table[h]);
  const headerText = table[h].join(" ");
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "when")));
  let fileKey = null, platformSource = "none";
  if (platform && platform !== "auto") { fileKey = platform; platformSource = "chosen"; }
  else if (cols.platform !== undefined) platformSource = "column";
  else if (platformFromText(headerText)) { fileKey = platformFromText(headerText); platformSource = "header"; }
  else if (platformFromText(hint)) { fileKey = platformFromText(hint); platformSource = "filename"; }
  else if (cols.commission !== undefined && /marketplace fee/i.test(headerText)) { fileKey = "ubereats"; platformSource = "header"; }

  const orders = [], skipped = [];
  let cancelledCount = 0;
  const num = (line, f) => {
    if (cols[f] === undefined || isBlank(get(line, f))) return { v: null };
    const v = parseNumber(get(line, f), decimalComma);
    return Number.isFinite(v) ? { v } : { bad: true };
  };
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    if (line.every((x) => !String(x).trim())) continue;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first) && cols.when !== 0) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const when = parseWhen(get(line, "when"), dmy);
    if (!when) { skipped.push({ line: lineNo, reason: /^(total|totals|grand total|summary)\b/i.test(get(line, "when")) ? "total row" : "date not readable" }); continue; }
    const f = {};
    let bad = false;
    for (const k of ["gross", "commission", "delivery", "marketing", "ads", "errors", "payout"]) {
      const r = num(line, k);
      if (r.bad) { bad = true; break; }
      f[k] = r.v;
    }
    if (bad) { skipped.push({ line: lineNo, reason: "amount not a number" }); continue; }
    if (f.gross === null && f.commission === null && f.errors === null) { skipped.push({ line: lineNo, reason: "no amount" }); continue; }
    const status = get(line, "status");
    const cancelled = /cancel|declin|reject|expire|void|fail|refund(ed)?\b/i.test(status) && !/^\s*$/.test(status);
    if (cancelled) cancelledCount += 1;
    const rowKey = cols.platform !== undefined ? platformFromText(get(line, "platform")) : null;
    const key = rowKey || fileKey || "other";
    orders.push({
      line: lineNo, id: get(line, "id"), platform: key, store: get(line, "store"),
      t: when.t, hasTime: when.hasTime, hour: when.hasTime ? new Date(when.t).getUTCHours() : null, cancelled,
      gross: Math.abs(f.gross ?? 0), commission: Math.abs(f.commission ?? 0), delivery: Math.abs(f.delivery ?? 0),
      marketing: Math.abs(f.marketing ?? 0), ads: Math.abs(f.ads ?? 0), errors: Math.abs(f.errors ?? 0),
      payout: f.payout,
    });
  }
  if (!orders.length) return { ...empty, columns: cols, dmy, skipped, error: "No usable rows: every row was skipped." };
  return { orders, skipped, cancelledCount, columns: cols, dmy, platformSource };
}

export const DAYPARTS = [
  { key: "morning", label: "Morning (before 11:00)", from: 0, to: 11 },
  { key: "lunch", label: "Lunch (11:00-13:59)", from: 11, to: 14 },
  { key: "afternoon", label: "Afternoon (14:00-16:59)", from: 14, to: 17 },
  { key: "dinner", label: "Dinner (17:00-20:59)", from: 17, to: 21 },
  { key: "late", label: "Late (21:00 on)", from: 21, to: 25 },
];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function blank(key, label) {
  return { key, label, orders: 0, records: 0, gross: 0, commission: 0, delivery: 0, marketing: 0, ads: 0, errors: 0, charges: 0, net: 0, foodCost: 0, packaging: 0, netAfter: 0, payout: 0, payoutRows: 0, base: 0 };
}

function finish(b) {
  return {
    ...b,
    takeRate: b.gross > 0 ? b.charges / b.gross : null,
    netPerOrder: b.orders ? b.net / b.orders : null,
    netAfterPerOrder: b.orders ? b.netAfter / b.orders : null,
    avgTicket: b.orders ? b.gross / b.orders : null,
  };
}

// Menu-price markup (over the in-store price) at which a platform order earns
// the same dollars as selling the same food in-store: platform net, scaled up
// with the price, must cover the in-store price plus packaging. Charges are
// treated as proportional to price, which overstates the effect of flat
// charges and understates it for none; the page says so.
function markupNeeded(b, markupNow) {
  if (!(b.net > 0) || !b.orders) return null;
  const need = ((b.base + b.packaging) * (1 + markupNow)) / b.net - 1;
  return { total: need, extra: need - markupNow };
}

// opts: { foodPct (food cost as % of the in-store menu price), packaging (per
// order), markupNow (% your platform prices already sit above in-store),
// directPct, directFlat (own-ordering fee: percent of sales and cents-free
// flat per order), from, to (day timestamps) }.
// Net cash = food sales minus commission, delivery/service, marketing/promo,
// ad spend and error/refund charges. Net after costs also takes off food cost
// and packaging. Cancelled orders with no charges are dropped and counted;
// cancelled orders that carry a charge stay as cost with no food or packaging.
export function analyze(orders, opts = {}) {
  const foodPct = Number(opts.foodPct) || 0, packaging = Number(opts.packaging) || 0;
  const markupNow = (Number(opts.markupNow) || 0) / 100;
  const directPct = (opts.directPct === "" || opts.directPct == null ? 3 : Number(opts.directPct)) / 100;
  const directFlat = opts.directFlat === "" || opts.directFlat == null ? 0.3 : Number(opts.directFlat);
  if (foodPct < 0 || foodPct >= 100) return { invalid: "Food cost % must be at least 0 and under 100." };
  if (packaging < 0) return { invalid: "Packaging cost must be zero or more." };
  if (markupNow < 0) return { invalid: "Current markup must be zero or more." };
  if (directPct < 0 || directPct >= 1 || directFlat < 0) return { invalid: "Direct-order fee must be a percentage under 100 and a flat amount of zero or more." };
  const inRange = orders.filter((x) => (opts.from == null || x.t >= opts.from) && (opts.to == null || x.t < opts.to + DAY));
  if (!inRange.length) return { invalid: "No orders fall inside that date range." };
  let dropped = 0;
  const list = inRange.filter((x) => {
    const charged = x.commission + x.delivery + x.marketing + x.ads + x.errors;
    if (x.cancelled && !(x.gross > 0) && !(charged > 0)) { dropped += 1; return false; }
    return true;
  });
  if (!list.length) return { invalid: "Every order in that range was cancelled with no amounts." };

  const rows = [];
  const plats = new Map(), weekdays = new Map(), dayparts = new Map();
  const get = (map, key, label) => { if (!map.has(key)) map.set(key, blank(key, label)); return map.get(key); };
  const add = (b, r) => {
    b.records += 1; if (!r.cancelled) b.orders += 1;
    for (const k of ["gross", "commission", "delivery", "marketing", "ads", "errors", "charges", "net", "foodCost", "packaging", "netAfter", "base"]) b[k] += r[k];
    if (r.payout !== null) { b.payout += r.payout; b.payoutRows += 1; }
  };
  for (const x of list) {
    const rented = !x.cancelled;
    const charges = x.commission + x.delivery + x.marketing + x.ads + x.errors;
    const net = x.gross - charges;
    const base = rented ? x.gross / (1 + markupNow) : 0;
    const foodCost = base * (foodPct / 100);
    const pack = rented ? packaging : 0;
    const r = { ...x, charges, net, base, foodCost, packaging: pack, netAfter: net - foodCost - pack };
    r.takeRate = x.gross > 0 ? charges / x.gross : null;
    rows.push(r);
    add(get(plats, x.platform, PLATFORM_LABELS[x.platform] || x.platform), r);
    if (rented) {
      const d = new Date(x.t).getUTCDay();
      add(get(weekdays, d, WEEKDAYS[d]), r);
      if (x.hour !== null) { const dp = DAYPARTS.find((p) => x.hour >= p.from && x.hour < p.to); add(get(dayparts, dp.key, dp.label), r); }
    }
  }

  const directOf = (b) => {
    const dNet = b.gross * (1 - directPct) - directFlat * b.orders;
    const dAfter = dNet - b.foodCost - b.packaging;
    return { net: dNet, netAfter: dAfter, gain: dAfter - b.netAfter, gainPerOrder: b.orders ? (dAfter - b.netAfter) / b.orders : null, fee: b.gross * directPct + directFlat * b.orders };
  };
  const byPlatform = [...plats.values()].map((b) => ({ ...finish(b), markup: markupNeeded(b, markupNow), direct: directOf(b), payoutGap: b.payoutRows === b.records && b.records > 0 ? b.payout - b.net : null }))
    .sort((a, b) => b.gross - a.gross);
  const total = blank("all", "All platforms");
  for (const r of rows) add(total, r);
  const summary = {
    ...finish(total), markup: markupNeeded(total, markupNow), direct: directOf(total), platforms: byPlatform.length,
    cancelledDropped: dropped, cancelledKept: rows.filter((r) => r.cancelled).length,
    from: Math.floor(Math.min(...list.map((x) => x.t)) / DAY) * DAY, to: Math.floor(Math.max(...list.map((x) => x.t)) / DAY) * DAY,
    costsEntered: foodPct > 0 || packaging > 0,
    lossOrders: rows.filter((r) => !r.cancelled && r.netAfter < 0).length,
    payoutGap: total.payoutRows === total.records && total.records > 0 ? total.payout - total.net : null,
    payoutRows: total.payoutRows, foodPct, packaging, markupNow, directPct, directFlat,
  };

  const live = rows.filter((r) => !r.cancelled);
  const spendRows = live.filter((r) => r.marketing + r.ads > 0);
  const promo = (() => {
    const spend = spendRows.reduce((s, r) => s + r.marketing + r.ads, 0);
    if (!(spend > 0)) return null;
    const grossP = spendRows.reduce((s, r) => s + r.gross, 0);
    const afterP = spendRows.reduce((s, r) => s + r.netAfter, 0);
    const plain = live.filter((r) => r.marketing + r.ads === 0);
    const afterN = plain.reduce((s, r) => s + r.netAfter, 0);
    return {
      spend, marketing: spendRows.reduce((s, r) => s + r.marketing, 0), ads: spendRows.reduce((s, r) => s + r.ads, 0),
      orders: spendRows.length, plainOrders: plain.length, grossOnSpend: grossP,
      grossPerDollar: grossP / spend,
      // Profit those orders left before the spend, per $1 spent: under 1 means
      // the spend cost more than these orders earned even if every one was
      // incremental.
      profitBeforeSpendPerDollar: (afterP + spend) / spend,
      netAfterPerOrderWith: spendRows.length ? afterP / spendRows.length : null,
      netAfterPerOrderWithout: plain.length ? afterN / plain.length : null,
      avgTicketWith: spendRows.length ? grossP / spendRows.length : null,
      avgTicketWithout: plain.length ? plain.reduce((s, r) => s + r.gross, 0) / plain.length : null,
    };
  })();

  const byWeekday = [...weekdays.values()].map(finish).sort((a, b) => a.key - b.key);
  const byDaypart = DAYPARTS.map((p) => dayparts.get(p.key)).filter(Boolean).map(finish);
  const worstOrders = [...live].sort((a, b) => a.netAfter - b.netAfter).slice(0, 10);
  const lossList = live.filter((r) => r.netAfter < 0);
  const noTimes = !list.some((x) => x.hasTime);

  return {
    summary, byPlatform, byWeekday, byDaypart, promo, worstOrders, noTimes,
    lossOrders: { count: lossList.length, total: lossList.reduce((s, r) => s + r.netAfter, 0), gross: lossList.reduce((s, r) => s + r.gross, 0) },
    findings: findings({ summary, byPlatform, byWeekday, byDaypart, promo, noTimes, lossOrders: { count: lossList.length, total: lossList.reduce((t, r) => t + r.netAfter, 0), gross: lossList.reduce((t, r) => t + r.gross, 0) } }),
  };
}

const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
const p0 = (n) => (n * 100).toFixed(0) + "%";
const p1 = (n) => (n * 100).toFixed(1) + "%";

function findings({ summary: s, byPlatform, byWeekday, byDaypart, promo, noTimes, lossOrders }) {
  const out = [];
  if (!s.costsEntered) {
    out.push({ severity: "high", title: "No food cost or packaging entered, so net after costs is overstated", detail: "Net cash below is food sales minus the platform's charges only. Enter your food cost % and packaging cost per order in step 2 to see what each order really leaves you, and which ones lose money." });
  }
  if (s.gross > 0) {
    out.push({ severity: s.takeRate >= 0.3 ? "high" : "medium", title: `Platforms kept ${p1(s.takeRate)} of food sales in effective charges`, detail: `${usd(s.charges)} of ${usd(s.gross)}: commission ${usd(s.commission)}, delivery and service ${usd(s.delivery)}, marketing and promotions ${usd(s.marketing)}, ad spend ${usd(s.ads)}, error and refund charges ${usd(s.errors)}. That is the rate the file shows, not the headline commission on the plan.` });
  }
  const rated = byPlatform.filter((b) => b.takeRate !== null && b.orders >= MIN_ORDERS);
  if (rated.length >= 2) {
    const a = [...rated].sort((x, y) => y.takeRate - x.takeRate)[0], b = [...rated].sort((x, y) => x.takeRate - y.takeRate)[0];
    out.push({ severity: "info", title: `${a.label} cost ${p1(a.takeRate)} of sales; ${b.label} ${p1(b.takeRate)}`, detail: `On ${a.orders} and ${b.orders} orders. Net cash per order was ${usd(a.netPerOrder)} on ${a.label} against ${usd(b.netPerOrder)} on ${b.label}; average tickets differ (${usd(a.avgTicket)} and ${usd(b.avgTicket)}), so compare both columns.` });
  }
  if (s.costsEntered && s.lossOrders > 0) {
    out.push({ severity: "high", title: `${s.lossOrders} of ${s.orders} orders lost money after food cost and packaging`, detail: `Together ${usd(lossOrders.total)} on ${usd(lossOrders.gross)} of food sales. The worst ten are listed below. Small tickets with a flat delivery or error charge, and orders that carried a promotion, are the usual cause.` });
  } else if (s.costsEntered && s.orders) {
    out.push({ severity: "info", title: "No order lost money after food cost and packaging", detail: "That says nothing about labour, rent or the promotions not in this file." });
  }
  if (s.costsEntered && s.netAfter < 0) {
    out.push({ severity: "high", title: "Delivery lost money overall after food cost and packaging", detail: `Net after costs is ${usd(s.netAfter)} across ${s.orders} orders (${usd(s.netAfterPerOrder)} each), before any labour.` });
  }
  if (promo) {
    const bad = promo.profitBeforeSpendPerDollar < 1;
    out.push({ severity: bad ? "high" : "info", title: `Promotions and ads: ${usd(promo.spend)} spent on ${promo.orders} orders`, detail: `Those orders sold ${usd(promo.grossOnSpend)} (${usd(promo.grossPerDollar)} of food sales per $1 spent). ${s.costsEntered ? `Before the spend they left ${usd(promo.profitBeforeSpendPerDollar)} of profit per $1 spent, even if every one of them was an order you would not otherwise have had${bad ? "; the spend cost more than these orders earned" : ""}.` : "Enter food cost and packaging to see profit per $1 spent."} The file cannot show which orders were truly new customers.` });
  }
  const wd = byWeekday.filter((d) => d.orders >= MIN_ORDERS).sort((a, b) => b.netAfterPerOrder - a.netAfterPerOrder);
  if (wd.length >= 2) {
    const a = wd[0], b = wd[wd.length - 1];
    if (a.netAfterPerOrder - b.netAfterPerOrder >= 0.5) out.push({ severity: "info", title: `${a.label} orders left the most; ${b.label} the least`, detail: `${usd(a.netAfterPerOrder)} vs ${usd(b.netAfterPerOrder)} per order after platform charges${s.costsEntered ? ", food cost and packaging" : ""} (${a.orders} and ${b.orders} orders; days with under ${MIN_ORDERS} orders are ignored).` });
  }
  const dp = byDaypart.filter((d) => d.orders >= MIN_ORDERS).sort((a, b) => b.netAfterPerOrder - a.netAfterPerOrder);
  if (dp.length >= 2) {
    const a = dp[0], b = dp[dp.length - 1];
    if (a.netAfterPerOrder - b.netAfterPerOrder >= 0.5) out.push({ severity: "info", title: `${a.label.split(" (")[0]} orders left the most per order; ${b.label.split(" (")[0]} the least`, detail: `${usd(a.netAfterPerOrder)} vs ${usd(b.netAfterPerOrder)} per order (${a.orders} and ${b.orders} orders; dayparts under ${MIN_ORDERS} orders are ignored).` });
  }
  if (noTimes) out.push({ severity: "info", title: "No times of day in the file, so no daypart view", detail: "The date column has no clock time. Weekday findings still work." });
  if (s.markup && s.costsEntered) {
    out.push({ severity: "info", title: `To match in-store dollars per order, menu prices on delivery need to be about ${p0(s.markup.total)} above in-store`, detail: `You entered ${p0(s.markupNow)} now, so about ${p0(Math.max(0, s.markup.extra))} more. Same profit dollars per order as selling the same food in-store, treating charges as proportional to price. It assumes order volume does not fall when you raise prices.` });
  }
  if (s.direct && s.orders) {
    out.push({ severity: "info", title: `The same sales through your own ordering at ${p1(s.directPct)} + ${usd(s.directFlat)} per order`, detail: `Would leave ${usd(s.direct.netAfter)} after costs against ${usd(s.netAfter)} on the platforms: ${s.direct.gain >= 0 ? "+" : ""}${usd(s.direct.gain)} in total, about ${usd(s.direct.gain * 0.1)} for every 10% of these orders you move. It assumes your own site charges the same prices and that customers arrive without a platform's help; delivery labour or a driver fee on your own orders is not in it.` });
  }
  if (s.payoutGap !== null && s.gross > 0 && Math.abs(s.payoutGap) > Math.max(1, s.gross * 0.01)) {
    out.push({ severity: "medium", title: `The file's payout column differs from food sales minus charges by ${usd(s.payoutGap)}`, detail: "Usually sales tax, tips and adjustments that the export pays out or withholds but this tool does not read. Net cash here is computed from the charge columns only, so check it against your deposits." });
  }
  if (s.cancelledDropped || s.cancelledKept) {
    const n = s.cancelledDropped + s.cancelledKept;
    out.push({ severity: "info", title: `${n} cancelled order${n === 1 ? "" : "s"} found`, detail: `${s.cancelledDropped} with no amounts were left out. ${s.cancelledKept} that carried a charge stay in the totals with no food cost or packaging and are not counted as orders.` });
  }
  return out;
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Deterministic synthetic file for the "Load an example" button: three months of
// made-up orders on three platforms. Not real data.
export function sampleCsv() {
  const lines = ["Order ID,Platform,Order date,Status,Subtotal,Commission,Delivery fee,Marketing fees,Ad spend,Error charges,Net payout"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const plats = [
    { name: "DoorDash", n: 120, comm: 0.25, svc: 0.03, promo: 0.3, ads: 0.1 },
    { name: "Uber Eats", n: 90, comm: 0.3, svc: 0, promo: 0.15, ads: 0.2 },
    { name: "Grubhub", n: 50, comm: 0.2, svc: 0.03, promo: 0.05, ads: 0 },
  ];
  let id = 5100;
  for (const p of plats) {
    for (let i = 0; i < p.n; i++) {
      const d = new Date(Date.UTC(2026, 5, 1 + Math.floor(rnd() * 90), 11 + Math.floor(rnd() * 11), Math.floor(rnd() * 60)));
      const cancelled = rnd() < 0.04;
      const gross = cancelled ? 0 : Math.round((10 + rnd() * rnd() * 60) * 100) / 100;
      const commission = gross * p.comm, delivery = gross * p.svc;
      const marketing = rnd() < p.promo ? Math.round((2 + rnd() * 5) * 100) / 100 : 0;
      const ads = rnd() < p.ads ? Math.round((1 + rnd() * 2.5) * 100) / 100 : 0;
      const errors = rnd() < 0.05 ? Math.round((6 + rnd() * 20) * 100) / 100 : 0;
      const net = gross - commission - delivery - marketing - ads - errors;
      const f = (v) => v.toFixed(2);
      lines.push([`${p.name.slice(0, 2).toUpperCase()}${id++}`, p.name, d.toISOString().slice(0, 16).replace("T", " "), cancelled ? "Cancelled" : "Delivered", f(gross), f(-commission), f(-delivery), f(-marketing), f(-ads), f(-errors), f(net)].join(","));
    }
  }
  return lines.join("\n") + "\n";
}
