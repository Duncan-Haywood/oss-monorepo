// Zoho CRM spreadsheet import CSV checker (People, Organizations, Deals). Pure functions, no DOM, no
// network. Field names, deal statuses and import limits are read from memory of Zoho CRM's public
// help pages on importing data from a spreadsheet; no Zoho CRM account or import was available when
// this was built. Custom fields, pipeline and stage names, user lists and account settings are
// unknowable from a file.

// [label, key, type, max length (0 = not checked)]
export const LEAD_PROPS = [
  ["First Name", "first_name", "text", 40], ["Last Name", "last_name", "text", 80], ["Company", "company", "text", 100],
  ["Email", "email", "email", 0], ["Phone", "phone", "phone", 30], ["Mobile", "mobile", "phone", 30], ["Title", "title", "text", 100],
  ["Lead Source", "lead_source", "text", 0], ["Lead Status", "lead_status", "leadstatus", 0], ["Industry", "industry", "text", 0],
  ["Annual Revenue", "annual_revenue", "number", 0], ["No. of Employees", "employees", "integer", 0], ["Rating", "rating", "text", 0],
  ["Website", "website", "url", 0], ["Lead Owner", "owner", "owner", 0], ["Street", "street", "text", 250], ["City", "city", "text", 30],
  ["State", "state", "text", 30], ["Zip Code", "zip", "text", 30], ["Country", "country", "text", 30], ["Description", "description", "text", 0],
  ["Record Id", "id", "id", 0],
];
export const CONTACT_PROPS = [
  ["First Name", "first_name", "text", 40], ["Last Name", "last_name", "text", 80], ["Account Name", "account_name", "text", 0],
  ["Email", "email", "email", 0], ["Phone", "phone", "phone", 30], ["Mobile", "mobile", "phone", 30], ["Title", "title", "text", 100],
  ["Department", "department", "text", 0], ["Lead Source", "lead_source", "text", 0], ["Contact Owner", "owner", "owner", 0],
  ["Date of Birth", "dob", "date", 0], ["Mailing Street", "street", "text", 250], ["Mailing City", "city", "text", 30],
  ["Mailing State", "state", "text", 30], ["Mailing Zip", "zip", "text", 30], ["Mailing Country", "country", "text", 30],
  ["Description", "description", "text", 0], ["Record Id", "id", "id", 0],
];
export const ACCOUNT_PROPS = [
  ["Account Name", "name", "text", 100], ["Phone", "phone", "phone", 30], ["Website", "website", "url", 0], ["Industry", "industry", "text", 0],
  ["Annual Revenue", "annual_revenue", "number", 0], ["Employees", "employees", "integer", 0], ["Account Type", "type", "text", 0],
  ["Account Owner", "owner", "owner", 0], ["Billing Street", "street", "text", 250], ["Billing City", "city", "text", 30],
  ["Billing State", "state", "text", 30], ["Billing Code", "zip", "text", 30], ["Billing Country", "country", "text", 30],
  ["Description", "description", "text", 0], ["Record Id", "id", "id", 0],
];
export const DEAL_PROPS = [
  ["Deal Name", "name", "text", 120], ["Account Name", "account_name", "text", 0], ["Contact Name", "contact_name", "text", 0],
  ["Amount", "amount", "number", 0], ["Currency", "currency", "currency", 0], ["Pipeline", "pipeline", "text", 0], ["Stage", "stage", "stage", 0],
  ["Closing Date", "closing_date", "date", 0], ["Probability (%)", "probability", "percent", 0], ["Type", "type", "text", 0],
  ["Lead Source", "lead_source", "text", 0], ["Deal Owner", "owner", "owner", 0], ["Next Step", "next_step", "text", 0],
  ["Campaign Source", "campaign", "text", 0], ["Description", "description", "text", 0], ["Record Id", "id", "id", 0],
];
export const KIND_PROPS = { leads: LEAD_PROPS, contacts: CONTACT_PROPS, accounts: ACCOUNT_PROPS, deals: DEAL_PROPS };
export const KIND_LABEL = { leads: "lead", contacts: "contact", accounts: "account", deals: "deal" };
export const MODULE_LABEL = { leads: "Leads", contacts: "Contacts", accounts: "Accounts", deals: "Deals" };
// What a row needs.
export const REQUIRED = { leads: ["last_name", "company"], contacts: ["last_name"], accounts: ["name"], deals: ["name"] };

