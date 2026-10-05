// ISO 20022 camt.053 (bank-to-customer statement) checker and CSV converter. Pure functions, no I/O, no network.
// The element names are read from memory of the public camt.053 message (versions .001.02 to .001.08 share
// them); banks fill the optional parts differently, so confirm against your bank's own implementation guide.
// Nothing here asks a bank or an accounting product anything.

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(b).replace(/^﻿/, "");
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(b) : utf8;
}

export function looksLikeMt940(text) {
  return /^\s*(?:\{1:|:20:)/m.test(text) && /:6[02][FM]:/.test(text);
}

// Decimal text -> integer scaled by 100000 (camt allows up to 5 fraction digits), so sums are exact.
export function parseAmount(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\d+(\.\d{1,5})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  return Number(i) * 100000 + Number((f + "00000").slice(0, 5));
}

export function fmtAmount(scaled) {
  const neg = scaled < 0, a = Math.abs(scaled);
  const whole = Math.floor(a / 100000);
  let frac = String(a % 100000).padStart(5, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return (neg ? "-" : "") + whole + "." + frac;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (s) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e]);

// A small tolerant XML reader: element tree with namespace prefixes dropped and a line number per element.
// Returns { root, error }. It is not a validator; it reports only the first structural fault it meets.
export function parseXml(text) {
  const src = text.replace(/^﻿/, "");
  const lineAt = (pos) => { let n = 1; for (let i = 0; i < pos; i++) if (src.charCodeAt(i) === 10) n++; return n; };
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)|(<)/g;
  const top = { name: "#root", children: [], text: "", line: 1, attrs: {} };
  const stack = [top];
  let m, lastIdx = 0, error = null;
  // line numbers are computed lazily and incrementally so large files stay linear
  let lp = 0, ln = 1;
  const line = (pos) => { for (; lp < pos; lp++) if (src.charCodeAt(lp) === 10) ln++; return ln; };
  while ((m = re.exec(src))) {
    lastIdx = re.lastIndex;
    if (m[7]) { error = { line: line(m.index), msg: "A '<' that does not start a tag" }; break; }
    if (m[1] !== undefined) { stack[stack.length - 1].text += m[1]; continue; }
    if (m[6] !== undefined) { stack[stack.length - 1].text += unescapeXml(m[6]); continue; }
    if (m[3] === undefined) continue; // comment, PI, doctype
    const name = m[3].replace(/^.*:/, "");
    if (m[2]) {
      const open = stack.pop();
      if (stack.length === 0 || open.name !== name) {
        error = { line: line(m.index), msg: `Closing tag </${name}> does not match <${open.name}> opened on line ${open.line}` };
        break;
      }
    } else {
      const attrs = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1].replace(/^.*:/, "")] = unescapeXml(a[3] ?? a[4]);
      const el = { name, children: [], text: "", line: line(m.index), attrs };
      stack[stack.length - 1].children.push(el);
      if (!m[5]) stack.push(el);
    }
  }
  if (!error && stack.length > 1) {
    const open = stack[stack.length - 1];
    error = { line: open.line, msg: `<${open.name}> opened here is never closed (the file may be cut off)` };
  }
  return { root: top.children[0] || null, error };
}

const kids = (el, name) => (el ? el.children.filter((c) => c.name === name) : []);
const kid = (el, name) => (el ? el.children.find((c) => c.name === name) : undefined);
const path = (el, ...names) => names.reduce((e, n) => kid(e, n), el);
const txt = (el, ...names) => (path(el, ...names)?.text ?? "").trim();
const dateOf = (el) => (txt(el, "Dt") || txt(el, "DtTm")).slice(0, 10);
const acctId = (a) => txt(a, "Id", "IBAN") || txt(a, "Id", "Othr", "Id");

