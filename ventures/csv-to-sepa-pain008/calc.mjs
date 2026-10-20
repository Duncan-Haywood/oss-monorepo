// CSV to SEPA direct debit (pain.008) converter. Pure functions, no DOM, no network, no dependencies.
// Amounts are integer cents (BigInt); no floating point touches a sum. The converter refuses to write a file while any
// collection has an error, so a half-correct batch never reaches the bank. One payment block is written per sequence
// type (FRST, RCUR, OOFF, FNAL) because the scheme requires every collection in a block to share it.

export const VERSIONS = {
  "pain.008.001.02": { bic: "BIC" },
};
export const IBAN_LENGTHS = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22,
  GI: 23, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18,
  NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};

const ALLOWED = new Set([..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-?:().,'+ "]);
const SPECIAL = {
  "ä": "ae", "ö": "oe", "ü": "ue", "Ä": "AE", "Ö": "OE", "Ü": "UE", "ß": "ss", "æ": "ae", "Æ": "AE", "ø": "oe", "Ø": "OE",
  "œ": "oe", "ł": "l", "Ł": "L", "&": "+", "@": "(at)", "_": "-", ";": ",", "=": "-", "*": ".", "!": ".", "#": " ", "%": " ",
  "€": "EUR", "£": "GBP", "$": "USD", "’": "'", "‘": "'", "“": "'", "”": "'", '"': "'", "–": "-", "—": "-", "…": "...",
  "\t": " ", "\n": " ", "\r": " ", "[": "(", "]": ")", "{": "(", "}": ")", "|": "/", "\\": "/", "<": "(", ">": ")",
};
function transliterateChar(ch) {
  if (ALLOWED.has(ch)) return ch;
  if (SPECIAL[ch] !== undefined) return SPECIAL[ch];
  const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return base && [...base].every((c) => ALLOWED.has(c)) ? base : ".";
}
export const transliterate = (s) => [...String(s)].map(transliterateChar).join("");
export const xmlEscape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function mod97(iban) {
  let rem = 0;
  for (const ch of iban.slice(4) + iban.slice(0, 4)) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem;
}
// Returns { ok, iban, problem }. Spaces, hyphens and case are cleaned; nothing else is guessed.
export function checkIban(raw) {
  const iban = String(raw ?? "").replace(/[\s -]/g, "").toUpperCase();
  if (!iban) return { ok: false, iban, problem: "is empty" };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return { ok: false, iban, problem: "is not shaped like an IBAN (two letters, two digits, then the account)" };
  const want = IBAN_LENGTHS[iban.slice(0, 2)];
  if (!want) return { ok: false, iban, problem: `starts with ${iban.slice(0, 2)}, which is not a country this tool knows to be in the SEPA area` };
  if (iban.length !== want) return { ok: false, iban, problem: `has ${iban.length} characters; ${iban.slice(0, 2)} IBANs have ${want}` };
  if (mod97(iban) !== 1) return { ok: false, iban, problem: "fails the check-digit test (a character is wrong or two neighbours are swapped)" };
  return { ok: true, iban };
}
export function checkBic(raw) {
  const bic = String(raw ?? "").replace(/\s/g, "").toUpperCase();
  if (!bic) return { ok: true, bic: "" };
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic) ? { ok: true, bic } : { ok: false, bic };
}

// Amount text to integer cents. Accepts 1200, 1200.5, 1,200.50, 1.200,50 and 1200,50; refuses anything ambiguous.
export function parseCents(raw) {
  let s = String(raw ?? "").trim().replace(/^(EUR|€)\s*|\s*(EUR|€)$/gi, "").replace(/[\s ']/g, "");
  if (s === "") return { ok: false, problem: "is empty" };
  if (s.startsWith("-")) return { ok: false, problem: "is negative; a collection must be a positive amount" };
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let dec = "";
  if (lastDot >= 0 && lastComma >= 0) {
    dec = lastDot > lastComma ? "." : ",";
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    if (parts.length === 2 && tail.length <= 2) dec = sep;
    else if (parts.length === 2 && tail.length === 3 && parts[0].length <= 3 && parts[0].length >= 1) return { ok: false, problem: `is ambiguous: ${parts[0]}${sep}${tail} could be ${parts[0]}${tail} with a thousands separator, but euros have only two decimals. Write it with two decimals, for example ${parts[0]}${tail}.00` };
    else if (parts.length > 2 && parts.slice(1).every((p) => p.length === 3)) dec = "";
    else return { ok: false, problem: "is not a clear number" };
  }
  const grp = dec === "." ? "," : dec === "," ? "." : /[.,]/.test(s) ? s.match(/[.,]/)[0] : "";
  const body = (grp ? s.split(grp).join("") : s).replace(dec && dec !== "." ? dec : "\0", ".");
  if (!/^\d*\.?\d*$/.test(body) || !/\d/.test(body)) return { ok: false, problem: "is not a number" };
  const [w, f = ""] = body.split(".");
  if (f.length > 2) return { ok: false, problem: "has more than two decimals; euro payments are whole cents" };
  const cents = BigInt(w || "0") * 100n + BigInt((f + "00").slice(0, 2));
  if (cents === 0n) return { ok: false, problem: "is zero" };
  if (cents > 99999999999n) return { ok: false, problem: "is above the 999,999,999.99 limit of the format" };
  return { ok: true, cents };
}
export const formatCents = (c) => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  return new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");
}

export function parseTable(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const ranked = [",", "\t", ";", "|"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1]);
  const delim = ranked[0][1] > 1 ? ranked[0][0] : ",";
  const rows = [];
  let row = [], cell = "", q = false, line = 1, rowLine = 1;
  const end = () => { row.push(cell); cell = ""; if (row.some((c) => c.trim() !== "")) rows.push({ cells: row, line: rowLine }); row = []; rowLine = line + 1; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else { if (c === "\n") line++; cell += c; }
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n") { end(); line++; rowLine = line; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) end();
  return { delim, rows };
}

// SEPA creditor identifier (ISO 7064 mod 97-10 over everything but the three-character business code).
export function checkCreditorId(raw) {
  const id = String(raw ?? "").replace(/\s/g, "").toUpperCase();
  if (!id) return { ok: false, id, problem: "is empty" };
  if (id.length > 35) return { ok: false, id, problem: "is longer than the 35 characters the format allows" };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9+?/:().,'-]+$/.test(id)) return { ok: false, id, problem: "is not shaped like a SEPA creditor identifier (two letters, two check digits, a three-character business code such as ZZZ, then your national number)" };
  if (!IBAN_LENGTHS[id.slice(0, 2)]) return { ok: false, id, problem: `starts with ${id.slice(0, 2)}, which is not a country this tool knows to be in the SEPA area` };
  const alnum = id.replace(/[^A-Z0-9]/g, "");
  if (mod97(alnum.slice(0, 4) + alnum.slice(7)) !== 1) return { ok: false, id, problem: "fails its check-digit test; compare it character by character with the letter your national creditor-identifier issuer sent" };
  return { ok: true, id };
}

const COLS = [
  ["id", /end.?to.?end|^id$|^ref(erence)? ?(id|no)|^e2e/i],
  ["signed", /sign|mandate.?date|mandat.*datum|datum|dtofsgntr/i],
  ["mandate", /mandate|mandat|^umr$/i],
  ["seq", /seq|folge|^frst$|^type$|^step$/i],
  ["iban", /iban|bank ?account|account ?(no|number)|konto/i],
  ["bic", /bic|swift/i],
  ["amount", /amount|sum|total|betrag|^eur$/i],
  ["reference", /reference|description|remittance|purpose|memo|invoice|verwendung|note/i],
  ["name", /debtor|payer|customer|member|client|tenant|^name$|zahler|kunde|name/i],
];
export function mapColumns(rows) {
  const head = rows[0]?.cells.map((c) => c.trim()) ?? [];
  const map = {};
  const used = new Set();
  for (const [f, re] of COLS) {
    const i = head.findIndex((h, k) => !used.has(k) && re.test(h));
    if (i >= 0) { map[f] = i; used.add(i); }
  }
  const hasHeader = map.iban !== undefined || map.amount !== undefined || map.mandate !== undefined;
  return { map, hasHeader };
}

const SEQ_WORDS = { FRST: "FRST", FIRST: "FRST", RCUR: "RCUR", RECURRING: "RCUR", RECURRENT: "RCUR", OOFF: "OOFF", "ONE-OFF": "OOFF", ONEOFF: "OOFF", "ONE OFF": "OOFF", ONCE: "OOFF", FNAL: "FNAL", FINAL: "FNAL", LAST: "FNAL" };
export const SEQ_ORDER = ["FRST", "RCUR", "OOFF", "FNAL"];

function mkDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}
// ISO, 26.10.2026 and 26/10/2026 are read. A slash date whose day and month could swap is refused, not guessed.
export function parseDate(raw) {
  const s = String(raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) { const d = mkDate(+m[1], +m[2], +m[3]); return d ? { ok: true, date: d } : { ok: false, problem: "is not a real calendar date" }; }
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) { const d = mkDate(+m[3], +m[2], +m[1]); return d ? { ok: true, date: d } : { ok: false, problem: "is not a real calendar date" }; }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a <= 12 && b <= 12 && a !== b) return { ok: false, problem: `is ambiguous: ${s} could be day/month or month/day. Write it as YYYY-MM-DD` };
    const d = a > 12 ? mkDate(+m[3], b, a) : mkDate(+m[3], a, b);
    return d ? { ok: true, date: d } : { ok: false, problem: "is not a real calendar date" };
  }
  return { ok: false, problem: s ? "is not a date this tool reads; write it as YYYY-MM-DD" : "is empty" };
}
export const isoDate = (d) => d.toISOString().slice(0, 10);
const isWeekend = (d) => [0, 6].includes(d.getUTCDay());
function nextBusinessDay(d) {
  const n = new Date(d.getTime() + 864e5);
  while (isWeekend(n)) n.setTime(n.getTime() + 864e5);
  return n;
}

