// MT940 (SWIFT) and CAMT.053 (ISO 20022 XML) statement reading: what European
// and many other non-US banks export. Same row shape as bank.mjs readStatement,
// money INTO the account positive, plus `statement` { cents, date } from the
// closing balance. Pure functions, no DOM, no network.

import { decodeEntities } from "./xmlent.mjs";
const unesc = (s) => decodeEntities(s).replace(/\s+/g, " ").trim();
const iso = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? t.toISOString().slice(0, 10) : null;
};
const cents = (s) => {
  const n = Math.round(parseFloat(String(s).trim().replace(/,/, ".")) * 100);
  return Number.isSafeInteger(n) ? n : NaN; // 30 digits of fuzz is not a balance
};

export function isMt940(text) {
  return /^\uFEFF?:20:/m.test(text) && /^:61:/m.test(text);
}
export function isCamt(text) {
  return /<(\w+:)?(BkToCstmrStmt|BkToCstmrAcctRpt|BkToCstmrDbtCdtNtfctn)[\s>]/.test(text) || /<(\w+:)?Ntry[\s>]/.test(text) && /camt\.0(53|52|54)/.test(text);
}

// Two-digit years: 70-99 are 19xx, the rest 20xx, which no live statement crosses.
const yy = (v) => (+v >= 70 ? 1900 + +v : 2000 + +v);

// Dutch, Belgian and French banks (ING, ABN AMRO, Rabobank, KBC...) write :86: as "/KEY/value/KEY/value"
// pairs: /TRTP/SEPA OVERBOEKING/IBAN/NL91.../BIC/ABNANL2A/NAME/Jan de Vries/REMI/Factuur 14/EREF/NOTPROVIDED.
// The payee (NAME, else the counterparty's name in /CNTP/) and the remittance text are the description;
// IBAN, BIC and reference ids only add noise to payee memory and the categorizer, so they are dropped.
// Structured remittance (/REMI/STRD/CUR/ref) keeps the reference; /USTD/ is the unstructured marker.
const SLASH_KEYS = new Set(["TRTP", "CNTP", "IBAN", "BIC", "NAME", "REMI", "EREF", "MARF", "CSID", "ISDT", "ORDP", "BENM", "ADDR", "CREF", "PREF", "ID", "SVCL", "OCMT", "CHGS", "EXCH", "ORDR", "BENF", "PURP", "RTRN", "ULTD", "ULTC"]);
function slashTags(t) {
  const parts = t.split("/");
  const kv = {};
  let key = null;
  for (let i = 1; i < parts.length; i++) {
    if (SLASH_KEYS.has(parts[i])) { key = parts[i]; kv[key] ??= []; }
    else if (key) kv[key].push(parts[i]);
  }
  // "//" separators and a closing "/" (ING writes both) leave empty values; a value's own "/" is kept.
  for (const k in kv) while (kv[k].length && kv[k].at(-1).trim() === "") kv[k].pop();
  if (!kv.NAME && !kv.REMI && !kv.CNTP && !kv.BENM && !kv.ORDP) return "";
  const first = (k) => (kv[k] ?? []).join("/").trim();
  // /CNTP/<account>/<bic>/<name>/<city>/ : the name is the third value.
  const name = first("NAME") || (kv.CNTP ?? [])[2]?.trim() || first("ORDP") || first("BENM");
  let remi = (kv.REMI ?? []).slice();
  if (remi[0] === "USTD") remi = remi.slice(remi[1] === "" ? 2 : 1);
  else if (remi[0] === "STRD") remi = remi.slice(2); // STRD / scheme code (CUR, ISO) / reference
  return unesc([name, remi.join("/")].filter(Boolean).join(" "));
}

