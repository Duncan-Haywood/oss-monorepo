// camt.053 / MT940 to OFX (QBO), QIF and Xero CSV converter: ISO 20022 camt.053 (XML) and SWIFT MT940 (text) are
// read into one statement model, balance-checked, then written as the import files QuickBooks, Quicken, Xero
// and similar tools accept. Pure functions, no DOM, no network.
// The OFX/QIF/Xero layouts are read from memory of the public import help; nothing here ran against a live import.
// Layouts and rules are read from memory of the public ISO 20022 and SWIFT documents; no real bank file or
// bank validator was available.

const EXP = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, HUF: 2, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3 };
const expOf = (cur) => EXP[cur] ?? 2;

export const IBAN_LENGTHS = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27,
  GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31,
  NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};

export function mod97(s) {
  let r = 0;
  for (const ch of s) {
    const v = ch >= "A" ? ch.charCodeAt(0) - 55 : Number(ch);
    r = (v > 9 ? r * 100 + v : r * 10 + v) % 97;
  }
  return r;
}

// null when the string is not shaped like an IBAN at all (an MT940 :25: is often a BLZ/account pair).
export function ibanState(raw) {
  const iban = String(raw).replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$/.test(iban)) return null;
  const len = IBAN_LENGTHS[iban.slice(0, 2)];
  if (!len) return { ok: false, why: "country code not in the list this tool knows", iban };
  if (iban.length !== len) return { ok: false, why: `${iban.slice(0, 2)} IBANs are ${len} characters, this has ${iban.length}`, iban };
  return mod97(iban.slice(4) + iban.slice(0, 4)) === 1 ? { ok: true, iban } : { ok: false, why: "check digits do not match (mod-97)", iban };
}

export const maskAccount = (a) => { const s = String(a).replace(/\s+/g, ""); return s.length > 4 ? "…" + s.slice(-4) : s; };

// Decimal text ("1234.56" or "1234,56") to whole minor units without floating point.
export function toMinor(text, cur) {
  const e = expOf(cur);
  const m = /^(\d+)(?:[.,](\d*))?$/.exec(String(text).trim());
  if (!m) return null;
  const frac = m[2] || "";
  if (frac.length > e && /[1-9]/.test(frac.slice(e))) return null;
  return Number(m[1]) * 10 ** e + (e ? Number(frac.slice(0, e).padEnd(e, "0")) : 0);
}

export function money(n, cur = "EUR") {
  const e = expOf(cur), s = String(Math.abs(n)).padStart(e + 1, "0");
  const whole = (e ? s.slice(0, -e) : s).replace(/\B(?=(\d{3})+$)/g, ",");
  return (n < 0 ? "-" : "") + (e ? `${whole}.${s.slice(-e)}` : whole);
}

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const yymmdd = (s) => (/^\d{6}$/.test(s) && validDate(2000 + +s.slice(0, 2), +s.slice(2, 4), +s.slice(4)) ? `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4)}` : "");
const isoDay = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim()); return m && validDate(+m[1], +m[2], +m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : ""; };

// ---- minimal XML reader: enough to walk a payment file, tracks line numbers and content spans ----
function parseXml(text) {
  const errors = [];
  const root = { name: "#root", children: [], line: 1, text: "" };
  const stack = [root];
  const lineAt = (i) => text.slice(0, i).split("\n").length;
  let i = 0;
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    i = m.index;
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2] !== undefined) {
      if (top.name !== m[2]) {
        errors.push({ line: lineAt(i), msg: `Closing tag </${m[2]}> does not match the open <${top.name}>` });
        const k = stack.map((n) => n.name).lastIndexOf(m[2]);
        if (k > 0) stack.length = k;
      } else { top.contentEnd = i; stack.pop(); }
    } else if (m[3] !== undefined) {
      const attrs = {};
      for (const a of (m[4] || "").matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = a[2] ?? a[3];
      const el = { name: m[3].replace(/^.*:/, ""), attrs, children: [], line: lineAt(i), text: "", contentStart: m.index + m[0].length };
      top.children.push(el);
      if (m[5] === "/") { el.contentEnd = el.contentStart; el.selfClosed = true; } else stack.push(el);
    } else if (m[6] !== undefined) {
      if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[6])) errors.push({ line: lineAt(i), msg: "A bare & in the text; it must be written &amp; in XML" });
      top.text += m[6].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    }
  }
  for (const n of stack.slice(1)) errors.push({ line: n.line, msg: `<${n.name}> is never closed` });
  return { root, errors };
}

