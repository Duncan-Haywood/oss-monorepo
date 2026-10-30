// Compile the Dutch national rules, NLCIUS (SI-UBL 2.0, BR-NL-nn), into ./plain/
// for plain-schematron.mjs:
//   node build-nl-rules.mjs [version]
// Needs `npm i --no-save slimdom fontoxpath`, curl, unzip. Same route as
// build-ro-rules.mjs: the rules ship as Schematron compiled to XSLT inside the
// phive-rules-simplerinvoicing artefact on Maven Central (Apache-2.0 wrapper;
// the rules are published by the Dutch NPA and NEN). The XSLT bundles the EU
// base too; only the pattern that holds the BR-NL / SI-UBL checks is kept, as
// an add-on set (nlcius-ubl.json) that runs after the EN 16931 base.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileXslt } from "./plain-from-xslt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "plain");
const version = process.argv[2] || "4.6.3";
const rulesVersion = process.env.EINVOICE_NL_RULES || "2.0.3.13";
const base = `https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-simplerinvoicing/${version}/phive-rules-simplerinvoicing-${version}.jar`;
const work = mkdtempSync(join(tmpdir(), "einvoice-nl-"));
const jar = process.env.EINVOICE_NL_JAR || join(work, "rules.jar"); // a jar already on disk skips the download
if (!process.env.EINVOICE_NL_JAR) execFileSync("curl", ["-sSfL", "--retry", "4", "--retry-delay", "5", "-o", jar, base], { stdio: "inherit" });
const sets = [["ubl", `external/schematron/simplerinvoicing/si-ubl-${rulesVersion}.xslt`], ["cii", `external/schematron/nlcius/nlcius-cii-1.0.${rulesVersion.replace(/^2\.0\./, "")}.xslt`]];
execFileSync("unzip", ["-oq", jar, ...sets.map(([, f]) => f), "-d", work]);

const national = (c) => /^(BR-NL|SI-UBL|empty-element-check)/.test(c.id);
const manifestFile = join(out, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
for (const [syntax, file] of sets) {
  const xslt = join(work, file);
  if (!existsSync(xslt)) throw new Error(`Missing ${xslt}`);
  const all = compileXslt(xslt);
  const rules = { ...all, patterns: all.patterns.filter((p) => p.rules.some((r) => r.checks.some(national))) };
  for (const p of rules.patterns) for (const r of p.rules) if (r.checks.some((c) => !national(c))) throw new Error(`pattern ${p.id} mixes national and base checks`);
  const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  writeFileSync(join(out, `nlcius-${syntax}.json`), JSON.stringify(rules) + "\n");
  manifest.sets[`nlcius-${syntax}`] = { source: `NLCIUS ${syntax.toUpperCase()} ${rulesVersion} via phive-rules-simplerinvoicing ${version} on Maven Central`, from: file.split("/").pop(), checks };
  console.log(`nlcius-${syntax}: ${checks} checks`);
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
