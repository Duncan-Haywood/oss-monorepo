// SEPA credit transfer (ISO 20022 pain.001) file checker. Pure functions, no DOM, no network.
// Layout and rules are read from memory of the public EPC/ISO 20022 documents; no bank validator was available.

export const IBAN_LENGTHS = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27,
  GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31,
  NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};

const SEPA_CHARS = /^[a-zA-Z0-9/\-?:().,'+ ]*$/;

export function mod97(s) {
  let r = 0;
  for (const ch of s) {
    const v = ch >= "A" ? ch.charCodeAt(0) - 55 : Number(ch);
    r = (v > 9 ? r * 100 + v : r * 10 + v) % 97;
  }
  return r;
}

export function ibanCheck(raw) {
  const iban = String(raw).replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) return { ok: false, reason: "format", iban };
  const cc = iban.slice(0, 2);
  const len = IBAN_LENGTHS[cc];
  if (!len) return { ok: false, reason: "country", iban };
  if (iban.length !== len) return { ok: false, reason: "length", expected: len, iban };
  if (mod97(iban.slice(4) + iban.slice(0, 4)) !== 1) {
    const good = String(98 - mod97(iban.slice(4) + cc + "00")).padStart(2, "0");
    return { ok: false, reason: "checksum", fixDigits: good, iban };
  }
  return { ok: true, iban };
}

export function maskIban(iban) {
  const s = String(iban).replace(/\s+/g, "");
  return s.length > 4 ? "…" + s.slice(-4) : s;
}

export function parseCents(text) {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(text).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0") || 0);
}

