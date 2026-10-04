// Shopify customer import CSV checker. Pure functions, no DOM, no network.
// Column names and limits are read from memory of Shopify's public customer import and export
// documentation; no Shopify import was available when this was built.

// Each role lists the header spellings the checker recognises: the "Default Address ..." names a
// customer export uses first, then the shorter names the import template uses.
export const ROLES = {
  customerId: ["Customer ID"],
  first: ["First Name"],
  last: ["Last Name"],
  email: ["Email"],
  emailMkt: ["Accepts Email Marketing"],
  company: ["Default Address Company", "Company"],
  addr1: ["Default Address Address1", "Address1"],
  addr2: ["Default Address Address2", "Address2"],
  city: ["Default Address City", "City"],
  provName: ["Default Address Province", "Province"],
  provCode: ["Default Address Province Code", "Province Code"],
  countryName: ["Default Address Country", "Country"],
  countryCode: ["Default Address Country Code", "Country Code"],
  zip: ["Default Address Zip", "Zip"],
  addrPhone: ["Default Address Phone"],
  phone: ["Phone"],
  smsMkt: ["Accepts SMS Marketing"],
  spent: ["Total Spent"],
  orders: ["Total Orders"],
  note: ["Note"],
  taxExempt: ["Tax Exempt"],
  tags: ["Tags"],
};
export const COLUMNS = [
  "First Name", "Last Name", "Email", "Accepts Email Marketing", "Default Address Company",
  "Default Address Address1", "Default Address Address2", "Default Address City",
  "Default Address Province Code", "Default Address Country Code", "Default Address Zip",
  "Phone", "Accepts SMS Marketing", "Total Spent", "Total Orders", "Note", "Tax Exempt", "Tags",
];
export const SEVERITIES = ["error", "warning", "info"];
export const LIMITS = { tagLength: 255, tags: 250 };

const canon = (h) => h.trim().toLowerCase().replace(/[\s_]+/g, "");
const KNOWN = new Map();
for (const names of Object.values(ROLES)) for (const n of names) KNOWN.set(canon(n), n);
const ALL_NAMES = [...KNOWN.values()];
const ROLE_OF = new Map();
for (const [role, names] of Object.entries(ROLES)) for (const n of names) ROLE_OF.set(canon(n), role);

export const COUNTRIES = new Set(("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
  "HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW").split(" "));
