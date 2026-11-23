// Rooms: every figure is a hand calculation on the fixture's own dimensions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { takeoff, boq, rowsCsv } from "./qto.mjs";
import { assignRooms, outlineLength, footprintSolid, roomGeometry, pointInSolid, sectionPerimeter, checkRoom, roomsCsv, roomTotals, roomLabel, connectionArea, deductOpenings, heightShare } from "./rooms.mjs";
import { IDENTITY, Geometry } from "./geom.mjs";

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

// an L: 6 x 4 less the 2 x 2 corner at (4..6, 2..4); area 20, perimeter 20
const L = [[0, 0], [6, 0], [6, 2], [4, 2], [4, 4], [0, 4]];

test("the outline of a room cut into convex pieces is the room's, not the pieces'", () => {
  const s = footprintSolid(L, 0, 2.5);
  assert.ok(s.terms.length >= 2, "the L is cut into pieces");
  close(sectionPerimeter(s, [0, 0, 1], 1), 20);
  // two unit squares side by side: the shared edge runs both ways and cancels
  const sq = (x) => [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1]];
  const edges = (pts, w = 1) => pts.map((p, i) => ({ a: p, b: pts[(i + 1) % pts.length], w }));
  close(outlineLength([...edges(sq(0)), ...edges(sq(1))]), 6);
  // a 1 x 1 hole (a cut, clockwise) inside a 3 x 3 square: both outlines count
  const big = [[0, 0], [3, 0], [3, 3], [0, 3]], hole = [[1, 1], [2, 1], [2, 2], [1, 2]];
  close(outlineLength([...edges(big), ...edges(hole, -1)]), 12 + 4);
  // a cut taking the strip 0..3 x 0..1 off the bottom of the 3 x 3: a 3 x 2 is left, perimeter 10
  close(outlineLength([...edges(big), ...edges([[0, 0], [3, 0], [3, 1], [0, 1]], -1)]), 10);
});

test("a room's floor area, perimeter, height, wall area and volume from its solid", () => {
  const mm = footprintSolid(L.map(([x, y]) => [x * 1000, y * 1000]), 0, 2500);
  const r = roomGeometry(mm, IDENTITY, 0.001);
  close(r.floorArea, 20);
  close(r.perimeter, 20);
  close(r.height, 2.5);
  close(r.volume, 50);
  close(r.wallArea, 50); // 20 m of wall, 2.5 m high
});

test("a sloped ceiling: the floor is cut near the bottom, the height is the highest point", () => {
  // a 4 x 3 room whose ceiling rises from 2 m at y = 0 to 3 m at y = 3 (a prism along x)
  const side = [[0, 0], [3, 0], [3, 3], [0, 2]]; // (y, z)
  const faces = [];
  const P = (x, [y, z]) => [x, y, z];
  faces.push(side.map((p) => P(0, p)).reverse(), side.map((p) => P(4, p)));
  for (let i = 0; i < 4; i++) { const a = side[i], b = side[(i + 1) % 4]; faces.push([P(0, a), P(0, b), P(4, b), P(4, a)]); }
  const s = { terms: [{ s: 1, faces }], mesh: 0, notes: [], shells: [] };
  const r = roomGeometry(s, IDENTITY, 1);
  close(r.floorArea, 12);
  close(r.perimeter, 14);
  close(r.height, 3);
  close(r.volume, 4 * 3 * 2.5);
});

test("a point is inside the L, not in its missing corner, and the placement is honoured", () => {
  const s = footprintSolid(L, 0, 3);
  assert.equal(pointInSolid(s, [1, 1, 1]), true);
  assert.equal(pointInSolid(s, [5, 1, 1]), true);
  assert.equal(pointInSolid(s, [5, 3, 1]), false); // the notch
  assert.equal(pointInSolid(s, [1, 1, 3.5]), false); // above the ceiling
  // a faceted shell (the same box as loops): winding number
  const box = { terms: [], mesh: 1, notes: [], shells: [{ s: 1, loops: footprintSolid([[0, 0], [2, 0], [2, 2], [0, 2]], 0, 2).terms[0].faces }] };
  assert.equal(pointInSolid(box, [1, 1, 1]), true);
  assert.equal(pointInSolid(box, [3, 1, 1]), false);
  assert.equal(pointInSolid({ terms: [], mesh: 1, notes: [], shells: null }, [0, 0, 0]), null);
});

