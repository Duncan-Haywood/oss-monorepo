// Round-trip differential testing for the portfolio's OFX and QIF writers.
//
// Three converters write OFX and QIF, each with its own escaping, truncation and amount code:
//   bank-csv-to-qbo-converter  convert(csv)              -> toOfx / toQif
//   bai2-to-ofx-converter      validate(bai2) statements -> toOfx / toQif
//   camt053-to-ofx-converter   analyze(camt.053 XML)     -> toOfx / toQif
// and four readers take those files back in:
//   ofx-file-check   validate   (an OFX written by a converter must have no errors)
//   qif-file-check   validate   (same for QIF)
//   ai-bookkeeper    readOfx / readQif  (the dates, signed amounts and payee must survive)
//   ai-bookkeeper    readStatement      (format sniffing: the file must be read as OFX or QIF, not CSV)
//
// This file draws random transactions (the "truth"), writes each one in the converter's own source format
// (CSV, BAI2, camt.053), runs the converter, and feeds its OFX and QIF to every reader. A reader that
// loses a transaction, reads a different date or amount, shows an escape sequence ("&amp;") or loses the
// payee, or a checker that reports an error (or a field past OFX's length limit) on a converter's own output, is a disagreement: a bug in a
// writer, a reader or the generator. The generator states which input it believes valid, so read the
// failing text before blaming anyone.
//
// Variations switch on one hazard each: "amp" (& < > in text), "accent" (é ü ß, an em dash, an emoji),
// "long" (payee and memo past OFX's 32 and 255 characters), "quote" (quotes, commas, semicolons),
// "big" (amounts up to 9,999,999.99), "space" (runs of spaces, leading and trailing blanks), "caret"
// (a QIF record separator ^ and a leading ! inside text), "edge" (an & placed so a cut at 255 lands
// inside its escape).
//
// CLI: node export-differential.mjs [seed] [variations,comma,separated|all] [cases]
// Pure functions, no I/O beyond the CLI print. Deterministic for a seed.

import { pathToFileURL } from "node:url";
import * as csvConv from "../bank-csv-to-qbo-converter/calc.mjs";
import * as bai2Conv from "../bai2-to-ofx-converter/calc.mjs";
import * as camtConv from "../camt053-to-ofx-converter/calc.mjs";
import { validate as checkOfx } from "./calc.mjs";
import { validate as checkQif } from "../qif-file-check/calc.mjs";
import { readOfx, readQif, readStatement } from "../ai-bookkeeper/bank.mjs";

export const VARIATIONS = ["amp", "accent", "long", "quote", "big", "space", "caret", "edge"];
export const WRITERS = ["csv", "bai2", "camt"];
const NOW = "2026-11-18T12:00:00";

const p2 = (n) => String(n).padStart(2, "0");
const WORDS = ["Harbor", "Supply", "Acme", "Garage", "Payroll", "Invoice", "Rent", "Office", "Coffee", "Fuel", "Wire", "Deposit", "Refund", "Bayside", "Property", "Mgmt", "Tools", "Lumber", "Freight", "Insurance"];

