// CSV to SEPA credit transfer (pain.001) converter. Pure functions, no DOM, no network, no dependencies.
// Amounts are integer cents (BigInt); no floating point touches a sum. The converter refuses to write a file while any
// payment has an error, so a half-correct batch never reaches the bank.

export const VERSIONS = {
  "pain.001.001.03": { bic: "BIC", wrapDate: false },
  "pain.001.001.09": { bic: "BICFI", wrapDate: true },
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
  if (s.startsWith("-")) return { ok: false, problem: "is negative; a credit transfer must be a positive amount" };
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

const COLS = [
  ["name", /payee|beneficiar|creditor|supplier|vendor|recipient|^name$|empf|name/i],
  ["iban", /iban|bank ?account|account ?(no|number)|konto/i],
  ["amount", /amount|sum|total|betrag|^pay$|^eur$/i],
  ["reference", /reference|description|remittance|purpose|memo|invoice|verwendung|note/i],
  ["bic", /bic|swift/i],
  ["id", /end.?to.?end|^id$|^ref(erence)? ?(id|no)|^e2e/i],
];
// Maps each field to a column index by header text; returns { map, hasHeader }.
export function mapColumns(rows) {
  const head = rows[0]?.cells.map((c) => c.trim()) ?? [];
  const map = {};
  const used = new Set();
  const order = ["id", "iban", "bic", "amount", "reference", "name"];
  const test = Object.fromEntries(COLS);
  for (const f of order) {
    const i = head.findIndex((h, k) => !used.has(k) && test[f].test(h));
    if (i >= 0) { map[f] = i; used.add(i); }
  }
  const hasHeader = map.iban !== undefined || map.amount !== undefined || map.name !== undefined;
  return { map, hasHeader };
}

const SENTINEL = {
  name: "Payee name", iban: "IBAN", amount: "Amount", reference: "Reference",
};
function normaliseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}
export const isoDate = (d) => d.toISOString().slice(0, 10);

