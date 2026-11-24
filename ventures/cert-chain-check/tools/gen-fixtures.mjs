// Builds the parity fixtures with a real OpenSSL: certificate chains for
// each scenario, then what OpenSSL itself says about every certificate
// (x509 -subject/-issuer/-serial/-dates/-fingerprint/-ext/-text) and every
// chain (verify -purpose sslserver -attime, x509 -checkhost).
//
//   node tools/gen-fixtures.mjs     (needs openssl 3.x on PATH)
//
// Keys are made in a temporary directory and deleted; only certificates
// and OpenSSL's output are written to fixtures/.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "fixtures");
const tmp = mkdtempSync(path.join(tmpdir(), "cert-chain-fixtures-"));
const AT = "2026-11-24T12:00:00Z";
const AT_EPOCH = String(Date.parse(AT) / 1000);

const ossl = (args, opts = {}) => execFileSync("openssl", args, { cwd: tmp, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts });
const tryOssl = (args) => {
  try { return { code: 0, out: ossl(args) }; } catch (e) { return { code: e.status, out: String(e.stdout || "") + String(e.stderr || "") }; }
};

const keyArgs = {
  rsa1024: ["-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:1024"],
  rsa2048: ["-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048"],
  rsa3072: ["-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:3072"],
  p256: ["-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256"],
  p384: ["-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-384"],
  p521: ["-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-521"],
  k256: ["-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:secp256k1"],
  ed25519: ["-algorithm", "ED25519"],
};

function key(name, kind) {
  ossl(["genpkey", ...keyArgs[kind], "-out", `${name}.key`]);
  return `${name}.key`;
}

// `openssl ca` is the one OpenSSL 3.0 command that takes exact start and end dates.
let serial = 0x1000;
function cert({ name, kind, subj, signer, signerKey, ext, start, end, md = "sha256", sigopt = [], selfsign = false }) {
  const k = key(name, kind);
  mkdirSync(path.join(tmp, "db"), { recursive: true });
  writeFileSync(path.join(tmp, "db", "index.txt"), "");
  writeFileSync(path.join(tmp, "db", "serial"), (serial++).toString(16).toUpperCase() + "\n");
  writeFileSync(path.join(tmp, "ca.cnf"), `[ca]\ndefault_ca=x\n[x]\ndir=db\ndatabase=db/index.txt\nserial=db/serial\nnew_certs_dir=db\npolicy=p\nunique_subject=no\ncopy_extensions=none\nemail_in_dn=no\n[p]\ncommonName=optional\norganizationName=optional\ncountryName=optional\norganizationalUnitName=optional\n[e]\n${ext}\n`);
  ossl(["req", "-new", "-key", k, "-subj", subj, "-out", `${name}.csr`]);
  const md2 = (selfsign ? kind : signer.kind) === "ed25519" ? [] : ["-md", md];
  const signWith = selfsign ? ["-selfsign", "-keyfile", k] : ["-cert", `${signer.name}.pem`, "-keyfile", signerKey || `${signer.name}.key`];
  ossl(["ca", "-batch", "-config", "ca.cnf", "-notext", "-extfile", "ca.cnf", "-extensions", "e", ...signWith, ...md2, ...sigopt.flatMap((s) => ["-sigopt", s]), "-startdate", start, "-enddate", end, "-in", `${name}.csr`, "-out", `${name}.pem`]);
  return { name, kind, pem: readFileSync(path.join(tmp, `${name}.pem`), "utf8").replace(/^[\s\S]*?(?=-----BEGIN)/, "") };
}

const CA_EXT = "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid";
const LEAF = (san, extra = "") => `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\nauthorityInfoAccess=caIssuers;URI:http://ca.example.test/int.der,OCSP;URI:http://ocsp.example.test\n${san ? `subjectAltName=${san}\n` : ""}${extra}`;
const SAN = "DNS:www.example.test,DNS:example.test,DNS:*.api.example.test,IP:192.0.2.10,IP:2001:db8::10";

