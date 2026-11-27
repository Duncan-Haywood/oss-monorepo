// The Facturae XAdES signature check (facturae-signature.mjs, xmldsig.mjs). The
// fixture is signed at run time with a fresh RSA key and a minimal self-made
// certificate, laid out the way Facturae signers write XAdES-EPES (SignedProperties,
// KeyInfo and the whole document referenced; policy v3.1; role emisor), then each
// part is broken and the right rule must fire. No key is committed. Digests and
// signatures here come from node:crypto, a second implementation; the C14N used to
// build them is ours, and eval/facturae-signature-corpus.mjs checks it against
// libxml2 (signxml) on 180 files.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { checkFacturaeSignature, FACTURAE_POLICY, FACTURAE_POLICY_V30 } from "./facturae-signature.mjs";
import { sha1, sha384, sha512, verifyRsaPkcs1, parseDnString, sameDn, readX509 } from "./xmldsig.mjs";
import { parseXmlDom, canonicalize, childElements } from "./c14n.mjs";
import { checkFacturae } from "./facturae.mjs";
import { preflightDocuments } from "./report.mjs";

const VALID = readFileSync(new URL("./fixtures/facturae/valid-322.xml", import.meta.url), "utf8");
const DSNS = "http://www.w3.org/2000/09/xmldsig#";

// ---- a minimal DER writer, enough for one self-signed RSA test certificate ----
const len = (n) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);
const tlv = (tag, body) => Buffer.from([tag, ...len(body.length), ...body]);
const seq = (...parts) => tlv(0x30, Buffer.concat(parts));
const SHA256_RSA = seq(Buffer.from("06092a864886f70d01010b", "hex"), Buffer.from([5, 0]));
const atv = (oidHex, value) => tlv(0x31, seq(Buffer.from(oidHex, "hex"), tlv(0x0c, Buffer.from(value))));
const ISSUER = seq(atv("0603550406", "ES"), atv("060355040a", "FNMT-RCM test"), atv("060355040b", "Ceres"), atv("0603550403", "AC Test Usuarios"));
const SUBJECT = seq(atv("0603550406", "ES"), atv("0603550403", "PRUEBAS - 99999972C"));
const utc = (d) => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z"));

function makeKeyAndCert({ bits = 2048, serial = Buffer.from("73f83a2e501a560f", "hex"), notBefore = new Date("2024-03-11T14:05:30Z"), notAfter = new Date("2028-03-11T14:05:30Z") } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: bits });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const tbs = seq(tlv(0xa0, tlv(0x02, Buffer.from([2]))), tlv(0x02, serial), SHA256_RSA, ISSUER, seq(utc(notBefore), utc(notAfter)), SUBJECT, spki);
  const sig = crypto.sign("sha256", tbs, privateKey);
  const cert = seq(tbs, SHA256_RSA, tlv(0x03, Buffer.concat([Buffer.from([0]), sig])));
  return { privateKey, publicKey, cert, serialDec: BigInt("0x" + serial.toString("hex")).toString() };
}
const KEYS = makeKeyAndCert();
const OTHER = makeKeyAndCert({ serial: Buffer.from("0102", "hex") });

