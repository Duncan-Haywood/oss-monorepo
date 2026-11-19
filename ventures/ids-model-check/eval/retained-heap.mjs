// Heap kept after parsing a model (the text itself excluded), and parse time.
//   node --expose-gc eval/retained-heap.mjs <checker dir> model.ifc
// (eval/entity-table-2026-11-18.md)
const [dir, model] = process.argv.slice(2);
const { readModel, parseModel } = await import(dir + "/node.mjs");
// The file's bytes where the checker gives them (eval/step-bytes-2026-11-18.md), else its text.
const read = await readModel(model);
const text = read.bytes ?? read.text;
gc(); const base = process.memoryUsage().heapUsed;
const t0 = performance.now();
const m = parseModel(text);
const t1 = performance.now();
gc(); gc();
console.log(JSON.stringify({ entities: m.entities.size, parseS: +((t1 - t0) / 1000).toFixed(1), retainedMB: Math.round((process.memoryUsage().heapUsed - base) / 1e6) }));
globalThis.keep = m;
