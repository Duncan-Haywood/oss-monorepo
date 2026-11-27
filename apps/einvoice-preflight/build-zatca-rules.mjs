// Compile Saudi Arabia's e-invoice rules (ZATCA, Fatoora) into ./plain/ for
// plain-schematron.mjs:
//   node build-zatca-rules.mjs [version]
// Needs `npm i --no-save slimdom fontoxpath`, curl, unzip. Same route as
// build-pint-rules.mjs: ZATCA publishes its validation rules as Schematron compiled
// to XSLT (SchXslt), which the phive-rules-zatca artefact on Maven Central carries
// (Apache-2.0 wrapper; the rules themselves are ZATCA's, LGPL-3.0, from its e-invoicing
// toolkit SDK). Two sets, both run for a KSA invoice and replacing the EU base:
// ZATCA's own cut of the EN 16931 UBL rules and the KSA business rules (BR-KSA-*).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileXslt } from "./plain-from-xslt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "plain");
const version = process.argv[2] || "4.6.3";
const rulesVersion = "3.4.6"; // the newest schematron folder in the jar
const base = `https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-zatca/${version}/phive-rules-zatca-${version}.jar`;
const work = mkdtempSync(join(tmpdir(), "einvoice-zatca-"));
const jar = process.env.EINVOICE_ZATCA_JAR || join(work, "rules.jar"); // a jar already on disk skips the download
if (!process.env.EINVOICE_ZATCA_JAR) execFileSync("curl", ["-sSfL", "--retry", "4", "--retry-delay", "5", "-o", jar, base], { stdio: "inherit" });
execFileSync("unzip", ["-oq", jar, `external/schematron/${rulesVersion}/*`, "-d", work]);

const sets = {
  "zatca-en16931-ubl": "CEN-EN16931-UBL.xsl",
  "zatca-ksa-ubl": "20210819_ZATCA_E-invoice_Validation_Rules.xsl",
};
const manifestFile = join(out, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
for (const [name, file] of Object.entries(sets)) {
  const xslt = join(work, "external/schematron", rulesVersion, file);
  if (!existsSync(xslt)) throw new Error(`Missing ${xslt}`);
  const rules = compileXslt(xslt);
  const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  writeFileSync(join(out, `${name}.json`), JSON.stringify(rules) + "\n");
  manifest.sets[name] = { source: `ZATCA e-invoice validation rules ${rulesVersion} via phive-rules-zatca ${version} on Maven Central`, from: file, checks };
  console.log(`${name}: ${checks} checks`);
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
