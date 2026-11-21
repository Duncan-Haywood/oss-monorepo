import { test } from "node:test";
import assert from "node:assert/strict";
import { resources, check } from "./node.mjs";
import { fillModel, planFill, toFillCsv, readValues, newGlobalId, stepString, stepReal, splitArgs, fillReport } from "./model-fill.mjs";
import { Model } from "./ids.mjs";
import { decodeStepString } from "./step.mjs";

let seed = 1;
const random = () => Uint8Array.from({ length: 16 }, () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255);
const fill = (ids, ifc, opts = {}) => fillModel(ids, ifc, { ...resources(), random, ...opts });

const head = (schema) => `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('t.ifc','2026-11-21T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('${schema}'));
ENDSEC;
DATA;
`;
const MODEL = head("IFC4") + `#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',#2,'P',$,$,$,$,$,#3);
#2=IFCOWNERHISTORY(#4,#4,$,.ADDED.,$,$,$,0);
#3=IFCUNITASSIGNMENT((#5));
#4=IFCPERSONANDORGANIZATION($,$,$);
#5=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCWALL('3vB2YO$MX4xv5uCqZZG05x',$,'W-01',$,$,$,$,$,.SOLIDWALL.);
#11=IFCWALL('1Lz5$gbjv4GQ6_kuh4Wa3J',$,'W-02',$,$,$,$,$,.SOLIDWALL.);
#12=IFCWALL('0Dqu2kwjbCmOwB7c2iZvUo',$,'W-03',$,$,$,$,$,.SOLIDWALL.);
#13=IFCDOOR('2HZIdgNmz5bROhh9k9DLyK',$,'D-01',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);
#14=IFCDOOR('3W3k8ZkmvBexEm6bTnqzhD',$,'D-02',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);
#15=IFCSLAB('0jvCJ6a3P7fAhZcqKfbbN8',$,'S-01',$,$,$,$,$,.FLOOR.);
#20=IFCPROPERTYSET('2XtwYdQJvA_eZmLqT9e9cw',#2,'Pset_WallCommon',$,(#21));
#21=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#22=IFCRELDEFINESBYPROPERTIES('1kH1k8oQr1ZvL2xk4yVQmB',#2,$,$,(#10,#11),#20);
#23=IFCRELDEFINESBYPROPERTIES('1kH1k8oQr1ZvL2xk4yVQmC',#2,$,$,(#12),#20);
#30=IFCDOORTYPE('0Hc3T8vRj6Yw0Pq9xZ2eQb',#2,'DT',$,$,(#31),$,$,$,.DOOR.,.SINGLE_SWING_LEFT.,$,$);
#31=IFCPROPERTYSET('1aB2cD3eF4gH5iJ6kL7mN8',#2,'Pset_DoorCommon',$,(#32));
#32=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI30'),$);
#33=IFCRELDEFINESBYTYPE('2Ab3Cd4Ef5Gh6Ij7Kl8Mn9',#2,$,$,(#13,#14),#30);
ENDSEC;
END-ISO-10303-21;
`;
const ids = (specs) => `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;
const spec = (cls, req, name = "s") => `<specification name="${name}" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>${cls}</simpleValue></name></entity></applicability><requirements>${req}</requirements></specification>`;
const prop = (ps, pn, dt, value = "") => `<property${dt ? ` dataType="${dt}"` : ""}><propertySet><simpleValue>${ps}</simpleValue></propertySet><baseName><simpleValue>${pn}</simpleValue></baseName>${value}</property>`;
const simple = (v) => `<value><simpleValue>${v}</simpleValue></value>`;
const oneOf = (...vs) => `<value><xs:restriction base="xs:string">${vs.map((v) => `<xs:enumeration value="${v}"/>`).join("")}</xs:restriction></value>`;
const lines = (t) => t.split("\n");

test("a fixed value the IDS states goes into a set every holder shares, in place", () => {
  const I = ids(spec("IFCWALL", prop("Pset_WallCommon", "LoadBearing", "IFCBOOLEAN", simple("true"))));
  const r = fill(I, MODEL);
  assert.equal(r.written, 3);
  assert.deepEqual(r.sets, { edited: 1, copied: 0, added: 0 });
  assert.equal(r.verified.pass, 3);
  assert.equal(r.after.pass, true);
  assert.match(r.text, /#20=IFCPROPERTYSET\('2XtwYdQJvA_eZmLqT9e9cw',#2,'Pset_WallCommon',\$,\(#21,#34\)\);/);
  assert.match(r.text, /#34=IFCPROPERTYSINGLEVALUE\('LoadBearing',\$,IFCBOOLEAN\(\.T\.\),\$\);\nENDSEC;/);
  // Every line the fill did not touch is as it was.
  const a = lines(MODEL), b = lines(r.text);
  assert.equal(b.filter((l) => !a.includes(l)).length, 2);
});

test("a shared set gets a copy for the elements whose value differs; the others keep it", () => {
  const I = ids(spec("IFCWALL", prop("Pset_WallCommon", "LoadBearing", "IFCBOOLEAN")));
  const values = readValues(toFillCsv([]) + "3vB2YO$MX4xv5uCqZZG05x,IFCWALL,W-01,Pset_WallCommon,LoadBearing,IFCBOOLEAN,,true\r\n1Lz5$gbjv4GQ6_kuh4Wa3J,IFCWALL,W-02,Pset_WallCommon,LoadBearing,IFCBOOLEAN,,true\r\n0Dqu2kwjbCmOwB7c2iZvUo,IFCWALL,W-03,Pset_WallCommon,LoadBearing,IFCBOOLEAN,,false\r\n");
  const r = fill(I, MODEL, { values });
  assert.equal(r.written, 3);
  assert.equal(r.fromTable, 3);
  // W-01 and W-02 (two of three holders) keep #20, edited; W-03's relationship moves to a copy.
  assert.deepEqual(r.sets, { edited: 1, copied: 1, added: 0 });
  assert.equal(r.verified.pass, 3);
  const m = new Model(r.text, resources().schemas);
  const lb = (id) => { const res = check(ids(spec("IFCWALL", prop("Pset_WallCommon", "LoadBearing", "IFCBOOLEAN", simple("true")))), m); return !res.specs[0].failed.some((f) => f.id === id); };
  assert.equal(lb(10), true);
  assert.equal(lb(11), true);
  assert.equal(lb(12), false);
  // W-03 still has IsExternal, carried into the copy.
  assert.equal(check(ids(spec("IFCWALL", prop("Pset_WallCommon", "IsExternal", "IFCBOOLEAN", simple("true")))), m).pass, true);
  assert.match(r.text, /#23=IFCRELDEFINESBYPROPERTIES\('1kH1k8oQr1ZvL2xk4yVQmC',#2,\$,\$,\(#12\),#\d+\);/);
  assert.doesNotMatch(r.text, /#23=IFCRELDEFINESBYPROPERTIES\([^;]*,#20\);/);
});

test("splitting one relationship moves only the elements that change", () => {
  const I = ids(spec("IFCWALL", prop("Pset_WallCommon", "LoadBearing", "IFCBOOLEAN")));
  const r = fill(I, MODEL, { values: [{ globalId: "1Lz5$gbjv4GQ6_kuh4Wa3J", pset: "Pset_WallCommon", prop: "LoadBearing", value: "false" }] });
  assert.equal(r.written, 1);
  assert.deepEqual(r.sets, { edited: 0, copied: 1, added: 0 });
  assert.match(r.text, /#22=IFCRELDEFINESBYPROPERTIES\('1kH1k8oQr1ZvL2xk4yVQmB',#2,\$,\$,\(#10\),#20\);/);
  assert.match(r.text, /IFCRELDEFINESBYPROPERTIES\('[^']{22}',#2,\$,\$,\(#11\),#\d+\);/);
  // The two walls with no value are in the to-fill table.
  assert.deepEqual(r.unfilled.map((u) => u.globalId).sort(), ["0Dqu2kwjbCmOwB7c2iZvUo", "3vB2YO$MX4xv5uCqZZG05x"]);
});

test("a set an element lacks is added, one set and one relationship for all who share the values", () => {
  const I = ids(spec("IFCSLAB", prop("Pset_SlabCommon", "Reference", "IFCIDENTIFIER", simple("S-A"))) + spec("IFCWALL", prop("Pset_Acoustics", "Rating", "IFCLABEL", oneOf("Rw 45")), "w"));
  const r = fill(I, MODEL);
  assert.equal(r.written, 4);
  assert.deepEqual(r.sets, { edited: 0, copied: 0, added: 2 });
  assert.equal(r.after.pass, true);
  assert.match(r.text, /IFCRELDEFINESBYPROPERTIES\('[^']{22}',#2,\$,\$,\(#10,#11,#12\),#\d+\);/);
  assert.match(r.text, /IFCPROPERTYSINGLEVALUE\('Reference',\$,IFCIDENTIFIER\('S-A'\),\$\);/);
});

test("a value inherited from the type is overridden on the occurrence, not changed on the type", () => {
  const I = ids(spec("IFCDOOR", prop("Pset_DoorCommon", "FireRating", "IFCLABEL", simple("EI60"))));
  const r = fill(I, MODEL);
  assert.equal(r.written, 2);
  assert.deepEqual(r.sets, { edited: 0, copied: 0, added: 1 });
  assert.equal(r.after.pass, true);
  assert.match(r.text, /#32=IFCPROPERTYSINGLEVALUE\('FireRating',\$,IFCLABEL\('EI30'\),\$\);/);
});

test("a type object's own set is edited, or a new set put on its HasPropertySets", () => {
  const I = ids(spec("IFCDOORTYPE", prop("Pset_DoorCommon", "FireRating", "IFCLABEL", simple("EI60")) + prop("Pset_Manufacturer", "Maker", "IFCLABEL", simple("Acme"))));
  const r = fill(I, MODEL);
  assert.equal(r.written, 2);
  assert.deepEqual(r.sets, { edited: 1, copied: 0, added: 1 });
  assert.equal(r.after.pass, true);
  assert.match(r.text, /#30=IFCDOORTYPE\('0Hc3T8vRj6Yw0Pq9xZ2eQb',#2,'DT',\$,\$,\(#31,#\d+\),/);
});

test("a measure from the IDS's SI units is written in the project's units", () => {
  const I = ids(spec("IFCWALL", prop("Pset_WallCommon", "Thickness", "IFCLENGTHMEASURE", simple("0.2"))));
  const r = fill(I, MODEL);
  assert.match(r.text, /IFCLENGTHMEASURE\(200\.\)/);
  assert.equal(r.after.pass, true);
});

test("a typed value outside the IDS's list, or of the wrong kind, is refused with the reason", () => {
  const I = ids(spec("IFCWALL", prop("Pset_WallCommon", "FireRating", "IFCLABEL", oneOf("EI30", "EI60")) + prop("Pset_WallCommon", "LoadBearing", "IFCBOOLEAN")));
  const values = [
    { globalId: "*", pset: "Pset_WallCommon", prop: "FireRating", value: "EI90" },
    { globalId: "*", pset: "Pset_WallCommon", prop: "LoadBearing", value: "maybe" },
  ];
  const r = fill(I, MODEL, { values });
  assert.equal(r.written, 0);
  assert.equal(r.text, MODEL);
  assert.ok(r.unfilled.some((u) => /"EI90" is not one of "EI30", "EI60"/.test(u.why)));
  assert.ok(r.unfilled.some((u) => /"maybe" is not true or false/.test(u.why)));
});

test("* in the GlobalId column gives every element in the table the value", () => {
  const I = ids(spec("IFCWALL", prop("Pset_WallCommon", "FireRating", "IFCLABEL", oneOf("EI30", "EI60"))));
  const r = fill(I, MODEL, { values: [{ globalId: "*", pset: "Pset_WallCommon", prop: "FireRating", value: "EI60" }] });
  assert.equal(r.written, 3);
  assert.equal(r.after.pass, true);
});

test("two specifications asking different values for one property write neither", () => {
  const I = ids(spec("IFCWALL", prop("Pset_WallCommon", "FireRating", "IFCLABEL", simple("EI30")), "a") + spec("IFCWALL", prop("Pset_WallCommon", "FireRating", "IFCLABEL", simple("EI60")), "b"));
  const r = fill(I, MODEL);
  assert.equal(r.written, 0);
  assert.ok(r.unfilled.some((u) => /would break another check: specification "b" asks for Pset_WallCommon\.FireRating "EI60"/.test(u.why)));
  assert.ok(r.unfilled.some((u) => /specification "a" asks for Pset_WallCommon\.FireRating "EI30"/.test(u.why)));
});

test("a value that would break a specification the element passes today is not written", () => {
  // b applies to W-01 only and allows Status EXISTING if present; W-01 passes it now.
  const b = `<specification name="b" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>W-01</simpleValue></value></attribute></applicability><requirements><property dataType="IFCLABEL" cardinality="optional"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>Status</simpleValue></baseName>${simple("EXISTING")}</property></requirements></specification>`;
  const I = ids(spec("IFCWALL", prop("Pset_WallCommon", "Status", "IFCLABEL", simple("NEW")), "a") + b);
  const before = check(I, new Model(MODEL, resources().schemas));
  assert.equal(before.specs[1].status, "pass");
  const r = fill(I, MODEL);
  assert.equal(r.written, 2);
  assert.equal(r.verified.pass, 2);
  assert.deepEqual(r.unfilled.map((u) => u.name), ["W-01"]);
  assert.match(r.unfilled[0].why, /would break another check: specification "b" asks for Pset_WallCommon\.Status "EXISTING"/);
  assert.equal(check(I, new Model(r.text, resources().schemas)).specs[1].status, "pass");
});

test("a set named by a pattern is not written; an attribute with no value given goes to the table", () => {
  const pat = `<property dataType="IFCLABEL"><propertySet><xs:restriction base="xs:string"><xs:pattern value="Pset_.*"/></xs:restriction></propertySet><baseName><simpleValue>X</simpleValue></baseName></property>`;
  const I = ids(spec("IFCWALL", `<attribute><name><simpleValue>Description</simpleValue></name></attribute>` + pat + prop("Qto_WallBaseQuantities", "Length", "IFCLENGTHMEASURE", simple("1"))));
  const p = planFill(I, new Model(MODEL, resources().schemas), resources());
  assert.deepEqual(p.writes.map((w) => [w.kind, w.pset, w.prop, w.valueText]), [0, 1, 2].map(() => ["quantity", "Qto_WallBaseQuantities", "Length", "1000."]));
  assert.equal(p.notWritten.attribute, undefined);
  assert.equal(p.unfilled.filter((u) => /pattern/.test(u.why)).length, 3);
  assert.deepEqual(p.unfilled.filter((u) => u.pset === "(attribute)").map((u) => [u.prop, u.dataType, u.why]), [0, 1, 2].map(() => ["Description", "IFCTEXT", "no value given: type one in the Value column"]));
});

test("no data type in the IDS: the standard template's, else IFCLABEL", () => {
  const I = ids(spec("IFCWALL", prop("Pset_WallCommon", "LoadBearing", null, simple("true")) + prop("Custom", "Note", null, simple("x"))));
  const r = fill(I, MODEL);
  assert.match(r.text, /'LoadBearing',\$,IFCBOOLEAN\(\.T\.\)/);
  assert.match(r.text, /'Note',\$,IFCLABEL\('x'\)/);
  assert.equal(r.after.pass, true);
});

test("IFC2X3: the file's owner history goes on new sets and relationships", () => {
  const m = head("IFC2X3") + `#2=IFCOWNERHISTORY($,$,$,.ADDED.,$,$,$,0);
