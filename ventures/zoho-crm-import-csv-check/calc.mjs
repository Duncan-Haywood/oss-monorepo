// Zoho CRM import CSV checker (Leads, Contacts, Accounts, Deals). Pure functions, no DOM, no network.
// Field names and import limits are read from memory of Zoho CRM's public help pages on importing
// data; no Zoho account or import was available when this was built. Custom fields, picklist
// options, layouts, user lists and account settings are unknowable from a file.

// [label, key, type, max length (0 = not checked)]
const ADDRESS = (p) => [[`${p} Street`, `${p.toLowerCase()}_street`, "text", 0], [`${p} City`, `${p.toLowerCase()}_city`, "text", 0], [`${p} State`, `${p.toLowerCase()}_state`, "text", 0], [`${p} Code`, `${p.toLowerCase()}_code`, "zip", 0], [`${p} Country`, `${p.toLowerCase()}_country`, "text", 0]];
export const LEAD_PROPS = [
  ["Lead Owner", "owner", "owner", 0], ["Company", "company", "text", 100], ["First Name", "first_name", "text", 40], ["Last Name", "last_name", "text", 80],
  ["Title", "title", "text", 0], ["Email", "email", "email", 0], ["Phone", "phone", "phone", 30], ["Mobile", "mobile", "phone", 30],
  ["Website", "website", "url", 0], ["Lead Source", "lead_source", "picklist", 0], ["Lead Status", "lead_status", "picklist", 0],
  ["Industry", "industry", "picklist", 0], ["Annual Revenue", "annual_revenue", "number", 0], ["No. of Employees", "employees", "integer", 0],
  ["Rating", "rating", "picklist", 0], ["Street", "street", "text", 0], ["City", "city", "text", 0], ["State", "state", "text", 0],
  ["Zip Code", "zip", "zip", 0], ["Country", "country", "text", 0], ["Description", "description", "text", 0], ["Record Id", "id", "id", 0],
];
export const CONTACT_PROPS = [
  ["Contact Owner", "owner", "owner", 0], ["First Name", "first_name", "text", 40], ["Last Name", "last_name", "text", 80], ["Account Name", "account_name", "text", 0],
  ["Email", "email", "email", 0], ["Secondary Email", "secondary_email", "email", 0], ["Title", "title", "text", 0], ["Department", "department", "text", 0],
  ["Phone", "phone", "phone", 30], ["Mobile", "mobile", "phone", 30], ["Lead Source", "lead_source", "picklist", 0], ["Date of Birth", "birthday", "date", 0],
  ...ADDRESS("Mailing"), ["Description", "description", "text", 0], ["Record Id", "id", "id", 0],
];
export const ACCOUNT_PROPS = [
  ["Account Owner", "owner", "owner", 0], ["Account Name", "account_name", "text", 100], ["Phone", "phone", "phone", 30], ["Website", "website", "url", 0],
  ["Industry", "industry", "picklist", 0], ["Account Type", "account_type", "picklist", 0], ["Ownership", "ownership", "picklist", 0], ["Rating", "rating", "picklist", 0],
  ["Annual Revenue", "annual_revenue", "number", 0], ["Employees", "employees", "integer", 0], ...ADDRESS("Billing"), ["Description", "description", "text", 0], ["Record Id", "id", "id", 0],
];
export const DEAL_PROPS = [
  ["Deal Owner", "owner", "owner", 0], ["Deal Name", "deal_name", "text", 120], ["Account Name", "account_name", "text", 0], ["Contact Name", "contact_name", "text", 0],
  ["Type", "type", "picklist", 0], ["Stage", "stage", "picklist", 0], ["Amount", "amount", "number", 0], ["Closing Date", "closing_date", "date", 0],
  ["Lead Source", "lead_source", "picklist", 0], ["Probability (%)", "probability", "percent", 0], ["Expected Revenue", "expected_revenue", "number", 0],
  ["Next Step", "next_step", "text", 0], ["Campaign Source", "campaign_source", "text", 0], ["Description", "description", "text", 0], ["Record Id", "id", "id", 0],
];
export const KIND_PROPS = { leads: LEAD_PROPS, contacts: CONTACT_PROPS, accounts: ACCOUNT_PROPS, deals: DEAL_PROPS };
export const KIND_LABEL = { leads: "lead", contacts: "contact", accounts: "account", deals: "deal" };
// What a row needs. Last Name is required on Leads and Contacts, Company on Leads, Account Name on Accounts,
// and Deal Name, Stage, Closing Date and Amount on Deals.
export const REQUIRED = { leads: ["last_name", "company"], contacts: ["last_name"], accounts: ["account_name"], deals: ["deal_name", "stage", "closing_date", "amount"] };

