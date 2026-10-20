// Xero sales invoice import CSV checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of Xero's public sales invoice CSV import template
// and help pages; no Xero import was available when this was built.

export const COLUMNS = [
  "*ContactName", "EmailAddress", "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4", "POCity",
  "PORegion", "POPostalCode", "POCountry", "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate", "InventoryItemCode",
  "*Description", "*Quantity", "*UnitAmount", "Discount", "*AccountCode", "*TaxType", "TrackingName1", "TrackingOption1",
  "TrackingName2", "TrackingOption2", "Currency", "BrandingTheme", "Total", "TaxAmount",
];
export const REQUIRED = ["ContactName", "InvoiceNumber", "InvoiceDate", "DueDate", "Description", "Quantity", "UnitAmount", "AccountCode", "TaxType"];
export const MAX_LINES = 500;
export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D MMM YYYY"];

const bare = (h) => h.replace(/^\*/, "").replace(/\s+/g, "").toLowerCase();
const BY_BARE = new Map(COLUMNS.map((c) => [bare(c), c]));
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const EXCEL_ERR = /^#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)$/i;

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return new TextDecoder("utf-8").decode(u8);
}

// RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. Tracks the physical line each
// record starts on so findings can name it.
export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], cell = "", q = false, line = 1, start = 1, i = 0, quoteLine = 0, sawAny = false;
  const push = () => { row.push(cell); cell = ""; };
  const endRow = () => { push(); rows.push({ cells: row, line: start }); row = []; sawAny = false; };
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      if (ch === "\n") line++;
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { q = true; quoteLine = line; sawAny = true; i++; continue; }
    if (ch === delim) { push(); sawAny = true; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { endRow(); line++; start = line; i++; continue; }
    cell += ch; sawAny = true; i++;
  }
  if (q) return { rows, unterminated: quoteLine };
  if (sawAny || cell !== "" || row.length) endRow();
  return { rows, unterminated: 0 };
}

export function toCsv(rows, delim = ",") {
  const esc = (v) => (/[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(esc).join(delim)).join("\r\n") + "\r\n";
}

function distance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function closestColumn(name) {
  const n = bare(name).replace(/[^a-z0-9]/g, "");
  let best = null, bestD = 99;
  for (const c of COLUMNS) {
    const d = distance(n, bare(c));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, "0");
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const validYmd = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);

function serialToYmd(n) {
  const ms = Date.UTC(1899, 11, 30) + n * 86400000;
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

const NUMERIC_DATE = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/;
const NAMED_DATE = /^(\d{1,2})[ \-]([A-Za-z]{3,9})\.?[ \-,]+(\d{2}|\d{4})$/;

// order: "dmy" | "mdy" | null (unknown). Returns null when the text is not a date at all.
export function parseDate(raw, order) {
  const s = raw.trim();
  let m;
  if ((m = ISO_DATE.exec(s))) return { y: +m[1], m: +m[2], d: +m[3], form: "iso", twoDigit: false, ambiguous: false };
  if ((m = NAMED_DATE.exec(s))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi < 0) return null;
    return { y: yearOf(m[3]), m: mi + 1, d: +m[1], form: "name", twoDigit: m[3].length === 2, ambiguous: false };
  }
  if ((m = NUMERIC_DATE.exec(s))) {
    const a = +m[1], b = +m[2], two = m[3].length === 2, y = yearOf(m[3]);
    const ambiguous = a <= 12 && b <= 12 && a !== b;
    let d, mo;
    if (order === "mdy") { mo = a; d = b; } else if (order === "dmy") { d = a; mo = b; } else if (a > 12) { d = a; mo = b; } else if (b > 12) { mo = a; d = b; } else { d = a; mo = b; }
    return { y, m: mo, d, form: "num", twoDigit: two, ambiguous: !order && ambiguous, a, b };
  }
  if (/^\d{5}(\.\d+)?$/.test(s) && +s >= 20000 && +s <= 80000) return { ...serialToYmd(Math.floor(+s)), form: "serial", twoDigit: false, ambiguous: false };
  return null;
}
const yearOf = (t) => (t.length === 2 ? 2000 + +t : +t);

// What day/month order do the numeric dates in this file use? "dmy", "mdy", "mixed" or "unknown".
export function detectOrder(values) {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const m = NUMERIC_DATE.exec(v.trim());
    if (!m) continue;
    if (+m[1] > 12 && +m[2] <= 12) dmy++;
    else if (+m[2] > 12 && +m[1] <= 12) mdy++;
  }
  if (dmy && mdy) return "mixed";
  return dmy ? "dmy" : mdy ? "mdy" : "unknown";
}

