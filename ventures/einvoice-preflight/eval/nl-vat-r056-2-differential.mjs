// Differential, whole files: OpenPeppol's PEPPOL-COMMON-R056-2 (a Dutch VAT
// number in a VAT PartyTaxScheme or a VA SpecifiedTaxRegistration must read
// NL123456789B12) against this preflight's readers plus INV-022/023 (the VAT
// checks) and INV-064 (R056-2's shape, a warning).
//
//   npm i --no-save --no-package-lock slimdom fontoxpath   # once, for the DOM
//   node eval/nl-vat-r056-2-differential.mjs [ids] [seed]
//
// It draws Dutch VAT numbers that pass the elfproef or (sole traders since
// 2020) ISO 7064 mod 97-10, with check digits found by brute force against its
// own arithmetic (no code shared with vat.mjs), makes mutants of each, writes
// each value into one of six places (the seller's, buyer's or tax
// representative's VAT number, UBL or CII) of a shipped example file, and asks
// two questions of the same XML text: does Peppol's R056-2 fire (its assertion
// from plain/peppol-ubl.json or plain/peppol-cii.json, evaluated with
// fontoxpath on a slimdom DOM, as plain-schematron.mjs runs it), and do
// parseUblInvoice/parseCiiInvoice + checkInvoice report INV-022, INV-023 or
// INV-064 at that party's vat_id? No network, no outside data.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUblInvoice } from "../ubl.mjs";
import { parseCiiInvoice } from "../cii.mjs";
import { checkInvoice } from "../checks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const require = createRequire(join(root, "package.json"));
const { parseXmlDocument } = require("slimdom");
const { evaluateXPathToNodes, evaluateXPathToBoolean } = require("fontoxpath");

function r0562(file) {
  const set = JSON.parse(readFileSync(join(root, "plain", file), "utf8"));
  for (const pattern of set.patterns) {
    for (const rule of pattern.rules) {
      const check = rule.checks.find((c) => c.kind === "assert" && c.id === "PEPPOL-COMMON-R056-2");
      if (check) return { ns: set.ns, context: rule.context, check };
    }
  }
  throw new Error(`${file}: no PEPPOL-COMMON-R056-2`);
}
const RULES = { ubl: r0562("peppol-ubl.json"), cii: r0562("peppol-cii.json") };
for (const [syntax, rule] of Object.entries(RULES)) {
  if (rule.check.flag !== "warning") throw new Error(`${syntax}: R056-2 is ${rule.check.flag}, expected warning`);
}

function peppolWarns(xml, syntax) {
  const { ns, context, check } = RULES[syntax];
  const doc = parseXmlDocument(xml);
  const options = { namespaceResolver: (prefix) => ns[prefix] ?? null };
  let fails = 0;
  for (const node of evaluateXPathToNodes(`//(${context})`, doc, null, null, options)) {
    if (!evaluateXPathToBoolean(check.test, node, null, null, options)) fails += 1;
  }
  return fails > 0;
}

let seed = Number(process.argv[3] || 7);
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (s) => s[Math.floor(rand() * s.length)];
const DIG = "0123456789";
const UP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const run = (n) => Array.from({ length: n }, () => pick(DIG)).join("");

// Elfproef: weights 9..2 on the first eight digits, minus the ninth, 0 mod 11.
const elfproef = (nine) => {
  let t = 0;
  for (let i = 0; i < 8; i += 1) t += Number(nine[i]) * (9 - i);
  return (t - Number(nine[8])) % 11 === 0;
};
// Sole traders since 2020: ISO 7064 mod 97-10 over NL...B.. with N=23, L=21, B=11.
const mod97 = (nine, two) => BigInt(`2321${nine}11${two}`) % 97n === 1n;

function validNl() {
  if (rand() < 0.7) {
    for (;;) {
      const head = run(8);
      for (let c = 0; c <= 9; c += 1) {
        const nine = head + c;
        if (nine !== "000000000" && elfproef(nine)) return `NL${nine}B${String(1 + Math.floor(rand() * 99)).padStart(2, "0")}`;
      }
    }
  }
  for (;;) {
    const nine = run(9);
    for (let c = 1; c <= 99; c += 1) {
      const two = String(c).padStart(2, "0");
      if (mod97(nine, two)) return `NL${nine}B${two}`;
    }
  }
}

function mutants(id) {
  const out = [];
  const digitAt = [...id].map((ch, i) => (/\d/.test(ch) ? i : -1)).filter((i) => i >= 0);
  const i = pick(digitAt);
  out.push(id.slice(0, i) + String((Number(id[i]) + 1 + Math.floor(rand() * 9)) % 10) + id.slice(i + 1));
  out.push(id.slice(0, i) + pick(UP) + id.slice(i + 1));
  let k = 2 + Math.floor(rand() * (id.length - 3));
  if (id[k] !== id[k + 1]) out.push(id.slice(0, k) + id[k + 1] + id[k] + id.slice(k + 2));
  out.push(id.slice(0, k) + id.slice(k + 1));
  out.push(id + pick(DIG));
  k = 2 + Math.floor(rand() * (id.length - 2));
  for (const sep of [" ", ".", "-", " ", "  "]) out.push(id.slice(0, k) + sep + id.slice(k));
  out.push(`NL ${id.slice(2)}`);
  out.push(`${id.slice(0, 11)} ${id.slice(11)}`);
  out.push(`  ${id} `);
  out.push(id.replace("B", "b"));
  out.push(id.toLowerCase());
  out.push(id.replace("B", ""));
  out.push(`${id.slice(0, 12)}00`);
  return out;
}