const kids = (n, name) => (n ? n.children.filter((c) => c.name === name) : []);
const kid = (n, name) => kids(n, name)[0];
const path = (n, ...names) => names.reduce((x, nm) => (x ? kid(x, nm) : undefined), n);
const val = (n) => (n ? n.text.trim() : "");

// ---------------------------------------------------------------- camt.053 (XML)
function camtDay(n) {
  const d = kid(n, "Dt") || kid(n, "DtTm");
  return d ? isoDay(val(d)) : "";
}

function parseCamt(text, add) {
  const { root, errors } = parseXml(text);
  for (const e of errors) add("error", "XML", e.line, "XML is not well-formed", e.msg + ". An import stops at the first of these.");
  const doc = root.children.find((c) => c.name === "Document");
  const container = doc && doc.children.find((c) => /^BkToCstmr/.test(c.name));
  if (!doc || !container) {
    add("error", "STRUCTURE", 1, "No camt statement found", "Expected <Document> wrapping <BkToCstmrStmt> (camt.053), <BkToCstmrAcctRpt> (camt.052) or <BkToCstmrDbtCdtNtfctn> (camt.054).");
    return { statements: [], version: "" };
  }
  const ver = /camt\.(\d{3}\.\d{3}\.\d{2})/.exec((doc.attrs && doc.attrs.xmlns) || "");
  const statements = [];
  for (const st of container.children.filter((c) => ["Stmt", "Rpt", "Ntfctn"].includes(c.name))) {
    const acct = kid(st, "Acct");
    const account = val(path(acct, "Id", "IBAN")) || val(path(acct, "Id", "Othr", "Id"));
    const currency = val(kid(acct, "Ccy")) || "EUR";
    const s = { format: "camt", line: st.line, id: val(kid(st, "Id")), account, currency, seq: val(kid(st, "ElctrncSeqNb")), opening: null, closing: null, entries: [], skipped: 0 };
    if (!account) add("warning", "ACCOUNT", st.line, "Statement has no account IBAN or id", "Acct/Id/IBAN is how a bookkeeping tool matches the statement to a bank account.");
    for (const b of kids(st, "Bal")) {
      const code = val(path(b, "Tp", "CdOrPrtry", "Cd"));
      const amtEl = kid(b, "Amt"), cur = (amtEl && amtEl.attrs && amtEl.attrs.Ccy) || currency;
      const minor = toMinor(val(amtEl), cur);
      if (minor === null) { add("error", "AMOUNT", b.line, `Balance ${code || "?"} amount "${val(amtEl)}" is not a decimal number`); continue; }
      const sign = val(kid(b, "CdtDbtInd")) === "DBIT" ? -1 : 1;
      const rec = { amount: sign * minor, currency: cur, date: camtDay(b), line: b.line, kind: code };
      if (code === "OPBD" || code === "PRCD") s.opening = s.opening && s.opening.kind === "OPBD" ? s.opening : rec;
      if (code === "CLBD") s.closing = rec;
    }
    for (const n of kids(st, "Ntry")) {
      const amtEl = kid(n, "Amt"), cur = (amtEl && amtEl.attrs && amtEl.attrs.Ccy) || currency;
      const minor = toMinor(val(amtEl), cur);
      if (minor === null) { add("error", "AMOUNT", n.line, `Entry amount "${val(amtEl)}" is not a decimal number`, "Amounts in camt files use a dot and at most the currency's decimals."); continue; }
      const stsEl = kid(n, "Sts");
      const status = (val(kid(stsEl, "Cd")) || val(stsEl) || "BOOK").toUpperCase();
      const reversal = val(kid(n, "RvslInd")).toLowerCase() === "true";
      const credit = val(kid(n, "CdtDbtInd")) !== "DBIT";
      if (!["CRDT", "DBIT"].includes(val(kid(n, "CdtDbtInd")))) add("error", "DIRECTION", n.line, "Entry has no CRDT/DBIT indicator", "Without it the sign of the amount is unknown.");
      const tx = kids(kid(n, "NtryDtls"), "TxDtls");
      const texts = [];
      let counterparty = "", ref = "";
      for (const t of tx) {
        const party = credit ? "Dbtr" : "Cdtr";
        counterparty = counterparty || val(path(t, "RltdPties", party, "Nm")) || val(path(t, "RltdPties", party, "Pty", "Nm"));
        ref = ref || val(path(t, "Refs", "EndToEndId")) || val(path(t, "Refs", "InstrId"));
        for (const u of kids(kid(t, "RmtInf"), "Ustrd")) texts.push(val(u));
        const r = val(path(t, "RmtInf", "Strd", "CdtrRefInf", "Ref")); if (r) texts.push(r);
        if (val(kid(t, "AddtlTxInf"))) texts.push(val(kid(t, "AddtlTxInf")));
      }
      if (!texts.length && val(kid(n, "AddtlNtryInf"))) texts.push(val(kid(n, "AddtlNtryInf")));
      const e = {
        line: n.line, bookDate: "", valueDate: "", amount: (credit !== reversal ? 1 : -1) * minor,
        currency: cur, reversal, status, ref: ref === "NOTPROVIDED" ? "" : ref, bankRef: val(kid(n, "AcctSvcrRef")) || val(kid(n, "NtryRef")), counterparty, text: texts.filter(Boolean).join(" ").replace(/\s+/g, " "),
      };
      e.bookDate = kid(n, "BookgDt") ? camtDay(kid(n, "BookgDt")) : "";
      e.valueDate = kid(n, "ValDt") ? camtDay(kid(n, "ValDt")) : "";
      if (kid(n, "BookgDt") && !e.bookDate) add("error", "DATE", n.line, `Booking date "${val(path(n, "BookgDt", "Dt")) || val(path(n, "BookgDt", "DtTm"))}" is not a valid date`);
      if (kid(n, "ValDt") && !e.valueDate) add("error", "DATE", n.line, "Value date is not a valid date");
      // An entry that carries transaction details should match their sum.
      if (tx.length > 1) {
        let sum = 0, ok = true;
        for (const t of tx) { const a = kid(t, "Amt") || path(t, "AmtDtls", "TxAmt", "Amt"); const m = a ? toMinor(val(a), cur) : null; if (m === null) ok = false; else sum += m; }
        if (ok && sum !== minor) add("warning", "SPLIT", n.line, `Entry amount ${money(minor, cur)} but its ${tx.length} transaction details add to ${money(sum, cur)}`, "A batch booking whose parts do not add up to the booked total.");
      }
      s.entries.push(e);
    }
    statements.push(s);
  }
  return { statements, version: ver ? `camt.${ver[1]}` : "camt" };
}

