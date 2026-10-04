// HubSpot contacts import CSV checker. Pure functions, no DOM, no network.
// Property names and rules are read from memory of HubSpot's public import help pages and default
// contact properties; no HubSpot import was available when this was built.
//
// HubSpot differs from a fixed-template importer: the header row is free text that the user maps to
// properties in the import wizard, so an unrecognised heading is a note, not an error. What actually
// goes wrong is in the data: the email column is the de-duplication key, dropdown properties such
// as Lifecycle stage only accept their own values, dates must be one format, and a spreadsheet save
// has usually damaged phone numbers and postcodes before the file reaches HubSpot.

export const PROPERTIES = [
  "Email", "First Name", "Last Name", "Phone Number", "Mobile Phone Number", "Company Name", "Job Title", "Lifecycle Stage",
  "Lead Status", "Contact owner", "Create Date", "Last Activity Date", "Street Address", "City", "State/Region", "Postal Code",
  "Country/Region", "Website URL", "Industry", "Annual Revenue", "Number of Employees", "Record ID", "Associated Company",
  "Original Source", "Marketing contact status", "Date of birth", "Fax Number", "Twitter Username", "LinkedIn", "Additional email addresses",
];
export const SIZE_LIMIT = 512 * 1024 * 1024;
export const LIFECYCLE = ["subscriber", "lead", "marketingqualifiedlead", "salesqualifiedlead", "opportunity", "customer", "evangelist", "other"];
export const LEAD_STATUS = ["new", "open", "in_progress", "open_deal", "unqualified", "attempted_to_contact", "connected", "bad_timing"];

const squash = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES = {
  email: "Email", emailaddress: "Email", eemail: "Email", emailaddr: "Email", mail: "Email",
  firstname: "First Name", first: "First Name", givenname: "First Name", forename: "First Name",
  lastname: "Last Name", last: "Last Name", surname: "Last Name", familyname: "Last Name",
  phone: "Phone Number", phonenumber: "Phone Number", telephone: "Phone Number", tel: "Phone Number",
  mobile: "Mobile Phone Number", mobilephone: "Mobile Phone Number", mobilephonenumber: "Mobile Phone Number", cell: "Mobile Phone Number",
  company: "Company Name", companyname: "Company Name", organization: "Company Name", organisation: "Company Name",
  jobtitle: "Job Title", title: "Job Title", position: "Job Title",
  lifecyclestage: "Lifecycle Stage", lifecycle: "Lifecycle Stage", leadstatus: "Lead Status",
  contactowner: "Contact owner", owner: "Contact owner", createdate: "Create Date", created: "Create Date",
  lastactivitydate: "Last Activity Date", streetaddress: "Street Address", address: "Street Address", street: "Street Address",
  city: "City", state: "State/Region", stateregion: "State/Region", region: "State/Region", province: "State/Region",
  postalcode: "Postal Code", zip: "Postal Code", zipcode: "Postal Code", postcode: "Postal Code",
  country: "Country/Region", countryregion: "Country/Region", websiteurl: "Website URL", website: "Website URL", url: "Website URL",
  industry: "Industry", annualrevenue: "Annual Revenue", revenue: "Annual Revenue", numberofemployees: "Number of Employees", employees: "Number of Employees",
  recordid: "Record ID", id: "Record ID", associatedcompany: "Associated Company", originalsource: "Original Source",
  marketingcontactstatus: "Marketing contact status", dateofbirth: "Date of birth", dob: "Date of birth", birthday: "Date of birth",
  faxnumber: "Fax Number", fax: "Fax Number", twitterusername: "Twitter Username", twitter: "Twitter Username", linkedin: "LinkedIn",
  additionalemailaddresses: "Additional email addresses",
};
for (const p of PROPERTIES) ALIASES[squash(p)] = p;
const canon = (h) => ALIASES[squash(h.trim())] || null;

const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const EXCEL_ERR = /^#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)$/i;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const TYPO_DOMAINS = { "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com", "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "outlok.com": "outlook.com", "outloook.com": "outlook.com", "icloud.co": "icloud.com" };
const ROLE = /^(info|sales|support|admin|contact|hello|office|accounts|billing|team|enquiries|inquiries|help|service|noreply|no-reply|webmaster|marketing)@/i;

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

