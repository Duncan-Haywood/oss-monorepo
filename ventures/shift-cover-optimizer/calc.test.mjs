import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDemand, parseTime, fmtTime, solveSegment, optimize, scheduleCsv, sampleText } from "./calc.mjs";

// Deterministic PRNG so the brute-force comparison is reproducible.
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function brute(req, lMin, lMax, cost) {
  const T = req.length, ivs = [];
  for (let a = 0; a < T; a++) for (let L = lMin; L <= lMax && a + L <= T; L++) ivs.push([a, a + L]);
  const cap = Math.max(...req);
  let best = Infinity;
  const cov = new Array(T).fill(0);
  (function go(i, c) {
    if (c >= best) return;
    if (i === ivs.length) { if (cov.every((v, t) => v >= req[t])) best = c; return; }
    for (let n = 0; n <= cap; n++) {
      for (let t = ivs[i][0]; t < ivs[i][1]; t++) cov[t] += n;
      go(i + 1, c + n * cost(ivs[i][1] - ivs[i][0]));
      for (let t = ivs[i][0]; t < ivs[i][1]; t++) cov[t] -= n;
    }
  })(0, 0);
  return best;
}

const covered = (shifts, req) => req.every((r, t) => shifts.filter(([a, z]) => a <= t && t < z).length >= r);
const total = (shifts, cost) => shifts.reduce((s, [a, z]) => s + cost(z - a), 0);

test("time parsing", () => {
  assert.equal(parseTime("9"), 540); assert.equal(parseTime("9:30"), 570); assert.equal(parseTime("5pm"), 1020);
  assert.equal(parseTime("12am"), 0); assert.equal(parseTime("12:30 PM"), 750); assert.equal(parseTime("24"), null); assert.equal(parseTime("abc"), null);
  assert.equal(fmtTime(570), "9:30am"); assert.equal(fmtTime(1020), "5pm"); assert.equal(fmtTime(0), "12am");
});

test("solver is exactly optimal against brute force on random small problems", () => {
  const rand = rng(7);
  for (let k = 0; k < 40; k++) {
    const T = 3 + Math.floor(rand() * 3);
    const req = Array.from({ length: T }, () => Math.floor(rand() * 3));
    if (req.every((r) => r === 0)) req[0] = 1;
    const lMin = 1 + Math.floor(rand() * 3), lMax = lMin + Math.floor(rand() * 3);
    const fixed = 1.5 + rand() * 2, per = 1 + rand();
    const cost = (L) => fixed + per * L;
    const eff = (x) => Math.max(1, Math.min(x, T));
    const lo = eff(lMin), hi = Math.max(lo, eff(lMax));
    const sol = solveSegment(req, lMin, lMax, cost);
    assert.ok(covered(sol, req), JSON.stringify({ req, lMin, lMax, sol }));
    assert.ok(sol.every(([a, z]) => z - a >= lo && z - a <= hi));
    assert.ok(Math.abs(total(sol, cost) - brute(req, lo, hi, cost)) < 1e-4, JSON.stringify({ req, lMin, lMax }));
  }
});

test("a flat requirement is covered by whole shifts with no waste when lengths divide it", () => {
  const sol = solveSegment([2, 2, 2, 2, 2, 2, 2, 2], 4, 4, (L) => 10 * L);
  assert.equal(sol.length, 4);
});

test("a morning peak uses a short shift rather than a long one when short shifts are allowed", () => {
  const req = [3, 3, 1, 1, 1, 1, 1, 1];
  const sol = solveSegment(req, 2, 8, (L) => 10 * L);
  assert.equal(total(sol, (L) => 10 * L), 10 * (3 * 2 + 6));
});

test("a per-shift overhead pushes the plan toward fewer, longer shifts", () => {
  const req = [1, 2, 2, 2, 2, 1];
  const cheapSetup = solveSegment(req, 1, 6, (L) => 10 * L);
  const dearSetup = solveSegment(req, 1, 6, (L) => 10 * L + 100);
  assert.ok(dearSetup.length <= cheapSetup.length);
});

test("parseDemand reads headers, names, 12-hour times and reports skipped rows", () => {
  const p = parseDemand("day,hour,staff\nMonday,9am,2\nmon,10am,3\nTue,9,1\nTue,10,2\nbad row\n");
  assert.equal(p.unit, "staff");
  assert.deepEqual(p.dayOrder, ["Mon", "Tue"]);
  assert.equal(p.step, 60);
  assert.equal(p.rows.length, 4);
  assert.match(p.warnings.join(" "), /1 row skipped/);
  assert.equal(parseDemand("day,hour,customers\nMon,9,10").unit, "demand");
  assert.ok(parseDemand("").error);
  assert.ok(parseDemand("nothing here\nat all").error);
});

test("half-hour data is detected and solved on half-hour slots", () => {
  const p = parseDemand("Mon,9:00,1\nMon,9:30,2\nMon,10:00,2\nMon,10:30,1");
  assert.equal(p.step, 30);
  const r = optimize(p, { wage: 20, minShiftHours: 1, maxShiftHours: 2, minStaff: 0 });
  assert.ok(r.cost > 0);
  assert.equal(r.shortSlots, 0);
});

