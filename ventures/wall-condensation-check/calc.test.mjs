import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, psat, dewPoint, parseLayers, parseClimate, simulate, safeIndoorRh, reportCsv, sampleInput, sampleWithFoam, R_IP_TO_SI, PERM_US_TO_SI, RSI, RSE, LIBRARY } from "./calc.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b}`);
const flat = (tOut, rhOut, tIn, rhIn) => Array.from({ length: 12 }, () => ({ tOut, rhOut, tIn, rhIn }));

test("saturation pressure follows the ISO 13788 forms over water and ice, and dew point inverts it", () => {
  assert.equal(psat(0), 610.5);
  near(psat(20), 610.5 * Math.exp((17.269 * 20) / 257.3), 1e-9);
  near(psat(20), 2337, 2);
  near(psat(-10), 610.5 * Math.exp((21.875 * -10) / 255.5), 1e-9);
  near(psat(-10), 260, 1);
  for (const t of [-25, -3, 0.5, 12, 30]) near(dewPoint(psat(t)), t, 1e-9, `t=${t}`);
});

test("unit conversions: R-1 IP and 1 US perm", () => {
  const { layers } = parseLayers("a, 1, 1\nb, 0.17611, 57.2135", "IP", "perm");
  near(layers[0].rSI, R_IP_TO_SI, 1e-12);
  near(1 / layers[0].z, PERM_US_TO_SI, 1e-24);
  const si = parseLayers("a, 0.17611, 57.2135\nb, 1, 1", "SI", "ng").layers;
  near(si[0].rSI, 0.17611, 1e-12);
  near(si[0].permUS, 1, 1e-9);
});

test("a two-layer wall matches a hand calculation of the condensation rate", () => {
  // Inside 20 C / 50 %, outside -10 C / 80 %. Insulation R 2.5 m²K/W, 100 ng; sheathing R 0.1, 2 ng.
  const { layers } = parseLayers("insulation, 2.5, 100\nsheathing, 0.1, 2", "SI", "ng");
  const rTot = RSI + 2.5 + 0.1 + RSE;
  const tIf = 20 - (30 * (RSI + 2.5)) / rTot; // interface between the two
  const ps = psat(tIf);
  const pIn = 0.5 * psat(20);
  const pOut = 0.8 * psat(-10);
  const z1 = 1 / 100e-12;
  const z2 = 1 / 2e-12;
  // the straight line would sit far above saturation at the interface
  assert.ok(pIn - ((pIn - pOut) * z1) / (z1 + z2) > ps);
  const expected = ((pIn - ps) / z1 - (ps - pOut) / z2) * 86400 * 1000; // g/(m²·day)
  const sim = simulate(layers, flat(-10, 80, 20, 50), { years: 1 });
  const row = sim.rows[0];
  near(row.interfaces[1].t, tIf, 1e-9);
  near(row.interfaces[1].p, ps, 1e-9);
  near(row.rates[1], expected, 1e-9);
  near(expected, 7.52, 0.01, "about 7.5 g/m²/day");
  // never dries in a climate that is cold all year: 365 days of the same rate
  near(sim.peak[1], expected * 365, 1e-6);
});

test("a polyethylene retarder on the warm side stops the sample wall's condensation", () => {
  const a = analyze({ layers: "1/2 in gypsum board, 0.45, 50\n6 mil polyethylene, 0, 0.06\nR-21 fiberglass batt, 21, 20\n7/16 in OSB, 0.62, 1.5\nPolymer housewrap, 0, 50" });
  assert.equal(a.worst, null);
  assert.equal(a.findings[0].title, "No interstitial condensation in any month");
  assert.equal(a.start, null);
});