#10=IFCWALL('3vB2YO$MX4xv5uCqZZG05x',#2,'W-01',$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
`;
  const I = ids(spec("IFCWALL", prop("Pset_WallCommon", "IsExternal", "IFCBOOLEAN", simple("false"))).replace('ifcVersion="IFC4"', 'ifcVersion="IFC2X3"'));
  const r = fill(I, m);
  assert.match(r.text, /IFCPROPERTYSET\('[^']{22}',#2,'Pset_WallCommon',\$,\(#11\)\);/);
  assert.match(r.text, /IFCRELDEFINESBYPROPERTIES\('[^']{22}',#2,\$,\$,\(#10\),#12\);/);
  assert.equal(r.after.pass, true);
});

test("STEP strings, reals, GlobalIds and argument lists", () => {
  assert.equal(stepString("Brandschutz Ü 'A' \\"), "'Brandschutz \\X2\\00DC\\X0\\ ''A'' \\\\'");
  assert.equal(decodeStepString(stepString("Ölé ✓ 'q'").slice(1, -1)), "Ölé ✓ 'q'");
  assert.equal(stepReal(200), "200.");
  assert.equal(stepReal(2100.0000000000005), "2100.");
  assert.equal(stepReal(1e-7), "1.E-7");
  assert.equal(stepReal(0.25), "0.25");
  const g = newGlobalId();
  assert.match(g, /^[0-3][0-9A-Za-z_$]{21}$/);
  assert.notEqual(newGlobalId(), g);
  assert.deepEqual(splitArgs("'a,b',(#1,#2),$,'it''s, here',IFCLABEL('x,y')"), ["'a,b'", "(#1,#2)", "$", "'it''s, here'", "IFCLABEL('x,y')"]);
});

test("the to-fill table reads back through Excel's separators and the formula guard", () => {
  const csv = toFillCsv([{ globalId: "g1", type: "IFCWALL", name: "W", pset: "P", prop: "N", dataType: "IFCREAL", allowed: "(any value)", value: "", spec: "s", why: "no value given" }]);
  assert.ok(csv.startsWith("\ufeffGlobalId,Class,Name,PropertySet,Property,DataType,Allowed,Value"));
  const filled = csv.replace(/IFCREAL,\(any value\),,/, "IFCREAL,(any value),\\-5,");
  assert.deepEqual(readValues(filled), [{ globalId: "g1", pset: "P", prop: "N", value: "-5" }]);
  assert.deepEqual(readValues("GlobalId;PropertySet;Property;Value\r\ng2;P;N;1,5\r\n"), [{ globalId: "g2", pset: "P", prop: "N", value: "1,5" }]);
  assert.throws(() => readValues("a,b\r\n1,2\r\n"), /GlobalId, PropertySet, Property and Value/);
});

test("ifcXML is refused: only STEP is written", () => {
  assert.throws(() => fill(ids(spec("IFCWALL", prop("P", "N", "IFCLABEL", simple("x")))), `<?xml version="1.0"?><ifcXML xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/final"></ifcXML>`), /only STEP/);
});

