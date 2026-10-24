// Compile Romania's national e-Factura rules (CIUS-RO, ANAF) into ./plain/ for
// plain-schematron.mjs:
//   node build-ro-rules.mjs [version]
// Needs `npm i --no-save slimdom fontoxpath`, curl, unzip. Same route as
// build-pint-rules.mjs: the rules ship as Schematron compiled to XSLT inside the
// phive-rules-cius-ro artefact on Maven Central (Apache-2.0 wrapper; the rules
// are published by the Romanian authorities). They sit on top of the EN 16931
// base rules, so this is an add-on set (cius-ro-ubl.json), not a replacement.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileXslt } from "./plain-from-xslt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "plain");
const version = process.argv[2] || "4.6.3";
const base = `https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-cius-ro/${version}/phive-rules-cius-ro-${version}.jar`;
const work = mkdtempSync(join(tmpdir(), "einvoice-ro-"));
const jar = process.env.EINVOICE_RO_JAR || join(work, "rules.jar"); // a jar already on disk skips the download
if (!process.env.EINVOICE_RO_JAR) execFileSync("curl", ["-sSfL", "--retry", "4", "--retry-delay", "5", "-o", jar, base], { stdio: "inherit" });
execFileSync("unzip", ["-oq", jar, "external/schematron/1.0.9/*", "-d", work]);

// The national-only file; EN16931-CIUS_RO-UBL-validation.xslt bundles the EU base too.
const xslt = join(work, "external/schematron/1.0.9/ROeFactura-UBL-validation-Invoice_v1.0.9.xslt");
if (!existsSync(xslt)) throw new Error(`Missing ${xslt}`);
const rules = compileXslt(xslt);
const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
writeFileSync(join(out, "cius-ro-ubl.json"), JSON.stringify(rules) + "\n");
const manifestFile = join(out, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
manifest.sets["cius-ro-ubl"] = { source: `RO e-Factura CIUS-RO v1.0.9 via phive-rules-cius-ro ${version} on Maven Central`, from: "ROeFactura-UBL-validation-Invoice_v1.0.9.xslt", checks };
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`cius-ro-ubl: ${checks} checks`);