// ---------------------------------------------------------------- MT940 (text)
function mtBalance(v, line, add, tag) {
  const m = /^([CD])(\d{6})([A-Z]{3})([\d,]+)$/.exec(v.trim());
  if (!m) { add("error", "BALANCE", line, `:${tag}: balance "${v.trim()}" does not match C/D, YYMMDD, currency, amount with a comma`, "Example: C261003EUR1234,56"); return null; }
  const minor = toMinor(m[4], m[3]);
  if (minor === null) { add("error", "AMOUNT", line, `:${tag}: amount "${m[4]}" has more decimals than ${m[3]} allows`); return null; }
  if (!yymmdd(m[2])) add("error", "DATE", line, `:${tag}: date ${m[2]} is not a valid YYMMDD date`);
  return { amount: (m[1] === "D" ? -1 : 1) * minor, currency: m[3], date: yymmdd(m[2]), line, kind: tag };
}

function parseMt940(text, add) {
  let body = text.replace(/\r\n?/g, "\n");
  const env = /\{4:\s*([\s\S]*?)\n?-?\}/.exec(body);
  if (env) body = env[1];
  const statements = [];
  let st = null, tag = null;
  const lines = body.split("\n");
  const flush = () => { tag = null; };
  lines.forEach((raw, idx) => {
    const line = idx + 1, t = raw.replace(/\s+$/, "");
    const m = /^:(\d{2}[A-Z]?):(.*)$/.exec(t);
    if (m) {
      const [, code, rest] = m;
      if (code === "20") { st = { format: "mt940", line, id: rest.trim(), account: "", currency: "", seq: "", opening: null, closing: null, entries: [], skipped: 0, _last: null }; statements.push(st); tag = null; return; }
      if (!st) { add("error", "STRUCTURE", line, `:${code}: field before any :20: statement reference`); return; }
      tag = code;
      if (code === "25" || code === "25P") st.account = rest.trim().replace(/^\/+/, "");
      else if (code === "28C") st.seq = rest.trim();
      else if (code === "60F" || code === "60M") { st.opening = mtBalance(rest, line, add, code); if (st.opening) st.currency = st.opening.currency; }
      else if (code === "62F" || code === "62M") st.closing = mtBalance(rest, line, add, code);
      else if (code === "61") {
        const x = /^(\d{6})(\d{4})?(R?[CD])([A-Z])?(\d+,\d*)(N[A-Z0-9]{3}|F[A-Z0-9]{3}|S[A-Z0-9]{3})([^\n]*?)(?:\/\/(.*))?$/.exec(rest.trim());
        if (!x) { add("error", "ENTRY", line, `:61: statement line is not in the expected layout`, `Expected value date YYMMDD, optional entry date MMDD, C/D (or RC/RD), amount with a comma, transaction type (N/F/S plus 3 characters), then references. Found: "${rest.trim().slice(0, 50)}"`); st._last = null; return; }
        const cur = st.currency || (st.closing && st.closing.currency) || "EUR";
        const minor = toMinor(x[5], cur);
        if (minor === null) { add("error", "AMOUNT", line, `:61: amount "${x[5]}" has more decimals than ${cur} allows`); st._last = null; return; }
        const sign = { C: 1, D: -1, RC: -1, RD: 1 }[x[3]];
        const vd = yymmdd(x[1]);
        if (!vd) add("error", "DATE", line, `:61: value date ${x[1]} is not a valid YYMMDD date`);
        let bd = "";
        if (x[2] && vd) {
          let y = +vd.slice(0, 4);
          const vm = +vd.slice(5, 7), bm = +x[2].slice(0, 2);
          if (bm - vm > 6) y -= 1; else if (vm - bm > 6) y += 1;
          bd = validDate(y, bm, +x[2].slice(2)) ? `${y}-${x[2].slice(0, 2)}-${x[2].slice(2)}` : "";
          if (!bd) add("error", "DATE", line, `:61: entry date ${x[2]} is not a valid MMDD date`);
        }
        const e = { line, bookDate: bd || vd, valueDate: vd, amount: sign * minor, currency: cur, reversal: x[3][0] === "R", status: "BOOK", ref: x[7].trim(), bankRef: (x[8] || "").trim(), counterparty: "", text: "", code: x[6] };
        st.entries.push(e); st._last = e;
      } else if (code === "86") { if (st._last) st._last.text = rest.trim(); }
      return;
    }
    if (t === "-" || t === "") { flush(); return; }
    if (st && (tag === "86") && st._last) st._last.text += " " + t.trim();
    else if (st && tag === "61" && st._last) st._last.supplementary = t.trim();
    else if (/\S/.test(t)) add("warning", "STRAY", line, "Line is not part of a tagged field", `"${t.trim().slice(0, 40)}"`);
  });
  for (const s of statements) {
    for (const e of s.entries) {
      const sub = {};
      for (const p of (e.text || "").split(/\?(\d{2})/).slice(1).reduce((a, v, i, arr) => (i % 2 === 0 ? [...a, [v, arr[i + 1]]] : a), [])) sub[p[0]] = (sub[p[0]] || "") + p[1];
      if (Object.keys(sub).length) {
        e.counterparty = ((sub["32"] || "") + (sub["33"] || "")).trim();
        e.text = ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "60", "61", "62", "63"].map((k) => sub[k] || "").join("").replace(/\s+/g, " ").trim();
      }
    }
    delete s._last;
    if (!s.account) add("warning", "ACCOUNT", s.line, "Statement has no :25: account", "The account is how a bookkeeping tool matches the statement to a bank account.");
  }
  return { statements, version: "MT940" };
}

