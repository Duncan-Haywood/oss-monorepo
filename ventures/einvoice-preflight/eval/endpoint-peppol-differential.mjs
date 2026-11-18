// Differential: endpoint.mjs's INV-041 shape checks against OpenPeppol's own
// PEPPOL-COMMON assertions, as shipped in plain/peppol-ubl.json, evaluated by
// fontoxpath (plain/fontoxpath.esm.js). No network, no outside data.
//
//   node eval/endpoint-peppol-differential.mjs [per-scheme] [seed]
//
// For each scheme it draws valid-looking ids (random bodies with the check
// digit computed by brute force against Peppol's test, so the generator does
// not share our code) and mutants of them (one digit changed, two digits
// swapped, a digit dropped or added, a dot, a space, a country prefix), then
// counts the ids where we and Peppol disagree.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateXPathToBoolean, evaluateXPath } from "../plain/fontoxpath.esm.js";
// EINVOICE_ENDPOINT_MODULE points at another endpoint.mjs (an older one, to
// measure "before"); it must export endpointIdOk or inspectPartyEndpoint.
const mod = await import(process.env.EINVOICE_ENDPOINT_MODULE || "../endpoint.mjs");
const { normalizeEndpointId } = mod;
const endpointIdOk = mod.endpointIdOk
  || ((scheme, id) => !mod.inspectPartyEndpoint({ endpoint: { scheme, id } }, "customer").some((f) => f.rule === "INV-041"));

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(here, "..", "plain", "peppol-ubl.json"), "utf8"));

const SCHEMES = { "0088": 13, "0192": 9, "0184": 8, "0096": 10, "0198": 10, "0208": 10, "0007": 10, "0151": 11 };

// Find the assertion that applies to EndpointID[@schemeID = 'X'].
const tests = {};
for (const pattern of rules.patterns) {
  for (const rule of pattern.rules) {
    const m = /^cbc:EndpointID\[@schemeID = '(\d{4})'\]/.exec(rule.context || "");
    if (!m || !(m[1] in SCHEMES)) continue;
    const check = rule.checks.find((c) => String(c.id).startsWith("PEPPOL-COMMON"));
    if (check) tests[m[1]] = check;
  }
}
for (const scheme of Object.keys(SCHEMES)) if (!tests[scheme]) throw new Error(`no Peppol rule for ${scheme}`);

const xquery = { language: evaluateXPath.XQUERY_3_1_LANGUAGE };
function peppolOk(scheme, raw) {
  const check = tests[scheme];
  // The rules read the element's text with normalize-space() or string();
  // bind it to $v and read that instead of a context node.
  const test = check.test.replace(/normalize-space\(\)/g, "normalize-space($v)").replace(/string\(\)/g, "string($v)");
  // Any other read of the context node would make the rewrite unfaithful.
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
const digit = () => String(Math.floor(rand() * 10));
const body = (n) => Array.from({ length: n }, digit).join("");

function validId(scheme) {
  const len = SCHEMES[scheme];
  const prefix = scheme === "0198" || (scheme === "0184" && rand() < 0.3) ? "DK" : "";
  const n = prefix ? 8 : len;
  for (let tries = 0; tries < 200; tries += 1) {
    if (scheme === "0208") {
      const head = body(8);
      for (let c = 0; c <= 99; c += 1) {
        const id = head + String(c).padStart(2, "0");
        if (peppolOk(scheme, id)) return id;
      }
      continue;
    }
    const head = body(n - 1);
    for (let c = 0; c <= 9; c += 1) {
      const id = prefix + head + c;
      if (peppolOk(scheme, id)) return id;
    }
  }
  return null;
}

function mutants(id) {
  const out = [];
  const at = (s) => Math.floor(rand() * s.length);
  const d = id.search(/\d/);
  let i = d + Math.floor(rand() * (id.length - d));
  out.push(id.slice(0, i) + String((Number(id[i]) + 1 + Math.floor(rand() * 9)) % 10) + id.slice(i + 1));
  i = d + Math.floor(rand() * (id.length - d - 1));
  if (id[i] !== id[i + 1]) out.push(id.slice(0, i) + id[i + 1] + id[i] + id.slice(i + 2));
  i = at(id);
  out.push(id.slice(0, i) + id.slice(i + 1));
  out.push(id + digit());
  i = 1 + Math.floor(rand() * (id.length - 2));
  out.push(id.slice(0, i) + "." + id.slice(i));
  out.push(id.slice(0, i) + " " + id.slice(i));
  out.push(id.slice(0, i) + "-" + id.slice(i));
  out.push(["BE", "NO", "SE", "AU", "DK"][Math.floor(rand() * 5)] + id);
  return out;
}

const per = Number(process.argv[2] || 300);
const rows = [];
let total = 0;
let disagreements = 0;
for (const scheme of Object.keys(SCHEMES)) {
  const row = { scheme, rule: tests[scheme].id, valid: 0, invalid: 0, falseReject: 0, falseAccept: 0, examples: [] };
  for (let k = 0; k < per; k += 1) {
    const id = validId(scheme);
    if (!id) continue;
    for (const raw of [id, ...mutants(id)]) {
      // endpoint.mjs trims first (normalizeEndpointId); compare on the trimmed text.
      const text = normalizeEndpointId(raw);
      if (text === null) continue;
      const theirs = peppolOk(scheme, text);
      const ours = endpointIdOk(scheme, text);
      // Deliberate: a GLN is 13 digits. Peppol's u:gln takes any length of
      // digits whose GS1 check holds; we also ask for the length.
      if (scheme === "0088" && theirs && !ours && /^\d+$/.test(text) && text.length !== 13) {
        row.glnLength = (row.glnLength || 0) + 1;
        continue;
      }
      total += 1;
      if (theirs) row.valid += 1; else row.invalid += 1;
      if (theirs && !ours) row.falseReject += 1;
      if (!theirs && ours) row.falseAccept += 1;
      if (theirs !== ours) {
        disagreements += 1;
        if (row.examples.length < 3) row.examples.push(`${JSON.stringify(text)} peppol=${theirs} ours=${ours}`);
      }
    }
  }
  rows.push(row);
}

console.log(`ids: ${total}, disagreements: ${disagreements}`);
console.log("| scheme | rule | Peppol-valid | Peppol-invalid | we reject a valid one | we accept an invalid one |");
console.log("|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.scheme} | ${r.rule} | ${r.valid} | ${r.invalid} | ${r.falseReject} | ${r.falseAccept} |`);
for (const r of rows) if (r.glnLength) console.log(`${r.scheme}: ${r.glnLength} Peppol-valid ids that are not 13 digits, rejected on purpose (not counted)`);
for (const r of rows) for (const e of r.examples) console.log(`  ${r.scheme}: ${e}`);
process.exitCode = disagreements ? 1 : 0;
