// Mailchimp audience import CSV checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of Mailchimp's public help pages on importing contacts
// from a CSV; no Mailchimp account or import was available when this was built. Any column that is not
// a default field is offered as a new audience field in the import mapping step, so an unrecognised
// header is a note, not an error.

export const ROLES = {
  email: ["Email Address", "Email"],
  first: ["First Name"],
  last: ["Last Name"],
  phone: ["Phone Number", "Phone"],
  address: ["Address"],
  birthday: ["Birthday"],
  tags: ["Tags"],
};
export const COLUMNS = ["Email Address", "First Name", "Last Name", "Phone Number", "Address", "Birthday", "Tags"];
export const SEVERITIES = ["error", "warning", "info"];
export const MERGE_FIELD_NOTE_LIMIT = 30;

const canon = (h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const ROLE_OF = new Map(), KNOWN = new Map();
for (const [role, names] of Object.entries(ROLES)) for (const n of names) { ROLE_OF.set(canon(n), role); KNOWN.set(canon(n), n); }
const ALL_NAMES = [...KNOWN.values()];
// Spellings people use for a default field. Mailchimp's mapping step can usually be told, but a file
// that relies on that is one wrong click from a new audience field named "Mobile".
const NEAR = { emailaddress: "email", mail: "email", emailaddr: "email", firstname: "first", fname: "first", givenname: "first", lastname: "last", lname: "last", surname: "last", familyname: "last",
  mobile: "phone", cell: "phone", telephone: "phone", mobilephone: "phone", phonenumber: "phone", street: "address", streetaddress: "address", address1: "address", dob: "birthday", birthdate: "birthday", dateofbirth: "birthday", birthday: "birthday", tag: "tags", labels: "tags", segments: "tags" };
const NEAR_LABEL = { email: "Email Address", first: "First Name", last: "Last Name", phone: "Phone Number", address: "Address", birthday: "Birthday", tags: "Tags" };
const CONSENT_HEADER = /consent|subscrib|opt[\s_-]?in|marketing|gdpr|status/i;
const DATE_HEADER = /date|anniversary|joined|created|signup|since/i;

const SCI = /^[-+]?\d(\.\d+)?e[-+]?\d+$/i;
const EXCEL_ERR = /^(#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)|#{3,})$/i;
const EMAIL = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;
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

export function closestColumn(name) {
  const n = canon(name).replace(/[^a-z0-9]/g, "");
  let best = null, bestD = 99;
  for (const c of ALL_NAMES) {
    const d = distance(n, canon(c).replace(/[^a-z0-9]/g, ""));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

function detectDelim(text) {
  const firstLine = text.split("\n", 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  if (count(",") === 0 && count(";") > 0) return ";";
  if (count(",") === 0 && count("\t") > 0) return "\t";
  return ",";
}


const unapos = (v) => (v.startsWith("'") ? v.slice(1) : v);
const dateShape = (v) => {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(t)) return "iso";
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) return Number(m[1]) <= 12 && Number(m[2]) <= 12 ? "ambiguous" : "slash";
  return "";
};

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, columns: 0, delimiter: ",", withEmail: 0, withPhone: 0, withTags: 0, customColumns: [], flagged: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a Mailchimp audience CSV."); return { findings, summary }; }

  if (text.includes("\uFFFD")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as \uFFFD mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8 or accented names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'A CSV import expects commas. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use the safe fixes below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. Inside a quoted cell a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const header = parsed.rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {}, seen = new Map(), consentCols = [], dateCols = [];
  header.forEach((h, i) => {
    const c = canon(h);
    if (!h) { add("warning", "blank-header", 1, `Column ${i + 1} has no header`, "A column with no name cannot be mapped to an audience field, so its data is not imported."); return; }
    if (seen.has(c)) add("error", "dup-header", 1, `Column "${h}" appears twice`, `Columns ${seen.get(c) + 1} and ${i + 1} are the same once capitals and punctuation are ignored. Only one can be mapped to a field; delete or rename one.`);
    else seen.set(c, i);
    const role = ROLE_OF.get(c);
    if (role) {
      if (idx[role] === undefined) idx[role] = i;
      const exact = ROLES[role][0];
      if (h !== exact && !ROLES[role].includes(h)) add("info", "header-case", 1, `Column "${h}" is not spelled "${exact}"`, `Mailchimp's mapping step usually matches it, but spell it "${exact}" so the match does not depend on a click.`);
      return;
    }
    const near = NEAR[c];
    if (near && idx[near] === undefined) {
      add("warning", "near-header", 1, `Column "${h}" looks like Mailchimp's "${NEAR_LABEL[near]}"`, `Mailchimp only maps a default field when the column is named for it or you map it by hand. Left as is, "${h}" can be offered as a new audience field instead. Rename it to "${NEAR_LABEL[near]}" or map it in the import step.`);
      idx[near] = i;
      return;
    }
    summary.customColumns.push(h);
    if (CONSENT_HEADER.test(h)) consentCols.push(i);
    if (DATE_HEADER.test(h)) dateCols.push(i);
  });
  if (idx.email === undefined) {
    add("error", "missing-column", 1, "No Email Address column is present", "Mailchimp needs an email address to create a contact. Check the header row, the delimiter and the encoding.");
    return { findings, summary };
  }
  const extra = summary.customColumns.length;
  if (extra) add("info", "custom-columns", 1, `${extra} column${extra === 1 ? "" : "s"} will need a new audience field or be skipped`, `${summary.customColumns.slice(0, 8).map((c) => `"${trunc(c, 24)}"`).join(", ")}${extra > 8 ? ", …" : ""}. That is normal for your own fields; if one of these should have been a default field, rename it.`);
  if (extra > MERGE_FIELD_NOTE_LIMIT) add("warning", "many-fields", 1, `${extra} extra columns is a lot for one audience`, `Mailchimp limits how many audience fields an audience can hold (about ${MERGE_FIELD_NOTE_LIMIT} at the time of writing; check the current limit). Trim the columns you do not need.`);

  const emails = new Map();
  const dateShapes = dateCols.map(() => new Map());
  const bShapes = new Map();
  let blank = 0;
  const get = (r, role) => (idx[role] === undefined ? undefined : r[idx[role]]);
  for (let ri = 1; ri < parsed.rows.length; ri++) {
    const { cells: r, line: L } = parsed.rows[ri];
    if (r.every((c) => c.trim() === "")) { blank++; continue; }
    summary.rows++;
    const before = findings.length;
    if (r.length > header.length) add("error", "extra-cells", L, `Row has ${r.length} cells but the header has ${header.length}`, "An unquoted comma inside a name, address or the Tags cell shifts every later cell one column to the right. Wrap that cell in double quotes, for example \"vip,wholesale\".");
    else if (r.length < header.length) add("warning", "short-row", L, `Row has ${r.length} cells but the header has ${header.length}`, "The missing trailing cells are read as empty.");

    const emailRaw = get(r, "email") ?? "", email = emailRaw.trim();
    const phone = unapos((get(r, "phone") ?? "").trim());
    const tags = (get(r, "tags") ?? "").trim();
    if (email) summary.withEmail++;
    if (phone) summary.withPhone++;
    if (tags) summary.withTags++;
    if (!email) add("error", "no-email", L, "Row has no email address", "Mailchimp cannot create a contact with no email address; this row will be skipped.");
    else {
      if (emailRaw !== email) add("info", "email-space", L, "Email has spaces around it", "Safe fixes trim them.");
      if (EXCEL_ERR.test(email)) add("error", "excel-error", L, `Email is the spreadsheet error "${email}"`, "A broken formula was exported as text. Fix the source cell.");
      else if (!EMAIL.test(email)) add("error", "email", L, `Email "${trunc(email)}" is not a valid address`, /[;,]/.test(email) ? "It holds more than one address, or a separator. One address per contact." : "Check for a missing @, a missing domain, or a space inside the address.");
      else {
        const key = email.toLowerCase();
        if (emails.has(key)) add("warning", "dup-email", L, `Email "${trunc(email)}" repeats line ${emails.get(key)}`, "Addresses are compared without regard to capitals, so these rows are the same contact. Mailchimp keeps one and the later row may be ignored or overwrite the earlier values.");
        else emails.set(key, L);
        if (/^(info|admin|sales|support|contact|office|postmaster|abuse|noreply|no-reply)@/i.test(email)) add("info", "role-email", L, `"${trunc(email)}" is a shared role address`, "Role addresses often belong to several people and tend to bounce or complain; a list full of them hurts deliverability. Not an error.");
      }
    }
    if (phone) {
      if (SCI.test(phone)) add("error", "phone-excel", L, `Phone "${phone}" was turned into scientific notation`, "Excel stores long digit strings as numbers and the original digits are lost. Re-enter the number from the source and format the column as Text before saving.");
      else if (!/^[+\d][\d\s().-]{5,}$/.test(phone)) add("warning", "phone-shape", L, `Phone "${trunc(phone)}" does not look like a phone number`, "Expected digits, optionally with a leading + and spaces, brackets or dashes. Letters and extensions are usually the cause.");
    }
    if (tags && /^[^"]*;/.test(tags) && !tags.includes(",")) add("info", "tag-separator", L, "Tags use a semicolon", "Mailchimp reads tags separated by commas, with the whole cell in double quotes. A semicolon makes one long tag. Safe fixes do not change this because only you know your tag names.");

    const bd = (get(r, "birthday") ?? "").trim();
    if (bd) {
      if (/^\d{1,2}[/-]\d{1,2}$/.test(bd)) { const [x, y] = bd.split(/[/-]/).map(Number); const sh = x > 12 ? "dm" : y > 12 ? "md" : "amb"; bShapes.set(sh, (bShapes.get(sh) || 0) + 1); if (x > 12 && y > 12 || x < 1 || y < 1 || x > 31 || y > 31) add("error", "birthday", L, `Birthday "${bd}" is not a real day and month`, "Neither number can be a month. Mailchimp birthday fields hold a month and a day only."); }
      else if (/^\d{4}-\d{2}-\d{2}$|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(bd)) add("warning", "birthday-year", L, `Birthday "${trunc(bd)}" includes a year`, "A Mailchimp birthday field takes only a month and day (MM/DD or DD/MM, chosen when the field is created). A full date can be rejected or misread. Safe fixes do not drop the year for you.");
      else add("warning", "birthday", L, `Birthday "${trunc(bd)}" is not a month and day`, "Use MM/DD or DD/MM to match the field's format.");
    }

    for (const ci of consentCols) {
      const v = (r[ci] ?? "").trim();
      if (v && !/^(yes|no|true|false|y|n|1|0|subscribed|unsubscribed|cleaned|pending|transactional|non-subscribed|opted[ -]?in|opted[ -]?out)$/i.test(v)) add("info", "consent-value", L, `"${header[ci]}" holds "${trunc(v)}"`, "This looks like a consent or status column with an unusual value. Mailchimp asks you to choose each contact's status at import; a column does not become consent on its own.");
    }
    dateCols.forEach((ci, k) => { const v = (r[ci] ?? "").trim(); const sh = v ? dateShape(v) : ""; if (sh) dateShapes[k].set(sh, (dateShapes[k].get(sh) || 0) + 1); else if (v && !SCI.test(v)) dateShapes[k].set("other", (dateShapes[k].get("other") || 0) + 1); });

    if (findings.length > before) summary.flagged.push({ line: L, email: email || "(no email)", issues: findings.length - before });
  }
  if (bShapes.has("dm") && bShapes.has("md")) add("error", "birthday-mixed", 0, "Birthdays mix DD/MM and MM/DD", "Some values can only be day-first and others only month-first, so the column cannot match one field format. Pick one.");
  else if (bShapes.get("amb") && !bShapes.has("dm") && !bShapes.has("md")) add("info", "birthday-ambiguous", 0, "Birthdays like 03/04 can be read two ways", "Mailchimp's field is MM/DD or DD/MM depending on how it was set up. Check that it matches the one your file uses; this tool will not reorder them.");
  dateCols.forEach((ci, k) => {
    const m = dateShapes[k];
    const kinds = [...m.keys()];
    if (kinds.length > 1) add("warning", "date-mixed", 0, `"${header[ci]}" mixes date formats`, `The column holds ${kinds.map((x) => `${m.get(x)} ${x === "iso" ? "ISO (2026-03-31)" : x === "other" ? "unrecognised" : "day/month/year style"}`).join(" and ")} values. Mailchimp cannot tell day-first from month-first in a mixed column; use one format.`);
    else if (m.get("ambiguous")) add("info", "date-ambiguous", 0, `"${header[ci]}" has day/month dates that can be read two ways`, "Values like 03/04/2026 are 3 April or March 4 depending on who reads them. This tool will not reorder dates for you.");
  });
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");
  add("info", "consent-note", 0, "Importing does not prove permission to market", "Mailchimp asks you to confirm you have permission before an import, and its terms restrict importing purchased, rented or scraped lists. That confirmation is about your records, not this file. Only import people who opted in, such as a signup form or a prior platform's subscription list. This tool checks formatting and never creates or changes consent. Messaging people who did not opt in can breach laws such as CAN-SPAM, GDPR and PECR.");
  return { findings, summary };
}

export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!text.trim()) return { text: "", changes: [], error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes: [], error: "A quoted cell is never closed; fix that before applying safe fixes." };
  const changes = [];
  const rows = parsed.rows.map((r) => r.cells.slice());
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  rows[0].forEach((h, i) => {
    const role = ROLE_OF.get(canon(h));
    const exact = role ? ROLES[role][0] : "";
    if (exact && !ROLES[role].includes(h.trim())) { changes.push(`Header "${h}" renamed to "${exact}".`); rows[0][i] = exact; }
  });
  const head = rows[0].map((h) => h.trim());
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci]}: "${from}" → "${to}" (${why}).`);
  };
  const cols = ["email", "first", "last", "phone"].map((k) => head.findIndex((h) => ROLES[k].includes(h)));
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((x) => x.trim() === "")) continue;
    for (const ci of cols) if (ci >= 0 && r[ci] !== undefined && r[ci] !== r[ci].trim() && r[ci].trim()) edit(ri, ci, r[ci].trim(), "stray spaces");
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const build = (rows, extra = []) => toCsv([[...COLUMNS, ...extra], ...rows.map((o) => [...COLUMNS, ...extra].map((h) => o[h] ?? ""))]);

export function sampleFile() {
  return build([
    { "Email Address": "ada@example.com", "First Name": "Ada", "Last Name": "Example", "Phone Number": "+1 617 555 0101", Birthday: "03/14", Tags: "vip,newsletter", "Signup Date": "2026-03-31" },
    { "Email Address": "ben@example.org", "First Name": "Ben", "Last Name": "Sample", Birthday: "11/30", Tags: "wholesale", "Signup Date": "2026-02-14" },
    { "Email Address": "cleo@example.net", "First Name": "Cleo", "Last Name": "Demo", "Signup Date": "2026-01-05" },
  ], ["Signup Date"]);
}

export function sampleBrokenFile() {
  return build([
    { "Email Address": "ada@example.com", "First Name": "Ada", "Last Name": "Example", "Phone Number": "4.16556E+09", Birthday: "03/14/1990", "Signup Date": "03/04/2026" },
    { "Email Address": "ADA@example.com", "First Name": "Ada", "Last Name": "Again", Birthday: "14/03", "Signup Date": "2026-03-04" },
    { "Email Address": "ben-at-example.org", "First Name": "Ben", "Last Name": "Sample", Birthday: "03/14", "Signup Date": "15/04/2026" },
    { "First Name": "No", "Last Name": "Email" },
    { "Email Address": "info@example.com", "First Name": "Shared", "Last Name": "Inbox" },
  ], ["Signup Date"]);
}
