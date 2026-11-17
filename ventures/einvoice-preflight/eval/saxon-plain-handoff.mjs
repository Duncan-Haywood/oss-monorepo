// What the Saxon route said about files whose rule sets it does not have, before and after
// the 2026-11-14 hand-off. Needs `node build-schematron.mjs` (./schematron/) and
// `npm i --no-save saxon-js slimdom fontoxpath`.
//   node eval/saxon-plain-handoff.mjs [examples dir]
// For each example XML with a plain-only set (PINT, ZATCA, CIUS-RO, NLCIUS, CIUS-PT) it prints
// the findings the current EU base alone raises (what the Saxon route returned before) beside
// what the plain route, which runs the file's own sets, raises (what it returns now).
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILES, detectSyntax, parseSvrl, plainOnlySets } from "../schematron-core.mjs";
import { SEF_DIR } from "../schematron.mjs";
import { runPlain } from "../plain-node.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] || join(here, "..", "examples");
const SaxonJS = createRequire(import.meta.url)("saxon-js");
const euBase = (xml, syntax) => parseSvrl(SaxonJS.transform({ stylesheetFileName: join(SEF_DIR, FILES[syntax]), sourceText: xml, destination: "serialized" }, "sync").principalResult);
const fatal = (fs) => fs.filter((f) => f.severity === "fatal" || f.severity === "error");
const ids = (fs) => [...new Set(fs.map((f) => f.rule))].sort().join(" ") || "-";

let files = 0, oldFatal = 0, oldFiles = 0, newFatal = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith(".xml")).sort()) {
  const xml = readFileSync(join(dir, name), "utf8");
  const syntax = detectSyntax(xml);
  const sets = plainOnlySets(xml, syntax);
  if (!sets.length) continue;
  files++;
  const before = fatal(euBase(xml, syntax));
  const after = await runPlain(xml);
  const afterFatal = fatal(after.findings || []);
  oldFatal += before.length; newFatal += afterFatal.length; if (before.length) oldFiles++;
  console.log(`${name}\t${sets.join(",")}\tbefore (EU base): ${before.length} fatal [${ids(before)}]\tafter (${(after.sets || []).join("+") || after.status}): ${afterFatal.length} fatal [${ids(afterFatal)}]`);
}
console.log(`\n${files} plain-only example files; EU base alone: ${oldFatal} fatal findings on ${oldFiles} files; their own sets: ${newFatal} fatal findings.`);
