// Peak memory and a hash of every report, for one checker directory (this one or
// a copy of main) on one model against many IDS files; eval/heap-200mb-2026-11-17.md.
//   node eval/heap-compare.mjs "$PWD" model.ifc samples/*.ids.xml

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const [dir, model, ...ids] = process.argv.slice(2);
const { readModel, parseModel, check } = await import(dir + "/node.mjs");
let peak = 0; const tick = () => { peak = Math.max(peak, process.memoryUsage().heapUsed); };
const iv = setInterval(tick, 20);
const t0 = performance.now();
// The file's bytes where the checker gives them (eval/step-bytes-2026-11-18.md), else its text.
const read = await readModel(model);
const text = read.bytes ?? read.text;
const m = parseModel(text); tick();
const h = createHash("sha256");
let errs = 0;
for (const f of ids) { let r; try { r = check(readFileSync(f, "utf8"), m, { maxFailed: 1000 }); delete r.seconds; } catch (e) { errs++; r = { error: e.message }; } tick(); h.update(JSON.stringify(r)); }
clearInterval(iv);
console.log(JSON.stringify({ seconds: ((performance.now() - t0) / 1000).toFixed(1), heapAtChecksMB: Math.round(peak / 1e6), maxRSSMB: Math.round(process.resourceUsage().maxRSS / 1e3), idsErrors: errs, hash: h.digest("hex").slice(0, 16) }));
