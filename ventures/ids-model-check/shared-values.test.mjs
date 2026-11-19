// Shared values, exact-length lists and unkept relationship arguments
// (step.mjs Interner, Reader.list; ids.mjs Model policy;
// eval/shared-values-2026-11-18.md). The lazy reader shares repeated small
// values; what it hands back must equal what the eager reader (no sharing)
// reads, on every entity of every bundled model.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep, Interner, DERIVED, UNKNOWN } from "./step.mjs";
import { parseModel } from "./node.mjs";

const models = ["samples/tiny-house.ifc", "samples/bsi-ifc43/Building-Hvac.ifc", "samples/bsi-ifc43/Infra-Rail.ifc", "samples/bsi-ifc43/Infra-Road.ifc"];
const text = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("lazy shared values equal the eager reader's, on every entity of the bundled models", () => {
  let typed = 0;
  for (const f of models) {
    const t = text(f);
    const lazy = parseStep(t), eager = parseStep(t, { eager: true });
    assert.equal(lazy.entities.size, eager.entities.size, f);
    for (const e of eager.entities.values()) {
      const l = lazy.entities.get(e.id);
      assert.deepEqual(l.args, e.args, `${f} #${e.id}`);
      assert.deepEqual(l.args, e.args, `${f} #${e.id}, second read`);
      const hasTyped = (v) => Array.isArray(v) ? v.some(hasTyped) : !!(v && v.typed);
      if (hasTyped(l.args)) typed++;
    }
  }
  assert.ok(typed > 0, `typed values were compared (${typed})`);
});

test("a typed value with the same type and scalar is one frozen object; different types or values are not", () => {
  const t = `ISO-10303-21;\nHEADER;FILE_SCHEMA(('IFC4'));ENDSEC;\nDATA;\n#1=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$);\n#2=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$);\n#3=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCLOGICAL(.T.),$);\n#4=IFCPROPERTYSINGLEVALUE('Width',$,IFCLENGTHMEASURE(1.),$);\n#5=IFCPROPERTYSINGLEVALUE('Width',$,IFCLABEL('1'),$);\n#6=IFCPROPERTYSINGLEVALUE('Width',$,IfcLengthMeasure(1.),$);\n#7=IFCX(*,.U.,.ELEMENT.,.ELEMENT.,IFCLIST((1,2)),IFCLIST((1,2)));\nENDSEC;END-ISO-10303-21;`;
  const { entities: E } = parseStep(t);
  const a = (id) => E.get(id).args;
  assert.equal(a(1)[2], a(2)[2]);
  assert.ok(Object.isFrozen(a(1)[2]));
  assert.deepEqual(a(1)[2], { typed: "IFCBOOLEAN", value: true });
  assert.notEqual(a(1)[2], a(3)[2], "type name is part of the key");
  assert.notEqual(a(4)[2], a(5)[2], "1 and '1' differ");
  assert.equal(a(4)[2], a(6)[2], "type names are upper-cased before sharing");
  assert.equal(a(1)[0], a(2)[0]);
  const x = a(7);
  assert.equal(x[0], DERIVED);
  assert.equal(x[1], UNKNOWN);
  assert.equal(x[2], x[3], "enumerations shared");
  assert.deepEqual(x[2], { enum: "ELEMENT" });
  assert.notEqual(x[4], x[5], "a typed list is not shared");
  assert.deepEqual(x[4], x[5]);
});

test("the tables stop growing at their cap and go on answering", () => {
  const i = new Interner();
  const first = i.typedOf("IFCLABEL", "a0");
  for (let k = 1; k < 70000; k++) { i.typedOf("IFCLABEL", "a" + k); i.string("s" + k); }
  assert.equal(i.typedCount, 1 << 16);
  assert.equal(i.strings.size, 1 << 16);
  assert.equal(i.typedOf("IFCLABEL", "a0"), first, "an entry made before the cap is still shared");
  const late = i.typedOf("IFCLABEL", "a69999");
  assert.deepEqual(late, { typed: "IFCLABEL", value: "a69999" });
  assert.notEqual(i.typedOf("IFCLABEL", "a69999"), late, "past the cap, a new value is made each time");
  const long = "x".repeat(65);
  assert.equal(i.typedOf("IFCTEXT", long).value, long);
  assert.equal(i.typed.get("IFCTEXT"), undefined, "long strings are not kept");
});

test("relationships are indexed once and their arguments not kept; geometry not kept; the rest kept", () => {
  const m = parseModel(text("samples/bsi-ifc43/Infra-Road.ifc"));
  const S = m.schema;
  let rels = 0, objects = 0;
  for (const e of m.entities.values()) {
    const kept = typeof e._a !== "number";
    if (S.isA(e.type, "IFCRELATIONSHIP")) { rels++; assert.equal(kept, false, `#${e.id} ${e.type}`); }
    if (S.isA(e.type, "IFCREPRESENTATIONITEM")) assert.equal(kept, false, `#${e.id} ${e.type}`);
  }
  assert.ok(rels > 10);
  // A relationship read again reads the same arguments.
  const rel = [...m.entities.values()].find((e) => S.isA(e.type, "IFCRELATIONSHIP"));
  assert.deepEqual(rel.args, parseStep(text("samples/bsi-ifc43/Infra-Road.ifc"), { eager: true }).entities.get(rel.id).args);
  assert.equal(typeof rel._a, "number");
  assert.ok(m.psetRels.size + m.parents.IFCRELAGGREGATES.size > 0, "the index was built");
  for (const e of m.entities.values()) if (S.isA(e.type, "IFCROOT") && !S.isA(e.type, "IFCRELATIONSHIP")) { void e.args; assert.notEqual(typeof e._a, "number", `#${e.id} kept`); objects++; }
  assert.ok(objects > 10);
});
