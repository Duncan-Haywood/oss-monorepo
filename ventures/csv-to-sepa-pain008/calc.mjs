// CSV to SEPA direct debit (pain.008) converter. Pure functions, no DOM, no network, no dependencies.
// Amounts are integer cents (BigInt). The converter refuses to write a file while any collection has an error, so a
// half-correct batch never reaches the bank.

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
  if (s.startsWith("-")) return { ok: false, problem: "is negative; a collection must be a positive amount (refunds are not made with a direct debit file)" };
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


// Creditor identifier (ISO 7064 mod 97-10): country, two check digits, a three-character business code that is left out
// of the check, then the national identifier. DE98ZZZ09999999999 is the Bundesbank's published example.
export function checkCreditorId(raw) {
  const id = String(raw ?? "").replace(/\s/g, "").toUpperCase();
  if (!id) return { ok: false, id, problem: "is empty" };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9+?/:().,'-]{1,28}$/.test(id)) return { ok: false, id, problem: "is not shaped like a creditor identifier (two letters, two check digits, a three-character business code, then your national number, 35 characters at most)" };
  if (id.length > 35) return { ok: false, id, problem: "is longer than 35 characters" };
  const rearranged = id.slice(7) + id.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    if (!/[A-Z0-9]/.test(ch)) continue;
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  if (rem !== 1) return { ok: false, id, problem: "fails the check-digit test, so a character is wrong or it was typed from memory. Copy it from the letter your national authority sent (in Germany the Bundesbank, in the Netherlands your bank)" };
  return { ok: true, id };
}

const COLS = [
  ["id", /end.?to.?end|^id$|^ref(erence)? ?(id|no)|^e2e/i],
  ["mandate", /mandat|umr|unique ?mandate/i],
  ["signed", /sign|unterschr|mandate ?date|date of|mandatsdatum/i],
  ["seq", /seq|sequence|folge|first|recurring/i],
  ["iban", /iban|bank ?account|account ?(no|number)|konto/i],
  ["bic", /bic|swift/i],
  ["amount", /amount|sum|total|betrag|^collect$|^eur$/i],
  ["reference", /reference|description|remittance|purpose|memo|invoice|verwendung|note/i],
  ["name", /debtor|customer|payer|member|client|name|zahler|kunde/i],
];
// Maps each field to a column index by header text; returns { map, hasHeader }.
export function mapColumns(rows) {
  const head = rows[0]?.cells.map((c) => c.trim()) ?? [];
  const map = {};
  const used = new Set();
  for (const [f, re] of COLS) {
    const i = head.findIndex((h, k) => !used.has(k) && re.test(h));
    if (i >= 0) { map[f] = i; used.add(i); }
  }
  const hasHeader = map.iban !== undefined || map.amount !== undefined || map.name !== undefined;
  return { map, hasHeader };
}

const FIELD_LABEL = { name: "Debtor name", iban: "IBAN", amount: "Amount", mandate: "Mandate id", signed: "Mandate date" };
export const SEQUENCES = ["FRST", "RCUR", "FNAL", "OOFF"];
const SEQ_WORDS = { FIRST: "FRST", FRST: "FRST", RCUR: "RCUR", RECURRING: "RCUR", REPEAT: "RCUR", FNAL: "FNAL", FINAL: "FNAL", LAST: "FNAL", OOFF: "OOFF", ONEOFF: "OOFF", "ONE-OFF": "OOFF", ONCE: "OOFF", SINGLE: "OOFF" };

function normaliseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim()) || (() => {
    const t = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(String(s).trim());
    return t ? [null, t[3], t[2], t[1]] : null;
  })();
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}
export const isoDate = (d) => d.toISOString().slice(0, 10);

