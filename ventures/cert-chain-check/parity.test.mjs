// The engine against what OpenSSL 3.0 itself said about the same files
// (fixtures/openssl.json, written by tools/gen-fixtures.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCertificate, pemBlocks, CURVES, KU_BITS } from "./x509.mjs";
import { scan, hostMatches, sha256Hex, canonicalIp } from "./scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rec = JSON.parse(readFileSync(path.join(here, "fixtures/openssl.json"), "utf8"));
const load = (f) => readFileSync(path.join(here, "fixtures", f), "utf8");
const parse = (f) => parseCertificate(pemBlocks(load(f))[0].bytes);

// OpenSSL's display names for what x509.mjs reads.
const KU_TEXT = { digitalSignature: "Digital Signature", nonRepudiation: "Non Repudiation", keyEncipherment: "Key Encipherment", dataEncipherment: "Data Encipherment", keyAgreement: "Key Agreement", keyCertSign: "Certificate Sign", cRLSign: "CRL Sign", encipherOnly: "Encipher Only", decipherOnly: "Decipher Only" };
const EKU_TEXT = { serverAuth: "TLS Web Server Authentication", clientAuth: "TLS Web Client Authentication", codeSigning: "Code Signing", emailProtection: "E-mail Protection" };
const SAN_TEXT = { DNS: "DNS", IP: "IP Address", email: "email", URI: "URI" };
const KEY_ALG = { RSA: "rsaEncryption", EC: "id-ecPublicKey", Ed25519: "ED25519" };
const iso = (d) => d.toISOString().replace("T", " ").replace(".000Z", "Z");

test(`every field of all ${Object.keys(rec.certs).length} certificates matches openssl x509`, async () => {
  for (const [name, o] of Object.entries(rec.certs)) {
    const c = parse(o.file);
    const m = (a, b, what) => assert.equal(a, b, `${name}: ${what}`);
    m(c.subjectString, o.subject, "subject");
    m(c.issuerString, o.issuer, "issuer");
    m(c.serial, o.serial, "serial");
    m(`notBefore=${iso(c.notBefore)}\nnotAfter=${iso(c.notAfter)}`, o.dates, "dates");
    m(await sha256Hex(c.der), o.sha256, "fingerprint");
    m(KEY_ALG[c.key.type], o.keyAlgorithm, "key algorithm");
    if (o.publicKeyBits) m(String(c.key.bits), o.publicKeyBits, "key bits");
    if (o.curve) m(CURVES[c.key.curveOid].openssl, o.curve, "curve");
    m(c.signatureAlgorithm, o.signatureAlgorithm, "signature algorithm");
    m(c.san ? c.san.map((g) => `${SAN_TEXT[g.type]}:${g.value}`).join(", ") : null, o.subjectAltName && o.subjectAltName.replace(/IP Address:([0-9A-F:]+:[0-9A-F:]+)/g, (_, ip) => `IP Address:${canonicalIp(ip)}`), "subjectAltName (OpenSSL writes IPv6 uncompressed)");
    m(c.basicConstraints ? `CA:${c.basicConstraints.ca ? "TRUE" : "FALSE"}${c.basicConstraints.pathLen !== null ? `, pathlen:${c.basicConstraints.pathLen}` : ""}` : null, o.basicConstraints, "basicConstraints");
    m(c.keyUsage ? KU_BITS.filter((b) => c.keyUsage.includes(b)).map((b) => KU_TEXT[b]).join(", ") : null, o.keyUsage, "keyUsage");
    m(c.extKeyUsage ? c.extKeyUsage.map((e) => EKU_TEXT[e] || e).join(", ") : null, o.extendedKeyUsage, "extendedKeyUsage");
    m(c.ski ? c.ski.match(/../g).join(":") : null, o.subjectKeyIdentifier, "subjectKeyIdentifier");
    m(c.aki ? c.aki.match(/../g).join(":") : null, o.authorityKeyIdentifier, "authorityKeyIdentifier");
  }
});

// What `openssl verify -purpose sslserver` reports, and the findings that
// name the same fault. OpenSSL verifies the first certificate in the file as
// the server certificate, so a chain in the wrong order fails on purpose (26).
const SAME_FAULT = {
  7: ["bad-signature"],
  9: ["not-yet-valid"],
  10: ["expired"],
  20: ["missing-intermediate", "key-id-mismatch"],
  25: ["path-length-exceeded"],
  26: ["wrong-order", "no-server-auth", "issuer-not-ca", "issuer-no-keycertsign"],
  32: ["issuer-no-keycertsign"],
  79: ["issuer-not-ca", "issuer-no-keycertsign"],
};
const CHAIN_FAULTS = new Set(Object.values(SAME_FAULT).flat());

test(`all ${rec.chains.length} chains: a fault openssl verify reports is found, and none is found where it passes`, async () => {
  for (const ch of rec.chains) {
    const r = await scan(load(ch.file), { at: rec.at });
    const types = new Set(r.findings.map((f) => f.type));
    for (const e of ch.verifyErrors) {
      assert.ok(SAME_FAULT[e.code], `${ch.id}: unmapped openssl error ${e.code} ${e.text}`);
      assert.ok(SAME_FAULT[e.code].some((t) => types.has(t)), `${ch.id}: openssl says "${e.text}", engine found ${[...types].join(", ")}`);
    }
    if (ch.verifyOk) {
      const extra = [...types].filter((t) => CHAIN_FAULTS.has(t));
      assert.deepEqual(extra, [], `${ch.id}: openssl verify passes, engine says ${extra.join(", ")}`);
      assert.notEqual(r.verdict, "broken", `${ch.id}: openssl verify passes, engine says broken`);
    } else {
      assert.ok(r.verdict !== "ok", `${ch.id}: openssl verify fails, engine verdict ok`);
    }
  }
});

// Browsers ignore the subject CN and refuse partial wildcards; OpenSSL's
// X509_check_host falls back to the CN when there is no DNS name and accepts
// w*.example.test. Those two are the only expected differences.
const BROWSER_DIFFERS = { "no-san www.example.test": false, "partial-wildcard www.example.test": false };

test("host and IP matching agrees with openssl x509 -checkhost/-checkip except where browsers differ", () => {
  let n = 0;
  for (const ch of rec.chains) {
    const leaf = parseCertificate(pemBlocks(load(ch.file))[0].bytes);
    for (const [host, ok] of Object.entries(ch.opensslHostMatch)) {
      const key = `${ch.id} ${host}`;
      const expect = key in BROWSER_DIFFERS ? BROWSER_DIFFERS[key] : ok;
      if (key in BROWSER_DIFFERS) assert.notEqual(expect, ok, `${key} is listed as a difference but openssl agrees`);
      assert.equal(hostMatches(leaf, host).ok, expect, key);
      n++;
    }
  }
  assert.ok(n >= 20, `${n} host checks`);
});

test("the recorded run is OpenSSL 3.0.13", () => assert.match(rec.openssl, /^OpenSSL 3\.0\.13/));
