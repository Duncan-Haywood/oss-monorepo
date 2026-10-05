// SWIFT MT940 bank statement checker and repairer. Pure functions, no I/O, no network.
// The rules are read from memory of the SWIFT MT940 field conventions that accounting imports (DATEV,
// Xero, QuickBooks, Sage, banking apps) follow: tags :20: :25: :28C: :60F: :61: :86: :62F:, comma as the
// decimal mark, 65-character lines, a restricted character set, and an opening balance plus the :61:
// lines that must equal the closing balance. Bank dialects differ; confirm against your bank's own
// specification. Nothing here asks a bank or an accounting product anything.

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(b).replace(/^﻿/, "");
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(b) : utf8;
}

export function looksLikeCamt(text) {
  return /<Document[\s>]/.test(text) && /camt\.05[23]/.test(text);
}

const TAG = /^:(\d{2}[A-Z]?):(.*)$/;
const BAL = /^([CD])(\d{6})([A-Z]{3})(\d{1,15},\d{0,3})$/;
const STMT = /^(\d{6})(\d{4})?(R?[CD])([A-Z])?(\d{1,15},\d{0,3})(N|F|S)([A-Z0-9]{3})(.*)$/;
const BAD_CHARS = /[^\x20-\x7e]/;

// "1234,56" -> BigInt in thousandths, or null.
export function toMilli(s) {
  const m = /^(\d{1,15}),(\d{0,3})$/.exec(String(s).trim());
  if (!m) return null;
  return BigInt(m[1]) * 1000n + BigInt((m[2] + "000").slice(0, 3));
}

export function fmtMilli(v) {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / 1000n, frac = String(a % 1000n).padStart(3, "0").replace(/0$/, "");
  return (neg ? "-" : "") + whole + "," + frac;
}

// A dot instead of the comma is the commonest hand-edit; read it so the balance check still runs.
const fixBal = (v) => v.replace(/^([CD]\d{6}[A-Z]{3}\d{1,15})(?:\.(\d{0,2}))?$/, (_, a, b) => `${a},${b || ""}`);

