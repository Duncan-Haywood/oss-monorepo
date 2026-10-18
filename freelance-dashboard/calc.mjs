// Freelance Dashboard maths. Read-only over the data the four sibling tools
// keep in this browser (Invoice Maker, Estimate Maker, Time Tracker, Expense
// Tracker). Money is whole cents. Each reader below mirrors the sibling's own
// arithmetic closely enough for a business overview; it never writes back.
// Self-contained on purpose: a sibling's change must not break this page.

export const STORES = {
  invoices: "invoice-maker-data",
  estimates: "estimate-maker-data",
  time: "time-tracker-data",
  expenses: "expense-tracker-data",
};

const ROUND_STEP = { none: 0, "6": 6, "15": 15, "30": 30, "60": 60 };

export function toCents(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9)) : 0;
}

export function formatMoney(cents, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);
  } catch {
    return ((cents || 0) / 100).toFixed(2);
  }
}

const pctOf = (cents, pct) => {
  const raw = (cents * (Number(pct) || 0)) / 100;
  return Math.sign(raw) * Math.round(Math.abs(raw) + 1e-9);
};

export function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

export function daysBetween(a, b) {
  const x = parseDate(a), y = parseDate(b);
  return x && y ? Math.round((y - x) / 86400000) : 0;
}

// ---- reading the stores ------------------------------------------------

function parseBox(text, field) {
  try {
    const d = JSON.parse(text || "null");
    return d && Array.isArray(d[field]) ? d : null;
  } catch {
    return null;
  }
}

// `getItem` is localStorage.getItem (or a stub). Anything absent or unreadable
// comes back as an empty list, so the page degrades per tool, not all at once.
export function readStores(getItem) {
  const get = (k) => { try { return getItem(k); } catch { return null; } };
  const inv = parseBox(get(STORES.invoices), "invoices");
  const est = parseBox(get(STORES.estimates), "estimates");
  const tim = parseBox(get(STORES.time), "entries");
  const exp = parseBox(get(STORES.expenses), "entries");
  return {
    found: { invoices: !!inv, estimates: !!est, time: !!tim, expenses: !!exp },
    invoices: inv ? inv.invoices.filter((i) => i && typeof i === "object") : [],
    estimates: est ? est.estimates.filter((e) => e && typeof e === "object") : [],
    time: tim ? { entries: tim.entries.filter((e) => e && typeof e === "object"), projects: Array.isArray(tim.projects) ? tim.projects : [], settings: tim.settings || {} } : { entries: [], projects: [], settings: {} },
    expenses: exp ? { entries: exp.entries.filter((e) => e && parseDate(e.date) && Number.isFinite(e.cents)), rate: exp.rate } : { entries: [], rate: null },
  };
}

// ---- invoices ----------------------------------------------------------

export function invoiceParts(inv) {
  const lines = (inv.lines || []).map((l) => {
    const q = Number(l.qty), r = toCents(l.rate);
    return Number.isFinite(q) ? Math.round(q * r + (q * r < 0 ? -1e-9 : 1e-9)) : 0;
  });
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
  if (inv.void) return "void";
  const p = invoiceParts(inv);
  if (p.total > 0 && p.balance <= 0) return "paid";
  if (inv.sent) return inv.due && today && inv.due < today ? "overdue" : p.paid > 0 ? "partial" : "sent";
  return "draft";
}

export function receivables(invoices, today) {
  const open = [];
  let outstanding = 0, overdue = 0;
  for (const inv of invoices) {
    const st = invoiceStatus(inv, today);
    if (st === "draft" || st === "void" || st === "paid") continue;
    const p = invoiceParts(inv);
    if (p.balance <= 0) continue;
    const late = Math.max(0, daysBetween(inv.due || inv.issued, today));
    outstanding += p.balance;
    if (st === "overdue") overdue += p.balance;
    open.push({ number: inv.number || "", client: inv.clientName || "(no client)", balance: p.balance, due: inv.due || "", daysLate: late, overdue: st === "overdue" });
  }
  open.sort((a, b) => b.daysLate - a.daysLate || b.balance - a.balance);
  return { outstanding, overdue, open };
}

