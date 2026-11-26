import test from "node:test";
import assert from "node:assert/strict";
import { declaresNamespace, stripXmlNoise } from "./xml-text.mjs";
import { looksLikeNfe, NFE_NS } from "./nfe.mjs";
import { looksLikeNfse, NFSE_NS } from "./nfse.mjs";
import { ublRoot } from "./ubl-xsd.mjs";

test("stripXmlNoise removes comments whole, each at its first terminator", () => {
  assert.equal(stripXmlNoise("a<!-- x -->b<!--y-->c"), "abc");
  assert.equal(stripXmlNoise("<r><!-- a > b --></r>"), "<r></r>");
  assert.equal(stripXmlNoise("<!----><r/>"), "<r/>");
});

test("stripXmlNoise: an unterminated comment runs to the end instead of being left in the text", () => {
  assert.equal(stripXmlNoise("<r>text<!-- never closed <x/>"), "<r>text");
  assert.equal(stripXmlNoise("<!--"), "");
  assert.equal(stripXmlNoise("a<!--b"), "a");
  // Text around a comment is kept as the parser reads it, even where it spells markup.
  assert.equal(stripXmlNoise("<!<!---->--"), "<!--");
});

test("stripXmlNoise reads CDATA and comments in one pass, as a parser does", () => {
  // A <!-- inside CDATA is text; with cdata on, the section goes whole and what follows stays.
  assert.equal(stripXmlNoise("<a><![CDATA[ <!-- ]]>&amp;</a>", { cdata: true }), "<a>&amp;</a>");
  // Without cdata, the section is kept and only real comments go.
  assert.equal(stripXmlNoise("<a><![CDATA[x]]><!--c--></a>"), "<a><![CDATA[x]]></a>");
  // A ]]> inside a comment does not end anything.
  assert.equal(stripXmlNoise("<!-- ]]> --><b/>", { cdata: true }), "<b/>");
  assert.equal(stripXmlNoise("<a><![CDATA[ open", { cdata: true }), "<a>");
});

test("stripXmlNoise drops processing instructions only when asked", () => {
  assert.equal(stripXmlNoise('<?xml version="1.0"?><r/>', { pi: true }), "<r/>");
  assert.equal(stripXmlNoise('<?xml version="1.0"?><r/>'), '<?xml version="1.0"?><r/>');
  assert.equal(stripXmlNoise("<?pi <!-- ?><r/>", { pi: true }), "<r/>");
});

test("stripXmlNoise is linear on many comments", () => {
  const s = "<!--a-->".repeat(200000) + "<r/>";
  const t = performance.now();
  assert.equal(stripXmlNoise(s), "<r/>");
  assert.ok(performance.now() - t < 1000);
});

test("declaresNamespace compares the whole attribute value", () => {
  const uri = "http://www.portalfiscal.inf.br/nfe";
  assert.ok(declaresNamespace(`<NFe xmlns="${uri}">`, uri));
  assert.ok(declaresNamespace(`<n:NFe xmlns:n='${uri}'>`, uri));
  assert.ok(declaresNamespace(`<NFe\n  xmlns = "${uri}">`, uri));
  assert.equal(declaresNamespace(`<NFe xmlns="${uri}/v2">`, uri), false);
  assert.equal(declaresNamespace(`<NFe xmlns="https://evil.example/?${uri}">`, uri), false);
  assert.equal(declaresNamespace(`<NFe><!-- ${uri} --></NFe>`, uri), false);
  assert.equal(declaresNamespace(`<NFe xmlnsx="${uri}">`, uri), false);
});

test("the NF-e and NFS-e sniffers need the namespace declared, not just written somewhere", () => {
  assert.ok(looksLikeNfe(`<NFe xmlns="${NFE_NS}"><infNFe/></NFe>`));
  assert.equal(looksLikeNfe(`<NFe xmlns="urn:other"><obs>${NFE_NS}</obs></NFe>`), false);
  assert.equal(looksLikeNfe(`<NFe xmlns="http://evil.example/${NFE_NS}"/>`), false);
  assert.ok(looksLikeNfse(`<DPS xmlns="${NFSE_NS}" versao="1.00"/>`));
  assert.equal(looksLikeNfse(`<DPS xmlns="${NFSE_NS}.evil.example"/>`), false);
});

test("ublRoot skips comments and PIs before the root, and an unterminated comment hides it", () => {
  const ubl = '<?xml version="1.0"?><!-- <CreditNote> --><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>';
  assert.equal(ublRoot(ubl)?.name, "Invoice");
  assert.equal(ublRoot('<!-- open <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>'), null);
});
