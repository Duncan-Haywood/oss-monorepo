// Email / contact list CSV checker. Pure functions, no DOM, no network.
// Platform header names are read from memory of each platform's public import help pages; no
// import into any of them was tried when this was built. Nothing here verifies that an address
// can receive mail, and nothing here establishes that anyone agreed to be emailed.

export const PLATFORMS = {
  mailchimp: { name: "Mailchimp", email: "Email Address", first: "First Name", last: "Last Name", phone: "Phone Number", company: null },
  hubspot: { name: "HubSpot", email: "Email", first: "First Name", last: "Last Name", phone: "Phone Number", company: "Company Name" },
  klaviyo: { name: "Klaviyo", email: "Email", first: "First Name", last: "Last Name", phone: "Phone Number", company: "Organization" },
  brevo: { name: "Brevo", email: "EMAIL", first: "FIRSTNAME", last: "LASTNAME", phone: "SMS", company: "COMPANY" },
  constantcontact: { name: "Constant Contact", email: "Email", first: "First Name", last: "Last Name", phone: "Mobile Phone", company: "Company Name" },
};

// What a heading means, by squashed lower-case spelling.
const CONCEPTS = {
  email: ["email", "emailaddress", "mail", "emailaddr", "eaddress", "contactemail", "primaryemail", "workemail", "emailid"],
  first: ["first", "firstname", "givenname", "fname", "forename"],
  last: ["last", "lastname", "surname", "familyname", "lname"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "tel", "telephone", "cell", "cellphone", "sms"],
  company: ["company", "companyname", "organization", "organisation", "org", "employer"],
};
const squash = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
const CONCEPT_OF = new Map();
for (const [k, list] of Object.entries(CONCEPTS)) for (const s of list) CONCEPT_OF.set(s, k);

export const ROLE_LOCALS = new Set([
  "info", "admin", "administrator", "support", "sales", "noreply", "donotreply", "contact", "contactus", "hello", "hi", "office", "team",
  "billing", "accounts", "accounting", "accountspayable", "help", "helpdesk", "service", "customerservice", "customercare", "webmaster",
  "postmaster", "hostmaster", "abuse", "hr", "jobs", "careers", "recruiting", "marketing", "press", "media", "pr", "enquiries", "enquiry",
  "inquiries", "inquiry", "mail", "email", "orders", "order", "privacy", "security", "legal", "newsletter", "news", "feedback", "root",
  "bookings", "reservations", "reception", "general", "manager", "owner", "staff", "ops", "operations", "finance", "payroll", "dev", "it", "bounce", "mailer", "mailerdaemon",
]);

export const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de", "sharklasers.com", "grr.la",
  "guerrillamailblock.com", "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net", "tempr.email",
  "throwawaymail.com", "yopmail.com", "yopmail.fr", "yopmail.net", "trashmail.com", "trashmail.net", "trashmail.de", "getnada.com", "nada.email",
  "dispostable.com", "maildrop.cc", "fakeinbox.com", "mailnesia.com", "mintemail.com", "mytemp.email", "discard.email", "spamgourmet.com",
  "mailcatch.com", "emailondeck.com", "moakt.com", "mohmal.com", "tempinbox.com", "burnermail.io", "33mail.com", "getairmail.com", "mailforspam.com",
  "spambox.us", "spam4.me", "tmail.ws", "tmpmail.org", "tmpmail.net", "mailtemp.info", "emailfake.com", "fakemail.net", "mail-temp.com", "inboxkitten.com",
  "harakirimail.com", "jetable.org", "mailexpire.com", "meltmail.com", "noclickemail.com", "owlymail.com", "puremail.xyz", "temporary-mail.net", "trbvm.com",
  "dropmail.me", "emltmp.com", "mailpoof.com", "mail.tm", "linshiyouxiang.net", "tempail.com", "email-fake.com", "wegwerfmail.de", "wegwerfmail.net",
]);

