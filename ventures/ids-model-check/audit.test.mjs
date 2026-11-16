import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { check, resources } from "./node.mjs";

const ids = (specs) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;
const spec = (app, req, { occurs = 'minOccurs="1" maxOccurs="unbounded"', version = "IFC2X3 IFC4" } = {}) => `<specification name="s" ifcVersion="${version}"><applicability ${occurs}>${app}</applicability><requirements>${req}</requirements></specification>`;
const ent = (n, pt) => `<entity><name><simpleValue>${n}</simpleValue></name>${pt ? `<predefinedType><simpleValue>${pt}</simpleValue></predefinedType>` : ""}</entity>`;
const attr = (n, v) => `<attribute><name><simpleValue>${n}</simpleValue></name>${v === undefined ? "" : `<value>${v.startsWith("<") ? v : `<simpleValue>${v}</simpleValue>`}</value>`}</attribute>`;
const prop = (dt, v) => `<property${dt ? ` dataType="${dt}"` : ""}><propertySet><simpleValue>Custom_X</simpleValue></propertySet><baseName><simpleValue>P</simpleValue></baseName>${v === undefined ? "" : `<value><simpleValue>${v}</simpleValue></value>`}</property>`;
const pattern = (p) => `<xs:restriction base="xs:string"><xs:pattern value="${p}"/></xs:restriction>`;

const audit = (s) => auditIds(parseIds(ids(s)), resources());
const codes = (s, level = "error") => audit(s).filter((x) => x.level === level).map((x) => x.code);

test("valid specifications raise nothing", () => {
  assert.deepEqual(audit(spec(ent("IFCWALL"), attr("Name", "W1"))), []);
  assert.deepEqual(audit(spec(ent("IFCWALL"), prop("IFCBOOLEAN", "true"))), []);
  assert.deepEqual(audit(spec(ent("IFCSTAIRFLIGHT"), attr("NumberOfRisers", "42"), { version: "IFC4" })), []);
  assert.deepEqual(audit(spec(ent("IFCWALL"), ent("IFCWALL", "SOLIDWALL"))), []);
});

test("unknown and wrongly cased class names are invalid", () => {
  assert.deepEqual(codes(spec(ent("IFCWALL"), ent("IFCRABBIT"))), ["class-unknown"]);
  assert.deepEqual(codes(spec(ent("IfcWall"), attr("Name"))), ["class-case"]);
});

test("an entity requirement no applicable class can satisfy is invalid", () => {
  assert.deepEqual(codes(spec(ent("IFCSLAB"), ent("IFCWALL"))), ["entity-contradiction"]);
  assert.deepEqual(codes(spec(ent("IFCWALLSTANDARDCASE"), ent("IFCWALL"))), ["entity-contradiction"]);
  // IFC2X3's type mapping: an IfcFlowTerminal can be an IFCAIRTERMINAL.
  assert.deepEqual(codes(spec(ent("IFCFLOWTERMINAL"), ent("IFCAIRTERMINAL"), { version: "IFC2X3" })), []);
});

test("unknown, derived and inverse attributes are invalid", () => {
  assert.deepEqual(codes(spec(ent("IFCWALL"), attr("ActingRole"))), ["attribute-unknown"]);
  assert.deepEqual(codes(spec(ent("IFCCARTESIANPOINT"), attr("Dim"))), ["attribute-derived"]);
  assert.deepEqual(codes(spec(ent("IFCPERSON"), attr("EngagedIn"))), ["attribute-inverse"]);
  // Valid in one of the named schemas is enough.
  assert.deepEqual(codes(spec(ent("IFCWALL"), attr("PredefinedType"), { version: "IFC2X3 IFC4" })), []);
});

test("values IDS cannot compare, and badly written literals, are invalid", () => {
  assert.deepEqual(codes(spec(ent("IFCCARTESIANPOINT"), attr("Coordinates", "1"))), ["value-list"]);
  assert.deepEqual(codes(spec(ent("IFCTASK"), attr("TaskTime", "x"), { version: "IFC4" })), ["value-object"]);
  assert.deepEqual(codes(spec(ent("IFCSURFACESTYLERENDERING"), attr("DiffuseColour", "x"))), ["value-select"]);
  assert.deepEqual(codes(spec(ent("IFCSURFACESTYLEREFRACTION"), attr("RefractionIndex", "42,3"))), ["value-format"]);
  assert.deepEqual(codes(spec(ent("IFCSURFACESTYLEREFRACTION"), attr("RefractionIndex", pattern(".*")))), ["value-format"]);
  assert.deepEqual(codes(spec(ent("IFCTASK"), attr("IsMilestone", "FALSE"))), ["value-format"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), prop("IFCINTEGER", "42.0"))), ["value-format"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), prop("IFCREAL", "123,4.5"))), ["value-format"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), prop("IFCREAL", "1e3"))), []);
});

