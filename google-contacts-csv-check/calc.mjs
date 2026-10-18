// Google Contacts CSV import checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of Google Contacts' public CSV export/import format
// (both the current "First Name ... E-mail 1 - Value" layout and the older "Given Name ... Group
// Membership" layout) and its help pages; no Google import was available when this was built.

export const SEP = " ::: "; // how Google joins several values inside one cell
export const SIZE_LIMIT = 3 * 1024 * 1024;

const FIXED_NEW = ["First Name", "Middle Name", "Last Name", "Phonetic First Name", "Phonetic Middle Name", "Phonetic Last Name", "Name Prefix", "Name Suffix", "Nickname", "File As", "Organization Name", "Organization Title", "Organization Department", "Birthday", "Notes", "Photo", "Labels"];
const FIXED_OLD = ["Name", "Given Name", "Additional Name", "Family Name", "Yomi Name", "Given Name Yomi", "Additional Name Yomi", "Family Name Yomi", "Name Prefix", "Name Suffix", "Initials", "Nickname", "Short Name", "Maiden Name", "Birthday", "Gender", "Location", "Billing Information", "Directory Server", "Mileage", "Occupation", "Hobby", "Sensitivity", "Priority", "Subject", "Notes", "Language", "Photo", "Group Membership"];
const GROUPS = {
  email: ["E-mail", ["Label", "Type", "Value"]],
  phone: ["Phone", ["Label", "Type", "Value"]],
  address: ["Address", ["Label", "Type", "Formatted", "Street", "City", "PO Box", "Region", "Postal Code", "Country", "Extended Address"]],
  website: ["Website", ["Label", "Type", "Value"]],
  organization: ["Organization", ["Type", "Name", "Yomi Name", "Title", "Department", "Symbol", "Location", "Job Description"]],
  customfield: ["Custom Field", ["Label", "Type", "Value"]],
  relation: ["Relation", ["Label", "Type", "Value"]],
  event: ["Event", ["Label", "Type", "Value"]],
  im: ["IM", ["Label", "Type", "Value"]],
};
export const COLUMNS = [...new Set([...FIXED_NEW, ...FIXED_OLD])];
const squash = (s) => s.toLowerCase().replace(/[\s_-]+/g, "");
const FIXED = new Map(COLUMNS.map((c) => [squash(c), c]));

// "e-mail 2 - value", "Email2Value", "E-mail 2 – Value" all land on "E-mail 2 - Value".
export function canonHeader(h) {
  const k = squash(String(h).replace(/[\u2013\u2014]/g, "-"));
  if (FIXED.has(k)) return FIXED.get(k);
  const m = /^([a-z]+)(\d+)([a-z]+)$/.exec(k);
  if (!m || !GROUPS[m[1]]) return null;
  const [label, parts] = GROUPS[m[1]];
  const part = parts.find((p) => squash(p) === m[3]);
  return part ? `${label} ${Number(m[2])} - ${part}` : null;
}

const SUGGEST = [...COLUMNS, ...Object.values(GROUPS).flatMap(([label, parts]) => parts.map((p) => `${label} 1 - ${p}`))];
const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const EXCEL_ERR = /^#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)$/i;

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

export function closestColumn(name) {
  const num = (/(\d+)/.exec(name) || [])[1];
  const n = squash(name).replace(/[^a-z]/g, "");
  let best = null, bestD = 99;
  for (const c of SUGGEST) {
    const d = distance(n, squash(c).replace(/[^a-z]/g, ""));
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best && num) best = best.replace(" 1 - ", ` ${num} - `);
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}



// ---------- analysis ----------
function prepare(input) {
  const text = String(input || "").replace(/^﻿/, "");
  const delim = detectDelimiter(text);
  const parsed = parseCsv(text, delim);
  const rows = parsed.rows.filter((r) => !(r.cells.length === 1 && r.cells[0].trim() === ""));
  return { text, delim, parsed, rows };
}

