// ABA authorization tracker: arithmetic on the user's own authorization list. Dates are whole UTC days,
// money is whole cents, units are whole units. Nothing here knows any payer's rules.

export const DAY = 86400000;

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const src = String(text).replace(/^﻿/, "");
  const delim = (src.split("\n")[0].match(/\t/g) || []).length > (src.split("\n")[0].match(/,/g) || []).length ? "\t" : ",";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export function parseCents(s) {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

export function parseUnits(s) {
  const t = String(s ?? "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100) / 100;
}

// Returns a day number (days since 1970-01-01 UTC) or null. Accepts 2026-03-31 and 3/31/2026.
export function parseDate(s) {
  const t = String(s ?? "").trim();
  let y, m, d, a;
  if ((a = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+a[1], +a[2], +a[3]];
  else if ((a = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [m, d, y] = [+a[1], +a[2], +a[3]];
  else return null;
  const ms = Date.UTC(y, m - 1, d);
  const chk = new Date(ms);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== m - 1 || chk.getUTCDate() !== d) return null;
  return ms / DAY;
}

export function fmtDate(day) {
  if (day == null || !Number.isFinite(day)) return "";
  return new Date(Math.round(day) * DAY).toISOString().slice(0, 10);
}

export function money(c) {
  const neg = c < 0;
  const a = Math.abs(Math.round(c));
  return `${neg ? "-" : ""}$${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
}

const ALIASES = {
  client: ["client", "client id", "patient", "patient id", "member", "initials", "id"],
  code: ["code", "cpt", "cpt code", "service", "service code", "hcpcs"],
  approved: ["units approved", "approved units", "approved", "authorized units", "authorized", "units authorized", "units"],
  start: ["start", "start date", "auth start", "effective", "from"],
  end: ["end", "end date", "auth end", "expires", "expiration", "to", "through"],
  used: ["units used", "used", "billed units", "units billed", "used to date"],
  weekly: ["units per week", "weekly units", "scheduled per week", "scheduled units per week", "per week"],
  rate: ["rate", "rate per unit", "unit rate", "reimbursement", "payer rate"],
};

export function parseAuths(text) {
  const rows = parseCsv(text);
  const out = { auths: [], errors: [] };
  if (rows.length < 2) { out.errors.push("Add a header row and at least one authorization."); return out; }
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [k, names] of Object.entries(ALIASES)) col[k] = head.findIndex((h) => names.includes(h));
  for (const k of ["client", "code", "approved", "start", "end"]) {
    if (col[k] < 0) { out.errors.push(`No ${k === "approved" ? "units approved" : k} column found. Expected a header such as "${ALIASES[k][0]}".`); }
  }
  if (out.errors.length) return out;
  rows.slice(1).forEach((r, i) => {
    const n = i + 2;
    const get = (k) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    const client = get("client"), code = get("code");
    if (!client) { out.errors.push(`Row ${n}: no client.`); return; }
    const approved = parseUnits(get("approved")), start = parseDate(get("start")), end = parseDate(get("end"));
    const used = get("used") === "" ? 0 : parseUnits(get("used"));
    const weekly = get("weekly") === "" ? null : parseUnits(get("weekly"));
    const rate = parseCents(get("rate"));
    if (approved == null || approved <= 0) { out.errors.push(`Row ${n}: units approved is not a positive number.`); return; }
    if (start == null || end == null) { out.errors.push(`Row ${n}: start or end date not read (use 2026-03-31 or 3/31/2026).`); return; }
    if (end < start) { out.errors.push(`Row ${n}: end is before start.`); return; }
    if (used == null) { out.errors.push(`Row ${n}: units used is not a number.`); return; }
    if (weekly === null && get("weekly") !== "") { out.errors.push(`Row ${n}: units per week is not a number.`); return; }
    if (rate == null) { out.errors.push(`Row ${n}: rate is not a dollar amount.`); return; }
    out.auths.push({ client, code: code || "(code not given)", approved, start, end, used, weekly, rateCents: rate });
  });
  return out;
}

const r1 = (x) => Math.round(x * 10) / 10;

// opts: asOf (day number), leadDays (days before end the reauthorization must be submitted), lowPct, unitMinutes
export function analyse(a, opts) {
  const { asOf, leadDays, lowPct } = opts;
  const totalDays = a.end - a.start + 1;
  const elapsed = Math.min(Math.max(asOf - a.start + 1, 0), totalDays);
  const remainingDays = Math.max(a.end - asOf, 0);
  const remainingUnits = a.approved - a.used;
  const started = asOf >= a.start;
  const expired = asOf > a.end;
  const observedPerWeek = elapsed > 0 ? (a.used / elapsed) * 7 : 0;
  const forecastPerWeek = a.weekly != null ? a.weekly : observedPerWeek;
  const forecastBasis = a.weekly != null ? "scheduled" : "observed";
  const projectedEnd = expired ? a.used : a.used + (forecastPerWeek / 7) * remainingDays;
  const projectedUnused = Math.max(a.approved - projectedEnd, 0);
  const projectedShort = Math.max(projectedEnd - a.approved, 0);
  const pctUsed = (a.used / a.approved) * 100;
  const pctTime = (elapsed / totalDays) * 100;
  let runOutDay = null;
  if (!expired && remainingUnits > 0 && forecastPerWeek > 0 && projectedEnd > a.approved) runOutDay = asOf + (remainingUnits / (forecastPerWeek / 7));
  const reauthBy = a.end - leadDays;
  const daysToReauth = reauthBy - asOf;
  const neededPerWeek = remainingDays > 0 && remainingUnits > 0 ? remainingUnits / (remainingDays / 7) : 0;
  const flags = [];
  if (a.used > a.approved) flags.push({ level: "high", text: `${r1(a.used - a.approved)} units used beyond what was approved. Units past the approval are usually not payable; check them before they are billed.` });
  if (expired) flags.push({ level: remainingUnits > 0 ? "high" : "info", text: remainingUnits > 0 ? `Expired on ${fmtDate(a.end)} with ${r1(remainingUnits)} units never used.` : `Expired on ${fmtDate(a.end)}.` });
  else if (!started) flags.push({ level: "info", text: `Starts ${fmtDate(a.start)}; nothing can be billed before then.` });
  else {
    if (runOutDay != null) flags.push({ level: "high", text: `At ${r1(forecastPerWeek)} units a week (${forecastBasis}) the units run out around ${fmtDate(runOutDay)}, ${Math.round(a.end - runOutDay)} days before the authorization ends. Sessions after that need a request for more units.` });
    if (daysToReauth < 0) flags.push({ level: "high", text: `The ${leadDays}-day reauthorization lead time has already passed (submit-by was ${fmtDate(reauthBy)}).` });
    else if (daysToReauth <= 14) flags.push({ level: "medium", text: `Reauthorization should go in by ${fmtDate(reauthBy)}, ${daysToReauth} days from now.` });
    if (projectedUnused > 0 && projectedEnd / a.approved * 100 < lowPct && pctTime >= 25) flags.push({ level: "medium", text: `Projected to use ${r1(projectedEnd / a.approved * 100)}% of the approval. About ${r1(projectedUnused)} units would expire unused${a.rateCents ? ` (${money(Math.round(projectedUnused * a.rateCents))} at the rate you gave)` : ""}. ${neededPerWeek ? `Using them all needs about ${r1(neededPerWeek)} units (${r1(neededPerWeek / 4)} hours at 15 minutes a unit) a week.` : ""}` });
  }
  const urgency = flags.some((f) => f.level === "high") ? 0 : flags.some((f) => f.level === "medium") ? 1 : 2;
  return { ...a, totalDays, elapsed, remainingDays, remainingUnits, started, expired, observedPerWeek, forecastPerWeek, forecastBasis, projectedEnd, projectedUnused, projectedShort, pctUsed, pctTime, runOutDay, reauthBy, daysToReauth, neededPerWeek, flags, urgency, atRiskCents: Math.round(projectedUnused * a.rateCents) };
}

export function calculate(text, opts = {}) {
  const o = { asOf: opts.asOf ?? Math.floor(Date.now() / DAY), leadDays: opts.leadDays ?? 45, lowPct: opts.lowPct ?? 85 };
  const parsed = parseAuths(text);
  const rows = parsed.auths.map((a) => analyse(a, o)).sort((x, y) => x.urgency - y.urgency || (x.runOutDay ?? x.end) - (y.runOutDay ?? y.end) || x.client.localeCompare(y.client));
  const live = rows.filter((r) => r.started && !r.expired);
  return {
    rows, errors: parsed.errors, opts: o,
    summary: {
      count: rows.length,
      needAttention: rows.filter((r) => r.urgency < 2).length,
      runningOut: rows.filter((r) => r.runOutDay != null).length,
      reauthDue: live.filter((r) => r.daysToReauth <= 14).length,
      atRiskCents: live.reduce((s, r) => s + r.atRiskCents, 0),
      unusedUnits: r1(live.reduce((s, r) => s + r.projectedUnused, 0)),
      hasRates: rows.some((r) => r.rateCents > 0),
    },
  };
}

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
export function reportCsv(res) {
  const head = ["Client", "Code", "Start", "End", "Units approved", "Units used", "Percent used", "Percent of time elapsed", "Forecast units per week", "Forecast basis", "Projected units at end", "Projected unused", "Projected short", "Units run out around", "Reauthorization submit by", "At risk (rate x unused)", "Flags"];
  const lines = [head.map(q).join(",")];
  for (const r of res.rows) lines.push([r.client, r.code, fmtDate(r.start), fmtDate(r.end), r.approved, r.used, r1(r.pctUsed), r1(r.pctTime), r1(r.forecastPerWeek), r.forecastBasis, r1(r.projectedEnd), r1(r.projectedUnused), r1(r.projectedShort), r.runOutDay != null ? fmtDate(r.runOutDay) : "", fmtDate(r.reauthBy), r.rateCents ? (r.atRiskCents / 100).toFixed(2) : "", r.flags.map((f) => f.text).join(" | ")].map(q).join(","));
  return lines.join("\n") + "\n";
}

export function sampleList(asOf = Math.floor(Date.now() / DAY)) {
  const d = (n) => fmtDate(asOf + n);
  return [
    "Client,CPT,Units approved,Start,End,Units used,Units per week,Rate",
    `A.B.,97153,1040,${d(-90)},${d(90)},620,40,18.75`,
    `A.B.,97155,104,${d(-90)},${d(90)},40,4,31.50`,
    `C.D.,97153,780,${d(-120)},${d(60)},210,15,18.75`,
    `E.F.,97153,520,${d(-30)},${d(150)},60,,18.75`,
    `G.H.,97151,16,${d(-10)},${d(80)},16,,95.00`,
    `I.J.,97153,600,${d(-200)},${d(-5)},470,,18.75`,
    `K.L.,97156,48,${d(-60)},${d(30)},40,2,28.00`,
  ].join("\n");
}
