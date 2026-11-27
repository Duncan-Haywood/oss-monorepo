// Checks the Facturae signature rules against what facturae.gob.es publishes:
// (1) the digest of each revision of the v3.1 and v3.0 signature-policy PDFs, against
//     the values facturae-signature.mjs pins; (2) the government's own signed example
//     invoices, and mutants of them (an amount edited, a re-indent, a SignatureValue
//     character flipped, the SigningTime edited), through checkFacturaeSignature.
//
// The files are not committed (they are the ministry's); fetch them into a fresh
// directory first:
//   D=$(mktemp -d); B=https://www.facturae.gob.es/content/dam/facturae/formato
//   curl -sSo $D/policy31.pdf "$B/polticasfirma/a)-versi%f3n-3-1/Politica_Firma_formato_facturae_v3_1.pdf"
//   curl -sSo $D/policy30.pdf "$B/polticasfirma/b)-versi%f3n-3-0/PoliticaFirmaFormatoFacturaev3_0.pdf"
//   curl -sSo $D/ejemplo31.xml "$B/versiones-anteriores/a)-versi%C3%B3n-3-1/factura_ejemplo_31.xml"
//   curl -sSo $D/ejemplo30.xml "$B/versiones-anteriores/b)-versi%C3%B3n-3-0/factura2_ejemplo30.xml"
//   node eval/facturae-gob-check.mjs $D [--write <outdir>]
// --write saves each case as <outdir>/<file>.<n>.xml for a second verifier
// (eval/facturae-gob-signxml.py).
// Exit 1 when a pinned digest or an expected verdict does not hold.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import { checkFacturaeSignature, FACTURAE_POLICY, FACTURAE_POLICY_V30 } from "../facturae-signature.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node eval/facturae-gob-check.mjs <dir with policy31.pdf, policy30.pdf, ejemplo31.xml, ejemplo30.xml>"); process.exit(2); }
const wi = process.argv.indexOf("--write");
const outDir = wi > 0 ? process.argv[wi + 1] : null;
if (outDir) mkdirSync(outDir, { recursive: true });
let bad = 0;
const ALGS = { "http://www.w3.org/2000/09/xmldsig#sha1": "sha1", "http://www.w3.org/2001/04/xmlenc#sha256": "sha256", "http://www.w3.org/2001/04/xmldsig-more#sha384": "sha384", "http://www.w3.org/2001/04/xmlenc#sha512": "sha512" };
const b64 = (alg, buf) => crypto.createHash(alg).update(buf).digest("base64");

// A PDF revision ends at each "%%EOF" plus the end-of-line after it.
function revisions(buf) {
  const out = [];
  for (let i = buf.indexOf("%%EOF"); i >= 0; i = buf.indexOf("%%EOF", i + 5)) {
    let e = i + 5;
    while (e < buf.length && (buf[e] === 0x0d || buf[e] === 0x0a)) e++;
    out.push(e);
  }
  return out;
}

console.log("## Policy PDFs\n\n| File | Bytes | Revision ends | SHA-1 of each revision | Pinned revision |\n| --- | --- | --- | --- | --- |");
for (const [file, pol] of [["policy31.pdf", FACTURAE_POLICY], ["policy30.pdf", FACTURAE_POLICY_V30]]) {
  const p = join(dir, file);
  if (!existsSync(p)) { console.log(`| ${file} | missing | | | |`); bad++; continue; }
  const buf = readFileSync(p);
  const ends = revisions(buf);
  const sha1s = ends.map((e) => b64("sha1", buf.subarray(0, e)));
  // The pinned digests must all come from one revision.
  const hit = ends.findIndex((e) => Object.entries(pol.digests).every(([uri, v]) => b64(ALGS[uri], buf.subarray(0, e)) === v));
  if (hit < 0) bad++;
  console.log(`| ${file} | ${buf.length} | ${ends.join(", ")} | ${sha1s.join(", ")} | ${hit < 0 ? "NONE" : `${ends[hit]} bytes (revision ${hit + 1} of ${ends.length}), all four digests`} |`);
}

const errors = (r) => r.findings.filter((f) => f.severity !== "warning").map((f) => f.rule).sort().join(" ") || "none";
const warnings = (r) => r.findings.filter((f) => f.severity === "warning").map((f) => f.rule).sort().join(" ") || "none";
function mutants(xml) {
  const amount = /<InvoiceTotal>([0-9.]+)<\/InvoiceTotal>/.exec(xml);
  const sv = /<(?:ds:)?SignatureValue[^>]*>\s*([A-Za-z0-9+/])/.exec(xml);
  const flipAt = sv.index + sv[0].length - 1;
  return [
    ["as published", xml, "ES-SIG-0[1-9] none"],
    ["InvoiceTotal edited", xml.replace(amount[0], `<InvoiceTotal>${(Number(amount[1]) + 0.01).toFixed(2)}</InvoiceTotal>`), "ES-SIG-03"],
    ["re-indented (a space in FileHeader)", xml.replace("<FileHeader>", "<FileHeader> "), "ES-SIG-03"],
    ["SignatureValue character flipped", xml.slice(0, flipAt) + (xml[flipAt] === "A" ? "B" : "A") + xml.slice(flipAt + 1), "ES-SIG-04"],
    ["SigningTime edited", xml.replace(/(SigningTime>)(\d{4})/, (m, a, y) => a + (Number(y) - 1)), "ES-SIG-03"],
  ];
}
console.log("\n## Signed examples\n\n| File | Case | Errors | Warnings | Expected | Agrees |\n| --- | --- | --- | --- | --- | --- |");
for (const file of ["ejemplo31.xml", "ejemplo30.xml"]) {
  const p = join(dir, file);
  if (!existsSync(p)) { console.log(`| ${file} | missing | | | | |`); bad++; continue; }
  const xml = readFileSync(p, "utf8");
  for (const [n, [name, text, expect]] of mutants(xml).entries()) {
    if (outDir) writeFileSync(join(outDir, `${file.replace(/\.xml$/, "")}.${n}.xml`), text);
    const r = checkFacturaeSignature(text);
    const e = errors(r);
    const ok = expect.endsWith("none") ? e === "none" && r.summary.signatureValid : e.split(" ").includes(expect);
    if (!ok) bad++;
    console.log(`| ${file} | ${name} | ${e} | ${warnings(r)} | ${expect.endsWith("none") ? "no error" : expect} | ${ok ? "yes" : "NO"} |`);
  }
  const r = checkFacturaeSignature(xml);
  console.log(`|  | summary | ${r.summary.signatureMethod.split("#")[1]}, ${r.summary.references} references, issuer ${r.summary.issuer}, certificate to ${r.summary.notAfter}, signed ${r.summary.signingTime} | | | |`);
}
console.log(bad ? `\n${bad} check(s) did not hold` : "\nall checks hold");
process.exit(bad ? 1 : 0);