test("records are found past comments and strings that look like records", () => {
  const m = MODEL.replace("#20=IFCPROPERTYSET(", "/* #20=IFCPROPERTYSET('x',$,'Pset_WallCommon',$,(#21)); */\n#20=IFCPROPERTYSET(")
    .replace("'W-01'", "'W-01 #20=IFCPROPERTYSET(;'");
  const r = fill(ids(spec("IFCWALL", prop("Pset_WallCommon", "LoadBearing", "IFCBOOLEAN", simple("true")))), m);
  assert.equal(r.sets.edited, 1);
  assert.equal(r.verified.pass, 3);
  assert.ok(r.text.includes("/* #20=IFCPROPERTYSET('x',$,'Pset_WallCommon',$,(#21)); */"));
  assert.ok(r.text.includes("'W-01 #20=IFCPROPERTYSET(;'"));
  assert.match(r.text, /\n#20=IFCPROPERTYSET\('2XtwYdQJvA_eZmLqT9e9cw',#2,'Pset_WallCommon',\$,\(#21,#34\)\);/);
});

test("a name the element holds as a quantity set is not written as a property set beside it", () => {
  const m = MODEL.replace("ENDSEC;\nEND-ISO", `#40=IFCELEMENTQUANTITY('0Qa1Wb2Ec3Rd4Tf5Yg6Uh7',#2,'BaseQuantities',$,$,(#41));
#41=IFCQUANTITYLENGTH('Height',$,$,3000.,$);
#42=IFCRELDEFINESBYPROPERTIES('1Zx2Cv3Bn4Mq5Wr6Ty7Ui8',#2,$,$,(#10),#40);
ENDSEC;
END-ISO`);
  const r = fill(ids(spec("IFCWALL", prop("BaseQuantities", "NetVolume", null, ""))), m, { values: [{ globalId: "*", pset: "BaseQuantities", prop: "NetVolume", value: "X" }] });
  assert.equal(r.written, 2);
  assert.ok(!r.writtenList.some((w) => w.id === 10));
  // W-01 holds BaseQuantities as quantities: NetVolume would be a quantity,
  // and with no data type its kind is unknown.
  assert.deepEqual(r.unfilled.map((u) => [u.name, u.why]), [["W-01", "the IDS gives no data type and no standard Qto_ template names this quantity, so its kind (length, area, volume ...) is unknown"]]);
});

const QMODEL = MODEL.replace("ENDSEC;\nEND-ISO", `#40=IFCELEMENTQUANTITY('0Qa1Wb2Ec3Rd4Tf5Yg6Uh7',#2,'BaseQuantities',$,$,(#41,#43));
#41=IFCQUANTITYLENGTH('Height',$,$,3000.,$);
#43=IFCQUANTITYAREA('NetSideArea',$,$,12.5,$);
#42=IFCRELDEFINESBYPROPERTIES('1Zx2Cv3Bn4Mq5Wr6Ty7Ui8',#2,$,$,(#10),#40);
#44=IFCELEMENTQUANTITY('2Qa1Wb2Ec3Rd4Tf5Yg6Uh7',#2,'Qto_SlabBaseQuantities',$,$,(#45));
#45=IFCQUANTITYLENGTH('Depth',$,$,200.,$);
#46=IFCRELDEFINESBYPROPERTIES('3Zx2Cv3Bn4Mq5Wr6Ty7Ui8',#2,$,$,(#15),#44);
ENDSEC;
END-ISO`);

test("a Qto_ quantity goes into a new IfcElementQuantity as the quantity class its data type names, in project units", () => {
  const I = ids(spec("IFCWALL", prop("Qto_WallBaseQuantities", "Width", "IFCLENGTHMEASURE", simple("0.2"))));
  const r = fill(I, MODEL);
  assert.equal(r.written, 3);
  assert.deepEqual(r.kinds, { quantity: 3 });
  assert.deepEqual(r.sets, { edited: 0, copied: 0, added: 1 });
  assert.match(r.text, /#34=IFCQUANTITYLENGTH\('Width',\$,\$,200\.,\$\);\n#35=IFCELEMENTQUANTITY\('[0-9A-Za-z_$]{22}',#2,'Qto_WallBaseQuantities',\$,\$,\(#34\)\);\n#36=IFCRELDEFINESBYPROPERTIES\('[0-9A-Za-z_$]{22}',#2,\$,\$,\(#10,#11,#12\),#35\);\nENDSEC;/);
  assert.equal(r.verified.pass, 3);
  assert.equal(check(I, new Model(r.text, resources().schemas)).specs[0].status, "pass");
});

test("a quantity the element holds under the same name in another quantity set is copied from it", () => {
  const I = ids(spec("IFCWALL", prop("Qto_WallBaseQuantities", "NetSideArea", "IFCAREAMEASURE")));
  const r = fill(I, QMODEL);
  assert.equal(r.written, 1);
  assert.equal(r.fromModel, 1);
  assert.deepEqual(r.writtenList.map((w) => [w.id, w.kind, w.value, w.source]), [[10, "quantity", "12.5", "model"]]);
  assert.match(r.text, /IFCQUANTITYAREA\('NetSideArea',\$,\$,12\.5,\$\)/);
  // The walls with no BaseQuantities are left for the table.
  assert.deepEqual(r.unfilled.map((u) => u.name), ["W-02", "W-03"]);
  // A quantity of another kind under the name is not taken: Height is a length.
  const r2 = fill(ids(spec("IFCWALL", prop("Qto_WallBaseQuantities", "Height", "IFCAREAMEASURE"))), QMODEL);
  assert.equal(r2.written, 0);
});

test("a quantity set the element already has is edited in place, and its other quantities kept", () => {
  const I = ids(spec("IFCSLAB", prop("Qto_SlabBaseQuantities", "Width", "IFCLENGTHMEASURE", simple("3"))));
  const r = fill(I, QMODEL);
  assert.deepEqual(r.sets, { edited: 1, copied: 0, added: 0 });
  assert.match(r.text, /#44=IFCELEMENTQUANTITY\('2Qa1Wb2Ec3Rd4Tf5Yg6Uh7',#2,'Qto_SlabBaseQuantities',\$,\$,\(#45,#47\)\);/);
  assert.match(r.text, /#47=IFCQUANTITYLENGTH\('Width',\$,\$,3000\.,\$\);/);
  assert.equal(r.after.pass, true);
  // A Qto_ name the model holds as a property set stays one: the value goes
  // in as a property, where readers of that set look.
  const r2 = fill(ids(spec("IFCWALL", prop("Qto_Odd", "Width", "IFCLENGTHMEASURE", simple("3")))), MODEL.replace("'Pset_WallCommon'", "'Qto_Odd'"));
  assert.equal(r2.written, 3);
  assert.deepEqual(r2.kinds, { property: 3 });
  assert.match(r2.text, /IFCPROPERTYSINGLEVALUE\('Width',\$,IFCLENGTHMEASURE\(3000\.\),\$\)/);
});

test("an attribute left unset is written into the element's own record; one that holds a value is not overwritten", () => {
  const m = MODEL.replace("#12=IFCWALL('0Dqu2kwjbCmOwB7c2iZvUo',$,'W-03',$,$,$,$,$,.SOLIDWALL.);", "#12=IFCWALL('0Dqu2kwjbCmOwB7c2iZvUo',$,'W-03','Kept',$,$,$,'',$);");
  const attr = (n, v = "") => `<attribute><name><simpleValue>${n}</simpleValue></name>${v}</attribute>`;
  const I = ids(spec("IFCWALL", attr("Description") + attr("Tag", simple("T-1")) + attr("PredefinedType")));
  const r = fill(I, m, { values: [{ globalId: "*", pset: "(attribute)", prop: "Description", value: "Outer leaf" }, { globalId: "0Dqu2kwjbCmOwB7c2iZvUo", pset: "(attribute)", prop: "PredefinedType", value: "partitioning" }] });
  assert.ok(r.text.includes("#10=IFCWALL('3vB2YO$MX4xv5uCqZZG05x',$,'W-01','Outer leaf',$,$,$,'T-1',.SOLIDWALL.);"));
  assert.ok(r.text.includes("#12=IFCWALL('0Dqu2kwjbCmOwB7c2iZvUo',$,'W-03','Kept',$,$,$,'T-1',.PARTITIONING.);"));
  assert.deepEqual(r.kinds, { attribute: 6 });
  assert.equal(r.verified.pass, 6);
  assert.equal(r.added, 0);
  assert.equal(check(I, new Model(r.text, resources().schemas)).specs[0].status, "pass");
  // Every other line as it was.
  const a = lines(m), b = lines(r.text);
  assert.equal(b.filter((l) => !a.includes(l)).length, 3);
  // A value the model holds is not overwritten, even when it is wrong.
  const r2 = fill(ids(spec("IFCWALL", attr("Name", simple("W-09")))), MODEL);
  assert.equal(r2.written, 0);
  assert.deepEqual(r2.notWritten, { "attribute already set (not overwritten)": 3 });
  // An enumeration value the type does not have is refused.
  const r3 = fill(ids(spec("IFCWALL", attr("PredefinedType"))), m, { values: [{ globalId: "*", pset: "(attribute)", prop: "PredefinedType", value: "BANANA" }] });
  assert.equal(r3.written, 0);
  assert.match(r3.unfilled[0].why, /"BANANA" is not one of MOVABLE, PARAPET, PARTITIONING/);
});

test("a specification applying to every entity checks the new sets and relationships too; the report counts them apart", () => {
  const every = `<specification name="all classified" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><attribute><name><simpleValue>GlobalId</simpleValue></name></attribute></applicability><requirements><attribute><name><simpleValue>Description</simpleValue></name></attribute></requirements></specification>`;
  const r = fill(ids(spec("IFCSLAB", prop("Pset_SlabCommon", "Reference", "IFCIDENTIFIER", simple("S-A"))) + every), MODEL);
  assert.equal(r.written, 1, JSON.stringify(r.unfilled));
  assert.equal(r.after.addedRecords, 2);
  assert.equal(r.after.failing, r.before.failing - 1 + 2);
  assert.match(fillReport(r), /2 of them the new property sets and relationships themselves/);
});

test("attribute rows go round the to-fill table: listed, typed, read back, written", () => {
  const I = ids(spec("IFCSLAB", `<attribute><name><simpleValue>Description</simpleValue></name></attribute>`));
  const r = fill(I, MODEL);
  assert.equal(r.written, 0);
  const csv = toFillCsv(r.unfilled);
  assert.match(csv, /0jvCJ6a3P7fAhZcqKfbbN8,IFCSLAB,S-01,\(attribute\),Description,IFCTEXT/);
  const typed = csv.replace(/(\(attribute\),Description,IFCTEXT,\(any value\),)/, "$1Ground floor slab");
  const r2 = fill(I, MODEL, { values: readValues(typed) });
  assert.equal(r2.written, 1);
  assert.ok(r2.text.includes("#15=IFCSLAB('0jvCJ6a3P7fAhZcqKfbbN8',$,'S-01','Ground floor slab',$,$,$,$,.FLOOR.);"));
  assert.match(fillReport(r2), /0 properties, 0 quantities, 1 attribute/);
});
