// Freelancer Desk maths. Read-only over the data Estimate Maker, Time Tracker,
// Invoice Maker and Expense Tracker keep in this browser. Whole cents, pure
// functions, no DOM, no network. Each reader tolerates a missing or damaged
// store, because a visitor may have used only one of the four tools.

export const STORES = {
  estimates: { key: "estimate-maker-data", array: "estimates", label: "Estimate Maker", path: "../estimate-maker/" },
  time: { key: "time-tracker-data", array: "entries", label: "Time Tracker", path: "../time-tracker/" },
  invoices: { key: "invoice-maker-data", array: "invoices", label: "Invoice Maker", path: "../invoice-maker/" },
  expenses: { key: "expense-tracker-data", array: "entries", label: "Expense Tracker", path: "../expense-tracker/" },
};

export function toCents(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9)) : 0;
}
const pctOf = (cents, pct) => { const raw = (cents * (Number(pct) || 0)) / 100; return Math.sign(raw) * Math.round(Math.abs(raw) + 1e-9); };

export function formatMoney(cents, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100); } catch { return ((cents || 0) / 100).toFixed(2); }
}

export function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}
export const isoDate = (d) => d.toISOString().slice(0, 10);
export function daysBetween(a, b) {
  const x = parseDate(a), y = parseDate(b);
  return x && y ? Math.round((y - x) / 86400000) : 0;
}

// ---- readers ----------------------------------------------------------
// Parse the raw localStorage text of one tool; null when absent or unusable.
export function readStore(name, text) {
  const s = STORES[name];
  if (!s) return null;
  try {
    const d = JSON.parse(text || "null");
    return d && typeof d === "object" && Array.isArray(d[s.array]) ? d : null;
  } catch { return null; }
}

// ---- invoices ---------------------------------------------------------
export function invoiceTotals(inv) {
  const lines = (inv.lines || []).map((l) => { const q = Number(l.qty), r = toCents(l.rate); return Number.isFinite(q) ? Math.round(q * r + (q * r < 0 ? -1e-9 : 1e-9)) : 0; });
  const subtotal = lines.reduce((a, b) => a + b, 0);
  let discount = 0;
  if (inv.discountType === "percent") discount = pctOf(subtotal, inv.discountValue);
  else if (inv.discountType === "amount") discount = Math.min(toCents(inv.discountValue), Math.max(subtotal, 0));
  discount = Math.min(discount, Math.max(subtotal, 0));
  const taxableLines = (inv.lines || []).reduce((a, l, i) => a + (l.taxable !== false ? lines[i] : 0), 0);
  const base = subtotal > 0 ? Math.max(0, taxableLines - Math.round((discount * taxableLines) / subtotal)) : 0;
  const total = subtotal - discount + pctOf(base, inv.taxRate) + toCents(inv.shipping);
  const paid = Math.max(0, toCents(inv.paid));
  return { revenue: subtotal - discount, total, paid, balance: total - paid };
}

export function invoiceStatus(inv, today) {
  const t = invoiceTotals(inv);
  if (inv.void) return "void";
  if (t.total > 0 && t.balance <= 0) return "paid";
  if (inv.sent) {
    if (inv.due && today && inv.due < today) return "overdue";
    return t.paid > 0 ? "partial" : "sent";
  }
  return "draft";
}

// Money owed to you, aged from the due date, plus the invoices to chase first.
export function receivables(invoices, today) {
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  let outstanding = 0, overdue = 0, drafts = 0;
  const chase = [];
  for (const inv of invoices) {
    if (!inv || typeof inv !== "object") continue;
    const st = invoiceStatus(inv, today);
    if (st === "draft") { drafts += 1; continue; }
    if (st === "void" || st === "paid") continue;
    const t = invoiceTotals(inv);
    outstanding += t.balance;
    const late = Math.max(0, daysBetween(inv.due || inv.issued, today));
    buckets[late === 0 ? "current" : late <= 30 ? "d1_30" : late <= 60 ? "d31_60" : late <= 90 ? "d61_90" : "d90plus"] += t.balance;
    if (st === "overdue") { overdue += t.balance; chase.push({ number: inv.number || "(no number)", client: inv.clientName || "(no client)", balance: t.balance, daysLate: late }); }
  }
  chase.sort((a, b) => b.balance - a.balance);
  return { outstanding, overdue, buckets, drafts, chase };
}