function readAmt(el) {
  if (!el) return { raw: "", scaled: null, ccy: "" };
  return { raw: el.text.trim(), scaled: parseAmount(el.text), ccy: el.attrs.Ccy || "" };
}
const sign = (ind) => (ind === "DBIT" ? -1 : ind === "CRDT" ? 1 : 0);

function parseEntry(n) {
  const amt = readAmt(kid(n, "Amt"));
  const ind = txt(n, "CdtDbtInd");
  const rvsl = txt(n, "RvslInd").toLowerCase() === "true" || txt(n, "RvslInd") === "1";
  const status = txt(n, "Sts") || txt(n, "Sts", "Cd");
  const tx = kids(path(n, "NtryDtls"), "TxDtls").map((t) => {
    const tamt = readAmt(path(t, "AmtDtls", "TxAmt", "Amt") || path(t, "Amt"));
    const cdtr = kid(t, "RltdPties"), isCredit = ind === "CRDT";
    const party = isCredit ? kid(cdtr, "Dbtr") : kid(cdtr, "Cdtr");
    const partyAcct = isCredit ? kid(cdtr, "DbtrAcct") : kid(cdtr, "CdtrAcct");
    return {
      amount: tamt, line: t.line,
      endToEnd: txt(t, "Refs", "EndToEndId"), mandate: txt(t, "Refs", "MndtId"),
      name: txt(party, "Nm") || txt(party, "Pty", "Nm"), counterpartyAccount: acctId(partyAcct),
      remittance: kids(path(t, "RmtInf"), "Ustrd").map((u) => u.text.trim()).join(" ") || txt(t, "RmtInf", "Strd", "CdtrRefInf", "Ref"),
    };
  });
  const bt = path(n, "BkTxCd");
  const typeCode = txt(bt, "Domn", "Cd") ? [txt(bt, "Domn", "Cd"), txt(bt, "Domn", "Fmly", "Cd"), txt(bt, "Domn", "Fmly", "SubFmlyCd")].filter(Boolean).join("-") : txt(bt, "Prtry", "Cd");
  const sgn = sign(ind) * (rvsl ? -1 : 1);
  return {
    line: n.line, amount: amt, indicator: ind, reversal: rvsl, status,
    booking: dateOf(kid(n, "BookgDt")), value: dateOf(kid(n, "ValDt")),
    signed: amt.scaled == null ? null : sgn * amt.scaled,
    bankRef: txt(n, "AcctSvcrRef"), entryRef: txt(n, "NtryRef"), typeCode,
    txs: tx,
    name: tx.map((t) => t.name).find(Boolean) || "",
    counterpartyAccount: tx.map((t) => t.counterpartyAccount).find(Boolean) || "",
    endToEnd: tx.map((t) => t.endToEnd).find((x) => x && x !== "NOTPROVIDED") || "",
    description: [...new Set(tx.map((t) => t.remittance).filter(Boolean))].join(" | ") || txt(n, "AddtlNtryInf"),
  };
}

export function parseCamt(text) {
  const { root, error } = parseXml(text);
  const out = { error, root, kind: "", statements: [] };
  if (!root) return out;
  const msg = root.name === "Document" ? root.children[0] : root;
  out.kind = msg ? msg.name : "";
  out.namespace = root.attrs.xmlns || "";
  if (!msg) return out;
  for (const s of kids(msg, "Stmt")) {
    const bal = kids(s, "Bal").map((b) => {
      const cd = txt(b, "Tp", "CdOrPrtry", "Cd") || txt(b, "Tp", "CdOrPrtry", "Prtry");
      const a = readAmt(kid(b, "Amt"));
      const ind = txt(b, "CdtDbtInd");
      return { code: cd, amount: a, indicator: ind, signed: a.scaled == null ? null : sign(ind) * a.scaled, date: dateOf(kid(b, "Dt")), line: b.line };
    });
    out.statements.push({
      line: s.line, id: txt(s, "Id") || txt(s, "ElctrncSeqNb"), account: acctId(kid(s, "Acct")), currency: txt(s, "Acct", "Ccy"),
      from: txt(s, "FrToDt", "FrDtTm").slice(0, 10), to: txt(s, "FrToDt", "ToDtTm").slice(0, 10),
      summary: { count: txt(s, "TxsSummry", "TtlNtries", "NbOfNtries"), credits: txt(s, "TxsSummry", "TtlCdtNtries", "NbOfNtries"), debits: txt(s, "TxsSummry", "TtlDbtNtries", "NbOfNtries"), creditSum: txt(s, "TxsSummry", "TtlCdtNtries", "Sum"), debitSum: txt(s, "TxsSummry", "TtlDbtNtries", "Sum"), line: kid(s, "TxsSummry")?.line },
      balances: bal,
      entries: kids(s, "Ntry").map(parseEntry),
    });
  }
  out.other = { reports: kids(msg, "Rpt").length, notifications: kids(msg, "Ntfctn").length };
  return out;
}