// Income recognised in `year` on a paid basis (pre-sales-tax share of what was
// collected) alongside what was invoiced, by month of issue and by client.
export function incomeSummary(invoices, year) {
  const byMonth = Array(12).fill(0), byClient = {};
  let paid = 0, invoiced = 0;
  for (const inv of invoices) {
    if (inv.void || !parseDate(inv.issued) || Number(inv.issued.slice(0, 4)) !== year) continue;
    const p = invoiceParts(inv);
    const sent = inv.sent || p.paid > 0;
    if (sent) {
      invoiced += p.revenue;
      const c = inv.clientName || "(no client)";
      byClient[c] = (byClient[c] || 0) + p.revenue;
    }
    if (p.paid > 0 && p.total > 0) {
      const share = Math.round((Math.min(p.paid, p.total) * p.revenue) / p.total);
      paid += share;
      byMonth[Number(inv.issued.slice(5, 7)) - 1] += share;
    }
  }
  const clients = Object.entries(byClient).map(([client, cents]) => ({ client, cents })).sort((a, b) => b.cents - a.cents);
  const top = clients[0];
  return { paid, invoiced, byMonth, clients, topClient: top ? top.client : null, topShare: top && invoiced > 0 ? top.cents / invoiced : null };
}

// ---- estimates ---------------------------------------------------------

function optionTotal(est, option) {
  const base = (option.lines || []).filter((l) => !l.optional).map((l) => ({ ...l, amount: Math.round((Number(l.qty) || 0) * toCents(l.rate)) }));
  const subtotal = base.reduce((s, l) => s + l.amount, 0);
  let discount = 0;
  if (est.discountType === "percent") discount = pctOf(subtotal, est.discountValue);
  else if (est.discountType === "amount") discount = toCents(est.discountValue);
  discount = Math.min(discount, Math.max(subtotal, 0));
  const taxable = base.filter((l) => l.taxable !== false).reduce((s, l) => s + l.amount, 0);
  const tb = subtotal > 0 ? Math.max(0, taxable - Math.round((discount * taxable) / subtotal)) : 0;
  return subtotal - discount + pctOf(tb, est.taxRate);
}

export function estimateValue(est) {
  const totals = (est.options || []).map((o) => optionTotal(est, o));
  if (!totals.length) return 0;
  if (est.outcome === "accepted" && Number.isInteger(est.acceptedOption) && totals[est.acceptedOption] !== undefined) return totals[est.acceptedOption];
  return Math.min(...totals);
}

export function estimateStatus(est, today) {
  if (est.outcome === "accepted") return "accepted";
  if (est.outcome === "declined") return "declined";
  if (!est.sent) return "draft";
  if (est.validUntil && today && est.validUntil < today) return "expired";
  return "sent";
}

export function pipeline(estimates, today, followUpDays = 3) {
  let accepted = 0, declined = 0, expired = 0, open = 0, openValue = 0;
  const followUp = [];
  for (const e of estimates) {
    const st = estimateStatus(e, today);
    if (st === "draft") continue;
    if (st === "accepted") accepted++;
    else if (st === "declined") declined++;
    else if (st === "expired") expired++;
    else {
      open++;
      const v = estimateValue(e);
      openValue += v;
      const age = daysBetween(e.sentOn || e.issued, today);
      if (age >= followUpDays) followUp.push({ number: e.number || "", client: e.clientName || "(no client)", days: age, value: v });
    }
  }
  const decided = accepted + declined + expired;
  followUp.sort((a, b) => b.value - a.value);
  return { open, openValue, accepted, decided, winRate: decided ? accepted / decided : null, followUp };
}

// ---- time --------------------------------------------------------------

export function entrySeconds(e, now) {
  if (Number.isFinite(e.manualSec)) return Math.max(0, Math.round(e.manualSec));
  if (!Number.isFinite(e.start)) return 0;
  const end = Number.isFinite(e.end) ? e.end : now;
  return Math.max(0, Math.round((end - e.start) / 1000));
}

// An entry matches a project by id or by name, but only when it carries one:
// `undefined === undefined` would otherwise attach every project-less entry to
// the first project that lacks an id.
function projectOf(e, t) {
  return t.projects.find((x) => x && ((e.projectId && x.id === e.projectId) || (e.project && x.name === e.project)));
}

function entryCents(e, t, now) {
  if (e.billable === false) return 0;
  const step = (ROUND_STEP[t.settings.rounding] || 0) * 60;
  let sec = entrySeconds(e, now);
  if (step && sec > 0) sec = Math.ceil(sec / step) * step;
  const hours = Math.round((sec / 3600) * 100) / 100;
  const p = projectOf(e, t);
  const rate = toCents(e.rate) || (p && toCents(p.rate)) || toCents(t.settings.defaultRate);
  return Math.round(hours * rate);
}

