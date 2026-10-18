// Rent increase notice checker: a rent roll in, per-unit cap and notice-period findings and a notice letter out.
// All arithmetic is integer cents / basis points. Rules are data (RULES) so a reviewer can read and correct them.

export const RULES_REVIEWED = "2026-10-06";

export const RULES = {
  CA: {
    name: "California",
    cite: "Civil Code 1947.12 (AB 1482) and 827",
    capBase: 5, capMax: 10, capNeedsCpi: true,
    minTenancyDays: 0,
    notice: (pct) => (pct > 10 ? 90 : 30),
    mailDays: 5,
    caveat: "Cap applies only to covered units (not buildings under 15 years old, not most single-family homes owned by a person with the required notice, not units under local rent control). Local ordinances can be stricter.",
  },
  OR: {
    name: "Oregon",
    cite: "ORS 90.323",
    capBase: 7, capMax: 10, capNeedsCpi: true,
    minTenancyDays: 365,
    notice: () => 90,
    mailDays: 0,
    caveat: "No increase in the first year of occupancy, and no more than one in 12 months. Buildings first occupied within 15 years are exempt. The state publishes the exact maximum percentage each year; use it if it differs.",
  },
  WA: {
    name: "Washington",
    cite: "RCW 59.18.140 (HB 1217, 2025)",
    capBase: 7, capMax: 10, capNeedsCpi: true,
    minTenancyDays: 0,
    notice: () => 90,
    mailDays: 0,
    caveat: "Exemptions include some new construction and small owner-occupied cases; local rules can add more. Check the statute for your building.",
  },
  NY: {
    name: "New York (outside rent stabilization)",
    cite: "Real Property Law 226-c and the Good Cause Eviction Law",
    capBase: 5, capMax: 10, capNeedsCpi: true,
    capOnlyIf: "goodCause",
    minTenancyDays: 0,
    notice: (pct, tenancyDays) => (pct < 5 ? 0 : tenancyDays < 365 ? 30 : tenancyDays < 730 ? 60 : 90),
    mailDays: 0,
    caveat: "The cap applies only to units covered by Good Cause Eviction (mark the row's good cause column yes). Rent-stabilized units are governed by the rent guidelines board, not this tool.",
  },
  OTHER: {
    name: "Another state (you supply the notice days)",
    cite: "your state statute and your lease",
    capBase: null, capMax: null, capNeedsCpi: false,
    minTenancyDays: 0,
    notice: null,
    mailDays: 0,
    caveat: "This tool does not know your state's cap or notice period. Enter the notice days from your lease or statute and it will date the notice for you.",
  },
};

const ALIASES = {
  unit: ["unit", "apt", "apartment", "address", "property", "unit #", "unit number"],
  tenant: ["tenant", "name", "resident", "tenant name"],
  current: ["current rent", "rent", "monthly rent", "current"],
  proposed: ["proposed rent", "new rent", "proposed", "new"],
  base: ["rent 12 months ago", "lowest rent last 12 months", "base rent", "prior rent"],
  start: ["tenancy start", "move in", "move-in", "move in date", "start", "lease start"],
  last: ["last increase", "last increase date", "last raise"],
  exempt: ["exempt", "exempt?"],
  goodCause: ["good cause", "good cause covered"],
};

export function parseCsv(text) {
  const rows = [];
  const src = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
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

export function parseMoney(s) {
  const t = String(s ?? "").trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [d, c = ""] = t.split(".");
  return parseInt(d, 10) * 100 + parseInt((c + "00").slice(0, 2), 10);
}

export function parseDate(s) {
  const t = String(s ?? "").trim();
  let y, m, d, x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [m, d, y] = [+x[1], +x[2], +x[3]];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export const iso = (dt) => dt.toISOString().slice(0, 10);
export const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000);
const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000);
export const dollars = (c) => {
  const format = (c) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(c));
  return c < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
const yes = (s) => /^(y|yes|true|1|x)$/i.test(String(s ?? "").trim());

// Basis points of allowed increase, or null when no cap applies.
export function capBasisPoints(rule, cpiPercent, goodCause) {
  if (!rule || rule.capBase == null) return null;
  if (rule.capOnlyIf === "goodCause" && !goodCause) return null;
  const cpi = Number(cpiPercent);
  const pct = Math.min(rule.capBase + (Number.isFinite(cpi) && cpi > 0 ? cpi : 0), rule.capMax);
  return Math.round(pct * 100);
}

export function maxAllowedCents(baseCents, bp) {
  return Math.floor((baseCents * (10000 + bp)) / 10000);
}

function headerMap(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const map = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const i = norm.findIndex((h) => names.includes(h));
    if (i >= 0) map[key] = i;
  }
  return map;
}

