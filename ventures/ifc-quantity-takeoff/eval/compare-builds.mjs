#!/usr/bin/env node
// What a change to the engine moves, model by model: runs the takeoff from
// this folder and from a baseline copy of the venture (e.g. main's files in a
// scratch folder) on the same models and counts, element by element, what
// differs: boxes, plan rectangles, the envelope test's verdict, its agreement
// with the author's IsExternal flag, Uniformat codes, volumes and areas.
//
//   node eval/compare-builds.mjs <baseline-dir> model.ifc [more.ifc ...]
//
// A baseline: mkdir base && cp *.mjs base/ && git show origin/main:ventures/ifc-quantity-takeoff/geom.mjs > base/geom.mjs

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [baseDir, ...files] = process.argv.slice(2);
if (!baseDir || !files.length) { console.error("usage: node eval/compare-builds.mjs <baseline-dir> model.ifc [...]"); process.exit(2); }
const load = async (dir) => ({ step: await import(pathToFileURL(resolve(dir, "step.mjs"))), qto: await import(pathToFileURL(resolve(dir, "qto.mjs"))) });
const N = await load(new URL("..", import.meta.url).pathname), B = await load(baseDir);

const agree = (rows) => {
  let n = 0, a = 0;
  for (const r of rows) if (r.envelope && r.isExternal != null && /^IFCWALL/.test(r.effectiveClass || "")) { n++; if (r.envelope.exterior === r.isExternal) a++; }
  return `${a}/${n}`;
};
for (const f of files) {
  const t0 = Date.now();
  const rn = N.qto.takeoff(N.step.parseStep(readFileSync(f))).rows.filter((r) => !r.isAssembly);
  const rb = B.qto.takeoff(B.step.parseStep(readFileSync(f))).rows.filter((r) => !r.isAssembly);
  const byId = new Map(rb.map((r) => [r.id, r]));
  const c = { boxB: 0, boxN: 0, planB: 0, planN: 0, envelope: 0, uniformat: 0, volume: 0, area: 0 };
  const codes = {};
  for (const r of rn) {
    const b = byId.get(r.id);
    if (!b) continue;
    if (b.box) c.boxB++; if (r.box) c.boxN++; if (b.plan) c.planB++; if (r.plan) c.planN++;
    if ((b.envelope?.exterior ?? null) !== (r.envelope?.exterior ?? null)) c.envelope++;
    const ub = b.uniformat?.code ?? null, un = r.uniformat?.code ?? null;
    if (ub !== un) { c.uniformat++; const k = `${r.ifcClass} ${ub} -> ${un}`; codes[k] = (codes[k] || 0) + 1; }
    if (N.qto.rowQuantities(r).volume !== B.qto.rowQuantities(b).volume) c.volume++;
    if (N.qto.rowQuantities(r).area !== B.qto.rowQuantities(b).area) c.area++;
  }
  console.log(`${basename(f)}: ${rn.length} elements; box ${c.boxB} -> ${c.boxN}; plan ${c.planB} -> ${c.planN}; envelope verdict changed ${c.envelope}; walls whose verdict agrees with their flag ${agree(rb)} -> ${agree(rn)}; Uniformat code changed ${c.uniformat}; volume changed ${c.volume}; area changed ${c.area} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (c.uniformat) console.log(`    ${JSON.stringify(codes)}`);
}
