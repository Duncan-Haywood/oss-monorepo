// Compile the Peppol PINT rule sets (Singapore InvoiceNow, Australia/New Zealand)
// into ./plain/ for plain-schematron.mjs:
//   node build-pint-rules.mjs [version]
// Needs `npm i --no-save slimdom fontoxpath`, curl, unzip. GitHub is not needed:
// OpenPeppol publishes these as Schematron compiled to XSLT inside the
// phive-rules-peppol artefact on Maven Central (Apache-2.0 wrapper; the rules
// are OpenPeppol's, MPL-2.0). plain-from-xslt.mjs reads that XSLT back into the
// same JSON the .sch route writes. Adds the sets to plain/manifest.json.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileXslt } from "./plain-from-xslt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "plain");
const version = process.argv[2] || "4.6.3";
const base = `https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-peppol/${version}/phive-rules-peppol-${version}.jar`;
const work = mkdtempSync(join(tmpdir(), "einvoice-pint-"));
const jar = process.env.EINVOICE_PINT_JAR || join(work, "rules.jar"); // a jar already on disk skips the download
if (!process.env.EINVOICE_PINT_JAR) execFileSync("curl", ["-sSfL", "--retry", "4", "--retry-delay", "5", "-o", jar, base], { stdio: "inherit" });
execFileSync("unzip", ["-oq", jar, "external/schematron/peppol-sg/*", "external/schematron/peppol-aunz/*", "-d", work]);

const sg = join(work, "external/schematron/peppol-sg/2026.6/xslt");
const au = join(work, "external/schematron/peppol-aunz/1.0.12/xslt");
const sets = {
  "pint-sg-en16931-ubl": join(sg, "SG-Subset-CEN-EN16931-UBL.xslt"),
  "pint-sg-peppol-ubl": join(sg, "SG-Subset-PEPPOL-EN16931-UBL.xslt"),
  "pint-sg-billing3-ubl": join(sg, "SG-Billing3-UBL.xslt"),
  "pint-aunz-en16931-ubl": join(au, "AUNZ-UBL-validation.xslt"),
  "pint-aunz-peppol-ubl": join(au, "AUNZ-PEPPOL-validation.xslt"),
  "pint-aunz-sb-peppol-ubl": join(au, "AUNZ-PEPPOL-SB-validation.xslt"),
};
const manifestFile = join(out, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
for (const [name, xslt] of Object.entries(sets)) {
  if (!existsSync(xslt)) throw new Error(`Missing ${xslt}`);
  const rules = compileXslt(xslt);
  const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  writeFileSync(join(out, `${name}.json`), JSON.stringify(rules) + "\n");
  manifest.sets[name] = { source: `OpenPeppol PINT via phive-rules-peppol ${version} on Maven Central (MPL-2.0)`, from: xslt.split("schematron/")[1], checks };
  console.log(`${name}: ${checks} checks`);
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
