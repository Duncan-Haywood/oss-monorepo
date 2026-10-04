// Salesforce Lead import CSV checker. Pure functions, no DOM, no network.
// Field names, picklist defaults and limits are read from memory of Salesforce's public Data Import
// Wizard and Data Loader documentation; no Salesforce org was available when this was built.

// Canonical field (API name) -> aliases a spreadsheet or another CRM commonly uses (compared with
// case, spaces, underscores and punctuation removed).
export const FIELDS = {
  FirstName: ["firstname", "first", "givenname", "fname"],
  LastName: ["lastname", "last", "surname", "familyname", "lname"],
  Company: ["company", "companyname", "organization", "organisation", "account", "accountname", "employer"],
  Title: ["title", "jobtitle", "position", "role"],
  Salutation: ["salutation", "prefix"],
  Email: ["email", "emailaddress", "workemail", "primaryemail"],
  Phone: ["phone", "phonenumber", "telephone", "tel", "workphone"],
  MobilePhone: ["mobilephone", "mobile", "cell", "cellphone"],
  Website: ["website", "websiteurl", "url", "web"],
  Street: ["street", "streetaddress", "address", "address1"],
  City: ["city", "town"],
  State: ["state", "stateprovince", "province", "region"],
  PostalCode: ["postalcode", "zip", "zipcode", "postcode", "zippostalcode"],
  Country: ["country", "countryregion"],
  LeadSource: ["leadsource", "source"],
  Status: ["status", "leadstatus"],
  Industry: ["industry", "sector"],
  Rating: ["rating"],
  AnnualRevenue: ["annualrevenue", "revenue"],
  NumberOfEmployees: ["numberofemployees", "employees", "employeecount", "headcount"],
  Description: ["description", "notes", "note", "comments"],
  OwnerId: ["ownerid", "leadowner", "owner"],
  Id: ["id", "leadid", "recordid"],
};
export const SEVERITIES = ["error", "warning", "info"];
// From memory: Data Import Wizard takes 50,000 records per import; Data Loader goes far higher.
export const LIMITS = { wizardRows: 50000, LastName: 80, FirstName: 40, Company: 255, Title: 128, City: 40, State: 80, PostalCode: 20, Country: 80, Website: 255, Street: 255, Phone: 40, MobilePhone: 40, Description: 32000 };
export const LEAD_STATUS = ["Open - Not Contacted", "Working - Contacted", "Closed - Converted", "Closed - Not Converted"];
export const RATING = ["Hot", "Warm", "Cold"];
export const LEAD_SOURCE = ["Web", "Phone Inquiry", "Partner Referral", "Purchased List", "Other"];
export const SALUTATION = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];

const squash = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIAS = new Map();
for (const [field, list] of Object.entries(FIELDS)) {
  ALIAS.set(squash(field), field);
  for (const a of list) if (!ALIAS.has(a)) ALIAS.set(a, field);
}
const ci = (list, v) => list.find((x) => x.toLowerCase() === v.trim().toLowerCase());