export function euros(c) {
  const sign = c < 0 ? "-" : "";
  const a = Math.abs(c);
  return `${sign}${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
}

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

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, mo - 1, da);
}

export function targetClosed(date) {
  const y = date.getUTCFullYear(), t = date.getTime(), day = 86400000, e = easter(y);
  const fixed = [[0, 1], [4, 1], [11, 25], [11, 26]].map(([mo, d]) => Date.UTC(y, mo, d));
  const wd = date.getUTCDay();
  if (wd === 0 || wd === 6) return "a weekend";
  if (fixed.includes(t)) return "a TARGET2 closing day";
  if (t === e - 2 * day) return "Good Friday (TARGET2 closed)";
  if (t === e + day) return "Easter Monday (TARGET2 closed)";
  return null;
}

export function nextBankingDay(date) {
  let d = new Date(date.getTime());
  while (targetClosed(d)) d = new Date(d.getTime() + 86400000);
  return d.toISOString().slice(0, 10);
}

export function decodeBuffer(buf) {
  return new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
}

const BIC = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export function validate(text, { today = new Date() } = {}) {
  const findings = [];
  const add = (severity, line, title, detail) => findings.push({ severity, line, title, detail });
  const summary = { version: "", transactions: 0, pmtInfs: 0, total: 0, payments: [], batchList: [] };
  const { root, errors } = parseXml(text);
  for (const e of errors) add("error", e.line, "XML is not well-formed", e.msg + ". A bank's upload stops at the first of these.");
  const doc = root.children.find((c) => c.name === "Document");
  if (!doc) {
    add("error", 1, "No Document element", "A SEPA credit transfer file starts with <Document xmlns=\"urn:iso:std:iso:20022:tech:xsd:pain.001.001.03\"> and wraps <CstmrCdtTrfInitn>.");
    return { findings, summary };
  }
  const ns = (doc.attrs && doc.attrs.xmlns) || "";
  const ver = /pain\.(\d{3}\.\d{3}\.\d{2})/.exec(ns);
  summary.version = ver ? `pain.${ver[1]}` : ns;
  if (!ver) add("error", doc.line, "Not a pain.00x message", `The namespace "${ns || "(none)"}" is not an ISO 20022 pain.001 payment-initiation schema. Customer credit transfers use pain.001; pain.008 is direct debit and is not checked here.`);
  else if (!/^001\.001\.(03|09)$/.test(ver[1])) add("warning", doc.line, `Schema version pain.${ver[1]}`, "Banks accept a short list of versions, commonly pain.001.001.03 and pain.001.001.09 for SEPA. Check which one your bank's upload page names.");
  const v9 = ver && ver[1].endsWith(".09");
  const init = kid(doc, "CstmrCdtTrfInitn");
  if (!init) { add("error", doc.line, "No CstmrCdtTrfInitn", "The message body element <CstmrCdtTrfInitn> is missing."); return { findings, summary }; }
  const hdr = kid(init, "GrpHdr");
  if (!hdr) add("error", init.line, "No group header", "<GrpHdr> with MsgId, CreDtTm, NbOfTxs, CtrlSum and InitgPty is required.");
  const pmts = kids(init, "PmtInf");
  if (!pmts.length) add("error", init.line, "No payment information blocks", "At least one <PmtInf> is required.");

  const checkText = (n, label, max) => {
    const s = val(n);
    if (!s) return;
    if (s.length > max) add("error", n.line, `${label} is ${s.length} characters`, `The limit is ${max}. Banks reject the file, or truncate the value, over this.`);
    if (!SEPA_CHARS.test(s)) {
      const bad = [...new Set([...s].filter((c) => !SEPA_CHARS.test(c)))].join(" ");
      add("warning", n.line, `${label} has characters outside the SEPA set`, `Found: ${bad}. The basic SEPA set is letters a-z without accents, digits and / - ? : ( ) . , ' + and space. Many banks reject others, some transliterate them.`);
    }
  };

  const seenE2E = new Map();
  const seenPay = new Map();
  let totalTx = 0, totalCents = 0;
  const perPmt = [];
  for (const p of pmts) {
    const txs = kids(p, "CdtTrfTxInf");
    summary.pmtInfs++;
    const id = val(kid(p, "PmtInfId"));
    if (!id) add("error", p.line, "PmtInf without PmtInfId", "Each payment information block needs a PmtInfId of up to 35 characters.");
    checkText(kid(p, "PmtInfId"), "PmtInfId", 35);
    const mtd = val(kid(p, "PmtMtd"));
    if (mtd !== "TRF") add("error", (kid(p, "PmtMtd") || p).line, `PmtMtd is "${mtd || "missing"}"`, "A credit transfer block must say TRF.");
    const svc = val(path(p, "PmtTpInf", "SvcLvl", "Cd"));
    if (svc !== "SEPA") add("error", (path(p, "PmtTpInf") || p).line, `Service level is "${svc || "missing"}"`, "A SEPA payment needs <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>, at block or transaction level.");
    const dEl = v9 ? path(p, "ReqdExctnDt", "Dt") : kid(p, "ReqdExctnDt");
    const d = val(dEl) || val(kid(p, "ReqdExctnDt"));
    let dateLabel = d;
    if (!d) add("error", p.line, "No requested execution date", "ReqdExctnDt is required.");
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) add("error", (dEl || p).line, `Date "${d}" is not YYYY-MM-DD`, "ReqdExctnDt uses the ISO format 2026-10-05.");
    else {
      const dt = new Date(d + "T00:00:00Z");
      const t0 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== d) add("error", dEl.line, `Date ${d} does not exist`, "Check the day and month.");
      else {
        if (dt < t0) add("warning", dEl.line, `Execution date ${d} is in the past`, "Most banks reject it or execute on the next banking day.");
        const why = targetClosed(dt);
        if (why) add("warning", dEl.line, `Execution date ${d} falls on ${why}`, `Settlement moves to the next banking day, ${nextBankingDay(dt)}. Pick that date if the payee's date matters.`);
      }
    }
    const dbtrIban = val(path(p, "DbtrAcct", "Id", "IBAN"));
    const dnode = path(p, "DbtrAcct", "Id", "IBAN") || p;
    if (!dbtrIban) add("error", p.line, "No debtor IBAN", "<DbtrAcct><Id><IBAN> is required: it is the account the money leaves.");
    else { const r = ibanCheck(dbtrIban); if (!r.ok) add("error", dnode.line, `Debtor IBAN ${maskIban(dbtrIban)} is invalid`, ibanReason(r)); }
    const agt = v9 ? path(p, "DbtrAgt", "FinInstnId", "BICFI") : path(p, "DbtrAgt", "FinInstnId", "BIC");
    const agtV = val(agt);
    if (agtV && agtV !== "NOTPROVIDED" && !BIC.test(agtV)) add("error", agt.line, `Debtor BIC "${agtV}" is not a valid BIC`, "A BIC is 8 or 11 characters: 4 letters, 2-letter country, 2 letters or digits, optional 3-character branch.");
    if (!val(path(p, "Dbtr", "Nm"))) add("error", p.line, "No debtor name", "<Dbtr><Nm> is required.");
    checkText(path(p, "Dbtr", "Nm"), "Debtor name", 70);

    let sum = 0, bad = 0;
    for (const t of txs) {
      totalTx++;
      const e2eNode = path(t, "PmtId", "EndToEndId");
      const e2e = val(e2eNode);
      if (!e2e) add("error", t.line, "No EndToEndId", "Every transaction needs a PmtId/EndToEndId (use NOTPROVIDED if you have none).");
      else {
        checkText(e2eNode, "EndToEndId", 35);
        if (e2e !== "NOTPROVIDED") {
          if (seenE2E.has(e2e)) add("warning", e2eNode.line, `EndToEndId "${e2e}" repeats line ${seenE2E.get(e2e)}`, "Not an error to the bank, but it makes the payment impossible to trace by reference on the statement.");
          else seenE2E.set(e2e, e2eNode.line);
        }
      }
      const amtNode = path(t, "Amt", "InstdAmt");
      const amtT = val(amtNode);
      const cents = amtNode ? parseCents(amtT) : null;
      if (!amtNode) add("error", t.line, "No instructed amount", "<Amt><InstdAmt Ccy=\"EUR\"> is required.");
      else if (/^\d+\.\d{3,}$/.test(amtT)) add("error", amtNode.line, `Amount ${amtT} has more than two decimals`, "SEPA amounts have two decimals at most.");
      else if (cents === null) add("error", amtNode.line, `Amount "${amtT}" is not a decimal`, "Use digits and a dot with at most two decimals: 1250.00. No thousands separator, no comma, no minus sign.");
      else {
        if (cents < 1 || cents > 99999999999) add("error", amtNode.line, `Amount ${amtT} is outside 0.01 to 999,999,999.99`, "That is the SEPA credit transfer range.");
        if ((amtNode.attrs || {}).Ccy !== "EUR") add("error", amtNode.line, `Currency "${(amtNode.attrs || {}).Ccy || "missing"}" is not EUR`, "A SEPA credit transfer is in euro only. Use a non-SEPA (international) payment for other currencies.");
        sum += cents; summary.total += cents;
      }
      const cn = path(t, "Cdtr", "Nm");
      if (!val(cn)) add("error", t.line, "No creditor name", "<Cdtr><Nm> is required: the payee name.");
      checkText(cn, "Creditor name", 70);
      const ibNode = path(t, "CdtrAcct", "Id", "IBAN");
      const ib = val(ibNode);
      if (!ib) add("error", t.line, "No creditor IBAN", "<CdtrAcct><Id><IBAN> is required.");
      else {
        const r = ibanCheck(ib);
        if (!r.ok) { bad++; add("error", ibNode.line, `Creditor IBAN ${maskIban(ib)} is invalid`, ibanReason(r)); }
        if (cents !== null) {
          const key = r.iban + "|" + cents;
          if (seenPay.has(key)) add("warning", t.line, `Possible duplicate: same account and amount as line ${seenPay.get(key)}`, "Two payments of the same amount to the same IBAN in one file. Fine for a repeat bill, costly if pasted twice.");
          else seenPay.set(key, t.line);
        }
        summary.payments.push({ line: t.line, name: val(cn), iban: r.iban, cents: cents || 0, ibanOk: r.ok });
      }
      const rmt = kid(t, "RmtInf");
      if (rmt) {
        const u = kids(rmt, "Ustrd"), s = kids(rmt, "Strd");
        if (u.length && s.length) add("error", rmt.line, "Both Ustrd and Strd in RmtInf", "Remittance information is either unstructured or structured, not both.");
        if (u.length > 1) add("warning", rmt.line, "More than one Ustrd", "Only one unstructured remittance line is allowed by most banks.");
        for (const x of u) checkText(x, "Remittance text", 140);
      }
    }
    // block totals
    const nb = kid(p, "NbOfTxs"), cs = kid(p, "CtrlSum");
    if (nb && Number(val(nb)) !== txs.length) add("error", nb.line, `PmtInf NbOfTxs is ${val(nb)} but the block holds ${txs.length}`, "Rebuild it, or a bank that checks it rejects the block.");
    if (cs && parseCents(val(cs)) !== sum) add("error", cs.line, `PmtInf CtrlSum is ${val(cs)} but the amounts add to ${euros(sum)}`, "A hand edit to an amount without the control sum is the usual cause.");
    if (!txs.length) add("error", p.line, "Payment block with no transactions", "<CdtTrfTxInf> is missing.");
    perPmt.push({ node: p, nb, cs, count: txs.length, sum });
    summary.batchList.push({ line: p.line, id, date: dateLabel, count: txs.length, sum, debtor: dbtrIban ? maskIban(dbtrIban) : "" });
    totalCents += sum;
  }
  summary.transactions = totalTx;
  if (hdr) {
    const id = val(kid(hdr, "MsgId"));
    if (!id) add("error", hdr.line, "No MsgId", "GrpHdr/MsgId is required, up to 35 characters, and many banks reject a MsgId they have already seen.");
    checkText(kid(hdr, "MsgId"), "MsgId", 35);
    if (!val(kid(hdr, "CreDtTm"))) add("error", hdr.line, "No CreDtTm", "Creation date and time, like 2026-10-04T09:30:00.");
    const nb = kid(hdr, "NbOfTxs"), cs = kid(hdr, "CtrlSum");
    if (!nb) add("error", hdr.line, "No NbOfTxs in the group header", "The transaction count is required.");
    else if (Number(val(nb)) !== totalTx) add("error", nb.line, `Group NbOfTxs is ${val(nb)} but the file has ${totalTx} transactions`, "Rebuild it, or the bank rejects the whole file.");
    if (cs && parseCents(val(cs)) !== totalCents) add("error", cs.line, `Group CtrlSum is ${val(cs)} but the amounts add to ${euros(totalCents)}`, "A hand edit to an amount without the control sum is the usual cause.");
    if (!val(path(hdr, "InitgPty", "Nm"))) add("warning", hdr.line, "No initiating party name", "InitgPty/Nm is required by most banks.");
    summary.hdr = { nb, cs };
  }
  summary.perPmt = perPmt;
  summary.totalCents = totalCents;
  findings.sort((a, b) => (a.line || 0) - (b.line || 0));
  return { findings, summary };
}

