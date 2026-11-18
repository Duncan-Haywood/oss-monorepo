// Parses one model and prints its entity count; eval/min-heap.sh runs it under
// shrinking heaps (eval/entity-table-2026-11-18.md).
//   node eval/parse-only.mjs <checker dir> model.ifc
const [dir, model] = process.argv.slice(2);
const { readModel, parseModel } = await import(dir + "/node.mjs");
const { text } = await readModel(model);
console.log(parseModel(text).entities.size);
