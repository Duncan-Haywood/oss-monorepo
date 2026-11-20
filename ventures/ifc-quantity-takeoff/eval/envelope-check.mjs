#!/usr/bin/env node
// The envelope test from geometry (envelope.mjs) against the IsExternal flag
// authors set on walls, and what it says of walls with no flag.
//
//   node eval/envelope-check.mjs model.ifc [more.ifc ...] [--json out.json] [--svg dir] [--list N]
//
// --svg writes one plan per storey: walls the test reads as exterior in red
// (pink when only as an inner leaf or lining), interior in blue, other
// blockers in grey, and walls whose author's flag disagrees outlined green.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { isBlocker } from "../envelope.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const files = args.filter((a, i) => !a.startsWith("--") && !["--json", "--svg", "--list"].includes(args[i - 1]));
const list = Number(opt("--list") ?? 8);
// a third witness where flag and geometry disagree: the wall type's own name,
// when it says exterior or interior (English, German, Norwegian words seen in
// these models; most names say neither)
const NAME_EXT = /exterior|\bext\.|\byttervegg|\bYV\b|\bbuitenblad|\bau(ss|ß)enwand/i;
const NAME_INT = /interior|partition|furring|\binnervegg|\bIVA\b|trennwand|\bGK\b|\binnenwand|\bbinnenwand|\bseparatiewand/i;
const nameSays = (w) => { const n = `${w.type ?? ""} ${w.name ?? ""}`; return NAME_EXT.test(n) ? true : NAME_INT.test(n) ? false : null; };
const out = [], T = { tt: 0, tf: 0, ft: 0, ff: 0, ftLeaf: 0, ttLeaf: 0, nameGeometry: 0, nameFlag: 0, nameLining: 0, nameSilent: 0, unsetExt: 0, unsetInt: 0, noPlan: 0, walls: 0 };
for (const f of files) {
  const t0 = Date.now();
  const res = takeoff(parseStep(readFileSync(f)), {});
  const walls = res.rows.filter((r) => /^IFCWALL/.test(r.effectiveClass || r.ifcType) && !r.isAssembly);
  const m = { file: basename(f), schema: res.schema, walls: walls.length, tt: 0, tf: 0, ft: 0, ff: 0, unsetExt: 0, unsetInt: 0, noPlan: 0, flaggedTrue: 0, disagree: [] };
  for (const w of walls) {
    if (w.isExternal === true) m.flaggedTrue++;
    if (!w.envelope) { m.noPlan++; continue; }
    const g = w.envelope.exterior;
    if (w.isExternal == null) { g ? m.unsetExt++ : m.unsetInt++; continue; }
    const k = (w.isExternal ? "t" : "f") + (g ? "t" : "f");
    m[k]++;
    if (k === "ft" && w.envelope.leaf) m.ftLeaf = (m.ftLeaf || 0) + 1;
    if (k === "tt" && w.envelope.leaf) m.ttLeaf = (m.ttLeaf || 0) + 1;
    if (k === "tf" || k === "ft") {
      const n = nameSays(w);
      const by = n == null ? "nameSilent" : w.envelope.leaf && n === false ? "nameLining" : n === w.envelope.exterior ? "nameGeometry" : "nameFlag";
      m[by] = (m[by] || 0) + 1;
    }
    if (k === "tf" || k === "ft") m.disagree.push({ id: w.id, name: w.name, type: w.type, storey: w.storey, flag: w.isExternal, open: w.envelope.open, leaf: w.envelope.leaf, length: +(2 * w.plan.hl).toFixed(2), thick: +(2 * w.plan.ht).toFixed(3) });
  }
  for (const k of Object.keys(T)) T[k] += m[k] || 0;
  out.push(m);
  const set = m.tt + m.tf + m.ft + m.ff;
  m.flagSetAside = walls.some((w) => w.envelope?.flagSaysNothing);
  console.log(`${m.file} (${m.schema}): ${m.walls} walls, ${m.flaggedTrue} flagged exterior; no plan ${m.noPlan};${m.flagSetAside ? " flag set aside (the same on every wall);" : ""} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (set) console.log(`  flag set on ${set}: exterior/exterior ${m.tt}, exterior flag read interior ${m.tf}, interior flag read exterior ${m.ft} (${m.ftLeaf || 0} of them as an inner leaf or lining), interior/interior ${m.ff}; agree ${m.tt + m.ff} of ${set}`);
  if (m.tf + m.ft) console.log(`  where they disagree, the type name sides with the geometry ${m.nameGeometry || 0}, with the flag ${m.nameFlag || 0}, names a lining ${m.nameLining || 0}, says neither ${m.nameSilent || 0}`);
  if (m.unsetExt + m.unsetInt) console.log(`  no flag on ${m.unsetExt + m.unsetInt}: read exterior ${m.unsetExt}, interior ${m.unsetInt}`);
  for (const d of m.disagree.slice(0, list)) console.log(`    #${d.id} ${d.flag ? "flag exterior" : "flag interior"}, open at ${d.open} of 9${d.leaf ? " as a leaf" : ""}: ${d.name ?? ""} | ${d.type ?? ""} | ${d.storey ?? ""} | ${d.length} m x ${d.thick} m`);
  if (opt("--svg")) svg(res.rows, walls, join(opt("--svg"), m.file.replace(/\.ifc$/i, "")));
}
const set = T.tt + T.tf + T.ft + T.ff;
console.log(`TOTAL ${files.length} models, ${T.walls} walls: flag set and read ${set}, agree ${T.tt + T.ff} (exterior ${T.tt} of ${T.tt + T.tf}, interior ${T.ff} of ${T.ff + T.ft}; ${T.ftLeaf} of the ${T.ft} interior-flagged walls read exterior are inner leaves or linings); no flag ${T.unsetExt + T.unsetInt} (exterior ${T.unsetExt}, interior ${T.unsetInt}); no plan ${T.noPlan}`);
console.log(`  where flag and geometry disagree (${T.tf + T.ft}), the type name sides with the geometry ${T.nameGeometry}, with the flag ${T.nameFlag}, names a lining read with its exterior wall ${T.nameLining}, says neither ${T.nameSilent}`);
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ total: T, models: out }, null, 1));

