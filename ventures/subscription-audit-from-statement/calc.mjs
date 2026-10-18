// Subscription audit from a bank or card statement CSV: finds recurring
// charges (weekly to annual), works out what each costs per month and per
// year, flags price rises, double charges, renewals coming up, charges that
// look already cancelled, and several services of the same kind. Column names
// are matched by alias and no real bank export was available when this was
// written. Pure functions, no DOM, no network.

import { identifyService, storeBiller } from "./services.mjs";

export const DAY = 86400000;
export const CADENCES = [
  { id: "weekly", label: "Weekly", days: 7, lo: 5, hi: 9, perYear: 52, needs: 4, fixedOnly: true },
  { id: "biweekly", label: "Every 2 weeks", days: 14, lo: 12, hi: 16, perYear: 26, needs: 4, fixedOnly: true },
  { id: "monthly", label: "Monthly", days: 30.4, lo: 26, hi: 35, perYear: 12, needs: 3, fixedOnly: false },
  { id: "quarterly", label: "Quarterly", days: 91, lo: 84, hi: 98, perYear: 4, needs: 3, fixedOnly: false },
  { id: "semiannual", label: "Every 6 months", days: 182, lo: 170, hi: 195, perYear: 2, needs: 2, fixedOnly: true },
  { id: "annual", label: "Yearly", days: 365, lo: 350, hi: 380, perYear: 1, needs: 2, fixedOnly: true },
];
export const FIXED_TOLERANCE = 0.1; // charges within 10% of the median count as the same price
const FIT_SHARE = 0.6; // share of gaps that must sit inside the cadence window

const ALIASES = {
  date: ["transaction date", "posted date", "post date", "posting date", "date posted", "trans date", "date"],
  desc: ["description", "transaction description", "merchant", "merchant name", "payee", "name", "details", "memo", "original description"],
  amount: ["amount", "transaction amount", "amt", "value"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "money out", "paid out", "amount debit", "charge"],
  credit: ["credit", "credits", "deposit", "deposits", "money in", "paid in", "amount credit"],
};