test("a zero-thickness piece subtracted from a room does not empty it", () => {
  // dental_clinic 2C17 PROSTH. LAB: its room solid carries this subtracted
  // piece, flat in the west wall's plane but for rounding (5e-15 m3); its
  // middle is on its own faces, so it used to swallow the whole room
  const a = -47.11300000000056, b = -47.11300000000057, y0 = 44.50692803742007, y1 = 45.04443871025929, y2 = 46.044439136651, h = 2.799999999999999;
  const flat = [
    [[b, y2, 0], [a, y1, 0], [a, y0, 0]], [[a, y0, h], [a, y1, h], [b, y2, h]],
    [[a, y0, 0], [a, y1, 0], [a, y1, h], [a, y0, h]], [[a, y1, 0], [b, y2, 0], [b, y2, h], [a, y1, h]],
    [[b, y2, 0], [a, y0, 0], [a, y0, h], [b, y2, h]],
  ];
  const s = footprintSolid([[-47.113, 38.52], [-43.6, 38.52], [-43.6, 46.75], [-47.113, 46.75]], 0, h);
  s.terms.push({ s: -1, faces: flat });
  assert.equal(pointInSolid(s, [-45.3, 41, 0.43]), true);
  assert.equal(pointInSolid(s, [-46.9, 45.5, 0.43]), true);
  assert.equal(pointInSolid(s, [-42, 41, 0.43]), false);
});

test("stored room quantities are checked, with the cause of a disagreement named", () => {
  const room = { from: "body", stored: { GrossFloorArea: { value: 12 }, NetFloorArea: { value: 11.64 }, GrossPerimeter: { value: 14 }, Height: { value: 3 }, NetVolume: { value: 32400 } }, computed: { floorArea: 12, perimeter: 14, height: 2.7, volume: 32.4 } };
  const c = checkRoom(room);
  assert.equal(c.floorArea.name, "GrossFloorArea"); // gross first: ArchiCAD's net takes 3% plaster off
  assert.ok(c.floorArea.agree && c.perimeter.agree);
  assert.equal(c.volume.reason, "unit-slip"); // litres under m3
  assert.equal(c.height.reason, "nominal"); // 2.7 m of room under a stated 3 m: 32.4 < 12 x 3
  // a lowered ceiling: 12 m2 x the nominal 3 m = 36 m3 stored (in litres), the solid holds 32.4
  const lowered = checkRoom({ from: "body", stored: { Height: { value: 3 }, GrossVolume: { value: 36000 } }, computed: { floorArea: 12, height: 2.7, volume: 32.4 } });
  assert.equal(lowered.volume.reason, "floor-x-height-unit");
  const loweredM3 = checkRoom({ from: "body", stored: { Height: { value: 3 }, GrossVolume: { value: 36 } }, computed: { floorArea: 12, height: 2.7, volume: 32.4 } });
  assert.equal(loweredM3.volume.reason, "floor-x-height");
  const outline = checkRoom({ from: "footprint", stored: { NetVolume: { value: 30 } }, computed: { floorArea: 12, volume: 32.4, height: 2.7 } });
  assert.equal(outline.volume.reason, "outline-prism");
  assert.equal(roomLabel("101", "Office", 5), "101 Office");
  assert.equal(roomLabel(null, "Office", 5), "Office");
  assert.equal(roomLabel(null, null, 5), "#5");
});

