// The ZATCA stamp check (zatca-stamp.mjs). ZATCA's own signed samples are not copied
// here (eval/zatca-stamp-corpus.mjs runs them: 45 of 45 clean, hash and signature also
// confirmed with node:crypto). These tests sign our made-up example at run time with a
// fresh secp256k1 key and a minimal self-made certificate, the way ZATCA's SDK writes the
// stamp, then break each part and check the right rule fires. No key is committed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { checkZatcaStamp, checkZatcaChain, zatcaInvoiceHash, sha256, toBase64, fromBase64, verifyEcdsaSecp256k1, decodeQrTlv, readCertificate, FIRST_PIH, looksLikeZatca } from "./zatca-stamp.mjs";
import { parseXmlDom, canonicalize, canonicalizeElement } from "./c14n.mjs";
import { preflightDocuments } from "./report.mjs";

const EXAMPLE = readFileSync(new URL("./examples/zatca-simplified-invoice.xml", import.meta.url), "utf8");

// ---- a minimal DER writer, enough for one self-signed test certificate ----
const len = (n) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);
const tlv = (tag, body) => Buffer.from([tag, ...len(body.length), ...body]);
const seq = (...parts) => tlv(0x30, Buffer.concat(parts));
const ECDSA_SHA256 = seq(Buffer.from("06082a8648ce3d040302", "hex"));
const name = (cn) => seq(tlv(0x31, seq(Buffer.from("0603550403", "hex"), tlv(0x0c, Buffer.from(cn)))));
const utc = (d) => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z"));

function makeKeyAndCert({ notBefore = new Date("2024-01-01T00:00:00Z"), notAfter = new Date("2029-01-01T00:00:00Z") } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "secp256k1" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const tbs = seq(tlv(0xa0, tlv(0x02, Buffer.from([2]))), tlv(0x02, Buffer.from([1])), ECDSA_SHA256, name("Test CA"), seq(utc(notBefore), utc(notAfter)), name("TST-399999999900003"), spki);
  const caSig = crypto.sign("sha256", tbs, { key: privateKey, dsaEncoding: "der" });
  const cert = seq(tbs, ECDSA_SHA256, tlv(0x03, Buffer.concat([Buffer.from([0]), caSig])));
  return { privateKey, publicKey, spki, cert, caSig };
}

const qrField = (t, v) => { const b = Buffer.isBuffer(v) ? v : Buffer.from(v); return Buffer.concat([Buffer.from([t, b.length]), b]); };

