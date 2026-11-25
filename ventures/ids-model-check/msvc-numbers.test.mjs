// Exporters that printf a double without checking it write the Microsoft C
// runtime's 1.#INF, -1.#INF, -1.#IND, 1.#QNAN (xBIM's FormallyIllegalFile.ifc,
// eval/xbim-test-files-2026-11-24.md). The reader used to drop the whole
// record, so a property holding one went missing and an optional check on it
// passed. It now reads them as Infinity / NaN with a reader note.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { check, parseModel } from "./node.mjs";
import { modelInventory } from "./inventory.mjs";
import { modelValueOffer } from "./editor.mjs";

const POINT = `ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;
#2=IFCCARTESIANPOINT((-1.#INF,-1.#IND,1.#INF));
#3=IFCCARTESIANPOINT((1.#QNAN00,1.#INF00,2.5));
#4=IFCCARTESIANPOINT((1.6E10,3.,1.));
ENDSEC;END-ISO-10303-21;`;

for (const eager of [false, true]) for (const bytes of [false, true]) {
  test(`MSVC infinity and NaN spellings are read, not dropped (eager ${eager}, bytes ${bytes})`, () => {
    const m = parseStep(bytes ? new TextEncoder().encode(POINT) : POINT, { eager });
    assert.deepEqual(m.entities.get(2).args, [[-Infinity, NaN, Infinity]]);
    assert.deepEqual(m.entities.get(3).args, [[NaN, Infinity, 2.5]]);
    assert.deepEqual(m.entities.get(4).args, [[16000000000, 3, 1]]);
    assert.deepEqual(m.errors, [
      "#2: -1.#INF read as -Infinity (a Microsoft C runtime spelling, not ISO 10303-21)",
      "#3: 1.#QNAN00 read as NaN (a Microsoft C runtime spelling, not ISO 10303-21)",
    ]);
  });
}

test("a lazily read record is noted once, however often it is read", () => {
  const m = parseStep(POINT);
  for (let i = 0; i < 3; i++) for (const id of [2, 3]) void m.entities.get(id).args;
  assert.equal(m.errors.length, 2);
});

test("'#' after a number not ending in '.' is still an error", () => {
  const m = parseStep(`ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;\n#2=IFCCARTESIANPOINT((1#INF,0.,0.));\nENDSEC;END-ISO-10303-21;`, { eager: true });
  assert.equal(m.entities.has(2), false);
  assert.match(m.errors[0], /^#2: expected , or \)/);
});

const ifc = readFileSync(new URL("./samples/edge/msvc-inf-nan.ifc", import.meta.url), "utf8");
const ids = readFileSync(new URL("./samples/edge/msvc-inf-nan.ids.xml", import.meta.url), "utf8");

test("a property written 1.#INF fails a range on it instead of going missing", () => {
  const r = check(ids, ifc);
  assert.equal(r.parseErrors.length, 2);
  // Acme.ThermalTransmittance: 0.3 (W-01), 0.5 (W-02), 1.#INF (P-01, #22).
  // Before, P-01's record was dropped and the optional check passed it.
  const [u, t] = r.specs;
  assert.equal(u.applicable, 3);
  assert.deepEqual(u.failed.map((f) => f.id), [22]);
  assert.match(u.failed[0].reasons[0], /ThermalTransmittance is Infinity, not <= 1$/);
  // Acme.Thickness: 0.2 on W-01, -1.#IND on W-02. Before, W-02 had no
  // Thickness, so the spec applied to W-01 only and passed.
  assert.equal(t.applicable, 2);
  assert.deepEqual(t.failed.map((f) => f.id), [21]);
  assert.match(t.failed[0].reasons[0], /Thickness is NaN, not >= 0$/);
});

test("the editor lists INF and NaN, keeps them out of the range and offers no one-of", () => {
  const inv = modelInventory(parseModel(ifc));
  const wall = inv.classes.find((c) => c.cls === "IFCWALL");
  const acme = wall.sets.find((s) => s.name === "Acme");
  const u = acme.props.find((p) => p.name === "ThermalTransmittance");
  assert.deepEqual(u.values.map(([v]) => v).sort(), ["0.3", "0.5", "INF"]);
  assert.equal(u.min, 0.3);
  assert.equal(u.max, 0.5);
  const offer = modelValueOffer(u, "number");
  assert.deepEqual(offer.nonFinite, [["INF", 1]]);
  assert.equal(offer.oneOf, null);
  assert.equal(offer.rangeMax, "0.5");
});