// ---------------------------------------------------------------- checks
export function analyze(text) {
  const findings = [];
  const add = (severity, code, line, title, detail = "") => findings.push({ severity, code, line, title, detail });
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) { add("error", "EMPTY", 0, "Nothing to read"); return { findings, statements: [], format: "", summary: summarize([], "") }; }
  const isXml = trimmed.startsWith("<");
  const parsed = isXml ? parseCamt(text.replace(/^﻿/, ""), add) : parseMt940(text.replace(/^﻿/, ""), add);
  if (!isXml && !parsed.statements.length) add("error", "STRUCTURE", 1, "No MT940 statement found", "Expected tagged lines like :20:REF, :25:ACCOUNT, :60F:C261001EUR100,00, :61: entries and :62F: closing balance. camt files start with <.");

  const stmts = parsed.statements;
  for (const s of stmts) {
    const label = `Statement ${s.id || "(no id)"}${s.account ? ` (${maskAccount(s.account)})` : ""}`;
    const ib = s.account ? ibanState(s.account) : null;
    if (ib && !ib.ok) add("warning", "IBAN", s.line, `${label}: account IBAN looks wrong`, `${ib.why}. A statement for a mistyped IBAN will not match the account in your books.`);
    const booked = s.entries.filter((e) => e.status === "BOOK");
    s.skipped = s.entries.length - booked.length;
    if (s.skipped) add("info", "PENDING", s.line, `${label}: ${s.skipped} entr${s.skipped === 1 ? "y is" : "ies are"} not booked (pending or informational)`, "They are listed but left out of the balance check.");
    for (const e of s.entries) {
      if (e.currency !== (s.opening ? s.opening.currency : s.currency)) add("warning", "CURRENCY", e.line, `Entry in ${e.currency} on a ${s.opening ? s.opening.currency : s.currency} statement`, "The balance check adds raw amounts and would be meaningless across currencies.");
    }
    if (s.opening && s.closing) {
      const net = booked.reduce((a, e) => a + e.amount, 0);
      const want = s.opening.amount + net;
      if (want !== s.closing.amount) {
        const cur = s.closing.currency;
        add("error", "BALANCE", s.closing.line, `${label}: opening ${money(s.opening.amount, cur)} plus entries ${money(net, cur)} is ${money(want, cur)}, closing says ${money(s.closing.amount, cur)} (off by ${money(s.closing.amount - want, cur)})`, `A single missing, duplicated or edited entry of exactly ${money(Math.abs(s.closing.amount - want), cur)} would explain it. ${booked.length} booked entr${booked.length === 1 ? "y" : "ies"} were summed.`);
      }
    } else if (stmts.length) add("warning", "BALANCE", s.line, `${label}: no ${!s.opening ? "opening" : "closing"} balance, so the entries cannot be checked`);
    const seen = new Map();
    for (const e of booked) {
      const key = e.bankRef || e.ref;
      if (!key || key === "NONREF") continue;
      if (seen.has(key)) add("warning", "DUP_REF", e.line, `Reference ${key} repeats the entry at line ${seen.get(key)}`, `${label}: two entries with the same reference may be a duplicated line.`);
      else seen.set(key, e.line);
    }
  }
  // Statements of one account in file order should join up: yesterday's closing is today's opening.
  const lastBy = new Map();
  for (const s of stmts) {
    const k = s.account;
    if (!k || !s.opening || !s.closing) continue;
    const prev = lastBy.get(k);
    if (prev && prev.closing.amount !== s.opening.amount) add("warning", "CONTINUITY", s.opening.line, `Account ${maskAccount(k)}: opening ${money(s.opening.amount, s.opening.currency)} does not match the previous statement's closing ${money(prev.closing.amount, prev.closing.currency)}`, "A statement for the days in between may be missing from the file.");
    lastBy.set(k, s);
  }
  return { findings, statements: stmts, format: parsed.version, summary: summarize(stmts, parsed.version) };
}

