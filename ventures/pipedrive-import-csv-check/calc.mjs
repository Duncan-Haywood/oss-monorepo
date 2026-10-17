// Pipedrive spreadsheet import CSV checker (People, Organizations, Deals). Pure functions, no DOM, no
// network. Field names, deal statuses and import limits are read from memory of Pipedrive's public
// help pages on importing data from a spreadsheet; no Pipedrive account or import was available when
// this was built. Custom fields, pipeline and stage names, user lists and account settings are
// unknowable from a file.

// [label, key, type, max length (0 = not checked)]
export const PERSON_PROPS = [
  ["Name", "name", "text", 255], ["First name", "first_name", "text", 255], ["Last name", "last_name", "text", 255],
  ["Email", "email", "email", 0], ["Phone", "phone", "phone", 0], ["Organization", "org_name", "text", 255],
  ["Job title", "job_title", "text", 0], ["Label", "label", "text", 0], ["Owner", "owner", "owner", 0],
  ["Notes", "notes", "text", 0], ["Postal address", "postal_address", "text", 0], ["Birthday", "birthday", "date", 0],
  ["Person created", "add_time", "date", 0], ["ID", "id", "id", 0],
];
export const ORG_PROPS = [
  ["Name", "name", "text", 255], ["Address", "address", "text", 0], ["Label", "label", "text", 0], ["Owner", "owner", "owner", 0],
  ["Website", "website", "url", 0], ["Phone", "phone", "phone", 0], ["Notes", "notes", "text", 0], ["Organization created", "add_time", "date", 0],
  ["ID", "id", "id", 0],
];
export const DEAL_PROPS = [
  ["Title", "title", "text", 255], ["Value", "value", "number", 0], ["Currency", "currency", "currency", 0],
  ["Pipeline", "pipeline", "text", 0], ["Stage", "stage", "text", 0], ["Status", "status", "dealstatus", 0],
  ["Expected close date", "expected_close_date", "date", 0], ["Probability", "probability", "percent", 0],
  ["Person", "person_name", "text", 0], ["Organization", "org_name", "text", 0], ["Owner", "owner", "owner", 0],
  ["Label", "label", "text", 0], ["Deal created", "add_time", "date", 0], ["Won time", "won_time", "date", 0],
  ["Lost time", "lost_time", "date", 0], ["Lost reason", "lost_reason", "text", 0], ["ID", "id", "id", 0],
];
export const KIND_PROPS = { people: PERSON_PROPS, organizations: ORG_PROPS, deals: DEAL_PROPS };
export const KIND_LABEL = { people: "person", organizations: "organization", deals: "deal" };
// What a row needs (a person may supply name or first + last).
export const REQUIRED = { people: ["name"], organizations: ["name"], deals: ["title"] };

export const DEAL_STATUS = ["Open", "Won", "Lost"];
export const ROW_LIMIT = 100000;
export const FILE_LIMIT = 50 * 1024 * 1024;

export const NOT_CHECKED = [
  "Custom fields you created in Pipedrive, and the options of dropdown custom fields",
  "Whether a Pipeline or Stage name exists in your account (an unmatched stage is created or rejected depending on the import step)",
  "Whether an Owner matches a user in your account",
  "Whether a person, organization or deal already exists, and how the import would merge or duplicate it",
  "Whether a currency is enabled in your account",
  "The date format and number format you choose in the import's mapping step",
  "Whether an email address can actually receive mail",
  "Anything Pipedrive has changed in its importer since these rules were read",
];

