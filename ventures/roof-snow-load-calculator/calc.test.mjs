// Each expected value below is worked by hand from the ASCE 7-16 Chapter 7 equation named
// beside it, not taken from the engine's own output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, driftHeight, snowDensity, slopeFactor, driftShape, stepProfile, reportCsv, resultRows, stepSvg, sampleInput, CE, IMPORTANCE } from "./calc.mjs";

const near = (a, b, tol = 0.01, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} vs ${b}`);

test("Fig. 7.6-1 drift height by hand, and the 20 ft minimum fetch", () => {
  // pg 40, lu 28: 0.43 * 28^(1/3) * 50^(1/4) - 1.5 = 0.43 * 3.03659 * 2.65915 - 1.5 = 1.9721
  near(driftHeight(28, 40), 1.9721, 0.001);
  // pg 30, lu 100: 0.43 * 4.64159 * 2.51487 - 1.5 = 3.5194
  near(driftHeight(100, 30), 3.5194, 0.001);
  // lu below 20 ft is 20 ft: 0.43 * 2.71442 * 2.65915 - 1.5 = 1.6038
  near(driftHeight(10, 40), 1.6038, 0.001);
  assert.equal(driftHeight(10, 40), driftHeight(20, 40));
});

test("Eq. 7.7-1 snow density, capped at 30 pcf", () => {
  near(snowDensity(40), 19.2, 1e-9); // 0.13*40 + 14
  near(snowDensity(30), 17.9, 1e-9);
  assert.equal(snowDensity(200), 30); // 0.13*200 + 14 = 40 -> 30
});

test("Fig. 7.4-1 slope factor on all three panels", () => {
  // warm, other surfaces: 1 to 30 deg, 0 at 70
  assert.equal(slopeFactor(30, 1.0, false), 1);
  near(slopeFactor(50, 1.0, false), 0.5, 1e-9);
  // warm, slippery: 1 to 5 deg; at 37.5 deg, 1 - 32.5/65 = 0.5
  near(slopeFactor(37.5, 1.0, true), 0.5, 1e-9);
  // Ct = 1.1: other 1 to 37.5; at 53.75 -> 0.5. slippery 1 to 10; at 40 -> 0.5
  near(slopeFactor(53.75, 1.1, false), 0.5, 1e-9);
  near(slopeFactor(40, 1.1, true), 0.5, 1e-9);
  // Ct >= 1.2: other 1 to 45; at 57.5 -> 0.5. slippery 1 to 15; at 42.5 -> 0.5
  near(slopeFactor(57.5, 1.2, false), 0.5, 1e-9);
  near(slopeFactor(42.5, 1.3, true), 0.5, 1e-9);
  // greenhouse Ct = 0.85 is a warm roof
  near(slopeFactor(50, 0.85, false), 0.5, 1e-9);
  assert.equal(slopeFactor(75, 1.0, false), 0);
});

test("tables: Ce, Is", () => {
  assert.equal(CE.B.sheltered, 1.2);
  assert.equal(CE.D.fully, 0.8);
  assert.equal(CE.treeline.sheltered, null);
  assert.deepEqual(IMPORTANCE, { I: 0.8, II: 1.0, III: 1.1, IV: 1.2 });
});

test("the page example by hand: 6/12 gable, pg 40, 9 ft step onto a 22 ft wing", () => {
  const r = analyze(sampleInput());
  // pf = 0.7 * 1.0 * 1.0 * 1.0 * 40 = 28.0; 6/12 = 26.57 deg < 30 so Cs = 1
  near(r.pf, 28, 1e-9);
  near(r.deg, 26.565, 0.001);
  assert.equal(r.Cs, 1);
  assert.equal(r.pmApplies, false); // steeper than 15 deg
  // W = 14 ft <= 20 with prismatic rafters: leeward Is pg = 40, windward 0
  assert.equal(r.unbalanced.simple, true);
  assert.equal(r.unbalanced.leeward, 40);
  // hb = 28 / 19.2 = 1.4583; hc = 9 - 1.4583 = 7.5417
  near(r.step.hb, 1.4583, 0.0001);
  near(r.step.hc, 7.5417, 0.0001);
  // leeward hd(28) = 1.9721 < hc; w = 4 hd = 7.889; pd = 1.9721 * 19.2 = 37.865
  // windward 0.75 * hd(22) = 0.75 * (0.43 * 2.80204 * 2.65915 - 1.5) = 0.75 * 1.70392 = 1.2779
  near(r.step.windward.hd, 1.2779, 0.001);
  assert.equal(r.step.governing, "leeward");
  near(r.step.drift.w, 7.889, 0.001);
  near(r.step.drift.pd, 37.865, 0.002);
  near(r.step.maxLoad, 65.865, 0.002);
  assert.deepEqual(stepProfile(r).map(([d]) => Math.round(d * 10) / 10), [0, 7.9, 22]);
});

test("unbalanced load for W > 20 ft (Fig. 7.6-2)", () => {
  // pg 30, Ce 1.0, Ct 1.0, Is 1.0: pf = 21; 4/12 (18.43 deg) so Cs = 1, ps = 21
  // hd(lu = 30) = 0.43 * 3.10723 * 2.51487 - 1.5 = 1.8601; gamma = 17.9; S = 3
  // surcharge = 1.8601 * 17.9 / sqrt(3) = 19.223; extent = 8 * sqrt(3) * 1.8601 / 3 = 8.592
  const r = analyze({ pg: "30", pitch: "4", W: "30", stepHeight: "" });
  const u = r.unbalanced;
  assert.equal(u.simple, false);
  near(u.windward, 6.3, 1e-9);
  near(u.leeward, 21, 1e-9);
  near(u.hd, 1.8601, 0.001);
  near(u.surcharge, 19.223, 0.01);
  near(u.extent, 8.592, 0.005);
  // W <= 20 but members not prismatic: also the Fig. 7.6-2 form
  assert.equal(analyze({ pg: "30", pitch: "4", W: "16", prismatic: "no", stepHeight: "" }).unbalanced.simple, false);
  // outside 1/2 on 12 .. 7 on 12: not required
  assert.equal(analyze({ pitch: "8", stepHeight: "" }).unbalanced.required, false);
  assert.equal(analyze({ pitch: "0.25", stepHeight: "" }).unbalanced.required, false);
  assert.equal(analyze({ pitch: "0.5", stepHeight: "" }).unbalanced.required, true); // 2.386 deg
  assert.equal(analyze({ pitch: "7", stepHeight: "" }).unbalanced.required, true); // exactly 7 on 12 is not "exceeding" it
});

test("minimum load and rain-on-snow (Sec. 7.3.4, 7.10)", () => {
  // pg 15, flat, Ce 0.9 (C fully), Ct 1.0, Is 1.0: pf = 0.7*0.9*15 = 9.45; pm = Is pg = 15
  // W = 50 ft: W/50 = 1 deg; flat roof 0 deg < 1 so ROS 5 psf: balanced 14.45 < 15 = pm
  const r = analyze({ pg: "15", exposure: "fully", roofType: "flat", pitch: "0", W: "50", stepHeight: "" });
  near(r.pf, 9.45, 1e-9);
  assert.equal(r.ros, 5);
  near(r.balanced, 14.45, 1e-9);
  assert.equal(r.pm, 15);
  assert.equal(r.uniform, 15);
  assert.equal(r.governs, "minimum");
  // pg 30, Risk III: pm = 20 * 1.1 = 22; pf = 0.7*1.0*1.0*1.1*30 = 23.1 governs; no ROS above 20 psf
  const s = analyze({ pg: "30", risk: "III", roofType: "flat", pitch: "0", W: "50", stepHeight: "" });
  near(s.pm, 22, 1e-9);
  near(s.pf, 23.1, 1e-9);
  assert.equal(s.ros, 0);
  // pg exactly 20 still takes rain-on-snow ("20 psf or less")
  assert.equal(analyze({ pg: "20", roofType: "flat", pitch: "0", W: "50", stepHeight: "" }).ros, 5);
  // 1/4 on 12 = 1.19 deg with W = 50 (limit 1 deg): no ROS
  assert.equal(analyze({ pg: "15", roofType: "mono", pitch: "0.25", W: "50", stepHeight: "" }).ros, 0);
});

test("drift capped by the clear height and truncated at the far edge", () => {
  // pg 60, Ce 1.0, Ct 1.0: pf 42, gamma = 21.8, hb = 1.9266; step 4 ft: hc = 2.0734
  // leeward hd(200) = 0.43 * 5.84804 * 2.89256 - 1.5 = 5.7737 > hc -> hd = hc,
  // w = 4 * 5.7737^2 / 2.0734 = 64.31 capped at 8 hc = 16.587; lower roof 12 ft -> truncated
  const r = analyze({ pg: "60", roofType: "flat", pitch: "0", W: "40", stepHeight: "4", upperLength: "200", lowerLength: "12" });
  const d = r.step.drift;
  near(r.step.hc, 2.0734, 0.0005);
  assert.equal(d.capped, true);
  near(d.hd, 2.0734, 0.0005);
  near(d.w, 16.587, 0.005);
  assert.equal(d.truncated, true);
  // edge surcharge = pd * (1 - 12 / 16.587); pd = 2.0734 * 21.8 = 45.20
  near(d.pd, 45.20, 0.02);
  near(d.edge, 45.20 * (1 - 12 / 16.587), 0.02);
  // tiny step: hc/hb < 0.2 -> no drift
  const t = analyze({ pg: "60", roofType: "flat", pitch: "0", W: "40", stepHeight: "2.2", upperLength: "200", lowerLength: "12" });
  assert.equal(t.step.required, false);
  assert.match(t.step.reason, /under 0\.2/);
  // driftShape directly: below hc, w = 4 hd
  assert.deepEqual(driftShape(2, 5, 20, 30), { hd: 2, w: 8, pd: 40, capped: false, truncated: false, edge: 0 });
});

test("parapet / rooftop unit drift (Sec. 7.8)", () => {
  // pg 40 flat: ps = 28, hb 1.4583; 4 ft parapet, 120 ft upwind: 0.75 * (0.43 * 4.93242 * 2.65915 - 1.5) = 3.1047
  // hc = 2.5417 < 3.1047 -> hd = hc; w = 4 * 3.1047^2 / 2.5417 = 15.17 (< 8 hc = 20.33)
  const r = analyze({ roofType: "flat", pitch: "0", W: "60", stepHeight: "", parapetHeight: "4", parapetFetch: "120" });
  near(r.parapet.drift.hdRaw, 3.1047, 0.001);
  near(r.parapet.drift.hd, 2.5417, 0.0005);
  near(r.parapet.drift.w, 15.17, 0.01);
  near(r.parapet.maxLoad, 28 + 2.5417 * 19.2, 0.01);
  // a rooftop unit whose side is under 15 ft needs no drift
  assert.equal(analyze({ roofType: "flat", pitch: "0", W: "60", stepHeight: "", parapetHeight: "4", parapetFetch: "120", parapetSide: "10" }).parapet.required, false);
});

test("sliding snow (Sec. 7.9) and the eave ice-dam load (Sec. 7.4.5)", () => {
  // pf 28, W 14: 0.4 * 28 * 14 = 156.8 lb/ft over 15 ft = 10.453 psf
  const r = analyze({ slidesOnto: "yes" });
  near(r.step.sliding.perFt, 156.8, 1e-9);
  near(r.step.sliding.psf, 10.4533, 0.0001);
  // lower roof only 10 ft wide: total reduced to 10/15 of 156.8 = 104.53 lb/ft spread over 10 ft
  const n = analyze({ slidesOnto: "yes", lowerLength: "10" });
  near(n.step.sliding.total, 104.533, 0.001);
  near(n.step.sliding.psf, 10.4533, 0.0001);
  // non-slippery 1/12 roof (4.76 deg < 9.46) does not slide
  assert.equal(analyze({ slidesOnto: "yes", pitch: "1" }).step.sliding.required, false);
  // warm roof, poorly insulated: 2 pf on overhangs; and the slippery curve is refused
  const w = analyze({ insulated: "no", surface: "slippery", pitch: "10" });
  near(w.iceDam, 56, 1e-9);
  assert.equal(w.slippery, false);
  assert.ok(w.findings.some((f) => /Slippery curve not used/.test(f.title)));
  assert.equal(analyze({ insulated: "no", thermal: "unheated" }).iceDam, 0);
});

test("bad input gives a message, not NaN", () => {
  assert.match(analyze({ pg: "" }).error, /ground snow load/);
  assert.match(analyze({ pg: "-3" }).error, /ground snow load/);
  assert.match(analyze({ terrain: "treeline", exposure: "sheltered" }).error, /sheltered/);
  assert.match(analyze({ W: "" }).error, /eave to ridge/);
  assert.match(analyze({ lowerLength: "" }).error, /lower roof length/);
  assert.match(analyze({ parapetHeight: "3" }).error, /upwind/);
  const z = analyze({ pg: "0" });
  assert.equal(z.uniform, 0);
});

test("CSV, rows and diagram", () => {
  const r = analyze(sampleInput());
  const csv = reportCsv(r);
  assert.match(csv, /^Quantity,Value,Unit,ASCE 7-16\n/);
  assert.match(csv, /Total at step, pf \+ pd",65\.9,psf/);
  assert.ok(resultRows(r).length > 15);
  const svg = stepSvg(r);
  assert.match(svg, /^<svg/);
  assert.match(svg, /65\.9 psf/);
  assert.doesNotMatch(svg, /NaN/);
  assert.equal(stepSvg(analyze({ stepHeight: "" })), "");
});

test("prototype keys are refused and CSV cells keep numbers but defuse formulas", () => {
  assert.match(analyze({ risk: "constructor" }).error, /risk category/);
  assert.match(analyze({ terrain: "toString" }).error, /terrain/);
  assert.match(analyze({ thermal: "__proto__" }).error, /thermal/);
  const csv = reportCsv(analyze(sampleInput()));
  assert.doesNotMatch(csv, /'\d/);
});