export function timeSummary(t, now) {
  const unbilledByClient = new Map();
  let unbilled = 0, seconds = 0, billable = 0, earned = 0, running = null;
  const weekAgo = now - 7 * 864e5;
  let weekSeconds = 0;
  const hoursByClient = {}, thisYear = new Date(now).getFullYear();
  for (const e of t.entries) {
    const sec = entrySeconds(e, now);
    if (Number.isFinite(e.start) && new Date(e.start).getFullYear() === thisYear) {
      const own = projectOf(e, t), who = e.client || (own && own.client) || "(no client)";
      hoursByClient[who] = (hoursByClient[who] || 0) + sec / 3600;
    }
    const cents = entryCents(e, t, now);
    seconds += sec;
    earned += cents;
    if (e.billable !== false) billable += sec;
    if (Number.isFinite(e.start) && e.start >= weekAgo) weekSeconds += sec;
    const isRunning = !Number.isFinite(e.end) && !Number.isFinite(e.manualSec) && Number.isFinite(e.start);
    if (isRunning) running = { since: e.start, hours: sec / 3600, label: e.project || e.client || "an entry" };
    // A timer still running is not finished work, so it is not yet billable.
    if (isRunning || e.billed || cents <= 0) continue;
    unbilled += cents;
    const p = projectOf(e, t);
    const c = e.client || (p && p.client) || "(no client)";
    unbilledByClient.set(c, (unbilledByClient.get(c) || 0) + cents);
  }
  const clients = [...unbilledByClient].map(([client, cents]) => ({ client, cents })).sort((a, b) => b.cents - a.cents);
  return { unbilled, clients, hoursByClient, seconds, weekHours: weekSeconds / 3600, utilisation: seconds ? billable / seconds : null, effectiveRate: seconds ? Math.round((earned * 3600) / seconds) : 0, running };
}

// ---- expenses ----------------------------------------------------------

const SHARE = { meals: 50, personal: 0 };
function deductible(e) {
  const share = e.category in SHARE ? SHARE[e.category] : 100;
  const p = Number(e.bizPct);
  const biz = Number.isFinite(p) && p >= 0 && p <= 100 ? p : 100;
  return Math.round(((Number(e.cents) || 0) * share * biz) / 10000);
}

export function expenseSummary(entries, year) {
  let spent = 0, ded = 0, missing = 0;
  const byMonth = Array(12).fill(0);
  for (const e of entries) {
    if (Number(e.date.slice(0, 4)) !== year) continue;
    const c = Number(e.cents) || 0, d = deductible(e);
    spent += c; ded += d;
    byMonth[Number(e.date.slice(5, 7)) - 1] += d;
    if (!e.receipt && e.category !== "personal" && c >= 7500) missing++;
  }
  return { spent, deductible: ded, byMonth, missing };
}

// ---- profit and tax dates ---------------------------------------------

export function netProfit(incomeCents, deductibleCents) {
  return Math.round(incomeCents || 0) - Math.round(deductibleCents || 0);
}

export function setAside(net, ratePct) {
  const r = Number(ratePct);
  return net > 0 && Number.isFinite(r) && r > 0 ? Math.round((net * Math.min(r, 70)) / 100 + 1e-9) : 0;
}

// Form 1040-ES due dates: Apr 15, Jun 15, Sep 15 and Jan 15 of the next year.
// A date on a weekend or holiday moves to the next business day; not modelled.
export function nextEstimatedTaxDate(today) {
  const t = parseDate(today);
  if (!t) return null;
  const y = t.getUTCFullYear();
  const dates = [`${y}-01-15`, `${y}-04-15`, `${y}-06-15`, `${y}-09-15`, `${y + 1}-01-15`];
  const due = dates.find((d) => d >= today);
  const month = due.slice(5, 7);
  const label = month === "01" ? (due.startsWith(String(y)) ? "Q4 of last year" : "Q4") : { "04": "Q1", "06": "Q2", "09": "Q3" }[month];
  return { date: due, days: daysBetween(today, due), label };
}

export function monthlyRows(income, costs) {
  const net = income.map((v, i) => v - costs[i]);
  return income.map((v, i) => ({ month: i, income: v, costs: costs[i], net: net[i] }));
}

// ---- the list that matters --------------------------------------------

