#!/usr/bin/env node
// Roofs as blockers in the envelope test (envelope.mjs): every wall read with
// and without sloped roofs blocking its rays, and the walls the roofs move.
//
//   node eval/roof-blockers.mjs model.ifc [more.ifc ...] [--json out.json] [--list N]

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const files = args.filter((a, i) => !a.startsWith("--") && !["--json", "--list"].includes(args[i - 1]));
const list = Number(opt("--list") ?? 40);
const isWall = (r) => /^IFCWALL/.test(r.effectiveClass || r.ifcType) && !r.isAssembly && r.envelope;
const out = [];
const T = { walls: 0, moved: 0, flagInterior: 0, flagExterior: 0, flagUnset: 0, ufBefore: {}, ufAfter: {} };
for (const f of files) {
  const t0 = Date.now();
  const model = parseStep(readFileSync(f));
  const before = takeoff(model, { roofBlockers: false });
  const after = takeoff(parseStep(readFileSync(f)), {});
  const b = new Map(before.rows.filter(isWall).map((r) => [r.id, r]));
  const walls = after.rows.filter(isWall);
  const m = { file: basename(f), walls: walls.length, moved: [], underRoof: walls.filter((w) => w.envelope.underRoof).length, aboveRoof: walls.filter((w) => w.envelope.aboveRoof).length };
  for (const w of walls) {
    const o = b.get(w.id);
    if (!o || o.envelope.exterior === w.envelope.exterior) continue;
    m.moved.push({ id: w.id, name: w.name, type: w.type, storey: w.storey, flag: w.isExternal, before: o.envelope.exterior, after: w.envelope.exterior, ufBefore: o.uniformat?.code ?? null, ufAfter: w.uniformat?.code ?? null, height: +(w.plan.z1 - w.plan.z0).toFixed(2), length: +(2 * w.plan.hl).toFixed(2) });
  }
  T.walls += m.walls; T.moved += m.moved.length;
  for (const x of m.moved) {
    if (x.flag === false) T.flagInterior++; else if (x.flag === true) T.flagExterior++; else T.flagUnset++;
    T.ufBefore[x.ufBefore] = (T.ufBefore[x.ufBefore] || 0) + 1; T.ufAfter[x.ufAfter] = (T.ufAfter[x.ufAfter] || 0) + 1;
  }
  out.push(m);
  console.log(`${m.file}: ${m.walls} walls read; the roofs move ${m.moved.length}; closed by a roof ${m.underRoof}, open only above the roof ${m.aboveRoof} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  for (const x of m.moved.slice(0, list)) console.log(`    #${x.id} ${x.before ? "exterior -> interior" : "interior -> exterior"}, flag ${x.flag == null ? "unset" : x.flag ? "exterior" : "interior"}, Uniformat ${x.ufBefore} -> ${x.ufAfter}: ${x.name ?? ""} | ${x.type ?? ""} | ${x.storey ?? ""} | ${x.length} m long, ${x.height} m high`);
}
console.log(`\n${files.length} models, ${T.walls} walls read: the roofs move ${T.moved} (flag interior ${T.flagInterior}, flag exterior ${T.flagExterior}, no flag ${T.flagUnset}); Uniformat before ${JSON.stringify(T.ufBefore)}, after ${JSON.stringify(T.ufAfter)}`);
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ totals: T, models: out }, null, 1));