/** Sign an invoice the way ZATCA's SDK lays the stamp out. `tamper` hooks let a test break one part. */
function sign(xml, keys, { signingTime = "2024-02-29T12:21:30", tamper = {} } = {}) {
  const hash = zatcaInvoiceHash(xml);
  const hashForSig = tamper.signOver ? tamper.signOver : fromBase64(hash);
  const sigValue = crypto.sign("sha256", hashForSig, { key: tamper.otherKey || keys.privateKey, dsaEncoding: "der" }).toString("base64");
  const certB64 = keys.cert.toString("base64");
  const certDigest = Buffer.from(crypto.createHash("sha256").update(certB64).digest("hex")).toString("base64");
  const ind = "\n" + " ".repeat(36);
  const props = `<xades:SignedProperties Id="xadesSignedProperties">${ind}  <xades:SignedSignatureProperties>${ind}    <xades:SigningTime>${signingTime}</xades:SigningTime>${ind}    <xades:SigningCertificate>${ind}      <xades:Cert>${ind}        <xades:CertDigest>${ind}          <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>${ind}          <ds:DigestValue>${tamper.certDigest || certDigest}</ds:DigestValue>${ind}        </xades:CertDigest>${ind}      </xades:Cert>${ind}    </xades:SigningCertificate>${ind}  </xades:SignedSignatureProperties>${ind}</xades:SignedProperties>`;
  // The SDK's SignedProperties digest: hex SHA-256 of the element with xades and ds declared where used, empty elements self-closed, then base64.
  const propsForDigest = props.replace("<xades:SignedProperties ", '<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" ').replace(/<ds:(\w+)/g, '<ds:$1 xmlns:ds="http://www.w3.org/2000/09/xmldsig#"');
  const propsDigest = Buffer.from(crypto.createHash("sha256").update(propsForDigest).digest("hex")).toString("base64");
  const signedProps = tamper.editPropsAfter ? props.replace(signingTime, "2024-03-01T00:00:00") : props;
  const ext = `<ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
      <ext:ExtensionContent>
        <sig:UBLDocumentSignatures>
          <sac:SignatureInformation>
            <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>
            <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
            <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">
              <ds:SignedInfo>
                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
                <ds:Reference Id="invoiceSignedData" URI="">
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                  <ds:DigestValue>${tamper.digest || hash}</ds:DigestValue>
                </ds:Reference>
                <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                  <ds:DigestValue>${propsDigest}</ds:DigestValue>
                </ds:Reference>
              </ds:SignedInfo>
              <ds:SignatureValue>${sigValue}</ds:SignatureValue>
              <ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>
              <ds:Object>
                <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">
                                    ${signedProps}
                </xades:QualifyingProperties>
              </ds:Object>
            </ds:Signature>
          </sac:SignatureInformation>
        </sig:UBLDocumentSignatures>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>`;
  const q = tamper.qr || {};
  const fields = [
    [1, q[1] ?? "Acme Widgets LTD"], [2, q[2] ?? "399999999900003"], [3, q[3] ?? "2024-02-29T12:21:28"], [4, q[4] ?? "115.00"], [5, q[5] ?? "15.00"],
    [6, q[6] ?? hash], [7, q[7] ?? sigValue], [8, q[8] ?? keys.spki], [9, q[9] ?? keys.caSig],
  ].filter(([t]) => !(tamper.dropQr || []).includes(t));
  const qr = Buffer.concat(fields.map(([t, v]) => qrField(t, v))).toString("base64");
  return xml.replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, ext)
    .replace(/(<cbc:ID>QR<\/cbc:ID>\s*<cac:Attachment>\s*<cbc:EmbeddedDocumentBinaryObject[^>]*>)[^<]*/, `$1${qr}`);
}

const keys = makeKeyAndCert();
const rules = (xml) => checkZatcaStamp(xml).findings.map((f) => f.rule).sort();

test("sha256 and base64 match node:crypto", () => {
  for (const s of ["", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(64), "ملخص", "y".repeat(1000)]) {
    assert.equal(toBase64(sha256(s)), crypto.createHash("sha256").update(s).digest("base64"));
  }
  const bytes = crypto.randomBytes(97);
  assert.deepEqual(Buffer.from(fromBase64(bytes.toString("base64"))), bytes);
  assert.equal(toBase64(bytes), bytes.toString("base64"));
  assert.throws(() => fromBase64("not base64!"));
});

test("secp256k1 verification agrees with node:crypto, including on wrong messages and keys", () => {
  const other = makeKeyAndCert();
  const point = readCertificate(keys.cert).point;
  for (let i = 0; i < 6; i++) {
    const msg = crypto.randomBytes(32);
    const sig = crypto.sign("sha256", msg, { key: keys.privateKey, dsaEncoding: "der" });
    assert.equal(verifyEcdsaSecp256k1(point, msg, sig), true);
    assert.equal(verifyEcdsaSecp256k1(point, crypto.randomBytes(32), sig), false);
    assert.equal(verifyEcdsaSecp256k1(readCertificate(other.cert).point, msg, sig), false);
  }
  // A compressed point (02/03 prefix) is read too.
  const raw = keys.publicKey.export({ format: "jwk" });
  const x = Buffer.from(raw.x, "base64url"), y = Buffer.from(raw.y, "base64url");
  const compressed = Buffer.concat([Buffer.from([y[31] & 1 ? 3 : 2]), x]);
  const msg = Buffer.from("hash");
  assert.equal(verifyEcdsaSecp256k1(compressed, msg, crypto.sign("sha256", msg, { key: keys.privateKey, dsaEncoding: "der" })), true);
});

