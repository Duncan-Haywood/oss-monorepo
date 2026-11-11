// The whole preflight (built-in INV-0xx checks plus the official rule sets on the
// plain route, as the page runs them) over the good-case test files that phive-rules
// ships for the national profiles. Those files are the rule authors' own examples
// (OpenPeppol for PINT, SimplerInvoicing for NLCIUS, ANAF for CIUS-RO, AMA for
// CIUS-PT, ZATCA for KSA), listed in each module's CTestFiles.java as files that must
// validate. So a blocking finding on one is a false positive of ours, a rule-version
// gap, or a real fault in the example; each one is read before anything changes.
//
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/phax/phive-rules
//   cd phive-rules && git sparse-checkout set --no-cone 'phive-rules-peppol-pint/src/test/**' \
//     'phive-rules-cius-ro/src/test/**' 'phive-rules-cius-pt/src/test/**' \
//     'phive-rules-zatca/src/test/**' 'phive-rules-simplerinvoicing/src/test/**'
//   node eval/phive-corpus.mjs <phive-rules checkout> [--set pint-aunz/1.1.3] [--files] [--json] [--good]
//
// --good scores only the files each module's CTestFiles.java lists as good cases
// (getAllMatchingTestFiles / getAllMatchingGoodTestFiles; commented-out entries and
// SimplerInvoicing's error list are left out). The NLCIUS, CIUS-RO, CIUS-PT and ZATCA
// folders mix good and deliberately broken files, so only this mode scores them.
//
// The run of 2026-11-11 read phive-rules commit 36d1f09. The examples are not copied
// here (each keeps its publisher's licence).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { preflightDocuments, isBlocking } from "../report.mjs";

const root = process.argv[2];
if (!root || !existsSync(root)) { console.error("usage: node eval/phive-corpus.mjs <phive-rules checkout> [--set name] [--files] [--json]"); process.exit(2); }
const arg = (k) => { const i = process.argv.indexOf(k); return i === -1 ? null : process.argv[i + 1]; };
const flag = (k) => process.argv.includes(k);

// The newest example release per profile, and the rule-set family that should govern it.
export const SETS = {
  "pint-aunz/1.1.3": "phive-rules-peppol-pint/src/test/resources/external/test-files/pint-aunz/1.1.3",
  "pint-sg/1.4.1": "phive-rules-peppol-pint/src/test/resources/external/test-files/pint-sg/1.4.1",
  "nlcius/SI-UBL-2.0.3.2": "phive-rules-simplerinvoicing/src/test/resources/external/test-files/simplerinvoicing/SI-UBL-2.0.3.2",
  "nlcius-cii/1.0.3": "phive-rules-simplerinvoicing/src/test/resources/external/test-files/simplerinvoicing/NLCIUS-CII-1.0.3",
  "cius-ro/1.0.9": "phive-rules-cius-ro/src/test/resources/external/test-files/1.0.9",
  "cius-pt/2.1.1": "phive-rules-cius-pt/src/test/resources/external/test-files/2.1.1",
  "zatca/3.4.6": "phive-rules-zatca/src/test/resources/external/test-files/3.4.6",
};

// The module that owns each set's examples, for its CTestFiles.java good list.
export const MODULES = {
  "pint-aunz/1.1.3": "phive-rules-peppol-pint",
  "pint-sg/1.4.1": "phive-rules-peppol-pint",
  "nlcius/SI-UBL-2.0.3.2": "phive-rules-simplerinvoicing",
  "nlcius-cii/1.0.3": "phive-rules-simplerinvoicing",
  "cius-ro/1.0.9": "phive-rules-cius-ro",
  "cius-pt/2.1.1": "phive-rules-cius-pt",
  "zatca/3.4.6": "phive-rules-zatca",
};

// The good-case file names in a CTestFiles.java source: every ".xml" string literal
// outside comments and before an error-file list (SimplerInvoicing's
// getAllMatchingErrorTestFiles). Paths are as written, relative to the version folder.
export function goodListFromJava(src) {
  let text = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const cut = text.search(/getAllMatchingErrorTestFiles\s*\(\s*@NonNull/);
  if (cut !== -1) text = text.slice(0, cut);
  const out = new Set();
  for (const m of text.matchAll(/"([^"\n]+\.xml)"/g)) out.add(m[1]);
  return out;
}

function findJava(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { const hit = findJava(path); if (hit) return hit; }
    else if (name === "CTestFiles.java") return path;
  }
  return null;
}

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (name.toLowerCase().endsWith(".xml")) yield path;
  }
}

export async function runSet(dir, good = null) {
  const out = { files: 0, clean: 0, unread: 0, rules: {}, perFile: [] };
  for (const path of walk(dir)) {
    // A module writes its list relative to the version folder (CIUS-RO, ZATCA) or to a
    // subfolder passed separately (PINT's "billing/"), so a bare file name also matches.
    if (good && !good.has(path.slice(dir.length + 1)) && !good.has(path.split("/").pop())) continue;
    const source = readFileSync(path, "utf8");
    const { reports, readErrors } = await preflightDocuments([{ name: path.split("/").pop(), source }], { schematron: true, maxBytes: 5_000_000 });
    out.files++;
    if (readErrors.length) { out.unread++; out.perFile.push({ file: path.slice(dir.length + 1), unread: readErrors[0].error }); continue; }
    const r = reports[0];
    const blocking = r.errors.filter(isBlocking);
    const ids = [...new Set(blocking.map((e) => e.rule))].sort();
    if (!ids.length) out.clean++;
    for (const id of ids) out.rules[id] = (out.rules[id] || 0) + 1;
    out.perFile.push({ file: path.slice(dir.length + 1), schematron: r.schematron, envelope: r.envelope, blocking: ids, messages: Object.fromEntries(blocking.map((e) => [e.rule, e.message])) });
  }
  return out;
}

const only = arg("--set");
const results = {};
for (const [name, rel] of Object.entries(SETS)) {
  if (only && name !== only) continue;
  const dir = join(root, rel);
  if (!existsSync(dir)) { console.log(`${name}: not in this checkout (${rel})`); continue; }
  let good = null;
  if (flag("--good")) {
    const java = existsSync(join(root, MODULES[name], "src/test")) ? findJava(join(root, MODULES[name], "src/test")) : null;
    if (!java) { console.log(`${name}: no CTestFiles.java in ${MODULES[name]}`); continue; }
    good = goodListFromJava(readFileSync(java, "utf8"));
  }
  const r = await runSet(dir, good);
  results[name] = r;
  if (flag("--json")) continue;
  console.log(`\n${name}: ${r.files} files, ${r.clean} with no blocking finding, ${r.unread} unreadable`);
  for (const [id, n] of Object.entries(r.rules).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${id}`);
  if (flag("--files")) for (const f of r.perFile) if (f.unread || f.blocking.length) console.log(`    ${f.file}: ${f.unread ? "UNREAD " + f.unread : f.blocking.join(" ")}`);
}
if (flag("--json")) console.log(JSON.stringify(results, null, 1));