test("the sample wall wets the OSB in winter and dries by June; 1 in XPS cuts the peak", () => {
  const a = analyze(sampleInput());
  assert.equal(a.worst.label, "R-21 fiberglass batt | 7/16 in OSB");
  assert.equal(a.start, "Nov");
  assert.equal(a.worst.peakMonth, "Mar");
  assert.equal(a.accumulates, false);
  assert.equal(a.worst.endOfYear, 0);
  const b = analyze(sampleWithFoam());
  assert.equal(b.worst.label, "R-21 fiberglass batt | 7/16 in OSB");
  assert.ok(b.worst.peak < a.worst.peak / 2, `${b.worst.peak} vs ${a.worst.peak}`);
  assert.ok(b.worst.wetMonths < a.worst.wetMonths);
  assert.ok(b.safeIndoorRh > a.safeIndoorRh);
});

test("moisture is conserved month by month: change equals rate times days, never below zero", () => {
  const a = analyze(sampleInput());
  const i = a.worst.index;
  let prev = a.rows[a.rows.length - 1].moisture[i]; // year wraps: end of the last row is the start of the first
  for (const r of a.rows) {
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][r.month];
    const rate = r.rates[i] ?? 0;
    near(r.moisture[i], Math.max(0, prev + rate * days), 1e-6, r.name);
    assert.ok(r.moisture[i] >= 0);
    prev = r.moisture[i];
  }
});

test("a wall that cannot dry outward or inward accumulates year on year", () => {
  // foil-faced polyiso outside a vapour-open interior, in a subarctic climate whose summer is too cool to dry it
  const climate = ["0,80,70,45", "5,80,70,45", "15,78,70,45", "28,75,70,45", "38,72,70,45", "46,72,70,45", "52,74,70,45", "50,75,70,45", "42,76,70,45", "30,78,70,45", "15,80,70,45", "5,80,70,45"].join("\n");
  const a = analyze({ climate, layers: "gypsum, 0.45, 50\npaint, 0, 10\nbatt, 13, 30\nfoil polyiso, 6, 0.03\nsiding, 0, 1000" });
  assert.ok(a.worst);
  assert.equal(a.accumulates, true);
  near(a.worst.endOfYear, 2 * a.worst.endOfFirstYear, 1e-6, "the same net gain each year");
  assert.equal(a.findings[0].severity, "high");
});

test("the safe indoor RH is the boundary: just below it the wall stays dry, just above it wets", () => {
  const { layers } = parseLayers(sampleInput().layers);
  const { months } = parseClimate(sampleInput().climate, "F");
  const rh = safeIndoorRh(layers, months);
  near(rh, 17, 1);
  const wet = (x) => simulate(layers, months.map((m) => ({ ...m, rhIn: x })), { years: 1 }).peak.some((g) => g > 1e-6);
  assert.equal(wet(rh - 0.5), false);
  assert.equal(wet(rh + 0.5), true);
});

test("input errors are reported, not thrown", () => {
  assert.match(analyze({ climate: "Jan, 20, 75, 70, 35" }).error, /12 months/);
  assert.match(analyze({ layers: "only one, 1, 1" }).error, /at least two layers/);
  assert.match(analyze({ layers: "a, x, 1\nb, 1, 1" }).error, /not a number/);
  assert.match(analyze({ layers: "a, 1, 0\nb, 1, 1" }).error, /outside/);
  assert.match(analyze({ climate: sampleInput().climate.replace("Jan, 20, 75", "Jan, 20, 175") }).error, /outdoor RH/);
});

test("Celsius input gives the same answer as Fahrenheit", () => {
  const toC = (f) => (((f - 32) * 5) / 9).toFixed(6);
  const climate = sampleInput().climate.split("\n").map((l) => { const [m, a, b, c, d] = l.split(", "); return [m, toC(+a), b, toC(+c), d].join(", "); }).join("\n");
  const f = analyze(sampleInput());
  const c = analyze({ climate, tempUnit: "C" });
  near(c.worst.peak, f.worst.peak, 1e-3);
});