// Whole-domain typos of the big mailbox providers.
export const TYPO_DOMAINS = {
  "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com",
  "gmil.com": "gmail.com", "gimail.com": "gmail.com", "gmaul.com": "gmail.com", "gmeil.com": "gmail.com", "gmail.co": "gmail.com", "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com", "gmail.vom": "gmail.com", "gmali.com": "gmail.com", "gmail.comm": "gmail.com", "gmailcom": "gmail.com", "gmaip.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotnail.com": "hotmail.com", "hotmaill.com": "hotmail.com",
  "homail.com": "hotmail.com", "hotmil.com": "hotmail.com", "hotmail.co": "hotmail.com", "hotmailcom": "hotmail.com", "hotamil.com": "hotmail.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "yahho.com": "yahoo.com", "yaoo.com": "yahoo.com", "yahou.com": "yahoo.com", "yhoo.com": "yahoo.com",
  "yahhoo.com": "yahoo.com", "yahoo.co": "yahoo.com", "yahoocom": "yahoo.com", "yaahoo.com": "yahoo.com",
  "outlok.com": "outlook.com", "outlookk.com": "outlook.com", "outloook.com": "outlook.com", "outllook.com": "outlook.com", "oulook.com": "outlook.com",
  "outlool.com": "outlook.com", "otlook.com": "outlook.com", "outlook.co": "outlook.com", "outlookcom": "outlook.com",
  "iclod.com": "icloud.com", "iclud.com": "icloud.com", "icoud.com": "icloud.com", "icloude.com": "icloud.com", "icloud.co": "icloud.com", "icloudcom": "icloud.com",
  "aol.con": "aol.com", "comcsat.net": "comcast.net", "comast.net": "comcast.net", "protonmal.com": "protonmail.com", "protonmial.com": "protonmail.com",
};
const TLD_TYPOS = { con: "com", coom: "com", cmo: "com", vom: "com", comm: "com", cim: "com", ocm: "com", xom: "com", cpm: "com", nett: "net", ogr: "org", orgg: "org" };
const PROVIDERS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "comcast.net"];
const PLUS_PROVIDERS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "fastmail.com", "protonmail.com", "proton.me", "pm.me"]);
const GMAIL = new Set(["gmail.com", "googlemail.com"]);