const ALG = {
  sha1: { digest: "http://www.w3.org/2000/09/xmldsig#sha1", sig: "http://www.w3.org/2000/09/xmldsig#rsa-sha1", node: "sha1" },
  sha256: { digest: "http://www.w3.org/2001/04/xmlenc#sha256", sig: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", node: "sha256" },
  sha512: { digest: "http://www.w3.org/2001/04/xmlenc#sha512", sig: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512", node: "sha512" },
};
const C14N10 = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const EXC = "http://www.w3.org/2001/10/xml-exc-c14n#";
const b64 = (alg, s) => crypto.createHash(ALG[alg].node).update(s, "utf8").digest("base64");

function findById(node, id) {
  for (const c of node.children || []) if (c.type === "element") {
    if (c.attrs.some((a) => a.local === "Id" && a.value === id)) return c;
    const d = findById(c, id); if (d) return d;
  }
  return null;
}
function c14nOf(el, { exclusive = false } = {}) {
  const inherited = new Map();
  for (let n = el.parent; n && n.type === "element"; n = n.parent) for (const [p, u] of n.nsDecls) if (!inherited.has(p)) inherited.set(p, u);
  return canonicalize({ type: "document", children: [{ ...el, nsDecls: new Map([...inherited, ...el.nsDecls]), parent: null }] }, () => false, { exclusive });
}

/**
 * Sign a Facturae file. Options break one part each:
 *  alg, docC14n ("c14n" | "exc" | "xpath"), keys (signing key), cert (embedded cert), certDigestOf,
 *  serial, issuerName, policy (false drops it), policyUrl, policyHash, policyHashAlg, signingTime, role,
 *  noSignedPropsRef, noDocRef, undeclaredExc (digest the SignedProperties exclusively, declare nothing).
 */
function sign(xml, o = {}) {
  const alg = o.alg || "sha512";
  const keys = o.keys || KEYS;
  const cert = o.cert || KEYS.cert;
  const certB64 = cert.toString("base64");
  const certDigest = crypto.createHash(ALG.sha512.node).update(o.certDigestOf || cert).digest("base64");
  const policy = o.policy === false ? "" :
    `<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId><xades:SigPolicyId><xades:Identifier>${o.policyUrl || FACTURAE_POLICY.url}</xades:Identifier><xades:Description>Política de Firma FacturaE v3.1</xades:Description></xades:SigPolicyId><xades:SigPolicyHash><ds:DigestMethod Algorithm="${o.policyHashAlg || ALG.sha1.digest}"></ds:DigestMethod><ds:DigestValue>${o.policyHash || FACTURAE_POLICY.sha1}</ds:DigestValue></xades:SigPolicyHash></xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>`;
  const sp = `<xades:SignedProperties Id="Sig-SP"><xades:SignedSignatureProperties><xades:SigningTime>${o.signingTime || "2026-11-15T10:00:00+01:00"}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="${ALG.sha512.digest}"></ds:DigestMethod><ds:DigestValue>${certDigest}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>${o.issuerName || "CN=AC Test Usuarios, OU=Ceres, O=FNMT-RCM test, C=ES"}</ds:X509IssuerName><ds:X509SerialNumber>${o.serial || KEYS.serialDec}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate>${policy}<xades:SignerRole><xades:ClaimedRoles><xades:ClaimedRole>${o.role || "emisor"}</xades:ClaimedRole></xades:ClaimedRoles></xades:SignerRole></xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#Ref-Doc"><xades:Description>Factura electrónica</xades:Description><xades:MimeType>text/xml</xades:MimeType></xades:DataObjectFormat></xades:SignedDataObjectProperties></xades:SignedProperties>`;
  const docTransforms = o.docC14n === "exc" ? `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform><ds:Transform Algorithm="${EXC}"></ds:Transform>`
    : o.docC14n === "xpath" ? `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>${o.xpath || "not(ancestor-or-self::ds:Signature)"}</ds:XPath></ds:Transform>`
    : `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>`;
  const refs = [
    o.noSignedPropsRef ? "" : `<ds:Reference Id="Ref-SP" Type="http://uri.etsi.org/01903#SignedProperties" URI="#Sig-SP"><ds:DigestMethod Algorithm="${ALG[alg].digest}"></ds:DigestMethod><ds:DigestValue>@SP@</ds:DigestValue></ds:Reference>`,
    `<ds:Reference URI="#Cert-1"><ds:DigestMethod Algorithm="${ALG[alg].digest}"></ds:DigestMethod><ds:DigestValue>@KI@</ds:DigestValue></ds:Reference>`,
    o.noDocRef ? "" : `<ds:Reference Id="Ref-Doc" Type="http://www.w3.org/2000/09/xmldsig#Object" URI=""><ds:Transforms>${docTransforms}</ds:Transforms><ds:DigestMethod Algorithm="${ALG[alg].digest}"></ds:DigestMethod><ds:DigestValue>@DOC@</ds:DigestValue></ds:Reference>`,
  ].join("\n");
  const signedInfo = `<ds:SignedInfo Id="Sig-SI">\n<ds:CanonicalizationMethod Algorithm="${o.siC14n || C14N10}"></ds:CanonicalizationMethod>\n<ds:SignatureMethod Algorithm="${o.sigMethod || ALG[alg].sig}"></ds:SignatureMethod>\n${refs}\n</ds:SignedInfo>`;
  const signature = `<ds:Signature xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="Sig">\n${signedInfo}\n<ds:SignatureValue Id="Sig-SV">@SV@</ds:SignatureValue>\n<ds:KeyInfo Id="Cert-1">\n<ds:X509Data>\n<ds:X509Certificate>\n${certB64.replace(/(.{76})/g, "$1\n")}\n</ds:X509Certificate>\n</ds:X509Data>\n</ds:KeyInfo>\n<ds:Object Id="Sig-Obj"><xades:QualifyingProperties Target="#Sig">${sp}</xades:QualifyingProperties></ds:Object></ds:Signature>`;
  let out = xml.replace(/<\/(\w+:)?Facturae>\s*$/, (m) => `${signature}${m}`);
  // Fill the digests from the parsed document, then sign SignedInfo.
  let doc = parseXmlDom(out);
  const spDigest = b64(alg, c14nOf(findById(doc.root, "Sig-SP"), { exclusive: !!o.undeclaredExc }));
  const kiDigest = b64(alg, c14nOf(findById(doc.root, "Cert-1")));
  const sigEl = childElements(doc.root, DSNS, "Signature")[0];
  const docOctets = canonicalize(doc, (n) => n === sigEl, { exclusive: o.docC14n === "exc" });
  out = out.replace("@SP@", spDigest).replace("@KI@", kiDigest).replace("@DOC@", b64(alg, docOctets));
  doc = parseXmlDom(out);
  const si = findById(doc.root, "Sig-SI");
  const sv = crypto.sign(ALG[alg].node, Buffer.from(c14nOf(si, { exclusive: o.siC14n === EXC }), "utf8"), keys.privateKey).toString("base64");
  return out.replace("@SV@", sv.replace(/(.{76})/g, "$1\n"));
}

const rules = (r, severity) => r.findings.filter((f) => (severity === "warning" ? f.severity === "warning" : f.severity !== "warning")).map((f) => f.rule).sort();
const SIGNED = sign(VALID);

test("a Facturae file signed the usual way passes, with a summary and the chain named as skipped", () => {
  const r = checkFacturaeSignature(SIGNED);
  assert.equal(r.present, true);
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.signatureValid, true);
  assert.equal(r.summary.wholeDocumentDigestOk, true);
  assert.equal(r.summary.references, 3);
  assert.equal(r.summary.policy, FACTURAE_POLICY.url);
  assert.equal(r.summary.role, "emisor");
  assert.equal(r.summary.notAfter, "2028-03-11");
  assert.ok(!("signer" in r.summary), "the subject (it carries a NIF) is not repeated");
  assert.ok(r.skipped.some((s) => s.rule === "ES-SIG-chain"));
});

test("RSA-SHA1, RSA-SHA256, 3072-bit keys, exclusive C14N and the XPath transform all verify", () => {
  for (const o of [{ alg: "sha1" }, { alg: "sha256" }, { docC14n: "exc", siC14n: EXC }, { docC14n: "xpath", alg: "sha256" }]) {
    const r = checkFacturaeSignature(sign(VALID, o));
    assert.deepEqual(r.findings, [], JSON.stringify(o));
    assert.equal(r.summary.signatureValid, true);
  }
  const big = makeKeyAndCert({ bits: 3072 });
  const r = checkFacturaeSignature(sign(VALID, { keys: big, cert: big.cert, serial: big.serialDec }));
  assert.deepEqual(r.findings, []);
});

test("a Facturae with a default namespace (no fe: prefix) verifies", () => {
  const plain = VALID.replace(/<fe:Facturae /, "<Facturae ").replace(/xmlns:fe=/, "xmlns=").replace(/<\/fe:Facturae>/, "</Facturae>");
  assert.notEqual(plain, VALID);
  assert.deepEqual(checkFacturaeSignature(sign(plain)).findings, []);
});

test("an amount edited after signing is ES-SIG-03 on the invoice reference", () => {
  const edited = SIGNED.replace("<TotalAmount>1060.00</TotalAmount>", "<TotalAmount>1060.01</TotalAmount>");
  assert.notEqual(edited, SIGNED);
  const r = checkFacturaeSignature(edited);
  assert.deepEqual(rules(r), ["ES-SIG-03"]);
  assert.match(r.findings[0].message, /changed after it was signed/);
  assert.equal(r.summary.signatureValid, true, "SignedInfo itself still verifies");
});

test("re-indenting a signed file breaks the invoice digest (ES-SIG-03)", () => {
  const reindented = SIGNED.replace("<FileHeader>", "<FileHeader>\n      ");
  assert.deepEqual(rules(checkFacturaeSignature(reindented)), ["ES-SIG-03"]);
});

test("signed with another key is ES-SIG-04; a flipped SignatureValue too", () => {
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { keys: OTHER }))), ["ES-SIG-04"]);
  const flipped = SIGNED.replace(/(<ds:SignatureValue Id="Sig-SV">)(.)/, (m, a, c) => a + (c === "A" ? "B" : "A"));
  assert.deepEqual(rules(checkFacturaeSignature(flipped)), ["ES-SIG-04"]);
});

