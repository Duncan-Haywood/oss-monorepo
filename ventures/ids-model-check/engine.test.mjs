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
  // Plain runs around escapes are copied whole (eval/attribute-shape-2026-11-18.md).
  assert.equal(decodeStepString("Basic Wall:Interior - 138mm Partition (1-hr)"), "Basic Wall:Interior - 138mm Partition (1-hr)");
  assert.equal(decodeStepString("Owner''s caf\\X2\\00E9\\X0\\ wall, C:\\\\models\\\\a.rvt, \\PA\\end'"), "Owner's café wall, C:\\models\\a.rvt, end'");
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

// Reads back a stored zip written by zipStore: { name: text }.
async function bcfFiles(zip) {
  const { zipEntries } = await import("./zip.mjs");
  const out = {};
  for (const e of zipEntries(zip)) {
    const start = e.offset + 30 + (zip[e.offset + 26] | (zip[e.offset + 27] << 8)) + (zip[e.offset + 28] | (zip[e.offset + 29] << 8));
    out[e.name] = new TextDecoder().decode(zip.subarray(start, start + e.csize));
  }
  return out;
}
const oneFail = (extra = {}) => ({ title: "t", specs: [{ name: "s", status: "fail", note: null, failed: [{ id: 1, type: "IFCWALL", globalId: "1Lz5$gbjv4GQ6_kuh4Wa3J", name: "w", reasons: ["r"] }], ...extra }] });

test("BCF markup never carries an IfcProject attribute BCF 2.1's schema rejects", async () => {
  // markup.xsd types IfcProject as IfcGuid: exactly 22 characters, so the
  // empty value once written made every markup.bcf fail schema validation.
  const files = await bcfFiles(bcfZip(oneFail(), { date: "2026-01-01T00:00:00Z" }));
  const markups = Object.entries(files).filter(([n]) => n.endsWith("/markup.bcf"));
  assert.equal(markups.length, 1);
  for (const [, x] of markups) {
    for (const m of x.matchAll(/(IfcProject|IfcSpatialStructureElement)="([^"]*)"/g)) assert.match(m[2], /^[0-9A-Za-z_$]{22}$/, m[0]);
  }
});

test("BCF text drops characters XML 1.0 cannot hold, so the markup still parses", async () => {
  const r = oneFail();
  r.specs[0].name = "bell\u0007 spec\uD800";
  r.specs[0].failed[0].name = "wall\u0001";
  r.specs[0].failed[0].reasons = ["tab\tand\nnewline stay", "nul\u0000gone"];
  const files = await bcfFiles(bcfZip(r, { date: "2026-01-01T00:00:00Z" }));
  const [x] = Object.entries(files).filter(([n]) => n.endsWith("/markup.bcf")).map(([, v]) => v);
  assert.doesNotMatch(x, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]|[\ud800-\udfff]/);
  assert.match(x, /<Title>bell spec: IFCWALL wall<\/Title>/);
  assert.match(x, /<Description>tab\tand\nnewline stay\nnulgone<\/Description>/);
  assert.equal(parseXml(x).local, "Markup");
});

test("BCF: a failed specification with no element and no note still says why", async () => {
  for (const note of [null, ""]) {
    const files = await bcfFiles(bcfZip({ specs: [{ name: "Project named", status: "fail", note, failed: [] }] }, { date: "2026-01-01T00:00:00Z" }));
    const x = Object.entries(files).find(([n]) => n.endsWith("/markup.bcf"))[1];
    assert.match(x, /<Description>specification failed<\/Description>/);
    assert.doesNotMatch(x, /Viewpoints/);
  }
  const noted = await bcfFiles(bcfZip({ specs: [{ name: "p", status: "invalid", note: "bad IDS", failed: [] }] }, { date: "2026-01-01T00:00:00Z" }));
  assert.match(Object.values(noted).join(""), /<Description>bad IDS<\/Description>/);
});

test("BCF guids are version-4 UUIDs on every randomness source", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const random = Math.random;
  const guids = async () => Object.keys(await bcfFiles(bcfZip(oneFail(), { date: "2026-01-01T00:00:00Z" }))).filter((n) => n.endsWith("/markup.bcf")).map((n) => n.split("/")[0]);
  try {
    // getRandomValues only (a browser page served over plain http has no randomUUID)
    Object.defineProperty(globalThis, "crypto", { value: { getRandomValues: (b) => { b.forEach((_, i) => (b[i] = i * 17)); return b; } }, configurable: true });
    assert.deepEqual(await guids(), ["00112233-4455-4677-8899-aabbccddeeff"]);
    // no crypto at all: Math.random fills every byte
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    Math.random = () => 0.5;
    assert.deepEqual(await guids(), ["80808080-8080-4080-8080-808080808080"]);
  } finally {
    Math.random = random;
    Object.defineProperty(globalThis, "crypto", saved);
  }
});

