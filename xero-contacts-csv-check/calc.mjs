// Xero contacts import CSV checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of Xero's public contacts CSV import template and
// help pages; no Xero import was available when this was built.

export const COLUMNS = [
  "*ContactName", "EmailAddress", "FirstName", "LastName", "POAttentionTo", "POAddressLine1", "POAddressLine2", "POAddressLine3",
  "POAddressLine4", "POCity", "PORegion", "POPostalCode", "POCountry", "SAAttentionTo", "SAAddressLine1", "SAAddressLine2",
  "SAAddressLine3", "SAAddressLine4", "SACity", "SARegion", "SAPostalCode", "SACountry", "PhoneNumber", "FaxNumber",
  "MobileNumber", "DDINumber", "SkypeName", "BankAccountName", "BankAccountNumber", "BankAccountParticulars", "TaxNumber",
  "AccountsReceivableTaxCodeName", "AccountsPayableTaxCodeName", "Website", "Discount", "DueDateBillDay", "DueDateBillTerm",
  "DueDateSalesDay", "DueDateSalesTerm", "SalesAccount", "PurchasesAccount", "TrackingName1", "SalesTrackingOption1",
  "PurchasesTrackingOption1", "TrackingName2", "SalesTrackingOption2", "PurchasesTrackingOption2",
];
export const REQUIRED = ["ContactName"];
export const NAME_MAX = 255;
export const SIZE_LIMIT = 3 * 1024 * 1024;
export const TERMS = ["DAYSAFTERBILLDATE", "DAYSAFTERBILLMONTH", "OFCURRENTMONTH", "OFFOLLOWINGMONTH"];

const bare = (h) => h.replace(/^\*/, "").replace(/\s+/g, "").toLowerCase();
const BY_BARE = new Map(COLUMNS.map((c) => [bare(c), c]));
const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const EXCEL_ERR = /^#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)$/i;
const TEXT_COLS = COLUMNS.map((c) => c.replace(/^\*/, ""));

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

