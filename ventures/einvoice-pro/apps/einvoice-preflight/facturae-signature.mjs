// The XAdES signature on a Spanish Facturae file, checked offline (rules ES-SIG-nn,
// this tool's own ids, not FACe error codes).
//
// Facturae files sent to FACe and the regional hubs are signed XAdES-EPES under the
// Facturae signature policy ("Política de firma formato FacturaE v3.1"). This module
// recomputes what a receiving platform recomputes before anything else: that every
// signed reference still matches the file (so the invoice was not edited after
// signing, the usual cause of a "firma no válida" rejection when a file is
// re-indented, re-encoded or hand-edited), that the SignatureValue verifies with the
// certificate in the file, and that the XAdES properties the policy requires are
// there and consistent: the signed properties are signed, SigningCertificate names
// this certificate by digest and issuer/serial, the policy identifier and its hash
// are the Facturae policy's, the signer role is one the policy names, and the
// signing time falls inside the certificate's validity.
//
// What it does not do: check the certificate chain to a trusted CA (FNMT, a
// qualified provider) or revocation, which needs the CAs' keys and a network call;
// verify a timestamp (XAdES-T) token; or say whether FACe will accept the file.
//
// The policy digest. The v3.1 policy PDF served by facturae.gob.es today is 45,735
// bytes and carries an incremental update dated 2014-03-28 (a metadata edit; Title
// "Política de firma , versión 3.0", Author "Minetur") appended after the original
// 2008-01-29 revision. The digest every signer writes, SHA-1
// "Ohixl6upD6av8N7pEvDABhEL6hM=", is the digest of that 2008 revision: the file's
// first 40,892 bytes, up to and including the first "%%EOF\r\n". Recomputed here on
// 2026-11-16 (eval/facturae-policy-digest-2026-11-16.md). The whole file as served
// hashes to something else, and the policy's own example (page 4) prints a third
// value; both are named when a signature carries them. The policy's section 6 admits
// every XML-DSig hash algorithm, so the 2008 revision's SHA-256/384/512 digests are
// checked too.

import { parseXmlDom, childElements, textOf } from "./c14n.mjs";
import { verifySignature, readX509, parseDnString, sameDn, nameText, digestBase64, DIGESTS, DS, own } from "./xmldsig.mjs";

