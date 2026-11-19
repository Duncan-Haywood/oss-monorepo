// Parses a model once and checks it against IDS files, nothing kept or hashed:
// the script eval/min-heap.sh bisects for the smallest heap a run needs
// (eval/shared-values-2026-11-18.md).
//   sh eval/min-heap.sh "$PWD" model.ifc 32 320 1024 eval/checks-only.mjs samples/*.ids.xml
import { readFileSync } from "node:fs";
const [dir, model, ...ids] = process.argv.slice(2);
const { readModel, parseModel, check } = await import(dir + "/node.mjs");
const m = parseModel((await readModel(model)).text);
for (const f of ids) { try { check(readFileSync(f, "utf8"), m, { maxFailed: 1000 }); } catch (e) { if (/heap|memory/i.test(e.message)) throw e; } }
console.log("ok");
