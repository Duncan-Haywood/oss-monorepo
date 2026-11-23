// How much of each model's bill of quantities rests on a stored figure that
// disagrees with the geometry for no cause the tool names ("in doubt").
//   node eval/in-doubt.mjs a.ifc b.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff, boq, rowQuantities } from "../qto.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const out = [];
const f = (v, d = 3) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
console.log("model | BoQ volume m3 | volumes in doubt | their stored m3 | their geometry m3 | swing (% of BoQ volume) | BoQ area m2 | areas in doubt | stored m2 | geometry m2 | swing (% of BoQ area)");
for (const file of args) {
  const t = takeoff(parseStep(readFileSync(file)), { geometry: true });
  const lines = boq(t.rows, ["class", "type"]);
  const sum = (g) => lines.reduce((a, L) => a + g(L), 0);
  const V = sum((L) => L.volume), A = sum((L) => L.area);
  const dv = { n: sum((L) => L.volumeDoubt.count), s: sum((L) => L.volumeDoubt.stored), c: sum((L) => L.volumeDoubt.computed) };
  const da = { n: sum((L) => L.areaDoubt.count), s: sum((L) => L.areaDoubt.stored), c: sum((L) => L.areaDoubt.computed) };
  const items = t.rows.filter((r) => !r.isAssembly).map((r) => ({ r, q: rowQuantities(r) })).filter(({ q }) => q.volumeDoubt || q.areaDoubt)
    .map(({ r, q }) => ({ id: r.id, class: r.ifcClass, name: r.name, type: r.type, volume: q.volumeDoubt, area: q.areaDoubt }));
  const name = basename(file);
  out.push({ model: name, elements: t.rows.length, boqVolume: V, boqArea: A, volumeDoubt: dv, areaDoubt: da, items });
  const pct = (a, b) => (b ? f((100 * a) / b, 3) : "-");
  console.log([name, f(V), dv.n, f(dv.s), f(dv.c), pct(Math.abs(dv.s - dv.c), V), f(A, 2), da.n, f(da.s, 2), f(da.c, 2), pct(Math.abs(da.s - da.c), A)].join(" | "));
  for (const it of items) console.log(`    #${it.id} ${it.class} ${JSON.stringify(it.name ?? "")}${it.volume ? ` volume stored ${f(it.volume.stored, 4)} geometry ${f(it.volume.computed, 4)}` : ""}${it.area ? ` area stored ${f(it.area.stored, 3)} geometry ${f(it.area.computed, 3)}` : ""}`);
}
if (json) writeFileSync(json, JSON.stringify(out, null, 1));