const TYPO_DOMAINS = new Map([
  ["gmial.com", "gmail.com"], ["gmai.com", "gmail.com"], ["gamil.com", "gmail.com"], ["gmail.con", "gmail.com"], ["gmail.co", "gmail.com"],
  ["gnail.com", "gmail.com"], ["hotmial.com", "hotmail.com"], ["hotnail.com", "hotmail.com"], ["hotmail.con", "hotmail.com"],
  ["yaho.com", "yahoo.com"], ["yahooo.com", "yahoo.com"], ["yahoo.con", "yahoo.com"], ["outlok.com", "outlook.com"], ["outlook.con", "outlook.com"],
]);
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "yopmail.com", "trashmail.com", "sharklasers.com"]);
const FREEMAIL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"]);
const EMAIL = /^[^\s@,;<>()[\]"]+@[^\s@,;<>()[\]"]+\.[^\s@,;<>()[\]"]{2,}$/;
const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const SFID = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;
const trunc = (s, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return new TextDecoder("utf-8").decode(u8);
}

// RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. Tracks the
// physical line each record starts on so findings can name it.
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


export function closestField(name) {
  const n = squash(name);
  let best = null, bestD = 99;
  for (const [alias, field] of ALIAS) {
    const d = distance(n, alias);
    if (d < bestD) { bestD = d; best = field; }
  }
  return n.length >= 3 && bestD <= (n.length >= 5 ? Math.max(2, Math.floor(n.length / 4)) : 1) ? best : null;
}

function detectDelim(text) {
  const firstLine = text.split("\n", 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  if (count(",") === 0 && count(";") > 0) return ";";
  if (count(",") === 0 && count("\t") > 0) return "\t";
  return ",";
}

// A date cell: returns { a, b, y, order } where order is "md", "dm", "ymd" or "?" when both
// leading parts are 12 or less.
export function parseDate(v) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v.trim());
  if (m) return { y: +m[1], a: +m[2], b: +m[3], order: "ymd" };
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v.trim());
  if (!m) return null;
  const a = +m[1], b = +m[2];
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return { y, a, b, order: a > 12 && b <= 12 ? "dm" : b > 12 && a <= 12 ? "md" : a > 12 && b > 12 ? "bad" : "?" };
}

