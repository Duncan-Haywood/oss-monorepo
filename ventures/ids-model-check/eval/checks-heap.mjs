// Heap kept after parsing and after checking a model against IDS files, each
// after a forced collection, with the check time; the model's text included.
//   node --expose-gc eval/checks-heap.mjs <checker dir> model.ifc a.ids b.ids ...
// (eval/pset-records-2026-11-18.md)
import { readFileSync } from "node:fs";
const [dir, model, ...ids] = process.argv.slice(2);
const { readModel, parseModel, check } = await import(dir + "/node.mjs");
const mb = () => { gc(); gc(); return Math.round(process.memoryUsage().heapUsed / 1e6); };
const m = parseModel((await readModel(model)).text);
const parsed = mb();
const t0 = performance.now();
for (const f of ids) { try { check(readFileSync(f, "utf8"), m, { maxFailed: 1000 }); } catch {} }
const s = (performance.now() - t0) / 1000;
console.log(JSON.stringify({ afterParseMB: parsed, afterChecksMB: mb(), checkS: +s.toFixed(1) }));
globalThis.keep = m;
