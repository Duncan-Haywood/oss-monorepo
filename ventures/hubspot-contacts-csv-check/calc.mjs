// HubSpot contacts import CSV checker. Pure functions, no DOM, no network.
// Property names, option values and limits are read from memory of HubSpot's public import
// documentation; no HubSpot import was available when this was built.

// Canonical column label -> aliases a spreadsheet or another CRM commonly uses (compared with
// case, spaces, underscores and hyphens removed).
export const PROPERTIES = {
  "Email": ["email", "emailaddress", "email1", "workemail", "primaryemail"],
  "First Name": ["firstname", "first", "givenname", "fname"],
  "Last Name": ["lastname", "last", "surname", "familyname", "lname"],
  "Phone Number": ["phone", "phonenumber", "telephone", "tel", "workphone"],
  "Mobile Phone Number": ["mobile", "mobilephone", "mobilephonenumber", "cell", "cellphone"],
  "Company Name": ["company", "companyname", "organization", "organisation", "employer"],
  "Job Title": ["jobtitle", "title", "position", "role"],
  "Lifecycle Stage": ["lifecyclestage", "stage"],
  "Lead Status": ["leadstatus", "hsleadstatus"],
  "Contact Owner": ["contactowner", "owner", "hubspotowner", "hubspotownerid"],
  "Create Date": ["createdate", "created", "datecreated"],
  "Website URL": ["website", "websiteurl", "url", "web"],
  "Street Address": ["streetaddress", "address", "address1"],
  "City": ["city", "town"],
  "State/Region": ["stateregion", "state", "region", "province"],
  "Postal Code": ["postalcode", "zip", "zipcode", "postcode"],
  "Country/Region": ["countryregion", "country"],
  "Record ID": ["recordid", "vid", "hsobjectid", "contactid"],
  "Marketing contact status": ["marketingcontactstatus", "marketingstatus"],
};
export const SEVERITIES = ["error", "warning", "info"];
export const LIMITS = { rows: 1048576, columns: 1000 };
export const LIFECYCLE = ["subscriber", "lead", "marketing qualified lead", "sales qualified lead", "opportunity", "customer", "evangelist", "other"];
export const LEAD_STATUS = ["new", "open", "in progress", "open deal", "unqualified", "attempted to contact", "connected", "bad timing"];
export const MARKETING_STATUS = ["marketing contact", "non-marketing contact"];

const squash = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIAS = new Map();
for (const [label, list] of Object.entries(PROPERTIES)) {
  ALIAS.set(squash(label), label);
  for (const a of list) if (!ALIAS.has(a)) ALIAS.set(a, label);
}
const norm = (v) => v.trim().toLowerCase().replace(/[\s_-]+/g, " ");