function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function prepare(input) {
  const text = String(input || "").replace(/^﻿/, "");
  const delim = detectDelimiter(text);
  const parsed = parseCsv(text, delim);
  const rows = parsed.rows.filter((r) => !(r.cells.length === 1 && r.cells[0].trim() === ""));
  return { text, delim, parsed, rows };
}

// First occurrence of each property wins; later columns mapping to the same property are reported.
function columnMap(header) {
  const idx = {};
  const dups = [];
  header.forEach((h, i) => {
    const p = canon(h);
    if (!p) return;
    if (p in idx) dups.push({ name: p, i, heading: h }); else idx[p] = i;
  });
  return { idx, dups };
}

// Date shapes: returns "dmy", "mdy", "ymd", "ambiguous" (day and month both <= 12), or "other".
export function dateShape(v) {
  const s = v.trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}([T ].*)?$/.test(s)) return "ymd";
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return "other";
  const a = +m[1], b = +m[2];
  if (a > 12 && b <= 12) return "dmy";
  if (b > 12 && a <= 12) return "mdy";
  if (a > 12 && b > 12) return "other";
  return "ambiguous";
}
const isDateCol = (name) => /date|created|birthday|\bdob\b/i.test(name);

const normPhone = (s) => s.replace(/[^\d]/g, "");

