// The bar schedule (rebar.mjs) and the directrices it reads (geom.mjs path3,
// trimPath). Every expected figure is worked by hand; the files are written
// the way Tekla, Allplan and Revit write their bars (eval/rebar-schedule-2026-11-22.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStep } from "./step.mjs";
import { takeoff, rowQuantities } from "./qto.mjs";
import { barShape, readBarProps, rebarSchedule, rebarCsv, massPerMetre, minBendRadius, toMm } from "./rebar.mjs";
import { trimPath, roundLoop } from "./geom.mjs";

const file = (body, schema = "IFC2X3", unit = ".MILLI.") => `ISO-10303-21;HEADER;FILE_SCHEMA(('${schema}'));ENDSEC;DATA;
#900=IFCSIUNIT(*,.LENGTHUNIT.,${unit === "$" ? "$" : unit},.METRE.);
#901=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#902=IFCUNITASSIGNMENT((#900,#901));
#903=IFCPROJECT('2O2Fr$t4X7Zf8NOew3FLOH',$,'p',$,$,$,$,$,#902);
${body}
ENDSEC;END-ISO-10303-21;`;
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const prop = (id, name, v) => `#${id}=IFCPROPERTYSINGLEVALUE('${name}',$,${v},$);`;

// Tekla: a group of two 10 mm L-bars, drawn 10.625 mm across, each a mapped
// copy of one swept disk along a composite curve: 120 mm down z, a quarter
// circle of 65 mm (centreline) and 1,000 mm along x; StartParam 0 and
// EndParam the curve's whole parameter range, 120 + pi/2 + 1000
const SPAN = 120 + Math.PI / 2 + 1000;
const tekla = (endParam = SPAN) => `
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCLOCALPLACEMENT($,#2);
#10=IFCDIRECTION((0.,0.,-1.));
#11=IFCVECTOR(#10,1.);
#12=IFCLINE(#1,#11);
#13=IFCTRIMMEDCURVE(#12,(IFCPARAMETERVALUE(0.)),(IFCPARAMETERVALUE(120.)),.T.,.PARAMETER.);
#14=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#13);
#15=IFCCARTESIANPOINT((65.,0.,-120.));
#16=IFCDIRECTION((0.,-1.,0.));
#17=IFCDIRECTION((-1.,0.,0.));
#18=IFCAXIS2PLACEMENT3D(#15,#16,#17);
#19=IFCCIRCLE(#18,65.);
#20=IFCTRIMMEDCURVE(#19,(IFCPARAMETERVALUE(0.)),(IFCPARAMETERVALUE(1.5707963267949)),.T.,.PARAMETER.);
#21=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#20);
#22=IFCCARTESIANPOINT((65.,0.,-185.));
#23=IFCDIRECTION((1.,0.,0.));
#24=IFCVECTOR(#23,1.);
#25=IFCLINE(#22,#24);
#26=IFCTRIMMEDCURVE(#25,(IFCPARAMETERVALUE(0.)),(IFCPARAMETERVALUE(1000.)),.T.,.PARAMETER.);
#27=IFCCOMPOSITECURVESEGMENT(.DISCONTINUOUS.,.T.,#26);
#28=IFCCOMPOSITECURVE((#14,#21,#27),.F.);
#29=IFCSWEPTDISKSOLID(#28,5.3125,$,0.,${endParam});
#30=IFCSHAPEREPRESENTATION($,'Body','AdvancedSweptSolid',(#29));
#31=IFCREPRESENTATIONMAP(#2,#30);
#32=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#1,$,$);
#33=IFCCARTESIANPOINT((0.,150.,0.));
#34=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#33,$,$);
#35=IFCMAPPEDITEM(#31,#32);
#36=IFCMAPPEDITEM(#31,#34);
#37=IFCSHAPEREPRESENTATION($,'Body','MappedRepresentation',(#35,#36));
#38=IFCPRODUCTDEFINITIONSHAPE($,$,(#37));
#40=IFCREINFORCINGBAR('0B97ArNb5Dmh2unM1XDpR1',$,'INF.',$,$,#3,#38,'ID4a8da208-e349-4ab8-84c7-a4d7e5ed383a',$,10.625,0.,$,.NOTDEFINED.,.NULL.);
${prop(50, "REBAR_POS", "IFCLABEL('21')")}
${prop(51, "SHAPE", "IFCLABEL('F102')")}
${prop(52, "NUMBER_OF_BARS_IN_GROUP", "IFCINTEGER(2)")}
${prop(53, "DIAMETER_NOMINAL", "IFCLENGTHMEASURE(10.)")}
${prop(54, "DIM_A", "IFCLENGTHMEASURE(1070.)")}
${prop(55, "DIM_B", "IFCLENGTHMEASURE(190.)")}
${prop(56, "DIM_L", "IFCLENGTHMEASURE(1260.)")}
${prop(57, "WEIGHT_TOTAL_IN_GROUP", "IFCREAL(1.507)")}
${prop(58, "GRADE", "IFCLABEL('ADN-420')")}
${prop(59, "CAST_UNIT_POS", "IFCLABEL('Z3(?)')")}
#60=IFCPROPERTYSET('3jlpWQOkD5bhpvgNWnuW86',$,'Rebar_properties',$,(#50,#51,#52,#53,#54,#55,#56,#57,#58,#59));
#61=IFCRELDEFINESBYPROPERTIES('1WdB196Kb72f_pKgj5rklU',$,$,$,(#40),#60);`;