export const ROW_LIMIT = 50000;
export const FILE_LIMIT = 20 * 1024 * 1024;

export const NOT_CHECKED = [
  "Custom fields you created in Zoho CRM, and the options of picklist fields (Lead Source, Lead Status, Stage, Industry and the rest are free text in the file)",
  "Whether a Stage value belongs to the deal pipeline or layout you import into",
  "Whether a Lead Owner, Contact Owner or Deal Owner matches a user in your org",
  "Whether a record already exists, and how your duplicate-handling choice (skip, overwrite, clone) would treat it",
  "Whether a lookup such as Account Name or Contact Name already exists in your CRM",
  "The date format, decimal separator and field mapping you choose in the import wizard, and your org's currency and locale settings",
  "Whether an email address can actually receive mail",
  "Anything Zoho has changed in its importer or limits since these rules were read from memory",
];

const ALIASES = {
  lead: {
    surname: "Last Name", lastname: "Last Name", familyname: "Last Name", firstname: "First Name", givenname: "First Name", name: "Last Name",
    organization: "Company", organisation: "Company", companyname: "Company", emailaddress: "Email", mail: "Email", telephone: "Phone", tel: "Phone", phonenumber: "Phone", cell: "Mobile", mobilephone: "Mobile",
    jobtitle: "Title", position: "Title", source: "Lead Source", leadsrc: "Lead Source", status: "Lead Status", owner: "Lead Owner", assignedto: "Lead Owner", zip: "Zip Code", postcode: "Zip Code", postalcode: "Zip Code", zipcode: "Zip Code",
    employees: "No. of Employees", numberofemployees: "No. of Employees", revenue: "Annual Revenue", url: "Website", web: "Website",
  },
  contact: {
    surname: "Last Name", lastname: "Last Name", familyname: "Last Name", firstname: "First Name", givenname: "First Name", account: "Account Name", company: "Account Name", companyname: "Account Name", organization: "Account Name",
    emailaddress: "Email", mail: "Email", email2: "Secondary Email", telephone: "Phone", tel: "Phone", phonenumber: "Phone", cell: "Mobile", mobilephone: "Mobile",
    jobtitle: "Title", position: "Title", source: "Lead Source", owner: "Contact Owner", assignedto: "Contact Owner", birthday: "Date of Birth", dob: "Date of Birth", birthdate: "Date of Birth",
  },
  account: {
    name: "Account Name", company: "Account Name", companyname: "Account Name", organization: "Account Name", organisation: "Account Name", telephone: "Phone", tel: "Phone", phonenumber: "Phone",
    url: "Website", web: "Website", type: "Account Type", owner: "Account Owner", assignedto: "Account Owner", revenue: "Annual Revenue", numberofemployees: "Employees", noofemployees: "Employees",
  },
  deal: {
    name: "Deal Name", dealtitle: "Deal Name", title: "Deal Name", opportunity: "Deal Name", opportunityname: "Deal Name", value: "Amount", dealvalue: "Amount", dealamount: "Amount", price: "Amount",
    dealstage: "Stage", status: "Stage", closedate: "Closing Date", expectedclose: "Closing Date", expectedclosedate: "Closing Date", closingdate: "Closing Date", probability: "Probability (%)", winprobability: "Probability (%)",
    account: "Account Name", company: "Account Name", contact: "Contact Name", owner: "Deal Owner", assignedto: "Deal Owner", source: "Lead Source",
  },
};
const ALIAS_BY_KIND = { leads: ALIASES.lead, contacts: ALIASES.contact, accounts: ALIASES.account, deals: ALIASES.deal };

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
  if (KIND_PROPS[kind]) return kind;
  const n = header.map(norm);
  if (n.some((h) => ["dealname", "amount", "stage", "closingdate", "closedate", "expectedclosedate", "probability", "dealowner"].includes(h))) return "deals";
  if (n.some((h) => ["leadstatus", "leadowner", "leadsource", "company", "companyname"].includes(h)) && !n.includes("accountname")) return "leads";
  if (n.some((h) => ["accountname", "billingstreet", "billingcity", "accounttype", "ownership", "accountowner"].includes(h)) && !n.some((h) => ["lastname", "firstname", "email"].includes(h))) return "accounts";
  if (n.some((h) => ["lastname", "firstname", "email", "contactowner", "mailingstreet", "emailaddress"].includes(h))) return "contacts";
  if (n.includes("name")) return "accounts";
  return "leads";
}