// Default picklist values in a new Zoho CRM account. Admins can edit both lists, so a value outside
// them is a note to compare, never an error.
export const LEAD_STATUS = ["Attempted to Contact", "Contact in Future", "Contacted", "Junk Lead", "Lost Lead", "Not Contacted", "Pre-Qualified", "Not Qualified"];
export const DEAL_STAGES = ["Qualification", "Needs Analysis", "Value Proposition", "Identify Decision Makers", "Proposal/Price Quote", "Negotiation/Review", "Closed Won", "Closed Lost", "Closed Lost to Competition"];
export const DEAL_STATUS = DEAL_STAGES;
export const ROW_LIMIT = 5000;
export const FILE_LIMIT = 20 * 1024 * 1024;

export const NOT_CHECKED = [
  "Custom fields and custom picklist options your administrator created in Zoho CRM",
  "Whether a Lead Source, Industry, Rating or Type value exists in your picklists",
  "Whether an Owner matches a user in your account",
  "Whether a record already exists, and what the duplicate setting you choose in the import - skip, overwrite or clone - will do",
  "Whether a Pipeline exists, or a Stage belongs to the Pipeline it sits on",
  "Whether a currency is enabled in your account",
  "The date format, time zone and decimal separator you choose in the import's mapping step",
  "Whether an email address can actually receive mail",
  "Your edition's limits on records and file size per import",
  "Anything Zoho CRM has changed in its importer since these rules were read",
];

const COMMON = { firstname: "First Name", givenname: "First Name", lastname: "Last Name", surname: "Last Name", familyname: "Last Name",
  emailaddress: "Email", mail: "Email", telephone: "Phone", tel: "Phone", phonenumber: "Phone", cell: "Mobile", mobilephone: "Mobile", mobilenumber: "Mobile",
  jobtitle: "Title", position: "Title", leadsource: "Lead Source", source: "Lead Source", zip: "Zip Code", postcode: "Zip Code", postalcode: "Zip Code" };
const ALIASES = {
  leads: { ...COMMON, company: "Company", companyname: "Company", organization: "Company", organisation: "Company", owner: "Lead Owner", leadowner: "Lead Owner", status: "Lead Status", website: "Website", url: "Website", web: "Website", revenue: "Annual Revenue", employees: "No. of Employees", numberofemployees: "No. of Employees", noofemployees: "No. of Employees", zipcode: "Zip Code", address: "Street" },
  contacts: { ...COMMON, account: "Account Name", accountname: "Account Name", company: "Account Name", companyname: "Account Name", organization: "Account Name", owner: "Contact Owner", contactowner: "Contact Owner", birthday: "Date of Birth", birthdate: "Date of Birth", dob: "Date of Birth", zipcode: "Mailing Zip", zip: "Mailing Zip", street: "Mailing Street", city: "Mailing City", state: "Mailing State", country: "Mailing Country" },
  accounts: { name: "Account Name", company: "Account Name", companyname: "Account Name", accountname: "Account Name", organization: "Account Name", organisation: "Account Name", url: "Website", web: "Website", owner: "Account Owner", revenue: "Annual Revenue", numberofemployees: "Employees", noofemployees: "Employees", street: "Billing Street", city: "Billing City", state: "Billing State", zip: "Billing Code", country: "Billing Country" },
  deals: { dealtitle: "Deal Name", title: "Deal Name", name: "Deal Name", opportunity: "Deal Name", opportunityname: "Deal Name", value: "Amount", dealvalue: "Amount", dealamount: "Amount", price: "Amount", dealstage: "Stage", status: "Stage", closedate: "Closing Date", expectedclose: "Closing Date", expectedclosedate: "Closing Date", closingdate: "Closing Date", probability: "Probability (%)", winprobability: "Probability (%)", account: "Account Name", company: "Account Name", organization: "Account Name", organisation: "Account Name", contact: "Contact Name", person: "Contact Name", owner: "Deal Owner", dealowner: "Deal Owner" },
};

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
  if (n.some((h) => ["dealname", "amount", "stage", "pipeline", "closingdate", "expectedclosedate", "probability", "dealstage", "dealamount", "dealowner"].includes(h))) return "deals";
  if (n.some((h) => ["leadstatus", "leadsource", "leadowner", "annualrevenue", "rating"].includes(h)) || (n.some((h) => ["company", "companyname"].includes(h)) && n.some((h) => ["lastname", "firstname", "email"].includes(h)))) return "leads";
  if (n.some((h) => ["accountname", "billingstreet", "accounttype", "accountowner"].includes(h)) || (!n.some((h) => ["lastname", "firstname", "email"].includes(h)) && n.some((h) => ["website", "industry", "name"].includes(h)))) return "accounts";
  return "contacts";
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
  for (const [k, label] of Object.entries(ALIASES[kind])) { const p = byLabel.get(label); if (p && !byBare.has(k)) aliases.set(k, p); }
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