test("Tekla: a bar group along a composite curve trimmed to its whole range, scheduled by its own mark", () => {
  const res = takeoff(parseStep(file(tekla())), { rooms: false });
  const [r] = res.rows.filter((x) => x.ifcType === "IFCREINFORCINGBAR");
  assert.equal(r.computed.status, "ok");
  assert.equal(r.bars.length, 2);
  const cut = 0.12 + 0.065 * Math.PI / 2 + 1;
  const b = r.bars[0];
  close(b.length, cut);
  close(b.d, 0.010625);
  assert.equal(b.shape, "L");
  assert.equal(b.bs8666, "11");
  assert.equal(b.bends.length, 1);
  close(b.bends[0].angle, 90, 1e-6);
  close(b.bends[0].r, 0.065);
  // legs out to out with the 10 mm nominal size: straight + r + d/2
  close(b.dims[0], 0.12 + 0.065 + 0.005);
  close(b.dims[1], 1 + 0.065 + 0.005);
  // the body's volume is the drawn disk along the whole bar, both bars
  close(r.computed.gross, 2 * Math.PI * 5.3125 ** 2 * cut * 1e3 * 1e-9, 1e-9);
  // its weight is the nominal 10 mm bar's: 0.6165 kg/m, not the drawn 10.625 mm's 0.696
  const q = rowQuantities(r);
  assert.equal(q.weightSource, "nominal-size");
  close(q.weight, 2 * cut * massPerMetre(10));
  const s = rebarSchedule(res.rows);
  assert.equal(s.lines.length, 1);
  const l = s.lines[0];
  assert.equal(l.mark, "21");
  assert.equal(l.markFrom, "file");
  assert.equal(l.member, "Z3");
  assert.equal(l.grade, "ADN-420");
  assert.equal(l.fileShape, "F102");
  assert.equal(l.size, 10);
  assert.equal(l.count, 2);
  assert.equal(l.author.count, 2);
  close(l.author.weight, 1.507);
  close(l.author.length, 1.26);
  close(l.mass, 2 * cut * massPerMetre(10));
  assert.ok(l.notes.some((n) => /drawn 10\.6 mm across/.test(n)));
  close(s.total.mass, l.mass);
  assert.deepEqual(s.bySize.map((z) => [z.size, z.bars]), [[10, 2]]);
});

test("a swept disk cut short of its directrix is cut at its parameters", () => {
  // EndParam 120 + pi/2 + 500: the bar stops halfway along the last leg
  const res = takeoff(parseStep(file(tekla(120 + Math.PI / 2 + 500))), { rooms: false });
  const [r] = res.rows.filter((x) => x.ifcType === "IFCREINFORCINGBAR");
  close(r.bars[0].length, 0.12 + 0.065 * Math.PI / 2 + 0.5);
  close(r.bars[0].legs[1], 0.5);
});

