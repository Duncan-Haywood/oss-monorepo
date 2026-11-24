import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scan, TYPES, dnsNameMatches, canonicalIp, maxValidityFor, fullchainPem, hasRisk, validityDays } from "./scan.mjs";
import { pemBlocks, parseCertificate, DerError } from "./x509.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (f) => readFileSync(path.join(here, "tests", "fixtures", f), "utf8");
const AT = "2026-11-24T12:00:00Z";
const types = (r) => r.findings.map((f) => f.type);

test("a pasted private key is flagged, never read, and never echoed", async () => {
  const fake = "-----BEGIN PRIVATE KEY-----\nTk9UIEEgUkVBTCBLRVkgLSBURVNUIERBVEEgT05MWQ==\n-----END PRIVATE KEY-----\n";
  const r = await scan(fx("chains/good-rsa.pem") + fake, { at: AT });
  assert.ok(types(r).includes("private-key-pasted"));
  assert.equal(r.certificates.length, 2);
  assert.doesNotMatch(JSON.stringify(r), /Tk9UIEEgUkVBTCBLRVk/);
  const ec = await scan("-----BEGIN EC PRIVATE KEY-----\nAAAA\n-----END EC PRIVATE KEY-----", { at: AT });
  assert.ok(types(ec).includes("private-key-pasted"));
});

test("openssl s_client -showcerts output is read as it comes", async () => {
  const blocks = pemBlocks(fx("chains/good-rsa.pem"));
  const sclient = `CONNECTED(00000003)\ndepth=1 C = US, O = Parity Test CA\n---\nCertificate chain\n 0 s:CN = www.example.test\n   i:CN = Parity RSA Issuing CA\n${blocks[0].text}\n 1 s:CN = Parity RSA Issuing CA\n${blocks[1].text}\n---\nServer certificate\nsubject=CN = www.example.test\n---\nNo client certificate CA names sent\nVerify return code: 0 (ok)\n`;
  const r = await scan(sclient, { at: AT, host: "www.example.test" });
  assert.deepEqual(r.chain, [1, 2]);
  assert.equal(r.verdict, "ok");
  assert.equal(r.hostMatch.ok, true);
});

test("DER bytes and bare base64 are read too", async () => {
  const der = pemBlocks(fx("certs/leaf.pem"))[0].bytes;
  const r = await scan(der, { at: AT });
  assert.equal(r.certificates.length, 1);
  assert.ok(types(r).includes("missing-intermediate"));
  const b64 = fx("certs/leaf.pem").replace(/-----[A-Z ]+-----/g, "");
  const r2 = await scan(b64, { at: AT });
  assert.equal(r2.certificates.length, 1);
  assert.ok(r2.notes.some((n) => /no BEGIN\/END/.test(n)));
});

test("junk, a CSR, a truncated block and an empty paste give findings, not exceptions", async () => {
  assert.equal((await scan("hello")).verdict, "no-certificates");
  assert.equal((await scan("")).verdict, "no-certificates");
  const csr = await scan("-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----");
  assert.ok(types(csr).includes("not-a-certificate"));
  const pem = fx("certs/leaf.pem");
  const cut = pem.slice(0, 400) + "\n-----END CERTIFICATE-----\n";
  const r = await scan(cut);
  assert.ok(types(r).includes("unreadable-block"));
  const mismatched = await scan("-----BEGIN CERTIFICATE-----\nAAAA\n-----END X509 CRL-----");
  assert.ok(types(mismatched).length >= 1);
  assert.throws(() => parseCertificate(new Uint8Array([0x30, 0x80, 0, 0])), DerError);
});

