import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resources, check } from "./node.mjs";
import { fillModel, fillReport } from "./model-fill.mjs";
import { Model } from "./ids.mjs";
import { quantitiesFromRows, geometryLookup, measureModel } from "./geometry-quantities.mjs";

const SAMPLE = new URL("../ifc-quantity-takeoff/samples/sample-office.ifc", import.meta.url);
const have = existsSync(SAMPLE);
let seed = 7;
const random = () => Uint8Array.from({ length: 16 }, () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255);
const ids = (specs) => `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;
const spec = (cls, req) => `<specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>${cls}</simpleValue></name></entity></applicability><requirements>${req}</requirements></specification>`;
const prop = (ps, pn, dt, value = "") => `<property dataType="${dt}"><propertySet><simpleValue>${ps}</simpleValue></propertySet><baseName><simpleValue>${pn}</simpleValue></baseName>${value}</property>`;

test("takeoff rows map onto the Qto_ names their class's set defines, SI values only where measured", () => {
  const ok = (ifcType, computed) => ({ id: 1, ifcType, computed: { status: "ok", ...computed } });
  const m = quantitiesFromRows([
    ok("IFCWALLSTANDARDCASE", { gross: 3, net: 2.5, areas: { side: { gross: 15, net: 12.5, width: 0.2 }, footprint: { gross: 1, net: null } } }),
    { ...ok("IFCSLAB", { gross: 5, net: null, areas: { faceted: true } }), id: 2 },
    { ...ok("IFCBEAM", { gross: 0.2, net: 0.2, areas: { cross: { gross: 0.04, surface: 9 } } }), id: 3 },
    { id: 4, ifcType: "IFCWALL", computed: { status: "not read" } },
  ]);
  assert.deepEqual(Object.fromEntries([...m.get(1)].map(([k, v]) => [k, v.value])), { GrossVolume: 3, NetVolume: 2.5, GrossSideArea: 15, NetSideArea: 12.5, GrossFootprintArea: 1, Width: 0.2 });
  // A faceted slab gives its volume but no cut area; an opening that could not be cut gives no NetVolume.
  assert.deepEqual([...m.get(2).keys()], ["GrossVolume"]);
  assert.deepEqual([...m.get(3).keys()], ["GrossVolume", "NetVolume", "CrossSectionArea"]);
  assert.equal(m.has(4), false);
  const look = geometryLookup(m);
  assert.equal(look({ id: 1 }, "NetSideArea", "IFCQUANTITYAREA"), 12.5);
  // Asked as another kind of quantity, or a name the geometry does not define: nothing.
  assert.equal(look({ id: 1 }, "NetSideArea", "IFCQUANTITYVOLUME"), undefined);
  assert.equal(look({ id: 1 }, "Length", "IFCQUANTITYLENGTH"), undefined);
});

test("the fill writes quantities no set holds from the element's geometry, and leaves held ones alone", { skip: !have && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const text = readFileSync(SAMPLE, "utf8");
  const geometry = geometryLookup(await measureModel(text));
  const I = ids(spec("IFCWALL", prop("Qto_WallBaseQuantities", "NetSideArea", "IFCAREAMEASURE")));
  const without = fillModel(I, text, { ...resources(), random });
  assert.equal(without.written, 0);
  const r = fillModel(I, text, { ...resources(), random, geometry });
  // Wall A stores 12.9 m2 already; B and the two C pieces get the side area cut through their bodies.
  assert.equal(r.fromGeometry, 3);
  assert.deepEqual(r.writtenList.map((w) => [w.id, w.value, w.source]).sort(), [[200, "10.", "geometry"], [300, "9.", "geometry"], [320, "9.", "geometry"]]);
  // Into each wall's own Qto_WallBaseQuantities, every other line unchanged.
  assert.equal(r.sets.added, 0);
  assert.equal(r.verified.pass, 3);
  assert.equal(check(I, new Model(r.text, resources().schemas)).specs[0].status, "pass");
  assert.match(fillReport(r), /3 measured from the element's geometry/);
  // A restriction the measured value breaks is refused with the reason, not written.
  const tight = fillModel(ids(spec("IFCWALL", prop("Qto_WallBaseQuantities", "NetSideArea", "IFCAREAMEASURE", `<value><xs:restriction base="xs:double"><xs:minInclusive value="9.5"/></xs:restriction></value>`))), text, { ...resources(), random, geometry });
  assert.deepEqual(tight.writtenList.map((w) => w.id), [200]);
  assert.equal(tight.unfilled.filter((u) => /is not/.test(u.why)).length, 2);
});

test("a property (not a quantity) is never taken from geometry; the table's reason says what geometry could not give", { skip: !have && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const text = readFileSync(SAMPLE, "utf8");
  const geometry = geometryLookup(await measureModel(text));
  const p = fillModel(ids(spec("IFCWALL", prop("Pset_Custom", "NetSideArea", "IFCAREAMEASURE"))), text, { ...resources(), random, geometry });
  assert.equal(p.fromGeometry, 0);
  // NetWeight: a quantity no body defines
  const q = fillModel(ids(spec("IFCWALL", prop("Qto_WallBaseQuantities", "NetWeight", "IFCMASSMEASURE"))), text, { ...resources(), random, geometry });
  assert.equal(q.fromGeometry, 0);
  assert.ok(q.unfilled.length && q.unfilled.every((u) => /geometry gives none/.test(u.why)));
});

// ---- wall Length and Height from the axis direction and the body ----------

import { wallLines, straightAxis } from "./geometry-quantities.mjs";
const TAKEOFF = new URL("../ifc-quantity-takeoff/geom.mjs", import.meta.url);
const haveGeom = existsSync(TAKEOFF);

test("a mitred wall's length is its middle line's, not a face's or the axis's", { skip: !haveGeom && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const { prism, polyPlanes } = await import(TAKEOFF.href);
  // FZK-Haus's Wand-Int-ERDG-4 in plan: faces 4.29 and 4.05 m, 0.24 thick, 2.5 high
  const plan = [[0, 0], [4.29, 0], [4.17, 0.24], [0.12, 0.24]];
  const body = { terms: [{ s: 1, faces: prism(plan, [0, 0, 2.5]) }], mesh: 0, shells: [] };
  const w = wallLines(body, [1, 0], polyPlanes);
  assert.ok(Math.abs(w.length - 4.17) < 1e-9, w.length);
  assert.ok(Math.abs(w.height - 2.5) < 1e-9 && Math.abs(w.tallest - 2.5) < 1e-9);
  // The same wall with its axis given the other way round, and scaled: same length.
  assert.ok(Math.abs(wallLines(body, [-3, 0], polyPlanes).length - 4.17) < 1e-9);
});

test("a wall clipped under a sloped roof keeps its extrusion depth apart from its tallest point", { skip: !haveGeom && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const { prism, polyPlanes } = await import(TAKEOFF.href);
  // 10 m long, 0.3 thick, 3.5 high, and a negative wedge taking the top off
  // above a line falling from 3.4 m at x = 0 to 0.5 m at x = 10
  const box = prism([[0, 0], [10, 0], [10, 0.3], [0, 0.3]], [0, 0, 3.5]);
  const wedgeElev = [[0, 3.4], [10, 0.5], [10, 4], [0, 4]]; // in x-z
  const wedge = prism(wedgeElev, [0, 0, 0.3]).map((f) => f.map(([x, z, y]) => [x, y, z]).reverse());
  const body = { terms: [{ s: 1, faces: box }, { s: -1, faces: wedge }], mesh: 0, shells: [] };
  const w = wallLines(body, [1, 0], polyPlanes);
  assert.ok(Math.abs(w.length - 10) < 1e-6, w.length); // the base is the longest level
  assert.ok(Math.abs(w.height - 3.5) < 1e-9); // extrusion depth
  assert.ok(Math.abs(w.tallest - 3.4) < 1e-3, w.tallest); // clipped
  // A faceted body whose faces are not all known gives nothing.
  assert.equal(wallLines({ terms: [], mesh: 1, shells: null }, [1, 0], polyPlanes), null);
});

test("only a straight Axis gives a direction", { skip: !haveGeom && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const { Geometry } = await import(TAKEOFF.href);
  const { parseStep } = await import(new URL("../ifc-quantity-takeoff/step.mjs", import.meta.url).href);
  const m = parseStep(`ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;
