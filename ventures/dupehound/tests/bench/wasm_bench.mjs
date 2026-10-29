import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const { load } = await import(process.argv[2] + "/web/dupehound.mjs");
const dh = await load(readFileSync(process.argv[2] + "/web/dupehound.wasm"));
const dirs = readFileSync(process.argv[3], "utf8").trim().split("\n").map((d) => "ventures/" + d);
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); if (n === "node_modules") return []; return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = dirs.flatMap(walk).filter((p) => p.endsWith(".mjs")).map((p) => ({ path: p, text: readFileSync(p, "utf8") }))
  .filter((f) => Buffer.byteLength(f.text) <= 102400 && f.text.split("\n").length - (f.text.endsWith("\n") ? 1 : 0) <= 1000);
for (let i = 0; i < 3; i++) { const t = performance.now(); const r = dh.analyze(files); console.log(`wasm: ${files.length} files, ${r.statistics.clones} clones, ${r.statistics.duplicated_percent.toFixed(2)}%, ${(performance.now() - t).toFixed(0)} ms`); }
