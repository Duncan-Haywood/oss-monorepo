// Time and retained heap per IDS file, one model parsed once
// (eval/no-entity-facet-2026-11-17.md). Run with --expose-gc:
//   node --expose-gc eval/heap-per-ids.mjs "$PWD" model.ifc samples/*.ids.xml eval/corpus/real/*
import { readFileSync } from "node:fs";
const [dir, model, ...ids] = process.argv.slice(2);
const { readModel, parseModel, check } = await import(dir + "/node.mjs");
if (typeof gc !== "function") throw new Error("run with node --expose-gc");
const m = parseModel((await readModel(model)).text);
gc();
const mb = () => Math.round(process.memoryUsage().heapUsed / 1e6);
let base = mb();
console.log(`model parsed: ${base} MB heap`);
for (const f of ids) {
  const t = performance.now();
  let err = "";
  try { check(readFileSync(f, "utf8"), m, { maxFailed: 1000 }); } catch (e) { err = " (" + e.message.slice(0, 60) + ")"; }
  const s = ((performance.now() - t) / 1000).toFixed(1);
  gc();
  const after = mb();
  console.log(`${s.padStart(6)} s  retained ${String(after - base).padStart(4)} MB  ${f.split("/").pop()}${err}`);
  base = after;
}
