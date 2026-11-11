// Compile the Peppol PINT rule sets (Singapore InvoiceNow, Australia/New Zealand)
// into ./plain/ for plain-schematron.mjs:
//   node build-pint-rules.mjs [version] [pint-version]
// Two generations: the older releases that name the profile in a BIS-style
// CustomizationID (`...poacc:billing:international:sg:3.0`, from phive-rules-peppol),
// and the current ones that say `urn:peppol:pint:billing-1@sg-1` / `@aunz-1` (SG 1.4.1,
// A-NZ 1.1.3, from phive-rules-peppol-pint). OpenPeppol's own examples for the current
// releases carry only the new id, so without the second set they fell to the EU base
// (eval/phive-corpus.mjs, 2026-11-11). Set EINVOICE_PINT1_JAR for that jar on disk.
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

// Current PINT: one shared PINT-UBL set and one jurisdiction set per profile.
const pintVersion = process.argv[3] || "4.6.4";
const pintJar = process.env.EINVOICE_PINT1_JAR || join(work, "pint.jar");
if (!process.env.EINVOICE_PINT1_JAR) execFileSync("curl", ["-sSfL", "--retry", "4", "--retry-delay", "5", "-o", pintJar, `https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-peppol-pint/${pintVersion}/phive-rules-peppol-pint-${pintVersion}.jar`], { stdio: "inherit" });
execFileSync("unzip", ["-oq", pintJar, "external/schematron/pint-sg/1.4.1/*", "external/schematron/pint-aunz/1.1.3/*", "-d", work]);
const s1 = join(work, "external/schematron/pint-sg/1.4.1/xslt");
const a1 = join(work, "external/schematron/pint-aunz/1.1.3/xslt");
const current = {
  "pint1-sg-ubl": join(s1, "PINT-UBL-validation-preprocessed.xslt"),
  "pint1-sg-jur-ubl": join(s1, "PINT-jurisdiction-aligned-rules.xslt"),
  "pint1-aunz-ubl": join(a1, "billing/PINT-UBL-validation-preprocessed.xslt"),
  "pint1-aunz-jur-ubl": join(a1, "billing/PINT-jurisdiction-aligned-rules.xslt"),
  "pint1-aunz-sb-ubl": join(a1, "selfbilling/PINT-UBL-validation-preprocessed.xslt"),
  "pint1-aunz-sb-jur-ubl": join(a1, "selfbilling/PINT-jurisdiction-aligned-rules.xslt"),
};
for (const [name, xslt] of Object.entries(current)) {
  if (!existsSync(xslt)) throw new Error(`Missing ${xslt}`);
  const rules = compileXslt(xslt);
  const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  // Count check: every failed-assert in the stylesheet must come out as a check.
  const asserts = (readFileSync(xslt, "utf8").match(/<svrl:failed-assert\b/g) || []).length;
  if (checks !== asserts) throw new Error(`${name}: ${checks} checks read, ${asserts} failed-asserts in ${xslt}`);
  writeFileSync(join(out, `${name}.json`), JSON.stringify(rules) + "\n");
  manifest.sets[name] = { source: `OpenPeppol PINT via phive-rules-peppol-pint ${pintVersion} on Maven Central (MPL-2.0)`, from: xslt.split("schematron/")[1], checks };
  console.log(`${name}: ${checks} checks`);
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
