// Compile France's CTC e-invoicing rules (BR-FR, AFNOR XP Z12-012, the "Flux 2"
// controls the approved platforms (PA) run since 1 September 2026) into ./plain/ for
// plain-schematron.mjs:
//   node build-fr-rules.mjs [commit]
// Needs `npm i --no-save slimdom fontoxpath`, git. Source: FNFE-MPE's validation
// artefacts, github.com/fnfempe/France_RFE (repository licence Apache-2.0; the .sch
// header names the EUPL). One BR-FR file per syntax serves EN 16931, Extended-CTC-FR
// and Factur-X alike (the copies under each profile are byte-identical, checked below).
// English text: br-fr-en.mjs adds `en` to each BR-FR and BR-FR-CDV check from plain/br-fr-en.json.
// The "fatal" files are used, not the _WARNING copies meant for the transition.
// Add-on sets over the EN 16931 base: cius-fr-ubl.json, cius-fr-cii.json. Also the life-cycle
// status message rules (BR-FR-CDV, CDAR D22B): cdar-fr.json, a set of its own (no EN 16931 base).
// And the e-reporting rules (Flux 10: B2C and international transactions and payments, the PPF's
// "Annexe 7" controls as FNFE-MPE wrote them): flux10-fr.json, also a set of its own.
// And the base sets that stand in for the EN 16931 base on an extended file: FNFE's
// EXTENDED-CTC-FR (UBL, CII; derived from EN 16931 1.3.16, extensions allowed) and Factur-X
// 1.09.2 EXTENDED (CII): extended-ctc-fr-ubl.json, extended-ctc-fr-cii.json,
// facturx-extended-cii.json.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSchematron } from "./plain-compile.mjs";
import { addEnglish } from "./br-fr-en.mjs";

// The Factur-X sets look codes up in a side file (document('FACTUR-X_EXTENDED_codedb.xml')),
// which fontoxpath cannot open, so those checks were skipped (30 to 40 per invoice). Inline
// each list as a sequence: `$v = ('380', '381', ...)`. Returns how many lookups were inlined.
function inlineCodeDb(rules, dir) {
  const lookup = /document\('([\w.-]+_codedb\.xml)'\)\/codedb\/cl\[@id=(\d+)\]\/enumeration\[@value=(\$[\w.-]+)\]/g;
  const dbs = {};
  const list = (file, id) => {
    dbs[file] ??= Object.fromEntries([...readFileSync(join(dir, file), "utf8").matchAll(/<cl id="(\d+)">([\s\S]*?)<\/cl>/g)]
      .map(([, n, body]) => [n, [...body.matchAll(/value="([^"]*)"/g)].map(([, v]) => v.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&amp;/g, "&"))]));
    const values = dbs[file][id];
    if (!values) throw new Error(`${file}: no code list ${id}`);
    return `(${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")})`;
  };
  let n = 0;
  for (const p of rules.patterns) for (const r of p.rules) for (const c of r.checks) {
    c.test = c.test.replace(lookup, (m, file, id, v) => { n++; return `${v} = ${list(file, id)}`; });
    if (c.test.includes("document(")) throw new Error(`${c.id}: a document() lookup was left`);
  }
  return n;
}

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
  const untranslated = addEnglish(rules);
  if (untranslated.length) console.log(`cius-fr-${syntax}: ${untranslated.length} messages have no English in plain/br-fr-en.json`);
  writeFileSync(join(out, `cius-fr-${syntax}.json`), JSON.stringify(rules) + "\n");
  manifest.sets[`cius-fr-${syntax}`] = { source: `FNFE-MPE BR-FR (XP Z12-012) ${version}, github.com/fnfempe/France_RFE (Apache-2.0)`, commit, from: files[0].split("/").pop(), checks };
  console.log(`cius-fr-${syntax}: ${checks} checks`);
}
{
  const from = "CDAR/schematron/BR-FR-CDV-Schematron-CDAR.sch";
  const cdarVersion = readFileSync(join(root, from), "utf8").match(/BR-FR-CDV-Schematron-CDAR_V([\d.]+)/)?.[1] ?? "?";
  const rules = compileSchematron(join(root, from));
  const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  const untranslated = addEnglish(rules);
  if (untranslated.length) console.log(`cdar-fr: ${untranslated.length} messages have no English in plain/br-fr-en.json`);
  writeFileSync(join(out, "cdar-fr.json"), JSON.stringify(rules) + "\n");
  manifest.sets["cdar-fr"] = { source: `FNFE-MPE BR-FR-CDV (CDAR life-cycle statuses) ${cdarVersion}, github.com/fnfempe/France_RFE (Apache-2.0)`, commit, from: from.split("/").pop(), checks };
  console.log(`cdar-fr: ${checks} checks`);
}
{
  const from = "Flux10/Flux10.sch";
  const sch = readFileSync(join(root, from), "utf8");
  const f10Version = sch.match(/<title>[^<]*?v([\d.]+)\s*<\/title>/)?.[1] ?? "?";
  const rules = compileSchematron(join(root, from));
  // FNFE's Flux 10 asserts carry no @id; the PPF control code opens each message ("[G1.104] ...").
  // Use it as the id, so a skipped check is named by the code a platform's rejection would quote.
  for (const p of rules.patterns) for (const r of p.rules) for (const c of r.checks) {
    if (!c.id) c.id = c.text.match(/^\[([^\]]+)\]/)?.[1] ?? "";
    if (!c.id) throw new Error(`flux10: a check with no control code: ${c.text.slice(0, 80)}`);
  }
  const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  writeFileSync(join(out, "flux10-fr.json"), JSON.stringify(rules) + "\n");
  manifest.sets["flux10-fr"] = { source: `FNFE-MPE Flux 10 e-reporting (PPF Annexe 7 v${f10Version} controls), github.com/fnfempe/France_RFE (Apache-2.0)`, commit, from: from.split("/").pop(), checks };
  console.log(`flux10-fr: ${checks} checks`);
}
for (const [name, from, re] of [
  ["extended-ctc-fr-ubl", "UBL/EXTENDED-CTC-FR/schematron/EXTENDED-CTC-FR-UBL.sch", /EXTENDED-CTC-FR-UBL-V([\d.]+)/],
  ["extended-ctc-fr-cii", "CII/EXTENDED-CTC-FR/schematron/EXTENDED-CTC-FR-CII.sch", /EXTENDED-CTC-FR-CII-V([\d.]+)/],
  ["facturx-extended-cii", "Factur-X/EXTENDED/schematron/FACTUR-X_EXTENDED.sch", /Version: ([\d.]+)/],
]) {
  const v = readFileSync(join(root, from), "utf8").match(re)?.[1] ?? "?";
  const rules = compileSchematron(join(root, from));
  const inlined = inlineCodeDb(rules, join(root, dirname(from)));
  const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  if (inlined) console.log(`${name}: ${inlined} code-list lookups inlined`);
  writeFileSync(join(out, `${name}.json`), JSON.stringify(rules) + "\n");
  const what = name.startsWith("facturx") ? `Factur-X EXTENDED ${v} (FNFE-MPE)` : `FNFE-MPE EXTENDED-CTC-FR ${v}`;
  manifest.sets[name] = { source: `${what}, github.com/fnfempe/France_RFE (Apache-2.0)`, commit, from: from.split("/").pop(), checks };
  console.log(`${name}: ${checks} checks`);
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
