// Change order log: status, pending exposure, aging and approved-CO lines for the schedule of values.
// Pure functions, no I/O. Money is integer cents; dates are whole UTC days.

export const STATUS_WORDS = {
  approved: ["approved", "executed", "signed", "accepted", "final"],
  pending: ["pending", "submitted", "proposed", "requested", "open", "draft", "pco", "cor", "in review", "under review", "priced"],
  rejected: ["rejected", "denied", "declined"],
  void: ["void", "voided", "withdrawn", "cancelled", "canceled", "superseded"],
};

export function parseCsv(text) {
  const rows = [];
  const src = String(text ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const delim = src.split("\n", 1)[0].includes("\t") ? "\t" : ",";
  let row = [], field = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

// $1,234.50, (1,234.50) and -1234.5 all parse; blank is 0; anything else is null.
export function parseMoney(s) {
  let t = String(s ?? "").trim();
  if (t === "") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
  t = t.replace(/[$,\s]/g, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [d, c = ""] = t.split(".");
  const v = parseInt(d, 10) * 100 + parseInt((c + "00").slice(0, 2), 10);
  return neg ? -v : v;
}

// YYYY-MM-DD or M/D/YYYY to a day number (days since 1970-01-01 UTC); blank is undefined; bad is null.
export function parseDate(s) {
  const t = String(s ?? "").trim();
  if (t === "") return undefined;
  let y, m, d, x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [m, d, y] = [+x[1], +x[2], +x[3]];
  else return null;
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return Math.round(ms / 86400000);
}
export const dayText = (n) => (n == null ? "" : new Date(n * 86400000).toISOString().slice(0, 10));

export function normStatus(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "") return null;
  for (const [k, words] of Object.entries(STATUS_WORDS)) if (words.includes(t)) return k;
  return undefined;
}

export const dollars = (c) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const HEADERS = {
  number: /^(co\s*(no\.?|number|#)?|no\.?|number|#|change order( no\.?| number| #)?|pco( no\.?| #)?|cor( no\.?| #)?|item|ref(erence)?)$/,
  desc: /^(description|desc|scope|title|name|change)$/,
  status: /^(status|state)$/,
  amount: /^(amount|value|price|cost|change order amount|co amount|\$|amount \(\$\))$/,
  days: /^(days|time|schedule( impact)?|time extension|extension( days)?|calendar days|days added)$/,
  submitted: /^(submitted|date submitted|sent|date sent|requested|date requested|date)$/,
  approved: /^(approved|date approved|executed|date executed|signed|date signed)$/,
  billed: /^(billed|billed to date|invoiced|previously billed|billed \(\$\)|completed to date)$/,
};

function mapHeaders(row) {
  const idx = {};
  row.forEach((h, i) => {
    const t = String(h).trim().toLowerCase().replace(/\s+/g, " ");
    for (const [k, re] of Object.entries(HEADERS)) if (idx[k] == null && re.test(t)) { idx[k] = i; break; }
  });
  return idx;
}

// "3", "CO 3", "co-3", "CO#3" all become "CO-3" for the schedule of values.
export function sovItem(number, i) {
  const t = String(number ?? "").trim();
  if (t === "") return `CO-${i}`;
  const m = /^(?:c\.?o\.?|change order)\s*[-#:\s]*\s*(.+)$/i.exec(t);
  return `CO-${(m ? m[1] : t).trim()}`;
}

/**
 * @param {string} text CSV or tab-separated log with a header row
 * @param {{originalContract?: string, asOf?: string, staleDays?: string|number}} settings
 */
export function compute(text, settings = {}) {
  const out = { lines: [], errors: [], findings: [], totals: null };
  const grid = parseCsv(text);
  if (grid.length < 2) { out.errors.push("Paste a header row and at least one change order."); return out; }
  const idx = mapHeaders(grid[0]);
  if (idx.amount == null) { out.errors.push("No amount column. Name a column 'Amount'."); return out; }
  if (idx.status == null) { out.errors.push("No status column. Name a column 'Status' (approved, pending, rejected or void)."); return out; }

  const original = parseMoney(settings.originalContract ?? "");
  if (original == null) { out.errors.push("Original contract sum is not a dollar amount."); return out; }
  const asOf = settings.asOf ? parseDate(settings.asOf) : Math.floor(Date.now() / 86400000);
  if (asOf == null) { out.errors.push("As-of date must be YYYY-MM-DD or M/D/YYYY."); return out; }
  const stale = settings.staleDays === "" || settings.staleDays == null ? 30 : Number(settings.staleDays);
  if (!Number.isInteger(stale) || stale < 1 || stale > 3650) { out.errors.push("Days before a pending change order counts as stale must be a whole number from 1 to 3650."); return out; }

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r], get = (k) => (idx[k] == null ? "" : String(row[idx[k]] ?? "").trim());
    const number = get("number"), desc = get("desc");
    const label = number ? `${number}${desc ? ` (${desc})` : ""}` : desc || `Row ${r + 1}`;
    const amount = parseMoney(get("amount")), billed = parseMoney(get("billed"));
    if (amount == null) { out.errors.push(`Row ${r + 1} (${label}): amount is not a dollar figure.`); continue; }
    if (billed == null) { out.errors.push(`Row ${r + 1} (${label}): billed is not a dollar figure.`); continue; }
    const status = normStatus(get("status"));
    if (status === null) { out.errors.push(`Row ${r + 1} (${label}): status is blank.`); continue; }
    if (status === undefined) { out.errors.push(`Row ${r + 1} (${label}): status "${get("status")}" is not one of approved, pending, rejected or void.`); continue; }
    const daysRaw = get("days");
    const days = daysRaw === "" ? 0 : /^-?\d+$/.test(daysRaw) ? parseInt(daysRaw, 10) : null;
    if (days == null) { out.errors.push(`Row ${r + 1} (${label}): days must be a whole number.`); continue; }
    const submitted = parseDate(get("submitted")), approved = parseDate(get("approved"));
    if (submitted === null) { out.errors.push(`Row ${r + 1} (${label}): submitted date must be YYYY-MM-DD or M/D/YYYY.`); continue; }
    if (approved === null) { out.errors.push(`Row ${r + 1} (${label}): approved date must be YYYY-MM-DD or M/D/YYYY.`); continue; }
    const age = status === "pending" && submitted !== undefined ? asOf - submitted : null;
    const turnaround = status === "approved" && submitted !== undefined && approved !== undefined ? approved - submitted : null;
    out.lines.push({ row: r + 1, number, desc, label, status, amount, billed, days, submitted, approved, age, turnaround });
  }
  if (out.errors.length) return out;
  if (!out.lines.length) { out.errors.push("No change orders found."); return out; }

  const by = (s) => out.lines.filter((x) => x.status === s);
  const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
  const A = by("approved"), P = by("pending"), R = by("rejected"), V = by("void");
  const approvedAdd = sum(A.filter((x) => x.amount > 0), "amount"), approvedDeduct = sum(A.filter((x) => x.amount < 0), "amount");
  const approvedNet = approvedAdd + approvedDeduct;
  const pendingNet = sum(P, "amount");
  const stalePending = P.filter((x) => x.age != null && x.age > stale);
  const turns = A.map((x) => x.turnaround).filter((t) => t != null && t >= 0);
  const totals = {
    original, approvedAdd, approvedDeduct, approvedNet,
    revisedContract: original + approvedNet,
    pendingNet, pendingAdd: sum(P.filter((x) => x.amount > 0), "amount"),
    potentialContract: original + approvedNet + pendingNet,
    rejectedNet: sum(R, "amount"), voidNet: sum(V, "amount"),
    counts: { approved: A.length, pending: P.length, rejected: R.length, void: V.length },
    approvedDays: sum(A, "days"), pendingDays: sum(P, "days"),
    billedApproved: sum(A, "billed"), billedOther: sum([...P, ...R, ...V], "billed"),
    staleCount: stalePending.length, staleAmount: sum(stalePending, "amount"),
    oldestPending: P.reduce((m, x) => (x.age != null && (m == null || x.age > m) ? x.age : m), null),
    avgTurnaround: turns.length ? Math.round(turns.reduce((a, b) => a + b, 0) / turns.length) : null,
    asOf, stale,
  };
  out.totals = totals;

  const F = (severity, title) => out.findings.push({ severity, title });
  for (const x of P) if (x.billed !== 0) F("high", `${x.label}: ${dollars(x.billed)} billed on a change order that is still pending. Work on an unapproved change is usually not billable yet; hold it until the change order is signed, unless your subcontract allows otherwise.`);
  for (const x of [...R, ...V]) if (x.billed !== 0) F("high", `${x.label}: ${dollars(x.billed)} billed on a change order marked ${x.status}. Take it off the schedule of values or get it re-approved.`);
  for (const x of A) {
    const over = x.amount >= 0 ? x.billed > x.amount || x.billed < 0 : x.billed < x.amount || x.billed > 0;
    if (over) F("high", `${x.label}: billed ${dollars(x.billed)} against an approved amount of ${dollars(x.amount)}. Billing must stay between zero and the approved amount.`);
  }
  if (stalePending.length) F("high", `${stalePending.length} pending change order${stalePending.length > 1 ? "s" : ""} worth ${dollars(totals.staleAmount)} ${stalePending.length > 1 ? "have" : "has"} waited more than ${stale} days (oldest: ${totals.oldestPending} days). Chase a signature, and check your subcontract's notice and claim deadlines before they pass.`);
  if (original > 0 && totals.pendingAdd * 10 > original) F("high", `Pending additions of ${dollars(totals.pendingAdd)} are ${((totals.pendingAdd * 100) / original).toFixed(1)}% of the original contract. That is unsigned money at risk if the work goes ahead first.`);
  const seen = new Map();
  for (const x of out.lines) if (x.number) seen.set(x.number.toLowerCase(), (seen.get(x.number.toLowerCase()) ?? 0) + 1);
  for (const [n, c] of seen) if (c > 1) F("info", `Change order number "${n}" appears ${c} times. Give each change order its own number so the owner's reviewer can match it.`);
  for (const x of A) if (x.approved === undefined) F("info", `${x.label}: approved, but no approval date. Record the date it was signed; it is your proof it may be billed.`);
  for (const x of A) if (x.approved !== undefined && x.submitted !== undefined && x.approved < x.submitted) F("info", `${x.label}: approved ${dayText(x.approved)}, before it was submitted ${dayText(x.submitted)}. Check the dates.`);
  for (const x of P) if (x.submitted === undefined) F("info", `${x.label}: pending with no submitted date, so its age cannot be tracked.`);
  for (const x of out.lines) if (x.amount === 0 && x.days === 0 && x.status !== "void") F("info", `${x.label}: no amount and no days. If it is a no-cost change, say so in the description; otherwise price it.`);
  if (totals.pendingDays > 0) F("info", `Pending change orders ask for ${totals.pendingDays} more day${totals.pendingDays === 1 ? "" : "s"}. Until they are approved, plan against the current completion date.`);
  out.findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  return out;
}

// Quote when needed; a typed cell that a spreadsheet would run as a formula gets a leading apostrophe.
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-\d+(\.\d+)?$/.test(s))) s = `'${s}`;
  return /[",\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const cents = (c) => (c / 100).toFixed(2);

// Approved change orders as schedule-of-values rows in the pay application generator's columns.
// "Previous" is what is billed to date; this period starts at zero.
export function sovRows(result) {
  const head = "Item,Description,Scheduled value,Previous,This period,Stored";
  const rows = result.lines.filter((x) => x.status === "approved").map((x, i) => [sovItem(x.number, i + 1), x.desc || x.number || "Change order", cents(x.amount), cents(x.billed), "0.00", "0.00"].map(csvCell).join(","));
  return [head, ...rows].join("\n");
}

export function logCsv(result) {
  const head = ["Number", "Description", "Status", "Amount", "Days", "Submitted", "Approved", "Billed", "Days pending", "Days to approve"];
  const rows = result.lines.map((x) => [x.number, x.desc, x.status, cents(x.amount), x.days, dayText(x.submitted), dayText(x.approved), cents(x.billed), x.age ?? "", x.turnaround ?? ""].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n");
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function summaryText(result, s = {}) {
  const t = result.totals;
  if (!t) return "";
  const L = (k, v) => `${k.padEnd(34)}${String(v).padStart(16)}`;
  return [
    s.project ? `Change order log: ${s.project}` : "Change order log",
    `As of ${dayText(t.asOf)}`,
    "",
    L("Original contract sum", dollars(t.original)),
    L(`Approved additions (${result.lines.filter((x) => x.status === "approved" && x.amount > 0).length})`, dollars(t.approvedAdd)),
    L(`Approved deductions (${result.lines.filter((x) => x.status === "approved" && x.amount < 0).length})`, dollars(t.approvedDeduct)),
    L("Revised contract sum", dollars(t.revisedContract)),
    L(`Pending (${t.counts.pending})`, dollars(t.pendingNet)),
    L("If every pending CO is approved", dollars(t.potentialContract)),
    L(`Rejected (${t.counts.rejected})`, dollars(t.rejectedNet)),
    L("Approved time extensions", plural(t.approvedDays, "day")),
    L("Pending time requested", plural(t.pendingDays, "day")),
    L(`Pending over ${t.stale} days`, `${t.staleCount} / ${dollars(t.staleAmount)}`),
    L("Average days to approve", t.avgTurnaround == null ? "n/a" : plural(t.avgTurnaround, "day")),
  ].join("\n");
}

// Plain wording listing open change orders, for the exceptions a signer may write on a progress waiver.
export function waiverExceptions(result) {
  const P = result.lines.filter((x) => x.status === "pending" && x.amount !== 0);
  if (!P.length) return "";
  const list = P.map((x) => `${x.number ? sovItem(x.number) : "unnumbered"}${x.desc ? `, ${x.desc}` : ""}: ${dollars(x.amount)}`).join("; ");
  const total = P.reduce((a, x) => a + x.amount, 0);
  return `Excepted from this waiver: pending change orders not yet approved or paid (${list}; total ${dollars(total)}), and retainage held to date.`;
}

export const SAMPLE_SETTINGS = { project: "Example Office Renovation", originalContract: "528000", asOf: "2026-11-25", staleDays: "30" };
export function sampleLog() {
  return [
    "CO #,Description,Status,Amount,Days,Submitted,Approved,Billed",
    "1,Added egress window,Approved,7800,2,2026-09-02,2026-09-16,7800",
    "2,Deduct owner-supplied fixtures,Approved,-3500,0,2026-09-10,2026-09-30,-3500",
    "3,Relocate panel after design change,Approved,12450,3,2026-10-01,2026-10-20,6000",
    "4,Extra blocking for owner's shelving,Pending,2180,0,2026-10-08,,0",
    "5,Overtime to recover schedule,Pending,9600,0,2026-11-12,,0",
    "6,Upgrade to LED troffers,Rejected,4300,0,2026-09-20,,0",
    "7,Added data drops (T&M),Pending,3150,1,2026-10-15,,1500",
  ].join("\n");
}