const isDateHeader = (h) => /date|birth|anniversary/i.test(h);
const pad = (n) => String(n).padStart(2, "0");
const titleCase = (list) => list.join(", ");

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, leads: 0, columns: 0, delimiter: ",", mapped: [], unmapped: [], dupEmails: 0, mode: "Lead" };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a Salesforce lead import CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Save as CSV UTF-8 or accented names will be stored damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'Salesforce reads a comma-separated file. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use "Apply safe fixes" below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. An unescaped quote inside a description or title is the usual cause: inside a quoted cell a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  if (rows.length - 1 > LIMITS.wizardRows) add("warning", "row-limit", 0, `${rows.length - 1} rows`, `The Data Import Wizard takes ${LIMITS.wizardRows.toLocaleString("en-US")} records per import (from memory). Split the file or use Data Loader.`);

  const idx = {};
  const seenHeaders = new Map();
  header.forEach((h, i) => {
    if (h === "") { add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "Salesforce asks you to map or skip an unnamed column. Often a stray trailing comma."); return; }
    const key = h.toLowerCase();
    if (seenHeaders.has(key)) add("warning", "dup-header", 1, `Column "${h}" appears twice`, `Columns ${seenHeaders.get(key) + 1} and ${i + 1} share a name. Data Loader rejects a duplicate field in the mapping; the wizard may map only one.`);
    else seenHeaders.set(key, i);
    const field = ALIAS.get(squash(h));
    if (field) {
      summary.mapped.push({ column: h, property: field });
      if (idx[field] === undefined) idx[field] = i;
      else add("warning", "dup-property", 1, `Columns ${idx[field] + 1} and ${i + 1} both map to ${field}`, "Only one column can feed a field. Merge them in the spreadsheet first.");
      if (h !== field && squash(h) !== squash(field)) add("info", "alias-header", 1, `Column "${h}" will need mapping to ${field}`, `The import tools match by name and ask you to map the rest. Renaming the column to ${field} makes it automatic.`);
    } else {
      summary.unmapped.push(h);
      const near = closestField(h);
      add(near ? "warning" : "info", "unknown-header", 1, `Column "${h}" is not a standard Lead field`, near ? `Did you mean ${near}? Otherwise map it to a custom field (those end in __c) or skip it.` : "Map it to a custom field in your org (custom fields end in __c) or skip it.");
    }
  });
  if (idx.LastName === undefined) add("error", "missing-last-name", 1, "There is no LastName column", "LastName is required on every Lead, so every row would be rejected.");
  if (idx.Company === undefined) add("error", "missing-company", 1, "There is no Company column", "Company is required on every Lead. For Contacts, import with Account Name or Account ID instead of this tool's Lead rules.");
  if (idx.Email === undefined && idx.Id === undefined) add("info", "no-identifier", 1, "There is no Email or Id column", "Without either, the Data Import Wizard has nothing to match on, so it cannot avoid creating duplicates on a second import.");

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const data = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma in a company name or address pushed the following cells one column to the right. Quote the cell that contains the comma.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that no cell was lost.");
    data.push(r);
  }
  summary.leads = data.length;
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  const emails = new Map();
  const keys = new Map();
  for (const r of data) {
    const L = r.line;
    if (idx.LastName !== undefined && !g(r, "LastName").trim()) add("error", "last-name-blank", L, "Row has no LastName", "LastName is required, so Salesforce rejects this row.");
    if (idx.Company !== undefined && !g(r, "Company").trim()) add("error", "company-blank", L, "Row has no Company", "Company is required on a Lead. Use the person's name or [not provided] if you truly have none; a blank is rejected.");
    for (const f of Object.keys(LIMITS)) {
      if (f === "wizardRows") continue;
      const v = g(r, f);
      if (v.length > LIMITS[f]) add("error", "too-long", L, `${f} is ${v.length} characters`, `${f} holds at most ${LIMITS[f]} characters (from memory). Salesforce rejects the row or the value is cut off.`);
    }
    const email = g(r, "Email"), e = email.trim();
    if (e) {
      if (email !== e) add("info", "email-space", L, `Email "${email}" has spaces around it`, "Spaces can make an address fail validation. Safe fixes trim them.");
      if (/^mailto:/i.test(e)) add("warning", "email-mailto", L, `Email "${trunc(e)}" starts with mailto:`, "Remove the mailto: prefix. It usually comes from a hyperlink in the spreadsheet.");
      else if (/[,;]/.test(e)) add("error", "email-multiple", L, `Email cell "${trunc(e)}" holds more than one address`, "The Email field takes one address. Put the other on its own row or in a custom field.");
      else if (/<.*>/.test(e)) add("error", "email-display", L, `Email "${trunc(e)}" is in "Name <address>" form`, "Keep only the address inside the angle brackets and put the name in FirstName and LastName.");
      else if (!EMAIL.test(e)) add("error", "email-format", L, `Email "${trunc(e)}" is not a valid address`, "Salesforce validates the format and rejects the row. An address needs one @, no spaces, and a domain with a dot.");
      else {
        const [, domain] = e.toLowerCase().split("@");
        const fix = TYPO_DOMAINS.get(domain);
        if (fix) add("warning", "email-typo", L, `Email domain "${domain}" looks like a typo`, `Did you mean ${fix}? A mistyped domain bounces.`);
        if (DISPOSABLE.has(domain)) add("warning", "email-disposable", L, `Email "${trunc(e)}" is a disposable address`, "Throwaway inboxes never become customers and add noise to the lead queue.");
        if (FREEMAIL.has(domain) && g(r, "Company").trim()) add("info", "email-freemail", L, `Email "${trunc(e)}" is a personal mailbox`, "Fine for a small business, but routing and duplicate rules that match on company domain will not work for it.");
        if (e !== e.toLowerCase()) add("info", "email-case", L, `Email "${trunc(e)}" has capitals`, "Salesforce ignores case in matching, but other systems may not. Safe fixes lowercase them.");
        const k = e.toLowerCase();
        if (!emails.has(k)) emails.set(k, []);
        emails.get(k).push(L);
      }
    }
    const nameKey = [g(r, "FirstName"), g(r, "LastName"), g(r, "Company")].map((x) => x.trim().toLowerCase()).join("|");
    if (nameKey !== "||" && !e) { if (!keys.has(nameKey)) keys.set(nameKey, []); keys.get(nameKey).push(L); }
    for (const col of ["Phone", "MobilePhone"]) {
      const v = g(r, col).trim();
      if (!v) continue;
      if (SCI.test(v)) add("error", "phone-sci", L, `${col} "${v}" is in scientific notation`, "Excel turned a long number into scientific notation and the original digits are gone. Format the column as Text and re-enter the numbers.");
      else if (/[a-wyz]/i.test(v.replace(/\b(ext|x)\b\.?\s*\d+/i, ""))) add("warning", "phone-letters", L, `${col} "${trunc(v)}" contains letters`, "Only digits, spaces, + ( ) - . and an extension read as a phone number.");
    }
    const zip = g(r, "PostalCode").trim();
    if (zip && /^\d{4}$/.test(zip) && /^(us|usa|united states)?$/i.test(g(r, "Country").trim())) add("info", "zip-zero", L, `PostalCode "${zip}" has four digits`, "US ZIP codes have five. Excel drops a leading zero (Boston 02108 becomes 2108). Format the column as Text and restore it.");
    const site = g(r, "Website").trim();
    if (site && /\s/.test(site)) add("warning", "website", L, `Website "${trunc(site)}" contains spaces`, "A web address cannot contain spaces.");

    const status = g(r, "Status").trim();
    if (status && !ci(LEAD_STATUS, status)) add("error", "status", L, `Status "${status}" is not a default Lead status`, `Default statuses: ${titleCase(LEAD_STATUS)}. A value your org does not have is rejected by Data Loader, and the wizard may add it as a new picklist value. Confirm the list in Setup before importing.`);
    else if (status && ci(LEAD_STATUS, status) !== status) add("info", "status-case", L, `Status "${status}" differs in capitals`, `Use ${ci(LEAD_STATUS, status)}. Safe fixes correct it.`);
    const rating = g(r, "Rating").trim();
    if (rating && !ci(RATING, rating)) add("warning", "rating", L, `Rating "${rating}" is not Hot, Warm or Cold`, "Those are the default values; your org may differ.");
    const src = g(r, "LeadSource").trim();
    if (src && !ci(LEAD_SOURCE, src)) add("info", "lead-source", L, `LeadSource "${src}" is not a default source`, `Defaults: ${titleCase(LEAD_SOURCE)}. A new value is added by the wizard, or rejected by Data Loader if the picklist is restricted.`);
    const sal = g(r, "Salutation").trim();
    if (sal && !ci(SALUTATION, sal)) add("warning", "salutation", L, `Salutation "${sal}" is not a default value`, `Defaults: ${titleCase(SALUTATION)}. Note the trailing full stop.`);
    const rev = g(r, "AnnualRevenue").trim();
    if (rev && !/^\d+(\.\d+)?$/.test(rev)) add("error", "revenue", L, `AnnualRevenue "${rev}" is not a plain number`, "Use digits and a decimal point only, with no currency symbol, comma or text such as 5M.");
    const emp = g(r, "NumberOfEmployees").trim();
    if (emp && !/^\d+$/.test(emp)) add("error", "employees", L, `NumberOfEmployees "${emp}" is not a whole number`, "Use digits only. Ranges such as 11-50 and 1,000 are rejected.");
    const owner = g(r, "OwnerId").trim();
    if (owner && SCI.test(owner)) add("error", "owner-sci", L, `OwnerId "${owner}" is in scientific notation`, "Excel damaged the ID. Re-export it as text.");
    else if (owner && !SFID.test(owner)) add("warning", "owner-id", L, `OwnerId "${trunc(owner)}" is not a 15 or 18 character ID`, "Data Loader needs the User ID. The wizard accepts a name or email instead; check which tool you are using.");
    else if (owner && !owner.startsWith("005")) add("warning", "owner-prefix", L, `OwnerId "${owner}" does not start with 005`, "User IDs start with 005 and queue IDs with 00G. Another prefix is a different object's ID.");
    for (const col of Object.keys(idx)) {
      const v = g(r, col).trim();
      if (v && /^#(REF|N\/A|VALUE|NAME|DIV\/0)/.test(v)) add("error", "spreadsheet-error", L, `${col} contains ${v}`, "A spreadsheet formula error was saved into the CSV. Fix or clear the cell.");
    }
  }

  for (const [email, lines] of emails) {
    if (lines.length > 1) {
      summary.dupEmails += lines.length - 1;
      add("warning", "dup-email", lines[1], `"${trunc(email)}" appears ${lines.length} times (lines ${lines.slice(0, 5).join(", ")}${lines.length > 5 ? ", …" : ""})`, "Unless a duplicate rule is active in your org, each row becomes its own Lead and sales works the same person twice. Decide which row to keep.");
    }
  }
  for (const [k, lines] of keys) {
    if (lines.length > 1) add("info", "dup-person", lines[1], `Same name and company on lines ${lines.slice(0, 5).join(", ")}, with no email`, "Without an email there is nothing to tell these apart from one person entered twice.");
  }

  header.forEach((h, c) => {
    if (!h || !isDateHeader(h)) return;
    let md = 0, dm = 0, amb = 0, iso = 0, bad = 0, unread = 0, firstBad = 0;
    for (const r of data) {
      const v = (r.cells[c] ?? "").trim();
      if (!v) continue;
      const d = parseDate(v);
      if (!d) { unread++; if (!firstBad) firstBad = r.line; continue; }
      if (d.order === "md") md++; else if (d.order === "dm") dm++; else if (d.order === "?") amb++; else if (d.order === "ymd") iso++; else { bad++; if (!firstBad) firstBad = r.line; }
      if (d.order === "ymd" && (d.a > 12 || d.b > 31)) { bad++; if (!firstBad) firstBad = r.line; }
    }
    if (md && dm) add("error", "date-mixed", 1, `"${h}" mixes month-first and day-first dates`, `${md} value${md === 1 ? "" : "s"} can only be month/day/year and ${dm} can only be day/month/year. The wizard reads dates in the importing user's locale and Data Loader wants yyyy-MM-dd, so one group lands on the wrong day or fails. Rewrite them as YYYY-MM-DD.`);
    else if (amb && (md || dm || iso)) add("warning", "date-mixed-ambiguous", 1, `"${h}" mixes date styles`, "Some values are written year-first and some with slashes. Rewrite them in one style, preferably YYYY-MM-DD.");
    else if (amb && !md && !dm && !iso) add("info", "date-ambiguous", 1, `"${h}" dates could be read either way`, `${amb} value${amb === 1 ? "" : "s"} such as 03/04/2026 are valid both ways. The wizard uses the importing user's locale; Data Loader will reject slashes.`);
    if (bad) add("error", "date-invalid", firstBad, `"${h}" has ${bad} impossible date${bad === 1 ? "" : "s"}`, "A month above 12 or a day above 31 cannot be a date. Check the first one named here.");
    if (unread) add("warning", "date-unreadable", firstBad, `"${h}" has ${unread} value${unread === 1 ? "" : "s"} that are not dates`, "Use YYYY-MM-DD, or leave the cell blank.");
  });

  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits a name, company, phone,
// address, title, owner, ID or custom field, and never deletes a row except an exact duplicate of
// the row above it in the file.
export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const changes = [];
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  const lines = parsed.rows.map((r) => r.line);
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  const head = rows[0].map((h) => h.trim());
  head.forEach((h, i) => {
    const f = ALIAS.get(squash(h));
    if (f && squash(h) === squash(f) && h !== f) { changes.push(`Header "${h}" renamed to "${f}".`); rows[0][i] = f; head[i] = f; }
  });
  const col = (n) => head.indexOf(n);
  const edit = (ri, c, to, why) => {
    const from = rows[ri][c];
    if (from === to) return;
    rows[ri][c] = to;
    changes.push(`Line ${lines[ri]}, ${head[c]}: "${from}" → "${to}" (${why}).`);
  };
  const em = col("Email"), st = col("Status"), ra = col("Rating");
  const dateCols = head.map((h, i) => (isDateHeader(h) ? i : -1)).filter((i) => i >= 0);
  const dateOrder = new Map();
  for (const c of dateCols) {
    let md = 0, dm = 0;
    for (let ri = 1; ri < rows.length; ri++) { const d = parseDate((rows[ri][c] ?? "").trim()); if (d?.order === "md") md++; else if (d?.order === "dm") dm++; }
    if (md && !dm) dateOrder.set(c, "md"); else if (dm && !md) dateOrder.set(c, "dm");
  }
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((c) => c.trim() === "")) continue;
    if (em >= 0 && r[em] !== undefined) {
      let v = r[em].trim();
      if (/^mailto:/i.test(v)) v = v.replace(/^mailto:/i, "").trim();
      if (EMAIL.test(v)) v = v.toLowerCase();
      if (v !== r[em]) edit(ri, em, v, "trimmed, mailto: removed, lower case");
    }
    if (st >= 0 && r[st] !== undefined) { const f = ci(LEAD_STATUS, r[st]); if (f && f !== r[st]) edit(ri, st, f, "Salesforce spelling"); }
    if (ra >= 0 && r[ra] !== undefined) { const f = ci(RATING, r[ra]); if (f && f !== r[ra]) edit(ri, ra, f, "Salesforce spelling"); }
    for (const c of dateCols) {
      const o = dateOrder.get(c);
      const d = r[c] === undefined ? null : parseDate(r[c].trim());
      if (o && d && (d.order === "md" || d.order === "dm" || d.order === "?")) {
        const [mo, dy] = o === "md" ? [d.a, d.b] : [d.b, d.a];
        if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) edit(ri, c, `${d.y}-${pad(mo)}-${pad(dy)}`, `${o === "md" ? "month" : "day"}-first read from the rest of the column; written as YYYY-MM-DD`);
      }
    }
  }
  for (let ri = rows.length - 1; ri > 1; ri--) {
    if (rows[ri].some((c) => c.trim() !== "") && rows[ri].join("\u0001") === rows[ri - 1].join("\u0001")) { changes.push(`Line ${lines[ri]}: removed an exact copy of the row above it.`); rows.splice(ri, 1); lines.splice(ri, 1); }
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const COLS = ["FirstName", "LastName", "Company", "Title", "Email", "Phone", "LeadSource", "Status", "Rating", "AnnualRevenue", "NumberOfEmployees", "City", "State", "PostalCode", "Country"];
const build = (rows) => toCsv([COLS, ...rows.map((o) => COLS.map((h) => o[h] ?? ""))]);

export function sampleFile() {
  return build([
    { FirstName: "Ana", LastName: "Reyes", Company: "Northwind Studio", Title: "Owner", Email: "ana@example.com", Phone: "+1 415 555 0101", LeadSource: "Web", Status: "Open - Not Contacted", Rating: "Hot", AnnualRevenue: "1200000", NumberOfEmployees: "14", City: "Oakland", State: "CA", PostalCode: "94607", Country: "United States" },
    { FirstName: "Ben", LastName: "Okafor", Company: "Okafor & Sons", Title: "Director", Email: "ben@example.org", LeadSource: "Partner Referral", Status: "Working - Contacted", Rating: "Warm", NumberOfEmployees: "40", City: "London", Country: "United Kingdom" },
    { FirstName: "Chen", LastName: "Wei", Company: "Wei Logistics", Email: "chen@example.net", LeadSource: "Other", Status: "Open - Not Contacted", City: "Boston", State: "MA", PostalCode: "02108", Country: "United States" },
  ]);
}

export function sampleBrokenFile() {
  return build([
    { FirstName: "Ana", LastName: "Reyes", Company: "Northwind Studio", Email: " Ana@Example.com ", Phone: "4.15556E+09", Status: "open", Rating: "hot", AnnualRevenue: "$1.2M", NumberOfEmployees: "11-50", PostalCode: "2108" },
    { FirstName: "Ana", LastName: "Reyes", Company: "Northwind Studio", Email: "ana@example.com", Phone: "call me", Status: "Qualified" },
    { FirstName: "Ben", LastName: "Okafor", Email: "ben@gmial.com, bokafor@example.org", Status: "Working - Contacted" },
    { FirstName: "Dee", LastName: "", Company: "Park Co", Email: "dee.park@mailinator.com" },
    { FirstName: "Eli", LastName: "Stone", Company: "Stone LLC", Email: "Eli Stone <eli@example.com>" },
    { FirstName: "Fay", LastName: "Lund", Company: "Lund AB", Email: "mailto:fay@example.com" },
    { FirstName: "Gus", LastName: "Hale", Company: "Hale Inc", Email: "gus@example.com", Status: "Open - Not Contacted" },
    { FirstName: "Gus", LastName: "Hale", Company: "Hale Inc", Email: "gus@example.com", Status: "Open - Not Contacted" },
  ]);
}
