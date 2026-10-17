// SWIFT MT940 customer statement checker, repairer and CSV converter. Pure functions, no I/O, no network.
// The rules are read from memory of the MT940 layout banks export (field tags :20: :25: :28C: :60F: :61:
// :86: :62F:, comma decimals, YYMMDD dates, a "-" line ending each message); banks differ in the details
// and the standard is revised yearly, so confirm against your bank's own specification. Nothing here asks
// a bank or an accounting product anything.

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(b).replace(/^﻿/, "");
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(b) : utf8;
}

export function looksLikeCamt(text) {
  return /<(?:\w+:)?Document[\s>]/.test(text) && /BkToCstmrStmt|camt\.05/.test(text);
}

// "1234,56" -> 123456 minor units at three decimals (scaled 1000 so KWD-style currencies stay exact).
// SWIFT requires a comma; a period is reported by the caller and still read here so balances can be checked.
export function parseAmount(raw) {
  const s = String(raw).trim();
  if (!/^\d+([,.]\d{0,3})?$/.test(s)) return null;
  const [i, f = ""] = s.split(/[,.]/);
  return Number(i) * 1000 + Number((f + "000").slice(0, 3));
}

export function fmtAmount(scaled) {
  const neg = scaled < 0, a = Math.abs(scaled);
  const whole = Math.floor(a / 1000), frac = String(a % 1000).padStart(3, "0").replace(/0$/, "");
  return (neg ? "-" : "") + whole + "." + (frac.length < 2 ? frac.padEnd(2, "0") : frac);
}

function parseYmd(s) {
  const yy = Number(s.slice(0, 2)), mm = Number(s.slice(2, 4)), dd = Number(s.slice(4, 6));
  const year = yy < 70 ? 2000 + yy : 1900 + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (mm < 1 || mm > 12 || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return { year, month: mm, day: dd, iso: d.toISOString().slice(0, 10) };
}

// The entry date is MMDD with no year: take the year of the value date, then move it one year if that lands
// more than six months away (a 0102 entry on a 1230 value date belongs to the next year).
function entryDate(mmdd, value) {
  const mm = Number(mmdd.slice(0, 2)), dd = Number(mmdd.slice(2, 4));
  let best = null;
  for (const dy of [0, 1, -1]) {
    const d = new Date(Date.UTC(value.year + dy, mm - 1, dd));
    if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) continue;
    const diff = Math.abs(d - Date.UTC(value.year, value.month - 1, value.day));
    if (!best || diff < best.diff) best = { diff, iso: d.toISOString().slice(0, 10) };
  }
  return best ? best.iso : null;
}

const BAL_RE = /^([CD])(\d{6})([A-Z]{3})(\d+[,.]?\d*)$/;
const TXN_RE = /^(\d{6})(\d{4})?(RC|RD|C|D)([A-Z])?(\d+[,.]\d*|\d+)([A-Z])([A-Z0-9]{3})(.*)$/s;

// Lines -> statements. A statement starts at :20: and holds its tags in order; a line that does not start a
// tag continues the previous one (that is how :86: runs over several lines).
export function parseMt940(text) {
  const raw = String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const statements = [], stray = [];
  let st = null, tag = null;
  raw.forEach((ln, i) => {
    const line = i + 1;
    if (!ln.trim()) return;
    if (/^\{\d:.*\}?$/.test(ln.trim()) && !/^:\d/.test(ln)) return; // SWIFT block headers {1:...}{2:...}{4:
    if (/^-\}?$/.test(ln.trim())) { if (st) st.terminated = line; tag = null; return; }
    const m = /^:(\d{2}[A-Z]?):(.*)$/.exec(ln);
    if (m) {
      if (m[1] === "20") { st = { line, tags: [], terminated: 0 }; statements.push(st); }
      if (!st) { st = { line, tags: [], terminated: 0, noHeader: true }; statements.push(st); }
      tag = { tag: m[1], line, value: m[2], extra: [] };
      st.tags.push(tag);
    } else if (tag) tag.extra.push({ line, text: ln });
    else stray.push({ line, text: ln });
  });
  for (const s of statements) for (const t of s.tags) t.full = [t.value, ...t.extra.map((e) => e.text)].join("\n");
  return { statements, stray };
}

