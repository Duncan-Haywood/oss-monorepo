// IFC5 (.ifcx) read: composition, the spatial tree, property sets and the
// checker's verdicts on a small hand-written model shaped like
// buildingSMART's hello-wall example (eval/ifcx-twins-2026-11-21.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resources, check } from "./node.mjs";
import { Model, psetsOf } from "./ids.mjs";
import { looksLikeIfcx, guidOfPath, parseIfcx } from "./ifcx.mjs";

const R = resources();
const P = "14adb22b-d474-48a2-8e8f-6d4c067c1953"; // project
const ST = "44af358b-3160-4063-8a89-a868335ff3b5"; // storey
const W = "93791d5d-5beb-437b-b8ec-2f1f0ba4bf3b"; // wall: 2JUHrTM_j3UxZiBnyBfByx
const WIN = "2c2d549f-f9fe-4e22-8590-562fda81a690";
const WT = "25503984-6605-43a1-8597-eae657ff5bea"; // window type
const MAT = "7a187a90-3dcf-58cc-b3a6-51a9a407c55a";
const cls = (code) => ({ "bsi::ifc::class": { code, uri: "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/" + code } });
const base = {
  header: { id: "test", ifcxVersion: "ifcx_alpha", dataVersion: "1.0.0", author: "test", timestamp: "2026-11-21" },
  imports: [],
  schemas: {},
  data: [
    { path: "ab143723-f7b1-5368-b106-55896e88d768", children: { My_Project: P } },
    { path: P, children: { My_Storey: ST }, attributes: cls("IfcProject") },
    { path: ST, children: { Wall: W }, attributes: cls("IfcBuildingStorey") },
    { path: W, children: { Window: WIN, Body: "634f90c3-831e-5f29-a9b2-fa69b207821e" }, attributes: cls("IfcWall") },
    { path: W, attributes: { "bsi::ifc::prop::IsExternal": true, "bsi::ifc::prop::Height": 3.0, "bsi::ifc::prop::Volume": 2.78 } },
    { path: W, attributes: { "nlsfb::class": { code: "21.21", uri: "https://identifier.buildingsmart.org/uri/nlsfb/nlsfb2005/2.2/class/21.21" } } },
    { path: W, inherits: { material: MAT } },
    { path: MAT, attributes: { "bsi::ifc::material": { code: "CONCRETE", uri: "x" } } },
    { path: WIN, inherits: { windowType: WT } },
    { path: WT, attributes: { ...cls("IfcWindow"), "bsi::ifc::prop::IsExternal": true } },
    { path: "634f90c3-831e-5f29-a9b2-fa69b207821e", attributes: { "usd::usdgeom::mesh": { points: [], faceVertexIndices: [] } } },
  ],
};
const text = JSON.stringify(base);
const byType = (m, t) => [...m.entities.values()].filter((e) => e.type === t);

test("an .ifcx file is told from ifcJSON and STEP", () => {
  assert.equal(looksLikeIfcx(text), true);
  assert.equal(looksLikeIfcx(new TextEncoder().encode(text)), true);
  assert.equal(looksLikeIfcx('{"type":"ifcJSON","schemaIdentifier":"IFC4","data":[{"type":"IfcProject"}]}'), false);
  assert.equal(looksLikeIfcx("ISO-10303-21;"), false);
  // A file with no header, nodes only.
  assert.equal(looksLikeIfcx('{"data":[{"path":"x","children":{}}]}'), true);
});

test("a path is the STEP GlobalId; Name is the parent's name for the child", () => {
  assert.equal(guidOfPath(W), "2JUHrTM_j3UxZiBnyBfByx");
  const m = new Model(text, R.schemas, { psets: R.psets });
  assert.equal(m.format, "IFC5");
  assert.equal(m.schemaId, "IFC4X3");
  const [wall] = byType(m, "IFCWALL");
  assert.equal(wall.args[0], "2JUHrTM_j3UxZiBnyBfByx");
  assert.equal(wall.args[2], "Wall");
});

test("a type object reaches its occurrence through inherits and is not an object itself", () => {
  const m = new Model(text, R.schemas, { psets: R.psets });
  const wins = byType(m, "IFCWINDOW");
  assert.equal(wins.length, 1);
  assert.equal(wins[0].args[0], guidOfPath(WIN));
  assert.equal(psetsOf(m, wins[0]).get("Pset_WindowCommon").props.has("IsExternal"), true);
});

test("properties go to the template's set, quantities to the Qto, the rest to the namespace", () => {
  const m = new Model(text, R.schemas, { psets: R.psets });
  const sets = psetsOf(m, byType(m, "IFCWALL")[0]);
  assert.deepEqual([...sets.keys()].sort(), ["Pset_WallCommon", "Qto_WallBaseQuantities", "bsi::ifc::prop"]);
  assert.equal(byType(m, "IFCQUANTITYLENGTH").length, 1);
  // With no templates every property is in its namespace's set.
  const bare = new Model(text, R.schemas);
  assert.deepEqual([...psetsOf(bare, byType(bare, "IFCWALL")[0]).keys()], ["bsi::ifc::prop"]);
});

