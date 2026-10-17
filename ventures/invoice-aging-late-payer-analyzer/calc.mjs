// Invoice aging and late-payer analysis for freelancers, agencies, trades and
// any small business that invoices on terms: reads an invoice export (QuickBooks,
// FreshBooks, Wave, Xero, Stripe Invoicing, Zoho, or your own sheet) and shows
// what is overdue, how old it is, how long each client really takes to pay,
// days sales outstanding, what waiting has cost, and when the open balance is
// likely to arrive. Column names are matched by alias because every tool names
// them differently; no real accounting export was available when this was
// written. Pure functions, no DOM, no network.

export const DEFAULT_TERMS_DAYS = 30;
export const DEFAULT_COST_OF_MONEY_PCT = 10;
export const DEFAULT_LATE_FEE_PCT = 1.5;
export const MIN_CLIENT_HISTORY = 3;

const ALIASES = {
  id: ["invoice number", "invoice no", "invoice #", "invoice num", "invoice id", "number", "doc number", "num", "no", "id", "reference"],
  client: ["customer name", "client name", "bill to", "customer", "client", "contact", "company", "organization", "organisation", "payer", "name"],
  issued: ["invoice date", "issue date", "date issued", "issued", "issued on", "created", "created at", "txn date", "date", "sent"],
  due: ["due date", "date due", "payment due", "due on", "due"],
  paid: ["paid date", "date paid", "payment date", "paid on", "fully paid date", "settled", "paid at", "paid"],
  amount: ["invoice total", "invoice amount", "total amount", "amount billed", "billed", "total", "amount", "gross", "invoiced"],
  balance: ["balance due", "amount due", "open balance", "outstanding", "amount outstanding", "balance", "remaining", "unpaid"],
  status: ["invoice status", "payment status", "status", "state"],
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

const DAY = 86400000;
const r2 = (n) => Math.round(n * 100) / 100;
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const days = (a, b) => Math.round((b - a) / DAY);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

// What a status cell says about an invoice. "void" invoices (draft, cancelled,
// written off, credited) are excluded from every figure; "paid" and "open" are
// resolved with the paid-date and balance columns when the file has them.
export function classifyStatus(raw) {
  const s = norm(raw);
  if (!s) return "unknown";
  if (/void|cancel|draft|written.?off|write.?off|bad debt|uncollectible|deleted|credit(ed)? note|refund/.test(s)) return "void";
  if (/paid in full|\bpaid\b|settled|closed|complete|received|collected/.test(s) && !/unpaid|not paid|partial|part.?paid/.test(s)) return "paid";
  if (/unpaid|open|overdue|outstanding|sent|due|pending|partial|part.?paid|late|viewed|issued|not paid|awaiting/.test(s)) return "open";
  return "unknown";
}

// Returns { items, skipped, columns, dmy, error }. An item is
// { line, id, client, issued, due, dueDerived, paid, amount, balance, state }
// where state is "paid" | "open"; paid is a timestamp or null (paid, date unknown).
export function normalizeRows(table, { decimalComma = false, termsDays = DEFAULT_TERMS_DAYS } = {}) {
  const empty = { items: [], skipped: [], columns: {}, dmy: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.client !== undefined && c.issued !== undefined && c.amount !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Customer” (or “Client”), “Invoice Date” (or “Date”) and “Amount” (or “Total”), plus ideally “Due Date”, “Paid Date” or “Balance”, and “Status”. Export your invoice list from QuickBooks, FreshBooks, Wave, Xero or your own sheet with those headers." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dateCells = ["issued", "due", "paid"].flatMap((f) => table.slice(h + 1).map((l) => get(l, f)));
  const dmy = detectDmy(dateCells);
  if (cols.paid === undefined && cols.balance === undefined && cols.status === undefined) return { ...empty, columns: cols, dmy, error: "The file has no Paid Date, Balance or Status column, so there is no way to tell which invoices are still unpaid. Add one of them." };
  const items = [], skipped = [];
  let voided = 0;
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    if (line.every((x) => !String(x).trim())) continue;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const client = get(line, "client");
    if (!client) { skipped.push({ line: lineNo, reason: "no client" }); continue; }
    const issued = parseWhen(get(line, "issued"), dmy);
    if (!issued) { skipped.push({ line: lineNo, reason: "invoice date not readable" }); continue; }
    const amt = parseNumber(get(line, "amount"), decimalComma);
    if (!Number.isFinite(amt) || isBlank(get(line, "amount"))) { skipped.push({ line: lineNo, reason: "amount not readable" }); continue; }
    if (amt <= 0) { skipped.push({ line: lineNo, reason: "zero or negative amount (credit note)" }); continue; }
    const st = cols.status !== undefined ? classifyStatus(get(line, "status")) : "unknown";
    if (st === "void") { voided++; continue; }
    const dueRaw = get(line, "due");
    let due = isBlank(dueRaw) ? null : parseWhen(dueRaw, dmy);
    if (!isBlank(dueRaw) && !due) { skipped.push({ line: lineNo, reason: "due date not readable" }); continue; }
    const dueDerived = !due;
    if (!due) due = { t: issued.t + termsDays * DAY };
    const paidRaw = get(line, "paid");
    const paidWhen = isBlank(paidRaw) ? null : parseWhen(paidRaw, dmy);
    if (!isBlank(paidRaw) && !paidWhen && !/^(yes|y|true|paid)$/i.test(paidRaw)) { skipped.push({ line: lineNo, reason: "paid date not readable" }); continue; }
    const balRaw = get(line, "balance");
    const bal = isBlank(balRaw) ? null : parseNumber(balRaw, decimalComma);
    if (bal !== null && !Number.isFinite(bal)) { skipped.push({ line: lineNo, reason: "balance not readable" }); continue; }
    // Resolve paid / open. A paid date wins; then a balance; then the status.
    let state, balance, paid = null;
    if (paidWhen) { state = "paid"; balance = 0; paid = paidWhen.t; }
    else if (bal !== null) { balance = Math.min(Math.max(bal, 0), amt); state = balance > 0 ? "open" : "paid"; }
    else if (st === "paid") { state = "paid"; balance = 0; }
    else if (st === "open") { state = "open"; balance = amt; }
    else if (cols.paid !== undefined) { state = "open"; balance = amt; }
    else { skipped.push({ line: lineNo, reason: "cannot tell if paid (no paid date, balance or recognised status)" }); continue; }
    if (state === "paid" && paid !== null && paid < issued.t) { skipped.push({ line: lineNo, reason: "paid before it was issued" }); continue; }
    items.push({ line: lineNo, id: get(line, "id"), client, issued: issued.t, due: due.t, dueDerived, paid, amount: r2(amt), balance: r2(balance), state });
  }
  if (!items.length) return { ...empty, skipped, columns: cols, dmy, voided, error: "No invoices could be read from the file. " + (skipped.length ? `${skipped.length} row(s) were skipped (first: line ${skipped[0].line}, ${skipped[0].reason}).` : "") };
  return { items, skipped, columns: cols, dmy, voided };
}

export const BUCKETS = [
  { key: "current", label: "Not yet due", min: -Infinity, max: 0 },
  { key: "d1_30", label: "1–30 days late", min: 1, max: 30 },
  { key: "d31_60", label: "31–60 days late", min: 31, max: 60 },
  { key: "d61_90", label: "61–90 days late", min: 61, max: 90 },
  { key: "d90", label: "Over 90 days late", min: 91, max: Infinity },
];
const bucketOf = (late) => BUCKETS.find((b) => late >= b.min && late <= b.max);

// items: normalizeRows(...).items. asOf is the date the export was taken (ms
// UTC, midnight). costOfMoneyPct is what a dollar tied up in unpaid invoices
// costs you per year (a credit line or card rate, or what you would earn on it);
// lateFeePct is a monthly fee for the "what a late fee would have been" line.
// Both are assumptions the page labels as such.
export function analyze(rawItems, { asOf, costOfMoneyPct = DEFAULT_COST_OF_MONEY_PCT, lateFeePct = DEFAULT_LATE_FEE_PCT, dsoWindow = 90 } = {}) {
  if (!Number.isFinite(asOf)) return { invalid: "Choose the date the export was taken." };
  const items = rawItems.filter((x) => x.issued <= asOf + DAY - 1);
  if (!items.length) return { invalid: "No invoices were issued on or before the as-of date." };
  const rate = Math.max(costOfMoneyPct, 0) / 100;
  const fee = Math.max(lateFeePct, 0) / 100;

  const paidInv = items.filter((x) => x.state === "paid" && x.paid !== null && x.paid <= asOf + DAY - 1);
  // A payment dated after the as-of date had not happened yet on that date.
  const open = items.map((x) => (x.state === "paid" && x.paid !== null && x.paid > asOf + DAY - 1 ? { ...x, state: "open", balance: x.amount, paid: null } : x)).filter((x) => x.state === "open");
  const paidNoDate = items.filter((x) => x.state === "paid" && x.paid === null);
  for (const x of paidInv) { x.toPay = days(x.issued, x.paid); x.lateBy = days(x.due, x.paid); }
  for (const x of open) { x.lateBy = days(x.due, asOf); }

  // Aging of the open balance. The buckets add up to the open total.
  const aging = BUCKETS.map((b) => {
    const list = open.filter((x) => bucketOf(x.lateBy) === b);
    return { ...b, count: list.length, balance: r2(list.reduce((s, x) => s + x.balance, 0)) };
  });
  const openTotal = r2(open.reduce((s, x) => s + x.balance, 0));
  const overdue = open.filter((x) => x.lateBy > 0);
  const overdueTotal = r2(overdue.reduce((s, x) => s + x.balance, 0));

  // DSO: open balance over what was billed in the trailing window, scaled to it.
  const winStart = asOf - dsoWindow * DAY;
  const billedWin = items.filter((x) => x.issued > winStart).reduce((s, x) => s + x.amount, 0);
  const dso = billedWin > 0 ? (openTotal / billedWin) * dsoWindow : null;

  // Per client.
  const byClientMap = new Map();
  for (const x of items) { const k = norm(x.client); (byClientMap.get(k) ?? byClientMap.set(k, { label: x.client, list: [] }).get(k)).list.push(x); }
  const clients = [...byClientMap.values()].map(({ label, list }) => {
    const paid = list.filter((x) => paidInv.includes(x));
    const opNow = open.filter((x) => norm(x.client) === norm(label));
    const toPay = paid.map((x) => x.toPay);
    const lateDays = paid.map((x) => Math.max(x.lateBy, 0));
    const lateShare = paid.length ? paid.filter((x) => x.lateBy > 0).length / paid.length : null;
    const sorted = [...paid].sort((a, b) => a.issued - b.issued);
    let trend = null;
    if (sorted.length >= 6) {
      const half = sorted.length >> 1;
      trend = median(sorted.slice(half).map((x) => x.toPay)) - median(sorted.slice(0, half).map((x) => x.toPay));
    }
    return {
      label, invoices: list.length, billed: r2(list.reduce((s, x) => s + x.amount, 0)), paidCount: paid.length,
      avgDaysToPay: mean(toPay), medianDaysToPay: median(toPay), avgDaysLate: mean(lateDays), lateShare, trend,
      openCount: opNow.length, openBalance: r2(opNow.reduce((s, x) => s + x.balance, 0)),
      overdueBalance: r2(opNow.filter((x) => x.lateBy > 0).reduce((s, x) => s + x.balance, 0)),
      worstLate: opNow.length ? Math.max(...opNow.map((x) => x.lateBy)) : null,
      // Dollar-days past due on paid invoices: how much waiting this client caused.
      lateDollarDays: paid.reduce((s, x) => s + Math.max(x.lateBy, 0) * x.amount, 0) + opNow.reduce((s, x) => s + Math.max(x.lateBy, 0) * x.balance, 0),
    };
  }).sort((a, b) => (b.openBalance - a.openBalance) || (b.billed - a.billed));

  // Cost of waiting: dollar-days beyond terms at the cost of money you typed.
  const lateDollarDays = clients.reduce((s, c) => s + c.lateDollarDays, 0);
  const costOfWaiting = (lateDollarDays / 365) * rate;
  const lateFeeWouldBe = (lateDollarDays / 30) * fee;

  // Expected arrival of the open balance: each invoice is expected when the
  // client's own median days-to-pay says (three paid invoices needed), else
  // when the whole book's median does; an invoice already past that date is
  // "overdue vs. your own history" and not forecast at all.
  const allMedian = median(paidInv.map((x) => x.toPay));
  const forecast = { d30: 0, d60: 0, later: 0, unforecast: 0, basis: allMedian };
  const chase = [];
  for (const x of open) {
    const c = clients.find((k) => norm(k.label) === norm(x.client));
    const own = c.paidCount >= MIN_CLIENT_HISTORY ? c.medianDaysToPay : null;
    const expectDays = own ?? allMedian;
    x.usual = expectDays;
    x.usualIsOwn = own !== null;
    x.age = days(x.issued, asOf);
    if (expectDays === null) { forecast.unforecast += x.balance; }
    else {
      const eta = days(asOf, x.issued + expectDays * DAY);
      x.eta = eta;
      if (eta < 0) { forecast.unforecast += x.balance; x.beyondUsual = true; }
      else if (eta <= 30) forecast.d30 += x.balance;
      else if (eta <= 60) forecast.d60 += x.balance;
      else forecast.later += x.balance;
    }
    if (x.lateBy > 0) chase.push(x);
  }
  for (const k of ["d30", "d60", "later", "unforecast"]) forecast[k] = r2(forecast[k]);
  chase.sort((a, b) => (b.balance * b.lateBy) - (a.balance * a.lateBy));
  const odds = paidInv.length >= 5 && open.length ? payOdds(paidInv, open) : null;

  // Findings.
  const findings = [];
  const q = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const over60 = open.filter((x) => x.lateBy > 60);
  if (over60.length) {
    const t = over60.reduce((s, x) => s + x.balance, 0);
    findings.push({ severity: "high", title: `${usd(t)} across ${q(over60.length, "invoice")} is more than 60 days past due`, detail: `${over60.slice(0, 5).map((x) => `${x.client}${x.id ? " #" + x.id : ""}: ${usd(x.balance)}, ${x.lateBy} days late`).join("; ")}${over60.length > 5 ? "; …" : ""}. The older a balance gets the less likely it is to be collected in full, and how you pursue it is a business and legal decision this tool does not make.` });
  }
  const conc = clients.filter((c) => c.openBalance > 0 && openTotal > 0 && c.openBalance / openTotal >= 0.4 && clients.length > 1);
  if (conc.length) findings.push({ severity: "medium", title: `${conc[0].label} holds ${(conc[0].openBalance / openTotal * 100).toFixed(0)}% of everything you are owed`, detail: `${usd(conc[0].openBalance)} of ${usd(openTotal)}. One client's slow month is your cash-flow problem.` });
  const slow = clients.filter((c) => c.paidCount >= MIN_CLIENT_HISTORY && c.lateShare >= 0.5 && c.avgDaysLate >= 10);
  if (slow.length) findings.push({ severity: "medium", title: `Habitually late payers: ${slow.map((c) => c.label).join(", ")}`, detail: slow.map((c) => `${c.label}: ${(c.lateShare * 100).toFixed(0)}% of ${c.paidCount} paid invoices came in after the due date, on average ${c.avgDaysLate.toFixed(0)} days late`).join("; ") + `. Options owners use on clients like this: shorter terms, a deposit or progress billing, an invoice reminder a few days before the due date, or a late fee if your agreement provides for one. Whether a fee is enforceable depends on your contract and local law.` });
  const worsening = clients.filter((c) => c.trend !== null && c.trend >= 10);
  if (worsening.length) findings.push({ severity: "medium", title: `Paying slower than they used to: ${worsening.map((c) => c.label).join(", ")}`, detail: worsening.map((c) => `${c.label}: the median wait on their latest invoices is ${c.trend.toFixed(0)} days longer than on their earlier ones`).join("; ") + ". A client that starts paying slower is sometimes the first sign of their own cash trouble." });
  const beyond = open.filter((x) => x.beyondUsual && x.lateBy > 0);
  if (beyond.length) findings.push({ severity: "medium", title: `${q(beyond.length, "invoice")} outstanding longer than that client normally takes`, detail: `${usd(beyond.reduce((s, x) => s + x.balance, 0))} where the wait already exceeds the client's own usual payment time (or, for clients with under ${MIN_CLIENT_HISTORY} paid invoices, your book's median of ${allMedian === null ? "n/a" : allMedian.toFixed(0) + " days"}). These are not being paid late by their standards; they are exceptions, and the first to follow up on.` });
  if (dso !== null) findings.push({ severity: "info", title: `Days sales outstanding: ${dso.toFixed(0)} days`, detail: `Open balance ${usd(openTotal)} against ${usd(billedWin)} billed in the last ${dsoWindow} days, scaled to ${dsoWindow} days. Compare it with your payment terms: a DSO well above terms means money is sitting in unpaid invoices.` });
  if (costOfWaiting >= 1) findings.push({ severity: "info", title: `Waiting past the due date has cost about ${usd(costOfWaiting)}`, detail: `${Math.round(lateDollarDays).toLocaleString("en-US")} dollar-days past the due date across paid and open invoices, at the ${(rate * 100).toFixed(1)}% a year you typed. A ${(fee * 100).toFixed(1)}%-a-month late fee on the same days would have come to ${usd(lateFeeWouldBe)}; that is an illustration, not a claim you could have charged or collected it.` });
  if (paidNoDate.length) findings.push({ severity: "info", title: `${q(paidNoDate.length, "paid invoice")} have no payment date`, detail: "They are left out of days-to-pay and client statistics because how long they took is unknown." });
  const derived = items.filter((x) => x.dueDerived).length;
  if (derived) findings.push({ severity: "info", title: `${derived} of ${items.length} invoices had no due date`, detail: "Their due date was taken as the invoice date plus the terms you set. If clients have different terms, add a Due Date column." });

  const paidToPay = paidInv.map((x) => x.toPay);
  return {
    aging, clients, chase, findings, forecast, odds,
    summary: {
      invoices: items.length, billed: r2(items.reduce((s, x) => s + x.amount, 0)), openCount: open.length, openTotal, overdueCount: overdue.length, overdueTotal,
      paidCount: paidInv.length, avgDaysToPay: mean(paidToPay), medianDaysToPay: median(paidToPay),
      avgDaysLate: mean(paidInv.map((x) => Math.max(x.lateBy, 0))), lateShare: paidInv.length ? paidInv.filter((x) => x.lateBy > 0).length / paidInv.length : null,
      dso, dsoWindow, costOfWaiting: r2(costOfWaiting), lateFeeWouldBe: r2(lateFeeWouldBe), asOf, first: Math.min(...items.map((x) => x.issued)),
      clients: clients.length, rate, fee,
    },
  };
}

// ---- Chance an open invoice is paid in the next H days --------------------
// Kaplan-Meier on the days-past-due clock: a paid invoice is an event at
// (paid - due), an open one is censored at (as-of - due). The pooled estimate
// is shrunk toward a stated prior and a client's own history is blended in by
// how much of it was still at risk. The estimate is scored on the owner's own
// paid invoices with a leave-one-out backtest, so the page can say whether the
// percentages beat a constant guess. Replaces "not forecast at all" for an
// invoice that is already past when its client normally pays.
export const ODDS_PRIOR_WEIGHT = 3; // invoices' worth of belief in the prior
export const ODDS_CLIENT_WEIGHT = 4; // invoices' worth of belief in the pooled estimate when blending

export function conditionalPay(obs, a, H) {
  const risk = obs.reduce((n, o) => n + (o.t >= a + 1 ? 1 : 0), 0);
  const times = [...new Set(obs.filter((o) => o.event && o.t > a && o.t <= a + H).map((o) => o.t))].sort((x, y) => x - y);
  let surv = 1;
  for (const t of times) {
    const n = obs.reduce((k, o) => k + (o.t >= t ? 1 : 0), 0);
    const d = obs.reduce((k, o) => k + (o.event && o.t === t ? 1 : 0), 0);
    if (n > 0) surv *= 1 - d / n;
  }
  return { p: 1 - surv, risk };
}

function oddsModel(obs, priorMonthly, H) {
  const prior = 1 - Math.pow(1 - priorMonthly, H / 30);
  const by = new Map();
  for (const o of obs) (by.get(o.client) ?? by.set(o.client, []).get(o.client)).push(o);
  return (client, age, exclude) => {
    const a = Math.max(0, age);
    const pool = exclude ? obs.filter((o) => o !== exclude) : obs;
    const pe = conditionalPay(pool, a, H);
    const pooled = (pe.risk * pe.p + ODDS_PRIOR_WEIGHT * prior) / (pe.risk + ODDS_PRIOR_WEIGHT);
    const own = (by.get(client) ?? []).filter((o) => o !== exclude);
    if (!own.some((o) => o.event)) return { p: pooled, ownRisk: 0 };
    const ce = conditionalPay(own, a, H);
    return { p: (ce.risk * ce.p + ODDS_CLIENT_WEIGHT * pooled) / (ce.risk + ODDS_CLIENT_WEIGHT), ownRisk: ce.risk };
  };
}

export function payOdds(paidInv, open, { horizon = 30, priorMonthly = 0.3 } = {}) {
  const obs = [
    ...paidInv.map((x) => ({ t: x.lateBy, event: true, client: norm(x.client) })),
    ...open.map((x) => ({ t: x.lateBy, event: false, client: norm(x.client), item: x })),
  ];
  const predict = oddsModel(obs, priorMonthly, horizon);
  for (const x of open) {
    const r = predict(norm(x.client), x.lateBy);
    x.payChance = r.p;
    x.payBasis = r.ownRisk >= MIN_CLIENT_HISTORY ? "client" : "book";
    x.atRisk = x.balance * (1 - r.p);
  }
  const expected = r2(open.reduce((s, x) => s + x.balance * x.payChance, 0));
  // Leave-one-out backtest: for each paid invoice still unpaid at 0, 15 and 30
  // days past due, hide it, predict, and compare with whether it was paid in time.
  const rows = [];
  for (const cp of [0, 15, 30]) {
    for (const o of obs) {
      if (o.event && o.t > cp) rows.push({ p: predict(o.client, cp, o).p, y: o.t <= cp + horizon ? 1 : 0 });
      else if (!o.event && o.t >= cp + horizon) rows.push({ p: predict(o.client, cp, o).p, y: 0 });
    }
  }
  let backtest = { n: rows.length, enough: false };
  if (rows.length >= 20) {
    const brier = rows.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / rows.length;
    const rate = rows.reduce((s, r) => s + r.y, 0) / rows.length;
    const baseline = rows.reduce((s, r) => s + (rate - r.y) ** 2, 0) / rows.length;
    const buckets = [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1.0001]].map(([lo, hi]) => {
      const m = rows.filter((r) => r.p >= lo && r.p < hi);
      return { lo, hi: Math.min(hi, 1), n: m.length, said: m.length ? m.reduce((s, r) => s + r.p, 0) / m.length : null, actual: m.length ? m.reduce((s, r) => s + r.y, 0) / m.length : null };
    });
    backtest = { n: rows.length, enough: true, brier, baseline, skill: baseline > 0 ? 1 - brier / baseline : 0, buckets };
  }
  return { horizon, expected, atRisk: r2(open.reduce((s, x) => s + x.atRisk, 0)), backtest };
}