function summarize(stmts, format) {
  return {
    format, statements: stmts.length,
    entries: stmts.reduce((a, s) => a + s.entries.length, 0),
    currencies: [...new Set(stmts.map((s) => s.currency).filter(Boolean))],
  };
}

export function validate(text) {
  const r = analyze(text);
  r.findings.sort((a, b) => (a.line || 0) - (b.line || 0));
  if (!r.findings.some((x) => x.severity === "error")) r.findings.push({ severity: "info", code: "CLEAN", line: 0, title: "Balances and entries are consistent", detail: "Each statement's opening balance plus its booked entries equals its closing balance. This is a consistency check, not a promise that your bookkeeping software will import the file." });
  return r;
}

// ---------------------------------------------------------------- export
const csvText = (s) => {
  let v = String(s);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return `"${v.replace(/"/g, '""')}"`;
};
const dec = (n, cur) => {
  const e = expOf(cur), s = String(Math.abs(n)).padStart(e + 1, "0");
  return (n < 0 ? "-" : "") + (e ? `${s.slice(0, -e)}.${s.slice(-e)}` : s);
};

export function transactionsCsv(result, { maskAccounts = true } = {}) {
  const rows = [["statement", "account", "booking_date", "value_date", "amount", "currency", "status", "reversal", "counterparty", "reference", "bank_reference", "text"].join(",")];
  for (const s of result.statements) for (const e of s.entries) {
    rows.push([csvText(s.id), csvText(maskAccounts ? maskAccount(s.account) : s.account), e.bookDate, e.valueDate, dec(e.amount, e.currency), e.currency, e.status, e.reversal ? "yes" : "", csvText(e.counterparty), csvText(e.ref), csvText(e.bankRef), csvText(e.text)].join(","));
  }
  return rows.join("\n") + "\n";
}