// :86: free text, or German-style structured "?20..?29" purpose lines and "?32?33" name.
// Lines the bank cut at the 65-character SWIFT width continue mid-word, so they join with nothing;
// a shorter line ended on purpose (ABN AMRO, ING and KNAB free text), so the next one is a new word.
function joinLines(t) {
  const lines = t.split("\n");
  return lines.reduce((acc, l, i) => (i === 0 ? l : acc + (lines[i - 1].length >= 63 || /\?\d\d/.test(t) || /^\/[A-Z]{3,4}\//.test(t) ? "" : " ") + l), "");
}
function field86(t) {
  t = t.replace(/\r/g, "");
  // Triodos writes the structured subfields as "000>10..>20..>21.." (">" where others use "?").
  if (/^\d{3}>\d\d/.test(t)) t = t.replace(/>(\d\d)/g, "?$1");
  t = joinLines(t).replace(/\u00ad/g, "-");
  if (/^\/[A-Z]{3,4}\//.test(t)) { const d = slashTags(t); if (d) return d; }
  if (!/\?\d\d/.test(t)) return unesc(t);
  const sub = {};
  for (const m of t.matchAll(/\?(\d\d)([^?]*)/g)) sub[m[1]] = (sub[m[1]] ?? "") + m[2];
  const purpose = Object.keys(sub).filter((k) => k >= "20" && k <= "29").sort().map((k) => sub[k]).join(" ");
  const name = [sub["32"], sub["33"]].filter(Boolean).join("");
  return unesc([name, purpose].filter(Boolean).join(" ")) || unesc(t.replace(/\?\d\d/g, " "));
}

// A statement that prints its opening and closing balance can vouch for its own
// rows: opening plus the rows must give the closing balance. A gap means lines
// are missing from the export (or a reversal was read the wrong way).
function selfCheck(opening, closing, rows, problems, fmt = (c) => (c / 100).toFixed(2)) {
  if (opening === null || !closing || !rows.length) return;
  const sum = rows.reduce((a, r) => a + r.cents, 0);
  const gap = closing.cents - opening - sum;
  if (gap !== 0) problems.push(`The rows do not add up to the statement's own balances: opening ${fmt(opening)} plus ${rows.length} rows ${fmt(sum)} is ${fmt(opening + sum)}, but the closing balance is ${fmt(closing.cents)} (a difference of ${fmt(gap)}). Lines may be missing from the export.`);
}

export function readMt940(text) {
  const s = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const problems = [];
  const out = [];
  // A tag starts a line with :NN[a-z]: and runs until the next one.
  const fields = [...s.matchAll(/^:(\d\d[A-Z]?):([\s\S]*?)(?=^:\d\d[A-Z]?:|^-\}|\n-\n|$(?![\s\S]))/gm)].map((m) => ({ tag: m[1], body: m[2].replace(/\n$/, "") }));
  let closing = null, accounts = 0, opening = null, openings = 0;
  fields.forEach((f, i) => {
    if (f.tag === "25") accounts++;
    if (f.tag === "60F" || f.tag === "60M") {
      const m = f.body.match(/^([CD])\d{6}[A-Z]{3}([\d,]+)/);
      openings++;
      if (m) opening = (m[1] === "D" ? -1 : 1) * cents(m[2]);
    }
    if (f.tag === "62F" || f.tag === "62M") {
      const m = f.body.match(/^([CD])(\d{2})(\d{2})(\d{2})[A-Z]{3}([\d,]+)/);
      if (m) closing = { cents: (m[1] === "D" ? -1 : 1) * cents(m[5]), date: iso(yy(m[2]), +m[3], +m[4]) };
    }
    if (f.tag !== "61") return;
    const first = f.body.split("\n")[0];
    const m = first.match(/^(\d{2})(\d{2})(\d{2})(?:\d{4}| {4})?(R?[CD])[A-Z]?([\d,]+)/);
    if (!m) { problems.push(`Entry ${i + 1}: unreadable :61: line "${first.slice(0, 40)}", skipped.`); return; }
    const date = iso(yy(m[1]), +m[2], +m[3]);
    const amt = cents(m[5]);
    if (!date || !Number.isFinite(amt)) { problems.push(`Entry ${i + 1}: unreadable date or amount, skipped.`); return; }
    // C credit and RD reversal of debit add money; D debit and RC reversal of credit remove it.
    const sign = m[4] === "C" || m[4] === "RD" ? 1 : -1;
    // Rabobank writes one :86: line per fact (reason, reference, ...) after a single :61:.
    let next = "";
    for (let j = i + 1; fields[j]?.tag === "86"; j++) next += (next ? "\n" : "") + fields[j].body;
    const supplementary = f.body.split("\n").slice(1).join(" ");
    if (amt === 0) return;
    out.push({ line: i + 1, date, desc: field86(next) || unesc(supplementary) || unesc(first.replace(/^[\dA-Z,]+/, "")), cents: sign * amt, balance: null });
  });
  if (!out.length) problems.push("No :61: transactions were found in the MT940 file.");
  if (accounts > 1) problems.push(`The file holds ${accounts} statements; all their lines were read into this one. Export one account at a time to keep them apart.`);
  if (openings === 1 && accounts <= 1 && Number.isFinite(opening)) selfCheck(opening, closing, out, problems);
  return { rows: out, problems, columns: null, bank: "mt940", inferred: null, statement: closing && Number.isFinite(closing.cents) && closing.date ? closing : null };
}

// Tag text without namespace prefixes, first match in `block`.
const strip = (x) => x.replace(/<(\/?)\w+:/g, "<$1");
function inner(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : null;
}
const text = (block, name) => { const v = inner(block, name); return v === null ? null : unesc(v.replace(/<[^>]+>/g, " ")); };

export function readCamt(xml) {
  const s = strip(String(xml));
  const problems = [];
  const out = [];
  const stmts = (s.match(/<(Stmt|Rpt|Ntfctn)[\s>]/g) ?? []).length;
  if (stmts > 1) problems.push(`The file holds ${stmts} statements or reports; all their lines were read into this one. Export one account at a time to keep them apart.`);
  const entries = [...s.matchAll(/<Ntry>([\s\S]*?)<\/Ntry>/g)].map((m) => m[1]);
  entries.forEach((e, i) => {
    const head = e.split(/<NtryDtls>/)[0];
    const date = (text(inner(head, "BookgDt") ?? "", "Dt") ?? text(inner(head, "BookgDt") ?? "", "DtTm") ?? text(inner(head, "ValDt") ?? "", "Dt") ?? "").slice(0, 10);
    const amt = cents(text(head, "Amt") ?? "");
    const ind = text(head, "CdtDbtInd");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amt) || !ind) { problems.push(`Entry ${i + 1}: unreadable date, amount or CRDT/DBIT, skipped.`); return; }
    if (amt === 0) return;
    // A pending or informational entry has not moved money yet (CAMT.053 v08 marks it
    // PDNG or INFO; older versions write the status as plain text).
    if (/PDNG|INFO/.test(text(head, "Sts") ?? "")) { problems.push(`Entry ${i + 1}: pending, not booked yet, skipped.`); return; }
    // Banks disagree on a reversal (RvslInd true): most write the direction the money
    // moved (a reversed credit arrives as DBIT), some write the original direction.
    // Read it as stated; the balance check below flips the reversals if that is what
    // makes the statement's own balances add up.
    const rev = /true|1/i.test(text(head, "RvslInd") ?? "");
    const credit = ind === "CRDT";
    const dtls = e.slice(head.length);
    // The counterparty is the debtor of money in, the creditor of money out.
    const party = text(inner(dtls, credit ? "Dbtr" : "Cdtr") ?? "", "Nm");
    const remit = [...dtls.matchAll(/<Ustrd>([\s\S]*?)<\/Ustrd>/g)].map((m) => unesc(m[1])).join(" ") || text(dtls, "Ref") || "";
    const desc = [party, remit || text(e, "AddtlNtryInf") || text(dtls, "AddtlTxInf")].filter(Boolean).filter((x, j, a) => a.indexOf(x) === j).join(" ");
    out.push({ line: i + 1, date, desc, cents: credit ? amt : -amt, balance: null, ...(rev ? { rev: true } : {}) });
  });
  if (!entries.length) problems.push("No <Ntry> entries were found in the CAMT file.");
  let statement = null, opening = null, openings = 0;
  for (const m of s.matchAll(/<Bal>([\s\S]*?)<\/Bal>/g)) {
    if (!/<Cd>(OPBD|PRCD)<\/Cd>/.test(m[1])) continue;
    const a = cents(text(m[1], "Amt") ?? "");
    openings++;
    if (Number.isFinite(a)) opening = text(m[1], "CdtDbtInd") === "DBIT" ? -a : a;
  }
  for (const m of s.matchAll(/<Bal>([\s\S]*?)<\/Bal>/g)) {
    if (!/<Cd>(CLBD|CLAV)<\/Cd>/.test(m[1]) || /<Cd>CLAV<\/Cd>/.test(m[1]) && statement) continue;
    const a = cents(text(m[1], "Amt") ?? ""), d = (text(inner(m[1], "Dt") ? m[1] : "", "Dt") ?? "").slice(0, 10);
    if (Number.isFinite(a) && /^\d{4}-\d{2}-\d{2}$/.test(d)) statement = { cents: text(m[1], "CdtDbtInd") === "DBIT" ? -a : a, date: d };
  }
  if (openings === 1 && stmts <= 1 && Number.isFinite(opening)) {
    const sum = (rs) => rs.reduce((a, r) => a + r.cents, 0);
    if (statement && opening + sum(out) !== statement.cents && out.some((r) => r.rev) && opening + sum(out.map((r) => r.rev ? { cents: -r.cents } : r)) === statement.cents) out.forEach((r) => { if (r.rev) r.cents = -r.cents; });
    selfCheck(opening, statement, out, problems);
  }
  out.forEach((r) => { delete r.rev; });
  return { rows: out, problems, columns: null, bank: "camt053", inferred: null, statement };
}
