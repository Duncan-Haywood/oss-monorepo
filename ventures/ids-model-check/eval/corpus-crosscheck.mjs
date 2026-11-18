#!/usr/bin/env node
// Runs every IDS file in IDS_DIR against every model in MODEL_DIR with this
// checker, parsing each model once, and writes each specification's verdict,
// applicable count and full set of failing element ids as JSON lines, for
// eval/corpus_crosscheck_compare.py to set beside IfcTester's
// (eval/corpus_crosscheck_ifctester.py).
//
//   node --max-old-space-size=8192 eval/corpus-crosscheck.mjs MODEL_DIR IDS_DIR OUT.jsonl
import { readdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, readModel, parseModel, parseIds } from "../node.mjs";

const [modelDir, idsDir, out] = process.argv.slice(2);
if (!out) { console.error("usage: node eval/corpus-crosscheck.mjs MODEL_DIR IDS_DIR OUT.jsonl"); process.exit(2); }
const models = readdirSync(modelDir).filter((f) => /\.ifc$/i.test(f)).sort();
const idsFiles = readdirSync(idsDir).filter((f) => /\.ids$/i.test(f)).sort();
writeFileSync(out, "");
for (const m of models) {
  const t0 = Date.now();
  const parsed = parseModel((await readModel(join(modelDir, m))).text);
  console.error(`${m}: parsed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const f of idsFiles) {
    const t1 = Date.now();
    let row;
    try {
      const rep = check(parseIds(readFileSync(join(idsDir, f), "utf8")), parsed, { maxFailed: Infinity });
      row = { model: m, ids: f, specs: rep.specs.map((s) => ({ name: s.name, pass: s.status === "pass", applicable: s.applicable, failed: s.failed.map((x) => x.id).sort((a, b) => a - b), status: s.status, skipped: s.skippedSubclasses || null, matching: s.matching ?? null })) };
    } catch (e) { row = { model: m, ids: f, error: String(e.message || e) }; }
    row.seconds = (Date.now() - t1) / 1000;
    appendFileSync(out, JSON.stringify(row) + "\n");
  }
}
