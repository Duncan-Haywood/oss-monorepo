import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resources, check } from "./node.mjs";
import { fillModel, fillReport } from "./model-fill.mjs";
import { Model } from "./ids.mjs";
import { geometryLookup, measureModel } from "./geometry-quantities.mjs";
import { learnedDensities, memberWeights, modelDensities, parseDensities, addWeights } from "./weights.mjs";

const SAMPLE = new URL("../ifc-quantity-takeoff/samples/sample-office.ifc", import.meta.url);
const have = existsSync(SAMPLE);
let seed = 11;
const random = () => Uint8Array.from({ length: 16 }, () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255);

const row = (id, material, stored = {}, computed = { status: "ok", gross: 1, net: 1 }) => ({ id, ifcType: "IFCBEAM", material, computed, stored: Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, { kind: /Weight$/.test(k) ? "weight" : "volume", value: v }])) });
const noModel = { entities: new Map() };

test("a material's density is learned only when every stored weight agrees with one figure", () => {
  const rows = [
    row(1, "STEEL/S235JR", { NetWeight: 80, NetVolume: 0.01 }),
    row(2, "STEEL/S235JR", { NetWeight: 160.4, NetVolume: 0.02 }), // 8020: within 0.5%
    row(3, "TIMBER", { NetWeight: 6, NetVolume: 0.01 }),
    row(4, "TIMBER", { NetWeight: 9, NetVolume: 0.01 }), // disagrees
    row(5, "PVC", { NetWeight: 13, NetVolume: 0.01 }), // only one
    row(6, "Concrete / Insulation", { NetWeight: 20, NetVolume: 0.01 }), // layered: never learned
  ];
  const { densities, materials } = learnedDensities(rows);
  assert.deepEqual([...densities], [["steel/s235jr", 8010]]);
  assert.match(materials.find((m) => m.material === "TIMBER").why, /2 of 2 ratios/);
  assert.match(materials.find((m) => m.material === "PVC").why, /only 1 element/);
  assert.equal(materials.some((m) => /Insulation/.test(m.material)), false);
});

test("weights: the stored volume first, the body's volume otherwise; net with net, gross with gross", () => {
  const rows = [
    row(1, "STEEL/S235JR", { NetWeight: 80, NetVolume: 0.01 }),
    row(2, "STEEL/S235JR", { NetWeight: 160, NetVolume: 0.02 }),
    row(3, "STEEL/S235JR", { NetVolume: 0.03 }, { status: "ok", gross: 0.05, net: 0.04 }),
    row(4, "STEEL/S235JR", {}, { status: "ok", gross: 0.05, net: 0.04 }),
    row(5, "STEEL/S235JR", {}, { status: "not read" }),
    row(6, "Unknown"),
  ];
  const w = memberWeights(noModel, rows);
  assert.equal(w.byId.get(3).NetWeight.value, 240); // stored NetVolume x 8000
  assert.equal(w.byId.get(3).GrossWeight.value, 400); // no stored gross: the body's
  assert.equal(w.byId.get(4).NetWeight.value, 320);
  assert.equal(w.byId.get(3).NetWeight.from, "stored-weights");
  assert.equal(w.byId.has(5), false);
  assert.equal(w.byId.has(6), false);
  // The table wins over what the weights imply; names match case-blind.
  const t = memberWeights(noModel, rows, { densities: parseDensities("steel/s235jr,7850") });
  assert.equal(t.byId.get(4).NetWeight.value, 0.04 * 7850);
  assert.equal(t.sources.get("steel/s235jr").from, "table");
  // learn: false and no table: nothing
  assert.equal(memberWeights(noModel, rows, { learn: false }).byId.size, 0);
  // merged under the weight kind
  const out = addWeights(new Map([[4, new Map([["NetVolume", { value: 0.04, kind: "volume" }]])]]), t);
  assert.deepEqual([...out.get(4).keys()], ["NetVolume", "NetWeight", "GrossWeight"]);
  assert.equal(out.get(4).get("NetWeight").kind, "weight");
});

