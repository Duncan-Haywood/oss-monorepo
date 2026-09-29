// Fiverr seller earnings analysis from a revenue / earnings export CSV: the
// service fee actually observed, take-home per order, per-gig and per-buyer net
// revenue, repeat-buyer share, refunds and cancellations, withdrawal costs,
// funds still clearing, and the price needed for a target take-home. Column
// names are matched by alias; no real Fiverr export was available when this
// was written, so nothing here claims to know Fiverr's exact headers. Pure
// functions, no DOM, no network.

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


const ALIASES = {
  id: ["order id", "order number", "order #", "order", "id", "reference", "ref", "transaction id"],
  date: ["date", "order date", "transaction date", "completed date", "completion date", "date completed", "created", "created at", "cleared date", "delivery date", "day"],
  type: ["type", "transaction type", "activity", "activity type", "event", "entry type", "category", "transaction"],
  status: ["status", "order status", "state", "payment status"],
  desc: ["description", "details", "memo", "note", "notes"],
  gig: ["gig", "gig title", "gig name", "service", "gig / service", "item", "order title", "title", "gig id"],
  buyer: ["buyer", "buyer name", "buyer username", "customer", "client", "username", "from", "buyer / customer"],
  gross: ["amount", "order amount", "order value", "price", "order price", "sale", "sales", "gross", "gross amount", "gross revenue", "total", "order total", "buyer paid", "order revenue", "revenue"],
  fee: ["service fee", "fee", "fees", "fiverr fee", "fiverr service fee", "commission", "platform fee", "fiverr commission", "marketplace fee", "withdrawal fee"],
  net: ["net", "net amount", "net revenue", "earnings", "you earn", "seller earnings", "your earnings", "net earnings", "payout", "net income", "income", "revenue after fee"],
  hours: ["hours", "hours spent", "time spent (hours)", "hours worked"],
  currency: ["currency"],
};

export const MIN_REPEAT_ORDERS = 2;
export const DEFAULT_FEE_PCT = 20;
export const FEE_MODES = ["auto", "gross", "net"];

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

const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const key = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const MONTH_FMT = (t) => new Date(t).toISOString().slice(0, 7);

const RE_WITHDRAW = /withdraw|payout to|transfer to|paypal|bank transfer|payoneer|direct deposit|wire/i;
const RE_REFUND = /refund|chargeback|dispute|resolution|revoked|reversal|adjustment|penalty/i;
const RE_CANCEL = /cancel|declin|reject|expire|void/i;
const RE_TIP = /\btips?\b|gratuity/i;
const RE_PENDING = /pend|clearing|clearance|processing|escrow|\bhold\b|in progress|active|not yet|upcoming/i;