const EXCEL_ERR = /^#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)$/i;
const SCI = /^[+-]?\d(\.\d+)?E\+?\d+$/i;
const MOJIBAKE = /Ã[\u0080-¿]|Â[ -¿]|â€[\u0080-¿™"]|Ã©|Ã¨|Ã¼|Ã¶|Ã¤|Ã±|�/;
const CONSENT_HEADER = /^\s*status\s*$|unsub|opt.?(in|out)|consent|subscri|gdpr|permission|do.?not.?(email|contact|mail)|dnc|suppress|bounce|email.?status|marketing.?(status|ok|allowed)/i;
const NOT_SUBSCRIBED = /^(unsub(scribed)?|opted?[ _-]?out|no|n|false|0|cleaned|bounced|suppressed|do ?not ?(email|contact|mail)|dnc|inactive|revoked|withdrawn)$/i;
const PHONE_HEADER = /phone|mobile|tel(?:ephone)?\b|\bsms\b|\bfax\b|\bcell/i;
const ZIP_HEADER = /\bzip|postal|post.?code/i;
const MAX_PER_CHECK = 60;

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return "﻿" + new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return "﻿" + new TextDecoder("utf-16be").decode(u8.subarray(2));
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(u8);
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

function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
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

// ---------- email ----------
const LOCAL_OK = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;

// null when the address is well formed, otherwise { level: "error" | "warning", reason }.
export function checkSyntax(email) {
  const e = email;
  if (/^mailto:/i.test(e)) return { level: "error", reason: 'starts with "mailto:"' };
  if (/<[^>]*>/.test(e)) return { level: "error", reason: 'is in "Name <address>" form; the importer wants the bare address' };
  if (/\s/.test(e)) return { level: "error", reason: "contains a space" };
  if (/[;,]/.test(e)) {
    const parts = e.split(/[;,]/).filter((p) => p.includes("@"));
    return { level: "error", reason: parts.length > 1 ? "has more than one address in one cell" : "contains a comma or semicolon" };
  }
  const ats = e.split("@").length - 1;
  if (ats === 0) return { level: "error", reason: "has no @" };
  if (ats > 1) return { level: "error", reason: "has more than one @" };
  const [local, domain] = e.split("@");
  if (/[^\x00-\x7f]/.test(e)) return { level: "warning", reason: "has non-ASCII characters, which many platforms reject" };
  if (!local) return { level: "error", reason: "has nothing before the @" };
  if (local.length > 64) return { level: "error", reason: "has a part before the @ longer than 64 characters" };
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return { level: "error", reason: "has a misplaced dot before the @" };
  if (!LOCAL_OK.test(local)) return { level: "error", reason: "has a character that is not allowed before the @" };
  if (!domain) return { level: "error", reason: "has nothing after the @" };
  if (domain.length > 253) return { level: "error", reason: "has a domain that is too long" };
  const labels = domain.split(".");
  if (labels.length < 2) return { level: "error", reason: "has a domain with no dot (like .com)" };
  for (const l of labels) {
    if (!l) return { level: "error", reason: "has an empty part in the domain (a double or trailing dot)" };
    if (!/^[A-Za-z0-9-]+$/.test(l)) return { level: "error", reason: "has a character that is not allowed in the domain" };
    if (l.startsWith("-") || l.endsWith("-")) return { level: "error", reason: "has a domain part starting or ending with a hyphen" };
  }
  const tld = labels[labels.length - 1];
  if (!/^([A-Za-z]{2,}|xn--[A-Za-z0-9-]+)$/.test(tld)) return { level: "error", reason: "has a domain ending that is not a real kind (like .com)" };
  return null;
}

export function suggestDomain(domain) {
  const d = domain.toLowerCase();
  if (TYPO_DOMAINS[d]) return TYPO_DOMAINS[d];
  const labels = d.split(".");
  const tld = labels[labels.length - 1];
  if (TLD_TYPOS[tld]) {
    const fixed = [...labels.slice(0, -1), TLD_TYPOS[tld]].join(".");
    return TYPO_DOMAINS[fixed] || fixed;
  }
  if (labels[0].length >= 5) {
    for (const p of PROVIDERS) if (d !== p && distance(d, p) === 1) return p;
  }
  return null;
}

export const isRoleLocal = (local) => ROLE_LOCALS.has(local.toLowerCase().replace(/[._-]/g, ""));

export function isDisposable(domain) {
  const d = domain.toLowerCase();
  if (DISPOSABLE.has(d)) return true;
  const labels = d.split(".");
  for (let i = 1; i < labels.length - 1; i++) if (DISPOSABLE.has(labels.slice(i).join("."))) return true;
  return false;
}

// Key for "probably the same mailbox": gmail ignores dots and +tags; a few others ignore +tags.
export function aliasKey(email) {
  const at = email.lastIndexOf("@");
  if (at < 0) return email.toLowerCase();
  let local = email.slice(0, at).toLowerCase(), domain = email.slice(at + 1).toLowerCase();
  if (PLUS_PROVIDERS.has(domain)) local = local.split("+")[0];
  if (GMAIL.has(domain)) { local = local.replace(/\./g, ""); domain = "gmail.com"; }
  return `${local}@${domain}`;
}

// ---------- shared reading of a file ----------
function read(text, opts = {}) {
  const out = { bom: false, delimiter: ",", rows: [], unterminated: 0, header: [], data: [], emailCol: -1, emailCols: [], mixedRows: new Set() };
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) { out.bom = true; t = t.slice(1); }
  out.delimiter = detectDelimiter(t);
  const parsed = parseCsv(t, out.delimiter);
  out.unterminated = parsed.unterminated;
  out.rows = parsed.rows;
  if (!parsed.rows.length || parsed.unterminated) return out;
  out.header = parsed.rows[0].cells;
  out.headerLine = parsed.rows[0].line;
  out.emailCols = out.header.map((h, i) => (CONCEPT_OF.get(squash(h)) === "email" ? i : -1)).filter((i) => i >= 0);
  out.emailCol = out.emailCols.length ? out.emailCols[0] : -1;
  const width = out.header.length;
  for (const r of parsed.rows.slice(1)) {
    if (r.cells.every((c) => c.trim() === "")) continue;
    let cells = r.cells, mixed = null;
    if (cells.length !== width) {
      for (const o of [",", ";", "\t"]) {
        if (o === out.delimiter) continue;
        const re = cells.flatMap((c) => c.split(o));
        if (re.length === width) { cells = re; mixed = o; break; }
      }
    }
    out.data.push({ cells, line: r.line, original: r.cells, mixed, ragged: cells.length !== width });
  }
  return out;
}

const SEV = { error: 0, warning: 1, info: 2 };
const nameOf = (d) => (d === "\t" ? "tab" : d === ";" ? "semicolon" : "comma");
const lineList = (lines, n = 6) => `line${lines.length === 1 ? "" : "s"} ${lines.slice(0, n).join(", ")}${lines.length > n ? ` and ${lines.length - n} more` : ""}`;