const C = {};
C.root = cert({ name: "root", kind: "rsa3072", subj: "/C=US/O=Parity Test Root Authority/CN=Parity Root R1", ext: CA_EXT, start: "20200101000000Z", end: "20400101000000Z", selfsign: true });
C.rootEc = cert({ name: "root-ec", kind: "p384", subj: "/O=Parity Test Root Authority/CN=Parity Root E1", ext: CA_EXT, start: "20200101000000Z", end: "20400101000000Z", selfsign: true, md: "sha384" });
C.int = cert({ name: "int", kind: "rsa2048", subj: "/C=US/O=Parity Test CA/CN=Parity RSA Issuing CA", signer: C.root, ext: CA_EXT + "\nbasicConstraints=critical,CA:TRUE,pathlen:0", start: "20250101000000Z", end: "20300101000000Z" });
C.intEc = cert({ name: "int-ec", kind: "p256", subj: "/O=Parity Test CA/CN=Parity ECC Issuing CA", signer: C.rootEc, ext: CA_EXT, start: "20250101000000Z", end: "20300101000000Z", md: "sha384" });
C.intShort = cert({ name: "int-short", kind: "rsa2048", subj: "/O=Parity Test CA/CN=Parity Short-Lived CA", signer: C.root, ext: CA_EXT, start: "20250101000000Z", end: "20270101000000Z" });
C.intNotCa = cert({ name: "int-notca", kind: "rsa2048", subj: "/O=Parity Test CA/CN=Parity Not A CA", signer: C.root, ext: "basicConstraints=critical,CA:FALSE\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid", start: "20250101000000Z", end: "20300101000000Z" });
C.intNoKcs = cert({ name: "int-nokcs", kind: "rsa2048", subj: "/O=Parity Test CA/CN=Parity No KeyCertSign CA", signer: C.root, ext: "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,cRLSign,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid", start: "20250101000000Z", end: "20300101000000Z" });
C.intA = cert({ name: "int-a", kind: "rsa2048", subj: "/O=Parity Test CA/CN=Parity Policy CA", signer: C.root, ext: CA_EXT + "\nbasicConstraints=critical,CA:TRUE,pathlen:0", start: "20250101000000Z", end: "20300101000000Z" });
C.intB = cert({ name: "int-b", kind: "rsa2048", subj: "/O=Parity Test CA/CN=Parity Sub CA Below Pathlen 0", signer: C.intA, ext: CA_EXT, start: "20250101000000Z", end: "20300101000000Z" });
// same name as `int`, different key: a certificate it signs fails against the real `int`
C.intImposter = cert({ name: "int-imposter", kind: "rsa2048", subj: "/C=US/O=Parity Test CA/CN=Parity RSA Issuing CA", signer: C.root, ext: "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nauthorityKeyIdentifier=keyid", start: "20250101000000Z", end: "20300101000000Z" });
C.intPss = cert({ name: "int-pss", kind: "rsa2048", subj: "/O=Parity Test CA/CN=Parity PSS CA", signer: C.root, ext: CA_EXT, start: "20250101000000Z", end: "20300101000000Z", sigopt: ["rsa_padding_mode:pss", "rsa_pss_saltlen:32"] });

const L = (name, over) => cert({ name, kind: "rsa2048", subj: `/O=Parity Test Site/CN=www.example.test`, signer: C.int, ext: LEAF(SAN), start: "20261101000000Z", end: "20270301000000Z", ...over });
C.leaf = L("leaf");
C.leafEc = L("leaf-ec", { kind: "p256", signer: C.intEc, ext: LEAF(SAN).replace("digitalSignature,keyEncipherment", "digitalSignature") });
C.leafP521 = L("leaf-p521", { kind: "p521", signer: C.intEc, ext: LEAF("DNS:p521.example.test").replace("digitalSignature,keyEncipherment", "digitalSignature"), md: "sha512" });
C.leafEd = L("leaf-ed25519", { kind: "ed25519", signer: C.int, ext: LEAF("DNS:ed.example.test").replace(",keyEncipherment", "") });
C.leafPss = L("leaf-pss", { signer: C.intPss, ext: LEAF("DNS:pss.example.test"), sigopt: ["rsa_padding_mode:pss", "rsa_pss_saltlen:-1"] });
C.leafSha384 = L("leaf-sha384", { md: "sha384", ext: LEAF("DNS:sha384.example.test") });
C.leafExpired = L("leaf-expired", { start: "20251001000000Z", end: "20260101000000Z" });
C.leafFuture = L("leaf-future", { start: "20270101000000Z", end: "20270601000000Z" });
C.leafSoon = L("leaf-soon", { start: "20260901000000Z", end: "20261210000000Z" });
C.leafLong = L("leaf-long", { start: "20260401000000Z", end: "20270501000000Z" });
C.leafSha1 = L("leaf-sha1", { md: "sha1" });
C.leaf1024 = L("leaf-rsa1024", { kind: "rsa1024" });
C.leafNoSan = L("leaf-nosan", { ext: LEAF(null) });
C.leafClient = L("leaf-client", { ext: LEAF(SAN).replace("extendedKeyUsage=serverAuth", "extendedKeyUsage=clientAuth") });
C.leafPartial = L("leaf-partial", { ext: LEAF("DNS:w*.example.test,DNS:shop.example.test") });
C.leafEcKu = L("leaf-ec-ku", { kind: "p256", signer: C.intEc, ext: LEAF("DNS:ku.example.test").replace("digitalSignature,keyEncipherment", "keyEncipherment") });
C.leafBadSig = L("leaf-badsig", { signer: C.intImposter, ext: LEAF(SAN).replace("authorityKeyIdentifier=keyid", "authorityKeyIdentifier=none") });
C.leafRekeyed = L("leaf-rekeyed", { signer: C.intImposter });
C.leafOfNotCa = L("leaf-of-notca", { signer: C.intNotCa });
C.leafOfNoKcs = L("leaf-of-nokcs", { signer: C.intNoKcs });
C.leafOfB = L("leaf-of-b", { signer: C.intB });
C.leafOfShort = L("leaf-of-short", { signer: C.intShort, end: "20271001000000Z" });
C.leafSelf = cert({ name: "leaf-self", kind: "p256", subj: "/CN=self.example.test", ext: "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:self.example.test\nsubjectKeyIdentifier=hash", start: "20261101000000Z", end: "20271101000000Z", selfsign: true });
C.leafK256 = L("leaf-k256", { kind: "k256", ext: LEAF("DNS:k256.example.test").replace("digitalSignature,keyEncipherment", "digitalSignature") });
C.leafMany = L("leaf-many", { ext: LEAF("DNS:a.example.test,DNS:b.example.test,DNS:*.example.test,DNS:x.y.example.test,IP:10.0.0.1,email:ops@example.test,URI:https://example.test/") });