function columnMap(header) {
  const idx = {};
  const dups = [];
  header.forEach((h, i) => {
    const key = canonHeader(h.trim());
    if (!key) return;
    if (key in idx) dups.push({ name: key, i }); else idx[key] = i;
  });
  return { idx, dups };
}

const EMAIL = /^[^\s@,;:]+@[^\s@,;:]+\.[^\s@,;:]{2,}$/;
const values = (cell) => cell.split(":::").map((v) => v.trim()).filter(Boolean);
const groupCols = (idx, label, part) => Object.keys(idx).filter((k) => k.startsWith(`${label} `) && k.endsWith(` - ${part}`));
const normName = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function generation(header) {
  const ks = header.map((h) => canonHeader(h.trim())).filter(Boolean);
  return {
    current: ks.some((k) => ["First Name", "Last Name", "Labels", "Organization Name"].includes(k)),
    legacy: ks.some((k) => ["Given Name", "Family Name", "Group Membership", "Additional Name"].includes(k)),
  };
}

export function validate(input) {
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line, title, detail });
  const { text, delim, parsed, rows } = prepare(input);
  const empty = { findings, summary: { rows: 0, contacts: 0, columns: 0, delimiter: delim, bytes: 0, withEmail: 0, duplicates: 0, list: [] } };
  if (!text.trim()) { add("error", 0, "The file is empty", "There is nothing to check."); return empty; }
  if (parsed.unterminated) add("error", parsed.unterminated, "A quoted cell is never closed", `A quote opened on line ${parsed.unterminated} has no closing quote, so everything after it reads as one cell. Usually a note or address containing a stray " mark.`);
  if (delim !== ",") add("warning", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, "Google Contacts expects commas. Excel in many locales saves CSV with semicolons because the comma is the decimal separator. Apply safe fixes rewrites it with commas.");
  if (/[ÃÂ]|â€/.test(text)) add("warning", 0, "Text looks mis-decoded", "Characters such as Ã or â€ usually mean a UTF-8 file was opened and saved in another encoding, so Müller turns into MÃ¼ller. Re-export as CSV UTF-8.");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > SIZE_LIMIT) add("warning", 0, `The file is ${(bytes / 1048576).toFixed(1)} MB`, "Google's help pages describe a size cap on an imported contacts file (about 3 MB when this was read; check the current figure). Split the file and import the parts one at a time.");

  const header = rows[0].cells.map((h) => h.trim());
  const { idx, dups } = columnMap(header);
  const gen = generation(header);
  const spelled = [];
  header.forEach((h, i) => {
    if (!h) { add("warning", rows[0].line, `Column ${i + 1} has no heading`, "Google ignores or rejects unnamed columns; delete it or name it."); return; }
    const want = canonHeader(h);
    if (want) { if (want !== h && !dups.some((d) => d.i === i)) spelled.push(`"${h}" → "${want}"`); return; }
    const near = closestColumn(h);
    add("warning", rows[0].line, `Unknown column "${h}"`, near ? `Looks like a typo of "${near}". Google skips columns it does not recognise, so this data would not be imported.` : "It is not a Google Contacts column, so Google skips it. Rename it to one that is (a Custom Field N - Label/Value pair keeps arbitrary data) or remove it.");
  });
  if (spelled.length) add("warning", rows[0].line, `${spelled.length} heading${spelled.length === 1 ? " differs" : "s differ"} from Google's spelling`, `${spelled.slice(0, 6).join(", ")}${spelled.length > 6 ? ", …" : ""}. Google matches headings by exact name; "Email 1 - Value" is read differently from "E-mail 1 - Value". Apply safe fixes restores the spelling.`);
  for (const d of dups) add("error", rows[0].line, `Column "${d.name}" appears twice`, "Only one of them can be read. Delete or rename the duplicate.");
  if (gen.current && gen.legacy) add("warning", rows[0].line, "Headings from two Google layouts are mixed", "The current export (First Name, Last Name, Labels) and the older one (Given Name, Family Name, Group Membership) are different formats. A file that mixes them is usually two exports pasted side by side; pick one layout.");
  const hasAny = ["E-mail", "Phone", "Organization"].some((g) => Object.keys(idx).some((k) => k.startsWith(`${g} `))) || ["First Name", "Last Name", "Name", "Given Name", "Family Name", "Organization Name"].some((n) => n in idx);
  if (!hasAny) add("error", rows[0].line, "No name, email, phone or organization column found", "Without at least one of these Google has nothing to build a contact from. A column called Email or Mobile needs renaming to E-mail 1 - Value or Phone 1 - Value.");
  const emailVals = groupCols(idx, "E-mail", "Value"), phoneVals = groupCols(idx, "Phone", "Value");
  for (const [g, part] of [["E-mail", "Value"], ["Phone", "Value"], ["Website", "Value"]]) {
    for (const k of groupCols(idx, g, part)) {
      const lab = k.replace(` - ${part}`, "");
      if (!(`${lab} - Label` in idx) && !(`${lab} - Type` in idx)) add("info", rows[0].line, `"${k}" has no label column`, `Google files each value under a label such as Home or Work. Without "${lab} - Label" the value is imported unlabelled.`);
    }
  }

  const data = rows.slice(1);
  const get = (r, name) => (name in idx && idx[name] < r.cells.length ? r.cells[idx[name]] : "");
  if (data.length === 0) add("error", 0, "There are no contacts", "The file has a header and nothing under it.");

  const emails = new Map(), rowSig = new Map(), nameKeys = new Map();
  const list = [];
  let withEmail = 0, dupRows = 0;

  for (const r of data) {
    const L = r.line;
    if (r.cells.length !== header.length) add("error", L, `This row has ${r.cells.length} cells, the header has ${header.length}`, "An unquoted comma inside a name, note or address shifts every later cell into the wrong column.");
    for (const c of r.cells) if (EXCEL_ERR.test(c.trim())) { add("error", L, `Spreadsheet error value ${c.trim()}`, "A formula failed before the file was saved. Replace it with the real value."); break; }

    const first = (get(r, "First Name") || get(r, "Given Name")).trim(), last = (get(r, "Last Name") || get(r, "Family Name")).trim();
    const org = (get(r, "Organization Name") || get(r, "Organization 1 - Name")).trim();
    const full = get(r, "Name").trim() || [first, last].filter(Boolean).join(" ");
    const display = full || org;
    const ems = emailVals.flatMap((k) => values(get(r, k)));
    const phs = phoneVals.flatMap((k) => values(get(r, k)));
    if (ems.length) withEmail++;
    list.push({ line: L, name: display, email: ems[0] || "", phone: phs[0] || "", city: get(r, "Address 1 - City").trim() });

    if (!display && !ems.length && !phs.length) {
      if (r.cells.some((c) => c.trim())) add("warning", L, "Contact has no name, email, phone or organization", "Google imports this as an empty contact or skips it. The row holds only other fields, so check the name columns were not misaligned.");
      else add("warning", L, "Row is blank", "Every cell is empty. Safe fixes removes it.");
    } else if (!display) add("info", L, "Contact has no name", "Google shows it under its email address or phone number, which is hard to find in a long list. Add a name if you can.");

    const sig = r.cells.map((c) => c.trim()).join("\u0001");
    if (rowSig.has(sig) && r.cells.some((c) => c.trim())) { dupRows++; add("warning", L, "Exact copy of an earlier row", `Identical to line ${rowSig.get(sig)}. Google imports both, giving you the same person twice. Safe fixes removes it.`); } else rowSig.set(sig, L);

    for (const n of ["First Name", "Last Name", "Name", "Given Name", "Family Name", "Organization Name"]) {
      const v = get(r, n);
      if (!v) continue;
      if (v !== v.trim()) add("warning", L, `${n} "${v}" has a stray space`, "Leading or trailing spaces sort the contact oddly and defeat Google's duplicate matching. Safe fixes trims it.");
      if (/^[=@]/.test(v.trim()) || /^[+-]\D/.test(v.trim())) add("warning", L, `${n} "${v.trim().slice(0, 30)}" starts with a formula character`, "A cell beginning with =, +, - or @ is treated as a formula by spreadsheets. Check it is a name and not damage.");
      if (EMAIL.test(v.trim())) add("warning", L, `${n} "${v.trim()}" is an email address`, "Probably the email column landed in the name column.");
    }

    for (const k of emailVals) for (const e of values(get(r, k))) {
      if (/^mailto:/i.test(e)) { add("warning", L, `Email "${e}" starts with mailto:`, "Google wants the bare address. Safe fixes removes the prefix."); const b = e.replace(/^mailto:/i, ""); if (EMAIL.test(b)) { const key = b.toLowerCase(); if (!emails.has(key)) emails.set(key, new Set()); emails.get(key).add(L); } continue; }
      if (/[,;]/.test(e) || (e.match(/@/g) || []).length > 1 || /\s/.test(e)) { add("error", L, `Email "${e}" holds more than one address or stray text`, `Several values in one cell must be separated by "${SEP.trim()}" (space, three colons, space), not commas or semicolons; otherwise Google reads one broken address.`); continue; }
      if (!EMAIL.test(e)) { add("warning", L, `Email "${e}" does not look like an address`, "A typo or a name in the email column; Google stores an address nothing can reach."); continue; }
      const key = e.toLowerCase();
      if (!emails.has(key)) emails.set(key, new Set());
      emails.get(key).add(L);
    }
    for (const k of phoneVals) for (const p of values(get(r, k))) {
      if (SCI.test(p)) { add("error", L, `Phone ${p} is scientific notation`, "Excel rewrote a long number as 1.23457E+11 and the digits are gone. Re-export from the source with the column as Text."); continue; }
      if (/^tel:/i.test(p)) add("warning", L, `Phone "${p}" starts with tel:`, "Google wants the bare number. Safe fixes removes the prefix.");
      if (/[A-Za-z]{3,}/.test(p.replace(/^tel:/i, "")) && !/\b(ext|x)\b/i.test(p)) add("warning", L, `Phone "${p}" contains letters`, "Notes written into the phone column are imported as the number.");
      const digits = p.replace(/\D/g, "");
      if (digits && digits.length < 5) add("info", L, `Phone "${p}" has only ${digits.length} digits`, "Too short to dial in most countries; check the cell was not truncated.");
      if (digits.length > 15) add("warning", L, `Phone "${p}" has ${digits.length} digits`, "Phone numbers are at most 15 digits, so this is probably two numbers run together or a pasted ID.");
      if (/^\d{9,10}$/.test(p) && !p.startsWith("0")) add("info", L, `Phone ${p} has no leading zero or country code`, "Excel drops a leading zero from a number-formatted cell. Check it against the source if it should start with 0 or +.");
    }
    for (const k of groupCols(idx, "Website", "Value")) for (const w of values(get(r, k))) if (/\s/.test(w) || !/\./.test(w)) add("warning", L, `Website "${w}" does not look like a web address`, "A name or note in the website column.");

    const bd = get(r, "Birthday").trim();
    if (bd) {
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bd), noYear = /^--(\d{2})-(\d{2})$/.exec(bd), us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(bd);
      const real = (y, m, d) => { const t = new Date(Date.UTC(y || 2000, m - 1, d)); return t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
      if (iso) { if (!real(+iso[1], +iso[2], +iso[3])) add("error", L, `Birthday ${bd} is not a real date`, "The month or day does not exist, so Google drops the birthday."); }
      else if (noYear) { if (!real(0, +noYear[1], +noYear[2])) add("error", L, `Birthday ${bd} is not a real date`, "The month or day does not exist, so Google drops the birthday."); }
      else if (us) add("warning", L, `Birthday ${bd} is not in year-month-day order`, "Google's own export writes YYYY-MM-DD. A month/day/year date can be read the wrong way round or ignored, and the tool cannot tell 03/04 from 04/03, so it is not rewritten.");
      else add("warning", L, `Birthday "${bd}" is not a recognised date format`, "Use YYYY-MM-DD (or --MM-DD when the year is unknown).");
    }
    const pc = get(r, "Address 1 - Postal Code").trim(), co = get(r, "Address 1 - Country").trim().toLowerCase();
    if (pc && /^\d{4}$/.test(pc) && /^(us|usa|united states|united states of america)$/.test(co)) add("warning", L, `Postal code ${pc} is four digits for a US address`, "A ZIP code that begins with 0 loses it when Excel treats the column as a number (Boston 02108 becomes 2108). Check the source.");
    if (pc && SCI.test(pc)) add("error", L, `Postal code ${pc} is scientific notation`, "Excel rewrote the code.");
    const notes = get(r, "Notes");
    if (notes && notes.length > 20000) add("warning", L, `Notes are ${notes.length} characters`, "Probably a pasted document or merged cells; very long notes may be cut off on import.");

    const nk = normName(full || "");
    if (nk) { const key = nk + "|" + (phs[0] || "").replace(/\D/g, "") + "|" + (ems[0] || "").toLowerCase(); if (!nameKeys.has(key)) nameKeys.set(key, []); nameKeys.get(key).push(L); }
  }

  let dupContacts = 0;
  for (const [, ls] of nameKeys) if (ls.length > 1) dupContacts += ls.length - 1;
  let shared = 0;
  for (const [e, set] of emails) if (set.size > 1) { shared++; if (shared <= 20) add("warning", [...set][1], `Email ${e} is on ${set.size} contacts`, `Lines ${[...set].join(", ")}. Google imports each as its own contact, so you end up with the same person twice until you run Merge & fix in Google Contacts. Merge the rows here first if they are one person.`); }
  if (shared > 20) add("info", 0, `${shared - 20} more shared email addresses`, "Only the first 20 are listed.");

  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  return { findings, summary: { rows: data.length, contacts: data.length, columns: header.length, delimiter: delim, bytes, withEmail, duplicates: dupRows + Math.max(0, dupContacts - dupRows), list } };
}