function validDate(yymmdd) {
  const y = 2000 + Number(yymmdd.slice(0, 2)), m = Number(yymmdd.slice(2, 4)), d = Number(yymmdd.slice(4, 6));
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function validMonthDay(mmdd) {
  const m = Number(mmdd.slice(0, 2)), d = Number(mmdd.slice(2, 4));
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

// Splits the file into statements of tagged fields. Each field keeps its first line number and its
// continuation lines (untagged lines belong to the field above).
export function parseMt940(text) {
  const raw = String(text).replace(/^﻿/, "");
  const lines = raw.split(/\r\n|\r|\n/);
  const statements = [];
  let cur = null, field = null, inBlock4 = false;
  const strays = [];
  const terminators = [];
  lines.forEach((ln, i) => {
    const no = i + 1;
    let line = ln;
    if (/^\{1:/.test(line) || /^\{2:/.test(line) || /^\{3:/.test(line)) { const k = line.indexOf("{4:"); if (k < 0) return; line = line.slice(k); }
    if (/^\{4:\s*$/.test(line)) { inBlock4 = true; return; }
    if (/^\{4:/.test(line)) { inBlock4 = true; line = line.slice(3); }
    if (/^-\}?\s*$/.test(line) || line.trim() === "-}") { if (cur) cur.end = no; terminators.push(no); field = null; cur = cur && (cur.closed = true, cur); return; }
    const t = TAG.exec(line);
    if (t) {
      if (t[1] === "20" || !cur || cur.closed) { cur = { start: no, fields: [], end: null, closed: false }; statements.push(cur); }
      field = { tag: t[1], value: t[2], line: no, cont: [] };
      cur.fields.push(field);
    } else if (field && line.trim() !== "") {
      field.cont.push({ text: line, line: no });
    } else if (line.trim() !== "") strays.push({ text: line, line: no });
  });
  return { lines, statements, strays, inBlock4, terminators };
}

function result(findings, extra) {
  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.line || 0) - (b.line || 0));
  return { findings, summary: { errors: findings.filter((f) => f.severity === "error").length, warnings: findings.filter((f) => f.severity === "warning").length, ...extra } };
}

// RC reverses a credit (counts as a debit) and RD reverses a debit.
const signed = (cd, v) => ((cd.endsWith("D") ? -v : v) * (cd.startsWith("R") ? -1n : 1n));

export function validate(text) {
  const findings = [];
  const add = (severity, title, detail, line = 0, fixable = false) => findings.push({ severity, title, detail, line, fixable });
  if (!String(text).trim()) { add("error", "The file is empty", "Nothing to check."); return result(findings, { transactions: 0, statements: 0 }); }
  if (looksLikeCamt(text)) { add("error", "This is a camt.052/053 XML file, not MT940", "MT940 is a text format of :tag: lines. camt files need an XML checker.", 1); return result(findings, { transactions: 0, statements: 0 }); }
  const p = parseMt940(text);
  if (!p.statements.length) { add("error", "No MT940 tags found", "Expected lines such as :20:, :25:, :60F: and :61:. This does not look like an MT940 statement.", 1); return result(findings, { transactions: 0, statements: 0 }); }
  let tx = 0;
  const seenKeys = new Map();
  let prev = null;
  p.strays.slice(0, 5).forEach((s) => add("warning", "Line outside any tag", `"${s.text.slice(0, 40)}" is not inside a :tag: field.`, s.line));
  p.statements.forEach((st, si) => {
    const get = (tag) => st.fields.filter((f) => f.tag === tag);
    const first = (tag) => get(tag)[0];
    for (const [tag, name] of [["20", "transaction reference"], ["25", "account"], ["28C", "statement number"], ["62", "closing balance"]]) {
      if (tag === "62") { if (!get("62F").length && !get("62M").length) add("error", "Missing closing balance (:62F:)", "Importers reject a statement with no closing balance.", st.start); }
      else if (!first(tag)) add(tag === "28C" ? "warning" : "error", `Missing :${tag}: (${name})`, `Statement starting on line ${st.start} has no :${tag}: field.`, st.start);
    }
    const open = first("60F") || first("60M");
    if (!open) add("error", "Missing opening balance (:60F:)", "Importers reject a statement with no opening balance.", st.start);
    const ref = first("20");
    if (ref) {
      const r = ref.value;
      if (r.length > 16) add("error", ":20: reference longer than 16 characters", `"${r}" is ${r.length} characters; SWIFT allows 16.`, ref.line);
      if (/^\/|\/$|\/\//.test(r)) add("error", ":20: reference starts or ends with / or contains //", `"${r}" breaks the SWIFT reference rule.`, ref.line);
    }
    let openMilli = null, openCd = null, cur = null;
    if (open) {
      const ov = fixBal(open.value);
      if (ov !== open.value) add("error", `:${open.tag}: amount has no comma`, `"${open.value}" needs a comma as the decimal mark.`, open.line, true);
      const m = BAL.exec(ov);
      if (!m) add("error", `:${open.tag}: opening balance is malformed`, `"${open.value}" should look like C240105EUR1234,56 (C or D, date YYMMDD, currency, amount with a comma).`, open.line);
      else {
        if (!validDate(m[2])) add("error", "Opening balance date is not a real date", `${m[2]} is not a valid YYMMDD date.`, open.line);
        openMilli = signed(m[1], toMilli(m[4])); openCd = m; cur = m[3];
      }
    }
    let sum = 0n, ok = openMilli !== null;
    st.fields.forEach((f, fi) => {
      if (f.tag === "61") {
        tx++;
        let full = f.value;
        const tol = full.replace(/^(\d{6}(?:\d{4})?R?[CD][A-Z]?\d{1,15})(?:\.(\d{0,2}))?(?=[NFS][A-Z0-9]{3})/, (_, a, b) => `${a},${b || ""}`);
        if (tol !== full) { add("error", ":61: amount has no comma", `"${full.slice(0, 40)}" writes the amount with a dot or no decimal mark; MT940 needs a comma (12,50 or 12,).`, f.line, true); full = tol; }
        const m = STMT.exec(full);
        if (!m) {
          ok = false;
          add("error", ":61: line cannot be read", `"${full.slice(0, 50)}" does not match YYMMDD[MMDD] C/D amount N/F/S type reference.`, f.line);
          return;
        }
        if (!validDate(m[1])) add("error", ":61: value date is not a real date", `${m[1]} is not a valid YYMMDD date.`, f.line);
        if (m[2] && !validMonthDay(m[2])) add("error", ":61: entry date is not a real date", `${m[2]} is not a valid MMDD date.`, f.line);
        const v = toMilli(m[5]);
        if (/,\d{3}$/.test(m[5]) || (m[5].split(",")[1] || "").length > 2) add("info", ":61: amount has three decimals", `${m[5]} — fine for some currencies, check yours.`, f.line);
        sum += signed(m[3], v);
        if (m[3].startsWith("R")) add("info", "Reversal (RC/RD) line", `Line ${f.line} is a reversal; it is counted against the opposite side in the balance check.`, f.line);
        const key = `${m[1]}|${m[3]}|${m[5]}|${(m[8] || "").split("//")[0].trim()}`;
        if (seenKeys.has(key)) add("warning", "Looks like a repeat of an earlier :61: line", `Same date, side, amount and reference as line ${seenKeys.get(key)}. Overlapping downloads import the same payment twice.`, f.line);
        else seenKeys.set(key, f.line);
        const next = st.fields[fi + 1];
        if (!next || next.tag !== "86") add("info", ":61: line with no :86: details", "The row will import with no description.", f.line);
      }
      if (f.tag === "86") {
        const all = [f.value, ...f.cont.map((c) => c.text)];
        if (all.length > 6) add("warning", ":86: has more than 6 lines", `${all.length} lines; SWIFT allows 6 of 65 characters.`, f.line);
        all.forEach((l, k) => { if (l.length > 65) add("warning", "Line longer than 65 characters", `${l.length} characters; strict importers cut or reject it.`, f.line + k); });
      }
    });
    for (const f of st.fields) for (const c of [f.value, ...f.cont.map((x) => x.text)]) if (BAD_CHARS.test(c)) { add("warning", "Characters outside the SWIFT set", `Line ${f.line} has characters such as ${[...c].filter((ch) => BAD_CHARS.test(ch)).slice(0, 3).map((ch) => `"${ch}"`).join(", ")}. Many importers reject or garble umlauts and accents.`, f.line, true); break; }
    const close = first("62F") || first("62M");
    if (close) {
      const cv = fixBal(close.value);
      if (cv !== close.value) add("error", `:${close.tag}: amount has no comma`, `"${close.value}" needs a comma as the decimal mark.`, close.line, true);
      const m = BAL.exec(cv);
      if (!m) add("error", `:${close.tag}: closing balance is malformed`, `"${close.value}" should look like C240131EUR1500,00.`, close.line);
      else {
        if (!validDate(m[2])) add("error", "Closing balance date is not a real date", `${m[2]} is not a valid YYMMDD date.`, close.line);
        if (cur && m[3] !== cur) add("error", "Opening and closing currency differ", `${cur} vs ${m[3]}.`, close.line);
        if (openCd && validDate(openCd[2]) && validDate(m[2]) && m[2] < openCd[2]) add("warning", "Closing date is before opening date", `${m[2]} < ${openCd[2]}.`, close.line);
        const closeMilli = signed(m[1], toMilli(m[4]));
        if (ok && openMilli + sum !== closeMilli) add("error", "Balance does not add up", `Opening ${fmtMilli(openMilli)} + ${tx ? "the :61: lines" : "no transactions"} (${fmtMilli(sum)}) = ${fmtMilli(openMilli + sum)}, but the closing balance says ${fmtMilli(closeMilli)}. Off by ${fmtMilli(closeMilli - openMilli - sum)}. A missing, duplicated or mis-signed line is the usual cause.`, close.line);
        if (prev && prev.acct === (first("25") && first("25").value) && prev.cur === m[3] && openMilli !== null && prev.close !== openMilli && first("60F")) add("error", "Opening balance does not continue from the previous statement", `The previous statement closed at ${fmtMilli(prev.close)}, this one opens at ${fmtMilli(openMilli)}. A statement is missing or out of order.`, open.line);
        prev = { acct: first("25") && first("25").value, cur: m[3], close: closeMilli };
      }
    }
    const seq = first("28C");
    if (seq && !/^\d{1,5}(\/\d{1,5})?$/.test(seq.value)) add("warning", ":28C: statement number looks wrong", `"${seq.value}" should be digits, optionally NNNNN/NNNNN.`, seq.line);
    if (!st.closed && si < p.statements.length - 1) add("warning", "No - line closing the statement", "Statements are separated by a line holding only -. Some importers merge the two.", st.start, true);
  });
  return result(findings, { transactions: tx, statements: p.statements.length });
}

const TRANSLIT = { "ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss", "æ": "ae", "Æ": "AE", "ø": "o", "Ø": "O", "å": "a", "Å": "A", "ł": "l", "Ł": "L", "€": "EUR", "£": "GBP", "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-" };
export function transliterate(s) {
  return String(s).split(/(\r\n|\r|\n)/).map((part, i) => (i % 2 ? part : [...part].map((ch) => (!BAD_CHARS.test(ch) ? ch : TRANSLIT[ch] ?? ch.normalize("NFD").replace(/[̀-ͯ]/g, ""))).join("").replace(/[^\x20-\x7e]/g, "?"))).join("");
}

// Fixes only what is provable: dot decimals -> comma, a missing comma on whole amounts, the closing -
// between statements, and (only if asked) characters outside the SWIFT set. It never touches balances.
export function repair(text, opts = {}) {
  if (looksLikeCamt(text)) return { text: String(text), changes: [] };
  const raw = String(text);
  const eol = /\r\n/.test(raw) ? "\r\n" : "\n";
  const lines = raw.split(/\r\n|\r|\n/);
  const changes = [];
  const p = parseMt940(raw);
  for (const st of p.statements) for (const f of st.fields) {
    const i = f.line - 1;
    if (f.tag === "61") {
      const mm = /^(\d{6}(?:\d{4})?R?[CD][A-Z]?)(\d{1,15})([.,]?)(\d{0,2})(N|F|S)([A-Z0-9]{3})/.exec(f.value);
      if (mm && mm[3] !== ",") {
        const fixed = `:61:${mm[1]}${mm[2]},${mm[4]}${mm[5]}${mm[6]}` + f.value.slice(mm[0].length);
        if (lines[i] !== fixed) { lines[i] = fixed; changes.push(`Line ${f.line}: amount ${mm[2]}${mm[3]}${mm[4]} written as ${mm[2]},${mm[4]}.`); }
      }
    }
    if (/^(60[FM]|62[FM]|64|65)$/.test(f.tag)) {
      const mm = /^([CD]\d{6}[A-Z]{3})(\d{1,15})(?:([.,])(\d{0,2}))?$/.exec(f.value);
      if (mm && mm[3] !== ",") {
        const fixed = `:${f.tag}:${mm[1]}${mm[2]},${mm[4] || ""}`;
        if (lines[i] !== fixed) { lines[i] = fixed; changes.push(`Line ${f.line}: balance amount written with a comma.`); }
      }
    }
  }
  let out = lines.join(eol);
  if (opts.transliterate) {
    const t = transliterate(out);
    if (t !== out) { changes.push("Characters outside the SWIFT set replaced (umlauts to ae/oe/ue, accents dropped, anything else to ?)."); out = t; }
  }
  // closing "-" between statements
  const q = parseMt940(out);
  const ls = out.split(/\r\n|\r|\n/);
  let added = 0;
  q.statements.forEach((st, k) => {
    if (!st.closed && k < q.statements.length - 1) { ls.splice(q.statements[k + 1].start - 1 + added, 0, "-"); added++; }
  });
  if (added) { out = ls.join(eol); changes.push(`${added} closing "-" line${added === 1 ? "" : "s"} added between statements.`); }
  return { text: out, changes };
}

export function findingsCsv(res) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["severity,line,problem,detail,auto_fixable", ...res.findings.map((f) => [f.severity, f.line || "", q(f.title), q(f.detail), f.fixable ? "yes" : "no"].join(","))].join("\r\n") + "\r\n";
}

export function sampleFile() {
  return `:20:STMT240131
:25:DE89370400440532013000
:28C:00012/001
:60F:C240101EUR1000,00
:61:2401020102D42,10NTRFNONREF//BK0001
:86:020?00Kartenzahlung?20Corner Grocery
:61:2401120112C1500,00NTRFNONREF//BK0002
:86:166?00Gehalt?20Acme GmbH
:62F:C240131EUR2457,90
-
`;
}

export function sampleBrokenFile() {
  return `:20:STMT240131
:25:DE89370400440532013000
:28C:00012/001
:60F:C240101EUR1000.00
:61:2401020102D42.10NTRFNONREF//BK0001
:86:Zahlung Müller & Söhne
:61:2401120112C1500,00NTRFNONREF//BK0002
:86:Gehalt Acme
:61:2401120112C1500,00NTRFNONREF//BK0002
:86:Gehalt Acme
:62F:C240131EUR2457,90
:20:STMT240229
:25:DE89370400440532013000
:28C:00013/001
:60F:C240201EUR2500,00
:61:2402300230D10,00NTRFNONREF
:62F:C240229EUR2490,00
`;
}
