// Rental ledger arithmetic, tax year 2026. Pure functions, no DOM, no network.
// Money is whole cents. Residential rental property only (27.5-year straight line,
// mid-month). Not tax advice.
//
// Figures: IRC 469(i) $25,000 special allowance for active participation, reduced by
// 50% of MAGI over $100,000 (gone at $150,000); Reg. 1.263(a)-1(f) de minimis safe
// harbor $2,500 per invoice or item (taxpayer without an applicable financial
// statement); 1099-NEC threshold $2,000 for payments made after 2025.

export const TAX_YEAR = 2026;
export const SPECIAL_ALLOWANCE = 2500000;
export const ALLOWANCE_PHASEOUT_START = 10000000;
export const ALLOWANCE_PHASEOUT_END = 15000000;
export const SAFE_HARBOR_CENTS = 250000;
export const FORM_1099_THRESHOLD_CENTS = 200000;
export const RECOVERY_MONTHS = 330; // 27.5 years

// Schedule E, Part I, expense lines.
export const EXPENSE_LINES = {
  advertising: ["5", "Advertising"],
  travel: ["6", "Auto and travel"],
  cleaning: ["7", "Cleaning and maintenance"],
  commissions: ["8", "Commissions"],
  insurance: ["9", "Insurance"],
  legal: ["10", "Legal and other professional fees"],
  management: ["11", "Management fees"],
  mortgage_interest: ["12", "Mortgage interest paid to banks"],
  other_interest: ["13", "Other interest"],
  repairs: ["14", "Repairs"],
  supplies: ["15", "Supplies"],
  taxes: ["16", "Taxes"],
  utilities: ["17", "Utilities"],
  other: ["19", "Other expenses"],
};
export const TYPES = { rent: "Rent received", deposit: "Security deposit received (not income)", expense: "Expense", improvement: "Improvement (depreciated)", principal: "Loan principal paid (not deductible)" };

const int = (n) => Math.round(Number(n) || 0);
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(s));
const yearOf = (s) => (isDate(s) ? Number(String(s).slice(0, 4)) : NaN);
const monthOf = (s) => (isDate(s) ? Number(String(s).slice(5, 7)) : NaN);

export function toCents(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9)) : 0;
}