export const FACTURAE_POLICY = {
  url: "http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_1.pdf",
  sha1: "Ohixl6upD6av8N7pEvDABhEL6hM=",
  // Digests of the 2008 revision (the first 40,892 bytes), by XML-DSig DigestMethod.
  digests: {
    "http://www.w3.org/2000/09/xmldsig#sha1": "Ohixl6upD6av8N7pEvDABhEL6hM=",
    "http://www.w3.org/2001/04/xmlenc#sha256": "a/vDoueJq9zxWGCFwdsXdlXtkFSEek4XVtmlQCEDaE8=",
    "http://www.w3.org/2001/04/xmldsig-more#sha384": "U4njR26ggQHcy20ZHdl/fFJ3AZLSwhSUkVS0uabpkRdEZaYaVLeW0OWVQzQ8h80p",
    "http://www.w3.org/2001/04/xmlenc#sha512": "Olsv4wCqkGsabqxbGDLEkgocYLmEJ2CdZ1XsZMrvJiuUD30ryJoGYL2/DXTF1qqxdNRjviwXr2MBh4UZt/mS8w==",
  },
  // Values a signer may write by mistake, with what they are.
  lookalikes: {
    "f/LPQFpMc/ha+1dJ+Y5y11OPVnM=": "the SHA-1 of the whole PDF as facturae.gob.es serves it since its 2014-03-28 metadata update",
    "11I1LxBkDvUpLwZqf2PHDmlQRM2vpf3t2Bg0kKODA8c=": "the SHA-256 of the whole PDF as facturae.gob.es serves it since its 2014-03-28 metadata update",
    "Uco5dWj0nnuRt0P5LI+jr1AXlqvF301IWXu/sQvwg+d5edaNj++2fgjaSdqddJc/": "the SHA-384 of the whole PDF as facturae.gob.es serves it since its 2014-03-28 metadata update",
    "JHjumxg6+yyKxsbkcstae6eEDY13oM7Qj87Qw6qH3T6gRP5XcKrimYTVkjjTkXqCsehvDCk9Dmb4qmztAEODdg==": "the SHA-512 of the whole PDF as facturae.gob.es serves it since its 2014-03-28 metadata update",
    "xmfh8D/Ec/hHeE1IB4zPd61zHIY=": "the example value printed in the policy's own sample QualifyingProperties (page 4 of v3.1, also in v3.0)",
    "HQvPemjDslVpcNmaJPpbHzhdZ50=": "the SHA-1 of the superseded v3.0 policy",
  },
};
// The superseded v3.0 policy (2007). Signers wrote its URL with spaces, as the
// government's own signed example factura2_ejemplo30.xml does, or with underscores.
// Its digest, like v3.1's, is of the original revision: the first 80,176 bytes of the
// PDF served today, which also carries a 2014-03-28 update. The government's example
// writes that SHA-1.
export const FACTURAE_POLICY_V30 = {
  urls: [
    "http://www.facturae.es/politica de firma formato facturae/politica de firma formato facturae v3_0.pdf",
    "http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_0.pdf",
  ],
  digests: {
    "http://www.w3.org/2000/09/xmldsig#sha1": "HQvPemjDslVpcNmaJPpbHzhdZ50=",
    "http://www.w3.org/2001/04/xmlenc#sha256": "pg7ipi2EKENlAFimt3gVrAS3lPbz/VbfEqy5j8S1FjY=",
    "http://www.w3.org/2001/04/xmldsig-more#sha384": "FLSCe17XZVHjUMvr4l7SMGHaeS+BxPtVo4QSViLOzVlsv8zvo1cP6P+VAdyzINts",
    "http://www.w3.org/2001/04/xmlenc#sha512": "mNwx7zkd0iaakr/fGZOSnTM1Xtkm3tArNFhmwzTKO9qAuywO440UGXIGdulq13/Y3f17xgpWsvLx48Sdqw+gug==",
  },
  lookalikes: {
    "n2iOk6rgsAbcLAYJIvQqnl0aLcI=": "the SHA-1 of the whole v3.0 PDF as facturae.gob.es serves it since its 2014-03-28 metadata update",
    "Ohixl6upD6av8N7pEvDABhEL6hM=": "the SHA-1 of the v3.1 policy",
  },
};
// The roles the policy names (Spanish and English forms signers write).
export const FACTURAE_ROLES = ["emisor", "receptor", "tercero", "supplier", "customer", "third party"];
const SIGNED_PROPS_TYPE = /^http:\/\/uri\.etsi\.org\/01903(\/v1\.[0-9.]+)?#SignedProperties$/;
const isXades = (n) => n.type === "element" && /^http:\/\/uri\.etsi\.org\/01903\/v1\.[0-9.]+#$/.test(n.ns);

function finding(rule, message, fix, path, severity) {
  const f = { rule, message, fix, path };
  if (severity) f.severity = severity;
  return f;
}
const attr = (node, local) => node?.attrs.find((a) => a.local === local && a.ns === "")?.value;
function find(node, test) {
  if (!node || !node.children) return undefined;
  for (const c of node.children) if (c.type === "element") { if (test(c)) return c; const d = find(c, test); if (d) return d; }
  return undefined;
}
const xades = (node, local) => find(node, (n) => isXades(n) && n.local === local);
const dsChild = (node, local) => (node ? childElements(node, DS, local)[0] : undefined);
const text = (node) => textOf(node).trim();

function parseTime(s) {
  // xs:dateTime; no zone means local time we cannot know, read as UTC.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.exec(s);
  if (!m) return null;
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (m[8] && m[8] !== "Z") { const sign = m[8][0] === "-" ? -1 : 1; t -= sign * (Number(m[8].slice(1, 3)) * 60 + Number(m[8].slice(4))) * 60000; }
  return new Date(t);
}
const describe = (ref, signedPropsEl, keyInfo, doc) =>
  ref.uri === "" || ref.target === doc.root ? "the invoice itself" :
  ref.target && ref.target === signedPropsEl ? "the XAdES SignedProperties" :
  ref.target && ref.target === keyInfo ? "the KeyInfo (certificate)" : `the element with Id ${String(ref.uri).slice(1)}`;

/**
 * Check the signature of a Facturae file.
 * @param {string|object} source XML text, or a document from c14n.mjs's parseXmlDom
 * @returns {{ present: boolean, findings: object[], skipped: object[], summary: object|null }}
 */
