import { test } from "node:test";
import assert from "node:assert/strict";
import { planFromIfc } from "./ifc.mjs";
import { takeoff } from "./engine.mjs";

// Property test: random IFC files (rotated storey placement, Axis lines, doors
// and windows with random sizes, millimetre/metre/foot units, a few mangled or
// cut off) never throw. A read either is refused with a reason or yields walls
// with finite positive lengths, openings inside their wall, and a plan the
// takeoff engine accepts. Invented files only; no real architect's IFC.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];
const rnd = (rand, lo, hi) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;

let perim = 0, clean = false;
function ifcText(rand) {
  const unit = pick(rand, [".METRE.", ".MILLI.,.METRE.", "FOOT"]);
  const scale = unit === ".METRE." ? 1 : unit === "FOOT" ? 3.28 : 1000;
  const unitEnt = unit === "FOOT"
    ? "#3=IFCCONVERSIONBASEDUNIT(#4,.LENGTHUNIT.,'FOOT',#5);"
    : unit === ".METRE."
      ? "#3=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);"
      : "#3=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);";
  const toIn = unit === ".METRE." ? 100 / 2.54 : unit === "FOOT" ? 12 : 1 / 25.4;
  const w = pick(rand, [10, 8, 4.5, 0.6]) * scale, d = pick(rand, [6, 5, 3, 0.5]) * scale;
  let s = `ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,$,$);\n${unitEnt}\n#6=IFCUNITASSIGNMENT((#3));\n`;
  const rot = pick(rand, [[1, 0], [0, 1], [-1, 0], [3, 3]]);
  s += `#800=IFCCARTESIANPOINT((${rnd(rand, -5, 5)},${rnd(rand, -5, 5)},0.));\n#801=IFCDIRECTION((${rot[0]},${rot[1]},0.));\n#802=IFCAXIS2PLACEMENT3D(#800,$,#801);\n#900=IFCLOCALPLACEMENT($,#802);\n`;
  const wall = (n, x, y, rx, ry, len) =>
    `#${n}0=IFCCARTESIANPOINT((${x},${y},0.));\n#${n}1=IFCDIRECTION((${rx},${ry},0.));\n#${n}2=IFCAXIS2PLACEMENT3D(#${n}0,$,#${n}1);\n#${n}3=IFCLOCALPLACEMENT(#900,#${n}2);\n` +
    `#${n}4=IFCCARTESIANPOINT((0.,0.));\n#${n}5=IFCCARTESIANPOINT((${len},0.));\n#${n}6=IFCPOLYLINE((#${n}4,#${n}5));\n#${n}7=IFCSHAPEREPRESENTATION(#1,'Axis','Curve2D',(#${n}6));\n#${n}8=IFCPRODUCTDEFINITIONSHAPE($,$,(#${n}7));\n` +
    `#${n}9=IFCWALLSTANDARDCASE('g${n}',$,'Wall',$,$,#${n}3,#${n}8,$,.STANDARD.);\n`;
  s += wall(10, 0, 0, 1, 0, w) + wall(11, w, 0, 0, 1, d) + wall(12, w, d, -1, 0, w) + wall(13, 0, d, 0, -1, d);
  const extra = Math.floor(rand() * 6);
  for (let i = 0; i < extra; i++) {
    const n = 20 + i, onFront = rand() < 0.5;
    const x = rnd(rand, -0.1, 1.1) * w, wd = rnd(rand, 0.5, 3) * (scale > 1 ? scale / (scale === 1000 ? 1 : 1) : 1);
    s += `#${n}0=IFCCARTESIANPOINT((${x},${onFront ? 0 : d},0.));\n#${n}1=IFCAXIS2PLACEMENT3D(#${n}0,$,$);\n#${n}2=IFCLOCALPLACEMENT(#900,#${n}1);\n`;
    s += `#${n}3=${rand() < 0.5 ? "IFCDOOR" : "IFCWINDOW"}('o${n}',$,'Opening',$,$,#${n}2,$,$,${rnd(rand, 0.5, 2.4) * scale},${wd},.DOOR.,$,$);\n`;
  }
  s += "ENDSEC;\nEND-ISO-10303-21;\n";
  const m = rand();
  perim = 2 * (w + d) * toIn; clean = m >= 0.3;
  if (m < 0.1) s = s.slice(0, Math.floor(rand() * s.length));
  else if (m < 0.2) s = s.replace(/IFCPOLYLINE\(\([^)]*\)\)/, "IFCPOLYLINE((#99999))");
  else if (m < 0.25) s = s.replace(/IFCDIRECTION\(\(([^,]*),/, "IFCDIRECTION((NaN,");
  else if (m < 0.3) s = s.replace(/\);\n/, ")\n");
  return s;
}

test("fuzz: random IFC text never throws and a read plan runs the takeoff", () => {
  let ok = 0, refused = 0, checked = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const text = ifcText(rng(seed));
    let r;
    try { r = planFromIfc(text); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    ok++;
    for (const wall of r.plan.walls) {
      if (!Number.isFinite(wall.length) || wall.length <= 0) failures.push(`seed ${seed}: bad length ${wall.length}`);
      for (const o of wall.openings ?? []) {
        if (!(o.offset >= -1e-6) || !(o.width > 0) || o.offset + o.width > wall.length + 1e-6) failures.push(`seed ${seed}: opening outside wall ${wall.length}: ${o.offset}+${o.width}`);
      }
    }
    // an unmangled file's exterior walls add up to the perimeter that was drawn
    if (clean) {
      const total = r.plan.walls.filter((x) => x.exterior !== false).reduce((a, x) => a + x.length, 0);
      if (Math.abs(total - perim) > 0.02 * perim + 1) failures.push(`seed ${seed}: walls ${total.toFixed(1)} in vs drawn perimeter ${perim.toFixed(1)}`);
      checked++;
    }
    try { takeoff(r.plan); } catch (e) { failures.push(`seed ${seed}: takeoff threw ${e.message}`); }
  }
  assert.deepEqual(failures.slice(0, 10), []);
  assert.ok(ok > 100 && refused > 5, `read ${ok}, refused ${refused}`);
  assert.ok(checked > 50, `perimeter checked on ${checked} files`);
});
