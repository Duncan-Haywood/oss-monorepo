// Cycles of wholes (conformance.mjs decompositionCycles,
// eval/decomposition-cycles-2026-11-24.md): two records that are each
// other's parts pass every schema rule, and IfcTester's partOf never returns
// on them. The check names the cycle, notes the failing rows it reaches, and
// a partOf facet does not list an element as its own whole.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resources, check } from "./node.mjs";
import { conformance, markModelRules } from "./conformance.mjs";
import { seedCycle, seedAndConform, FAMILIES } from "./eval/decomposition-cycles.mjs";

const HEAD = (schema) => `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('','2026-11-24T00:00:00',(''),(''),'t','t','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n`;
const file = (schema, data) => HEAD(schema) + data.trim() + "\nENDSEC;\nEND-ISO-10303-21;\n";
const R = resources();
const conf = (schema, data) => conformance(file(schema, data), R.schemas, { rules: R.rules });
const codes = (c) => c.findings.map((f) => f.code);

const TWO = `#1=IFCELEMENTASSEMBLY('2CbOYFeCHBku9$oytmyQ2e',$,'A',$,$,$,$,$,.NOTDEFINED.,.NOTDEFINED.);
#2=IFCELEMENTASSEMBLY('3g5hZOvez0U9ta9w2d8T5$',$,'B',$,$,$,$,$,.NOTDEFINED.,.NOTDEFINED.);
#3=IFCBEAM('1AftmW30PC4xMJ7tU7EJK8',$,'beam',$,$,$,$,$,.BEAM.);
#4=IFCRELAGGREGATES('0B3vnDCO9Cfg4Q09lNwjms',$,$,$,#1,(#2));
#5=IFCRELAGGREGATES('1iBd2lkrX61vZxF9AnXLa0',$,$,$,#2,(#1));
#6=IFCRELAGGREGATES('2Wq8Dqf2v7Fh4K1x9dSwvC',$,$,$,#2,(#3));`;

