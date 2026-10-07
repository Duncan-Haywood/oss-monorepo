// Expense tracker maths: whole cents, Schedule C lines, deductible share per
// category, business-use percentage, receipt flags, IRS payment periods, bank-CSV
// import with keyword categorising. Pure functions, no DOM, no network.

// `share` is the deductible fraction of the amount before business use; `line` is
// the printed Schedule C line on the 2024-era form, so check the form you file.
export const CATEGORIES = {
  advertising: { label: "Advertising", line: "8", share: 1 },
  car_truck: { label: "Car and truck (actual costs; or use a mileage log)", line: "9", share: 1 },
  fees: { label: "Commissions and fees (platform, card processing)", line: "10", share: 1 },
  contract_labor: { label: "Contract labor", line: "11", share: 1 },
  insurance: { label: "Insurance (not health)", line: "15", share: 1 },
  interest: { label: "Interest (business loan or card)", line: "16b", share: 1 },
  legal_professional: { label: "Legal and professional (accountant, lawyer)", line: "17", share: 1 },
  office: { label: "Office expense", line: "18", share: 1 },
  rent_equipment: { label: "Rent or lease: equipment", line: "20a", share: 1 },
  rent_property: { label: "Rent or lease: space (coworking, studio)", line: "20b", share: 1 },
  repairs: { label: "Repairs and maintenance", line: "21", share: 1 },
  supplies: { label: "Supplies", line: "22", share: 1 },
  taxes_licenses: { label: "Taxes and licences", line: "23", share: 1 },
  travel: { label: "Travel (transport, lodging)", line: "24a", share: 1 },
  meals: { label: "Business meals (50% deductible)", line: "24b", share: 0.5 },
  utilities: { label: "Utilities (phone, internet)", line: "25", share: 1 },
  other: { label: "Other (software, subscriptions, education, bank fees)", line: "27a", share: 1 },
  personal: { label: "Personal / not deductible", line: null, share: 0 },
};

export const RECEIPT_THRESHOLD_CENTS = 7500;

export function toCents(v) {
  const s = String(v ?? "").trim();
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[$,()\s-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) * (neg ? -1 : 1);
}

export function formatMoney(cents, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);
  } catch {
    return ((cents || 0) / 100).toFixed(2);
  }
}