// Returns { rows, skipped, currency, columns, dmy, feeSource, error }.
// A row is { line, id, t (UTC ms or null), kind, pending, gig, buyer, gross,
// fee, net, hours, refundNet, refundGross, moved, moveFee } where kind is one of
// order, tip, refund, cancelled, withdrawal. Amounts are zero where they do not
// apply. feeMode: "auto" reads a fee column, else earnings vs amount, else
// applies feePct to whatever single amount there is; "gross" reads the amount
// column as before Fiverr's fee; "net" reads it as what you keep.
export function normalizeRows(table, { decimalComma = false, feeMode = "auto", feePct = DEFAULT_FEE_PCT } = {}) {
  const empty = { rows: [], skipped: [], currency: "", columns: {}, dmy: false, feeSource: "none" };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if ((c.gross !== undefined || c.net !== undefined) && (c.date !== undefined || c.type !== undefined || c.gig !== undefined || c.buyer !== undefined || c.status !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected an amount column such as “Amount” or “Earnings”, plus ideally “Date”, “Type”, “Status”, “Gig”, “Buyer” and “Service fee”. Copy the table from your Fiverr earnings or revenue page into a sheet with those headers, or export it as CSV." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const pctRaw = Math.min(Math.max(Number(feePct) || 0, 0), 99.99) / 100;
  const hasG = cols.gross !== undefined, hasN = cols.net !== undefined, hasF = cols.fee !== undefined;
  let feeSource;
  if (feeMode === "gross") feeSource = "percent";
  else if (feeMode === "net") feeSource = "grossup";
  else if (hasF && (hasG || hasN)) feeSource = "column";
  else if (hasG && hasN) feeSource = "difference";
  else if (hasG) feeSource = "percent";
  else feeSource = "grossup";

  const rows = [], skipped = [];
  let currency = "";
  const num = (line, f) => {
    if (cols[f] === undefined || isBlank(get(line, f))) return null;
    return parseNumber(get(line, f), decimalComma);
  };
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    if (line.every((x) => !String(x).trim())) continue;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary|balance)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    let when = null;
    if (cols.date !== undefined) {
      when = parseWhen(get(line, "date"), dmy);
      if (!when) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    }
    let g = num(line, "gross"), n = num(line, "net"), f = num(line, "fee");
    if ([g, n, f].some((v) => v !== null && Number.isNaN(v))) { skipped.push({ line: lineNo, reason: "amount not a number" }); continue; }
    if (g === null && n === null) { skipped.push({ line: lineNo, reason: "no amount" }); continue; }
    if (feeMode === "net" && n === null) { n = g; g = null; }
    const typeText = get(line, "type"), statusText = get(line, "status");
    const label = cols.type !== undefined ? typeText : `${typeText} ${get(line, "desc")}`;
    const negative = (n !== null ? n : g) < 0;
    let kind;
    if (RE_WITHDRAW.test(label)) kind = "withdrawal";
    else if (RE_REFUND.test(label)) kind = "refund";
    else if (RE_CANCEL.test(label) || RE_CANCEL.test(statusText)) kind = "cancelled";
    else if (RE_TIP.test(label)) kind = "tip";
    else if (negative) kind = "refund";
    else kind = "order";
    const cur = get(line, "currency");
    if (cur && !currency) currency = cur;
    const row = {
      line: lineNo, id: get(line, "id"), t: when ? when.t : null, kind,
      pending: (kind === "order" || kind === "tip") && RE_PENDING.test(statusText),
      gig: get(line, "gig").replace(/\s+/g, " ").trim(), buyer: get(line, "buyer").replace(/\s+/g, " ").trim(),
      gross: 0, fee: 0, net: 0, hours: null, refundGross: 0, refundNet: 0, moved: 0, moveFee: 0, moveFeeKnown: false,
    };
    if (cols.hours !== undefined && !isBlank(get(line, "hours"))) {
      const hv = parseNumber(get(line, "hours"), decimalComma);
      if (Number.isFinite(hv) && hv > 0) row.hours = hv;
    }
    if (kind === "order" || kind === "tip") {
      let gross, net;
      if (feeSource === "column") {
        const fa = Math.abs(f ?? 0);
        if (g !== null) { gross = g; net = n ?? g - fa; } else { net = n; gross = n + fa; }
      } else if (feeSource === "difference") {
        net = n ?? g; gross = g ?? n;
        if (gross < net) gross = net;
      } else if (feeSource === "percent") {
        gross = g ?? n; net = gross * (1 - pctRaw);
      } else {
        net = n ?? g; gross = net / (1 - pctRaw);
      }
      row.gross = gross; row.net = net; row.fee = gross - net;
    } else if (kind === "refund") {
      row.refundGross = Math.abs(g ?? n);
      row.refundNet = Math.abs(n ?? g);
    } else if (kind === "cancelled") {
      row.gross = Math.abs(g ?? n);
    } else {
      row.moved = Math.abs(n ?? g);
      if (f !== null) { row.moveFee = Math.abs(f); row.moveFeeKnown = true; }
      else if (g !== null && n !== null && Math.abs(g) > Math.abs(n)) { row.moveFee = Math.abs(g) - Math.abs(n); row.moveFeeKnown = true; }
    }
    rows.push(row);
  }
  if (!rows.length) return { ...empty, columns: cols, dmy, skipped, error: "No usable rows: every row was skipped." };
  return { rows, skipped, currency, columns: cols, dmy, feeSource, feePct: pctRaw * 100 };
}

// "Gig, hours per order" per line. Returns { list, bad }.
export function parseHoursList(text) {
  const list = [], bad = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const f = line.split(/[,\t;]/).map((x) => x.trim());
    if (f.length < 2) { bad.push({ line: i + 1, reason: "expected “gig, hours per order”" }); return; }
    const v = parseNumber(f[1]);
    if (!Number.isFinite(v) || v <= 0 || isBlank(f[1])) { bad.push({ line: i + 1, reason: "hours not a positive number" }); return; }
    list.push({ name: f[0], key: key(f[0]), hours: v });
  });
  return { list, bad };
}

