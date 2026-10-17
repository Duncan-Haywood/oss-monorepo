// HubSpot contacts / companies import CSV checker. Pure functions, no DOM, no network.
// Property labels, internal names, option values and import limits are read from memory of HubSpot's
// public knowledge-base pages on importing records; no HubSpot account or import was available when
// this was built. Custom properties, custom options and account settings are unknowable from a file.

// [label, internal name, type]
export const CONTACT_PROPS = [
  ["Email", "email", "email"], ["First Name", "firstname", "text"], ["Last Name", "lastname", "text"],
  ["Phone Number", "phone", "phone"], ["Mobile Phone Number", "mobilephone", "phone"], ["Fax Number", "fax", "phone"],
  ["Company Name", "company", "text"], ["Job Title", "jobtitle", "text"], ["Salutation", "salutation", "text"],
  ["Lifecycle Stage", "lifecyclestage", "lifecycle"], ["Lead Status", "hs_lead_status", "leadstatus"],
  ["Contact owner", "hubspot_owner_id", "owner"], ["Record ID", "hs_object_id", "id"],
  ["Create Date", "createdate", "date"], ["Date of birth", "date_of_birth", "date"], ["Close Date", "closedate", "date"],
  ["Last Contacted", "notes_last_contacted", "date"], ["Became a Lead Date", "hs_lifecyclestage_lead_date", "date"],
  ["Became a Customer Date", "hs_lifecyclestage_customer_date", "date"],
  ["Street Address", "address", "text"], ["City", "city", "text"], ["State/Region", "state", "text"],
  ["Postal Code", "zip", "zip"], ["Country/Region", "country", "text"], ["Website URL", "website", "url"],
  ["Industry", "industry", "text"], ["Annual Revenue", "annualrevenue", "number"], ["Number of Employees", "numemployees", "number"],
  ["Additional email addresses", "hs_additional_emails", "text"], ["Marketing contact status", "hs_marketable_status", "text"],
  ["Twitter Username", "twitterhandle", "text"], ["Message", "message", "text"],
];
export const COMPANY_PROPS = [
  ["Name", "name", "text"], ["Company Domain Name", "domain", "domain"], ["Phone Number", "phone", "phone"],
  ["Street Address", "address", "text"], ["City", "city", "text"], ["State/Region", "state", "text"],
  ["Postal Code", "zip", "zip"], ["Country/Region", "country", "text"], ["Industry", "industry", "text"],
  ["Number of Employees", "numberofemployees", "number"], ["Annual Revenue", "annualrevenue", "number"],
  ["Type", "type", "text"], ["Description", "description", "text"], ["Website URL", "website", "url"],
  ["Company owner", "hubspot_owner_id", "owner"], ["Lifecycle Stage", "lifecyclestage", "lifecycle"],
  ["Lead Status", "hs_lead_status", "leadstatus"], ["Record ID", "hs_object_id", "id"],
  ["Create Date", "createdate", "date"], ["Year Founded", "founded_year", "text"], ["Is Public", "is_public", "text"],
  ["LinkedIn Company Page", "linkedin_company_page", "url"],
];

// Default option internal values (accounts can add or rename options; that cannot be seen here).
export const LIFECYCLE = ["subscriber", "lead", "marketingqualifiedlead", "salesqualifiedlead", "opportunity", "customer", "evangelist", "other"];
export const LEAD_STATUS = ["NEW", "OPEN", "IN_PROGRESS", "OPEN_DEAL", "UNQUALIFIED", "ATTEMPTED_TO_CONTACT", "CONNECTED", "BAD_TIMING"];

export const ROW_LIMIT = 1048576;
export const COLUMN_LIMIT = 1000;
export const SIZE_LIMIT = 512 * 1024 * 1024;

export const NOT_CHECKED = [
  "Whether an owner email or name matches a user in your HubSpot account",
  "Custom properties and custom dropdown options you created in your account",
  "Whether a contact or company already exists in your account, and what it would be merged with",
  "Whether a lifecycle stage would move backwards for a record already in HubSpot",
  "The date format you pick in the import step matching the dates in the file",
  "Whether an email address can actually receive mail, or has bounced or unsubscribed before",
  "Required properties, validation rules and field limits set in your account",
  "Anything HubSpot has changed in its importer since these rules were read",
];