function platformReport(header, id) {
  const p = PLATFORMS[id];
  const have = new Map();
  header.forEach((h, i) => { const c = CONCEPT_OF.get(squash(h)); if (c && !have.has(c)) have.set(c, { header: h.trim(), index: i }); });
  const renames = [], ok = [];
  for (const c of ["email", "first", "last", "phone", "company"]) {
    const want = p[c];
    const h = have.get(c);
    if (!want || !h) continue;
    if (h.header === want) ok.push(want);
    else renames.push({ from: h.header, to: want, index: h.index, concept: c });
  }
  const missing = ["first", "last", "phone", "company"].filter((c) => p[c] && !have.has(c)).map((c) => p[c]);
  return { id, name: p.name, emailHeader: p.email, emailFound: have.has("email"), emailExact: have.has("email") && have.get("email").header === p.email, ok, renames, missing };
}

// ---------- validate ----------
export function validate(text, opts = {}) {
  const findings = [];
  const counts = new Map();
  const add = (severity, code, title, detail, line) => {
    const n = (counts.get(code) || 0) + 1;
    counts.set(code, n);
    if (n <= MAX_PER_CHECK) findings.push({ severity, code, title, detail, line: line || 0 });
  };
  const f = read(text, opts);
  const summary = { rows: 0, columns: f.header.length, delimiter: f.delimiter, emailColumn: f.emailCol >= 0 ? f.header[f.emailCol] : "", counts: {}, platforms: [], consentColumn: "", bom: f.bom };
  const result = { findings, summary };
  if (!text.trim()) { add("error", "empty", "The file is empty", "There is nothing to check.", 0); return result; }
  if (f.unterminated) { add("error", "quote", "A quoted cell is never closed", `A quote opened on line ${f.unterminated} has no closing quote, so everything after it reads as one cell. Fix the quote before anything else can be checked.`, f.unterminated); return result; }
  if (f.bom) add("info", "bom", "File starts with a byte order mark (BOM)", "Excel adds this to UTF-8 CSVs. Some importers read it as part of the first heading (so the first column is not recognised). The safe-fixes file removes it.", 1);
  if (f.delimiter !== ",") add("warning", "delimiter", `Fields are separated by ${nameOf(f.delimiter)}s, not commas`, "Mailchimp, HubSpot, Klaviyo, Brevo and Constant Contact expect comma-separated values. This often comes from Excel in a region that uses a semicolon. The safe-fixes file rewrites it with commas.", 1);
  summary.rows = f.data.length;

  // headings
  const seen = new Map();
  f.header.forEach((h, i) => {
    const k = h.trim().toLowerCase();
    if (!k) add("warning", "blank-heading", `Column ${i + 1} has no heading`, "Importers drop or mis-name an unlabelled column.", f.headerLine);
    else if (seen.has(k)) add("warning", "dup-heading", `Heading "${h.trim()}" appears twice`, `Columns ${seen.get(k) + 1} and ${i + 1} share a heading; most importers keep only one of them.`, f.headerLine);
    else seen.set(k, i);
    if (h !== h.trim() && k) add("warning", "heading-space", `Heading "${h.trim()}" has stray spaces`, "A leading or trailing space stops a heading matching the platform's field name.", f.headerLine);
  });
  if (f.emailCol < 0) {
    add("error", "no-email-column", "No email column found", `Looked for a heading like "Email", "Email Address" or "E-mail". Headings found: ${f.header.map((h) => `"${h.trim()}"`).join(", ") || "none"}.`, f.headerLine);
  } else if (f.emailCols.length > 1) {
    add("info", "multi-email", "More than one column looks like an email column", `Checking "${f.header[f.emailCol].trim()}" (column ${f.emailCol + 1}); the others are not checked.`, f.headerLine);
  }
  for (const id of Object.keys(PLATFORMS)) summary.platforms.push(platformReport(f.header, id));
  const want = opts.platform && Object.hasOwn(PLATFORMS, opts.platform) ? summary.platforms.find((p) => p.id === opts.platform) : null;
  if (want) {
    if (!want.emailFound) add("error", "platform-email", `${want.name} will not find an email column`, `${want.name} expects the heading "${want.emailHeader}".`, f.headerLine);
    else if (!want.emailExact) add("warning", "platform-email", `Heading "${want.renames.find((r) => r.concept === "email").from}" is not ${want.name}'s "${want.emailHeader}"`, `${want.name} may ask you to map it by hand. Renaming it to "${want.emailHeader}" lets the import match it automatically; the safe-fixes file can do that.`, f.headerLine);
    for (const r of want.renames.filter((x) => x.concept !== "email")) add("info", "platform-rename", `Heading "${r.from}" would match ${want.name}'s "${r.to}" if renamed`, "Optional: names that match exactly are mapped without a prompt.", f.headerLine);
    if (want.missing.length) add("info", "platform-missing", `No column for ${want.missing.join(", ")}`, `${want.name} has fields with these names; not having them is fine, they are just not imported.`, f.headerLine);
  }

  const width = f.header.length;
  const emailIdx = f.emailCol;
  const firstSeen = new Map(), firstAlias = new Map();
  const sci = new Map(), zero = new Map(), moji = [], spaces = [];
  const ragged = [];
  let blank = 0, invalid = 0, dup = 0, aliasDup = 0, typos = 0, roles = 0, disposable = 0, ws = 0, notSub = 0, valid = 0;
  const consentIdx = f.header.map((h, i) => (CONSENT_HEADER.test(h) && i !== emailIdx ? i : -1)).filter((i) => i >= 0);
  if (consentIdx.length) summary.consentColumn = f.header[consentIdx[0]].trim();
  const zipIdx = new Set(f.header.map((h, i) => (ZIP_HEADER.test(h) ? i : -1)).filter((i) => i >= 0));
  const phoneIdx = new Set(f.header.map((h, i) => (PHONE_HEADER.test(h) && !ZIP_HEADER.test(h) ? i : -1)).filter((i) => i >= 0));
  // Most common digit-only phone length, to spot a number that lost its leading zero.
  const lens = new Map();
  for (const r of f.data) for (const i of phoneIdx) { const c = (r.cells[i] || "").trim(); if (/^\d{9,15}$/.test(c)) lens.set(c.length, (lens.get(c.length) || 0) + 1); }
  const modal = [...lens.entries()].sort((a, b) => b[1] - a[1])[0];

  for (const r of f.data) {
    if (r.mixed) add("warning", "mixed-delim", `Line ${r.line} is separated by ${nameOf(r.mixed)}s, the rest of the file by ${nameOf(f.delimiter)}s`, "Pasting from two sources mixes separators, so this row lands in one cell or shifts columns. The safe-fixes file splits it.", r.line);
    else if (r.ragged) { ragged.push(r.line); add("error", "ragged", `Line ${r.line} has ${r.cells.length} cell${r.cells.length === 1 ? "" : "s"}, the heading has ${width}`, "Columns shift on a ragged row (often an unquoted comma inside a name or address). The row is moved to the rejected file.", r.line); continue; }
    r.cells.forEach((c, i) => {
      if (i === emailIdx) return;
      const t = c.trim();
      if (c !== t && t) ws++, spaces.length < 6 && spaces.push(r.line);
      if (EXCEL_ERR.test(t)) add("error", "excel-error", `Excel error value "${t}" in ${f.header[i].trim() || "column " + (i + 1)}`, "A formula failed before the file was saved. The original value is gone.", r.line);
      if (SCI.test(t)) { const k = f.header[i].trim() || `column ${i + 1}`; (sci.get(k) || sci.set(k, []).get(k)).push(r.line); }
      if (MOJIBAKE.test(c) && moji[moji.length - 1] !== r.line) moji.push(r.line);
      if (zipIdx.has(i) && /^\d{4}$/.test(t)) { const k = f.header[i].trim(); (zero.get(k) || zero.set(k, { lines: [], what: "ZIP/postcode" }).get(k)).lines.push(r.line); }
      else if (phoneIdx.has(i) && modal && /^\d+$/.test(t) && t.length === modal[0] - 1 && modal[0] >= 10) { const k = f.header[i].trim(); (zero.get(k) || zero.set(k, { lines: [], what: "phone number" }).get(k)).lines.push(r.line); }
      if ((zipIdx.has(i) || phoneIdx.has(i)) && /^\d+\.0$/.test(t)) add("warning", "dot-zero", `${f.header[i].trim()} "${t}" ends in .0`, "The column was stored as a number and exported with a decimal. Leading zeros may be gone as well.", r.line);
    });
    if (consentIdx.length) for (const i of consentIdx) if (NOT_SUBSCRIBED.test((r.cells[i] || "").trim())) { notSub++; break; }
    if (emailIdx < 0) continue;
    const raw = r.cells[emailIdx] || "";
    const e = raw.trim();
    if (!e) { blank++; add("error", "blank", "Email is blank", "A row with no email cannot be imported as a contact. It is moved to the rejected file.", r.line); continue; }
    if (raw !== e) add("warning", "email-space", `Email has ${/^\s/.test(raw) ? "leading" : "trailing"} whitespace`, `"${raw.replace(/\t/g, "\\t")}" - some importers reject the row, others store the space. The safe-fixes file trims it.`, r.line);
    if (EXCEL_ERR.test(e)) { invalid++; add("error", "invalid", `Email is an Excel error value "${e}"`, "A formula failed before the file was saved.", r.line); continue; }
    const bad = checkSyntax(e);
    if (bad) {
      if (bad.level === "error") { invalid++; add("error", "invalid", `Invalid email "${e}"`, `This address ${bad.reason}.`, r.line); continue; }
      add("warning", "non-ascii", `Email "${e}" needs a look`, `This address ${bad.reason}.`, r.line);
    }
    valid++;
    const at = e.lastIndexOf("@"), local = e.slice(0, at), domain = e.slice(at + 1).toLowerCase();
    if (/[A-Z]/.test(e)) add("info", "case", `Email "${e}" has capital letters`, "Addresses are not case sensitive in practice, but a duplicate check that is case sensitive will miss it. The safe-fixes file lowercases emails.", r.line);
    const key = e.toLowerCase();
    if (firstSeen.has(key)) { dup++; add("warning", "dup", `Duplicate of line ${firstSeen.get(key)}: ${e}`, "Same address ignoring capitals. Importers either skip or overwrite the second one. The safe-fixes file keeps the first and moves the rest to the rejected file.", r.line); continue; }
    firstSeen.set(key, r.line);
    const ak = aliasKey(e);
    if (ak !== key) {
      if (firstAlias.has(ak)) { aliasDup++; add("warning", "alias-dup", `Likely duplicate of line ${firstAlias.get(ak)}: ${e}`, `Gmail ignores dots and "+" tags (and some other providers ignore "+" tags), so this probably reaches the same mailbox as ${f.data.find((x) => x.line === firstAlias.get(ak)).cells[emailIdx].trim()}. Not removed automatically: review it.`, r.line); }
    }
    if (!firstAlias.has(ak)) firstAlias.set(ak, r.line);
    const fix = suggestDomain(domain);
    if (fix) { typos++; add("warning", "typo", `Domain "${domain}" looks like a typo of ${fix}`, `${e} would become ${local}@${fix}. Check before accepting: it is a guess. The safe-fixes file only applies it if you tick the box.`, r.line); }
    if (isRoleLocal(local)) { roles++; add("warning", "role", `Role address ${e}`, "Shared mailboxes (info@, admin@, support@, noreply@ and similar) are read by a team or nobody, complain more often, and some platforms suppress or reject them. Keep only if the person asked to hear from you there.", r.line); }
    if (isDisposable(domain)) { disposable++; add("warning", "disposable", `Disposable email domain ${domain}`, "A throwaway inbox service (from a small built-in list). The address is probably dead within hours.", r.line); }
  }

  for (const [k, lines] of sci) add("warning", "sci", `Scientific notation in "${k}"`, `${lines.length} cell${lines.length === 1 ? "" : "s"} like 5.55E+09 on ${lineList(lines)}. Excel turned a long number into a rounded one; the lost digits cannot be recovered from this file. Re-export from the source with the column formatted as text.`, lines[0]);
  for (const [k, z] of zero) add("warning", "zeros", `Possible stripped leading zeros in "${k}"`, `${z.lines.length} ${z.what}${z.lines.length === 1 ? "" : "s"} one digit short on ${lineList(z.lines)} (a ZIP like 02108 saved as 2108). Check them against the source; this tool does not guess the zero back.`, z.lines[0]);
  if (moji.length) add("warning", "mojibake", "Garbled accents (mojibake)", `Text like "JosÃ©" or "â€™" on ${lineList(moji)}. The file was saved as UTF-8 and read as something else, or the reverse. Re-export as "CSV UTF-8".`, moji[0]);
  if (ws) add("info", "cell-space", `${ws} cell${ws === 1 ? "" : "s"} outside the email column have leading or trailing spaces`, `First on ${lineList(spaces)}. The safe-fixes file trims them.`, spaces[0]);

  // consent hints
  if (consentIdx.length) {
    const names = consentIdx.map((i) => `"${f.header[i].trim()}"`).join(", ");
    add("info", "consent-col", `Subscription or consent column found: ${names}`, "Good: it is worth keeping, and mapping it to the platform's subscription status, so that people who opted out are not re-subscribed by the import.", f.headerLine);
    if (notSub) add("warning", "unsubscribed", `${notSub} row${notSub === 1 ? " is" : "s are"} marked unsubscribed, bounced or not opted in`, "Importing these as subscribed can email people who opted out. Remove them, or import them as unsubscribed or suppressed if the platform allows. This tool does not remove them for you.", f.headerLine);
  } else if (emailIdx >= 0) {
    add("info", "no-consent-col", "No consent or subscription status column", "Nothing in this file says who agreed to be emailed or who unsubscribed. Mailchimp, HubSpot, Klaviyo, Brevo and Constant Contact each ask you to confirm permission on import, and you are the one answering. This tool cannot check it.", f.headerLine);
  }

  for (const [code, n] of counts) if (n > MAX_PER_CHECK) findings.push({ severity: "info", code: code + "-more", title: `${n - MAX_PER_CHECK} more "${code}" finding${n - MAX_PER_CHECK === 1 ? "" : "s"} not listed`, detail: `Only the first ${MAX_PER_CHECK} of each kind are shown; the counts above are complete.`, line: 0 });
  summary.counts = { blank, invalid, duplicates: dup, aliasDuplicates: aliasDup, typos, roles, disposable, valid, notSubscribed: notSub, ragged: ragged.length };
  findings.sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.line - b.line);
  return result;
}

