#!/usr/bin/env node
// Wall Length and Height measured from the axis direction and the body
// (geometry-quantities.mjs wallLines) against the values exporters stored.
//   node eval/wall-axis-lengths.mjs MODEL.ifc ... [--json out.json]
// Also prints the axis curve's own length, to show why it is not the answer.
// A miss is traced to the stored figure when the exporter's own
// GrossSideArea / Height (or GrossVolume / (Height x Width)) agrees with the
// measured length within 2%: the stored Length then disagrees with the
// exporter's other figures for the same wall.
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff, readUnits } from "../../ifc-quantity-takeoff/qto.mjs";
import { Geometry, polyPlanes } from "../../ifc-quantity-takeoff/geom.mjs";
import { addWallLines, straightAxis } from "../geometry-quantities.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const out = {};
const near = (a, b) => a > 0 && b > 0 && Math.abs(a - b) / b <= 0.02;
for (const f of args) {
  const t0 = Date.now();
  const model = parseStep(readFileSync(f));
  const { rows } = takeoff(model);
  const units = readUnits(model);
  const geo = new Geometry(model, { angle: units.PLANEANGLEUNIT });
  addWallLines(model, rows, { Geometry, polyPlanes, readUnits, bodyDirection: false });
  const s = { walls: 0, straightAxis: 0, measured: 0, length: { stored: 0, within2: 0, axisWithin2: 0, causes: {} }, height: { stored: 0, within2: 0, tallestWithin2: 0, offered: 0, offeredWithin2: 0, causes: {} }, heightsOffered: 0 };
  const misses = [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  // the length difference is made of halves or wholes of the thicknesses of
  // the walls this one meets at its path's ends (or its own): where a stored
  // Length runs to another wall's middle or far face
  const joinGap = (r, diff) => {
    const ws = [r.computed?.areas?.side?.width, ...(r.pathJoins || []).map((j) => byId.get(j)?.computed?.areas?.side?.width)].filter((w) => w > 0);
    const parts = [0, ...ws.flatMap((w) => [w / 2, w])];
    for (const a of parts) for (const b of parts) if (a + b > 0 && Math.abs(Math.abs(diff) - (a + b)) <= 0.006) return true;
    return false;
  };
  for (const r of rows) {
    if (!/^IFCWALL/.test(r.ifcType)) continue;
    s.walls++;
    const e = model.entities.get(r.id);
    const dir = straightAxis(model, geo, e);
    if (dir) s.straightAxis++;
    const m = r.computed?.lines;
    if (!m) continue;
    s.measured++;
    const st = (name, kind) => { for (const [k, q] of Object.entries(r.stored)) if (q.kind === kind && k.toLowerCase() === name) return q.value; return null; };
    const SL = st("length", "length"), SH = st("height", "length"), SW = st("width", "length"), SA = st("grosssidearea", "area"), SV = st("grossvolume", "volume");
    // the axis curve's own length, for comparison
    let axisLen = null;
    try {
      const shape = model.entities.get(e.args[6].ref);
      for (const rr of shape.args[2]) { const rep = model.entities.get(rr.ref); if (rep.args[1] === "Axis") { const p = geo.curve(rep.args[3][0]); axisLen = 0; for (let i = 1; i < p.length; i++) axisLen += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); axisLen *= units.LENGTHUNIT; } }
    } catch { axisLen = null; }
    if (SL > 0) {
      s.length.stored++;
      if (near(m.length, SL)) s.length.within2++;
      else {
        const why = (SA > 0 && SH > 0 && near(SA / SH, m.length)) ? "stored side area / height agrees with the measured length"
          : (SV > 0 && SH > 0 && SW > 0 && near(SV / (SH * SW), m.length)) ? "stored volume / (height x width) agrees with the measured length"
          : joinGap(r, SL - m.length) ? "the difference is half or all of a joined wall's thickness" : "unexplained";
        s.length.causes[why] = (s.length.causes[why] || 0) + 1;
        misses.push(["Length", r.id, r.name, m.length.toFixed(3), SL.toFixed(3), why]);
      }
      if (axisLen != null && near(axisLen, SL)) s.length.axisWithin2++;
    }
    if (m.height != null) s.heightsOffered++;
    if (SH > 0) {
      s.height.stored++;
      if (m.height != null) { s.height.offered++; if (near(m.height, SH)) s.height.offeredWithin2++; }
      if (near(m.tallest, SH)) s.height.tallestWithin2++;
      if (near(m.extrusion, SH)) s.height.within2++;
      else {
        const why = near(m.tallest, SH) ? "stored is the clipped wall's tallest point" : (SA > 0 && SL > 0 && near(SA / SL, m.extrusion)) ? "stored side area / length agrees with the measured height" : "unexplained";
        s.height.causes[why] = (s.height.causes[why] || 0) + 1;
        misses.push(["Height", r.id, r.name, m.extrusion.toFixed(3), m.tallest.toFixed(3), SH.toFixed(3), why]);
      }
    }
  }
  const name = f.split("/").pop();
  out[name] = { ...s, seconds: (Date.now() - t0) / 1000, misses };
  console.log(`\n${name}: ${s.walls} walls, ${s.straightAxis} with a straight axis, ${s.measured} measured, ${out[name].seconds} s`);
  console.log(`  Length: stored ${s.length.stored}, measured within 2% ${s.length.within2} (the axis curve's own length: ${s.length.axisWithin2}); rest: ${JSON.stringify(s.length.causes)}`);
  console.log(`  Height: stored ${s.height.stored}, extrusion depth within 2% ${s.height.within2} (tallest clipped line: ${s.height.tallestWithin2}); rest: ${JSON.stringify(s.height.causes)}`);
  console.log(`  Height offered (not clipped): ${s.heightsOffered} of ${s.measured}; where stored ${s.height.offered}, within 2% ${s.height.offeredWithin2}`);
  for (const x of misses.slice(0, 6)) console.log("   ", x.join(" | "));
}
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
