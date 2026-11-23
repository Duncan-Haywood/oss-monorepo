// What nesting into an offcut first saves on the worked example: the job on
// new 2500 x 1250 sheets only, then with the example L-shaped offcut (1600 x
// 1000, a 700 x 450 corner and a 250 mm disc already cut out) listed first.
// Run: node eval/remnant-first.mjs  (writes nothing; prints a table)
import { runJob, exampleParts, exampleRemnantDxf, remnantsFromDxf } from "../job.mjs";

const rem = remnantsFromDxf(exampleRemnantDxf(), "offcut.dxf").remnants;
const rows = [];
for (const [label, opts] of [["new sheets only", { sheetW: 2500, sheetH: 1250 }], ["offcut first", { stock: [...rem, { w: 2500, h: 1250 }] }]]) {
  for (const search of [0, 60]) {
    const t = Date.now();
    const j = runJob(exampleParts(0.01), { ...opts, gap: 5, margin: 10, searchIters: search, timeLimitMs: 600000 });
    const fresh = j.report.sheets.filter((s) => s.stock === "2500 x 1250");
    const usedFresh = fresh.reduce((a, s) => a + s.usedLength * 1250, 0) / 1e6;
    rows.push({ label, search, sheets: j.report.sheets.map((s) => `${s.stock}: ${s.parts} parts, ${s.usedLength.toFixed(0)} mm used`).join("; "), freshM2: usedFresh.toFixed(3), check: j.check.ok, ms: Date.now() - t });
  }
}
console.log("| stock | search | sheets | new sheet used, m2 (used length x 1250) | check |");
console.log("|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.label} | ${r.search} | ${r.sheets} | ${r.freshM2} | ${r.check ? "pass" : "FAIL"} |`);