// the sample office plus: a 4 x 3 m room on Level 1 (x 500..4500, y 100..3100,
// 2.7 m high) with stored quantities, a table standing in it, a chair outside
// it, and an L-shaped room on Level 2 drawn only as an outline and a box
const sampleText = () => readFileSync(new URL("./samples/sample-office.ifc", import.meta.url), "latin1");
const roomsFileText = () => {
  const extra = [
    "#2000=IFCSPACE('0rM0000000000000000001',$,'101','',$,#2001,#2002,'Office',.ELEMENT.,.INTERNAL.,$);",
    "#2001=IFCLOCALPLACEMENT(#51,#21);",
    "#2002=IFCPRODUCTDEFINITIONSHAPE($,$,(#2003));",
    "#2003=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#2004));",
    "#2004=IFCEXTRUDEDAREASOLID(#2005,#21,#23,2700.);",
    "#2005=IFCRECTANGLEPROFILEDEF(.AREA.,$,#2006,4000.,3000.);",
    "#2006=IFCAXIS2PLACEMENT2D(#2007,$);",
    "#2007=IFCCARTESIANPOINT((2500.,1600.));",
    "#2010=IFCRELAGGREGATES('0rM0000000000000000002',$,$,$,#50,(#2000));",
    "#2011=IFCELEMENTQUANTITY('0rM0000000000000000003',$,'Qto_SpaceBaseQuantities',$,$,(#2012,#2013,#2014,#2015));",
    "#2012=IFCQUANTITYAREA('GrossFloorArea',$,$,12.,$);",
    "#2013=IFCQUANTITYLENGTH('GrossPerimeter',$,$,14000.,$);",
    "#2014=IFCQUANTITYLENGTH('Height',$,$,2700.,$);",
    "#2015=IFCQUANTITYVOLUME('NetVolume',$,$,32400.,$);",
    "#2016=IFCRELDEFINESBYPROPERTIES('0rM0000000000000000004',$,$,$,(#2000),#2011);",
    // a table, 800 x 800 x 750, at the room's middle
    "#2020=IFCFURNISHINGELEMENT('0rM0000000000000000005',$,'Table',$,$,#2021,#2022,$);",
    "#2021=IFCLOCALPLACEMENT(#51,#21);",
    "#2022=IFCPRODUCTDEFINITIONSHAPE($,$,(#2023));",
    "#2023=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#2024));",
    "#2024=IFCEXTRUDEDAREASOLID(#2025,#21,#23,750.);",
    "#2025=IFCRECTANGLEPROFILEDEF(.AREA.,$,#2026,800.,800.);",
    "#2026=IFCAXIS2PLACEMENT2D(#2027,$);",
    "#2027=IFCCARTESIANPOINT((2500.,1600.));",
    // a chair outside the room (y = -1000)
    "#2030=IFCFURNISHINGELEMENT('0rM0000000000000000006',$,'Chair',$,$,#2021,#2032,$);",
    "#2032=IFCPRODUCTDEFINITIONSHAPE($,$,(#2033));",
    "#2033=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#2034));",
    "#2034=IFCEXTRUDEDAREASOLID(#2035,#21,#23,450.);",
    "#2035=IFCRECTANGLEPROFILEDEF(.AREA.,$,#2036,450.,450.);",
    "#2036=IFCAXIS2PLACEMENT2D(#2037,$);",
    "#2037=IFCCARTESIANPOINT((2500.,-1000.));",
    // Level 2: the L (metres x 1000), outline and box only
    "#2040=IFCSPACE('0rM0000000000000000007',$,'201',$,$,#2041,#2042,'Studio',.ELEMENT.,.INTERNAL.,$);",
    "#2041=IFCLOCALPLACEMENT(#53,#21);",
    "#2042=IFCPRODUCTDEFINITIONSHAPE($,$,(#2043,#2044));",
    "#2043=IFCSHAPEREPRESENTATION(#20,'Box','BoundingBox',(#2045));",
    "#2045=IFCBOUNDINGBOX(#22,6000.,4000.,2500.);",
    "#2044=IFCSHAPEREPRESENTATION(#20,'FootPrint','GeometricCurveSet',(#2046));",
    "#2046=IFCGEOMETRICCURVESET((#2047));",
    "#2047=IFCPOLYLINE((#2050,#2051,#2052,#2053,#2054,#2055,#2050));",
    ...L.map(([x, y], i) => `#${2050 + i}=IFCCARTESIANPOINT((${x * 1000}.,${y * 1000}.));`),
    "#2060=IFCRELAGGREGATES('0rM0000000000000000008',$,$,$,#52,(#2040));",
    // a sink whose body has nothing to read, placed at (2000, 1500, 0) inside the office, and
    // one placed at (2000, -1500, 0) outside every room
    "#2070=IFCFLOWTERMINAL('0rM0000000000000000009',$,'Sink',$,$,#2071,#2079,$);",
    "#2079=IFCPRODUCTDEFINITIONSHAPE($,$,(#2080));",
    "#2080=IFCSHAPEREPRESENTATION(#20,'Body','Brep',());",
    "#2071=IFCLOCALPLACEMENT(#51,#2072);",
    "#2072=IFCAXIS2PLACEMENT3D(#2073,$,$);",
    "#2073=IFCCARTESIANPOINT((2000.,1500.,0.));",
    "#2075=IFCFLOWTERMINAL('0rM0000000000000000010',$,'Outside sink',$,$,#2076,#2079,$);",
    "#2076=IFCLOCALPLACEMENT(#51,#2077);",
    "#2077=IFCAXIS2PLACEMENT3D(#2078,$,$);",
    "#2078=IFCCARTESIANPOINT((2000.,-1500.,0.));",
  ].join("\n");
  const text = sampleText().replace("ENDSEC;\nEND-ISO", `${extra}\nENDSEC;\nEND-ISO`);
  assert.ok(text.includes("#2000=IFCSPACE"), "fixture edit applied");
  return text;
};
const roomsFile = () => takeoff(parseStep(Buffer.from(roomsFileText(), "latin1")));

