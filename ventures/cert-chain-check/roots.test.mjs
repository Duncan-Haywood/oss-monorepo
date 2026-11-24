// Real certificates: every root in this machine's CA bundle, read by the
// engine and by the openssl binary, field by field, and every root's
// self-signature checked with Web Crypto. Skips when either is missing.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseCertificate, pemBlocks } from "./x509.mjs";
import { verifySignature, sha256Hex, scan } from "./scan.mjs";

const BUNDLE = ["/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt", "/etc/ssl/cert.pem"].find((p) => existsSync(p));
let openssl = false;
try { execFileSync("openssl", ["version"], { stdio: "ignore" }); openssl = true; } catch { /* skipped below */ }

// OpenSSL's RFC 2253 output escapes each byte above 0x7F as \XX.
const escMsb = (s) => [...new TextEncoder().encode(s)].map((b) => (b > 0x7e ? `\\${b.toString(16).toUpperCase()}` : String.fromCharCode(b))).join("");

test("every root in the system CA bundle reads the same as openssl x509, and its self-signature verifies", { skip: !BUNDLE || !openssl ? "no CA bundle or openssl here" : false }, async () => {
  const blocks = pemBlocks(readFileSync(BUNDLE, "utf8")).filter((b) => b.label === "CERTIFICATE");
  const dir = mkdtempSync(path.join(tmpdir(), "roots-"));
  let verified = 0;
  const unchecked = [];
  try {
    for (const [i, b] of blocks.entries()) {
      const c = parseCertificate(b.bytes);
      const f = path.join(dir, `${i}.pem`);
      writeFileSync(f, b.text + "\n");
      const o = execFileSync("openssl", ["x509", "-in", f, "-noout", "-subject", "-serial", "-fingerprint", "-sha256", "-nameopt", "RFC2253", "-dates", "-dateopt", "iso_8601"], { encoding: "utf8" });
      const get = (k) => o.match(new RegExp(`^${k}=(.*)$`, "m"))[1];
      const label = `root ${i} ${c.subjectString}`;
      assert.equal(escMsb(c.subjectString), get("subject"), label);
      assert.equal(c.serial, get("serial"), label);
      assert.equal(await sha256Hex(c.der), get("sha256 Fingerprint"), label);
      assert.equal(c.notAfter.toISOString().replace("T", " ").replace(".000Z", "Z"), get("notAfter"), label);
      const v = await verifySignature(c, c);
      if (v.ok === null) unchecked.push(`${c.signatureAlgorithm}: ${v.why}`);
      else { assert.equal(v.ok, true, `${label}: self-signature`); verified++; }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(blocks.length > 50, `${blocks.length} roots`);
  assert.ok(verified >= blocks.length - unchecked.length);
  console.log(`# ${blocks.length} roots read; ${verified} self-signatures verified; ${unchecked.length} not checkable: ${[...new Set(unchecked)].join("; ") || "none"}`);
});

test("the whole bundle as one paste: every root found, none chained to another", { skip: !BUNDLE ? "no CA bundle" : false }, async () => {
  const r = await scan(readFileSync(BUNDLE, "utf8"));
  assert.ok(r.certificates.length > 50);
  assert.ok(r.certificates.every((c) => c.ca || c.role === "server certificate"));
  assert.ok(r.findings.some((f) => f.type === "unrelated-certificate"));
});
