// Drill builder logic for the page: the browser side of `tennisbots run drill.json`.
//
// planDrill mirrors host.plan_drill (src/tennisbots/host.py): every shot aimed with the
// same flight model (sim.mjs), the head's range (-15..45 deg up, -30..30 deg across, which
// the firmware clamps to) and the wheel window MIN_WHEEL_RPM..MAX_WHEEL_RPM. Where
// plan_drill stops at the first bad shot, this reports every shot, so a coach can fix
// them all at once.
//
// shotGap estimates how soon after one ball leaves the machine can feed the next: the
// shuttle's back stroke, the head turning and tilting, the wheels ramping to the next
// shot's speeds (the firmware's power-capped ramp, controller.py WheelRamp) and the
// runner's hold for a slow wheel's launch check. The drill runner never feeds early;
// an interval shorter than this estimate just runs late. Not modelled: the board's
// 6-revolution steady gate before a stroke and any calibration-drill survey wait.
// drill.test.mjs checks the constants against firmware/esp32/config.py and host.py.
//
// Plain JavaScript, imports only sim.mjs, no network.

import { aim, defaultOrigin, wheelRpm, RPM } from "./sim.mjs";

export const LIMITS = {
  elevDeg: [-15, 45],          // controller.py SET_AIM clamp, -1500..4500 cdeg
  azDeg: [-30, 30],            // -3000..3000 cdeg
  minRpm: 500,                 // host.py MIN_WHEEL_RPM
  maxRpm: 7000,                // host.py MAX_WHEEL_RPM
  defaultInterval: 3.0,        // host.py plan_drill: spec.get("interval", 3.0)
};

export const TIMING = {
  feedS: 0.9,                  // config.py GATE_OUT_MS: FEED to the ball leaving
  shuttleBackS: 0.85,          // config.py GATE_BACK_MS: the shuttle back under the column
  freshS: 0.25,                // host.py FRESH_S: a telemetry frame after the commands
  holdRpm: 3000,               // host.py HOLD_RPM
  verdictS: 0.5,               // host.py VERDICT_S
  holdMaxS: 1.45,              // host.py HOLD_MAX_S
  loopAfterRevs: 8,            // host.py LOOP_AFTER_REVS
  ballLeadS: 0.14,             // host.py BALL_LEAD_S
  wheelTauS: 0.4,              // a wheel's lag behind its ramped target (tests/feeder_sim.py WHEEL_TAU_S; assumed)
  steadyTol: 0.03,             // the board's verdict: wheels within 3% ...
  steadyS: 0.15,               // ... for 150 ms (host.py _wheels_ok)
  gateRevs: 6,                 // controller.py GATE_HOLD_REVS: revolutions held steady before a stroke
  azVmaxDegS: 60,              // config.py AZ_VMAX_DEG_S
  azAccelDegS2: 120,           // config.py AZ_ACCEL_DEG_S2
  elevExtMmS: 18,              // config.py ELEV_SPEED_EXT_MM_S (nose down)
  elevRetMmS: 22,              // config.py ELEV_SPEED_RET_MM_S (nose up)
  elevKp: 0.08,                // controller.py ElevationDrive pot loop: duty = kp x error (mm), at most 1 ...
  elevMinDuty: 0.35,           // ... at least min_duty ...
  elevDeadbandMm: 0.5,         // ... until the error is inside the deadband
  rampRpmS: 1500,              // config.py WHEEL_RAMP_MAX_RPM_S
  spinupW: 100,                // config.py WHEEL_SPINUP_W
  wheelInertia: 0.00155,       // config.py WHEEL_INERTIA_KGM2
};

export const LATE_MARGIN_S = 0.3;

