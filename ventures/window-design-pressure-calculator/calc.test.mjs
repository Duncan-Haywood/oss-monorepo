import { test } from "node:test";
import assert from "node:assert/strict";
import { kz, ke, kzt, wallGcp, zoneWidth, debrisRegion, parseOpenings, analyze, sampleInput, factorRows, reportCsv } from "./calc.mjs";

const near = (a, b, tol = 0.005, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} vs ${b}`);

test("Kz reproduces ASCE 7-16 Table 26.10-1 (the printed table is rounded, C at 60 ft prints 1.13 for 1.137)", () => {
  // Table 26.10-1 rows (z = 0-15, 20, 25, 30, 40, 50, 60 ft).
  const table = {
    B: [0.57, 0.62, 0.66, 0.70, 0.76, 0.81, 0.85],
    C: [0.85, 0.90, 0.94, 0.98, 1.04, 1.09, 1.13],
    D: [1.03, 1.08, 1.12, 1.16, 1.22, 1.27, 1.31],
  };
  const zs = [15, 20, 25, 30, 40, 50, 60];
  for (const [exp, vals] of Object.entries(table)) zs.forEach((z, i) => near(kz(z, exp), vals[i], 0.0075, `${exp} ${z}`));
  assert.equal(kz(8, "C"), kz(15, "C"), "below 15 ft uses 15 ft");
});

test("Ke is 1 at sea level or blank and falls with elevation", () => {
  assert.equal(ke(NaN), 1);
  assert.equal(ke(0), 1);
  // Table 26.9-1: 5,000 ft gives 0.83 (e^-0.181 = 0.834).
  near(ke(5000), 0.834, 0.001);
});

test("wall GCp at the ends and in between (Figure 30.3-1)", () => {
  assert.deepEqual(wallGcp(5, 10, false), { pos: 1.0, neg: -1.4 });
  assert.deepEqual(wallGcp(5, 4, false), { pos: 1.0, neg: -1.4 }, "below 10 ft² is the 10 ft² value");
  const big = wallGcp(4, 900, false);
  near(big.pos, 0.7, 1e-12);
  near(big.neg, -0.8, 1e-12);
  // Hand: A = 15 ft², f = log10(1.5)/log10(50) = 0.17609/1.69897 = 0.10365.
  const g = wallGcp(5, 15, false);
  near(g.pos, 1.0 - 0.3 * 0.10365, 1e-4);
  near(g.neg, -1.4 + 0.6 * 0.10365, 1e-4);
  const z4 = wallGcp(4, 15, false);
  near(z4.neg, -1.1 + 0.3 * 0.10365, 1e-4);
  const low = wallGcp(5, 10, true);
  near(low.pos, 0.9, 1e-12);
  near(low.neg, -1.26, 1e-12);
});

test("corner zone width a follows note 6 and its floors", () => {
  assert.equal(zoneWidth(32, 22), 3.2); // 0.1 × 32 governs
  assert.equal(zoneWidth(200, 20), 8); // 0.4 h governs
  assert.equal(zoneWidth(20, 12), 3); // 3 ft floor
  near(zoneWidth(300, 10), 12, 1e-12); // 0.04 × 300 floor beats 0.4 h = 4
});

test("topographic factor: hand calculation for a 2-D escarpment", () => {
  // H = 80 ft, Lh = 200 ft (H/Lh = 0.4), exposure C, building 50 ft downwind of the crest, z = 25 ft.
  // K1 = 0.85 × 0.4 = 0.34; K2 = 1 − 50/(4 × 200) = 0.9375; K3 = e^(−2.5 × 25/200) = e^−0.3125 = 0.73161.
  // Kzt = (1 + 0.34 × 0.9375 × 0.73161)² = (1.23320)² = 1.52078.
  const t = kzt({ shape: "escarpment", H: 80, Lh: 200, x: 50, side: "downwind", z: 25, exposure: "C" });
  assert.equal(t.applies, true);
  near(t.k1, 0.34, 1e-12);
  near(t.k2, 0.9375, 1e-12);
  near(t.k3, 0.73161, 1e-5);
  near(t.kzt, 1.52078, 1e-4);
  // The same distance upwind uses mu = 1.5: K2 = 1 − 50/300 = 0.8333.
  near(kzt({ shape: "escarpment", H: 80, Lh: 200, x: 50, side: "upwind", z: 25, exposure: "C" }).k2, 0.83333, 1e-5);
});

test("topographic factor: steep hills cap H/Lh at 0.5 with Lh = 2H; low or gentle ones give 1", () => {
  const t = kzt({ shape: "ridge", H: 100, Lh: 100, x: 0, side: "upwind", z: 20, exposure: "C" });
  assert.equal(t.capped, true);
  near(t.k1, 1.45 * 0.5, 1e-12);
  near(t.k3, Math.exp(-3 * 20 / 200), 1e-12);
  assert.equal(kzt({ shape: "hill", H: 40, Lh: 400, x: 0, side: "upwind", z: 20, exposure: "C" }).applies, false, "H/Lh 0.1");
  assert.equal(kzt({ shape: "hill", H: 50, Lh: 100, x: 0, side: "upwind", z: 20, exposure: "B" }).applies, false, "B needs H >= 60");
  assert.equal(kzt({ shape: "hill", H: 50, Lh: 100, x: 0, side: "upwind", z: 20, exposure: "C" }).applies, true);
  assert.equal(kzt({ shape: "hill", H: 50, Lh: 100, x: 400, side: "upwind", z: 20, exposure: "C" }).kzt, 1, "far beyond mu Lh, K2 = 0");
});

test("wind-borne debris region (Section 26.12.3.1)", () => {
  assert.equal(debrisRegion(140, false).inRegion, true);
  assert.equal(debrisRegion(130, true).inRegion, true);
  assert.equal(debrisRegion(135, false).inRegion, false);
  assert.equal(debrisRegion(120, true).inRegion, false);
});

test("opening schedule parser: header, comments, zones, counts and errors", () => {
  const { openings, problems } = parseOpenings("Mark, Width, Height\n# note\nW1, 36, 60, 2.5, 3\nW2\t24\t24\tz4\nT1, 30, 18\n");
  assert.deepEqual(problems, []);
  assert.equal(openings.length, 3);
  assert.equal(openings[0].count, 3);
  assert.equal(openings[0].corner, 2.5);
  assert.equal(openings[1].zone, 4);
  assert.equal(openings[2].zone, null);
  assert.ok(Number.isNaN(openings[2].corner));
  assert.match(parseOpenings("W1, 36").problems[0], /width and a height/);
  assert.match(parseOpenings("W1, 36, 60, near").problems[0], /not a distance/);
  assert.match(parseOpenings("W1, 36, 60, 4, 1.5").problems[0], /whole number/);
});

test("worked example: 140 mph, exposure C, h = 25 ft, a 3 × 5 ft window in zone 5", () => {
  // Kh = 2.01 (25/900)^(2/9.5) = 0.94526; qh = 0.00256 × 0.94526 × 1 × 0.85 × 1 × 140² = 40.315 psf.
  // GCp = +0.96891 / −1.33781 (A = 15 ft²); GCpi ±0.18.
  // p+ = 40.315 × (0.96891 + 0.18) = 46.32 psf; p− = 40.315 × (−1.33781 − 0.18) = −61.19 psf.
  // ASD = 0.6 p: +27.79 / −36.71 psf, so the window needs DP 36.8 (rounded up to 0.1 psf).
  const r = analyze({ V: "140", exposure: "C", h: "25", pitch: "5", leastDim: "40", enclosure: "enclosed", coastal: "no", topo: "none", elevation: "", openings: "W, 36, 60, z5" });
  assert.equal(r.error, undefined);
  near(r.Kh, 0.94526, 1e-5);
  near(r.qh, 40.315, 0.001);
  const w = r.rows[0];
  near(w.pPos, 46.32, 0.01);
  near(w.pNeg, -61.19, 0.01);
  near(w.asdPos, 27.79, 0.01);
  near(w.asdNeg, -36.71, 0.01);
  assert.equal(w.dpRequired, 36.8);
  assert.equal(w.dpStep5, 40);
  assert.equal(r.debris.inRegion, true);
});

test("partially enclosed raises net pressure; low slope lowers it; elevation lowers qh", () => {
  const base = { V: "120", exposure: "B", h: "20", pitch: "6", leastDim: "40", coastal: "no", openings: "W, 36, 48, z4" };
  const enc = analyze(base).rows[0];
  const part = analyze({ ...base, enclosure: "partial" }).rows[0];
  assert.ok(part.pNeg < enc.pNeg);
  near(part.pNeg - enc.pNeg, -(0.55 - 0.18) * analyze(base).qh, 1e-9);
  assert.ok(analyze({ ...base, pitch: "2" }).rows[0].gcpNeg > enc.gcpNeg);
  near(analyze({ ...base, elevation: "5000" }).qh / analyze(base).qh, ke(5000), 1e-12);
});

test("the 16 psf minimum governs at low speeds", () => {
  const r = analyze({ V: "90", exposure: "B", h: "15", pitch: "6", leastDim: "40", coastal: "no", openings: "Big, 120, 120, z4" });
  const x = r.rows[0];
  assert.equal(x.pPos, 16);
  assert.equal(x.minPos, true);
  near(x.asdPos, 9.6, 1e-12);
  assert.ok(r.findings.some((f) => /16 psf minimum/.test(f.title)));
});

test("corner distance decides the zone against a; blank means zone 5", () => {
  const r = analyze({ ...sampleInput(), openings: "A, 36, 36, 3.1\nB, 36, 36, 3.2\nC, 36, 36" });
  assert.equal(r.a, 3.2);
  assert.deepEqual(r.rows.map((x) => x.zone), [5, 4, 5]);
  assert.ok(r.findings.some((f) => /taken as zone 5/.test(f.title)));
});

test("input errors are explained, not thrown", () => {
  assert.match(analyze({ V: "" }).error, /wind speed/);
  assert.match(analyze({ h: "75" }).error, /60 ft or less/);
  assert.match(analyze({ openings: "" }).error, /at least one opening/);
  assert.match(analyze({ topo: "ridge", hillH: "" }).error, /hill, ridge or escarpment/);
  assert.match(analyze({ openings: "X, 0, 10" }).error, /width and a height/);
});

test("sample result, factor rows and CSV", () => {
  const r = analyze(sampleInput());
  assert.equal(r.rows.length, 7);
  assert.equal(r.worst.label, "Stair transom");
  const rows = factorRows(r);
  assert.ok(rows.find((x) => /^Velocity pressure qh/.test(x[0])));
  const csv = reportCsv(r);
  assert.match(csv, /^Opening,Count,Width/);
  assert.equal(csv.split("\n").filter((l) => /^"?(Front|Living|Kitchen|Sliding|Entry|Garage|Stair)/.test(l)).length, 7);
  const evil = reportCsv(analyze({ ...sampleInput(), openings: "=HYPERLINK(1), 36, 36, 4" }));
  assert.match(evil, /\n'=HYPERLINK\(1\)/);
});

test("red team 2026-11-23: a header row after the sample's # comment line is still skipped", () => {
  // The page says "A header row and lines starting with # are skipped", and its
  // sample opens with a # line, so a user who keeps it and pastes a schedule
  // with a title row got "needs a label, a width and a height".
  for (const text of ["# c\nMark, Width, Height\nA, 36, 60, 5", "\nOpening\tW\tH\nA\t36\t60\t5", "Opening, W, H\nA, 36, 60, 5"]) {
    const { openings, problems } = parseOpenings(text);
    assert.deepEqual(problems, [], text);
    assert.equal(openings.length, 1);
  }
  // Only the first content line can be a header: a later text row is an error.
  assert.match(parseOpenings("A, 36, 60\nB, wide, tall").problems[0], /line 2/);
});

test("red team 2026-11-23: non-decimal text is not a number (Infinity, hex)", () => {
  assert.match(analyze({ leastDim: "Infinity" }).error, /least horizontal dimension/);
  assert.match(analyze({ V: "0x8C" }).error, /wind speed/);
  assert.match(analyze({ h: "Infinity" }).error, /mean roof height/);
  assert.match(analyze({ openings: "A, 0x24, 60" }).error, /width and a height/);
  assert.equal(analyze({ V: "1.4e2" }).V, 140, "scientific notation is still a decimal");
});

test("red team 2026-11-23: boundary messages (V = 130 inland, h = 15, H = 0)", () => {
  assert.match(debrisRegion(130, false).why, /130-139 mph but the site is not within 1 mile/);
  assert.match(debrisRegion(129.9, false).why, /under 130/);
  const f15 = analyze({ ...sampleInput(), h: "15" }).findings;
  assert.ok(!f15.some((f) => /Kh taken at 15 ft/.test(f.title)), "h = 15 ft is on the table");
  assert.ok(analyze({ ...sampleInput(), h: "14" }).findings.some((f) => /Kh taken at 15 ft/.test(f.title)));
  assert.equal(kzt({ shape: "ridge", H: 0, Lh: 100, x: 0, side: "upwind", z: 20, exposure: "C" }).invalid, true);
});

test("boundaries: V up to 300 mph, a roof at exactly 10 degrees is low slope, a hill needs z > 0", () => {
  assert.ok(!analyze({ V: "300" }).error, "300 mph is accepted");
  assert.ok(analyze({ V: "301" }).error, "over 300 mph is refused");
  assert.ok(analyze({ V: "300.5" }).error, "over 300 mph is refused");
  // 12 tan(10°) as a typed decimal gives theta === 10 exactly: note 5 says "10° or less".
  const at10 = analyze({ pitch: "2.1159237685015797" });
  assert.equal(at10.theta, 10);
  assert.equal(at10.lowSlope, true);
  assert.equal(analyze({ pitch: "2.12" }).lowSlope, false);
  const hill = { shape: "escarpment", H: 80, Lh: 100, x: 50, side: "upwind", exposure: "C" };
  assert.equal(kzt({ ...hill, z: 0 }).invalid, true, "z = 0 is not a building height");
  assert.equal(kzt({ ...hill, z: 20 }).applies, true);
});

test("Infinity and overflowing numbers are refused, not carried into a = Infinity ft", () => {
  assert.ok(analyze({ leastDim: "Infinity" }).error, "least dimension Infinity");
  assert.ok(analyze({ leastDim: "1e400" }).error, "least dimension that overflows");
  assert.ok(analyze({ pitch: "Infinity" }).error, "pitch Infinity");
  assert.ok(analyze({ openings: "A, 1e400, 60, 3" }).error, "width that overflows");
  assert.ok(analyze({ openings: "A, 36, 60, Infinity" }).error, "corner distance Infinity");
  assert.ok(analyze({ openings: "A, 36, 60, 3, Infinity" }).error, "count Infinity");
  assert.equal(parseOpenings("A, -Infinity, 60").openings.length, 0);
});

test("red team 2026-11-24: a first opening written with units is an opening, not a header", () => {
  const p = parseOpenings("Garage door, 192in, 84in, 2\nKitchen, 48, 36");
  assert.equal(p.openings.length + p.problems.length, 2, "the garage door line is not silently dropped");
  assert.ok(analyze({ openings: "Garage door, 192in, 84in, 2\nKitchen, 48, 36" }).error, "unit suffixes are explained");
  assert.equal(parseOpenings("Mark, Width (in), Height (in)\nKitchen, 48, 36").openings.length, 1, "a real header is still skipped");
});

test("red team 2026-11-24: an elevation that is not a number is refused, not read as sea level", () => {
  assert.match(analyze({ ...sampleInput(), elevation: "5,280" }).error, /elevation/);
  assert.match(analyze({ ...sampleInput(), elevation: "high" }).error, /elevation/);
  assert.equal(analyze({ ...sampleInput(), elevation: "" }).Ke, 1);
  assert.equal(analyze({ ...sampleInput(), elevation: "  " }).Ke, 1);
  assert.ok(ke(1) < 1, "1 ft above sea level already reduces Ke");
});

test("red team 2026-11-24: beyond the hill's zone of influence the page does not claim a 0% raise", () => {
  const r = analyze({ ...sampleInput(), topo: "escarpment", hillH: "80", hillLh: "100", hillX: "2000", hillSide: "downwind" });
  assert.equal(r.Kzt, 1);
  assert.ok(!r.findings.some((f) => /raises the pressure by 0%/.test(f.title)));
  assert.ok(r.findings.some((f) => /Kzt = 1/.test(f.title)));
});

test("red team 2026-11-24: Lh = 0 is refused; H = 15 ft qualifies in exposure C", () => {
  assert.equal(kzt({ shape: "escarpment", H: 80, Lh: 0, x: 50, side: "upwind", z: 20, exposure: "C" }).invalid, true);
  assert.equal(kzt({ shape: "hill", H: 15, Lh: 30, x: 0, side: "upwind", z: 20, exposure: "C" }).applies, true);
  assert.equal(kzt({ shape: "hill", H: 15, Lh: 30, x: 0, side: "upwind", z: 20, exposure: "B" }).applies, false);
});

test("red team 2026-11-24: the factor table shows a to one decimal", () => {
  const rows = factorRows(analyze(sampleInput()));
  assert.match(rows.find((x) => /^Corner zone width a/.test(x[0]))[1], /^\d+\.\d$/);
});