test("takeoff lists the rooms with their measured and stored quantities", () => {
  const res = roomsFile();
  assert.equal(res.rooms.length, 2);
  const [office, studio] = res.rooms;
  assert.equal(office.label, "101 Office");
  assert.equal(office.storey, "Level 1");
  close(office.computed.floorArea, 12);
  close(office.computed.perimeter, 14);
  close(office.computed.height, 2.7);
  close(office.computed.volume, 32.4);
  close(office.computed.wallArea, 14 * 2.7);
  assert.ok(office.check.floorArea.agree && office.check.perimeter.agree && office.check.height.agree);
  assert.equal(office.check.volume.reason, "unit-slip"); // 32,400 stored under cubic metres
  assert.equal(studio.label, "201 Studio");
  assert.equal(studio.storey, "Level 2");
  assert.equal(studio.from, "footprint");
  close(studio.computed.floorArea, 20);
  close(studio.computed.perimeter, 20);
  close(studio.computed.volume, 50);
});

test("an element standing in a room is given it; walls and elements outside are not", () => {
  const res = roomsFile();
  const table = res.rows.find((r) => r.name === "Table"), chair = res.rows.find((r) => r.name === "Chair");
  assert.equal(table.space, "101 Office");
  assert.equal(table.spaceFrom, "geometry");
  assert.equal(chair.space, null);
  for (const w of res.rows.filter((r) => /^IFCWALL/.test(r.ifcType))) assert.equal(w.space, null, w.name);
  assert.equal(res.rooms[0].elements, 2); // the table, and the sink by its placement point
  // grouped by room
  const lines = boq(res.rows, ["space", "class"]);
  assert.ok(lines.some((l) => l.key[0] === "101 Office" && l.key[1] === "IfcFurnishingElement" && l.count === 1), JSON.stringify(lines.map((l) => l.key)));
  // the element CSV names the room and how it was found
  const csv = rowsCsv(res.rows).split("\n");
  assert.ok(csv[0].includes("Room,Room from"));
  assert.ok(csv.some((l) => l.includes("Table") && l.includes("101 Office,geometry")));
});

test("an element with no body is put in the room its placement point stands in", () => {
  const res = roomsFile();
  const sink = res.rows.find((r) => r.name === "Sink"), out = res.rows.find((r) => r.name === "Outside sink");
  assert.equal(sink.box, null);
  assert.deepEqual(sink.origin.map((v) => Math.round(v * 1000) / 1000), [2, 1.5, sink.origin[2]]);
  assert.equal(sink.space, "101 Office");
  assert.equal(sink.spaceFrom, "geometry");
  assert.equal(sink.spaceBy, "placement point");
  assert.equal(out.space, null);
  assert.equal(out.spaceBy, undefined);
  // the origin stays off the row's own fields (JSON, CSV)
  assert.ok(!Object.keys(sink).includes("origin"));
});

test("a fitting set into its wall goes to the room most of its box stands in", () => {
  const res = roomsFile();
  const office = res.rooms[0], B = office.box;
  // a towel dispenser 15 cm deep at the office's x = max wall: 5 cm in front
  // of the face, 10 cm recessed past it, so its middle is in no room
  const x1 = B[3];
  const row = { id: 1, ifcType: "IFCFLOWTERMINAL", space: null, box: [x1 - 0.05, B[1] + 1, 0.3, x1 + 0.1, B[1] + 1.3, 1.7] };
  const mid = { ...row, id: 2, box: [x1 - 0.2, B[1] + 1, 0.3, x1 - 0.1, B[1] + 1.3, 1.7] };
  const away = { ...row, id: 3, box: [x1 + 5, B[1] + 1, 0.3, x1 + 5.2, B[1] + 1.3, 1.7] };
  assignRooms([row, mid, away], res.rooms);
  assert.equal(row.space, office.label);
  assert.equal(row.spaceBy, "box sample");
  assert.equal(mid.space, office.label); // its middle is in the room: no sampling
  assert.equal(mid.spaceBy, undefined);
  assert.equal(away.space, null);
});

