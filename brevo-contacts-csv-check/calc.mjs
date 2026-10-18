// Brevo (formerly Sendinblue) contacts import CSV checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of Brevo's public help pages on importing contacts from
// a CSV; no Brevo account or import was available when this was built. Brevo maps each column to a
// contact attribute in its import step, so an unrecognised header is a note, not an error. A contact
// needs an email address or an SMS number.

export const ROLES = {
  email: ["EMAIL"],
  first: ["FIRSTNAME"],
  last: ["LASTNAME"],
  sms: ["SMS"],
};
export const COLUMNS = ["EMAIL", "FIRSTNAME", "LASTNAME", "SMS"];
export const SEVERITIES = ["error", "warning", "info"];
export const ATTRIBUTE_NOTE_LIMIT = 30;

const canon = (h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const ROLE_OF = new Map(), KNOWN = new Map();
for (const [role, names] of Object.entries(ROLES)) for (const n of names) { ROLE_OF.set(canon(n), role); KNOWN.set(canon(n), n); }
const ALL_NAMES = [...KNOWN.values()];
// Spellings people use for a default field. Brevo's mapping step can usually be told, but a file
// that relies on that is one wrong click from a new custom attribute named "Mobile".
const NEAR = { emailaddress: "email", mail: "email", emailaddr: "email", firstname: "first", fname: "first", givenname: "first", prenom: "first", lastname: "last", lname: "last", surname: "last", familyname: "last", nom: "last",
  mobile: "sms", cell: "sms", phone: "sms", phonenumber: "sms", telephone: "sms", mobilephone: "sms", smsnumber: "sms", tel: "sms" };
const NEAR_LABEL = { email: "EMAIL", first: "FIRSTNAME", last: "LASTNAME", sms: "SMS" };
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
  const summary = { rows: 0, columns: 0, delimiter: ",", withEmail: 0, withSms: 0, smsOnly: 0, customColumns: [], flagged: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a Brevo contacts CSV."); return { findings, summary }; }

  if (text.includes("\uFFFD")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as \uFFFD mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8 or accented names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("warning", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'Commas are the safest delimiter for a Brevo import; Excel in many European locales saves CSV with semicolons, and a mis-detected delimiter puts every column in one. Re-save as "CSV UTF-8 (Comma delimited)" or use the safe fixes below.');

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
    if (!h) { add("warning", "blank-header", 1, `Column ${i + 1} has no header`, "A column with no name cannot be mapped to a contact attribute, so its data is not imported."); return; }
    if (seen.has(c)) add("error", "dup-header", 1, `Column "${h}" appears twice`, `Columns ${seen.get(c) + 1} and ${i + 1} are the same once capitals and punctuation are ignored. Only one can be mapped to a field; delete or rename one.`);
    else seen.set(c, i);
    const role = ROLE_OF.get(c);
    if (role) {
      if (idx[role] === undefined) idx[role] = i;
      const exact = ROLES[role][0];
      if (h !== exact && !ROLES[role].includes(h)) add("info", "header-case", 1, `Column "${h}" is not spelled "${exact}"`, `Brevo's mapping step usually matches it, but spell it "${exact}" so the match does not depend on a click.`);
      return;
    }
    const near = NEAR[c];
    if (near && idx[near] === undefined) {
      add("warning", "near-header", 1, `Column "${h}" looks like Brevo's "${NEAR_LABEL[near]}"`, `Brevo's mapping step matches a column to a built-in attribute only when it is named for it or you map it by hand. Left as is, "${h}" can end up as a new custom attribute instead. Rename it to "${NEAR_LABEL[near]}" or map it in the import step.`);
      idx[near] = i;
      return;
    }
    summary.customColumns.push(h);
    if (CONSENT_HEADER.test(h)) consentCols.push(i);
    if (DATE_HEADER.test(h)) dateCols.push(i);
  });
  if (idx.email === undefined && idx.sms === undefined) {
    add("error", "missing-column", 1, "No EMAIL or SMS column is present", "Brevo identifies a contact by email address or SMS number. Check the header row, the delimiter and the encoding.");
    return { findings, summary };
  }
  const extra = summary.customColumns.length;
  if (extra) add("info", "custom-columns", 1, `${extra} column${extra === 1 ? "" : "s"} will map to a custom attribute or be skipped`, `${summary.customColumns.slice(0, 8).map((c) => `"${trunc(c, 24)}"`).join(", ")}${extra > 8 ? ", …" : ""}. That is normal for your own attributes; if one of these should have been a default field, rename it.`);
  if (extra > ATTRIBUTE_NOTE_LIMIT) add("warning", "many-attributes", 1, `${extra} extra columns is a lot of contact attributes`, `Brevo limits how many contact attributes an account can hold (about ${ATTRIBUTE_NOTE_LIMIT} at the time of writing; check the current limit). Trim the columns you do not need.`);

  const emails = new Map();
  const dateShapes = dateCols.map(() => new Map());
  let blank = 0;
  const get = (r, role) => (idx[role] === undefined ? undefined : r[idx[role]]);
  for (let ri = 1; ri < parsed.rows.length; ri++) {
    const { cells: r, line: L } = parsed.rows[ri];
    if (r.every((c) => c.trim() === "")) { blank++; continue; }
    summary.rows++;
    const before = findings.length;
    if (r.length > header.length) add("error", "extra-cells", L, `Row has ${r.length} cells but the header has ${header.length}`, "An unquoted comma inside a name or any text cell shifts every later cell one column to the right. Wrap that cell in double quotes, for example \"Smith, Jr\".");
    else if (r.length < header.length) add("warning", "short-row", L, `Row has ${r.length} cells but the header has ${header.length}`, "The missing trailing cells are read as empty.");

    const emailRaw = get(r, "email") ?? "", email = emailRaw.trim();
    const sms = unapos((get(r, "sms") ?? "").trim());
    if (email) summary.withEmail++;
    if (sms) summary.withSms++;
    if (!email && sms) summary.smsOnly++;
    if (!email && !sms) add("error", "no-identity", L, "Row has neither an email address nor an SMS number", "Brevo identifies a contact by email or SMS; this row will be skipped.");
    else if (idx.email !== undefined && !email) add("info", "sms-only", L, "Row has an SMS number but no email", "Brevo can hold an SMS-only contact. Not an error; it cannot receive email campaigns.");
    if (email) {
      if (emailRaw !== email) add("info", "email-space", L, "Email has spaces around it", "Safe fixes trim them.");
      if (EXCEL_ERR.test(email)) add("error", "excel-error", L, `Email is the spreadsheet error "${email}"`, "A broken formula was exported as text. Fix the source cell.");
      else if (!EMAIL.test(email)) add("error", "email", L, `Email "${trunc(email)}" is not a valid address`, /[;,]/.test(email) ? "It holds more than one address, or a separator. One address per contact." : "Check for a missing @, a missing domain, or a space inside the address.");
      else {
        const key = email.toLowerCase();
        if (emails.has(key)) add("warning", "dup-email", L, `Email "${trunc(email)}" repeats line ${emails.get(key)}`, "Addresses are compared without regard to capitals, so these rows are the same contact. Brevo keeps one contact and the later row's values may overwrite the earlier ones.");
        else emails.set(key, L);
        if (/^(info|admin|sales|support|contact|office|postmaster|abuse|noreply|no-reply)@/i.test(email)) add("info", "role-email", L, `"${trunc(email)}" is a shared role address`, "Role addresses often belong to several people and tend to bounce or complain; a list full of them hurts deliverability. Not an error.");
      }
    }
    if (sms) {
      if (SCI.test(sms)) add("error", "sms-excel", L, `SMS "${sms}" was turned into scientific notation`, "Excel stores long digit strings as numbers and the original digits are lost. Re-enter the number from the source and format the column as Text before saving.");
      else if (!/^[+\d][\d\s().-]{5,}$/.test(sms)) add("warning", "sms-shape", L, `SMS "${trunc(sms)}" does not look like a phone number`, "Expected digits, optionally with a leading + and spaces, brackets or dashes. Letters and extensions are usually the cause.");
      else if (!/^(\+|00)/.test(sms)) add("warning", "sms-country-code", L, `SMS "${trunc(sms)}" has no country code`, "Brevo expects an SMS number in international form with the country code, such as +33612345678. A national number with a leading 0 is read against whatever country you pick at import, or rejected. Safe fixes do not add a country code because only you know which country each number belongs to.");
      else if (!SCI.test(sms) && sms.replace(/\D/g, "").length > 15) add("warning", "sms-length", L, `SMS "${trunc(sms)}" has more than 15 digits`, "International phone numbers are at most 15 digits including the country code; this is probably two numbers or a pasted extension.");
    }
    for (const ci of consentCols) {
      const v = (r[ci] ?? "").trim();
      if (v && !/^(yes|no|true|false|y|n|1|0|subscribed|unsubscribed|blocklisted|blacklisted|pending|opted[ -]?in|opted[ -]?out)$/i.test(v)) add("info", "consent-value", L, `"${header[ci]}" holds "${trunc(v)}"`, "This looks like a consent or status column with an unusual value. Brevo asks you to confirm permission at import; a column does not become consent on its own.");
    }
    dateCols.forEach((ci, k) => { const v = (r[ci] ?? "").trim(); const sh = v ? dateShape(v) : ""; if (sh) dateShapes[k].set(sh, (dateShapes[k].get(sh) || 0) + 1); else if (v && !SCI.test(v)) dateShapes[k].set("other", (dateShapes[k].get("other") || 0) + 1); });

    if (findings.length > before) summary.flagged.push({ line: L, email: email || "(no email)", issues: findings.length - before });
  }
  dateCols.forEach((ci, k) => {
    const m = dateShapes[k];
    const kinds = [...m.keys()];
    if (kinds.length > 1) add("warning", "date-mixed", 0, `"${header[ci]}" mixes date formats`, `The column holds ${kinds.map((x) => `${m.get(x)} ${x === "iso" ? "ISO (2026-03-31)" : x === "other" ? "unrecognised" : "day/month/year style"}`).join(" and ")} values. Brevo cannot tell day-first from month-first in a mixed column; use one format, and set the date attribute's format in Brevo to match.`);
    else if (m.get("ambiguous")) add("info", "date-ambiguous", 0, `"${header[ci]}" has day/month dates that can be read two ways`, "Values like 03/04/2026 are 3 April or March 4 depending on who reads them. This tool will not reorder dates for you.");
  });
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");
  add("info", "consent-note", 0, "Importing does not prove permission to market", "Brevo asks you to confirm that your contacts have opted in before an import, and its terms restrict importing purchased, rented or scraped lists. That confirmation is about your records, not this file. Only import people who opted in, such as a signup form or a prior platform's subscription list. This tool checks formatting and never creates or changes consent. Messaging people who did not opt in can breach laws such as CAN-SPAM, GDPR, PECR and the TCPA for SMS.");
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
  const cols = ["email", "first", "last", "sms"].map((k) => head.findIndex((h) => ROLES[k].includes(h)));
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

const build = (rows) => toCsv([COLUMNS.concat(["SIGNUP_DATE"]), ...rows.map((o) => COLUMNS.concat(["SIGNUP_DATE"]).map((h) => o[h] ?? ""))]);

export function sampleFile() {
  return build([
    { EMAIL: "ada@example.com", FIRSTNAME: "Ada", LASTNAME: "Example", SMS: "+33612345678", SIGNUP_DATE: "2026-03-31" },
    { EMAIL: "ben@example.org", FIRSTNAME: "Ben", LASTNAME: "Sample", SMS: "+14165550123", SIGNUP_DATE: "2026-02-14" },
    { EMAIL: "cleo@example.net", FIRSTNAME: "Cleo", LASTNAME: "Demo", SIGNUP_DATE: "2026-01-05" },
  ]);
}

export function sampleBrokenFile() {
  return build([
    { EMAIL: "ada@example.com", FIRSTNAME: "Ada", LASTNAME: "Example", SMS: "3.36123E+10", SIGNUP_DATE: "03/04/2026" },
    { EMAIL: "ADA@example.com", FIRSTNAME: "Ada", LASTNAME: "Again", SMS: "06 12 34 56 78", SIGNUP_DATE: "2026-03-04" },
    { EMAIL: "ben-at-example.org", FIRSTNAME: "Ben", LASTNAME: "Sample", SIGNUP_DATE: "15/04/2026" },
    { FIRSTNAME: "No", LASTNAME: "Contact" },
    { EMAIL: "info@example.com", FIRSTNAME: "Shared", LASTNAME: "Inbox" },
  ]);
}