export function check(text, settings) {
  const s = {
    state: "CA", cpi: 0, noticeDate: null, mailed: false, otherNoticeDays: 60, effectiveDate: null, landlord: "", ...settings,
  };
  const rule = RULES[s.state] || RULES.OTHER;
  const findings = [];
  const table = parseCsv(text);
  const noticeDate = typeof s.noticeDate === "string" ? parseDate(s.noticeDate) : s.noticeDate;
  const wanted = typeof s.effectiveDate === "string" && s.effectiveDate ? parseDate(s.effectiveDate) : s.effectiveDate || null;
  if (!noticeDate) findings.push({ severity: "error", title: "Enter the date you will give the notice (YYYY-MM-DD)." });
  if (table.length < 2) {
    findings.push({ severity: "error", title: "The list needs a header row and at least one unit." });
    return { rows: [], findings, settings: s, rule, summary: summarise([], findings) };
  }
  const map = headerMap(table[0]);
  for (const need of ["unit", "current", "proposed"]) {
    if (map[need] === undefined) findings.push({ severity: "error", title: `No column found for "${need}". Recognised names: ${ALIASES[need].join(", ")}.` });
  }
  if (findings.some((f) => f.severity === "error" && /No column/.test(f.title))) return { rows: [], findings, settings: s, rule, summary: summarise([], findings) };

  const rows = [];
  const seen = new Set();
  const cell = (r, k) => (map[k] === undefined ? "" : (r[map[k]] ?? "").trim());
  table.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const unit = cell(r, "unit");
    const out = { line, unit, tenant: cell(r, "tenant"), status: "ok", reasons: [], notes: [] };
    rows.push(out);
    const cur = parseMoney(cell(r, "current"));
    const prop = parseMoney(cell(r, "proposed"));
    if (!unit) { out.status = "error"; out.reasons.push("no unit name"); return; }
    if (seen.has(unit.toLowerCase())) out.notes.push("unit appears more than once");
    seen.add(unit.toLowerCase());
    if (cur === null || cur <= 0) { out.status = "error"; out.reasons.push("current rent is not a dollar amount"); return; }
    if (prop === null || prop <= 0) { out.status = "error"; out.reasons.push("proposed rent is not a dollar amount"); return; }
    const baseRaw = cell(r, "base");
    const base = baseRaw === "" ? cur : parseMoney(baseRaw);
    if (base === null || base <= 0) { out.status = "error"; out.reasons.push("rent 12 months ago is not a dollar amount"); return; }
    Object.assign(out, { currentCents: cur, proposedCents: prop, baseCents: base });
    if (prop <= cur) { out.status = "info"; out.notes.push("not an increase; no notice period applies to this tool"); return; }
    out.pct = ((prop - base) / base) * 100;
    out.pctOnCurrent = ((prop - cur) / cur) * 100;

    const exempt = yes(cell(r, "exempt"));
    const goodCause = yes(cell(r, "goodCause"));
    const bp = exempt ? null : capBasisPoints(rule, s.cpi, goodCause);
    out.capPercent = bp === null ? null : bp / 100;
    if (bp !== null) {
      out.maxCents = maxAllowedCents(base, bp);
      if (prop > out.maxCents) { out.status = "over"; out.reasons.push(`exceeds the ${out.capPercent.toFixed(2)}% cap: most you can ask is ${dollars(out.maxCents)}`); }
    } else if (exempt) out.notes.push("marked exempt: no cap applied");
    else if (rule.capBase != null) out.notes.push("no cap applies to this row under the rules loaded");

    const startRaw = cell(r, "start");
    const start = startRaw ? parseDate(startRaw) : null;
    if (startRaw && !start) out.notes.push("tenancy start date not understood; tenancy length ignored");
    const tenancyDays = start && noticeDate ? daysBetween(start, noticeDate) : null;
    if (rule.minTenancyDays && !exempt) {
      if (tenancyDays !== null && tenancyDays < rule.minTenancyDays) { out.status = "over"; out.reasons.push(`${rule.name} does not allow an increase in the first year of occupancy (${tenancyDays} days so far)`); }
      else if (tenancyDays === null) out.notes.push("add a tenancy start date so the first-year rule can be checked");
    }
    const lastRaw = cell(r, "last");
    const last = lastRaw ? parseDate(lastRaw) : null;
    if (s.state === "OR" && last && noticeDate && daysBetween(last, noticeDate) < 365 && !exempt) {
      out.status = "over"; out.reasons.push("Oregon allows one increase in 12 months and the last one was less than a year ago");
    }

    let days;
    if (rule.notice) {
      days = rule.notice(out.pct, tenancyDays ?? 730);
      if (s.state === "NY" && tenancyDays === null && out.pct >= 5) out.notes.push("no tenancy start date: assumed over two years (90 days, the longest)");
    } else days = Number(s.otherNoticeDays) || 0;
    out.noticeDays = days;
    const extra = s.mailed ? rule.mailDays : 0;
    out.mailDays = extra;
    if (noticeDate && days > 0) {
      out.earliest = iso(addDays(noticeDate, days + extra));
      if (wanted && addDays(noticeDate, days + extra) > wanted) {
        if (out.status === "ok") out.status = "early";
        out.reasons.push(`the planned effective date ${iso(wanted)} is before the earliest date ${out.earliest}`);
      }
    } else if (noticeDate) out.earliest = iso(noticeDate);
  });
  if (rows.length > 0 && rows.every((r) => r.status === "error")) findings.push({ severity: "error", title: "No row could be read. Check the header names and the money columns." });
  return { rows, findings, settings: s, rule, summary: summarise(rows, findings) };
}

