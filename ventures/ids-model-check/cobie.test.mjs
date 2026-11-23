// COBie 2.4 export and QC (cobie.mjs) on a hand-written IFC4 model.
import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { parseModel } from "./node.mjs";
import { cobieFromModel, cobieToXlsx, cobieFromXlsx, cobieFromRows, cobieQc, qcText, numberRows, isAsset, placementFromTakeoff, COLUMNS, requiredColumns } from "./cobie.mjs";

const IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');
FILE_NAME('cobie.ifc','2026-11-23T00:00:00',(''),(''),'test','test','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',#90,'Clinic',$,$,$,$,$,#5);
#2=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#3=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#4=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#6=IFCMONETARYUNIT('USD');
#5=IFCUNITASSIGNMENT((#2,#3,#4,#6));
#80=IFCTELECOMADDRESS($,$,$,('555-0100'),$,$,('jo@example.com'),$,$,$);
#81=IFCPERSON($,'Doe','Jo',$,$,$,$,(#80));
#82=IFCORGANIZATION($,'Acme Design',$,$,$);
#83=IFCPERSONANDORGANIZATION(#81,#82,$);
#84=IFCAPPLICATION(#82,'1.0','Hand Writer','HW');
#90=IFCOWNERHISTORY(#83,#84,$,.ADDED.,$,$,$,1700000000);
#10=IFCSITE('1cwlDi_hLEvPsClAelBNnz',#90,'Main site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);
#11=IFCBUILDING('2FCZDorxHDT8NI01kdXi8P',#90,'Clinic A',$,$,$,$,$,.ELEMENT.,$,$,$);
#12=IFCBUILDINGSTOREY('0QxBfDFDTA0PgE3B_ROuYR',#90,'Level 1',$,$,$,$,$,.ELEMENT.,0.);
#13=IFCRELAGGREGATES('3mOCdOAhTAJBVpK9lWi1Jq',#90,$,$,#1,(#10));
#14=IFCRELAGGREGATES('1Iw4NJm2X9nwT8wlAu3prj',#90,$,$,#10,(#11));
#15=IFCRELAGGREGATES('0eNE8cdaDEOw3mmmkmDvK4',#90,$,$,#11,(#12));
#20=IFCSPACE('0BTBFw6f90Nfh9rP1dlXri',#90,'101',$,$,$,$,'Exam room',.ELEMENT.,.SPACE.,$);
#21=IFCSPACE('0BTBFw6f90Nfh9rP1dlXrj',#90,'102',$,$,$,$,'Store',.ELEMENT.,.SPACE.,$);
#22=IFCRELAGGREGATES('2Wq8Dqf2v7Fh4K1x9dSwvC',#90,$,$,#12,(#20,#21));
#30=IFCSANITARYTERMINAL('2HZIdgNmz5bROhh9k9DLyK',#90,'Basin 1',$,$,$,$,$,.WASHHANDBASIN.);
#31=IFCSANITARYTERMINAL('2HZIdgNmz5bROhh9k9DLyL',#90,'Basin 2',$,$,$,$,$,.WASHHANDBASIN.);
#32=IFCWALL('3vB2YO$MX4xv5uCqZZG05x',#90,'W-01',$,$,$,$,$,.SOLIDWALL.);
#33=IFCDOOR('3W3k8ZkmvBexEm6bTnqzhD',#90,'D-101',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);
#34=IFCPIPESEGMENT('1Tq1j8wW1E5wNB5u9F9K5a',#90,'Pipe',$,$,$,$,$,.RIGID.);
#35=IFCRELCONTAINEDINSPATIALSTRUCTURE('0sNuz5nhD6vQ8S1E8fWnZr',#90,$,$,(#30),#20);
#36=IFCRELCONTAINEDINSPATIALSTRUCTURE('0sNuz5nhD6vQ8S1E8fWnZs',#90,$,$,(#31,#32,#33,#34),#12);
#40=IFCSANITARYTERMINALTYPE('2XtwYdQJvA_eZmLqT9e9cw',#90,'Basin type A',$,$,(#41),$,$,$,.WASHHANDBASIN.);
#41=IFCPROPERTYSET('0Hc3T8vRj6Yw0Pq9xZ2eQb',#90,'Pset_ManufacturerTypeInformation',$,(#42,#43));
#42=IFCPROPERTYSINGLEVALUE('Manufacturer',$,IFCLABEL('Basins Inc'),$);
#43=IFCPROPERTYSINGLEVALUE('ModelLabel',$,IFCLABEL('B-200'),$);
#44=IFCRELDEFINESBYTYPE('1aB2cD3eF4gH5iJ6kL7mN8',#90,$,$,(#30,#31),#40);
#45=IFCCLASSIFICATION($,$,$,'OmniClass',$,$,$);
#46=IFCCLASSIFICATIONREFERENCE($,'23-31 41 11','Lavatories',#45,$,$);
#47=IFCRELASSOCIATESCLASSIFICATION('2Ab3Cd4Ef5Gh6Ij7Kl8Mn9',#90,$,$,(#40),#46);
#50=IFCPROPERTYSET('0Qa1Wb2Ec3Rd4Tf5Yg6Uh7',#90,'COBie_Component',$,(#51,#52,#53));
#51=IFCPROPERTYSINGLEVALUE('SerialNumber',$,IFCLABEL('SN-001'),$);
#52=IFCPROPERTYSINGLEVALUE('InstallationDate',$,IFCLABEL('InstallationDate'),$);
#53=IFCPROPERTYSINGLEVALUE('Colour',$,IFCLABEL('White'),$);
#54=IFCRELDEFINESBYPROPERTIES('1Zx2Cv3Bn4Mq5Wr6Ty7Ui8',#90,$,$,(#30),#50);
#55=IFCPROPERTYSET('0Qa1Wb2Ec3Rd4Tf5Yg6Uh8',#90,'Pset_SpaceCommon',$,(#56));
#56=IFCPROPERTYSINGLEVALUE('VentilationZoneName',$,IFCLABEL('North zone'),$);
#57=IFCRELDEFINESBYPROPERTIES('1Zx2Cv3Bn4Mq5Wr6Ty7Ui9',#90,$,$,(#20,#21),#55);
#60=IFCZONE('0jvCJ6a3P7fAhZcqKfbbN8',#90,'Clinical',$,$,$);
#61=IFCRELASSIGNSTOGROUP('0WbUE2k3T6Ou9S7rM0Fq3d',#90,$,$,(#20),$,#60);
#62=IFCDISTRIBUTIONSYSTEM('3YyZq2P6n3u8rVq3M8lJcE',#90,'Domestic cold water',$,$,$,.DOMESTICCOLDWATER.);
#63=IFCRELASSIGNSTOGROUP('0WbUE2k3T6Ou9S7rM0Fq3e',#90,$,$,(#30,#31,#34),$,#62);
ENDSEC;
END-ISO-10303-21;
`;

const model = () => parseModel(Buffer.from(IFC));

test("sheets carry the model's facts, nothing invented", () => {
  const { sheets, notes } = cobieFromModel(model());
  assert.equal(sheets.Contact.length, 1);
  const ct = sheets.Contact[0];
  assert.equal(ct.Email, "jo@example.com");
  assert.equal(ct.Company, "Acme Design");
  assert.equal(ct.Phone, "555-0100");
  assert.equal(ct.CreatedOn, "2023-11-14T22:13:20");
  const f = sheets.Facility[0];
  assert.equal(f.Name, "Clinic A");
  assert.equal(f.ProjectName, "Clinic");
  assert.equal(f.SiteName, "Main site");
  assert.equal(f.LinearUnits, "millimeters");
  assert.equal(f.AreaUnits, "square meters");
  assert.equal(f.CurrencyUnit, "USD");
  assert.equal(f.CreatedBy, "jo@example.com");
  assert.equal(f.ExternalSystem, "Hand Writer");
  assert.deepEqual(sheets.Floor.map((r) => [r.Name, r.Category, r.Elevation]), [["Level 1", "Floor", "0"]]);
  assert.deepEqual(sheets.Space.map((r) => [r.Name, r.FloorName, r.Description]), [["101", "Level 1", "Exam room"], ["102", "Level 1", "Store"]]);
  // components: the basins and the door; not the wall or the pipe
  assert.deepEqual(sheets.Component.map((r) => r.Name).sort(), ["Basin 1", "Basin 2", "D-101"]);
  const b1 = sheets.Component.find((r) => r.Name === "Basin 1");
  assert.equal(b1.TypeName, "Basin type A");
  assert.equal(b1.Space, "101");
  assert.equal(b1.SerialNumber, "SN-001");
  assert.equal(b1.ExtObject, "IfcSanitaryTerminal");
  assert.equal(sheets.Component.find((r) => r.Name === "Basin 2").Space, "", "on a storey only: blank, not guessed");
  assert.ok(notes.some((n) => /2 of 3 components are in no space/.test(n)));
  const t = sheets.Type[0];
  assert.equal(sheets.Type.length, 1);
  assert.equal(t.Manufacturer, "Basins Inc");
  assert.equal(t.ModelNumber, "B-200");
  assert.equal(t.Category, "23-31 41 11: Lavatories");
  // zones: the IfcZone and the space property
  assert.deepEqual(sheets.Zone.map((r) => [r.Name, r.Category, r.SpaceNames]), [["Clinical", "", "101"], ["North zone", "VentilationZoneName", "101"], ["North zone", "VentilationZoneName", "102"]]);
  // system members that are components (the pipe is not one)
  assert.deepEqual(sheets.System.map((r) => [r.Name, r.ComponentNames]), [["Domestic cold water", "Basin 1"], ["Domestic cold water", "Basin 2"]]);
  // attributes: Colour kept, SerialNumber not repeated (a column has it)
  const attrs = sheets.Attribute.filter((r) => r.SheetName === "Component" && r.RowName === "Basin 1").map((r) => r.Name);
  assert.ok(attrs.includes("Colour"));
  assert.ok(!attrs.includes("SerialNumber"));
});

test("asset filter: fabric and runs out, doors and terminals in", () => {
  const m = model();
  const by = (n) => [...m.entities.values()].find((e) => m.attr(e, "Name") === n);
  assert.equal(isAsset(m, by("W-01")), false);
  assert.equal(isAsset(m, by("Pipe")), false);
  assert.equal(isAsset(m, by("D-101")), true);
  assert.equal(isAsset(m, by("Basin 1")), true);
  const all = cobieFromModel(m, { components: "all" });
  assert.equal(all.sheets.Component.length, 5);
});

test("geometry placement fills a blank Space, a door gets both sides", () => {
  const m = model();
  const basin2 = [...m.entities.values()].find((e) => m.attr(e, "Name") === "Basin 2");
  const door = [...m.entities.values()].find((e) => m.attr(e, "Name") === "D-101");
  const placement = placementFromTakeoff({
    rooms: [{ id: 20, label: "101 Exam room" }, { id: 21, label: "102 Store" }],
    rows: [{ id: basin2.id, space: "102 Store", spaceFrom: "geometry" }, { id: door.id, facesRooms: ["101 Exam room", "102 Store"] }, { id: 30, space: "101 Exam room", spaceFrom: "contained" }],
  });
  assert.equal(placement.has(30), false, "a room the file names is not re-guessed");
  const { sheets, notes } = cobieFromModel(m, { placement });
  assert.equal(sheets.Component.find((r) => r.Name === "Basin 2").Space, "102");
  assert.equal(sheets.Component.find((r) => r.Name === "D-101").Space, "101,102");
  assert.ok(notes.some((n) => /2 of 3 components .* put in the room/.test(n)));
});

test("QC finds blanks, placeholders, broken references and duplicates", () => {
  const c = numberRows(cobieFromModel(model()));
  const qc = cobieQc(c.sheets);
  const has = (rule, sheet, field) => qc.issues.some((i) => i.rule === rule && i.sheet === sheet && i.field === field);
  assert.ok(has("placeholder", "Component", "InstallationDate"), "InstallationDate = 'InstallationDate'");
  assert.ok(has("date", "Component", "InstallationDate"));
  assert.ok(has("required", "Component", "Space"), "Basin 2 has no space");
  assert.ok(has("required", "Space", "Category"));
  assert.ok(!has("required", "Component", "SerialNumber"), "design stage does not ask for serials");
  const hand = cobieQc(c.sheets, { stage: "handover" });
  assert.ok(hand.issues.some((i) => i.rule === "required" && i.sheet === "Component" && i.field === "SerialNumber" && i.name === "Basin 2"));
  // break things by hand
  const s = structuredClone(c.sheets);
  s.Component[0].TypeName = "No such type";
  s.Space[1].Name = s.Space[0].Name;
  s.Floor[0].Category = "Level";
  s.Type[0].CreatedBy = "nobody@example.com";
  s.Zone[0].SpaceNames = "n/a";
  const q2 = cobieQc(s);
  const h2 = (rule, sheet) => q2.issues.some((i) => i.rule === rule && i.sheet === sheet);
  assert.ok(h2("missing-ref", "Component"));
  assert.ok(h2("duplicate-key", "Space"));
  assert.ok(h2("picklist", "Floor"));
  assert.ok(h2("created-by", "Type"));
  assert.ok(h2("na-in-key", "Zone"));
  assert.match(qcText(q2), /ERROR Component.TypeName: a reference names a row that does not exist/);
});

test("contact and created-on fill rows whose owner history has none", () => {
  const bare = IFC.replace(/#90=IFCOWNERHISTORY\(#83,#84,\$,\.ADDED\.,\$,\$,\$,1700000000\);/, "#90=IFCOWNERHISTORY(#91,#84,$,.ADDED.,$,$,$,0);\n#91=IFCPERSONANDORGANIZATION(#92,#82,$);\n#92=IFCPERSON($,$,'jdoe',$,$,$,$,$);");
  const m = parseModel(Buffer.from(bare));
  const plain = cobieFromModel(m);
  assert.equal(plain.sheets.Space[0].CreatedBy, "");
  assert.equal(plain.sheets.Space[0].CreatedOn, "");
  const c = cobieFromModel(m, { contact: { Email: "bim@example.org", Company: "Builder Co", Phone: "555-0199" }, createdOn: "2026-11-23T09:00:00" });
  assert.equal(c.sheets.Space[0].CreatedBy, "bim@example.org");
  assert.equal(c.sheets.Space[0].CreatedOn, "2026-11-23T09:00:00");
  assert.equal(c.sheets.Contact[0].Email, "bim@example.org");
  const qc = cobieQc(numberRows(c).sheets);
  assert.ok(!qc.issues.some((i) => i.field === "CreatedBy"));
});

test("workbook round trip: written .xlsx reads back to the same rows and QC", async () => {
  const c = numberRows(cobieFromModel(model()));
  const bytes = cobieToXlsx(c);
  const back = await cobieFromXlsx(bytes, (b) => inflateRawSync(b));
  for (const s of Object.keys(COLUMNS)) {
    assert.equal(back[s].length, c.sheets[s].length, s);
    back[s].forEach((r, i) => { for (const col of COLUMNS[s]) assert.equal(r[col], c.sheets[s][i][col], `${s}.${col} row ${i}`); });
  }
  const a = cobieQc(c.sheets), b = cobieQc(back);
  assert.equal(a.errors, b.errors);
  assert.equal(a.warnings, b.warnings);
});

test("read-back finds columns by header name and the long External* spellings", () => {
  const s = cobieFromRows({
    floor: [["Name", "Category", "CreatedBy", "CreatedOn", "ExternalSystem"], ["L1", "Floor", "a@b.co", "2026-01-01T00:00:00", "Revit"]],
    Space: [["CreatedBy", "Name", "FloorName"], ["a@b.co", "101", "L2"], [], ["", "", ""]],
  });
  assert.equal(s.Floor[0].ExtSystem, "Revit");
  assert.equal(s.Space.length, 1);
  const qc = cobieQc(s);
  assert.ok(qc.issues.some((i) => i.rule === "missing-ref" && i.field === "FloorName" && i.value === "L2"));
  assert.ok(qc.issues.some((i) => i.rule === "single-facility"));
  assert.ok(qc.issues.some((i) => i.rule === "floor-empty" && i.value === "L1"));
});

test("required columns by stage", () => {
  assert.ok(!requiredColumns("Type", "design").includes("Manufacturer"));
  assert.ok(requiredColumns("Type", "handover").includes("Manufacturer"));
  assert.ok(requiredColumns("Component", "handover").includes("WarrantyStartDate"));
});

test("cli --cobie writes a workbook and --cobie-qc reads it back", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const out = mkdtempSync(tmpdir() + "/cobie-") + "/t.xlsx";
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const sample = new URL("./samples/tiny-house.ifc", import.meta.url).pathname;
  const a = spawnSync(process.execPath, [cli, "--cobie", sample, "-o", out, "--contact", "bim@example.org,Builder Co,555-0199"], { encoding: "utf8" });
  assert.equal(a.status, 1, a.stderr); // the sample has gaps: QC errors
  assert.ok(existsSync(out));
  assert.match(a.stdout, /COBie 2\.4 QC \(design stage\)/);
  const b = spawnSync(process.execPath, [cli, "--cobie-qc", out, "--json"], { encoding: "utf8" });
  assert.equal(b.status, 1);
  const qc = JSON.parse(b.stdout);
  assert.equal(qc.rows.Component, 2);
  assert.ok(!qc.issues.some((i) => i.field === "CreatedBy"), "the contact given fills CreatedBy");
  const c = spawnSync(process.execPath, [cli, "--cobie", sample, "--stage", "later"], { encoding: "utf8" });
  assert.equal(c.status, 2);
});