function propTable(kind) {
  const props = KIND_PROPS[kind];
  const byExact = new Map(), byBare = new Map(), byLabel = new Map();
  for (const p of props) {
    byExact.set(p[0], p); byExact.set(p[1], p);
    byBare.set(norm(p[0]), p); byBare.set(norm(p[1]), p);
    byLabel.set(p[0], p);
  }
  const aliases = new Map();
  const src = ALIAS_BY_KIND[kind];
  for (const [k, label] of Object.entries(src)) { const p = byLabel.get(label); if (p && !byBare.has(k)) aliases.set(k, p); }
  return { props, byExact, byBare, aliases };
}

// exact (label or API name), spelling (same letters, different case or punctuation), alias, or unknown.
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

const DATE_NOTE = "Zoho CRM's import reads dates in the format you choose in the wizard (and your org's locale); YYYY-MM-DD is the safest because it has one reading. Rewrite the column in one layout.";

// ---------- analysis ----------
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const list8 = (arr, n = 12) => `${arr.slice(0, n).join(", ")}${arr.length > n ? ", …" : ""}`;

export function validate(input, options = {}) {
  const rowLimit = options.rowLimit || ROW_LIMIT;
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line, title, detail });
  const { text, delim, parsed, rows } = prepare(input);
  const base = { rows: 0, records: 0, columns: 0, delimiter: delim, kind: "leads", bytes: 0, withEmail: 0, duplicates: 0, list: [], owners: [], totalValue: 0 };
  const empty = { findings, notChecked: NOT_CHECKED, summary: base };
  if (!text.trim() || !rows.length) { add("error", 0, "The file is empty", "There is nothing to check."); return empty; }
  if (parsed.unterminated) add("error", parsed.unterminated, "A quoted cell is never closed", `A quote opened on line ${parsed.unterminated} has no closing quote, so everything after it reads as one cell. Usually a name or company containing a stray " mark.`);
  if (delim !== ",") add("warning", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, "Zoho CRM's CSV import reads comma-separated files. Excel in many locales saves CSV with semicolons because the comma is the decimal separator. Apply safe fixes rewrites it with commas.");
  if (/[ÃÂ]|â€/.test(text)) add("warning", 0, "Text looks mis-decoded", "Characters such as Ã or â€ usually mean a UTF-8 file was opened and saved as another encoding, so names like Müller turn into MÃ¼ller. Re-export as CSV UTF-8.");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > FILE_LIMIT) add("warning", 0, `The file is ${(bytes / 1048576).toFixed(0)} MB`, "Zoho's import help describes a file size cap for CSV imports (as read from memory, a few tens of megabytes at most; verify the current figure in Zoho's help). Split the file and import the parts one at a time.");

  const header = rows[0].cells.map((h) => h.trim());
  const kind = chooseKind(header, options.kind);
  const table = propTable(kind);
  const kindName = KIND_LABEL[kind];
  const idx = {};
  const cols = [];
  const seenProp = new Map();
  const spelled = [];
  header.forEach((h, i) => {
    if (!h) { cols[i] = null; add("warning", rows[0].line, `Column ${i + 1} has no heading`, "A column with no heading cannot be matched to a field. Delete it or name it."); return; }
    const res = resolveHeader(h, table);
    cols[i] = res.prop;
    if (res.how === "unknown") {
      const near = closestProperty(h, table);
      if (near) add("warning", rows[0].line, `Heading "${h}" is not a Zoho CRM ${kindName} field name`, `Looks like a typo of "${near[0]}". Zoho's import lets you map each column by hand, but a close name is matched automatically.`);
      else add("info", rows[0].line, `Heading "${h}" matches no standard ${kindName} field`, "Fine if it is a custom field in your org, which this tool cannot see. Otherwise you will map it by hand in the import wizard, create a field for it, or skip it.");
      return;
    }
    if (res.how === "alias") add("info", rows[0].line, `Heading "${h}" is not the field name`, `Zoho may not match it on its own. The field is "${res.prop[0]}"; rename the heading, or map it by hand in the import wizard.`);
    if (res.how === "spelling") spelled.push(`"${h}" → "${res.prop[0]}"`);
    const key = res.prop[1];
    if (seenProp.has(key)) add("warning", rows[0].line, `Field "${res.prop[0]}" appears in two columns`, `Columns ${seenProp.get(key) + 1} and ${i + 1} both look like ${res.prop[0]}. Zoho takes one column per field; delete or merge the other.`);
    else { seenProp.set(key, i); idx[key] = i; }
  });
  if (spelled.length) add("info", rows[0].line, `${spelled.length} heading${spelled.length === 1 ? " differs" : "s differ"} from the field name`, `${list8(spelled, 6)}. Apply safe fixes restores the field-name spelling.`);

  const labelOf = (key) => table.byExact.get(key)[0];
  for (const req of REQUIRED[kind]) if (!(req in idx)) {
    add("error", rows[0].line, `No ${labelOf(req)} column`, `${cap(kindName)}s need ${labelOf(req)}, so every row would be skipped unless you map another column to it in the import wizard.`);
  }
  if (kind === "leads" && !("lead_source" in idx)) add("info", rows[0].line, "No Lead Source column", "Fine, but Lead Source is what lead-source reports group by; imported leads would have none unless you set one in the wizard.");

  const data = rows.slice(1);
  if (data.length === 0) add("error", 0, "There are no records", "The file has a header and nothing under it.");
  if (data.length > rowLimit) add("warning", 0, `The file has ${data.length.toLocaleString("en-US")} rows`, `Zoho's import help describes a per-import row limit (as read from memory, in the tens of thousands of records; verify the current figure for your edition). Split the file and import the parts one at a time.`);

  const get = (r, key) => (key in idx && idx[key] < r.cells.length ? r.cells[idx[key]] : "");
  const emails = new Map(), names = new Map(), deals = new Map();
  const owners = new Map();
  const picks = new Map();
  const list = [];
  const dateCols = header.map((h, i) => (cols[i] && cols[i][2] === "date") || (!cols[i] && /date|birth|time|close/i.test(h)) ? i : -1).filter((i) => i >= 0);
  const dateSeen = new Map(dateCols.map((i) => [i, { dmy: [], mdy: [], amb: 0, ymd: [], n: 0 }]));
  let withEmail = 0, blankRows = 0, totalValue = 0;

  for (const r of data) {
    const L = r.line;
    if (isBlankRow(r.cells)) { blankRows++; add("warning", L, "Blank row", "Row has no values. Zoho skips it and it can throw off the row counts in the import summary. Apply safe fixes removes it."); continue; }
    if (r.cells.length !== header.length) add("error", L, `This row has ${r.cells.length} cells, the header has ${header.length}`, "An unquoted comma inside a name, company or note, or a missing one, shifts every later cell into the wrong column.");
    for (const c of r.cells) if (EXCEL_ERR.test(c.trim())) { add("error", L, `Spreadsheet error value ${c.trim()}`, "A formula failed, or a column was too narrow for a number or date, before the file was saved. Replace it with the real value."); break; }

    for (const req of REQUIRED[kind]) if (req in idx && !get(r, req).trim()) add("error", L, `${labelOf(req)} is empty`, `${cap(kindName)}s need ${labelOf(req)}; this row will be skipped or rejected.`);

    const em = get(r, "email").trim();
    if (em) withEmail++;
    const name = kind === "deals" ? get(r, "deal_name").trim() : kind === "accounts" ? get(r, "account_name").trim() : [get(r, "first_name").trim(), get(r, "last_name").trim()].filter(Boolean).join(" ");
    list.push({
      line: L, name,
      email: kind === "deals" ? get(r, "amount").trim() : kind === "accounts" ? get(r, "website").trim() : em,
      phone: get(r, "phone").trim() || get(r, "mobile").trim(),
      company: kind === "deals" ? get(r, "stage").trim() : kind === "leads" ? get(r, "company").trim() : kind === "contacts" ? get(r, "account_name").trim() : get(r, "billing_city").trim(),
    });

    for (const ekey of ["email", "secondary_email"]) {
      const ev = get(r, ekey).trim();
      if (!ev) continue;
      const prob = emailProblem(ev);
      if (prob) {
        const sev = /^starts with mailto|more than one/.test(prob) ? "warning" : "error";
        add(sev, L, `${labelOf(ekey)} "${ev}" ${prob}`, /more than one/.test(prob) ? "Zoho keeps one address per email field. Put the others in Secondary Email (Contacts) or a custom field, or keep the main one." : /mailto/.test(prob) ? "Zoho wants the bare address. Safe fixes removes the prefix." : "Zoho rejects an email that is not a valid address. Correct it in the source.");
      }
      const clean = ev.replace(/^mailto:/i, "").trim().toLowerCase();
      if (ekey === "email" && (!prob || /^starts with mailto/.test(prob)) && EMAIL.test(clean)) {
        if (!emails.has(clean)) emails.set(clean, []);
        emails.get(clean).push(L);
      }
    }
    if (kind === "accounts" && name) {
      const key = name.toLowerCase().replace(/\s+/g, " ");
      if (!names.has(key)) names.set(key, { name, lines: [] });
      names.get(key).lines.push(L);
    }
    if (kind === "deals") {
      const t = get(r, "deal_name").trim();
      if (t) { const key = (t + "|" + get(r, "account_name").trim() + "|" + get(r, "amount").trim()).toLowerCase(); if (!deals.has(key)) deals.set(key, { t, lines: [] }); deals.get(key).lines.push(L); }
    }

    for (const [key, i] of Object.entries(idx)) {
      const prop = table.byExact.get(key);
      const v = i < r.cells.length ? r.cells[i].trim() : "";
      if (!v) continue;
      const label = prop[0];
      const type = prop[2];
      if (SCI.test(v) && ["phone", "id", "owner", "text", "number", "integer", "zip"].includes(type)) {
        add(["number", "integer"].includes(type) ? "warning" : "error", L, `${label} ${v} is scientific notation`, "Excel rewrote a long number as 1.23457E+11 and the digits are gone. Reformat the column as Text and re-export from the source.");
        continue;
      }
      if (prop[3] && r.cells[i].length > prop[3]) add("warning", L, `${label} is ${r.cells[i].length} characters`, `${label} is a short text field (as read from memory, about ${prop[3]} characters). A longer value may be rejected or cut off; this is often two cells merged.`);
      if (type === "phone") {
        if (/^'\d/.test(v)) add("warning", L, `${label} "${v}" starts with an apostrophe`, "A text marker left by a spreadsheet. Safe fixes removes it.");
        else if (/^\d+\.0+$/.test(v)) add("warning", L, `${label} ${v} ends in .0`, "A number-formatted cell exported as a decimal. Safe fixes removes the .0.");
        if (/[A-Za-z]{3,}/.test(v.replace(/ext\.?|extension|x\d+/gi, ""))) add("warning", L, `${label} "${v}" contains letters`, "Notes written into the phone column are imported as the number.");
      }
      if (type === "zip" && /^\d{3,4}$/.test(v) && /(^|_)(zip|code)$/.test(key)) add("info", L, `${label} "${v}" may have lost a leading zero`, "Excel drops the leading zero of a ZIP code in a number-formatted cell (02134 becomes 2134). Compare with the source; this tool will not guess the digits.");
      if (type === "number") {
        if (!/^-?\d+(\.\d+)?$/.test(v)) add("error", L, `${label} "${v}" is not a plain number`, "Currency symbols, thousands separators and suffixes like k or M stop an amount importing, and 1.200,50 reads differently in different locales. Write 1200.50. This tool leaves it for you to change.");
        else if (key === "amount") totalValue += Number(v);
      }
      if (type === "integer" && !/^\d+$/.test(v)) add("error", L, `${label} "${v}" is not a whole number`, "A count of people must be digits only. Write 250, not 250+ or 1,200.");
      if (type === "percent") {
        const n = Number(v.replace(/%$/, ""));
        if (!/^\d+(\.\d+)?%?$/.test(v) || n > 100) add("error", L, `Probability "${v}" is not a number from 0 to 100`, "Write 60, not 0.6 or sixty percent. A value above 100 is rejected.");
        else if (n > 0 && n <= 1 && !/%/.test(v) && String(n).includes(".")) add("warning", L, `Probability ${v} looks like a fraction`, "A probability is a percent from 0 to 100; 0.6 would be read as 0.6 percent, not 60. Write 60.");
      }
      if (type === "owner") {
        if (!owners.has(v)) owners.set(v, []);
        owners.get(v).push(L);
      }
      if (type === "url" && (/\s/.test(v) || !/\./.test(v))) add("warning", L, `${label} "${v}" does not look like a web address`, "A name or note in the website column.");
      if (type === "id" && !/^\d+$/.test(v)) add("warning", L, `${label} "${v}" is not a whole number`, "Zoho record IDs are long runs of digits. A rewritten ID updates the wrong record or none.");
      if (type === "picklist") {
        if (!picks.has(key)) picks.set(key, new Map());
        const m = picks.get(key), k = v.toLowerCase().replace(/\s+/g, " ");
        if (!m.has(k)) m.set(k, new Map());
        m.get(k).set(v, (m.get(k).get(v) || 0) + 1);
      }
    }

    for (const i of dateCols) {
      const v = i < r.cells.length ? r.cells[i].trim() : "";
      if (!v) continue;
      const label = cols[i] ? cols[i][0] : header[i];
      const rec = dateSeen.get(i);
      rec.n++;
      const c = classifyDate(v);
      if (c.kind === "bad") add("error", L, `${label} "${v}" ${c.reason}`, DATE_NOTE);
      else {
        if (c.kind === "dmy") rec.dmy.push(L); else if (c.kind === "mdy") rec.mdy.push(L); else if (c.kind === "ymd") rec.ymd.push(L); else rec.amb++;
        if (c.year && (c.year < 1900 || c.year > 2100)) add("warning", L, `${label} "${v}" has the year ${c.year}`, "Probably a typo or an empty-date placeholder.");
      }
    }
  }

  for (const [i, rec] of dateSeen) {
    const label = cols[i] ? cols[i][0] : header[i];
    if (rec.dmy.length && rec.mdy.length) add("error", Math.min(rec.dmy[0], rec.mdy[0]), `${label} mixes day-first and month-first dates`, `Day-first on lines ${list8(rec.dmy, 5)}; month-first on lines ${list8(rec.mdy, 5)}. The import wizard takes one date format for the file, so one set will be misread. Rewrite the column in one order, ideally YYYY-MM-DD.`);
    if (rec.ymd.length && (rec.dmy.length + rec.mdy.length + rec.amb) > 0) add("warning", rec.ymd[0], `${label} mixes year-first and slashed dates`, "Rewrite the column in one layout.");
    if (rec.amb > 0 && !rec.dmy.length && !rec.mdy.length && !rec.ymd.length) add("info", 0, `${label}: all ${rec.amb} date${rec.amb === 1 ? "" : "s"} could be read day-first or month-first`, "Nothing in the file says which. Pick the matching format in the import wizard; 03/04/2026 is 3 April in one and 4 March in the other.");
  }

  // Picklist-like columns are free text in a CSV: flag spellings that differ only by case or spacing,
  // and list the distinct values for the user to compare with the CRM's own picklist.
  for (const [key, m] of picks) {
    const label = labelOf(key);
    for (const [, variants] of m) if (variants.size > 1) {
      const shown = [...variants.entries()].map(([v, n]) => `"${v}" (${n})`).join(", ");
      add("warning", 0, `${label} is spelled more than one way`, `${shown}. A picklist value that does not match an option exactly may be rejected, or added as a new option, depending on the import settings. Pick one spelling.`);
    }
    if (m.size) {
      const distinct = [...m.values()].map((variants) => [...variants.keys()][0]);
      add("info", 0, `${m.size} distinct ${label} value${m.size === 1 ? "" : "s"}; not checked`, `${list8(distinct, 10)}. Compare this list with the options of ${label} in your CRM, spelling included: this tool cannot see them.`);
    }
  }

  let dupes = 0;
  for (const [e, ls] of emails) if (ls.length > 1) {
    dupes += ls.length - 1;
    add("warning", ls[1], `Email ${e} appears ${ls.length} times`, `Lines ${list8(ls)}. Importing the same email twice makes duplicate ${kind} unless your duplicate-handling choice in the wizard skips or merges them.`);
  }
  for (const [, v] of names) if (v.lines.length > 1) {
    dupes += v.lines.length - 1;
    add("warning", v.lines[1], `Account "${v.name}" appears ${v.lines.length} times`, `Lines ${list8(v.lines)}. Probably the same account entered twice.`);
  }
  for (const [, v] of deals) if (v.lines.length > 1) {
    dupes += v.lines.length - 1;
    add("warning", v.lines[1], `Deal "${v.t}" appears ${v.lines.length} times with the same account and amount`, `Lines ${list8(v.lines)}. Probably the same deal entered twice, which doubles the pipeline amount.`);
  }
  if (owners.size) {
    const sample = [...owners.entries()].slice(0, 8).map(([k, ls]) => `${k} (${ls.length})`).join(", ");
    add("info", 0, `${owners.size} distinct owner value${owners.size === 1 ? "" : "s"}; not checked`, `${sample}${owners.size > 8 ? ", …" : ""}. Zoho matches an owner to a user in your org, which this tool cannot see.`);
  }

  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  return {
    findings,
    notChecked: NOT_CHECKED,
    summary: { rows: data.length, records: data.length - blankRows, columns: header.length, delimiter: delim, kind, bytes, withEmail, duplicates: dupes, list, owners: [...owners.entries()].map(([value, ls]) => ({ value, rows: ls.length })), totalValue },
  };
}