const normName = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export function validate(input) {
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line, title, detail });
  const { text, delim, parsed, rows } = prepare(input);
  const empty = { findings, summary: { rows: 0, contacts: 0, columns: 0, delimiter: delim, bytes: 0, withEmail: 0, duplicates: 0, list: [] } };
  if (!text.trim()) { add("error", 0, "The file is empty", "There is nothing to check."); return empty; }
  if (parsed.unterminated) add("error", parsed.unterminated, "A quoted cell is never closed", `A quote opened on line ${parsed.unterminated} has no closing quote, so everything after it reads as one cell. Usually a name or address containing a stray " mark.`);
  if (delim !== ",") add("warning", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, "Xero expects commas. Excel in many locales saves CSV with semicolons because the comma is the decimal separator. Apply safe fixes rewrites it with commas.");
  if (/[ÃÂ]|â€/.test(text)) add("warning", 0, "Text looks mis-decoded", "Characters such as Ã or â€ usually mean a UTF-8 file was opened and saved as another encoding, so names like Müller turn into MÃ¼ller. Re-export as CSV UTF-8.");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > SIZE_LIMIT) add("warning", 0, `The file is ${(bytes / 1048576).toFixed(1)} MB`, "Xero's help pages describe a size cap on a contacts import file (about 3 MB when this was read; check the current figure). Split the file and import the parts one at a time.");

  const header = rows[0].cells.map((h) => h.trim());
  const { idx, dups } = columnMap(header);
  const spelled = [];
  header.forEach((h, i) => {
    if (!h) { add("warning", rows[0].line, `Column ${i + 1} has no heading`, "Xero ignores or rejects unnamed columns; delete it or name it."); return; }
    if (BY_BARE.has(bare(h))) {
      const want = BY_BARE.get(bare(h));
      if (want !== h && !dups.some((d) => d.i === i)) spelled.push(`"${h}" → "${want}"`);
      return;
    }
    const near = closestColumn(h);
    add("error", rows[0].line, `Unknown column "${h}"`, near ? `Looks like a typo of "${near}".` : "It is not in Xero's contacts template, so Xero will not import it. Remove it or check the spelling.");
  });
  if (spelled.length) add("warning", rows[0].line, `${spelled.length} heading${spelled.length === 1 ? " differs" : "s differ"} from the template spelling`, `${spelled.slice(0, 6).join(", ")}${spelled.length > 6 ? ", …" : ""}. Xero matches headings against its template; the leading * marks the required column and is part of the name. Apply safe fixes restores the template spelling.`);
  for (const d of dups) add("error", rows[0].line, `Column "${d.name}" appears twice`, "Only one of them can be read. Delete the duplicate.");
  for (const r of REQUIRED) if (!(r in idx)) add("error", rows[0].line, `Required column "*${r}" is missing`, "Xero will reject the file without it. A column called Name, Company or Customer needs renaming to *ContactName.");

  const data = rows.slice(1);
  const get = (r, name) => (name in idx && idx[name] < r.cells.length ? r.cells[idx[name]] : "");
  if (data.length === 0) add("error", 0, "There are no contacts", "The file has a header and nothing under it.");

  const names = new Map();
  const emails = new Map();
  const rowSig = new Map();
  const list = [];
  let withEmail = 0, dupRows = 0;
  const countryOf = (r, p) => get(r, `${p}Country`).trim().toLowerCase();

  for (const r of data) {
    const L = r.line;
    if (r.cells.length !== header.length) add("error", L, `This row has ${r.cells.length} cells, the header has ${header.length}`, "An unquoted comma inside a name or address, or a missing one, shifts every later cell into the wrong column.");
    for (const c of r.cells) if (EXCEL_ERR.test(c.trim())) { add("error", L, `Spreadsheet error value ${c.trim()}`, "A formula failed before the file was saved. Replace it with the real value."); break; }

    const name = get(r, "ContactName");
    const em = get(r, "EmailAddress").trim();
    if (em) withEmail++;
    list.push({ line: L, name: name.trim(), email: em, phone: get(r, "PhoneNumber").trim() || get(r, "MobileNumber").trim(), city: get(r, "POCity").trim() || get(r, "SACity").trim() });

    const sig = r.cells.map((c) => c.trim()).join("\u0001");
    if (rowSig.has(sig)) { dupRows++; add("warning", L, "Exact copy of an earlier row", `Identical to line ${rowSig.get(sig)}. Xero rejects the second as a duplicate contact name. Safe fixes removes it.`); } else rowSig.set(sig, L);

    if ("ContactName" in idx) {
      if (!name.trim()) add("error", L, "ContactName is empty", "Xero requires a contact name on every row.");
      else {
        if (name !== name.trim()) add("warning", L, `Contact name "${name}" has a stray space`, "Leading or trailing spaces make a second contact for the same business. Safe fixes trims it.");
        if (name.trim().length > NAME_MAX) add("error", L, `Contact name is ${name.trim().length} characters`, `Xero limits a contact name to ${NAME_MAX} characters (from memory of its help pages).`);
        if (/^[=@]/.test(name.trim()) || /^[+-]\D/.test(name.trim())) add("warning", L, `Contact name "${name.trim().slice(0, 30)}" starts with a formula character`, "A cell beginning with =, +, - or @ is treated as a formula by spreadsheets. Check it is a name and not damage.");
        if (EMAIL.test(name.trim())) add("warning", L, `Contact name "${name.trim()}" is an email address`, "Probably the email column landed in the name column, or a customer was keyed by email.");
        const key = normName(name);
        if (!names.has(key)) names.set(key, []);
        names.get(key).push({ line: L, name: name.trim(), sig });
      }
    }

    if (em) {
      if (/^mailto:/i.test(em)) add("warning", L, `Email "${em}" starts with mailto:`, "Xero wants the bare address. Safe fixes removes the prefix.");
      else if (/[,;]|\s{1}.+@/.test(em) || (em.match(/@/g) || []).length > 1) add("error", L, `Email "${em}" holds more than one address`, "Xero's template takes one address per contact; extras are dropped or the row is rejected. Keep the main one.");
      else if (!EMAIL.test(em)) add("warning", L, `Email "${em}" does not look like an address`, "A typo or a name in the email column; Xero can reject the row or store an address nothing can reach.");
      const e = em.toLowerCase().replace(/^mailto:/, "");
      if (EMAIL.test(e)) { if (!emails.has(e)) emails.set(e, []); emails.get(e).push(L); }
    }

    for (const n of ["PhoneNumber", "FaxNumber", "MobileNumber", "DDINumber", "BankAccountNumber", "TaxNumber"]) {
      const v = get(r, n).trim();
      if (!v) continue;
      if (SCI.test(v)) add("error", L, `${n} ${v} is scientific notation`, "Excel rewrote a long number as 1.23457E+11 and the digits are gone. Reformat the column as Text and re-enter the numbers from the source.");
    }
    for (const n of ["PhoneNumber", "MobileNumber"]) {
      const v = get(r, n).trim();
      if (v && /^\d{9,10}$/.test(v) && !v.startsWith("0") && !countryOf(r, "PO") && !countryOf(r, "SA")) add("info", L, `${n} ${v} has no leading zero or country code`, "Excel drops a leading zero from a number-formatted cell. Check it against the source if it should start with 0 or +.");
      if (v && /[A-Za-z]{3,}/.test(v)) add("warning", L, `${n} "${v}" contains letters`, "Notes written into the phone column are imported as the number.");
    }
    for (const p of ["PO", "SA"]) {
      const pc = get(r, `${p}PostalCode`).trim(), co = countryOf(r, p);
      if (pc && /^\d{4}$/.test(pc) && /^(us|usa|united states|united states of america)$/.test(co)) add("warning", L, `${p}PostalCode ${pc} is four digits for a US address`, "A ZIP code that begins with 0 loses it when Excel treats the column as a number (Boston 02108 becomes 2108). Check the source.");
      if (pc && /^\d{3,4}$/.test(pc) && /^(uk|united kingdom|gb|great britain)$/.test(co)) add("info", L, `${p}PostalCode ${pc} is too short for a UK postcode`, "Postcodes are letters and digits, like SW1A 1AA. Check the column was not overwritten.");
      if (pc && SCI.test(pc)) add("error", L, `${p}PostalCode ${pc} is scientific notation`, "Excel rewrote the code.");
    }
    const hasAddr = (p) => ["AddressLine1", "City", "PostalCode"].some((n) => get(r, p + n).trim());
    if (hasAddr("PO") && !get(r, "POAddressLine1").trim() && get(r, "POPostalCode").trim()) add("info", L, "Postal address has a postcode but no first address line", "Xero shows the line 1 field on documents; an address with only a postcode prints oddly.");
    void hasAddr;

    const web = get(r, "Website").trim();
    if (web && (/\s/.test(web) || !/\./.test(web))) add("warning", L, `Website "${web}" does not look like a web address`, "A name or note in the website column.");

    const disc = get(r, "Discount").trim();
    if (disc) {
      const d = disc.replace(/%$/, "").replace(",", ".");
      if (!/^\d+(\.\d+)?$/.test(d)) add("error", L, `Discount "${disc}" is not a percentage`, "Discount is a number from 0 to 100, meaning percent.");
      else {
        if (+d > 100) add("error", L, `Discount ${d} is above 100`, "Discount is a percentage, so it cannot exceed 100.");
        if (/%$/.test(disc)) add("warning", L, `Discount "${disc}" carries a % sign`, "Xero wants the bare number. Safe fixes removes the sign.");
        if (/^0?\.\d+$/.test(d) && +d > 0 && +d <= 1) add("info", L, `Discount ${d} may be a fraction`, "Excel stores 15% as 0.15. Xero reads 0.15 as 0.15 percent.");
      }
    }
    for (const [dayCol, termCol] of [["DueDateBillDay", "DueDateBillTerm"], ["DueDateSalesDay", "DueDateSalesTerm"]]) {
      const day = get(r, dayCol).trim(), term = get(r, termCol).trim();
      if (day && !/^\d{1,2}$/.test(day)) add("error", L, `${dayCol} "${day}" is not a whole number of days`, "Payment terms take a number from 0 to 31 (days, or the day of the month).");
      else if (day && +day > 31) add("error", L, `${dayCol} ${day} is above 31`, "A day of the month or a number of days between 0 and 31.");
      if (term && !TERMS.includes(term.toUpperCase())) add("error", L, `${termCol} "${term}" is not a term Xero knows`, `Expected one of ${TERMS.join(", ")} (from memory of the template notes).`);
      else if (term && term !== term.toUpperCase()) add("warning", L, `${termCol} "${term}" is not in capitals`, "Safe fixes upper-cases it.");
      if ((day && !term) || (!day && term)) add("warning", L, `${dayCol.replace("Day", "")} terms have ${day ? "a day but no term" : "a term but no day"}`, "Both halves are needed for Xero to set the contact's payment terms.");
    }
    for (const n of [1, 2]) { const a = get(r, `TrackingName${n}`).trim(), b = get(r, `SalesTrackingOption${n}`).trim() || get(r, `PurchasesTrackingOption${n}`).trim(); if (a && !b) add("info", L, `Tracking category ${n} has a name but no default option`, "Both halves are needed for Xero to apply a default."); }
    for (const n of TEXT_COLS) { const v = get(r, n); if (v && v.length > 500) { add("warning", L, `${n} is ${v.length} characters`, "Probably a note or two cells merged. Xero truncates or rejects long address lines."); break; } }
  }

  let dupNames = 0;
  for (const [, g] of names) {
    if (g.length < 2) continue;
    const distinct = new Set(g.map((x) => x.name));
    dupNames += g.length - 1;
    if (new Set(g.map((x) => x.sig)).size === 1) continue; // exact copies are already flagged as such
    if (distinct.size > 1) add("error", g[1].line, `Contact name appears ${g.length} times, spelled ${distinct.size} ways: ${[...distinct].map((k) => `"${k}"`).join(", ")}`, `Lines ${g.map((x) => x.line).join(", ")}. Xero contact names must be unique and are compared ignoring case and extra spaces, so the second one is rejected or merged. Rename one, or merge the rows.`);
    else add("error", g[1].line, `Contact name "${g[0].name}" appears ${g.length} times`, `Lines ${g.map((x) => x.line).join(", ")}. Xero contact names must be unique, so only one can be created. Add a branch or town to tell them apart.`);
  }
  let sharedEmails = 0;
  for (const [e, ls] of emails) if (ls.length > 1) { sharedEmails++; if (sharedEmails <= 20) add("info", ls[1], `Email ${e} is on ${ls.length} contacts`, `Lines ${ls.join(", ")}. Allowed, but often the same business entered twice under different names.`); }
  if (sharedEmails > 20) add("info", 0, `${sharedEmails - 20} more shared email addresses`, "Only the first 20 are listed.");

  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  return { findings, summary: { rows: data.length, contacts: data.length, columns: header.length, delimiter: delim, bytes, withEmail, duplicates: dupNames, list } };
}

