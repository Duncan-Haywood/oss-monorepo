// Writes the requirements document's sentences for every IDS file in the
// given folders, one JSON line per file, for eval/spec_doc_ifctester.py to
// compare with IfcTester's own reading of each facet.
//
//   sh eval/fetch-audit-corpus.sh
//   node eval/spec-doc.mjs eval/corpus/real eval/corpus/IDS-Audit-tool/testing.shared > /tmp/doc.jsonl
//   python3 eval/spec_doc_ifctester.py /tmp/doc.jsonl
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { docFromIds, sentenceText, classNamesFrom } from "../spec-doc.mjs";

const here = new URL("..", import.meta.url);
const classNames = classNamesFrom(["ifc2x3", "ifc4", "ifc4x3"].map((v) => JSON.parse(readFileSync(new URL(`schema/${v}.json`, here), "utf8"))));
const files = [];
const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.ids$/i.test(n)) files.push(p); } };
for (const d of process.argv.slice(2)) walk(d);
for (const file of files) {
  let doc;
  try { doc = docFromIds(readFileSync(file, "utf8"), { classNames }); } catch (e) { console.log(JSON.stringify({ file, error: e.message })); continue; }
  console.log(JSON.stringify({ file, specs: doc.specs.map((s) => ({
    name: s.name, optionality: s.optionality,
    applies: sentenceText(s.applies),
    applicability: s.applicability.map((a) => ({ kind: a.kind, text: sentenceText(a.sentence) })),
    requirements: s.requirements.map((r) => ({ kind: r.kind, cardinality: r.cardinality, text: sentenceText(r.sentence) })),
  })) }));
}
