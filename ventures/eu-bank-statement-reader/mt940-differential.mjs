// Differential fuzzing for the portfolio's three MT940 readers.
//
// Three products read SWIFT MT940 statements with code written separately:
//   ai-bookkeeper/sepa.mjs            readMt940  (rows into the bookkeeping ledger)
//   mt940-statement-check/calc.mjs    validate   (checker, repairer, CSV)
//   eu-bank-statement-reader/calc.mjs analyze    (MT940 + camt reader, balance checks)
// This file writes random but valid MT940 statements whose transactions are known in advance (the "truth"),
// feeds the same text to all three, and reports every reader whose transactions (value date and signed
// amount, in order) differ from the truth, or that raises an error on a statement that is valid.
//
// Each variation switches on one way real exports differ (SWIFT envelopes with {3:} headers and {5:}
// trailers, several messages per file, RC/RD reversals, MMDD entry dates across a year end, funds codes,
// CR or CRLF line ends, trailing spaces, a BOM, 1990s archive dates, :21:/:65: tags, amounts written
// "12," or "12,5"). A disagreement is a bug in one reader or in the generator; the generator states the
// layout it believes valid, so read the failing text before blaming a reader.
//
// CLI: node mt940-differential.mjs [seed] [variations,comma,separated|all] [cases]
// Pure functions, no I/O beyond the CLI print. Deterministic for a seed.

import { pathToFileURL } from "node:url";
import { readMt940 } from "../ai-bookkeeper/sepa.mjs";
import { validate as checkMt940 } from "../mt940-statement-check/calc.mjs";
import { analyze } from "./calc.mjs";

export const VARIATIONS = [
  "amtstyle", "multi", "envelope", "hdr3", "trailer", "blank", "y19", "reversal", "entry", "yearend",
  "funds", "supp", "no86", "tags", "big", "ws", "bom", "noterm", "crlf", "cr",
]; // plus "mangle", never part of "all": it breaks the file on purpose

const p2 = (n) => String(n).padStart(2, "0");

// One random file. `on(name)` says whether a variation is switched on.
export function generate(seed, variations = []) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const set = new Set(variations);
  const on = (v) => set.has(v) || set.has("all");

  const amount = (c) => { // c in cents, SWIFT comma decimals
    const w = Math.floor(c / 100), f = c % 100;
    const style = on("amtstyle") ? pick(["full", "trim", "bare"]) : "full";
    if (style === "full") return `${w},${p2(f)}`;
    if (f === 0) return style === "bare" ? `${w},` : `${w},0`;
    return f % 10 === 0 ? `${w},${f / 10}` : `${w},${p2(f)}`;
  };
  const ymd = (yy, mm, dd) => `${p2(yy % 100)}${p2(mm)}${p2(dd)}`;
  const balance = (v, dt) => `${v < 0 ? "D" : "C"}${dt}EUR${amount(Math.abs(v))}`;

  const account = pick([":25:NL91ABNA0417164300", ":25:/DE89370400440532013000", ":25:12345678/0012345"]);
  const nStatements = on("multi") ? int(1, 3) : 1;
  const y = on("y19") ? int(95, 99) : int(20, 30), m = int(1, 12), d = int(1, 20);
  let bal = int(-500000, 5000000);
  const truth = [], messages = [];
  for (let st = 0; st < nStatements; st++) {
    const L = [`:20:STMT${st}${int(100, 999)}`];
    if (on("tags")) L.push(":21:NONREF");
    L.push(account, `:28C:${st + 1}/1`, `:60${pick(["F", "M"])}:${balance(bal, ymd(y, m, d))}`);
    const n = int(1, 6);
    for (let i = 0; i < n; i++) {
      const c = on("big") && rnd() < 0.3 ? int(1, 99999999) * 1000 + int(0, 99) : int(1, 9000000);
      const kind = on("reversal") ? pick(["C", "D", "C", "D", "RC", "RD"]) : pick(["C", "D"]);
      const sign = kind === "C" || kind === "RD" ? 1 : -1; // RD reverses a debit: money back in
      bal += sign * c;
      let vm = m, vd = Math.min(d + i, 28), entry = "";
      if (on("entry")) {
        if (on("yearend") && rnd() < 0.5) { vm = 12; vd = 31; entry = "0102"; } // booked 2 January next year
        else entry = `${p2(vm)}${p2(vd)}`;
      }
      const funds = on("funds") && rnd() < 0.3 ? "R" : "";
      const tail = pick(["NTRF", "NMSC", "NCHK", "FCHG", "S202"]) + pick(["NONREF", "INV123", "EREF-77"]) +
        (rnd() < 0.5 ? `//${pick(["8327000090031789", "B1X2", "ABC"])}` : "");
      L.push(`:61:${ymd(y, vm, vd)}${entry}${kind}${funds}${amount(c)}${tail}`);
      if (on("supp") && rnd() < 0.3) L.push(pick(["/OCMT/EUR12,00/", "Supplementary detail"]));
      const text = pick([
        ["/TRTP/SEPA OVERBOEKING/IBAN/NL02ABNA0123456789/BIC/ABNANL2A/NAME/Jan de Vries/REMI/Factuur 14/EREF/NOTPROVIDED"],
        ["166?00GUTSCHRIFT?109310?20EREF+123?21SVWZ+Rechnung 7?32Max Mustermann"],
        ["Payment for invoice 7", "continued line"],
        ["Ref: 12:30 meeting", ":foo bar"],
        ["Order {42} card payment"],
      ]);
      if (!(on("no86") && rnd() < 0.2)) L.push(`:86:${text[0]}`, ...text.slice(1));
      truth.push({ date: `${y >= 70 ? 19 : 20}${p2(y)}-${p2(vm)}-${p2(vd)}`, cents: sign * c });
    }
    L.push(`:62${pick(["F", "M"])}:${balance(bal, ymd(y, m, Math.min(d + n, 28)))}`);
    if (on("tags")) L.push(`:64:${balance(bal, ymd(y, m, Math.min(d + n, 28)))}`, `:65:C${ymd(y, m, 28)}EUR1,00`, ":86:Statement info line");
    messages.push(L);
  }
  let text;
  if (on("envelope")) {
    const hdr = on("hdr3") ? "{3:{108:MT940 0001}}" : "";
    const trl = on("trailer") ? "{5:{CHK:ABCDEF123456}}" : "";
    text = messages.map((L) => `{1:F01ABNANL2AAXXX0000000000}{2:O9401200231001ABNANL2AAXXX00000000002310011200N}${hdr}{4:\n${L.join("\n")}\n-}${trl}`).join(on("blank") ? "\n\n" : "\n");
  } else text = messages.map((L) => L.join("\n") + "\n-").join(on("blank") ? "\n\n" : "\n");
  if (on("ws")) text = text.split("\n").map((l) => l + (rnd() < 0.3 ? "  " : "")).join("\n");
  if (on("noterm") && !on("envelope")) text = text.replace(/\n-$/, "");
  if (on("bom")) text = "﻿" + text;
  if (on("crlf") && rnd() < 0.5) text = text.replace(/\n/g, "\r\n");
  else if (on("cr") && rnd() < 0.3) text = text.replace(/\n/g, "\r");
  // "mangle" damages the file (deleted, doubled or swapped characters), so the truth no longer holds:
  // run() then only asks that no reader throws, the guarantee untrusted uploads need.
  if (set.has("mangle")) {
    const chars = [...text];
    for (let i = int(1, 12); i > 0; i--) {
      const at = int(0, chars.length - 1), op = pick(["del", "dup", "swap", "junk"]);
      if (op === "del") chars.splice(at, 1);
      else if (op === "dup") chars.splice(at, 0, chars[at]);
      else if (op === "swap") [chars[at], chars[at + 1]] = [chars[at + 1] ?? "", chars[at]];
      else chars.splice(at, 0, pick([":", "{", "}", "-", "\n", "?", "/", ",", "9", "\u0000"]));
    }
    text = chars.join("");
  }
  return { text, truth, statements: messages.length };
}