test("a certificate swapped after signing breaks the KeyInfo digest, the signature and SigningCertificate", () => {
  const swapped = SIGNED.replace(/<ds:X509Certificate>[\s\S]*?<\/ds:X509Certificate>/, `<ds:X509Certificate>${OTHER.cert.toString("base64")}</ds:X509Certificate>`);
  assert.deepEqual(rules(checkFacturaeSignature(swapped)), ["ES-SIG-03", "ES-SIG-04", "ES-SIG-08"]);
});

test("SigningCertificate naming another certificate is ES-SIG-08; a wrong serial ES-SIG-09", () => {
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { certDigestOf: OTHER.cert }))), ["ES-SIG-08"]);
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { serial: "12345" }))), ["ES-SIG-09"]);
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { serial: "0x73F8" }))), ["ES-SIG-09"]);
});

test("the issuer name is compared attribute by attribute in any order; another issuer is a warning", () => {
  assert.deepEqual(checkFacturaeSignature(sign(VALID, { issuerName: "C=ES,O=FNMT-RCM test,OU=Ceres,CN=AC Test Usuarios" })).findings, []);
  assert.deepEqual(checkFacturaeSignature(sign(VALID, { issuerName: "CN=ac test  usuarios, OU=Ceres, O=FNMT-RCM test, C=ES" })).findings, []);
  const r = checkFacturaeSignature(sign(VALID, { issuerName: "CN=AC Otra, O=FNMT-RCM test, C=ES" }));
  assert.deepEqual(rules(r, "warning"), ["ES-SIG-09"]);
  assert.deepEqual(rules(r), []);
});