// Allplan: an L-bar of a 12 mm bar in metres, 1 m along x, a 90 degree bend
// of 40 mm centreline radius drawn as eight facets with their vertices on
// the arc, then 0.5 m along y; StartParam 0 and EndParam 1 (normalised)
const R = 0.04, N = 8;
const arcPts = Array.from({ length: N + 1 }, (_, k) => { const t = -Math.PI / 2 + (k * Math.PI) / 2 / N; return [1 + R * Math.cos(t), R + R * Math.sin(t), 0]; });
const allplanPts = [[0, 0, 0], ...arcPts, [1 + R, R + 0.5, 0]];
const allplan = () => `
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCLOCALPLACEMENT($,#2);
${allplanPts.map((p, i) => `#${100 + i}=IFCCARTESIANPOINT((${p.map((x) => x.toFixed(12)).join(",")}));`).join("\n")}
#10=IFCPOLYLINE((${allplanPts.map((_, i) => `#${100 + i}`).join(",")}));
#11=IFCSWEPTDISKSOLID(#10,0.006,$,0.,1.);
#12=IFCSHAPEREPRESENTATION($,'Body','AdvancedSweptSolid',(#11));
#13=IFCPRODUCTDEFINITIONSHAPE($,$,(#12));
#14=IFCREINFORCINGBAR('0ohBfsArr3ruXYxacT4yl5',$,' ',$,$,#3,#13,$,$,0.012,0.000113,$,.NOTDEFINED.,$);
${prop(20, "Position number", "IFCINTEGER(3)")}
${prop(21, "Shape code", "IFCLABEL('A1  ')")}
${prop(22, "Bending diameter", "IFCREAL(68.)")}
${prop(23, "Count of bars/meshes", "IFCINTEGER(1)")}
${prop(24, "Weight per meter", "IFCREAL(0.888)")}
#30=IFCPROPERTYSET('3YrK7RbE122fNRsP5djFAe',$,'Allplan_ReinforcingBar',$,(#20,#21,#22,#23,#24));
#31=IFCRELDEFINESBYPROPERTIES('0wxAc63nj5AezFhfks7wLL',$,$,$,(#14),#30);`;

test("Allplan: a bend drawn as facets reads as one bend of the facets' circle; 0 to 1 is the whole bar", () => {
  const res = takeoff(parseStep(file(allplan(), "IFC2X3", "$")), { rooms: false });
  const [r] = res.rows.filter((x) => x.ifcType === "IFCREINFORCINGBAR");
  const b = r.bars[0];
  const chords = N * 2 * R * Math.sin(Math.PI / 4 / N);
  close(b.length, 1 + 0.5 + chords);
  assert.equal(b.bends.length, 1);
  close(b.bends[0].angle, 90, 1e-6);
  close(b.bends[0].r, R, 1e-9);
  assert.deepEqual(b.legs.map((x) => +x.toFixed(9)), [1, 0.5]);
  assert.equal(b.shape, "L");
  const s = rebarSchedule(res.rows);
  const l = s.lines[0];
  assert.equal(l.mark, "3");
  assert.equal(l.fileShape, "A1");
  assert.equal(l.author.positionCount, 1);
  assert.equal(l.author.bendingDiameter, 68);
  // inside diameter 2 x 40 - 12 = 68 mm, the file's figure; 34 mm inside radius >= BS 8666's 24
  close(2 * l.bends[0].r * 1000 - l.size, 68, 1e-6);
  assert.deepEqual(l.notes, []);
  close(l.massPerMetre, 0.888, 1e-3);
});

