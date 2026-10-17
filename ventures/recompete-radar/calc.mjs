// Recompete Radar: find the US federal contracts a small business could bid
// on again, from public award data it already holds (USAspending.gov).
//
// A federal contract that ends is usually re-solicited. The people who know
// the end dates early are the incumbent and the paid market-intelligence
// vendors; this works them out from public data. Everything here is a pure
// function over award rows, so the page can feed it rows fetched from the
// USAspending API or pasted from a USAspending CSV download, and tests can
// feed it fixtures.
//
// What it does not know: whether an award has unexercised option years (the
// "current end date" excludes them), whether the agency will recompete, set
// aside or cancel it, or whether a solicitation is already on SAM.gov. Those
// are why every result says "check", not "bid".

export const DEFAULTS = Object.freeze({
  windowMonths: 18, // look this far ahead for end dates
  leadMonths: 9, // typical gap between solicitation and the old contract ending
  minValue: 0,
  lookbackYears: 3, // awards with an action this recently are fetched
});

const MS_DAY = 86_400_000;

// Column names seen in the API's `spending_by_award` results and in the
// USAspending "award data archive" / custom-download CSVs, lower-cased with
// non-alphanumerics removed. First match wins.
const ALIASES = {
  id: ["awardid", "awardidpiid", "piid", "generatedunique awardid", "generateduniqueawardid"],
  vendor: ["recipientname", "recipient", "vendor", "vendorname"],
  amount: ["awardamount", "totalobligation", "totaldollarsobligated", "currenttotalvalueofaward", "baseandexercisedoptionsvalue", "amount"],
  start: ["startdate", "periodofperformancestartdate", "start"],
  end: ["enddate", "periodofperformancecurrentenddate", "currentenddate", "end"],
  agency: ["awardingagency", "awardingagencyname", "agency"],
  subAgency: ["awardingsubagency", "awardingsubagencyname", "subagency", "office"],
  description: ["description", "awarddescription", "title"],
  naics: ["naics", "naicscode"],
  setAside: ["typeofsetaside", "setaside", "typeofsetasidedescription"],
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function pickField(row, names) {
  const keys = new Map(Object.keys(row).map((k) => [norm(k), k]));
  for (const n of names) {
    const k = keys.get(norm(n));
    if (k !== undefined && row[k] !== null && row[k] !== undefined && row[k] !== "") return row[k];
  }
  return undefined;
}

export function parseDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const s = value.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) {
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!us) return null;
    m = [null, us[3], us[1].padStart(2, "0"), us[2].padStart(2, "0")];
  }
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Reject 2026-02-31 style dates that Date.UTC rolls over.
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const neg = /^\(.*\)$/.test(value.trim());
  const n = Number(value.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n) || value.replace(/[^0-9]/g, "") === "") return null;
  return neg ? -Math.abs(n) : n;
}

export function monthsBetween(a, b) {
  return (b.getTime() - a.getTime()) / MS_DAY / 30.4375;
}

/** Turn raw API rows or parsed CSV rows into awards; rows without a usable end date or amount are counted, not guessed. */
export function normalizeAwards(rows) {
  const awards = [];
  let dropped = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") { dropped += 1; continue; }
    const end = parseDate(pickField(row, ALIASES.end));
    const amount = parseMoney(pickField(row, ALIASES.amount));
    const vendor = String(pickField(row, ALIASES.vendor) ?? "").trim();
    if (!end || amount === null || !vendor) { dropped += 1; continue; }
    awards.push({
      id: String(pickField(row, ALIASES.id) ?? ""),
      vendor,
      amount,
      start: parseDate(pickField(row, ALIASES.start)),
      end,
      agency: String(pickField(row, ALIASES.agency) ?? "").trim(),
      subAgency: String(pickField(row, ALIASES.subAgency) ?? "").trim(),
      description: String(pickField(row, ALIASES.description) ?? "").trim(),
      naics: String(pickField(row, ALIASES.naics) ?? "").trim(),
      setAside: String(pickField(row, ALIASES.setAside) ?? "").trim(),
    });
  }
  return { awards, dropped };
}

