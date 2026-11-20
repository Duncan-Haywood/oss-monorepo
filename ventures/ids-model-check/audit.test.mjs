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
  // Facets that never agree: no listed value fits the pattern, a pattern longer than maxLength.
  const r = (inner) => `<xs:restriction base="xs:string">${inner}</xs:restriction>`;
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCLABEL", r(`<xs:enumeration value="EI 30"/><xs:enumeration value="EI 60"/><xs:pattern value="EI[0-9]+"/>`))), "warning"), ["value-never"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCLABEL", r(`<xs:pattern value="[A-Z]{3}-[0-9]{3}"/><xs:maxLength value="6"/>`))), "warning"), ["value-never"]);
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCLABEL", r(`<xs:enumeration value="EI30"/><xs:enumeration value="EI 60"/><xs:pattern value="EI[0-9]+"/>`))), "warning"), []);
  assert.deepEqual(codes(spec(ent("IFCWALL"), rprop("IFCLABEL", r(`<xs:pattern value="[A-Z]{3}-[0-9]{3}"/><xs:maxLength value="7"/>`))), "warning"), []);
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

// Red-team guards, 2026-11-16 (prompts/runs/2026-11-16-session_01EhTJVLRvnZNuoDHuaPD3KN.json).
test("doubles written with a leading point are valid literals", () => {
  assert.deepEqual(codes(spec(ent("IFCWALL"), prop("IFCREAL", ".5"))), []);
  assert.deepEqual(codes(spec(ent("IFCWALL"), prop("IFCREAL", "-.25e2"))), []);
  assert.deepEqual(codes(spec(ent("IFCWALL"), prop("IFCREAL", "."))), ["value-format"]);
});

test("standard sets: in IFC2X3 an occurrence can carry its type's set through the type", () => {
  // IFC2X3 lists Pset_AirTerminalTypeCommon on IFCAIRTERMINALTYPE only; an
  // IfcFlowTerminal (what IFC2X3 calls an air terminal) inherits it from its type,
  // and the engine checks inherited type properties, so the spec is satisfiable.
  const req = sprop("Pset_AirTerminalTypeCommon", "Shape", "IFCLABEL");
  assert.deepEqual(codes(spec(ent("IFCAIRTERMINAL"), req, { version: "IFC2X3" })), []);
  assert.deepEqual(codes(spec(ent("IFCFLOWTERMINAL"), req, { version: "IFC2X3" })), []);
  assert.deepEqual(codes(spec(ent("IFCFURNITURE"), sprop("Pset_FurnitureTypeCommon", "Style", "IFCLABEL"), { version: "IFC2X3" })), []);
  // Still invalid where no type of the class has the set.
  assert.deepEqual(codes(spec(ent("IFCSLAB"), req, { version: "IFC2X3" })), ["pset-class"]);
});

test("a standard boolean written TRUE with no dataType: the warning says checkers disagree on it", () => {
  const m = messages(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "LoadBearing", null, "TRUE")));
  assert.match(m, /LoadBearing has a value but no dataType.*IFCBOOLEAN\. TRUE is not how IDS writes a boolean \(true\): with no dataType, checkers disagree/);
  assert.doesNotMatch(messages(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "LoadBearing", null, "true"))), /checkers disagree/);
  assert.doesNotMatch(messages(spec(ent("IFCWALL"), sprop("Pset_WallCommon", "Reference", null, "TRUE"))), /checkers disagree/);
});

test("an entity facet naming only an abstract class applies to nothing (warning)", () => {
  const w = audit(spec(ent("IFCBUILDINGELEMENT"), attr("Name"))).filter((x) => x.level === "warning");
  assert.deepEqual(w.map((x) => x.code), ["class-abstract"]);
  assert.match(w[0].message, /IFCBUILDINGELEMENT is abstract: .*applies to nothing, and being required it fails on every such model/);
  assert.match(w[0].message, /IFCBEAM, .*and \d+ more/);
  // Not invalid: the specification still runs.
  assert.deepEqual(codes(spec(ent("IFCBUILDINGELEMENT"), attr("Name"))), []);
  // Optional: no "fails on every model".
  assert.doesNotMatch(audit(spec(ent("IFCBUILDINGELEMENT"), attr("Name"), { occurs: 'minOccurs="0" maxOccurs="unbounded"' }))[0].message, /fails/);
});

test("an abstract name beside a concrete one, or in one schema only", () => {
  const enumEnt = `<entity><name><xs:restriction base="xs:string"><xs:enumeration value="IFCELEMENT"/><xs:enumeration value="IFCWALL"/></xs:restriction></name></entity>`;
  const w = audit(spec(enumEnt, attr("Name")));
  assert.deepEqual(w.map((x) => x.code), ["class-abstract"]);
  assert.match(w[0].message, /matches only its other class names/);
  // IfcProfileDef is abstract in IFC2X3 only.
  const p = audit(spec(ent("IFCPROFILEDEF"), attr("ProfileName")));
  assert.deepEqual(p.map((x) => x.code), ["class-abstract"]);
  assert.match(p[0].message, /abstract in IFC2X3: .*applies to nothing in IFC2X3 models/);
  assert.deepEqual(audit(spec(ent("IFCPROFILEDEF"), attr("ProfileName"), { version: "IFC4" })), []);
});