// :86: is free text; banks fill it as "/EREF/abc/NAME/Jo Smith/REMI/Invoice 7", or German-style
// "?20Invoice?21 7?32Jo Smith". Both are split into labelled parts when they match; otherwise it is kept whole.
export function parseInfo(text) {
  const t = String(text || "").replace(/\n/g, "");
  const out = { raw: t, parts: {}, description: t };
  if (/\?\d{2}/.test(t)) {
    const re = /\?(\d{2})([^?]*)/g; let m; const sub = {};
    while ((m = re.exec(t))) sub[m[1]] = (sub[m[1]] || "") + m[2];
    out.parts = sub;
    const rem = Object.keys(sub).filter((k) => k >= "20" && k <= "29").sort().map((k) => sub[k]).join(" ").trim();
    out.name = [sub["32"], sub["33"]].filter(Boolean).join(" ").trim();
    out.description = [out.name, rem].filter(Boolean).join(" — ") || t;
  } else if (/^\/[A-Z]{3,4}\//.test(t)) {
    const re = /\/([A-Z]{3,4})\/((?:(?!\/[A-Z]{3,4}\/).)*)/g; let m; const parts = {};
    while ((m = re.exec(t))) parts[m[1]] = m[2];
    out.parts = parts;
    out.name = parts.NAME || parts.CNTP || "";
    out.description = [out.name, parts.REMI || parts.USTD || ""].filter(Boolean).join(" — ") || t;
  }
  return out;
}

function transactionsOf(statement, add) {
  const txns = [];
  statement.tags.forEach((t, idx) => {
    if (t.tag !== "61") return;
    const first = t.value;
    const m = TXN_RE.exec(first);
    if (!m) { add("error", t.line, "Transaction line (:61:) cannot be read", `":61:${first.slice(0, 40)}" does not match value date, optional entry date, C/D, amount, N + type code and reference. Nothing after this line can be tied to a transaction until it is fixed.`); return; }
    const [, vd, ed, dc, funds, amt, , type, tail] = m;
    const value = parseYmd(vd);
    if (!value) { add("error", t.line, "Impossible value date", `"${vd}" is not a real YYMMDD date.`); return; }
    if (/\./.test(amt)) add("error", t.line, "Amount uses a period", `${amt} — SWIFT amounts use a comma as the decimal separator; many importers reject or misread a period. Fixed automatically.`, true);
    const scaled = parseAmount(amt);
    if (scaled === null) { add("error", t.line, "Amount not readable", `"${amt}" is not a plain amount.`); return; }
    if (scaled === 0) add("warning", t.line, "Zero-amount transaction", "A transaction of 0 is unusual and some importers drop it.");
    const [ref, bankRef] = tail.split("//");
    let info = null;
    const next = statement.tags[idx + 1];
    if (next && next.tag === "86") info = parseInfo(next.full);
    else add("warning", t.line, "Transaction has no :86: description", "No :86: line follows this :61:, so the import will have a date and an amount and no payee or purpose.");
    const sign = dc === "C" || dc === "RD" ? 1 : -1;
    txns.push({ line: t.line, value: value.iso, entry: ed ? entryDate(ed, value) : "", dc, signed: sign * scaled, amount: scaled, ref: (ref || "").trim(), bankRef: (bankRef || "").trim(), type, funds: funds || "", info, entryRaw: ed || "" });
  });
  return txns;
}