const CURRENCY = /^[A-Z]{3}$/;
const DATE_NOTE = "Zoho CRM's import reads the date format you pick in the mapping step; YYYY-MM-DD is the safest because it has one reading. Rewrite the column in one layout.";

// ---------- analysis ----------
export function validate(input, options = {}) {
  const rowLimit = options.rowLimit || ROW_LIMIT;
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line, title, detail });
  const { text, delim, parsed, rows } = prepare(input);
  const base = { rows: 0, records: 0, columns: 0, delimiter: delim, kind: "contacts", bytes: 0, withEmail: 0, duplicates: 0, list: [], owners: [], totalValue: 0 };
  const empty = { findings, notChecked: NOT_CHECKED, summary: base };
  if (!text.trim() || !rows.length) { add("error", 0, "The file is empty", "There is nothing to check."); return empty; }
  if (parsed.unterminated) add("error", parsed.unterminated, "A quoted cell is never closed", `A quote opened on line ${parsed.unterminated} has no closing quote, so everything after it reads as one cell. Usually a name or company containing a stray " mark.`);
  if (delim !== ",") add("warning", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, "Zoho CRM's import reads comma-separated files. Excel in many locales saves CSV with semicolons because the comma is the decimal separator. Apply safe fixes rewrites it with commas.");
  if (/[ÃÂ]|â€/.test(text)) add("warning", 0, "Text looks mis-decoded", "Characters such as Ã or â€ usually mean a UTF-8 file was opened and saved as another encoding, so names like Müller turn into MÃ¼ller. Re-export as CSV UTF-8.");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > FILE_LIMIT) add("warning", 0, `The file is ${(bytes / 1048576).toFixed(0)} MB`, "Zoho CRM's import help describes a file size cap (from memory, tens of megabytes; check the current figure). Split the file and import the parts one at a time.");

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
      if (near) add("warning", rows[0].line, `Heading "${h}" is not a Zoho CRM ${kindName} field name`, `Looks like a typo of "${near[0]}". Zoho CRM's import lets you map each column by hand, but a close name is matched automatically.`);
      else add("info", rows[0].line, `Heading "${h}" matches no standard ${kindName} field`, "Fine if it is a custom field in your account, which this tool cannot see. Otherwise you will map it by hand in the import, create a field for it, or skip it.");
      return;
    }
    if (res.how === "alias") add("info", rows[0].line, `Heading "${h}" is not the field name`, `Zoho CRM may not match it on its own. The field is "${res.prop[0]}"; rename the heading, or map it by hand in the import.`);
    if (res.how === "spelling") spelled.push(`"${h}" → "${res.prop[0]}"`);
    const key = res.prop[1];
    if (seenProp.has(key)) add("warning", rows[0].line, `Field "${res.prop[0]}" appears in two columns`, `Columns ${seenProp.get(key) + 1} and ${i + 1} both look like ${res.prop[0]}. Zoho CRM takes one column per field (a second address goes in Secondary Email); delete or merge the other.`);
    else { seenProp.set(key, i); idx[key] = i; }
  });
  if (spelled.length) add("info", rows[0].line, `${spelled.length} heading${spelled.length === 1 ? " differs" : "s differ"} from the field name`, `${spelled.slice(0, 6).join(", ")}${spelled.length > 6 ? ", …" : ""}. Apply safe fixes restores the field-name spelling.`);

  for (const req of REQUIRED[kind]) if (!(req in idx)) {
    const label = table.byExact.get(req)[0];
    add("error", rows[0].line, `No ${label} column`, `A ${kindName} cannot be saved in Zoho CRM without ${label}, so every row would be skipped unless you map another column to it.`);
  }
  if (kind === "leads" && !("email" in idx)) add("info", rows[0].line, "No Email column", "Leads import without an email, but the duplicate check in the import and later email campaigns both depend on it.");
  if (kind === "deals" && !("amount" in idx)) add("info", rows[0].line, "No Amount column", "Deals import with no amount, which makes pipeline totals and forecasts read zero.");
  if (kind === "deals" && "amount" in idx && !("currency" in idx)) add("info", rows[0].line, "Amount without a Currency column", "Every deal takes your account's default currency. Add a Currency column of 3-letter codes if the file mixes currencies.");
  if (kind === "deals" && !("pipeline" in idx) && !("stage" in idx)) add("info", rows[0].line, "No Pipeline or Stage column", "Zoho CRM requires a Stage on every deal; unmapped, you will be asked to pick one for the whole file.");

  const data = rows.slice(1);
  if (data.length === 0) add("error", 0, "There are no records", "The file has a header and nothing under it.");
  if (data.length > rowLimit) add("warning", 0, `The file has ${data.length.toLocaleString("en-US")} rows`, `Zoho CRM's import help describes a per-file row limit (from memory, about ${ROW_LIMIT.toLocaleString("en-US")}; check the current figure). Split the file and import the parts one at a time.`);

  const get = (r, key) => (key in idx && idx[key] < r.cells.length ? r.cells[idx[key]] : "");
  const emails = new Map(), names = new Map(), titles = new Map();
  const owners = new Map(), stages = new Map(), pipelines = new Map(), stagesSeen = new Map();
  const list = [];
  const dateCols = header.map((h, i) => (cols[i] && cols[i][2] === "date") || (!cols[i] && /date|birth|time|close/i.test(h)) ? i : -1).filter((i) => i >= 0);
  const dateSeen = new Map(dateCols.map((i) => [i, { dmy: [], mdy: [], amb: 0, ymd: [], n: 0 }]));
  const currencies = new Set();
  let withEmail = 0, blankRows = 0, totalValue = 0;

  for (const r of data) {
    const L = r.line;
    if (isBlankRow(r.cells)) { blankRows++; add("warning", L, "Blank row", "Row has no values. Zoho CRM skips it and it can throw off the row counts in the import summary. Apply safe fixes removes it."); continue; }
    if (r.cells.length !== header.length) add("error", L, `This row has ${r.cells.length} cells, the header has ${header.length}`, "An unquoted comma inside a name, company or note, or a missing one, shifts every later cell into the wrong column.");
    for (const c of r.cells) if (EXCEL_ERR.test(c.trim())) { add("error", L, `Spreadsheet error value ${c.trim()}`, "A formula failed, or a column was too narrow for a number or date, before the file was saved. Replace it with the real value."); break; }

    for (const req of REQUIRED[kind]) if (req in idx && !get(r, req).trim()) {
      add("error", L, `${table.byExact.get(req)[0]} is empty`, `${kindName[0].toUpperCase() + kindName.slice(1)}s need ${table.byExact.get(req)[0]}; this row will be skipped.`);
    }

    const em = get(r, "email").trim();
    if (em) withEmail++;
    const name = kind === "deals" || kind === "accounts" ? get(r, "name").trim() : [get(r, "first_name").trim(), get(r, "last_name").trim()].filter(Boolean).join(" ");
    list.push({ line: L, name, email: kind === "deals" ? get(r, "amount").trim() : kind === "accounts" ? get(r, "website").trim() : em, phone: get(r, "phone").trim() || get(r, "mobile").trim(), company: kind === "deals" ? get(r, "stage").trim() : kind === "leads" ? get(r, "company").trim() : kind === "contacts" ? get(r, "account_name").trim() : get(r, "city").trim() });

    if ((kind === "leads" || kind === "contacts") && em) {
      // A cell can carry several addresses separated by comma or semicolon in a file Zoho CRM reads; flag shape, not count.
      const prob = emailProblem(em);
      if (prob) {
        const sev = /^starts with mailto|more than one/.test(prob) ? "warning" : "error";
        add(sev, L, `Email "${em}" ${prob}`, /more than one/.test(prob) ? "Zoho CRM keeps one address per email field. Put the second one in the Secondary Email column or keep the main one." : /mailto/.test(prob) ? "Zoho CRM wants the bare address. Safe fixes removes the prefix." : "Zoho CRM rejects an email that is not a valid address. Correct it in the source.");
      } else {
        const e = em.toLowerCase();
        if (!emails.has(e)) emails.set(e, []);
        emails.get(e).push(L);
      }
    }
    if (/^mailto:/i.test(em)) { const e = em.replace(/^mailto:/i, "").trim().toLowerCase(); if (EMAIL.test(e)) { if (!emails.has(e)) emails.set(e, []); emails.get(e).push(L); } }
    if (kind === "accounts" && name) {
      const key = name.toLowerCase().replace(/\s+/g, " ");
      if (!names.has(key)) names.set(key, { name, lines: [] });
      names.get(key).lines.push(L);
    }
    if (kind === "deals") {
      const t = get(r, "name").trim();
      if (t) { const key = (t + "|" + get(r, "account_name").trim() + "|" + get(r, "amount").trim()).toLowerCase(); if (!titles.has(key)) titles.set(key, { t, lines: [] }); titles.get(key).lines.push(L); }
    }

    for (const [key, i] of Object.entries(idx)) {
      const prop = table.byExact.get(key);
      const v = i < r.cells.length ? r.cells[i].trim() : "";
      if (!v) continue;
      const label = prop[0];
      const type = prop[2];
      if (SCI.test(v) && ["phone", "id", "owner", "text", "number"].includes(type)) {
        add(type === "number" ? "warning" : "error", L, `${label} ${v} is scientific notation`, "Excel rewrote a long number as 1.23457E+11 and the digits are gone. Reformat the column as Text and re-export from the source.");
        continue;
      }
      if (prop[3] && r.cells[i].length > prop[3]) add("warning", L, `${label} is ${r.cells[i].length} characters`, `${label} is a short text field (from memory, about ${prop[3]} characters). A longer value may be cut off; this is often two cells merged.`);
      if (type === "phone") {
        if (/^'\d/.test(v)) add("warning", L, `${label} "${v}" starts with an apostrophe`, "A text marker left by a spreadsheet. Safe fixes removes it.");
        else if (/^\d+\.0+$/.test(v)) add("warning", L, `${label} ${v} ends in .0`, "A number-formatted cell exported as a decimal. Safe fixes removes the .0.");
        if (/[A-Za-z]{3,}/.test(v.replace(/ext\.?|extension|x\d+/gi, ""))) add("warning", L, `${label} "${v}" contains letters`, "Notes written into the phone column are imported as the number.");
      }
      if (type === "stage" || type === "leadstatus") {
        const list = type === "stage" ? DEAL_STAGES : LEAD_STATUS;
        if (!list.includes(v)) {
          const hit = list.find((a) => a.toLowerCase() === v.toLowerCase());
          if (hit) add("info", L, `${label} "${v}" differs from "${hit}"`, `A default ${label} value is spelled "${hit}". Picklist values are matched as written, so apply safe fixes writes "${hit}".`);
          else stagesSeen.set(`${label}: ${v}`, (stagesSeen.get(`${label}: ${v}`) || 0) + 1);
        }
      }
      if (type === "currency") {
        if (!CURRENCY.test(v.toUpperCase())) add("error", L, `Currency "${v}" is not a 3-letter code`, "Use ISO codes such as USD, EUR or GBP. Symbols like $ or € are ambiguous and are not accepted.");
        else { if (v !== v.toUpperCase()) add("info", L, `Currency "${v}" is lower case`, "Apply safe fixes writes it in capitals."); currencies.add(v.toUpperCase()); }
      }
      if (type === "percent") {
        const n = Number(v.replace(/%$/, ""));
        if (!/^\d+(\.\d+)?%?$/.test(v) || n > 100) add("error", L, `Probability "${v}" is not a number from 0 to 100`, "Write 60, not 0.6 or sixty percent. A value above 100 is rejected.");
        else if (n > 0 && n <= 1 && !/%/.test(v) && String(n).includes(".")) add("warning", L, `Probability ${v} looks like a fraction`, "Probability is a whole-number percentage, so 0.6 is not 60. Write 60.");
      }
      if (type === "owner") {
        if (!owners.has(v)) owners.set(v, []);
        owners.get(v).push(L);
      }
      if (type === "number" || type === "integer") {
        if (!/^-?\d+(\.\d+)?$/.test(v)) add("error", L, `${label} "${v}" is not a plain number`, "Currency symbols, thousands separators and suffixes like k or M stop a value importing, and 1.200,50 reads differently in different locales. Write 1200.50. This tool leaves it for you to change.");
        else totalValue += Number(v);
      }
      if (type === "url" && (/\s/.test(v) || !/\./.test(v))) add("warning", L, `${label} "${v}" does not look like a web address`, "A name or note in the website column.");
      if (type === "id" && !/^\d+$/.test(v)) add("warning", L, `${label} "${v}" is not a whole number`, "Zoho CRM Record Ids are long whole numbers. A rewritten ID updates the wrong record or none.");
      if (key === "stage") { stages.set(v, (stages.get(v) || 0) + 1); }
      if (key === "pipeline") { pipelines.set(v, (pipelines.get(v) || 0) + 1); }
    }

    if (kind === "deals") {
      const st = get(r, "stage").trim().toLowerCase();
      if (/^closed/.test(st) && "probability" in idx) {
        const pr = get(r, "probability").trim();
        if (pr && /^closed won/.test(st) && Number(pr) !== 100) add("info", L, `Closed Won deal with probability ${pr}`, "Zoho CRM sets probability from the stage in the stage map; a value that disagrees is usually left over from an old file.");
        if (pr && /^closed lost/.test(st) && Number(pr) !== 0) add("info", L, `Closed Lost deal with probability ${pr}`, "A lost deal normally carries a probability of 0.");
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
    if (rec.dmy.length && rec.mdy.length) add("error", Math.min(rec.dmy[0], rec.mdy[0]), `${label} mixes day-first and month-first dates`, `Day-first on lines ${rec.dmy.slice(0, 5).join(", ")}${rec.dmy.length > 5 ? ", …" : ""}; month-first on lines ${rec.mdy.slice(0, 5).join(", ")}${rec.mdy.length > 5 ? ", …" : ""}. The import takes one date format for the file, so one set will be misread. Rewrite the column in one order, ideally YYYY-MM-DD.`);
    if (rec.ymd.length && (rec.dmy.length + rec.mdy.length + rec.amb) > 0) add("warning", rec.ymd[0], `${label} mixes year-first and slashed dates`, "Rewrite the column in one layout.");
    if (rec.amb > 0 && !rec.dmy.length && !rec.mdy.length && !rec.ymd.length) add("info", 0, `${label}: all ${rec.amb} date${rec.amb === 1 ? "" : "s"} could be read day-first or month-first`, "Nothing in the file says which. Pick the matching format in the import's mapping step; 03/04/2026 is 3 April in one and 4 March in the other.");
  }

  let dupes = 0;
  for (const [e, ls] of emails) if (ls.length > 1) {
    dupes += ls.length - 1;
    add("warning", ls[1], `Email ${e} appears ${ls.length} times`, `Lines ${ls.slice(0, 12).join(", ")}${ls.length > 12 ? ", …" : ""}. The import has a duplicate-handling choice (skip, overwrite or clone); cloning or an unmatched row makes duplicate records.`);
  }
  for (const [, v] of names) if (v.lines.length > 1) {
    dupes += v.lines.length - 1;
    add("warning", v.lines[1], `Organization "${v.name}" appears ${v.lines.length} times`, `Lines ${v.lines.slice(0, 12).join(", ")}${v.lines.length > 12 ? ", …" : ""}. Probably the same organization entered twice.`);
  }
  for (const [, v] of titles) if (v.lines.length > 1) {
    dupes += v.lines.length - 1;
    add("warning", v.lines[1], `Deal "${v.t}" appears ${v.lines.length} times with the same organization and value`, `Lines ${v.lines.slice(0, 12).join(", ")}${v.lines.length > 12 ? ", …" : ""}. Probably the same deal entered twice, which doubles the pipeline value.`);
  }
  if (currencies.size > 1) add("info", 0, `${currencies.size} currencies in one file`, `${[...currencies].join(", ")}. Totals below are not converted; each currency must be enabled in your Zoho CRM account.`);
  if (owners.size) {
    const sample = [...owners.entries()].slice(0, 8).map(([k, ls]) => `${k} (${ls.length})`).join(", ");
    add("info", 0, `${owners.size} distinct owner value${owners.size === 1 ? "" : "s"}; not checked`, `${sample}${owners.size > 8 ? ", …" : ""}. Zoho CRM matches an owner to a user in your account, which this tool cannot see.`);
  }
  if (stages.size) {
    const sample = [...stages.entries()].slice(0, 10).map(([k, n]) => `${k} (${n})`).join(", ");
    if (stagesSeen.size) { const sm = [...stagesSeen.entries()].slice(0, 8).map(([k, n]) => `${k} (${n})`).join(", "); add("info", 0, `${stagesSeen.size} picklist value${stagesSeen.size === 1 ? "" : "s"} outside Zoho CRM's defaults`, `${sm}${stagesSeen.size > 8 ? ", …" : ""}. Fine if your administrator edited the Lead Status or Stage list; if not, an unlisted value is dropped or blanked on import. Compare with Setup > Customization > Modules and Fields.`); }
  if (stages.size) add("info", 0, `${stages.size} distinct stage name${stages.size === 1 ? "" : "s"}; not checked`, `${sample}${stages.size > 10 ? ", …" : ""}. Compare this list with your pipeline's stages, spelling included: a stage that does not match exactly is not matched.`);
  }

  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  return {
    findings,
    notChecked: NOT_CHECKED,
    summary: { rows: data.length, records: data.length - blankRows, columns: header.length, delimiter: delim, kind, bytes, withEmail, duplicates: dupes, list, owners: [...owners.entries()].map(([value, ls]) => ({ value, rows: ls.length })), totalValue, currencies: [...currencies] },
  };
}

// ---------- repair ----------
// Formatting only. Every change is listed with its line. Never edits a name, an address, a phone
// number's digits, a value, a date, an ID, or any value's meaning.
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
      } else if (p[2] === "stage" || p[2] === "leadstatus") {
        const list = p[2] === "stage" ? DEAL_STAGES : LEAD_STATUS;
        const hit = list.find((a) => a.toLowerCase() === v.toLowerCase());
        if (hit && hit !== v) edit(i, hit, "written as Zoho CRM spells the default value");
      } else if (p[2] === "currency") {
        if (CURRENCY.test(v.toUpperCase()) && v !== v.toUpperCase()) edit(i, v.toUpperCase(), "currency code in capitals");
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
    "First Name,Last Name,Company,Email,Phone,Lead Source,Lead Status,Lead Owner",
    "Maya,Okafor,Harbour Coffee Roasters,maya@harbourcoffee.example,+44 117 496 0123,Web Download,Contacted,owner1@example.com",
    "Tom,Brightside,Brightside Dental,tom@brightside.example,0113 496 0456,Trade Show,Not Contacted,owner1@example.com",
    "Ana,Reyes,Boston Bakery,ana@bostonbakery.example,617-555-0142,Referral,Pre-Qualified,owner2@example.com",
    "",
  ].join("\n");
}