// ---------- repair ----------
// Only changes with one reasonable reading. Never edits anyone's name, phone or any other value
// except by trimming it, and never drops a row silently: every removed row goes to the rejected file.
export function repair(text, opts = {}) {
  const f = read(text, opts);
  const none = { text: "", rejectedText: null, changes: [], kept: 0, rejected: 0 };
  if (!text.trim()) return { ...none, error: "The file is empty." };
  if (f.unterminated) return { ...none, error: `A quote opened on line ${f.unterminated} is never closed; fix that first.` };
  if (f.emailCol < 0) return { ...none, error: "No email column found, so there is nothing safe to fix." };
  const changes = [];
  if (f.bom) changes.push("Removed the byte order mark (BOM)");
  if (f.delimiter !== ",") changes.push(`Rewrote ${nameOf(f.delimiter)}-separated fields as comma-separated`);
  let header = f.header.map((h) => h.trim());
  if (header.some((h, i) => h !== f.header[i])) changes.push("Trimmed spaces from headings");
  if (opts.platform && PLATFORMS[opts.platform]) {
    for (const r of platformReport(header, opts.platform).renames) { changes.push(`Renamed heading "${r.from}" to "${r.to}" (${PLATFORMS[opts.platform].name})`); header[r.index] = r.to; }
  }
  const kept = [header], rejected = [[...f.header.map((h) => h.trim()), "Rejected reason", "Original line"]];
  let trimmed = 0, lowered = 0, resplit = 0;
  const seen = new Map();
  const typoNotes = [];
  let rejCount = { blank: 0, invalid: 0, ragged: 0, dup: 0 };
  const reject = (r, reason, key) => { rejected.push([...r.original.map((c) => c), ...Array(Math.max(0, f.header.length - r.original.length)).fill(""), reason, String(r.line)]); rejCount[key]++; };
  for (const r of f.data) {
    if (r.ragged) { reject(r, `Wrong number of cells (${r.cells.length}, expected ${f.header.length})`, "ragged"); continue; }
    if (r.mixed) resplit++;
    const cells = r.cells.map((c) => { const t = c.trim(); if (t !== c) trimmed++; return t; });
    let e = cells[f.emailCol];
    if (!e) { reject(r, "Email is blank", "blank"); continue; }
    if (/[A-Z]/.test(e)) { e = e.toLowerCase(); lowered++; }
    const bad = checkSyntax(e);
    if (bad && bad.level === "error") { reject(r, `Invalid email: ${bad.reason}`, "invalid"); continue; }
    if (opts.fixTypos) {
      const at = e.lastIndexOf("@"), fix = suggestDomain(e.slice(at + 1));
      if (fix) { typoNotes.push(`Line ${r.line}: ${e.slice(at + 1)} to ${fix}`); e = e.slice(0, at + 1) + fix; }
    }
    cells[f.emailCol] = e;
    if (seen.has(e)) { reject(r, `Duplicate of line ${seen.get(e)}`, "dup"); continue; }
    seen.set(e, r.line);
    kept.push(cells);
  }
  if (trimmed) changes.push(`Trimmed spaces in ${trimmed} cell${trimmed === 1 ? "" : "s"}`);
  if (lowered) changes.push(`Lowercased ${lowered} email address${lowered === 1 ? "" : "es"}`);
  if (resplit) changes.push(`Re-split ${resplit} row${resplit === 1 ? "" : "s"} that used a different separator`);
  if (typoNotes.length) changes.push(`Fixed ${typoNotes.length} typo domain${typoNotes.length === 1 ? "" : "s"} (opted in): ${typoNotes.slice(0, 20).join("; ")}${typoNotes.length > 20 ? `; and ${typoNotes.length - 20} more` : ""}`);
  if (rejCount.dup) changes.push(`Kept the first of ${rejCount.dup} exact duplicate address${rejCount.dup === 1 ? "" : "es"}; the repeats are in the rejected file`);
  if (rejCount.blank) changes.push(`Moved ${rejCount.blank} row${rejCount.blank === 1 ? "" : "s"} with no email to the rejected file`);
  if (rejCount.invalid) changes.push(`Moved ${rejCount.invalid} row${rejCount.invalid === 1 ? "" : "s"} with an invalid email to the rejected file`);
  if (rejCount.ragged) changes.push(`Moved ${rejCount.ragged} row${rejCount.ragged === 1 ? "" : "s"} with the wrong number of cells to the rejected file`);
  const total = rejected.length - 1;
  return { text: toCsv(kept), rejectedText: total ? toCsv(rejected) : null, changes, kept: kept.length - 1, rejected: total, error: "" };
}