const BCF_XSD = new URL("./eval/bcf-xsd/", import.meta.url).pathname;
const hasXmllint = () => { try { execFileSync("xmllint", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } };
test("BCF export validates against buildingSMART's BCF 2.1 schemas (run eval/fetch-bcf-schemas.sh first)", { skip: !existsSync(BCF_XSD + "markup.xsd") || !hasXmllint() }, async () => {
  const r = check(file("./samples/coordination-basics.ids.xml"), file("./samples/tiny-house.ifc"));
  r.specs.push({ name: "spec-level\u0007", status: "fail", note: "", failed: [] });
  const files = await bcfFiles(bcfZip(r, { modelName: "tiny-house.ifc" }));
  const dir = mkdtempSync(join(tmpdir(), "bcf-"));
  const xsd = { "markup.bcf": "markup.xsd", "viewpoint.bcfv": "visinfo.xsd", "project.bcfp": "project.xsd", "bcf.version": "version.xsd" };
  let n = 0;
  for (const [name, text] of Object.entries(files)) {
    const path = join(dir, name.replace("/", "_"));
    writeFileSync(path, text);
    execFileSync("xmllint", ["--noout", "--schema", BCF_XSD + xsd[name.split("/").pop()], path], { stdio: "pipe" });
    n++;
  }
  assert.ok(n >= 6, `${n} files validated`);
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

test("IdsValue compares dates, times and durations, and booleans against patterns", async () => {
  const { IdsValue, temporalKey } = await import("./ids.mjs");
  const { parseXml } = await import("./xml.mjs");
  const v = (inner) => new IdsValue(parseXml(`<value xmlns:xs="http://www.w3.org/2001/XMLSchema">${inner}</value>`));
  const r = (k, x) => v(`<xs:restriction base="xs:string"><xs:${k} value="${x}"/></xs:restriction>`);
  assert.equal(r("minInclusive", "2026-01-01").match("2026-11-16", "string"), true);
  assert.equal(r("minInclusive", "2026-01-01").match("2025-12-31", "string"), false);
  assert.equal(r("maxExclusive", "PT5M30S").match("PT5M", "string"), true);
  assert.equal(r("maxExclusive", "PT5M30S").match("P1D", "string"), false);
  // Different forms never compare (a date is not a duration).
  assert.equal(r("minInclusive", "2026-01-01").match("PT5M", "string"), false);
  assert.equal(r("maxInclusive", "12:00:00").match("11:59:59", "string"), true);
  assert.equal(temporalKey("12:00:00+01:00") < temporalKey("12:00:00Z"), true);
  const p = v(`<xs:restriction base="xs:boolean"><xs:pattern value="true"/></xs:restriction>`);
  assert.equal(p.match(true, "boolean"), true);
  assert.equal(p.match(false, "boolean"), false);
});

// Red-team guards, 2026-11-16 (prompts/runs/2026-11-16-session_01EhTJVLRvnZNuoDHuaPD3KN.json).
test("STEP reader skips tabs and comments between values, and a file that opens with DATA;", () => {
  const m = parseStep(ifc("IFC4", ["#1=IFCX(\t1,\t/* a comment */ 'a' , 2.5 /* x */);"]));
  assert.deepEqual(m.entities.get(1).args, [1, "a", 2.5]);
  assert.deepEqual(m.errors, []);
  const bare = parseStep("DATA;\n#7=IFCY(3);\nENDSEC;\n");
  assert.deepEqual(bare.entities.get(7).args, [3]);
  assert.throws(() => parseStep("HEADER;\nENDSEC;\n"), /no DATA section/);
});

test("booleans: IDS false and 0 both match .F., true and 1 both match .T.", () => {
  const model = ifc("IFC4", [
    "#1=IFCWALL('2nJrDaLQfJ1QPhdJR0o97J',$,$,$,$,$,$,$,$);",
    "#2=IFCPROPERTYSET('16MocU_IDOF8_x3Iqllz0d',$,'Custom_X',$,(#3,#4));",
    "#3=IFCPROPERTYSINGLEVALUE('Off',$,IFCBOOLEAN(.F.),$);",
    "#4=IFCPROPERTYSINGLEVALUE('On',$,IFCBOOLEAN(.T.),$);",
    "#5=IFCRELDEFINESBYPROPERTIES('3Agm079vPIYBL4JExVrhD5',$,$,$,(#1),#2);",
  ]);
  const b = (n, v) => ids(spec(ent("IFCWALL"), `<property dataType="IFCBOOLEAN"><propertySet><simpleValue>Custom_X</simpleValue></propertySet><baseName><simpleValue>${n}</simpleValue></baseName><value><simpleValue>${v}</simpleValue></value></property>`));
  for (const v of ["false", "0"]) assert.equal(check(b("Off", v), model).pass, true, `Off = ${v}`);
  for (const v of ["true", "1"]) assert.equal(check(b("On", v), model).pass, true, `On = ${v}`);
  for (const v of ["true", "1"]) assert.equal(check(b("Off", v), model).pass, false, `Off != ${v}`);
  for (const v of ["false", "0"]) assert.equal(check(b("On", v), model).pass, false, `On != ${v}`);
});

test("attributes: a set attribute passes a value-less requirement; a select-typed one is never compared by value", () => {
  const model = ifc("IFC4", [
    "#1=IFCWALL('2nJrDaLQfJ1QPhdJR0o97J',$,'W1',$,$,$,$,$,$);",
    "#2=IFCPROPERTYSINGLEVALUE('A',$,'x',$);",
  ]);
  const at = (cls, n, v) => ids(spec(ent(cls), `<attribute><name><simpleValue>${n}</simpleValue></name>${v === undefined ? "" : `<value><simpleValue>${v}</simpleValue></value>`}</attribute>`));
  assert.equal(check(at("IFCWALL", "Name"), model).pass, true);
  assert.equal(check(at("IFCWALL", "Description"), model).pass, false, "an unset attribute fails");
  // NominalValue is an IfcValue select; a bare value there is not comparable.
  // The audit rejects the specification first; with the audit off (--no-audit)
  // the engine must still refuse rather than compare the text.
  const sel = at("IFCPROPERTYSINGLEVALUE", "NominalValue", "x");
  assert.equal(check(sel, model).specs[0].status, "invalid");
  const r = check(sel, model, { audit: false });
  assert.equal(r.pass, false);
  assert.match(JSON.stringify(r.specs[0].failed), /cannot be compared by value/);
});

test("bounded properties: a range ignores the set point, and a missing bound is not a crash", () => {
  const model = (lo, hi, sp) => ifc("IFC4", [
    "#1=IFCWALL('2nJrDaLQfJ1QPhdJR0o97J',$,$,$,$,$,$,$,$);",
    "#2=IFCPROPERTYSET('16MocU_IDOF8_x3Iqllz0d',$,'Custom_X',$,(#3));",
    `#3=IFCPROPERTYBOUNDEDVALUE('P',$,${hi},${lo},$,${sp});`,
    "#5=IFCRELDEFINESBYPROPERTIES('3Agm079vPIYBL4JExVrhD5',$,$,$,(#1),#2);",
  ]);
  const p = (val) => ids(spec(ent("IFCWALL"), `<property dataType="IFCREAL"><propertySet><simpleValue>Custom_X</simpleValue></propertySet><baseName><simpleValue>P</simpleValue></baseName><value>${val}</value></property>`));
  const range = p(`<xs:restriction base="xs:double"><xs:minInclusive value="0"/><xs:maxInclusive value="6"/></xs:restriction>`);
  assert.equal(check(range, model("IFCREAL(1.)", "IFCREAL(5.)", "IFCREAL(10.)")).pass, true, "set point 10 outside 0..6 does not fail the bounds");
  assert.equal(check(range, model("IFCREAL(1.)", "IFCREAL(7.)", "$")).pass, false);
  assert.equal(check(p(`<simpleValue>1</simpleValue>`), model("IFCREAL(1.)", "$", "$")).pass, true, "lower bound only");
  assert.equal(check(p(`<simpleValue>5</simpleValue>`), model("$", "IFCREAL(5.)", "$")).pass, true, "upper bound only");
  assert.equal(check(range, model("IFCREAL(1.)", "$", "$")).pass, false, "a range needs both bounds");
});

test("parseXml: comments and processing instructions inside an element leave its text alone", () => {
  const x = parseXml(`<?xml version="1.0"?><a><b>one<?pi data here?>two<!-- c -->three</b></a>`);
  assert.equal(x.children[0].text, "onetwothree");
});

test("parseXml: a truncated file throws instead of looping forever", () => {
  const whole = '<?xml version="1.0"?><!-- c --><ids xmlns="x"><info><title><![CDATA[t]]></title></info><specifications/></ids>';
  assert.equal(parseXml(whole).local, "ids");
  // every prefix of a well-formed file must end, and every proper prefix must throw
  for (let n = 1; n < whole.length; n++) assert.throws(() => parseXml(whole.slice(0, n)), undefined, `prefix of ${n}`);
  for (const bad of ["<ids><not closed", "<!-- open", "<?xml", "<![CDATA[x", "<!DOCTYPE", "<ids></ids", "<ids>< </ids>"]) {
    assert.throws(() => parseXml(bad), /unterminated|no element name|unclosed|mismatched/, bad);
  }
});

test("parseStep: every prefix of a STEP file ends (a cut-off enum once looped forever)", async () => {
  const { parseStep } = await import("./step.mjs");
  const t = readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8");
  for (let n = 1; n < t.length; n++) { try { parseStep(t.slice(0, n)); } catch { /* "no DATA section" is fine */ } }
  const cut = t.slice(0, t.indexOf(".LENGTHUNIT.") + 11);
  const r = parseStep(cut);
  assert.ok(r.errors.some((e) => /unterminated enumeration/.test(e)), r.errors.join("; "));
  assert.ok(r.entities.has(1));
  assert.ok(parseStep("DATA;\n#1=IFCWALL(#);\n#2=IFCWALL('x');").entities.has(2), "'#' with no number is one bad entity, not a loop");
});

// Lazy arguments, 2026-11-17 (eval/heap-200mb-2026-11-17.md).
test("parseStep reads arguments on first use, with the same values as an eager read", () => {
  const t = readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8");
  const lazy = parseStep(t);
  const eager = parseStep(t, { eager: true });
  assert.equal(lazy.entities.size, eager.entities.size);
  for (const [id, e] of eager.entities) {
    const l = lazy.entities.get(id);
    assert.equal(l.type, e.type);
    assert.deepEqual(l.args, e.args, `#${id}`);
  }
  assert.equal(JSON.stringify(lazy.entities.get(1)), JSON.stringify(eager.entities.get(1)));
});

test("parseStep: a lazy record skips ';' inside strings and comments, and a bad record reports when read", () => {
  const r = parseStep("DATA;\n#1=IFCWALL('a;b''c;',/* ; ' */ 2);\n#2=IFCWALL(#);\n#3=IFCWALL('x');\nENDSEC;\n");
  assert.deepEqual(r.entities.get(1).args, ["a;b'c;", 2]);
  assert.deepEqual(r.entities.get(3).args, ["x"]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.entities.get(2).args, []);
  assert.ok(/#2: '#' with no number/.test(r.errors[0]), r.errors.join("; "));
  r.entities.get(2).args;
  assert.equal(r.errors.length, 1, "an error is recorded once");
});

// Red-team guards, 2026-11-17 (prompts/runs/2026-11-17-session_01XpHqyeCriEFhGAiBgntwUd.json).
test("parseStep: a record holding a string is still read lazily (its error waits until args is read)", () => {
  // recordEnd must close a plain string at its quote; treating every closing
  // quote as escaped sends each such record down the eager fallback.
  const r = parseStep("DATA;\n#1=IFCWALL('a');\n#2=IFCWALL('y',#);\n#3=IFCWALL('x');\nENDSEC;\n");
  assert.deepEqual(r.errors, [], "nothing is read before args is asked for");
  assert.deepEqual(r.entities.get(3).args, ["x"]);
  assert.deepEqual(r.entities.get(2).args, []);
  assert.equal(r.errors.length, 1);
});

test("parseStep: a binary value is read and the record goes on after it", () => {
  for (const eager of [false, true]) {
    const r = parseStep('DATA;\n#1=IFCBLOBTEXTURE("0FF",2.);\nENDSEC;\n', { eager });
    assert.deepEqual(r.entities.get(1).args, [{ binary: "0FF" }, 2], `eager=${eager}`);
    assert.deepEqual(r.errors, [], `eager=${eager}`);
  }
});

test("parseStep (eager): '#n=X(' inside a string is not another entity", () => {
  const r = parseStep("DATA;\n#1=IFCWALL('see #7=IFCDOOR(1)');\nENDSEC;\n", { eager: true });
  assert.deepEqual([...r.entities.keys()], [1]);
  assert.deepEqual(r.errors, []);
});

test("parseStep: a commented-out record and a string inside a complex instance are not entities", () => {
  // Found 2026-11-17: the scan matched '#n=X(' anywhere in DATA, so a record
  // a person commented out, or text inside a multi-type #5=(A()B()) instance
  // it skipped, came back as a real IFCDOOR for the IDS checks to judge.
  for (const eager of [false, true]) {
    const r = parseStep("DATA;\n/* old: #9=IFCDOOR(1); */\n#5=(IFCA('#8=IFCDOOR(1)')IFCB());\n#1=IFCWALL('a');\nENDSEC;\n", { eager });
    assert.deepEqual([...r.entities.keys()], [1], `eager=${eager}`);
    assert.deepEqual(r.entities.get(1).args, ["a"], `eager=${eager}`);
    assert.deepEqual(r.errors, [], `eager=${eager}`);
  }
});

test("federate: entity numbers shift past the previous file's, references inside strings do not", async () => {
  const { federate } = await import("./eval/federate.mjs");
  const a = "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCWALL('#1',#2);\n#2=IFCY();\nENDSEC;\nEND-ISO-10303-21;\n";
  let out = "";
  const r = federate([a, a], (s) => { out += s; });
  assert.equal(r.entities, 4);
  const m = parseStep(out);
  assert.deepEqual(m.entities.get(3).args, ["#1", { ref: 4 }]);
  assert.equal(m.entities.get(4).type, "IFCY");
});

test("parseStep: types the policy does not keep are read again on each use, with the same values", () => {
  const r = parseStep("DATA;\n#1=IFCCARTESIANPOINT((0.,1.,2.));\n#2=IFCWALL('g');\nENDSEC;\n");
  r.policy.keep = (t) => t !== "IFCCARTESIANPOINT";
  const a = r.entities.get(1).args;
  assert.deepEqual(a, [[0, 1, 2]]);
  assert.notEqual(r.entities.get(1).args, a, "not kept");
  assert.equal(r.entities.get(2).args, r.entities.get(2).args, "kept");
});

test("specifications with no entity facet: the argument-free prefilter selects exactly what the full tests select", async () => {
  // eval/no-entity-facet-2026-11-17.md. Brute force: every entity, full tests only.
  const { parseIds } = await import("./ids.mjs");
  const { parseModel } = await import("./node.mjs");
  // The sample, and a wall whose set, material and classification all come
  // through its type (a material carrying its own property set too).
  const typed = parseModel(ifc("IFC4", [
    "#10=IFCWALL('0aaaaaaaaaaaaaaaaaaaaa',$,'w',$,$,$,$,$,$);",
    "#11=IFCWALLTYPE('1aaaaaaaaaaaaaaaaaaaaa',$,'wt',$,$,(#12),$,$,$,.STANDARD.);",
    "#12=IFCPROPERTYSET('2aaaaaaaaaaaaaaaaaaaaa',$,'Pset_WallCommon',$,(#13));",
    "#13=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);",
    "#14=IFCRELDEFINESBYTYPE('3aaaaaaaaaaaaaaaaaaaaa',$,$,$,(#10),#11);",
    "#15=IFCMATERIAL('Concrete',$,$);",
    "#16=IFCRELASSOCIATESMATERIAL('4aaaaaaaaaaaaaaaaaaaaa',$,$,$,(#11),#15);",
    "#17=IFCCLASSIFICATION($,$,$,'Uniclass',$,$,$);",
    "#18=IFCCLASSIFICATIONREFERENCE($,'Ss_20',$,#17,$,$);",
    "#19=IFCRELASSOCIATESCLASSIFICATION('5aaaaaaaaaaaaaaaaaaaaa',$,$,$,(#11),#18);",
    "#20=IFCMATERIALPROPERTIES('Pset_MaterialCommon',$,(#21),#15);",
    "#21=IFCPROPERTYSINGLEVALUE('Porosity',$,IFCNORMALISEDRATIOMEASURE(0.1),$);",
  ]));
  const prop = (ps, bn = "") => `<property><propertySet><simpleValue>${ps}</simpleValue></propertySet>${bn && `<baseName><simpleValue>${bn}</simpleValue></baseName>`}</property>`;
  const facets = [
    `<attribute><name><simpleValue>GlobalId</simpleValue></name></attribute>`,
    `<attribute><name><simpleValue>Name</simpleValue></name></attribute>`,
    `<attribute><name><xs:restriction base="xs:string"><xs:pattern value=".*"/></xs:restriction></name></attribute>`,
    prop("Pset_WallCommon"),
    prop("Pset_WallCommon", "IsExternal"),
    `<property><propertySet><xs:restriction base="xs:string"><xs:pattern value=".*"/></xs:restriction></propertySet><baseName><xs:restriction base="xs:string"><xs:pattern value=".*"/></xs:restriction></baseName></property>`,
    `<classification/>`,
    `<material/>`,
    `<partOf/>`,
    `<partOf relation="IFCRELCONTAINEDINSPATIALSTRUCTURE"/>`,
    `<partOf relation="IFCRELAGGREGATES"/>`,
    `<partOf relation="IFCRELVOIDSELEMENT IFCRELFILLSELEMENT"/>`,
  ];
  let some = 0;
  for (const model of [parseModel(file("samples/tiny-house.ifc")), typed]) for (const f of facets.concat(prop("Pset_MaterialCommon"))) {
    // Prohibited: the report lists every applicable entity, in model order.
    const text = ids(spec(f, ent("IFCWALL"), 'minOccurs="0" maxOccurs="0"'));
    const sp = parseIds(text).specs[0];
    const brute = [...model.entities.values()].filter((e) => sp.applicability.every((x) => x.test(e, model, { typeMap: null }).ok)).map((e) => e.id);
    const r = check(text, model, { audit: false, maxFailed: 1e9 });
    assert.equal(r.specs[0].applicable, brute.length, f);
    assert.deepEqual(r.specs[0].failed.map((x) => x.id), brute.slice(0, 500), f);
    if (brute.length) some++;
  }
  assert.ok(some >= 16, `only ${some} facets matched anything in the sample`);

  // Requirements on every entity (an entity facet whose name is a pattern
  // matching anything, as public IDS files write it), each cardinality: the
  // report equals one built from the full tests alone.
  const anyEnt = `<entity><name><xs:restriction base="xs:string"><xs:pattern value="IFC.*"/></xs:restriction></name></entity>`;
  const req = (f, card) => f.replace(/^<(\w+)/, `<$1 cardinality="${card}"`);
  let checked = 0;
  for (const model of [parseModel(file("samples/tiny-house.ifc")), typed]) for (const f of facets.concat(prop("Pset_MaterialCommon"))) for (const card of ["required", "optional", "prohibited"]) {
    const text = ids(spec(anyEnt, req(f, card)));
    const sp = parseIds(text).specs[0];
    const ctx = { typeMap: null };
    let passed = 0;
    const failed = [];
    for (const e of model.entities.values()) {
      const [rf] = sp.requirements;
      const r = rf.test(e, model, ctx);
      const pass = rf.cardinality === "prohibited" ? !r.ok : rf.cardinality === "optional" ? r.ok || !!r.absent : r.ok;
      if (pass) passed++;
      else failed.push(e.id);
    }
    for (const maxFailed of [1e9, 3]) {
      const got = check(text, model, { audit: false, maxFailed }).specs[0];
      assert.equal(got.passed, passed, `${card} ${f}`);
      assert.equal(got.failedCount ?? got.failed.length, failed.length, `${card} ${f}`);
      assert.deepEqual(got.failed.map((x) => x.id), failed.slice(0, maxFailed), `${card} ${f}`);
    }
    checked++;
  }
  assert.equal(checked, 78);
});

test("an entity facet's unnamed subclasses are counted as not checked, the verdict unchanged", () => {
  // Revit's IFC2X3 exports write most walls as IfcWallStandardCase; IDS has no
  // inheritance, so IFCWALL takes only the IfcWall (eval/corpus-crosscheck-2026-11-17.md).
  const model = ifc("IFC2X3", [
    "#1=IFCWALL('1hqIFTRjfV6AWq_bMtnZwI',$,'W1',$,$,$,$,$);",
    "#2=IFCWALLSTANDARDCASE('2hqIFTRjfV6AWq_bMtnZwI',$,'W2',$,$,$,$,$);",
    "#3=IFCWALLSTANDARDCASE('3hqIFTRjfV6AWq_bMtnZwI',$,$,$,$,$,$,$);",
    "#4=IFCSLAB('4hqIFTRjfV6AWq_bMtnZwI',$,'S',$,$,$,$,$,$);",
  ]);
  const req = `<attribute><name><simpleValue>Name</simpleValue></name></attribute>`;
  const s = check(ids(spec(ent("IFCWALL"), req)), model).specs[0];
  assert.equal(s.status, "pass");
  assert.equal(s.applicable, 1);
  assert.deepEqual(s.skippedSubclasses, [{ type: "IFCWALLSTANDARDCASE", via: "IFCWALL", count: 2 }]);
  assert.match(s.hint, /not checked: 2 element\(s\).*2 IFCWALLSTANDARDCASE \(a subclass of IFCWALL\)/);
  // The other applicability facets still apply: only W2 has a Name.
  const named = `<attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>W2</simpleValue></value></attribute>`;
  const s2 = check(ids(spec(ent("IFCWALL") + named, "", 'minOccurs="0" maxOccurs="unbounded"')), model).specs[0];
  assert.deepEqual(s2.skippedSubclasses, [{ type: "IFCWALLSTANDARDCASE", via: "IFCWALL", count: 1 }]);
  // Naming both classes leaves nothing out; an unrelated class gets no hint.
  const both = `<entity><name><xs:restriction base="xs:string"><xs:enumeration value="IFCWALL"/><xs:enumeration value="IFCWALLSTANDARDCASE"/></xs:restriction></name></entity>`;
  assert.equal(check(ids(spec(both, req)), model).specs[0].hint, undefined);
  assert.equal(check(ids(spec(ent("IFCSLAB"), req)), model).specs[0].hint, undefined);
});

test("a prohibited specification with requirements stays invalid and says how many elements match", () => {
  const model = ifc("IFC4", ["#1=IFCBUILDINGELEMENTPROXY('1hqIFTRjfV6AWq_bMtnZwI',$,'P',$,$,$,$,$,$);"]);
  const req = `<attribute cardinality="prohibited"><name><simpleValue>GlobalId</simpleValue></name></attribute>`;
  const s = check(ids(spec(ent("IFCBUILDINGELEMENTPROXY"), req, 'minOccurs="0" maxOccurs="0"')), model).specs[0];
  assert.equal(s.status, "invalid");
  assert.equal(s.matching, 1);
  assert.match(s.note, /1 element\(s\) in this model match its applicability and would fail it/);
});

test("STEP: an apostrophe after \\S\\ is the directive's character, not the closing quote", () => {
  // xBIM's SpecicalSolidusEscape.ifc: '...\S\'' ends with "§" (39 + 128).
  const m = parseStep(ifc("IFC4", ["#1=IFCGROUP('g',$,'ends in \\S\\'',$,$);", "#2=IFCGROUP('h',$,'a\\\\S\\',$,$);", "#3=IFCGROUP('i',$,'it''s',$,$);"]));
  assert.deepEqual(m.errors, []);
  assert.equal(m.entities.get(1).args[2], "ends in §");
  assert.equal(m.entities.get(2).args[2], "a\\S\\", "an escaped backslash before S\\ is not a directive");
  assert.equal(m.entities.get(3).args[2], "it's");
});

// eval/attribute-any-geometry-2026-11-18.md: the attribute facet reads
// geometry with nested lists unread. Every verdict and reason must equal a
// run on fully read arguments.
test("attribute facets on geometry read shallow arguments with the same verdicts as full ones", async () => {
  const { parseModel } = await import("./node.mjs");
  const text = ifc("IFC4", [
    "#1=IFCCARTESIANPOINT((0.,1.,2.));",
    "#2=IFCCARTESIANPOINT(());",
    "#3=IFCPOLYLOOP((#1,#2));",
    "#4=IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(1.,0.,0.)),$);",
    "#5=IFCCARTESIANPOINTLIST3D((()),());",
    "#6=IFCINDEXEDPOLYCURVE(#4,(IFCLINEINDEX((1,2))),.F.);",
    "#7=IFCTEXTLITERAL('a)b(''c',#8,.LEFT.);",
    "#8=IFCAXIS2PLACEMENT3D(#1,$,$);",
    "#9=IFCPOLYLINE((#1 /* ) */,#2));",
    "#10=IFCWALL('2O2Fr$t4X7Zf8NOew3FLOH',$,'W',$,$,$,$,$,$);",
    "#11=IFCDIRECTION((1.,0.,0.));",
  ]);
  const anyName = `<name><xs:restriction base="xs:string"><xs:pattern value=".*"/></xs:restriction></name>`;
  const attr = (name, value) => `<attribute>${name}${value}</attribute>`;
  const val = (p) => `<value><xs:restriction base="xs:string"><xs:pattern value="${p}"/></xs:restriction></value>`;
  const reqs = [attr(anyName, ""), attr(anyName, val(".*")), attr(anyName, val("a.*")), attr(`<name><simpleValue>Coordinates</simpleValue></name>`, ""), attr(`<name><simpleValue>Literal</simpleValue></name>`, val("a.*"))];
  const specs = [];
  for (const r of reqs) for (const card of ['cardinality="required"', 'cardinality="optional"', 'cardinality="prohibited"'])
    specs.push(`<specification name="s" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded">${attr(anyName, "")}</applicability><requirements>${r.replace("<attribute>", `<attribute ${card}>`)}</requirements></specification>`);
  const idsText = ids(specs.join(""));
  const shallow = parseModel(text);
  const full = parseModel(text);
  for (const e of full.entities.values()) e.args = e.args; // keep every read: shallowArgs is then args
  for (const e of shallow.entities.values()) {
    const s = e.shallowArgs, f = full.entities.get(e.id).args;
    assert.equal(s.length, f.length, `#${e.id}`);
    s.forEach((v, i) => {
      if (Array.isArray(f[i])) assert.equal(v.length === 0, f[i].length === 0, `#${e.id} arg ${i} emptiness`);
      else assert.deepEqual(v, f[i], `#${e.id} arg ${i}`);
    });
  }
  const strip = (r) => { delete r.seconds; return r; };
  const a = strip(check(idsText, shallow)), b = strip(check(idsText, full));
  assert.deepEqual(a, b);
  assert.ok(a.specs.some((s) => s.failed.length) && a.specs.some((s) => s.passed), "the cases both pass and fail");
});

// Quality audit 2026-11-19: three seeded unit-conversion bugs survived every test. Values by hand:
// 120 in x 25.4 mm = 3,048 mm = 3.048 m; 12,000,000 mm2 = 12 m2 (the prefix is squared); 26 degC = 299.15 K.
test("area prefixes are squared, Celsius is offset to kelvin, and conversion-based units honour their base prefix", () => {
  const model = ifc("IFC4", [
    "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Audit',$,$,$,$,$,#5);",
    "#2=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);",
    "#3=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);",
    "#4=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(25.4),#2);",
    "#6=IFCCONVERSIONBASEDUNIT(#3,.LENGTHUNIT.,'INCH',#4);",
    "#7=IFCSIUNIT(*,.AREAUNIT.,.MILLI.,.SQUARE_METRE.);",
    "#8=IFCSIUNIT(*,.THERMODYNAMICTEMPERATUREUNIT.,$,.DEGREE_CELSIUS.);",
    "#5=IFCUNITASSIGNMENT((#6,#7,#8));",
    "#20=IFCWALL('3vB2YO$MX4xv5uCqZZG05x',$,'W-A',$,$,$,$,$,.SOLIDWALL.);",
    "#60=IFCELEMENTQUANTITY('0Qa1Wb2Ec3Rd4Tf5Yg6Uh7',$,'Qto_WallBaseQuantities',$,$,(#61));",
    "#61=IFCQUANTITYLENGTH('Length',$,$,120.,$);",
    "#62=IFCRELDEFINESBYPROPERTIES('1Zx2Cv3Bn4Mq5Wr6Ty7Ui8',$,$,$,(#20),#60);",
    "#26=IFCSPACE('0BTBFw6f90Nfh9rP1dlXri',$,'001',$,$,$,$,$,.ELEMENT.,.SPACE.,$);",
    "#63=IFCELEMENTQUANTITY('0Qa1Wb2Ec3Rd4Tf5Yg6Uh8',$,'Qto_SpaceBaseQuantities',$,$,(#64));",
    "#64=IFCQUANTITYAREA('NetFloorArea',$,$,12000000.,$);",
    "#65=IFCRELDEFINESBYPROPERTIES('1Zx2Cv3Bn4Mq5Wr6Ty7Ui9',$,$,$,(#26),#63);",
    "#40=IFCPROPERTYSET('2XtwYdQJvA_eZmLqT9e9cw',$,'Pset_SpaceThermalRequirements',$,(#41));",
    "#41=IFCPROPERTYSINGLEVALUE('SpaceTemperatureMax',$,IFCTHERMODYNAMICTEMPERATUREMEASURE(26.),$);",
    "#43=IFCRELDEFINESBYPROPERTIES('1kH1k8oQr1ZvL2xk4yVQmB',$,$,$,(#26),#40);",
  ]);
  const prop = (e, type, pset, name, v) => ids(spec(ent(e), `<property dataType="${type}"><propertySet><simpleValue>${pset}</simpleValue></propertySet><baseName><simpleValue>${name}</simpleValue></baseName><value><simpleValue>${v}</simpleValue></value></property>`));
  const len = (v) => prop("IFCWALL", "IFCLENGTHMEASURE", "Qto_WallBaseQuantities", "Length", v);
  const area = (v) => prop("IFCSPACE", "IFCAREAMEASURE", "Qto_SpaceBaseQuantities", "NetFloorArea", v);
  const temp = (v) => prop("IFCSPACE", "IFCTHERMODYNAMICTEMPERATUREMEASURE", "Pset_SpaceThermalRequirements", "SpaceTemperatureMax", v);
  assert.equal(check(len("3.048"), model).pass, true);
  assert.equal(check(len("3048"), model).pass, false);

  assert.equal(check(area("12"), model).pass, true);
  assert.equal(check(area("12000"), model).pass, false);
  assert.equal(check(temp("299.15"), model).pass, true);
  assert.equal(check(temp("26"), model).pass, false);
});