export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Plain text for pasting into a note, an email to a bookkeeper or a forum post.
export function summaryText(r) {
  const s = r.summary;
  const m = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US") : "n/a");
  const lines = [
    `Receivables as of ${dateStr(s.asOf)}: ${m(s.openTotal)} open on ${s.openCount} invoice(s), ${m(s.overdueTotal)} overdue on ${s.overdueCount}`,
    `${s.paidCount} paid invoice(s) took ${s.medianDaysToPay === null ? "n/a" : s.medianDaysToPay.toFixed(0)} days median to pay` + (s.lateShare === null ? "" : `, ${pct(s.lateShare)} after the due date`) + (s.dso === null ? "" : `; DSO ${s.dso.toFixed(0)} days`),
  ];
  for (const b of r.aging) if (b.count) lines.push(`  ${b.label}: ${m(b.balance)} (${b.count})`);
  for (const c of r.clients.filter((k) => k.openBalance > 0).slice(0, 5)) lines.push(`  ${c.label}: owes ${m(c.openBalance)}${c.overdueBalance ? `, ${m(c.overdueBalance)} overdue` : ""}${c.medianDaysToPay !== null ? `, usually pays in ${c.medianDaysToPay.toFixed(0)} days` : ""}`);
  lines.push(`Expected in the next 30 days from client history: ${m(r.forecast.d30)}; ${m(r.forecast.unforecast)} is already past when that client normally pays`);
  lines.push("Made with the Invoice Aging & Late Payer Analyzer (nothing uploaded). Estimates from the file supplied.");
  return lines.join("\n");
}