function summarise(rows, findings) {
  const count = (st) => rows.filter((r) => r.status === st).length;
  const raise = rows.filter((r) => r.proposedCents && r.currentCents && r.proposedCents > r.currentCents).reduce((a, r) => a + (r.proposedCents - r.currentCents), 0);
  return { units: rows.length, ok: count("ok"), over: count("over"), early: count("early"), errors: count("error") + findings.filter((f) => f.severity === "error").length, monthlyIncreaseCents: raise };
}

// A notice a landlord can adapt. It states the facts; it does not claim to satisfy a statute.
export function noticeText(row, result) {
  const { settings: s, rule } = result;
  if (!row.earliest || row.status === "error" || row.status === "info" || row.status === "over") return "";
  const lines = [
    `NOTICE OF RENT INCREASE`,
    ``,
    `To: ${row.tenant || "Tenant"}, ${row.unit}`,
    `From: ${s.landlord || "Landlord"}`,
    `Date of notice: ${iso(typeof s.noticeDate === "string" ? parseDate(s.noticeDate) : s.noticeDate)}${s.mailed ? " (served by mail)" : ""}`,
    ``,
    `Your monthly rent will increase from ${dollars(row.currentCents)} to ${dollars(row.proposedCents)}, an increase of ${dollars(row.proposedCents - row.currentCents)} per month.`,
    `The new rent takes effect on ${wantedOrEarliest(row, s)}.`,
    row.noticeDays ? `This notice gives ${row.noticeDays} days${row.mailDays ? ` plus ${row.mailDays} for mailing` : ""}, as the landlord understands ${rule.cite} to require.` : "",
    ``,
    `All other terms of your tenancy stay the same. Please contact the landlord with any questions.`,
    ``,
    `[Landlord signature] ______________________   [Date] ____________`,
  ];
  return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n");
}

function wantedOrEarliest(row, s) {
  const w = typeof s.effectiveDate === "string" ? s.effectiveDate : s.effectiveDate ? iso(s.effectiveDate) : "";
  return w && w > row.earliest ? w : row.earliest;
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function reportCsv(result) {
  const head = ["line", "unit", "tenant", "status", "current", "proposed", "increase_pct", "max_allowed", "notice_days", "earliest_effective", "reasons"];
  const body = result.rows.map((r) => [
    r.line, r.unit, r.tenant, r.status,
    r.currentCents != null ? (r.currentCents / 100).toFixed(2) : "",
    r.proposedCents != null ? (r.proposedCents / 100).toFixed(2) : "",
    r.pct != null ? r.pct.toFixed(2) : "",
    r.maxCents != null ? (r.maxCents / 100).toFixed(2) : "",
    r.noticeDays ?? "", r.earliest ?? "", r.reasons.join("; "),
  ]);
  return [head, ...body].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function noticesText(result) {
  return result.rows.filter((r) => r.status === "ok" || r.status === "early").map((r) => noticeText(r, result)).filter(Boolean).join("\n\n" + "=".repeat(60) + "\n\n");
}

export function sampleList() {
  return [
    "Unit,Tenant,Current rent,Proposed rent,Rent 12 months ago,Tenancy start,Last increase",
    "1A,Maria Lopez,1500,1560,1500,2022-03-01,2025-01-01",
    "1B,Sam Okafor,1800,1950,1800,2023-08-15,",
    "2A,Priya Nair,2000,2400,2000,2021-05-01,",
    "2B,Tom Becker,1650,1700,1650,2026-06-01,",
  ].join("\n");
}
export const SAMPLE_SETTINGS = { state: "CA", cpi: 3.4, noticeDate: "2026-11-01", mailed: false, landlord: "Example Property LLC" };