const ALIASES = {
  mobile: "Mobile Phone Number", mobilenumber: "Mobile Phone Number", cell: "Mobile Phone Number", cellphone: "Mobile Phone Number",
  telephone: "Phone Number", tel: "Phone Number", phonenumber: "Phone Number",
  zipcode: "Postal Code", postcode: "Postal Code", postalcode: "Postal Code", province: "State/Region", stateregion: "State/Region",
  countryregion: "Country/Region", title: "Job Title", position: "Job Title", givenname: "First Name", forename: "First Name",
  surname: "Last Name", familyname: "Last Name", owner: "Contact owner", contactowner: "Contact owner", stage: "Lifecycle Stage", status: "Lead Status",
  dob: "Date of birth", birthday: "Date of birth", birthdate: "Date of birth", dateofbirth: "Date of birth",
  organization: "Company Name", organisation: "Company Name", employer: "Company Name",
  url: "Website URL", web: "Website URL", websiteurl: "Website URL",
  address1: "Street Address", addressline1: "Street Address", street: "Street Address",
  createddate: "Create Date", created: "Create Date", employees: "Number of Employees", revenue: "Annual Revenue",
  emailaddress: "Email", mail: "Email", companyowner: "Company owner", companydomain: "Company Domain Name", domainname: "Company Domain Name",
};
const COMPANY_ALIASES = { companyname: "Name", company: "Name", organization: "Name", organisation: "Name", employer: "Name", owner: "Company owner", websiteurl: "Website URL" };

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SCI = /^[-+]?\d(\.\d+)?e[-+]?\d+$/i;
const EXCEL_ERR = /^(#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)|#{3,})$/i;

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

function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

const isBlankRow = (cells) => cells.every((c) => c.trim() === "");

function prepare(input) {
  const text = String(input || "").replace(/^﻿/, "");
  const delim = detectDelimiter(text);
  const parsed = parseCsv(text, delim);
  const all = parsed.rows;
  let last = all.length - 1;
  while (last >= 0 && isBlankRow(all[last].cells)) last--;
  const rows = all.slice(0, last + 1);
  return { text, delim, parsed, rows };
}

function chooseKind(header, kind) {
  if (kind === "contacts" || kind === "companies") return kind;
  const n = header.map(norm);
  if (n.some((h) => ["email", "emailaddress", "firstname", "lastname"].includes(h))) return "contacts";
  if (n.some((h) => ["companydomainname", "domain", "domainname", "companydomain"].includes(h))) return "companies";
  if (n.includes("name") && !n.includes("company")) return "companies";
  return "contacts";
}

function propTable(kind) {
  const props = kind === "companies" ? COMPANY_PROPS : CONTACT_PROPS;
  const byExact = new Map(), byBare = new Map(), byLabel = new Map();
  for (const p of props) {
    byExact.set(p[0], p); byExact.set(p[1], p);
    byBare.set(norm(p[0]), p); byBare.set(norm(p[1]), p);
    byLabel.set(p[0], p);
  }
  const aliases = new Map();
  const src = kind === "companies" ? { ...ALIASES, ...COMPANY_ALIASES } : ALIASES;
  for (const [k, label] of Object.entries(src)) { const p = byLabel.get(label); if (p && !byBare.has(k)) aliases.set(k, p); }
  return { props, byExact, byBare, aliases };
}

// How a heading relates to the property tables: exact (label or internal name), spelling (same
// letters, different case or punctuation), alias (a common name HubSpot may not auto-map), or unknown.
function resolveHeader(h, table) {
  const t = h.trim();
  if (table.byExact.has(t)) return { how: "exact", prop: table.byExact.get(t) };
  const k = norm(t);
  if (k && table.byBare.has(k)) return { how: "spelling", prop: table.byBare.get(k) };
  if (k && table.aliases.has(k)) return { how: "alias", prop: table.aliases.get(k) };
  return { how: "unknown", prop: null };
}

function closestProperty(name, table) {
  const n = norm(name);
  let best = null, bestD = 99;
  for (const p of table.props) for (const cand of [p[0], p[1]]) {
    const d = distance(n, norm(cand));
    if (d < bestD) { bestD = d; best = p; }
  }
  for (const [k, p] of table.aliases) {
    const d = distance(n, k);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best && bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

function emailProblem(v) {
  if (/^mailto:/i.test(v)) return "starts with mailto:";
  if (/[,;]/.test(v) || (v.match(/@/g) || []).length > 1) return "holds more than one address";
  if (/<.*>/.test(v)) return "is in Name <address> form";
  if (/\s/.test(v)) return "contains a space";
  if (!v.includes("@")) return "has no @";
  if (v.startsWith(".") || /\.\./.test(v.split("@")[0] || "") || /\.@/.test(v)) return "has a misplaced dot before the @";
  if (/\.\./.test(v)) return "has two dots in a row";
  if (!EMAIL.test(v)) return "is not a valid address shape";
  return "";
}

const COUNTRY_ZERO_PHONE = /^(uk|united kingdom|gb|great britain|england|ireland|ie|france|fr|germany|de|australia|au|new zealand|nz|netherlands|nl|italy|it|belgium|be|south africa|za)$/;
const COUNTRY_US = /^(us|usa|united states|united states of america)$/;
const COUNTRY_UK = /^(uk|united kingdom|gb|great britain|england)$/;

// ---------- dates ----------
function validDay(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y || 2000, m, 0)).getUTCDate();
}
const TIME = /(?:[ T]+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:\s?[AaPp][Mm])?(?:\s?(?:Z|UTC|[+-]\d{2}:?\d{2}))?)$/;