export function findingsCsv(result) {
  const rows = [["severity", "code", "line", "title", "detail"].join(",")];
  for (const x of result.findings) rows.push([x.severity, x.code, x.line || "", csvText(x.title), csvText(x.detail)].join(","));
  return rows.join("\n") + "\n";
}

export function decodeBuffer(buf) {
  return new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
}

// ---------------------------------------------------------------- converters
// One file per statement: OFX has one account and one currency per statement block, and QuickBooks and
// Quicken import one account per file.
const ascii = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^\x20-\x7e]/g, "?");
const ofxText = (s) => ascii(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s+/g, " ").trim();
const ymd = (iso) => iso.replace(/-/g, "");

function hash36(str) {
  let h = 5381;
  for (const ch of str) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36).toUpperCase().padStart(7, "0");
}

// Entries to export: booked ones, in date order, each with a stable FITID. QuickBooks and Quicken skip an
// entry whose FITID they have seen, so the id must be the same when the same statement is converted twice and
// different for two genuinely identical payments on one day (the sequence suffix).
export function exportEntries(statement, { includePending = false } = {}) {
  const seen = new Map();
  const rows = statement.entries
    .filter((e) => includePending || e.status === "BOOK")
    .map((e) => {
      const date = e.bookDate || e.valueDate;
      const base = hash36([statement.account, date, e.amount, e.currency, e.bankRef, e.ref, e.text, e.counterparty].join("|"));
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return { ...e, date, name: e.counterparty || e.text || e.ref || "Bank entry", fitid: `${ymd(date || "00000000")}${base}${n > 1 ? "-" + n : ""}` };
    })
    .filter((e) => e.date);
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function accountId(statement, { fullAccount = false } = {}) {
  const a = String(statement.account || "").replace(/\s+/g, "");
  if (!a) return "UNKNOWN";
  return fullAccount ? a.slice(-22) : "XXXX" + a.slice(-4);
}

export function toOfx(statement, o = {}) {
  const rows = exportEntries(statement, o);
  const cur = (statement.currency || (statement.opening && statement.opening.currency) || "EUR").toUpperCase();
  const now = (o.now || new Date().toISOString()).replace(/[-:T]/g, "").slice(0, 14);
  const first = rows[0] ? rows[0].date : now.slice(0, 4) + "-" + now.slice(4, 6) + "-" + now.slice(6, 8);
  const last = rows.length ? rows[rows.length - 1].date : first;
  const type = o.accountType || "checking";
  const card = type === "credit";
  const L = [
    "OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "",
    "<OFX>",
    `<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>${now}<LANGUAGE>ENG<FI><ORG>${ofxText(o.org || "Bank")}<FID>${ofxText(o.fid || "0000")}</FI>${o.intuBid ? `<INTU.BID>${ofxText(o.intuBid)}` : ""}</SONRS></SIGNONMSGSRSV1>`,
    card ? "<CREDITCARDMSGSRSV1><CCSTMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><CCSTMTRS>" : "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS>",
    `<CURDEF>${cur}`,
    card ? `<CCACCTFROM><ACCTID>${ofxText(accountId(statement, o))}</CCACCTFROM>`
      : `<BANKACCTFROM><BANKID>${ofxText(o.bankId || "000000000")}<ACCTID>${ofxText(accountId(statement, o))}<ACCTTYPE>${({ savings: "SAVINGS", moneymrkt: "MONEYMRKT" })[type] || "CHECKING"}</BANKACCTFROM>`,
    `<BANKTRANLIST><DTSTART>${ymd(first)}120000<DTEND>${ymd(last)}120000`,
  ];
  for (const e of rows) {
    const memo = ofxText(e.text || e.ref || "");
    L.push(`<STMTTRN><TRNTYPE>${e.amount < 0 ? "DEBIT" : "CREDIT"}<DTPOSTED>${ymd(e.date)}120000<TRNAMT>${dec(e.amount, e.currency)}<FITID>${e.fitid}<NAME>${ofxText(ascii(e.name).slice(0, 32))}${memo ? `<MEMO>${memo.slice(0, 255)}` : ""}</STMTTRN>`);
  }
  L.push("</BANKTRANLIST>");
  if (statement.closing) L.push(`<LEDGERBAL><BALAMT>${dec(statement.closing.amount, statement.closing.currency)}<DTASOF>${ymd(statement.closing.date || last)}120000</LEDGERBAL>`);
  L.push(card ? "</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>" : "</STMTRS></STMTTRNRS></BANKMSGSRSV1>", "</OFX>");
  return L.join("\r\n") + "\r\n";
}

export function toQif(statement, o = {}) {
  const out = [o.accountType === "credit" ? "!Type:CCard" : "!Type:Bank"];
  for (const e of exportEntries(statement, o)) {
    const [y, m, d] = e.date.split("-");
    out.push(`D${m}/${d}/${y}`, `T${dec(e.amount, e.currency)}`, `P${ascii(e.name).replace(/[\r\n]+/g, " ")}`);
    const memo = ascii(e.text || e.ref || "").replace(/[\r\n]+/g, " ").trim();
    if (memo) out.push(`M${memo}`);
    out.push("^");
  }
  return out.join("\r\n") + "\r\n";
}

const fmtDate = (iso, order) => { const [y, m, d] = iso.split("-"); return order === "dmy" ? `${d}/${m}/${y}` : order === "mdy" ? `${m}/${d}/${y}` : iso; };

// Xero's statement import template: *Date, *Amount, Payee, Description, Reference (Cheque No. is left out).
export function toXeroCsv(statement, o = {}) {
  const rows = [["*Date", "*Amount", "Payee", "Description", "Reference"]];
  for (const e of exportEntries(statement, o)) rows.push([fmtDate(e.date, o.dateOrder || "iso"), dec(e.amount, e.currency), csvText(e.counterparty), csvText(e.text), csvText(e.ref && e.ref !== "NOTPROVIDED" && e.ref !== "NONREF" ? e.ref : e.bankRef)]);
  return rows.map((r, i) => (i ? r.map((c) => (c === '""' ? "" : c)) : r.map(csvText)).join(",")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- samples (synthetic: made-up company and IBANs)
const IBAN_A = "DE89370400440532013000"; // the widely published example IBAN, a valid mod-97 number

export function sampleCamt() {
  const ntry = (amt, ind, bk, val, ref, party, txt, bankref) => `      <Ntry>
        <NtryRef>${bankref}</NtryRef>
        <Amt Ccy="EUR">${amt}</Amt>
        <CdtDbtInd>${ind}</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>${bk}</Dt></BookgDt>
        <ValDt><Dt>${val}</Dt></ValDt>
        <AcctSvcrRef>${bankref}</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>${ref}</EndToEndId></Refs>
          <RltdPties><${ind === "CRDT" ? "Dbtr" : "Cdtr"}><Nm>${party}</Nm></${ind === "CRDT" ? "Dbtr" : "Cdtr"}></RltdPties>
          <RmtInf><Ustrd>${txt}</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>STMT-20261003</MsgId><CreDtTm>2026-10-04T06:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>20261003-001</Id>
      <ElctrncSeqNb>1</ElctrncSeqNb>
      <Acct><Id><IBAN>${IBAN_A}</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">10000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-02</Dt></Dt></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">11464.50</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-03</Dt></Dt></Bal>
${ntry("1500.00", "CRDT", "2026-10-03", "2026-10-03", "RE-2026-1041", "Muster Tischlerei GmbH", "Rechnung 1041 Oktober", "BK0001")}
${ntry("35.50", "DBIT", "2026-10-03", "2026-10-03", "NOTPROVIDED", "Stadtwerke Beispielstadt", "Strom September", "BK0002")}
    </Stmt>
  </BkToCstmrStmt>
</Document>
`;
}

export function sampleMt940() {
  return `:20:STARTUMS
:25:${IBAN_A}
:28C:00001/001
:60F:C261002EUR10000,00
:61:2610031003C1500,00NTRFRE-2026-1041//BK0001
:86:166?00ÜBERWEISUNG?10931?20Rechnung 1041 Oktober?32Muster Tischlerei GmbH
:61:2610031003D35,50NDDTNONREF//BK0002
:86:105?00LASTSCHRIFT?20Strom September?32Stadtwerke Beispielstadt
:62F:C261003EUR11464,50
-
`;
}

export function sampleBroken() {
  // The closing balance edited by hand, one entry's reference duplicated, and an impossible value date.
  return sampleMt940().replace("C261003EUR11464,50", "C261003EUR11564,50").replace("NDDTNONREF//BK0002", "NDDTNONREF//BK0001").replace(":61:2610031003D", ":61:2613031003D");
}
