// Client profitability from a time-tracker export: reads a time-entry CSV
// (Toggl, Clockify, Harvest, or your own sheet) and shows, per client, the
// hours, what they paid for them, the effective hourly rate against a target
// rate you type, unpaid or non-billable time, scope creep on flat-fee work and
// how concentrated your hours are. Column names are matched by alias; no real
// tracker export was available when this was written. Pure functions, no DOM,
// no network.

export const DEFAULT_TARGET_RATE = 100;
export const MIN_MONTHS_FOR_TREND = 4;

const ALIASES = {
  client: ["client name", "customer name", "client", "customer", "company", "account"],
  project: ["project name", "project", "task", "description"],
  date: ["start date", "date started", "date", "day", "entry date", "started"],
  hours: ["duration (decimal)", "hours", "hours worked", "duration", "time spent", "time (h)", "time", "quantity", "qty", "minutes", "duration (min)"],
  billable: ["billable?", "is billable", "billable", "billable status", "invoiceable"],
  amount: ["billable amount (usd)", "billable amount", "amount (usd)", "amount", "billable value", "revenue", "invoiced", "invoice amount", "fee"],
  rate: ["billable rate (usd)", "billable rate", "hourly rate", "bill rate", "rate (usd)", "rate"],
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

const MONTH = 30.4375 * 86400000;
const r2 = (n) => Math.round(n * 100) / 100;
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money = (n) => Math.round(n).toLocaleString("en-US");
export const pct = (x) => Math.round(x * 100) + "%";
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

// "1:30:00", "01:30", "1h 30m", "90m", "1.5", "1,5" -> hours, or NaN. A bare
// number is hours unless the column is a minutes column.
export function parseDuration(v, { minutes = false, decimalComma = false } = {}) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return NaN;
  let m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return +m[1] + +m[2] / 60 + (m[3] ? +m[3] / 3600 : 0);
  m = s.match(/^(?:(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:[.,]\d+)?)\s*m(?:in(?:ute)?s?)?)?$/);
  if (m && (m[1] || m[2])) return (m[1] ? Number(m[1].replace(",", ".")) : 0) + (m[2] ? Number(m[2].replace(",", ".")) / 60 : 0);
  const n = parseNumber(s, decimalComma);
  return Number.isFinite(n) ? (minutes ? n / 60 : n) : NaN;
}

export function parseBillable(raw) {
  const s = norm(raw);
  if (!s) return null;
  if (/^(no|n|false|f|0|non.?billable|not billable|unbillable|internal|nb)$/.test(s)) return false;
  if (/^(yes|y|true|t|1|billable)$/.test(s)) return true;
  return null;
}

// Flat-fee and retainer revenue for the period, one "Client, amount" per line.
// Split at the first separator so "Acme, 1,000" is 1000; client names cannot
// contain a comma, colon or semicolon.
export function parseFlat(text, decimalComma = false) {
  const items = [], bad = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^([^,;:\t]*?)\s*[,;:\t]\s*(.+)$/);
    const amt = m ? parseNumber(m[2], decimalComma) : NaN;
    if (!m || !m[1].trim() || !Number.isFinite(amt) || amt < 0) { bad.push({ line: i + 1, reason: "expected “Client, amount”" }); return; }
    items.push({ client: m[1].trim(), amount: amt });
  });
  return { items, bad };
}

// Returns { items, skipped, columns, dmy, error }. An item is
// { line, client, project, date (ts|null), hours, billable (bool|null), amount }
// where amount is money the export attributes to the entry (rate x hours when
// only a rate is given; 0 for a non-billable entry).
export function normalizeRows(table, { decimalComma = false } = {}) {
  const empty = { items: [], skipped: [], columns: {}, dmy: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.client !== undefined && c.hours !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Client” and “Duration” (or “Hours”), plus ideally “Date”, “Billable” and “Amount” (or “Rate”). Export your time entries from Toggl, Clockify, Harvest or your own sheet with those headers." };
  const cols = findColumns(table[h]);
  const minutesCol = /min/.test(norm(table[h][cols.hours]));
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const items = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i], lineNo = i + 1;
    if (line.every((x) => !String(x).trim())) continue;
    if (/^(total|totals|subtotal|grand total)\b/.test(String(line[0] ?? "").trim().toLowerCase())) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const client = get(line, "client");
    if (!client) { skipped.push({ line: lineNo, reason: "no client" }); continue; }
    const hours = parseDuration(get(line, "hours"), { minutes: minutesCol, decimalComma });
    if (!Number.isFinite(hours)) { skipped.push({ line: lineNo, reason: "duration not readable" }); continue; }
    if (hours < 0) { skipped.push({ line: lineNo, reason: "negative duration" }); continue; }
    const dateRaw = get(line, "date");
    const when = isBlank(dateRaw) ? null : parseWhen(dateRaw, dmy);
    if (!isBlank(dateRaw) && !when) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    const billable = cols.billable === undefined ? null : parseBillable(get(line, "billable"));
    const amtRaw = get(line, "amount"), rateRaw = get(line, "rate");
    let amount = isBlank(amtRaw) ? null : parseNumber(amtRaw, decimalComma);
    if (amount !== null && !Number.isFinite(amount)) { skipped.push({ line: lineNo, reason: "amount not readable" }); continue; }
    if (amount === null && !isBlank(rateRaw)) {
      const rate = parseNumber(rateRaw, decimalComma);
      if (Number.isFinite(rate)) amount = rate * hours;
    }
    if (billable === false) amount = 0;
    items.push({ line: lineNo, client, project: get(line, "project"), date: when ? when.t : null, hours, billable, amount: amount === null ? 0 : Math.max(amount, 0), amountKnown: amount !== null });
  }
  if (!items.length) return { ...empty, columns: cols, dmy, skipped, error: "No time entries could be read from the file." };
  return { items, skipped, columns: cols, dmy };
}