const pad = (n) => String(n).padStart(2, "0");
function validParts(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

// "2026-03-04", "3/4/2026", "3/4/26", "03-04-2026" (month first). Returns ISO or null.
export function parseDate(text) {
  const s = String(text ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validParts(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) return validParts(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  return null;
}

export function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`;
}

// A subscription or rent: `count` monthly copies starting at `iso`, day clamped to month end.
export function monthlySeries(iso, count) {
  return Array.from({ length: Math.max(0, Math.min(count, 60)) }, (_, i) => addMonths(iso, i));
}

export function bizPct(e) {
  const p = Number(e.bizPct);
  return Number.isFinite(p) && p >= 0 && p <= 100 ? p : 100;
}

export function deductibleCents(e) {
  const cat = CATEGORIES[e.category] || CATEGORIES.other;
  const amt = Number(e.cents) || 0;
  return Math.round((amt * cat.share * bizPct(e)) / 100);
}

// Lodging and any expense of $75 or more should have a receipt or equivalent record.
export function needsReceipt(e) {
  if (e.receipt) return false;
  if (e.category === "personal") return false;
  return (Number(e.cents) || 0) >= RECEIPT_THRESHOLD_CENTS;
}

export function yearOf(e) { return Number(String(e.date).slice(0, 4)); }

// IRS payment periods for Form 1040-ES; due dates are the following 15ths.
export function paymentPeriod(iso) {
  const m = Number(iso.slice(5, 7));
  if (m <= 3) return 1;
  if (m <= 5) return 2;
  if (m <= 8) return 3;
  return 4;
}
export const PERIOD_LABELS = { 1: "Jan–Mar (due Apr 15)", 2: "Apr–May (due Jun 15)", 3: "Jun–Aug (due Sep 15)", 4: "Sep–Dec (due Jan 15 next year)" };

export function summarize(entries, year) {
  const rows = entries.filter((e) => yearOf(e) === year);
  const byCategory = {}, byMonth = Array(12).fill(0), byPeriod = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let spent = 0, deductible = 0, missing = 0, missingCents = 0;
  for (const e of rows) {
    const c = Number(e.cents) || 0, d = deductibleCents(e);
    const row = (byCategory[e.category] ||= { spent: 0, deductible: 0, count: 0 });
    row.spent += c; row.deductible += d; row.count += 1;
    spent += c; deductible += d;
    byMonth[Number(e.date.slice(5, 7)) - 1] += d;
    byPeriod[paymentPeriod(e.date)] += d;
    if (needsReceipt(e)) { missing += 1; missingCents += c; }
  }
  return { count: rows.length, spent, deductible, notDeductible: spent - deductible, byCategory, byMonth, byPeriod, missing, missingCents };
}

// Tax saved is a planning figure: deductible * (income tax rate + SE tax rate effect).
export function taxSaved(deductibleCents_, ratePct) {
  const r = Number(ratePct);
  if (!Number.isFinite(r) || r <= 0) return 0;
  return Math.round((deductibleCents_ * Math.min(r, 70)) / 100);
}

// Rows for a Schedule C worksheet, ordered by line.
export function scheduleCRows(summary) {
  const order = (l) => parseFloat(l) + (/[a-z]$/.test(l) ? (l.charCodeAt(l.length - 1) - 96) / 100 : 0);
  return Object.entries(summary.byCategory)
    .filter(([k]) => CATEGORIES[k] && CATEGORIES[k].line)
    .map(([k, v]) => ({ key: k, line: CATEGORIES[k].line, label: CATEGORIES[k].label, spent: v.spent, deductible: v.deductible, count: v.count }))
    .sort((a, b) => order(a.line) - order(b.line));
}

const RULES = [
  ["advertising", /\b(facebook ads|meta ads|google ads|adwords|linkedin ads|mailchimp|canva|vistaprint|moo\.com|yelp ads)\b/i],
  ["fees", /\b(stripe fee|paypal fee|square fee|etsy fee|ebay fee|shopify fee|processing fee|merchant fee|payoneer)\b/i],
  ["insurance", /\b(insurance|geico|state farm|progressive|hiscox|next insurance|liability)\b/i],
  ["legal_professional", /\b(attorney|lawyer|legalzoom|cpa|accountant|bookkeep|turbotax|quickbooks|freshbooks|wave|tax prep)\b/i],
  ["travel", /\b(airline|delta|united air|southwest|american air|jetblue|hotel|marriott|hilton|hyatt|airbnb|amtrak|uber|lyft|rental car|hertz|avis|parking)\b/i],
  ["meals", /\b(restaurant|cafe|coffee|starbucks|doordash|grubhub|ubereats|chipotle|diner|bistro|pizza|bar & grill|catering)\b/i],
  ["utilities", /\b(verizon|at&t|t-mobile|comcast|xfinity|spectrum|internet|mobile bill|phone bill)\b/i],
  ["rent_property", /\b(wework|coworking|regus|studio rent|storage unit|public storage)\b/i],
  ["office", /\b(staples|office depot|usps|ups store|fedex|postage|stamps)\b/i],
  ["supplies", /\b(home depot|lowe'?s|amazon|walmart|costco|uline|michaels|hobby lobby|supplies)\b/i],
  ["taxes_licenses", /\b(secretary of state|business license|dmv|annual report|llc fee|permit)\b/i],
  ["contract_labor", /\b(upwork|fiverr|contractor|freelancer|toptal)\b/i],
  ["other", /\b(adobe|github|notion|slack|zoom|dropbox|google workspace|gsuite|microsoft 365|openai|anthropic|figma|aws|digitalocean|namecheap|godaddy|squarespace|wix|bank fee|monthly fee|udemy|coursera|subscription)\b/i],
];

export function suggestCategory(text) {
  const s = String(text ?? "");
  for (const [cat, re] of RULES) if (re.test(s)) return cat;
  return "other";
}

// Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF.
export function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const find = (head, names) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));

// Bank or card export -> expense entries. Money out only: negative amounts, or a
// debit column. Credits and refunds are counted and skipped, never netted silently.
export function importBankCsv(text) {
  const rows = parseCsv(text);
  const out = { entries: [], skipped: 0, bad: 0, problem: null };
  if (rows.length < 2) { out.problem = "No rows found. Paste a CSV with a header line."; return out; }
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const di = find(head, ["date", "posted", "transaction date"]);
  const ni = find(head, ["description", "merchant", "payee", "name", "memo", "details"]);
  const ai = find(head, ["amount"]);
  const dbi = head.findIndex((h) => h === "debit" || h.startsWith("debit") || h === "withdrawal" || h === "money out");
  if (di < 0 || ni < 0 || (ai < 0 && dbi < 0)) { out.problem = "Could not find date, description and amount (or debit) columns."; return out; }
  for (const r of rows.slice(1)) {
    const date = parseDate(r[di]);
    let cents = 0;
    if (dbi >= 0 && String(r[dbi] ?? "").trim() !== "") cents = Math.abs(toCents(r[dbi]));
    else if (ai >= 0) { const c = toCents(r[ai]); if (c < 0) cents = -c; else { out.skipped += 1; continue; } }
    else { out.skipped += 1; continue; }
    if (!date || !cents) { out.bad += 1; continue; }
    const vendor = String(r[ni] ?? "").trim().slice(0, 120);
    out.entries.push({ date, vendor, cents, category: suggestCategory(vendor), bizPct: 100, receipt: false, note: "imported" });
  }
  return out;
}

const key = (e) => `${e.date}|${e.cents}|${String(e.vendor).trim().toLowerCase()}`;
// Entries in `incoming` that already exist in `existing` (same date, amount, vendor).
export function findDuplicates(existing, incoming) {
  const have = new Set(existing.map(key));
  return incoming.filter((e) => have.has(key(e)));
}

const cell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function entriesToCsv(entries) {
  const head = ["Date", "Vendor", "Category", "Schedule C line", "Amount", "Business use %", "Deductible", "Receipt kept", "Note"];
  const lines = entries.slice().sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
    const cat = CATEGORIES[e.category] || CATEGORIES.other;
    return [e.date, e.vendor, cat.label, cat.line || "", (e.cents / 100).toFixed(2), bizPct(e), (deductibleCents(e) / 100).toFixed(2), e.receipt ? "yes" : "no", e.note].map(cell).join(",");
  });
  return [head.join(","), ...lines].join("\n");
}

export function warnings(entries, year) {
  const w = [];
  const s = summarize(entries, year);
  if (s.missing) w.push(`${s.missing} expense(s) of $75 or more have no receipt kept, ${formatMoney(s.missingCents)} in total. Keep a receipt or an equivalent record.`);
  const big = entries.filter((e) => yearOf(e) === year && e.cents >= 250000 && e.category !== "personal");
  if (big.length) w.push(`${big.length} purchase(s) of $2,500 or more. Large equipment is usually depreciated or expensed by election, not deducted as supplies; ask a preparer.`);
  const personalish = entries.filter((e) => yearOf(e) === year && ["meals", "utilities"].includes(e.category) && bizPct(e) === 100 && e.cents >= 20000);
  if (personalish.length) w.push(`${personalish.length} meal or phone/internet expense(s) of $200 or more are at 100% business use. Mixed-use costs are only deductible for the business share.`);
  return w;
}


// Net profit = income - deductible expenses; the set-aside is a plain share of
// positive net profit, a planning figure and never a tax computation.
export function netProfit(incomeCents, deductibleTotal) {
  return Math.round(incomeCents || 0) - Math.round(deductibleTotal || 0);
}
export function setAside(net, ratePct) {
  const r = Number(ratePct);
  if (!(net > 0) || !Number.isFinite(r) || r <= 0) return 0;
  return Math.round((net * Math.min(r, 70)) / 100 + 1e-9);
}

// ---- Invoice Maker income (read-only) ---------------------------------
// Invoice Maker keeps { invoices: [...] } under localStorage "invoice-maker-data".
// Money fields there are dollar strings; this mirrors its arithmetic closely
// enough for a rough income figure and never writes anything back.
function dollars(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9)) : 0;
}
const pctOf = (cents, pct) => { const raw = (cents * (Number(pct) || 0)) / 100; return Math.sign(raw) * Math.round(Math.abs(raw) + 1e-9); };

// Pre-sales-tax revenue of one invoice, and its full total (with tax and shipping).
export function invoiceParts(inv) {
  const lines = (inv.lines || []).map((l) => { const q = Number(l.qty), r = dollars(l.rate); return Number.isFinite(q) ? Math.round(q * r + (q * r < 0 ? -1e-9 : 1e-9)) : 0; });
  const subtotal = lines.reduce((a, b) => a + b, 0);
  let discount = 0;
  if (inv.discountType === "percent") discount = pctOf(subtotal, inv.discountValue);
  else if (inv.discountType === "amount") discount = Math.min(dollars(inv.discountValue), Math.max(subtotal, 0));
  discount = Math.min(discount, Math.max(subtotal, 0));
  const taxableLines = (inv.lines || []).reduce((a, l, i) => a + (l.taxable !== false ? lines[i] : 0), 0);
  const base = subtotal > 0 ? Math.max(0, taxableLines - Math.round((discount * taxableLines) / subtotal)) : 0;
  const tax = pctOf(base, inv.taxRate);
  const shipping = dollars(inv.shipping);
  const revenue = subtotal - discount;
  return { revenue, total: revenue + tax + shipping, paid: Math.max(0, dollars(inv.paid)) };
}

// basis "invoiced": revenue of every sent, non-void invoice issued in `year`.
// basis "paid": the paid share of each non-void invoice issued in `year`,
// scaled to exclude sales tax and shipping. Returns { cents, count }.
export function invoiceIncome(box, year, basis = "paid") {
  const invoices = box && Array.isArray(box.invoices) ? box.invoices : [];
  let cents = 0, count = 0;
  for (const inv of invoices) {
    if (!inv || inv.void || !parseDate(inv.issued) || yearOf({ date: inv.issued }) !== year) continue;
    const p = invoiceParts(inv);
    if (basis === "invoiced") {
      if (!inv.sent && p.paid <= 0) continue;
      cents += p.revenue; count += 1;
    } else {
      if (p.paid <= 0 || p.total <= 0) continue;
      cents += Math.round((Math.min(p.paid, p.total) * p.revenue) / p.total); count += 1;
    }
  }
  return { cents, count };
}

// Parse the raw localStorage text of Invoice Maker; null when absent or unreadable.
export function readInvoiceBox(text) {
  try {
    const d = JSON.parse(text || "null");
    return d && Array.isArray(d.invoices) ? d : null;
  } catch {
    return null;
  }
}