test("the room schedule as CSV, and its totals per storey", () => {
  const res = roomsFile();
  const lines = roomsCsv(res.rooms).trim().split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith("Entity,GlobalId,Number,Name,Storey,Floor area m2,Perimeter m"));
  assert.ok(lines[1].includes(",101,Office,Level 1,12,14,2.7,37.8,0,0,0,37.8,0,32.4,2,12,,14,2.7,32400,"), lines[1]);
  assert.ok(/volume -99\.9% vs stored NetVolume \(unit-slip\)/.test(lines[1]), lines[1]);
  // a room name that starts like a formula is not run by a spreadsheet
  assert.ok(roomsCsv([{ id: 1, number: "=1+1", stored: {}, check: {} }]).includes(`"'=1+1"`));
  const t = roomTotals(res.rooms);
  const all = t.find((x) => x.storey === "All storeys");
  assert.equal(all.rooms, 2);
  close(all.floorArea, 32);
  close(all.volume, 82.4);
});

test("rooms can be left out", () => {
  const text = sampleText();
  assert.deepEqual(takeoff(parseStep(Buffer.from(text, "latin1")), { rooms: false }).rooms, []);
});

// The office of roomsFile plus: a 900 x 2100 door in its south wall (y = 100)
// placed by where it stands; a window in its east wall named by a space
// boundary (an IfcCurveBoundedPlane of 1300 x 1100, its frame) that stores
// 1000 x 1200 as its own size; and a curtain wall with no body of its own,
// named by a Revit-style boundary (a 2 m line swept 2.7 m up).
const openingsFile = () => {
  const extra = [
    "#3000=IFCDOOR('0rM0000000000000000101',$,'Door',$,$,#2021,#3002,$,2100.,900.);",
    "#3002=IFCPRODUCTDEFINITIONSHAPE($,$,(#3003));",
    "#3003=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#3004));",
    "#3004=IFCEXTRUDEDAREASOLID(#3005,#21,#23,2100.);",
    "#3005=IFCRECTANGLEPROFILEDEF(.AREA.,$,#3006,900.,100.);",
    "#3006=IFCAXIS2PLACEMENT2D(#3007,$);",
    "#3007=IFCCARTESIANPOINT((2450.,100.));",
    "#3010=IFCWINDOW('0rM0000000000000000102',$,'Window',$,$,#3011,#3012,$,1000.,1200.);",
    "#3011=IFCLOCALPLACEMENT(#51,#3018);",
    "#3018=IFCAXIS2PLACEMENT3D(#3019,$,$);",
    "#3019=IFCCARTESIANPOINT((0.,0.,900.));",
    "#3012=IFCPRODUCTDEFINITIONSHAPE($,$,(#3013));",
    "#3013=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#3014));",
    "#3014=IFCEXTRUDEDAREASOLID(#3015,#21,#23,1000.);",
    "#3015=IFCRECTANGLEPROFILEDEF(.AREA.,$,#3016,100.,1200.);",
    "#3016=IFCAXIS2PLACEMENT2D(#3017,$);",
    "#3017=IFCCARTESIANPOINT((4500.,1600.));",
    "#3020=IFCRELSPACEBOUNDARY('0rM0000000000000000103',$,'1stLevel',$,#2000,#3010,#3021,.PHYSICAL.,.EXTERNAL.);",
    "#3021=IFCCONNECTIONSURFACEGEOMETRY(#3022,$);",
    "#3022=IFCCURVEBOUNDEDPLANE(#3023,#3025,());",
    "#3023=IFCPLANE(#3024);",
    "#3024=IFCAXIS2PLACEMENT3D(#22,#24,#25);",
    "#3025=IFCPOLYLINE((#3026,#3027,#3028,#3029,#3026));",
    "#3026=IFCCARTESIANPOINT((0.,0.));",
    "#3027=IFCCARTESIANPOINT((1300.,0.));",
    "#3028=IFCCARTESIANPOINT((1300.,1100.));",
    "#3029=IFCCARTESIANPOINT((0.,1100.));",
    "#3030=IFCCURTAINWALL('0rM0000000000000000104',$,'Glazing',$,$,$,$,$,$);",
    "#3031=IFCRELSPACEBOUNDARY('0rM0000000000000000105',$,'1stLevel',$,#2000,#3030,#3032,.PHYSICAL.,.EXTERNAL.);",
    "#3032=IFCCONNECTIONSURFACEGEOMETRY(#3033,$);",
    "#3033=IFCSURFACEOFLINEAREXTRUSION(#3034,#21,#23,2700.);",
    "#3034=IFCARBITRARYOPENPROFILEDEF(.CURVE.,$,#3035);",
    "#3035=IFCPOLYLINE((#3036,#3037));",
    "#3036=IFCCARTESIANPOINT((500.,3100.));",
    "#3037=IFCCARTESIANPOINT((2500.,3100.));",
  ].join("\n");
  return extra;
};