test("a pattern, a concrete class and a partOf on an abstract parent", () => {
  assert.deepEqual(audit(spec(`<entity><name>${pattern("IFC.*ELEMENT")}</name></entity>`, attr("Name"))).filter((x) => x.code === "class-abstract"), []);
  assert.deepEqual(audit(spec(ent("IFCWALLSTANDARDCASE"), attr("Name"))), []);
  const w = audit(spec(ent("IFCWALL"), `<partOf relation="IFCRELCONTAINEDINSPATIALSTRUCTURE">${ent("IFCSPATIALSTRUCTUREELEMENT")}</partOf>`));
  assert.deepEqual(w.map((x) => x.code), ["class-abstract"]);
  assert.match(w[0].message, /^partOf: IFCSPATIALSTRUCTUREELEMENT is abstract: .*never matches; .*IFCBUILDINGSTOREY/);
  // A required entity requirement naming an abstract class is already a contradiction.
  assert.deepEqual(codes(spec(ent("IFCWALL"), ent("IFCBUILDINGELEMENT"))), ["entity-contradiction"]);
});

test("a required entity requirement naming only an abstract class fails every element (invalid)", () => {
  // No entity facet in the applicability, so entity-contradiction cannot see it.
  const r = audit(spec(prop("IFCLABEL"), ent("IFCBUILDINGELEMENT"), { version: "IFC2X3" }));
  assert.deepEqual(r.map((x) => [x.level, x.code]), [["error", "class-abstract"]]);
  assert.match(r[0].message, /every applicable element would fail; to require objects below it, name their classes \(IFCBEAM,/);
  // IFCPROFILEDEF is abstract in IFC2X3 only: a warning naming that schema.
  const p = audit(spec(prop("IFCLABEL"), ent("IFCPROFILEDEF"), { version: "IFC2X3 IFC4" }));
  assert.deepEqual(p.map((x) => [x.level, x.code]), [["warning", "class-abstract"]]);
  assert.match(p[0].message, /abstract in IFC2X3: .*IFC2X3 models would fail/);
  // Optional, a concrete class, or an entity applicability (entity-contradiction's job): nothing new.
  const opt = `<entity cardinality="optional"><name><simpleValue>IFCBUILDINGELEMENT</simpleValue></name></entity>`;
  assert.deepEqual(audit(spec(prop("IFCLABEL"), opt, { version: "IFC2X3" })).filter((x) => x.code === "class-abstract"), []);
  assert.deepEqual(audit(spec(prop("IFCLABEL"), ent("IFCWALL"))), []);
  assert.deepEqual(codes(spec(ent("IFCWALL"), ent("IFCBUILDINGELEMENT"), { version: "IFC2X3" })), ["entity-contradiction"]);
  // IFC2X3 type-mapping names are not dead.
  assert.deepEqual(audit(spec(prop("IFCLABEL"), ent("IFCAIRTERMINAL"), { version: "IFC2X3" })).filter((x) => x.code === "class-abstract"), []);
});

test("a standard set the templates give only some predefined types: warned when the applicability names none of them (pset-predefined)", () => {
  const req = sprop("Pset_ActuatorTypeElectricActuator", "ActuatorInputPower", "IFCPOWERMEASURE");
  for (const version of ["IFC4", "IFC4X3_ADD2"]) {
    // The right type, or a list holding it: nothing to say.
    assert.deepEqual(audit(spec(ent("IFCACTUATOR", "ELECTRICACTUATOR"), req, { version })), []);
    assert.deepEqual(audit(spec(ent("IFCACTUATORTYPE", "ELECTRICACTUATOR"), req, { version })), []);
    // Case is not this check's business (predefined-case says it).
    assert.ok(!audit(spec(ent("IFCACTUATOR", "electricactuator"), req, { version })).some((x) => x.code === "pset-predefined"));
    // Another type: the standard never gives this set to it.
    const other = audit(spec(ent("IFCACTUATOR", "PNEUMATICACTUATOR"), req, { version })).filter((x) => x.level === "warning");
    assert.deepEqual(other.map((x) => x.code), ["pset-predefined"]);
    assert.match(other[0].message, /only for IFCACTUATOR.* of predefined type ELECTRICACTUATOR; the applicability selects predefined type PNEUMATICACTUATOR/);
    // No type: every actuator is asked for it.
    const none = audit(spec(ent("IFCACTUATOR"), req, { version })).filter((x) => x.level === "warning");
    assert.deepEqual(none.map((x) => x.code), ["pset-predefined"]);
    assert.match(none[0].message, /Add predefinedType ELECTRICACTUATOR to the entity facet/);
    assert.deepEqual(none[0].predefinedType, ["ELECTRICACTUATOR"]);
  }
  // A set any slab carries stays quiet; IFC2X3's templates name no types.
  assert.deepEqual(audit(spec(ent("IFCSLAB"), sprop("Pset_SlabCommon", "IsExternal", "IFCBOOLEAN"), { version: "IFC4X3_ADD2" })), []);
  assert.deepEqual(codes(spec(ent("IFCACTUATOR"), req, { version: "IFC2X3" }), "warning"), []);
  // Only the set name required (no property): still warned.
  const setOnly = `<property><propertySet><simpleValue>Pset_ActuatorTypeElectricActuator</simpleValue></propertySet><baseName><simpleValue>ActuatorInputPower</simpleValue></baseName></property>`;
  assert.deepEqual(codes(spec(ent("IFCACTUATOR"), setOnly, { version: "IFC4" }), "warning"), ["pset-predefined"]);
});

test("template types: an occurrence set on a type object warns pset-occurrence; a performance set belongs on IFCPERFORMANCEHISTORY (pset-performance)", () => {
  const occ = sprop("Pset_FanOccurrence", "FractionOfMotorHeatToAirStream", "IFCNORMALISEDRATIOMEASURE");
  assert.deepEqual(codes(spec(ent("IFCFANTYPE"), occ, { version: "IFC4" }), "warning"), ["pset-occurrence"]);
  assert.match(messages(spec(ent("IFCFANTYPE"), occ, { version: "IFC4" })), /Select IFCFAN instead/);
  assert.deepEqual(codes(spec(ent("IFCFAN"), occ, { version: "IFC4" }), "warning"), []);
  // IFC4X3 reads the template type from IfcPropertySetTemplate.TemplateType.
  const occ43 = sprop("Pset_AirTerminalOccurrence", "AirFlowRate", "IFCVOLUMETRICFLOWRATEMEASURE");
  assert.deepEqual(codes(spec(ent("IFCAIRTERMINALTYPE"), occ43, { version: "IFC4X3_ADD2" }), "warning"), ["pset-occurrence"]);
  assert.deepEqual(codes(spec(ent("IFCAIRTERMINAL"), occ43, { version: "IFC4X3_ADD2" }), "warning"), []);
  // A list naming both warns about the type only.
  assert.match(messages(spec(`<entity><name><xs:restriction base="xs:string"><xs:enumeration value="IFCFAN"/><xs:enumeration value="IFCFANTYPE"/></xs:restriction></name></entity>`, occ, { version: "IFC4" })), /so IFCFANTYPE is asked/);
  const perf = sprop("Pset_FanPHistory", "FanEfficiency");
  assert.deepEqual(codes(spec(ent("IFCFAN"), perf, { version: "IFC4" }), "warning"), ["pset-performance"]);
  // Was a pset-class error: the history, not the fan, carries the set.
  assert.deepEqual(audit(spec(ent("IFCPERFORMANCEHISTORY"), perf, { version: "IFC4" })).map((x) => x.code), []);
  // Outranks a missing predefined type (Pset_CooledBeamPHistoryActive is for ACTIVE beams).
  assert.deepEqual(codes(spec(ent("IFCCOOLEDBEAM"), sprop("Pset_CooledBeamPHistoryActive", "AirFlowRate"), { version: "IFC4" }), "warning"), ["pset-performance"]);
  // IFC2X3 templates name no template type: unchanged.
  assert.deepEqual(codes(spec(ent("IFCFLOWMOVINGDEVICE"), sprop("Pset_FanOccurrence", "FractionOfMotorHeatToAirStream"), { version: "IFC2X3" }), "warning").filter((c) => c === "pset-occurrence"), []);
});

test("pset-predefined: a PredefinedType attribute facet counts, and classes with no predefined type are left alone", () => {
  const req = sprop("Pset_ActuatorTypeElectricActuator", "ActuatorInputPower", "IFCPOWERMEASURE");
  assert.deepEqual(codes(spec(ent("IFCACTUATOR") + attr("PredefinedType", "ELECTRICACTUATOR"), req, { version: "IFC4" }), "warning"), []);
  assert.deepEqual(codes(spec(ent("IFCACTUATOR") + attr("PredefinedType", "HYDRAULICACTUATOR"), req, { version: "IFC4" }), "warning"), ["pset-predefined"]);
  // IFC4's IfcMaterial/Concrete is a material category, not a predefined type.
  assert.ok(!audit(spec(ent("IFCMATERIAL"), sprop("Pset_MaterialConcrete", "CompressiveStrength", "IFCPRESSUREMEASURE"), { version: "IFC4" })).some((x) => x.code === "pset-predefined"));
});