function ibanReason(r) {
  if (r.reason === "format") return "An IBAN is a 2-letter country, 2 check digits and up to 30 letters or digits, with no spaces or punctuation.";
  if (r.reason === "country") return "The country code is not one this tool knows; SEPA countries are checked. A non-SEPA IBAN needs a different payment type.";
  if (r.reason === "length") return `An IBAN for ${r.iban.slice(0, 2)} is ${r.expected} characters; this one is ${r.iban.length}. A character was dropped or added, often a leading zero in the account number.`;
  return `The mod-97 check fails, so a character is wrong or two are swapped. If only the check digits are wrong they would be ${r.fixDigits}, but with a typo elsewhere that would send money to a different account, so confirm with the payee.`;
}

// Rebuild NbOfTxs and CtrlSum only. Never touches an amount, IBAN or name.
export function repair(text) {
  const { findings, summary } = validate(text);
  const edits = [];
  const changes = [];
  const want = (node, value, label) => {
    if (!node || node.contentStart === undefined || node.selfClosed) return;
    if (label.includes("CtrlSum") ? parseCents(val(node)) === Number(value.replace(".", "")) : val(node) === value) return;
    edits.push([node.contentStart, node.contentEnd, value]);
    changes.push(`Line ${node.line}: ${label} ${val(node)} → ${value}`);
  };
  if (!summary.perPmt) return { text: null, changes: [], error: "The file could not be read as a payment file, so there is nothing to rebuild." };
  if (findings.some((f) => f.title === "XML is not well-formed")) return { text: null, changes: [], error: "Fix the XML structure first; control totals cannot be rebuilt from a file that does not parse." };
  for (const p of summary.perPmt) { want(p.nb, String(p.count), "PmtInf NbOfTxs"); want(p.cs, euros(p.sum).replace(/,/g, ""), "PmtInf CtrlSum"); }
  if (summary.hdr) { want(summary.hdr.nb, String(summary.transactions), "Group NbOfTxs"); want(summary.hdr.cs, euros(summary.totalCents).replace(/,/g, ""), "Group CtrlSum"); }
  edits.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [s, e, v] of edits) out = out.slice(0, s) + v + out.slice(e);
  return { text: out, changes };
}

