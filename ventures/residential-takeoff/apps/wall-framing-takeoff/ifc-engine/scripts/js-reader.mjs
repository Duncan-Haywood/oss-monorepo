// The JavaScript reader (../../ifc.mjs) on the same file, for the comparison in README.md.
// usage: node scripts/js-reader.mjs model.ifc [storey]
import { readFileSync } from "node:fs";
import { planFromIfc } from "../../ifc.mjs";
const f = process.argv[2]; const t0 = performance.now();
const txt = readFileSync(f, "utf8");
const r = planFromIfc(txt, { storey: process.argv[3] ? Number(process.argv[3]) : undefined });
const ms = performance.now() - t0;
console.log(JSON.stringify({ ok: r.ok, errors: r.errors, notes: r.notes?.slice(0, 12), stats: r.stats, walls: r.plan?.walls?.length, ms: Math.round(ms), rssMB: Math.round(process.memoryUsage().rss / 1e6) }, null, 1).slice(0, 3000));
