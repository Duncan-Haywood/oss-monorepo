import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "./calc.mjs";

const P = 101325;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (tol ${tol})`);
const rel = (a, b, r, msg) => near(a, b, Math.abs(b) * r, msg);

test("saturation pressure matches published steam-table and ice values within 0.05%", () => {
  // Over water: IAPWS-95 values in kPa, as tabulated in steam tables (ASHRAE Fundamentals Table 3 agrees to 4 figures).
  for (const [t, kPa] of [[10, 1.2282], [20, 2.3393], [30, 4.247], [40, 7.3849], [50, 12.352], [100, 101.418]]) rel(c.satPressure(t) / 1000, kPa, 5e-4, `water ${t} C`);
  // Over ice (IAPWS sublimation pressure), Pa.
  for (const [t, pa] of [[-10, 259.9], [-20, 103.26], [-40, 12.84]]) rel(c.satPressure(t), pa, 5e-4, `ice ${t} C`);
  // The two formulas meet at the triple point to within 0.1%.
  rel(c.satPressure(-1e-9), c.satPressure(0), 1e-3, "ice/water switch at 0 C");
});

test("standard atmosphere reproduces the ASHRAE Table 1 pressures", () => {
  near(c.stdPressure(0), 101325, 0.01);
  near(c.stdPressure(1000) / 1000, 89.875, 0.002);
  near(c.stdPressure(1500) / 1000, 84.556, 0.002);
});

test("a hand calculation of the wet-bulb equation at 40 C / 20 C wet bulb", () => {
  // By hand: pws(20 C) = 2338.8 Pa, Ws* = 0.621945 * 2338.8 / (101325 - 2338.8) = 0.014695;
  // W = ((2501 - 2.326*20) * 0.014695 - 1.006*20) / (2501 + 1.86*40 - 4.186*20) = 15.949 / 2491.68 = 0.006401.
  const W = c.humRatioFromWetBulb(40, 20, P);
  near(W, 0.006401, 2e-6);
  const s = c.state(40, W, P);
  near(s.h, 56.72, 0.01, "h = 1.006*40 + W(2501 + 1.86*40)");
  near(s.rh, 0.1398, 5e-4, "pw / pws(40)");
  near(s.v, 0.8962, 2e-4, "v = 0.287042 * 313.15 * (1 + 1.607858 W) / 101.325");
  near(s.twb, 20, 1e-6, "wet bulb solves back");
});

test("75 F / 50% at sea level reads like a standard IP chart", () => {
  const s = c.solvePoint("t", 75, "rh", 50, "IP", P);
  const d = c.display(s, "IP");
  near(d.tdp, 55.1, 0.05, "dew point");
  near(d.twb, 62.6, 0.1, "wet bulb");
  near(d.W, 64.6, 0.3, "grains");
  near(d.h, 28.1, 0.1, "Btu/lb");
  near(d.v, 13.68, 0.01, "ft3/lb");
});

test("any non-degenerate pair of properties recovers the same point, in both unit systems", () => {
  for (const u of ["IP", "SI"]) {
    for (const [t, rh] of [[24, 40], [-8, 70], [35, 15], [12, 95]]) {
      const s = c.state(t, c.humRatio((rh / 100) * c.satPressure(t), P), P);
      const kinds = Object.keys(c.KINDS);
      for (const k1 of kinds) for (const k2 of kinds) {
        if (k1 >= k2) continue;
        const r = c.solvePoint(k1, c.propValue(k1, s, u), k2, c.propValue(k2, s, u), u, P);
        if ((k1 === "W" && k2 === "tdp") || (k1 === "h" && k2 === "twb")) { assert.match(r.error, /cannot locate a point/); continue; }
        assert.ok(!r.error, `${u} ${t}/${rh} ${k1}+${k2}: ${r.error}`);
        near(r.t, t, 1e-5, `${u} ${k1}+${k2} t`);
        near(r.W, s.W, 1e-8, `${u} ${k1}+${k2} W`);
      }
    }
  }
});

test("altitude raises the humidity ratio of the same dew point by the pressure ratio", () => {
  const sea = c.analyze({ k1: "t", v1: "75", k2: "rh", v2: "50", process: "none" });
  const denver = c.analyze({ k1: "t", v1: "75", k2: "rh", v2: "50", process: "none", altitude: "5280" });
  assert.ok(denver.a.W / sea.a.W > 1.2 && denver.a.W / sea.a.W < 1.25, `${denver.a.W / sea.a.W}`);
  near(denver.a.tdp, sea.a.tdp, 1e-9, "dew point depends only on vapour pressure");
  const typed = c.analyze({ k1: "t", v1: "75", k2: "rh", v2: "50", process: "none", pressure: "12.0" });
  near(typed.pDisplay, 12.0, 1e-12);
});

test("below freezing the dew point is the frost point and the wet bulb uses the ice equation", () => {
  const s = c.solvePoint("t", -10, "rh", 80, "SI", P);
  near(c.satPressure(s.tdp), s.pw, 1e-6);
  assert.ok(s.tdp < -10 && s.twb < -10 + 1e-9 && s.twb > s.tdp);
  near(c.humRatioFromWetBulb(-10, s.twb, P), s.W, 1e-10);
});

test("bad input is refused with a reason", () => {
  assert.match(c.solvePoint("t", 80, "t", 70, "IP", P).error, /pick two different/);
  assert.match(c.solvePoint("t", 80, "rh", 120, "IP", P).error, /at most 100/);
  assert.match(c.solvePoint("t", 70, "twb", 75, "IP", P).error, /beyond saturation/);
  assert.match(c.solvePoint("t", 70, "tdp", 72, "IP", P).error, /beyond saturation/);
  assert.match(c.solvePoint("t", 400, "rh", 50, "IP", P).error, /Dry bulb must be/);
  assert.match(c.solvePoint("t", NaN, "rh", 50, "IP", P).error, /Enter a number/);
  assert.match(c.analyze({ altitude: "40000" }).error, /Altitude/);
  assert.match(c.analyze({ pressure: "2" }).error, /Pressure/);
  assert.match(c.analyze({ flowA: "" }).error, /airflow of stream A/);
  assert.match(c.analyze({ bk1: "t", bv1: "85", bk2: "rh", bv2: "30" }).error, /not cooler/);
  assert.match(c.analyze({ bk1: "t", bv1: "70", bk2: "tdp", bv2: "65" }).error, /more moisture/);
  assert.match(c.analyze({ process: "heat", leaving: "50" }).error, /below the dew point/);
  assert.match(c.analyze({ process: "adp", adpT: "62" }).error, /below the entering dew point/);
});

test("the example coil: loads balance and the ADP lies on the coil line at saturation", () => {
  const r = c.analyze(c.sampleInput());
  const { a, b } = r;
  const m = (1200 * 0.00047194745) / a.v;
  near(r.coil.total.kw, m * (a.h - b.h), 1e-9);
  near(r.coil.sensible.kw + r.coil.latent.kw, r.coil.total.kw, 1e-9);
  near(r.coil.latent.kw, m * (a.W - b.W) * 2501, 1e-9);
  near(r.coil.total.display, r.coil.total.kw * 3412.141633, 1e-6);
  // 80/67 entering, 55/54 leaving, 1200 cfm: about 3.85 tons at SHR 0.69 (the guide quotes these).
  near(r.coil.total.tons, 3.85, 0.01);
  near(r.coil.shr, 0.693, 0.002);
  const adp = r.points.find((p) => p.label === "ADP").s;
  near(adp.rh, 1, 1e-6, "ADP saturated");
  const slope = (b.W - a.W) / (b.t - a.t);
  near((adp.W - a.W) / (adp.t - a.t), slope, 1e-9, "ADP on the line through A and B");
  near(r.coil.bypass, (b.t - adp.t) / (a.t - adp.t), 1e-12);
  // gallons per hour = lb/h of water / 8.34 roughly
  near(r.coil.condensate, (m * (a.W - b.W) * 3600) / 3.785411784, 1e-9);
});

test("the ADP mode inverts the coil mode", () => {
  const forward = c.analyze(c.sampleInput());
  const back = c.analyze({ process: "adp", adpT: String(forward.coil.adp.t), bypass: String(forward.coil.bypass) });
  near(back.b.t, forward.b.t, 0.01, "leaving dry bulb");
  near(back.b.W, forward.b.W, 2e-6, "leaving humidity ratio");
});

test("mixing conserves dry air, water and enthalpy, and lies on the line between the streams", () => {
  const r = c.analyze({ units: "SI", k1: "t", v1: "24", k2: "rh", v2: "50", process: "mix", bk1: "t", bv1: "35", bk2: "twb", bv2: "26", flowA: "3000", flowB: "1000" });
  const ma = 3000 / 3600 / r.a.v, mb = 1000 / 3600 / r.b.v;
  const M = r.result;
  near(M.W * (ma + mb), ma * r.a.W + mb * r.b.W, 1e-12);
  near(M.h * (ma + mb), ma * r.a.h + mb * r.b.h, 1e-9);
  near(r.mix.fractionB, mb / (ma + mb), 1e-12);
  assert.ok(M.t > r.a.t && M.t < r.b.t);
  assert.equal(r.mix.fog, false);
});

test("mixing cold saturated air with warm humid air is flagged as fog", () => {
  const r = c.analyze({ units: "SI", k1: "t", v1: "-10", k2: "rh", v2: "100", process: "mix", bk1: "t", bv1: "30", bk2: "rh", bv2: "95", flowA: "1000", flowB: "1000" });
  assert.equal(r.mix.fog, true);
  assert.ok(r.findings.some((f) => /fog/.test(f.title)));
  near(r.result.rh, 1, 1e-9);
});

test("sensible heating keeps the moisture and the load is m cp dT", () => {
  const r = c.analyze({ process: "heat", leaving: "95" });
  near(r.b.W, r.a.W, 0);
  const m = (1200 * 0.00047194745) / r.a.v;
  near(r.heat.load.kw, m * (1.006 + 1.86 * r.a.W) * (r.b.t - r.a.t), 1e-9);
  assert.ok(r.b.rh < r.a.rh);
});

test("an evaporative cooler follows the wet bulb and stops at the effectiveness", () => {
  const r = c.analyze({ units: "SI", k1: "t", v1: "38", k2: "rh", v2: "15", process: "evap", eff: "85", flowA: "5000" });
  near(r.b.twb, r.a.twb, 1e-6, "constant wet bulb");
  near(r.a.t - r.b.t, 0.85 * (r.a.t - r.a.twb), 1e-9);
  assert.ok(r.b.W > r.a.W);
  // Constant wet bulb is not constant enthalpy: the air gains the enthalpy of the water it takes up, at the wet bulb.
  near(r.b.h - r.a.h, (r.b.W - r.a.W) * 4.186 * r.a.twb, 0.01, "h rises by dW * cw * twb");
});

test("unit systems agree on the physics", () => {
  const ip = c.analyze({ ...c.sampleInput() });
  const si = c.analyze({ ...c.sampleInput(), units: "SI", v1: String(c.fToC(80)), v2: String(c.fToC(67)), bv1: String(c.fToC(55)), bv2: String(c.fToC(54)), flowA: String(1200 * 1.69901082) });
  near(si.a.W, ip.a.W, 1e-12);
  near(si.coil.total.kw, ip.coil.total.kw, 1e-6);
  near(si.coil.condensate / 3.785411784, ip.coil.condensate, 1e-6);
  // IP enthalpy on its own datum: 0.240 t + W (1061 + 0.444 t)
  near(c.display(ip.a, "IP").h, 0.24 * 80 + ip.a.W * (1061 + 0.444 * 80), 1e-9);
});

test("the chart, table and CSV render every point", () => {
  for (const proc of ["none", "mix", "coil", "adp", "heat", "evap"]) {
    const r = c.analyze({ process: proc, bk1: proc === "mix" ? "rh" : "t", bv1: proc === "mix" ? "40" : "55", bk2: "twb", bv2: proc === "mix" ? "70" : "54" });
    assert.ok(!r.error, `${proc}: ${r.error}`);
    const svg = c.chartSvg(r);
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/, proc);
    for (const p of r.points) assert.ok(svg.includes(`>${p.label}</text>`), `${proc} ${p.label}`);
    const rows = c.propertyRows(r);
    assert.equal(rows.length, 10);
    for (const row of rows) assert.equal(row.values.length, r.points.length);
    const csv = c.reportCsv(r);
    assert.match(csv, /^Property,Unit,A/);
    assert.doesNotMatch(csv, /NaN|undefined/);
  }
});