function rng(seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  return { rnd, int: (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick: (a) => a[Math.floor(rnd() * a.length)] };
}

// Text for a payee or memo, ASCII-only where the source format is (BAI2 has no encoding for anything else).
function text(R, on, { ascii = false, slash = true, memo = false } = {}) {
  const n = on("long") && R.rnd() < 0.4 ? R.int(8, memo ? 60 : 12) : R.int(1, 4);
  const parts = [];
  for (let i = 0; i < n; i++) {
    let w = R.pick(WORDS);
    if (on("amp") && R.rnd() < 0.25) w = R.pick(["&", "<", ">", "A&B", "<b>", "R&D", "x<y"]);
    if (on("accent") && !ascii && R.rnd() < 0.25) w = R.pick(["Café", "Müller", "Straße", "Ünal", "—", "☕", "Zoë", "Ñandú"]);
    if (on("quote") && R.rnd() < 0.2) w = R.pick(['"Q"', "O'Neil", "a,b", "x;y", "50%"]);
    if (on("caret") && R.rnd() < 0.15) w = R.pick(["^", "!Type:Cat", "^x"]);
    if (!slash) w = w.replace(/\//g, "-");
    parts.push(w);
  }
  let s = parts.join(on("space") && R.rnd() < 0.3 ? "   " : " ");
  if (on("space") && R.rnd() < 0.3) s = "  " + s + " ";
  if (on("edge") && memo && R.rnd() < 0.5) s = ("X".repeat(R.int(248, 254)) + " & tail").slice(0, 280);
  // The generator's own validity rule: a payee needs at least one word a reader can show, so it never
  // emits a text that is only punctuation (a bank would not either).
  if (!anchor(s)) s = R.pick(WORDS) + " " + s;
  if (ascii) s = s.replace(/[^\x20-\x7e]/g, "");
  return s;
}

function amount(R, on) {
  const max = on("big") && R.rnd() < 0.3 ? 999999999 : 500000;
  const c = R.int(1, max);
  return R.rnd() < 0.5 ? -c : c;
}

// One random statement: { writer, truth: [{ date, cents, name, memo }], source } where source is the text the
// writer's converter reads. BAI2 dates every entry by its group, so its truth shares one date.
export function generate(seed, writer, variations = []) {
  const R = rng(seed * 7 + WRITERS.indexOf(writer) + 1);
  const set = new Set(variations);
  const on = (v) => set.has(v) || set.has("all");
  const n = R.int(1, 10);
  const y = R.int(2018, 2026), m = R.int(1, 12), d = R.int(1, 28);
  const truth = [];
  for (let i = 0; i < n; i++) {
    const dd = writer === "bai2" ? d : Math.min(28, d + R.int(0, 2));
    truth.push({ date: `${y}-${p2(m)}-${p2(dd)}`, cents: amount(R, on), name: text(R, on, { ascii: writer === "bai2", slash: writer !== "bai2" }), memo: R.rnd() < 0.6 ? text(R, on, { ascii: writer === "bai2", slash: writer !== "bai2", memo: true }) : "" });
  }
  truth.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { writer, truth, source: SOURCES[writer](truth) };
}

const csvCell = (s) => (/[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
const dec = (c) => ((t) => (c < 0 && /[1-9]/.test(t) ? "-" : "") + t)((Math.abs(c) / 100).toFixed(2));
const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SOURCES = {
  csv: (truth) => ["Date,Description,Amount,Memo", ...truth.map((t) => {
    const [y, m, d] = t.date.split("-");
    return [`${m}/${d}/${y}`, csvCell(t.name), dec(t.cents), csvCell(t.memo)].join(",");
  })].join("\r\n") + "\r\n",
  // BAI2: 16 records with a type code (195 incoming wire, 451 ACH debit), the amount in cents, the bank and
  // customer references, then free text, which runs to the end of the record and may hold commas.
  bai2: (truth) => {
    const [y, m, d] = truth[0].date.split("-");
    const credit = truth.filter((t) => t.cents > 0).reduce((a, t) => a + t.cents, 0);
    const debit = truth.filter((t) => t.cents < 0).reduce((a, t) => a - t.cents, 0);
    return bai2Conv.buildFile({
      created: y.slice(2) + m + d,
      groups: [{ date: y.slice(2) + m + d, accounts: [{ number: "0001234567", statuses: [[10, 1000000], [15, 1000000 + credit - debit]], txns: truth.map((t, i) => [t.cents > 0 ? 195 : 451, Math.abs(t.cents), `REF${i}`, "", [t.name, t.memo].filter(Boolean).join(" ")]) }] }],
    });
  },
  camt: (truth) => {
    const net = truth.reduce((a, t) => a + t.cents, 0);
    const open = 100000000, close = open + net;
    const bal = (cd, c, dt) => `<Bal><Tp><CdOrPrtry><Cd>${cd}</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${(Math.abs(c) / 100).toFixed(2)}</Amt><CdtDbtInd>${c < 0 ? "DBIT" : "CRDT"}</CdtDbtInd><Dt><Dt>${dt}</Dt></Dt></Bal>`;
    const ntry = (t, i) => {
      const ind = t.cents < 0 ? "DBIT" : "CRDT", party = t.cents < 0 ? "Cdtr" : "Dbtr";
      return `<Ntry><NtryRef>BK${i}</NtryRef><Amt Ccy="EUR">${(Math.abs(t.cents) / 100).toFixed(2)}</Amt><CdtDbtInd>${ind}</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>${t.date}</Dt></BookgDt><ValDt><Dt>${t.date}</Dt></ValDt><AcctSvcrRef>BK${i}</AcctSvcrRef><NtryDtls><TxDtls><Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs><RltdPties><${party}><Nm>${xml(t.name)}</Nm></${party}></RltdPties>${t.memo ? `<RmtInf><Ustrd>${xml(t.memo)}</Ustrd></RmtInf>` : ""}</TxDtls></NtryDtls></Ntry>`;
    };
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><GrpHdr><MsgId>M1</MsgId><CreDtTm>${NOW}</CreDtTm></GrpHdr><Stmt><Id>S1</Id><Acct><Id><IBAN>DE89370400440532013000</IBAN></Id><Ccy>EUR</Ccy></Acct>${bal("OPBD", open, truth[0].date)}${bal("CLBD", close, truth[truth.length - 1].date)}${truth.map(ntry).join("")}</Stmt></BkToCstmrStmt></Document>\n`;
  },
};

// Converter source -> { ofx, qif }. Throws when the converter itself refuses the generated file.
export function convert(writer, source) {
  if (writer === "csv") {
    const r = csvConv.convert(source, { dateOrder: "MDY", today: "2099-01-01" });
    const errs = r.findings.filter((f) => f.severity === "error");
    if (errs.length) throw new Error("converter: " + errs.map((e) => e.title).join("; "));
    return { ofx: csvConv.toOfx(r, { now: NOW }), qif: csvConv.toQif(r) };
  }
  if (writer === "bai2") {
    const r = bai2Conv.validate(source);
    const errs = r.findings.filter((f) => f.severity === "error");
    if (errs.length) throw new Error("converter: " + errs.map((e) => e.title).join("; "));
    const st = bai2Conv.statementsOf(r)[0];
    return { ofx: bai2Conv.toOfx(st, { now: NOW }), qif: bai2Conv.toQif(st) };
  }
  const r = camtConv.analyze(source);
  const errs = r.findings.filter((f) => f.severity === "error");
  if (errs.length) throw new Error("converter: " + errs.map((e) => e.title).join("; "));
  return { ofx: camtConv.toOfx(r.statements[0], { now: NOW }), qif: camtConv.toQif(r.statements[0]) };
}

// The first word of the payee made only of ASCII letters (three or more), among the whole words that
// fit in 30 characters, so a writer's 32-character cut cannot remove it: what any writer keeps through its own ASCII
// folding, truncation and escaping, so a reader whose description lacks it has lost or garbled the payee.
function anchor(s) {
  return (String(s).split(/[^\x21-\x7e]+/).find((w) => /^[A-Za-z]{3,}$/.test(w)) || "").toLowerCase();
}
// The whole words of a payee that fit in n characters of OFX text (an escape counts once, a non-ASCII letter
// may fold to two), whitespace collapsed; a word the cut runs through is dropped.
function fits(s, n) {
  const t = String(s).replace(/\s+/g, " ").trim();
  let used = 0, k = 0;
  for (; k < t.length; k++) {
    used += t.charCodeAt(k) > 127 ? 2 : 1;
    if (used > n) break;
  }
  return k < t.length && /\S/.test(t[k]) ? t.slice(0, k).replace(/\S+$/, "") : t.slice(0, k);
}
const ESCAPE = /&(?:amp|lt|gt|quot|apos|#\d+);/;

function compareRows(truth, rows) {
  const want = truth.map((t) => `${t.date} ${t.cents}`), got = rows.map((r) => `${r.date} ${r.cents}`);
  if (want.join("|") !== got.join("|")) return `rows: want ${want.join(", ")}; got ${got.join(", ")}`;
  for (let i = 0; i < rows.length; i++) {
    const desc = rows[i].desc || "";
    if (ESCAPE.test(desc)) return `row ${i + 1}: escape left in description ${JSON.stringify(desc)}`;
    const a = anchor(fits(truth[i].name, 30));
    if (a && !desc.toLowerCase().includes(a)) return `row ${i + 1}: payee ${JSON.stringify(truth[i].name)} lost, description ${JSON.stringify(desc)}`;
  }
  return null;
}

// Every reader on one converter's output -> { [reader]: null | "what went wrong" }.
export function check(gen) {
  const out = {};
  let files;
  try { files = convert(gen.writer, gen.source); } catch (e) { return { convert: String(e.message || e) }; }
  const n = gen.truth.length;
  const guard = (name, fn) => { try { out[name] = fn(); } catch (e) { out[name] = `threw: ${e.message}`; } };
  guard("ofx-file-check", () => {
    const r = checkOfx(files.ofx);
    // Errors, and the length warnings: a converter that cuts its own text should cut it to fit.
    const errs = r.findings.filter((f) => f.severity === "error" || / longer than /.test(f.title));
    if (errs.length) return "findings: " + errs.map((f) => `${f.title} (line ${f.line})`).join("; ");
    return r.summary.transactions === n ? null : `counted ${r.summary.transactions} of ${n}`;
  });
  guard("qif-file-check", () => {
    const r = checkQif(files.qif, { now: new Date("2099-01-01") });
    const errs = r.findings.filter((f) => f.severity === "error");
    return errs.length ? "errors: " + errs.map((f) => `${f.title} (line ${f.line})`).join("; ") : null;
  });
  guard("readOfx", () => compareRows(gen.truth, readOfx(files.ofx).rows));
  guard("readQif", () => compareRows(gen.truth, readQif(files.qif).rows));
  guard("readStatement(ofx)", () => compareRows(gen.truth, readStatement(files.ofx).rows));
  guard("readStatement(qif)", () => compareRows(gen.truth, readStatement(files.qif).rows));
  out.files = files;
  return out;
}

export const READERS = ["convert", "ofx-file-check", "qif-file-check", "readOfx", "readQif", "readStatement(ofx)", "readStatement(qif)"];

// -> { tally: { "writer→reader": failures }, examples: { "writer→reader": first failure } }
export function run({ seed = 1, variations = [], cases = 100, writers = WRITERS } = {}) {
  const tally = {}, examples = {};
  for (const w of writers) {
    for (let k = 0; k < cases; k++) {
      const gen = generate(seed * 100003 + k, w, variations);
      const res = check(gen);
      for (const r of READERS) {
        const key = `${w}→${r}`;
        tally[key] ??= 0;
        if (res[r]) {
          tally[key]++;
          examples[key] ??= { seed: seed * 100003 + k, problem: res[r], truth: gen.truth, ofx: res.files?.ofx, qif: res.files?.qif };
        }
      }
    }
  }
  return { tally, examples };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const seed = Number(process.argv[2] || 1);
  const v = (process.argv[3] || "").split(",").filter(Boolean);
  const cases = Number(process.argv[4] || 200);
  const { tally, examples } = run({ seed, variations: v, cases });
  for (const [k, n] of Object.entries(tally)) console.log(`${n ? "FAIL" : "ok  "} ${k}: ${n}/${cases}${n ? "  " + examples[k].problem.slice(0, 300) : ""}`);
}