const f = (severity, title, detail, line) => ({ severity, title, detail, line: line || 0 });
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

export function validate(text) {
  const findings = [];
  const blank = { statements: 0, transactions: 0, errors: 0, warnings: 0, currencies: [], credits: 0, debits: 0 };
  const done = (transactions, extra = {}) => {
    const sev = { error: 0, warning: 1, info: 2 };
    findings.sort((a, b) => sev[a.severity] - sev[b.severity] || a.line - b.line);
    return { findings, transactions, summary: { ...blank, errors: findings.filter((x) => x.severity === "error").length, warnings: findings.filter((x) => x.severity === "warning").length, ...extra }, statements: [] };
  };
  if (looksLikeMt940(text)) {
    findings.push(f("error", "This is an MT940 file, not camt.053", "It has :20: and :60F: fields, which is the older SWIFT text format. Use the MT940 statement check for it, or ask your bank for camt.053 XML.", 1));
    return done([]);
  }
  // A bare & (as in "Smith & Sons") is the commonest reason a strict importer refuses an otherwise good file.
  {
    const lines = String(text).split(/\r\n|\n|\r/);
    let inCdata = false, hits = 0, first = 0;
    lines.forEach((ln, i) => {
      if (inCdata) { if (ln.includes("]]>")) inCdata = false; return; }
      const plain = ln.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
      if (plain.includes("<![CDATA[")) inCdata = true;
      if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(plain)) { hits++; if (!first) first = i + 1; }
    });
    if (hits) findings.push(f("error", "Unescaped & in the XML", `${hits} line${hits === 1 ? "" : "s"} contain a bare & (first here). XML requires &amp;, and strict importers refuse the whole file at this point. Fixed automatically in the repaired XML.`, first));
  }
  const p = parseCamt(text);
  if (p.error) {
    findings.push(f("error", "The XML is not well formed", `${p.error.msg}. An importer will refuse the whole file, usually with an unhelpful message.`, p.error.line));
    if (!p.root) return done([]);
  }
  if (!p.root || (p.root.name !== "Document" && !p.statements.length && !/^BkToCstmr/.test(p.root.name))) {
    if (!p.error) findings.push(f("error", "No camt.053 statement found", "The text is not a camt.053 document: the root element should be Document containing BkToCstmrStmt.", p.root?.line || 1));
    return done([]);
  }
  if (p.kind && p.kind !== "BkToCstmrStmt") {
    const names = { BkToCstmrAcctRpt: "camt.052 intraday report", BkToCstmrDbtCdtNtfctn: "camt.054 debit/credit notification" };
    findings.push(f("error", `This is not a camt.053 statement (${names[p.kind] || p.kind})`, "camt.053 is the end-of-day statement with opening and closing balances. This file is a different message, which has no closing balance to check.", p.root.children[0]?.line || 1));
    return done([]);
  }
  if (p.namespace && !/camt\.053/.test(p.namespace)) findings.push(f("warning", "The namespace does not say camt.053", `xmlns is "${p.namespace}". Some importers choose the parser from it and will reject a mismatch.`, p.root.line));
  if (!p.namespace) findings.push(f("warning", "No xmlns namespace on Document", "A camt file normally declares urn:iso:std:iso:20022:tech:xsd:camt.053.001.xx. Importers that check it will refuse the file.", p.root.line));
  if (!p.statements.length) {
    findings.push(f("error", "No Stmt elements", "BkToCstmrStmt contains no statements, so there is nothing to check or import.", p.root.children[0]?.line || 1));
    return done([]);
  }

  const txs = [], currencies = new Set();
  let credits = 0, debits = 0;
  const lastClose = new Map(); // account -> { signed, date, ccy, id }

  for (const st of p.statements) {
    const label = st.id ? `statement ${st.id}` : "a statement";
    if (!st.account) findings.push(f("warning", "Statement has no account", `${label} has no Acct/Id/IBAN (or Othr/Id), so it cannot be matched to a bank account on import.`, st.line));
    if (!st.id) findings.push(f("info", "Statement has no Id", "Stmt/Id is missing; some importers use it to refuse a second import of the same statement.", st.line));
    const op = st.balances.find((b) => b.code === "OPBD") || st.balances.find((b) => b.code === "PRCD");
    const cl = st.balances.find((b) => b.code === "CLBD");
    for (const b of st.balances) {
      if (b.amount.scaled == null) findings.push(f("error", `Balance ${b.code || "?"} amount is not a number`, `"${b.amount.raw}" is not a decimal with a period (camt amounts have no thousands separator and no comma).`, b.line));
      if (b.indicator !== "CRDT" && b.indicator !== "DBIT") findings.push(f("error", `Balance ${b.code || "?"} has no CRDT or DBIT`, `CdtDbtInd is "${b.indicator}". Without it the sign of the balance is unknown.`, b.line));
      if (b.amount.ccy) currencies.add(b.amount.ccy);
    }
    if (!op) findings.push(f("error", "No opening balance (OPBD)", `${label} carries no Bal of type OPBD, so the arithmetic cannot be checked.`, st.line));
    if (!cl) findings.push(f("error", "No closing balance (CLBD)", `${label} carries no Bal of type CLBD, so the arithmetic cannot be checked.`, st.line));

    let net = 0, ok = true, booked = 0, credN = 0, debN = 0, credS = 0, debS = 0;
    const seen = new Map();
    for (const e of st.entries) {
      txs.push({ account: st.account, statement: st.id, ...e });
      if (e.amount.ccy) currencies.add(e.amount.ccy);
      if (e.amount.scaled == null) { findings.push(f("error", "Entry amount is not a number", `"${e.amount.raw}" cannot be read; camt amounts use a period and no thousands separator.`, e.line)); ok = false; continue; }
      if (e.indicator !== "CRDT" && e.indicator !== "DBIT") { findings.push(f("error", "Entry has no CRDT or DBIT", `CdtDbtInd is "${e.indicator}", so its sign is unknown and the balance cannot be proved.`, e.line)); ok = false; continue; }
      const isPending = e.status === "PDNG" || e.status === "INFO";
      if (!e.status) findings.push(f("info", "Entry has no status", "Ntry/Sts is missing. This tool counts the entry as booked; confirm that is right for your bank.", e.line));
      if (!e.booking && !isPending) findings.push(f("warning", "Entry has no booking date", "BookgDt is missing, so an importer has no date to post it on.", e.line));
      for (const [k, v] of [["booking", e.booking], ["value", e.value]]) if (v && !isDate(v)) findings.push(f("error", `Impossible ${k} date`, `"${v}" is not a real YYYY-MM-DD date.`, e.line));
      if (e.booking && st.from && st.to && isDate(e.booking) && (e.booking < st.from || e.booking > st.to)) findings.push(f("warning", "Booking date is outside the statement period", `${e.booking} is not between ${st.from} and ${st.to}, the period this statement says it covers.`, e.line));
      if (cl && e.amount.ccy && cl.amount.ccy && e.amount.ccy !== cl.amount.ccy) findings.push(f("warning", "Entry currency differs from the balance", `${e.amount.ccy} against ${cl.amount.ccy}. Adding them without conversion would be wrong, so the balance check below leaves this entry out.`, e.line));
      else if (!isPending) { net += e.signed; booked++; }
      if (!isPending) { if (e.indicator === "CRDT") { credN++; credS += e.amount.scaled; } else { debN++; debS += e.amount.scaled; } }
      if (e.txs.length > 1 || (e.txs.length === 1 && e.txs[0].amount.scaled != null)) {
        const parts = e.txs.map((t) => t.amount.scaled);
        if (parts.every((x) => x != null)) {
          const sum = parts.reduce((a, b) => a + b, 0);
          if (sum !== e.amount.scaled) findings.push(f("error", "Batch lines do not add up to the entry", `The ${e.txs.length} transaction line(s) total ${fmtAmount(sum)} but the entry says ${fmtAmount(e.amount.scaled)}; difference ${fmtAmount(Math.abs(e.amount.scaled - sum))}.`, e.line));
        }
      }
      const key = [e.booking, e.signed, e.bankRef || e.endToEnd || e.description].join("|");
      if (seen.has(key)) findings.push(f("warning", "Looks like a repeat", `Same date, amount and reference as the entry on line ${seen.get(key)}. Real repeats exist (two identical payments); confirm against the bank before deleting.`, e.line));
      else seen.set(key, e.line);
    }

    if (ok && op && cl && op.signed != null && cl.signed != null) {
      const expect = op.signed + net;
      if (expect !== cl.signed) {
        const diff = cl.signed - expect;
        findings.push(f("error", "Balances do not add up", `Opening ${fmtAmount(op.signed)} plus ${booked} booked entr${booked === 1 ? "y" : "ies"} (${fmtAmount(net)}) is ${fmtAmount(expect)}, but the closing balance says ${fmtAmount(cl.signed)}; difference ${fmtAmount(Math.abs(diff))}${diff > 0 ? " (the closing balance is higher: a credit is missing or a debit is repeated)" : " (the closing balance is lower: a debit is missing or a credit is repeated)"}.`, cl.line));
      }
    }

    // Declared totals against what is actually there.
    const sm = st.summary;
    if (sm.count !== "" && Number(sm.count) !== st.entries.length) findings.push(f("warning", "Entry count does not match", `TxsSummry says ${sm.count} entries but the statement holds ${st.entries.length}.`, sm.line));
    if (sm.credits !== "" && Number(sm.credits) !== credN) findings.push(f("warning", "Credit count does not match", `TxsSummry says ${sm.credits} credit entries but there are ${credN} booked.`, sm.line));
    if (sm.debits !== "" && Number(sm.debits) !== debN) findings.push(f("warning", "Debit count does not match", `TxsSummry says ${sm.debits} debit entries but there are ${debN} booked.`, sm.line));
    for (const [label2, declared, actual] of [["credit", sm.creditSum, credS], ["debit", sm.debitSum, debS]]) {
      const d = parseAmount(declared);
      if (declared !== "" && d != null && d !== actual) findings.push(f("warning", `Total ${label2} sum does not match`, `TxsSummry says ${declared} but the booked ${label2} entries total ${fmtAmount(actual)}.`, sm.line));
    }

    // Continuity: this statement must open where the previous one for the same account closed.
    if (st.account && op && op.signed != null) {
      const prev = lastClose.get(st.account);
      if (prev && prev.ccy === op.amount.ccy && prev.signed !== op.signed && op.code === "OPBD")
        findings.push(f("error", "Statement does not continue", `It opens at ${fmtAmount(op.signed)} but the previous statement for ${st.account}${prev.id ? ` (${prev.id})` : ""} closed at ${fmtAmount(prev.signed)}. A day, a month or a transaction is missing between them.`, op.line));
    }
    if (st.account && cl && cl.signed != null) lastClose.set(st.account, { signed: cl.signed, ccy: cl.amount.ccy, id: st.id });
    for (const e of st.entries) if (e.signed != null && !(e.status === "PDNG" || e.status === "INFO")) { if (e.signed > 0) credits += e.signed; else debits += e.signed; }
  }
  findings.sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.severity] - { error: 0, warning: 1, info: 2 }[b.severity]) || a.line - b.line);
  return {
    findings, transactions: txs, statements: p.statements,
    summary: { statements: p.statements.length, transactions: txs.length, errors: findings.filter((x) => x.severity === "error").length, warnings: findings.filter((x) => x.severity === "warning").length, currencies: [...currencies].sort(), credits, debits },
  };
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// Repairs only what the file itself proves: a comma decimal inside <Amt>/<Sum> becomes a period, and a bare &
// becomes &amp; (CDATA is left alone). Totals, entries and indicators are never touched.
export function repair(text) {
  const changes = [];
  let n = 0;
  let out = String(text).replace(/^\uFEFF/, "").replace(/(<(?:\w+:)?(?:Amt|Sum)\b[^>]*>)\s*(\d+),(\d{1,5})\s*(<)/g, (_, o, i, f, c) => { n++; return `${o}${i}.${f}${c}`; });
  if (n) changes.push(`${n} amount${n === 1 ? "" : "s"} written with a period instead of a comma`);
  let amps = 0;
  out = out.replace(/(<!\[CDATA\[[\s\S]*?\]\]>)|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, (m, cdata) => { if (cdata) return cdata; amps++; return "&amp;"; });
  if (amps) changes.push(`${amps} bare ampersand${amps === 1 ? "" : "s"} escaped`);
  return { text: out, changes };
}

