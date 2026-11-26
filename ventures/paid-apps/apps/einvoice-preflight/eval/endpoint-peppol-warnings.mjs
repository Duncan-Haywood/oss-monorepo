// Differential: endpoint.mjs's INV-061 warnings against OpenPeppol's own
// warning-level PEPPOL-COMMON assertions (R044, R045, R047, R054, R055,
// R056-1, R057), as shipped in plain/peppol-ubl.json, evaluated by fontoxpath
// (plain/fontoxpath.esm.js). No network, no outside data.
//
//   node eval/endpoint-peppol-warnings.mjs [per-scheme] [seed]
//
// For each scheme it draws ids Peppol accepts (check digits found by brute
// force against Peppol's own test, so the generator shares no code with
// endpoint.mjs) and mutants of them, then counts where we and Peppol disagree.
// The places endpoint.mjs is stricter on purpose are counted apart, by name.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateXPathToBoolean, evaluateXPath } from "../plain/fontoxpath.esm.js";
import { endpointIdOk, endpointWarningOk, normalizeEndpointId } from "../endpoint.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(here, "..", "plain", "peppol-ubl.json"), "utf8"));
const SCHEMES = ["0201", "0210", "0211", "0106", "0190", "9944", "0217"];

const tests = {};
for (const pattern of rules.patterns) {
  for (const rule of pattern.rules) {
    const m = /^cbc:EndpointID\[@schemeID = '(\d{4})'\]/.exec(rule.context || "");
    if (!m || !SCHEMES.includes(m[1])) continue;
    const check = rule.checks.find((c) => String(c.id).startsWith("PEPPOL-COMMON"));
    if (check) tests[m[1]] = check;
  }
}
for (const scheme of SCHEMES) {
  if (!tests[scheme]) throw new Error(`no Peppol rule for ${scheme}`);
  if (tests[scheme].flag !== "warning") throw new Error(`${tests[scheme].id} is ${tests[scheme].flag}, not a warning`);
}

const xquery = { language: evaluateXPath.XQUERY_3_1_LANGUAGE };
function peppolOk(scheme, raw) {
  const check = tests[scheme];
  const test = check.test.replace(/normalize-space\(\)/g, "normalize-space($v)").replace(/string\(\)/g, "string($v)");
  if (/\(\.\)|\(\s*\)\s*[,)]|\bdata\(\)|\btext\(\)/.test(test.replace(/[a-z:-]+\(\$v\)/g, "X"))) {
    throw new Error(`unexpected context read in ${check.id}: ${test}`);
  }
  try {
    return evaluateXPathToBoolean(`${check.xq ? rules.prolog : ""}${test}`, null, null, { v: raw }, check.xq ? xquery : {});
  } catch {
    return false; // an error in a Schematron assert fails it
  }
}

let seed = Number(process.argv[3] || 7);
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (s) => s[Math.floor(rand() * s.length)];
const DIG = "0123456789";
const UP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALNUM = UP + UP.toLowerCase() + DIG;
const run = (alphabet, n) => Array.from({ length: n }, () => pick(alphabet)).join("");

// A check digit Peppol's 0211 test accepts, found by brute force on IT + body.
function pivaBody() {
  for (let tries = 0; tries < 50; tries += 1) {
    const head = run(DIG, 10);
    for (let c = 0; c <= 9; c += 1) if (peppolOk("0211", `IT${head}${c}`)) return head + c;
  }
  return null;
}

function validId(scheme) {
  switch (scheme) {
    case "0201": return run(ALNUM, 6);
    case "0210": return rand() < 0.5
      ? run(UP, 6) + run(DIG, 2) + pick(UP) + run(DIG, 2) + pick(UP) + run(DIG, 3) + pick(UP)
      : pivaBody();
    case "0211": { const b = pivaBody(); return b && (rand() < 0.6 ? `IT${b}` : b); }
    case "0106": return run(DIG, 8);
    case "0190": return run(DIG, 20);
    case "9944": return `NL${run(DIG, 9)}B${run(DIG, 2)}`;
    case "0217": return run(DIG, 12);
    default: return null;
  }
}

