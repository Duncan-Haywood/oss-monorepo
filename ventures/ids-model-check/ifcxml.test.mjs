// ifcXML and .ifczip input: the readers, and the checker's verdicts on the same
// model in each form.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";
import { execFileSync } from "node:child_process";
import { parseIfcXml, ifcXmlSchemaId } from "./ifcxml.mjs";
import { zipEntries, unzipModel, pickModel } from "./zip.mjs";
import { Model } from "./ids.mjs";
import { check, resources, readModel } from "./node.mjs";

const here = (p) => new URL(p, import.meta.url);
const file = (p) => readFileSync(here(p), "utf8");
const { schemas } = resources();

// Every attribute of every entity, refs mapped back to STEP ids ("iN" is #N).
function sameEntities(step, xml) {
  const S = new Model(step, schemas), X = new Model(xml, schemas);
  const toStep = new Map([...X.entities.values()].map((e) => [e.id, Number(String(e.xmlId).slice(1))]));
  const byStep = new Map([...X.entities.values()].map((e) => [toStep.get(e.id), e]));
  const norm = (v, x) => {
    if (Array.isArray(v)) return v.map((y) => norm(y, x));
    if (v && typeof v === "object" && "ref" in v) return { ref: x ? toStep.get(v.ref) : v.ref };
    if (v && typeof v === "object" && "typed" in v) return { typed: v.typed, value: norm(v.value, x) };
    return v;
  };
  let n = 0;
  for (const e of S.entities.values()) {
    const x = byStep.get(e.id);
    assert.ok(x, `#${e.id} ${e.type} missing from the ifcXML`);
    assert.equal(x.type, e.type, `#${e.id}`);
    assert.deepEqual(norm(x.args, true), norm(e.args, false), `#${e.id} ${e.type}`);
    n += e.args.length;
  }
  assert.equal(X.entities.size, S.entities.size);
  return n;
}

// A report reduced to what a reader sees: verdicts, counts, failing elements by GlobalId.
const verdicts = (r) => r.specs.map((s) => ({ name: s.name, status: s.status, applicable: s.applicable, passed: s.passed, failed: s.failed.map((f) => [f.globalId, f.reasons]).sort() }));

test("the IFC4 ifcXML twin of the sample model reads entity for entity like the STEP file", () => {
  const n = sameEntities(file("samples/tiny-house.ifc"), file("samples/tiny-house.ifcxml"));
  assert.ok(n > 300, `${n} attribute values compared`);
});

test("both starter IDS files give the same verdicts on the .ifc and the .ifcxml", () => {
  for (const f of ["samples/coordination-basics.ids.xml", "samples/quantities-and-naming.ids.xml"]) {
    const a = check(file(f), file("samples/tiny-house.ifc"));
    const b = check(file(f), file("samples/tiny-house.ifcxml"));
    assert.equal(b.schema, "IFC4");
    assert.deepEqual(verdicts(b), verdicts(a), f);
    assert.ok(a.specs.some((s) => s.status === "fail") && a.specs.some((s) => s.status === "pass"), "the sample has passes and fails to compare");
  }
});

test("schema detection reads the namespace, not a FILE_SCHEMA line", () => {
  assert.equal(ifcXmlSchemaId(file("samples/tiny-house.ifcxml")), "IFC4");
  assert.equal(ifcXmlSchemaId('<?xml version="1.0"?><ex:iso_10303_28 xmlns:ex="urn:iso.org:standard:10303:part(28):version(2):xmlschema:common"><uos xmlns="http://www.iai-tech.org/ifcXML/IFC2x3/FINAL"/></ex:iso_10303_28>'), "IFC2X3");
  assert.equal(ifcXmlSchemaId('<ifcXML xmlns="https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/ifcXML"/>'), "IFC4X3");
  // IFC4X3 ADD2's XSD namespace, and a development build's.
  assert.equal(ifcXmlSchemaId('<ifcXML xmlns="https://standards.buildingsmart.org/IFC/RELEASE/IFC4/3/ADD2"/>'), "IFC4X3");
  assert.equal(ifcXmlSchemaId('<ifc:ifcXML xmlns:ifc="https://standards.buildingsmart.org/IFC/DEV/IFC4/3/ADD2/DEV/20260526"/>'), "IFC4X3");
  assert.equal(ifcXmlSchemaId('<ifcXML xmlns="https://standards.buildingsmart.org/IFC/RELEASE/IFC4/Add2TC1"/>'), "IFC4");
  assert.equal(ifcXmlSchemaId("ISO-10303-21;"), null);
  assert.throws(() => new Model('<?xml version="1.0"?><root/>', schemas), /not supported/);
});

