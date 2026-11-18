import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PRESETS, LIMITS, TIMING, parseDrill, planDrill, drillSummary, drillJson, encodeDrill, decodeDrill,
  rampSeconds, azSeconds, elevLength, tiltSeconds, holdSeconds, shotGap,
} from "./drill.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const pyConst = (src, name) => Number(src.match(new RegExp(`^${name}\\s*=\\s*([-0-9.]+)`, "m"))[1]);

test("the first two presets are the repository's drill files", () => {
  assert.deepEqual(parseDrill(PRESETS.example.spec), parseDrill(read("./drill.example.json")));
  assert.deepEqual(parseDrill(PRESETS.rally.spec), parseDrill(read("./drill.rally.json")));
});

test("every preset can be fed as written", () => {
  for (const [k, p] of Object.entries(PRESETS)) {
    const plan = planDrill(parseDrill(p.spec));
    for (const r of plan) assert.ok(r.ok, `${k} ball ${r.index}: ${r.error}`);
  }
});

test("limits and timings match the firmware and the drill runner", () => {
  const cfg = read("./firmware/esp32/config.py"), host = read("./src/tennisbots/host.py");
  assert.equal(LIMITS.minRpm, pyConst(host, "MIN_WHEEL_RPM"));
  assert.equal(LIMITS.maxRpm, pyConst(host, "MAX_WHEEL_RPM"));
  assert.equal(TIMING.freshS, pyConst(host, "FRESH_S"));
  assert.equal(TIMING.holdRpm, pyConst(host, "HOLD_RPM"));
  assert.equal(TIMING.loopAfterRevs, pyConst(host, "LOOP_AFTER_REVS"));
  assert.equal(TIMING.ballLeadS, pyConst(host, "BALL_LEAD_S"));
  assert.equal(TIMING.verdictS, 0.25 + pyConst(host, "FRESH_S"));
  assert.equal(TIMING.holdMaxS, 0.25 + 1.2);
  assert.match(host, /^HOLD_MAX_S = 0\.25 \+ 1\.2$/m);
  assert.match(host, /^VERDICT_S = 0\.25 \+ FRESH_S$/m);
  assert.equal(TIMING.feedS * 1000, pyConst(cfg, "GATE_OUT_MS"));
  assert.equal(TIMING.shuttleBackS * 1000, pyConst(cfg, "GATE_BACK_MS"));
  assert.equal(TIMING.azVmaxDegS, pyConst(cfg, "AZ_VMAX_DEG_S"));
  assert.equal(TIMING.azAccelDegS2, pyConst(cfg, "AZ_ACCEL_DEG_S2"));
  assert.equal(TIMING.rampRpmS, pyConst(cfg, "WHEEL_RAMP_MAX_RPM_S"));
  assert.equal(TIMING.spinupW, pyConst(cfg, "WHEEL_SPINUP_W"));
  assert.equal(TIMING.wheelInertia, pyConst(cfg, "WHEEL_INERTIA_KGM2"));
  assert.equal(TIMING.elevExtMmS, pyConst(cfg, "ELEV_SPEED_EXT_MM_S"));
  assert.equal(TIMING.elevRetMmS, pyConst(cfg, "ELEV_SPEED_RET_MM_S"));
  const ctl = read("./firmware/esp32/controller.py");
  assert.match(ctl, /deadband_mm=0\.5, kp=0\.08, min_duty=0\.35/);
  assert.match(ctl, /^GATE_HOLD_REVS = 6$/m);
  assert.match(ctl, /hw\.set_aim\(_clamp\(values\[0\], -1500, 4500\), _clamp\(values\[1\], -3000, 3000\)\)/);
  assert.match(ctl, /pin_x=-175\.0, pin_z=60\.0, pivot_z_rel=-200\.0, anchor_dx=-100\.0, anchor_dz=-75\.0/);
});

test("the elevation geometry matches the firmware's documented lengths", () => {
  assert.ok(Math.abs(elevLength(-15) - 371) < 1, String(elevLength(-15)));
  assert.ok(Math.abs(elevLength(45) - 248) < 1, String(elevLength(45)));
  assert.ok(elevLength(10) < elevLength(0));
  // Nose up retracts at 22 mm/s; down extends at 18 mm/s, so the same swing is slower going down.
  assert.ok(tiltSeconds(30, 10) > tiltSeconds(10, 30));
  assert.equal(tiltSeconds(20, 20), 0);
});

test("the wheel ramp matches a step-by-step run of the firmware's WheelRamp law", () => {
  const k = (TIMING.spinupW / TIMING.wheelInertia) * (60 / (2 * Math.PI)) ** 2;
  const stepped = (a, b) => {
    let r = a, t = 0;
    const dt = 0.001;
    while (Math.abs(r - b) > 1e-6 && t < 20) {
      if (b > r) r = Math.min(r + TIMING.rampRpmS * dt, Math.sqrt(r * r + 2 * k * dt), b);
      else r = Math.max(r - TIMING.rampRpmS * dt, Math.sqrt(Math.max(r * r - 2 * k * dt, 0)), b);
      t += dt;
    }
    return t;
  };
  for (const [a, b] of [[0, 2000], [0, 5000], [1500, 6500], [6000, 2000], [4000, 4500], [3000, 3000]]) {
    assert.ok(Math.abs(rampSeconds(a, b) - stepped(a, b)) < 0.005, `${a}->${b}: ${rampSeconds(a, b)} vs ${stepped(a, b)}`);
  }
});