test("Revit: an EndParam past the directrix's parameter range is a length along it", () => {
  const body = `
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCLOCALPLACEMENT($,#2);
#4=IFCCARTESIANPOINT((6096.,0.,0.));
#5=IFCPOLYLINE((#1,#4));
#6=IFCCOMPOSITECURVESEGMENT(.CONTINUOUS.,.T.,#5);
#7=IFCCOMPOSITECURVE((#6),.F.);
#8=IFCSWEPTDISKSOLID(#7,9.5,$,0., 3500.);
#9=IFCSHAPEREPRESENTATION($,'Body','AdvancedSweptSolid',(#8));
#10=IFCPRODUCTDEFINITIONSHAPE($,$,(#9));
#11=IFCREINFORCINGBAR('2_FHB2ALrC4wbZB0E9Nn1y',$,'13M',$,'13M',#3,#10,'357798',$,12.7,0.000126676869774374,3500.,.NOTDEFINED.,$);`;
  const res = takeoff(parseStep(file(body)), { rooms: false });
  const [r] = res.rows.filter((x) => x.ifcType === "IFCREINFORCINGBAR");
  close(r.bars[0].length, 3.5);
  assert.equal(r.bars[0].bs8666, "00");
  assert.equal(r.barProps.diameterMm, 12.7);
  close(r.barProps.lengthM, 3.5);
  const l = rebarSchedule(res.rows).lines[0];
  // no mark in the file: one is assigned, and the schedule says so
  assert.equal(l.mark, "A01");
  assert.equal(l.markFrom, "assigned");
});

test("trimPath: whole, normalised, by parameter and by length", () => {
  const line = (a, b) => ({ kind: "line", a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), span: 1 });
  const path = { segs: [line([0, 0, 0], [2, 0, 0]), line([2, 0, 0], [2, 3, 0])], span: 2 };
  assert.equal(trimPath(path, 0, 2).length, 2);
  assert.equal(trimPath(path, null, null).length, 2);
  assert.equal(trimPath(path, 0, 1).length, 2); // 0 to 1 over two pieces: Allplan's whole bar
  const half = trimPath(path, 0, 1.5);
  close(half.reduce((t, g) => t + g.length, 0), 2 + 1.5);
  const byLen = trimPath(path, 0, 4); // past the range of 2, within the length of 5
  close(byLen.reduce((t, g) => t + g.length, 0), 4);
  assert.throws(() => trimPath(path, 0, 9));
});

// shapes from straight pieces meeting at sharp corners, d = 10 mm
const poly = (pts) => ({ radius: 0.005, segs: pts.slice(1).map((b, i) => ({ kind: "line", a: pts[i], b, length: Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1], b[2] - pts[i][2]) })) });

test("barShape: straight, U, Z, closed link and a bend out of plane", () => {
  const st = barShape(poly([[0, 0, 0], [1, 0, 0], [2, 0, 0]]));
  assert.equal(st.shape, "straight"); assert.equal(st.bs8666, "00"); close(st.length, 2); assert.deepEqual(st.dims, [2]);
  const u = barShape(poly([[0, 0.3, 0], [0, 0, 0], [1, 0, 0], [1, 0.3, 0]]));
  assert.equal(u.shape, "U"); assert.equal(u.bs8666, "21");
  // a sharp corner adds d/2 to each leg it ends
  assert.deepEqual(u.dims.map((x) => +x.toFixed(9)), [0.305, 1.01, 0.305]);
  assert.ok(u.bends.every((b) => b.sharp && b.r == null));
  const z = barShape(poly([[0, 0.3, 0], [0, 0, 0], [1, 0, 0], [1, -0.3, 0]]));
  assert.equal(z.shape, "Z (cranked)"); assert.equal(z.bs8666, null);
  const link = barShape(poly([[0.15, 0, 0], [0.3, 0, 0], [0.3, 0.3, 0], [0, 0.3, 0], [0, 0, 0], [0.2, 0, 0]]));
  assert.equal(link.closed, true); assert.equal(link.shape, "closed link, 4 bends"); close(link.turn, 360, 1e-9);
  const skew = barShape(poly([[0, 1, 0], [0, 0, 0], [1, 0, 0], [1, 0, 1]]));
  assert.equal(skew.planar, false); assert.equal(skew.shape, "2 bends, not in one plane");
  // a bend past 90 degrees: the leg reaches r + d/2 beyond its straight run
  const hook = barShape({ radius: 0.005, segs: [
    { kind: "line", a: [0, 0, 0], b: [1, 0, 0], length: 1 },
    { kind: "arc", a: [1, 0, 0], b: [1, 0.1, 0], c: [1, 0.05, 0], r: 0.05, angle: Math.PI, n: [0, 0, 1], length: 0.05 * Math.PI },
    { kind: "line", a: [1, 0.1, 0], b: [0.8, 0.1, 0], length: 0.2 },
  ] });
  assert.equal(hook.shape, "U (one 180 degree bend)");
  assert.deepEqual(hook.dims.map((x) => +x.toFixed(9)), [1.055, 0.255]);
});