test("no policy is ES-SIG-10 (XAdES-BES); a wrong policy hash ES-SIG-11; another Facturae policy a warning", () => {
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { policy: false }))), ["ES-SIG-10"]);
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { policyHash: "AAAAAAAAAAAAAAAAAAAAAAAAAAA=" }))), ["ES-SIG-11"]);
  const v30 = checkFacturaeSignature(sign(VALID, { policyUrl: "http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_0.pdf" }));
  assert.deepEqual(rules(v30, "warning"), ["ES-SIG-10"]);
  // v3.0 URL with v3.1's hash: the v3.0 digest is known, so the hash is wrong for it
  assert.deepEqual(rules(v30), ["ES-SIG-11"]);
  assert.match(v30.findings.find((f) => f.rule === "ES-SIG-11").message, /SHA-1 of the v3\.1 policy, not the v3\.0/);
  for (const url of FACTURAE_POLICY_V30.urls) {
    const ok = checkFacturaeSignature(sign(VALID, { policyUrl: url, policyHash: FACTURAE_POLICY_V30.digests["http://www.w3.org/2000/09/xmldsig#sha1"] }));
    assert.deepEqual(rules(ok), [], url);
    assert.deepEqual(rules(ok, "warning"), ["ES-SIG-10"], url);
    assert.match(ok.findings[0].message, /superseded Facturae v3\.0/);
  }
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { policyUrl: "urn:oid:2.16.724.1.3.1.1.2.1.9" }))), ["ES-SIG-10"]);
});