const key = (rows) => rows.map((r) => `${r.date}:${r.cents}`).join(" ");

// Every reader's view of one text, as { transactions, errors } (errors: what it calls an error on input
// the generator believes valid).
export const READERS = {
  "ai-bookkeeper": (text) => {
    const r = readMt940(text);
    // It reads a multi-statement file into one ledger and says so; that note is expected, not an error.
    const errors = r.problems.filter((p) => !/statements; all their lines were read/.test(p));
    return { transactions: key(r.rows.map((x) => ({ date: x.date, cents: x.cents }))), errors };
  },
  "mt940-statement-check": (text) => {
    const r = checkMt940(text);
    return {
      transactions: key(r.transactions.map((t) => ({ date: t.value, cents: t.signed / 10 }))), // scaled by 1000
      errors: r.findings.filter((f) => f.severity === "error").map((f) => `${f.title}: ${f.detail}`),
    };
  },
  "eu-bank-statement-reader": (text) => {
    const r = analyze(text);
    return {
      transactions: key(r.statements.flatMap((s) => s.entries).map((e) => ({ date: e.valueDate, cents: e.amount }))),
      errors: r.findings.filter((f) => f.severity === "error").map((f) => `${f.title}: ${f.detail}`),
    };
  },
};

// Run `cases` files through every reader. Returns per-reader counts and the first failing example of each.
export function run({ seed = 1, variations = [], cases = 500 } = {}) {
  const tally = {}, examples = {};
  for (const name of Object.keys(READERS)) tally[name] = { wrong: 0, errors: 0, threw: 0 };
  for (let k = 0; k < cases; k++) {
    const g = generate(seed * 100003 + k, variations);
    const want = key(g.truth);
    for (const [name, read] of Object.entries(READERS)) {
      let got;
      try { got = read(g.text); } catch (e) { tally[name].threw++; examples[name] ??= { text: g.text, want, got: String(e.stack) }; continue; }
      if (variations.includes("mangle")) continue;
      if (got.transactions !== want) { tally[name].wrong++; examples[name] ??= { text: g.text, want, got: got.transactions }; }
      if (got.errors.length) { tally[name].errors++; examples[name] ??= { text: g.text, want, got: got.errors.join(" | ") }; }
    }
  }
  return { tally, examples };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [seed = "1", vars = "", cases = "500"] = process.argv.slice(2);
  const variations = vars ? vars.split(",") : [];
  const { tally, examples } = run({ seed: +seed, variations, cases: +cases });
  console.log(JSON.stringify(tally));
  for (const [name, ex] of Object.entries(examples)) {
    console.log(`\n=== ${name}\n${JSON.stringify(ex.text).slice(0, 1500)}\nwant ${ex.want}\ngot  ${String(ex.got).slice(0, 800)}`);
  }
  process.exitCode = Object.values(tally).some((t) => t.wrong || t.errors || t.threw) ? 1 : 0;
}