const ALIASES = {
  fullname: "Name", contactname: "Name", firstname: "First name", givenname: "First name", lastname: "Last name", surname: "Last name",
  emailaddress: "Email", mail: "Email", telephone: "Phone", tel: "Phone", phonenumber: "Phone", mobile: "Phone", cell: "Phone",
  company: "Organization", companyname: "Organization", organisation: "Organization", organizationname: "Organization", orgname: "Organization",
  title: "Job title", jobtitle: "Job title", position: "Job title", owner: "Owner", accountowner: "Owner", assignedto: "Owner",
  created: "Person created", datecreated: "Person created", birthdate: "Birthday", dob: "Birthday",
};
const ORG_ALIASES = { company: "Name", companyname: "Name", organization: "Name", organisation: "Name", organizationname: "Name", url: "Website", web: "Website", street: "Address", created: "Organization created" };
const DEAL_ALIASES = {
  dealtitle: "Title", dealname: "Title", name: "Title", amount: "Value", dealvalue: "Value", dealamount: "Value", price: "Value",
  dealstage: "Stage", dealstatus: "Status", closedate: "Expected close date", expectedclose: "Expected close date", expectedclosedate: "Expected close date",
  winprobability: "Probability", contact: "Person", contactname: "Person", personname: "Person", company: "Organization", organizationname: "Organization",
  created: "Deal created", createddate: "Deal created", wondate: "Won time", lostdate: "Lost time", lostreasonnote: "Lost reason",
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
  if (n.some((h) => ["value", "dealvalue", "amount", "stage", "pipeline", "dealtitle", "expectedclosedate", "probability", "currency"].includes(h))) return "deals";
  if (n.some((h) => ["email", "emailaddress", "firstname", "lastname", "phone", "jobtitle"].includes(h))) return "people";
  if (n.some((h) => ["organization", "organisation", "address", "website"].includes(h)) || n.includes("name")) return "organizations";
  return "people";
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
  const extra = kind === "organizations" ? ORG_ALIASES : kind === "deals" ? DEAL_ALIASES : {};
  const src = kind === "people" ? ALIASES : extra;
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

const CURRENCY = /^[A-Z]{3}$/;
const DATE_NOTE = "Pipedrive's import reads the date format you pick in the mapping step; YYYY-MM-DD is the safest because it has one reading. Rewrite the column in one layout.";

// ---------- analysis ----------
export function validate(input, options = {}) {
  const rowLimit = options.rowLimit || ROW_LIMIT;
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line, title, detail });
  const { text, delim, parsed, rows } = prepare(input);
  const base = { rows: 0, records: 0, columns: 0, delimiter: delim, kind: "people", bytes: 0, withEmail: 0, duplicates: 0, list: [], owners: [], totalValue: 0 };
  const empty = { findings, notChecked: NOT_CHECKED, summary: base };
  if (!text.trim() || !rows.length) { add("error", 0, "The file is empty", "There is nothing to check."); return empty; }
  if (parsed.unterminated) add("error", parsed.unterminated, "A quoted cell is never closed", `A quote opened on line ${parsed.unterminated} has no closing quote, so everything after it reads as one cell. Usually a name or company containing a stray " mark.`);
  if (delim !== ",") add("warning", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, "Pipedrive's import reads comma-separated files. Excel in many locales saves CSV with semicolons because the comma is the decimal separator. Apply safe fixes rewrites it with commas.");
  if (/[ÃÂ]|â€/.test(text)) add("warning", 0, "Text looks mis-decoded", "Characters such as Ã or â€ usually mean a UTF-8 file was opened and saved as another encoding, so names like Müller turn into MÃ¼ller. Re-export as CSV UTF-8.");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > FILE_LIMIT) add("warning", 0, `The file is ${(bytes / 1048576).toFixed(0)} MB`, "Pipedrive's import help describes a file size cap (from memory, tens of megabytes; check the current figure). Split the file and import the parts one at a time.");

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
      if (near) add("warning", rows[0].line, `Heading "${h}" is not a Pipedrive ${kindName} field name`, `Looks like a typo of "${near[0]}". Pipedrive's import lets you map each column by hand, but a close name is matched automatically.`);
      else add("info", rows[0].line, `Heading "${h}" matches no standard ${kindName} field`, "Fine if it is a custom field in your account, which this tool cannot see. Otherwise you will map it by hand in the import, create a field for it, or skip it.");
      return;
    }
    if (res.how === "alias") add("info", rows[0].line, `Heading "${h}" is not the field name`, `Pipedrive may not match it on its own. The field is "${res.prop[0]}"; rename the heading, or map it by hand in the import.`);
    if (res.how === "spelling") spelled.push(`"${h}" → "${res.prop[0]}"`);
    const key = res.prop[1];
    if (seenProp.has(key)) add("warning", rows[0].line, `Field "${res.prop[0]}" appears in two columns`, `Columns ${seenProp.get(key) + 1} and ${i + 1} both look like ${res.prop[0]}. Pipedrive takes one column per field (extra emails and phones go in labelled fields such as Email - Work); delete or merge the other.`);
    else { seenProp.set(key, i); idx[key] = i; }
  });
  if (spelled.length) add("info", rows[0].line, `${spelled.length} heading${spelled.length === 1 ? " differs" : "s differ"} from the field name`, `${spelled.slice(0, 6).join(", ")}${spelled.length > 6 ? ", …" : ""}. Apply safe fixes restores the field-name spelling.`);

  const hasNameParts = "first_name" in idx || "last_name" in idx;
  for (const req of REQUIRED[kind]) if (!(req in idx) && !(kind === "people" && req === "name" && hasNameParts)) {
    const label = table.byExact.get(req)[0];
    add("error", rows[0].line, `No ${label} column`, `A ${kindName} cannot be created without ${label}${kind === "people" ? " (or first and last name)" : ""}, so every row would be skipped unless you map another column to it.`);
  }
  if (kind === "deals" && !("value" in idx)) add("info", rows[0].line, "No Value column", "Deals import with no value, which makes pipeline totals and forecasts read zero.");
  if (kind === "deals" && "value" in idx && !("currency" in idx)) add("info", rows[0].line, "Value without a Currency column", "Every deal takes your account's default currency. Add a Currency column of 3-letter codes if the file mixes currencies.");
  if (kind === "deals" && !("pipeline" in idx) && !("stage" in idx)) add("info", rows[0].line, "No Pipeline or Stage column", "Every deal lands in your default pipeline's first stage.");

  const data = rows.slice(1);
  if (data.length === 0) add("error", 0, "There are no records", "The file has a header and nothing under it.");
  if (data.length > rowLimit) add("warning", 0, `The file has ${data.length.toLocaleString("en-US")} rows`, `Pipedrive's import help describes a per-file row limit (from memory, about ${ROW_LIMIT.toLocaleString("en-US")}; check the current figure). Split the file and import the parts one at a time.`);

  const get = (r, key) => (key in idx && idx[key] < r.cells.length ? r.cells[idx[key]] : "");
  const emails = new Map(), names = new Map(), titles = new Map();
  const owners = new Map(), stages = new Map(), pipelines = new Map();
  const list = [];
  const dateCols = header.map((h, i) => (cols[i] && cols[i][2] === "date") || (!cols[i] && /date|birth|time|close/i.test(h)) ? i : -1).filter((i) => i >= 0);
  const dateSeen = new Map(dateCols.map((i) => [i, { dmy: [], mdy: [], amb: 0, ymd: [], n: 0 }]));
  const currencies = new Set();
  let withEmail = 0, blankRows = 0, totalValue = 0;

  for (const r of data) {
    const L = r.line;
    if (isBlankRow(r.cells)) { blankRows++; add("warning", L, "Blank row", "Row has no values. Pipedrive skips it and it can throw off the row counts in the import summary. Apply safe fixes removes it."); continue; }
    if (r.cells.length !== header.length) add("error", L, `This row has ${r.cells.length} cells, the header has ${header.length}`, "An unquoted comma inside a name, company or note, or a missing one, shifts every later cell into the wrong column.");
    for (const c of r.cells) if (EXCEL_ERR.test(c.trim())) { add("error", L, `Spreadsheet error value ${c.trim()}`, "A formula failed, or a column was too narrow for a number or date, before the file was saved. Replace it with the real value."); break; }

    for (const req of REQUIRED[kind]) if (req in idx && !get(r, req).trim()) {
      if (kind === "people" && hasNameParts && (get(r, "first_name").trim() || get(r, "last_name").trim())) continue;
      add("error", L, `${table.byExact.get(req)[0]} is empty`, `${kindName[0].toUpperCase() + kindName.slice(1)}s need ${table.byExact.get(req)[0]}; this row will be skipped.`);
    }
    if (kind === "people" && !("name" in idx) && hasNameParts && !get(r, "first_name").trim() && !get(r, "last_name").trim()) add("error", L, "First and last name are both empty", "A person needs a name; this row will be skipped.");

    const em = get(r, "email").trim();
    if (em) withEmail++;
    const pname = get(r, "name").trim() || [get(r, "first_name").trim(), get(r, "last_name").trim()].filter(Boolean).join(" ");
    const name = kind === "deals" ? get(r, "title").trim() : pname;
    list.push({ line: L, name, email: kind === "deals" ? get(r, "value").trim() : kind === "organizations" ? get(r, "website").trim() : em, phone: get(r, "phone").trim(), company: kind === "deals" ? get(r, "stage").trim() : kind === "people" ? get(r, "org_name").trim() : get(r, "address").trim() });

    if (kind === "people" && em) {
      // A cell can carry several addresses separated by comma or semicolon in a file Pipedrive reads; flag shape, not count.
      const prob = emailProblem(em);
      if (prob) {
        const sev = /^starts with mailto|more than one/.test(prob) ? "warning" : "error";
        add(sev, L, `Email "${em}" ${prob}`, /more than one/.test(prob) ? "Pipedrive keeps one address per email field. Put the others in a second labelled column (Email - Work, Email - Home) or keep the main one." : /mailto/.test(prob) ? "Pipedrive wants the bare address. Safe fixes removes the prefix." : "Pipedrive rejects an email that is not a valid address. Correct it in the source.");
      } else {
        const e = em.toLowerCase();
        if (!emails.has(e)) emails.set(e, []);
        emails.get(e).push(L);
      }
    }
    if (/^mailto:/i.test(em)) { const e = em.replace(/^mailto:/i, "").trim().toLowerCase(); if (EMAIL.test(e)) { if (!emails.has(e)) emails.set(e, []); emails.get(e).push(L); } }
    if (kind === "organizations" && name) {
      const key = name.toLowerCase().replace(/\s+/g, " ");
      if (!names.has(key)) names.set(key, { name, lines: [] });
      names.get(key).lines.push(L);
    }
    if (kind === "deals") {
      const t = get(r, "title").trim();
      if (t) { const key = (t + "|" + get(r, "org_name").trim() + "|" + get(r, "value").trim()).toLowerCase(); if (!titles.has(key)) titles.set(key, { t, lines: [] }); titles.get(key).lines.push(L); }
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
      if (type === "dealstatus") {
        if (!DEAL_STATUS.includes(v)) {
          const hit = DEAL_STATUS.find((a) => a.toLowerCase() === v.toLowerCase());
          if (hit) add("info", L, `Status "${v}" differs from "${hit}"`, `Pipedrive's statuses are Open, Won and Lost. Apply safe fixes writes "${hit}".`);
          else add("error", L, `Status "${v}" is not Open, Won or Lost`, "A deal's status is one of Open, Won or Lost. Words from another CRM, like Closed Won or In progress, are not statuses; put the stage in the Stage column.");
        }
      }
      if (type === "currency") {
        if (!CURRENCY.test(v.toUpperCase())) add("error", L, `Currency "${v}" is not a 3-letter code`, "Use ISO codes such as USD, EUR or GBP. Symbols like $ or € are ambiguous and are not accepted.");
        else { if (v !== v.toUpperCase()) add("info", L, `Currency "${v}" is lower case`, "Apply safe fixes writes it in capitals."); currencies.add(v.toUpperCase()); }
      }
      if (type === "percent") {
        const n = Number(v.replace(/%$/, ""));
        if (!/^\d+(\.\d+)?%?$/.test(v) || n > 100) add("error", L, `Probability "${v}" is not a number from 0 to 100`, "Write 60, not 0.6 or sixty percent. A value above 100 is rejected.");
        else if (n > 0 && n <= 1 && !/%/.test(v) && String(n).includes(".")) add("warning", L, `Probability ${v} looks like a fraction`, "Pipedrive reads 0.6 as 0.6 percent, not 60. Write 60.");
      }
      if (type === "owner") {
        if (!owners.has(v)) owners.set(v, []);
        owners.get(v).push(L);
      }
      if (type === "number") {
        if (!/^-?\d+(\.\d+)?$/.test(v)) add("error", L, `${label} "${v}" is not a plain number`, "Currency symbols, thousands separators and suffixes like k or M stop a value importing, and 1.200,50 reads differently in different locales. Write 1200.50. This tool leaves it for you to change.");
        else totalValue += Number(v);
      }
      if (type === "url" && (/\s/.test(v) || !/\./.test(v))) add("warning", L, `${label} "${v}" does not look like a web address`, "A name or note in the website column.");
      if (type === "id" && !/^\d+$/.test(v)) add("warning", L, `${label} "${v}" is not a whole number`, "Pipedrive IDs are whole numbers. A rewritten ID updates the wrong record or none.");
      if (key === "stage") { stages.set(v, (stages.get(v) || 0) + 1); }
      if (key === "pipeline") { pipelines.set(v, (pipelines.get(v) || 0) + 1); }
    }

    if (kind === "deals") {
      const st = get(r, "status").trim().toLowerCase();
      if (st === "lost" && "lost_reason" in idx && !get(r, "lost_reason").trim()) add("info", L, "Lost deal with no lost reason", "Fine, but a reason is what makes the lost-deal report useful.");
      if (st === "won" && "won_time" in idx && !get(r, "won_time").trim()) add("info", L, "Won deal with no won time", "Without a won time it is dated the day of the import in won-deal reports.");
      if (st === "open" && get(r, "won_time").trim()) add("warning", L, "Open deal has a won time", "A deal that is still open should not carry a won time.");
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
    add("warning", ls[1], `Email ${e} appears ${ls.length} times`, `Lines ${ls.slice(0, 12).join(", ")}${ls.length > 12 ? ", …" : ""}. Importing the same email twice makes duplicate people unless you merge them first.`);
  }
  for (const [, v] of names) if (v.lines.length > 1) {
    dupes += v.lines.length - 1;
    add("warning", v.lines[1], `Organization "${v.name}" appears ${v.lines.length} times`, `Lines ${v.lines.slice(0, 12).join(", ")}${v.lines.length > 12 ? ", …" : ""}. Probably the same organization entered twice.`);
  }
  for (const [, v] of titles) if (v.lines.length > 1) {
    dupes += v.lines.length - 1;
    add("warning", v.lines[1], `Deal "${v.t}" appears ${v.lines.length} times with the same organization and value`, `Lines ${v.lines.slice(0, 12).join(", ")}${v.lines.length > 12 ? ", …" : ""}. Probably the same deal entered twice, which doubles the pipeline value.`);
  }
  if (currencies.size > 1) add("info", 0, `${currencies.size} currencies in one file`, `${[...currencies].join(", ")}. Totals below are not converted; each currency must be enabled in your Pipedrive account.`);
  if (owners.size) {
    const sample = [...owners.entries()].slice(0, 8).map(([k, ls]) => `${k} (${ls.length})`).join(", ");
    add("info", 0, `${owners.size} distinct owner value${owners.size === 1 ? "" : "s"}; not checked`, `${sample}${owners.size > 8 ? ", …" : ""}. Pipedrive matches an owner to a user in your account, which this tool cannot see.`);
  }
  if (stages.size) {
    const sample = [...stages.entries()].slice(0, 10).map(([k, n]) => `${k} (${n})`).join(", ");
    add("info", 0, `${stages.size} distinct stage name${stages.size === 1 ? "" : "s"}; not checked`, `${sample}${stages.size > 10 ? ", …" : ""}. Compare this list with your pipeline's stages, spelling included: a stage that does not match exactly is not matched.`);
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
      } else if (p[2] === "dealstatus") {
        const hit = DEAL_STATUS.find((a) => a.toLowerCase() === v.toLowerCase());
        if (hit && hit !== v) edit(i, hit, "written as Pipedrive spells it");
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
    "Name,Email,Phone,Organization,Job title,Label,Owner",
    "Maya Okafor,maya@harbourcoffee.example,+44 117 496 0123,Harbour Coffee Roasters,Owner,Hot,owner1@example.com",
    "Tom Brightside,tom@brightside.example,0113 496 0456,Brightside Dental,Practice Manager,Warm,owner1@example.com",
    "Ana Reyes,ana@bostonbakery.example,617-555-0142,Boston Bakery,Founder,Cold,owner2@example.com",
    "",
  ].join("\n");
}