test("the policy hash: the 2008 revision's digest under any XML-DSig algorithm; today's whole file and the policy's example named", () => {
  for (const [uri, value] of Object.entries(FACTURAE_POLICY.digests)) {
    assert.deepEqual(checkFacturaeSignature(sign(VALID, { policyHashAlg: uri, policyHash: value })).findings, [], uri);
    assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { policyHashAlg: uri, policyHash: FACTURAE_POLICY.sha1 === value ? "AAAAAAAAAAAAAAAAAAAAAAAAAAA=" : FACTURAE_POLICY.sha1 }))), ["ES-SIG-11"], uri);
  }
  const served = checkFacturaeSignature(sign(VALID, { policyHash: "f/LPQFpMc/ha+1dJ+Y5y11OPVnM=" }));
  assert.deepEqual(rules(served), ["ES-SIG-11"]);
  assert.match(served.findings[0].message, /whole PDF as facturae\.gob\.es serves it since its 2014-03-28/);
  const example = checkFacturaeSignature(sign(VALID, { policyHash: "xmfh8D/Ec/hHeE1IB4zPd61zHIY=" }));
  assert.match(example.findings[0].message, /example value printed in the policy/);
  const sha256 = checkFacturaeSignature(sign(VALID, { policyHashAlg: "http://www.w3.org/2001/04/xmlenc#sha256", policyHash: "11I1LxBkDvUpLwZqf2PHDmlQRM2vpf3t2Bg0kKODA8c=" }));
  assert.match(sha256.findings[0].message, /SHA-256 of the whole PDF/);
  assert.match(sha256.findings[0].fix, /a\/vDoueJq9zxWGCFwdsXdlXtkFSEek4XVtmlQCEDaE8= with SHA-256/);
  const md5 = checkFacturaeSignature(sign(VALID, { policyHashAlg: "http://www.w3.org/2001/04/xmldsig-more#md5", policyHash: "AAAAAAAAAAAAAAAAAAAAAA==" }));
  assert.deepEqual(rules(md5), []);
  assert.ok(md5.skipped.some((x) => x.rule === "ES-SIG-11"));
});

test("a signing time outside the certificate's dates and an unknown role are warnings", () => {
  const late = checkFacturaeSignature(sign(VALID, { signingTime: "2029-01-01T00:00:00Z" }));
  assert.deepEqual(rules(late, "warning"), ["ES-SIG-12"]);
  assert.deepEqual(rules(late), []);
  // +01:00 moves the instant before notBefore (2024-03-11T14:05:30Z)
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { signingTime: "2024-03-11T15:00:00+01:00" })), "warning"), ["ES-SIG-12"]);
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { role: "vendedor" })), "warning"), ["ES-SIG-14"]);
  assert.deepEqual(checkFacturaeSignature(sign(VALID, { role: "supplier" })).findings, []);
});

test("unsigned SignedProperties is ES-SIG-07; no reference to the whole invoice is ES-SIG-02", () => {
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { noSignedPropsRef: true }))), ["ES-SIG-07"]);
  assert.deepEqual(rules(checkFacturaeSignature(sign(VALID, { noDocRef: true }))), ["ES-SIG-02"]);
});

test("a signer that digests with exclusive C14N but declares no transform gets ES-SIG-03 with the diagnosis", () => {
  const r = checkFacturaeSignature(sign(VALID, { undeclaredExc: true }));
  assert.deepEqual(rules(r), ["ES-SIG-03"]);
  assert.match(r.findings[0].message, /does match under exclusive C14N/);
  assert.match(r.findings[0].fix, /Transform/);
});

test("an unsupported algorithm or XPath is skipped, never passed", () => {
  const r = checkFacturaeSignature(sign(VALID, { sigMethod: "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256" }));
  assert.ok(r.skipped.some((s) => s.rule === "ES-SIG-04" && /not supported/.test(s.reason)));
  assert.equal(r.summary.signatureValid, null);
  const x = checkFacturaeSignature(sign(VALID, { docC14n: "xpath", xpath: "ancestor-or-self::fe:Invoices" }));
  assert.ok(x.skipped.some((s) => s.rule === "ES-SIG-03" && /XPath/.test(s.reason)));
  assert.equal(x.summary.wholeDocumentDigestOk, null);
});

test("a duplicated Id is reported, not resolved to either element", () => {
  const dup = SIGNED.replace('<ds:Object Id="Sig-Obj">', '<ds:Object Id="Cert-1">');
  const r = checkFacturaeSignature(dup);
  assert.ok(r.findings.some((f) => f.rule === "ES-SIG-03" && /more than one element/.test(f.message)));
});

test("a signature nested below the root is ES-SIG-01; an unsigned file has no signature result", () => {
  const nested = SIGNED.replace(/(<ds:Signature[\s\S]*<\/ds:Signature>)/, "<Extensions>$1</Extensions>");
  const r = checkFacturaeSignature(nested);
  assert.deepEqual(rules(r), ["ES-SIG-01"]);
  assert.deepEqual(checkFacturaeSignature(VALID), { present: false, findings: [], skipped: [], summary: null });
});

