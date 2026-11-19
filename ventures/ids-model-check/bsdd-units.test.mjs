// bsdd-units.mjs: a bSDD Real property's IFC measure from its unit or
// dimension, and its values in SI (schema/bsdd-units.json, no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { measureOf, toSI, unitsOf, levelOf } from "./bsdd-units.mjs";
import { specFromBsddClass, bsddIds } from "./bsdd-spec.mjs";
import { resources } from "./node.mjs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";

const R = resources();
const S = R.schemas.IFC4X3;
const U = R.bsddUnits;
const m = (p, schema = S) => measureOf(p, { units: U, schema });

test("units name one measure and the SI factor", () => {
  assert.deepEqual(m({ units: ["mm"] }), { type: "IFCLENGTHMEASURE", scale: 0.001, offset: 0, unit: "mm" });
  assert.equal(m({ units: ["m²"] }).type, "IFCAREAMEASURE");
  assert.equal(m({ qudtCodes: ["YR"], units: ["yr"] }).type, "IFCTIMEMEASURE", "QUDT names are read first");
  assert.equal(m({ units: ["W/(m²·K)"] }).type, "IFCTHERMALTRANSMITTANCEMEASURE");
  assert.equal(m({ units: ["W/(m·K)"] }).type, "IFCTHERMALCONDUCTIVITYMEASURE");
  assert.equal(m({ units: ["kN"] }).scale, 1000);
  assert.equal(m({ units: ["l/s"] }).type, "IFCVOLUMETRICFLOWRATEMEASURE");
  const c = m({ units: ["°C"] });
  assert.equal(c.type, "IFCTHERMODYNAMICTEMPERATUREMEASURE");
  assert.equal(toSI("20", c), "293.15");
});

test("a kind tells apart measures of one dimension", () => {
  assert.equal(m({ units: ["Nm"] }).type, "IFCTORQUEMEASURE");
  assert.equal(m({ units: ["J"] }).type, "IFCENERGYMEASURE");
  assert.equal(m({ units: ["lm"] }).type, "IFCLUMINOUSFLUXMEASURE");
  assert.equal(m({ units: ["rad"] }).type, "IFCPLANEANGLEMEASURE");
  assert.equal(m({ units: ["m³"] }).type, "IFCVOLUMEMEASURE", "QUDT's M3 is also a SectionModulus");
  assert.equal(m({ units: ["kPa"] }).type, "IFCPRESSUREMEASURE", "QUDT's kPa is also a ModulusOfElasticity");
  assert.equal(m({ units: ["m⁴"] }).type, "IFCMOMENTOFINERTIAMEASURE");
  assert.match(m({ units: ["dB"] }).why, /2 kinds/, "a sound pressure or a sound power level");
});