// Converts the CSV text to a pain.008 file. `settings`: creditorName, creditorId, creditorIban, creditorBic, date
// (collection date, YYYY-MM-DD), scheme (CORE | B2B), defaultSeq, version, msgId, created (ISO local time, no zone),
// today (a Date at UTC midnight). Returns { xml, findings, summary, payments }. One payment block is written per
// sequence type, as banks require.
export function convert(text, settings = {}) {
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line: line || null, title, detail });
  const version = settings.version || "pain.008.001.02";
  const v = VERSIONS[version];
  if (!v) throw new Error(`Unknown version ${version}`);
  const scheme = settings.scheme === "B2B" ? "B2B" : "CORE";
  const defaultSeq = SEQUENCES.includes(settings.defaultSeq) ? settings.defaultSeq : "RCUR";

  // --- settings (the creditor, i.e. you)
  const creditorName = transliterate(String(settings.creditorName ?? "").trim()).slice(0, 70);
  if (!creditorName) add("error", null, "Your name is missing", "Enter the name of the business that collects the money; the debtor sees it on their statement.");
  else if (creditorName !== String(settings.creditorName).trim()) add("warning", null, "Your name was adjusted to the SEPA character set", `Written as "${creditorName}".`);
  const cid = checkCreditorId(settings.creditorId);
  if (!cid.ok) add("error", null, "Your creditor identifier does not pass", `The creditor identifier ${cid.problem}.`);
  const cIban = checkIban(settings.creditorIban);
  if (!cIban.ok) add("error", null, "Your account IBAN does not pass", `The IBAN ${cIban.problem}.`);
  const cBic = checkBic(settings.creditorBic);
  if (!cBic.ok) add("error", null, "Your BIC is not valid", "A BIC is 8 or 11 letters and digits (for example COBADEFFXXX). Leave it blank if your bank allows that.");
  const date = normaliseDate(settings.date);
  if (!date) add("error", null, "Collection date missing", "Enter the date as YYYY-MM-DD, the day the money should be taken from the debtors' accounts.");
  else if ([0, 6].includes(date.getUTCDay())) add("warning", null, "Collection date is a weekend", "Direct debits settle on TARGET business days. Your bank will move this to the next one, or reject the file.");
  const today = settings.today ? new Date(Date.UTC(settings.today.getUTCFullYear(), settings.today.getUTCMonth(), settings.today.getUTCDate())) : null;
  if (date && today) {
    if (date <= today) add("error", null, "Collection date is today or in the past", "Banks need the file before the collection date: one business day for CORE and B2B in most banks, often more for the cut-off. Pick a later business day.");
    else if ((date - today) / 864e5 > 365) add("warning", null, "Collection date is more than a year away", "Most banks reject far-future dates. Check it is not a typo.");
  }
  const created = settings.created || new Date().toISOString().slice(0, 19);
  const msgId = transliterate(String(settings.msgId || `MSG-${created.replace(/\D/g, "").slice(0, 14)}`)).slice(0, 35);

  // --- the table
  const table = parseTable(text);
  const { map, hasHeader } = mapColumns(table.rows);
  const rows = hasHeader ? table.rows.slice(1) : table.rows;
  if (hasHeader) {
    for (const f of ["name", "iban", "amount", "mandate", "signed"]) {
      if (map[f] === undefined) add("error", table.rows[0]?.line, `No "${FIELD_LABEL[f]}" column found`, `A direct debit needs a mandate. Name a header ${f === "name" ? "Debtor or Name" : f === "iban" ? "IBAN" : f === "amount" ? "Amount" : f === "mandate" ? "Mandate or UMR" : "Mandate date or Signed"}, or use the order Name, IBAN, Amount, Mandate id, Mandate date, Reference, Sequence with no header row.`);
    }
  } else {
    Object.assign(map, { name: 0, iban: 1, amount: 2, mandate: 3, signed: 4, reference: 5, seq: 6 });
  }
  if (!rows.length) add("error", null, "No collections found", "The file has no rows below the header.");

  const payments = [];
  const seenKey = new Map();
  const cell = (r, f) => (map[f] === undefined ? "" : String(r.cells[map[f]] ?? "").trim());
  rows.forEach((r, idx) => {
    const line = r.line;
    const p = { line, ok: true };
    const rawName = cell(r, "name");
    p.name = transliterate(rawName).replace(/\s+/g, " ").trim();
    if (!p.name) { add("error", line, "Debtor name is empty", "Every direct debit needs the name of the account holder who signed the mandate."); p.ok = false; }
    else {
      if (p.name !== rawName.replace(/\s+/g, " ").trim()) add("warning", line, "Debtor name adjusted to the SEPA character set", `"${rawName}" is sent as "${p.name}".`);
      if (p.name.length > 70) { add("warning", line, "Debtor name cut to 70 characters", `"${p.name}" is too long for the field.`); p.name = p.name.slice(0, 70); }
    }
    const ib = checkIban(cell(r, "iban"));
    if (!ib.ok) { add("error", line, `IBAN for ${p.name || "this row"} does not pass`, `The IBAN ${ib.problem}.`); p.ok = false; }
    p.iban = ib.iban;
    const am = parseCents(cell(r, "amount"));
    if (!am.ok) { add("error", line, `Amount for ${p.name || "this row"} does not pass`, `"${cell(r, "amount")}" ${am.problem}.`); p.ok = false; }
    else p.cents = am.cents;
    const bic = checkBic(cell(r, "bic"));
    if (!bic.ok) { add("error", line, `BIC for ${p.name || "this row"} is not valid`, "A BIC is 8 or 11 letters and digits. Leave the cell blank: SEPA collections are routed by the IBAN alone."); p.ok = false; }
    p.bic = bic.bic;

    const rawMandate = cell(r, "mandate");
    p.mandate = transliterate(rawMandate).replace(/\s+/g, "").slice(0, 35);
    if (!p.mandate) { add("error", line, `Mandate id for ${p.name || "this row"} is empty`, "Every collection quotes the unique mandate reference the debtor signed. Without a signed mandate the debtor can have the money refunded."); p.ok = false; }
    else if (p.mandate !== rawMandate.replace(/\s+/g, "")) add("warning", line, "Mandate id adjusted to the SEPA character set", `"${rawMandate}" is sent as "${p.mandate}". It must match what you hold on record.`);
    const signed = normaliseDate(cell(r, "signed"));
    if (!signed) { add("error", line, `Mandate date for ${p.name || "this row"} does not pass`, `"${cell(r, "signed")}" is not a date. Write the day the debtor signed as YYYY-MM-DD.`); p.ok = false; }
    else if (today && signed > today) { add("error", line, `Mandate for ${p.name || "this row"} is signed in the future`, `${isoDate(signed)} is after today; a mandate cannot be used before it is signed.`); p.ok = false; }
    else if (date && signed >= date) { add("error", line, `Mandate for ${p.name || "this row"} is signed on or after the collection date`, `Signed ${isoDate(signed)}, collection ${isoDate(date)}. Collect only under a mandate that already exists.`); p.ok = false; }
    p.signed = signed ? isoDate(signed) : "";

    const rawSeq = cell(r, "seq").toUpperCase().replace(/[\s_]/g, "");
    if (rawSeq && !SEQ_WORDS[rawSeq]) { add("error", line, `Sequence type for ${p.name || "this row"} is not recognised`, `"${cell(r, "seq")}" is not FRST, RCUR, FNAL or OOFF (first, recurring, final, one-off).`); p.ok = false; }
    p.seq = rawSeq ? (SEQ_WORDS[rawSeq] || defaultSeq) : defaultSeq;
    if (!rawSeq && p.ok) p.seqDefaulted = true;

    const rawRef = cell(r, "reference");
    p.ref = transliterate(rawRef).replace(/\s+/g, " ").trim();
    if (p.ref !== rawRef.replace(/\s+/g, " ").trim()) add("warning", line, "Reference adjusted to the SEPA character set", `"${rawRef}" is sent as "${p.ref}".`);
    if (p.ref.length > 140) { add("warning", line, "Reference cut to 140 characters", "The remittance field holds at most 140 characters."); p.ref = p.ref.slice(0, 140); }
    const rawId = cell(r, "id");
    p.e2e = transliterate(rawId || `C${String(idx + 1).padStart(4, "0")}`).replace(/\s+/g, "").slice(0, 35) || `C${String(idx + 1).padStart(4, "0")}`;
    const key = `${p.iban}|${p.mandate}|${p.cents}`;
    if (p.ok && seenKey.has(key)) add("warning", line, "Possible duplicate collection", `Same IBAN, mandate and amount as line ${seenKey.get(key)}. Collecting twice in one file is a classic way to get chargebacks.`);
    else if (p.ok) seenKey.set(key, line);
    payments.push(p);
  });
  const ids = new Map();
  for (const p of payments) {
    if (ids.has(p.e2e)) { add("error", p.line, "Collection ID used twice", `"${p.e2e}" already identifies line ${ids.get(p.e2e)}. End-to-end ids must be unique in the file.`); p.ok = false; }
    else ids.set(p.e2e, p.line);
  }
  if (cIban.ok && payments.some((p) => p.iban === cIban.iban)) add("warning", null, "A debtor IBAN is your own account", "Collecting from the account the money goes to is usually a copy-paste slip.");
  if (payments.some((p) => p.seqDefaulted) && defaultSeq === "FRST") add("warning", null, "Every row without a sequence type is sent as FRST", "FRST is only for the first collection under a mandate. Mark the rest RCUR, or set the default to RCUR.");
  if (scheme === "B2B" && payments.some((p) => p.ok && p.seq === "FRST")) add("warning", null, "B2B mandates must also be on file at the debtor's bank", "A B2B collection is rejected unless the debtor has registered the mandate with their own bank. CORE needs no such step.");
  const bySeq = new Map();
  for (const p of payments.filter((q) => q.ok)) bySeq.set(p.seq, [...(bySeq.get(p.seq) || []), p]);

  const errors = findings.filter((f) => f.severity === "error").length;
  const good = payments.filter((p) => p.ok);
  const total = good.reduce((s, p) => s + p.cents, 0n);
  const summary = { rows: payments.length, payments: good.length, errors, warnings: findings.length - errors, total: formatCents(total), version, batches: bySeq.size, scheme };
  let xml = null;
  if (!errors && good.length) xml = buildXml({ version, v, msgId, created, date: isoDate(date), scheme, creditorName, creditorId: cid.id, creditorIban: cIban.iban, creditorBic: cBic.bic, batch: settings.batchBooking !== false, groups: [...bySeq.entries()].sort((a, b) => SEQUENCES.indexOf(a[0]) - SEQUENCES.indexOf(b[0])) });
  return { xml, findings, summary, payments };
}