// ---------- repair ----------
// Formatting only. Every change is listed with its line. Never edits a name, an address, a phone
// number's digits, an amount, a date, an ID, a picklist value, or any value's meaning.
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
    cells.forEach((c, i) => { if (c !== c.trim()) edit(i, c.trim(), "stray spaces trimmed"); });
    cols.forEach((p, i) => {
      if (!p || i >= cells.length || firstIdx.get(p[1]) !== i) return;
      const v = cells[i];
      if (!v) return;
      if (p[2] === "email") {
        let e = v;
        if (/^mailto:/i.test(e)) e = e.replace(/^mailto:/i, "").trim();
        if (EMAIL.test(e) && e !== e.toLowerCase()) e = e.toLowerCase();
        if (e !== v) edit(i, e, /^mailto:/i.test(v) ? "mailto: removed" : "lower-cased");
      } else if (p[2] === "phone") {
        if (/^'\d/.test(v)) edit(i, v.slice(1), "text-marker apostrophe removed");
        else if (/^\d+\.0+$/.test(v)) edit(i, v.replace(/\.0+$/, ""), "trailing .0 removed");
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
    "Last Name,First Name,Company,Email,Phone,Lead Source,Lead Status,Lead Owner",
    "Okafor,Maya,Harbour Coffee Roasters,maya@harbourcoffee.example,+44 117 496 0123,Web,Not Contacted,owner1@example.com",
    "Brightside,Tom,Brightside Dental,tom@brightside.example,0113 496 0456,Referral,Contacted,owner1@example.com",
    "Reyes,Ana,Boston Bakery,ana@bostonbakery.example,617-555-0142,Web,Not Contacted,owner2@example.com",
    "",
  ].join("\n");
}

export function sampleBrokenFile() {
  return [
    "Deal Name;Account Name;Stage;Amount;Closing Date;Probability (%);Lead Source;Deal Owner",
    "Harbour Coffee roaster upgrade;Harbour Coffee;Proposal/Price Quote;$12,000;2026-11-15;60;web;owner1@example.com",
    "Brightside Dental implants;Brightside Dental;Qualification;8500;15/11/2026;0.6;Web;owner1@example.com",
    "Boston Bakery oven;Boston Bakery;Negotiation/Review;4.41E+4;03/25/2026;100;Web;someone@else.example",
    "Boston Bakery oven;Boston Bakery;Negotiation/Review;4.41E+4;March 4, 2026;100;WEB;someone@else.example",
    ";;;;;;;",
    ";Corner Cafe;;5000;4.9.26;150;web;",
    "",
  ].join("\n");
}

export function sampleDealsFile() {
  return [
    "Deal Name,Account Name,Stage,Amount,Closing Date,Probability (%),Lead Source,Deal Owner",
    "Harbour Coffee roaster upgrade,Harbour Coffee Roasters,Proposal/Price Quote,12000,2026-11-15,60,Web,owner1@example.com",
    "Brightside Dental implants,Brightside Dental,Qualification,8500,2026-12-01,30,Referral,owner1@example.com",
    "Boston Bakery oven,Boston Bakery,Closed Won,4400,2026-09-20,100,Web,owner2@example.com",
    "",
  ].join("\n");
}
