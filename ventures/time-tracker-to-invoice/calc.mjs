// Time-tracking maths. Money is integer cents; time is integer seconds.
// Pure functions only: the page owns storage, the clock and rendering.

export const ROUNDING = [0, 1, 5, 6, 10, 15, 30, 60];

export function toCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9));
}

export function formatMoney(cents, currency = "USD", locale = "en-US") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// "1:30", "1.5", "90m", "1h 20m", "45" (bare number = hours if it has a dot or
// is <= 12 and no unit, otherwise minutes is too ambiguous, so bare = hours).
// Returns whole seconds, or null when it cannot be read.
export function parseDuration(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return null;
  let m = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(t);
  if (m) return +m[1] * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0);
  m = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/.exec(t);
  if (m && (m[1] || m[2])) return Math.round((+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60);
  m = /^\d+(?:\.\d+)?$/.exec(t);
  if (m) return Math.round(Number(t) * 3600);
  return null;
}

// Billing convention: each entry is rounded UP to the increment (0 = exact to
// the minute). Returns whole minutes billed.
export function billedMinutes(seconds, increment) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const inc = Number(increment) || 0;
  if (inc <= 0) return Math.round(s / 60);
  return (Math.ceil(s / (inc * 60) - 1e-9) * inc) || 0;
}

// Hours as a two-decimal number so the invoice quantity, the on-screen amount
// and the exported amount all agree to the cent.
export function billedHours(seconds, increment) {
  return Math.round((billedMinutes(seconds, increment) / 60) * 100) / 100;
}

export function entryRateCents(entry, client) {
  const own = toCents(entry.rate);
  return own > 0 ? own : toCents(client?.rate);
}

export function entryAmount(entry, client, increment) {
  if (entry.billable === false) return 0;
  return Math.round(billedHours(entry.seconds, increment) * entryRateCents(entry, client));
}

// Weeks start on Monday.
export function weekStart(iso) {
  const d = parseDate(iso);
  if (!d) return "";
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return isoDate(d);
}

export function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = parseDate(iso);
  if (!d) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

// Totals per client over entries whose date falls in [from, to] (inclusive,
// either may be empty). Unbilled = billable entries not yet on an invoice.
export function summarize(entries, clients, increment, { from = "", to = "" } = {}) {
  const by = new Map();
  const total = { seconds: 0, billableSeconds: 0, amount: 0, unbilledAmount: 0, unbilledSeconds: 0 };
  for (const e of entries) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    const client = clients.find((c) => c.name === e.client);
    const row = by.get(e.client || "") || { client: e.client || "", seconds: 0, billableSeconds: 0, amount: 0, unbilledAmount: 0, unbilledSeconds: 0 };
    const amt = entryAmount(e, client, increment);
    row.seconds += e.seconds;
    if (e.billable !== false) row.billableSeconds += e.seconds;
    row.amount += amt;
    if (e.billable !== false && !e.invoiceId) { row.unbilledAmount += amt; row.unbilledSeconds += e.seconds; }
    by.set(row.client, row);
  }
  const rows = [...by.values()].sort((a, b) => b.amount - a.amount || a.client.localeCompare(b.client));
  for (const r of rows) for (const k of Object.keys(total)) total[k] += r[k];
  return { rows, total };
}

// Billable share of tracked time, and effective hourly rate on billable time.
export function utilisation(total) {
  const share = total.seconds > 0 ? total.billableSeconds / total.seconds : 0;
  const hours = total.billableSeconds / 3600;
  return { billableShare: share, effectiveRate: hours > 0 ? Math.round(total.amount / hours) : 0 };
}

export function unbilled(entries, clientName) {
  return entries.filter((e) => e.client === clientName && e.billable !== false && !e.invoiceId);
}

// One invoice line per entry ("2026-10-05 · Homepage fixes"), or one per day,
// or one per project/description. Quantity is billed hours; rate is the
// entry's own rate or the client's. Lines at different rates never merge.
export function toInvoiceDraft(entries, client, { increment = 0, issued = "", number = "INV-0001", currency = "USD", group = "entry", terms = "net30" } = {}) {
  const lines = [];
  const key = (e) => (group === "day" ? `${e.date}|${entryRateCents(e, client)}` : group === "description" ? `${(e.desc || "Time").trim()}|${entryRateCents(e, client)}` : null);
  const merged = new Map();
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    const rate = entryRateCents(e, client);
    const hours = billedHours(e.seconds, increment);
    const k = key(e);
    const label = group === "day" ? `${e.date} · time` : group === "description" ? (e.desc || "Time").trim() : `${e.date} · ${(e.desc || "Time").trim()}`;
    if (k && merged.has(k)) { merged.get(k).qty = Math.round((merged.get(k).qty + hours) * 100) / 100; continue; }
    const line = { desc: label, qty: hours, rate: (rate / 100).toFixed(2), taxable: client?.taxable !== false };
    lines.push(line);
    if (k) merged.set(k, line);
  }
  const days = { net7: 7, net15: 15, net30: 30, net45: 45, net60: 60, due_on_receipt: 0 }[terms] ?? 30;
  const dates = entries.map((e) => e.date).sort();
  return {
    id: `time-${number}-${issued}`,
    number,
    clientName: client?.name || "", clientEmail: client?.email || "", clientAddr: client?.addr || "",
    fromName: "", fromEmail: "", fromAddr: "", fromTaxId: "",
    issued, terms, due: issued ? addDays(issued, days) : "", currency,
    sent: false, void: false, taxRate: client?.taxRate || "", discountType: "none", discountValue: "", shipping: "", paid: "",
    lines: lines.filter((l) => l.qty > 0),
    payInstructions: "", notes: dates.length ? `Time worked ${dates[0]} to ${dates[dates.length - 1]}.` : "",
  };
}

export function invoiceDraftTotal(draft) {
  return draft.lines.reduce((s, l) => s + Math.round(l.qty * toCents(l.rate)), 0);
}

function csvCell(v) {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // spreadsheet formula injection
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function entriesToCsv(entries, clients, increment) {
  const head = ["Date", "Client", "Description", "Tracked hours", "Billed hours", "Rate", "Billable", "Amount", "Invoice"];
  const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
    const c = clients.find((x) => x.name === e.client);
    return [e.date, e.client, e.desc, (e.seconds / 3600).toFixed(2), e.billable === false ? "" : billedHours(e.seconds, increment).toFixed(2), (entryRateCents(e, c) / 100).toFixed(2), e.billable === false ? "no" : "yes", (entryAmount(e, c, increment) / 100).toFixed(2), e.invoiceId || ""];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function validateEntry(e) {
  const out = [];
  if (!parseDate(e.date)) out.push("Add the date the work happened.");
  if (!(e.seconds > 0)) out.push("Add how long it took.");
  if (e.seconds > 24 * 3600) out.push("An entry longer than 24 hours is probably a timer left running; fix the duration.");
  if (!e.client) out.push("Pick or add a client so the time can be invoiced.");
  return out;
}

// A timer left running overnight is the commonest way a time log goes wrong.
export function runningSeconds(running, nowMs) {
  if (!running || !Number.isFinite(running.startedAt)) return 0;
  return Math.max(0, Math.floor((nowMs - running.startedAt) / 1000));
}