const SENTINEL = { name: "Debtor name", iban: "IBAN", amount: "Amount", mandate: "Mandate ID", signed: "Mandate date" };
const COL_HINT = { name: "Name", iban: "IBAN", amount: "Amount", mandate: "Mandate ID", signed: "Mandate date" };

// Converts the CSV text to a pain.008 file. `settings`: creditorName, creditorIban, creditorBic, creditorId,
// date (collection date, YYYY-MM-DD), scheme (CORE | B2B), defaultSeq, version, msgId, created (ISO local time, no zone),
// batchBooking, today (Date, UTC midnight). Returns { xml, findings, summary, collections }.
export function convert(text, settings = {}) {
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line: line || null, title, detail });
  const version = settings.version || "pain.008.001.02";
  const v = VERSIONS[version];
  if (!v) throw new Error(`Unknown version ${version}`);
  const scheme = settings.scheme === "B2B" ? "B2B" : "CORE";
  const defaultSeq = SEQ_ORDER.includes(settings.defaultSeq) ? settings.defaultSeq : "RCUR";

  // --- settings (the creditor: you)
  const cName = transliterate(String(settings.creditorName ?? "").trim()).replace(/\s+/g, " ").slice(0, 70);
  if (!cName) add("error", null, "Your name is missing", "Enter the name of the collecting business; the debtor's bank prints it on their statement.");
  else if (cName !== String(settings.creditorName).trim().replace(/\s+/g, " ")) add("warning", null, "Your name was adjusted to the SEPA character set", `Written as "${cName}".`);
  const cIban = checkIban(settings.creditorIban);
  if (!cIban.ok) add("error", null, "Your collection IBAN does not pass", `The IBAN ${cIban.problem}.`);
  const cBic = checkBic(settings.creditorBic);
  if (!cBic.ok) add("error", null, "Your BIC is not valid", "A BIC is 8 or 11 letters and digits (for example COBADEFFXXX). Leave it blank if your bank allows that.");
  const cid = checkCreditorId(settings.creditorId);
  if (!cid.ok) add("error", null, "Your creditor identifier does not pass", `The creditor identifier ${cid.problem}.`);
  const dateP = parseDate(settings.date);
  const due = dateP.ok ? dateP.date : null;
  if (!due) add("error", null, "Collection date missing", "Enter the date as YYYY-MM-DD, the day the money should leave the debtors' accounts.");
  else if (isWeekend(due)) add("warning", null, "Collection date is a weekend", "Direct debits settle on TARGET business days. Your bank will move this to the next one, or reject the file.");
  const today = settings.today ? new Date(Date.UTC(settings.today.getUTCFullYear(), settings.today.getUTCMonth(), settings.today.getUTCDate())) : null;
  if (due && today) {
    if (due <= today) add("error", null, "Collection date is today or in the past", "The scheme needs the file to reach your bank before the collection date. Pick a later business day.");
    else if (isoDate(due) === isoDate(nextBusinessDay(today))) add("warning", null, "Collection date is the very next business day", "The scheme allows one business day, but most banks set an earlier cut-off for file uploads. Check yours, or choose a date a few days out.");
  }
  if (scheme === "B2B") add("warning", null, "Business-to-business scheme selected", "B2B collections work only on business debtors' accounts, and each debtor must have given their own bank a copy of the mandate beforehand. If the debtors are consumers, use CORE.");
  const created = settings.created || new Date().toISOString().slice(0, 19);
  const msgId = transliterate(String(settings.msgId || `DD-${created.replace(/\D/g, "").slice(0, 14)}`)).slice(0, 35);

  // --- the table
  const table = parseTable(text);
  const { map, hasHeader } = mapColumns(table.rows);
  const rows = hasHeader ? table.rows.slice(1) : table.rows;
  if (hasHeader) {
    for (const f of ["name", "iban", "amount", "mandate", "signed"]) {
      if (map[f] === undefined) add("error", table.rows[0]?.line, `No "${SENTINEL[f]}" column found`, `Name a header ${COL_HINT[f]}, or use the order Name, IBAN, Amount, Mandate ID, Mandate date, Reference, Sequence with no header row. A direct debit cannot be written without a signed mandate for each debtor.`);
    }
  } else Object.assign(map, { name: 0, iban: 1, amount: 2, mandate: 3, signed: 4, reference: 5, seq: 6 });
  if (!rows.length) add("error", null, "No collections found", "The file has no rows below the header.");

  const items = [];
  const seenKey = new Map();
  const seenMandate = new Map();
  const cell = (r, f) => (map[f] === undefined ? "" : String(r.cells[map[f]] ?? "").trim());
  rows.forEach((r, idx) => {
    const line = r.line;
    const p = { line, ok: true };
    const rawName = cell(r, "name");
    p.name = transliterate(rawName).replace(/\s+/g, " ").trim();
    if (!p.name) { add("error", line, "Debtor name is empty", "Every collection needs the name of the account holder who signed the mandate."); p.ok = false; }
    else {
      if (p.name !== rawName.replace(/\s+/g, " ").trim()) add("warning", line, "Debtor name adjusted to the SEPA character set", `"${rawName}" is sent as "${p.name}".`);
      if (p.name.length > 70) { add("warning", line, "Debtor name cut to 70 characters", `"${p.name}" is too long for the field.`); p.name = p.name.slice(0, 70); }
    }
    const who = p.name || "this row";
    const ib = checkIban(cell(r, "iban"));
    if (!ib.ok) { add("error", line, `IBAN for ${who} does not pass`, `The IBAN ${ib.problem}.`); p.ok = false; }
    p.iban = ib.iban;
    const am = parseCents(cell(r, "amount"));
    if (!am.ok) { add("error", line, `Amount for ${who} does not pass`, `"${cell(r, "amount")}" ${am.problem}.`); p.ok = false; }
    else p.cents = am.cents;
    const bic = checkBic(cell(r, "bic"));
    if (!bic.ok) { add("error", line, `BIC for ${who} is not valid`, "A BIC is 8 or 11 letters and digits. Leave the cell blank if it is not needed: SEPA collections are routed by the IBAN alone."); p.ok = false; }
    p.bic = bic.bic;

    const rawMandate = cell(r, "mandate");
    if (!rawMandate) { add("error", line, `Mandate ID for ${who} is empty`, "Every collection quotes the unique mandate reference the debtor signed. Without one the debtor's bank returns it."); p.ok = false; }
    else if ([...rawMandate].some((c) => !ALLOWED.has(c))) { add("error", line, `Mandate ID for ${who} has characters SEPA does not allow`, `"${rawMandate}" must be quoted exactly as signed, so it is not changed for you. Letters, digits and / - ? : ( ) . , ' + are allowed.`); p.ok = false; }
    else if (rawMandate.length > 35) { add("error", line, `Mandate ID for ${who} is longer than 35 characters`, "The format holds at most 35. A mandate reference longer than that cannot be collected on."); p.ok = false; }
    p.mandate = rawMandate;
    const sg = parseDate(cell(r, "signed"));
    if (!sg.ok) { add("error", line, `Mandate date for ${who} does not pass`, `"${cell(r, "signed")}" ${sg.problem}.`); p.ok = false; }
    else {
      p.signed = isoDate(sg.date);
      if (today && sg.date > today) { add("error", line, `Mandate date for ${who} is in the future`, "A mandate must be signed before the first collection."); p.ok = false; }
      else if (due && sg.date > due) { add("error", line, `Mandate date for ${who} is after the collection date`, "The mandate has to exist before you collect on it."); p.ok = false; }
      else if (due && (due.getTime() - sg.date.getTime()) / 864e5 > 36 * 30.44) add("warning", line, `Mandate for ${who} is over 36 months old`, "A mandate lapses if no collection was made on it for 36 months. If this one has been idle that long, get a new signature before collecting.");
    }

    const rawSeq = cell(r, "seq");
    const seqKey = rawSeq.toUpperCase().replace(/\s+/g, " ");
    if (!rawSeq) p.seq = defaultSeq;
    else if (SEQ_WORDS[seqKey]) p.seq = SEQ_WORDS[seqKey];
    else { add("error", line, `Sequence type for ${who} is not recognised`, `"${rawSeq}" is not FRST, RCUR, OOFF or FNAL. Leave it blank to use "${defaultSeq}".`); p.ok = false; }

    const rawRef = cell(r, "reference");
    p.ref = transliterate(rawRef).replace(/\s+/g, " ").trim();
    if (p.ref !== rawRef.replace(/\s+/g, " ").trim()) add("warning", line, "Reference adjusted to the SEPA character set", `"${rawRef}" is sent as "${p.ref}".`);
    if (p.ref.length > 140) { add("warning", line, "Reference cut to 140 characters", "The remittance field holds at most 140 characters."); p.ref = p.ref.slice(0, 140); }
    const rawId = cell(r, "id");
    p.e2e = transliterate(rawId || `C${String(idx + 1).padStart(4, "0")}`).replace(/\s+/g, "").slice(0, 35) || `C${String(idx + 1).padStart(4, "0")}`;

    if (p.ok) {
      const key = `${p.mandate}|${p.cents}|${p.ref}`;
      if (seenKey.has(key)) add("warning", line, "Possible duplicate collection", `Same mandate, amount and reference as line ${seenKey.get(key)}. Collecting twice on one mandate is the commonest cause of disputed debits; remove one if it was not meant.`);
      else seenKey.set(key, line);
      const prev = seenMandate.get(p.mandate);
      if (prev && prev.iban !== p.iban) add("error", line, `Mandate ${p.mandate} is used with two different IBANs`, `Line ${prev.line} has ${prev.iban}. One mandate belongs to one debtor account; if the debtor changed bank, that is an amendment and goes through your bank's process.`), p.ok = false;
      else if (prev && prev.seq === "FRST" && p.seq === "FRST") add("warning", line, `Mandate ${p.mandate} is marked first (FRST) twice`, `Line ${prev.line} already collects on it as FRST. Only one collection per mandate is the first.`);
      else if (!prev) seenMandate.set(p.mandate, { line, iban: p.iban, seq: p.seq });
    }
    items.push(p);
  });
  const ids = new Map();
  for (const p of items) {
    if (ids.has(p.e2e)) { add("error", p.line, "Collection ID used twice", `"${p.e2e}" already identifies line ${ids.get(p.e2e)}. End-to-end ids must be unique in the file.`); p.ok = false; }
    else ids.set(p.e2e, p.line);
  }
  if (cIban.ok && items.some((p) => p.iban === cIban.iban)) add("warning", null, "A debtor IBAN is your own collection IBAN", "Collecting from the account the money lands in is usually a copy-paste slip.");

  const errors = findings.filter((f) => f.severity === "error").length;
  const good = items.filter((p) => p.ok);
  const total = good.reduce((s, p) => s + p.cents, 0n);
  const groups = SEQ_ORDER.map((seq) => ({ seq, items: good.filter((p) => p.seq === seq) })).filter((g) => g.items.length);
  const summary = { rows: items.length, collections: good.length, errors, warnings: findings.length - errors, total: formatCents(total), blocks: groups.length, scheme, version };
  let xml = null;
  if (!errors && good.length) xml = buildXml({ v, msgId, created, date: isoDate(due), creditorName: cName, creditorIban: cIban.iban, creditorBic: cBic.bic, creditorId: cid.id, scheme, batch: settings.batchBooking !== false, groups });
  return { xml, findings, summary, collections: items };
}

