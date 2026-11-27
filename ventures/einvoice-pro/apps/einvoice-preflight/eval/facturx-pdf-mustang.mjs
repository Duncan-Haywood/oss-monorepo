#!/usr/bin/env node
// Runs Mustang's validator (org.mustangproject:Mustang-CLI, Apache-2.0, from
// Maven Central) over Factur-X / ZUGFeRD PDFs and summarises its verdicts:
// the PDF/A part (veraPDF inside Mustang), the XML part (Schematron for the
// profile it reads) and every failed rule id.
//
//   node eval/facturx-pdf-mustang.mjs <Mustang-CLI.jar> <pdf>...
//
// Get the jar: https://repo1.maven.org/maven2/org/mustangproject/Mustang-CLI/2.26.0/Mustang-CLI-2.26.0.jar
// (a 59 MB fat jar; one JVM per file, about 4-8 s each).
import { spawnSync } from "node:child_process";
import { basename } from "node:path";

const [jar, ...pdfs] = process.argv.slice(2);
if (!jar || !pdfs.length) {
  console.error("usage: node eval/facturx-pdf-mustang.mjs <Mustang-CLI.jar> <pdf>...");
  process.exit(2);
}

function summarise(stdout, stderr) {
  const pick = (re, s = stdout) => (s.match(re) || [])[1] || "";
  const pdfPart = stdout.split("<xml>")[0];
  const xmlPart = (stdout.split("<xml>")[1] || "").split("</xml>")[0];
  const rules = new Set();
  for (const m of stdout.matchAll(/\[ID ([A-Za-z0-9_.-]+)\]/g)) rules.add(m[1]);
  for (const m of (stderr.match(/ErrorIDs: \[([^\]]*)\]/) || ["", ""])[1].split(",")) if (m.trim()) rules.add(m.trim());
  const errors = [...xmlPart.matchAll(/<error[^>]*>([\s\S]*?)<\/error>/g)].map((m) => m[1].trim());
  return {
    flavour: pick(/flavour=([0-9a-z]+)/, pdfPart),
    pdfStatus: pick(/<summary status="([a-z]+)"\/>/, pdfPart),
    profile: pick(/<profile>([^<]+)<\/profile>/, xmlPart),
    xmlStatus: pick(/<summary status="([a-z]+)"\/>/, xmlPart),
    fired: pick(/<fired>(\d+)<\/fired>/, xmlPart),
    failed: pick(/<failed>(\d+)<\/failed>/, xmlPart),
    overall: pick(/<\/xml>[\s\S]*<summary status="([a-z]+)"\/>\s*<\/validation>/),
    rules: [...rules],
    errors,
  };
}

let invalid = 0;
for (const pdf of pdfs) {
  const r = spawnSync("java", ["-jar", jar, "--action", "validate", "--source", pdf, "--no-notices"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const s = summarise(r.stdout || "", r.stderr || "");
  if (s.overall !== "valid") invalid++;
  console.log(`${basename(pdf)}: overall ${s.overall || "?"}; PDF/A ${s.flavour || "?"} ${s.pdfStatus || "?"}; XML ${s.xmlStatus || "?"} (${s.profile}, ${s.fired} rules fired, ${s.failed} failed)${s.rules.length ? `; rules: ${s.rules.join(", ")}` : ""}`);
  for (const e of s.errors) console.log(`  error: ${e.replace(/\s+/g, " ").slice(0, 300)}`);
}
console.log(`Mustang: ${pdfs.length - invalid} of ${pdfs.length} valid`);
if (invalid) process.exitCode = 1;
