import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseStep, decodeStepString } from "./step.mjs";
import { parseXml } from "./xml.mjs";
import { floatEq, xsdRegex } from "./ids.mjs";
import { check } from "./node.mjs";
import { csvReport } from "./report.mjs";
import { bcfZip, zipStore } from "./bcf.mjs";

const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const IFC_HEAD = (schema) => `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('','',(),(),'','','');\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n`;
const ifc = (schema, lines) => IFC_HEAD(schema) + lines.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
const ids = (specs) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;
const spec = (app, req, occurs = 'minOccurs="1" maxOccurs="unbounded"') => `<specification name="s" ifcVersion="IFC2X3 IFC4 IFC4X3_ADD2"><applicability ${occurs}>${app}</applicability><requirements>${req}</requirements></specification>`;
const ent = (n) => `<entity><name><simpleValue>${n}</simpleValue></name></entity>`;

test("STEP strings decode the \\X2\\, \\X\\, \\S\\ and quote escapes", () => {
  assert.equal(decodeStepString("caf\\X2\\00E9\\X0\\"), "café");
  assert.equal(decodeStepString("\\X\\E9t\\X\\E9"), "été");
  assert.equal(decodeStepString("it''s"), "it's");
  assert.equal(decodeStepString("\\S\\i"), "é");
  assert.equal(decodeStepString("\\X4\\0001F600\\X0\\"), "😀");
});

test("STEP reader keeps nulls, derived, refs, enums, booleans, typed values and lists", () => {
  const m = parseStep(ifc("IFC4", ["#1=IFCX($,*,#2,.FOO.,.T.,.F.,.U.,IFCLABEL('a'),(1,2.5,-3.E2),'x;y');", "#2=IFCY();"]));
  assert.equal(m.schema, "IFC4");
  assert.deepEqual(m.entities.get(1).args, [null, { derived: true }, { ref: 2 }, { enum: "FOO" }, true, false, { unknown: true }, { typed: "IFCLABEL", value: "a" }, [1, 2.5, -300], "x;y"]);
  assert.deepEqual(m.entities.get(2).args, []);
});

test("XML reader handles namespaces, entities, CDATA and comments", () => {
  const x = parseXml(`<?xml version="1.0"?><!-- c --><a:root xmlns:a="u" k="1 &amp; 2"><b>x &lt; y<![CDATA[<z>]]></b><c/></a:root>`);
  assert.equal(x.local, "root");
  assert.equal(x.attrs.k, "1 & 2");
  assert.equal(x.children[0].text, "x < y<z>");
  assert.equal(x.children[1].local, "c");
});

test("float equality uses the IDS 1e-6 relative + absolute tolerance, inclusive", () => {
  assert.ok(floatEq(1.000002, 1));
  assert.ok(!floatEq(1.0000021, 1));
  assert.ok(floatEq(0.000001, 0));
  assert.ok(!floatEq(0.0000011, 0));
  assert.ok(floatEq(100000.1000011 - 0.000001, 100000));
});

test("XSD patterns are anchored", () => {
  assert.ok(xsdRegex("[A-Z]{2}\\d").test("AB1"));
  assert.ok(!xsdRegex("[A-Z]{2}\\d").test("xAB1"));
});

test("multiple xs:pattern children are alternatives (XSD), not all required", () => {
  const model = ifc("IFC4", ["#1=IFCWALL('1hqIFTRjfV6AWq_bMtnZwI',$,'XY99',$,$,$,$,$,$);"]);
  const pat = (a, b) => ids(spec(ent("IFCWALL"), `<attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="${a}"/><xs:pattern value="${b}"/></xs:restriction></value></attribute>`));
  assert.equal(check(pat("[a-z]{2}[0-9]{2}", "[A-Z]{2}[0-9]{2}"), model).pass, true);
  assert.equal(check(pat("[a-z]{3}[0-9]{2}", "[A-Z]{3}[0-9]{2}"), model).pass, false);
});

