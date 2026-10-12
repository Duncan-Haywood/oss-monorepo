// Time Tracker maths. Time is whole seconds and money is whole cents, so a
// week of entries adds up exactly and the invoice total matches the report.

export const ROUNDING = {
  none: { label: "No rounding", step: 0 },
  "6": { label: "Up to 6 minutes (0.1 h)", step: 6 },
  "15": { label: "Up to 15 minutes", step: 15 },
  "30": { label: "Up to 30 minutes", step: 30 },
  "60": { label: "Up to the hour", step: 60 },
};

export function toCents(v) {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

// "1:30", "1h 30m", "90m", "1.5", "1,5", "45" (bare integer below 8 is hours is ambiguous, so
// a bare number is hours; write "45m" for minutes). Returns whole seconds or null.
export function parseDuration(text) {
  const s = String(text ?? "").trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  let m = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(s);
  if (m) return +m[1] * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0);
  m = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/.exec(s);
  if (m && (m[1] || m[2])) return Math.round((+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60);
  m = /^\d+(?:\.\d+)?$/.exec(s);
  if (m) return Math.round(+s * 3600);
  return null;
}

export function formatDuration(sec) {
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
export function formatClock(sec) {
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function formatMoney(cents, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);
  } catch {
    return ((cents || 0) / 100).toFixed(2);
  }
}

// Seconds an entry has run. A running entry (end === null) counts up to `now`.
export function entrySeconds(e, now = Date.now()) {
  if (Number.isFinite(e.manualSec)) return Math.max(0, Math.round(e.manualSec));
  if (!Number.isFinite(e.start)) return 0;
  const end = Number.isFinite(e.end) ? e.end : now;
  return Math.max(0, Math.round((end - e.start) / 1000));
}

// Billing rounds each entry up (or to nearest-step never below zero) so the
// client sees the same hours on every line they are charged for.
export function roundSeconds(sec, rounding = "none") {
  const step = (ROUNDING[rounding] || ROUNDING.none).step * 60;
  if (!step || sec <= 0) return Math.max(0, sec);
  return Math.ceil(sec / step) * step;
}

export function billableHours(sec, rounding) {
  return Math.round((roundSeconds(sec, rounding) / 3600) * 100) / 100;
}

// Rate in cents/hour: entry override, else project rate, else default.
export function rateFor(e, projects = [], defaultRate = 0) {
  const entryRate = toCents(e.rate);
  if (entryRate) return entryRate;
  const p = projects.find((x) => x.id === e.projectId || x.name === e.project);
  return (p && toCents(p.rate)) || toCents(defaultRate);
}

export function entryAmount(e, projects, settings, now = Date.now()) {
  if (e.billable === false) return 0;
  const hours = billableHours(entrySeconds(e, now), settings.rounding);
  return Math.round(hours * rateFor(e, projects, settings.defaultRate));
}

export function clientOf(e, projects = []) {
  if (e.client) return e.client;
  const p = projects.find((x) => x.id === e.projectId || x.name === e.project);
  return (p && p.client) || "";
}

// "YYYY-MM-DD" in the user's local time for a ms timestamp.
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekStart(ms, mondayFirst = true) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (mondayFirst ? (dow + 6) % 7 : dow));
  return d.getTime();
}

export function rangeFor(kind, now = Date.now()) {
  const d = new Date(now);
  if (kind === "week") { const s = weekStart(now); return [s, s + 7 * 864e5]; }
  if (kind === "month") return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()];
  if (kind === "lastmonth") return [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), new Date(d.getFullYear(), d.getMonth(), 1).getTime()];
  return [-Infinity, Infinity];
}

export function inRange(e, [from, to]) {
  const t = Number.isFinite(e.start) ? e.start : 0;
  return t >= from && t < to;
}

// Totals by client and project over a set of entries.
export function summarize(entries, projects, settings, now = Date.now()) {
  const byClient = new Map();
  let seconds = 0, billSeconds = 0, amount = 0, unbilledAmount = 0;
  for (const e of entries) {
    const sec = entrySeconds(e, now);
    const bill = e.billable === false ? 0 : roundSeconds(sec, settings.rounding);
    const amt = entryAmount(e, projects, settings, now);
    seconds += sec; billSeconds += bill; amount += amt;
    if (!e.billed) unbilledAmount += amt;
    const c = clientOf(e, projects) || "(no client)";
    const pn = e.project || "(no project)";
    if (!byClient.has(c)) byClient.set(c, { client: c, seconds: 0, amount: 0, unbilled: 0, projects: new Map() });
    const row = byClient.get(c);
    row.seconds += sec; row.amount += amt; if (!e.billed) row.unbilled += amt;
    const pr = row.projects.get(pn) || { project: pn, seconds: 0, amount: 0 };
    pr.seconds += sec; pr.amount += amt; row.projects.set(pn, pr);
  }
  const clients = [...byClient.values()].map((r) => ({ ...r, projects: [...r.projects.values()].sort((a, b) => b.seconds - a.seconds) })).sort((a, b) => b.seconds - a.seconds);
  return { seconds, billSeconds, amount, unbilledAmount, clients };
}

// Hours per day for the seven days starting at `start` (ms, local midnight).
export function weekDays(entries, start, now = Date.now()) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    days.push({ key: dayKey(d.getTime()), seconds: 0 });
  }
  for (const e of entries) {
    const k = dayKey(e.start || 0);
    const d = days.find((x) => x.key === k);
    if (d) d.seconds += entrySeconds(e, now);
  }
  return days;
}

// Billable utilisation: billable seconds over all tracked seconds.
export function utilisation(entries, now = Date.now()) {
  let all = 0, bill = 0;
  for (const e of entries) { const s = entrySeconds(e, now); all += s; if (e.billable !== false) bill += s; }
  return all ? bill / all : null;
}