function balanceOf(tag, add) {
  const m = BAL_RE.exec(tag.value.trim());
  if (!m) { add("error", tag.line, `Balance line (:${tag.tag}:) cannot be read`, `":${tag.tag}:${tag.value.slice(0, 40)}" should be C or D, a YYMMDD date, a three-letter currency and an amount.`); return null; }
  const date = parseYmd(m[2]);
  if (!date) { add("error", tag.line, "Impossible balance date", `"${m[2]}" is not a real YYMMDD date.`); return null; }
  const scaled = parseAmount(m[4]);
  if (scaled === null) { add("error", tag.line, "Balance amount not readable", m[4]); return null; }
  if (/\./.test(m[4])) add("error", tag.line, "Balance uses a period", `${m[4]} — SWIFT amounts use a comma. Fixed automatically.`, true);
  return { sign: m[1], date: date.iso, currency: m[3], signed: (m[1] === "C" ? 1 : -1) * scaled };
}

export function validate(text) {
  const findings = [];
  const add = (severity, line, title, detail, fixable = false) => findings.push({ severity, line, title, detail, fixable });
  const raw = String(text);
  if (looksLikeCamt(raw)) add("error", 1, "This is a CAMT (ISO 20022 XML) file, not MT940", "CAMT.053 is the XML successor of MT940. This tool reads MT940 text; convert or re-export the statement as MT940.");
  const { statements, stray } = parseMt940(raw);
  if (!statements.length) {
    if (!findings.length) add("error", 1, "No MT940 statement found", "Expected lines starting :20: (reference), :25: (account), :60F: (opening balance), :61: (transactions) and :62F: (closing balance).");
    return { findings, statements: [], transactions: [], summary: { errors: findings.length, warnings: 0, statements: 0, transactions: 0, accounts: [], currencies: [] } };
  }
  if (stray.length) add("warning", stray[0].line, "Text outside any field", `${stray.length} line(s) are not part of a :NN: field, for example "${stray[0].text.slice(0, 40)}". Importers usually skip them.`);

  const all = [], accounts = new Set(), currencies = new Set(), chain = [];
  statements.forEach((s, n) => {
    const label = statements.length > 1 ? ` (statement ${n + 1})` : "";
    const tagsOf = (t) => s.tags.filter((x) => x.tag === t);
    if (s.noHeader) add("error", s.line, "Statement has no :20: reference" + label, "A statement must open with :20:. Without it most importers skip the whole message.");
    const acct = tagsOf("25")[0] || tagsOf("25P")[0];
    if (!acct) add("error", s.line, "No :25: account" + label, "The statement does not say which account it belongs to, so an importer cannot place it.");
    else accounts.add(acct.value.trim());
    if (!tagsOf("28C")[0]) add("warning", s.line, "No :28C: statement number" + label, "Without a statement and sequence number an importer cannot tell a repeated statement from a new one.");
    const open = tagsOf("60F")[0] || tagsOf("60M")[0];
    const close = tagsOf("62F")[0] || tagsOf("62M")[0];
    if (!open) add("error", s.line, "No opening balance (:60F:)" + label, "Balance checking and most importers need the opening balance.");
    if (!close) add("error", s.line, "No closing balance (:62F:)" + label, "Without a closing balance the statement is unfinished; the file may have been cut off.");
    const ob = open ? balanceOf(open, add) : null, cb = close ? balanceOf(close, add) : null;
    if (ob) currencies.add(ob.currency);
    if (ob && cb && ob.currency !== cb.currency) add("error", close.line, "Opening and closing currencies differ" + label, `${ob.currency} versus ${cb.currency}.`);
    const txns = transactionsOf(s, add);
    txns.forEach((t) => { t.account = acct ? acct.value.trim() : ""; t.statement = n + 1; t.currency = ob ? ob.currency : ""; });
    all.push(...txns);
    const sum = txns.reduce((a, t) => a + t.signed, 0);
    if (ob && cb) {
      const expected = ob.signed + sum;
      if (expected !== cb.signed) add("error", close.line, "Balances do not add up" + label, `Opening ${fmtAmount(ob.signed)} plus ${txns.length} transaction${txns.length === 1 ? "" : "s"} (${fmtAmount(sum)}) is ${fmtAmount(expected)}, but the closing balance says ${fmtAmount(cb.signed)}. The difference is ${fmtAmount(cb.signed - expected)}: a transaction is missing, repeated, or has the wrong sign or amount. Not auto-fixed.`);
      chain.push({ n, ob, cb, acct: acct ? acct.value.trim() : "", seq: (tagsOf("28C")[0] || {}).value });
    }
    // order and terminator
    const order = s.tags.map((t) => t.tag.replace(/[FM]$/, ""));
    const iOpen = order.indexOf("60"), iClose = order.lastIndexOf("62"), last61 = order.lastIndexOf("61");
    if (open && close && (iOpen > order.indexOf("61") && order.includes("61") || iClose < last61)) add("error", s.line, "Fields out of order" + label, "The opening balance must come before the first :61: and the closing balance after the last.");
    if (!s.terminated) add("warning", s.line, "No closing - line" + label, "Each MT940 message ends with a line containing only -. Some importers drop the last statement without it. Fixed automatically.", true);
    // dates
    if (ob && cb && txns.length) {
      const first = ob.date, lastD = cb.date;
      for (const t of txns) if (t.value < first.slice(0, 8) + "01" && t.value < first) {
        add("warning", t.line, "Value date is before the opening balance date" + label, `${t.value} versus opening ${first}.`); break;
      }
      for (const t of txns) if (t.value > lastD && (new Date(t.value) - new Date(lastD)) / 864e5 > 5) {
        add("warning", t.line, "Value date is after the closing balance date" + label, `${t.value} versus closing ${lastD}; the statement period may be wrong.`); break;
      }
    }
    // duplicates
    const seen = new Map();
    for (const t of txns) {
      const k = [t.value, t.signed, t.ref, t.info ? t.info.raw : ""].join("|");
      if (seen.has(k)) add(t.ref && t.ref.toUpperCase() !== "NONREF" ? "error" : "warning", t.line, "Looks like a repeat" + label, `Same value date, amount, reference and text as line ${seen.get(k)}. ${t.ref && t.ref.toUpperCase() !== "NONREF" ? "The reference is also identical, which is rarely two separate payments." : "The reference is NONREF, so it may be two genuine identical payments; check the bank's own record."}`);
      else seen.set(k, t.line);
    }
    // line widths (SWIFT: 65 characters in :86:)
    const wide = s.tags.find((t) => t.tag === "86" && t.extra.some((e) => e.text.length > 65));
    if (wide) add("info", wide.line, "Description lines longer than 65 characters" + label, "SWIFT limits :86: lines to 65 characters. Banks often exceed it and importers usually cope, but a strict one may cut or reject the line.");
  });

  // statement-to-statement continuity, per account
  const byAcct = new Map();
  chain.forEach((c) => { if (!byAcct.has(c.acct)) byAcct.set(c.acct, []); byAcct.get(c.acct).push(c); });
  for (const [acct, list] of byAcct) for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    if (a.cb.currency === b.ob.currency && a.cb.signed !== b.ob.signed) add("error", statements[b.n].line, "Statement does not continue from the previous one", `${acct || "Account"}: statement ${a.n + 1} closes at ${fmtAmount(a.cb.signed)} but statement ${b.n + 1} opens at ${fmtAmount(b.ob.signed)}. A statement between them is missing from this file.`);
    else if (a.cb.date > b.ob.date) add("warning", statements[b.n].line, "Statements overlap or are out of date order", `${acct || "Account"}: statement ${a.n + 1} closes ${a.cb.date} and statement ${b.n + 1} opens ${b.ob.date}.`);
  }
  if (accounts.size > 1) add("info", 1, "More than one account in the file", `${[...accounts].join(", ")}. The CSV carries an account column; import each account separately.`);

  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.line || 0) - (b.line || 0));
  const summary = {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    statements: statements.length, transactions: all.length, accounts: [...accounts], currencies: [...currencies],
    credits: all.filter((t) => t.signed > 0).reduce((a, t) => a + t.signed, 0),
    debits: all.filter((t) => t.signed < 0).reduce((a, t) => a + t.signed, 0),
  };
  return { findings, statements, transactions: all, summary };
}

