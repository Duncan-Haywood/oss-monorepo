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