test("property values are converted from the project's millimetres to metres", () => {
  const model = ifc("IFC4", [
    "#1=IFCPROJECT('1hqIFTRjfV6AWq_bMtnZwI',$,$,$,$,$,$,$,#3);",
    "#2=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);",
    "#3=IFCUNITASSIGNMENT((#2));",
    "#4=IFCWALL('2nJrDaLQfJ1QPhdJR0o97J',$,$,$,$,$,$,$,$);",
    "#5=IFCELEMENTQUANTITY('16MocU_IDOF8_x3Iqllz0d',$,'Qto_WallBaseQuantities',$,$,(#6));",
    "#6=IFCQUANTITYLENGTH('Length',$,$,2500.,$);",
    "#7=IFCRELDEFINESBYPROPERTIES('1xdwj8qGXK4hzoNbvMdXJW',$,$,$,(#4),#5);",
  ]);
  const q = (v) => ids(spec(ent("IFCWALL"), `<property dataType="IFCLENGTHMEASURE"><propertySet><simpleValue>Qto_WallBaseQuantities</simpleValue></propertySet><baseName><simpleValue>Length</simpleValue></baseName><value><simpleValue>${v}</simpleValue></value></property>`));
  assert.equal(check(q("2.5"), model).pass, true);
  assert.equal(check(q("2500"), model).pass, false);
});

test("type properties are inherited and an occurrence overrides them", () => {
  const model = ifc("IFC4", [
    "#1=IFCWALL('2nJrDaLQfJ1QPhdJR0o97J',$,$,$,$,$,$,$,$);",
    "#2=IFCWALLTYPE('0eA6m4fELI9QBIhP3wiLAp',$,'T',$,$,(#3),$,$,$,.SOLIDWALL.);",
    "#3=IFCPROPERTYSET('16MocU_IDOF8_x3Iqllz0d',$,'Pset_WallCommon',$,(#4,#5));",
    "#4=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('30 min'),$);",
    "#5=IFCPROPERTYSINGLEVALUE('Status',$,IFCLABEL('New'),$);",
    "#6=IFCRELDEFINESBYTYPE('05rScmOVzMoQXOfbYdtLYj',$,$,$,(#1),#2);",
    "#7=IFCPROPERTYSET('1xdwj8qGXK4hzoNbvMdXJW',$,'Pset_WallCommon',$,(#8));",
    "#8=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('60 min'),$);",
    "#9=IFCRELDEFINESBYPROPERTIES('3Agm079vPIYBL4JExVrhD5',$,$,$,(#1),#7);",
  ]);
  const p = (n, v) => ids(spec(ent("IFCWALL"), `<property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>${n}</simpleValue></baseName><value><simpleValue>${v}</simpleValue></value></property>`));
  assert.equal(check(p("FireRating", "60 min"), model).pass, true);
  assert.equal(check(p("FireRating", "30 min"), model).pass, false);
  assert.equal(check(p("Status", "New"), model).pass, true);
});

test("required, optional and prohibited specifications", () => {
  const model = ifc("IFC4", ["#1=IFCSLAB('1hqIFTRjfV6AWq_bMtnZwI',$,'S',$,$,$,$,$,$);"]);
  const req = `<attribute><name><simpleValue>Name</simpleValue></name></attribute>`;
  assert.equal(check(ids(spec(ent("IFCWALL"), req)), model).pass, false, "required with nothing applicable fails");
  assert.equal(check(ids(spec(ent("IFCWALL"), req, 'minOccurs="0" maxOccurs="unbounded"')), model).pass, true, "optional with nothing applicable passes");
  assert.equal(check(ids(spec(ent("IFCSLAB"), "", 'minOccurs="0" maxOccurs="0"')), model).pass, false, "prohibited and present fails");
  assert.equal(check(ids(spec(ent("IFCWALL"), "", 'minOccurs="0" maxOccurs="0"')), model).pass, true);
});