test("checkFacturae runs the signature check on a signed file and adds nothing on a clean one", () => {
  const clean = checkFacturae(SIGNED, { today: "2026-11-15" });
  assert.deepEqual(clean.findings, []);
  assert.equal(clean.signature.signatureValid, true);
  const edited = checkFacturae(SIGNED.replace("<TotalAmount>1060.00</TotalAmount>", "<TotalAmount>1060.01</TotalAmount>"), { today: "2026-11-15" });
  assert.ok(edited.findings.some((f) => f.rule === "ES-SIG-03"));
  assert.equal(checkFacturae(VALID, { today: "2026-11-15" }).signature, null);
});

test("the batch report says the signature was checked", async () => {
  const { reports } = await preflightDocuments([{ name: "signed.xml", source: SIGNED }]);
  const report = reports[0];
  assert.deepEqual(report.errors, []);
  assert.equal(report.signature.signatureValid, true);
  assert.match(JSON.stringify(report), /XAdES signature checked \(SignatureValue verifies/);
});

test("SHA-1, SHA-384, SHA-512 and RSA verification agree with node:crypto", () => {
  for (let i = 0; i < 40; i++) {
    const buf = crypto.randomBytes(i * 37 % 300);
    assert.equal(Buffer.from(sha1(buf)).toString("hex"), crypto.createHash("sha1").update(buf).digest("hex"));
    assert.equal(Buffer.from(sha384(buf)).toString("hex"), crypto.createHash("sha384").update(buf).digest("hex"));
    assert.equal(Buffer.from(sha512(buf)).toString("hex"), crypto.createHash("sha512").update(buf).digest("hex"));
  }
  const key = readX509(new Uint8Array(KEYS.cert)).rsa;
  const msg = Buffer.from("factura");
  const sig = crypto.sign("sha256", msg, KEYS.privateKey);
  const d = crypto.createHash("sha256").update(msg).digest();
  assert.equal(verifyRsaPkcs1(key, "http://www.w3.org/2001/04/xmlenc#sha256", d, sig), true);
  assert.equal(verifyRsaPkcs1(key, "http://www.w3.org/2001/04/xmlenc#sha256", crypto.createHash("sha256").update("otra").digest(), sig), false);
  assert.equal(verifyRsaPkcs1(key, "http://www.w3.org/2001/04/xmlenc#sha512", crypto.createHash("sha512").update(msg).digest(), sig), false, "a digest under another algorithm's DigestInfo");
});

test("DN strings parse with escapes, quotes and OID types", () => {
  assert.deepEqual(parseDnString('CN=Pérez\\, Ana, O="A, B", OID.2.5.4.97=VATES-B12345674, E=a@b.es'),
    [{ type: "CN", value: "Pérez, Ana" }, { type: "O", value: "A, B" }, { type: "ORGANIZATIONIDENTIFIER", value: "VATES-B12345674" }, { type: "EMAILADDRESS", value: "a@b.es" }]);
  assert.equal(sameDn(parseDnString("C=ES, CN=X"), [{ type: "CN", value: "x" }, { type: "C", value: "ES" }]), true);
  assert.equal(sameDn(parseDnString("C=ES"), [{ type: "CN", value: "x" }, { type: "C", value: "ES" }]), false);
});

test("mangling any signature field reports instead of throwing", () => {
  const fields = [/<ds:DigestValue>[^<]*/g, /<ds:SignatureValue Id="Sig-SV">[^<]*/g, /<ds:X509Certificate>[^<]*/g, /<ds:X509SerialNumber>[^<]*/g, /<xades:SigningTime>[^<]*/g, /URI="[^"]*"/g, /Algorithm="[^"]*"/g];
  const junk = ["", "-_-_", "====", "AAAA", "%%%", "MIIB", "#", "zz:zz"];
  for (const re of fields) for (const j of junk) {
    let n = 0;
    const mangled = SIGNED.replace(re, (m) => (n++ % 2 === 0 ? m.replace(/(>|=")[^<"]*$/, (x, p) => p + j) : m));
    assert.doesNotThrow(() => checkFacturaeSignature(mangled), `${re} ${j}`);
  }
  for (let cut = 0; cut < 400; cut += 7) {
    const der = KEYS.cert.subarray(0, cut).toString("base64");
    const bad = SIGNED.replace(/<ds:X509Certificate>[\s\S]*?<\/ds:X509Certificate>/, `<ds:X509Certificate>${der}</ds:X509Certificate>`);
    assert.doesNotThrow(() => checkFacturaeSignature(bad));
    assert.ok(checkFacturaeSignature(bad).findings.length > 0);
  }
});