/** Seconds for the firmware's wheel ramp to move a wheel from rpm a to rpm b (either way). */
export function rampSeconds(a, b, T = TIMING) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (hi <= lo) return 0;
  // Below the knee the target moves at rampRpmS; above it at constant shaft power,
  // where rpm^2 changes by 2k per second, k = P / I * (60 / 2 pi)^2 (controller.py WheelRamp).
  const k = (T.spinupW / T.wheelInertia) * (60 / (2 * Math.PI)) ** 2;
  const knee = k / T.rampRpmS;             // rpm where 1500 rpm/s would need more than P
  let t = 0;
  const linTop = Math.min(hi, knee);
  if (lo < linTop) t += (linTop - lo) / T.rampRpmS;
  const powLo = Math.max(lo, knee);
  if (hi > powLo) t += (hi * hi - powLo * powLo) / (2 * k);
  return t;
}

/** Seconds for a wheel to reach the board's steady verdict on a new speed: the ramp, the wheel catching
 * up with it (a first-order lag of wheelTauS behind the ramped target), then steadyS held in the band. */
export function wheelSeconds(a, b, T = TIMING) {
  if (Math.abs(b - a) < 1e-9) return 0;
  const ramp = rampSeconds(a, b, T);
  const rate = Math.abs(b - a) / Math.max(ramp, 1e-9);           // mean ramp rate, rpm/s
  const lag = rate * T.wheelTauS * (1 - Math.exp(-ramp / T.wheelTauS));
  const band = T.steadyTol * b;
  const settle = lag > band ? T.wheelTauS * Math.log(lag / band) : 0;
  return ramp + settle + T.steadyS;
}

/** Seconds from FEED to the ball leaving: the steady gate's revolutions of the slower turning wheel, then the stroke. */
export function feedSeconds(shot, T = TIMING) {
  const turning = [shot.rpmTop, shot.rpmBottom].filter((r) => r > 0);
  return (turning.length ? (T.gateRevs * 60) / Math.min(...turning) : 0) + T.feedS;
}

/** Elevation actuator length (mm, anchor hole to pin hole) at a head elevation: controller.py
 * ElevationGeometry with the shipped pin and anchor (371 mm at -15 deg, 248 mm at +45). */
export function elevLength(deg) {
  const t = (deg * Math.PI) / 180, pinX = -175, pinZ = 60 + 200, ax = -100, az = -75;
  const px = pinX * Math.cos(t) - pinZ * Math.sin(t), pz = pinX * Math.sin(t) + pinZ * Math.cos(t);
  return Math.hypot(px - ax, pz - az);
}

/** Seconds to tilt the head from one elevation to another: the actuator's travel under the firmware's pot
 * loop, full speed while the error is over 1/kp mm, slowing in proportion below it, then at min_duty. */
export function tiltSeconds(from, to, T = TIMING) {
  const d = elevLength(to) - elevLength(from);   // > 0: extending, nose down
  const v = d > 0 ? T.elevExtMmS : T.elevRetMmS;
  let err = Math.abs(d), t = 0;
  if (err <= T.elevDeadbandMm) return 0;
  const full = 1 / T.elevKp, floor = T.elevMinDuty / T.elevKp;
  if (err > full) { t += (err - full) / v; err = full; }
  if (err > floor) { t += Math.log(err / floor) / (T.elevKp * v); err = floor; }
  return t + (err - T.elevDeadbandMm) / (T.elevMinDuty * v);
}

/** Seconds to turn the head by d degrees: trapezoidal, or triangular when short. */
export function azSeconds(d, T = TIMING) {
  d = Math.abs(d);
  const v = T.azVmaxDegS, a = T.azAccelDegS2;
  const dAccel = (v * v) / a;               // degrees spent speeding up and slowing down
  return d <= dAccel ? 2 * Math.sqrt(d / a) : d / v + v / a;
}

/** Seconds after `prev`'s release before the runner changes the wheels (host.py hold_s): a wheel under
 * HOLD_RPM keeps its speed until the board has judged that ball's launch. */
export function holdSeconds(prev, T = TIMING) {
  const turning = [prev.rpmTop, prev.rpmBottom].filter((r) => r > 0);
  if (!turning.some((r) => r < T.holdRpm)) return 0;
  const w = Math.min(...turning);
  const revs = ((T.loopAfterRevs + 2) * 60) / w - T.ballLeadS;
  return Math.max(T.verdictS, Math.min(revs, T.holdMaxS) + T.freshS);
}