// Ordered by what costs most to ignore. `ctx.now` is ms, `ctx.today` ISO.
export function actions(s, ctx) {
  const out = [];
  const r = receivables(s.invoices, ctx.today);
  const odue = r.open.filter((o) => o.overdue);
  for (const o of odue.slice(0, 3)) {
    out.push({ kind: "chase", weight: o.balance + o.daysLate * 1000, text: `Chase ${o.client}: ${o.number || "invoice"} is ${o.daysLate} day${o.daysLate === 1 ? "" : "s"} overdue (${formatMoney(o.balance)}).`, tool: "invoice-maker" });
  }
  if (odue.length > 3) out.push({ kind: "chase", weight: 1, text: `${odue.length - 3} more overdue invoice(s) after those.`, tool: "invoice-maker" });
  const t = timeSummary(s.time, ctx.now);
  for (const c of t.clients.slice(0, 3)) {
    out.push({ kind: "bill", weight: c.cents, text: `Invoice ${c.client} for ${formatMoney(c.cents)} of tracked time you have not billed.`, tool: "time-tracker" });
  }
  if (t.running && t.running.hours >= 10) out.push({ kind: "timer", weight: 5e6, text: `A timer on ${t.running.label} has run ${t.running.hours.toFixed(1)} hours. Stop it or fix the entry before it is billed.`, tool: "time-tracker" });
  const p = pipeline(s.estimates, ctx.today);
  for (const f of p.followUp.slice(0, 3)) {
    out.push({ kind: "follow", weight: f.value / 2, text: `Follow up with ${f.client} on ${f.number || "the estimate"}: sent ${f.days} days ago, ${formatMoney(f.value)} at stake.`, tool: "estimate-maker" });
  }
  const y = Number(ctx.today.slice(0, 4));
  const inc = incomeSummary(s.invoices, y), ex = expenseSummary(s.expenses.entries, y);
  const net = netProfit(inc.paid, ex.deductible);
  const nxt = nextEstimatedTaxDate(ctx.today);
  const aside = setAside(net, ctx.ratePct);
  if (nxt && nxt.days <= 30 && aside > 0) out.push({ kind: "tax", weight: 8e6, text: `Estimated tax ${nxt.label} is due ${nxt.date} (${nxt.days} day${nxt.days === 1 ? "" : "s"}). Your year-to-date set-aside at ${ctx.ratePct}% is ${formatMoney(aside)}; confirm the payment with your preparer or Form 1040-ES.`, tool: "quarterly-estimated-tax-calendar" });
  if (ex.missing > 0) out.push({ kind: "receipts", weight: 1e5, text: `${ex.missing} expense${ex.missing === 1 ? "" : "s"} of $75 or more have no receipt marked.`, tool: "expense-tracker" });
  if (inc.topShare !== null && inc.topShare > 0.5 && inc.clients.length > 0) out.push({ kind: "concentration", weight: 2e5, text: `${inc.topClient} is ${Math.round(inc.topShare * 100)}% of what you have invoiced this year. Losing one client would hurt; plan some pipeline.`, tool: "estimate-maker" });
  out.sort((a, b) => b.weight - a.weight);
  return out;
}

// One row per client: invoiced revenue this year, what they still owe, hours
// tracked this year and the effective rate (revenue / hours). The rate is only
// given where both sides exist, so a client with no tracked time is not shown
// as infinitely profitable.
export function clientRows(inc, rec, time) {
  const rows = new Map();
  const row = (c) => rows.get(c) || rows.set(c, { client: c, billed: 0, owed: 0, hours: 0 }).get(c);
  for (const c of inc.clients) row(c.client).billed = c.cents;
  for (const r of rec.open) row(r.client).owed += r.balance;
  for (const [c, h] of Object.entries(time.hoursByClient || {})) row(c).hours = Math.round(h * 100) / 100;
  return [...rows.values()]
    .map((r) => ({ ...r, rate: r.hours > 0 && r.billed > 0 ? Math.round(r.billed / r.hours) : null }))
    .sort((a, b) => b.billed + b.owed - (a.billed + a.owed));
}

// A single object with everything the page draws.
export function overview(s, ctx) {
  const y = Number(ctx.today.slice(0, 4));
  const rec = receivables(s.invoices, ctx.today);
  const inc = incomeSummary(s.invoices, y);
  const ex = expenseSummary(s.expenses.entries, y);
  const net = netProfit(inc.paid, ex.deductible);
  return {
    year: y,
    receivables: rec,
    income: inc,
    expenses: ex,
    net,
    setAside: setAside(net, ctx.ratePct),
    pipeline: pipeline(s.estimates, ctx.today),
    time: timeSummary(s.time, ctx.now),
    clientRows: clientRows(inc, rec, timeSummary(s.time, ctx.now)),
    nextTax: nextEstimatedTaxDate(ctx.today),
    months: monthlyRows(inc.byMonth, ex.byMonth),
    actions: actions(s, ctx),
    toolsFound: Object.values(s.found).filter(Boolean).length,
  };
}