test("a decibel property is a pressure or a power level by its name, else no measure", () => {
  const db = (extra) => m({ units: ["dB"], qudtCodes: ["DeciB"], ...extra });
  assert.deepEqual(db({ propertyCode: "LA_Fmax_nT" }), { type: "IFCSOUNDPRESSURELEVELMEASURE", scale: 1, offset: 0, unit: "DeciB" });
  for (const c of ["LC_Smax", "L'nT,w", "L′n,w", "Ln,w", "LAeq", "L_p", "Lden"]) assert.equal(levelOf({ propertyCode: c }), "IFCSOUNDPRESSURELEVELMEASURE", c);
  for (const c of ["L_W", "LWA", "Lw", "L_WA"]) assert.equal(levelOf({ propertyCode: c }), "IFCSOUNDPOWERLEVELMEASURE", c);
  for (const c of ["R_w", "R'w", "DnT,w", "D_nT_w", "C_tr", "Length", "Lnw", "L", "NoiseLevel"]) assert.equal(levelOf({ propertyCode: c }), null, c);
  assert.equal(levelOf({ propertyCode: "X1", physicalQuantity: "Sound power level" }), "IFCSOUNDPOWERLEVELMEASURE");
  assert.equal(levelOf({ propertyCode: "X1", name: "Schalldruckpegel" }), "IFCSOUNDPRESSURELEVELMEASURE");
  assert.equal(levelOf({ propertyCode: "LWA", name: "Sound pressure level" }), "IFCSOUNDPRESSURELEVELMEASURE", "words win over the symbol");
  assert.equal(levelOf({ name: "Sound power and sound pressure level" }), null, "both named: no pick");
  assert.match(db({ propertyCode: "R_w" }).why, /2 kinds.*neither the name/);
  assert.match(db({ propertyCode: "LA_Fmax_nT", dimension: "1 0 0 0 0 0 0" }).why, /not of the property's dimension/, "CEN/TC 126's counter in the length slot keeps it IFCREAL");
  assert.match(m({ units: ["dB"], propertyCode: "LWA" }, R.schemas.IFC2X3).why || "", /not in the chosen IFC schema/);
});

test("bSDD's \"°\" is read as the degree, not QUDT's GRAD (gon) it links to", () => {
  assert.equal(U.codes["°"], "DEG");
  const d = m({ units: ["°"] });
  assert.equal(d.type, "IFCPLANEANGLEMEASURE");
  assert.equal(toSI("90", d), String(Number((Math.PI / 2).toPrecision(12))));
});

test("no measure: dimensionless, mixed dimensions, a unit against the stated dimension, unknown", () => {
  assert.match(m({ units: ["%"] }).why, /dimensionless/);
  assert.match(m({ units: ["mm", "kg"] }).why, /different measures/);
  assert.match(m({ units: ["mm"], dimension: "2 0 0 0 0 0 0" }).why, /not of the property's dimension/);
  assert.match(m({ units: ["furlongs per fortnight"] }).why, /not in bSDD's unit list/);
  assert.equal(m({}).why, "no unit or dimension");
  assert.equal(m({ units: ["kg/m²"] }, R.schemas.IFC2X3).type, null, "IFC2X3 has no IfcAreaDensityMeasure");
});

test("a dimension alone names the type but no factor; two units of one measure likewise", () => {
  assert.deepEqual(m({ dimension: "1 0 0 0 0 0 0" }), { type: "IFCLENGTHMEASURE", scale: null, offset: null, unit: null });
  assert.equal(m({ dimensionLength: 0, dimensionMass: 1, dimensionTime: -3, dimensionElectricCurrent: 0, dimensionThermodynamicTemperature: -1, dimensionAmountOfSubstance: 0, dimensionLuminousIntensity: 0 }).type, "IFCTHERMALTRANSMITTANCEMEASURE");
  const two = m({ units: ["mm", "m"] });
  assert.equal(two.type, "IFCLENGTHMEASURE");
  assert.equal(two.scale, null);
  assert.equal(toSI("3", two), null);
  assert.deepEqual(unitsOf({ units: ["mm", "zz"] }, U).unknown, ["zz"]);
});

test("toSI drops float noise", () => {
  assert.equal(toSI("3000", { scale: 0.001, offset: 0 }), "3");
  assert.equal(toSI("0.1", { scale: 0.001, offset: 0 }), "0.0001");
  assert.equal(toSI("x", { scale: 1, offset: 0 }), null);
});

const LCA = "https://identifier.buildingsmart.org/uri/example/demo/1";
const CLS = {
  code: "Wand", referenceCode: "Wand", name: "Wand", uri: `${LCA}/class/Wand`, dictionaryUri: LCA, status: "Active", classType: "Class",
  relatedIfcEntityNames: ["IFCWALL"],
  classProperties: [
    { propertySet: "Maten", propertyCode: "Dikte", dataType: "Real", units: ["mm"], minInclusive: 50, maxInclusive: 400 },
    { propertySet: "Maten", propertyCode: "Hoogte", dataType: "Real", units: ["mm"], predefinedValue: "3000" },
    { propertySet: "Maten", propertyCode: "Hoek", dataType: "Real", units: ["°"], allowedValues: [{ value: "90" }, { value: "45" }] },
    { propertySet: "Maten", propertyCode: "Aandeel", dataType: "Real", units: ["%"], maxInclusive: 100 },
    { propertySet: "Maten", propertyCode: "Breedte", dataType: "Real", units: ["mm", "m"], minInclusive: 1 },
    { propertySet: "Maten", propertyCode: "Lengte", dataType: "Real", units: ["mm", "m"] },
    { propertySet: "Maten", propertyCode: "Getal", dataType: "Real" },
    { propertySet: "Maten", propertyCode: "Aantal", dataType: "Integer", units: ["mm"] },
    { propertySet: "Pset_WallCommon", propertyCode: "ThermalTransmittance", dataType: "Real", units: ["W/(m²·K)"] },
  ],
};

test("the generator writes the measure and SI values, and keeps IFCREAL where it cannot", () => {
  const { spec, notes } = specFromBsddClass(CLS, { schema: S, psets: R.psets.IFC4X3, units: U, dictionaryName: "Demo" });
  const by = Object.fromEntries(spec.requirements.filter((f) => f.kind === "property").map((f) => [f.name, f]));
  assert.equal(by.Dikte.dataType, "IFCLENGTHMEASURE");
  assert.equal(by.Dikte.value.r.minInclusive, "0.05");
  assert.equal(by.Dikte.value.r.maxInclusive, "0.4");
  assert.deepEqual(by.Hoogte.value, { equals: "3" });
  assert.equal(by.Hoek.dataType, "IFCPLANEANGLEMEASURE");
  assert.equal(by.Hoek.value.oneOf.length, 2);
  assert.equal(by.Aandeel.dataType, "IFCREAL", "percent: the dictionary may mean 0-100");
  assert.equal(by.Breedte.dataType, "IFCREAL", "a bound in mm or m cannot be written in SI");
  assert.equal(by.Lengte.dataType, "IFCLENGTHMEASURE", "no value: the type is enough");
  assert.equal(by.Getal.dataType, "IFCREAL");
  assert.equal(by.Aantal.dataType, "IFCINTEGER", "only Real properties are mapped");
  assert.equal(by.ThermalTransmittance.dataType, "IFCTHERMALTRANSMITTANCEMEASURE", "the template's type");
  assert.ok(notes.some((n) => /Aandeel: Real kept as IFCREAL \(unit %: dimensionless\)/.test(n)));
  assert.ok(notes.some((n) => /Breedte: Real kept as IFCREAL; IFCLENGTHMEASURE would need/.test(n)));
  assert.ok(notes.some((n) => /Dikte: values in mm written in SI/.test(n)));
  // Without the unit table, as before: IFCREAL and the raw values.
  const old = specFromBsddClass(CLS, { schema: S, psets: R.psets.IFC4X3, dictionaryName: "Demo" }).spec.requirements.find((f) => f.name === "Dikte");
  assert.equal(old.dataType, "IFCREAL");
  assert.equal(old.value.r.minInclusive, "50");
});

test("bsddIds with units writes an IDS the audit passes", async () => {
  const fetch = async (url) => {
    const u = new URL(url);
    const hit = u.pathname.startsWith("/api/Dictionary") ? { dictionaries: [{ name: "Demo", uri: LCA }] } : CLS;
    return { ok: true, status: 200, text: async () => JSON.stringify(hit) };
  };
  const r = await bsddIds([CLS.uri], { fetch, schemas: R.schemas, psets: R.psets, schema: S, units: U });
  assert.match(r.text, /<property dataType="IFCLENGTHMEASURE" cardinality="optional">\s*<propertySet>\s*<simpleValue>Maten<\/simpleValue>\s*<\/propertySet>\s*<baseName>\s*<simpleValue>Dikte/);
  const issues = auditIds(parseIds(r.text), { schemas: R.schemas, typeMap: R.typeMap, psets: R.psets });
  assert.deepEqual(issues.filter((x) => x.level === "error"), []);
});

test("the bSDD link check reads a measure facet's SI values against bSDD's unit", async () => {
  const { checkBsdd } = await import("./bsdd.mjs");
  const P = `${LCA}/prop/Druk`;
  const entry = { code: "Druk", name: "Druk", uri: P, dataType: "Real", units: ["kPa"], dictionaryUri: LCA, status: "Active", allowedValues: [{ value: "100" }, { value: "200" }] };
  const ids = `<?xml version="1.0" encoding="UTF-8"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="s" ifcVersion="IFC4X3_ADD2"><applicability><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><property dataType="IFCPRESSUREMEASURE" uri="${P}"><propertySet><simpleValue>Maten</simpleValue></propertySet><baseName><simpleValue>Druk</simpleValue></baseName><value><xs:restriction base="xs:double"><xs:enumeration value="100000"/><xs:enumeration value="200000"/></xs:restriction></value></property></requirements></specification></specifications></ids>`;
  const fetch = async (url) => {
    const u = new URL(url);
    const hit = u.pathname.startsWith("/api/Dictionary") ? { dictionaries: [{ name: "Demo", uri: LCA, isLatestVersion: true }] } : entry;
    return { ok: true, status: 200, text: async () => JSON.stringify(hit) };
  };
  const without = await checkBsdd(ids, { fetch, schemas: R.schemas });
  assert.ok(without.findings.some((f) => f.code === "bsdd-value"), "kPa values in Pa look wrong without the unit table");
  const withUnits = await checkBsdd(ids, { fetch, schemas: R.schemas, units: U });
  assert.deepEqual(withUnits.findings.filter((f) => f.code === "bsdd-value"), []);
});