test("wildcards cover exactly one whole label, as browsers match them", () => {
  assert.ok(dnsNameMatches("*.example.com", "www.example.com"));
  assert.ok(dnsNameMatches("*.example.com", "WWW.Example.COM."));
  assert.ok(!dnsNameMatches("*.example.com", "example.com"));
  assert.ok(!dnsNameMatches("*.example.com", "a.b.example.com"));
  assert.ok(!dnsNameMatches("w*.example.com", "www.example.com"));
  assert.ok(!dnsNameMatches("*.com", "example.com"));
  assert.ok(!dnsNameMatches("*.*.example.com", "a.b.example.com"));
  assert.ok(dnsNameMatches("example.com.", "example.com"));
});

test("IPv6 addresses compare in canonical form", () => {
  assert.equal(canonicalIp("2001:DB8:0:0:0:0:0:10"), "2001:db8::10");
  assert.equal(canonicalIp("2001:db8::10"), "2001:db8::10");
  assert.equal(canonicalIp("::1"), "::1");
  assert.equal(canonicalIp("[::ffff:192.0.2.1]"), "::ffff:c000:201");
  assert.equal(canonicalIp("010.000.000.001"), "10.0.0.1");
});

test("the CA/Browser Forum validity limit follows the issue date (SC-081v3)", () => {
  const d = (s) => new Date(s + "T00:00:00Z");
  assert.equal(maxValidityFor(d("2026-03-14")).days, 398);
  assert.equal(maxValidityFor(d("2026-03-15")).days, 200);
  assert.equal(maxValidityFor(d("2027-03-15")).days, 100);
  assert.equal(maxValidityFor(d("2029-03-15")).days, 47);
  assert.equal(maxValidityFor(d("2015-01-01")), null);
  const c = { notBefore: d("2026-01-01"), notAfter: new Date(d("2026-01-02").getTime() - 1000) };
  assert.equal(validityDays(c), 1);
});

test("--fix order: server certificate, then intermediates, no root, no strays", async () => {
  const input = fx("certs/root.pem") + fx("certs/int-ec.pem") + fx("certs/int.pem") + fx("certs/leaf.pem");
  const r = await scan(input, { at: AT });
  assert.ok(types(r).includes("wrong-order"));
  const fixed = await fullchainPem(r, input);
  assert.equal(fixed, fx("certs/leaf.pem") + fx("certs/int.pem"));
  const again = await scan(fixed, { at: AT });
  assert.ok(!types(again).includes("wrong-order"));
  assert.ok(!hasRisk(again));
});

test("a re-keyed issuer and an intermediate that expires before the leaf", async () => {
  const rekey = await scan(fx("chains/rekeyed-issuer.pem"), { at: AT });
  const f = rekey.findings.find((x) => x.type === "key-id-mismatch");
  assert.match(f.message, /re-key/);
  assert.ok(!types(rekey).includes("missing-intermediate"), "not also reported as missing");
  const short = await scan(fx("chains/chain-expires-first.pem"), { at: AT });
  assert.ok(types(short).includes("chain-expires-first"));
  assert.equal(short.expires, "2027-01-01T00:00:00Z");
});

test("a host the certificate does not cover is an error naming the wildcard rule", async () => {
  const r = await scan(fx("chains/good-rsa.pem"), { at: AT, host: "a.b.api.example.test" });
  const f = r.findings.find((x) => x.type === "hostname-mismatch");
  assert.equal(f.severity, "error");
  assert.match(f.message, /one label only/);
  assert.equal(r.verdict, "broken");
  const cn = await scan(fx("chains/no-san.pem"), { at: AT, host: "www.example.test" });
  assert.match(cn.findings.find((x) => x.type === "hostname-mismatch").message, /subject CN, which browsers ignore/);
});

test("every finding type the engine can emit is listed in TYPES", () => {
  const src = readFileSync(path.join(here, "scan.mjs"), "utf8");
  const emitted = new Set([...src.matchAll(/type: "([a-z0-9-]+)"/g)].map((m) => m[1]));
  for (const t of emitted) assert.ok(TYPES.includes(t), t);
  for (const t of TYPES) assert.ok(emitted.has(t), `${t} listed but never emitted`);
});