/**
 * How soon after `prev` leaves the machine it can feed `next` (host.py run_drill): it may hold the wheels
 * for the last ball's launch check, then re-aims and changes the wheels at once, and feeds when the aim has
 * settled, the wheels are at speed, the shuttle is back and the interval has passed. `ready` is that time
 * from release; the next ball leaves feedS later (the shuttle's forward stroke).
 */
export function shotGap(prev, next, T = TIMING) {
  const hold = holdSeconds(prev, T);
  const parts = {
    shuttle: T.shuttleBackS,
    turn: hold + azSeconds(next.azimuthDeg - prev.azimuthDeg, T),
    tilt: hold + tiltSeconds(prev.elevationDeg, next.elevationDeg, T),
    wheels: hold + Math.max(wheelSeconds(prev.rpmTop, next.rpmTop, T), wheelSeconds(prev.rpmBottom, next.rpmBottom, T)),
    telemetry: hold + T.freshS,
  };
  let by = "shuttle";
  for (const k of Object.keys(parts)) if (parts[k] > parts[by]) by = k;
  return { seconds: parts[by], by, hold, parts };
}

const num = (v, name, i) => {
  const n = Number(v);
  if (v === undefined || v === null || v === "" || !Number.isFinite(n)) throw new Error(`shot ${i}: "${name}" must be a number`);
  return n;
};

/** Read a drill file (an object or JSON text) into a normalised spec; throws on a malformed file. */
export function parseDrill(input) {
  const spec = typeof input === "string" ? JSON.parse(input) : input;
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.shots)) throw new Error('a drill file needs a "shots" list');
  if (spec.shots.length > 200) throw new Error("at most 200 shots in one drill");
  const m = spec.machine || {};
  const out = {
    machine: { y: Number(m.y ?? 0), height: Number(m.height ?? 1) },
    interval: Number(spec.interval ?? LIMITS.defaultInterval),
    shots: spec.shots.map((s, i) => {
      const shot = { x: num(s.x, "x", i), y: num(s.y, "y", i), speed: num(s.speed, "speed", i), topspin: Number(s.topspin ?? 0) };
      if (s.sidespin !== undefined) shot.sidespin = Number(s.sidespin);
      if (s.interval !== undefined) shot.interval = num(s.interval, "interval", i);
      return shot;
    }),
  };
  if (spec.launcher && typeof spec.launcher === "object") out.launcher = { ...spec.launcher };
  for (const [k, v] of [["machine.y", out.machine.y], ["machine.height", out.machine.height], ["interval", out.interval]]) {
    if (!Number.isFinite(v)) throw new Error(`"${k}" must be a number`);
  }
  return out;
}

