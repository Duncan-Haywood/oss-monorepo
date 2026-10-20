// Revenue recognition from invoice lines. Pure functions, integer minor units.
// A line is {id, billedAt, start, end, amount} with ms timestamps. Revenue is
// recognised evenly per UTC day across [start, end); a line with end <= start
// (a one-off charge, or a credit note) is recognised on its start date.
const DAY = 86400000;
export const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);
const nextMonth = (m) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
const monthRange = (a, b) => { const out = []; for (let m = a; m <= b; m = nextMonth(m)) out.push(m); return out; };
export const monthEnd = (m) => { const [y, mo] = m.split("-").map(Number); return Date.UTC(y, mo, 0); };

// {month: minor units} for one line. Day weights; the rounding remainder goes
// to the months with the largest fractional share so the parts sum exactly.
export function spread(line) {
  const amount = Math.round(line.amount);
  const start = Math.floor(line.start / DAY) * DAY;
  const days = line.end > line.start ? Math.max(1, Math.ceil((line.end - start) / DAY)) : 1;
  const perMonth = {};
  for (let i = 0; i < days; i++) { const m = monthOf(start + i * DAY); perMonth[m] = (perMonth[m] || 0) + 1; }
  const sign = amount < 0 ? -1 : 1, abs = Math.abs(amount);
  const parts = Object.entries(perMonth).map(([m, d]) => ({ m, v: Math.floor((abs * d) / days), r: (abs * d) % days }));
  let left = abs - parts.reduce((a, p) => a + p.v, 0);
  for (const p of [...parts].sort((a, b) => b.r - a.r)) { if (left <= 0) break; p.v++; left--; }
  return Object.fromEntries(parts.map((p) => [p.m, sign * p.v]));
}

// Monthly roll-forward. Deferred revenue at month end = billed to date minus
// recognised to date. Negative means revenue recognised before it was billed.
export function schedule(lines, { asOf = Date.now() } = {}) {
  if (!lines.length) return [];
  const billed = {}, rec = {};
  let first = monthOf(asOf), last = monthOf(asOf);
  for (const l of lines) {
    const b = monthOf(l.billedAt);
    billed[b] = (billed[b] || 0) + Math.round(l.amount);
    for (const [m, v] of Object.entries(spread(l))) rec[m] = (rec[m] || 0) + v;
    for (const m of [b, monthOf(l.start)]) if (m < first) first = m;
  }
  const lastRec = Object.keys(rec).sort().pop();
  if (lastRec > last) last = lastRec;
  const out = []; let deferred = 0;
  for (const month of monthRange(first, last)) {
    const opening = deferred, bi = billed[month] || 0, ri = rec[month] || 0;
    deferred = opening + bi - ri;
    out.push({ month, opening, billed: bi, recognized: ri, closing: deferred, future: month > monthOf(asOf) });
  }
  return out;
}

// Revenue already invoiced but not yet earned, by future month (backlog / RPO).
export function backlog(rows, asOf = Date.now()) {
  const cur = monthOf(asOf);
  return rows.filter((r) => r.month > cur && r.recognized !== 0).map((r) => ({ month: r.month, recognized: r.recognized }));
}

// Double-entry rows per month, balanced by construction. Billing: debit the
// receivable/cash account, credit deferred revenue. Recognition: debit
// deferred revenue, credit revenue. Month-end dates, amounts in major units.
export function journal(rows, { cash = "Accounts receivable", deferred = "Deferred revenue", revenue = "Subscription revenue" } = {}) {
  const out = [];
  const major = (n) => (Math.abs(n) / 100).toFixed(2);
  const push = (date, memo, dr, cr, n) => { if (n === 0) return; out.push(n > 0 ? { date, memo, account: dr, debit: major(n), credit: "" } : { date, memo, account: dr, debit: "", credit: major(n) }, n > 0 ? { date, memo, account: cr, debit: "", credit: major(n) } : { date, memo, account: cr, debit: major(n), credit: "" }); };
  for (const r of rows) {
    const date = new Date(monthEnd(r.month)).toISOString().slice(0, 10);
    push(date, `Billings ${r.month}`, cash, deferred, r.billed);
    push(date, `Revenue recognised ${r.month}`, deferred, revenue, r.recognized);
  }
  return out;
}

export function journalCsv(entries) {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ["Date,Memo,Account,Debit,Credit", ...entries.map((e) => [e.date, e.memo, e.account, e.debit, e.credit].map(q).join(","))].join("\n") + "\n";
}

export function summary(rows, asOf = Date.now()) {
  const cur = monthOf(asOf);
  const done = rows.filter((r) => r.month < cur);
  const last = done[done.length - 1];
  const now = rows.find((r) => r.month === cur);
  return {
    asOf: cur,
    deferredNow: now ? now.closing : rows.filter((r) => r.month < cur).slice(-1)[0]?.closing ?? 0,
    lastMonth: last ? { month: last.month, recognized: last.recognized, billed: last.billed } : null,
    backlog: backlog(rows, asOf).reduce((a, r) => a + r.recognized, 0),
  };
}

export function formatMoney(minor, currency = "usd") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency).toUpperCase(), maximumFractionDigits: 0 }).format(minor / 100); }
  catch { return `${(minor / 100).toFixed(0)} ${currency}`; }
}
