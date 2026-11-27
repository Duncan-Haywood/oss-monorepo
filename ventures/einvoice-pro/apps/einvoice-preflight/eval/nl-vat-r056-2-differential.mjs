// Differential, whole files: OpenPeppol's PEPPOL-COMMON-R056-2 (a Dutch VAT
// number in a VAT PartyTaxScheme or a VA SpecifiedTaxRegistration must read
// NL123456789B12) against this preflight's readers plus INV-022/023 (the VAT
// checks) and INV-064 (R056-2's shape, a warning).
//
//   npm i --no-save --no-package-lock slimdom fontoxpath   # once, for the DOM
//   node eval/nl-vat-r056-2-differential.mjs [ids] [seed] [--saxon-dir DIR]
//
// It draws Dutch VAT numbers that pass the elfproef or (sole traders since
// 2020) ISO 7064 mod 97-10, with check digits found by brute force against its
// own arithmetic (no code shared with vat.mjs), makes mutants of each, writes
// each value into one of thirteen places (the seller's, buyer's or tax
// representative's VAT number, UBL or CII, and since 2026-11-17 the payee's,
// the deliver-to party's, a line deliver-to party's and a second seller VAT
// registration) of a shipped example file, and asks
// two questions of the same XML text: does Peppol's R056-2 fire (its assertion
// from plain/peppol-ubl.json or plain/peppol-cii.json, evaluated with
// fontoxpath on a slimdom DOM, as plain-schematron.mjs runs it), and do
// parseUblInvoice/parseCiiInvoice + checkInvoice report INV-022, INV-023 or
// INV-064 at that party's vat_id? No network, no outside data.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const { evaluateXPathToNodes, evaluateXPathToBoolean, registerCustomXPathFunction } = require("fontoxpath");