// Repairs only what is provable: period -> comma decimals in :61:/:60:/:62: and a closing "-" line.
export function repair(text) {
  const changes = [];
  const lines = String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const out = lines.map((ln, i) => {
    const m = /^(:(?:60[FM]|62[FM]|64|65):[CD]\d{6}[A-Z]{3})(\d+)\.(\d{0,3})$/.exec(ln);
    if (m) { changes.push(`Line ${i + 1}: balance amount ${m[2]}.${m[3]} written with a comma`); return `${m[1]}${m[2]},${m[3]}`; }
    const t = /^(:61:\d{6}(?:\d{4})?(?:RC|RD|C|D)[A-Z]?)(\d+)\.(\d{0,3})([A-Z][A-Z0-9]{3}.*)$/.exec(ln);
    if (t) { changes.push(`Line ${i + 1}: transaction amount ${t[2]}.${t[3]} written with a comma`); return `${t[1]}${t[2]},${t[3]}${t[4]}`; }
    return ln;
  });
  const { statements } = parseMt940(out.join("\n"));
  const lastIdx = (() => { let k = out.length - 1; while (k >= 0 && !out[k].trim()) k--; return k; })();
  if (statements.length && !statements[statements.length - 1].terminated) {
    out.splice(lastIdx + 1, 0, "-");
    changes.push("Added the closing - line after the last statement");
  }
  // Statements that end without "-" but are followed by another statement: add one before the next :20:.
  for (let s = statements.length - 2; s >= 0; s--) if (!statements[s].terminated) {
    const nextLine = statements[s + 1].line - 1; // index of next :20:
    out.splice(nextLine, 0, "-");
    changes.push(`Added the closing - line before statement ${s + 2}`);
  }
  return { text: out.join("\r\n") + "\r\n", changes };
}