export function toCsv(res, { decimal = "." } = {}) {
  const head = ["account", "statement", "booking_date", "value_date", "amount", "currency", "status", "reversal", "end_to_end_id", "bank_reference", "type_code", "counterparty", "counterparty_account", "description"];
  const rows = res.transactions.map((t) => {
    let amt = t.signed == null ? "" : fmtAmount(t.signed);
    if (decimal === ",") amt = amt.replace(".", ",");
    return [t.account, t.statement, t.booking, t.value, amt, t.amount.ccy, t.status, t.reversal ? "yes" : "", t.endToEnd, t.bankRef, t.typeCode, t.name, t.counterpartyAccount, t.description].map(csvCell).join(",");
  });
  return [head.join(","), ...rows].join("\r\n") + "\r\n";
}

export function findingsCsv(res) {
  return ["severity,line,problem,detail", ...res.findings.map((x) => [x.severity, x.line || "", x.title, x.detail].map(csvCell).join(","))].join("\r\n") + "\r\n";
}

// ---- samples (made-up data) ----
const amt = (v, ccy = "EUR") => `<Amt Ccy="${ccy}">${v}</Amt>`;
const bal = (cd, v, ind, dt, ccy) => `<Bal><Tp><CdOrPrtry><Cd>${cd}</Cd></CdOrPrtry></Tp>${amt(v, ccy)}<CdtDbtInd>${ind}</CdtDbtInd><Dt><Dt>${dt}</Dt></Dt></Bal>`;
const ntry = (v, ind, bk, ref, name, rmt, { ccy = "EUR", noBook = false, ntryAmt } = {}) =>
  `<Ntry>${amt(ntryAmt ?? v, ccy)}<CdtDbtInd>${ind}</CdtDbtInd><Sts>BOOK</Sts>${noBook ? "" : `<BookgDt><Dt>${bk}</Dt></BookgDt>`}<ValDt><Dt>${bk}</Dt></ValDt><AcctSvcrRef>${ref}</AcctSvcrRef><BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>${ind === "DBIT" ? "ICDT" : "RCDT"}</Cd><SubFmlyCd>ESCT</SubFmlyCd></Fmly></Domn></BkTxCd><NtryDtls><TxDtls><Refs><EndToEndId>E2E-${ref}</EndToEndId></Refs>${amt(v, ccy)}<RltdPties>${ind === "DBIT" ? "<Cdtr>" : "<Dbtr>"}<Nm>${name}</Nm>${ind === "DBIT" ? "</Cdtr>" : "</Dbtr>"}</RltdPties><RmtInf><Ustrd>${rmt}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`;