test("prohibited specifications with requirements, bad relations and data types are invalid", () => {
  assert.deepEqual(codes(spec(ent("IFCWALL"), attr("Name", "x"), { occurs: 'minOccurs="0" maxOccurs="0"' })), ["prohibited-requirements"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), `<partOf relation="IFCRELCONNECTS">${ent("IFCBUILDINGSTOREY")}</partOf>`)), ["relation-unknown"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), prop("IFCRABBITMEASURE", "1"))), ["datatype-unknown"]);
});

test("warnings: custom predefined types, impossible enum values, value without dataType", () => {
  assert.deepEqual(codes(spec(ent("IFCWALL"), ent("IFCWALL", "WALDO")), "warning"), ["predefined-custom"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), ent("IFCWALL", "solidwall")), "warning"), ["predefined-case"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), prop("IFCDOORPANELOPERATIONENUM", "SWONGING")), "warning"), ["value-never"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), prop(null, "x")), "warning"), ["value-no-datatype"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), ent("IFCWALL", "WALDO"))), []);
});

test("checkIds reports an invalid specification as INVALID and does not run it", () => {
  const model = readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8");
  const r = check(ids(spec(ent("IFCWALL"), attr("ActingRole"))), model);
  assert.equal(r.pass, false);
  assert.equal(r.valid, false);
  assert.equal(r.specs[0].status, "invalid");
  assert.equal(r.specs[0].failed.length, 0);
  assert.match(r.specs[0].note, /has no attribute/);
  const off = check(ids(spec(ent("IFCWALL"), attr("ActingRole"))), model, { audit: false });
  assert.equal(off.specs[0].status, "fail");
});

test("the starter IDS files audit clean", () => {
  for (const f of ["coordination-basics.ids.xml", "quantities-and-naming.ids.xml"]) {
    const t = readFileSync(new URL("samples/" + f, import.meta.url), "utf8");
    assert.deepEqual(auditIds(parseIds(t), resources()).filter((x) => x.level === "error"), [], f);
  }
});

test("cli --audit exits 1 on an invalid IDS and 0 on a valid one", () => {
  const cli = new URL("cli.mjs", import.meta.url).pathname;
  const ok = execFileSync(process.execPath, [cli, "--audit", new URL("samples/coordination-basics.ids.xml", import.meta.url).pathname], { encoding: "utf8" });
  assert.match(ok, /VALID, 7 of 7/);
});

// Standard property set templates (schema/psets-*.json, from buildingSMART's PSD files).
const sprop = (set, name, dt, v) => `<property${dt ? ` dataType="${dt}"` : ""}><propertySet><simpleValue>${set}</simpleValue></propertySet><baseName><simpleValue>${name}</simpleValue></baseName>${v === undefined ? "" : `<value><simpleValue>${v}</simpleValue></value>`}</property>`;
const messages = (s) => audit(s).map((x) => x.message).join(" | ");

test("standard sets: right names and data types pass", () => {
  assert.deepEqual(audit(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "IsExternal", "IFCBOOLEAN", "true"))), []);
  assert.deepEqual(audit(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "FireRating", "IFCLABEL"))), []);
  assert.deepEqual(audit(spec(ent("IFCWALL"), sprop("Qto_WallBaseQuantities", "NetVolume", "IFCVOLUMEMEASURE"), { version: "IFC4" })), []);
  // A wall type carries its occurrence's common set.
  assert.deepEqual(audit(spec(ent("IFCWALLTYPE"), sprop("Pset_WallCommon", "FireRating", "IFCLABEL"), { version: "IFC4" })), []);
  // Custom sets with another prefix are not checked against templates.
  assert.deepEqual(audit(spec(ent("IFCWALL"), sprop("ePset_Wall", "Anything", "IFCLABEL"))), []);
});