const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;

export function toCsv(res, { decimal = "." } = {}) {
  const num = (v) => fmtAmount(v).replace(".", decimal);
  const head = ["account", "statement", "value_date", "entry_date", "credit_debit", "amount", "currency", "reference", "bank_reference", "type_code", "name", "description"];
  const rows = res.transactions.map((t) => [t.account, t.statement, t.value, t.entry, t.dc, num(t.signed), t.currency, t.ref, t.bankRef, t.type, t.info?.name || "", t.info?.description || ""].map(q).join(","));
  return [head.join(","), ...rows].join("\r\n") + "\r\n";
}

export function findingsCsv(res) {
  return ["severity,line,problem,detail,auto_fixable", ...res.findings.map((f) => [f.severity, f.line || "", q(f.title), q(f.detail), f.fixable ? "yes" : "no"].join(","))].join("\r\n") + "\r\n";
}

export function sampleFile() {
  return `:20:STMT20240131
:25:NL91ABNA0417164300
:28C:00001/001
:60F:C240101EUR1000,00
:61:2401020102D42,10NMSCNONREF//BANK1
:86:/EREF/NONREF/NAME/Corner Grocery/REMI/Card purchase
:61:2401150115C2500,00NTRFINV-1042
:86:/EREF/INV-1042/NAME/Northwind Ltd/REMI/Invoice 1042
:61:2401310131D19,99NCHGFEE-JAN
:86:/NAME/Example Bank/REMI/Account fee January
:62F:C240131EUR3437,91
-
`;
}

export function sampleBrokenFile() {
  return `:20:STMT20240131
:25:NL91ABNA0417164300
:28C:00001/001
:60F:C240101EUR1000.00
:61:2401020102D42,10NMSCNONREF
:86:/NAME/Corner Grocery
:61:2401020102D42,10NMSCNONREF
:86:/NAME/Corner Grocery
:61:2401150115C2500,00NTRFINV-1042
:61:2401310131D19,99NCHGFEE-JAN
:86:/NAME/Example Bank/REMI/Account fee January
:62F:C240131EUR3400,00
:20:STMT20240229
:25:NL91ABNA0417164300
:28C:00002/001
:60F:C240201EUR3500,00
:61:2402100210D100,00NTRFRENT-FEB
:86:?20Rent February?32Landlord BV
:62F:C240229EUR3400,00
`;
}