#1=IFCCARTESIANPOINT((0.,0.));#2=IFCCARTESIANPOINT((0.,5.));#3=IFCCARTESIANPOINT((0.,10.));
#4=IFCPOLYLINE((#1,#2,#3));#5=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#4));#6=IFCPRODUCTDEFINITIONSHAPE($,$,(#5));
#7=IFCWALL('a',$,$,$,$,$,#6,$,$);
#11=IFCCARTESIANPOINT((4.,5.));#12=IFCPOLYLINE((#1,#11,#3));#13=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#12));#14=IFCPRODUCTDEFINITIONSHAPE($,$,(#13));
#15=IFCWALL('b',$,$,$,$,$,#14,$,$);
ENDSEC;END-ISO-10303-21;`);
  const geo = new Geometry(m);
  assert.deepEqual(straightAxis(m, geo, m.entities.get(7)), [0, 1]);
  assert.equal(straightAxis(m, geo, m.entities.get(15)), null); // bent
});

test("the fill writes a wall's Length and Height from its axis and body", { skip: !have && "ifc-quantity-takeoff not beside this folder" }, async () => {
  // Wall B (4 m, clipped by a sloped plane) given an Axis, its stored Length taken out
  const text = readFileSync(SAMPLE, "utf8")
    .replace("#202=IFCPRODUCTDEFINITIONSHAPE($,$,(#205));", "#202=IFCPRODUCTDEFINITIONSHAPE($,$,(#9004,#205));\n#9001=IFCCARTESIANPOINT((0.,0.));\n#9002=IFCCARTESIANPOINT((4000.,0.));\n#9003=IFCPOLYLINE((#9001,#9002));\n#9004=IFCSHAPEREPRESENTATION(#20,'Axis','Curve2D',(#9003));")
    .replace("(#231,#232,#233)", "(#232,#233)");
  const geometry = geometryLookup(await measureModel(text));
  const L = fillModel(ids(spec("IFCWALL", prop("Qto_WallBaseQuantities", "Length", "IFCLENGTHMEASURE"))), text, { ...resources(), random, geometry });
  assert.deepEqual(L.writtenList.filter((w) => w.source === "geometry").map((w) => [w.id, w.value]), [[200, "4000."]]);
  assert.equal(L.verified.pass, L.written);
  const H = fillModel(ids(spec("IFCWALL", prop("Qto_WallBaseQuantities", "Height", "IFCLENGTHMEASURE"))), text, { ...resources(), random, geometry });
  // The sloped clip leaves the wall's high end at the full 3 m, so the
  // extrusion depth and the tallest point agree and the height is offered
  // (Wall C's pieces store theirs already).
  assert.deepEqual(H.writtenList.filter((w) => w.source === "geometry").map((w) => [w.id, w.value]), [[200, "3000."]]);
  assert.equal(H.verified.pass, H.written);
});

test("a faceted (brep) wall is read through its shells: length on the middle line, height only on a level top", { skip: !haveGeom && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const { prism, polyPlanes, asTerms } = await import(TAKEOFF.href);
  // The FZK mitred plan again, as a brep's closed shell.
  const plan = [[0, 0], [4.29, 0], [4.17, 0.24], [0.12, 0.24]];
  const brep = (faces) => ({ terms: [], mesh: 1, shells: [{ s: 1, loops: faces }], notes: [] });
  const w = wallLines(brep(prism(plan, [0, 0, 2.5])), [1, 0], polyPlanes, { asTerms });
  assert.ok(Math.abs(w.length - 4.17) < 1e-9, w.length);
  assert.ok(w.faceted && w.flatTop && Math.abs(w.height - 2.5) < 1e-9);
  // Without asTerms a faceted body is not read.
  assert.equal(wallLines(brep(prism(plan, [0, 0, 2.5])), [1, 0], polyPlanes), null);
  // A gable wall (elevation 0..6 m long, eaves 2.5, ridge 4): the shell is
  // not convex, so asTerms fans it into tetrahedra; its top is not level.
  const elev = [[0, 0], [6, 0], [6, 2.5], [3, 4], [0, 2.5]];
  const gable = prism(elev, [0, 0, 0.3]).map((f) => f.map(([x, z, y]) => [x, y, z]).reverse());
  const g = wallLines(brep(gable), [1, 0], polyPlanes, { asTerms });
  assert.ok(Math.abs(g.length - 6) < 1e-6, g.length);
  assert.ok(Math.abs(g.height - 4) < 1e-9 && g.flatTop === false);
  // An L-shaped plan (a corner wall drawn as one body): its middle line runs
  // through one arm only, 0.3 m of a 5 m wall, so nothing is offered.
  const L = prism([[0, 0], [5, 0], [5, 0.3], [0.3, 0.3], [0.3, 3], [0, 3]], [0, 0, 2.8]);
  assert.equal(wallLines(brep(L), [1, 0], polyPlanes, { asTerms }), null);
});

test("a wall with no Axis takes its direction from its body's side faces", async () => {
  const { bodyDirection } = await import("./geometry-quantities.mjs");
  const row = (n) => ({ computed: { status: "ok", areas: { side: { n } } } });
  const d = bodyDirection(row([0, 1, 0]));
  assert.ok(Math.abs(d[0] + 1) < 1e-12 && Math.abs(d[1]) < 1e-12);
  const s = Math.SQRT1_2;
  const e = bodyDirection(row([s, s, 0]));
  assert.ok(Math.abs(Math.abs(e[0]) - s) < 1e-12 && Math.abs(e[0] + e[1]) < 1e-12); // perpendicular to n
  assert.equal(bodyDirection(row([0, 0, 1])), null); // not a side normal
  assert.equal(bodyDirection({ computed: { status: "ok", areas: { faceted: true } } }), null);
});

test("the fill writes a Length for a wall with no Axis, from its body", { skip: !have && "ifc-quantity-takeoff not beside this folder" }, async () => {
  // Wall B with no Axis (as in the sample) and its stored Length taken out:
  // its direction comes from its side faces
  const text = readFileSync(SAMPLE, "utf8").replace("(#231,#232,#233)", "(#232,#233)");
  const geometry = geometryLookup(await measureModel(text));
  const L = fillModel(ids(spec("IFCWALL", prop("Qto_WallBaseQuantities", "Length", "IFCLENGTHMEASURE"))), text, { ...resources(), random, geometry });
  assert.deepEqual(L.writtenList.filter((w) => w.source === "geometry").map((w) => [w.id, w.value]), [[200, "4000."]]);
  assert.equal(L.verified.pass, L.written);
});

// ---- a clipped wall's Height by its authoring tool's convention -----------

test("the tallest point is found at a mitred end's acute corner (C20 Wand-003: ARCHICAD stores 2.0257)", { skip: !haveGeom && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const { polyPlanes } = await import(TAKEOFF.href);
  // C20-Institute-Var-2 #229235 as the takeoff holds it: a 2 m wall, 0.3
  // thick, mitred at both ends, 2.7 m extruded, two roof clips meeting at
  // x = 0.693; its highest point is the corner (-0.3, -0.3) at 2.0257.
  const hull = (pts) => {
    // the convex hull's faces of a small point set (brute force: planes through 3 points with all points on one side)
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const faces = [], seen = new Set();
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) for (let k = j + 1; k < pts.length; k++) {
      let nn = crs(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
      if (Math.hypot(...nn) < 1e-12) continue;
      const side = pts.map((p) => dot(nn, sub(p, pts[i])));
      if (side.every((x) => x <= 1e-9)) {} else if (side.every((x) => x >= -1e-9)) nn = nn.map((x) => -x); else continue;
      const on = pts.filter((p) => Math.abs(dot(nn, sub(p, pts[i]))) <= 1e-9);
      const c = on.reduce((a, p) => [a[0] + p[0] / on.length, a[1] + p[1] / on.length, a[2] + p[2] / on.length], [0, 0, 0]);
      const u = sub(on[0], c), v = crs(nn, u);
      on.sort((a, b) => Math.atan2(dot(sub(a, c), v), dot(sub(a, c), u)) - Math.atan2(dot(sub(b, c), v), dot(sub(b, c), u)));
      const key = on.map((p) => p.join()).sort().join("|");
      if (!seen.has(key)) { seen.add(key); faces.push(on); }
    }
    return faces;
  };
  const T = (s, pts) => ({ s, faces: hull(pts) });
  const body = { mesh: 0, shells: [], terms: [
    T(1, [[0, 0, 0], [2, 0, 0], [1.7, -0.3, 0], [-0.3, -0.3, 0], [-0.3, -0.3, 2.7], [1.7, -0.3, 2.7], [2, 0, 2.7], [0, 0, 2.7]]),
    T(-1, [[0.693, -0.3, 2.7], [1.7, -0.3, 2.7], [2, 0, 2.7], [0.693, 0, 2.7], [1.7, -0.3, 1.33355], [0.693, -0.3, 1.75633], [2, 0, 1.20763], [0.693, 0, 1.75633]]),
    T(-1, [[-0.3, -0.3, 2.7], [0.693, -0.3, 2.7], [0.693, 0, 2.7], [0, 0, 2.7], [-0.3, -0.3, 2.02569], [0.693, -0.3, 1.75633], [0, 0, 1.94431], [0.693, 0, 1.75633]]),
    T(1, [[0.693, 0, 2.7], [0.693, 0, 1.75633], [0.693, -0.3, 1.75633], [0.693, -0.3, 2.7]]),
  ] };
  const w = wallLines(body, [1, 0], polyPlanes);
  assert.ok(Math.abs(w.length - 2) < 1e-6, w.length);
  assert.ok(Math.abs(w.height - 2.7) < 1e-9);
  assert.ok(Math.abs(w.tallest - 2.02569) < 1e-4, w.tallest); // was 1.985 before the corner lines
});

test("a clipped wall's Height is the one its authoring tool's export stores, or none", async () => {
  const { offeredHeight, heightConvention } = await import("./geometry-quantities.mjs");
  const w = { height: 3.5, tallest: 3.4, faceted: false };
  assert.deepEqual(offeredHeight(w, false, null), { height: 3.5, heightFrom: "body" });
  assert.deepEqual(offeredHeight(w, true, null), { height: null, heightFrom: null });
  assert.deepEqual(offeredHeight(w, true, "tallest"), { height: 3.4, heightFrom: "tallest" });
  assert.deepEqual(offeredHeight(w, true, "extrusion"), { height: 3.5, heightFrom: "extrusion" });
  // a faceted body holds no extrusion depth, only its clipped faces
  assert.deepEqual(offeredHeight({ ...w, faceted: true }, true, "extrusion"), { height: null, heightFrom: null });
  // a faceted body's faces hold the cut: its own extent is the highest point
  assert.deepEqual(offeredHeight({ height: 3.4, tallest: 3.2, faceted: true }, true, "tallest"), { height: 3.4, heightFrom: "tallest" });
  if (!existsSync(new URL("../ifc-quantity-takeoff/step.mjs", import.meta.url))) return;
  const { parseStep } = await import(new URL("../ifc-quantity-takeoff/step.mjs", import.meta.url).href);
  const m = parseStep(`ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCORGANIZATION($,'Graphisoft',$,$,$);#2=IFCAPPLICATION(#1,'20.0.0','ARCHICAD-64','IFC2x3 add-on version: 4009 GER FULL');