test("the checker's verdicts: properties, quantities, classification, material, partOf", () => {
  const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
  <specification name="external" ifcVersion="IFC4X3_ADD2"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><property dataType="IFCBOOLEAN"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>IsExternal</simpleValue></baseName><value><simpleValue>true</simpleValue></value></property></requirements></specification>
  <specification name="height" ifcVersion="IFC4X3_ADD2"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><property dataType="IFCLENGTHMEASURE"><propertySet><simpleValue>Qto_WallBaseQuantities</simpleValue></propertySet><baseName><simpleValue>Height</simpleValue></baseName><value><simpleValue>3</simpleValue></value></property></requirements></specification>
  <specification name="nlsfb" ifcVersion="IFC4X3_ADD2"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><classification><value><simpleValue>21.21</simpleValue></value><system><simpleValue>nlsfb</simpleValue></system></classification></requirements></specification>
  <specification name="material" ifcVersion="IFC4X3_ADD2"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><material><value><simpleValue>CONCRETE</simpleValue></value></material></requirements></specification>
  <specification name="on a storey" ifcVersion="IFC4X3_ADD2"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWINDOW</simpleValue></name></entity></applicability><requirements><partOf relation="IFCRELCONTAINEDINSPATIALSTRUCTURE"><entity><name><simpleValue>IFCBUILDINGSTOREY</simpleValue></name></entity></partOf></requirements></specification>
  <specification name="fire rating" ifcVersion="IFC4X3_ADD2"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><property><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName></property></requirements></specification>
  </specifications></ids>`;
  const r = check(ids, new Model(text, R.schemas, { psets: R.psets }), { audit: false });
  assert.deepEqual(r.specs.map((s) => s.status), ["pass", "pass", "pass", "pass", "pass", "fail"]);
  // A second layer adds the fire rating; a list of layers is read weakest first.
  const layer = JSON.stringify({ header: base.header, imports: [], schemas: {}, data: [{ path: W, attributes: { "bsi::ifc::prop::FireRating": "R30" } }] });
  const r2 = check(ids, new Model([text, layer], R.schemas, { psets: R.psets }), { audit: false });
  assert.equal(r2.specs[5].status, "pass");
});

test("composition: a later node wins, null removes, a class code carries a predefined type", () => {
  const S = R.schemas.IFC4X3;
  const doc = {
    data: [
      { path: P, children: { Track: "11111111-1111-4111-8111-111111111111", Gone: "22222222-2222-4222-8222-222222222222" }, attributes: cls("IfcProject") },
      { path: "11111111-1111-4111-8111-111111111111", attributes: cls("IfcRailwayPartTRACK") },
      { path: "22222222-2222-4222-8222-222222222222", attributes: cls("IfcWall") },
      { path: P, children: { Gone: null } },
      { path: "11111111-1111-4111-8111-111111111111", attributes: { "bsi::ifc::prop::Note": "a" } },
      { path: "11111111-1111-4111-8111-111111111111", attributes: { "bsi::ifc::prop::Note": "b" } },
      { path: "33333333-3333-4333-8333-333333333333", attributes: cls("IfcNotAClass") },
    ],
  };
  const p = parseIfcx(JSON.stringify(doc), S, null);
  const part = [...p.entities.values()].find((e) => e.type === "IFCRAILWAYPART");
  assert.deepEqual(part.args[S.attrs("IFCRAILWAYPART").index.get("PredefinedType")], { enum: "TRACK" });
  const agg = [...p.entities.values()].find((e) => e.type === "IFCRELAGGREGATES");
  assert.equal(agg.args[S.attrs("IFCRELAGGREGATES").index.get("RelatedObjects")].length, 1);
  const note = [...p.entities.values()].find((e) => e.type === "IFCPROPERTYSINGLEVALUE");
  assert.deepEqual(note.args[2], { typed: "IFCLABEL", value: "b" });
  assert.ok(p.errors.some((e) => /IfcNotAClass/.test(e)));
});

test("not JSON, or no data list, is said", () => {
  assert.throws(() => new Model('{"ifcxVersion": "x", ', R.schemas), /IFC5 model not read/);
  assert.throws(() => new Model('{"ifcxVersion": "x", "data": 3}', R.schemas), /no IFC5 "data" list/);
});

test("systems: members assigned to the system, port connections and flow direction", () => {
  // Shaped like buildingSMART's domestic-hot-water.ifcx: a system node under
  // an unclassed root, bsi::ifc::system::partofsystem on its members,
  // connectsto written on both ports of a connection.
  const SYS = "6832774b-b948-43cc-9b7e-4bb2024e162a", PIPE = "5b477df7-581a-4bab-b94c-7ab539a932d1", TANK = "1fff93af-f514-40dd-8e1c-deaf0d149369";
  const PA = "2c9b0c05-d5cd-4b01-a769-41be68f6ac88", PB = "d72c35b8-97cf-4d55-8dd4-3d8bddb3c810", LONE = "b0a153c6-32ba-4f40-a8d8-db7ce06ff4a1";
  const doc = {
    data: [
      { path: "2a22c4a4-48a6-54a1-bdc7-ccc1af978446", children: { water_supply: SYS } },
      { path: P, children: { My_Storey: ST }, attributes: cls("IfcProject") },
      { path: ST, children: { Pipe: PIPE, Tank: TANK, Lone: LONE }, attributes: cls("IfcBuildingStorey") },
      { path: SYS, attributes: cls("IfcDistributionSystem") },
      { path: SYS, attributes: { "bsi::ifc::system::servicesfacility": [{ ref: "e84dc79e-fe9d-4781-9f4b-54dd435cca91" }] } },
      { path: PIPE, children: { pipe_out: PA }, attributes: { ...cls("IfcPipeSegment"), "bsi::ifc::system::partofsystem": [{ ref: SYS }] } },
      { path: TANK, children: { tank_in: PB }, attributes: { ...cls("IfcTank"), "bsi::ifc::system::partofsystem": [{ ref: SYS }] } },
      { path: LONE, attributes: { ...cls("IfcValve"), "bsi::ifc::system::partofsystem": [{ ref: PIPE }] } },
      { path: PA, attributes: { ...cls("IfcDistributionPort"), "bsi::ifc::system::connectsto": [{ ref: PB }], "bsi::ifc::system::flowdirection": "SOURCE" } },
      { path: PB, attributes: { ...cls("IfcDistributionPort"), "bsi::ifc::system::connectsto": [{ ref: PA }], "bsi::ifc::system::flowdirection": "SINK" } },
    ],
  };
  const text = JSON.stringify(doc);
  const m = new Model(text, R.schemas, { psets: R.psets });
  const p = parseIfcx(text, R.schemas.IFC4X3, R.psets);
  const groups = byType(m, "IFCRELASSIGNSTOGROUP");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].args[groups[0].args.length - 1].ref, byType(m, "IFCDISTRIBUTIONSYSTEM")[0].id);
  // One IfcRelConnectsPorts for the pair, though both ports name it.
  assert.equal(byType(m, "IFCRELCONNECTSPORTS").length, 1);
  // The system is assigned, not placed in the spatial tree.
  const sysId = byType(m, "IFCDISTRIBUTIONSYSTEM")[0].id;
  for (const r of [...byType(m, "IFCRELAGGREGATES"), ...byType(m, "IFCRELCONTAINEDINSPATIALSTRUCTURE")]) assert.ok(!JSON.stringify(r.args).includes(`{"ref":${sysId}}`));
  // A facility no node has, and membership of something that is no system, are said.
  assert.ok(p.errors.some((e) => /servicesfacility .* names no classed object/.test(e)));
  assert.ok(p.errors.some((e) => /partofsystem names .* a IFCPIPESEGMENT, not a system/.test(e)));
  const spec = (name, app, req) => `<specification name="${name}" ifcVersion="IFC4X3_ADD2"><applicability minOccurs="1" maxOccurs="unbounded">${app}</applicability><requirements>${req}</requirements></specification>`;
  const ent = (n) => `<entity><name><simpleValue>${n}</simpleValue></name></entity>`;
  const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
  ${spec("pipes in a system", ent("IFCPIPESEGMENT"), `<partOf relation="IFCRELASSIGNSTOGROUP">${ent("IFCDISTRIBUTIONSYSTEM")}</partOf>`)}
  ${spec("valves in a system", ent("IFCVALVE"), `<partOf relation="IFCRELASSIGNSTOGROUP">${ent("IFCDISTRIBUTIONSYSTEM")}</partOf>`)}
  ${spec("ports say their direction", ent("IFCDISTRIBUTIONPORT"), `<attribute><name><simpleValue>FlowDirection</simpleValue></name></attribute>`)}
  ${spec("sources", `${ent("IFCDISTRIBUTIONPORT")}<attribute><name><simpleValue>FlowDirection</simpleValue></name><value><simpleValue>SOURCE</simpleValue></value></attribute>`, `<partOf relation="IFCRELNESTS">${ent("IFCPIPESEGMENT")}</partOf>`)}
  </specifications></ids>`;
  const r = check(ids, m, { audit: false });
  assert.deepEqual(r.specs.map((s) => s.status), ["pass", "fail", "pass", "pass"]);
  assert.equal(r.specs[3].applicable, 1);
});