const TYPO_DOMAINS = new Map([
  ["gmial.com", "gmail.com"], ["gmai.com", "gmail.com"], ["gamil.com", "gmail.com"], ["gmail.con", "gmail.com"], ["gmail.co", "gmail.com"],
  ["gmail.cm", "gmail.com"], ["gnail.com", "gmail.com"], ["hotmial.com", "hotmail.com"], ["hotnail.com", "hotmail.com"], ["hotmail.con", "hotmail.com"],
  ["yaho.com", "yahoo.com"], ["yahooo.com", "yahoo.com"], ["yahoo.con", "yahoo.com"], ["outlok.com", "outlook.com"], ["outlook.con", "outlook.com"],
  ["iclould.com", "icloud.com"], ["icloud.con", "icloud.com"],
]);
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "yopmail.com", "trashmail.com", "sharklasers.com"]);
const ROLE = new Set(["info", "admin", "support", "sales", "contact", "hello", "office", "noreply", "no-reply", "billing", "postmaster", "webmaster", "help"]);
const EMAIL = /^[^\s@,;<>()[\]"]+@[^\s@,;<>()[\]"]+\.[^\s@,;<>()[\]"]{2,}$/;
const SCI = /^\d(\.\d+)?e\+?\d+$/i;
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

export function closestProperty(name) {
  const n = squash(name);
  let best = null, bestD = 99;
  for (const [alias, label] of ALIAS) {
    const d = distance(n, alias);
    if (d < bestD) { bestD = d; best = label; }
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

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, contacts: 0, columns: 0, delimiter: ",", mapped: [], unmapped: [], dupEmails: 0, noEmail: 0 };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a HubSpot contacts CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8 or accented names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'HubSpot reads a comma-separated file. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use "Apply safe fixes" below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. An unescaped quote inside a note or job title is the usual cause: inside a quoted cell a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  if (header.length > LIMITS.columns) add("error", "column-limit", 1, `${header.length} columns`, `HubSpot imports at most ${LIMITS.columns} columns per file (from memory).`);
  if (rows.length - 1 > LIMITS.rows) add("error", "row-limit", 0, `${rows.length - 1} rows`, `A single HubSpot import file holds at most ${LIMITS.rows.toLocaleString("en-US")} rows (from memory). Split it.`);

  const idx = {};
  const seenHeaders = new Map();
  header.forEach((h, i) => {
    if (h === "") { add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "HubSpot asks you to map or skip an unnamed column. Often a stray trailing comma."); return; }
    const key = h.toLowerCase();
    if (seenHeaders.has(key)) add("warning", "dup-header", 1, `Column "${h}" appears twice`, `Columns ${seenHeaders.get(key) + 1} and ${i + 1} share a name. HubSpot cannot map both to one property; the second is often skipped or overwrites the first.`);
    else seenHeaders.set(key, i);
    const label = ALIAS.get(squash(h));
    if (label) {
      summary.mapped.push({ column: h, property: label });
      if (idx[label] === undefined) idx[label] = i;
      else add("warning", "dup-property", 1, `Columns ${idx[label] + 1} and ${i + 1} both map to ${label}`, "Only one column can feed a property. Merge them in the spreadsheet first.");
      if (h !== label && squash(h) !== squash(label)) add("info", "alias-header", 1, `Column "${h}" will be offered the ${label} property`, `HubSpot matches headings by name and often suggests the property; check the mapping screen. Renaming the column to "${label}" makes it automatic.`);
    } else {
      summary.unmapped.push(h);
      const near = closestProperty(h);
      add(near ? "warning" : "info", "unknown-header", 1, `Column "${h}" is not a standard contact property`, near ? `Did you mean ${near}? Otherwise HubSpot will ask you to map it to a custom property or create one.` : "HubSpot will ask you to map it to a custom property, create one, or skip it.");
    }
  });
  if (idx.Email === undefined && idx["Record ID"] === undefined) add("warning", "no-identifier", 1, "There is no Email or Record ID column", "HubSpot matches rows to existing contacts by email or Record ID. Without either, importing creates new records and a second import creates duplicates.");

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
  summary.contacts = data.length;
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  const emails = new Map();
  for (const r of data) {
    const L = r.line;
    const email = g(r, "Email");
    const e = email.trim();
    if (idx.Email !== undefined) {
      if (!e) {
        summary.noEmail++;
        if (idx["Record ID"] === undefined || !g(r, "Record ID").trim()) add("warning", "email-blank", L, "Row has no email address", "Without an email or Record ID HubSpot cannot tell whether this contact already exists, so it is created as new every time the file is imported.");
      } else {
        if (email !== e) add("info", "email-space", L, `Email "${email}" has spaces around it`, "Leading or trailing spaces can make an address fail validation or look unmatched. Safe fixes trim them.");
        if (/^mailto:/i.test(e)) add("warning", "email-mailto", L, `Email "${trunc(e)}" starts with mailto:`, "Remove the mailto: prefix. It usually comes from a hyperlink in the spreadsheet.");
        else if (/[,;]/.test(e) || /\s/.test(e) && /@.*@/.test(e)) add("error", "email-multiple", L, `Email cell "${trunc(e)}" holds more than one address`, "HubSpot takes one email per contact in the Email column. Put the extra addresses in an additional-email column, or give each person a row.");
        else if (/<.*>/.test(e)) add("error", "email-display", L, `Email "${trunc(e)}" is in "Name <address>" form`, "Keep only the address inside the angle brackets and put the name in First Name and Last Name.");
        else if (!EMAIL.test(e)) add("error", "email-format", L, `Email "${trunc(e)}" is not a valid address`, "An address needs one @, no spaces, and a domain with a dot.");
        else {
          const [local, domain] = e.toLowerCase().split("@");
          const fix = TYPO_DOMAINS.get(domain);
          if (fix) add("warning", "email-typo", L, `Email domain "${domain}" looks like a typo`, `Did you mean ${local}@${fix}? A mistyped domain bounces, which hurts sender reputation.`);
          if (DISPOSABLE.has(domain)) add("warning", "email-disposable", L, `Email "${trunc(e)}" is a disposable address`, "Throwaway inboxes never engage and count against your contact tier.");
          if (ROLE.has(local)) add("info", "email-role", L, `Email "${trunc(e)}" is a shared role address`, "Role inboxes (info@, sales@) are often a team, not a person, and tend to complain more.");
          if (e !== e.toLowerCase()) add("info", "email-case", L, `Email "${trunc(e)}" has capitals`, "HubSpot treats emails as case-insensitive, but other systems you sync with may not. Safe fixes lowercase them.");
          const k = e.toLowerCase();
          if (!emails.has(k)) emails.set(k, []);
          emails.get(k).push(L);
        }
      }
    }
    for (const col of ["Phone Number", "Mobile Phone Number"]) {
      const v = g(r, col).trim();
      if (!v) continue;
      if (SCI.test(v)) add("error", "phone-sci", L, `${col} "${v}" is in scientific notation`, "Excel turned a long number into scientific notation and the original digits are gone. Format the column as Text and re-enter the numbers.");
      else if (/[a-wyz]/i.test(v.replace(/\b(ext|x)\b\.?\s*\d+/i, ""))) add("warning", "phone-letters", L, `${col} "${trunc(v)}" contains letters`, "Only digits, spaces, + ( ) - . and an extension are read as a number.");
      else if (v.replace(/\D/g, "").length < 7) add("warning", "phone-short", L, `${col} "${v}" has fewer than 7 digits`, "That is too short to be a callable number.");
    }
    const zip = g(r, "Postal Code").trim();
    if (zip && /^\d{4}$/.test(zip) && /^(us|usa|united states)?$/i.test(g(r, "Country/Region").trim())) add("info", "zip-zero", L, `Postal Code "${zip}" has four digits`, "US ZIP codes have five. Excel drops a leading zero (Boston 02108 becomes 2108). Format the column as Text and restore it.");
    const site = g(r, "Website URL").trim();
    if (site && /\s/.test(site)) add("warning", "website", L, `Website URL "${trunc(site)}" contains spaces`, "A web address cannot contain spaces.");

    const life = g(r, "Lifecycle Stage").trim();
    if (life && !LIFECYCLE.includes(norm(life))) add("error", "lifecycle", L, `Lifecycle Stage "${life}" is not a HubSpot stage`, `HubSpot's default stages are ${LIFECYCLE.map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase())).join(", ")}. An unknown value is rejected for that row unless you added a custom stage; confirm the stage names in your own portal.`);
    const ls = g(r, "Lead Status").trim();
    if (ls && !LEAD_STATUS.includes(norm(ls))) add("warning", "lead-status", L, `Lead Status "${ls}" is not a default status`, `HubSpot's defaults are ${LEAD_STATUS.map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase())).join(", ")}. Portals can customise this list, so check yours.`);
    const ms = g(r, "Marketing contact status").trim();
    if (ms && !MARKETING_STATUS.includes(norm(ms).replace("non marketing", "non-marketing"))) add("warning", "marketing-status", L, `Marketing contact status "${ms}" is not recognised`, "Use Marketing contact or Non-marketing contact. Marketing contacts count towards your billing tier.");
    const owner = g(r, "Contact Owner").trim();
    if (owner && !/^\d+$/.test(owner) && !EMAIL.test(owner) && !/\s/.test(owner)) add("info", "owner", L, `Contact Owner "${trunc(owner)}" is not an email or user name`, "HubSpot matches the owner by the user's name, email address or ID. An unmatched owner leaves the contact unassigned.");
    for (const col of Object.keys(idx)) {
      const v = g(r, col).trim();
      if (v && /^#(REF|N\/A|VALUE|NAME|DIV\/0)/.test(v)) add("error", "spreadsheet-error", L, `${col} contains ${v}`, "A spreadsheet formula error was saved into the CSV. Fix or clear the cell.");
    }
    header.forEach((h, i) => {
      const label = ALIAS.get(squash(h));
      if (label !== "First Name" && label !== "Last Name") return;
      const v = (r.cells[i] ?? "").trim();
      if (v.length > 2 && (v === v.toUpperCase() || v === v.toLowerCase()) && /[a-z]/i.test(v)) add("info", "name-case", L, `${label} "${v}" is all ${v === v.toUpperCase() ? "capitals" : "lower case"}`, "A merge field like Hi {{contact.firstname}} will print it as written.");
    });
  }

  for (const [email, lines] of emails) {
    if (lines.length > 1) {
      summary.dupEmails += lines.length - 1;
      add("warning", "dup-email", lines[1], `"${trunc(email)}" appears ${lines.length} times (lines ${lines.slice(0, 5).join(", ")}${lines.length > 5 ? ", …" : ""})`, "HubSpot merges rows with one email into a single contact; for conflicting values, the last row in the file usually wins. Decide which row is right before importing.");
    }
  }

  // Dates: one column should use one order.
  header.forEach((h, ci) => {
    if (!h || !isDateHeader(h)) return;
    let md = 0, dm = 0, amb = 0, iso = 0, bad = 0, unread = 0, firstBad = 0;
    for (const r of data) {
      const v = (r.cells[ci] ?? "").trim();
      if (!v) continue;
      const d = parseDate(v);
      if (!d) { unread++; if (!firstBad) firstBad = r.line; continue; }
      if (d.order === "md") md++; else if (d.order === "dm") dm++; else if (d.order === "?") amb++; else if (d.order === "ymd") iso++; else { bad++; if (!firstBad) firstBad = r.line; }
      if (d.order === "ymd" && (d.a > 12 || d.b > 31)) { bad++; if (!firstBad) firstBad = r.line; }
    }
    if (md && dm) add("error", "date-mixed", 1, `"${h}" mixes month-first and day-first dates`, `${md} value${md === 1 ? "" : "s"} can only be month/day/year and ${dm} can only be day/month/year. HubSpot reads the whole column in one order, so one group lands on the wrong date or fails. Rewrite them as YYYY-MM-DD.`);
    else if (amb && (md || dm || iso)) add("warning", "date-mixed-ambiguous", 1, `"${h}" mixes date styles`, "Some values are written year-first and some with slashes. Rewrite them in one style, preferably YYYY-MM-DD.");
    else if (amb && !md && !dm && !iso) add("info", "date-ambiguous", 1, `"${h}" dates could be read either way`, `${amb} value${amb === 1 ? "" : "s"} such as 03/04/2026 are both valid month-first and day-first. HubSpot uses the format you choose on the import screen; pick the one your sheet uses.`);
    if (bad) add("error", "date-invalid", firstBad, `"${h}" has ${bad} impossible date${bad === 1 ? "" : "s"}`, "A month above 12 or a day above 31 cannot be a date. Check the first one named here.");
    if (unread) add("warning", "date-unreadable", firstBad, `"${h}" has ${unread} value${unread === 1 ? "" : "s"} that are not dates`, "HubSpot rejects a date property cell it cannot parse. Use YYYY-MM-DD, or leave the cell blank.");
  });

  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits a name, company,
// phone, address, title, owner or any custom property, and never deletes a row except an exact
// duplicate of the row above it in the file.
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
    const label = ALIAS.get(squash(h));
    if (label && squash(h) === squash(label) && h !== label) { changes.push(`Header "${h}" renamed to "${label}".`); rows[0][i] = label; head[i] = label; }
  });
  const col = (n) => head.indexOf(n);
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${lines[ri]}, ${head[ci]}: "${from}" → "${to}" (${why}).`);
  };
  const em = col("Email");
  const dateCols = head.map((h, i) => (isDateHeader(h) ? i : -1)).filter((i) => i >= 0);
  // A date column is only rewritten when it has a single unambiguous reading.
  const dateOrder = new Map();
  for (const ci of dateCols) {
    let md = 0, dm = 0;
    for (let ri = 1; ri < rows.length; ri++) { const d = parseDate((rows[ri][ci] ?? "").trim()); if (d?.order === "md") md++; else if (d?.order === "dm") dm++; }
    if (md && !dm) dateOrder.set(ci, "md"); else if (dm && !md) dateOrder.set(ci, "dm");
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
    for (const ci of dateCols) {
      const o = dateOrder.get(ci);
      const d = r[ci] === undefined ? null : parseDate(r[ci].trim());
      if (o && d && (d.order === "md" || d.order === "dm" || d.order === "?")) {
        const [mo, dy] = o === "md" ? [d.a, d.b] : [d.b, d.a];
        if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) edit(ri, ci, `${d.y}-${pad(mo)}-${pad(dy)}`, `${o === "md" ? "month" : "day"}-first read from the rest of the column; written as YYYY-MM-DD`);
      }
    }
  }
  // Exact duplicate of the immediately preceding row.
  for (let ri = rows.length - 1; ri > 1; ri--) {
    if (rows[ri].some((c) => c.trim() !== "") && rows[ri].join("\u0001") === rows[ri - 1].join("\u0001")) { changes.push(`Line ${lines[ri]}: removed an exact copy of the row above it.`); rows.splice(ri, 1); lines.splice(ri, 1); }
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const COLS = ["First Name", "Last Name", "Email", "Phone Number", "Company Name", "Job Title", "Lifecycle Stage", "Lead Status", "Create Date", "City", "State/Region", "Postal Code", "Country/Region"];
const build = (rows) => toCsv([COLS, ...rows.map((o) => COLS.map((h) => o[h] ?? ""))]);

export function sampleFile() {
  return build([
    { "First Name": "Ana", "Last Name": "Reyes", Email: "ana@example.com", "Phone Number": "+1 415 555 0101", "Company Name": "Northwind Studio", "Job Title": "Owner", "Lifecycle Stage": "Lead", "Lead Status": "New", "Create Date": "2026-03-14", City: "Oakland", "State/Region": "CA", "Postal Code": "94607", "Country/Region": "United States" },
    { "First Name": "Ben", "Last Name": "Okafor", Email: "ben@example.org", "Phone Number": "020 7946 0000", "Company Name": "Okafor & Sons", "Job Title": "Director", "Lifecycle Stage": "Customer", "Lead Status": "Connected", "Create Date": "2026-04-02", City: "London", "Country/Region": "United Kingdom" },
    { "First Name": "Chen", "Last Name": "Wei", Email: "chen@example.net", "Company Name": "Wei Logistics", "Lifecycle Stage": "Marketing Qualified Lead", "Create Date": "2026-05-20", City: "Boston", "State/Region": "MA", "Postal Code": "02108", "Country/Region": "United States" },
  ]);
}

export function sampleBrokenFile() {
  return build([
    { "First Name": "ANA", "Last Name": "reyes", Email: " Ana@Example.com ", "Phone Number": "4.15556E+09", "Company Name": "Northwind Studio", "Lifecycle Stage": "hot lead", "Lead Status": "Warm", "Create Date": "03/14/2026", City: "Oakland", "Postal Code": "2108" },
    { "First Name": "Ana", "Last Name": "Reyes", Email: "ana@example.com", "Phone Number": "call me", "Create Date": "14/03/2026" },
    { "First Name": "Ben", "Last Name": "Okafor", Email: "ben@gmial.com, bokafor@example.org", "Lifecycle Stage": "Customer", "Create Date": "yesterday" },
    { "First Name": "Dee", "Last Name": "Park", Email: "dee.park@mailinator.com", "Create Date": "2026-13-40" },
    { "First Name": "Eli", "Last Name": "Stone", Email: "Eli Stone <eli@example.com>", "Create Date": "04/05/2026" },
    { "First Name": "Fay", "Last Name": "Lund", Email: "mailto:fay@example.com", "Create Date": "05/21/2026" },
    { "First Name": "Gus", "Last Name": "Hale", Email: "info@example.com" },
    { "First Name": "Hal", "Last Name": "Ito", "Company Name": "No email Ltd" },
  ]);
}