test("doors, windows and curtain walls come off a room's wall area", () => {
  const text = roomsFileText().replace("ENDSEC;\nEND-ISO", `${openingsFile()}\nENDSEC;\nEND-ISO`);
  assert.ok(text.includes("#3000=IFCDOOR"), "fixture edit applied");
  const r = takeoff(parseStep(Buffer.from(text, "latin1")));
  const office = r.rooms.find((x) => x.label === "101 Office");
  const c = office.computed;
  close(c.wallArea, 14 * 2.7);
  assert.equal(c.openings, 2);
  close(c.openingArea, 0.9 * 2.1 + 1.2 * 1.0); // the window at its stored size, not its 1.3 x 1.1 boundary
  close(c.glazedArea, 2 * 2.7);
  close(c.netWallArea, 14 * 2.7 - 0.9 * 2.1 - 1.2 - 5.4);
  assert.deepEqual(c.openingsFrom, { boundary: 1, geometry: 1 });
  const door = r.rows.find((x) => x.name === "Door"), win = r.rows.find((x) => x.name === "Window");
  assert.deepEqual(door.facesRooms, ["101 Office"]);
  assert.equal(door.facesFrom, "geometry");
  assert.equal(win.facesFrom, "boundary");
  // the room schedule carries them
  const line = roomsCsv(r.rooms).split("\n").find((l) => l.includes(",101,Office,"));
  assert.ok(line.includes(",37.8,2,3.09,5.4,29.31,0,"), line);
});

test("a window the boundaries name on one side only takes the room geometry finds on the other", () => {
  // a store east of the office, past the window's wall (x 4600 to 7600 mm):
  // the window's boundary names the office alone (dental_clinic's 18 windows
  // name only the "ROOF" space outside them)
  const store = [
    "#3100=IFCSPACE('0rM0000000000000000110',$,'102','',$,#3101,#3102,'Store',.ELEMENT.,.INTERNAL.,$);",
    "#3101=IFCLOCALPLACEMENT(#51,#21);",
    "#3102=IFCPRODUCTDEFINITIONSHAPE($,$,(#3103));",
    "#3103=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#3104));",
    "#3104=IFCEXTRUDEDAREASOLID(#3105,#21,#23,2700.);",
    "#3105=IFCRECTANGLEPROFILEDEF(.AREA.,$,#3106,3000.,3000.);",
    "#3106=IFCAXIS2PLACEMENT2D(#3107,$);",
    "#3107=IFCCARTESIANPOINT((6100.,1600.));",
    "#3108=IFCRELAGGREGATES('0rM0000000000000000111',$,$,$,#50,(#3100));",
  ].join("\n");
  const text = roomsFileText().replace("ENDSEC;\nEND-ISO", `${openingsFile()}\n${store}\nENDSEC;\nEND-ISO`);
  const r = takeoff(parseStep(Buffer.from(text, "latin1")));
  const win = r.rows.find((x) => x.name === "Window"), door = r.rows.find((x) => x.name === "Door");
  assert.deepEqual([...win.facesRooms].sort(), ["101 Office", "102 Store"]);
  assert.equal(win.facesFrom, "boundary+geometry");
  const st = r.rooms.find((x) => x.label === "102 Store").computed;
  assert.equal(st.openings, 1);
  assert.deepEqual(st.openingsFrom, { boundary: 0, geometry: 1 });
  close(st.openingArea, 1.2 * 1.0);
  // the office's figures are as before; the door, named by no boundary, too
  const office = r.rooms.find((x) => x.label === "101 Office").computed;
  assert.equal(office.openings, 2);
  assert.deepEqual(office.openingsFrom, { boundary: 1, geometry: 1 });
  assert.deepEqual(door.facesRooms, ["101 Office"]);
  // geometry that does not find the room the file names adds nothing: the
  // window's boundary moved to a room far away keeps that room alone
  const far = text.replace("#3020=IFCRELSPACEBOUNDARY('0rM0000000000000000103',$,'1stLevel',$,#2000,", "#3020=IFCRELSPACEBOUNDARY('0rM0000000000000000103',$,'1stLevel',$,#3110,")
    .replace("ENDSEC;\nEND-ISO", [
      "#3110=IFCSPACE('0rM0000000000000000112',$,'103','',$,#3101,#3112,'Far',.ELEMENT.,.INTERNAL.,$);",
      "#3112=IFCPRODUCTDEFINITIONSHAPE($,$,(#3113));",
      "#3113=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#3114));",
      "#3114=IFCEXTRUDEDAREASOLID(#3115,#21,#23,2700.);",
      "#3115=IFCRECTANGLEPROFILEDEF(.AREA.,$,#3116,2000.,2000.);",
      "#3116=IFCAXIS2PLACEMENT2D(#3117,$);",
      "#3117=IFCCARTESIANPOINT((20000.,20000.));",
      "#3118=IFCRELAGGREGATES('0rM0000000000000000113',$,$,$,#50,(#3110));",
      "ENDSEC;\nEND-ISO"].join("\n"));
  assert.ok(far.includes("$,#3110,#3010"), "fixture edit applied");
  const w2 = takeoff(parseStep(Buffer.from(far, "latin1"))).rows.find((x) => x.name === "Window");
  assert.deepEqual(w2.facesRooms, ["103 Far"]);
  assert.equal(w2.facesFrom, "boundary");
});