// ---- one backup for all four tools ------------------------------------

export function buildBackup(getItem, now = new Date().toISOString()) {
  const stores = {};
  for (const [k, key] of Object.entries(STORES)) {
    let raw = null;
    try { raw = getItem(key); } catch { /* storage is optional */ }
    if (raw) stores[key] = raw;
  }
  return { app: "freelance-dashboard-backup", version: 1, exportedAt: now, stores };
}

// Returns { ok, writes: [[key, text]], problem }. Only the four known keys are
// accepted, and each must hold JSON with the array that tool expects.
export function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { ok: false, writes: [], problem: "That file is not valid JSON." }; }
  if (!d || d.app !== "freelance-dashboard-backup" || !d.stores || typeof d.stores !== "object") return { ok: false, writes: [], problem: "That is not a Freelance Dashboard backup file." };
  const field = { [STORES.invoices]: "invoices", [STORES.estimates]: "estimates", [STORES.time]: "entries", [STORES.expenses]: "entries" };
  const writes = [];
  for (const [key, raw] of Object.entries(d.stores)) {
    if (!(key in field)) continue;
    if (typeof raw !== "string" || !parseBox(raw, field[key])) return { ok: false, writes: [], problem: `The data for ${key} is not in the shape that tool expects.` };
    writes.push([key, raw]);
  }
  return writes.length ? { ok: true, writes, problem: "" } : { ok: false, writes: [], problem: "The backup holds no data for any of the four tools." };
}

// A believable sample so an empty visitor can see what the page does.
export function exampleStores(today) {
  const y = today.slice(0, 4);
  const day = (n) => { const d = parseDate(today); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const line = (desc, qty, rate) => ({ desc, qty, rate: String(rate), taxable: false });
  const inv = (number, clientName, issuedOff, dueOff, amount, paid, sent = true) => ({ number, clientName, issued: day(issuedOff), due: day(dueOff), sent, paid: String(paid), taxRate: "0", lines: [line("Work", 1, amount)] });
  const now = Date.parse(today + "T12:00:00Z");
  return {
    [STORES.invoices]: JSON.stringify({ invoices: [
      inv("INV-0001", "Northwind Studio", -80, -50, 4200, 4200),
      inv("INV-0002", "Northwind Studio", -45, -15, 3600, 0),
      inv("INV-0003", "Alder & Pine", -30, 0, 1800, 1800),
      inv("INV-0004", "Fernhill Cafe", -12, 18, 950, 0),
    ] }),
    [STORES.estimates]: JSON.stringify({ estimates: [
      { number: "EST-0001", clientName: "Harbor Dental", issued: day(-9), sentOn: day(-9), sent: true, validUntil: day(21), options: [{ lines: [line("Brand refresh", 1, 5200)] }, { lines: [line("Brand refresh plus site", 1, 8400)] }] },
      { number: "EST-0002", clientName: "Fernhill Cafe", issued: day(-40), sentOn: day(-40), sent: true, outcome: "accepted", acceptedOption: 0, validUntil: day(-10), options: [{ lines: [line("Menu design", 1, 950)] }] },
      { number: "EST-0003", clientName: "Quill Books", issued: day(-60), sentOn: day(-60), sent: true, outcome: "declined", validUntil: day(-30), options: [{ lines: [line("Cover design", 1, 1400)] }] },
    ] }),
    [STORES.time]: JSON.stringify({ entries: [
      { start: now - 3 * 864e5, end: now - 3 * 864e5 + 6 * 3600e3, client: "Alder & Pine", project: "Site", billable: true, billed: false },
      { start: now - 2 * 864e5, end: now - 2 * 864e5 + 3.5 * 3600e3, client: "Northwind Studio", project: "Retainer", billable: true, billed: false },
      { start: now - 1 * 864e5, end: now - 1 * 864e5 + 2 * 3600e3, client: "", project: "Admin", billable: false, billed: false },
    ], projects: [], settings: { rounding: "15", defaultRate: "85" } }),
    [STORES.expenses]: JSON.stringify({ entries: [
      { date: `${y}-01-12`, vendor: "Design software", cents: 5400 * 3, category: "other", receipt: true },
      { date: `${y}-02-03`, vendor: "Coworking desk", cents: 18000, category: "rent_property", receipt: false },
      { date: `${y}-03-20`, vendor: "Client lunch", cents: 8600, category: "meals", receipt: false },
    ], rate: "30" }),
  };
}
