#!/usr/bin/env node
// Revit wall openings read from their body's faces (geometry-quantities.mjs
// openingBodyLines), checked two ways. eval/opening-brep-quantities-2026-11-22.md.
//   1. every Revit 2019-on wall opening that stores Width/Height/Depth/Area:
//      the face reading against the stored figures (extrusions, whose own
//      reader is openingElementLines; this asks whether the face reading
//      reproduces Revit's figures where they are known);
//   2. every opening whose body is not extrusions (Revit 2022's
//      IfcAdvancedBrep): what measureModel now offers, against the filling
//      window's or door's own Revit Width and Height (addRevitSizeLines),
//      and, for an opening no window fills (the window's cut through a
//      separate insulation wall), against the window whose own opening
//      sits beside it (same section box centre on the level within 1 cm,
//      same upright span).
//   node eval/opening-brep-quantities.mjs MODEL.ifc ... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { readUnits, takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { Geometry, transformSolid, planeAreas, solidExtent, thinnestNormal, apply } from "../../ifc-quantity-takeoff/geom.mjs";
import { measureModel, openingBodyLines, openingElementConvention, hostThickness } from "../geometry-quantities.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--json");
const json = ji >= 0 ? args.splice(ji, 2)[1] : null;
const ref = (v) => (v && typeof v === "object" && "ref" in v ? v.ref : null);
const str = (x) => (typeof x === "string" ? x : x?.value);
const num = (x) => (typeof x === "number" ? x : typeof x?.value === "number" ? x.value : null);
const close = (a, b, tol = 0.01) => a > 0 && b > 0 && Math.abs(a / b - 1) <= tol;
const NAMES = ["Width", "Height", "Depth", "Area"];
const out = { files: {}, stored: {}, pairs: {}, brep: {}, misses: [] };
const bump = (o, k, by = 1) => (o[k] = (o[k] || 0) + by);