export function formatDate({ y, m, d }, fmt) {
  if (fmt === "MM/DD/YYYY") return `${pad(m)}/${pad(d)}/${y}`;
  if (fmt === "YYYY-MM-DD") return `${y}-${pad(m)}-${pad(d)}`;
  if (fmt === "D MMM YYYY") return `${d} ${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
  return `${pad(d)}/${pad(m)}/${y}`;
}

// ---------- numbers ----------
const SYMBOLS = /^[$€£¥]\s*|\s*(USD|EUR|GBP|CAD|AUD|NZD)$/gi;

// A number cleaned only when it has one reasonable reading. `ok:false` means leave it and flag it.
export function cleanNumber(v) {
  let s = v.trim();
  if (s === "") return { ok: false, value: s, empty: true };
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(SYMBOLS, "").replace(/^[$€£¥]\s*/, "").trim();
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/^-/.test(s)) { neg = true; s = s.slice(1); }
  s = s.replace(/^\+/, "");
  let out = null;
  if (/^\d+(\.\d+)?$/.test(s)) out = s;
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) out = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) out = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+,\d{1,4}$/.test(s)) out = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}( \d{3})+(\.\d+)?$/.test(s)) out = s.replace(/ /g, "");
  if (out === null) return { ok: false, value: v };
  return { ok: true, value: (neg && +out !== 0 ? "-" : "") + out, changed: (neg && +out !== 0 ? "-" : "") + out !== v.trim() };
}
const ambiguousThousands = (s) => /^\d{1,3},\d{3}$/.test(s.trim());

// ---------- analysis ----------
function prepare(input) {
  const text = String(input || "").replace(/^﻿/, "");
  const delim = detectDelimiter(text);
  const parsed = parseCsv(text, delim);
  const rows = parsed.rows.filter((r) => !(r.cells.length === 1 && r.cells[0].trim() === ""));
  return { text, delim, parsed, rows };
}

function columnMap(header) {
  const idx = {};
  const dups = [];
  header.forEach((h, i) => {
    const key = BY_BARE.get(bare(h.trim()));
    if (!key) return;
    const name = key.replace(/^\*/, "");
    if (name in idx) dups.push({ name, i }); else idx[name] = i;
  });
  return { idx, dups };
}

export function validate(input) {
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line, title, detail });
  const { text, delim, parsed, rows } = prepare(input);
  const empty = { findings, summary: { rows: 0, lines: 0, invoices: 0, columns: 0, delimiter: delim, groups: [], totals: [] } };
  if (!text.trim()) { add("error", 0, "The file is empty", "There is nothing to check."); return empty; }
  if (parsed.unterminated) add("error", parsed.unterminated, "A quoted cell is never closed", `A quote opened on line ${parsed.unterminated} has no closing quote, so everything after it reads as one cell. Usually a description containing a stray " mark.`);
  if (delim !== ",") add("warning", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, "Xero expects commas. Excel in many locales saves CSV with semicolons because the comma is the decimal separator. Apply safe fixes rewrites it with commas.");
  if (/[ÃÂ]|â€/.test(text)) add("warning", 0, "Text looks mis-decoded", "Characters such as Ã or â€ usually mean a UTF-8 file was opened and saved as another encoding, so names like Müller turn into MÃ¼ller. Re-export as CSV UTF-8.");

  const header = rows[0].cells.map((h) => h.trim());
  const { idx, dups } = columnMap(header);
  const unknown = [];
  const spelled = [];
  header.forEach((h, i) => {
    if (!h) { add("warning", rows[0].line, `Column ${i + 1} has no heading`, "Xero ignores or rejects unnamed columns; delete it or name it."); return; }
    if (BY_BARE.has(bare(h))) {
      const want = BY_BARE.get(bare(h));
      if (want !== h && !dups.some((d) => d.i === i)) spelled.push(`"${h}" → "${want}"`);
      return;
    }
    const near = closestColumn(h);
    unknown.push(h);
    add("error", rows[0].line, `Unknown column "${h}"`, near ? `Looks like a typo of "${near}".` : "It is not in Xero's sales invoice template, so Xero will not import it. Remove it or check the spelling.");
  });
  if (spelled.length) add("warning", rows[0].line, `${spelled.length} heading${spelled.length === 1 ? " differs" : "s differ"} from the template spelling`, `${spelled.slice(0, 6).join(", ")}${spelled.length > 6 ? ", …" : ""}. Xero matches headings against its template; the leading * marks required columns and is part of the name. Apply safe fixes restores the template spelling.`);
  for (const d of dups) add("error", rows[0].line, `Column "${d.name}" appears twice`, "Only one of them can be read. Delete the duplicate.");
  const missing = REQUIRED.filter((r) => !(r in idx));
  for (const r of missing) add("error", rows[0].line, `Required column "*${r}" is missing`, "Xero will reject the file without it.");

  const data = rows.slice(1);
  const get = (r, name) => (name in idx && idx[name] < r.cells.length ? r.cells[idx[name]] : "");
  if (data.length === 0) add("error", 0, "There are no invoice lines", "The file has a header and nothing under it.");
  if (data.length > MAX_LINES) add("warning", 0, `${data.length} lines is more than ${MAX_LINES}`, `Xero has limited the lines per import file (about ${MAX_LINES} and a file size cap in the help pages this was read from; check the current limit). The split option keeps each invoice whole and starts a new file at an invoice boundary.`);

  // Dates: decide the file's order first.
  const dateVals = [];
  for (const r of data) for (const n of ["InvoiceDate", "DueDate"]) if (get(r, n)) dateVals.push(get(r, n));
  const order = detectOrder(dateVals);
  if (order === "mixed") add("error", 0, "Dates use both day-first and month-first orders", "Some dates only make sense as DD/MM (like 27/11/2026) and others only as MM/DD (like 11/27/2026). Pick one order for the whole file.");
  const ambiguousCount = dateVals.filter((v) => parseDate(v, null)?.ambiguous).length;
  if (ambiguousCount && order === "unknown") add("info", 0, `${ambiguousCount} date${ambiguousCount === 1 ? "" : "s"} read either way`, "Dates such as 03/04/2026 are 3 April or March 4 depending on order, and nothing in this file settles which. Xero reads them in your organisation's date format; confirm it before importing.");
  const useOrder = order === "dmy" || order === "mdy" ? order : null;

  const groups = new Map();
  const lineSeen = new Map();
  const contactsByLower = new Map();
  const invoiceLower = new Map();
  const taxTypes = new Map();
  const currencies = new Set();
  let lastKey = null;
  const closed = new Set();

  for (const r of data) {
    const L = r.line;
    if (r.cells.length !== header.length) add("error", L, `This row has ${r.cells.length} cells, the header has ${header.length}`, "An unquoted comma inside a description or contact name, or a missing one, shifts every later cell into the wrong column.");
    for (const c of r.cells) if (EXCEL_ERR.test(c.trim())) { add("error", L, `Spreadsheet error value ${c.trim()}`, "A formula failed before the file was saved. Replace it with the real value."); break; }

    const contact = get(r, "ContactName"), inv = get(r, "InvoiceNumber");
    for (const n of REQUIRED) if (n in idx && get(r, n).trim() === "") add("error", L, `${n} is empty`, `Xero requires ${n} on every line, including the second and later lines of an invoice.`);
    if (inv !== inv.trim()) add("warning", L, `Invoice number "${inv}" has a stray space`, "A trailing space makes Xero treat it as a different number from the same invoice's other lines. Safe fixes trims it.");
    if (SCI.test(inv.trim())) add("error", L, `Invoice number ${inv.trim()} is scientific notation`, "Excel rewrote a long number as 1.23457E+12 and the digits are gone. Reformat the column as Text and re-enter the numbers.");
    if (contact !== contact.trim() && contact.trim()) add("warning", L, `Contact name "${contact}" has a stray space`, "Xero matches contacts by name, so a stray space can create a second contact. Safe fixes trims it.");

    const key = inv.trim();
    if (key) {
      let g = groups.get(key);
      if (!g) { g = { number: key, line: L, contact: contact.trim(), invoiceDate: get(r, "InvoiceDate").trim(), dueDate: get(r, "DueDate").trim(), lines: 0, net: 0, currency: get(r, "Currency").trim(), rows: [] }; groups.set(key, g); }
      g.lines++; g.rows.push(L);
      if (lastKey !== key && closed.has(key)) add("warning", L, `Invoice ${key} continues after other invoices`, `Lines of one invoice should sit together; line ${g.line} started it and other invoices came between. Safe fixes moves its lines together.`);
      if (lastKey && lastKey !== key) closed.add(lastKey);
      lastKey = key;
      const cmp = [["ContactName", g.contact, contact.trim(), "error"], ["InvoiceDate", g.invoiceDate, get(r, "InvoiceDate").trim(), "error"], ["DueDate", g.dueDate, get(r, "DueDate").trim(), "error"], ["Currency", g.currency, get(r, "Currency").trim(), "warning"]];
      for (const [n, was, now, sev] of cmp) if (n in idx && (n === "Currency" ? was.toUpperCase() !== now.toUpperCase() : was !== now) && now !== "") add(sev, L, `${n} differs from the invoice's first line`, `Invoice ${key} has "${was}" on line ${g.line} and "${now}" here. All lines of one invoice must agree, or Xero rejects it or splits it.`);
      const lower = key.toLowerCase();
      if (!invoiceLower.has(lower)) invoiceLower.set(lower, new Set());
      invoiceLower.get(lower).add(key);
    }
    if (contact.trim()) {
      const lc = contact.trim().replace(/\s+/g, " ").toLowerCase();
      if (!contactsByLower.has(lc)) contactsByLower.set(lc, new Map());
      const m = contactsByLower.get(lc);
      if (!m.has(contact.trim())) m.set(contact.trim(), L);
    }

    // dates
    const dates = {};
    for (const n of ["InvoiceDate", "DueDate"]) {
      const v = get(r, n).trim();
      if (!v) continue;
      const p = parseDate(v, useOrder);
      if (!p) { add("error", L, `${n} "${v}" is not a date I can read`, "Use a day-month-year date in your organisation's format, such as 27/11/2026."); continue; }
      if (!validYmd(p.y, p.m, p.d)) { add("error", L, `${n} ${v} is not a real date`, p.form === "num" && order === "unknown" ? "Read either way it is not a calendar date." : `Day ${p.d}, month ${p.m} does not exist in ${p.y}.`); continue; }
      if (p.form === "serial") add("error", L, `${n} ${v} is an Excel serial number`, `That is the number Excel stores for ${formatDate(p, "YYYY-MM-DD")}. A cell formatted as General or Number lost its date format. Safe fixes converts it.`);
      if (p.twoDigit) add("warning", L, `${n} ${v} has a two-digit year`, "Two-digit years can be read as 1926 or 2026. Use four digits.");
      if (p.y < 2000 || p.y > new Date().getUTCFullYear() + 2) add("warning", L, `${n} ${v} is in ${p.y}`, p.y < 1950 ? "A year like 1900 usually means a blank or zero date cell." : "That is a long way from today; check the year.");
      dates[n] = p;
    }
    if (dates.InvoiceDate && dates.DueDate) {
      const a = Date.UTC(dates.InvoiceDate.y, dates.InvoiceDate.m - 1, dates.InvoiceDate.d), b = Date.UTC(dates.DueDate.y, dates.DueDate.m - 1, dates.DueDate.d);
      if (b < a) add("warning", L, "Due date is before the invoice date", "Xero accepts this but the invoice is overdue the day it is created. Check the two columns are not swapped, or the day and month.");
    }

    // amounts
    const qtyRaw = get(r, "Quantity"), unitRaw = get(r, "UnitAmount");
    let qty = NaN, unit = NaN;
    if (qtyRaw.trim()) {
      const c = cleanNumber(qtyRaw);
      if (!c.ok) add("error", L, `Quantity "${qtyRaw.trim()}" is not a number`, "Quantity is digits with an optional decimal point, with no units or text.");
      else { qty = +c.value; if (ambiguousThousands(qtyRaw)) add("warning", L, `Quantity ${qtyRaw.trim()} could be 1.5 or 1500`, "A comma followed by three digits is read as a thousands separator. Confirm which it is."); if (c.changed && !ambiguousThousands(qtyRaw)) add("warning", L, `Quantity "${qtyRaw.trim()}" is not plain digits`, `Xero expects ${c.value}. Safe fixes cleans it.`); if (qty === 0) add("warning", L, "Quantity is zero", "A zero-quantity line adds nothing to the invoice."); if (qty < 0) add("info", L, "Quantity is negative", "That reduces the invoice total. Fine for a credit line, wrong if the sign was an export accident."); }
    }
    if (unitRaw.trim()) {
      const c = cleanNumber(unitRaw);
      if (!c.ok) add("error", L, `UnitAmount "${unitRaw.trim()}" is not a number`, "Use digits and a decimal point only: no currency words, no text.");
      else {
        unit = +c.value;
        if (ambiguousThousands(unitRaw)) add("warning", L, `UnitAmount ${unitRaw.trim()} could be 1.234 or 1234`, "A comma followed by three digits is read as thousands. Confirm which it is before the amount is posted.");
        else if (c.changed) add("warning", L, `UnitAmount "${unitRaw.trim()}" is not plain digits`, `Xero expects ${c.value}: no currency symbol, thousands separator or decimal comma. Safe fixes cleans it.`);
        if ((c.value.split(".")[1] || "").length > 4) add("warning", L, `UnitAmount ${c.value} has more than four decimals`, "Xero keeps four decimal places on a unit amount and rounds the rest.");
      }
    }
    const discRaw = get(r, "Discount");
    if (discRaw.trim()) {
      const d = discRaw.trim().replace(/%$/, "").replace(",", ".");
      if (!/^\d+(\.\d+)?$/.test(d)) add("error", L, `Discount "${discRaw.trim()}" is not a percentage`, "Discount is a number from 0 to 100, meaning percent.");
      else {
        if (+d > 100) add("error", L, `Discount ${d} is above 100`, "Discount is a percentage of the line, so it cannot exceed 100.");
        if (/%$/.test(discRaw.trim())) add("warning", L, `Discount "${discRaw.trim()}" carries a % sign`, "Xero wants the bare number. Safe fixes removes the sign.");
        if (+d > 0 && +d <= 1 && /^0?\.\d+$/.test(d)) add("info", L, `Discount ${d} may be a fraction`, "Excel stores 15% as 0.15. Xero reads 0.15 as a discount of 0.15 percent.");
      }
    }
    if (g_ok(qty, unit) && key) { const g = groups.get(key); const dn = discRaw.trim() ? +discRaw.trim().replace(/%$/, "").replace(",", ".") || 0 : 0; g.net += qty * unit * (1 - dn / 100); }

    // Total and TaxAmount, when present, should agree with quantity x unit amount and the tax rate named in TaxType.
    if (g_ok(qty, unit) && (get(r, "Total").trim() || get(r, "TaxAmount").trim())) {
      const dn = discRaw.trim() ? +discRaw.trim().replace(/%$/, "").replace(",", ".") || 0 : 0;
      const net = qty * unit * (1 - dn / 100);
      const totC = get(r, "Total").trim() ? cleanNumber(get(r, "Total")) : null;
      const taxC = get(r, "TaxAmount").trim() ? cleanNumber(get(r, "TaxAmount")) : null;
      const rate = /^(\d+(?:\.\d+)?)%/.exec(get(r, "TaxType").trim());
      if (totC && !totC.ok) add("error", L, `Total "${get(r, "Total").trim()}" is not a number`, "Total is digits and a decimal point only.");
      if (taxC && !taxC.ok) add("error", L, `TaxAmount "${get(r, "TaxAmount").trim()}" is not a number`, "TaxAmount is digits and a decimal point only.");
      if (taxC?.ok && rate && Math.abs(+taxC.value - net * (+rate[1] / 100)) > 0.015) add("warning", L, `TaxAmount ${taxC.value} does not match ${rate[1]}% of ${net.toFixed(2)}`, `Quantity x UnitAmount less discount is ${net.toFixed(2)}, so ${rate[1]}% tax is ${(net * +rate[1] / 100).toFixed(2)}. Xero recalculates tax from the tax rate; a different figure usually means a wrong rate or a pasted total.`);
      if (totC?.ok) {
        const exTax = Math.abs(+totC.value - net) <= 0.015;
        const withTax = taxC?.ok ? Math.abs(+totC.value - (net + +taxC.value)) <= 0.015 : rate ? Math.abs(+totC.value - net * (1 + +rate[1] / 100)) <= 0.015 : false;
        if (!exTax && !withTax) add("warning", L, `Total ${totC.value} does not match the line amount ${net.toFixed(2)}`, "Total should equal quantity x unit amount less discount (plus tax if your export includes it). A mismatch usually means a stale formula, a rounded unit price or a shifted column.");
      }
    }

    // identical line repeated
    if (key) {
      const sig = [key, get(r, "Description").trim(), qtyRaw.trim(), unitRaw.trim(), get(r, "AccountCode").trim()].join("|");
      if (get(r, "Description").trim() && lineSeen.has(sig)) add("info", L, "Identical to an earlier line", `Same invoice, description, quantity, amount and account as line ${lineSeen.get(sig)}. Fine for genuinely repeated work; a double paste otherwise.`);
      else lineSeen.set(sig, L);
    }

    for (const n of ["ContactName", "InvoiceNumber", "Reference", "Description"]) {
      const v = get(r, n).trim();
      if (/^[=@]/.test(v) || /^[+-]\s*[A-Za-z(]/.test(v)) add("warning", L, `${n} "${v.slice(0, 30)}" starts like a spreadsheet formula`, "A cell beginning with =, @, + or - is run as a formula when the file is opened in Excel or Sheets, which is how CSV injection works, and Excel may already have mangled it. Prefix it with an apostrophe or reword it.");
    }
    const desc = get(r, "Description");
    if (desc.length > 4000) add("warning", L, `Description is ${desc.length} characters`, "Xero limits a line description to about 4,000 characters (from memory of its help pages).");

    // account code and tax type
    const acct = get(r, "AccountCode").trim();
    if (acct) {
      if (SCI.test(acct)) add("error", L, `AccountCode ${acct} is scientific notation`, "Excel rewrote the code. Re-enter it as text.");
      else if (/^\d+\.0+$/.test(acct)) add("warning", L, `AccountCode "${acct}" has a decimal`, `Excel stored it as a number. The chart of accounts code is ${acct.replace(/\.0+$/, "")}. Safe fixes strips it.`);
      else if (/^[A-Za-z][A-Za-z ]{3,}$/.test(acct) || (/[A-Za-z]/.test(acct) && /\s/.test(acct))) add("error", L, `AccountCode "${acct}" looks like an account name`, "Xero wants the code from your chart of accounts (like 200), not the account's name.");
      else if (!/^[A-Za-z0-9._-]+$/.test(acct)) add("warning", L, `AccountCode "${acct}" has unusual characters`, "Chart of accounts codes are short, with letters, digits and a few separators.");
    }
    const tax = get(r, "TaxType").trim();
    if (tax) {
      if (/^\d+(\.\d+)?%?$/.test(tax)) add("warning", L, `TaxType "${tax}" is a rate, not a tax rate name`, "Xero matches the name of a tax rate in your organisation, such as \"20% (VAT on Income)\" or \"Tax Exempt\", not the bare percentage.");
      taxTypes.set(tax, (taxTypes.get(tax) || 0) + 1);
    }
    const em = get(r, "EmailAddress").trim();
    if (em && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(em)) add("warning", L, `Email "${em}" does not look like an address`, "Xero stores one address per contact here; a list or a typo is dropped or rejected.");
    const cur = get(r, "Currency").trim();
    if (cur) { currencies.add(cur.toUpperCase()); if (!/^[A-Za-z]{3}$/.test(cur)) add("error", L, `Currency "${cur}" is not a three-letter code`, "Use an ISO code such as USD, GBP or EUR."); else if (cur !== cur.toUpperCase()) add("warning", L, `Currency "${cur}" is lower case`, "Safe fixes upper-cases it."); }
    for (const n of [1, 2]) { const a = get(r, `TrackingName${n}`).trim(), b = get(r, `TrackingOption${n}`).trim(); if ((a && !b) || (!a && b)) add("warning", L, `Tracking ${n} has a ${a ? "name but no option" : "option but no name"}`, "Both halves are needed for Xero to tag the line."); }
  }

  for (const g of groups.values()) if (g.lines && Math.round(g.net * 100) <= 0 && g.net === g.net) add("warning", g.line, g.net < 0 ? `Invoice ${g.number} totals ${g.net.toFixed(2)}` : `Invoice ${g.number} totals zero`, g.net < 0 ? "A negative invoice is a credit note, which Xero imports from its own template, not the sales invoice one. Check the signs on the quantity and unit amount." : "Every line nets to nothing, so the invoice would post as zero. Check for a missing unit amount or quantity.");
  for (const [, m] of contactsByLower) if (m.size > 1) add("warning", [...m.values()][0], `Contact spelled ${m.size} ways: ${[...m.keys()].map((k) => `"${k}"`).join(", ")}`, "Xero matches contacts by exact name, so each spelling can create its own contact. Pick one.");
  for (const [, s] of invoiceLower) if (s.size > 1) add("warning", 0, `Invoice numbers differ only by case: ${[...s].join(", ")}`, "Xero treats invoice numbers as the same regardless of case, so these collide.");
  if (taxTypes.size) add("info", 0, `Tax types used: ${[...taxTypes].map(([k, v]) => `${k} (${v})`).join(", ")}`, "Each must match a tax rate name in your Xero organisation exactly, including capitals and brackets. This tool cannot see your tax rates.");
  if (currencies.size > 1) add("info", 0, `${currencies.size} currencies in one file: ${[...currencies].join(", ")}`, "Each currency must be enabled in the organisation before the import, and Xero applies that day's rate.");

  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  const gl = [...groups.values()].map((g) => ({ number: g.number, line: g.line, contact: g.contact, invoiceDate: g.invoiceDate, dueDate: g.dueDate, lines: g.lines, net: Math.round(g.net * 100) / 100, currency: g.currency }));
  const byCur = new Map();
  for (const g of gl) { const k = (g.currency || "").toUpperCase(); const t = byCur.get(k) || { currency: k, invoices: 0, lines: 0, net: 0 }; t.invoices++; t.lines += g.lines; if (g.net === g.net) t.net += g.net; byCur.set(k, t); }
  const totals = [...byCur.values()].map((t) => ({ ...t, net: Math.round(t.net * 100) / 100 }));
  return { findings, summary: { rows: data.length, lines: data.length, invoices: groups.size, columns: header.length, delimiter: delim, order, groups: gl, totals } };
}
const g_ok = (q, u) => Number.isFinite(q) && Number.isFinite(u);

// ---------- repair ----------
// Changes only what has one reasonable reading. Never edits a contact, description, invoice number,
// amount digits, account code digits or tax type.
export function repair(input, opts = {}) {
  const { delim, parsed, rows } = prepare(input);
  const changes = [];
  if (parsed.unterminated) return { text: "", changes, error: "A quoted cell is never closed, so the file cannot be rewritten safely." };
  if (!rows.length) return { text: "", changes, error: "The file is empty." };
  const header = rows[0].cells.map((h) => h.trim());
  const out = [header.map((h, i) => {
    const want = BY_BARE.get(bare(h));
    if (want && want !== h) { changes.push(`Heading "${rows[0].cells[i]}" → "${want}"`); return want; }
    if (want && want !== rows[0].cells[i]) changes.push(`Heading "${rows[0].cells[i]}" trimmed`);
    return want || h;
  })];
  const { idx } = columnMap(header);
  const fmt = DATE_FORMATS.includes(opts.dateFormat) ? opts.dateFormat : null;
  const dateVals = [];
  for (const r of rows.slice(1)) for (const n of ["InvoiceDate", "DueDate"]) if (n in idx && r.cells[idx[n]]) dateVals.push(r.cells[idx[n]]);
  const detected = detectOrder(dateVals);
  const srcOrder = opts.sourceOrder === "dmy" || opts.sourceOrder === "mdy" ? opts.sourceOrder : detected === "dmy" || detected === "mdy" ? detected : null;
  if (delim !== ",") changes.push(`Separator ${delim === ";" ? "semicolon" : "tab"} → comma`);
  const counts = {};
  const bump = (k, msg) => { counts[k] = counts[k] || { n: 0, msg }; counts[k].n++; };
  const lineOf = new Map();
  const body = rows.slice(1).map((r) => {
    const cells = r.cells.slice();
    const set = (n, v, k, msg) => { if (n in idx && idx[n] < cells.length && cells[idx[n]] !== v) { cells[idx[n]] = v; bump(k, msg); } };
    const get = (n) => (n in idx && idx[n] < cells.length ? cells[idx[n]] : "");
    for (const n of ["ContactName", "InvoiceNumber", "AccountCode", "TaxType", "EmailAddress", "Reference", "InventoryItemCode", "Currency", "BrandingTheme", "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2"]) if (get(n) !== get(n).trim()) set(n, get(n).trim(), "trim", "stray spaces trimmed");
    for (const n of ["Quantity", "UnitAmount"]) {
      const v = get(n);
      if (!v.trim() || ambiguousThousands(v)) continue;
      const c = cleanNumber(v);
      if (c.ok && c.value !== v) set(n, c.value, n, `${n} cleaned to plain digits`);
    }
    if (get("Discount").trim()) { const d = get("Discount").trim(); if (/^\d+(\.\d+)?%$/.test(d)) set("Discount", d.slice(0, -1), "disc", "Discount % sign removed"); else if (/^\d+,\d+$/.test(d)) set("Discount", d.replace(",", "."), "disc", "Discount decimal comma → point"); }
    if (/^\d+\.0+$/.test(get("AccountCode").trim())) set("AccountCode", get("AccountCode").trim().replace(/\.0+$/, ""), "acct", "AccountCode decimal removed");
    if (get("Currency").trim() && /^[A-Za-z]{3}$/.test(get("Currency").trim())) set("Currency", get("Currency").trim().toUpperCase(), "cur", "Currency upper-cased");
    if (fmt || ["InvoiceDate", "DueDate"].some((n) => /^\d{5}(\.\d+)?$/.test(get(n).trim()))) {
      for (const n of ["InvoiceDate", "DueDate"]) {
        const v = get(n).trim();
        if (!v) continue;
        const serial = /^\d{5}(\.\d+)?$/.test(v);
        if (!fmt && !serial) continue;
        const p = parseDate(v, srcOrder);
        if (!p || !validYmd(p.y, p.m, p.d) || p.twoDigit || (p.ambiguous && !srcOrder)) continue;
        set(n, formatDate(p, fmt || "DD/MM/YYYY"), "date", `${n} rewritten as ${fmt || "DD/MM/YYYY"}`);
      }
    }
    return { cells, line: r.line, key: get("InvoiceNumber").trim() };
  });
  for (const c of Object.values(counts)) changes.push(`${c.msg} (${c.n} cell${c.n === 1 ? "" : "s"})`);
  // Keep each invoice's lines together, in first-seen order.
  const order = [];
  const byKey = new Map();
  for (const r of body) {
    if (!r.key) { order.push([r]); continue; }
    if (!byKey.has(r.key)) { byKey.set(r.key, []); order.push(byKey.get(r.key)); }
    byKey.get(r.key).push(r);
  }
  const regrouped = order.flat();
  if (regrouped.some((r, i) => r !== body[i])) changes.push("Lines of the same invoice moved together");
  void lineOf;
  for (const r of regrouped) out.push(r.cells);
  const text = toCsv(out, ",");
  return { text, changes, error: "" };
}

// Split a file into parts of at most `max` lines, never separating the lines of one invoice.
export function splitInvoices(input, max = MAX_LINES) {
  const { rows, parsed } = prepare(input);
  if (parsed.unterminated || rows.length < 2) return { parts: [], error: "Nothing to split." };
  const header = rows[0].cells.map((h) => h.trim());
  const { idx } = columnMap(header);
  if (!("InvoiceNumber" in idx)) return { parts: [], error: "No InvoiceNumber column, so invoices cannot be kept whole." };
  const blocks = [];
  const byKey = new Map();
  for (const r of rows.slice(1)) {
    const k = (r.cells[idx.InvoiceNumber] || "").trim();
    if (!k) { blocks.push([r]); continue; }
    if (!byKey.has(k)) { byKey.set(k, []); blocks.push(byKey.get(k)); }
    byKey.get(k).push(r);
  }
  const parts = [];
  let cur = [], n = 0, tooBig = [];
  for (const b of blocks) {
    if (b.length > max) tooBig.push(b[0].cells[idx.InvoiceNumber]);
    if (cur.length && n + b.length > max) { parts.push(cur); cur = []; n = 0; }
    cur.push(...b); n += b.length;
  }
  if (cur.length) parts.push(cur);
  return {
    parts: parts.map((p, i) => ({ name: `xero-invoices-part-${i + 1}.csv`, lines: p.length, invoices: new Set(p.map((r) => (r.cells[idx.InvoiceNumber] || "").trim()).filter(Boolean)).size, text: toCsv([header.map((h) => BY_BARE.get(bare(h)) || h), ...p.map((r) => r.cells)], ",") })),
    error: tooBig.length ? `Invoice ${tooBig.join(", ")} alone has more than ${max} lines and cannot be split.` : "",
  };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.title, f.detail])]);
}

