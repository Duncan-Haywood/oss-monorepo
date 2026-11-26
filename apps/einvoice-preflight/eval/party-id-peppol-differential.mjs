// Differential, whole files: OpenPeppol's PEPPOL-COMMON identifier rules on a
// party's PartyIdentification/ID and PartyLegalEntity/CompanyID (UBL) and
// GlobalID and SpecifiedLegalOrganization/ID (CII), against this preflight's
// reader plus INV-062 (fatal set) and INV-063 (warning set).
//
//   npm i --no-save --no-package-lock slimdom fontoxpath   # once, for the DOM
//   node eval/party-id-peppol-differential.mjs [per-scheme] [seed]
//
// For each of the 15 schemes Peppol checks in these places, it draws ids
// (check digits found by brute force against Peppol's own test, so the
// generator shares no code with endpoint.mjs) and mutants of them, writes each
// into one of twenty-eight places (seller, buyer, payee, tax representative or
// deliver-to, identifier or legal registration, UBL or CII; plus UBL's
// DeliveryLocation id, which no Peppol context reaches, two CII line places and four UBL line places, one of them an item id no Peppol context reaches) of a shipped example file, then asks two questions of the same
// XML text: does Peppol's rule fire on that element (the COMMON rules of
// plain/peppol-ubl.json or plain/peppol-cii.json, evaluated with fontoxpath on
// a slimdom DOM, as plain-schematron.mjs runs them), and does
// parseUblInvoice/parseCiiInvoice + checkInvoice report INV-062 or INV-063 at
// that party's path? No network, no outside data.
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
const { evaluateXPathToNodes, evaluateXPathToBoolean, evaluateXPath } = require("fontoxpath");

const FATAL = ["0088", "0192", "0184", "0096", "0198", "0208", "0007", "0151"];
const WARN = ["0201", "0210", "0211", "0106", "0190", "9944", "0217"];
const SCHEMES = [...FATAL, ...WARN];

function commonRules(file) {
  const set = JSON.parse(readFileSync(join(root, "plain", file), "utf8"));
  const rules = [];
  for (const pattern of set.patterns) {
    for (const rule of pattern.rules) {
      const checks = rule.checks.filter((c) => c.kind === "assert" && /^PEPPOL-COMMON-R0(4\d|5[0-7])/.test(String(c.id)) && c.id !== "PEPPOL-COMMON-R046" && c.id !== "PEPPOL-COMMON-R056-2");
      if (checks.length) rules.push({ context: rule.context, checks });
    }
  }
  return { ns: set.ns, prolog: set.prolog, rules };
}
const SETS = { ubl: commonRules("peppol-ubl.json"), cii: commonRules("peppol-cii.json") };
for (const [syntax, set] of Object.entries(SETS)) {
  if (set.rules.length !== SCHEMES.length) throw new Error(`${syntax}: ${set.rules.length} COMMON id rules, expected ${SCHEMES.length}`);
}

// [{ rule, flag, node }] for every COMMON id assertion that fails in the document.
function peppolFindings(xml, syntax) {
  const set = SETS[syntax];
  const doc = parseXmlDocument(xml);
  const resolver = (prefix) => set.ns[prefix] ?? null;
  const xpath = { namespaceResolver: resolver };
  const xquery = { namespaceResolver: resolver, language: evaluateXPath.XQUERY_3_1_LANGUAGE };
  const out = [];
  for (const rule of set.rules) {
    for (const node of evaluateXPathToNodes(`//(${rule.context})`, doc, null, null, xpath)) {
      for (const check of rule.checks) {
        let ok;
        try {
          ok = check.xq ? evaluateXPathToBoolean(`${set.prolog}${check.test}`, node, null, null, xquery)
            : evaluateXPathToBoolean(check.test, node, null, null, xpath);
        } catch {
          ok = false;
        }
        if (!ok) out.push({ rule: check.id, flag: check.flag, node });
      }
    }
  }
  return out;
}