const key = (s) => norm(s);

export function analyze(items, { flat = [], targetRate = DEFAULT_TARGET_RATE } = {}) {
  if (!items.length) return { invalid: "There are no time entries to analyze." };
  const target = Number.isFinite(targetRate) && targetRate > 0 ? targetRate : DEFAULT_TARGET_RATE;
  const byClient = new Map();
  const get = (label) => {
    const k = key(label);
    if (!byClient.has(k)) byClient.set(k, { label, entries: [], flatRevenue: 0 });
    return byClient.get(k);
  };
  for (const it of items) get(it.client).entries.push(it);
  const unmatchedFlat = [];
  for (const f of flat) {
    if (!byClient.has(key(f.client))) unmatchedFlat.push(f.client);
    get(f.client).flatRevenue += f.amount;
  }
  const dated = items.filter((i) => i.date !== null).map((i) => i.date);
  const first = dated.length ? Math.min(...dated) : null, last = dated.length ? Math.max(...dated) : null;
  const clients = [];
  for (const c of byClient.values()) {
    const hours = sum(c.entries.map((e) => e.hours));
    const billableHours = sum(c.entries.filter((e) => e.billable !== false).map((e) => e.hours));
    const nonBillableHours = hours - billableHours;
    const timeRevenue = sum(c.entries.map((e) => e.amount));
    const revenue = timeRevenue + c.flatRevenue;
    const unpricedHours = sum(c.entries.filter((e) => e.billable !== false && !e.amountKnown).map((e) => e.hours));
    const effective = hours > 0 ? revenue / hours : null;
    const shortfall = hours > 0 ? Math.max(0, target * hours - revenue) : 0;
    // Scope creep: monthly hours in the later half of the client's dated
    // entries against the earlier half, on work that is mostly flat-fee.
    let creep = null;
    const ds = c.entries.filter((e) => e.date !== null);
    if (ds.length >= 4 && c.flatRevenue > 0 && c.flatRevenue >= timeRevenue) {
      const a = Math.min(...ds.map((e) => e.date)), b = Math.max(...ds.map((e) => e.date));
      if ((b - a) / MONTH >= MIN_MONTHS_FOR_TREND / 2) {
        const mid = a + (b - a) / 2;
        const early = sum(ds.filter((e) => e.date < mid).map((e) => e.hours));
        const late = sum(ds.filter((e) => e.date >= mid).map((e) => e.hours));
        if (early > 0) creep = { early, late, change: late / early - 1 };
      }
    }
    clients.push({ label: c.label, entries: c.entries.length, hours, billableHours, nonBillableHours, timeRevenue, flatRevenue: c.flatRevenue, revenue, effective, vsTarget: effective === null ? null : effective / target, shortfall, unpricedHours, creep });
  }
  clients.sort((x, y) => y.hours - x.hours || y.revenue - x.revenue);
  const hours = sum(clients.map((c) => c.hours));
  const revenue = sum(clients.map((c) => c.revenue));
  const nonBillable = sum(clients.map((c) => c.nonBillableHours));
  const hasBillableFlag = items.some((i) => i.billable !== null);
  const below = clients.filter((c) => c.effective !== null && c.effective < target);
  const summary = {
    entries: items.length, clients: clients.filter((c) => c.hours > 0).length, hours, revenue,
    blended: hours > 0 ? revenue / hours : null, target,
    first, last, nonBillable, nonBillableShare: hours > 0 ? nonBillable / hours : 0, hasBillableFlag,
    belowCount: below.length, belowHours: sum(below.map((c) => c.hours)), belowRevenue: sum(below.map((c) => c.revenue)),
    // Upper bound, not a forecast: it assumes the freed hours could be sold
    // at the target rate, which needs clients to buy them.
    upside: sum(below.map((c) => c.shortfall)),
    unpricedHours: sum(clients.map((c) => c.unpricedHours)),
  };
  const findings = [];
  const worst = [...below].sort((a, b) => b.shortfall - a.shortfall).slice(0, 3);
  for (const c of worst) {
    findings.push({ severity: c.effective < target / 2 ? "high" : "medium", title: `${c.label} works out at ${usd(c.effective)}/hour against your ${usd(target)} target`, detail: `${money(c.hours)} hours for ${usd(c.revenue)}. To reach the target on the same hours it would need ${usd(target * c.hours)}, ${usd(c.shortfall)} more (${pct(target * c.hours / Math.max(c.revenue, 1) - 1)} more than now).` });
  }
  const noRev = clients.filter((c) => c.hours >= 1 && c.revenue === 0);
  if (noRev.length) findings.push({ severity: "high", title: `${noRev.length} client(s) have hours but no revenue in the file`, detail: `${noRev.slice(0, 4).map((c) => `${c.label} (${money(c.hours)} h)`).join(", ")}. Either the export has no amounts for them, or the work is unpaid. Add a flat fee below if they pay a retainer.` });
  for (const c of clients.filter((c) => c.creep && c.creep.change >= 0.25).sort((a, b) => b.creep.change - a.creep.change).slice(0, 2)) {
    findings.push({ severity: "medium", title: `${c.label}: flat-fee work is taking ${pct(c.creep.change)} more hours than it did`, detail: `${c.creep.early.toFixed(1)} h in the earlier half of the period, ${c.creep.late.toFixed(1)} h in the later half, on a fee that did not change. This is scope creep if the scope did not.` });
  }
  if (hasBillableFlag && summary.nonBillableShare >= 0.2) findings.push({ severity: "medium", title: `${pct(summary.nonBillableShare)} of tracked hours are non-billable`, detail: `${money(nonBillable)} of ${money(hours)} hours. Selling the rest at ${usd(summary.blended)}/hour already includes that overhead; raising rates or trimming it both help.` });
  if (summary.unpricedHours > 0) findings.push({ severity: "info", title: `${money(summary.unpricedHours)} billable hours carry no amount or rate`, detail: "They count as hours but add no revenue unless a flat fee covers them. If the export should have amounts, check its rate column." });
  const top = clients[0];
  if (top && hours > 0 && top.hours / hours >= 0.4 && clients.length > 1) findings.push({ severity: "info", title: `${top.label} takes ${pct(top.hours / hours)} of your hours`, detail: `It brings ${revenue > 0 ? pct(top.revenue / revenue) : "0%"} of the revenue in the file. Losing it would free that time and that income together.` });
  if (unmatchedFlat.length) findings.push({ severity: "info", title: `${unmatchedFlat.length} flat-fee client(s) have no time entries`, detail: `${unmatchedFlat.slice(0, 4).join(", ")}: revenue is counted but no hours, so no hourly rate is shown. Check the spelling matches the export.` });
  return { summary, clients, findings, target };
}