// Cash-basis income for a year: the paid share of each non-void invoice issued
// in that year, scaled to leave out sales tax and shipping.
export function incomeFor(invoices, year) {
  let cents = 0, invoicedCents = 0, count = 0;
  for (const inv of invoices) {
    if (!inv || inv.void || !parseDate(inv.issued) || Number(inv.issued.slice(0, 4)) !== year) continue;
    const t = invoiceTotals(inv);
    if (inv.sent || t.paid > 0) invoicedCents += t.revenue;
    if (t.paid > 0 && t.total > 0) { cents += Math.round((Math.min(t.paid, t.total) * t.revenue) / t.total); count += 1; }
  }
  return { cents, invoicedCents, count };
}

// ---- estimates --------------------------------------------------------
function estimateOptionTotal(est, option) {
  const all = (option.lines || []).filter((l) => !l.optional).map((l) => ({ ...l, amount: Math.round(Number(l.qty) * toCents(l.rate) + 1e-9) || 0 }));
  const subtotal = all.reduce((s, l) => s + l.amount, 0);
  let discount = 0;
  if (est.discountType === "percent") discount = pctOf(subtotal, est.discountValue);
  else if (est.discountType === "amount") discount = toCents(est.discountValue);
  discount = Math.min(discount, Math.max(subtotal, 0));
  const taxable = all.filter((l) => l.taxable !== false).reduce((s, l) => s + l.amount, 0);
  const base = subtotal > 0 ? Math.max(0, taxable - Math.round((discount * taxable) / subtotal)) : 0;
  return subtotal - discount + pctOf(base, est.taxRate);
}

export function estimateStatus(est, today) {
  if (est.outcome === "accepted") return "accepted";
  if (est.outcome === "declined") return "declined";
  if (!est.sent) return "draft";
  if (est.validUntil && today && est.validUntil < today) return "expired";
  return "sent";
}

export function estimateValue(est) {
  const totals = (est.options || []).map((o) => estimateOptionTotal(est, o));
  if (!totals.length) return 0;
  if (est.outcome === "accepted" && Number.isInteger(est.acceptedOption) && totals[est.acceptedOption] !== undefined) return totals[est.acceptedOption];
  return Math.min(...totals);
}

export function pipeline(estimates, today, followUpDays = 3) {
  let open = 0, openValue = 0, accepted = 0, decided = 0;
  const followUp = [];
  for (const e of estimates) {
    if (!e || typeof e !== "object") continue;
    const st = estimateStatus(e, today);
    if (st === "draft") continue;
    if (st === "accepted") { accepted += 1; decided += 1; }
    else if (st === "declined" || st === "expired") decided += 1;
    else {
      const v = estimateValue(e);
      open += 1; openValue += v;
      const age = daysBetween(e.sentOn || e.issued, today);
      if (age >= followUpDays) followUp.push({ number: e.number || "(no number)", client: e.clientName || "(no client)", value: v, days: age });
    }
  }
  followUp.sort((a, b) => b.value - a.value);
  return { open, openValue, winRate: decided ? accepted / decided : null, decided, followUp };
}

// ---- time -------------------------------------------------------------
const STEP = { none: 0, "6": 6, "15": 15, "30": 30, "60": 60 };
function entrySeconds(e, now) {
  if (Number.isFinite(e.manualSec)) return Math.max(0, Math.round(e.manualSec));
  if (!Number.isFinite(e.start)) return 0;
  return Math.max(0, Math.round(((Number.isFinite(e.end) ? e.end : now) - e.start) / 1000));
}
function billableSeconds(sec, rounding) {
  const step = (STEP[rounding] || 0) * 60;
  return !step || sec <= 0 ? Math.max(0, sec) : Math.ceil(sec / step) * step;
}
function projectOf(e, projects) {
  return projects.find((x) => x && ((e.projectId && x.id === e.projectId) || (e.project && x.name === e.project)));
}
function entryRate(e, projects, defaultRate) {
  const own = toCents(e.rate);
  if (own > 0) return own;
  const p = projectOf(e, projects);
  return (p && toCents(p.rate)) || Math.max(0, toCents(defaultRate));
}