// ---------- repair ----------
// Changes only what has one reasonable reading. Never edits the letters of a name, a note, an
// address, an email's local part or a phone number's digits, and never merges two people.
export function repair(input) {
  const { delim, parsed, rows } = prepare(input);
  const changes = [];
  if (parsed.unterminated) return { text: "", changes, error: "A quoted cell is never closed, so the file cannot be rewritten safely." };
  if (!rows.length) return { text: "", changes, error: "The file is empty." };
  const header = rows[0].cells.map((h) => h.trim());
  const out = [header.map((h, i) => {
    const want = canonHeader(h);
    if (want && want !== h) { changes.push(`Heading "${rows[0].cells[i]}" → "${want}"`); return want; }
    if (want && want !== rows[0].cells[i]) changes.push(`Heading "${rows[0].cells[i]}" trimmed`);
    return want || h;
  })];
  const { idx } = columnMap(header);
  const emailCols = groupCols(idx, "E-mail", "Value"), phoneCols = groupCols(idx, "Phone", "Value");
  if (delim !== ",") changes.push(`Separator ${delim === ";" ? "semicolon" : "tab"} → comma`);
  const counts = {};
  const bump = (k, msg) => { counts[k] = counts[k] || { n: 0, msg }; counts[k].n++; };
  const seen = new Set();
  let removed = 0, blank = 0;
  for (const r of rows.slice(1)) {
    const cells = r.cells.slice();
    for (let i = 0; i < cells.length; i++) if (cells[i] !== cells[i].trim() && !/\n/.test(cells[i])) { cells[i] = cells[i].trim(); bump("trim", "stray spaces trimmed"); }
    for (const [cols, re, k, msg] of [[emailCols, /^mailto:/i, "mailto", "mailto: prefix removed"], [phoneCols, /^tel:/i, "tel", "tel: prefix removed"]]) {
      for (const c of cols) {
        const i = idx[c];
        if (i >= cells.length || !cells[i]) continue;
        const next = cells[i].split(":::").map((v) => v.trim().replace(re, "").trim()).join(SEP);
        if (next !== cells[i]) { cells[i] = next; bump(k, msg); }
      }
    }
    if (!cells.some((c) => c.trim())) { blank++; continue; }
    const sig = cells.join("\u0001");
    if (seen.has(sig)) { removed++; continue; }
    seen.add(sig);
    out.push(cells);
  }
  for (const c of Object.values(counts)) changes.push(`${c.msg} (${c.n} cell${c.n === 1 ? "" : "s"})`);
  if (removed) changes.push(`Exact duplicate rows removed (${removed})`);
  if (blank) changes.push(`Blank rows removed (${blank})`);
  return { text: toCsv(out, ","), changes, error: "" };
}