// The IFC2X3 layout (ifcXML2), as xBIM and IFC Engine write it.
const IFC2X3_XML = `<?xml version="1.0" encoding="utf-8"?>
<ex:iso_10303_28 version="2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ex="urn:iso.org:standard:10303:part(28):version(2):xmlschema:common">
  <ex:iso_10303_28_header><ex:name>t</ex:name></ex:iso_10303_28_header>
  <uos id="uos_1" configuration="i_ifc2x3" xmlns="http://www.iai-tech.org/ifcXML/IFC2x3/FINAL">
    <IfcWallStandardCase id="i7">
      <GlobalId>2O2Fr$t4X7Zf8NOew3FNr2</GlobalId>
      <OwnerHistory><IfcOwnerHistory xsi:nil="true" ref="i1"/></OwnerHistory>
      <Name>Basic Wall</Name>
      <Tag>217140</Tag>
    </IfcWallStandardCase>
    <IfcPropertySingleValue id="i8"><Name>IsExternal</Name><NominalValue><IfcBoolean>true</IfcBoolean></NominalValue></IfcPropertySingleValue>
    <IfcPropertySingleValue id="i9"><Name>Width</Name><NominalValue><IfcLengthMeasure-wrapper>200.</IfcLengthMeasure-wrapper></NominalValue></IfcPropertySingleValue>
    <IfcPropertySet id="i10"><GlobalId>0aaaaaaaaaaaaaaaaaaaaa</GlobalId><Name>Pset_WallCommon</Name>
      <HasProperties ex:cType="set"><IfcPropertySingleValue pos="0" xsi:nil="true" ref="i8"/><IfcPropertySingleValue pos="1" xsi:nil="true" ref="i9"/></HasProperties></IfcPropertySet>
    <IfcRelDefinesByProperties id="i11"><GlobalId>0bbbbbbbbbbbbbbbbbbbbb</GlobalId>
      <RelatedObjects ex:cType="set"><IfcWallStandardCase pos="0" xsi:nil="true" ref="i7"/></RelatedObjects>
      <RelatingPropertyDefinition><IfcPropertySet xsi:nil="true" ref="i10"/></RelatingPropertyDefinition></IfcRelDefinesByProperties>
    <IfcCartesianPoint id="i12"><Coordinates ex:cType="list"><IfcLengthMeasure pos="0">0.</IfcLengthMeasure><IfcLengthMeasure pos="1">1500.</IfcLengthMeasure></Coordinates></IfcCartesianPoint>
    <IfcSite id="i13"><GlobalId>0ccccccccccccccccccccc</GlobalId><CompositionType>element</CompositionType>
      <RefLatitude><ex:long-wrapper pos="0">51</ex:long-wrapper><ex:long-wrapper pos="1">30</ex:long-wrapper></RefLatitude></IfcSite>
    <IfcSIUnit id="i14"><UnitType>lengthunit</UnitType><Prefix>milli</Prefix><Name>metre</Name></IfcSIUnit>
  </uos>
</ex:iso_10303_28>`;

