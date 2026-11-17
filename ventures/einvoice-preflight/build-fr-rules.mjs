// Compile France's CTC e-invoicing rules (BR-FR, AFNOR XP Z12-012, the "Flux 2"
// controls the approved platforms (PA) run since 1 September 2026) into ./plain/ for
// plain-schematron.mjs:
//   node build-fr-rules.mjs [commit]
// Needs `npm i --no-save slimdom fontoxpath`, git. Source: FNFE-MPE's validation
// artefacts, github.com/fnfempe/France_RFE (repository licence Apache-2.0; the .sch
// header names the EUPL). One BR-FR file per syntax serves EN 16931, Extended-CTC-FR
// and Factur-X alike (the copies under each profile are byte-identical, checked below).
// The "fatal" files are used, not the _WARNING copies meant for the transition.
// Add-on sets over the EN 16931 base: cius-fr-ubl.json, cius-fr-cii.json. Also the life-cycle
// status message rules (BR-FR-CDV, CDAR D22B): cdar-fr.json, a set of its own (no EN 16931 base).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSchematron } from "./plain-compile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "plain");
// 1.4.0.04 (BR-FR-Flux2-Schematron_V1.4.0.04, "last fix04 2026 09 04"), pushed 2026-09-05.
const commit = process.argv[2] || "97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d";
const work = process.env.EINVOICE_FR_CHECKOUT || mkdtempSync(join(tmpdir(), "einvoice-fr-"));
if (!process.env.EINVOICE_FR_CHECKOUT) {
  execFileSync("git", ["init", "-q", work]);
  execFileSync("git", ["-C", work, "fetch", "-q", "--depth", "1", "https://github.com/fnfempe/France_RFE", commit], { stdio: "inherit" });
  execFileSync("git", ["-C", work, "checkout", "-q", "FETCH_HEAD"]);
}
const root = join(work, "FNFE_RFE_INVOICE");
const sets = {
  ubl: ["UBL/EN16931", "UBL/EXTENDED-CTC-FR"].map((d) => `${d}/schematron/BR-FR-Flux2-Schematron-UBL.sch`),
  cii: ["CII/EN16931", "CII/EXTENDED-CTC-FR", "Factur-X/EN16931", "Factur-X/EXTENDED", "Factur-X/BASICWL"].map((d) => `${d}/schematron/BR-FR-Flux2-Schematron-CII.sch`),
};
const version = readFileSync(join(root, sets.ubl[0]), "utf8").match(/BR-FR-Flux2-Schematron-UBL_V([\d.]+)/)?.[1] ?? "?";
const manifestFile = join(out, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
for (const [syntax, files] of Object.entries(sets)) {
  const texts = files.map((f) => readFileSync(join(root, f), "utf8"));
  if (texts.some((t) => t !== texts[0])) throw new Error(`${syntax}: the BR-FR copies differ between profiles; build one set per profile`);
  const rules = compileSchematron(join(root, files[0]));
  const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  writeFileSync(join(out, `cius-fr-${syntax}.json`), JSON.stringify(rules) + "\n");
  manifest.sets[`cius-fr-${syntax}`] = { source: `FNFE-MPE BR-FR (XP Z12-012) ${version}, github.com/fnfempe/France_RFE (Apache-2.0)`, commit, from: files[0].split("/").pop(), checks };
  console.log(`cius-fr-${syntax}: ${checks} checks`);
}
{
  const from = "CDAR/schematron/BR-FR-CDV-Schematron-CDAR.sch";
  const cdarVersion = readFileSync(join(root, from), "utf8").match(/BR-FR-CDV-Schematron-CDAR_V([\d.]+)/)?.[1] ?? "?";
  const rules = compileSchematron(join(root, from));
  const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  writeFileSync(join(out, "cdar-fr.json"), JSON.stringify(rules) + "\n");
  manifest.sets["cdar-fr"] = { source: `FNFE-MPE BR-FR-CDV (CDAR life-cycle statuses) ${cdarVersion}, github.com/fnfempe/France_RFE (Apache-2.0)`, commit, from: from.split("/").pop(), checks };
  console.log(`cdar-fr: ${checks} checks`);
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