// Returns { kind: "dmy" | "mdy" | "ambiguous" | "ymd" | "bad", reason }.
export function classifyDate(raw) {
  const v = raw.trim();
  const d = v.replace(TIME, "");
  let m;
  if ((m = d.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/))) {
    return validDay(+m[1], +m[2], +m[3]) ? { kind: "ymd", year: +m[1] } : { kind: "bad", reason: "is not a real calendar date" };
  }
  if ((m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    const a = +m[1], b = +m[2], y = +m[3];
    const asMdy = validDay(y, a, b), asDmy = validDay(y, b, a);
    if (!asMdy && !asDmy) return { kind: "bad", reason: "is not a real calendar date in either day-first or month-first order" };
    if (asMdy && asDmy) return { kind: "ambiguous", year: y };
    return { kind: asMdy ? "mdy" : "dmy", year: y };
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(d)) return { kind: "bad", reason: "has a two-digit year" };
  if (/^\d{1,2}[-.]\d{1,2}[-.]\d{2,4}$/.test(d)) return { kind: "bad", reason: "uses dashes or dots between day, month and year" };
  if (/[A-Za-z]{3,}/.test(d)) return { kind: "bad", reason: "spells out the month" };
  if (/^\d{5}(\.\d+)?$/.test(d) && +d >= 20000 && +d <= 80000) return { kind: "bad", reason: "looks like an Excel date serial number" };
  if (/^\d{8}$/.test(d)) return { kind: "bad", reason: "is a run of digits with no separators" };
  if (/^\d{10,13}$/.test(d)) return { kind: "bad", reason: "looks like a Unix timestamp" };
  return { kind: "bad", reason: "is not one of the date layouts the import offers" };
}