#3=IFCORGANIZATION($,'Autodesk Revit 2022 (DEU)',$,$,$);#4=IFCAPPLICATION(#3,'2022','Autodesk Revit 2022 (DEU)','Revit');
#5=IFCORGANIZATION($,'McNeel',$,$,$);#6=IFCAPPLICATION(#5,'1','Asuni IFC Rhino Export Plug-In','ASIFC');
#11=IFCOWNERHISTORY($,#2,$,.ADDED.,$,$,$,0);#12=IFCOWNERHISTORY($,#4,$,.ADDED.,$,$,$,0);#13=IFCOWNERHISTORY($,#6,$,.ADDED.,$,$,$,0);
#21=IFCWALL('a',#11,$,$,$,$,$,$);#22=IFCWALL('b',#12,$,$,$,$,$,$);#23=IFCWALL('c',#13,$,$,$,$,$,$);#24=IFCWALL('d',$,$,$,$,$,$,$);
ENDSEC;END-ISO-10303-21;`);
  const E = m.entities;
  assert.equal(heightConvention(m, E.get(21)), "tallest");
  assert.equal(heightConvention(m, E.get(22)), "extrusion");
  assert.equal(heightConvention(m, E.get(23)), null);
  assert.equal(heightConvention(m, E.get(24)), null); // no owner history, and the file names three tools
});

test("a linear member's Length: square ends give the body's length; cut ends only by the authoring tool's convention; plates none", async () => {
  const { memberLength } = await import("./geometry-quantities.mjs");
  // a box of half-sizes h, axis along x; its extent along d
  const ext = (b, d) => { const e = Math.abs(d[0]) * b.h[0] + Math.abs(d[1]) * b.h[1] + Math.abs(d[2]) * b.h[2]; return [-e, e]; };
  const row = (h, volume, section) => ({ computed: { status: "ok", gross: volume, solids: { body: { h } }, areas: { cross: { n: [1, 0, 0], gross: section } } }, lengthUnit: 1 });
  // 4 m long, 0.2 x 0.1 section: volume / section = 4
  const sq = memberLength(row([2, 0.1, 0.05], 0.08, 0.02), ext);
  assert.equal(sq.square, true);
  assert.equal(sq.length, 4);
  assert.equal(sq.lengthFrom, "square");
  // a mitred end: extent 4, volume / section 3.9 -- held back unless the tool says which
  const cut = row([2, 0.1, 0.05], 0.078, 0.02);
  assert.equal(memberLength(cut, ext).length, null);
  assert.ok(Math.abs(memberLength(cut, ext, "centroid").length - 3.9) < 1e-9);
  assert.equal(memberLength(cut, ext, "extent").length, 4);
  // a plate exported as a beam: 0.06 along its extrusion, 0.14 across
  const plate = memberLength(row([0.03, 0.07, 0.003], 0.06 * 0.14 * 0.006, 0.14 * 0.006), ext);
  assert.equal(plate.square, true);
  assert.equal(plate.length, null);
});

test("the fill writes a column's and a beam's Length from the body's length along its extrusion", { skip: !have && "ifc-quantity-takeoff not beside this folder" }, async () => {
  // the column stores no quantities; the beam's stored Length taken out
  const text = readFileSync(SAMPLE, "utf8").replace("(#611,#612,#613)", "(#612,#613)");
  const geometry = geometryLookup(await measureModel(text));
  const L = (cls, set) => fillModel(ids(spec(cls, prop(set, "Length", "IFCLENGTHMEASURE"))), text, { ...resources(), random, geometry });
  const col = L("IFCCOLUMN", "Qto_ColumnBaseQuantities");
  assert.deepEqual(col.writtenList.filter((w) => w.source === "geometry").map((w) => [w.id, w.value]), [[500, "3000."]]);
  assert.equal(col.verified.pass, col.written);
  const beam = L("IFCBEAM", "Qto_BeamBaseQuantities");
  assert.deepEqual(beam.writtenList.filter((w) => w.source === "geometry").map((w) => [w.id, w.value]), [[600, "4000."]]);
  assert.equal(beam.verified.pass, beam.written);
});

test("a member's Length is offered only for a row the takeoff measured ok", async () => {
  const { addMemberLines } = await import("./geometry-quantities.mjs");
  const ext = (b, d) => { const e = Math.abs(d[0]) * b.h[0] + Math.abs(d[1]) * b.h[1] + Math.abs(d[2]) * b.h[2]; return [-e, e]; };
  const row = (status) => ({ id: 1, ifcType: "IFCBEAM", computed: { status, gross: 0.08, solids: { body: { h: [2, 0.1, 0.05] } }, areas: { cross: { n: [1, 0, 0], gross: 0.02 } } }, lengthUnit: 1 });
  const model = { entities: new Map() };
  const ok = row("ok"), bad = row("error");
  assert.equal(addMemberLines(model, [ok, bad], { solidExtent: ext }), 1);
  assert.equal(ok.computed.lines.length, 4);
  assert.equal(bad.computed.lines, undefined);
});

test("a skew member's width is measured square to its axis, not along it", async () => {
  const { widthAcross } = await import("./geometry-quantities.mjs");
  // a 10 m round bar of radius 0.1 along a sloped, skew axis: its ends' rims
  const n0 = [1, 2, 3], L = Math.hypot(...n0), n = n0.map((x) => x / L);
  const a = [0, 0, 1], u0 = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
  const uL = Math.hypot(...u0), u = u0.map((x) => x / uL);
  const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const pts = [];
  for (const t of [0, 10]) for (let k = 0; k < 720; k++) {
    const c = Math.cos(k * Math.PI / 360), s = Math.sin(k * Math.PI / 360);
    pts.push([0, 1, 2].map((i) => t * n[i] + 0.1 * (c * u[i] + s * w[i])));
  }
  const ext = (_b, d) => { const v = pts.map((p) => p[0] * d[0] + p[1] * d[1] + p[2] * d[2]); return [Math.min(...v), Math.max(...v)]; };
  const D = widthAcross(null, n, ext);
  assert.ok(Math.abs(D - 0.2) < 1e-3, D);
});

test("a wall running along y is read like one along x", { skip: !haveGeom && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const { prism, polyPlanes } = await import(TAKEOFF.href);
  const body = { terms: [{ s: 1, faces: prism([[0, 0], [0.2, 0], [0.2, 5], [0, 5]], [0, 0, 3]) }], mesh: 0, shells: [] };
  const w = wallLines(body, [0, 1], polyPlanes);
  assert.ok(w && Math.abs(w.length - 5) < 1e-9 && Math.abs(w.height - 3) < 1e-9, JSON.stringify(w));
});

// A polygon outline in the xz plane extruded t along y, as faceted loops
// (Tekla writes braces and haunched pieces this way).
function outlinePrism(xz, t) {
  const at = (y) => xz.map(([x, z]) => [x, y, z]);
  const lo = at(-t / 2), hi = at(t / 2), faces = [lo.slice().reverse(), hi];
  for (let i = 0; i < xz.length; i++) { const j = (i + 1) % xz.length; faces.push([lo[i], lo[j], hi[j], hi[i]]); }
  return { terms: [{ s: 1, faces }] };
}

test("Tekla's cut members: the length along the smallest box flush with the body's faces, not the takeoff's axis", { skip: !haveGeom && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const { memberLength, boxAxis } = await import("./geometry-quantities.mjs");
  const { solidExtent } = await import(TAKEOFF.href);
  // a brace 1.45 m deep running 38 deg up, its ends cut square to the floor
  // and to a wall (M3D-CON's 'DIA-2', 250 mm thick): 2.5 m along its faces
  const th = (38 * Math.PI) / 180, d = [Math.cos(th), Math.sin(th)], m = [-Math.sin(th), Math.cos(th)];
  const P = (s, r) => [s * d[0] + r * m[0], s * d[1] + r * m[1]];
  const a = P(0, 0), b = P(2.5, 0), c = P(2.5, 1.45), e = P(0, 1.45);
  const xz = [a, b, [b[0], c[1]], c, e, [a[0] - 0.3, e[1] - 0.4]];
  const body = outlinePrism(xz, 0.25);
  const box = boxAxis(body, solidExtent);
  assert.ok(Math.abs(Math.abs(box.n[0] * d[0] + box.n[2] * d[1]) - 1) < 1e-9, "the box runs along the brace");
  const [lo, hi] = solidExtent(body, [d[0], 0, d[1]]);
  // the takeoff took the x axis (7 deg off on the real file; any wrong axis here)
  const row = { computed: { status: "ok", gross: 1, solids: { body }, areas: { cross: { n: [1, 0, 0], gross: 0.5 } } }, lengthUnit: 1 };
  const t = memberLength(row, solidExtent, "box");
  assert.equal(t.lengthFrom, "box");
  assert.ok(Math.abs(t.length - (hi - lo)) < 1e-9);
  assert.equal(memberLength(row, solidExtent, null).length, null);
});

test("Tekla's convention holds back a bent pipe and a square base plate", { skip: !haveGeom && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const { boxLength } = await import("./geometry-quantities.mjs");
  const { solidExtent } = await import(TAKEOFF.href);
  const row = (body) => ({ computed: { status: "ok", gross: 1, solids: { body } }, lengthUnit: 1 });
  // a 0.11 m downpipe with an offset in the middle: 2 m down, 0.12 m across, 2 m down
  const w = 0.11, jog = [[0, 0], [w, 0], [w, 2], [w + 0.12, 2.2], [w + 0.12, 4.2], [0.12, 4.2], [0.12, 2.2], [0, 2]];
  const pipe = boxLength(row(outlinePrism(jog, w)), solidExtent);
  assert.equal(pipe.linear, true);
  assert.equal(pipe.straight, false);
  assert.equal(pipe.length, null);
  // the same pipe straight, its foot cut at 45 deg: offered, along its run
  const straight = boxLength(row(outlinePrism([[0, 0], [w, w], [w, 4.2], [0, 4.2]], w)), solidExtent);
  assert.ok(Math.abs(straight.length - 4.2) < 1e-9);
  // a 51 x 51 x 4.5 mm plate with a corner cut ('BOTTOM_PART')
  const plate = boxLength(row(outlinePrism([[0, 0], [0.0514, 0], [0.0514, 0.04], [0.04, 0.0514], [0, 0.0514]], 0.0045)), solidExtent);
  assert.equal(plate.linear, false);
  assert.equal(plate.length, null);
});

test("a Tekla export's cut member gets the box length; an unknown tool's none", { skip: !haveGeom && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const { addMemberLines } = await import("./geometry-quantities.mjs");
  const { solidExtent } = await import(TAKEOFF.href);
  const { parseStep } = await import(new URL("../ifc-quantity-takeoff/step.mjs", import.meta.url).href);
  const m = parseStep(`ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;