export function summaryText(r) {
  const s = r.summary;
  const lines = [`Client profitability, ${s.first ? `${dateStr(s.first)} to ${dateStr(s.last)}` : "undated"}: ${money(s.hours)} hours, ${usd(s.revenue)}, blended ${s.blended === null ? "n/a" : usd(s.blended) + "/hour"} against a ${usd(s.target)} target.`];
  lines.push(`${s.belowCount} of ${r.clients.filter((c) => c.hours > 0).length} clients are below target (${money(s.belowHours)} h); reaching the target on those hours would be ${usd(s.upside)} more, an upper bound.`);
  for (const c of r.clients.filter((c) => c.hours > 0).slice(0, 12)) lines.push(`- ${c.label}: ${money(c.hours)} h, ${usd(c.revenue)}, ${c.effective === null ? "n/a" : usd(c.effective) + "/h"} (${c.vsTarget === null ? "n/a" : pct(c.vsTarget)} of target)`);
  for (const f of r.findings) lines.push(`* ${f.title}`);
  return lines.join("\n");
}

// A synthetic studio, six invented clients, six months. Nothing here is real.
export function sampleCsv(asOf = Date.UTC(2026, 8, 28)) {
  const rows = ["Client,Project,Date,Duration,Billable,Amount"];
  const plan = [
    ["Northwind Bakery", "Site", 90, 6, 8, 1.0, "hourly"],
    ["Harbor Dental", "Retainer", 150, 12, 3, 1.0, "flat"],
    ["Pinecrest Realty", "Listings", 110, 10, 6, 1.0, "hourly"],
    ["Orbit Labs", "Product", 60, 14, 5, 1.0, "hourly"],
    ["Corner Yoga", "Brand", 50, 14, 4, 1.0, "hourly"],
  ];
  const d = (n) => dateStr(asOf - n * 86400000);
  for (const [client, project, rate, count, base, , kind] of plan) {
    for (let i = 0; i < count; i++) {
      const hrs = kind === "flat" ? base + i * 0.9 : base;
      const amount = kind === "flat" ? 0 : rate * hrs;
      rows.push(`${client},${project},${d(170 - i * 12 - plan.findIndex((p) => p[0] === client))},${hrs.toFixed(2)},yes,${amount.toFixed(2)}`);
    }
  }
  for (let i = 0; i < 8; i++) rows.push(`Northwind Bakery,Admin,${d(160 - i * 20)},1.5,no,0`);
  return rows.join("\n");
}

export const SAMPLE_FLAT = "Harbor Dental, 6000";