// fontoxpath's normalize-space strips U+00A0 (it uses JavaScript's \s); XPath
// 3.1 strips XML whitespace only (#x20, #x9, #xD, #xA), and Saxon, which
// Peppol's validators run, keeps a trailing no-break space, so R056-2 warns on
// `NL123456782B01` + U+00A0. The assertion is evaluated with a spec copy of
// normalize-space (found 2026-11-17; checked against Saxon-HE 12.5 on every
// file with --saxon-dir, see eval/nl-vat-r056-2-payee-refs-2026-11-17.md).
const SPEC_NS = "urn:x-eval:spec";
registerCustomXPathFunction({ namespaceURI: SPEC_NS, localName: "normalize-space" }, ["item()?"], "xs:string", (_, item) => {
  const text = item === null || item === undefined ? "" : typeof item === "object" ? item.textContent : String(item);
  return text.replace(/[ \t\r\n]+/g, " ").replace(/^ | $/g, "");
});
const specXPath = (xpath) => xpath.replace(/normalize-space\(/g, "spec:normalize-space(");

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
  const options = { namespaceResolver: (prefix) => (prefix === "spec" ? SPEC_NS : ns[prefix] ?? null) };
  let fails = 0;
  for (const node of evaluateXPathToNodes(`//(${specXPath(context)})`, doc, null, null, options)) {
    if (!evaluateXPathToBoolean(specXPath(check.test), node, null, null, options)) fails += 1;
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
  // Added 2026-11-17: written with XML character references or a no-break
  // space (Peppol's normalize-space keeps U+00A0; String.trim() drops it).
  out.push(`${id}\u00a0`, `${id}&#160;`, `\u00a0${id}`, `${id}&#xA0;`);
  out.push(id.replace("B", "&#66;"), id.replace("B", "&#x42;"), `&#78;${id.slice(1)}`, `${id.slice(0, 5)}&#x20;${id.slice(5)}`);
  return out;
}

// Where the preflight is stricter than R056-2 on purpose, counted apart.
const decodeRefs = (s) => s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => codePointOr(parseInt(h, 16))).replace(/&#([0-9]+);/g, (_, d) => codePointOr(Number(d)));
function deliberate(raw, ours) {
  const text = decodeRefs(raw).replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  if (!text.startsWith("NL")) return "a value R056-2 does not read (no NL prefix after normalize-space), which INV-022/023 check as any VAT number";
  if (/^NL[0-9]{9}B[0-9]{2}$/.test(text) && ours.every((f) => f.rule === "INV-023")) return "R056-2's shape with a failing checksum, or a never-issued B00 / nine zeros (INV-023)";
  return null;
}

// Values are XML text as written: the generator never makes < or a bare &,
// and its reference mutants must reach the file as references.
const esc = (s) => s;
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
  // Added 2026-11-17: the rest of R056-2's reach (any VAT PartyTaxScheme or VA
  // SpecifiedTaxRegistration), which EN 16931 gives no VAT number. Ours means
  // INV-064 at /vat_registrations/N/value.
  { syntax: "ubl", party: "payee", extra: true, put: (v) => UBL.replace(must(UBL, "</cac:AccountingCustomerParty>"), `$&<cac:PayeeParty><cac:PartyName><cbc:Name>Factoring BV</cbc:Name></cac:PartyName><cac:PartyTaxScheme><cbc:CompanyID>${esc(v)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:PayeeParty>`) },
  { syntax: "ubl", party: "deliver-to", extra: true, put: (v) => UBL.replace(must(UBL, "</cac:AccountingCustomerParty>"), `$&<cac:Delivery><cac:DeliveryParty><cac:PartyName><cbc:Name>Depot BV</cbc:Name></cac:PartyName><cac:PartyTaxScheme><cbc:CompanyID>${esc(v)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:DeliveryParty></cac:Delivery>`) },
  { syntax: "ubl", party: "line deliver-to", extra: true, put: (v) => UBL.replace(must(UBL, "</cac:CreditNoteLine>"), `<cac:Delivery><cac:DeliveryParty><cac:PartyName><cbc:Name>Depot BV</cbc:Name></cac:PartyName><cac:PartyTaxScheme><cbc:CompanyID>${esc(v)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:DeliveryParty></cac:Delivery>$&`) },
  { syntax: "ubl", party: "seller's second", extra: true, put: (v) => UBL.replace(must(UBL, "<cbc:CompanyID>DE136695976</cbc:CompanyID>"), `$&<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyTaxScheme><cbc:CompanyID>${esc(v)}</cbc:CompanyID>`) },
  { syntax: "cii", party: "payee", extra: true, put: (v) => CII.replace(must(CII, "<ram:ApplicableHeaderTradeSettlement>"), `$&<ram:PayeeTradeParty><ram:Name>Factoring BV</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(v)}</ram:ID></ram:SpecifiedTaxRegistration></ram:PayeeTradeParty>`) },
  { syntax: "cii", party: "deliver-to", extra: true, put: (v) => CII.replace(must(CII, "<ram:ApplicableHeaderTradeDelivery/>"), `<ram:ApplicableHeaderTradeDelivery><ram:ShipToTradeParty><ram:Name>Depot BV</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(v)}</ram:ID></ram:SpecifiedTaxRegistration></ram:ShipToTradeParty></ram:ApplicableHeaderTradeDelivery>`) },
  { syntax: "cii", party: "seller's second", extra: true, put: (v) => CII.replace(must(CII, '<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">DE136695976</ram:ID></ram:SpecifiedTaxRegistration>'), `$&<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(v)}</ram:ID></ram:SpecifiedTaxRegistration>`) },
];
const VAT_RULES = new Set(["INV-022", "INV-023", "INV-064"]);

for (const [syntax, xml, parse] of [["ubl", UBL, parseUblInvoice], ["cii", CII, parseCiiInvoice]]) {
  if (peppolWarns(xml, syntax)) throw new Error(`${syntax} template already fails R056-2`);
  if (checkInvoice(parse(xml)).some((f) => VAT_RULES.has(f.rule))) throw new Error(`${syntax} template already draws a VAT finding`);
}

// --saxon-dir DIR writes every file, named with this oracle's verdict, under
// DIR/ubl and DIR/cii for eval/r056-2-saxon.xq.txt to re-check with Saxon.
const saxonAt = process.argv.indexOf("--saxon-dir");
const saxonDir = saxonAt > 0 ? process.argv[saxonAt + 1] : "";
if (saxonDir) for (const syntax of ["ubl", "cii"]) mkdirSync(join(saxonDir, syntax), { recursive: true });
let dumped = 0;
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
    if (saxonDir) {
      dumped += 1;
      writeFileSync(join(saxonDir, place.syntax, `${String(dumped).padStart(6, "0")}-${theirs ? "warn" : "ok"}.xml`), xml);
    }
    const invoice = (place.syntax === "ubl" ? parseUblInvoice : parseCiiInvoice)(xml);
    const path = place.extra ? "/vat_registrations/0/value" : `/${place.party}/vat_id`;
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

// A character reference or escape past U+10FFFF (or not a number) becomes U+FFFD,
// as HTML parsers do, instead of throwing a RangeError on a stranger's input.
function codePointOr(n) { return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\uFFFD"; }
