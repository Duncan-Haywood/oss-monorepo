// Cant (IfcSegmentedReferenceCurve) as alignment.mjs reads it, against
// buildingSMART's own worked text and IfcOpenShell.
//
//   node eval/cant.mjs segmented-reference-curve.ifc ios65.json ios112.json
//
// The file is buildingSMART's IFC4.3.x-sample-models
// models/alignment-geometries-and-linear-positioning/segmented-reference-curve
// (#65 its cosine-spiral horizontal, #112 the cant curve over it). The JSONs
// come from eval/cant-ifcopenshell.py (2.5 m steps, 0 to 100). Prints, per
// station: our plan point against IfcOpenShell's; our deviating elevation,
// slope and roll against the sample README's formulas (D(s) = L/A0 + L/A1
// cos(pi s/L); theta linear in D between the two Axis angles); and
// IfcOpenShell's elevation and roll (from a point 0.75 m to the left).

import { readFileSync } from "node:fs";
import { parseStep } from "../step.mjs";
import { Geometry } from "../geom.mjs";
import { AlignmentReader } from "../alignment.mjs";

const [ifc, h, c] = process.argv.slice(2);
const geo = new Geometry(parseStep(readFileSync(ifc)));
const A = new AlignmentReader(geo);
const B = A.basis(112);
const iosH = JSON.parse(readFileSync(h, "utf8")), iosC = JSON.parse(readFileSync(c, "utf8"));

// the README's text: L = 100, A0 = A1 = 2500; Axis angles at both ends
const L = 100, A0 = 2500, A1 = 2500;
const Dspec = (s) => L / A0 + (L / A1) * Math.cos((Math.PI * s) / L);
const slopeSpec = (s) => -(Math.PI / A1) * Math.sin((Math.PI * s) / L);
const ts = Math.atan2(0.994359200551929, 0.106064981392206), te = Math.PI / 2;
const thetaSpec = (s) => ts + ((te - ts) / (Dspec(L) - Dspec(0))) * (Dspec(s) - Dspec(0));

const max = { plan: 0, D: 0, slope: 0, theta: 0, iosD: 0, iosRoll: 0 };
console.log("d       plan vs IOS (m)   D here    D spec    IOS z     roll here  roll IOS   (deg)");
for (const key of Object.keys(iosC)) {
  const d = Number(key);
  const f = B.frame(d), k = B.cant(d);
  const [o, left] = iosC[key];
  const oh = iosH[key][0];
  const plan = Math.hypot(f.p[0] - oh[0], f.p[1] - oh[1]);
  const iosRoll = Math.asin(Math.max(-1, Math.min(1, -(left[2] - o[2]) / 0.75)));
  const theta = Math.PI / 2 - k.roll;
  max.plan = Math.max(max.plan, plan);
  max.D = Math.max(max.D, Math.abs(k.y - Dspec(d)));
  max.slope = Math.max(max.slope, Math.abs(k.dy - slopeSpec(d)));
  max.theta = Math.max(max.theta, Math.abs(theta - thetaSpec(d)));
  max.iosD = Math.max(max.iosD, Math.abs(o[2] - k.y));
  max.iosRoll = Math.max(max.iosRoll, Math.abs(iosRoll - k.roll));
  console.log(`${key.padEnd(7)} ${plan.toExponential(2).padEnd(17)} ${k.y.toFixed(5).padEnd(9)} ${Dspec(d).toFixed(5).padEnd(9)} ${o[2].toFixed(4).padEnd(9)} ${((k.roll * 180) / Math.PI).toFixed(4).padEnd(10)} ${((iosRoll * 180) / Math.PI).toFixed(4)}`);
}
const nextPlacement = [98.9298874325988, 13.1346246945757];
const end = B.frame(100).p;
console.log(`\nplan, here vs IfcOpenShell: max ${max.plan.toExponential(2)} m`);
console.log(`plan end vs the file's next horizontal segment's placement: here ${Math.hypot(end[0] - nextPlacement[0], end[1] - nextPlacement[1]).toExponential(2)} m, IfcOpenShell ${Math.hypot(iosH["100"][0][0] - nextPlacement[0], iosH["100"][0][1] - nextPlacement[1]).toExponential(2)} m`);
console.log(`deviating elevation, here vs the README formula: max ${max.D.toExponential(2)} m; its slope: max ${max.slope.toExponential(2)}; theta: max ${max.theta.toExponential(2)} rad`);
console.log(`IfcOpenShell vs here: elevation max ${max.iosD.toFixed(4)} m (IfcOpenShell ${iosC["100"][0][2].toFixed(4)} m at 100, where the file's EndPoint says 0); roll max ${((max.iosRoll * 180) / Math.PI).toFixed(4)} deg`);
// IfcOpenShell's elevation change against the README's, station by station
const ratios = Object.keys(iosC).map(Number).filter((d) => d > 0).map((d) => (iosC[String(d)][0][2] - 0.08) / (Dspec(d) - Dspec(0)));
console.log(`IfcOpenShell's change in elevation / the README's: ${Math.min(...ratios).toFixed(6)} to ${Math.max(...ratios).toFixed(6)} (L = ${L})`);