// Unbilled billable time (value and hours), tracked hours this year, and the
// per-client split. A running timer counts up to `now`.
export function timeSummary(box, now, year) {
  const entries = (box && box.entries) || [], projects = (box && box.projects) || [], settings = (box && box.settings) || {};
  const byClient = {};
  let unbilled = 0, unbilledSec = 0, ytdSec = 0, runningCount = 0;
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const sec = entrySeconds(e, now);
    if (!Number.isFinite(e.end) && !Number.isFinite(e.manualSec) && Number.isFinite(e.start)) runningCount += 1;
    const started = Number.isFinite(e.start) ? new Date(e.start).getFullYear() : year;
    const p = projectOf(e, projects);
    const client = e.client || (p && p.client) || "(no client)";
    const row = byClient[client] || (byClient[client] = { unbilled: 0, unbilledSec: 0, ytdSec: 0 });
    if (started === year) { ytdSec += sec; row.ytdSec += sec; }
    if (e.billable === false || e.billed) continue;
    const bill = billableSeconds(sec, settings.rounding);
    const amt = Math.round((bill / 3600) * entryRate(e, projects, settings.defaultRate));
    unbilled += amt; unbilledSec += bill; row.unbilled += amt; row.unbilledSec += bill;
  }
  return { unbilled, unbilledHours: Math.round((unbilledSec / 36)) / 100, ytdHours: Math.round(ytdSec / 36) / 100, byClient, runningCount };
}

// ---- expenses ---------------------------------------------------------
const SHARE = { meals: 0.5, personal: 0 };
export function deductible(e) {
  const share = e.category in SHARE ? SHARE[e.category] : 1;
  const pct = Number(e.bizPct);
  const biz = Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 100;
  return Math.round(((Number(e.cents) || 0) * share * biz) / 100);
}
export function needsReceipt(e) { return !e.receipt && e.category !== "personal" && (Number(e.cents) || 0) >= 7500; }

export function expenseSummary(entries, year) {
  let deductibleTotal = 0, missingReceipts = 0, missingValue = 0;
  for (const e of entries) {
    if (!e || typeof e !== "object" || Number(String(e.date).slice(0, 4)) !== year) continue;
    deductibleTotal += deductible(e);
    if (needsReceipt(e)) { missingReceipts += 1; missingValue += Number(e.cents) || 0; }
  }
  return { deductible: deductibleTotal, missingReceipts, missingValue };
}

// ---- tax calendar -----------------------------------------------------
// Form 1040-ES dates: Apr 15, Jun 15, Sep 15 and Jan 15. A date on a weekend
// or holiday moves to the next business day; that shift is not modelled.
export function nextTaxDue(today) {
  const t = parseDate(today);
  if (!t) return null;
  const y = t.getUTCFullYear();
  for (const [iso, label] of [[`${y}-01-15`, `Q4 ${y - 1}`], [`${y}-04-15`, `Q1 ${y}`], [`${y}-06-15`, `Q2 ${y}`], [`${y}-09-15`, `Q3 ${y}`], [`${y + 1}-01-15`, `Q4 ${y}`]]) {
    if (iso >= today) return { date: iso, label, days: daysBetween(today, iso) };
  }
  return null;
}

export function setAside(net, ratePct) {
  const r = Number(ratePct);
  return net > 0 && Number.isFinite(r) && r > 0 ? Math.round((net * Math.min(r, 70)) / 100 + 1e-9) : 0;
}