export function sampleFile() {
  return [
    "*ContactName,EmailAddress,*InvoiceNumber,Reference,*InvoiceDate,*DueDate,*Description,*Quantity,*UnitAmount,Discount,*AccountCode,*TaxType,Currency",
    "Harbour Coffee Roasters,accounts@harbourcoffee.example,INV-1001,PO 5521,01/10/2026,31/10/2026,Website maintenance October,1,450.00,,200,20% (VAT on Income),GBP",
    "Harbour Coffee Roasters,accounts@harbourcoffee.example,INV-1001,PO 5521,01/10/2026,31/10/2026,Extra landing page,3,120.00,10,200,20% (VAT on Income),GBP",
    "Brightside Dental,office@brightside.example,INV-1002,,02/10/2026,16/10/2026,Logo redesign,1,1800.00,,200,20% (VAT on Income),GBP",
    "",
  ].join("\n");
}

export function sampleBrokenFile() {
  return [
    "ContactName;EmailAddress;InvoiceNumber;InvoiceDate;DueDate;Description;Quantity;UnitAmount;Discount;AccountCode;TaxType;Currency",
    "Harbour Coffee Roasters;accounts@harbourcoffee.example;INV-1001;2026-10-01;2026-10-31;Website maintenance October;1;£1,450.00;;200.0;20% (VAT on Income);gbp",
    "Brightside Dental;office@brightside;INV-1002 ;27/10/2026;14/10/2026;Logo redesign;1;1800,00;;Sales;20%;GBP",
    "Harbour Coffee Roasters ;accounts@harbourcoffee.example;INV-1001;2026-10-01;2026-10-31;Extra landing page;three;120.00;10%;200;20% (VAT on Income);GBP",
    "Harbour Coffee Roasters;accounts@harbourcoffee.example;1.00E+12;46300;2026-10-31;Hosting;1;25.00;;200;20% (VAT on Income);GBP",
    "",
  ].join("\n");
}