test("readBarProps: Tekla's unnumbered mark, the ISO bending set's dimensions, diameters in mm", () => {
  const E = new Map();
  const add = (id, type, args) => E.set(id, { id, type, args });
  add(1, "IFCPROPERTYSINGLEVALUE", ["Group position number", null, { typed: "IFCLABEL", value: "0(?)" }, null]);
  add(2, "IFCPROPERTYSINGLEVALUE", ["ISOCD3766ShapeParameter_a", null, { typed: "IFCLENGTHMEASURE", value: 114.3 }, null]);
  add(3, "IFCPROPERTYSINGLEVALUE", ["ISOCD3766ShapeCode", null, { typed: "IFCLABEL", value: "Rebar Shape 4" }, null]);
  add(4, "IFCPROPERTYSINGLEVALUE", ["Size", null, { typed: "IFCLABEL", value: "12" }, null]);
  add(5, "IFCPROPERTYSET", ["g", null, "s", null, [{ ref: 1 }, { ref: 2 }, { ref: 3 }, { ref: 4 }]]);
  const p = readBarProps(E, [5]);
  assert.equal(p.mark, null);
  assert.equal(p.shape, "Rebar Shape 4");
  assert.deepEqual(p.dims, { A: 114.3 });
  assert.equal(p.diameter, 12);
  assert.equal(toMm(12, 0.001), 12);
  assert.equal(toMm(0.014, 1), 14);
  assert.equal(minBendRadius(12), 24);
  assert.equal(minBendRadius(20), 70);
});

test("roundLoop: a circle written as a polygon is a round bar; a square is not", () => {
  const circ = Array.from({ length: 32 }, (_, k) => [0.016 * Math.cos((2 * Math.PI * k) / 32), 0.016 * Math.sin((2 * Math.PI * k) / 32)]);
  close(roundLoop([{ s: 1, pts: circ }]), 0.016, 1e-9);
  assert.equal(roundLoop([{ s: 1, pts: [[0, 0], [1, 0], [1, 1], [0, 1]] }]), null);
});

test("rebarCsv: a BS 8666-style schedule, then the totals by size", () => {
  const res = takeoff(parseStep(file(tekla())), { rooms: false });
  const csv = rebarCsv(rebarSchedule(res.rows)).split("\n");
  assert.match(csv[0], /^Member,Bar mark,Mark from,Grade,Size \(mm\),No\. of bars,Length of each bar \(mm\),Shape,BS 8666 shape code/);
  const cells = csv[1].split(",");
  assert.deepEqual(cells.slice(0, 13), ["Z3", "21", "file", "ADN-420", "10", "2", "1222", "L", "11", "F102", "190", "1070", ""]);
  assert.ok(csv.some((l) => /^Total,2,2\.444,1\.51$/.test(l)), csv.join("\n"));
});

test("bars the schedule cannot read are named in its notes", () => {
  const rows = [{ id: 1, ifcType: "IFCREINFORCINGBAR", computed: { status: "not read", reason: "body IFCFOO" } }];
  const s = rebarSchedule(rows);
  assert.equal(s.lines.length, 0);
  assert.deepEqual(s.notes, ["1 reinforcing bar element not in the schedule: body IFCFOO"]);
});