// Unbilled billable entries for one client, ready to become invoice lines.
// One line per project (and rate), hours rounded the way billing rounds them.
export function invoiceLines(entries, projects, settings, now = Date.now()) {
  const groups = new Map();
  for (const e of entries) {
    if (e.billable === false || e.billed || !Number.isFinite(e.end) && !Number.isFinite(e.manualSec)) continue;
    const rate = rateFor(e, projects, settings.defaultRate);
    const key = `${e.project || ""}\u0000${rate}`;
    const g = groups.get(key) || { project: e.project || "Time", rate, sec: 0, descs: new Set(), ids: [] };
    g.sec += roundSeconds(entrySeconds(e, now), settings.rounding);
    if (e.desc) g.descs.add(e.desc.trim());
    g.ids.push(e.id);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const hours = Math.round((g.sec / 3600) * 100) / 100;
    const detail = [...g.descs].slice(0, 6).join("; ");
    return { desc: detail ? `${g.project} — ${detail}` : g.project, qty: String(hours), rate: (g.rate / 100).toFixed(2), taxable: true, ids: g.ids, amount: Math.round(hours * g.rate) };
  }).filter((l) => l.qty !== "0");
}

export function nextInvoiceNumber(invoices = []) {
  let max = 0, width = 4;
  for (const i of invoices) {
    const m = /^INV-(\d+)$/.exec(i.number || "");
    if (m) { max = Math.max(max, +m[1]); width = Math.max(width, m[1].length); }
  }
  return "INV-" + String(max + 1).padStart(width, "0");
}

// Draft in the shape Invoice Maker stores. `lines` come from invoiceLines().
export function toInvoiceDraft(client, lines, { number, issued, currency = "USD", profile = {} } = {}) {
  const day = issued || dayKey(Date.now());
  const d = new Date(`${day}T00:00:00`); d.setDate(d.getDate() + 30);
  return {
    id: "tt-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    number, clientName: client === "(no client)" ? "" : client, clientEmail: "", clientAddr: "",
    fromName: profile.fromName || "", fromEmail: profile.fromEmail || "", fromAddr: profile.fromAddr || "", fromTaxId: profile.fromTaxId || "",
    issued: day, terms: "net30", due: dayKey(d.getTime()), currency,
    sent: false, void: false, taxRate: "", discountType: "none", discountValue: "", shipping: "", paid: "",
    lines: lines.map(({ desc, qty, rate, taxable }) => ({ desc, qty, rate, taxable })),
    payInstructions: profile.payInstructions || "", notes: "Time billed from Time Tracker.",
  };
}

// Entries that look wrong: a timer left running, or a single entry over 16 h.
export function warnings(entries, now = Date.now()) {
  const out = [];
  for (const e of entries) {
    const sec = entrySeconds(e, now);
    if (!Number.isFinite(e.end) && !Number.isFinite(e.manualSec) && sec > 12 * 3600) out.push(`A timer for "${e.project || e.desc || "an entry"}" has been running for ${formatDuration(sec)}. Stop it and fix the time if you forgot it.`);
    else if (sec > 16 * 3600) out.push(`"${e.project || e.desc || "An entry"}" is ${formatDuration(sec)} long. Check it.`);
  }
  return out;
}

const csvCell = (v) => { const s = String(v ?? ""); const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };

export function entriesToCsv(entries, projects, settings, now = Date.now()) {
  const head = ["Date", "Client", "Project", "Description", "Hours", "Billable hours", "Rate", "Amount", "Billable", "Billed"];
  const rows = [...entries].sort((a, b) => a.start - b.start).map((e) => {
    const sec = entrySeconds(e, now);
    return [dayKey(e.start || 0), clientOf(e, projects), e.project || "", e.desc || "", (sec / 3600).toFixed(2), e.billable === false ? "0.00" : billableHours(sec, settings.rounding).toFixed(2), (rateFor(e, projects, settings.defaultRate) / 100).toFixed(2), (entryAmount(e, projects, settings, now) / 100).toFixed(2), e.billable === false ? "no" : "yes", e.billed ? "yes" : "no"];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// Cents earned per *tracked* hour once non-billable time is counted: the
// number that says what an hour of the whole working week is worth, which is
// always below the quoted rate when admin and sales time exist.
export function effectiveRate(summary) {
  return summary.seconds > 0 ? Math.round((summary.amount * 3600) / summary.seconds) : 0;
}

// Rows for a printable client timesheet, oldest first. Billed seconds are the
// rounded seconds a client is charged for, so the sheet matches the invoice.
export function timesheetRows(entries, projects, settings, { client = "", range = null } = {}, now = Date.now()) {
  const rows = entries
    .filter((e) => (!client || clientOf(e, projects) === client) && (!range || inRange(e, range)) && !(!Number.isFinite(e.end) && !Number.isFinite(e.manualSec)))
    .sort((a, b) => (a.start || 0) - (b.start || 0))
    .map((e) => {
      const sec = entrySeconds(e, now);
      const billable = e.billable !== false;
      return { date: dayKey(e.start || 0), project: e.project || "", desc: e.desc || "", seconds: sec, billable, billSeconds: billable ? roundSeconds(sec, settings.rounding) : 0, amount: entryAmount(e, projects, settings, now) };
    });
  const totals = rows.reduce((t, r) => ({ seconds: t.seconds + r.seconds, billSeconds: t.billSeconds + r.billSeconds, amount: t.amount + r.amount }), { seconds: 0, billSeconds: 0, amount: 0 });
  return { rows, totals };
}