// ---------- cross-check against the organisation's own lists ----------
// The file alone cannot say whether account code 200 exists or "Acme Ltd" is already a contact. These
// functions take the exports a bookkeeper can already download from Xero (chart of accounts, contact
// list) and a pasted list of tax rate names, and compare. Headings are matched loosely because the
// export layouts were read from memory.
const norm = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const SUFFIX = /\s(limited|ltd|llc|inc|incorporated|corp|corporation|co|company|pty|plc|gmbh|the)$/;
const coreName = (s) => { let n = norm(s).replace(/^the /, ""); while (SUFFIX.test(n)) n = n.replace(SUFFIX, ""); return n; };
const REVENUE_TYPES = /revenue|sales|income|other income/i;

function table(text) {
  const { rows } = prepare(text);
  if (!rows.length) return { head: [], body: [] };
  return { head: rows[0].cells.map((h) => norm(h.replace(/^\*/, ""))), body: rows.slice(1).map((r) => r.cells) };
}
const col = (head, ...names) => { for (const n of names) { const i = head.indexOf(norm(n)); if (i >= 0) return i; } return -1; };

// Chart of accounts export: Code, Name, Type (and optionally Status). Returns { accounts, error }.
export function parseChart(text) {
  const { head, body } = table(text);
  const ci = col(head, "code", "account code"), ni = col(head, "name", "account name", "account"), ti = col(head, "type", "account type"), si = col(head, "status");
  if (ci < 0 || ni < 0) return { accounts: [], error: "The chart of accounts needs a Code column and a Name column." };
  const accounts = body.filter((c) => (c[ci] || "").trim()).map((c) => ({ code: c[ci].trim(), name: (c[ni] || "").trim(), type: ti >= 0 ? (c[ti] || "").trim() : "", archived: si >= 0 && /archiv/i.test(c[si] || "") }));
  return { accounts, error: accounts.length ? null : "No accounts found under the heading." };
}