export function sampleBrokenFile() {
  return [
    "Deal title;Value;Currency;Pipeline;Stage;Status;Expected close date;Probability;Organization;Owner",
    "Harbour Coffee roaster upgrade;$12,000;usd;Sales;Proposal sent;open;2026-11-15;60;Harbour Coffee;owner1@example.com",
    "Brightside Dental implants;8500;USD;Sales;Qualified;Closed Won;15/11/2026;0.6;Brightside Dental;owner1@example.com",
    "Boston Bakery oven;4.41E+4;USD;Sales;Negotiation;Won;03/25/2026;100;Boston Bakery;someone@else.example",
    "Boston Bakery oven;4.41E+4;USD;Sales;Negotiation;Won;March 4, 2026;100;Boston Bakery;someone@else.example",
    ";;;;;;;;;",
    "Corner Cafe fit-out;5000;US dollars;Sales;Lead;Lost;4.9.26;150;Corner Cafe;",
    "",
  ].join("\n");
}

export function sampleDealsFile() {
  return [
    "Title,Value,Currency,Pipeline,Stage,Status,Expected close date,Probability,Organization,Owner",
    "Harbour Coffee roaster upgrade,12000,USD,Sales,Proposal sent,Open,2026-11-15,60,Harbour Coffee Roasters,owner1@example.com",
    "Brightside Dental implants,8500,USD,Sales,Qualified,Open,2026-12-01,30,Brightside Dental,owner1@example.com",
    "Boston Bakery oven,4400,USD,Sales,Negotiation,Won,2026-09-20,100,Boston Bakery,owner2@example.com",
    "",
  ].join("\n");
}