export function maskedFindingsCsv(result) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["severity", "line", "title", "detail"].map(q).join(",")];
  for (const f of result.findings) rows.push([f.severity, f.line || "", f.title, f.detail].map(q).join(","));
  return rows.join("\n") + "\n";
}

function tx(e2e, name, iban, amount, ref) {
  return `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${e2e}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${amount}</InstdAmt></Amt>
        <Cdtr><Nm>${name}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${iban}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${ref}</Ustrd></RmtInf>
      </CdtTrfTxInf>`;
}

function sample(parts) {
  const { n, sum, g, g2, t1, t2, t3, date } = parts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>SAMPLE-0001</MsgId>
      <CreDtTm>2026-10-01T09:30:00</CreDtTm>
      <NbOfTxs>${g}</NbOfTxs>
      <CtrlSum>${g2}</CtrlSum>
      <InitgPty><Nm>Example Trading GmbH</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>RUN-2026-10</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${sum}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${date}</ReqdExctnDt>
      <Dbtr><Nm>Example Trading GmbH</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>COBADEFFXXX</BIC></FinInstnId></DbtrAgt>
${t1}
${t2}
${t3}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

// Example dates that stay valid: a banking day ten days out, and the Saturday after it.
export function sampleDates(today = new Date("2026-10-01T00:00:00Z")) {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 10));
  const ok = nextBankingDay(t);
  const sat = new Date(ok + "T00:00:00Z");
  sat.setUTCDate(sat.getUTCDate() + ((6 - sat.getUTCDay() + 7) % 7 || 7));
  return { ok, saturday: sat.toISOString().slice(0, 10) };
}