// Known service names, matched on the cleaned description. A guess from the
// name only: it drives the "same kind of service" note and nothing else.
export const KINDS = [
  ["Video streaming", /\b(netflix|hulu|disney ?\+?|disneyplus|hbo|max\.com|paramount|peacock|apple ?tv|appletv|prime video|crunchyroll|discovery ?\+?|starz|showtime|fubo|sling|youtube ?tv|britbox|mubi|curiosity ?stream)/i],
  ["Music streaming", /\b(spotify|apple music|pandora|tidal|deezer|amazon music|youtube music|soundcloud|audible)/i],
  ["Cloud storage", /\b(dropbox|icloud|google one|google storage|onedrive|box\.com|backblaze|idrive|carbonite)/i],
  ["News and reading", /\b(nytimes|new york times|wsj|wall street journal|washington post|washpost|the atlantic|economist|medium\.com|substack|kindle unlimited|scribd|new yorker|bloomberg|the athletic|financial times)/i],
  ["Fitness and wellness", /\b(peloton|planet fitness|la fitness|anytime fitness|equinox|orangetheory|classpass|strava|calm|headspace|noom|myfitnesspal|fitbit|beachbody|crunch fitness|gold'?s gym|ymca)/i],
  ["Software and AI", /\b(openai|chatgpt|anthropic|claude\.ai|github|adobe|microsoft 365|office 365|canva|notion|evernote|1password|lastpass|dashlane|grammarly|zoom|slack|figma|midjourney|cursor)/i],
  ["Gaming", /\b(xbox|playstation|psn|nintendo|steam|twitch|ea play|ubisoft|epic games|geforce now)/i],
  ["VPN and security", /\b(nordvpn|expressvpn|surfshark|protonvpn|proton ?mail|norton|mcafee|malwarebytes|lifelock|aura)/i],
];

export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s) || /^\$?\s*[-−]/.test(s) || /CR\s*$/i.test(s);
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

const r2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => (n < 0 ? "-$" : "$") + money(Math.abs(n));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function findColumns(header, aliases) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const cols = {};
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

// Day number (whole days since 1970, UTC) or null. dateOrder: "mdy" | "dmy" | "auto".
export function parseDate(s, dateOrder = "mdy") {
  const t = String(s ?? "").trim().replace(/[T ].*$/, "");
  let y, m, d, a = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (a) { y = +a[1]; m = +a[2]; d = +a[3]; }
  else if ((a = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    y = +a[3]; if (y < 100) y += 2000;
    if (dateOrder === "dmy") { d = +a[1]; m = +a[2]; } else { m = +a[1]; d = +a[2]; }
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return Math.round(ms / DAY);
}
export const isoDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);

// "auto" reads dmy when any first component is over 12 (or the dates use dots,
// or the file writes decimal commas), else mdy.
export function guessDateOrder(samples, fallback = "mdy") {
  let firstOver12 = false, secondOver12 = false, dots = false;
  for (const s of samples) {
    if (/^\d{1,2}\.\d{1,2}\.\d{2,4}/.test(String(s).trim())) dots = true;
    const a = String(s).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!a) continue;
    if (+a[1] > 12) firstOver12 = true;
    if (+a[2] > 12) secondOver12 = true;
  }
  if (secondOver12 && !firstOver12) return "mdy";
  return firstOver12 || dots ? "dmy" : fallback;
}

// Bank descriptors carry a processor prefix, a store number and a city. Strip
// them so "NETFLIX.COM 866-579-7172 CA" and "NETFLIX.COM 800-123 CA" group.
export function merchantKey(desc) {
  let s = String(desc ?? "").toUpperCase();
  s = s.replace(/\b(PURCHASE AUTHORIZED ON|DEBIT CARD PURCHASE|CHECKCARD|CHECK CARD|POS DEBIT|POS PURCHASE|RECURRING PAYMENT|RECURRING PMT|AUTOPAY|ACH DEBIT|ACH WITHDRAWAL|ONLINE PAYMENT|PAYMENT TO|VISA|MASTERCARD)\b/g, " ");
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ");
  s = s.replace(/^(SQ|TST|PP|PAYPAL|GOOGLE|APLPAY|AMZN MKTP|SP|IN|DD)\s*\*\s*/, (m, p) => (p === "GOOGLE" ? "GOOGLE " : ""));
  s = s.replace(/\s*\*\s*/g, " ");
  const tokens = s.split(/[\s,]+/).filter((t) => t && !/\d/.test(t) && !/^[#\-.]+$/.test(t));
  // Drop a trailing two-letter state code left after the name.
  while (tokens.length > 1 && /^[A-Z]{2}$/.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.slice(0, 3).join(" ").replace(/[.,]+$/, "").trim();
}

export function kindOf(key) {
  const svc = identifyService(key);
  if (svc) return svc.kind;
  for (const [name, re] of KINDS) if (re.test(key)) return name;
  return null;
}

// Statement table -> { rows, skipped, columns, dateOrder, spendSign, error }.
// A row is { line, day, desc, spend }: spend is positive money out.
export function normalizeStatement(table, { decimalComma = false, dateOrder = "auto", spendSign = "auto" } = {}) {
  const empty = { rows: [], skipped: [], columns: {} };
  if (!table.length) return { ...empty, error: "The statement file is empty." };
  let h = -1, cols = {};
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const c = findColumns(table[i], ALIASES);
    if (c.date !== undefined && c.desc !== undefined && (c.amount !== undefined || c.debit !== undefined)) { h = i; cols = c; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns for the date, the description and the amount (or debit and credit), as in a bank or credit-card CSV export." };
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const columns = {};
  for (const [f, at] of Object.entries(cols)) columns[f] = table[h][at].trim();
  const order = dateOrder === "auto" ? guessDateOrder(table.slice(h + 1).map((r) => r[cols.date] ?? ""), decimalComma ? "dmy" : "mdy") : dateOrder;

  const parsed = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i], lineNo = i + 1;
    const day = parseDate(get(line, "date"), order);
    if (day === null) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    const desc = get(line, "desc");
    if (!desc) { skipped.push({ line: lineNo, reason: "no description" }); continue; }
    let signed;
    if (cols.debit !== undefined) {
      const d = parseNumber(get(line, "debit"), decimalComma);
      const c = cols.credit !== undefined ? parseNumber(get(line, "credit"), decimalComma) : 0;
      if (!Number.isFinite(d) || !Number.isFinite(c)) { skipped.push({ line: lineNo, reason: "amount not readable" }); continue; }
      parsed.push({ line: lineNo, day, desc, spend: Math.abs(d) - Math.abs(c) });
      continue;
    }
    signed = parseNumber(get(line, "amount"), decimalComma);
    if (!Number.isFinite(signed)) { skipped.push({ line: lineNo, reason: "amount not readable" }); continue; }
    parsed.push({ line: lineNo, day, desc, signed });
  }
  let sign = spendSign;
  if (cols.debit === undefined) {
    if (sign === "auto") {
      const neg = parsed.filter((r) => r.signed < 0).length, pos = parsed.filter((r) => r.signed > 0).length;
      sign = neg >= pos ? "negative" : "positive";
    }
    for (const r of parsed) { r.spend = sign === "negative" ? -r.signed : r.signed; delete r.signed; }
  } else sign = "columns";
  const rows = parsed.filter((r) => r.spend > 0);
  const credits = parsed.length - rows.length;
  if (!rows.length) return { ...empty, skipped, columns, error: "No charges could be read. " + (skipped.length ? `${skipped.length} row(s) were skipped (first: line ${skipped[0].line}, ${skipped[0].reason}).` : "If your file shows purchases as positive numbers, set the sign option.") };
  return { rows, skipped, credits, columns, dateOrder: order, spendSign: sign };
}

function addMonths(day, months) {
  const d = new Date(day * DAY);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, dd = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.round(Date.UTC(y, m, Math.min(dd, last)) / DAY);
}
const STEP = { weekly: (d) => d + 7, biweekly: (d) => d + 14, monthly: (d) => addMonths(d, 1), quarterly: (d) => addMonths(d, 3), semiannual: (d) => addMonths(d, 6), annual: (d) => addMonths(d, 12) };

function detectCadence(days, amounts) {
  const gaps = [];
  for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
  const med = median(amounts);
  const fixed = med > 0 && amounts.filter((a) => Math.abs(a - med) <= FIXED_TOLERANCE * med).length / amounts.length >= FIT_SHARE;
  for (const c of CADENCES) {
    if (days.length < c.needs) continue;
    if (c.fixedOnly && !fixed) continue;
    const inside = gaps.filter((g) => g >= c.lo && g <= c.hi).length;
    if (gaps.length && inside / gaps.length >= FIT_SHARE) return { cadence: c, fixed };
  }
  return null;
}

// Group charges by merchant, find the ones that repeat on a schedule and price
// them. opts.asOf is a day number (default: the last date in the file).
export function analyze(rows, opts = {}) {
  const minAmount = Number.isFinite(opts.minAmount) && opts.minAmount >= 0 ? opts.minAmount : 1;
  if (!rows.length) return { invalid: "There are no charges to look at." };
  const firstDay = Math.min(...rows.map((r) => r.day)), lastDay = Math.max(...rows.map((r) => r.day));
  const asOf = Number.isFinite(opts.asOf) ? opts.asOf : lastDay;
  const spanDays = lastDay - firstDay;

  const groups = new Map();
  for (const r of rows) {
    let key = merchantKey(r.desc);
    if (!key) continue;
    // Descriptor variants of one known service share a line.
    const known = identifyService(key);
    if (known) key = known.name.toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const subs = [], doubleCharges = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.day - b.day);
    // Same-day repeats of one amount are a double charge, not two cycles.
    const cycle = [];
    for (const r of list) {
      const prev = cycle[cycle.length - 1];
      if (prev && r.day - prev.day <= 2 && Math.abs(r.spend - prev.spend) < 0.005) doubleCharges.push({ merchant: key, day: r.day, amount: r2(r.spend), first: prev.day });
      else cycle.push(r);
    }
    const days = cycle.map((r) => r.day), amounts = cycle.map((r) => r.spend);
    if (median(amounts) < minAmount) continue;
    const hit = detectCadence(days, amounts);
    if (!hit) continue;
    const { cadence, fixed } = hit;
    const last = cycle[cycle.length - 1];
    const recent = amounts.slice(-3);
    const current = fixed ? median(recent) : recent.reduce((a, b) => a + b, 0) / recent.length;
    const perYear = current * cadence.perYear;

    // Price rises: a charge above the price before it by 2% and 25 cents.
    const rises = [];
    if (fixed) {
      let base = amounts[0];
      for (let i = 1; i < amounts.length; i++) {
        if (amounts[i] >= base * 1.02 && amounts[i] - base >= 0.25) { rises.push({ day: days[i], from: r2(base), to: r2(amounts[i]) }); base = amounts[i]; }
        else if (amounts[i] < base * 0.98) base = amounts[i];
      }
    }
    const next = STEP[cadence.id](last.day);
    const endedBefore = last.day + Math.round(cadence.days * 1.5);
    const status = endedBefore < asOf ? "ended" : "active";
    subs.push({
      merchant: key, sample: last.desc, kind: kindOf(key), site: identifyService(key)?.site ?? null, via: storeBiller(last.desc), cadence: cadence.id, cadenceLabel: cadence.label, fixed,
      count: cycle.length, first: days[0], last: last.day, amount: r2(current), perMonth: r2(perYear / 12), perYear: r2(perYear),
      total: r2(amounts.reduce((a, b) => a + b, 0)), history: cycle.map((r) => ({ day: r.day, amount: r2(r.spend) })), rises, riseImpactYear: r2(rises.length ? (current - amounts[0]) * cadence.perYear : 0),
      next, nextInDays: next - asOf, status,
    });
  }
  subs.sort((a, b) => (a.status === b.status ? b.perYear - a.perYear : a.status === "active" ? -1 : 1));
  const active = subs.filter((s) => s.status === "active");

  const kinds = new Map();
  for (const s of active) if (s.kind) { if (!kinds.has(s.kind)) kinds.set(s.kind, []); kinds.get(s.kind).push(s); }
  const overlaps = [...kinds].filter(([, v]) => v.length >= 2).map(([kind, v]) => ({ kind, merchants: v.map((s) => s.merchant), perMonth: r2(v.reduce((a, s) => a + s.perMonth, 0)) }));

  const upcoming = active.filter((s) => s.nextInDays >= -3 && s.nextInDays <= 45 && (s.cadence === "annual" || s.cadence === "semiannual" || s.cadence === "quarterly"));
  const risen = active.filter((s) => s.rises.length);
  const findings = [];
  for (const s of risen) {
    const last = s.rises[s.rises.length - 1];
    findings.push({ severity: "medium", title: `${s.merchant} went up from ${usd(s.rises[0].from)} to ${usd(last.to)}`, detail: `First charged at the higher price on ${isoDay(last.day)}. At ${s.cadenceLabel.toLowerCase()} billing that is about ${usd(s.riseImpactYear)} more a year than the first charge in this file. Check the plan you are on still earns that price.` });
  }
  for (const d of doubleCharges) findings.push({ severity: "high", title: `${d.merchant} charged ${usd(d.amount)} twice within two days`, detail: `Two identical charges, ${isoDay(d.first)} and ${isoDay(d.day)}. It can be a pending charge shown twice; if it stays on the statement, ask the merchant or the card issuer.` });
  for (const o of overlaps) findings.push({ severity: "medium", title: `${o.merchants.length} ${o.kind.toLowerCase()} services at once`, detail: `${o.merchants.join(", ")} together cost about ${usd(o.perMonth)} a month. The category is guessed from the names. Keep the one you use most.` });
  for (const s of upcoming) findings.push({ severity: "info", title: `${s.merchant} renews ${s.nextInDays <= 0 ? "about now" : `in about ${s.nextInDays} days`}`, detail: `${s.cadenceLabel} charge of ${usd(s.amount)}, next expected around ${isoDay(s.next)}. This is the one to cancel before, if you are going to.` });
  const viaStore = active.filter((s) => s.via && !identifyService(s.merchant));
  for (const b of new Set(viaStore.map((s) => s.via))) {
    const mine = viaStore.filter((s) => s.via === b);
    findings.push({ severity: "medium", title: `${mine.length} recurring charge(s) billed through ${b.label} hide what they are for`, detail: `${mine.map((s) => `${usd(s.amount)} ${s.cadenceLabel.toLowerCase()}`).join("; ")} (about ${usd(mine.reduce((a, s) => a + s.perYear, 0))} a year). The statement names ${b.label}, not the app. ${b.where}` });
  }
  const ended = subs.filter((s) => s.status === "ended");
  if (ended.length) findings.push({ severity: "info", title: `${ended.length} recurring charge(s) seem to have stopped`, detail: ended.map((s) => `${s.merchant} (last ${isoDay(s.last)})`).join("; ") + ". Not counted in the totals. If one was not something you cancelled, look at it." });

  const totals = { perMonth: r2(active.reduce((a, s) => a + s.perMonth, 0)), perYear: r2(active.reduce((a, s) => a + s.perYear, 0)), active: active.length, ended: ended.length };
  return { subs, active, ended, doubleCharges, overlaps, upcoming, findings, totals, range: { first: firstDay, last: lastDay, asOf, days: spanDays }, charges: rows.length, merchants: groups.size, shortFile: spanDays < 75 };
}

// Recurring money actually charged in each calendar month of the file, from the
// detected subscriptions only (ended ones included: they were paid then). The
// first and last months are partial when the export starts or stops mid-month.
export function monthlyTimeline(a) {
  const by = new Map();
  for (const s of a.subs) for (const h of s.history) {
    const m = isoDay(h.day).slice(0, 7);
    const e = by.get(m) || { month: m, total: 0, charges: 0 };
    e.total = r2(e.total + h.amount); e.charges++;
    by.set(m, e);
  }
  const rows = [...by.values()].sort((x, y) => (x.month < y.month ? -1 : 1));
  const first = isoDay(a.range.first).slice(0, 7), lastM = isoDay(a.range.last).slice(0, 7);
  for (const r of rows) r.partial = (r.month === first && isoDay(a.range.first).slice(8) !== "01") || (r.month === lastM && r.month !== first && new Date(Date.UTC(+r.month.slice(0, 4), +r.month.slice(5, 7), 0)).getUTCDate() > +isoDay(a.range.last).slice(8));
  return rows;
}

// What cancelling a set of merchants saves. Names come from analyze().
export function savings(a, cancelled) {
  const set = new Set(cancelled);
  const hit = a.active.filter((s) => set.has(s.merchant));
  return { count: hit.length, perMonth: r2(hit.reduce((x, s) => x + s.perMonth, 0)), perYear: r2(hit.reduce((x, s) => x + s.perYear, 0)) };
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function reportCsv(a) {
  const head = ["merchant", "status", "cadence", "fixed_price", "charges_seen", "latest_amount", "per_month", "per_year", "last_charge", "next_expected", "price_rises"];
  const lines = [head.join(",")];
  for (const s of a.subs) lines.push([s.merchant, s.status, s.cadenceLabel, s.fixed ? "yes" : "no", s.count, s.amount.toFixed(2), s.perMonth.toFixed(2), s.perYear.toFixed(2), isoDay(s.last), s.status === "active" ? isoDay(s.next) : "", s.rises.length].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}

const icsText = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (day) => isoDay(day).replace(/-/g, "");

// Calendar file of the next expected charge for each active subscription that
// bills monthly or less often (weekly and two-weekly ones would bury the
// calendar), each with a reminder `leadDays` before so there is time to cancel.
// The date is the last charge plus one cycle: a guess from the statement.
export function renewalsIcs(a, { leadDays = 3, stamp = null } = {}) {
  const lead = Number.isInteger(leadDays) && leadDays >= 0 && leadDays <= 60 ? leadDays : 3;
  const dtstamp = stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//subscription-audit-from-statement//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Subscription renewals"];
  for (const s of a.active) {
    if (s.cadence === "weekly" || s.cadence === "biweekly") continue;
    out.push("BEGIN:VEVENT", `UID:${icsDate(s.next)}-${icsText(s.merchant).replace(/[^A-Za-z0-9]+/g, "-")}@subscription-audit-from-statement`, `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${icsDate(s.next)}`, `DTEND;VALUE=DATE:${icsDate(s.next + 1)}`,
      `SUMMARY:${icsText(`${s.merchant} renews: ${usd(s.amount)}`)}`,
      `DESCRIPTION:${icsText(`${s.cadenceLabel} charge of ${usd(s.amount)} (about ${usd(s.perYear)} a year). Expected date is a guess from your statement. Cancel before this day if you do not want it.`)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(`${s.merchant} renews in ${lead} day(s)`)}`, `TRIGGER:-P${lead}D`, "END:VALARM", "END:VEVENT");
  }
  out.push("END:VCALENDAR");
  return out.join("\r\n") + "\r\n";
}

export function summaryText(a, cancelled = []) {
  const t = a.totals, out = [];
  out.push(`Subscription audit: ${a.charges} charge(s) from ${isoDay(a.range.first)} to ${isoDay(a.range.last)}.`);
  out.push(`${t.active} active recurring charge(s), about ${usd(t.perMonth)} a month, ${usd(t.perYear)} a year.`);
  for (const s of a.active) out.push(`- ${s.merchant}: ${usd(s.amount)} ${s.cadenceLabel.toLowerCase()} = ${usd(s.perMonth)}/mo (${usd(s.perYear)}/yr)${s.rises.length ? ", price has risen" : ""}`);
  const sv = savings(a, cancelled);
  if (sv.count) out.push(`Cancelling the ${sv.count} selected would save about ${usd(sv.perMonth)} a month, ${usd(sv.perYear)} a year.`);
  out.push("Estimates from the file supplied; merchants are grouped by name and may be wrong.");
  return out.join("\n");
}

// An invented person's statement: three months+ of charges with a price rise,
// a yearly renewal, overlapping streaming and one cancelled service.
export function sampleCsv() {
  const L = ["Date,Description,Amount"];
  const add = (date, desc, amt) => L.push(`${date},"${desc}",${amt}`);
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
  months.forEach((m, i) => {
    add(`${m}-03`, "NETFLIX.COM 866-579-7172 CA", i < 5 ? "-15.49" : "-17.99");
    add(`${m}-11`, "SPOTIFY USA 877-7781161 NY", "-11.99");
    add(`${m}-14`, "HULU 877-8244858 CA", "-17.99");
    add(`${m}-19`, "PLANET FITNESS 0123 SEATTLE WA", "-24.99");
    add(`${m}-22`, "DISNEY PLUS 888-9057888 CA", "-13.99");
    add(`${m}-08`, `SQ *BLUE BOTTLE COFFEE ${100 + i} OAKLAND CA`, (-(4.5 + (i % 3))).toFixed(2));
    add(`${m}-${9 + (i % 4)}`.replace(/-(\d)$/, "-0$1"), `WHOLEFDS MKT ${200 + i} SEATTLE WA`, (-(60 + i * 7.3)).toFixed(2));
    add(`${m}-24`, `WHOLEFDS MKT ${300 + i} SEATTLE WA`, (-(41 + i * 3.1)).toFixed(2));
    add(`${m}-16`, "APPLE.COM/BILL 866-712-7753 CA", "-4.99");
    if (i < 4) add(`${m}-05`, "SKILLSHARE.COM NEW YORK NY", "-19.00");
  });
  add("2025-09-17", "DROPBOX*ANNUAL 8005555 CA", "-119.88");
  add("2026-09-17", "DROPBOX*ANNUAL 8005555 CA", "-119.88");
  add("2026-08-15", "HULU 877-8244858 CA", "-17.99");
  return L.sort((x, y) => (x.startsWith("Date") ? -1 : y.startsWith("Date") ? 1 : x.localeCompare(y))).join("\n") + "\n";
}