// ---------- repair ----------
// Changes only what has one reasonable reading. Never edits a contact name's letters, an address,
// a phone, bank, tax or account number, or a tax code.
export function repair(input) {
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
  if (delim !== ",") changes.push(`Separator ${delim === ";" ? "semicolon" : "tab"} → comma`);
  const counts = {};
  const bump = (k, msg) => { counts[k] = counts[k] || { n: 0, msg }; counts[k].n++; };
  const seen = new Set();
  let removed = 0;
  for (const r of rows.slice(1)) {
    const cells = r.cells.slice();
    const get = (n) => (n in idx && idx[n] < cells.length ? cells[idx[n]] : "");
    const set = (n, v, k, msg) => { if (n in idx && idx[n] < cells.length && cells[idx[n]] !== v) { cells[idx[n]] = v; bump(k, msg); } };
    for (const n of TEXT_COLS) if (get(n) !== get(n).trim()) set(n, get(n).trim(), "trim", "stray spaces trimmed");
    const em = get("EmailAddress").trim();
    if (/^mailto:/i.test(em)) set("EmailAddress", em.replace(/^mailto:/i, "").trim(), "mailto", "mailto: prefix removed");
    const d = get("Discount").trim();
    if (/^\d+(\.\d+)?%$/.test(d)) set("Discount", d.slice(0, -1), "disc", "Discount % sign removed");
    else if (/^\d+,\d+$/.test(d)) set("Discount", d.replace(",", "."), "disc", "Discount decimal comma → point");
    for (const n of ["DueDateBillTerm", "DueDateSalesTerm"]) { const t = get(n).trim(); if (t && TERMS.includes(t.toUpperCase()) && t !== t.toUpperCase()) set(n, t.toUpperCase(), "term", "payment term upper-cased"); }
    const sig = cells.join("\u0001");
    if (seen.has(sig)) { removed++; continue; }
    seen.add(sig);
    out.push(cells);
  }
  for (const c of Object.values(counts)) changes.push(`${c.msg} (${c.n} cell${c.n === 1 ? "" : "s"})`);
  if (removed) changes.push(`Exact duplicate rows removed (${removed})`);
  return { text: toCsv(out, ","), changes, error: "" };
}

