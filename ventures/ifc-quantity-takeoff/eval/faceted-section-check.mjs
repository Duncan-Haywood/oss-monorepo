// Checks the faceted-body sections (geom.mjs, shellSection) against an
// independent estimate: points sampled on a grid over the cut plane, each
// counted inside the body when a ray from it crosses the body's faces an odd
// number of times (point-in-polygon on each face, holes included).
//
//   node eval/faceted-section-check.mjs model.ifc [more.ifc ...] [--per-file N] [--grid G]
//
// For up to N faceted elements per file (default 40, spread evenly over the
// file) and each area the page cuts (wall side and footprint, slab plan),
// prints the section's area and the sampled one, and the worst relative gap.
// The sampled estimate has a grid error of a few cells' worth of perimeter,
// so it is compared within max(2%, 4 x perimeter cell error).

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { sectionArea, solidExtent } from "../geom.mjs";

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : d; };
const perFile = opt("--per-file", 40), G = opt("--grid", 240);
const files = args.filter((a, i) => !a.startsWith("--") && !["--per-file", "--grid"].includes(args[i - 1]));

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

function prepFaces(shells) {
  const out = [];
  for (const sh of shells) for (const f of sh.faces) {
    const l0 = f[0];
    let n = [0, 0, 0];
    for (let i = 0; i < l0.length; i++) { const a = l0[i], b = l0[(i + 1) % l0.length]; n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])]; }
    if (!(Math.hypot(...n) > 0)) continue;
    n = unit(n);
    const u = unit(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0]));
    const v = cross(n, u);
    const loops = f.map((l) => l.map((p) => [dot(p, u), dot(p, v)]));
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of l0) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
    out.push({ n, d: dot(n, l0[0]), u, v, loops, lo, hi, s: sh.s });
  }
  return out;
}

function inPoly(loops, x, y) {
  let c = false;
  for (const l of loops) for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
    const [xi, yi] = l[i], [xj, yj] = l[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ray from p along dir; counts face crossings (parity), per shell sign
function inside(faces, p, dir) {
  let w = 0;
  const bySign = new Map();
  for (const F of faces) {
    const den = dot(F.n, dir);
    if (Math.abs(den) < 1e-12) continue;
    const t = (F.d - dot(F.n, p)) / den;
    if (t <= 0) continue;
    const q = [p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t];
    let ok = true;
    for (let i = 0; i < 3; i++) { const e = 1e-7 * (Math.abs(F.lo[i]) + Math.abs(F.hi[i]) + 1); if (q[i] < F.lo[i] - e || q[i] > F.hi[i] + e) { ok = false; break; } }
    if (!ok) continue;
    if (inPoly(F.loops, dot(q, F.u), dot(q, F.v))) bySign.set(F.s, (bySign.get(F.s) || 0) + 1);
  }
  for (const [s, c] of bySign) if (c % 2) w += s;
  return w;
}

function sampled(body, n, k) {
  const nn = unit(n);
  const u = unit(Math.abs(nn[0]) < 0.9 ? cross(nn, [1, 0, 0]) : cross(nn, [0, 1, 0]));
  const v = cross(nn, u);
  const [ulo, uhi] = solidExtent(body, u), [vlo, vhi] = solidExtent(body, v);
  const du = (uhi - ulo) / G, dv = (vhi - vlo) / G;
  const faces = prepFaces(body.shells);
  // an irrational-ish in-plane direction, so the ray avoids edges and vertices
  const dir = unit([u[0] * 0.8017 + v[0] * 0.5977 + nn[0] * 1e-3, u[1] * 0.8017 + v[1] * 0.5977 + nn[1] * 1e-3, u[2] * 0.8017 + v[2] * 0.5977 + nn[2] * 1e-3]);
  let cnt = 0;
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const a = ulo + (i + 0.5) * du, b = vlo + (j + 0.5) * dv;
    const p = [nn[0] * k + u[0] * a + v[0] * b, nn[1] * k + u[1] * a + v[1] * b, nn[2] * k + u[2] * a + v[2] * b];
    cnt += inside(faces, p, dir);
  }
  return { area: Math.abs(cnt) * du * dv, cell: Math.max(du, dv) };
}

let worst = { rel: 0 }, checked = 0, outside = 0;
const gaps = [];
for (const file of files) {
  const res = takeoff(parseStep(readFileSync(file)));
  const rows = res.rows.filter((r) => r.computed?.solids?.body?.shells?.length && !r.computed.solids.body.terms.length && r.computed.areas && !r.computed.areas.faceted && !r.computed.areas.error && ["side", "footprint", "plan"].some((k) => r.computed.areas[k]?.gross != null));
  const step = Math.max(1, Math.floor(rows.length / perFile));
  console.log(`${basename(file)}: ${rows.length} faceted elements with areas; checking ${Math.min(perFile, Math.ceil(rows.length / step))}`);
  for (let i = 0, done = 0; i < rows.length && done < perFile; i += step, done++) {
    const r = rows[i];
    const body = r.computed.solids.body;
    for (const [kind, at] of [["side", 0.5], ["footprint", 1e-4], ["plan", 0.5]]) {
      const A = r.computed.areas[kind];
      if (!A || A.gross == null) continue;
      const [lo, hi] = solidExtent(body, A.n);
      const k = lo + (hi - lo) * at + (hi - lo) * 1e-7;
      const exact = sectionArea(body, A.n, k);
      const s = sampled(body, A.n, k);
      const per = 4 * Math.sqrt(exact) * s.cell * 4; // perimeter of a square of that area x 4 cells
      const tol = Math.max(0.02 * exact, per);
      const gap = Math.abs(exact - s.area);
      checked++;
      if (gap > tol) outside++;
      const rel = exact > 0 ? gap / exact : (s.area > 0 ? Infinity : 0);
      gaps.push(rel);
      if (rel > worst.rel) worst = { rel, id: r.id, kind, exact, sampled: s.area, tol };
      if (gap > tol) console.log(`  #${r.id} ${r.ifcClass} ${kind}: section ${exact.toPrecision(6)} sampled ${s.area.toPrecision(6)} (tol ${tol.toPrecision(3)}) OUTSIDE`);
    }
  }
}
gaps.sort((a, b) => a - b);
console.log(`checked ${checked} sections; ${outside} outside tolerance; median relative gap ${((gaps[Math.floor(gaps.length / 2)] ?? 0) * 100).toFixed(3)}%; worst ${(worst.rel * 100).toFixed(2)}% (#${worst.id} ${worst.kind}: section ${worst.exact?.toPrecision(6)}, sampled ${worst.sampled?.toPrecision(6)}, tolerance ${worst.tol?.toPrecision(3)})`);