/** RFC 4180-ish CSV parser (quoted fields, doubled quotes, CRLF). Returns objects keyed by header. */
export function parseCsv(text) {
  const rows = [];
  let field = "", row = [], q = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 1; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

export function median(xs) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function quantile(xs, p) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const pos = (a.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

/** Herfindahl-Hirschman index on 0..10000 over a map of vendor -> dollars. Positive dollars only. */
export function hhi(byVendor) {
  const vals = [...byVendor.values()].filter((v) => v > 0);
  const total = vals.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  return vals.reduce((s, v) => s + (100 * v / total) ** 2, 0);
}

function sumBy(awards, key) {
  const m = new Map();
  for (const a of awards) if (a.amount > 0) m.set(a[key] || "(unknown)", (m.get(a[key] || "(unknown)") || 0) + a.amount);
  return m;
}

const topN = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/**
 * @param {Array} awards normalised awards
 * @param {{today?: Date, windowMonths?: number, leadMonths?: number, minValue?: number}} opts
 */
export function analyze(awards, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const today = o.today ?? new Date();
  const rows = (awards ?? []).filter((a) => a.amount >= o.minValue);

  const recompetes = [];
  let alreadyEnded = 0, beyondWindow = 0;
  for (const a of rows) {
    const monthsLeft = monthsBetween(today, a.end);
    if (monthsLeft < 0) { alreadyEnded += 1; continue; }
    if (monthsLeft > o.windowMonths) { beyondWindow += 1; continue; }
    const years = a.start ? Math.max(monthsBetween(a.start, a.end) / 12, 1 / 12) : null;
    const solicitation = new Date(a.end.getTime() - o.leadMonths * 30.4375 * MS_DAY);
    let stage;
    if (monthsLeft <= 3) stage = "ending now: any follow-on is probably already solicited or sole-sourced; check SAM.gov";
    else if (monthsLeft <= o.leadMonths) stage = "solicitation window: look for the notice on SAM.gov now";
    else stage = "early: get on the incumbent's and agency's radar before the notice";
    recompetes.push({
      ...a,
      monthsLeft,
      annualValue: years ? a.amount / years : null,
      likelySolicitation: solicitation,
      stage,
    });
  }
  recompetes.sort((x, y) => x.end - y.end || y.amount - x.amount);

  const byVendor = sumBy(rows, "vendor");
  const byAgency = sumBy(rows, "agency");
  const amounts = rows.map((a) => a.amount).filter((v) => v > 0);
  const total = amounts.reduce((s, v) => s + v, 0);
  const vendorRank = topN(byVendor, 10).map(([name, dollars]) => ({
    name,
    dollars,
    share: total ? dollars / total : 0,
    awards: rows.filter((a) => a.vendor === name).length,
    expiring: recompetes.filter((a) => a.vendor === name).length,
  }));

  return {
    considered: rows.length,
    totalDollars: total,
    recompetes,
    alreadyEnded,
    beyondWindow,
    expiringDollars: recompetes.reduce((s, a) => s + Math.max(a.amount, 0), 0),
    sizes: { p25: quantile(amounts, 0.25), median: median(amounts), p75: quantile(amounts, 0.75), max: amounts.length ? Math.max(...amounts) : null },
    topVendors: vendorRank,
    topAgencies: topN(byAgency, 8).map(([name, dollars]) => ({ name, dollars, share: total ? dollars / total : 0 })),
    concentration: hhi(byVendor),
    top3Share: total ? topN(byVendor, 3).reduce((s, [, v]) => s + v, 0) / total : null,
  };
}

/** Plain reading of an HHI, using the DOJ/FTC 2023 merger-guideline cut-offs (1,000 / 1,800). */
export function readConcentration(h) {
  if (h === null || h === undefined) return "not enough data";
  if (h < 1000) return "fragmented: no vendor holds the market";
  if (h < 1800) return "moderately concentrated";
  return "highly concentrated: a few incumbents hold most of the dollars";
}

/** USAspending `spending_by_award` request body for contracts in a NAICS, optionally one state and set-aside. */
export function buildRequest({ naics, state = "", setAsides = [], page = 1, lookbackYears = DEFAULTS.lookbackYears, today = new Date() }) {
  const code = String(naics ?? "").replace(/\D/g, "");
  if (code.length < 2 || code.length > 6) throw new Error("NAICS must be 2 to 6 digits");
  const end = today.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(today.getUTCFullYear() - lookbackYears, today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10);
  const filters = {
    award_type_codes: ["A", "B", "C", "D"],
    naics_codes: [code],
    time_period: [{ start_date: start, end_date: end }],
  };
  if (state) {
    if (!/^[A-Za-z]{2}$/.test(state)) throw new Error("State must be a two-letter code");
    filters.place_of_performance_locations = [{ country: "USA", state: state.toUpperCase() }];
  }
  if (setAsides.length) filters.set_aside_type_codes = setAsides;
  return {
    filters,
    fields: ["Award ID", "Recipient Name", "Award Amount", "Start Date", "End Date", "Awarding Agency", "Awarding Sub Agency", "Description"],
    page,
    limit: 100,
    sort: "Award Amount",
    order: "desc",
  };
}

export function money(n) {
  if (n === null || n === undefined) return "n/a";
  const abs = Math.abs(n);
  const body = abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(0)}K` : abs.toFixed(0);
  return `${n < 0 ? "-" : ""}$${body}`;
}

/** CSV of the recompete list so the user can sort it in a spreadsheet. Cells starting with = + - @ are neutralised. */
export function recompetesToCsv(list) {
  const cell = (v) => {
    let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["award_id", "incumbent", "agency", "office", "amount_usd", "start", "end", "months_left", "likely_solicitation", "stage", "description"];
  const lines = list.map((a) => [a.id, a.vendor, a.agency, a.subAgency, Math.round(a.amount), a.start, a.end, a.monthsLeft.toFixed(1), a.likelySolicitation, a.stage, a.description].map(cell).join(","));
  return [head.join(","), ...lines].join("\n");
}