// A cell that starts with = + - @ would run as a formula when the findings file is opened in Excel.
const safeCell = (v) => (/^[=+\-@\t\r]/.test(v) ? "'" + v : v);

export function findingsCsv(result) {
  return toCsv([["Severity", "Line", "Check", "Finding", "Detail"], ...result.findings.map((x) => [x.severity, x.line ? String(x.line) : "", x.code, safeCell(x.title), safeCell(x.detail)])]);
}

export function sampleFile() {
  return toCsv([
    ["Email Address", "First Name", "Last Name", "Phone Number", "ZIP", "Subscription Status"],
    ["maria.lopez@example.com", "Maria", "Lopez", "+15555550101", "02108", "subscribed"],
    ["devon@northwind.example", "Devon", "Park", "+15555550102", "94110", "subscribed"],
    ["priya@harborcoffee.example", "Priya", "Nair", "+15555550103", "10001", "subscribed"],
  ]);
}

export function sampleBrokenFile() {
  return "﻿" + [
    "E-mail;First Name;Last Name;Phone;ZIP;Status",
    "Maria.Lopez@Example.com ;Maria;Lopez;5555550101;02108;subscribed",
    "maria.lopez@example.com;Maria;Lopez;5555550101;2108;subscribed",
    "devon@gmial.com;Devon;Park;5555550102;94110;subscribed",
    "priya@harborcoffee.con;Priya;Nair;5.56E+09;10001;subscribed",
    "sam.jones@gmail.com;Sam;Jones;5555550104;60601;subscribed",
    "samjones+news@gmail.com;Sam;Jones;5555550104;60601;subscribed",
    "info@harborcoffee.example;Harbor;Coffee;5555550105;10001;subscribed",
    "tmp123@mailinator.com;Temp;User;5555550106;10001;subscribed",
    "not-an-email;Pat;Kim;5555550107;10001;subscribed",
    ";Lee;Wong;5555550108;10001;subscribed",
    "jose@example.org;JosÃ©;GarcÃ­a;5555550109;33101;unsubscribed",
    "ann@example.org;Ann;Reed;5555550110",
    "bo@example.org,Bo,Ray,5555550111,73301,subscribed",
  ].join("\r\n") + "\r\n";
}