function mutants(id) {
  const out = [];
  const digits = [...id].map((ch, i) => (/\d/.test(ch) ? i : -1)).filter((i) => i >= 0);
  const letters = [...id].map((ch, i) => (/[A-Za-z]/.test(ch) ? i : -1)).filter((i) => i >= 0);
  if (digits.length) {
    const i = pick(digits);
    out.push(id.slice(0, i) + String((Number(id[i]) + 1 + Math.floor(rand() * 9)) % 10) + id.slice(i + 1));
    out.push(id.slice(0, i) + pick(UP) + id.slice(i + 1)); // a digit typed as a letter (O for 0)
  }
  if (letters.length) {
    const i = pick(letters);
    out.push(id.slice(0, i) + pick(DIG) + id.slice(i + 1));
  }
  let i = Math.floor(rand() * (id.length - 1));
  if (id[i] !== id[i + 1]) out.push(id.slice(0, i) + id[i + 1] + id[i] + id.slice(i + 2));
  i = Math.floor(rand() * id.length);
  out.push(id.slice(0, i) + id.slice(i + 1));
  out.push(id + pick(DIG));
  i = 1 + Math.floor(rand() * (id.length - 2));
  out.push(id.slice(0, i) + "." + id.slice(i));
  out.push(id.slice(0, i) + " " + id.slice(i));
  out.push(id.slice(0, i) + "-" + id.slice(i));
  out.push(id.slice(0, i) + "à" + id.slice(i + 1));
  out.push(pick(["IT", "NL", "it", "KVK"]) + id);
  out.push(id.toLowerCase());
  return out;
}

// Where endpoint.mjs warns and Peppol does not, on purpose (endpoint.mjs comment).
function deliberate(scheme, text) {
  if ((scheme === "0210" || scheme === "0211") && /^\d{11}$/.test(text)) return "11-digit number without its check digit";
  if (scheme === "0211" && !/^it/i.test(text)) return "0211 without IT that is not 11 digits";
  if (scheme === "0210" && text.length === 16) return "a non-digit where Peppol reads castable as xs:integer";
  return null;
}

const per = Number(process.argv[2] || 300);
const rows = [];
let total = 0;
let disagreements = 0;
const kept = {};
for (const scheme of SCHEMES) {
  const row = { scheme, rule: tests[scheme].id, valid: 0, invalid: 0, quiet: 0, extra: 0, silentBefore: 0, examples: [] };
  for (let k = 0; k < per; k += 1) {
    const id = validId(scheme);
    if (!id) continue;
    for (const raw of [id, ...mutants(id)]) {
      const text = normalizeEndpointId(raw);
      if (text === null) continue;
      const theirs = peppolOk(scheme, text);
      const ours = endpointWarningOk(scheme, text);
      if (theirs && !ours) {
        const why = deliberate(scheme, text);
        if (why) { kept[`${scheme}: ${why}`] = (kept[`${scheme}: ${why}`] || 0) + 1; continue; }
      }
      total += 1;
      if (theirs) row.valid += 1; else row.invalid += 1;
      // Before INV-061, only INV-041 (blocking, lenient for these schemes) could speak.
      if (!theirs && endpointIdOk(scheme, text)) row.silentBefore += 1;
      if (theirs && !ours) row.extra += 1;
      if (!theirs && ours) row.quiet += 1;
      if (theirs !== ours) {
        disagreements += 1;
        if (row.examples.length < 3) row.examples.push(`${JSON.stringify(text)} peppol=${theirs} ours=${ours}`);
      }
    }
  }
  rows.push(row);
}

console.log(`ids: ${total}, disagreements: ${disagreements}`);
console.log("| scheme | rule | Peppol passes | Peppol warns | we warn, Peppol passes | Peppol warns, we pass | of Peppol's warnings, silent before INV-061 |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.scheme} | ${r.rule} | ${r.valid} | ${r.invalid} | ${r.extra} | ${r.quiet} | ${r.silentBefore} |`);
for (const [k, n] of Object.entries(kept)) console.log(`stricter on purpose, not counted: ${k}: ${n}`);
for (const r of rows) for (const e of r.examples) console.log(`  ${r.scheme}: ${e}`);
process.exitCode = disagreements ? 1 : 0;
