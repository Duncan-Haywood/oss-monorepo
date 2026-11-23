// The doors and windows that openingSides() puts in a room the file's space
// boundaries do not name for them ("extra" in eval/cobie-placement.mjs), one
// line each, with what the file says about that room elsewhere:
//  - which side (through the wall) and which offset (0.2 or 0.6 m) found it;
//  - whether the host wall (opening -> IfcRelVoidsElement) has a space
//    boundary with that room, and with the file's own room;
//  - whether any other door or window bounds that room;
//  - the extra room's boundary count, and whether the door is external
//    (Pset_*Common IsExternal).
//
//   node eval/door-extra-room.mjs MODEL.ifc ... [--json OUT.json]
import { readFileSync, writeFileSync } from "node:fs";
import { parseModel } from "../node.mjs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { takeoff } from "../../ifc-quantity-takeoff/qto.mjs";
import { roomTests, openingSides, pointInSolid } from "../../ifc-quantity-takeoff/rooms.mjs";
import { solidExtent, invert, apply } from "../../ifc-quantity-takeoff/geom.mjs";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && (jsonAt < 0 || i !== jsonAt + 1));
const out = [];
const norm = (v) => Math.hypot(...v);

// openingSides with its probes kept: [{sgn, side, room}] for every probe tried
function probes(row, testable) {
  const body = row.computed?.solids?.body, W = row.world, f = row.lengthUnit;
  if (!body || !W || !f) return [];
  const ex = [0, 1, 2].map((i) => solidExtent(body, [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]));
  const up = [0, 1, 2].reduce((m, i) => (Math.abs(W[8 + i]) > Math.abs(W[8 + m]) ? i : m), 0);
  const horiz = [0, 1, 2].filter((i) => i !== up);
  const scale = norm([W[0], W[4], W[8]]) * f;
  const span = (i) => (ex[i][1] - ex[i][0]) * scale;
  const t = span(horiz[0]) <= span(horiz[1]) ? horiz[0] : horiz[1];
  const c = ex.map(([lo, hi]) => (lo + hi) / 2);
  const res = [];
  for (const sgn of [-1, 1]) for (const side of [0.2, 0.6, 1.0]) {
    const p = c.slice();
    p[t] += sgn * ((ex[t][1] - ex[t][0]) / 2 + side / scale);
    const w = apply(W, p), x = w[0] * f, y = w[1] * f, z = w[2] * f;
    let hit = null;
    for (const { r, inv } of testable) {
      const B = r.box, e = 1e-6;
      if (x < B[0] - e || x > B[3] + e || y < B[1] - e || y > B[4] + e || z < B[2] - e || z > B[5] + e) continue;
      if (pointInSolid(r.solid, apply(inv, w.map((v) => v * f / r.lengthUnit)))) { hit = r; break; }
    }
    res.push({ sgn, side, room: hit ? hit.id : null, depth: span(t) });
  }
  return res;
}

for (const fpath of files) {
  const name = fpath.split("/").pop();
  const bytes = readFileSync(fpath);
  const model = parseModel(bytes);
  const tk = takeoff(parseStep(bytes.toString("utf8")));
  const rowById = new Map(tk.rows.map((x) => [x.id, x]));
  const roomById = new Map(tk.rooms.map((x) => [x.id, x]));
  const bounds = new Map(); // element id -> Set(space id)
  const spaceBounds = new Map(); // space id -> [{el, type}]
  const voidsHost = new Map(); // opening id -> host element id
  const fills = new Map(); // door id -> opening id
  const isExternal = new Map();
  for (const e of model.entities.values()) {
    if (e.type.startsWith("IFCRELSPACEBOUNDARY")) {
      const sp = model.get(model.attr(e, "RelatingSpace"));
      const el = model.get(model.attr(e, "RelatedBuildingElement"));
      if (!sp || !el || sp.type !== "IFCSPACE") continue;
      if (!bounds.has(el.id)) bounds.set(el.id, new Set());
      bounds.get(el.id).add(sp.id);
      if (!spaceBounds.has(sp.id)) spaceBounds.set(sp.id, []);
      spaceBounds.get(sp.id).push({ el: el.id, type: el.type, virtual: String(model.attr(e, "PhysicalOrVirtualBoundary") || "") });
    } else if (e.type === "IFCRELVOIDSELEMENT") {
      const h = model.get(model.attr(e, "RelatingBuildingElement")), o = model.get(model.attr(e, "RelatedOpeningElement"));
      if (h && o) voidsHost.set(o.id, h.id);
    } else if (e.type === "IFCRELFILLSELEMENT") {
      const o = model.get(model.attr(e, "RelatingOpeningElement")), d = model.get(model.attr(e, "RelatedBuildingElement"));
      if (o && d) fills.set(d.id, o.id);
    }
  }
  const tests = roomTests(tk.rooms);
  for (const [id, truth] of bounds) {
    const el = model.entities.get(id);
    if (!/^IFC(DOOR|WINDOW)$/.test(el.type)) continue;
    const row = rowById.get(id);
    if (!row || !row.computed?.solids?.body) continue;
    const pred = openingSides(row, tests).map((x) => x.id);
    const truthIds = [...truth];
    if (!truthIds.every((x) => pred.includes(x)) || pred.length <= truthIds.length) continue; // only "extra"
    const extra = pred.filter((x) => !truth.has(x));
    const host = voidsHost.get(fills.get(id));
    const hostRooms = host ? [...(bounds.get(host) || [])] : [];
    const pr = probes(row, tests);
    const lbl = (sid) => roomById.get(sid)?.label ?? `#${sid}`;
    const rec = {
      file: name, id, globalId: el.args[0], type: el.type, name: el.args[2],
      truth: truthIds.map(lbl), extra: extra.map(lbl),
      hostWall: host ? `${model.entities.get(host).type} #${host}` : null,
      hostBoundsTruth: truthIds.map((s) => hostRooms.includes(s)),
      hostBoundsExtra: extra.map((s) => hostRooms.includes(s)),
      extraOtherOpenings: extra.map((s) => (spaceBounds.get(s) || []).filter((b) => /^IFC(DOOR|WINDOW)$/.test(b.type)).length),
      extraBoundaries: extra.map((s) => (spaceBounds.get(s) || []).length),
      depth: pr[0]?.depth,
      probes: pr.map((p) => `${p.sgn > 0 ? "+" : "-"}${p.side}:${p.room ? lbl(p.room) : "-"}`),
    };
    out.push(rec);
    console.log(`${name} #${id} ${el.type} "${rec.name}" file: ${rec.truth.join(" | ")}; extra: ${rec.extra.join(" | ")}; host ${rec.hostWall} bounds file room ${rec.hostBoundsTruth} extra ${rec.hostBoundsExtra}; extra room has ${rec.extraBoundaries} boundaries, ${rec.extraOtherOpenings} openings; depth ${rec.depth?.toFixed(3)}; probes ${rec.probes.join(", ")}`);
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