test("the IFC2X3 layout: attributes as child elements, nil refs, selects with and without -wrapper, lists", () => {
  const p = parseIfcXml(IFC2X3_XML, schemas.IFC2X3);
  const by = (x) => [...p.entities.values()].find((e) => e.xmlId === x);
  const wall = by("i7");
  assert.equal(wall.type, "IFCWALLSTANDARDCASE");
  assert.equal(wall.args[0], "2O2Fr$t4X7Zf8NOew3FNr2");
  assert.equal(wall.args[2], "Basic Wall");
  assert.equal(wall.args[7], "217140", "Tag is a string even when it looks like a number");
  assert.deepEqual(by("i8").args[2], { typed: "IFCBOOLEAN", value: true });
  assert.deepEqual(by("i9").args[2], { typed: "IFCLENGTHMEASURE", value: 200 });
  assert.deepEqual(by("i12").args[0], [0, 1500]);
  const at = (e, n) => e.args[schemas.IFC2X3.attrs(e.type).index.get(n)];
  assert.deepEqual(at(by("i13"), "CompositionType"), { enum: "ELEMENT" });
  assert.deepEqual(at(by("i13"), "RefLatitude"), [51, 30]);
  assert.deepEqual(by("i14").args[0], { derived: true }, "Dimensions is derived, as * in STEP");
  assert.deepEqual(by("i14").args.slice(1), [{ enum: "LENGTHUNIT" }, { enum: "MILLI" }, { enum: "METRE" }]);
  assert.deepEqual(p.errors, ['ref="i1" points at no element']);
  // And the checker sees the property through the relationship.
  const ids = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="ext" ifcVersion="IFC2X3"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALLSTANDARDCASE</simpleValue></name></entity></applicability><requirements><property dataType="IFCBOOLEAN"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>IsExternal</simpleValue></baseName><value><simpleValue>true</simpleValue></value></property></requirements></specification></specifications></ids>`;
  const r = check(ids, IFC2X3_XML);
  assert.equal(r.schema, "IFC2X3");
  assert.equal(r.specs[0].status, "pass");
  assert.equal(r.specs[0].applicable, 1);
});

test("IFC4 shortcuts: string ids, an attribute element carrying xsi:type and an id, a back-pointer put back", () => {
  // The shape of xBIM's QuantityTest.ifcxml: the site is written inside RelatedObjects.
  const xml = `<?xml version="1.0"?><ifcXML xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/final" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <IfcProject id="p1" GlobalId="3W_wCy4R58hgkAO0WsiUkm" Name="P"><IsDecomposedBy><IfcRelAggregates id="r9"><RelatedObjects><IfcBuilding id="b1" Name="B"/></RelatedObjects></IfcRelAggregates></IsDecomposedBy></IfcProject>
    <IfcQuantityArea id="x1" Name="TestArea" AreaValue="2"/>
    <IfcElementQuantity id="x2" Name="TestQuantities"><Quantities><IfcQuantityArea ref="x1"/></Quantities></IfcElementQuantity>
    <IfcRelDefinesByProperties id="x3">
      <RelatedObjects xsi:type="IfcSite" id="s1" GlobalId="1lOEDpLKz62xrR7$RUqRl$" Name="Testsite">
        <SiteAddress id="a1" xsi:type="IfcPostalAddress" Purpose="site" Town="Newcastle upon Tyne"/>
      </RelatedObjects>
      <RelatingPropertyDefinition><IfcElementQuantity xsi:nil="true" ref="x2"/></RelatingPropertyDefinition>
    </IfcRelDefinesByProperties>
    <IfcSite ref="s1" xsi:nil="true"/>
    <IfcBuilding id="b2" Name="B2"><Decomposes><IfcRelAggregates ref="r9" xsi:nil="true"/></Decomposes></IfcBuilding>
  </ifcXML>`;
  const m = new Model(xml, schemas);
  const by = (x) => [...m.entities.values()].find((e) => e.xmlId === x);
  const site = by("s1");
  assert.equal(site.type, "IFCSITE");
  assert.equal(m.attr(site, "Name"), "Testsite");
  assert.equal(m.get(m.attr(site, "SiteAddress")).type, "IFCPOSTALADDRESS");
  assert.deepEqual(m.attr(by("x3"), "RelatedObjects"), [{ ref: site.id }]);
  assert.equal(m.attr(by("x1"), "AreaValue"), 2);
  // A top-level ref element is not a second definition.
  assert.equal([...m.entities.values()].filter((e) => e.type === "IFCSITE").length, 1);
  // Decomposes (IfcRelAggregates FOR RelatedObjects) on b2 adds b2 to r9's list.
  const r9 = by("r9");
  assert.deepEqual(m.attr(r9, "RelatedObjects").map((r) => m.get(r).xmlId), ["b1", "b2"]);
  assert.deepEqual(m.attr(r9, "RelatingObject"), { ref: by("p1").id }, "IsDecomposedBy (FOR RelatingObject) points r9 back at the project");
});

// --- .ifczip ---------------------------------------------------------------

// A minimal zip writer for the tests (deflate or stored; optionally the zip64
// extra field with 0xFFFFFFFF in the 32-bit slots, as .NET writes it).
function zip(files, { method = 8, zip64 = false } = {}) {
  const parts = [], central = [];
  let off = 0;
  const le = (n, w) => { const b = Buffer.alloc(w); if (w === 8) b.writeBigUInt64LE(BigInt(n)); else b.writeUIntLE(n, 0, w); return b; };
  for (const [name, text] of files) {
    const data = Buffer.from(text, "utf8"), body = method === 8 ? deflateRawSync(data) : data, nm = Buffer.from(name);
    const x64 = zip64 ? Buffer.concat([le(1, 2), le(24, 2), le(data.length, 8), le(body.length, 8), le(off, 8)]) : Buffer.alloc(0);
    const s32 = (n) => le(zip64 ? 0xffffffff : n, 4);
    const local = Buffer.concat([le(0x04034b50, 4), le(zip64 ? 45 : 20, 2), le(0, 2), le(method, 2), le(0, 4), le(crc32(data), 4), s32(body.length), s32(data.length), le(nm.length, 2), le(0, 2), nm]);
    central.push(Buffer.concat([le(0x02014b50, 4), le(45, 2), le(zip64 ? 45 : 20, 2), le(0, 2), le(method, 2), le(0, 4), le(crc32(data), 4), s32(body.length), s32(data.length), le(nm.length, 2), le(x64.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), s32(off), nm, x64]));
    parts.push(local, body);
    off += local.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cd.length, 4), le(off, 4), le(0, 2)]);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}
const inflate = async (b) => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());

test("the committed sample .ifczip (written by Python's zipfile) holds the sample .ifc", async () => {
  const bytes = new Uint8Array(readFileSync(here("samples/tiny-house.ifczip")));
  const m = await unzipModel(bytes, inflate);
  assert.equal(m.name, "tiny-house.ifc");
  assert.equal(m.text, file("samples/tiny-house.ifc"));
  const viaNode = await readModel(here("samples/tiny-house.ifczip").pathname);
  assert.equal(viaNode.text, m.text);
});

test("zip reader: deflate and stored entries, zip64 fields, the model picked over other files", async () => {
  const ifcx = file("samples/tiny-house.ifcxml");
  for (const opts of [{}, { method: 0 }, { zip64: true }, { method: 0, zip64: true }]) {
    const bytes = zip([["__MACOSX/._tiny.ifc", "junk"], ["readme.txt", "hi"], ["model/tiny-house.ifcxml", ifcx]], opts);
    const m = await unzipModel(bytes, inflate);
    assert.equal(m.name, "model/tiny-house.ifcxml", JSON.stringify(opts));
    assert.equal(m.text, ifcx, JSON.stringify(opts));
  }
  assert.equal(pickModel(zipEntries(zip([["a.ifcxml", "<x/>"], ["b.ifc", "ISO"]]))).name, "b.ifc", ".ifc wins over .ifcxml");
  await assert.rejects(unzipModel(zip([["notes.txt", "x"]]), inflate), /no \.ifc, \.ifcxml or ifcJSON file/);
  assert.throws(() => zipEntries(new Uint8Array([1, 2, 3, 4])), /not a zip/);
});

test("the command line reads .ifcxml and .ifczip and exits as for an .ifc", () => {
  const cli = here("cli.mjs").pathname, ids = here("samples/coordination-basics.ids.xml").pathname;
  const dir = mkdtempSync(join(tmpdir(), "ifcz-"));
  const z = join(dir, "house.ifczip");
  writeFileSync(z, zip([["tiny-house.ifcxml", file("samples/tiny-house.ifcxml")]]));
  const run = (model) => {
    try { return { code: 0, out: execFileSync(process.execPath, [cli, model, ids, "--json"], { encoding: "utf8" }) }; }
    catch (e) { return { code: e.status, out: e.stdout }; }
  };
  const a = run(here("samples/tiny-house.ifc").pathname), b = run(here("samples/tiny-house.ifcxml").pathname), c = run(z), d = run(here("samples/tiny-house.ifczip").pathname);
  assert.equal(a.code, 1, "the sample fails some specifications");
  for (const r of [b, c, d]) {
    assert.equal(r.code, a.code);
    assert.deepEqual(verdicts(JSON.parse(r.out)), verdicts(JSON.parse(a.out)));
  }
  assert.equal(JSON.parse(c.out).modelFile, "tiny-house.ifcxml");
});

// The forms of buildingSMART's IFC4 ADD2 TC1 Annex E ifcXML examples and
// GeometryGymIFC's IFC4 output, measured on 43 STEP/ifcXML twins in
// eval/ifcxml-twins-2026-11-18.md. Written by hand here in those forms, with
// the STEP file each should read as.
const ggXml = `<?xml version="1.0" encoding="utf-8"?>
<ifc:ifcXML xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ifc="http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2" xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2">
<IfcProject GlobalId="0$WU4A9R19$vKWO$AdOnKA" Name="P">
 <OwnerHistory id="i1" ChangeAction="added" CreationDate="1454575675">
  <OwningUser><ThePerson Identification="Jon" /><TheOrganization Name="Org" /></OwningUser>
  <OwningApplication Version="1" ApplicationFullName="App" ApplicationIdentifier="App"><ApplicationDeveloper Name="Org" /></OwningApplication>
 </OwnerHistory>
 <IsDecomposedBy>
  <IfcRelAggregates GlobalId="091a6ewbvCMQ2Vyiqspa7a">
   <OwnerHistory xsi:nil="true" href="i1" />
   <RelatedObjects>
    <IfcBuilding GlobalId="39t4Pu3nTC4ekXYRIHJB9W" Name="B">
     <OwnerHistory xsi:nil="true" href="i1" />
     <ContainsElements>
      <IfcRelContainedInSpatialStructure GlobalId="3Sa3dTJGn0H8TQIGiuGQd5">
       <OwnerHistory xsi:nil="true" href="i1" />
       <RelatedElements>
        <IfcWall GlobalId="0DWgwt6o1FOx7466fPk$jl" Name="W">
         <OwnerHistory xsi:nil="true" href="i1" />
         <IsTypedBy GlobalId="1$EkFElNT8TB_VUVG1FtMe">
          <OwnerHistory xsi:nil="true" href="i1" />
          <RelatingType xsi:type="IfcWallType" GlobalId="2aG1gZj7PD2PztLOx2$IVX" Name="T" PredefinedType="notdefined">
           <OwnerHistory xsi:nil="true" href="i1" />
          </RelatingType>
         </IsTypedBy>
         <ObjectPlacement xsi:type="IfcLocalPlacement">
          <RelativePlacement>
           <IfcAxis2Placement3D>
            <Location id="i2" Coordinates="0 0 0" />
           </IfcAxis2Placement3D>
          </RelativePlacement>
         </ObjectPlacement>
         <Representation xsi:type="IfcProductDefinitionShape">
          <Representations>
           <IfcShapeRepresentation RepresentationIdentifier="Body" RepresentationType="Tessellation">
            <ContextOfItems xsi:type="IfcGeometricRepresentationSubContext" id="i3" ContextIdentifier="Body" ContextType="Model" CoordinateSpaceDimension="0" TargetView="model_view">
             <ParentContext id="i4" ContextType="Model" CoordinateSpaceDimension="3" Precision="0,0001">
              <WorldCoordinateSystem xsi:type="IfcAxis2Placement3D"><Location xsi:nil="true" href="i2" /></WorldCoordinateSystem>
             </ParentContext>
            </ContextOfItems>
            <Items>
             <IfcExtrudedAreaSolid Depth="2,5">
              <SweptArea xsi:type="IfcRectangleProfileDef" ProfileType="area" XDim="300" YDim="300" />
              <Position><Location xsi:nil="true" href="i2" /></Position>
              <ExtrudedDirection DirectionRatios="0 0 1" />
             </IfcExtrudedAreaSolid>
             <IfcTriangulatedFaceSet Closed="false" CoordIndex="1 2 3 1 3 4">
              <Coordinates CoordList="0 0 0 1 0 0 1 1 0 0 1 0" />
             </IfcTriangulatedFaceSet>
            </Items>
           </IfcShapeRepresentation>
          </Representations>
         </Representation>
        </IfcWall>
       </RelatedElements>
      </IfcRelContainedInSpatialStructure>
     </ContainsElements>
    </IfcBuilding>
   </RelatedObjects>
  </IfcRelAggregates>
 </IsDecomposedBy>
</IfcProject>
<IfcMetric Name="Length" ConstraintGrade="hard" BenchMark="equalto" />
<IfcIndexedPolygonalFaceWithVoids CoordIndex="6 7 8 5">
 <InnerCoordIndices><Seq-IfcPositiveInteger-wrapper>14 16 15 13</Seq-IfcPositiveInteger-wrapper><Seq-IfcPositiveInteger-wrapper>1 2 3</Seq-IfcPositiveInteger-wrapper></InnerCoordIndices>
</IfcIndexedPolygonalFaceWithVoids>
</ifc:ifcXML>`;

test("Annex E ifcXML forms: href references, decimal commas, derived values, a one-item inverse, flat lists of lists", () => {
  const m = new Model(ggXml, schemas);
  const of = (t) => [...m.entities.values()].filter((e) => e.type === t);
  // href="i1" is a reference: one owner history, one point, one context, not a copy per use.
  assert.equal(of("IFCOWNERHISTORY").length, 1);
  assert.equal(of("IFCCARTESIANPOINT").length, 1);
  assert.equal(of("IFCWALL").length, 1);
  const wall = of("IFCWALL")[0];
  assert.equal(wall.args[1].ref, of("IFCOWNERHISTORY")[0].id);
  // <IsTypedBy GlobalId=..> is the relationship itself, pointing back at the wall.
  const rel = of("IFCRELDEFINESBYTYPE");
  assert.equal(rel.length, 1);
  assert.equal(rel[0].args[0], "1$EkFElNT8TB_VUVG1FtMe");
  assert.deepEqual(rel[0].args[4], [{ ref: wall.id }]);
  assert.equal(m.entities.get(rel[0].args[5].ref).type, "IFCWALLTYPE");
  // A value written for a derived attribute stays derived (STEP's *).
  const sub = of("IFCGEOMETRICREPRESENTATIONSUBCONTEXT")[0];
  assert.deepEqual(sub.args[2], { derived: true });
  // Decimal commas read as points, said once.
  assert.equal(of("IFCGEOMETRICREPRESENTATIONCONTEXT")[0].args[3], 0.0001);
  const solid = of("IFCEXTRUDEDAREASOLID")[0];
  assert.equal(solid.args[3], 2.5);
  assert.ok(m.parseErrors.some((e) => /2 number\(s\) written with a decimal comma \(e\.g\. "0,0001"\)/.test(e)), m.parseErrors.join("; "));
  // <Position><Location href/></Position> is an IfcAxis2Placement3D, not the point.
  assert.equal(m.entities.get(solid.args[1].ref).type, "IFCAXIS2PLACEMENT3D");
  // Lists of lists written flat, and one wrapper per row.
  assert.deepEqual(of("IFCCARTESIANPOINTLIST3D")[0].args[0], [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]);
  assert.deepEqual(of("IFCTRIANGULATEDFACESET")[0].args[3], [[1, 2, 3], [1, 3, 4]]);
  assert.deepEqual(of("IFCINDEXEDPOLYGONALFACEWITHVOIDS")[0].args[1], [[14, 16, 15, 13], [1, 2, 3]]);
  // An attribute name in the wrong case is read and named.
  assert.deepEqual(of("IFCMETRIC")[0].args[7], { enum: "EQUALTO" });
  assert.ok(m.parseErrors.some((e) => /IFCMETRIC attribute "BenchMark" read as Benchmark/.test(e)));
});

test("Annex E ifcXML forms: the checker counts one wall, as in the STEP twin", () => {
  const ids = file("samples/coordination-basics.ids.xml");
  const r = check(ids, ggXml);
  for (const s of r.specs.filter((s) => /^Walls /.test(s.name))) assert.equal(s.applicable, 1, s.name);
});

// IfcBSplineSurface.ControlPointsList written as one flat list of points
// (buildingSMART's Annex E cube-advanced-brep and basin-advanced-brep): the
// knot data gives the grid, sum(UMultiplicities) - UDegree - 1 rows of
// sum(VMultiplicities) - VDegree - 1 points.
const bsplineXml = (uMult, extra = "") => `<?xml version="1.0" encoding="UTF-8"?>
<ifc:ifcXML xmlns:ifc="http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2">
<IfcBSplineSurfaceWithKnots UDegree="3" VDegree="1" SurfaceForm="unspecified" UClosed="false" VClosed="false" SelfIntersect="false" UMultiplicities="${uMult}" VMultiplicities="2 2" UKnots="0 1224,74487139159" VKnots="3 4" KnotSpec="unspecified"${extra}>
 <ControlPointsList>
  <IfcCartesianPoint id="p1" Coordinates="-0,5 0,5 0" /><IfcCartesianPoint id="p2" Coordinates="-0,5 -0,5 0" />
  <IfcCartesianPoint id="p3" Coordinates="-0,56 0,27 0,33" /><IfcCartesianPoint id="p4" Coordinates="-0,27 -0,56 0,33" />
  <IfcCartesianPoint id="p5" Coordinates="-0,62 0,04 0,67" /><IfcCartesianPoint id="p6" Coordinates="-0,04 -0,62 0,67" />
  <IfcCartesianPoint id="p7" Coordinates="-0,68 -0,18 1" /><IfcCartesianPoint id="p8" Coordinates="0,18 -0,68 1" />
 </ControlPointsList>
</IfcBSplineSurfaceWithKnots>
</ifc:ifcXML>`;

test("a B-spline surface's flat control points are cut into rows from its knot counts", () => {
  const m = new Model(bsplineXml("4 4"), schemas);
  const s = [...m.entities.values()].find((e) => e.type === "IFCBSPLINESURFACEWITHKNOTS");
  const pts = s.args[2];
  assert.equal(pts.length, 4);
  assert.ok(pts.every((r) => Array.isArray(r) && r.length === 2));
  // Row-major as STEP writes it: ((#p1,#p2),(#p3,#p4),...).
  const xmlId = (r) => m.entities.get(r.ref).xmlId;
  assert.deepEqual(pts.map((r) => r.map(xmlId)), [["p1", "p2"], ["p3", "p4"], ["p5", "p6"], ["p7", "p8"]]);
  assert.ok(!m.parseErrors.some((e) => /ControlPointsList/.test(e)));
});

test("a B-spline surface whose knot counts do not fit its points is left flat and named", () => {
  const m = new Model(bsplineXml("4 3"), schemas);
  const s = [...m.entities.values()].find((e) => e.type === "IFCBSPLINESURFACEWITHKNOTS");
  assert.equal(s.args[2].length, 8);
  assert.ok(s.args[2].every((x) => x && x.ref));
  assert.ok(m.parseErrors.some((e) => /IFCBSPLINESURFACEWITHKNOTS ControlPointsList written as 8 points/.test(e)), m.parseErrors.join("; "));
});

test("the rational subtype's weights are cut into the same grid", () => {
  const xml = bsplineXml("4 4", ' WeightsData="1 1 0,5 0,5 0,5 0,5 1 1"').replace(/IfcBSplineSurfaceWithKnots/g, "IfcRationalBSplineSurfaceWithKnots");
  const m = new Model(xml, schemas);
  const s = [...m.entities.values()].find((e) => e.type === "IFCRATIONALBSPLINESURFACEWITHKNOTS");
  const weights = s.args.find((a) => Array.isArray(a) && a.length === 4 && a.every((r) => Array.isArray(r) && typeof r[0] === "number"));
  assert.deepEqual(weights, [[1, 1], [0.5, 0.5], [0.5, 0.5], [1, 1]]);
  assert.equal(s.args[2].length, 4);
});

// Streaming and lazy geometry (eval/lazy-ifcxml-2026-11-18.md).
test("the lazy read gives every entity the eager read's arguments, in the same order, on both layouts", () => {
  let lazy = 0;
  for (const [text, schema] of [[file("samples/tiny-house.ifcxml"), schemas.IFC4], [IFC2X3_XML, schemas.IFC2X3]]) {
    const a = parseIfcXml(text, schema, { eager: true }), b = parseIfcXml(text, schema);
    assert.deepEqual([...b.entities.keys()], [...a.entities.keys()]);
    assert.deepEqual(b.errors, a.errors);
    for (const [id, e] of a.entities) {
      const x = b.entities.get(id);
      if (x._s !== undefined) lazy++;
      assert.deepEqual([x.type, x.xmlId, x.args], [e.type, e.xmlId, e.args], `${id} ${e.type}`);
      assert.deepEqual(JSON.parse(JSON.stringify(x)), JSON.parse(JSON.stringify(e)));
    }
  }
  assert.ok(lazy > 0, "geometry is read lazily");
});

test("geometry keeps its span, not its arguments; shallowArgs keeps only what an attribute test reads", () => {
  const p = parseIfcXml(IFC2X3_XML, schemas.IFC2X3);
  const pt = [...p.entities.values()].find((e) => e.xmlId === "i12");
  assert.equal(pt._a, undefined);
  assert.deepEqual(pt.args[0], [0, 1500]);
  assert.equal(pt._a, undefined, "a read is not kept");
  assert.equal(pt.shallowArgs[0].length, 1, "a non-empty list stays non-empty");
  const wall = [...p.entities.values()].find((e) => e.xmlId === "i7");
  assert.equal(wall._s, undefined, "a wall is not geometry and keeps its arguments");
});

test("an inline entity nested in geometry keeps its id when the geometry is read again", () => {
  const xml = `<?xml version="1.0"?><ifcXML xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/final" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <IfcAxis2Placement3D id="a1"><Location><IfcCartesianPoint><Coordinates>1 2 3</Coordinates></IfcCartesianPoint></Location></IfcAxis2Placement3D>
  <IfcAxis2Placement3D id="a2"><Location><IfcCartesianPoint><Coordinates>4 5 6</Coordinates></IfcCartesianPoint></Location></IfcAxis2Placement3D></ifcXML>`;
  const p = parseIfcXml(xml, schemas.IFC4);
  const [a1, , a2] = [...p.entities.values()];
  assert.equal(a1.type, "IFCAXIS2PLACEMENT3D");
  for (let k = 0; k < 2; k++) {
    assert.deepEqual(p.entities.get(a1.args[0].ref).args[0], [1, 2, 3]);
    assert.deepEqual(p.entities.get(a2.args[0].ref).args[0], [4, 5, 6]);
  }
});

test("string values keep their whitespace, as in the STEP file", () => {
  const xml = IFC2X3_XML.replace("<Name>Basic Wall</Name>", "<Name> Basic Wall </Name>");
  const p = parseIfcXml(xml, schemas.IFC2X3);
  assert.equal([...p.entities.values()].find((e) => e.xmlId === "i7").args[2], " Basic Wall ");
  // An all-white-space string is two spaces, as IFCLABEL('  ') is in STEP.
  const blank = parseIfcXml(IFC2X3_XML.replace("<Name>Basic Wall</Name>", "<Name>  </Name>"), schemas.IFC2X3);
  assert.equal([...blank.entities.values()].find((e) => e.xmlId === "i7").args[2], "  ");
  const empty = parseIfcXml(IFC2X3_XML.replace("<Name>Basic Wall</Name>", "<Name></Name>"), schemas.IFC2X3);
  assert.equal([...empty.entities.values()].find((e) => e.xmlId === "i7").args[2], "");
});

// The nested IFC4 layout at scale (eval/ifc4-layout-scale-2026-11-18.md):
// every entity nested inside a larger element is read as it closes, and
// geometry stays lazy (read again from its span when a check asks).
test("the nested IFC4 layout reads back every entity, and lazy and eager reads agree", async () => {
  const { writeIfc4Layout, roundTrip } = await import("./eval/ifc4-layout.mjs");
  const { parseStep } = await import("./step.mjs");
  const step = parseStep(file("samples/tiny-house.ifc"), { eager: true });
  const parts = [];
  writeIfc4Layout(step, schemas.IFC4, "IFC4", (s) => parts.push(s));
  const xml = parts.join("");
  // One element holds the model, as GeometryGymIFC writes it.
  const top = parseXmlTop(xml);
  assert.ok(top.largest / xml.length > 0.6, `largest top-level element ${(top.largest / xml.length).toFixed(2)} of the file`);
  const r = roundTrip(step, schemas.IFC4, xml);
  assert.equal(r.differ, 0, JSON.stringify(r.examples));
  assert.equal(r.missing, 0);
  assert.equal(r.same, step.entities.size);
  const a = parseIfcXml(xml, schemas.IFC4, { eager: true }), b = parseIfcXml(xml, schemas.IFC4);
  assert.deepEqual([...b.entities.keys()], [...a.entities.keys()]);
  for (const [id, e] of a.entities) {
    const x = b.entities.get(id);
    assert.deepEqual([x.type, x.xmlId, x.args], [e.type, e.xmlId, e.args], `${id} ${e.type}`);
  }
  // Verdicts equal the STEP file's on the starter IDS files.
  for (const f of ["coordination-basics", "quantities-and-naming"]) {
    const ids = file(`samples/${f}.ids.xml`);
    const v = (m) => check(ids, m).specs.map((s) => [s.name, s.status, s.applicable, s.passed, s.failed.length]);
    assert.deepEqual(v(xml), v(file("samples/tiny-house.ifc")), f);
  }
});

test("a geometry element read as it closes keeps its nested inline entities, hrefs and ids", () => {
  const xml = `<?xml version="1.0"?><ifcXML xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/final" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <IfcCartesianPoint id="p0" Coordinates="9 9 9"/>
  <IfcShapeRepresentation id="r1" RepresentationType="Curve"><Items>
    <IfcPolyline id="l1"><Points><IfcCartesianPoint Coordinates="1 2 3"/><IfcCartesianPoint href="p0" xsi:nil="true"/><IfcCartesianPoint id="p2"><Coordinates>4 5 6</Coordinates></IfcCartesianPoint></Points></IfcPolyline>
    <IfcPolyline id="l2"><Points><IfcCartesianPoint href="p2" xsi:nil="true"/><IfcCartesianPoint Coordinates="7 8 9"/></Points></IfcPolyline>
  </Items></IfcShapeRepresentation></ifcXML>`;
  const lazy = parseIfcXml(xml, schemas.IFC4), eager = parseIfcXml(xml, schemas.IFC4, { eager: true });
  const rows = (p) => [...p.entities.values()].map((e) => [e.id, e.type, e.xmlId, e.args]);
  assert.deepEqual(rows(lazy), rows(eager));
  assert.equal(lazy.early, 5, "the polylines and the points written in them");
  assert.equal(eager.early, 5);
  assert.ok([...lazy.entities.values()].filter((e) => e._s !== undefined).length >= 5, "read lazily");
  const pts = (p, x) => p.entities.get([...p.entities.values()].find((e) => e.xmlId === x).id).args[0].map((v) => p.entities.get(v.ref).args[0]);
  for (let k = 0; k < 2; k++) {
    assert.deepEqual(pts(lazy, "l1"), [[1, 2, 3], [9, 9, 9], [4, 5, 6]]);
    assert.deepEqual(pts(lazy, "l2"), [[4, 5, 6], [7, 8, 9]]);
  }
  assert.deepEqual(lazy.errors, []);
});

// Nested entities are read as they close and numbered later, parent first
// (eval/nested-early-2026-11-18.md). The expected rows are what the reader
// gave before, when it held the tree under the root until the root closed:
// ids, map order, a duplicate id skipped with everything in it, an href to
// an element after the root, and the notes in walk order.
test("nested entities read as they close keep the parent-first numbers and notes", () => {
  const xml = `<?xml version="1.0"?><ifcXML xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<IfcProject id="p1" GlobalId="0001" Name="P"><IsDecomposedBy><IfcRelAggregates GlobalId="0002"><RelatedObjects>
  <IfcBuildingStorey id="s1" GlobalId="0003" Name="L1" ELEVATION="3,5"><ContainsElements><IfcRelContainedInSpatialStructure GlobalId="0004"><RelatedElements>
    <IfcWall id="w1" GlobalId="0005" Name="W1" PREDEFINEDTYPE="standard"><IsDefinedBy><IfcRelDefinesByProperties GlobalId="0006"><RelatingPropertyDefinition>
      <IfcPropertySet GlobalId="0007" Name="Pset_WallCommon"><HasProperties>
        <IfcPropertySingleValue Name="IsExternal"><NominalValue><IfcBoolean-wrapper>true</IfcBoolean-wrapper></NominalValue></IfcPropertySingleValue>
        <IfcPropertySingleValue href="v9" xsi:nil="true"/>
      </HasProperties></IfcPropertySet></RelatingPropertyDefinition></IfcRelDefinesByProperties></IsDefinedBy></IfcWall>
    <IfcWall id="w1" GlobalId="0099" Name="duplicate"><IsDefinedBy><IfcRelDefinesByProperties GlobalId="0098"/></IsDefinedBy></IfcWall>
    <IfcSlab id="b1" GlobalId="0008" Name="S1" PREDEFINEDTYPE="floor"/>
  </RelatedElements></IfcRelContainedInSpatialStructure></ContainsElements></IfcBuildingStorey>
</RelatedObjects></IfcRelAggregates></IsDecomposedBy></IfcProject>
<IfcPropertySingleValue id="v9" Name="LoadBearing"><NominalValue><IfcBoolean-wrapper>false</IfcBoolean-wrapper></NominalValue></IfcPropertySingleValue>
</ifcXML>`;
  const p = parseIfcXml(xml, schemas.IFC4);
  const refs = (e) => e.args.filter((a) => (a && a.ref !== undefined) || Array.isArray(a));
  assert.deepEqual([...p.entities.values()].map((e) => [e.id, e.type, e.xmlId ?? null, refs(e)]), [
    [1, "IFCPROJECT", "p1", []],
    [2, "IFCRELAGGREGATES", null, [{ ref: 1 }, [{ ref: 3 }]]],
    [3, "IFCBUILDINGSTOREY", "s1", []],
    [4, "IFCRELCONTAINEDINSPATIALSTRUCTURE", null, [[{ ref: 5 }, { ref: 5 }, { ref: 10 }], { ref: 3 }]],
    [5, "IFCWALL", "w1", []],
    [6, "IFCRELDEFINESBYPROPERTIES", null, [[{ ref: 5 }], { ref: 7 }]],
    [7, "IFCPROPERTYSET", null, [[{ ref: 8 }, { ref: 9 }]]],
    [8, "IFCPROPERTYSINGLEVALUE", null, []],
    [10, "IFCSLAB", "b1", []],
    [9, "IFCPROPERTYSINGLEVALUE", "v9", []],
  ]);
  assert.ok(![...p.entities.values()].some((e) => e.args.some((a) => a && a.GlobalId === "0099")));
  assert.equal(p.entities.get(3).args[9], 3.5);
  assert.deepEqual(p.errors, [
    'IFCBUILDINGSTOREY attribute "ELEVATION" read as Elevation (the name\'s case differs from the schema)',
    'IFCWALL attribute "PREDEFINEDTYPE" read as PredefinedType (the name\'s case differs from the schema)',
    'IFCSLAB attribute "PREDEFINEDTYPE" read as PredefinedType (the name\'s case differs from the schema)',
    '1 number(s) written with a decimal comma (e.g. "3,5"), read with a decimal point',
  ]);
  assert.equal(p.early, 10, "every nested entity element, the duplicate wall and its relationship too");
});

function parseXmlTop(t) {
  const re = /<(\/?)([A-Za-z][^\s>\/]*)[^>]*?(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g;
  let m, d = 0, start = 0, largest = 0;
  while ((m = re.exec(t))) {
    if (m[2] === undefined) continue;
    if (m[1]) { d--; if (d === 1) largest = Math.max(largest, re.lastIndex - start); }
    else if (!m[3]) { if (d === 1) start = m.index; d++; }
  }
  return { largest };
}

test("the schema comes from the root element, not from an application name in the model", () => {
  const ns = "http://www.buildingsmart-tech.org/ifcXML/IFC4/Add2";
  const xml = `<?xml version="1.0"?><ifc:ifcXML xmlns:ifc="${ns}" xmlns="${ns}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><IfcProject GlobalId="2O2Fr$t4X7Zf8NOew3FLOH" Name="P"><OwnerHistory xsi:type="IfcOwnerHistory" id="i2"><OwningApplication xsi:type="IfcApplication" ApplicationFullName="ARCHICAD-64" ApplicationIdentifier="IFC2x3 add-on version: 4009 GER FULL" Version="20.0.0"/></OwnerHistory></IfcProject></ifc:ifcXML>`;
  assert.equal(ifcXmlSchemaId(xml), "IFC4");
  assert.equal(new Model(xml, schemas).schemaId, "IFC4");
  // No version on the root: the rest of the head is still read.
  assert.equal(ifcXmlSchemaId(`<?xml version="1.0"?><ifcXML><header><name>IFC2X3 export</name></header></ifcXML>`), "IFC2X3");
  assert.equal(ifcXmlSchemaId(IFC2X3_XML), "IFC2X3");
  assert.equal(ifcXmlSchemaId(file("samples/tiny-house.ifcxml")), "IFC4");
});