C.leafEscaped = L("leaf-escaped", { subj: "/O=Acme\\, Inc. \\+ Sons; <Ltd>/CN=shop.example.test", ext: LEAF("DNS:shop.example.test") });

const pem = (...ks) => ks.map((k) => C[k].pem).join("");

// trust: which root the client trusts (verify -CAfile); untrusted: what the server sends after the leaf
const SCENARIOS = [
  { id: "good-rsa", files: ["leaf", "int"], trust: "root", hosts: ["www.example.test", "example.test", "x.api.example.test", "a.b.api.example.test", "api.example.test", "192.0.2.10", "2001:db8::10", "WWW.EXAMPLE.TEST", "other.test"] },
  { id: "good-ec", files: ["leafEc", "intEc"], trust: "rootEc", hosts: ["www.example.test"] },
  { id: "good-p521", files: ["leafP521", "intEc"], trust: "rootEc", hosts: ["p521.example.test"] },
  { id: "good-ed25519", files: ["leafEd", "int"], trust: "root", hosts: ["ed.example.test"] },
  { id: "good-pss", files: ["leafPss", "intPss"], trust: "root", hosts: ["pss.example.test"] },
  { id: "good-sha384", files: ["leafSha384", "int"], trust: "root", hosts: ["sha384.example.test"] },
  { id: "leaf-only", files: ["leaf"], trust: "root" },
  { id: "wrong-order", files: ["int", "leaf"], trust: "root" },
  { id: "root-included", files: ["leaf", "int", "root"], trust: "root" },
  { id: "unrelated", files: ["leaf", "int", "intEc"], trust: "root" },
  { id: "duplicate", files: ["leaf", "int", "int"], trust: "root" },
  { id: "expired", files: ["leafExpired", "int"], trust: "root" },
  { id: "not-yet-valid", files: ["leafFuture", "int"], trust: "root" },
  { id: "expires-soon", files: ["leafSoon", "int"], trust: "root" },
  { id: "too-long", files: ["leafLong", "int"], trust: "root" },
  { id: "sha1", files: ["leafSha1", "int"], trust: "root" },
  { id: "rsa1024", files: ["leaf1024", "int"], trust: "root" },
  { id: "no-san", files: ["leafNoSan", "int"], trust: "root", hosts: ["www.example.test"] },
  { id: "client-eku", files: ["leafClient", "int"], trust: "root" },
  { id: "partial-wildcard", files: ["leafPartial", "int"], trust: "root", hosts: ["www.example.test", "shop.example.test"] },
  { id: "ec-ku", files: ["leafEcKu", "intEc"], trust: "rootEc" },
  { id: "bad-signature", files: ["leafBadSig", "int"], trust: "root" },
  { id: "rekeyed-issuer", files: ["leafRekeyed", "int"], trust: "root" },
  { id: "issuer-not-ca", files: ["leafOfNotCa", "intNotCa"], trust: "root" },
  { id: "issuer-no-kcs", files: ["leafOfNoKcs", "intNoKcs"], trust: "root" },
  { id: "pathlen", files: ["leafOfB", "intB", "intA"], trust: "root" },
  { id: "chain-expires-first", files: ["leafOfShort", "intShort"], trust: "root" },
  { id: "self-signed", files: ["leafSelf"], trust: "leafSelf", hosts: ["self.example.test"] },
  { id: "secp256k1", files: ["leafK256", "int"], trust: "root" },
  { id: "many-names", files: ["leafMany", "int"], trust: "root", hosts: ["a.example.test", "z.example.test", "x.y.example.test", "q.x.y.example.test", "example.test", "10.0.0.1", "10.0.0.2"] },
];

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "certs"), { recursive: true });
mkdirSync(path.join(out, "chains"), { recursive: true });