#1=IFCORGANIZATION($,'Tekla',$,$,$);#2=IFCAPPLICATION(#1,'2016','Tekla Structures','Multi material modeling');
#3=IFCORGANIZATION($,'Someone',$,$,$);#4=IFCAPPLICATION(#3,'1','Other exporter','X');
#11=IFCOWNERHISTORY($,#2,$,.ADDED.,$,$,$,0);#12=IFCOWNERHISTORY($,#4,$,.ADDED.,$,$,$,0);
#21=IFCBEAM('a',#11,$,$,$,$,$,$);#22=IFCBEAM('b',#12,$,$,$,$,$,$);
ENDSEC;END-ISO-10303-21;`);
  // 3 m along x, 0.2 x 0.3, one end mitred 45 deg in plan: extent 3, volume / section 2.9
  const body = outlinePrism([[0, 0], [3, 0], [2.8, 0.2], [0, 0.2]], 0.3);
  const row = (id) => ({ id, ifcType: "IFCBEAM", computed: { status: "ok", gross: 2.9 * 0.06, solids: { body }, areas: { cross: { n: [1, 0, 0], gross: 0.06 } } }, lengthUnit: 1 });
  const tekla = row(21), other = row(22);
  assert.equal(addMemberLines(m, [tekla, other], { solidExtent }), 1);
  assert.equal(tekla.computed.lines.lengthFrom, "box");
  assert.ok(Math.abs(tekla.computed.lines.length - 3) < 1e-9);
  assert.equal(other.computed.lines, undefined);
});

// ---- a slab's Width and Perimeter --------------------------------------------

// an axis-aligned box as a convex term: [x0, y0, z0] to [x1, y1, z1]
function boxTerm(a, b, s = 1) {
  const [x0, y0, z0] = a, [x1, y1, z1] = b;
  const p = (x, y, z) => [x, y, z];
  const faces = [
    [p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0)],
    [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)],
    [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)],
    [p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0)],
    [p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)],
    [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)],
  ];
  return { s, faces };
}

test("a section's outline: shared edges of convex pieces cancel, a negative piece's edges count against", async () => {
  const { sectionPerimeter } = await import("./geometry-quantities.mjs");
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // an L in plan as two pieces meeting along part of an edge (a T-junction): 4x1 and 1x3 on top
  const L = { terms: [boxTerm([0, 0, 0], [4, 1, 0.2]), boxTerm([0, 1, 0], [1, 4, 0.2])] };
  assert.ok(near(sectionPerimeter(L, [0, 0, 1], 0.1), 16), sectionPerimeter(L, [0, 0, 1], 0.1));
  // a 5x4 rectangle less a 1x1 corner notch, as a positive and a negative piece: the outline keeps 18
  const notch = { terms: [boxTerm([0, 0, 0], [5, 4, 0.2]), boxTerm([4, 3, 0], [5, 4, 0.2], -1)] };
  assert.ok(near(sectionPerimeter(notch, [0, 0, 1], 0.1), 18));
  // a hole in the middle adds its own outline
  const hole = { terms: [boxTerm([0, 0, 0], [5, 4, 0.2]), boxTerm([2, 1, 0], [3, 2, 0.2], -1)] };
  assert.ok(near(sectionPerimeter(hole, [0, 0, 1], 0.1), 22));
  // overlapping positive pieces with their overlap taken off once: the union's outline (3x1 and 1x3 crossing: a plus)
  const plus = { terms: [boxTerm([0, 1, 0], [3, 2, 0.2]), boxTerm([1, 0, 0], [2, 3, 0.2]), boxTerm([1, 1, 0], [2, 2, 0.2], -1)] };
  assert.ok(near(sectionPerimeter(plus, [0, 0, 1], 0.1), 12));
  // a faceted body has no pieces to read
  assert.equal(sectionPerimeter({ terms: [], shells: [{ loops: [] }] }, [0, 0, 1], 0), null);
});

test("a slab's Width only from an extruded body; with openings the Perimeter is the one its tool stores, or none", async () => {
  const { slabLines } = await import("./geometry-quantities.mjs");
  const ext = (b, d) => { const v = b.terms.flatMap((t) => t.faces.flat()).map((p) => p[0] * d[0] + p[1] * d[1] + p[2] * d[2]); return [Math.min(...v), Math.max(...v)]; };
  const body = { terms: [boxTerm([0, 0, 0], [5, 4, 0.25])], axis: [0, 0, 1] };
  const net = { terms: [boxTerm([0, 0, 0], [5, 4, 0.25]), boxTerm([2, 1, 0], [3, 2, 0.25], -1)] };
  const row = (solids) => ({ computed: { status: "ok", solids, areas: { plan: { n: [0, 0, 1] } } }, lengthUnit: 1 });
  const plain = slabLines(row({ body, net: null }), ext, null);
  assert.equal(plain.width, 0.25);
  assert.equal(plain.perimeter, 18);
  assert.equal(plain.openings, false);
  const holed = row({ body, net });
  assert.equal(slabLines(holed, ext, null).perimeter, null);
  assert.equal(slabLines(holed, ext, "gross").perimeter, 18); // Revit
  assert.equal(slabLines(holed, ext, "net").perimeter, 22); // ARCHICAD
  // an opening that does not reach the middle of the slab leaves the outline alone
  const recess = { terms: [boxTerm([0, 0, 0], [5, 4, 0.25]), boxTerm([2, 1, 0.2], [3, 2, 0.25], -1)] };
  assert.equal(slabLines(row({ body, net: recess }), ext, null).perimeter, 18);
  // no extrusion (a brep read as pieces): the thickness is kept but not offered
  const brep = slabLines(row({ body: { terms: body.terms }, net: null }), ext, null);
  assert.equal(brep.width, null);
  assert.equal(brep.thickness, 0.25);
});

test("the fill writes a slab's Width and Perimeter from its body", { skip: !have && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const text = readFileSync(SAMPLE, "utf8");
  const geometry = geometryLookup(await measureModel(text));
  const I = ids(spec("IFCSLAB", prop("Qto_SlabBaseQuantities", "Width", "IFCLENGTHMEASURE") + prop("Qto_SlabBaseQuantities", "Perimeter", "IFCLENGTHMEASURE")));
  const r = fillModel(I, text, { ...resources(), random, geometry });
  // 5 x 4 m, 250 mm thick, in millimetres
  assert.deepEqual(r.writtenList.map((w) => [w.id, w.prop, w.value, w.source]).sort(), [[400, "Perimeter", "18000.", "geometry"], [400, "Width", "250.", "geometry"]]);
  assert.equal(r.verified.pass, 2);
  assert.equal(check(I, new Model(r.text, resources().schemas)).specs[0].status, "pass");
});