// Split a file into parts of at most `max` contacts, each with the heading row.
export function splitContacts(input, max = 1000) {
  const { rows, parsed } = prepare(input);
  if (parsed.unterminated || rows.length < 2) return { parts: [], error: "Nothing to split." };
  const size = Math.max(1, Math.floor(max));
  const header = rows[0].cells.map((h) => canonHeader(h.trim()) || h.trim());
  const data = rows.slice(1);
  const parts = [];
  for (let i = 0; i < data.length; i += size) {
    const p = data.slice(i, i + size);
    parts.push({ name: `google-contacts-part-${parts.length + 1}.csv`, contacts: p.length, text: toCsv([header, ...p.map((r) => r.cells)], ",") });
  }
  return { parts, error: "" };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.title, f.detail])]);
}

export function sampleFile() {
  return [
    "First Name,Last Name,Organization Name,Birthday,Labels,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Address 1 - City,Address 1 - Postal Code,Address 1 - Country",
    "Maya,Okafor,Harbour Coffee Roasters,1988-04-12,Suppliers,Work,maya@harbourcoffee.example,Mobile,+44 7700 900123,Bristol,BS1 4RR,United Kingdom",
    "Tom,Brightside,Brightside Dental,,Clients ::: Friends,Work,office@brightside.example ::: tom@brightside.example,Work,0113 496 0456,Leeds,LS1 5AB,United Kingdom",
    "Priya,Nair,,--09-30,,Home,priya.nair@mail.example,,,York,YO1 6GA,United Kingdom",
    "",
  ].join("\n");
}

export function sampleBrokenFile() {
  return [
    "First Name;Last Name;Email 1 - Value;Phone 1 - Value;Birthday;Address 1 - City;Address 1 - Postal Code;Address 1 - Country;Phonee 1 - Label",
    "Maya;Okafor;maya@harbourcoffee.example;4.41175E+11;12/04/1988;Bristol;BS1 4RR;United Kingdom;Mobile",
    "Maya ;Okafor;mailto:maya@harbourcoffee.example;07700 900123;1988-04-12;Bristol;BS1 4RR;United Kingdom;",
    "Tom;Brightside;office@brightside, tom@brightside.example;tel:0113 496 0456;1990-02-30;Leeds;LS1 5AB;United Kingdom;",
    "Tom;Brightside;office@brightside, tom@brightside.example;tel:0113 496 0456;1990-02-30;Leeds;LS1 5AB;United Kingdom;",
    ";;;;;;;;",
    "Sam;Rivera;sam@bostonbakery.example;617 555 0100;;Boston;2108;USA;",
    "",
  ].join("\n");
}
