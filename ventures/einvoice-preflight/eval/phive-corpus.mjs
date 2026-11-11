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
//   node eval/phive-corpus.mjs <phive-rules checkout> [--set pint-aunz/1.1.3] [--files] [--json]
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

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (name.toLowerCase().endsWith(".xml")) yield path;
  }
}

export async function runSet(dir) {
  const out = { files: 0, clean: 0, unread: 0, rules: {}, perFile: [] };
  for (const path of walk(dir)) {
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
  const r = await runSet(dir);
  results[name] = r;
  if (flag("--json")) continue;
  console.log(`\n${name}: ${r.files} files, ${r.clean} with no blocking finding, ${r.unread} unreadable`);
  for (const [id, n] of Object.entries(r.rules).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${id}`);
  if (flag("--files")) for (const f of r.perFile) if (f.unread || f.blocking.length) console.log(`    ${f.file}: ${f.unread ? "UNREAD " + f.unread : f.blocking.join(" ")}`);
}
if (flag("--json")) console.log(JSON.stringify(results, null, 1));