test("the tiny sample model trips exactly the gaps written into it", () => {
  const r = check(file("./samples/coordination-basics.ids.xml"), file("./samples/tiny-house.ifc"));
  const byName = Object.fromEntries(r.specs.map((s) => [s.name, s]));
  assert.equal(r.pass, false);
  assert.deepEqual(byName["Walls say whether they are load-bearing"].failed.map((f) => f.name), ["W-02"]);
  assert.deepEqual(byName["Walls have a material"].failed.map((f) => f.name), ["P-01"]);
  assert.equal(byName["Doors and windows sit on a storey"].status, "pass", "the window reaches the storey through opening and wall");
  assert.deepEqual(byName["Spaces have a name and a long name"].failed.map((f) => f.name), ["001"]);
  assert.equal(byName["No building element proxies"].failed.length, 1);
  const q = check(file("./samples/quantities-and-naming.ids.xml"), file("./samples/tiny-house.ifc"));
  const qn = Object.fromEntries(q.specs.map((s) => [s.name, s]));
  assert.equal(qn["Doors are at least 2 m tall"].status, "pass", "2100 mm is 2.1 m");
  assert.equal(qn["Slabs carry a predefined type"].status, "pass");
  assert.deepEqual(qn["Elements are classified"].failed.map((f) => f.name).sort(), ["D-01", "Ground slab", "P-01", "WIN-01"]);
});

test("an unsupported schema is a clear error", () => {
  assert.throws(() => check(ids(""), ifc("IFC5", [])), /not supported/);
});

test("CSV export neutralises spreadsheet formulas", () => {
  const csv = csvReport({ specs: [{ name: "=HYPERLINK(1)", status: "fail", note: null, failed: [{ id: 1, type: "IFCWALL", globalId: "g", name: "+x", reasons: ["a, b"] }] }] });
  assert.match(csv, /"'=HYPERLINK\(1\)"/);
  assert.match(csv, /"'\+x"/);
  assert.match(csv, /"a, b"/);
});

test("BCF export is a valid zip with one topic per failing element", () => {
  const r = check(file("./samples/coordination-basics.ids.xml"), file("./samples/tiny-house.ifc"));
  const zip = bcfZip(r, { modelName: "tiny-house.ifc", date: "2026-01-01T00:00:00Z" });
  const failing = r.specs.reduce((n, s) => n + s.failed.length, 0);
  const text = new TextDecoder().decode(zip);
  assert.equal((text.match(/markup\.bcf/g) || []).length, 2 * failing, "local header + central directory per topic");
  assert.match(text, /<Component IfcGuid="1Lz5\$gbjv4GQ6_kuh4Wa3J"\/>/);
  assert.match(text, /VersionId="2.1"/);
  // end-of-central-directory record counts every file
  const dv = new DataView(zip.buffer);
  const eocd = zip.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), 2 + failing * 2);
});

test("zipStore output is readable by unzip when it is installed", { skip: !hasUnzip() }, () => {
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  writeFileSync(dir + "/t.zip", zipStore([{ name: "a.txt", data: "hello" }, { name: "b/c.txt", data: "wörld" }]));
  const out = execFileSync("unzip", ["-p", dir + "/t.zip", "b/c.txt"]).toString();
  assert.equal(out, "wörld");
});

function hasUnzip() { try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } }

const SUITE = new URL("./eval/IDS/Documentation/ImplementersDocumentation/TestCases", import.meta.url).pathname;
test("buildingSMART's IDS test pairs all score right (run eval/fetch-testcases.sh first)", { skip: !existsSync(SUITE) }, () => {
  const out = execFileSync("node", [new URL("./eval/run-testcases.mjs", import.meta.url).pathname, SUITE]).toString();
  assert.match(out, /total\s+334 \/ 334/);
  // The IDS audit: 26 of 27 invalid-* files read INVALID (the 27th, a group
  // predefined type BUNNARY, is only wrong given the model), no valid file does.
  assert.match(out, /strict [^:]*: 333 \/ 334; invalid-\* not flagged: 1; valid IDS flagged invalid: 0/);
});