export function sampleFile(today) {
  return sample({ n: 3, sum: "2750.50", g: 3, g2: "2750.50", date: today ? sampleDates(today).ok : "2026-10-12",
    t1: tx("INV-1001", "Example Supplies BV", "NL91ABNA0417164300", "1250.00", "Invoice 1001"),
    t2: tx("INV-1002", "Muster Software SARL", "FR1420041010050500013M02606", "1000.50", "Invoice 1002"),
    t3: tx("INV-1003", "Ejemplo Servicios SL", "ES9121000418450200051332", "500.00", "Invoice 1003") });
}

// The clean file after a hand edit: one amount changed, one IBAN digit transposed, an accented name,
// a Saturday date and a repeated reference, with the control sums left as they were.
export function sampleBrokenFile(today) {
  return sample({ n: 3, sum: "2750.50", g: 3, g2: "2750.50", date: today ? sampleDates(today).saturday : "2026-10-10",
    t1: tx("INV-1001", "Example Supplies BV", "NL91ABNA0417164300", "1350.00", "Invoice 1001"),
    t2: tx("INV-1001", "Muster Software SARL", "FR1420041010050500013M02660", "1000.50", "Invoice 1002"),
    t3: tx("INV-1003", "Ejemplo Servicios Señor SL", "ES9121000418450200051332", "500.00", "Invoice 1003") });
}