function svg(rows, walls, stem) {
  mkdirSync(opt("--svg"), { recursive: true });
  const bands = new Map();
  for (const w of walls) if (w.plan) { const k = w.storey ?? "?"; if (!bands.has(k)) bands.set(k, []); bands.get(k).push(w); }
  let i = 0;
  for (const [st, ws] of bands) {
    const xs = ws.flatMap((w) => corners(w.plan).map((c) => c[0])), ys = ws.flatMap((w) => corners(w.plan).map((c) => c[1]));
    const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
    const zs = ws.map((w) => w.plan.z0), zlo = Math.min(...zs), zhi = Math.max(...ws.map((w) => w.plan.z1));
    const others = rows.filter((r) => r.plan && !/^IFCWALL/.test(r.effectiveClass || r.ifcType) && isBlocker(r) && r.plan.z1 > zlo && r.plan.z0 < zhi);
    const poly = (p, attrs) => `<polygon points="${corners(p).map((c) => `${c[0].toFixed(3)},${(-c[1]).toFixed(3)}`).join(" ")}" ${attrs}/>`;
    const polys = others.map((r) => poly(r.plan, `fill="#bbb"`)).concat(ws.map((w) => {
      const e = w.envelope, bad = e && w.isExternal != null && w.isExternal !== e.exterior;
      const col = !e ? "#999" : e.exterior ? (e.leaf ? "#e9a" : "#d33") : "#36c";
      return poly(w.plan, `fill="${col}" stroke="${bad ? "#0a0" : "none"}" stroke-width="${bad ? 0.08 : 0}" stroke-dasharray="0.3 0.2"`);
    })).join("\n");
    writeFileSync(`${stem}-${i++}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${-y1} ${x1 - x0} ${y1 - y0}" width="900"><rect x="${x0}" y="${-y1}" width="${x1 - x0}" height="${y1 - y0}" fill="#fff"/><title>${st}</title>\n${polys}\n</svg>\n`);
  }
}
function corners(p) {
  const n = [-p.u[1], p.u[0]], h = Math.max(p.ht, 0.05);
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [p.c[0] + p.u[0] * a * p.hl + n[0] * b * h, p.c[1] + p.u[1] * a * p.hl + n[1] * b * h]);
}