// Converts the CSV text to a pain.001 file. `settings`: debtorName, debtorIban, debtorBic, date (YYYY-MM-DD), version,
// msgId, created (ISO local time, no zone), batchBooking. Returns { xml, findings, summary, payments }.
export function convert(text, settings = {}) {
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line: line || null, title, detail });
  const version = settings.version || "pain.001.001.03";
  const v = VERSIONS[version];
  if (!v) throw new Error(`Unknown version ${version}`);

  // --- settings (the payer)
  const debtorName = transliterate(String(settings.debtorName ?? "").trim()).slice(0, 70);
  if (!debtorName) add("error", null, "Your name is missing", "Enter the name on the debit account; the bank prints it on every statement line.");
  else if (debtorName !== String(settings.debtorName).trim()) add("warning", null, "Your name was adjusted to the SEPA character set", `Written as "${debtorName}".`);
  const dIban = checkIban(settings.debtorIban);
  if (!dIban.ok) add("error", null, "Your debit IBAN does not pass", `The debit IBAN ${dIban.problem}.`);
  const dBic = checkBic(settings.debtorBic);
  if (!dBic.ok) add("error", null, "Your BIC is not valid", "A BIC is 8 or 11 letters and digits (for example COBADEFFXXX). Leave it blank if your bank allows that.");
  const date = normaliseDate(settings.date);
  if (!date) add("error", null, "Execution date missing", "Enter the date as YYYY-MM-DD, the day you want the money to leave your account.");
  else if ([0, 6].includes(date.getUTCDay())) add("warning", null, "Execution date is a weekend", "SEPA transfers settle on TARGET business days. Your bank will move this to the next one, or reject the file.");
  const today = settings.today ? new Date(Date.UTC(settings.today.getUTCFullYear(), settings.today.getUTCMonth(), settings.today.getUTCDate())) : null;
  if (date && today && date < today) add("error", null, "Execution date is in the past", "Pick today or a later business day.");
  const created = settings.created || new Date().toISOString().slice(0, 19);
  const msgId = transliterate(String(settings.msgId || `MSG-${created.replace(/\D/g, "").slice(0, 14)}`)).slice(0, 35);

  // --- the table
  const table = parseTable(text);
  const { map, hasHeader } = mapColumns(table.rows);
  const rows = hasHeader ? table.rows.slice(1) : table.rows;
  for (const f of ["name", "iban", "amount"]) {
    if (map[f] === undefined) {
      if (hasHeader) add("error", table.rows[0]?.line, `No "${SENTINEL[f]}" column found`, `Name a header ${f === "name" ? "Payee or Name" : f === "iban" ? "IBAN" : "Amount"}, or use the order Name, IBAN, Amount, Reference with no header row.`);
    }
  }
  if (!hasHeader) { map.name = 0; map.iban = 1; map.amount = 2; map.reference = 3; }
  if (!rows.length) add("error", null, "No payments found", "The file has no rows below the header.");

  const payments = [];
  const seenKey = new Map();
  const cell = (r, f) => (map[f] === undefined ? "" : String(r.cells[map[f]] ?? "").trim());
  rows.forEach((r, idx) => {
    const line = r.line;
    const p = { line, ok: true };
    const rawName = cell(r, "name");
    p.name = transliterate(rawName).replace(/\s+/g, " ").trim();
    if (!p.name) { add("error", line, "Payee name is empty", "Every credit transfer needs the name of the account holder."); p.ok = false; }
    else {
      if (p.name !== rawName.replace(/\s+/g, " ").trim()) add("warning", line, "Payee name adjusted to the SEPA character set", `"${rawName}" is sent as "${p.name}".`);
      if (p.name.length > 70) { add("warning", line, "Payee name cut to 70 characters", `"${p.name}" is too long for the field.`); p.name = p.name.slice(0, 70); }
    }
    const ib = checkIban(cell(r, "iban"));
    if (!ib.ok) { add("error", line, `IBAN for ${p.name || "this row"} does not pass`, `The IBAN ${ib.problem}.`); p.ok = false; }
    p.iban = ib.iban;
    const am = parseCents(cell(r, "amount"));
    if (!am.ok) { add("error", line, `Amount for ${p.name || "this row"} does not pass`, `"${cell(r, "amount")}" ${am.problem}.`); p.ok = false; }
    else p.cents = am.cents;
    const bic = checkBic(cell(r, "bic"));
    if (!bic.ok) { add("error", line, `BIC for ${p.name || "this row"} is not valid`, "A BIC is 8 or 11 letters and digits. Leave the cell blank if it is not needed: SEPA payments are routed by the IBAN alone."); p.ok = false; }
    p.bic = bic.bic;
    const rawRef = cell(r, "reference");
    p.ref = transliterate(rawRef).replace(/\s+/g, " ").trim();
    if (p.ref !== rawRef.replace(/\s+/g, " ").trim()) add("warning", line, "Reference adjusted to the SEPA character set", `"${rawRef}" is sent as "${p.ref}".`);
    if (p.ref.length > 140) { add("warning", line, "Reference cut to 140 characters", "The payment reference field holds at most 140 characters."); p.ref = p.ref.slice(0, 140); }
    const rawId = cell(r, "id");
    p.e2e = transliterate(rawId || `P${String(idx + 1).padStart(4, "0")}`).replace(/\s+/g, "").slice(0, 35) || `P${String(idx + 1).padStart(4, "0")}`;
    if (/^\/|\/$|\/\//.test(p.e2e)) add("warning", line, "Payment ID has a leading, trailing or double slash", `"${p.e2e}": SEPA reference fields must not begin or end with "/" or contain "//" (EPC rulebook; the pain.001 validator flags it too), and some banks reject the file.`);
    const key = `${p.iban}|${p.cents}|${p.ref}`;
    if (p.ok && seenKey.has(key)) add("warning", line, "Possible duplicate payment", `Same IBAN, amount and reference as line ${seenKey.get(key)}. Remove one if it was not meant twice.`);
    else if (p.ok) seenKey.set(key, line);
    payments.push(p);
  });
  const ids = new Map();
  for (const p of payments) {
    if (ids.has(p.e2e)) add("error", p.line, "Payment ID used twice", `"${p.e2e}" already identifies line ${ids.get(p.e2e)}. End-to-end ids must be unique in the file.`), p.ok = false;
    else ids.set(p.e2e, p.line);
  }
  const unique = [...new Set(payments.filter((p) => p.ok).map((p) => p.iban))];
  if (dIban.ok && payments.some((p) => p.iban === dIban.iban)) add("warning", null, "A payee IBAN is your own debit IBAN", "A payment to the account it leaves from is usually a copy-paste slip.");
  void unique;

  const errors = findings.filter((f) => f.severity === "error").length;
  const good = payments.filter((p) => p.ok);
  const total = good.reduce((s, p) => s + p.cents, 0n);
  const summary = { rows: payments.length, payments: good.length, errors, warnings: findings.length - errors, total: formatCents(total), version };
  let xml = null;
  if (!errors && good.length) xml = buildXml({ version, v, msgId, created, date: isoDate(date), debtorName, debtorIban: dIban.iban, debtorBic: dBic.bic, batch: settings.batchBooking !== false, payments: good });
  return { xml, findings, summary, payments };
}

