// The ZATCA stamp check (zatca-stamp.mjs) over ZATCA's own signed sample invoices, as
// phive-rules ships them (the files ZATCA's SDK carries, signed with ZATCA's test CSID).
// Every one is a signed invoice that ZATCA published as an example, so any stamp finding
// on one is either a fault of ours or a real mismatch in the example; each is read.
//
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/phax/phive-rules
//   cd phive-rules && git sparse-checkout set --no-cone 'phive-rules-zatca/src/test/**'
//   node eval/zatca-stamp-corpus.mjs <phive-rules checkout> [--json] [--node-crypto]
//
// --node-crypto also recomputes the hash's SHA-256 and verifies each signature with
// node:crypto, a second implementation beside the dependency-free one the page runs.
// The examples are not copied here (each keeps its publisher's licence).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { checkZatcaStamp, zatcaInvoiceHash } from "../zatca-stamp.mjs";

const root = process.argv[2];
if (!root || !existsSync(root)) { console.error("usage: node eval/zatca-stamp-corpus.mjs <phive-rules checkout> [--json] [--node-crypto]"); process.exit(2); }
const base = join(root, "phive-rules-zatca/src/test/resources/external/test-files");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".xml") ? [p] : []; });
const files = walk(base).sort();
const crypto = process.argv.includes("--node-crypto") ? await import("node:crypto") : null;
const rows = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const t0 = performance.now();
  const { findings, meta } = checkZatcaStamp(text);
  const ms = performance.now() - t0;
  const row = { file: relative(base, f), checked: meta.checked, rules: findings.map((x) => x.rule), ms: Math.round(ms) };
  if (crypto) {
    const digest = /Id="invoiceSignedData"[\s\S]*?<ds:DigestValue>([^<]+)</.exec(text)?.[1];
    const sig = Buffer.from(/<ds:SignatureValue>([^<]+)</.exec(text)[1].replace(/\s/g, ""), "base64");
    const cert = new crypto.X509Certificate(Buffer.from(/<ds:X509Certificate>([^<]+)</.exec(text)[1].replace(/\s/g, ""), "base64"));
    row.nodeHashMatchesDigest = zatcaInvoiceHash(text) === digest;
    row.nodeSignatureValid = crypto.verify("sha256", Buffer.from(digest, "base64"), { key: cert.publicKey, dsaEncoding: "der" }, sig);
  }
  rows.push(row);
}
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 1));
else {
  for (const r of rows) console.log(`${r.rules.length ? "FIND" : "ok  "} ${r.file}  [${r.checked.join(", ")}]  ${r.rules.join(" ")}  ${r.ms} ms${crypto ? `  node: hash ${r.nodeHashMatchesDigest} sig ${r.nodeSignatureValid}` : ""}`);
  const byVer = {};
  for (const r of rows) { const v = r.file.split("/")[0]; byVer[v] ||= { n: 0, clean: 0 }; byVer[v].n++; if (!r.rules.length) byVer[v].clean++; }
  console.log(Object.entries(byVer).map(([v, x]) => `${v}: ${x.clean} of ${x.n} with no stamp finding`).join("; "));
}
