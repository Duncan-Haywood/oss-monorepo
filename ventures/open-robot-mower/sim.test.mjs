import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LAWNS, plan, settings, coverageOf, schedule, powerSpec, budget, runtimeH, lawnArea, offsetRing, capsuleRow } from "./sim.mjs";

const ref = JSON.parse(readFileSync(new URL("./fixtures/reference.json", import.meta.url), "utf8"));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

for (const c of ref.plans) {
  test(`plan matches the Python reference: ${c.lawn} at ${c.angle ?? "best"} deg`, () => {
    const lawn = LAWNS[c.lawn];
    const s = settings({ perimeterPasses: c.perimeter_passes ?? 2, overlap: c.overlap ?? 0.03 });
    const p = plan(lawn, s, c.angle);
    assert.equal(p.angleDeg, c.angle_deg);
    assert.equal(p.stripes, c.stripes);
    assert.equal(p.path.length, c.points);
    c.head.forEach((q, i) => { close(p.path[i][0], q[0], 1e-9, "x"); close(p.path[i][1], q[1], 1e-9, "y"); });
    close(p.length, c.length, 1e-6, "length");
    close(p.turning, c.turning, 1e-6, "turning");
    close(p.timeS, c.time_s, 1e-6, "time");
    close(lawnArea(lawn), c.lawn_area, 1e-9, "area");
    const cov = coverageOf(lawn, p.path, s.cutWidth);
    close(cov.fraction, c.coverage, 1e-4, "coverage");
    close(cov.missedArea, c.missed_area, 0.01, "missed");
    const sch = schedule(lawn, p, powerSpec({ batteryWh: 25 }));
    assert.equal(sch.sessions.length, c.sessions.length);
    sch.sessions.forEach((x, i) => {
      close(x.mowS, c.sessions[i][0], 1e-6, "mow s");
      close(x.returnM, c.sessions[i][2], 1e-6, "return m");
      close(x.chargeS, c.sessions[i][3], 1e-6, "charge s");
    });
    close(sch.totalS, c.schedule_total_s, 1e-6, "schedule total");
  });
}

test("power budget matches the Python reference", () => {
  const b = budget(powerSpec(), 0.35, 0.232, 5);
  close(b.driveW, ref.budget_5deg[0], 1e-9, "drive");
  close(b.bladeW, ref.budget_5deg[1], 1e-9, "blade");
  close(runtimeH(powerSpec(), 0.35, 0.232), ref.runtime_h, 1e-9, "runtime");
});

test("an offset that pinches the lawn shut is refused", () => {
  assert.equal(offsetRing([[0, 0], [10, 0], [10, 0.3], [0, 0.3]], 0.2), null);
  assert.ok(offsetRing([[0, 0], [10, 0], [10, 3], [0, 3]], 0.2));
});

test("capsule rows: inside, at the ends, and outside", () => {
  assert.deepEqual(capsuleRow([0, 0], [10, 0], 1, 0).map((v) => Math.round(v * 1e9) / 1e9), [-1, 11]);
  assert.equal(capsuleRow([0, 0], [10, 0], 1, 1.5), null);
  const [lo, hi] = capsuleRow([0, 0], [0, 10], 1, 5);
  close(lo, -1, 1e-12, "lo"); close(hi, 1, 1e-12, "hi");
});

test("every plan stays out of the flowerbeds", () => {
  const p = plan(LAWNS.backyard, settings(), 30);
  const cov = coverageOf(LAWNS.backyard, p.path, 0.232);
  assert.ok(cov.intrusionArea < 0.05, `blade over a bed: ${cov.intrusionArea} m2`);
  assert.ok(cov.fraction > 0.995);
});