test("turning: triangular when short, trapezoidal when long", () => {
  assert.ok(Math.abs(azSeconds(30) - 1.0) < 1e-9);         // 30 deg at 60 deg/s peak, 120 deg/s^2: exactly the triangle
  assert.ok(Math.abs(azSeconds(60) - 1.5) < 1e-9);
  assert.ok(Math.abs(azSeconds(-7.5) - 0.5) < 1e-9);
});

test("a slow wheel holds the next change until its launch check", () => {
  assert.equal(holdSeconds({ rpmTop: 4000, rpmBottom: 3500 }), 0);
  assert.equal(holdSeconds({ rpmTop: 4600, rpmBottom: 1955 }), 0.5);
  const g = shotGap({ rpmTop: 4000, rpmBottom: 4000, azimuthDeg: 0, elevationDeg: 20 },
    { rpmTop: 4000, rpmBottom: 4000, azimuthDeg: 0, elevationDeg: 20 });
  assert.equal(g.by, "shuttle");
  assert.equal(g.seconds, TIMING.shuttleBackS);
});

test("every bad ball is reported, not just the first", () => {
  const plan = planDrill(parseDrill({ machine: { y: 4 }, shots: [
    { x: 1.5, y: -4.1, speed: 14, topspin: 0 },       // across the court from a machine 4 m left: past 30 deg
    { x: 9, y: 0, speed: 22, topspin: 1200 },
    { x: 11, y: 0, speed: 8, topspin: 0 },             // out of reach
    { x: 9, y: 0, speed: 39, topspin: 3000 },          // wheels over 7000 rpm (or long)
  ] }));
  assert.match(plan[0].error, /outside the head's range/);
  assert.ok(plan[1].ok);
  assert.match(plan[2].error, /out of reach/);
  assert.ok(!plan[3].ok);
  assert.equal(drillSummary(plan).bad, 3);
});

test("a pause shorter than the machine needs is flagged", () => {
  const spec = parseDrill(PRESETS.example.spec);
  spec.interval = 0.5;
  const plan = planDrill(spec);
  assert.ok(plan.slice(1).every((r) => r.late));
  const s = drillSummary(plan);
  assert.equal(s.late, 3);
  spec.interval = 6;
  assert.equal(drillSummary(planDrill(spec)).late, 0);
  assert.ok(drillSummary(planDrill(spec)).seconds > s.seconds);
});

test("drill.json round-trips, per-ball pauses included, and so does the share link", () => {
  const spec = parseDrill(PRESETS.approach.spec);
  const text = drillJson(spec);
  const back = parseDrill(text);
  assert.deepEqual(back.shots.map((s) => s.interval ?? back.interval), spec.shots.map((s) => s.interval ?? spec.interval));
  assert.deepEqual(back.shots.map((s) => [s.x, s.y, s.speed, s.topspin]), spec.shots.map((s) => [s.x, s.y, s.speed, s.topspin]));
  const code = encodeDrill(spec);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeDrill(code), back);
});

test("malformed files are refused with a reason", () => {
  assert.throws(() => parseDrill("{}"), /shots/);
  assert.throws(() => parseDrill({ shots: [{ x: 1, y: 2 }] }), /speed/);
  assert.throws(() => parseDrill({ shots: [{ x: "a", y: 2, speed: 20 }] }), /"x"/);
  assert.throws(() => parseDrill({ shots: Array.from({ length: 201 }, () => ({ x: 9, y: 0, speed: 20 })) }), /200/);
  assert.throws(() => parseDrill("not json"));
});

test("piDrillUrl opens the Pi's own page with the drill in the fragment", async () => {
  const { piDrillUrl, encodeDrill, decodeDrill, PRESETS } = await import("./drill.mjs");
  const spec = PRESETS[Object.keys(PRESETS)[0]].spec;
  const code = encodeDrill(spec);
  assert.equal(piDrillUrl("raspberrypi.local", code), `http://raspberrypi.local:8080/#drill=${code}`);
  assert.equal(piDrillUrl(" http://192.168.1.20:9000/whatever ", code), `http://192.168.1.20:9000/#drill=${code}`);
  assert.equal(piDrillUrl("[fe80::1]:8080", "x"), "http://[fe80::1]:8080/#drill=x");
  for (const bad of ["", "   ", "evil.com\" onclick=", "a b", "javascript:alert(1)"]) assert.equal(piDrillUrl(bad, code), null, bad);
  assert.deepEqual(decodeDrill(piDrillUrl("pi.local", code).split("#drill=")[1]), decodeDrill(code));
});