/** The drill file the machine runs (tennisbots run / tennisbots drill), as tidy JSON. */
export function drillJson(spec) {
  const r = (v) => Math.round(v * 100) / 100;
  const out = { machine: { y: r(spec.machine.y), height: r(spec.machine.height) }, interval: r(spec.interval) };
  if (spec.launcher) out.launcher = spec.launcher;
  out.shots = spec.shots.map((s) => {
    const o = { x: r(s.x), y: r(s.y), speed: r(s.speed), topspin: Math.round(s.topspin) };
    if (s.sidespin) o.sidespin = Math.round(s.sidespin);
    if (s.interval !== undefined && s.interval !== spec.interval) o.interval = r(s.interval);
    return o;
  });
  const lines = out.shots.map((s) => "    " + JSON.stringify(s).replace(/":/g, '": ').replace(/,"/g, ', "'));
  const head = JSON.stringify({ machine: out.machine, interval: out.interval, ...(out.launcher ? { launcher: out.launcher } : {}) }, null, 2);
  return head.replace(/\n}$/, `,\n  "shots": [\n${lines.join(",\n")}\n  ]\n}\n`);
}

/**
 * Every shot as machine settings and every problem, without stopping at the first.
 * Each entry: { index, ok, error?, elevationDeg, azimuthDeg, rpmTop, rpmBottom, landing,
 * netClearance, flightTime, flight, interval, gap? } where gap (from the second ready
 * shot on) is shotGap from the previous ready shot and `late` says the interval is
 * more than LATE_MARGIN_S shorter than it.
 */
export function planDrill(spec) {
  const origin = defaultOrigin(spec.machine.y, spec.machine.height);
  const L = spec.launcher || {};
  const wheels = {
    wheelRadius: L.wheel_radius ?? 0.075,
    speedEfficiency: L.speed_efficiency ?? 0.85,
    spinEfficiency: L.spin_efficiency ?? 0.5,
    maxRpm: Infinity,                       // the window below says which limit, as host.py does
  };
  const out = [];
  let prev = null;
  spec.shots.forEach((s, i) => {
    const interval = s.interval ?? spec.interval;
    const row = { index: i, ok: false, interval, shot: s };
    try {
      const a = aim(origin, [s.x, s.y], s.speed, s.topspin || 0, s.sidespin || 0);
      Object.assign(row, { elevationDeg: a.elevationDeg, azimuthDeg: a.azimuthDeg, landing: a.landing,
        netClearance: a.netClearance, flightTime: a.flightTime, flight: a.flight });
      const w = wheelRpm(s.speed, (s.topspin || 0) * RPM, wheels);
      row.rpmTop = w.top; row.rpmBottom = w.bottom;
      const elev = Math.round(a.elevationDeg * 100) / 100, az = Math.round(a.azimuthDeg * 100) / 100;
      if (elev < LIMITS.elevDeg[0] || elev > LIMITS.elevDeg[1] || az < LIMITS.azDeg[0] || az > LIMITS.azDeg[1]) {
        throw new Error(`aim ${elev.toFixed(1)} deg up, ${az.toFixed(1)} deg across is outside the head's range ` +
          `(-15..45 up, -30..30 across); move the machine across or the target`);
      }
      if (Math.max(w.top, w.bottom) > LIMITS.maxRpm || Math.min(w.top, w.bottom) < LIMITS.minRpm) {
        throw new Error(`wheels ${Math.round(w.top)}/${Math.round(w.bottom)} rpm are outside ${LIMITS.minRpm}..${LIMITS.maxRpm} rpm; ` +
          (Math.min(w.top, w.bottom) < LIMITS.minRpm ? "less spin, or more speed" : "less speed or spin"));
      }
      row.ok = true;
      if (prev) {
        row.gap = shotGap(prev, row);
        // Flag only a clear shortfall: on the simulated feeder the estimate ran 0.2 s long on average
        // (eval/drill-gap-check-2026-11-18.txt), so a pause within LATE_MARGIN_S of it is left alone.
        row.late = interval < row.gap.seconds - LATE_MARGIN_S;
      } else {
        // First ball: both wheels spin up from rest before it goes.
        row.spinupS = Math.max(wheelSeconds(0, w.top), wheelSeconds(0, w.bottom));
      }
      prev = row;
    } catch (e) {
      row.error = e.message;
    }
    out.push(row);
  });
  return out;
}

/** Totals for a planned drill: ball count, problems, running time. */
export function drillSummary(planned) {
  const ok = planned.filter((p) => p.ok);
  // First ball: spin-up, then its stroke; each later one: the longer of the interval and the
  // machine's ready time, then its stroke.
  let seconds = ok.length ? (ok[0].spinupS || 0) + feedSeconds(ok[0]) : 0;
  for (const p of ok.slice(1)) seconds += Math.max(p.interval, p.gap.seconds) + feedSeconds(p);
  return {
    balls: planned.length,
    bad: planned.length - ok.length,
    late: ok.filter((p) => p.late).length,
    seconds,
  };
}

/** Compact share-link form: base64url of the drill JSON (no server involved). */
export function encodeDrill(spec) {
  const json = JSON.stringify(JSON.parse(drillJson(spec)));
  const b = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeDrill(code) {
  const b = code.replace(/-/g, "+").replace(/_/g, "/");
  const json = typeof atob === "function" ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, "base64").toString("utf8");
  return parseDrill(json);
}

// Ready-made drills. The first two are the repository's drill.example.json and
// drill.rally.json (drill.test.mjs keeps them equal).
export const PRESETS = {
  example: {
    label: "Four balls: corners, a short slice, a deep one",
    spec: { machine: { y: 0, height: 1 }, interval: 3, shots: [
      { x: 9.5, y: -2.5, speed: 22, topspin: 1500 }, { x: 9.5, y: 2.5, speed: 22, topspin: 1500 },
      { x: 7.0, y: 0.0, speed: 18, topspin: -600 }, { x: 10.5, y: -3.5, speed: 25, topspin: 2000 }] },
  },
  rally: {
    label: "Sixteen-ball rally, side to side",
    spec: { machine: { y: 0, height: 1 }, interval: 3, shots: [
      { x: 9.5, y: -2.5, speed: 22, topspin: 1500 }, { x: 9.5, y: 2.5, speed: 22, topspin: 1500 },
      { x: 8.5, y: -3.0, speed: 21, topspin: 1800 }, { x: 8.5, y: 3.0, speed: 21, topspin: 1800 },
      { x: 10.0, y: 0.0, speed: 24, topspin: 1200 }, { x: 7.0, y: -1.5, speed: 18, topspin: -600 },
      { x: 9.5, y: -2.5, speed: 22, topspin: 1500 }, { x: 9.5, y: 2.5, speed: 22, topspin: 1500 },
      { x: 8.5, y: -3.0, speed: 21, topspin: 1800 }, { x: 8.5, y: 3.0, speed: 21, topspin: 1800 },
      { x: 10.0, y: 0.0, speed: 24, topspin: 1200 }, { x: 7.0, y: 1.5, speed: 18, topspin: -600 },
      { x: 9.5, y: -2.5, speed: 22, topspin: 1500 }, { x: 9.5, y: 2.5, speed: 22, topspin: 1500 },
      { x: 10.5, y: -3.0, speed: 25, topspin: 2000 }, { x: 10.5, y: 3.0, speed: 25, topspin: 2000 }] },
  },
  forehand: {
    label: "Forehand groove: eight to the same deep corner",
    spec: { machine: { y: 0, height: 1 }, interval: 2.5, shots: Array.from({ length: 8 }, () => ({ x: 9.5, y: -2.8, speed: 21, topspin: 1500 })) },
  },
  approach: {
    label: "Approach and volley: short slice, then two at the net",
    spec: { machine: { y: 0, height: 1 }, interval: 3, shots: [
      { x: 5.5, y: -1.0, speed: 17, topspin: -800, interval: 3 },
      { x: 3.5, y: 2.0, speed: 20, topspin: 600, interval: 2.5 },
      { x: 3.5, y: -2.0, speed: 20, topspin: 600, interval: 2.5 },
      { x: 5.5, y: 1.0, speed: 17, topspin: -800, interval: 4 },
      { x: 3.5, y: -2.0, speed: 20, topspin: 600, interval: 2.5 },
      { x: 3.5, y: 2.0, speed: 20, topspin: 600, interval: 2.5 }] },
  },
  moonball: {
    label: "High, heavy balls: deep topspin launched about 30 degrees up",
    spec: { machine: { y: 0, height: 1 }, interval: 3.5, shots: [
      { x: 10.0, y: 0.0, speed: 19, topspin: 1500 }, { x: 9.5, y: -2.5, speed: 19, topspin: 1500 },
      { x: 9.5, y: 2.5, speed: 19, topspin: 1500 }, { x: 10.0, y: 0.0, speed: 19, topspin: 800 }] },
  },
};

/** The Pi's own drill page (`tennisbots serve`) with this drill in its fragment, or null for an address that is not
 * a plain host[:port]. Always plain http: the server runs on a home network with no certificate. */
export function piDrillUrl(address, code) {
  let a = String(address || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!a || !/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i.test(a)) return null;
  if (!/:\d+$/.test(a)) a += ":8080";
  return `http://${a}/#drill=${code}`;
}