test("C14N: namespaces once, attributes sorted, empty elements expanded, text escaped", () => {
  const doc = parseXmlDom(`<?xml version="1.0"?>\n<a xmlns="urn:x" xmlns:p="urn:p" z="1" b="&amp;&lt;"><p:b p:k="2" a="1"/><c xmlns:p="urn:p">x &gt; y &#xD;</c></a>`);
  assert.equal(canonicalize(doc), `<a xmlns="urn:x" xmlns:p="urn:p" b="&amp;&lt;" z="1"><p:b a="1" p:k="2"></p:b><c>x &gt; y &#xD;</c></a>`);
  const inner = doc.root.children[1];
  assert.equal(canonicalizeElement(inner), `<c xmlns="urn:x" xmlns:p="urn:p">x &gt; y &#xD;</c>`);
  assert.equal(canonicalizeElement(inner, { exclusive: true }), `<c xmlns="urn:x">x &gt; y &#xD;</c>`);
  assert.throws(() => parseXmlDom(`<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>`), /DTD/);
});

test("a correctly signed invoice raises no stamp finding, and the page's batch run carries none", async () => {
  const xml = sign(EXAMPLE, keys);
  const { findings, meta } = checkZatcaStamp(xml);
  assert.deepEqual(findings, []);
  assert.deepEqual(meta.checked, ["hash", "signature", "certificate digest", "signed properties digest", "QR"]);
  assert.equal(meta.simplified, true);
  assert.equal(meta.pih, FIRST_PIH);
  assert.equal(meta.icv, "10");
  const { reports } = await preflightDocuments([{ name: "signed.xml", source: xml }]);
  assert.deepEqual(reports[0].errors.filter((e) => /^KSA-STAMP/.test(e.rule)), []);
});

test("an edit after signing breaks the hash (01) and the QR's hash (11), and the signature still verifies over the stated hash", () => {
  const xml = sign(EXAMPLE, keys).replace("<cbc:IssueTime>12:21:28</cbc:IssueTime>", "<cbc:IssueTime>12:21:29</cbc:IssueTime>");
  assert.deepEqual(rules(xml), ["KSA-STAMP-01", "KSA-STAMP-08", "KSA-STAMP-11"]);
  const f = checkZatcaStamp(xml).findings.find((x) => x.rule === "KSA-STAMP-01");
  assert.match(f.message, /changed after it was signed/);
});

test("pretty-printing a signed file breaks the hash: whitespace is part of what ZATCA hashes", () => {
  const xml = sign(EXAMPLE, keys).replace("<cbc:ProfileID>", "\n    <cbc:ProfileID>");
  assert.ok(rules(xml).includes("KSA-STAMP-01"));
});

test("the hash ignores the stamp itself: changing the QR, signature block or UBLExtensions keeps it", () => {
  const signed = sign(EXAMPLE, keys);
  assert.equal(zatcaInvoiceHash(signed), zatcaInvoiceHash(EXAMPLE));
});

test("a signature by another key, or over the hash text instead of its bytes, fails verification (03)", () => {
  assert.deepEqual(rules(sign(EXAMPLE, keys, { tamper: { otherKey: makeKeyAndCert().privateKey } })), ["KSA-STAMP-03"]);
  const hash = zatcaInvoiceHash(EXAMPLE);
  assert.deepEqual(rules(sign(EXAMPLE, keys, { tamper: { signOver: Buffer.from(hash) } })), ["KSA-STAMP-03"]);
});

test("QR fields that disagree with the invoice are named by tag (06-10, 12-14)", () => {
  const other = makeKeyAndCert();
  const xml = sign(EXAMPLE, keys, { tamper: { qr: { 1: "Acme Widgets", 2: "399999999900099", 3: "2024-02-28T12:21:28", 4: "116.00", 5: "16.00", 7: "MEUCIQ==", 8: other.spki, 9: other.caSig } } });
  assert.deepEqual(rules(xml), ["KSA-STAMP-06", "KSA-STAMP-07", "KSA-STAMP-08", "KSA-STAMP-09", "KSA-STAMP-10", "KSA-STAMP-12", "KSA-STAMP-13", "KSA-STAMP-14"]);
  // Money compares by value; a Z or fractional seconds on the timestamp is fine.
  assert.deepEqual(rules(sign(EXAMPLE, keys, { tamper: { qr: { 3: "2024-02-29T12:21:28Z", 4: "115", 5: "15.000" } } })), []);
});

test("a simplified invoice's QR needs tag 9; a standard one's does not (05)", () => {
  assert.deepEqual(rules(sign(EXAMPLE, keys, { tamper: { dropQr: [9] } })), ["KSA-STAMP-05"]);
  const standard = EXAMPLE.replace('name="0200000"', 'name="0100000"');
  assert.deepEqual(rules(sign(standard, keys, { tamper: { dropQr: [9] } })), []);
});