export function formatMoney(cents) {
  return (int(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ---- Depreciation ------------------------------------------------------------
// Residential rental, straight line over 27.5 years, mid-month convention: the
// first month counts as half. Cumulative months through the end of `year`:
//   (12 - startMonth + 0.5) + 12 * (year - startYear)
// and the deduction for a year is the change in cumulative allowance, so the parts
// add up to the basis exactly.
export function buildingBasis(p) {
  return Math.max(0, int(p.priceCents) + int(p.closingCents) - int(p.landCents));
}

function cumulative(basis, inService, year) {
  const sy = yearOf(inService), sm = monthOf(inService);
  if (!(basis > 0) || Number.isNaN(sy) || year < sy) return 0;
  const months = 12 - sm + 0.5 + 12 * (year - sy);
  return Math.min(basis, Math.round((basis * months) / RECOVERY_MONTHS));
}

export function depreciation(basis, inService, year) {
  return Math.max(0, cumulative(basis, inService, year) - cumulative(basis, inService, year - 1));
}

export function propertyDepreciation(prop, improvements, year) {
  const house = depreciation(buildingBasis(prop), prop.inService, year);
  let imp = 0;
  for (const e of improvements) if (e.property === prop.id && e.type === "improvement") imp += depreciation(int(e.cents), e.date, year);
  return { building: house, improvements: imp, total: house + imp };
}

// ---- Schedule E by property --------------------------------------------------
export function scheduleE(data, year = TAX_YEAR) {
  const props = Array.isArray(data.properties) ? data.properties : [];
  const entries = (Array.isArray(data.entries) ? data.entries : []).filter((e) => e && yearOf(e.date) === year);
  const improvementsAll = (Array.isArray(data.entries) ? data.entries : []).filter((e) => e && e.type === "improvement");
  const rows = props.map((p) => {
    const mine = entries.filter((e) => e.property === p.id);
    const rents = mine.filter((e) => e.type === "rent").reduce((a, e) => a + int(e.cents), 0);
    const lines = {};
    for (const e of mine) {
      if (e.type !== "expense") continue;
      const key = e.category in EXPENSE_LINES ? e.category : "other";
      lines[key] = (lines[key] || 0) + int(e.cents);
    }
    const opex = Object.values(lines).reduce((a, b) => a + b, 0);
    const dep = propertyDepreciation(p, improvementsAll, year);
    const principal = mine.filter((e) => e.type === "principal").reduce((a, e) => a + int(e.cents), 0);
    const improvements = mine.filter((e) => e.type === "improvement").reduce((a, e) => a + int(e.cents), 0);
    const deposits = mine.filter((e) => e.type === "deposit").reduce((a, e) => a + int(e.cents), 0);
    const share = Number.isFinite(Number(p.ownershipPct)) && Number(p.ownershipPct) > 0 ? Number(p.ownershipPct) / 100 : 1;
    const net = rents - opex - dep.total;
    const cash = rents - opex - principal - improvements;
    return { id: p.id, name: p.name || "(unnamed)", rents, lines, opex, depreciation: dep, net, cash, principal, improvements, deposits, share };
  });
  const total = (k) => rows.reduce((a, r) => a + r[k], 0);
  const totals = { rents: total("rents"), opex: total("opex"), depreciation: rows.reduce((a, r) => a + r.depreciation.total, 0), net: total("net"), cash: total("cash"), deposits: total("deposits") };
  return { year, rows, totals };
}

// ---- Passive activity loss (Form 8582, simple case) ----------------------------
// Net rental loss is deductible against other income only up to the special
// allowance when you actively participate, shrinking by 50 cents per dollar of MAGI
// over $100,000. Everything else is suspended and carried forward. Gains first use
// up suspended losses from earlier years.
export function passiveLoss({ net = 0, magi = 0, active = true, priorSuspended = 0 } = {}) {
  const n = int(net), prior = Math.max(0, int(priorSuspended)), m = Math.max(0, int(magi));
  if (n >= 0) {
    const used = Math.min(prior, n);
    return { allowed: 0, suspended: prior - used, taxableNet: n - used, allowance: 0, usedPrior: used, note: used > 0 ? "Rental profit absorbs suspended losses from earlier years." : null };
  }
  const loss = -n + prior;
  let allowance = active ? SPECIAL_ALLOWANCE : 0;
  if (active && m > ALLOWANCE_PHASEOUT_START) allowance = Math.max(0, allowance - Math.floor((m - ALLOWANCE_PHASEOUT_START) / 2));
  const allowed = Math.min(loss, allowance);
  const note = !active ? "Without active participation, a rental loss is suspended and carried forward." : m >= ALLOWANCE_PHASEOUT_END ? "At $150,000 of MAGI or more the $25,000 allowance is gone; the loss is suspended." : null;
  return { allowed, suspended: loss - allowed, taxableNet: -allowed, allowance, usedPrior: 0, note };
}

// ---- Sale year (Form 4797 / Schedule D, simple case) --------------------------
// Depreciation allowed through the sale month (mid-month: the sale month counts as
// half), adjusted basis, gain, the part of the gain taxed as unrecaptured section
// 1250 gain (the lesser of the gain and the depreciation taken, capped at 25%), the
// rest at the long-term rate, and suspended passive losses released on a full
// taxable sale. Residential 27.5-year property held more than a year only.
function cumulativeToSale(basis, inService, saleDate) {
  const sy = yearOf(inService), sm = monthOf(inService), ey = yearOf(saleDate), em = monthOf(saleDate);
  if (!(basis > 0) || [sy, sm, ey, em].some(Number.isNaN) || saleDate < inService) return 0;
  const months = 12 * (ey - sy) + (em - sm);
  return Math.min(basis, Math.round((basis * months) / RECOVERY_MONTHS));
}

export function saleYear(prop, entries, { saleDate, salePriceCents = 0, sellingCostsCents = 0, ordinaryRatePct = 0, gainRatePct = 15, suspendedCents = 0 } = {}) {
  if (!isDate(saleDate) || !isDate(prop.inService)) return null;
  const improvements = (entries || []).filter((e) => e && e.property === prop.id && e.type === "improvement" && isDate(e.date) && e.date <= saleDate);
  const impCost = improvements.reduce((a, e) => a + int(e.cents), 0);
  const depreciationTaken = cumulativeToSale(buildingBasis(prop), prop.inService, saleDate) + improvements.reduce((a, e) => a + cumulativeToSale(int(e.cents), e.date, saleDate), 0);
  const cost = int(prop.priceCents) + int(prop.closingCents) + impCost;
  const adjustedBasis = cost - depreciationTaken;
  const amountRealized = int(salePriceCents) - int(sellingCostsCents);
  const gain = amountRealized - adjustedBasis;
  const heldMonths = 12 * (yearOf(saleDate) - yearOf(prop.inService)) + monthOf(saleDate) - monthOf(prop.inService);
  const ord = Math.min(Math.max(Number(ordinaryRatePct) || 0, 0), 100) / 100, lt = Math.min(Math.max(Number(gainRatePct) || 0, 0), 100) / 100;
  const susp = Math.max(0, int(suspendedCents));
  const unrecaptured = gain > 0 ? Math.min(gain, depreciationTaken) : 0;
  const longTerm = gain > 0 ? gain - unrecaptured : 0;
  const rate1250 = Math.min(ord, 0.25);
  const tax = Math.round(unrecaptured * rate1250 + longTerm * lt - (gain > 0 ? susp * ord : 0) + (gain < 0 ? gain * ord : 0));
  const niit = gain > 0 ? Math.round(gain * 0.038) : 0;
  return { depreciationTaken, cost, adjustedBasis, amountRealized, gain, unrecaptured, longTerm, tax, niitIfApplies: niit, suspendedReleased: susp, cashBeforeTax: amountRealized, heldMonths, shortTerm: heldMonths < 12 };
}

// ---- Monthly collection (rent roll) ------------------------------------------
export function collection(data, year = TAX_YEAR) {
  const props = Array.isArray(data.properties) ? data.properties : [];
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return props.map((p) => {
    const target = int(p.monthlyRentCents);
    const months = Array.from({ length: 12 }, () => 0);
    for (const e of entries) if (e && e.property === p.id && e.type === "rent" && yearOf(e.date) === year) months[monthOf(e.date) - 1] += int(e.cents);
    const expected = target * 12;
    const collected = months.reduce((a, b) => a + b, 0);
    const shortMonths = target > 0 ? months.filter((m) => m < target).length : 0;
    return { id: p.id, name: p.name || "(unnamed)", target, months, expected, collected, vacancy: target > 0 ? Math.max(0, expected - collected) : 0, shortMonths };
  });
}

// ---- 1099-NEC list --------------------------------------------------------------
// Payers who run a rental as a business must file a 1099-NEC for $2,000+ paid to an
// unincorporated contractor for services (repairs, cleaning, management). Not for
// materials, utilities, or payments to corporations (the vendor note says which).
export function vendors1099(data, year = TAX_YEAR) {
  const by = new Map();
  for (const e of Array.isArray(data.entries) ? data.entries : []) {
    if (!e || yearOf(e.date) !== year || !(e.type === "expense" || e.type === "improvement")) continue;
    if (e.category === "taxes" || e.category === "utilities" || e.category === "mortgage_interest" || e.category === "other_interest" || e.category === "insurance") continue;
    const v = String(e.vendor || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    const row = by.get(key) || { vendor: v, cents: 0, count: 0 };
    row.cents += int(e.cents); row.count += 1; by.set(key, row);
  }
  return [...by.values()].filter((r) => r.cents >= FORM_1099_THRESHOLD_CENTS).sort((a, b) => b.cents - a.cents);
}

// ---- Checks ----------------------------------------------------------------------
export function checks(data, year = TAX_YEAR) {
  const out = [];
  const add = (level, text) => out.push({ level, text });
  const props = Array.isArray(data.properties) ? data.properties : [];
  const ids = new Set(props.map((p) => p.id));
  const all = Array.isArray(data.entries) ? data.entries : [];
  const mine = all.filter((e) => e && yearOf(e.date) === year);
  if (props.length === 0) add("info", "Add a property first; every rent and expense belongs to one so the Schedule E columns come out right.");
  const orphan = mine.filter((e) => !ids.has(e.property)).length;
  if (orphan) add("warn", `${orphan} ${year} entr${orphan > 1 ? "ies point" : "y points"} at a property that no longer exists and ${orphan > 1 ? "are" : "is"} left out.`);
  const undated = all.filter((e) => e && !isDate(e.date)).length;
  if (undated) add("warn", `${undated} entr${undated > 1 ? "ies have" : "y has"} no valid date and ${undated > 1 ? "are" : "is"} left out of every total.`);
  for (const e of mine) {
    if (e.type === "expense" && e.category === "repairs" && int(e.cents) > SAFE_HARBOR_CENTS * 4)
      add("warn", `${e.date} repair of ${formatMoney(e.cents)}${e.note ? ` (${e.note})` : ""}: work that betters, restores or adapts the property is an improvement and is depreciated, not deducted at once. If it is an improvement, change its type.`);
  }
  const bigExp = mine.filter((e) => e.type === "expense" && int(e.cents) > SAFE_HARBOR_CENTS && e.category !== "mortgage_interest" && e.category !== "taxes" && e.category !== "insurance" && e.category !== "management");
  if (bigExp.length) add("info", `${bigExp.length} expense${bigExp.length > 1 ? "s are" : " is"} over the $2,500 de minimis safe-harbor limit. Items at or under it can be deducted at once if you make the election on your return; larger ones need the repair-versus-improvement test.`);
  const dep = mine.filter((e) => e.type === "deposit");
  if (dep.length) add("info", "Security deposits are not income when you receive them. Keep them out of rent. They become income only if you keep them for damage or unpaid rent.");
  const noService = props.filter((p) => !isDate(p.inService) && int(p.priceCents) > 0);
  if (noService.length) add("warn", `${noService.map((p) => p.name || "(unnamed)").join(", ")}: no date placed in service, so no depreciation is computed. Use the date it was first ready and available to rent.`);
  const noLand = props.filter((p) => int(p.priceCents) > 0 && int(p.landCents) <= 0);
  if (noLand.length) add("warn", `${noLand.map((p) => p.name || "(unnamed)").join(", ")}: no land value entered. Land is never depreciated; with none entered the whole price is treated as building. Use the tax-assessor ratio if you have no appraisal.`);
  const sch = scheduleE(data, year);
  for (const r of sch.rows) if (r.rents === 0 && r.opex > 0) add("info", `${r.name}: ${formatMoney(r.opex)} of expenses and no rent in ${year}. Expenses before the property is available to rent are usually capitalised, not deducted.`);
  const noVendor = mine.filter((e) => e.type === "expense" && !["mortgage_interest", "other_interest", "taxes"].includes(e.category) && !String(e.vendor || "").trim() && int(e.cents) >= 7500).length;
  if (noVendor) add("info", `${noVendor} expense${noVendor > 1 ? "s" : ""} of $75 or more ${noVendor > 1 ? "have" : "has"} no payee. Record who was paid; the 1099 list and an audit both start there.`);
  return out;
}

// ---- CSV ---------------------------------------------------------------------------
export function csvEscape(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows) { return rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n"; }

export function scheduleECsv(sch) {
  const head = ["Line", "Item", ...sch.rows.map((r) => r.name), "Total"];
  const row = (line, label, get) => [line, label, ...sch.rows.map((r) => (get(r) / 100).toFixed(2)), (sch.rows.reduce((a, r) => a + get(r), 0) / 100).toFixed(2)];
  const rows = [head, row("3", "Rents received", (r) => r.rents)];
  for (const [k, [line, label]] of Object.entries(EXPENSE_LINES)) if (sch.rows.some((r) => r.lines[k])) rows.push(row(line, label, (r) => r.lines[k] || 0));
  rows.push(row("18", "Depreciation", (r) => r.depreciation.total), row("20", "Total expenses", (r) => r.opex + r.depreciation.total), row("21", "Income or loss", (r) => r.net));
  return toCsv(rows);
}

// Parse "date,property,type,category,amount,vendor,note" (header optional). Properties
// are matched by name, case-insensitive. Returns { entries, problems }.
export function parseCsv(text) {
  const rows = [];
  let cur = [], field = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; cur.push(field); field = ""; if (cur.some((x) => x.trim())) rows.push(cur); cur = []; }
    else field += c;
  }
  cur.push(field); if (cur.some((x) => x.trim())) rows.push(cur);
  return rows;
}

export function importRows(text, properties) {
  const rows = parseCsv(text);
  const problems = [];
  const entries = [];
  const byName = new Map(properties.map((p) => [String(p.name).trim().toLowerCase(), p.id]));
  rows.forEach((r, i) => {
    if (i === 0 && /date/i.test(r[0] || "")) return;
    const [date, prop, type, category, amount, vendor, note] = r.map((x) => String(x ?? "").trim());
    const line = i + 1;
    if (!isDate(date)) return problems.push(`Row ${line}: date "${date}" is not YYYY-MM-DD.`);
    const id = byName.get(prop.toLowerCase());
    if (!id) return problems.push(`Row ${line}: no property named "${prop}".`);
    const t = type.toLowerCase();
    if (!(t in TYPES)) return problems.push(`Row ${line}: type "${type}" must be one of ${Object.keys(TYPES).join(", ")}.`);
    const cents = toCents(amount);
    if (!(cents > 0)) return problems.push(`Row ${line}: amount "${amount}" must be a positive number.`);
    const cat = (category || "").toLowerCase();
    entries.push({ id: "i" + Date.now().toString(36) + i, date, property: id, type: t, category: t === "expense" ? (cat in EXPENSE_LINES ? cat : "other") : "", cents, vendor, note });
  });
  return { entries, problems };
}