export function checkFacturaeSignature(source) {
  const findings = [];
  const skipped = [];
  let doc;
  try { doc = typeof source === "string" ? parseXmlDom(source) : source; }
  catch (e) { return { present: false, findings: [], skipped: [{ rule: "ES-SIG", path: "/Facturae", reason: `The XML could not be read for the signature check (${e.message}).` }], summary: null }; }
  const root = doc.root;
  const sigs = childElements(root, DS, "Signature");
  const nested = find(root, (n) => n.ns === DS && n.local === "Signature" && n.parent !== root);
  if (!sigs.length) {
    if (nested) findings.push(finding("ES-SIG-01", "A ds:Signature is present but not as a direct child of the Facturae root, where an enveloped Facturae signature goes.",
      "Sign the whole file with an enveloped XAdES signature (ds:Signature as the last child of Facturae).", "/Facturae"));
    return { present: !!nested, findings, skipped, summary: null };
  }
  if (sigs.length > 1) findings.push(finding("ES-SIG-01", `The file carries ${sigs.length} signatures at the root; only the first is checked.`,
    "Keep one enveloped signature; a co-signature goes inside the first signature's structure.", "/Facturae/Signature", "warning"));
  const sig = sigs[0];
  const path = "/Facturae/Signature";
  const v = verifySignature(doc, sig);
  const keyInfo = dsChild(sig, "KeyInfo");
  const signedProps = xades(sig, "SignedProperties");
  const summary = { signatureMethod: v.signatureMethod, c14nMethod: v.c14nMethod, references: v.references.length, issuer: null, notAfter: null, signingTime: null, policy: null, role: null, signatureValid: v.signedInfoOk };

  for (const p of v.problems) {
    if (p.part === "SignedInfo") findings.push(finding("ES-SIG-01", "The signature has no ds:SignedInfo, so nothing in it can be verified.", "Re-sign the file with a XAdES signer.", path));
    else if (p.part === "certificate") findings.push(finding("ES-SIG-06", `The signing key could not be used: ${p.message}.`, "Sign with a certificate whose X509Certificate is included in KeyInfo.", `${path}/KeyInfo`));
    else skipped.push({ rule: "ES-SIG-04", path: `${path}/SignedInfo/${p.part}`, reason: `The SignatureValue was not verified: ${p.message}.` });
  }

  // References: one must cover the whole document; each digest must match.
  const wholeDoc = v.references.find((r) => r.target === doc.root && !r.problem);
  if (!v.references.some((r) => r.target === doc.root)) {
    findings.push(finding("ES-SIG-02", "No signed reference covers the invoice itself (a Reference with URI=\"\" and the enveloped-signature transform).",
      "Sign the whole document: an enveloped signature with a Reference URI=\"\".", `${path}/SignedInfo`));
  }
  v.references.forEach((r, i) => {
    const rp = `${path}/SignedInfo/Reference[${i + 1}]`;
    const what = describe(r, signedProps, keyInfo, doc);
    if (r.problem) {
      if (/not supported/.test(r.problem)) skipped.push({ rule: "ES-SIG-03", path: rp, reason: `The digest of ${what} was not recomputed: ${r.problem}.` });
      else findings.push(finding("ES-SIG-03", `Reference ${i + 1} cannot be resolved: ${r.problem}.`, "Re-sign the file; a signed reference must point at an element in the file.", rp));
      return;
    }
    if (!r.ok) {
      const msg = r.target === doc.root
        ? "The invoice was changed after it was signed: its digest no longer matches the signature's DigestValue (re-indenting, re-encoding or editing a signed file all do this)."
        : `The digest of ${what} does not match its DigestValue: that part was changed after signing.`;
      const hint = r.altMatch ? ` It does match under ${r.altMatch} C14N, which the Reference does not declare: the signer canonicalized it one way and wrote the other (an untransformed reference means inclusive C14N 1.0).` : "";
      findings.push(finding("ES-SIG-03", msg + hint, r.altMatch ? `Fix the signer: add the ${r.altMatch} C14N Transform to that Reference, or digest it with the canonicalization the Reference declares.` : "Make every change before signing, then sign the final file and send it byte for byte.", rp));
    }
  });
  if (v.signedInfoOk === false) {
    findings.push(finding("ES-SIG-04", "The SignatureValue does not verify with the certificate's key over the canonical SignedInfo.",
      "Re-sign the file: the signature was made with another key, or SignedInfo was changed after signing.", `${path}/SignatureValue`));
  }
  summary.wholeDocumentDigestOk = wholeDoc ? wholeDoc.ok : null;

  // XAdES: the signed properties must be signed.
  if (!signedProps) {
    findings.push(finding("ES-SIG-07", "The signature has no XAdES SignedProperties: it is a plain XML-DSig signature, and the Facturae policy needs XAdES-EPES.",
      "Sign with a XAdES-EPES signer under the Facturae policy.", `${path}/Object`));
  } else if (!v.references.some((r) => r.target === signedProps)) {
    findings.push(finding("ES-SIG-07", "The XAdES SignedProperties are not covered by a signed Reference, so the signing time, certificate and policy are unprotected.",
      "Add a Reference to the SignedProperties Id (Type ...01903#SignedProperties) to SignedInfo.", `${path}/SignedInfo`));
  } else {
    const ref = v.references.find((r) => r.target === signedProps);
    if (!SIGNED_PROPS_TYPE.test(ref.type)) findings.push(finding("ES-SIG-07", "The Reference to the SignedProperties has no Type http://uri.etsi.org/01903#SignedProperties.",
      "Set Type=\"http://uri.etsi.org/01903#SignedProperties\" on that Reference.", `${path}/SignedInfo`, "warning"));
  }
  const qp = xades(sig, "QualifyingProperties");
  if (qp && attr(sig, "Id") && attr(qp, "Target") !== `#${attr(sig, "Id")}`) {
    findings.push(finding("ES-SIG-16", "QualifyingProperties' Target does not point at this signature's Id.",
      `Set Target="#${attr(sig, "Id")}".`, `${path}/Object/QualifyingProperties`, "warning"));
  }

  // The certificate against SigningCertificate.
  const cert = v.certificate;
  if (cert) {
    summary.issuer = nameText(cert.issuer);
    // The subject is left out: a Spanish certificate's subject carries the signer's NIF.
    summary.notAfter = cert.notAfter ? cert.notAfter.toISOString().slice(0, 10) : null;
  }
  if (signedProps) {
    const sc = xades(signedProps, "SigningCertificate") || xades(signedProps, "SigningCertificateV2");
    if (!sc) {
      findings.push(finding("ES-SIG-08", "The SignedProperties have no SigningCertificate, which XAdES-EPES requires.", "Sign with a XAdES signer that writes SigningCertificate.", `${path}/Object`));
    } else if (cert && v.certificateDer) {
      const certs = (sc.children || []).filter((c) => isXades(c) && c.local === "Cert");
      const match = certs.find((c) => {
        const cd = xades(c, "CertDigest");
        const uri = attr(dsChild(cd, "DigestMethod"), "Algorithm");
        const expected = text(dsChild(cd, "DigestValue")).replace(/\s+/g, "");
        return own(DIGESTS, uri) && digestBase64(uri, v.certificateDer) === expected;
      });
      const unsupported = certs.length && certs.every((c) => !own(DIGESTS, attr(dsChild(xades(c, "CertDigest"), "DigestMethod"), "Algorithm")));
      if (unsupported) skipped.push({ rule: "ES-SIG-08", path: `${path}/Object`, reason: "The SigningCertificate digest uses an algorithm this check does not compute." });
      else if (!match) {
        findings.push(finding("ES-SIG-08", "No SigningCertificate CertDigest is the digest of the certificate in KeyInfo: the signed properties name another certificate.",
          "Re-sign the file so SigningCertificate is computed from the signing certificate.", `${path}/Object/SignedProperties`));
      } else {
        const is = xades(match, "IssuerSerial");
        if (is) {
          const serial = text(dsChild(is, "X509SerialNumber"));
          if (!/^\d+$/.test(serial) || BigInt(serial) !== cert.serial) {
            findings.push(finding("ES-SIG-09", "SigningCertificate's X509SerialNumber is not the certificate's serial number (it must be written in decimal).",
              "Write the certificate's serial number in decimal in IssuerSerial.", `${path}/Object/SignedProperties`));
          }
          const issuerText = text(dsChild(is, "X509IssuerName"));
          if (!sameDn(parseDnString(issuerText), cert.issuer)) {
            findings.push(finding("ES-SIG-09", "SigningCertificate's X509IssuerName does not name the certificate's issuer (compared attribute by attribute, any order).",
              "Write the issuer's distinguished name as it is in the certificate.", `${path}/Object/SignedProperties`, "warning"));
          }
        }
      }
    }

    // Policy: XAdES-EPES under the Facturae policy.
    const policy = xades(signedProps, "SignaturePolicyIdentifier");
    const spid = policy && xades(policy, "SignaturePolicyId");
    if (!spid) {
      findings.push(finding("ES-SIG-10", policy ? "The signature declares an implied policy; Facturae needs the explicit Facturae signature policy (XAdES-EPES)." : "The signature names no signature policy (no SignaturePolicyIdentifier): it is XAdES-BES, and the Facturae policy needs XAdES-EPES.",
        `Sign under the Facturae policy: SigPolicyId ${FACTURAE_POLICY.url} with its SigPolicyHash.`, `${path}/Object/SignedProperties`));
    } else {
      const id = text(xades(xades(spid, "SigPolicyId"), "Identifier"));
      summary.policy = id;
      const v30 = FACTURAE_POLICY_V30.urls.includes(id);
      if (id !== FACTURAE_POLICY.url) {
        findings.push(finding("ES-SIG-10", v30 ? "The signature is under the superseded Facturae v3.0 policy, not v3.1." : /facturae/i.test(id) ? "The policy identifier names a Facturae policy other than v3.1." : "The policy identifier is not the Facturae signature policy.",
          `Use SigPolicyId ${FACTURAE_POLICY.url}.`, `${path}/Object/SignedProperties`, /facturae/i.test(id) ? "warning" : undefined));
      }
      if (id === FACTURAE_POLICY.url || v30) {
        const pol = v30 ? FACTURAE_POLICY_V30 : FACTURAE_POLICY;
        const label = v30 ? "v3.0" : "v3.1";
        const ph = xades(spid, "SigPolicyHash");
        const uri = attr(dsChild(ph, "DigestMethod"), "Algorithm");
        const val = text(dsChild(ph, "DigestValue")).replace(/\s+/g, "");
        const want = own(pol.digests, uri);
        if (want) {
          if (val !== want) {
            const name = own(DIGESTS, uri).name;
            const what = own(pol.lookalikes, val) || own(FACTURAE_POLICY.lookalikes, val);
            const sha1 = pol.digests["http://www.w3.org/2000/09/xmldsig#sha1"];
            findings.push(finding("ES-SIG-11", what ? `SigPolicyHash is ${what}, not the ${label} policy's digest.` : `SigPolicyHash is not the ${name} digest of the Facturae ${label} policy document.`,
              `Write DigestValue ${sha1} with the SHA-1 DigestMethod (the value Facturae signers write)${uri.endsWith("#sha1") ? "" : `, or ${want} with ${name}`}.`, `${path}/Object/SignedProperties`));
          }
        } else skipped.push({ rule: "ES-SIG-11", path: `${path}/Object/SignedProperties`, reason: `SigPolicyHash uses ${own(DIGESTS, uri)?.name || uri || "no algorithm"}; the policy digest is known for SHA-1, SHA-256, SHA-384 and SHA-512 only.` });
      }
    }

    // Signing time inside the certificate's validity.
    const st = text(xades(signedProps, "SigningTime"));
    if (!st) findings.push(finding("ES-SIG-12", "The SignedProperties carry no SigningTime.", "Sign with a XAdES signer that writes SigningTime.", `${path}/Object/SignedProperties`, "warning"));
    else {
      const t = parseTime(st);
      summary.signingTime = st;
      if (!t) findings.push(finding("ES-SIG-12", "SigningTime is not an xs:dateTime.", "Write SigningTime as YYYY-MM-DDThh:mm:ss with a zone.", `${path}/Object/SignedProperties`, "warning"));
      else if (cert && cert.notBefore && cert.notAfter && (t < cert.notBefore || t > cert.notAfter)) {
        findings.push(finding("ES-SIG-12", `The SigningTime is outside the certificate's validity (${cert.notBefore.toISOString().slice(0, 10)} to ${cert.notAfter.toISOString().slice(0, 10)}).`,
          "Sign with a certificate that was valid when you signed.", `${path}/Object/SignedProperties`, "warning"));
      }
    }

    // Signer role.
    const roles = (find(signedProps, (n) => isXades(n) && n.local === "ClaimedRoles")?.children || []).filter((c) => isXades(c) && c.local === "ClaimedRole").map(text);
    summary.role = roles.join(", ") || null;
    if (roles.length && !roles.some((r) => FACTURAE_ROLES.includes(r.toLowerCase()))) {
      findings.push(finding("ES-SIG-14", "The ClaimedRole is not one the Facturae policy names (emisor/supplier, receptor/customer, tercero/third party).",
        "Set ClaimedRole to emisor (or supplier) when the seller signs.", `${path}/Object/SignedProperties`, "warning"));
    }
  }
  skipped.push({ rule: "ES-SIG-chain", path: `${path}/KeyInfo`, reason: "The certificate chain to a trusted CA and its revocation status are not checked offline; a self-made certificate passes the checks above if it signed this file." });
  return { present: true, findings, skipped, summary };
}