test("two assemblies holding each other: only the cycle check names it", () => {
  const c = conf("IFC4", TWO);
  assert.deepEqual(codes(c), ["decomposition-cycle"]);
  const f = c.findings[0];
  assert.equal(f.id, 1);
  assert.equal(f.attr, "IfcRelAggregates");
  assert.match(f.message, /#1 in #2 in #1/);
  assert.match(f.message, /the 1 record below them/);
  // Every element in the loop or below it carries a note for the report rows.
  assert.deepEqual([...c.elementRules.keys()].sort(), [1, 2, 3]);
  // The clean twin: drop the closing relationship.
  assert.deepEqual(codes(conf("IFC4", TWO.replace(/#5=.*\n/, ""))), []);
  // IFC2X3 and IFC4X3 alike.
  assert.deepEqual(codes(conf("IFC4X3_ADD2", TWO)), ["decomposition-cycle"]);
});

test("a cycle across relationships: containment, voids and fills", () => {
  // A wall contained in a storey that the wall then aggregates. The storey's
  // second Decomposes is an inverse count; the cycle is named as well.
  const mixed = `#1=IFCBUILDINGSTOREY('2CbOYFeCHBku9$oytmyQ2e',$,'S',$,$,$,$,$,.ELEMENT.,0.);
#2=IFCWALL('3g5hZOvez0U9ta9w2d8T5$',$,'W',$,$,$,$,$,.SOLIDWALL.);
#3=IFCRELCONTAINEDINSPATIALSTRUCTURE('0B3vnDCO9Cfg4Q09lNwjms',$,$,$,(#2),#1);
#4=IFCRELAGGREGATES('1iBd2lkrX61vZxF9AnXLa0',$,$,$,#2,(#1));`;
  const c = conf("IFC4", mixed);
  const f = c.findings.find((x) => x.code === "decomposition-cycle");
  assert.ok(f);
  assert.equal(f.attr, "IfcRelAggregates + IfcRelContainedInSpatialStructure");
  // An opening in a wall that the wall fills.
  const vf = `#1=IFCWALL('3g5hZOvez0U9ta9w2d8T5$',$,'W',$,$,$,$,$,.SOLIDWALL.);
#2=IFCOPENINGELEMENT('2CbOYFeCHBku9$oytmyQ2e',$,$,$,$,$,$,$,.OPENING.);
#3=IFCRELVOIDSELEMENT('0B3vnDCO9Cfg4Q09lNwjms',$,$,$,#1,#2);
#4=IFCRELFILLSELEMENT('1iBd2lkrX61vZxF9AnXLa0',$,$,$,#2,#1);`;
  const g = conf("IFC4", vf).findings.find((x) => x.code === "decomposition-cycle");
  assert.ok(g, "voids + fills loop named");
  assert.match(g.message, /IfcRelVoidsElement #3/);
  assert.match(g.message, /IfcRelFillsElement #4/);
  // Two groups, each assigned to the other.
  const gr = `#1=IFCGROUP('2CbOYFeCHBku9$oytmyQ2e',$,'G1',$,$);
#2=IFCGROUP('3g5hZOvez0U9ta9w2d8T5$',$,'G2',$,$);
#3=IFCRELASSIGNSTOGROUP('0B3vnDCO9Cfg4Q09lNwjms',$,$,$,(#2),$,#1);
#4=IFCRELASSIGNSTOGROUP('1iBd2lkrX61vZxF9AnXLa0',$,$,$,(#1),$,#2);`;
  const h = conf("IFC4", gr).findings.find((x) => x.code === "decomposition-cycle");
  assert.ok(h, "group loop named");
  assert.equal(h.attr, "IfcRelAssignsToGroup");
});

test("a record listed among its own parts stays the WHERE rule's", () => {
  const self = `#1=IFCELEMENTASSEMBLY('2CbOYFeCHBku9$oytmyQ2e',$,'A',$,$,$,$,$,.NOTDEFINED.,.NOTDEFINED.);
#2=IFCRELAGGREGATES('0B3vnDCO9Cfg4Q09lNwjms',$,$,$,#1,(#1));`;
  const c = conf("IFC4", self);
  assert.ok(!codes(c).includes("decomposition-cycle"));
  assert.ok(c.findings.some((f) => /NoSelfReference/.test(f.attr)));
});

test("a deep chain and a three-record loop: no stack overflow, one finding", () => {
  const lines = [];
  const N = 20000;
  for (let i = 1; i <= N; i++) lines.push(`#${i}=IFCELEMENTASSEMBLY('${String(i).padStart(22, "0")}',$,$,$,$,$,$,$,.NOTDEFINED.,.NOTDEFINED.);`);
  for (let i = 1; i < N; i++) lines.push(`#${N + i}=IFCRELAGGREGATES('${String(N + i).padStart(22, "1")}',$,$,$,#${i},(#${i + 1}));`);
  assert.deepEqual(codes(conformance(file("IFC4", lines.join("\n")), R.schemas)), []);
  // Close a loop of three at the top: #3 holds #1.
  lines.push(`#${3 * N}=IFCRELAGGREGATES('${"2".repeat(22)}',$,$,$,#3,(#1));`);
  const c = conformance(file("IFC4", lines.join("\n")), R.schemas);
  assert.deepEqual(codes(c), ["decomposition-cycle"]);
  assert.match(c.findings[0].message, /#1 in #3 in #2 in #1/);
  assert.match(c.findings[0].message, new RegExp(`the ${(N - 3).toLocaleString("en-US")} records below them`));
});

test("a partOf row on a cycle: no self in its wholes, and the cycle note", () => {
  const ids = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
<specification name="assemblies in a building" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCELEMENTASSEMBLY</simpleValue></name></entity></applicability>
<requirements><partOf relation="IFCRELAGGREGATES" cardinality="required"><entity><name><simpleValue>IFCBUILDING</simpleValue></name></entity></partOf></requirements></specification>
<specification name="part of an assembly" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCELEMENTASSEMBLY</simpleValue></name></entity></applicability>
<requirements><partOf relation="IFCRELAGGREGATES" cardinality="required"><entity><name><simpleValue>IFCELEMENTASSEMBLY</simpleValue></name></entity></partOf></requirements></specification>
</specifications></ids>`;
  const text = file("IFC4", TWO);
  const report = check(ids, text);
  const rows = report.specs[0].failed;
  assert.equal(rows.length, 2);
  const a = rows.find((r) => r.id === 1);
  // A's only whole is B: the walk comes back to A and does not count it.
  assert.match(a.reason || a.why || JSON.stringify(a), /is part of IFCELEMENTASSEMBLY #2, none/);
  assert.doesNotMatch(JSON.stringify(a), /IFCELEMENTASSEMBLY #1/);
  // Each is part of the other, which is an assembly: the second spec passes.
  assert.equal(report.specs[1].failed.length, 0);
  assert.equal(markModelRules(report, conformance(text, R.schemas, { rules: R.rules })), 2);
  assert.match(a.modelRules.join("\n"), /its part-of tree, a cycle #1 in #2 in #1/);
});

test("the eval seeds close a loop on the bundled sample, and the check names it", () => {
  const tiny = readFileSync(new URL("./samples/tiny-house.ifc", import.meta.url), "utf8");
  const seen = [];
  for (const fam of FAMILIES) {
    const r = seedAndConform(tiny, fam);
    if (!r) continue;
    seen.push(fam);
    assert.ok(r.added.some((k) => k.startsWith("decomposition-cycle|")), fam);
    assert.deepEqual(r.lost, [], fam);
  }
  // The sample has spatial aggregation and containment, no assemblies or nests.
  assert.deepEqual(seen, ["spatial-cycle", "containment-cycle"]);
  assert.equal(seedCycle(tiny, "assembly-cycle"), null);
});