const certFacts = {};
for (const [k, c] of Object.entries(C)) {
  writeFileSync(path.join(out, "certs", `${c.name}.pem`), c.pem);
  const one = (...a) => ossl(["x509", "-in", `${c.name}.pem`, "-noout", ...a]).trim();
  const ext = (n) => tryOssl(["x509", "-in", `${c.name}.pem`, "-noout", "-ext", n]).out.split("\n").slice(1).join(" ").trim() || null;
  const text = one("-text");
  certFacts[k] = {
    file: `certs/${c.name}.pem`,
    subject: one("-subject", "-nameopt", "RFC2253").replace(/^subject=/, ""),
    issuer: one("-issuer", "-nameopt", "RFC2253").replace(/^issuer=/, ""),
    serial: one("-serial").replace(/^serial=/, ""),
    dates: one("-dates", "-dateopt", "iso_8601"),
    sha256: one("-fingerprint", "-sha256").replace(/^.*Fingerprint=/, ""),
    publicKeyBits: (text.match(/Public-Key: \((\d+) bit\)/) || [])[1] || null,
    curve: (text.match(/ASN1 OID: (\S+)/) || [])[1] || null,
    keyAlgorithm: (text.match(/Public Key Algorithm: (\S+)/) || [])[1],
    signatureAlgorithm: (text.match(/Signature Algorithm: (\S+)/) || [])[1],
    subjectAltName: ext("subjectAltName"),
    basicConstraints: ext("basicConstraints"),
    keyUsage: ext("keyUsage"),
    extendedKeyUsage: ext("extendedKeyUsage"),
    subjectKeyIdentifier: ext("subjectKeyIdentifier"),
    authorityKeyIdentifier: ext("authorityKeyIdentifier"),
  };
}

const chainFacts = [];
for (const s of SCENARIOS) {
  const file = `chains/${s.id}.pem`;
  writeFileSync(path.join(out, file), pem(...s.files));
  writeFileSync(path.join(tmp, "trust.pem"), C[s.trust].pem);
  const leafKey = s.files[0];
  writeFileSync(path.join(tmp, "untrusted.pem"), pem(...s.files.slice(1)) || "");
  const args = ["verify", "-purpose", "sslserver", "-attime", AT_EPOCH, "-CAfile", "trust.pem"];
  if (s.files.length > 1) args.push("-untrusted", "untrusted.pem");
  const v = tryOssl([...args, `${C[leafKey].name}.pem`]);
  const codes = [...v.out.matchAll(/error (\d+) at (\d+) depth lookup: ([^\n]+)/g)].map((m) => ({ code: +m[1], depth: +m[2], text: m[3].trim() }));
  const hosts = {};
  for (const h of s.hosts || []) {
    const flag = /^[\d.]+$|:/.test(h) ? "-checkip" : "-checkhost";
    hosts[h] = !/does NOT match/.test(ossl(["x509", "-in", `${C[leafKey].name}.pem`, "-noout", flag, h]));
  }
  chainFacts.push({ id: s.id, file, files: s.files, trust: s.trust, verifyOk: v.code === 0, verifyErrors: codes, opensslHostMatch: hosts });
}

writeFileSync(path.join(out, "openssl.json"), JSON.stringify({ openssl: ossl(["version"]).trim(), at: AT, certs: certFacts, chains: chainFacts }, null, 2) + "\n");
rmSync(tmp, { recursive: true, force: true });
console.log(`${Object.keys(C).length} certificates, ${SCENARIOS.length} chains -> fixtures/`);