for (const file of args) {
  const name = file.split("/").pop();
  const text = readFileSync(file);
  const model = parseStep(text);
  const E = model.entities, U = readUnits(model), f = U.LENGTHUNIT;
  const app = [...E.values()].find((e) => e.type === "IFCAPPLICATION");
  const conv = openingElementConvention(app ? [app.args[2], app.args[3]].filter((x) => typeof x === "string").join(" ") : "");
  if (!/^revit-2019/.test(conv || "")) { out.files[name] = { convention: conv, skipped: true }; continue; }
  const geo = new Geometry(model, { angle: U.PLANEANGLEUNIT });
  const { rows } = takeoff(model);
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const host = new Map(), fill = new Map();
  for (const e of E.values()) {
    if (e.type === "IFCRELVOIDSELEMENT") host.set(ref(e.args[5]), ref(e.args[4]));
    if (e.type === "IFCRELFILLSELEMENT") fill.set(ref(e.args[4]), ref(e.args[5]));
  }
  const stored = new Map();
  for (const e of E.values()) {
    if (e.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const pd = E.get(ref(e.args[5]));
    if (pd?.type !== "IFCELEMENTQUANTITY") continue;
    for (const id of (e.args[4] || []).map(ref)) {
      if (!/^IFCOPENING/.test(E.get(id)?.type || "")) continue;
      const s = stored.get(id) || {};
      for (const q of pd.args[5] || []) {
        const x = E.get(ref(q)), n = str(x?.args?.[0]);
        if (NAMES.includes(n) && num(x.args[3]) > 0) s[n] = num(x.args[3]) * (x.type === "IFCQUANTITYAREA" ? U.AREAUNIT : f);
      }
      stored.set(id, s);
    }
  }
  const offered = await measureModel(text, { weights: false });
  const info = { convention: conv, wallOpenings: 0, brep: 0 };
  const boxes = new Map(); // opening id -> {cx, cy, z0, z1} in metres
  const breps = [];
  for (const e of E.values()) {
    if (!/^IFCOPENING/.test(e.type)) continue;
    const hr = rowOf.get(host.get(e.id));
    if (!/^IFCWALL/.test(hr?.ifcType || "")) continue;
    const rid = (E.get(ref(e.args[6]))?.args?.[2] || []).map(ref).find((id) => str(E.get(id)?.args?.[1]) === "Body");
    if (rid == null) continue;
    info.wallOpenings++;
    let body;
    try { body = transformSolid(geo.representation(rid), geo.objectPlacement(ref(e.args[5]))); } catch { continue; }
    const ext = (v) => { const [lo, hi] = solidExtent(body, v); return [lo * f, hi * f]; };
    const [x0, x1] = ext([1, 0, 0]), [y0, y1] = ext([0, 1, 0]), [z0, z1] = ext([0, 0, 1]);
    boxes.set(e.id, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z0, z1 });
    const kinds = (E.get(rid).args[3] || []).map((i) => E.get(ref(i))?.type);
    const isBrep = kinds.some((k) => k !== "IFCEXTRUDEDAREASOLID");
    if (isBrep) { info.brep++; breps.push(e.id); }
    // 1. the face reading where Revit stored the figures
    const st = stored.get(e.id);
    if (!st || isBrep) continue;
    const planes = planeAreas(body);
    const hn = hostThickness(model, geo, E.get(host.get(e.id)), hr, { thinnestNormal, apply });
    const q = openingBodyLines(planes, (v) => { const [lo, hi] = solidExtent(body, v); return hi - lo; }, hn, conv, f);
    if (st.Width > 0 && st.Height > 0 && q.width > 0) {
      const pair = close(q.width, st.Width) && close(q.height, st.Height) ? "as read" : close(q.width, st.Height) && close(q.height, st.Width) ? "swapped (Width across)" : "other";
      bump((out.pairs[name] ||= {}), pair);
    }
    for (const k of NAMES) {
      if (!(st[k] > 0)) continue;
      const t = (out.stored[k] ||= { stored: 0, offered: 0, within1: 0, misses: 0 });
      t.stored++;
      const v = q[k.toLowerCase()];
      if (!(v > 0)) continue;
      t.offered++;
      if (close(v, st[k])) t.within1++;
      else { t.misses++; if (out.misses.length < 400) out.misses.push({ file: name, id: e.id, part: "stored", q: k, stored: +st[k].toFixed(4), read: +v.toFixed(4) }); }
    }
  }
  // 2. the brep openings: offered figures against the window's own size
  for (const id of breps) {
    const o = offered.get(id);
    const w = fill.get(id);
    let win = w, how = "fills";
    if (win == null) {
      // the twin cut in a separate wall: the filled opening beside it
      const b = boxes.get(id);
      const twin = [...fill.keys()].find((oid) => {
        const c = boxes.get(oid);
        return c && oid !== id && Math.hypot(c.cx - b.cx, c.cy - b.cy) < 1 && Math.abs(c.z1 - b.z1) < 0.01;
      });
      win = twin != null ? fill.get(twin) : null;
      how = win != null ? "beside" : "none";
    }
    const t = (out.brep[how] ||= { openings: 0, offered: 0, widthIsWindowHeight: 0, heightIsWindowWidth: 0, areaIsWxH: 0 });
    t.openings++;
    if (!o) continue;
    t.offered++;
    const ws = win != null ? offered.get(win) : null;
    const W = o.get("Width")?.value, H = o.get("Height")?.value, A = o.get("Area")?.value;
    // Revit 2019 on: the opening's Width is its upright side
    if (ws && close(W, ws.get("Height")?.value, 0.001)) t.widthIsWindowHeight++;
    else if (ws && out.misses.length < 200) out.misses.push({ file: name, id, part: `brep ${how}`, q: "Width", read: W, window: ws.get("Height")?.value });
    if (ws && close(H, ws.get("Width")?.value, 0.001)) t.heightIsWindowWidth++;
    else if (ws && out.misses.length < 200) out.misses.push({ file: name, id, part: `brep ${how}`, q: "Height", read: H, window: ws.get("Width")?.value });
    if (close(A, W * H, 0.001)) t.areaIsWxH++;
    bump(out.brep, `depth ${(o.get("Depth")?.value ?? 0).toFixed(3)} m`);
  }
  out.files[name] = info;
}

console.log("files:");
for (const [f, x] of Object.entries(out.files)) console.log(`  ${f}: ${JSON.stringify(x)}`);
console.log("\n1. face reading on Revit 2019-on wall openings storing the set (stored; read; within 1%; misses):");
for (const [k, t] of Object.entries(out.stored)) console.log(`  ${k}: ${t.stored}; ${t.offered}; ${t.within1}; ${t.misses}`);
console.log("  Width and Height together, by file:");
for (const [f, x] of Object.entries(out.pairs)) console.log(`    ${f}: ${JSON.stringify(x)}`);
console.log("\n2. brep openings, offered by measureModel, against the window's own Revit size (within 0.1%):");
for (const [k, t] of Object.entries(out.brep)) console.log(`  ${k}: ${typeof t === "number" ? t : JSON.stringify(t)}`);
const why = {};
for (const m of out.misses) bump(why, `${m.part} ${m.q} ${m.file}`);
console.log("\nmisses by part, figure and file:");
for (const [k, n] of Object.entries(why).sort((a, b) => b[1] - a[1])) console.log(`  ${n} ${k}`);
if (json) writeFileSync(json, JSON.stringify(out, null, 1) + "\n");