function blank(k, label) {
  return { key: k, label, orders: 0, gross: 0, fee: 0, net: 0, refundNet: 0, cost: 0, hours: 0, hoursKnown: 0 };
}

const usd = (n) => (n < 0 ? "-" : "") + Math.abs(n).toFixed(2);
const p1 = (x) => (x * 100).toFixed(1) + "%";

// opts: { costPerOrder (your own cost per order: tools, revisions, ads),
// target (take-home wanted per order), targetHourly + hoursDefault (used to
// derive a target when target is blank), hoursDefault (hours per order for gigs
// with no hours in the file or list), hoursList (text), feePct (assumed fee for
// the break-even when the file shows none), from, to (day timestamps) }.
// Take-home = order and tip net, minus refunds, minus your per-order cost,
// minus withdrawal fees. Pending rows are included and shown separately.
export function analyze(rows, opts = {}) {
  const cost = Number(opts.costPerOrder) || 0;
  if (cost < 0) return { invalid: "Cost per order must be zero or more." };
  const dayMs = 86400000;
  const inRange = rows.filter((x) => x.t === null || ((opts.from == null || x.t >= opts.from) && (opts.to == null || x.t < opts.to + dayMs)));
  if (!inRange.length) return { invalid: "No rows fall inside that date range." };
  const revenue = inRange.filter((x) => x.kind === "order" || x.kind === "tip");
  if (!revenue.length) return { invalid: "No order or tip rows were found in that range, only refunds, cancellations or withdrawals." };
  const orders = revenue.filter((x) => x.kind === "order");
  const orderCount = orders.length;
  const hoursList = parseHoursList(opts.hoursList);
  const hoursDefault = Number(opts.hoursDefault) > 0 ? Number(opts.hoursDefault) : null;
  const refunds = inRange.filter((x) => x.kind === "refund");
  const cancelled = inRange.filter((x) => x.kind === "cancelled");
  const moves = inRange.filter((x) => x.kind === "withdrawal");
  const dated = inRange.filter((x) => x.t !== null).map((x) => x.t);

  const gigs = new Map(), buyers = new Map(), months = new Map();
  const grab = (map, k, label) => { if (!map.has(k)) map.set(k, blank(k, label)); return map.get(k); };
  const matchedHours = new Set();
  const hoursFor = (r) => {
    if (r.hours) return r.hours;
    const gk = key(r.gig);
    const hit = gk ? hoursList.list.find((x) => x.key === gk) || hoursList.list.find((x) => x.key && (gk.includes(x.key) || x.key.includes(gk))) : null;
    if (hit) { matchedHours.add(hit); return hit.hours; }
    return hoursDefault;
  };
  for (const r of revenue) {
    const isOrder = r.kind === "order";
    const label = r.gig || "All gigs";
    const g = grab(gigs, key(label) || "all gigs", label);
    if (isOrder) g.orders += 1;
    g.gross += r.gross; g.fee += r.fee; g.net += r.net;
    if (isOrder) {
      g.cost += cost;
      const hv = hoursFor(r);
      g.hours += hv || 0; g.hoursKnown += hv ? 1 : 0;
    }
    if (r.buyer && isOrder) {
      const b = grab(buyers, key(r.buyer), r.buyer);
      b.orders += 1; b.gross += r.gross; b.net += r.net;
    }
    if (r.t !== null) {
      const m = grab(months, MONTH_FMT(r.t), MONTH_FMT(r.t));
      if (isOrder) m.orders += 1;
      m.gross += r.gross; m.fee += r.fee; m.net += r.net;
    }
  }
  for (const r of refunds) {
    if (r.gig) grab(gigs, key(r.gig) || "all gigs", r.gig).refundNet += r.refundNet;
    if (r.t !== null) grab(months, MONTH_FMT(r.t), MONTH_FMT(r.t)).refundNet += r.refundNet;
  }

  const gross = revenue.reduce((s, r) => s + r.gross, 0);
  const fee = revenue.reduce((s, r) => s + r.fee, 0);
  const net = revenue.reduce((s, r) => s + r.net, 0);
  const refundNet = refunds.reduce((s, r) => s + r.refundNet, 0);
  const refundGross = refunds.reduce((s, r) => s + r.refundGross, 0);
  const orderCosts = cost * orderCount;
  const moveFees = moves.reduce((s, r) => s + r.moveFee, 0);
  const moved = moves.reduce((s, r) => s + r.moved, 0);
  const pendingRows = revenue.filter((r) => r.pending);
  const pendingNet = pendingRows.reduce((s, r) => s + r.net, 0);
  const pendingDates = pendingRows.filter((r) => r.t !== null).map((r) => r.t);
  const takeHome = net - refundNet - orderCosts - moveFees;
  const feeRate = gross > 0 ? fee / gross : null;

  const finishGig = (b) => {
    const takeHomeG = b.net - b.refundNet - b.cost;
    const hoursAll = b.orders > 0 && b.hoursKnown === b.orders && b.hours > 0;
    return { ...b, takeHome: takeHomeG, netPerOrder: b.orders ? b.net / b.orders : null, takeHomePerOrder: b.orders ? takeHomeG / b.orders : null, feeRate: b.gross > 0 ? b.fee / b.gross : null, hasHours: hoursAll, netPerHour: hoursAll ? takeHomeG / b.hours : null };
  };
  const byGig = [...gigs.values()].map(finishGig).sort((a, b) => b.takeHome - a.takeHome);
  const byBuyer = [...buyers.values()].sort((a, b) => b.net - a.net);
  const repeatList = byBuyer.filter((b) => b.orders >= MIN_REPEAT_ORDERS);
  const orderNetNamed = byBuyer.reduce((s, b) => s + b.net, 0);
  const repeat = byBuyer.length ? {
    buyers: byBuyer.length, repeatBuyers: repeatList.length, shareOfBuyers: repeatList.length / byBuyer.length,
    shareOfNet: orderNetNamed > 0 ? repeatList.reduce((s, b) => s + b.net, 0) / orderNetNamed : 0,
  } : null;
  const byMonth = [...months.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((m) => ({ ...m, takeHome: m.net - m.refundNet - cost * m.orders }));

  // Break-even: price P with fee rate r and refund share q leaves
  // P * (1 - r) * (1 - q) - cost = target.
  let target = Number(opts.target) > 0 ? Number(opts.target) : null;
  if (target === null && Number(opts.targetHourly) > 0 && hoursDefault) target = Number(opts.targetHourly) * hoursDefault;
  const assumed = Math.min(Math.max(Number(opts.feePct ?? DEFAULT_FEE_PCT) || 0, 0), 99) / 100;
  const feeUsed = feeRate !== null ? feeRate : assumed;
  const refundShare = net > 0 ? Math.min(refundNet / net, 0.9) : 0;
  const breakEven = target === null ? null : {
    target, feeRate: feeUsed, refundShare, cost,
    price: (target + cost) / (1 - feeUsed),
    priceWithRefunds: (target + cost) / ((1 - feeUsed) * (1 - refundShare)),
  };

  const summary = {
    orders: orderCount, tips: revenue.length - orderCount, gross, fee, net, feeRate,
    refunds: refunds.length, refundNet, refundGross, cancelled: cancelled.length,
    cancelledValue: cancelled.reduce((s, r) => s + r.gross, 0),
    withdrawals: moves.length, moved, moveFees, moveFeesKnown: moves.filter((m) => m.moveFeeKnown).length,
    pendingCount: pendingRows.length, pendingNet, oldestPending: pendingDates.length ? Math.min(...pendingDates) : null,
    clearedNet: net - pendingNet, orderCosts, takeHome,
    takeHomePerOrder: orderCount ? takeHome / orderCount : null,
    takeHomeShare: gross > 0 ? takeHome / gross : null,
    avgOrderGross: orderCount ? orders.reduce((s, r) => s + r.gross, 0) / orderCount : null,
    from: dated.length ? Math.min(...dated) : null, to: dated.length ? Math.max(...dated) : null,
    gigs: byGig.length, costEntered: cost > 0,
  };
  const unmatchedHours = hoursList.list.filter((x) => !matchedHours.has(x));
  return {
    summary, byGig, byBuyer: byBuyer.slice(0, 10), byMonth, repeat, breakEven,
    hoursBad: hoursList.bad, unmatchedHours,
    findings: findings({ summary, byGig, repeat, breakEven, hoursBad: hoursList.bad, unmatchedHours, hoursGiven: hoursList.list.length > 0 || hoursDefault !== null || revenue.some((r) => r.hours) }),
  };
}

function findings({ summary: s, byGig, repeat, breakEven, hoursBad, unmatchedHours, hoursGiven }) {
  const out = [];
  if (s.feeRate !== null) {
    const off = Math.abs(s.feeRate - DEFAULT_FEE_PCT / 100) >= 0.01;
    out.push({ severity: off ? "medium" : "info", title: `Fiverr kept ${p1(s.feeRate)} of order value in this file`, detail: `${usd(s.fee)} of ${usd(s.gross)} across ${s.orders} order${s.orders === 1 ? "" : "s"}${s.tips ? ` and ${s.tips} tip${s.tips === 1 ? "" : "s"}` : ""}; you kept ${usd(s.net)}.${off ? ` That is not the flat ${DEFAULT_FEE_PCT}% many sellers quote: the file may mix fee rules, include tips or adjustments, or the fee may have been assumed (see the note under the result).` : ""}` });
  }
  if (s.refunds || s.cancelled) {
    const share = s.net > 0 ? s.refundNet / s.net : 0;
    out.push({ severity: share >= 0.1 ? "high" : "info", title: `${s.refunds} refund or adjustment row${s.refunds === 1 ? "" : "s"} and ${s.cancelled} cancelled order${s.cancelled === 1 ? "" : "s"}`, detail: `Refund rows took ${usd(s.refundNet)} back, ${p1(share)} of the ${usd(s.net)} you earned. Cancelled orders (${usd(s.cancelledValue)} of order value) are left out of revenue.` });
  }
  if (s.withdrawals) {
    const share = s.net > 0 ? s.moveFees / s.net : 0;
    out.push({ severity: share >= 0.02 ? "medium" : "info", title: `${s.withdrawals} withdrawal${s.withdrawals === 1 ? "" : "s"} cost ${usd(s.moveFees)} to get paid`, detail: `${usd(s.moved)} moved out; ${s.moveFeesKnown} of ${s.withdrawals} row${s.withdrawals === 1 ? "" : "s"} showed a fee or an amount difference, and the rest are counted as zero. Currency conversion shows up only if the file states it as a fee or as a gap between the two amounts. Fewer, larger withdrawals usually cost less when a fee is flat.` });
  } else {
    out.push({ severity: "info", title: "No withdrawal rows in this file", detail: "Withdrawal, payout-method and currency-conversion costs are not counted. If your export lists withdrawals under a different type name, add the word “withdrawal” to the Type column." });
  }
  if (s.pendingCount) {
    out.push({ severity: "info", title: `${usd(s.pendingNet)} is still clearing`, detail: `${s.pendingCount} row${s.pendingCount === 1 ? "" : "s"} carry a pending, clearing or in-progress status${s.oldestPending !== null ? `, the oldest dated ${new Date(s.oldestPending).toISOString().slice(0, 10)}` : ""}. It is included in the totals above and shown as not yet available. The length of Fiverr's clearing period depends on your account, so check your own balance page.` });
  }
  if (repeat) {
    out.push({ severity: repeat.shareOfNet < 0.2 && repeat.buyers >= 5 ? "medium" : "info", title: `${repeat.repeatBuyers} of ${repeat.buyers} buyers ordered more than once, ${p1(repeat.shareOfNet)} of net order revenue`, detail: repeat.repeatBuyers ? `Repeat buyers are those with ${MIN_REPEAT_ORDERS} or more orders in the file. A low share means you are re-finding customers each month; a high one means a few buyers carry the income.` : "No buyer appears twice in this file. Only buyer names in the file are used." });
  }
  const topNet = byGig.reduce((m, g) => (g.net > m.net ? g : m), byGig[0]);
  if (topNet && byGig.length >= 2 && s.net > 0 && topNet.net / s.net >= 0.6) {
    out.push({ severity: "medium", title: `${topNet.label} brings ${p1(topNet.net / s.net)} of net revenue`, detail: "One gig carries most of the income. A ranking or policy change on that gig would move the whole account." });
  }
  const losing = byGig.filter((g) => g.takeHome < 0);
  if (losing.length) out.push({ severity: "high", title: `${losing.length} gig${losing.length === 1 ? "" : "s"} lost money after refunds and your per-order cost`, detail: losing.map((g) => `${g.label}: ${usd(g.takeHome)}`).join("; ") + "." });
  const ranked = byGig.filter((g) => g.netPerHour !== null);
  if (ranked.length >= 2) {
    const lo = [...ranked].sort((a, b) => a.netPerHour - b.netPerHour)[0], hi = [...ranked].sort((a, b) => b.netPerHour - a.netPerHour)[0];
    out.push({ severity: "medium", title: `${lo.label} has the lowest take-home per hour`, detail: `${usd(lo.netPerHour)} per hour (${lo.orders} orders, ${lo.hours.toFixed(1)} hours) against ${usd(hi.netPerHour)} for ${hi.label}. The hours are what you entered, not something Fiverr records.` });
  } else if (!hoursGiven) {
    out.push({ severity: "info", title: "No hours entered, so gigs are not ranked per hour", detail: "Enter hours per order for a gig, or one default for all gigs, in step 2 to see take-home per hour. The tool does not guess your time." });
  } else {
    out.push({ severity: "info", title: "Per-hour ranking needs hours for at least two gigs", detail: "Hours are missing for some gigs. Add a line per gig in the hours box, or set a default." });
  }
  if (!s.costEntered) out.push({ severity: "info", title: "No cost per order entered", detail: "Take-home counts Fiverr's fee, refunds and withdrawal costs only. Tools, revision time bought, ads and taxes are not included until you add a cost per order in step 2." });
  if (hoursBad.length) out.push({ severity: "medium", title: `${hoursBad.length} hours line${hoursBad.length === 1 ? "" : "s"} could not be read`, detail: hoursBad.map((b) => `line ${b.line}: ${b.reason}`).join("; ") + "." });
  if (unmatchedHours.length) out.push({ severity: "medium", title: `${unmatchedHours.length} hours line${unmatchedHours.length === 1 ? "" : "s"} matched no gig`, detail: `${unmatchedHours.map((f) => f.name).join(", ")}. Names must match the file's gig names or be contained in them.` });
  if (breakEven) {
    out.push({ severity: "info", title: `To take home ${usd(breakEven.target)} per order, price at about ${usd(breakEven.price)}`, detail: `Fee rate ${p1(breakEven.feeRate)}${breakEven.cost ? `, your cost ${usd(breakEven.cost)} per order` : ""}. Allowing for your refund rate of ${p1(breakEven.refundShare)}, about ${usd(breakEven.priceWithRefunds)}. Any buyer-side fee comes on top and is not part of what you keep.` });
  }
  return out;
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Deterministic synthetic file for the "Load an example" button: made-up gigs,
// buyers and amounts over four months. Not real data and not a Fiverr export.
export function sampleCsv() {
  const lines = ["Date,Order ID,Type,Status,Gig,Buyer,Amount,Service Fee,Net"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gigs = [
    { name: "Logo design", price: 90 },
    { name: "Blog post writing", price: 60 },
    { name: "Voice-over 60 seconds", price: 35 },
  ];
  const buyers = ["amy_k", "bruno77", "cafe_north", "dev_dana", "eli_r", "fresh_startup", "gina_p", "harbor_co"];
  let id = 1000;
  for (let day = 0; day < 120; day += 2 + Math.floor(rnd() * 4)) {
    const gig = gigs[Math.floor(rnd() * gigs.length)];
    const buyer = buyers[Math.floor(Math.pow(rnd(), 1.6) * buyers.length)];
    const d = new Date(Date.UTC(2026, 4, 1 + day));
    const date = d.toISOString().slice(0, 10);
    const amount = Math.round(gig.price * (0.8 + rnd() * 1.4));
    const oid = `FO${id++}`;
    const r = rnd();
    if (r < 0.06) { lines.push(`${date},${oid},Order,Cancelled,${gig.name},${buyer},${amount}.00,0.00,0.00`); continue; }
    const fee = amount * 0.2;
    const pending = day > 108;
    lines.push(`${date},${oid},Order,${pending ? "Pending clearance" : "Cleared"},${gig.name},${buyer},${amount}.00,${fee.toFixed(2)},${(amount - fee).toFixed(2)}`);
    if (r > 0.94) lines.push(`${date},${oid}-R,Refund,Completed,${gig.name},${buyer},-${amount}.00,-${fee.toFixed(2)},-${(amount - fee).toFixed(2)}`);
    else if (r > 0.8) lines.push(`${date},${oid}-T,Tip,Cleared,${gig.name},${buyer},10.00,2.00,8.00`);
  }
  lines.push("2026-06-15,W1,Withdrawal,Completed,,,300.00,1.00,299.00");
  lines.push("2026-08-15,W2,Withdrawal,Completed,,,250.00,1.00,249.00");
  return lines.join("\n") + "\n";
}
