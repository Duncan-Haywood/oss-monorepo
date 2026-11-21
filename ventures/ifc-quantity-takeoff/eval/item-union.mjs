// Which computed volumes the union of a body's items changes, model by model.
//
//   node eval/item-union.mjs <before-dir> <model.ifc>... [--json out.json]
//
// <before-dir> is a copy of this venture from before the change (e.g.
// `git worktree add /tmp/before <commit>` then its ventures/ifc-quantity-takeoff).
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { resolve } from "node:path";
const argv = process.argv.slice(2);
const ji = argv.indexOf("--json");
const jsonOut = ji >= 0 ? argv.splice(ji, 2)[1] : null;
const [beforeDir, ...files] = argv;
const A = await import(resolve(beforeDir, "qto.mjs")), B = await import("../qto.mjs");
const SA = await import(resolve(beforeDir, "step.mjs")), SB = await import("../step.mjs");
const out = [];
for (const f of files) {
  const buf = readFileSync(f);
  const ra = A.takeoff(SA.parseStep(buf)), rb = B.takeoff(SB.parseStep(buf));
  const byId = new Map(ra.rows.map((r) => [r.id, r]));
  const m = { model: basename(f), elements: 0, changed: 0, before: 0, after: 0, byClass: {}, unjoined: 0, list: [] };
  for (const r of rb.rows) {
    if (r.isAssembly) continue;
    const a = byId.get(r.id); if (!a || a.computed?.status !== "ok" || r.computed?.status !== "ok") continue;
    m.elements++;
    if ((r.computed.notes || []).some((n) => /too detailed to join/.test(n))) m.unjoined++;
    const g0 = a.computed.gross, g1 = r.computed.gross;
    if (Math.abs(g1 - g0) > 1e-9 * Math.max(1, Math.abs(g0)) && Math.abs(g1 - g0) > 1e-7) {
      m.changed++; m.before += g0; m.after += g1;
      const c = m.byClass[r.ifcClass] ??= { n: 0, before: 0, after: 0 }; c.n++; c.before += g0; c.after += g1;
      m.list.push({ id: r.id, cls: r.ifcClass, name: r.name, before: +g0.toPrecision(6), after: +g1.toPrecision(6) });
    }
  }
  out.push(m);
  console.log(`${m.model}: ${m.changed} of ${m.elements} volumes changed, ${m.before.toFixed(3)} -> ${m.after.toFixed(3)} m3; too detailed to join: ${m.unjoined}`);
  for (const [k, c] of Object.entries(m.byClass).sort((x, y) => y[1].n - x[1].n)) console.log(`   ${k}: ${c.n}, ${c.before.toFixed(3)} -> ${c.after.toFixed(3)} m3 (${((c.after / c.before - 1) * 100).toFixed(1)}%)`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