export const PROVINCES = {
  US: new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR UM VI AA AE AP".split(" ")),
  CA: new Set("AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" ")),
  AU: new Set("ACT NSW NT QLD SA TAS VIC WA".split(" ")),
};
const COUNTRY_NAMES = { "united states": "US", usa: "US", "united kingdom": "GB", uk: "GB", canada: "CA", australia: "AU", germany: "DE", france: "FR", ireland: "IE", "new zealand": "NZ", mexico: "MX", india: "IN", spain: "ES", italy: "IT", netherlands: "NL" };

const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const EMAIL = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;
const E164 = /^\+[1-9]\d{6,14}$/;
const YESNO = /^(yes|no|true|false)$/i;
const isInt = (v) => /^\d+$/.test(v);
const isMoney = (v) => /^\d+(\.\d{1,2})?$/.test(v);
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

// Shopify's own export writes phone numbers and zips with a leading apostrophe so Excel keeps
// them as text; it is read as that marker, not as part of the value.
const unapos = (v) => (v.startsWith("'") ? v.slice(1) : v);
export const cleanMoney = (v) => {
  let s = v.trim().replace(/^[$€£¥]\s*/, "").replace(/\s*(USD|EUR|GBP|CAD|AUD)$/i, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return s;
};
const phoneFormatFix = (v) => (/^\+[\d\s().-]+$/.test(v) ? "+" + v.slice(1).replace(/[\s().-]/g, "") : v);

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, columns: 0, delimiter: ",", withEmail: 0, withPhone: 0, emailOptIn: 0, smsOptIn: 0, flagged: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a Shopify customer CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8 or accented names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'Shopify reads a comma-separated file. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use the safe fixes below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. An unescaped quote inside a note is the usual cause: inside a quoted cell a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const header = parsed.rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {};
  const seen = new Map();
  header.forEach((h, i) => {
    const c = canon(h);
    if (seen.has(c)) add("error", "dup-header", 1, `Column "${h}" appears twice`, `Columns ${seen.get(c) + 1} and ${i + 1} are the same. Shopify keeps one of them and the other values are lost; delete or rename one.`);
    else seen.set(c, i);
    const role = ROLE_OF.get(c);
    if (role) {
      if (idx[role] === undefined) idx[role] = i;
      const exact = KNOWN.get(c);
      if (h !== exact) add("warning", "header-case", 1, `Column "${h}" is not spelled like the export`, `Use "${exact}" exactly, with that capitalisation.`);
    } else if (h) {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Column "${h}" is not one Shopify reads`, near ? `Did you mean "${near}"? An unrecognised column is ignored on import, so its data is not imported.` : "An unrecognised column is ignored on import, so its data is not imported. Remove it or rename it to a Shopify customer column.");
    } else add("warning", "blank-header", 1, `Column ${i + 1} has no header`, "A column with no name is ignored on import.");
  });
  if (idx.email === undefined && idx.phone === undefined) {
    add("error", "missing-column", 1, "Neither an Email nor a Phone column is present", "Shopify needs an Email or a Phone to create a customer. Add the missing header row or check the delimiter and encoding.");
    return { findings, summary };
  }
  if (idx.email === undefined) add("info", "no-email-col", 1, "There is no Email column", "Customers will be created from Phone alone, so email marketing consent cannot be set.");

  const emails = new Map(), phones = new Map();
  let blank = 0, optedEmailNoAddr = 0, optedSmsNoPhone = 0;
  const get = (r, role) => (idx[role] === undefined ? undefined : r[idx[role]]);
  for (let ri = 1; ri < parsed.rows.length; ri++) {
    const { cells: r, line: L } = parsed.rows[ri];
    if (r.every((c) => c.trim() === "")) { blank++; continue; }
    summary.rows++;
    const before = findings.length;
    if (r.length > header.length) add("error", "extra-cells", L, `Row has ${r.length} cells but the header has ${header.length}`, "An unquoted comma inside a name, address or note shifts every later cell one column to the right. Wrap that cell in double quotes.");
    else if (r.length < header.length) add("warning", "short-row", L, `Row has ${r.length} cells but the header has ${header.length}`, "The missing trailing cells are read as empty.");

    const emailRaw = get(r, "email") ?? "", email = emailRaw.trim();
    const phoneRaw = get(r, "phone") ?? "", phone = unapos(phoneRaw.trim());
    if (email) summary.withEmail++;
    if (phone) summary.withPhone++;
    if (!email && !phone) add("error", "no-contact", L, "Row has neither an email nor a phone number", "Shopify cannot create a customer without one of them; this row will be rejected.");

    if (email) {
      if (emailRaw !== email) add("info", "email-space", L, "Email has spaces around it", "Safe fixes trim them.");
      if (!EMAIL.test(email)) add("error", "email", L, `Email "${trunc(email)}" is not a valid address`, /[;,]/.test(email) ? "It holds more than one address, or a separator. One address per customer." : "Check for a missing @, a missing domain, or a space inside the address.");
      else {
        const key = email.toLowerCase();
        if (emails.has(key)) add("error", "dup-email", L, `Email "${trunc(email)}" repeats line ${emails.get(key)}`, "Email addresses are matched without regard to capitals. Shopify imports one of the duplicates and skips the other, so decide which row holds the right details.");
        else emails.set(key, L);
      }
    }
    if (phone) {
      if (SCI.test(phone)) add("error", "phone-excel", L, `Phone "${phone}" was turned into scientific notation`, "Excel stores long digit strings as numbers and the original digits are lost. Re-enter the number from the source and format the column as Text before saving.");
      else if (!E164.test(phoneFormatFix(phone))) {
        const digits = phone.replace(/\D/g, "");
        add("warning", "phone-e164", L, `Phone "${trunc(phone)}" is not in international (E.164) format`, !phone.startsWith("+") ? `Shopify expects a leading + and the country code, such as +14155550123. ${digits.length === 10 ? "A 10-digit number may be North American, but this tool will not guess a country code for you." : "Add the country code from your own records."}` : "After the +, it should be 7 to 15 digits starting 1-9, with no letters or extensions.");
      } else {
        const key = phoneFormatFix(phone);
        if (key !== phone) add("info", "phone-punct", L, `Phone "${trunc(phone)}" has spaces or punctuation`, "The digits are valid; safe fixes remove the spaces, brackets and dashes.");
        if (phones.has(key)) add("warning", "dup-phone", L, `Phone "${trunc(phone)}" repeats line ${phones.get(key)}`, "Shopify treats a phone number as unique to one customer, so the later row may be rejected or merged.");
        else phones.set(key, L);
      }
    }

    const em = get(r, "emailMkt"), sms = get(r, "smsMkt"), tx = get(r, "taxExempt");
    for (const [role, v, label] of [["emailMkt", em, "Accepts Email Marketing"], ["smsMkt", sms, "Accepts SMS Marketing"], ["taxExempt", tx, "Tax Exempt"]]) {
      if (v === undefined || v.trim() === "") continue;
      if (!YESNO.test(v.trim())) add("error", `${role}-value`, L, `${label} is "${trunc(v)}"`, 'Use yes or no (true and false are also read). Nothing else is guessed: this tool will not turn "Y", "1" or "subscribed" into consent for you.');
      else if (v.trim() !== v.trim().toLowerCase()) add("info", `${role}-case`, L, `${label} "${v.trim()}" is not lower case`, "Shopify writes lower case; safe fixes change capitals only.");
    }
    if (em && /^(yes|true)$/i.test(em.trim())) { summary.emailOptIn++; if (!email) optedEmailNoAddr++; }
    if (sms && /^(yes|true)$/i.test(sms.trim())) { summary.smsOptIn++; if (!phone) optedSmsNoPhone++; }
    if (sms && /^(yes|true)$/i.test(sms.trim()) && phone && !E164.test(phoneFormatFix(phone))) add("error", "sms-phone", L, "SMS marketing is yes but the phone is not a valid E.164 number", "A number Shopify cannot read cannot receive text messages; fix the number first.");

    const cc = (get(r, "countryCode") ?? "").trim(), cn = (get(r, "countryName") ?? "").trim();
    const pc = (get(r, "provCode") ?? "").trim();
    let country = cc.toUpperCase();
    if (cc) {
      if (cc !== cc.toUpperCase()) add("info", "country-case", L, `Country code "${cc}" is not upper case`, "Safe fixes change capitals only.");
      if (!COUNTRIES.has(country)) {
        const guess = COUNTRY_NAMES[cc.toLowerCase()];
        add("error", "country-code", L, `Country code "${trunc(cc)}" is not a two-letter ISO code`, guess ? `That looks like a country name. The code column wants "${guess}"; this tool does not rewrite it for you.` : "Use the two-letter ISO 3166-1 code, such as US, CA, GB or AU.");
        country = "";
      }
    } else if (!cn && ((get(r, "addr1") ?? "").trim() || (get(r, "city") ?? "").trim())) add("warning", "no-country", L, "Address has no country", "A street or city with no country code may be rejected or saved with an incomplete address.");
    if (pc) {
      const up = pc.toUpperCase();
      if (pc !== up) add("info", "province-case", L, `Province code "${pc}" is not upper case`, "Safe fixes change capitals only.");
      if (country && PROVINCES[country]) { if (!PROVINCES[country].has(up)) add("error", "province-code", L, `Province code "${trunc(pc)}" is not a ${country} code`, `Use the short code for the ${country} state or province, such as ${[...PROVINCES[country]].slice(0, 3).join(", ")}. Full names in this column are not read.`); }
      else if (!/^[A-Za-z0-9]{1,3}(-[A-Za-z0-9]{1,3})?$/.test(pc)) add("warning", "province-format", L, `Province code "${trunc(pc)}" does not look like a code`, "Province Code takes the short code, not the name.");
    }
    const zipRaw = get(r, "zip");
    if (zipRaw !== undefined && zipRaw.trim()) {
      const z = unapos(zipRaw.trim());
      if (SCI.test(z)) add("error", "zip-excel", L, `Zip "${z}" was turned into scientific notation`, "Excel read the zip as a number. Re-enter it from the source with the column formatted as Text.");
      else if (/^\d+\.0+$/.test(z)) add("warning", "zip-decimal", L, `Zip "${z}" has a decimal ending`, "Excel added .0 when it read the zip as a number. Safe fixes remove it. Check for stripped leading zeros as well.");
      else if (country === "US" && /^\d{4}$/.test(z)) add("warning", "zip-zero", L, `US zip "${z}" has only 4 digits`, "US zips have 5. A leading zero is usually stripped by Excel (New England and New Jersey zips start with 0). This tool will not add it for you; check the real zip and re-enter it as text.");
      else if (country === "US" && /^\d{3}$/.test(z)) add("warning", "zip-zero", L, `US zip "${z}" has only 3 digits`, "Two leading zeros were probably stripped (Puerto Rico and the Virgin Islands start with 00). Check the real zip and re-enter it as text.");
      else if (country === "CA" && !/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(z)) add("warning", "zip-format", L, `Canadian postal code "${trunc(z)}" is not in A1A 1A1 form`, "Check the code against the source.");
    }

    const tags = (get(r, "tags") ?? "");
    if (tags.trim()) {
      const list = tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (list.length > LIMITS.tags) add("error", "tags-count", L, `${list.length} tags on one customer`, `Shopify allows up to ${LIMITS.tags} tags per customer; extra tags are dropped or the row rejected.`);
      const long = list.find((t) => t.length > LIMITS.tagLength);
      if (long) add("error", "tag-length", L, `A tag is ${long.length} characters long`, `Each tag is limited to ${LIMITS.tagLength} characters. It starts "${trunc(long, 30)}". A comma-separated list pasted into one tag is the usual cause; this tool will not split or shorten a tag for you.`);
    }

    const spent = get(r, "spent");
    if (spent !== undefined && spent.trim() && !isMoney(spent.trim())) add("warning", "spent", L, `Total Spent "${trunc(spent)}" is not a plain number`, isMoney(cleanMoney(spent)) ? "Currency symbols and thousands separators are not read. Safe fixes remove them." : "Use digits and an optional decimal point, such as 149.50.");
    const ord = get(r, "orders");
    if (ord !== undefined && ord.trim() && !isInt(ord.trim())) add("warning", "orders", L, `Total Orders "${trunc(ord)}" is not a whole number`, "Use digits only, such as 3.");

    if (findings.length > before) {
      const issues = findings.length - before;
      summary.flagged.push({ line: L, email: email || phone || "(no contact)", issues });
    }
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");
  if (optedEmailNoAddr) add("warning", "optin-no-email", 0, `${optedEmailNoAddr} row${optedEmailNoAddr === 1 ? "" : "s"} accept email marketing but have no email`, "A consent value with no address to attach it to does nothing; check the columns did not shift.");
  if (optedSmsNoPhone) add("warning", "optin-no-phone", 0, `${optedSmsNoPhone} row${optedSmsNoPhone === 1 ? "" : "s"} accept SMS marketing but have no phone`, "A consent value with no number to attach it to does nothing; check the columns did not shift.");
  if (summary.emailOptIn || summary.smsOptIn) add("info", "consent-note", 0, `${summary.emailOptIn} email and ${summary.smsOptIn} SMS marketing opt-ins in this file`, "A yes in these columns must come from real opt-in records, such as a signup form or a prior platform's subscription list. This tool checks the format of the values and never creates, upgrades or changes consent. Marketing people who did not opt in can breach laws such as TCPA, CAN-SPAM, GDPR and PECR.");
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
    const c = KNOWN.get(canon(h));
    if (c && h !== c) { changes.push(`Header "${h}" renamed to "${c}".`); rows[0][i] = c; }
  });
  const head = rows[0].map((h) => h.trim());
  const colOf = (role) => ROLES[role].map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci]}: "${from}" → "${to}" (${why}).`);
  };
  const c = Object.fromEntries(Object.keys(ROLES).map((k) => [k, colOf(k)]));
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((x) => x.trim() === "")) continue;
    const has = (k) => c[k] >= 0 && r[c[k]] !== undefined;
    if (has("email") && r[c.email] !== r[c.email].trim()) edit(ri, c.email, r[c.email].trim(), "stray spaces");
    for (const k of ["phone", "addrPhone"]) if (has(k)) {
      const raw = r[c[k]], v = raw.trim();
      if (E164.test(phoneFormatFix(v)) && v !== phoneFormatFix(v)) edit(ri, c[k], phoneFormatFix(v), "spaces and punctuation removed, digits untouched");
      else if (raw !== v && v) edit(ri, c[k], v, "stray spaces");
    }
    for (const k of ["emailMkt", "smsMkt", "taxExempt"]) if (has(k)) { const v = r[c[k]].trim(); if (YESNO.test(v)) edit(ri, c[k], v.toLowerCase(), "capitals only"); }
    if (has("countryCode")) { const v = r[c.countryCode].trim(); if (COUNTRIES.has(v.toUpperCase())) edit(ri, c.countryCode, v.toUpperCase(), "capitals and spaces only"); }
    if (has("provCode")) { const v = r[c.provCode].trim(); if (/^[A-Za-z0-9-]{1,7}$/.test(v)) edit(ri, c.provCode, v.toUpperCase(), "capitals and spaces only"); }
    if (has("zip")) { const v = r[c.zip].trim(); if (/^\d+\.0+$/.test(v)) edit(ri, c.zip, v.replace(/\.0+$/, ""), "Excel's .0 removed, no digits added"); else if (v !== r[c.zip] && v) edit(ri, c.zip, v, "stray spaces"); }
    if (has("spent")) { const v = r[c.spent].trim(); if (v && !isMoney(v) && isMoney(cleanMoney(v))) edit(ri, c.spent, cleanMoney(v), "plain number"); }
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const build = (rows) => toCsv([COLUMNS, ...rows.map((o) => COLUMNS.map((h) => o[h] ?? ""))]);

export function sampleFile() {
  return build([
    { "First Name": "Ada", "Last Name": "Example", Email: "ada@example.com", "Accepts Email Marketing": "yes", "Default Address Address1": "1 Sample Street", "Default Address City": "Boston", "Default Address Province Code": "MA", "Default Address Country Code": "US", "Default Address Zip": "02108", Phone: "+16175550101", "Accepts SMS Marketing": "no", "Total Spent": "149.50", "Total Orders": "3", Tags: "vip, wholesale", "Tax Exempt": "no" },
    { "First Name": "Ben", "Last Name": "Sample", Email: "ben@example.org", "Accepts Email Marketing": "no", "Default Address City": "Toronto", "Default Address Province Code": "ON", "Default Address Country Code": "CA", "Default Address Zip": "M5V 2T6", Phone: "+14165550102", "Accepts SMS Marketing": "no", "Total Spent": "0", "Total Orders": "0", "Tax Exempt": "yes", Note: "Made-up test customer" },
    { "First Name": "Cleo", "Last Name": "Demo", Phone: "+442071838750", "Accepts Email Marketing": "no", "Accepts SMS Marketing": "no", "Default Address Country Code": "GB", "Tax Exempt": "no" },
  ]);
}

export function sampleBrokenFile() {
  return build([
    { "First Name": "Ada", "Last Name": "Example", Email: "ada@example.com", "Accepts Email Marketing": "Yes", "Default Address Address1": "1 Sample Street", "Default Address City": "Boston", "Default Address Province Code": "ma", "Default Address Country Code": "us", "Default Address Zip": "2108", Phone: "6175550101", "Accepts SMS Marketing": "Y", "Total Spent": "$1,149.50", "Total Orders": "3", Tags: "vip", "Tax Exempt": "No" },
    { "First Name": "Ada", "Last Name": "Again", Email: "ADA@example.com", "Accepts Email Marketing": "yes", Phone: "+1 (617) 555-0103", "Accepts SMS Marketing": "yes", "Default Address Country Code": "United States", "Tax Exempt": "maybe" },
    { "First Name": "Ben", "Last Name": "Sample", Email: "ben-at-example.org", "Accepts Email Marketing": "no", "Default Address Country Code": "CA", "Default Address Province Code": "XX", "Default Address Zip": "1.23457E+11", Phone: "4.16556E+09", Tags: Array.from({ length: 30 }, (_, i) => `segment-${i}`).join(",") + "," + "x".repeat(260) },
    { "First Name": "No", "Last Name": "Contact", "Accepts Email Marketing": "yes", "Default Address Country Code": "US" },
  ]);
}