test("a space boundary's surface area: a curve-bounded plane less its holes, and a swept line", () => {
  const E = new Map();
  const put = (id, type, args) => E.set(id, { id, type, args });
  const P = (id, x, y) => put(id, "IFCCARTESIANPOINT", [[x, y]]);
  P(1, 0, 0); P(2, 4, 0); P(3, 4, 3); P(4, 0, 3); P(5, 1, 1); P(6, 2, 1); P(7, 2, 2); P(8, 1, 2);
  put(10, "IFCPOLYLINE", [[{ ref: 1 }, { ref: 2 }, { ref: 3 }, { ref: 4 }, { ref: 1 }]]);
  put(11, "IFCPOLYLINE", [[{ ref: 5 }, { ref: 6 }, { ref: 7 }, { ref: 8 }, { ref: 5 }]]);
  put(12, "IFCCURVEBOUNDEDPLANE", [null, { ref: 10 }, [{ ref: 11 }]]);
  put(13, "IFCCONNECTIONSURFACEGEOMETRY", [{ ref: 12 }, null]);
  put(20, "IFCDIRECTION", [[0, 0, 1]]);
  put(21, "IFCPOLYLINE", [[{ ref: 1 }, { ref: 2 }, { ref: 3 }]]); // 4 + 3 m of wall
  put(22, "IFCARBITRARYOPENPROFILEDEF", [{ enum: "CURVE" }, null, { ref: 21 }]);
  put(23, "IFCSURFACEOFLINEAREXTRUSION", [{ ref: 22 }, null, { ref: 20 }, 2.5]);
  const geo = new Geometry({ entities: E });
  close(connectionArea(geo, { ref: 13 }), 12 - 1);
  close(connectionArea(geo, { ref: 23 }), 7 * 2.5);
});

test("one window drawn as several pieces comes off once; a door between two rooms comes off in both", () => {
  const rows = [
    { id: 1, ifcType: "IFCWINDOW", box: [0, 0, 1, 1.2, 0.1, 2] }, // the window, 1.2 x 1.0
    { id: 2, ifcType: "IFCWINDOW", box: [-0.03, 0, 0.97, 1.23, 0.12, 2.03] }, // its sub-frame, round it
    { id: 3, ifcType: "IFCWINDOW", box: [0, 0, 0.97, 1.2, 0.12, 1] }, // the sub-frame's sill
    { id: 4, ifcType: "IFCDOOR", box: [3, 0, 0, 3.9, 0.1, 2.1] },
  ];
  const rooms = [{ id: 10, label: "A", computed: { wallArea: 30 } }, { id: 11, label: "B", computed: { wallArea: 20 } }];
  const bounds = [{ space: 10, element: 1 }, { space: 10, element: 2 }, { space: 10, element: 3 }, { space: 10, element: 4 }, { space: 11, element: 4 }];
  const overall = new Map([[1, { width: 1.2, height: 1 }], [2, { width: 1.26, height: 1.06 }], [3, { width: 1.2, height: 0.03 }], [4, { width: 0.9, height: 2.1 }]]);
  deductOpenings(rows, rooms, bounds, overall);
  const [a, b] = rooms;
  assert.equal(a.computed.openings, 2); // the sub-frame (largest) and the door
  assert.equal(a.computed.nestedPieces, 2);
  close(a.computed.openingArea, 1.26 * 1.06 + 0.9 * 2.1);
  close(b.computed.netWallArea, 20 - 0.9 * 2.1);
  assert.deepEqual(rows[3].facesRooms, ["A", "B"]);
});