// Where the preflight is stricter than R056-2 on purpose, counted apart.
function deliberate(raw, ours) {
  const text = raw.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  if (!text.startsWith("NL")) return "a value R056-2 does not read (no NL prefix after normalize-space), which INV-022/023 check as any VAT number";
  if (/^NL[0-9]{9}B[0-9]{2}$/.test(text) && ours.every((f) => f.rule === "INV-023")) return "R056-2's shape with a failing checksum, or a never-issued B00 / nine zeros (INV-023)";
  return null;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const UBL = readFileSync(join(root, "examples", "peppol-credit-note.xml"), "utf8");
const CII = readFileSync(join(root, "examples", "cii-invoice.xml"), "utf8");
const must = (text, part) => { if (!text.includes(part)) throw new Error(`template lacks ${part}`); return part; };

const PLACES = [
  { syntax: "ubl", party: "supplier", put: (v) => UBL.replace(must(UBL, "<cbc:CompanyID>DE136695976</cbc:CompanyID>"), `<cbc:CompanyID>${esc(v)}</cbc:CompanyID>`) },
  { syntax: "ubl", party: "customer", put: (v) => UBL.replace(must(UBL, "<cac:PartyLegalEntity><cbc:RegistrationName>Customer AG"), `<cac:PartyTaxScheme><cbc:CompanyID>${esc(v)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>$&`) },
  { syntax: "ubl", party: "tax_representative", put: (v) => UBL.replace(must(UBL, "</cac:AccountingCustomerParty>"), `$&<cac:TaxRepresentativeParty><cac:PartyName><cbc:Name>Fiscal Rep BV</cbc:Name></cac:PartyName><cac:PostalAddress><cac:Country><cbc:IdentificationCode>NL</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>${esc(v)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:TaxRepresentativeParty>`) },
  { syntax: "cii", party: "supplier", put: (v) => CII.replace(must(CII, '<ram:ID schemeID="VA">DE136695976</ram:ID>'), `<ram:ID schemeID="VA">${esc(v)}</ram:ID>`) },
  { syntax: "cii", party: "customer", put: (v) => CII.replace(must(CII, '<ram:ID schemeID="VA">FR40303265045</ram:ID>'), `<ram:ID schemeID="VA">${esc(v)}</ram:ID>`) },
  { syntax: "cii", party: "tax_representative", put: (v) => CII.replace(must(CII, "</ram:BuyerTradeParty>"), `$&<ram:SellerTaxRepresentativeTradeParty><ram:Name>Fiscal Rep BV</ram:Name><ram:PostalTradeAddress><ram:CountryID>NL</ram:CountryID></ram:PostalTradeAddress><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(v)}</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTaxRepresentativeTradeParty>`) },
];
const VAT_RULES = new Set(["INV-022", "INV-023", "INV-064"]);

for (const [syntax, xml, parse] of [["ubl", UBL, parseUblInvoice], ["cii", CII, parseCiiInvoice]]) {
  if (peppolWarns(xml, syntax)) throw new Error(`${syntax} template already fails R056-2`);
  if (checkInvoice(parse(xml)).some((f) => VAT_RULES.has(f.rule))) throw new Error(`${syntax} template already draws a VAT finding`);
}

const per = Number(process.argv[2] || 300);
const rows = new Map(PLACES.map((p) => [`${p.syntax} ${p.party}`, { files: 0, warns: 0, missed: 0, falseFlag: 0, byRule: {} }]));
const kept = {};
const examples = [];
let total = 0;
let disagreements = 0;
for (let n = 0; n < per; n += 1) {
  const id = validNl();
  for (const raw of [id, ...mutants(id)]) {
    const place = PLACES[Math.floor(rand() * PLACES.length)];
    const xml = place.put(raw);
    const theirs = peppolWarns(xml, place.syntax);
    const invoice = (place.syntax === "ubl" ? parseUblInvoice : parseCiiInvoice)(xml);
    const path = `/${place.party}/vat_id`;
    const ours = checkInvoice(invoice).filter((f) => VAT_RULES.has(f.rule) && f.path === path);
    if (!theirs && ours.length) {
      const why = deliberate(raw, ours);
      if (why) { kept[why] = (kept[why] || 0) + 1; continue; }
    }
    const row = rows.get(`${place.syntax} ${place.party}`);
    total += 1;
    row.files += 1;
    if (theirs) {
      row.warns += 1;
      for (const f of ours.slice(0, 1)) row.byRule[f.rule] = (row.byRule[f.rule] || 0) + 1;
    }
    const bad = (theirs && !ours.length) || (!theirs && ours.length);
    if (theirs && !ours.length) row.missed += 1;
    if (!theirs && ours.length) row.falseFlag += 1;
    if (bad) {
      disagreements += 1;
      if (examples.length < 12) examples.push(`${place.syntax} ${path} ${JSON.stringify(raw)} peppol=${theirs ? "R056-2" : "ok"} ours=${ours.map((f) => f.rule).join(",") || "ok"}`);
    }
  }
}

console.log(`files: ${total}, disagreements: ${disagreements}`);
console.log("| place | files | Peppol warns | we miss one | we flag a passing one | ours on Peppol's warnings |");
console.log("|---|---|---|---|---|---|");
for (const [place, r] of rows) {
  const rules = Object.entries(r.byRule).sort().map(([k, v]) => `${k} ${v}`).join(", ") || "-";
  console.log(`| ${place} | ${r.files} | ${r.warns} | ${r.missed} | ${r.falseFlag} | ${rules} |`);
}
for (const [why, n] of Object.entries(kept)) console.log(`stricter on purpose, not counted: ${why}: ${n}`);
for (const e of examples) console.log(`  ${e}`);
process.exitCode = disagreements ? 1 : 0;