// Split a file into parts of at most `max` contacts, each with the heading row.
export function splitContacts(input, max = 500) {
  const { rows, parsed } = prepare(input);
  if (parsed.unterminated || rows.length < 2) return { parts: [], error: "Nothing to split." };
  const size = Math.max(1, Math.floor(max));
  const header = rows[0].cells.map((h) => BY_BARE.get(bare(h.trim())) || h.trim());
  const data = rows.slice(1);
  const parts = [];
  for (let i = 0; i < data.length; i += size) {
    const p = data.slice(i, i + size);
    parts.push({ name: `xero-contacts-part-${parts.length + 1}.csv`, contacts: p.length, text: toCsv([header, ...p.map((r) => r.cells)], ",") });
  }
  return { parts, error: "" };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.title, f.detail])]);
}

export function sampleFile() {
  return [
    "*ContactName,EmailAddress,FirstName,LastName,POAddressLine1,POCity,PORegion,POPostalCode,POCountry,PhoneNumber,TaxNumber,Discount,DueDateBillDay,DueDateBillTerm,DueDateSalesDay,DueDateSalesTerm",
    "Harbour Coffee Roasters,accounts@harbourcoffee.example,Maya,Okafor,14 Quay Street,Bristol,,BS1 4RR,United Kingdom,+44 117 496 0123,GB123456789,,30,DAYSAFTERBILLDATE,14,DAYSAFTERBILLDATE",
    "Brightside Dental,office@brightside.example,Tom,Brightside,2 Mill Lane,Leeds,,LS1 5AB,United Kingdom,0113 496 0456,,5,20,OFFOLLOWINGMONTH,20,OFFOLLOWINGMONTH",
    "Northfield Print Co,,,,9 Station Road,York,,YO1 6GA,United Kingdom,,,,,,,",
    "",
  ].join("\n");
}

export function sampleBrokenFile() {
  return [
    "ContactName;EmailAddress;FirstName;LastName;POAddressLine1;POCity;POPostalCode;POCountry;PhoneNumber;Discount;DueDateBillDay;DueDateBillTerm;Websit",
    "Harbour Coffee Roasters;accounts@harbourcoffee.example;Maya;Okafor;14 Quay Street;Bristol;BS1 4RR;United Kingdom;4.41175E+11;10%;30;DAYSAFTERBILLDATE;harbourcoffee.example",
    "harbour coffee  roasters ;accounts@harbourcoffee.example, billing@harbourcoffee.example;;;14 Quay Street;Bristol;BS1 4RR;United Kingdom;;;;;",
    "Brightside Dental;office@brightside;Tom;Brightside;2 Mill Lane;Leeds;LS1 5AB;United Kingdom;0113 496 0456;150;45;in 20 days;",
    "Brightside Dental;mailto:office@brightside.example;;;2 Mill Lane;Leeds;LS1 5AB;United Kingdom;;;;;",
    "Boston Bakery;hello@bostonbakery.example;;;1 Beacon St;Boston;2108;USA;;;;;",
    "",
  ].join("\n");
}
