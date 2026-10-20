import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aim, defaultOrigin, wheelRpm, simulate, launchVelocity, spinVector, RPM, collectRoute, bounce } from "./sim.mjs";

const ref = JSON.parse(readFileSync(new URL("./fixtures/reference.json", import.meta.url), "utf8"));

test("aiming matches the Python reference", () => {
  for (const c of ref.aim) {
    const s = aim(defaultOrigin(c.machine_y), c.target, c.speed, c.topspin);
    assert.ok(Math.abs(s.elevationDeg - c.elevation_deg) < 0.01, `elevation ${s.elevationDeg} vs ${c.elevation_deg}`);
    assert.ok(Math.abs(s.azimuthDeg - c.azimuth_deg) < 0.01, `azimuth ${s.azimuthDeg} vs ${c.azimuth_deg}`);
    assert.ok(Math.abs(s.flightTime - c.flight_time) < 0.005);
    assert.ok(Math.abs(s.landing[0] - c.target[0]) < 0.02);
    const w = wheelRpm(c.speed, c.topspin * RPM);
    assert.ok(Math.abs(w.top - c.rpm_top) < 1e-6 && Math.abs(w.bottom - c.rpm_bottom) < 1e-6);
  }
});

test("a flight with a bounce matches the Python reference", () => {
  const v = launchVelocity(20, (12 * Math.PI) / 180, 0);
  const f = simulate([-12.4, 0, 1], v, spinVector(v, 1500 * RPM), { maxBounces: 1, net: false });
  const b = f.bounces[0].pos;
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(b[i] - ref.flight.bounce[i]) < 1e-6);
  const end = f.points.at(-1).pos;
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(end[i] - ref.flight.end[i]) < 1e-6);
});

test("unreachable targets and wheel limits are reported, not hidden", () => {
  assert.throws(() => aim(defaultOrigin(), [11, 0], 8));
  assert.match(wheelRpm(60, 0).error, /rpm limit/);
  assert.match(wheelRpm(5, 5000 * RPM).error, /backwards/);
});

test("topspin kicks forward on the bounce", () => {
  const v = [20, 0, -6];
  const [flat] = bounce(v, [0, 0, 0]);
  const [kick] = bounce(v, spinVector(v, 4000 * RPM));
  assert.ok(kick[0] > flat[0]);
});

test("collector route visits every ball and 2-opt removes crossings", () => {
  const balls = [];
  for (let x = 0; x < 5; x++) for (const y of [0, 3]) balls.push([x, y]);
  const r = collectRoute([0, -1], balls);
  assert.equal(r.order.length, 10);
  assert.ok(r.length <= 4 + 3 + 4 + 1 + 1e-6);
});
