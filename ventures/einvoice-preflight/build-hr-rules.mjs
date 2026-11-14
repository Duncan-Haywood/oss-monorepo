// Compile Croatia's national e-invoice rules (HR-CIUS 2025 with the HR extension,
// Fiskalizacija 2.0, live for B2B from 1 January 2026) into ./plain/ for
// plain-schematron.mjs:
//   node build-hr-rules.mjs [version]
// Needs `npm i --no-save slimdom fontoxpath`, curl, unzip. Same route as build-ro-rules.mjs:
// the phive-rules-eracun artefact on Maven Central (Apache-2.0 wrapper). The rules are the
// Porezna uprava's HRUBLSchematron (13.03.2026, numbered 1.0.4 by phive), published on
// porezna.gov.hr; its site allows reproduction with the source named (plain/manifest.json
// and plain/NOTICE.txt carry it). The stylesheet holds the HR-BR rules only, so this is an
// add-on set over the EN 16931 base (cius-hr-ubl.json), not a replacement.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileXslt } from "./plain-from-xslt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "plain");
const version = process.argv[2] || "4.6.4";
const sch = "1.0.4";
const base = `https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-eracun/${version}/phive-rules-eracun-${version}.jar`;
const work = mkdtempSync(join(tmpdir(), "einvoice-hr-"));
const jar = process.env.EINVOICE_HR_JAR || join(work, "rules.jar"); // a jar already on disk skips the download
if (!process.env.EINVOICE_HR_JAR) execFileSync("curl", ["-sSfL", "-A", "Mozilla/5.0", "--retry", "4", "--retry-delay", "5", "-o", jar, base], { stdio: "inherit" });
execFileSync("unzip", ["-oq", jar, `external/schematron/${sch}/*`, "-d", work]);

const xslt = join(work, `external/schematron/${sch}/HR-CIUS-EXT-EN16931-UBL.xslt`);
if (!existsSync(xslt)) throw new Error(`Missing ${xslt}`);
const rules = compileXslt(xslt);
const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
writeFileSync(join(out, "cius-hr-ubl.json"), JSON.stringify(rules) + "\n");
const manifestFile = join(out, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
manifest.sets["cius-hr-ubl"] = { source: `HR-CIUS 2025 + HR extension (Porezna uprava HRUBLSchematron 13.03.2026, phive ${sch}) via phive-rules-eracun ${version} on Maven Central; reproduced with the source named, per porezna.gov.hr`, from: "HR-CIUS-EXT-EN16931-UBL.xslt", checks };
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`cius-hr-ubl: ${checks} checks`);