test("the density table reads CSV (header allowed, commas in names) and NAME=VALUE lists", () => {
  assert.deepEqual([...parseDensities("material,density\nSteel S355,7850\n\"Concrete, C30/37\",2400\nbad,x\n")], [["steel s355", 7850], ["\"concrete, c30/37\"".replace(/"/g, ""), 2400]]);
  assert.deepEqual([...parseDensities("Steel S355=7850; Timber=480")], [["steel s355", 7850], ["timber", 480]]);
  assert.equal(parseDensities("").size, 0);
});

test("a model's own material densities: IFC4 Pset_MaterialCommon and IFC2x3 general properties, ARCHICAD's 0 ignored", () => {
  const E = new Map([
    [1, { type: "IFCMATERIAL", args: ["Aluminium"] }],
    [2, { type: "IFCMATERIAL", args: ["Plaster"] }],
    [3, { type: "IFCMATERIAL", args: ["Old steel"] }],
    [10, { type: "IFCPROPERTYSINGLEVALUE", args: ["MassDensity", null, { typed: "IFCMASSDENSITYMEASURE", value: 2800 }, null] }],
    [11, { type: "IFCMATERIALPROPERTIES", args: ["Pset_MaterialCommon", null, [{ ref: 10 }], { ref: 1 }] }],
    [12, { type: "IFCPROPERTYSINGLEVALUE", args: ["MassDensity", null, { typed: "IFCMASSDENSITYMEASURE", value: 0 }, null] }],
    [13, { type: "IFCMATERIALPROPERTIES", args: ["Pset_MaterialCommon", null, [{ ref: 12 }], { ref: 2 }] }],
    [14, { type: "IFCGENERALMATERIALPROPERTIES", args: [{ ref: 3 }, null, null, 7800] }],
  ]);
  const d = modelDensities({ entities: E });
  assert.deepEqual([...d], [["aluminium", 2800], ["old steel", 7800]]);
  const w = memberWeights({ entities: E }, [row(1, "Aluminium"), row(2, "Plaster")]);
  assert.equal(w.byId.get(1).NetWeight.value, 2800);
  assert.equal(w.byId.get(1).NetWeight.from, "material");
  assert.equal(w.byId.has(2), false);
});

const ids = (specs) => `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;
const spec = (cls, req) => `<specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>${cls}</simpleValue></name></entity></applicability><requirements>${req}</requirements></specification>`;
const prop = (ps, pn, dt) => `<property dataType="${dt}"><propertySet><simpleValue>${ps}</simpleValue></propertySet><baseName><simpleValue>${pn}</simpleValue></baseName></property>`;

test("the fill writes NetWeight from a typed density, and none without one", { skip: !have && "ifc-quantity-takeoff not beside this folder" }, async () => {
  const text = readFileSync(SAMPLE, "utf8");
  const I = ids(spec("IFCBEAM", prop("Qto_BeamBaseQuantities", "NetWeight", "IFCMASSMEASURE")));
  const none = fillModel(I, text, { ...resources(), random, geometry: geometryLookup(await measureModel(text)) });
  assert.equal(none.fromGeometry, 0);
  const measured = await measureModel(text, { densities: "Steel S355=7850" });
  const r = fillModel(I, text, { ...resources(), random, geometry: geometryLookup(measured) });
  // The IPE 200 beam stores NetVolume 0.0142 m3 (its body measures 0.0114):
  // the weight is what the stored volume weighs, as an exporter's would be,
  // and GrossWeight, with no stored gross volume, is the body's.
  assert.deepEqual(r.writtenList.map((w) => [w.id, w.value, w.source]), [[600, "111.47", "geometry"]]);
  assert.ok(Math.abs(measured.get(600).get("GrossWeight").value - measured.get(600).get("GrossVolume").value * 7850) < 1e-9);
  assert.equal(check(I, new Model(r.text, resources().schemas)).specs[0].status, "pass");
  assert.match(fillReport(r), /measured from the element's geometry/);
});