export function validate(input) {
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line, title, detail });
  const { text, delim, parsed, rows } = prepare(input);
  const empty = { findings, summary: { rows: 0, contacts: 0, columns: 0, delimiter: delim, bytes: 0, withEmail: 0, withoutEmail: 0, duplicates: 0, mapped: [], unmapped: [], list: [] } };
  if (!text.trim()) { add("error", 0, "The file is empty", "There is nothing to check."); return empty; }
  if (parsed.unterminated) add("error", parsed.unterminated, "A quoted cell is never closed", `A quote opened on line ${parsed.unterminated} has no closing quote, so everything after it reads as one cell. Usually a company name or note containing a stray " mark.`);
  if (delim !== ",") add("warning", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, "HubSpot's importer expects comma-separated CSV (or an Excel file). Excel in many locales saves CSV with semicolons because the comma is the decimal separator. Apply safe fixes rewrites it with commas.");
  if (/[ÃÂ]|â€/.test(text)) add("warning", 0, "Text looks mis-decoded", "Characters such as Ã or â€ usually mean a UTF-8 file was opened and saved as another encoding, so names like Müller turn into MÃ¼ller. Re-export as CSV UTF-8.");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > SIZE_LIMIT) add("warning", 0, `The file is ${(bytes / 1048576).toFixed(0)} MB`, "HubSpot's help pages describe a file size cap on an import (about 512 MB when this was read; check the current figure). Split the file and import the parts one at a time.");

  const header = rows[0].cells.map((h) => h.trim());
  const { idx, dups } = columnMap(header);
  const mapped = [], unmapped = [];
  header.forEach((h, i) => {
    if (!h) { add("warning", rows[0].line, `Column ${i + 1} has no heading`, "HubSpot's import wizard cannot map a column without a heading name. Delete it or name it."); return; }
    const p = canon(h);
    if (p) { mapped.push(`${h} → ${p}`); return; }
    unmapped.push(h);
  });
  if (unmapped.length) add("info", rows[0].line, `${unmapped.length} column${unmapped.length === 1 ? "" : "s"} will need mapping by hand`, `${unmapped.slice(0, 8).map((h) => `"${h}"`).join(", ")}${unmapped.length > 8 ? ", …" : ""}. They do not match a default contact property by name, so the wizard asks you to map each to a property or create one. That is normal for custom fields.`);
  for (const d of dups) add("warning", rows[0].line, `Two columns both look like "${d.name}"`, `"${d.heading}" and the earlier column map to the same property. In the wizard only one can be mapped to it; the other would be skipped or need a custom property.`);
  const hasEmail = "Email" in idx;
  if (!hasEmail) add("warning", rows[0].line, "No email column found", "HubSpot uses the email address to match a row to an existing contact. Without it every row is created as a new contact, so importing the same file twice doubles your database. If you are updating existing contacts, include Record ID instead.");
  if (!hasEmail && !("Record ID" in idx) && !("First Name" in idx) && !("Last Name" in idx)) add("error", rows[0].line, "No email, name or Record ID column", "A row needs something to identify it as a contact. Check the header row is the first line of the file.");

  const data = rows.slice(1);
  const get = (r, name) => (name in idx && idx[name] < r.cells.length ? r.cells[idx[name]] : "");
  if (data.length === 0) add("error", 0, "There are no contacts", "The file has a header and nothing under it.");

  const emails = new Map();
  const rowSig = new Map();
  const phones = new Map();
  const list = [];
  const dateCols = header.map((h, i) => ({ h, i })).filter((c) => c.h && (isDateCol(c.h) || isDateCol(canon(c.h) || "")));
  const dateSeen = new Map(dateCols.map((c) => [c.i, { shapes: new Set(), lines: {} }]));
  let withEmail = 0, withoutEmail = 0, dupRows = 0, roleCount = 0;

  for (const r of data) {
    const L = r.line;
    if (r.cells.length !== header.length) add("error", L, `This row has ${r.cells.length} cells, the header has ${header.length}`, "An unquoted comma inside a company name or address, or a missing one, shifts every later cell into the wrong property.");
    for (const c of r.cells) if (EXCEL_ERR.test(c.trim())) { add("error", L, `Spreadsheet error value ${c.trim()}`, "A formula failed before the file was saved. Replace it with the real value, or HubSpot imports the error text into the property."); break; }

    const em = get(r, "Email").trim();
    const fn = get(r, "First Name").trim(), ln = get(r, "Last Name").trim();
    const nameStr = `${fn} ${ln}`.trim();
    list.push({ line: L, name: nameStr, email: em, company: get(r, "Company Name").trim(), stage: get(r, "Lifecycle Stage").trim() });

    const sig = r.cells.map((c) => c.trim()).join("\u0001");
    if (rowSig.has(sig)) { dupRows++; add("warning", L, "Exact copy of an earlier row", `Identical to line ${rowSig.get(sig)}. HubSpot would merge them into one contact, but it is the same row twice. Safe fixes removes it.`); } else rowSig.set(sig, L);

    if (em) {
      withEmail++;
      if (/^mailto:/i.test(em)) add("warning", L, `Email "${em}" starts with mailto:`, "HubSpot wants the bare address. Safe fixes removes the prefix.");
      else if (/[,;]/.test(em) || /\s/.test(em) && (em.match(/@/g) || []).length > 1 || (em.match(/@/g) || []).length > 1) add("error", L, `Email "${em}" holds more than one address`, "The Email property takes one address. HubSpot rejects the value or keeps the wrong one. Put the main address in Email and the others in Additional email addresses.");
      else if (!EMAIL.test(em)) add("error", L, `Email "${em}" does not look like an address`, "HubSpot rejects the row or stores an address nothing can reach. A name or a note in the email column, a missing @, or a missing domain ending.");
      else {
        const dom = em.toLowerCase().split("@")[1];
        if (TYPO_DOMAINS[dom]) add("warning", L, `Email "${em}" may have a typo in the domain`, `Did you mean @${TYPO_DOMAINS[dom]}? The address would import, then bounce when you email it.`);
        if (ROLE.test(em)) roleCount++;
      }
      const e = em.toLowerCase().replace(/^mailto:/, "");
      if (EMAIL.test(e)) { if (!emails.has(e)) emails.set(e, []); emails.get(e).push({ line: L, sig }); }
    } else {
      withoutEmail++;
    }

    if ((fn || ln) && !em && hasEmail) add("info", L, `${nameStr} has no email`, "HubSpot can create the contact, but with no email it cannot be matched later, so re-importing creates a second copy.");
    if (!em && !fn && !ln && !get(r, "Record ID").trim() && !get(r, "Company Name").trim() && r.cells.some((c) => c.trim())) add("warning", L, "Row has no email, name, company or Record ID", "Nothing identifies this contact. HubSpot will skip it or create an empty record.");
    for (const n of [fn, ln]) if (n && n === n.toUpperCase() && /[A-Z]{3,}/.test(n)) { add("info", L, `Name "${n}" is all capitals`, "It will import as typed and appear that way in personalised emails (Hi MARIA). Check before sending marketing email."); break; }
    if (fn && ln && fn === ln) add("info", L, `First and last name are both "${fn}"`, "Often the full name pasted into both columns.");
    if (fn && /\s/.test(fn) && /[a-z]\s+[A-Z]/.test(fn) && !ln) add("info", L, `First Name "${fn}" looks like a full name with no last name`, "The whole name sits in First Name, so personalisation and sorting by last name will be wrong.");

    const stage = get(r, "Lifecycle Stage").trim();
    if (stage && !LIFECYCLE.includes(squash(stage))) add("error", L, `Lifecycle Stage "${stage}" is not a HubSpot stage`, `Accepted stages are Subscriber, Lead, Marketing Qualified Lead, Sales Qualified Lead, Opportunity, Customer, Evangelist and Other (internal names: ${LIFECYCLE.join(", ")}). Anything else is left blank or stops the mapping.`);
    const ls = get(r, "Lead Status").trim();
    if (ls && !LEAD_STATUS.includes(ls.toLowerCase().replace(/[\s-]+/g, "_"))) add("warning", L, `Lead Status "${ls}" is not one of the default values`, `The defaults are ${LEAD_STATUS.join(", ")}. If your account added custom statuses this is fine; otherwise the value is dropped.`);

    for (const n of ["Phone Number", "Mobile Phone Number", "Fax Number", "Record ID"]) {
      const v = get(r, n).trim();
      if (v && SCI.test(v)) add("error", L, `${n} ${v} is scientific notation`, "Excel rewrote a long number as 1.23457E+11 and the digits are gone. Re-export the column as Text from the source and re-enter the numbers.");
      if (v && n !== "Record ID" && /[A-Za-z]{3,}/.test(v.replace(/\b(ext|x)\.?\s*\d+$/i, ""))) add("warning", L, `${n} "${v}" contains letters`, "A note written into the phone column is imported as the number. HubSpot cannot validate or call it.");
    }
    for (const n of ["Phone Number", "Mobile Phone Number"]) {
      const v = get(r, n).trim();
      if (!v) continue;
      const d = normPhone(v);
      if (/^\d{9,10}$/.test(v) && !v.startsWith("0") && !get(r, "Country/Region").trim()) add("info", L, `${n} ${v} has no country code or formatting`, "HubSpot does not guess a country from a bare number. Check Excel did not drop a leading zero, and add a +country code if calling or texting from HubSpot.");
      if (d.length > 0 && (d.length < 7 || d.length > 15)) add("warning", L, `${n} "${v}" has ${d.length} digits`, "Phone numbers run 7 to 15 digits including the country code. A truncated or merged number is likely.");
      if (d.length >= 7 && n === "Phone Number") { if (!phones.has(d)) phones.set(d, []); phones.get(d).push(L); }
    }
    const pc = get(r, "Postal Code").trim(), co = get(r, "Country/Region").trim().toLowerCase();
    if (pc && /^\d{4}$/.test(pc) && /^(us|usa|united states|united states of america)$/.test(co)) add("warning", L, `Postal Code ${pc} is four digits for a US address`, "A ZIP code beginning with 0 loses it when Excel treats the column as a number (Boston 02108 becomes 2108). Check the source.");
    if (pc && SCI.test(pc)) add("error", L, `Postal Code ${pc} is scientific notation`, "Excel rewrote the code.");
    const web = get(r, "Website URL").trim();
    if (web && (/\s/.test(web) || !/\./.test(web))) add("warning", L, `Website URL "${web}" does not look like a web address`, "A name or note in the website column. HubSpot uses the website domain to associate a contact with a company.");

    for (const n of ["Annual Revenue", "Number of Employees"]) {
      const v = get(r, n).trim();
      if (!v) continue;
      if (/[$€£,\s]|[kKmM]$/.test(v) || !/^-?\d+(\.\d+)?$/.test(v)) add("warning", L, `${n} "${v}" is not a plain number`, "Number properties reject currency symbols, thousands separators, spaces and suffixes such as 2M. HubSpot leaves the value blank or fails the row. Safe fixes cleans symbols and commas.");
    }
    for (const c of dateCols) {
      const v = (r.cells[c.i] || "").trim();
      if (!v) continue;
      const shape = dateShape(v);
      const d = dateSeen.get(c.i);
      d.shapes.add(shape);
      if (!d.lines[shape]) d.lines[shape] = L;
      if (shape === "other") add("warning", L, `${c.h} "${v}" is not a date HubSpot reads`, "Use YYYY-MM-DD, or MM/DD/YYYY or DD/MM/YYYY consistently. Month names, times with no date and text are dropped.");
    }
  }

  for (const c of dateCols) {
    const { shapes, lines } = dateSeen.get(c.i);
    const real = [...shapes].filter((s) => s === "dmy" || s === "mdy");
    if (real.length === 2) add("error", lines.dmy, `Column "${c.h}" mixes day-first and month-first dates`, `Line ${lines.dmy} is day-first (the day is above 12) and line ${lines.mdy} is month-first. The import wizard asks for one date format for the whole column, so one set will be read as the wrong date or rejected.`);
    else if (real.length === 1 && shapes.has("ambiguous")) add("warning", lines.ambiguous, `Column "${c.h}" has dates that could be read either way`, `Some dates (like line ${lines.ambiguous}) have a day and month both 12 or under, while others prove the column is ${real[0] === "dmy" ? "day-first" : "month-first"}. Pick that format in the wizard and the ambiguous ones follow it; check one.`);
    else if (!real.length && shapes.has("ambiguous")) add("info", lines.ambiguous, `Column "${c.h}" dates are ambiguous`, "Every date has a day and month both 12 or under, so the file cannot say whether 03/04/2026 is 3 April or 4 March. Choose the format in the wizard from your source system.");
  }

  let dupEmails = 0;
  for (const [e, g] of emails) {
    if (g.length < 2) continue;
    if (new Set(g.map((x) => x.sig)).size === 1) continue; // exact copies are flagged above
    dupEmails += g.length - 1;
    add("warning", g[1].line, `Email ${e} appears on ${g.length} rows`, `Lines ${g.map((x) => x.line).join(", ")}. HubSpot treats the email as the contact's identity, so these rows become one contact and later rows overwrite earlier values for the same property. If they are different people sharing a mailbox, they will be merged.`);
  }
  let samePhone = 0;
  for (const [, ls] of phones) if (ls.length > 1) { samePhone++; if (samePhone <= 10) add("info", ls[1], `The same phone number is on ${ls.length} rows`, `Lines ${ls.join(", ")}. Often one person entered twice with different emails, which HubSpot will keep as two contacts.`); }
  if (samePhone > 10) add("info", 0, `${samePhone - 10} more shared phone numbers`, "Only the first 10 are listed.");
  if (roleCount) add("info", 0, `${roleCount} role address${roleCount === 1 ? "" : "es"} (info@, sales@, support@ …)`, "Shared mailboxes import fine, but they convert and engage worse than named people and are more often marked as spam. Decide whether they belong in a marketing list.");

  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  return { findings, summary: { rows: data.length, contacts: data.length, columns: header.length, delimiter: delim, bytes, withEmail, withoutEmail, duplicates: dupEmails + dupRows, mapped, unmapped, list } };
}