export function buildXml({ version, v, msgId, created, date, debtorName, debtorIban, debtorBic, batch, payments }) {
  const total = formatCents(payments.reduce((s, p) => s + p.cents, 0n));
  const e = xmlEscape;
  const dateEl = v.wrapDate ? `<ReqdExctnDt><Dt>${date}</Dt></ReqdExctnDt>` : `<ReqdExctnDt>${date}</ReqdExctnDt>`;
  const agent = (bic) => bic ? `<CdtrAgt><FinInstnId><${v.bic}>${bic}</${v.bic}></FinInstnId></CdtrAgt>` : "";
  const dAgent = debtorBic ? `<DbtrAgt><FinInstnId><${v.bic}>${debtorBic}</${v.bic}></FinInstnId></DbtrAgt>` : (v.wrapDate ? `<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>` : `<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>`);
  let out = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${version}">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${e(msgId)}</MsgId>
      <CreDtTm>${created}</CreDtTm>
      <NbOfTxs>${payments.length}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <InitgPty><Nm>${e(debtorName)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${e(msgId)}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>${batch ? "true" : "false"}</BtchBookg>
      <NbOfTxs>${payments.length}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      ${dateEl}
      <Dbtr><Nm>${e(debtorName)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${debtorIban}</IBAN></Id></DbtrAcct>
      ${dAgent}
      <ChrgBr>SLEV</ChrgBr>
`;
  for (const p of payments) {
    out += `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${e(p.e2e)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${formatCents(p.cents)}</InstdAmt></Amt>
        ${agent(p.bic)}
        <Cdtr><Nm>${e(p.name)}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${p.iban}</IBAN></Id></CdtrAcct>
        ${p.ref ? `<RmtInf><Ustrd>${e(p.ref)}</Ustrd></RmtInf>` : ""}
      </CdtTrfTxInf>
`;
  }
  return out.replace(/^ +\n/gm, "") + `    </PmtInf>\n  </CstmrCdtTrfInitn>\n</Document>\n`;
}

export function findingsCsv(result) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  return ["severity,line,title,detail", ...result.findings.map((f) => [f.severity, f.line ?? "", q(f.title), q(f.detail)].join(","))].join("\n") + "\n";
}

export const sampleFile = () => "payee,iban,amount,reference\nAcme GmbH,DE89 3704 0044 0532 0130 00,\"1.200,00\",Invoice 2026-114\nVan Dijk BV,NL91ABNA0417164300,95.20,Invoice 88\nDupont SARL,FR1420041010050500013M02606,410,Facture 7 – octobre\n";
export const sampleBrokenFile = () => "payee,iban,amount,reference\nAcme GmbH,DE89 3704 0044 0532 0130 00,1200.00,Invoice 2026-114\nVan Dijk BV,NL91ABNA0417164340,95.20,Invoice 88\nDupont SARL,FR1420041010050500013M02606,410.505,Facture 7\nMeyer AG,DE89 3704 0044 0532 0130 00,1.234,Order 9\nKim Co,,10.00,\nAcme GmbH,DE89 3704 0044 0532 0130 00,1200.00,Invoice 2026-114\n";