// Synthetic, invented invoices for the "Load an example" button. Not a real business.
export function sampleCsv(asOf = Date.UTC(2026, 8, 28)) {
  const lines = ["Invoice Number,Customer,Invoice Date,Due Date,Amount,Paid Date,Balance"];
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const clients = [
    { name: "Northside Dental", pay: [24, 32], amt: [1200, 2400] },
    { name: "Bright Path Co", pay: [45, 70], amt: [2500, 6000] },
    { name: "Harbor Realty", pay: [28, 40], amt: [800, 1800] },
    { name: "Lumen Studio", pay: [60, 95], amt: [3000, 9000] },
    { name: "Oak & Pine Cafe", pay: [14, 28], amt: [400, 900] },
  ];
  let n = 1;
  for (let i = 0; i < 60; i++) {
    const c = clients[i % clients.length];
    const issued = asOf - (200 - i * 3 - (i % 4)) * DAY;
    const due = issued + 30 * DAY;
    const amt = Math.round(c.amt[0] + rnd() * (c.amt[1] - c.amt[0]));
    const took = Math.round(c.pay[0] + rnd() * (c.pay[1] - c.pay[0]));
    const paid = issued + took * DAY;
    const isPaid = paid <= asOf - DAY;
    lines.push([`INV-${1000 + n++}`, c.name, dateStr(issued), dateStr(due), amt.toFixed(2), isPaid ? dateStr(paid) : "", isPaid ? "0.00" : amt.toFixed(2)].join(","));
  }
  return lines.join("\n");
}