// ---------- repair ----------
// Changes only what has one reasonable reading. Never edits the letters of a name, a company, a
// phone number, a postal code, a date or a lifecycle stage.
export function repair(input) {
  const { delim, parsed, rows } = prepare(input);
  const changes = [];
  if (parsed.unterminated) return { text: "", changes, error: "A quoted cell is never closed, so the file cannot be rewritten safely." };
  if (!rows.length) return { text: "", changes, error: "The file is empty." };
  const header = rows[0].cells.map((h) => h.trim());
  const out = [header.map((h, i) => {
    if (h !== rows[0].cells[i]) changes.push(`Heading "${rows[0].cells[i]}" trimmed`);
    return h;
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
    for (let i = 0; i < cells.length; i++) if (cells[i] !== cells[i].trim()) { cells[i] = cells[i].trim(); bump("trim", "stray spaces trimmed"); }
    const em = get("Email");
    if (/^mailto:/i.test(em)) set("Email", em.replace(/^mailto:/i, "").trim(), "mailto", "mailto: prefix removed");
    const em2 = get("Email");
    if (EMAIL.test(em2) && em2 !== em2.toLowerCase()) set("Email", em2.toLowerCase(), "lower", "email lower-cased (HubSpot compares them ignoring case)");
    for (const n of ["Annual Revenue", "Number of Employees"]) {
      const v = get(n);
      const cleaned = v.replace(/^[$€£]\s*/, "").replace(/(?<=\d),(?=\d{3}(\D|$))/g, "");
      if (v && cleaned !== v && /^-?\d+(\.\d+)?$/.test(cleaned)) set(n, cleaned, "num", "currency symbol or thousands comma removed from a number");
    }
    const sig = cells.join("\u0001");
    if (seen.has(sig)) { removed++; continue; }
    seen.add(sig);
    out.push(cells);
  }
  for (const c of Object.values(counts)) changes.push(`${c.msg} (${c.n} cell${c.n === 1 ? "" : "s"})`);
  if (removed) changes.push(`Exact duplicate rows removed (${removed})`);
  return { text: toCsv(out, ","), changes, error: "" };
}

// Contacts that would be merged because they share an email, as a CSV the user can review.
export function duplicateGroups(input) {
  const { rows, parsed } = prepare(input);
  if (parsed.unterminated || rows.length < 2) return [];
  const header = rows[0].cells.map((h) => h.trim());
  const { idx } = columnMap(header);
  if (!("Email" in idx)) return [];
  const groups = new Map();
  for (const r of rows.slice(1)) {
    const e = (r.cells[idx.Email] || "").trim().toLowerCase().replace(/^mailto:/, "");
    if (!EMAIL.test(e)) continue;
    if (!groups.has(e)) groups.set(e, []);
    groups.get(e).push(r);
  }
  return [...groups].filter(([, g]) => g.length > 1).map(([email, g]) => ({ email, lines: g.map((r) => r.line), rows: g.map((r) => r.cells) }));
}

export function duplicatesCsv(input) {
  const { rows } = prepare(input);
  const groups = duplicateGroups(input);
  if (!groups.length) return "";
  const header = rows[0].cells.map((h) => h.trim());
  const body = [];
  for (const g of groups) g.rows.forEach((cells, i) => body.push([String(g.lines[i]), g.email, ...cells]));
  return toCsv([["line", "shared_email", ...header], ...body]);
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.title, f.detail])]);
}