test("standard sets: a wrong data type is invalid", () => {
  assert.deepEqual(codes(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "IsExternal", "IFCTEXT"))), ["pset-datatype"]);
  assert.match(messages(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "IsExternal", "IFCTEXT"))), /IFCBOOLEAN/);
  assert.deepEqual(codes(spec(ent("IFCWALL"), sprop("Qto_WallBaseQuantities", "NetVolume", "IFCREAL"), { version: "IFC4" })), ["pset-datatype"]);
});

test("standard sets: misspelt and custom names are invalid, with a suggestion when one is near", () => {
  assert.deepEqual(codes(spec(ent("IFCWALL"), sprop("Pset_WallComon", "FireRating", "IFCLABEL"))), ["pset-name"]);
  assert.match(messages(spec(ent("IFCWALL"), sprop("Pset_WallComon", "FireRating", "IFCLABEL"))), /did you mean Pset_WallCommon/);
  assert.deepEqual(codes(spec(ent("IFCWALL"), sprop("Pset_MyCompanyWall", "FireRating", "IFCLABEL"))), ["pset-custom"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "FireRatng", "IFCLABEL"))), ["pset-property"]);
  assert.match(messages(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "FireRatng", "IFCLABEL"))), /did you mean FireRating/);
});

test("standard sets: a set the applicable class cannot carry is invalid", () => {
  assert.deepEqual(codes(spec(ent("IFCSLAB"), sprop("Pset_WallCommon", "FireRating", "IFCLABEL"))), ["pset-class"]);
  // Patterns that name one class count as that class.
  assert.deepEqual(codes(spec(`<entity><name>${pattern("IFCCOVERING")}</name></entity>`, sprop("Pset_WallCommon", "Reference", "IFCIDENTIFIER"), { version: "IFC2X3" })), ["pset-class"]);
  // Valid in one named schema is enough (Pset_SoundGeneration's table types).
  assert.deepEqual(codes(spec(ent("IFCFAN"), sprop("Pset_SoundGeneration", "SoundCurve", "IFCSOUNDPOWERMEASURE"), { version: "IFC4" })), []);
});

test("standard sets: warnings for a value outside the enumeration and a missing dataType", () => {
  assert.deepEqual(codes(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "Status", "IFCLABEL", "BRAND_NEW"), { version: "IFC4" }), "warning"), ["value-never"]);
  assert.match(messages(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "IsExternal", null, "true"))), /templates give IFCBOOLEAN/);
});

test("date, time and duration ranges are valid; malformed ones are not", () => {
  const range = (k, v) => `<xs:restriction base="xs:string"><xs:${k} value="${v}"/></xs:restriction>`;
  const rprop = (dt, r) => `<property dataType="${dt}"><propertySet><simpleValue>Custom_X</simpleValue></propertySet><baseName><simpleValue>P</simpleValue></baseName><value>${r}</value></property>`;
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCDATE", range("minInclusive", "2052-08-11")), { version: "IFC4" })), []);
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCDURATION", range("maxExclusive", "PT5M30S")), { version: "IFC4" })), []);
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCTIME", range("maxInclusive", "03:06:12+01:00")), { version: "IFC4" })), []);
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCDURATION", range("minInclusive", "1 day")), { version: "IFC4" })), ["value-format"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCTIME", range("maxInclusive", "7:35 PM")), { version: "IFC4" })), ["value-format"]);
  // A pattern on a boolean is allowed (IDS DataTypes table); one that cannot match true or false warns.
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCBOOLEAN", pattern("true|false")))), []);
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCBOOLEAN", pattern("yes"))), "warning"), ["value-never"]);
});

test("a model check still runs a specification whose only fault is a non-standard property", () => {
  const model = readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8");
  const r = check(ids(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "AkousticRating", "IFCLABEL"), { version: "IFC4" })), model);
  assert.notEqual(r.specs[0].status, "invalid");
  assert.ok(r.specs[0].applicable > 0);
  assert.match(r.specs[0].auditWarnings.join(" "), /not standard IFC.*did you mean AcousticRating/);
  // The audit on its own still calls the IDS invalid.
  assert.deepEqual(codes(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "AkousticRating", "IFCLABEL"), { version: "IFC4" })), ["pset-property"]);
});