// ---- the desk ---------------------------------------------------------
// `boxes` holds the parsed store (or null) for each of the four tools.
export function buildDesk(boxes, { today, now = Date.now(), ratePct = 25, taxPaid = 0 } = {}) {
  const year = Number(today.slice(0, 4));
  const present = Object.fromEntries(Object.keys(STORES).map((k) => [k, !!boxes[k]]));
  const invoices = (boxes.invoices && boxes.invoices.invoices) || [];
  const recv = receivables(invoices, today);
  const income = incomeFor(invoices, year);
  const time = timeSummary(boxes.time, now, year);
  const pipe = pipeline((boxes.estimates && boxes.estimates.estimates) || [], today);
  const exp = expenseSummary((boxes.expenses && boxes.expenses.entries) || [], year);
  const net = income.cents - exp.deductible;
  const aside = setAside(net, ratePct);
  const paid = Math.max(0, Math.round(taxPaid || 0));
  const due = nextTaxDue(today);

  const clients = {};
  const row = (name) => clients[name] || (clients[name] = { client: name, outstanding: 0, overdue: 0, unbilled: 0, hours: 0, billedYtd: 0 });
  for (const inv of invoices) {
    if (!inv || typeof inv !== "object") continue;
    const st = invoiceStatus(inv, today);
    const r = row(inv.clientName || "(no client)");
    const t = invoiceTotals(inv);
    if (st !== "draft" && st !== "void" && st !== "paid") { r.outstanding += t.balance; if (st === "overdue") r.overdue += t.balance; }
    if ((inv.sent || t.paid > 0) && !inv.void && String(inv.issued || "").slice(0, 4) === String(year)) r.billedYtd += t.revenue;
  }
  for (const [name, v] of Object.entries(time.byClient)) { const r = row(name); r.unbilled += v.unbilled; r.hours += v.ytdSec / 3600; }
  const clientRows = Object.values(clients)
    .map((c) => ({ ...c, hours: Math.round(c.hours * 100) / 100, effectiveRate: c.hours > 0 && c.billedYtd > 0 ? Math.round(c.billedYtd / c.hours) : null }))
    .filter((c) => c.outstanding || c.unbilled || c.billedYtd || c.hours)
    .sort((a, b) => b.outstanding + b.unbilled + b.billedYtd - (a.outstanding + a.unbilled + a.billedYtd));

  // Actions, biggest dollars first. Each says what to do and where.
  const actions = [];
  for (const c of recv.chase.slice(0, 5)) actions.push({ kind: "chase", value: c.balance, text: `Chase ${c.client}: ${c.number} is ${c.daysLate} day${c.daysLate === 1 ? "" : "s"} overdue`, tool: "invoices" });
  if (time.unbilled > 0) actions.push({ kind: "bill", value: time.unbilled, text: `Bill ${time.unbilledHours} unbilled hour${time.unbilledHours === 1 ? "" : "s"} you have already worked`, tool: "time" });
  for (const f of pipe.followUp.slice(0, 5)) actions.push({ kind: "follow", value: f.value, text: `Follow up ${f.client}: ${f.number} has been out ${f.days} day${f.days === 1 ? "" : "s"}`, tool: "estimates" });
  if (exp.missingReceipts > 0) actions.push({ kind: "receipt", value: exp.missingValue, text: `${exp.missingReceipts} expense${exp.missingReceipts === 1 ? "" : "s"} of $75 or more have no receipt kept`, tool: "expenses" });
  if (recv.drafts > 0) actions.push({ kind: "draft", value: 0, text: `${recv.drafts} draft invoice${recv.drafts === 1 ? "" : "s"} not yet sent`, tool: "invoices" });
  if (time.runningCount > 0) actions.push({ kind: "timer", value: 0, text: `${time.runningCount} timer${time.runningCount === 1 ? " is" : "s are"} still running`, tool: "time" });
  actions.sort((a, b) => b.value - a.value);

  return {
    year, present, receivables: recv, income, time, pipeline: pipe, expenses: exp,
    net, setAside: aside, taxPaid: paid, setAsideGap: aside - paid, nextTaxDue: due,
    // What lands if every open item pays: owed + unbilled + open estimates.
    atStake: recv.outstanding + time.unbilled + pipe.openValue,
    clients: clientRows, actions,
  };
}

// ---- backup of all four stores ---------------------------------------
export const BACKUP_KIND = "freelancer-desk-backup";

export function makeBackup(texts, stamp) {
  const stores = {};
  for (const name of Object.keys(STORES)) {
    const box = readStore(name, texts[name]);
    if (box) stores[name] = box;
  }
  return { kind: BACKUP_KIND, version: 1, saved: stamp, stores };
}

// Validate a parsed backup file; returns { ok, stores, problem }. Only the four
// known stores are accepted and each must have the shape its own tool reads.
export function checkBackup(obj) {
  if (!obj || obj.kind !== BACKUP_KIND || typeof obj.stores !== "object" || !obj.stores) return { ok: false, stores: {}, problem: "This is not a Freelancer Desk backup file." };
  const stores = {};
  for (const name of Object.keys(STORES)) {
    if (!(name in obj.stores)) continue;
    const box = readStore(name, JSON.stringify(obj.stores[name]));
    if (!box) return { ok: false, stores: {}, problem: `The ${STORES[name].label} data in this file is damaged.` };
    stores[name] = box;
  }
  return Object.keys(stores).length ? { ok: true, stores, problem: "" } : { ok: false, stores: {}, problem: "The backup holds no data." };
}

export function deskToCsv(desk) {
  const cell = (v) => { const s = String(v ?? ""); const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  const rows = [["client", "billed_ytd", "outstanding", "overdue", "unbilled", "hours_ytd", "effective_rate_per_hour"]];
  for (const c of desk.clients) rows.push([c.client, (c.billedYtd / 100).toFixed(2), (c.outstanding / 100).toFixed(2), (c.overdue / 100).toFixed(2), (c.unbilled / 100).toFixed(2), c.hours.toFixed(2), c.effectiveRate === null ? "" : (c.effectiveRate / 100).toFixed(2)]);
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
