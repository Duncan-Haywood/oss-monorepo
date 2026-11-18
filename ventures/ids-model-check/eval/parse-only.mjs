// Parses one model and prints its entity count; eval/min-heap.sh runs it under
// shrinking heaps (eval/entity-table-2026-11-18.md).
//   node eval/parse-only.mjs <checker dir> model.ifc
const [dir, model] = process.argv.slice(2);
const { readModel, parseModel } = await import(dir + "/node.mjs");
// The file's bytes where the checker gives them (eval/step-bytes-2026-11-18.md), else its text.
const read = await readModel(model);
const text = read.bytes ?? read.text;
console.log(parseModel(text).entities.size);