export function sampleBrokenFile() {
  return [
    "Deal Name;Amount;Currency;Pipeline;Stage;Closing Date;Probability (%);Account Name;Deal Owner",
    "Harbour Coffee roaster upgrade;$12,000;usd;Sales;proposal/price quote;2026-11-15;60;Harbour Coffee;owner1@example.com",
    "Brightside Dental implants;8500;USD;Sales;Closed Won;15/11/2026;0.6;Brightside Dental;owner1@example.com",
    "Boston Bakery oven;4.41E+4;USD;Sales;Negotiation/Review;03/25/2026;70;Boston Bakery;someone@else.example",
    "Boston Bakery oven;4.41E+4;USD;Sales;Negotiation/Review;March 4, 2026;70;Boston Bakery;someone@else.example",
    ";;;;;;;;",
    "Corner Cafe fit-out;5000;US dollars;Sales;Won it;4.9.26;150;Corner Cafe;",
    "",
  ].join("\n");
}

export function sampleDealsFile() {
  return [
    "Deal Name,Amount,Currency,Pipeline,Stage,Closing Date,Probability (%),Account Name,Deal Owner",
    "Harbour Coffee roaster upgrade,12000,USD,Sales,Proposal/Price Quote,2026-11-15,60,Harbour Coffee Roasters,owner1@example.com",
    "Brightside Dental implants,8500,USD,Sales,Qualification,2026-12-01,10,Brightside Dental,owner1@example.com",
    "Boston Bakery oven,4400,USD,Sales,Closed Won,2026-09-20,100,Boston Bakery,owner2@example.com",
    "",
  ].join("\n");
}