// Peppol's verdict on a bare string, to draw valid ids (generator only).
const stringTests = {};
for (const rule of SETS.ubl.rules) {
  const m = /^cbc:EndpointID\[@schemeID = '(\d{4})'\]/.exec(rule.context);
  if (m) stringTests[m[1]] = rule.checks[0];
}
const bareXquery = { language: evaluateXPath.XQUERY_3_1_LANGUAGE };
function peppolOkString(scheme, value) {
  const check = stringTests[scheme];
  const test = check.test.replace(/normalize-space\(\)/g, "normalize-space($v)").replace(/string\(\)/g, "string($v)");
  try {
    return evaluateXPathToBoolean(`${check.xq ? SETS.ubl.prolog : ""}${test}`, null, null, { v: value }, check.xq ? bareXquery : {});
  } catch {
    return false;
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

function withCheck(scheme, prefix, n, lastTwo = false) {
  for (let tries = 0; tries < 200; tries += 1) {
    const head = run(DIG, n - (lastTwo ? 2 : 1));
    for (let c = 0; c <= (lastTwo ? 99 : 9); c += 1) {
      const id = prefix + head + String(c).padStart(lastTwo ? 2 : 1, "0");
      if (peppolOkString(scheme, id)) return id;
    }
  }
  return null;
}

function validId(scheme) {
  switch (scheme) {
    case "0088": return withCheck(scheme, "", 13);
    case "0192": return withCheck(scheme, "", 9);
    case "0184": return rand() < 0.3 ? `DK${run(DIG, 8)}` : run(DIG, 8);
    case "0096": return run(DIG, 10);
    case "0198": return `DK${run(DIG, 8)}`;
    case "0208": return withCheck(scheme, "", 10, true);
    case "0007": return withCheck(scheme, "", 10);
    case "0151": return withCheck(scheme, "", 11, true);
    case "0201": return run(ALNUM, 6);
    case "0210": {
      if (rand() < 0.5) return run(UP, 6) + run(DIG, 2) + pick(UP) + run(DIG, 2) + pick(UP) + run(DIG, 3) + pick(UP);
      const it = withCheck("0211", "IT", 11);
      return it && it.slice(2);
    }
    case "0211": { const it = withCheck(scheme, "IT", 11); return it && (rand() < 0.6 ? it : it.slice(2)); }
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
  if (digits.length) {
    const i = pick(digits);
    out.push(id.slice(0, i) + String((Number(id[i]) + 1 + Math.floor(rand() * 9)) % 10) + id.slice(i + 1));
    out.push(id.slice(0, i) + pick(UP) + id.slice(i + 1));
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
  out.push(pick(["BE", "NO", "SE", "AU", "DK", "IT", "NL"]) + id);
  out.push(id.toLowerCase());
  return out;
}

// Where we are stricter than Peppol on purpose (endpoint.mjs comments), counted apart.
function deliberate(scheme, text, syntax) {
  // Peppol's CII R050 is u:abn() alone; its UBL R050 also asks for ^[0-9]{11}$. u:abn reads
  // the first 11 characters only, so "12345678901X" passes in CII. An ABN is 11 digits.
  if (scheme === "0151" && syntax === "cii" && !/^\d{11}$/.test(text)) return "an ABN that is not 11 digits (Peppol's CII rule has no length test)";
  if (scheme === "0088" && /^\d+$/.test(text) && text.length !== 13) return "a GLN that is not 13 digits";
  if ((scheme === "0210" || scheme === "0211") && /^\d{11}$/.test(text)) return "11-digit number without its check digit";
  if (scheme === "0211" && !/^it/i.test(text)) return "0211 without IT that is not 11 digits";
  if (scheme === "0210" && text.length === 16) return "a non-digit where Peppol reads castable as xs:integer";
  return null;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const UBL = readFileSync(join(root, "examples", "peppol-credit-note.xml"), "utf8");
const CII = readFileSync(join(root, "examples", "cii-invoice.xml"), "utf8");

// Each place: how to write the id into the file, and the JSON path INV-062/063 names.
const PLACES = [
  { syntax: "ubl", party: "supplier", where: "party_ids", put: (s, v) => UBL.replace('<cbc:EndpointID schemeID="0088">4012345000009</cbc:EndpointID>', `$&<cac:PartyIdentification><cbc:ID schemeID="${s}">${esc(v)}</cbc:ID></cac:PartyIdentification>`) },
  { syntax: "ubl", party: "customer", where: "party_ids", put: (s, v) => UBL.replace('<cbc:EndpointID schemeID="0088">4098765000003</cbc:EndpointID>', `$&<cac:PartyIdentification><cbc:ID schemeID="${s}">${esc(v)}</cbc:ID></cac:PartyIdentification>`) },
  { syntax: "ubl", party: "supplier", where: "legal_id", put: (s, v) => UBL.replace("<cbc:RegistrationName>Supplier GmbH</cbc:RegistrationName>", `$&<cbc:CompanyID schemeID="${s}">${esc(v)}</cbc:CompanyID>`) },
  { syntax: "ubl", party: "customer", where: "legal_id", put: (s, v) => UBL.replace("<cbc:RegistrationName>Customer AG</cbc:RegistrationName>", `$&<cbc:CompanyID schemeID="${s}">${esc(v)}</cbc:CompanyID>`) },
  { syntax: "cii", party: "supplier", where: "party_ids", put: (s, v) => CII.replace("<ram:Name>Supplier GmbH</ram:Name>", `<ram:GlobalID schemeID="${s}">${esc(v)}</ram:GlobalID>$&`) },
  { syntax: "cii", party: "customer", where: "party_ids", put: (s, v) => CII.replace("<ram:Name>Acheteur SARL</ram:Name>", `<ram:GlobalID schemeID="${s}">${esc(v)}</ram:GlobalID>$&`) },
  { syntax: "cii", party: "supplier", where: "legal_id", put: (s, v) => CII.replace("<ram:Name>Supplier GmbH</ram:Name>", `$&<ram:SpecifiedLegalOrganization><ram:ID schemeID="${s}">${esc(v)}</ram:ID></ram:SpecifiedLegalOrganization>`) },
  { syntax: "cii", party: "customer", where: "legal_id", put: (s, v) => CII.replace("<ram:Name>Acheteur SARL</ram:Name>", `$&<ram:SpecifiedLegalOrganization><ram:ID schemeID="${s}">${esc(v)}</ram:ID></ram:SpecifiedLegalOrganization>`) },
  // BG-10 payee (BT-60 identifier, BT-61 legal registration) and BG-11 tax
  // representative: Peppol's contexts match these elements wherever they sit
  // (added 2026-11-17).
  { syntax: "ubl", party: "payee_party", where: "party_ids", put: (s, v) => UBL.replace("</cac:AccountingCustomerParty>", `$&<cac:PayeeParty><cac:PartyIdentification><cbc:ID schemeID="${s}">${esc(v)}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Factor AB</cbc:Name></cac:PartyName></cac:PayeeParty>`) },
  { syntax: "ubl", party: "payee_party", where: "legal_id", put: (s, v) => UBL.replace("</cac:AccountingCustomerParty>", `$&<cac:PayeeParty><cac:PartyName><cbc:Name>Factor AB</cbc:Name></cac:PartyName><cac:PartyLegalEntity><cbc:CompanyID schemeID="${s}">${esc(v)}</cbc:CompanyID></cac:PartyLegalEntity></cac:PayeeParty>`) },
  { syntax: "ubl", party: "tax_representative", where: "party_ids", put: (s, v) => UBL.replace("</cac:AccountingCustomerParty>", `$&<cac:TaxRepresentativeParty><cac:PartyIdentification><cbc:ID schemeID="${s}">${esc(v)}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Fiscal Rep BV</cbc:Name></cac:PartyName><cac:PostalAddress><cac:Country><cbc:IdentificationCode>NL</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>NL123456789B01</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:TaxRepresentativeParty>`) },
  { syntax: "ubl", party: "tax_representative", where: "legal_id", put: (s, v) => UBL.replace("</cac:AccountingCustomerParty>", `$&<cac:TaxRepresentativeParty><cac:PartyName><cbc:Name>Fiscal Rep BV</cbc:Name></cac:PartyName><cac:PartyLegalEntity><cbc:RegistrationName>Fiscal Rep BV</cbc:RegistrationName><cbc:CompanyID schemeID="${s}">${esc(v)}</cbc:CompanyID></cac:PartyLegalEntity></cac:TaxRepresentativeParty>`) },
  { syntax: "cii", party: "payee_party", where: "party_ids", put: (s, v) => CII.replace("<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>", `$&<ram:PayeeTradeParty><ram:GlobalID schemeID="${s}">${esc(v)}</ram:GlobalID><ram:Name>Factor AB</ram:Name></ram:PayeeTradeParty>`) },
  { syntax: "cii", party: "payee_party", where: "legal_id", put: (s, v) => CII.replace("<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>", `$&<ram:PayeeTradeParty><ram:Name>Factor AB</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="${s}">${esc(v)}</ram:ID></ram:SpecifiedLegalOrganization></ram:PayeeTradeParty>`) },
  { syntax: "cii", party: "tax_representative", where: "party_ids", put: (s, v) => CII.replace("</ram:BuyerTradeParty>", `$&<ram:SellerTaxRepresentativeTradeParty><ram:GlobalID schemeID="${s}">${esc(v)}</ram:GlobalID><ram:Name>Fiscal Rep BV</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">NL123456789B01</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTaxRepresentativeTradeParty>`) },
  { syntax: "cii", party: "tax_representative", where: "legal_id", put: (s, v) => CII.replace("</ram:BuyerTradeParty>", `$&<ram:SellerTaxRepresentativeTradeParty><ram:Name>Fiscal Rep BV</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="${s}">${esc(v)}</ram:ID></ram:SpecifiedLegalOrganization></ram:SellerTaxRepresentativeTradeParty>`) },
  // BG-13 deliver-to (added 2026-11-17): UBL's cac:Delivery/cac:DeliveryParty
  // ids and legal registration; CII's ShipToTradeParty ID (BT-71, the
  // delivery location id), GlobalID and legal registration. UBL's BT-71
  // (cac:DeliveryLocation/cbc:ID) sits outside every Peppol context: neither
  // side may flag it, so it is drawn too, as a place where both stay silent.
  { syntax: "ubl", party: "delivery_party", where: "party_ids", put: (s, v) => UBL.replace("</cac:AccountingCustomerParty>", `$&<cac:Delivery><cbc:ActualDeliveryDate>2026-11-02</cbc:ActualDeliveryDate><cac:DeliveryParty><cac:PartyIdentification><cbc:ID schemeID="${s}">${esc(v)}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Warehouse 3</cbc:Name></cac:PartyName></cac:DeliveryParty></cac:Delivery>`) },
  { syntax: "ubl", party: "delivery_party", where: "legal_id", put: (s, v) => UBL.replace("</cac:AccountingCustomerParty>", `$&<cac:Delivery><cac:DeliveryParty><cac:PartyName><cbc:Name>Warehouse 3</cbc:Name></cac:PartyName><cac:PartyLegalEntity><cbc:RegistrationName>Warehouse 3 BV</cbc:RegistrationName><cbc:CompanyID schemeID="${s}">${esc(v)}</cbc:CompanyID></cac:PartyLegalEntity></cac:DeliveryParty></cac:Delivery>`) },
  { syntax: "ubl", party: "delivery_party", where: "party_ids", put: (s, v) => UBL.replace("</cac:AccountingCustomerParty>", `$&<cac:Delivery><cac:DeliveryLocation><cbc:ID schemeID="${s}">${esc(v)}</cbc:ID></cac:DeliveryLocation><cac:DeliveryParty><cac:PartyName><cbc:Name>Warehouse 3</cbc:Name></cac:PartyName></cac:DeliveryParty></cac:Delivery>`) },
  { syntax: "cii", party: "delivery_party", where: "party_ids", put: (s, v) => CII.replace("<ram:ApplicableHeaderTradeDelivery/>", `<ram:ApplicableHeaderTradeDelivery><ram:ShipToTradeParty><ram:ID schemeID="${s}">${esc(v)}</ram:ID><ram:Name>Warehouse 3</ram:Name></ram:ShipToTradeParty></ram:ApplicableHeaderTradeDelivery>`) },
  { syntax: "cii", party: "delivery_party", where: "party_ids", put: (s, v) => CII.replace("<ram:ApplicableHeaderTradeDelivery/>", `<ram:ApplicableHeaderTradeDelivery><ram:ShipToTradeParty><ram:GlobalID schemeID="${s}">${esc(v)}</ram:GlobalID><ram:Name>Warehouse 3</ram:Name></ram:ShipToTradeParty></ram:ApplicableHeaderTradeDelivery>`) },
  { syntax: "cii", party: "delivery_party", where: "legal_id", put: (s, v) => CII.replace("<ram:ApplicableHeaderTradeDelivery/>", `<ram:ApplicableHeaderTradeDelivery><ram:ShipToTradeParty><ram:Name>Warehouse 3</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="${s}">${esc(v)}</ram:ID></ram:SpecifiedLegalOrganization></ram:ShipToTradeParty></ram:ApplicableHeaderTradeDelivery>`) },
  // CII line-level ids (added 2026-11-17, later): the item standard id (BT-157,
  // SpecifiedTradeProduct/GlobalID) under a COMMON scheme, e.g. a GTIN filed as 0088,
  // and an Extended line ShipToTradeParty ID; Peppol's ram:GlobalID / ram:ID contexts
  // reach both. Our path is /lines/0/scheme_ids.
  { syntax: "cii", party: "lines/0", where: "scheme_ids", put: (s, v) => CII.replace("<ram:SpecifiedTradeProduct><ram:Name>", `<ram:SpecifiedTradeProduct><ram:GlobalID schemeID="${s}">${esc(v)}</ram:GlobalID><ram:Name>`) },
  { syntax: "cii", party: "lines/0", where: "scheme_ids", put: (s, v) => CII.replace("</ram:SpecifiedLineTradeDelivery>", `<ram:ShipToTradeParty><ram:ID schemeID="${s}">${esc(v)}</ram:ID><ram:Name>Store 12</ram:Name></ram:ShipToTradeParty>$&`) },
  // UBL line-level parties (added 2026-11-17): a CreditNoteLine's Delivery/DeliveryParty
  // id and legal registration, and an Item's ManufacturerParty id. Peppol's
  // PartyIdentification/ID and CompanyID contexts reach them; our path is /lines/0/scheme_ids.
  // The item's StandardItemIdentification/ID is drawn too: no context reaches it.
  { syntax: "ubl", party: "lines/0", where: "scheme_ids", put: (s, v) => UBL.replace('<cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount>\n    <cac:Item>', `<cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount><cac:Delivery><cac:DeliveryParty><cac:PartyIdentification><cbc:ID schemeID="${s}">${esc(v)}</cbc:ID></cac:PartyIdentification></cac:DeliveryParty></cac:Delivery>\n    <cac:Item>`) },
  { syntax: "ubl", party: "lines/0", where: "scheme_ids", put: (s, v) => UBL.replace('<cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount>\n    <cac:Item>', `<cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount><cac:Delivery><cac:DeliveryParty><cac:PartyLegalEntity><cbc:RegistrationName>Store 12</cbc:RegistrationName><cbc:CompanyID schemeID="${s}">${esc(v)}</cbc:CompanyID></cac:PartyLegalEntity></cac:DeliveryParty></cac:Delivery>\n    <cac:Item>`) },
  { syntax: "ubl", party: "lines/0", where: "scheme_ids", put: (s, v) => UBL.replace("</cac:ClassifiedTaxCategory>", `$&<cac:ManufacturerParty><cac:PartyIdentification><cbc:ID schemeID="${s}">${esc(v)}</cbc:ID></cac:PartyIdentification></cac:ManufacturerParty>`) },
  { syntax: "ubl", party: "lines/0", where: "scheme_ids", put: (s, v) => UBL.replace("<cbc:Name>Consulting</cbc:Name>", `$&<cac:StandardItemIdentification><cbc:ID schemeID="${s}">${esc(v)}</cbc:ID></cac:StandardItemIdentification>`) },
];
if (!CII.includes("<ram:ApplicableHeaderTradeDelivery/>")) throw new Error("cii template: expected an empty ApplicableHeaderTradeDelivery");

// The templates must be clean on both sides, or a finding could come from elsewhere.
for (const [syntax, xml, parse] of [["ubl", UBL, parseUblInvoice], ["cii", CII, parseCiiInvoice]]) {
  if (peppolFindings(xml, syntax).length) throw new Error(`${syntax} template already fails a COMMON id rule`);
  if (checkInvoice(parse(xml)).some((f) => f.rule === "INV-062" || f.rule === "INV-063")) throw new Error(`${syntax} template already draws INV-062/063`);
}

const per = Number(process.argv[2] || 40);
const rows = new Map();
const kept = {};
let total = 0;
let disagreements = 0;
let missedBefore = 0;
for (const scheme of SCHEMES) {
  const fatal = FATAL.includes(scheme);
  const row = { scheme, rule: stringTests[scheme].id, docs: 0, flagged: 0, falseFlag: 0, missed: 0, wrongSeverity: 0, examples: [] };
  rows.set(scheme, row);
  for (let k = 0; k < per; k += 1) {
    const id = validId(scheme);
    if (!id) continue;
    for (const raw of [id, ...mutants(id)]) {
      const place = PLACES[Math.floor(rand() * PLACES.length)];
      const xml = place.put(scheme, raw);
      const theirs = peppolFindings(xml, place.syntax);
      const invoice = (place.syntax === "ubl" ? parseUblInvoice : parseCiiInvoice)(xml);
      const prefix = `/${place.party}/${place.where}`;
      const ours = checkInvoice(invoice).filter((f) => (f.rule === "INV-062" || f.rule === "INV-063") && f.path.startsWith(prefix));
      const peppolFails = theirs.length > 0;
      const weFlag = ours.length > 0;
      const text = raw.trim();
      if (!peppolFails && weFlag) {
        const why = deliberate(scheme, text, place.syntax);
        if (why) { kept[`${scheme}: ${why}`] = (kept[`${scheme}: ${why}`] || 0) + 1; continue; }
      }
      total += 1;
      row.docs += 1;
      if (peppolFails) { row.flagged += 1; missedBefore += 1; }
      let bad = false;
      if (peppolFails && !weFlag) { row.missed += 1; bad = true; }
      if (!peppolFails && weFlag) { row.falseFlag += 1; bad = true; }
      if (peppolFails && weFlag) {
        const wantRule = fatal ? "INV-062" : "INV-063";
        const wantFlag = fatal ? "fatal" : "warning";
        if (ours[0].rule !== wantRule || theirs[0].flag !== wantFlag || (ours[0].severity === "warning") === fatal) { row.wrongSeverity += 1; bad = true; }
      }
      if (bad) {
        disagreements += 1;
        if (row.examples.length < 3) row.examples.push(`${place.syntax} ${prefix} ${JSON.stringify(raw)} peppol=${theirs.map((f) => f.rule).join(",") || "ok"} ours=${ours.map((f) => f.rule).join(",") || "ok"}`);
      }
    }
  }
}

console.log(`files: ${total}, disagreements: ${disagreements}; Peppol's rule fails on ${missedBefore} of them (before INV-062/063 no check read these elements' format)`);
console.log("| scheme | Peppol rule | files | Peppol fails | we miss one | we flag a passing one | wrong rule or severity |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows.values()) console.log(`| ${r.scheme} | ${r.rule} | ${r.docs} | ${r.flagged} | ${r.missed} | ${r.falseFlag} | ${r.wrongSeverity} |`);
for (const [why, n] of Object.entries(kept)) console.log(`stricter on purpose, not counted: ${why}: ${n}`);
for (const r of rows.values()) for (const e of r.examples) console.log(`  ${r.scheme}: ${e}`);
process.exitCode = disagreements ? 1 : 0;
