// Rent-roll delinquency for small landlords: reads a rent ledger CSV (one row per
// charge: unit or tenant, due date, amount due, amount paid, date paid) and shows
// what is owed and how old it is, which units pay late and how often, the share of
// rent collected and collected on time per month, and what late fees the lease
// would have allowed if you type one in. Column names are matched by alias because
// every property-management export and every landlord's sheet names them
// differently; no real export was available when this was written. Pure
// functions, no DOM, no network.

export const DEFAULT_GRACE_DAYS = 5;
export const CHRONIC_MIN_CHARGES = 3;

const ALIASES = {
  due: ["due date", "charge date", "date due", "rent due", "period", "month", "due", "date", "posted", "posting date"],
  unit: ["unit", "unit number", "unit #", "apt", "apartment", "property", "address", "tenant", "tenant name", "resident", "renter", "lease", "name"],
  amount: ["amount due", "rent due amount", "charge amount", "charged", "rent amount", "monthly rent", "rent charged", "billed", "charge", "rent", "due amount", "amount"],
  paid: ["amount paid", "paid amount", "payment amount", "payments", "received", "collected", "payment", "paid"],
  paidOn: ["date paid", "paid date", "payment date", "paid on", "received date", "date received", "deposit date", "cleared"],
  kind: ["charge type", "type", "category", "description", "item"],
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
const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
const days = (a, b) => Math.round((a - b) / DAY);

// Returns { items, skipped, columns, dmy, error }. An item is
// { line, unit, due, amount, paid, paidOn } with amounts in dollars, positive.
// A row with no amount but a payment is a payment-only line and is kept with
// amount 0 so the money still counts as collected.
export function normalizeRows(table, { decimalComma = false } = {}) {
  const empty = { items: [], skipped: [], columns: {}, dmy: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.due !== undefined && c.unit !== undefined && c.amount !== undefined && c.paid !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Due Date”, “Unit” (or “Tenant”), “Amount Due” (or “Rent”) and “Amount Paid”, plus ideally “Date Paid”. Export your rent ledger or copy it into a table with those headers, one row per monthly charge." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).flatMap((l) => [get(l, "due"), get(l, "paidOn")]));
  const items = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    if (line.every((x) => !String(x).trim())) continue;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const due = parseWhen(get(line, "due"), dmy);
    if (!due) { skipped.push({ line: lineNo, reason: "due date not readable" }); continue; }
    const unit = get(line, "unit");
    if (!unit) { skipped.push({ line: lineNo, reason: "no unit or tenant" }); continue; }
    const amount = isBlank(get(line, "amount")) ? 0 : parseNumber(get(line, "amount"), decimalComma);
    const paid = isBlank(get(line, "paid")) ? 0 : parseNumber(get(line, "paid"), decimalComma);
    if (!Number.isFinite(amount)) { skipped.push({ line: lineNo, reason: "amount due not readable" }); continue; }
    if (!Number.isFinite(paid)) { skipped.push({ line: lineNo, reason: "amount paid not readable" }); continue; }
    if (amount === 0 && paid === 0) { skipped.push({ line: lineNo, reason: "no amount due or paid" }); continue; }
    const paidRaw = get(line, "paidOn");
    const paidOn = isBlank(paidRaw) ? null : parseWhen(paidRaw, dmy);
    if (!isBlank(paidRaw) && !paidOn) { skipped.push({ line: lineNo, reason: "paid date not readable" }); continue; }
    items.push({ line: lineNo, unit, due: due.t, amount: r2(Math.abs(amount)), paid: r2(Math.max(paid, 0)), paidOn: paidOn ? paidOn.t : null });
  }
  if (!items.length) return { ...empty, skipped, columns: cols, dmy, error: "No charges could be read from the file. " + (skipped.length ? `${skipped.length} row(s) were skipped (first: line ${skipped[0].line}, ${skipped[0].reason}).` : "") };
  return { items, skipped, columns: cols, dmy };
}

export const BUCKETS = [
  { id: "d1_30", label: "1–30 days", min: 1, max: 30 },
  { id: "d31_60", label: "31–60 days", min: 31, max: 60 },
  { id: "d61_90", label: "61–90 days", min: 61, max: 90 },
  { id: "d90p", label: "Over 90 days", min: 91, max: Infinity },
];

// items: normalizeRows(...).items. asOf is the day the ledger is read on (ms, UTC
// midnight); a charge is owed only if it fell due on or before it. lateFee is a
// flat dollar amount you type (0 = none); graceDays is how many days after the due
// date before a payment counts as late. Both are assumptions the page labels as
// such; local law and your lease decide what may be charged.
export function analyze(rawItems, { asOf = null, graceDays = DEFAULT_GRACE_DAYS, lateFee = 0, minCharges = CHRONIC_MIN_CHARGES } = {}) {
  if (!rawItems.length) return { invalid: "No charges to analyze." };
  const asOfT = asOf ?? Math.max(...rawItems.map((x) => Math.max(x.due, x.paidOn ?? 0)));
  const grace = Math.max(0, Math.floor(graceDays));
  const fee = Math.max(0, lateFee);
  // A payment dated after the as-of day had not happened yet on that day.
  const due = rawItems.filter((x) => x.due <= asOfT).map((x) => (x.paidOn !== null && x.paidOn > asOfT ? { ...x, paid: 0, paidOn: null } : x));
  if (!due.length) return { invalid: "No charges fall due on or before the date you chose." };

  // One record per charge: what is still owed, and how late it was paid or is.
  const rows = due.map((x) => {
    const owed = r2(Math.max(x.amount - x.paid, 0));
    const over = r2(Math.max(x.paid - x.amount, 0));
    const paidInFull = x.amount > 0 && x.paid >= x.amount;
    let daysLate = null;
    if (paidInFull && x.paidOn !== null) daysLate = Math.max(days(x.paidOn, x.due), 0);
    else if (owed > 0) daysLate = Math.max(days(asOfT, x.due), 0);
    const late = daysLate !== null && daysLate > grace;
    return { ...x, owed, over, paidInFull, partial: x.paid > 0 && x.paid < x.amount, daysLate, late };
  });

  const total = {
    charges: rows.length,
    billed: r2(rows.reduce((s, x) => s + x.amount, 0)),
    collected: r2(rows.reduce((s, x) => s + Math.min(x.paid, x.amount), 0)),
    owed: r2(rows.reduce((s, x) => s + x.owed, 0)),
    overpaid: r2(rows.reduce((s, x) => s + x.over, 0)),
  };
  total.collectedRate = total.billed > 0 ? total.collected / total.billed : null;
  const paidChargesWithDate = rows.filter((x) => x.paidInFull && x.paidOn !== null);
  const onTime = rows.filter((x) => x.amount > 0 && x.daysLate !== null && !x.late && x.paidInFull);
  total.onTimeRate = rows.filter((x) => x.amount > 0).length ? onTime.length / rows.filter((x) => x.amount > 0).length : null;

  // Aging of what is still owed, by how long the charge has been past due.
  const aging = BUCKETS.map((b) => {
    const list = rows.filter((x) => x.owed > 0 && x.daysLate !== null && x.daysLate >= b.min && x.daysLate <= b.max);
    return { ...b, count: list.length, amount: r2(list.reduce((s, x) => s + x.owed, 0)) };
  });
  const notYetLate = rows.filter((x) => x.owed > 0 && x.daysLate === 0);
  const agedTotal = aging.reduce((s, b) => s + b.amount, 0);
  const current = { count: notYetLate.length, amount: r2(notYetLate.reduce((s, x) => s + x.owed, 0)) };

  const unitMap = new Map();
  for (const x of rows) { const k = norm(x.unit); (unitMap.get(k) ?? unitMap.set(k, { label: x.unit, list: [] }).get(k)).list.push(x); }
  const byUnit = [...unitMap.values()].map(({ label, list }) => {
    const billed = list.reduce((s, x) => s + x.amount, 0);
    const owed = list.reduce((s, x) => s + x.owed, 0);
    const paidList = list.filter((x) => x.daysLate !== null && x.amount > 0);
    const lateCount = list.filter((x) => x.late).length;
    const oldest = list.filter((x) => x.owed > 0).reduce((m, x) => Math.max(m, x.daysLate ?? 0), 0);
    return {
      label, charges: list.length, billed: r2(billed), owed: r2(owed), oldestDays: owed > 0 ? oldest : null,
      lateCount, lateShare: paidList.length ? lateCount / paidList.length : null,
      avgDaysLate: paidList.length ? paidList.reduce((s, x) => s + x.daysLate, 0) / paidList.length : null,
      partials: list.filter((x) => x.partial).length,
    };
  }).sort((a, b) => (b.owed - a.owed) || ((b.lateShare ?? 0) - (a.lateShare ?? 0)) || (a.label < b.label ? -1 : 1));

  const monthMap = new Map();
  for (const x of rows) { const k = monthKey(x.due); (monthMap.get(k) ?? monthMap.set(k, []).get(k)).push(x); }
  const byMonth = [...monthMap].map(([label, list]) => {
    const billed = list.reduce((s, x) => s + x.amount, 0);
    const collected = list.reduce((s, x) => s + Math.min(x.paid, x.amount), 0);
    const positive = list.filter((x) => x.amount > 0);
    const onTimeN = positive.filter((x) => x.paidInFull && x.daysLate !== null && !x.late).length;
    return { label, charges: list.length, billed: r2(billed), collected: r2(collected), owed: r2(list.reduce((s, x) => s + x.owed, 0)), collectedRate: billed > 0 ? collected / billed : null, onTimeRate: positive.length ? onTimeN / positive.length : null };
  }).sort((a, b) => (a.label < b.label ? -1 : 1));

  const withOwed = byUnit.filter((u) => u.owed > 0);
  const chronic = byUnit.filter((u) => u.charges >= minCharges && u.lateCount >= minCharges && u.lateShare !== null && u.lateShare >= 0.5);
  const lateRows = rows.filter((x) => x.late);
  const lateFeesAllowed = fee > 0 ? r2(lateRows.length * fee) : 0;
  const topShare = withOwed.length && total.owed > 0 ? withOwed[0].owed / total.owed : null;
  const partialCount = rows.filter((x) => x.partial).length;
  const undated = paidChargesWithDate.length === 0 && rows.some((x) => x.paid > 0);

  const findings = [];
  if (total.owed > 0) findings.push({ severity: agedTotal - aging[0].amount > 0 ? "high" : "medium", title: `${usd(total.owed)} is unpaid across ${withOwed.length} unit${withOwed.length === 1 ? "" : "s"}`, detail: aging.filter((b) => b.amount > 0).map((b) => `${b.label}: ${usd(b.amount)} (${b.count})`).concat(current.amount > 0 ? [`Not yet late: ${usd(current.amount)} (${current.count})`] : []).join("; ") + `. Age is counted from each charge's due date to ${dateStr(asOfT)}.` });
  const old = aging.filter((b) => b.min >= 61 && b.amount > 0);
  if (old.length) findings.push({ severity: "high", title: `${usd(old.reduce((s, b) => s + b.amount, 0))} has been unpaid more than 60 days`, detail: `The older a balance gets the less likely it is collected; what notices or steps are allowed, and when, depends on your lease and local law and is not modelled here. Units: ${withOwed.filter((u) => (u.oldestDays ?? 0) > 60).map((u) => `${u.label} (${usd(u.owed)}, oldest ${u.oldestDays} days)`).join("; ")}.` });
  if (topShare !== null && topShare >= 0.5 && withOwed.length > 1) findings.push({ severity: "info", title: `${withOwed[0].label} accounts for ${(topShare * 100).toFixed(0)}% of what is owed`, detail: `${usd(withOwed[0].owed)} of ${usd(total.owed)}. One account, not a building-wide collection problem.` });
  if (chronic.length) findings.push({ severity: "medium", title: `Habitually late: ${chronic.map((u) => u.label).join(", ")}`, detail: chronic.map((u) => `${u.label}: late on ${u.lateCount} of ${u.charges} charges (more than ${grace} day${grace === 1 ? "" : "s"} after due), averaging ${u.avgDaysLate.toFixed(1)} days`).join("; ") + `. A unit needs ${minCharges} late payments and half its charges late to be listed.` });
  if (lateRows.length && fee > 0) findings.push({ severity: "info", title: `${lateRows.length} charge${lateRows.length === 1 ? "" : "s"} paid late or still unpaid past the ${grace}-day grace, worth ${usd(lateFeesAllowed)} at a ${usd(fee)} fee`, detail: `An upper bound: it assumes your lease gives a flat ${usd(fee)} fee after ${grace} days and that local law permits it. Many places cap late fees, require a longer grace period, or forbid them, and a fee already charged is not in this file, so it is not netted off. Check before billing.` });
  if (partialCount) findings.push({ severity: "info", title: `${partialCount} charge${partialCount === 1 ? "" : "s"} paid in part`, detail: `${usd(rows.filter((x) => x.partial).reduce((s, x) => s + x.owed, 0))} is still owed on them. Whether accepting a part-payment affects a notice you have served depends on where you are; ask before you deposit one.` });
  if (total.overpaid > 0) findings.push({ severity: "info", title: `${usd(total.overpaid)} was paid over what was charged`, detail: "Overpayments are not netted against other charges; they may be a prepayment or a wrong amount entered. They are shown here so the collected figure is not overstated." });
  if (undated) findings.push({ severity: "medium", title: "No payment dates were found", detail: "Without a Date Paid column, a paid charge's lateness is unknown, so on-time rates and habitually-late units cannot be worked out. Balances and aging are still correct." });
  if (total.owed === 0) findings.push({ severity: "info", title: "Nothing is owed as of " + dateStr(asOfT), detail: "Every charge that fell due on or before that date is paid in full." });

  return {
    rows, byUnit, byMonth, aging, current, findings, chronic, withOwed,
    summary: { ...total, from: Math.min(...rows.map((x) => x.due)), to: asOfT, units: byUnit.length, agedTotal: r2(agedTotal), late: lateRows.length, lateFeesAllowed, grace, fee, partials: partialCount },
  };
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Plain text for pasting into a note, an email to a partner or a bookkeeper.
export function summaryText(r) {
  const s = r.summary;
  const m = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US") : "n/a");
  const lines = [
    `Rent ledger ${dateStr(s.from)} to ${dateStr(s.to)}: ${s.charges} charges on ${s.units} unit(s), ${m(s.billed)} billed, ${m(s.collected)} collected (${pct(s.collectedRate)}), ${m(s.owed)} unpaid`,
  ];
  const agedLine = r.aging.filter((b) => b.amount > 0).map((b) => `${b.label} ${m(b.amount)}`).join(", ");
  if (agedLine) lines.push(`Unpaid by age: ${agedLine}` + (r.current.amount > 0 ? `, not yet late ${m(r.current.amount)}` : ""));
  for (const u of r.withOwed.slice(0, 6)) lines.push(`  ${u.label}: ${m(u.owed)} owed, oldest ${u.oldestDays} days`);
  if (s.onTimeRate !== null) lines.push(`Paid in full within ${s.grace} day(s) of due date: ${pct(s.onTimeRate)} of charges`);
  if (r.chronic.length) lines.push(`Habitually late: ${r.chronic.map((u) => u.label).join(", ")}`);
  lines.push("Made with the Rent Roll Delinquency Analyzer (nothing uploaded). Figures come from the file supplied; not legal advice.");
  return lines.join("\n");
}

// Synthetic, invented ledger for the "Load an example" button. Not a real landlord.
export function sampleCsv() {
  const lines = ["Unit,Due Date,Amount Due,Amount Paid,Date Paid"];
  const units = [
    { u: "1A", rent: 1450, style: "ontime" },
    { u: "1B", rent: 1500, style: "ontime" },
    { u: "2A", rent: 1625, style: "late" },
    { u: "2B", rent: 1600, style: "ontime" },
    { u: "3A", rent: 1725, style: "behind" },
    { u: "3B", rent: 1700, style: "partial" },
  ];
  for (let mo = 3; mo <= 8; mo++) {
    for (const [i, x] of units.entries()) {
      const due = Date.UTC(2026, mo, 1);
      const iso = dateStr(due);
      const last = mo === 8;
      let paid = x.rent, offset = (i + mo) % 3;
      if (x.style === "late") offset = 8 + ((mo + i) % 6);
      if (x.style === "behind" && mo >= 6) paid = 0;
      if (x.style === "partial" && (mo === 7 || mo === 8)) paid = Math.round(x.rent * 0.5);
      if (last && x.style === "ontime" && i === 3) paid = 0;
      lines.push(paid > 0 ? [x.u, iso, x.rent, paid, dateStr(due + offset * DAY)].join(",") : [x.u, iso, x.rent, 0, ""].join(","));
    }
  }
  return lines.join("\n");
}