export function buildXml({ v, msgId, created, date, creditorName, creditorIban, creditorBic, creditorId, scheme, batch, groups }) {
  const all = groups.flatMap((g) => g.items);
  const e = xmlEscape;
  const sum = (list) => formatCents(list.reduce((s, p) => s + p.cents, 0n));
  const agent = (tag, bic) => `<${tag}><FinInstnId>${bic ? `<${v.bic}>${bic}</${v.bic}>` : `<Othr><Id>NOTPROVIDED</Id></Othr>`}</FinInstnId></${tag}>`;
  let out = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${e(msgId)}</MsgId>
      <CreDtTm>${created}</CreDtTm>
      <NbOfTxs>${all.length}</NbOfTxs>
      <CtrlSum>${sum(all)}</CtrlSum>
      <InitgPty><Nm>${e(creditorName)}</Nm></InitgPty>
    </GrpHdr>
`;
  groups.forEach((g, gi) => {
    out += `    <PmtInf>
      <PmtInfId>${e(msgId)}-${gi + 1}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>${batch ? "true" : "false"}</BtchBookg>
      <NbOfTxs>${g.items.length}</NbOfTxs>
      <CtrlSum>${sum(g.items)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>${scheme}</Cd></LclInstrm><SeqTp>${g.seq}</SeqTp></PmtTpInf>
      <ReqdColltnDt>${date}</ReqdColltnDt>
      <Cdtr><Nm>${e(creditorName)}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${creditorIban}</IBAN></Id></CdtrAcct>
      ${agent("CdtrAgt", creditorBic)}
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>${e(creditorId)}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
`;
    for (const p of g.items) {
      out += `      <DrctDbtTxInf>
        <PmtId><EndToEndId>${e(p.e2e)}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${formatCents(p.cents)}</InstdAmt>
        <DrctDbtTx><MndtRltdInf><MndtId>${e(p.mandate)}</MndtId><DtOfSgntr>${p.signed}</DtOfSgntr></MndtRltdInf></DrctDbtTx>
        ${agent("DbtrAgt", p.bic)}
        <Dbtr><Nm>${e(p.name)}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${p.iban}</IBAN></Id></DbtrAcct>
        ${p.ref ? `<RmtInf><Ustrd>${e(p.ref)}</Ustrd></RmtInf>` : ""}
      </DrctDbtTxInf>
`;
    }
    out += `    </PmtInf>\n`;
  });
  return out.replace(/^ +\n/gm, "") + `  </CstmrDrctDbtInitn>\n</Document>\n`;
}

export function findingsCsv(result) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  return ["severity,line,title,detail", ...result.findings.map((f) => [f.severity, f.line ?? "", q(f.title), q(f.detail)].join(","))].join("\n") + "\n";
}

export const sampleFile = () => "name,iban,amount,mandate id,mandate date,reference,sequence\nJan de Vries,NL91ABNA0417164300,29.90,MAND-0001,2025-03-14,Membership October,RCUR\nMaria Garcia,ES9121000418450200051332,\"29,90\",MAND-0002,2026-10-01,Membership October,FRST\nHans Meier,DE89 3704 0044 0532 0130 00,\"1.250,00\",MAND-0003,2024-01-09,Rent November,\n";
export const sampleBrokenFile = () => "name,iban,amount,mandate id,mandate date,reference,sequence\nJan de Vries,NL91ABNA0417164300,29.90,MAND-0001,2025-03-14,Membership October,RCUR\nMaria Garcia,ES9121000418450200051332,29.905,MAND-0002,2026-10-01,Membership October,FRST\nHans Meier,DE89 3704 0044 0532 0130 01,1.250,MAND-0003,2024-01-09,Rent November,RCUR\nAnna Rossi,IT60X0542811101000000123456,15.00,,2025-05-02,Membership October,RCUR\nPeter Kim,FR1420041010050500013M02606,15.00,MAND-0005,03/04/2025,Membership October,RCUR\nJan de Vries,NL91ABNA0417164300,29.90,MAND-0001,2025-03-14,Membership October,RCUR\nLee Wong,BE68539007547034,12.00,MAND-0006,2025-06-01,Membership October,SOMETIMES\n";