export function buildXml({ version, v, msgId, created, date, scheme, creditorName, creditorId, creditorIban, creditorBic, batch, groups }) {
  const e = xmlEscape;
  const all = groups.flatMap(([, ps]) => ps);
  const sum = (ps) => formatCents(ps.reduce((s, p) => s + p.cents, 0n));
  const dateEl = `<ReqdColltnDt>${date}</ReqdColltnDt>`;
  const bicEl = (bic) => bic ? `<FinInstnId><${v.bic}>${bic}</${v.bic}></FinInstnId>` : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
  let out = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${version}">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${e(msgId)}</MsgId>
      <CreDtTm>${created}</CreDtTm>
      <NbOfTxs>${all.length}</NbOfTxs>
      <CtrlSum>${sum(all)}</CtrlSum>
      <InitgPty><Nm>${e(creditorName)}</Nm></InitgPty>
    </GrpHdr>
`;
  groups.forEach(([seq, ps], gi) => {
    out += `    <PmtInf>
      <PmtInfId>${e(msgId)}-${gi + 1}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>${batch ? "true" : "false"}</BtchBookg>
      <NbOfTxs>${ps.length}</NbOfTxs>
      <CtrlSum>${sum(ps)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>${scheme}</Cd></LclInstrm><SeqTp>${seq}</SeqTp></PmtTpInf>
      ${dateEl}
      <Cdtr><Nm>${e(creditorName)}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${creditorIban}</IBAN></Id></CdtrAcct>
      <CdtrAgt>${bicEl(creditorBic)}</CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>${e(creditorId)}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
`;
    for (const p of ps) {
      out += `      <DrctDbtTxInf>
        <PmtId><EndToEndId>${e(p.e2e)}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${formatCents(p.cents)}</InstdAmt>
        <DrctDbtTx><MndtRltdInf><MndtId>${e(p.mandate)}</MndtId><DtOfSgntr>${p.signed}</DtOfSgntr></MndtRltdInf></DrctDbtTx>
        <DbtrAgt>${bicEl(p.bic)}</DbtrAgt>
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

export const sampleFile = () => "debtor,iban,amount,mandate id,mandate date,reference,sequence\nJan de Vries,NL91ABNA0417164300,29.90,MAND-0001,2025-03-14,Membership October,RCUR\nMaria Garcia,ES9121000418450200051332,29.90,MAND-0002,2025-06-01,Membership October,RCUR\nLena Müller,DE89 3704 0044 0532 0130 00,\"34,50\",MAND-0003,2026-10-02,Membership October,FRST\n";
export const sampleBrokenFile = () => "debtor,iban,amount,mandate id,mandate date,reference,sequence\nJan de Vries,NL91ABNA0417164340,29.90,MAND-0001,2025-03-14,Membership October,RCUR\nMaria Garcia,ES9121000418450200051332,29.905,MAND-0002,2025-06-01,Membership October,RCUR\nLena Müller,DE89 3704 0044 0532 0130 00,34.50,,2026-10-02,Membership October,FRST\nOla Nordmann,NO9386011117947,12.00,MAND-0004,2027-01-01,Membership October,RCUR\nJan de Vries,NL91ABNA0417164300,29.90,MAND-0001,2025-03-14,Membership October,RCUR\nJan de Vries,NL91ABNA0417164300,29.90,MAND-0001,2025-03-14,Membership October,RCUR\n";
