// Compile Portugal's national e-invoice rules (CIUS-PT, AMA / FEAP) into ./plain/ for
// plain-schematron.mjs:
//   node build-pt-rules.mjs [version]
// Needs `npm i --no-save slimdom fontoxpath`, curl, unzip. Same route as build-ro-rules.mjs:
// the phive-rules-cius-pt artefact on Maven Central (Apache-2.0 wrapper; the rules are
// published by the Portuguese authorities). The published stylesheet bundles the EU base
// and the UBL syntax rules, so this keeps only the checks the EN 16931 set does not
// already carry (by rule id): an add-on (cius-pt-ubl.json), not a replacement.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileXslt } from "./plain-from-xslt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "plain");
const version = process.argv[2] || "4.6.3";
const sch = "2.1.1";
const base = `https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-cius-pt/${version}/phive-rules-cius-pt-${version}.jar`;
const work = mkdtempSync(join(tmpdir(), "einvoice-pt-"));
const jar = process.env.EINVOICE_PT_JAR || join(work, "rules.jar"); // a jar already on disk skips the download
if (!process.env.EINVOICE_PT_JAR) execFileSync("curl", ["-sSfL", "--retry", "4", "--retry-delay", "5", "-o", jar, base], { stdio: "inherit" });
execFileSync("unzip", ["-oq", jar, `external/schematron/${sch}/*`, "-d", work]);

const xslt = join(work, `external/schematron/${sch}/urn_feap.gov.pt_CIUS-PT_${sch}.xslt`);
if (!existsSync(xslt)) throw new Error(`Missing ${xslt}`);
const rules = compileXslt(xslt);
const known = new Set();
for (const f of ["en16931-ubl.json"]) for (const p of JSON.parse(readFileSync(join(out, f), "utf8")).patterns) for (const r of p.rules) for (const c of r.checks) known.add(c.id);
let checks = 0;
rules.patterns = rules.patterns.map((p) => ({ ...p, rules: p.rules.map((r) => ({ ...r, checks: r.checks.filter((c) => !known.has(c.id)) })).filter((r) => r.checks.length) })).filter((p) => p.rules.length);
for (const p of rules.patterns) for (const r of p.rules) checks += r.checks.length;
writeFileSync(join(out, "cius-pt-ubl.json"), JSON.stringify(rules) + "\n");
const manifestFile = join(out, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
manifest.sets["cius-pt-ubl"] = { source: `PT CIUS-PT v${sch} via phive-rules-cius-pt ${version} on Maven Central`, from: `urn_feap.gov.pt_CIUS-PT_${sch}.xslt`, checks };
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`cius-pt-ubl: ${checks} checks`);