test("a malformed TLV is reported, not misread (04)", () => {
  // Our own examples carried this until 2026-11-14: tag 1 declared 13 bytes for the 12-byte "Acme Widgets".
  const bad = "AQ1BY21lIFdpZGdldHMCDzM5OTk5OTk5OTkwMDAwMwMUMjAyNC0wMi0yOVQxMjoyMToyOFoEBzExNS4wMDAFBjE1LjAwMA==";
  const xml = EXAMPLE.replace(/(<cbc:ID>QR<\/cbc:ID>\s*<cac:Attachment>\s*<cbc:EmbeddedDocumentBinaryObject[^>]*>)[^<]*/, `$1${bad}`);
  assert.deepEqual(rules(xml), ["KSA-STAMP-04"]);
  assert.throws(() => decodeQrTlv(fromBase64(bad)), /remain/);
});

test("an unsigned file is compared on QR tags 1-5 only; the BR-KSA rules report the missing stamp", () => {
  assert.deepEqual(rules(EXAMPLE), []);
  assert.deepEqual(checkZatcaStamp(EXAMPLE).meta.checked, ["QR"]);
});

test("XAdES: a wrong certificate digest (18), SignedProperties edited after the digest (19), signing outside the certificate's dates (16, a warning)", () => {
  assert.deepEqual(rules(sign(EXAMPLE, keys, { tamper: { certDigest: "AAAA" } })), ["KSA-STAMP-18"]);
  assert.deepEqual(rules(sign(EXAMPLE, keys, { tamper: { editPropsAfter: true } })), ["KSA-STAMP-19"]);
  const expired = makeKeyAndCert({ notAfter: new Date("2024-01-31T00:00:00Z") });
  const { findings } = checkZatcaStamp(sign(EXAMPLE, expired));
  assert.deepEqual(findings.map((f) => [f.rule, f.severity]), [["KSA-STAMP-16", "warning"]]);
});

test("the batch hash chain: PIH must be the previous counter's hash (20), through preflightDocuments", async () => {
  const one = sign(EXAMPLE.replace("<cbc:UUID>10</cbc:UUID>", "<cbc:UUID>11</cbc:UUID>").replace("SME00010", "SME00011"), keys);
  const goodPih = zatcaInvoiceHash(one);
  const next = (pih) => sign(EXAMPLE.replace("<cbc:UUID>10</cbc:UUID>", "<cbc:UUID>12</cbc:UUID>").replace("SME00010", "SME00012").replace(FIRST_PIH, pih), keys);
  const meta = (xml) => checkZatcaStamp(xml).meta;
  assert.equal(checkZatcaChain([{ file: "a.xml", meta: meta(one) }, { file: "b.xml", meta: meta(next(goodPih)) }]).size, 0);
  const broken = checkZatcaChain([{ file: "a.xml", meta: meta(one) }, { file: "b.xml", meta: meta(next(FIRST_PIH)) }]);
  assert.deepEqual([...broken.keys()], ["b.xml"]);
  assert.match(broken.get("b.xml")[0].message, /chain was restarted/);
  // Gaps and duplicate counters (two devices) are not compared.
  assert.equal(checkZatcaChain([{ file: "b.xml", meta: meta(next(FIRST_PIH)) }]).size, 0);
  const { reports } = await preflightDocuments([{ name: "a.xml", source: one }, { name: "b.xml", source: next(FIRST_PIH) }]);
  assert.deepEqual(reports.map((r) => r.errors.filter((e) => e.rule === "KSA-STAMP-20").length), [0, 1]);
});

test("only ZATCA files are stamp-checked", async () => {
  assert.equal(looksLikeZatca(EXAMPLE), true);
  const peppol = readFileSync(new URL("./examples/pint-sg-invoice.xml", import.meta.url), "utf8");
  assert.equal(looksLikeZatca(peppol), false);
  const { reports } = await preflightDocuments([{ name: "sg.xml", source: peppol }]);
  assert.equal(reports[0].errors.some((e) => /^KSA-STAMP/.test(e.rule)), false);
});