test("a full schedule never leaves an open hour short and never beats the hours floor", () => {
  const r = optimize(parseDemand(sampleText()), { wage: 16, unit: "demand", perStaff: 12, minShiftHours: 4, maxShiftHours: 8, templateHours: 8, burdenPct: 10 });
  assert.equal(r.shortSlots, 0);
  for (const d of r.days) for (const c of d.coverage) assert.ok(c.scheduled >= c.required, `${d.label} ${c.minute}`);
  assert.ok(r.workedHours >= r.requiredHours - 1e-9);
  assert.ok(r.cost >= r.requiredHours * 16 * 1.1 - 1e-6);
  assert.equal(r.weekly, true);
});

test("flexible shifts never cost more than the fixed template or everyone-at-peak", () => {
  const r = optimize(parseDemand(sampleText()), { wage: 16, unit: "demand", perStaff: 12, templateHours: 8, minShiftHours: 4, maxShiftHours: 8 });
  assert.ok(r.cost <= r.template.cost + 1e-6);
  assert.ok(r.cost <= r.flat.cost + 1e-6);
  assert.ok(r.saveTemplate >= 0 && r.saveFlat >= 0);
  assert.equal(r.saveTemplateAnnual, r.saveTemplate * 52);
});

test("a longer minimum shift never reduces cost, and the table is monotone", () => {
  const r = optimize(parseDemand(sampleText()), { wage: 16, unit: "demand", perStaff: 12, minShiftHours: 4, maxShiftHours: 8 });
  for (let i = 1; i < r.minShiftRows.length; i++) assert.ok(r.minShiftRows[i].cost >= r.minShiftRows[i - 1].cost - 1e-6);
  assert.ok(r.minShiftRows.some((x) => x.current));
});

test("more demand never costs less", () => {
  const r = optimize(parseDemand(sampleText()), { wage: 16, unit: "demand", perStaff: 12 });
  for (let i = 1; i < r.demandRows.length; i++) assert.ok(r.demandRows[i].cost >= r.demandRows[i - 1].cost - 1e-6);
  assert.equal(r.demandRows.find((x) => x.change === 0).cost, r.cost);
});

test("a closed gap splits the day so no shift spans it", () => {
  const p = parseDemand("Mon,8,2\nMon,9,2\nMon,10,2\nMon,11,2\nMon,17,2\nMon,18,2\nMon,19,2\nMon,20,2");
  const r = optimize(p, { wage: 15, minShiftHours: 2, maxShiftHours: 8, minStaff: 0 });
  for (const s of r.days[0].shifts) assert.ok(s.endMinute <= 12 * 60 || s.startMinute >= 17 * 60, `${s.startMinute}-${s.endMinute}`);
});

test("minimum paid hours and setup time are charged per shift", () => {
  const p = parseDemand("Mon,9,1\nMon,10,1\nMon,11,1\nMon,12,1");
  const plain = optimize(p, { wage: 20, minShiftHours: 1, maxShiftHours: 4, minStaff: 0 });
  const padded = optimize(p, { wage: 20, minShiftHours: 1, maxShiftHours: 4, minStaff: 0, overheadHours: 0.5, minPaidHours: 4 });
  assert.equal(plain.cost, 80);
  assert.equal(padded.cost, 20 * 4.5);
});

test("rejects bad options and unusable data plainly", () => {
  const p = parseDemand(sampleText());
  assert.match(optimize(p, { wage: 0 }).error, /wage/);
  assert.match(optimize(p, { wage: 10, minShiftHours: 6, maxShiftHours: 4 }).error, /Maximum/);
  assert.match(optimize(p, { wage: 10, unit: "demand", perStaff: 0 }).error, /demand one person/);
  assert.match(optimize(parseDemand("Mon,9,0\nMon,10,0\nMon,11,0\nMon,12,0"), { wage: 10, minStaff: 0 }).error, /Nobody/);
  assert.match(optimize(parseDemand("Mon,9,1\nMon,10,1"), { wage: 10 }).error, /four/);
  assert.ok(optimize({ error: "x" }, {}).error);
});

test("csv export lists every shift", () => {
  const r = optimize(parseDemand(sampleText()), { wage: 16, unit: "demand", perStaff: 12 });
  const lines = scheduleCsv(r).trim().split("\n");
  assert.equal(lines[0], "day,start,end,hours,paid_hours,cost");
  assert.equal(lines.length - 1, r.shifts);
});

test("deterministic: the same input gives the same schedule", () => {
  const a = optimize(parseDemand(sampleText()), { wage: 16, unit: "demand", perStaff: 12 });
  const b = optimize(parseDemand(sampleText()), { wage: 16, unit: "demand", perStaff: 12 });
  assert.equal(scheduleCsv(a), scheduleCsv(b));
});