// Contact export (a ContactName/Name column) or a plain list with one name per line.
export function parseContactList(text) {
  const { head, body } = table(text);
  const ni = col(head, "contactname", "contact name", "name");
  if (ni >= 0) return body.map((c) => (c[ni] || "").trim()).filter(Boolean);
  const { rows } = prepare(text);
  return rows.map((r) => r.cells[0].trim()).filter(Boolean);
}

export function parseLines(text) { return String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean); }

function nearest(value, options, maxD) {
  const v = norm(value);
  let best = null, bd = 99;
  for (const o of options) { const d = distance(v, norm(o)); if (d < bd) { bd = d; best = o; } }
  return bd <= maxD ? best : null;
}

export function crossCheck(input, lists = {}) {
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line, title, detail });
  const { rows } = prepare(input);
  if (!rows.length) return { findings, summary: { checked: [] } };
  const header = rows[0].cells.map((h) => h.trim());
  const { idx } = columnMap(header);
  const get = (r, n) => (n in idx && idx[n] < r.cells.length ? r.cells[idx[n]].trim() : "");
  const data = rows.slice(1);
  const checked = [];

  const accounts = lists.accounts || [];
  if (accounts.length && "AccountCode" in idx) {
    checked.push("account codes");
    const byCode = new Map(accounts.map((a) => [a.code.toLowerCase(), a]));
    const byName = new Map(accounts.map((a) => [norm(a.name), a]));
    const seen = new Map();
    for (const r of data) {
      const raw = get(r, "AccountCode");
      if (!raw) continue;
      const code = raw.replace(/\.0+$/, "");
      const hit = byCode.get(code.toLowerCase());
      if (!hit) {
        const named = byName.get(norm(raw));
        const near = nearest(code, accounts.map((a) => a.code), 1);
        add("error", r.line, `AccountCode "${raw}" is not in your chart of accounts`, named ? `That is the name of account ${named.code}. Use the code ${named.code}.` : near ? `No account has that code. Did you mean ${near} (${byCode.get(near.toLowerCase()).name})?` : "No account has that code or name. Add the account in Xero or correct the code.");
      } else {
        const k = hit.code;
        if (!seen.has(k)) seen.set(k, r.line);
        if (hit.archived) add("error", r.line, `Account ${hit.code} (${hit.name}) is archived`, "Xero will not post new invoice lines to an archived account. Restore it or choose another.");
        else if (hit.type && !REVENUE_TYPES.test(hit.type) && seen.get(k) === r.line) add("warning", r.line, `Account ${hit.code} (${hit.name}) is type "${hit.type}"`, "Sales invoice lines normally post to a Revenue, Sales or Other Income account. Check this is not an expense or balance sheet account picked by mistake.");
      }
    }
  }

  const contacts = lists.contacts || [];
  if (contacts.length && "ContactName" in idx) {
    checked.push("contacts");
    const exact = new Set(contacts);
    const exactLower = new Map(contacts.map((c) => [c.toLowerCase(), c]));
    const byNorm = new Map(); for (const c of contacts) if (!byNorm.has(norm(c))) byNorm.set(norm(c), c);
    const byCore = new Map(); for (const c of contacts) if (!byCore.has(coreName(c))) byCore.set(coreName(c), c);
    const done = new Set();
    for (const r of data) {
      const name = get(r, "ContactName");
      if (!name || done.has(name) || exact.has(name)) continue;
      done.add(name);
      const same = exactLower.get(name.toLowerCase()) || byNorm.get(norm(name));
      const alike = byCore.get(coreName(name)) || nearest(name, contacts, Math.max(1, Math.floor(norm(name).length / 8)));
      if (same) add("warning", r.line, `Contact "${name}" differs from "${same}" only in case or punctuation`, "Xero matches contacts by name, so this may create a second contact. Use the existing spelling.");
      else if (alike) add("warning", r.line, `Contact "${name}" is not in your list but "${alike}" is`, "If they are the same customer, Xero will create a duplicate contact. Rename the line to match, or keep it if it really is someone new.");
      else add("info", r.line, `Contact "${name}" is new`, "Not in the contact list you gave. Xero will create it on import.");
    }
  }

  const rates = lists.taxRates || [];
  if (rates.length && "TaxType" in idx) {
    checked.push("tax rates");
    const set = new Set(rates), lower = new Map(rates.map((t) => [t.toLowerCase(), t]));
    const done = new Set();
    for (const r of data) {
      const t = get(r, "TaxType");
      if (!t || set.has(t) || done.has(t)) continue;
      done.add(t);
      const m = lower.get(t.toLowerCase()) || nearest(t, rates, 3);
      add("error", r.line, `TaxType "${t}" is not one of your tax rates`, m ? `Closest rate in your list: "${m}". Xero needs the name spelled exactly.` : "No tax rate in your list has that name.");
    }
  }
  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  return { findings, summary: { checked } };
}

// Rewrites an AccountCode cell that holds an account's exact name to that account's code. One reading only:
// the name must match one account and no account code. Returns { text, changes }.
export function mapAccountNames(input, accounts) {
  const { delim, parsed, rows } = prepare(input);
  const changes = [];
  if (parsed.unterminated || !rows.length || !accounts.length) return { text: "", changes };
  const { idx } = columnMap(rows[0].cells.map((h) => h.trim()));
  if (!("AccountCode" in idx)) return { text: "", changes };
  const codes = new Set(accounts.map((a) => a.code.toLowerCase()));
  const names = new Map();
  for (const a of accounts) { const k = norm(a.name); names.set(k, names.has(k) ? null : a); }
  const out = rows.map((r, i) => {
    if (i === 0 || idx.AccountCode >= r.cells.length) return r.cells;
    const v = r.cells[idx.AccountCode].trim();
    const a = v && !codes.has(v.toLowerCase()) ? names.get(norm(v)) : null;
    if (!a) return r.cells;
    changes.push(`Line ${r.line}: AccountCode "${v}" → ${a.code}`);
    const cells = r.cells.slice(); cells[idx.AccountCode] = a.code; return cells;
  });
  return { text: changes.length ? toCsv(out, delim) : "", changes };
}
