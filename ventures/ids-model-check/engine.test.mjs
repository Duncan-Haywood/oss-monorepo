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