// ---------- analysis ----------
export function validate(input, options = {}) {
  const rowLimit = options.rowLimit || ROW_LIMIT;
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line, title, detail });
  const { text, delim, parsed, rows } = prepare(input);
  const base = { rows: 0, contacts: 0, columns: 0, delimiter: delim, kind: "contacts", bytes: 0, withEmail: 0, duplicates: 0, list: [], owners: [] };
  const empty = { findings, notChecked: NOT_CHECKED, summary: base };
  if (!text.trim() || !rows.length) { add("error", 0, "The file is empty", "There is nothing to check."); return empty; }
  if (parsed.unterminated) add("error", parsed.unterminated, "A quoted cell is never closed", `A quote opened on line ${parsed.unterminated} has no closing quote, so everything after it reads as one cell. Usually a name containing a stray " mark.`);
  if (delim !== ",") add("warning", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, `HubSpot's import reads comma-separated files. Excel in many locales saves CSV with semicolons because the comma is the decimal separator. Apply safe fixes rewrites it with commas. (Semicolons inside a cell are how a multi-select value is written, and are left alone.)`);
  if (/[ÃÂ]|â€/.test(text)) add("warning", 0, "Text looks mis-decoded", "Characters such as Ã or â€ usually mean a UTF-8 file was opened and saved as another encoding, so names like Müller turn into MÃ¼ller. Re-export as CSV UTF-8.");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > SIZE_LIMIT) add("error", 0, `The file is ${(bytes / 1048576).toFixed(0)} MB`, "HubSpot's import help describes a file size cap of 512 MB (from memory; check the current figure). Split the file and import the parts one at a time.");

  const header = rows[0].cells.map((h) => h.trim());
  const kind = chooseKind(header, options.kind);
  const table = propTable(kind);
  const idx = {}; // internal name -> column index (first one)
  const cols = []; // per column: prop or null
  const seenProp = new Map();
  const spelled = [];
  header.forEach((h, i) => {
    if (!h) { cols[i] = null; add("warning", rows[0].line, `Column ${i + 1} has no heading`, "HubSpot cannot map a column with no heading. Delete it or name it."); return; }
    const res = resolveHeader(h, table);
    cols[i] = res.prop;
    if (res.how === "unknown") {
      const near = closestProperty(h, table);
      if (near) add("warning", rows[0].line, `Heading "${h}" is not a HubSpot property name`, `Looks like a typo of "${near[0]}" (internal name ${near[1]}). Unmatched columns are left for you to map by hand in the import, or skipped.`);
      else add("info", rows[0].line, `Heading "${h}" matches no default ${kind === "companies" ? "company" : "contact"} property`, "Fine if it is a custom property in your account, which this tool cannot see. Otherwise HubSpot will ask you to map it, create a property for it, or skip it.");
      return;
    }
    if (res.how === "alias") add("warning", rows[0].line, `Heading "${h}" is not the property label`, `HubSpot's automatic mapping may not match it. The property is "${res.prop[0]}" (internal name ${res.prop[1]}); rename the heading, or map it by hand in the import.`);
    if (res.how === "spelling") spelled.push(`"${h}" → "${res.prop[0]}"`);
    const key = res.prop[1];
    if (seenProp.has(key)) add("error", rows[0].line, `Property "${res.prop[0]}" appears in two columns`, `Columns ${seenProp.get(key) + 1} and ${i + 1} both map to ${key}. HubSpot lets one column map to a property; delete or merge the other.`);
    else { seenProp.set(key, i); idx[key] = i; }
  });
  if (spelled.length) add("warning", rows[0].line, `${spelled.length} heading${spelled.length === 1 ? " differs" : "s differ"} from the property label`, `${spelled.slice(0, 6).join(", ")}${spelled.length > 6 ? ", …" : ""}. HubSpot matches a heading to a property by its label or internal name. Apply safe fixes restores the label spelling.`);
  if (header.length > COLUMN_LIMIT) add("error", rows[0].line, `The file has ${header.length} columns`, `HubSpot's import help describes a limit of ${COLUMN_LIMIT} columns (from memory).`);

  if (kind === "contacts" && !("email" in idx) && !("hs_object_id" in idx)) add("warning", rows[0].line, "No Email or Record ID column", "HubSpot matches contacts to existing records by email address or Record ID. Without either, every row is created as a new contact and duplicates of existing contacts follow.");
  if (kind === "companies" && !("domain" in idx) && !("hs_object_id" in idx)) add("warning", rows[0].line, "No Company Domain Name or Record ID column", "HubSpot matches companies to existing records by domain name or Record ID. Without either, every row is created as a new company.");
  if (kind === "companies" && !("name" in idx)) add("warning", rows[0].line, "No company Name column", "Companies without a name show as blank records.");

  const data = rows.slice(1);
  if (data.length === 0) add("error", 0, "There are no records", "The file has a header and nothing under it.");
  if (data.length > rowLimit) add("error", 0, `The file has ${data.length.toLocaleString("en-US")} rows`, `HubSpot's import help describes a limit of ${ROW_LIMIT.toLocaleString("en-US")} rows per file (from memory). Split the file and import the parts one at a time.`);

  const get = (r, key) => (key in idx && idx[key] < r.cells.length ? r.cells[idx[key]] : "");
  const emails = new Map(), domains = new Map();
  const owners = new Map();
  const list = [];
  const dateCols = header.map((h, i) => (cols[i] && cols[i][2] === "date") || (!cols[i] && /date|birth/i.test(h)) ? i : -1).filter((i) => i >= 0);
  const dateSeen = new Map(dateCols.map((i) => [i, { dmy: [], mdy: [], amb: 0, ymd: [], n: 0 }]));
  let withEmail = 0, blankRows = 0;

  for (const r of data) {
    const L = r.line;
    if (isBlankRow(r.cells)) { blankRows++; add("warning", L, "Blank row", "Row has no values. HubSpot skips it, and it can throw off row counts in the import summary. Apply safe fixes removes it."); continue; }
    if (r.cells.length !== header.length) add("error", L, `This row has ${r.cells.length} cells, the header has ${header.length}`, "An unquoted comma inside a name or address, or a missing one, shifts every later cell into the wrong column.");
    for (const c of r.cells) if (EXCEL_ERR.test(c.trim())) { add("error", L, `Spreadsheet error value ${c.trim()}`, "A formula failed, or a column was too narrow for a number or date, before the file was saved. Replace it with the real value."); break; }

    const em = get(r, "email").trim();
    if (em) withEmail++;
    const name = kind === "companies" ? get(r, "name").trim() : [get(r, "firstname").trim(), get(r, "lastname").trim()].filter(Boolean).join(" ");
    list.push({ line: L, name, email: kind === "companies" ? get(r, "domain").trim() : em, phone: get(r, "phone").trim() || get(r, "mobilephone").trim(), company: kind === "companies" ? get(r, "city").trim() : get(r, "company").trim() });

    if (kind === "contacts") {
      if (!em && !get(r, "hs_object_id").trim() && "email" in idx) add("info", L, "No email address", "Without an email or Record ID HubSpot cannot match this row to an existing contact, so it is created as new.");
      if (em) {
        const prob = emailProblem(em);
        if (prob) {
          const sev = /^starts with mailto/.test(prob) ? "warning" : "error";
          add(sev, L, `Email "${em}" ${prob}`, /more than one/.test(prob) ? "The Email column takes one address per contact. Put the others in Additional email addresses, or keep the main one." : /mailto/.test(prob) ? "HubSpot wants the bare address. Safe fixes removes the prefix." : "HubSpot rejects rows whose email is not a valid address. Correct it in the source.");
        } else {
          const e = em.toLowerCase();
          if (!emails.has(e)) emails.set(e, []);
          emails.get(e).push(L);
          if (em !== em.toLowerCase()) add("info", L, `Email "${em}" has capital letters`, "HubSpot stores addresses in lower case. Safe fixes lower-cases it so the duplicate check and the file agree.");
        }
      }
      if (/^mailto:/i.test(em)) { const e = em.replace(/^mailto:/i, "").trim().toLowerCase(); if (EMAIL.test(e)) { if (!emails.has(e)) emails.set(e, []); emails.get(e).push(L); } }
    }

    if (kind === "companies" && "domain" in idx) {
      const dom = get(r, "domain").trim();
      if (dom) {
        if (/^[a-z]+:\/\//i.test(dom) || /\//.test(dom) || /^www\./i.test(dom)) add("warning", L, `Domain "${dom}" is not a bare domain`, "HubSpot matches companies on the domain name, like example.com, without http://, www. or a path. A URL here may not match the existing company.");
        else if (/@/.test(dom) || /\s/.test(dom) || !/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(dom)) add("error", L, `Domain "${dom}" is not a valid domain`, "A name, an email address or a note in the domain column.");
        const key = dom.toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
        if (!domains.has(key)) domains.set(key, []);
        domains.get(key).push(L);
      } else add("info", L, "No domain name", "Without a domain HubSpot cannot match the row to an existing company, so it is created as new.");
    }

    for (const [key, i] of Object.entries(idx)) {
      const prop = table.byExact.get(key);
      const v = i < r.cells.length ? r.cells[i].trim() : "";
      if (!v) continue;
      const label = prop[0];
      const type = prop[2];
      if (SCI.test(v) && ["phone", "zip", "id", "owner", "domain", "text", "number"].includes(type)) {
        add(type === "number" ? "warning" : "error", L, `${label} ${v} is scientific notation`, "Excel rewrote a long number as 1.23457E+11 and the digits are gone. Reformat the column as Text and re-export from the source.");
        continue;
      }
      if (type === "phone") {
        if (/^'\d/.test(v)) add("warning", L, `${label} "${v}" starts with an apostrophe`, "A text marker left by a spreadsheet. Safe fixes removes it.");
        else if (/^\d+\.0+$/.test(v)) add("warning", L, `${label} ${v} ends in .0`, "A number-formatted cell exported as a decimal. Safe fixes removes the .0.");
        const country = get(r, "country").trim().toLowerCase();
        const digits = v.replace(/^'/, "");
        if (/^\d{9,10}$/.test(digits) && COUNTRY_ZERO_PHONE.test(country)) add("info", L, `${label} ${v} has no leading zero or country code`, "Excel drops a leading zero from a number-formatted cell. Check it against the source if the number should start with 0 or +.");
        if (/[A-Za-z]{3,}/.test(v.replace(/ext\.?|extension|x\d+/gi, ""))) add("warning", L, `${label} "${v}" contains letters`, "Notes written into the phone column are imported as the number.");
      }
      if (type === "zip") {
        const country = get(r, "country").trim().toLowerCase();
        const z = v.replace(/^'/, "");
        if (/^'\d/.test(v)) add("warning", L, `${label} "${v}" starts with an apostrophe`, "A text marker left by a spreadsheet. Safe fixes removes it.");
        else if (/^\d+\.0+$/.test(v)) add("warning", L, `${label} ${v} ends in .0`, "A number-formatted cell exported as a decimal. Safe fixes removes the .0.");
        if (/^\d{4}$/.test(z) && (COUNTRY_US.test(country) || country === "")) add(COUNTRY_US.test(country) ? "warning" : "info", L, `${label} ${z} is four digits${COUNTRY_US.test(country) ? " for a US address" : " and no country is given"}`, "A ZIP code that begins with 0 loses it when Excel treats the column as a number (Boston 02108 becomes 2108). Check the source. This tool never rewrites a postal code.");
        else if (/^\d{4}-\d{4}$/.test(z)) add("warning", L, `${label} ${z} is a ZIP+4 missing its first digit`, "A leading zero was probably dropped. Check the source.");
        else if (/^\d{3,4}$/.test(z) && COUNTRY_UK.test(country)) add("info", L, `${label} ${z} is too short for a UK postcode`, "Postcodes are letters and digits, like SW1A 1AA. Check the column was not overwritten.");
      }
      if (type === "lifecycle" || type === "leadstatus") {
        const allowed = type === "lifecycle" ? LIFECYCLE : LEAD_STATUS;
        if (!allowed.includes(v)) {
          const hit = allowed.find((a) => norm(a) === norm(v));
          const fieldName = type === "lifecycle" ? "lifecycle stage" : "lead status";
          if (hit) add("warning", L, `${label} "${v}" is not the internal value`, `The internal value is "${hit}". HubSpot's import may accept a label too, but workflows and the API use the internal value. Apply safe fixes writes "${hit}".`);
          else add("error", L, `${label} "${v}" is not a default ${fieldName}`, `Default internal values: ${allowed.join(", ")}. An unknown value is rejected for a dropdown property unless your account has a custom option with that value, which this tool cannot see.`);
        }
      }
      if (type === "owner") {
        if (!owners.has(v)) owners.set(v, []);
        owners.get(v).push(L);
        if (v.includes("@") && emailProblem(v)) add("warning", L, `${label} "${v}" does not look like an email address`, "An owner is matched by the user's email address (or name, or ID) in your account.");
      }
      if (type === "number") {
        if (!/^-?\d+(\.\d+)?$/.test(v)) add("warning", L, `${label} "${v}" is not a plain number`, "Currency symbols, thousands separators and suffixes like M or k can stop a number property importing. Write 1200000, not $1.2M. This tool leaves it for you to change.");
      }
      if (type === "url") {
        if (/\s/.test(v) || !/\./.test(v)) add("warning", L, `${label} "${v}" does not look like a web address`, "A name or note in the website column.");
      }
      if (type === "text" && v.length > 65536) add("warning", L, `${label} is ${v.length} characters`, "Probably two cells merged. Text properties have a length cap.");
    }

    for (const i of dateCols) {
      const v = i < r.cells.length ? r.cells[i].trim() : "";
      if (!v) continue;
      const label = cols[i] ? cols[i][0] : header[i];
      const rec = dateSeen.get(i);
      rec.n++;
      const c = classifyDate(v);
      if (c.kind === "bad") add("error", L, `${label} "${v}" ${c.reason}`, "HubSpot's import reads a date in one of MM/DD/YYYY, DD/MM/YYYY or YYYY/MM/DD (you pick which in the import), with an optional time. Rewrite the column in one of those.");
      else {
        if (c.kind === "dmy") rec.dmy.push(L); else if (c.kind === "mdy") rec.mdy.push(L); else if (c.kind === "ymd") rec.ymd.push(L); else rec.amb++;
        if (c.year && (c.year < 1900 || c.year > 2100)) add("warning", L, `${label} "${v}" has the year ${c.year}`, "Probably a typo or an empty-date placeholder.");
      }
    }
  }

  for (const [i, rec] of dateSeen) {
    const label = cols[i] ? cols[i][0] : header[i];
    if (rec.dmy.length && rec.mdy.length) add("error", Math.min(rec.dmy[0], rec.mdy[0]), `${label} mixes day-first and month-first dates`, `Day-first on lines ${rec.dmy.slice(0, 5).join(", ")}${rec.dmy.length > 5 ? ", …" : ""}; month-first on lines ${rec.mdy.slice(0, 5).join(", ")}${rec.mdy.length > 5 ? ", …" : ""}. The import takes one date format for the file, so one set will be misread or rejected. Rewrite the column in one order.`);
    if (rec.ymd.length && (rec.dmy.length + rec.mdy.length + rec.amb) > 0) add("warning", rec.ymd[0], `${label} mixes year-first and slashed dates`, "The import takes one date format for the file. Rewrite the column in one layout.");
    if (rec.amb > 0 && !rec.dmy.length && !rec.mdy.length && !rec.ymd.length) add("info", 0, `${label}: all ${rec.amb} date${rec.amb === 1 ? "" : "s"} could be read day-first or month-first`, "Nothing in the file says which. Choose DD/MM/YYYY or MM/DD/YYYY in the import's date-format step to match how you wrote them; 03/04/2026 is 3 April in one and 4 March in the other.");
  }

  let dupEmails = 0;
  for (const [e, ls] of emails) if (ls.length > 1) {
    dupEmails += ls.length - 1;
    add("warning", ls[1], `Email ${e} appears ${ls.length} times`, `Lines ${ls.slice(0, 12).join(", ")}${ls.length > 12 ? ", …" : ""}. HubSpot matches contacts on email, so these rows become one contact and a later row can overwrite values from an earlier one. Merge them in the file first.`);
  }
  for (const [d, ls] of domains) if (ls.length > 1) {
    dupEmails += ls.length - 1;
    add("warning", ls[1], `Domain ${d} appears ${ls.length} times`, `Lines ${ls.slice(0, 12).join(", ")}${ls.length > 12 ? ", …" : ""}. HubSpot matches companies on domain name, so these rows become one company.`);
  }
  if (owners.size) {
    const sample = [...owners.entries()].slice(0, 8).map(([k, ls]) => `${k} (${ls.length})`).join(", ");
    add("info", 0, `${owners.size} distinct owner value${owners.size === 1 ? "" : "s"}; not checked`, `${sample}${owners.size > 8 ? ", …" : ""}. HubSpot matches an owner to a user in your account, which this tool cannot see. An owner it cannot find is left blank or fails the row. Compare this list with Settings > Users & Teams.`);
  }

  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  return {
    findings,
    notChecked: NOT_CHECKED,
    summary: { rows: data.length, contacts: data.length - blankRows, columns: header.length, delimiter: delim, kind, bytes, withEmail, duplicates: dupEmails, list, owners: [...owners.entries()].map(([value, ls]) => ({ value, rows: ls.length })) },
  };
}

// ---------- repair ----------
// Formatting only. Every change is listed with its line. Never edits a name, an address, a phone
// number's digits, a postal code's digits, a date, or any value's meaning.
export function repair(input, options = {}) {
  const { delim, parsed, rows } = prepare(input);
  const changes = [];
  if (parsed.unterminated) return { text: "", changes, error: "A quoted cell is never closed, so the file cannot be rewritten safely." };
  if (!rows.length) return { text: "", changes, error: "The file is empty." };
  const kind = chooseKind(rows[0].cells.map((h) => h.trim()), options.kind);
  const table = propTable(kind);
  const header = rows[0].cells.map((h) => h.trim());
  const cols = [];
  const out = [header.map((h, i) => {
    const res = h ? resolveHeader(h, table) : { how: "unknown", prop: null };
    cols[i] = res.prop;
    if (res.how === "spelling" && res.prop[0] !== h) { changes.push(`Line ${rows[0].line}: heading "${rows[0].cells[i]}" → "${res.prop[0]}"`); return res.prop[0]; }
    if (h !== rows[0].cells[i]) changes.push(`Line ${rows[0].line}: heading "${rows[0].cells[i]}" trimmed`);
    return h;
  })];
  if (delim !== ",") changes.push(`Separator ${delim === ";" ? "semicolon" : "tab"} → comma`);
  const firstIdx = new Map();
  cols.forEach((p, i) => { if (p && !firstIdx.has(p[1])) firstIdx.set(p[1], i); });
  let removed = 0;
  for (const r of rows.slice(1)) {
    if (isBlankRow(r.cells)) { removed++; changes.push(`Line ${r.line}: blank row removed`); continue; }
    const cells = r.cells.slice();
    const edit = (i, v, why) => { if (cells[i] !== v) { changes.push(`Line ${r.line}: ${cols[i] ? cols[i][0] : header[i] || `column ${i + 1}`} "${cells[i]}" → "${v}" (${why})`); cells[i] = v; } };
    cells.forEach((c, i) => {
      if (c !== c.trim()) edit(i, c.trim(), "stray spaces trimmed");
    });
    cols.forEach((p, i) => {
      if (!p || i >= cells.length || firstIdx.get(p[1]) !== i) return;
      const v = cells[i];
      if (!v) return;
      if (p[2] === "email") {
        let e = v;
        if (/^mailto:/i.test(e)) e = e.replace(/^mailto:/i, "").trim();
        if (EMAIL.test(e) && e !== e.toLowerCase()) e = e.toLowerCase();
        if (e !== v) edit(i, e, /^mailto:/i.test(v) ? "mailto: removed" : "lower-cased");
      } else if (p[2] === "phone" || p[2] === "zip") {
        if (/^'\d/.test(v)) edit(i, v.slice(1), "text-marker apostrophe removed");
        else if (/^\d+\.0+$/.test(v)) edit(i, v.replace(/\.0+$/, ""), "trailing .0 removed");
      } else if (p[2] === "lifecycle" || p[2] === "leadstatus") {
        const allowed = p[2] === "lifecycle" ? LIFECYCLE : LEAD_STATUS;
        const hit = allowed.find((a) => norm(a) === norm(v));
        if (hit && hit !== v) edit(i, hit, "written as the internal value");
      }
    });
    out.push(cells);
  }
  if (removed) changes.push(`${removed} blank row${removed === 1 ? "" : "s"} removed in total`);
  return { text: toCsv(out, ","), changes, error: "" };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.title, f.detail])]);
}

export function sampleFile() {
  return [
    "Email,First Name,Last Name,Phone Number,Company Name,Job Title,Lifecycle Stage,Lead Status,Contact owner,Create Date,City,Postal Code,Country/Region",
    "maya@harbourcoffee.example,Maya,Okafor,+44 117 496 0123,Harbour Coffee Roasters,Owner,customer,CONNECTED,owner1@example.com,03/25/2026,Bristol,BS1 4RR,United Kingdom",
    "tom@brightside.example,Tom,Brightside,0113 496 0456,Brightside Dental,Practice Manager,lead,NEW,owner1@example.com,04/02/2026,Leeds,LS1 5AB,United Kingdom",
    "ana@bostonbakery.example,Ana,Reyes,617-555-0142,Boston Bakery,Founder,marketingqualifiedlead,IN_PROGRESS,owner2@example.com,04/09/2026,Boston,02108,United States",
    "",
  ].join("\n");
}

export function sampleBrokenFile() {
  return [
    "Email;firstname;Last Name;Phone;Zip Code;Lifecycle Stage;Lead Status;Create Date;Contact owner;Titel",
    "Maya@HarbourCoffee.example;Maya;Okafor;4.41175E+11;2108;Customer;In progress;03/25/2026;owner1@example.com;Owner",
    "maya@harbourcoffee.example;Maya;Okafor;44117496012.0;;lead;NEW;25/03/2026;owner1@example.com;",
    "tom@brightside;Tom;Brightside;0113 496 0456;LS1 5AB;prospect;Qualified;March 4, 2026;someone@else.example;Manager",
    ";;;;;;;;;",
    "mailto:ana@bostonbakery.example;Ana;Reyes;617-555-0142;02108;subscriber;OPEN;4.9.26;;Founder",
    "",
  ].join("\n");
}

export function sampleCompaniesFile() {
  return [
    "Name,Company Domain Name,Phone Number,City,Postal Code,Country/Region,Industry,Number of Employees,Annual Revenue,Lifecycle Stage,Company owner",
    "Harbour Coffee Roasters,harbourcoffee.example,+44 117 496 0123,Bristol,BS1 4RR,United Kingdom,Food & Beverages,12,850000,customer,owner1@example.com",
    "Brightside Dental,brightside.example,0113 496 0456,Leeds,LS1 5AB,United Kingdom,Medical Practice,8,420000,lead,owner1@example.com",
    "",
  ].join("\n");
}