test("CSV has a row per month and interface; the library has sane values", () => {
  const a = analyze(sampleInput());
  const csv = reportCsv(a).trim().split("\n");
  assert.equal(csv.length, 1 + 12 * (a.layers.length + 1));
  assert.match(csv[0], /^month,interface,/);
  for (const [k, v] of Object.entries(LIBRARY)) {
    assert.ok(v.r >= 0 && v.r <= 30 && v.perm > 0, k);
    assert.ok(v.name.length > 3, k);
  }
});

test("a month written as a number is a month, not the outdoor temperature (red team 2026-11-11)", () => {
  const named = analyze(sampleInput());
  const numbered = sampleInput().climate.split("\n").map((l, i) => l.replace(/^\w+/, String(i + 1))).join("\n");
  const a = analyze({ climate: numbered });
  assert.equal(a.error, undefined);
  near(a.worst.peak, named.worst.peak, 1e-9);
  // no month column at all still works
  const bare = sampleInput().climate.split("\n").map((l) => l.replace(/^\w+, /, "")).join("\n");
  near(analyze({ climate: bare }).worst.peak, named.worst.peak, 1e-9);
  // single spaces between values (a paste from a table) parse the same
  const spaced = sampleInput().climate.replace(/,/g, "");
  near(analyze({ climate: spaced }).worst.peak, named.worst.peak, 1e-9);
  assert.match(analyze({ climate: numbered.replace(/^1,/, "13,") }).error, /month/);
  assert.match(analyze({ climate: sampleInput().climate.replace("Jan, 20, 75, 70, 35", "Jan, 20, 75, 70, 35, 9") }).error, /too many/);
});

test("months named out of order are refused, not relabelled", () => {
  const lines = sampleInput().climate.split("\n");
  const rotated = [...lines.slice(6), ...lines.slice(0, 6)].join("\n");
  assert.match(analyze({ climate: rotated }).error, /January first/);
  assert.equal(analyze({ climate: sampleInput().climate.replace(/^Jan/, "January") }).error, undefined);
});

test("indoor temperature limits are inclusive at both ends in both units", () => {
  const set = (v) => sampleInput().climate.replace("Jan, 20, 75, 70, 35", `Jan, 20, 75, ${v}, 35`);
  for (const v of [40, 100]) assert.equal(analyze({ climate: set(v) }).error, undefined, `${v} F`);
  for (const v of [39.9, 100.1]) assert.match(analyze({ climate: set(v) }).error, /indoor temperature/, `${v} F`);
  const c = (v) => parseClimate(Array.from({ length: 12 }, () => `0, 80, ${v}, 40`).join("\n"), "C").errors;
  for (const v of [4, 38]) assert.deepEqual(c(v), [], `${v} C`);
  for (const v of [3.9, 38.1]) assert.equal(c(v).length, 12, `${v} C`);
});

test("a dry interface has no peak month", () => {
  const a = analyze(sampleInput());
  const dry = a.interfaces.filter((f) => f.peak === 0);
  assert.ok(dry.length > 0);
  for (const f of dry) { assert.equal(f.peakMonth, null, f.label); assert.equal(f.wetMonths, 0, f.label); }
});

test("each row's change is the month's moisture difference in g/m²", () => {
  const a = analyze(sampleInput());
  const i = a.worst.index;
  let prev = a.rows[a.rows.length - 1].moisture[i];
  for (const r of a.rows) {
    if (i in r.change) near(r.change[i], r.moisture[i] - prev, 1e-6, r.name);
    prev = r.moisture[i];
  }
});

test("the sample wall uses the library's own values, paint on the room side of the gypsum", () => {
  const rows = sampleInput().layers.split("\n").map((l) => l.split(", "));
  for (const [name, r, perm] of rows) {
    const lib = Object.values(LIBRARY).find((l) => l.name === name || l.name.startsWith(`${name}, `));
    assert.ok(lib, name);
    assert.equal(Number(r), lib.r, `${name} R`);
    assert.equal(Number(perm), lib.perm, `${name} perm`);
  }
  assert.equal(rows[0][0], "Latex primer and paint", "inside first: the paint is the room-side face");
});