const stmt = (id, from, to, openV, openInd, closeV, closeInd, entries, summary = "") =>
  `<Stmt><Id>${id}</Id><FrToDt><FrDtTm>${from}T00:00:00</FrDtTm><ToDtTm>${to}T23:59:59</ToDtTm></FrToDt><Acct><Id><IBAN>NL91ABNA0417164300</IBAN></Id><Ccy>EUR</Ccy></Acct>${bal("OPBD", openV, openInd, from)}${bal("CLBD", closeV, closeInd, to)}${summary}${entries}</Stmt>`;
const wrap = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><GrpHdr><MsgId>SAMPLE</MsgId><CreDtTm>2024-02-01T06:00:00</CreDtTm></GrpHdr>${body}</BkToCstmrStmt></Document>\n`
    .replace(/<(Stmt|Bal|Ntry|TxsSummry|GrpHdr)>/g, "\n  <$1>");

export function sampleFile() {
  return wrap(stmt("2024-001", "2024-01-01", "2024-01-31", "1000.00", "CRDT", "3437.91", "CRDT",
    ntry("42.10", "DBIT", "2024-01-02", "R1", "Office Supplies BV", "Invoice 1042") +
    ntry("2500.00", "CRDT", "2024-01-15", "R2", "Client One BV", "Invoice 7") +
    ntry("19.99", "DBIT", "2024-01-20", "R3", "Cloud Hosting", "Hosting January"),
    "<TxsSummry><TtlNtries><NbOfNtries>3</NbOfNtries></TtlNtries><TtlCdtNtries><NbOfNtries>1</NbOfNtries><Sum>2500.00</Sum></TtlCdtNtries><TtlDbtNtries><NbOfNtries>2</NbOfNtries><Sum>62.09</Sum></TtlDbtNtries></TxsSummry>"));
}

export function sampleBrokenFile() {
  // January: one entry listed twice (so the arithmetic is 42.10 off), one with no booking date, a declared count of 5 for 4 entries.
  // February: opens at 3500.00 although January closed at 3437.91; its batch line is 19.99 but the entry 20.99.
  return wrap(
    stmt("2024-001", "2024-01-01", "2024-01-31", "1000.00", "CRDT", "3437.91", "CRDT",
      ntry("42.10", "DBIT", "2024-01-02", "R1", "Office Supplies BV", "Invoice 1042") +
      ntry("42.10", "DBIT", "2024-01-02", "R1", "Office Supplies BV", "Invoice 1042") +
      ntry("2500.00", "CRDT", "2024-01-15", "R2", "Client One BV", "Invoice 7") +
      ntry("19.99", "DBIT", "2024-01-20", "R3", "Cloud Hosting", "Hosting January", { noBook: true }),
      "<TxsSummry><TtlNtries><NbOfNtries>5</NbOfNtries></TtlNtries></TxsSummry>") +
    stmt("2024-002", "2024-02-01", "2024-02-29", "3500.00", "CRDT", "3479.01", "CRDT",
      ntry("19.99", "DBIT", "2024-02-20", "R4", "Cloud Hosting", "Hosting February", { ntryAmt: "20.99" })));
}
