// Klaviyo profile import CSV checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of Klaviyo's public help pages on importing profiles
// from a CSV; no Klaviyo account or import was available when this was built. Any column that is not
// a standard property becomes a custom property in Klaviyo, so an unrecognised header is a note, not
// an error.

// Standard profile columns Klaviyo's importer maps by name. Each role lists accepted spellings.
export const ROLES = {
  email: ["Email"],
  phone: ["Phone Number"],
  externalId: ["External ID"],
  first: ["First Name"],
  last: ["Last Name"],
  organization: ["Organization"],
  title: ["Title"],
  addr1: ["Address 1"],
  addr2: ["Address 2"],
  city: ["City"],
  region: ["Region"],
  country: ["Country"],
  zip: ["Zip"],
  lat: ["Latitude"],
  lon: ["Longitude"],
  timezone: ["Timezone"],
  image: ["Image"],
};
export const COLUMNS = ["Email", "Phone Number", "External ID", "First Name", "Last Name", "Organization", "Title", "Address 1", "Address 2", "City", "Region", "Country", "Zip", "Latitude", "Longitude", "Timezone"];
export const SEVERITIES = ["error", "warning", "info"];

const canon = (h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const ROLE_OF = new Map(), KNOWN = new Map();
for (const [role, names] of Object.entries(ROLES)) for (const n of names) { ROLE_OF.set(canon(n), role); KNOWN.set(canon(n), n); }
const ALL_NAMES = [...KNOWN.values()];
// Spellings people use for a standard column. Klaviyo's mapping step can usually be told, but a file
// that relies on that is one wrong click from a custom property named "Phone".
const NEAR = { emailaddress: "email", mail: "email", email1: "email", phone: "phone", telephone: "phone", mobile: "phone", mobilephone: "phone", cell: "phone", phonenumber: "phone",
  firstname: "first", givenname: "first", fname: "first", lastname: "last", surname: "last", familyname: "last", lname: "last",
  company: "organization", companyname: "organization", jobtitle: "title", address: "addr1", address1: "addr1", street: "addr1", address2: "addr2", state: "region", province: "region",
  zipcode: "zip", postcode: "zip", postalcode: "zip", lat: "lat", lng: "lon", long: "lon", longitude: "lon", id: "externalId", customerid: "externalId", userid: "externalId", externalid: "externalId", tz: "timezone", timezone: "timezone", time_zone: "timezone" };
const NEAR_LABEL = { email: "Email", phone: "Phone Number", externalId: "External ID", first: "First Name", last: "Last Name", organization: "Organization", title: "Title", addr1: "Address 1", addr2: "Address 2", region: "Region", zip: "Zip", lat: "Latitude", lon: "Longitude", timezone: "Timezone" };
const CONSENT_HEADER = /consent|subscrib|opt[\s_-]?in|marketing|gdpr/i;
const DATE_HEADER = /date|birth|dob|anniversary|joined|created|signup|since/i;

const SCI = /^[-+]?\d(\.\d+)?e[-+]?\d+$/i;
const EXCEL_ERR = /^(#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)|#{3,})$/i;
const EMAIL = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;
const E164 = /^\+[1-9]\d{6,14}$/;
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


const phoneFormatFix = (v) => (/^\+[\d\s().-]+$/.test(v) ? "+" + v.slice(1).replace(/[\s().-]/g, "") : v);
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
  const summary = { rows: 0, columns: 0, delimiter: ",", withEmail: 0, withPhone: 0, withExternalId: 0, customColumns: [], flagged: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a Klaviyo profile CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8 or accented names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'Klaviyo reads a comma-separated file. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use the safe fixes below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. An unescaped quote inside a value is the usual cause: inside a quoted cell a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const header = parsed.rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {}, seen = new Map(), consentCols = [], dateCols = [];
  header.forEach((h, i) => {
    const c = canon(h);
    if (!h) { add("warning", "blank-header", 1, `Column ${i + 1} has no header`, "A column with no name cannot be mapped to a profile property, so its data is not imported."); return; }
    if (seen.has(c)) add("error", "dup-header", 1, `Column "${h}" appears twice`, `Columns ${seen.get(c) + 1} and ${i + 1} are the same once capitals and punctuation are ignored. Only one can be mapped to a property; delete or rename one.`);
    else seen.set(c, i);
    const role = ROLE_OF.get(c);
    if (role) {
      if (idx[role] === undefined) idx[role] = i;
      const exact = ROLES[role][0];
      if (h !== exact) add("info", "header-case", 1, `Column "${h}" is not spelled "${exact}"`, `Klaviyo's mapping step usually matches it, but spell it "${exact}" exactly so the match does not depend on a click.`);
      return;
    }
    const near = NEAR[c];
    if (near && idx[near] === undefined && !Object.values(ROLES).flat().some((n) => canon(n) === c)) {
      add("warning", "near-header", 1, `Column "${h}" looks like Klaviyo's "${NEAR_LABEL[near] || ROLES[near][0]}"`, `Klaviyo only maps a standard property when the column is named for it or you map it by hand. Left as is, "${h}" can become a custom property of that name instead. Rename it to "${NEAR_LABEL[near] || ROLES[near][0]}" or map it in the import step.`);
      idx[near] = i;
      return;
    }
    summary.customColumns.push(h);
    if (CONSENT_HEADER.test(h)) consentCols.push(i);
    if (DATE_HEADER.test(h)) dateCols.push(i);
  });
  if (idx.email === undefined && idx.phone === undefined && idx.externalId === undefined) {
    add("error", "missing-column", 1, "No Email, Phone Number or External ID column is present", "Klaviyo needs at least one identifier to create a profile. Check the header row, the delimiter and the encoding.");
    return { findings, summary };
  }
  if (summary.customColumns.length) add("info", "custom-columns", 1, `${summary.customColumns.length} column${summary.customColumns.length === 1 ? "" : "s"} will import as custom properties`, `${summary.customColumns.slice(0, 8).map((c) => `"${trunc(c, 24)}"`).join(", ")}${summary.customColumns.length > 8 ? ", …" : ""}. That is normal for your own fields; if one of these should have been a standard column, rename it.`);

  const emails = new Map(), phones = new Map(), ids = new Map();
  const dateShapes = dateCols.map(() => new Map());
  let blank = 0, noContact = 0;
  const get = (r, role) => (idx[role] === undefined ? undefined : r[idx[role]]);
  for (let ri = 1; ri < parsed.rows.length; ri++) {
    const { cells: r, line: L } = parsed.rows[ri];
    if (r.every((c) => c.trim() === "")) { blank++; continue; }
    summary.rows++;
    const before = findings.length;
    if (r.length > header.length) add("error", "extra-cells", L, `Row has ${r.length} cells but the header has ${header.length}`, "An unquoted comma inside a name, address or custom value shifts every later cell one column to the right. Wrap that cell in double quotes.");
    else if (r.length < header.length) add("warning", "short-row", L, `Row has ${r.length} cells but the header has ${header.length}`, "The missing trailing cells are read as empty.");

    const emailRaw = get(r, "email") ?? "", email = emailRaw.trim();
    const phone = unapos((get(r, "phone") ?? "").trim());
    const ext = (get(r, "externalId") ?? "").trim();
    if (email) summary.withEmail++;
    if (phone) summary.withPhone++;
    if (ext) summary.withExternalId++;
    if (!email && !phone && !ext) { noContact++; add("error", "no-identifier", L, "Row has no email, phone number or external ID", "Klaviyo cannot create a profile with no identifier; this row will be skipped."); }

    if (email) {
      if (emailRaw !== email) add("info", "email-space", L, "Email has spaces around it", "Safe fixes trim them.");
      if (EXCEL_ERR.test(email)) add("error", "excel-error", L, `Email is the spreadsheet error "${email}"`, "A broken formula was exported as text. Fix the source cell.");
      else if (!EMAIL.test(email)) add("error", "email", L, `Email "${trunc(email)}" is not a valid address`, /[;,]/.test(email) ? "It holds more than one address, or a separator. One address per profile." : "Check for a missing @, a missing domain, or a space inside the address.");
      else {
        const key = email.toLowerCase();
        if (emails.has(key)) add("warning", "dup-email", L, `Email "${trunc(email)}" repeats line ${emails.get(key)}`, "Addresses are compared without regard to capitals, so these rows are the same person. Klaviyo updates one profile from both rows, and the later values can overwrite the earlier ones.");
        else emails.set(key, L);
      }
    }
    if (phone) {
      if (SCI.test(phone)) add("error", "phone-excel", L, `Phone "${phone}" was turned into scientific notation`, "Excel stores long digit strings as numbers and the original digits are lost. Re-enter the number from the source and format the column as Text before saving.");
      else if (!E164.test(phoneFormatFix(phone))) {
        const digits = phone.replace(/\D/g, "");
        add("warning", "phone-e164", L, `Phone "${trunc(phone)}" is not in international (E.164) format`, !phone.startsWith("+") ? `Klaviyo wants a leading + and the country code, such as +14155550123. ${digits.length === 10 ? "A 10-digit number may be North American, but this tool will not guess a country code for you." : "Add the country code from your own records."}` : "After the +, it should be 7 to 15 digits starting 1-9, with no letters or extensions.");
      } else {
        const key = phoneFormatFix(phone);
        if (key !== phone) add("info", "phone-punct", L, `Phone "${trunc(phone)}" has spaces or punctuation`, "The digits are valid; safe fixes remove the spaces, brackets and dashes.");
        if (phones.has(key)) add("warning", "dup-phone", L, `Phone "${trunc(phone)}" repeats line ${phones.get(key)}`, "Two rows carry the same number; Klaviyo may merge them or reject the later one.");
        else phones.set(key, L);
      }
    }
    if (ext) {
      if (ids.has(ext)) add("warning", "dup-external-id", L, `External ID "${trunc(ext)}" repeats line ${ids.get(ext)}`, "An External ID should identify one profile. Two rows sharing one will be treated as the same person.");
      else ids.set(ext, L);
      if (SCI.test(ext)) add("error", "external-excel", L, `External ID "${ext}" was turned into scientific notation`, "Excel read a long numeric ID as a number and the original digits are lost. Re-export the ID as Text.");
    }

    const lat = (get(r, "lat") ?? "").trim(), lon = (get(r, "lon") ?? "").trim();
    if (lat && !(/^-?\d+(\.\d+)?$/.test(lat) && Math.abs(Number(lat)) <= 90)) add("error", "latitude", L, `Latitude "${trunc(lat)}" is not a number from -90 to 90`, "Use decimal degrees such as 42.3601. A swapped latitude and longitude is the usual cause.");
    if (lon && !(/^-?\d+(\.\d+)?$/.test(lon) && Math.abs(Number(lon)) <= 180)) add("error", "longitude", L, `Longitude "${trunc(lon)}" is not a number from -180 to 180`, "Use decimal degrees such as -71.0589.");
    const tz = (get(r, "timezone") ?? "").trim();
    if (tz && !/^[A-Za-z_]+(\/[A-Za-z_+-]+){1,2}$|^(UTC|GMT)$/.test(tz)) add("warning", "timezone", L, `Timezone "${trunc(tz)}" is not an IANA name`, "Use a name such as America/New_York. Abbreviations like EST and offsets like -05:00 are ambiguous.");
    const img = (get(r, "image") ?? "").trim();
    if (img && !/^https?:\/\/\S+$/i.test(img)) add("warning", "image", L, `Image "${trunc(img)}" is not a web address`, "The Image column takes a full http or https URL.");
    const zipRaw = get(r, "zip");
    if (zipRaw !== undefined && zipRaw.trim()) {
      const z = unapos(zipRaw.trim());
      const country = (get(r, "country") ?? "").trim().toUpperCase();
      const us = country === "US" || country === "USA" || country === "UNITED STATES";
      if (SCI.test(z)) add("error", "zip-excel", L, `Zip "${z}" was turned into scientific notation`, "Excel read the zip as a number. Re-enter it from the source with the column formatted as Text.");
      else if (/^\d+\.0+$/.test(z)) add("warning", "zip-decimal", L, `Zip "${z}" has a decimal ending`, "Excel added .0 when it read the zip as a number. Safe fixes remove it. Check for stripped leading zeros as well.");
      else if (us && /^\d{3,4}$/.test(z)) add("warning", "zip-zero", L, `US zip "${z}" has only ${z.length} digits`, "US zips have 5. A leading zero is usually stripped by Excel (New England and New Jersey zips start with 0). This tool will not add it for you; check the real zip and re-enter it as text.");
    }
    const country = (get(r, "country") ?? "").trim();
    if (country && /^\d+$/.test(country)) add("warning", "country", L, `Country "${trunc(country)}" is a number`, "Use a country name or its two-letter code.");

    for (const ci of consentCols) {
      const v = (r[ci] ?? "").trim();
      if (v && !/^(yes|no|true|false|y|n|1|0|subscribed|unsubscribed|opted[ -]?in|opted[ -]?out)$/i.test(v)) add("info", "consent-value", L, `"${header[ci]}" holds "${trunc(v)}"`, "This looks like a consent or subscription column with an unusual value. Klaviyo imports it as a custom property; it does not become consent on its own.");
    }
    dateCols.forEach((ci, k) => { const v = (r[ci] ?? "").trim(); const sh = v ? dateShape(v) : ""; if (sh) dateShapes[k].set(sh, (dateShapes[k].get(sh) || 0) + 1); else if (v && !SCI.test(v)) dateShapes[k].set("other", (dateShapes[k].get("other") || 0) + 1); });

    if (findings.length > before) summary.flagged.push({ line: L, email: email || phone || ext || "(no identifier)", issues: findings.length - before });
  }
  dateCols.forEach((ci, k) => {
    const m = dateShapes[k];
    const kinds = [...m.keys()];
    if (kinds.length > 1) add("warning", "date-mixed", 0, `"${header[ci]}" mixes date formats`, `The column holds ${kinds.map((x) => `${m.get(x)} ${x === "iso" ? "ISO (2026-03-31)" : x === "other" ? "unrecognised" : "day/month/year style"}`).join(" and ")} values. Klaviyo cannot tell day-first from month-first in a mixed column; use one format, ideally YYYY-MM-DD.`);
    else if (m.get("ambiguous")) add("info", "date-ambiguous", 0, `"${header[ci]}" has day/month dates that can be read two ways`, `Values like 03/04/2026 are 3 April or March 4 depending on who reads them. YYYY-MM-DD removes the guess. This tool will not reorder dates for you.`);
  });
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");
  add("info", "consent-note", 0, "Importing does not prove permission to market", "Klaviyo asks you to confirm you have permission before an import, and that confirmation is about your records, not this file. Only import people who opted in, such as a signup form or a prior platform's subscription list. This tool checks formatting and never creates or changes consent. Messaging people who did not opt in can breach laws such as CAN-SPAM, TCPA, GDPR and PECR.");
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
    if (exact && h !== exact) { changes.push(`Header "${h}" renamed to "${exact}".`); rows[0][i] = exact; }
  });
  const head = rows[0].map((h) => h.trim());
  const col = (role) => head.indexOf(ROLES[role][0]);
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci]}: "${from}" → "${to}" (${why}).`);
  };
  const c = Object.fromEntries(Object.keys(ROLES).map((k) => [k, col(k)]));
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((x) => x.trim() === "")) continue;
    const has = (k) => c[k] >= 0 && r[c[k]] !== undefined;
    if (has("email") && r[c.email] !== r[c.email].trim()) edit(ri, c.email, r[c.email].trim(), "stray spaces");
    if (has("phone")) {
      const raw = r[c.phone], v = raw.trim();
      if (E164.test(phoneFormatFix(v)) && v !== phoneFormatFix(v)) edit(ri, c.phone, phoneFormatFix(v), "spaces and punctuation removed, digits untouched");
      else if (raw !== v && v) edit(ri, c.phone, v, "stray spaces");
    }
    if (has("zip")) { const v = r[c.zip].trim(); if (/^\d+\.0+$/.test(v)) edit(ri, c.zip, v.replace(/\.0+$/, ""), "Excel's .0 removed, no digits added"); else if (v !== r[c.zip] && v) edit(ri, c.zip, v, "stray spaces"); }
    if (has("externalId") && r[c.externalId] !== r[c.externalId].trim()) edit(ri, c.externalId, r[c.externalId].trim(), "stray spaces");
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const build = (rows, extra = []) => toCsv([[...COLUMNS, ...extra], ...rows.map((o) => [...COLUMNS, ...extra].map((h) => o[h] ?? ""))]);

export function sampleFile() {
  return build([
    { Email: "ada@example.com", "Phone Number": "+16175550101", "External ID": "C-1001", "First Name": "Ada", "Last Name": "Example", City: "Boston", Region: "MA", Country: "United States", Zip: "02108", Timezone: "America/New_York", "Last Order Date": "2026-03-31", "Favorite Collection": "Linen" },
    { Email: "ben@example.org", "First Name": "Ben", "Last Name": "Sample", City: "Toronto", Region: "ON", Country: "Canada", Zip: "M5V 2T6", Latitude: "43.6532", Longitude: "-79.3832", "Last Order Date": "2026-02-14" },
    { "Phone Number": "+442071838750", "First Name": "Cleo", "Last Name": "Demo", Country: "United Kingdom", "Last Order Date": "2026-01-05" },
  ], ["Last Order Date", "Favorite Collection"]);
}

export function sampleBrokenFile() {
  return build([
    { Email: "ada@example.com", "Phone Number": "6175550101", "External ID": "C-1001", "First Name": "Ada", "Last Name": "Example", Zip: "2108", Country: "US", Timezone: "EST", "Last Order Date": "03/04/2026" },
    { Email: "ADA@example.com", "Phone Number": "+1 (617) 555-0103", "External ID": "C-1001", "First Name": "Ada", "Last Name": "Again", "Last Order Date": "2026-03-04" },
    { Email: "ben-at-example.org", "First Name": "Ben", "Last Name": "Sample", Zip: "1.23457E+11", "Phone Number": "4.16556E+09", Latitude: "-79.38", Longitude: "430", "Last Order Date": "15/04/2026" },
    { "First Name": "No", "Last Name": "Identifier", Country: "US" },
  ], ["Last Order Date"]);
}