test("a window rising past a lowered ceiling comes off only below it; a frame a centimetre out is not cut", () => {
  // room A: floor 0, lowered ceiling at 2.4 m; room B: 0 to 3 m
  const rooms = [
    { id: 10, label: "A", box: [0, 0, 0, 5, 4, 2.4], computed: { wallArea: 18 * 2.4 } },
    { id: 11, label: "B", box: [0, 4.2, 0, 5, 8, 3], computed: { wallArea: 17.6 * 3 } },
  ];
  const rows = [
    { id: 1, ifcType: "IFCWINDOW", box: [1, 3.9, 1.4, 2.2, 4.1, 2.9] }, // 1.2 x 1.5, its top 0.5 m above A's ceiling
    { id: 2, ifcType: "IFCDOOR", box: [3, 3.9, -0.005, 3.9, 4.1, 2.1] }, // threshold 5 mm below both floors
    { id: 3, ifcType: "IFCWINDOW", box: [4, 3.9, 2.6, 4.5, 4.1, 2.9] }, // a clerestory wholly above A's ceiling
  ];
  const bounds = [{ space: 10, element: 1 }, { space: 11, element: 1 }, { space: 10, element: 2 }, { space: 11, element: 2 }, { space: 10, element: 3 }, { space: 11, element: 3 }];
  const overall = new Map([[1, { width: 1.2, height: 1.5 }], [2, { width: 0.9, height: 2.1 }], [3, { width: 0.5, height: 0.3 }]]);
  deductOpenings(rows, rooms, bounds, overall);
  const [a, b] = rooms;
  close(a.computed.openingArea, 1.2 * 1.0 + 0.9 * 2.1); // the window's lower 1.0 m of 1.5; the clerestory not at all
  close(a.computed.openingCut, 1.2 * 0.5 + 0.5 * 0.3);
  assert.equal(a.computed.openingsCut, 2);
  assert.equal(a.computed.openings, 2);
  close(b.computed.openingArea, 1.2 * 1.5 + 0.9 * 2.1 + 0.5 * 0.3); // B's walls run to 3 m: nothing cut
  assert.equal(b.computed.openingsCut, 0);
  close(a.computed.netWallArea, 18 * 2.4 - 1.2 - 0.9 * 2.1);
  // the share itself
  assert.equal(heightShare(null, [0, 0, 0, 1, 1, 1]), 1);
  close(heightShare([0, 0, -0.5, 1, 1, 0.5], [0, 0, 0, 1, 1, 3]), 0.5);
  assert.equal(heightShare([0, 0, 4, 1, 1, 5], [0, 0, 0, 1, 1, 3]), 0);
});

test("a door's stored height is measured down from its head: a frame set into the floor build-up is not cut", () => {
  const rooms = [{ id: 10, label: "A", box: [0, 0, 0, 5, 4, 3], computed: { wallArea: 18 * 3 } }];
  // FM_ARC_DigitalHub's escape doors: 1.01 x 2.25 m stored, the frame 2.40 m from 15 cm below the floor
  const rows = [{ id: 1, ifcType: "IFCDOOR", box: [1, 3.9, -0.15, 2.01, 4.1, 2.25] }, { id: 2, ifcType: "IFCDOOR", box: [3, 3.9, -0.15, 4, 4.1, 2.25] }];
  deductOpenings(rows, rooms, [{ space: 10, element: 1 }, { space: 10, element: 2, area: 2.4 }], new Map([[1, { width: 1.01, height: 2.25 }]]));
  const c = rooms[0].computed;
  // the first keeps its full stored size; the second stores none, so its 2.40 m boundary surface is cut to the 2.25 m above the floor
  assert.equal(c.openingsCut, 1);
  close(c.openingCut, 1 * 2.4 * (0.15 / 2.4));
  close(c.openingArea, 1.01 * 2.25 + 1 * 2.25);
  close(heightShare([0, 0, -0.15, 1, 1, 2.25], [0, 0, 0, 1, 1, 3], 2.25), 1);
});