export function sampleFile() {
  return [
    "First Name,Last Name,Email,Phone Number,Company Name,Job Title,Lifecycle Stage,Lead Status,Create Date,Country/Region,Postal Code",
    "Maya,Okafor,maya@harbourcoffee.example,+44 117 496 0123,Harbour Coffee Roasters,Owner,customer,OPEN,2026-01-14,United Kingdom,BS1 4RR",
    "Tom,Brightside,tom@brightside.example,+44 113 496 0456,Brightside Dental,Practice manager,lead,NEW,2026-02-03,United Kingdom,LS1 5AB",
    "Priya,Raman,priya@northfieldprint.example,,Northfield Print Co,Director,marketingqualifiedlead,IN_PROGRESS,2026-02-20,United Kingdom,YO1 6GA",
    "",
  ].join("\n");
}

export function sampleBrokenFile() {
  return [
    "First Name;Last Name;E-mail;Mobile;Company;Lifecycle;Lead Status;Created;Annual Revenue;Postal Code;Country;Favourite colour",
    "MAYA;OKAFOR;maya@gmial.com;4.41175E+11;Harbour Coffee Roasters;Customer;OPEN;14/01/2026;$1,200,000;BS1 4RR;United Kingdom;blue",
    "Maya;Okafor;maya@gmial.com;;Harbour Coffee;Hot lead;OPEN;03/02/2026;;;;",
    "Tom;Brightside;tom@brightside, tom2@brightside.example;0113 496 0456;Brightside Dental;lead;WARM;02/14/2026;2M;LS1 5AB;United Kingdom;",
    "Sam;Lee;mailto:sam@lee.example;;;;;;;2108;USA;",
    "Info Desk;;info@acme.example;call after 5pm;Acme;;;;;;;",
    "",
  ].join("\n");
}
