// Browser port of tennisbots' flight model, launcher aiming and a simple
// collector route, for the interactive page. The Python package
// (src/tennisbots) is the reference; sim.test.mjs checks this file against
// fixtures/reference.json, which `python -m tennisbots.fixtures` writes.
// Plain JavaScript, no imports, so the page works from a file:// URL.

export const COURT = {
  halfLength: 23.77 / 2,
  singlesWidth: 8.23,
  doublesWidth: 10.97,
  serviceLine: 6.4,
  netCentre: 0.914,
  netPost: 1.07,
};
COURT.netPostY = COURT.doublesWidth / 2 + 0.914;

export const BALL = {
  mass: 0.0577,
  radius: 0.0335,
  airDensity: 1.21,
  dragCoeff: 0.55,
  gravity: 9.81,
  restitution: 0.75,
  friction: 0.6,
  inertiaFactor: 0.55,
};

export const RPM = (2 * Math.PI) / 60;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.sqrt(dot(a, a));

export function netHeight(y) {
  const f = Math.min(1, Math.abs(y) / COURT.netPostY);
  return COURT.netCentre + (COURT.netPost - COURT.netCentre) * f;
}

export function spinVector(vel, topspin, sidespin = 0) {
  const h = Math.hypot(vel[0], vel[1]);
  if (h === 0) return [0, 0, sidespin];
  const hx = vel[0] / h, hy = vel[1] / h;
  return [-hy * topspin, hx * topspin, sidespin];
}

function accel(vel, spin, b) {
  const v = norm(vel);
  const g = [0, 0, -b.gravity];
  if (v === 0) return g;
  const area = Math.PI * b.radius ** 2;
  const k = (0.5 * b.airDensity * area) / b.mass;
  const out = add(g, scale(vel, -k * b.dragCoeff * v));
  const w = norm(spin);
  if (w === 0) return out;
  const wxv = cross(spin, vel);
  const m = norm(wxv);
  if (m === 0) return out;
  const cl = 1 / (2 + v / (b.radius * w));
  return add(out, scale(wxv, (k * cl * v * v) / m));
}

function rk4(pos, vel, spin, dt, b) {
  const a1 = accel(vel, spin, b);
  const v2 = add(vel, scale(a1, dt / 2));
  const a2 = accel(v2, spin, b);
  const v3 = add(vel, scale(a2, dt / 2));
  const a3 = accel(v3, spin, b);
  const v4 = add(vel, scale(a3, dt));
  const a4 = accel(v4, spin, b);
  const p = add(pos, scale(add(add(vel, scale(v2, 2)), add(scale(v3, 2), v4)), dt / 6));
  const v = add(vel, scale(add(add(a1, scale(a2, 2)), add(scale(a3, 2), a4)), dt / 6));
  return [p, v];
}

export function bounce(vel, spin, b = BALL) {
  const [vx, vy, vz] = vel;
  const vzOut = -b.restitution * vz;
  const u = Math.hypot(vx, vy);
  if (u === 0) return [[0, 0, vzOut], spin];
  const hx = vx / u, hy = vy / u;
  const axis = [-hy, hx, 0];
  const s = dot(spin, axis);
  const other = add(spin, scale(axis, -s));
  const alpha = b.inertiaFactor;
  const slip = u - b.radius * s;
  let du = -b.friction * (1 + b.restitution) * Math.abs(vz) * (slip > 0 ? 1 : -1);
  if (Math.abs(du) * (1 + 1 / alpha) >= Math.abs(slip)) du = -slip / (1 + 1 / alpha);
  const uOut = u + du;
  const sOut = s - du / (alpha * b.radius);
  return [[hx * uOut, hy * uOut, vzOut], add(other, scale(axis, sOut))];
}

/** Same stopping rules as ballistics.simulate. Returns {points, bounces, netClearance, hitNet}. */
export function simulate(pos, vel, spin = [0, 0, 0], { ball = BALL, dt = 0.002, maxTime = 4, maxBounces = 1, net = true } = {}) {
  const r = ball.radius;
  let t = 0, p0 = pos, v0 = vel, s = spin;
  const points = [{ t, pos }];
  const bounces = [];
  let netClearance = null;
  while (t < maxTime) {
    let [p, v] = rk4(p0, v0, s, dt, ball);
    let tn = t + dt;
    if (net && (p0[0] < 0) !== (p[0] < 0) && netClearance === null) {
      const f = -p0[0] / (p[0] - p0[0]);
      const y = p0[1] + (p[1] - p0[1]) * f;
      const z = p0[2] + (p[2] - p0[2]) * f;
      if (Math.abs(y) <= COURT.netPostY) {
        netClearance = z - r - netHeight(y);
        if (netClearance < 0) {
          points.push({ t: t + dt * f, pos: [0, y, z] });
          return { points, bounces, netClearance, hitNet: true };
        }
      }
    }
    if (p[2] <= r && v[2] < 0) {
      const f = p0[2] !== p[2] ? (p0[2] - r) / (p0[2] - p[2]) : 1;
      const cp = p0.map((a, i) => a + (p[i] - a) * f);
      cp[2] = r;
      const cv = v0.map((a, i) => a + (v[i] - a) * f);
      const contact = { t: t + dt * f, pos: cp, vel: cv };
      bounces.push(contact);
      points.push(contact);
      if (bounces.length > maxBounces) return { points, bounces, netClearance, hitNet: false };
      [v, s] = bounce(cv, s, ball);
      p = cp;
      tn = contact.t;
      if (v[2] < 0.05) return { points, bounces, netClearance, hitNet: false };
    }
    t = tn; p0 = p; v0 = v;
    points.push({ t, pos: p });
  }
  return { points, bounces, netClearance, hitNet: false };
}

export function launchVelocity(speed, elev, az) {
  const c = Math.cos(elev);
  return [speed * c * Math.cos(az), speed * c * Math.sin(az), speed * Math.sin(elev)];
}

export const LAUNCHER = { wheelRadius: 0.075, speedEfficiency: 0.85, spinEfficiency: 0.5, maxRpm: 7000 };

export function wheelRpm(speed, topspinRadS, L = LAUNCHER) {
  const total = (2 * speed) / L.speedEfficiency;
  const diff = (2 * BALL.radius * topspinRadS) / L.spinEfficiency;
  const per = 1 / (RPM * L.wheelRadius);
  const top = ((total + diff) / 2) * per, bottom = ((total - diff) / 2) * per;
  let error = null;
  if (Math.min(top, bottom) < 0) error = "spin too high for this speed: a wheel would turn backwards";
  else if (Math.max(top, bottom) > L.maxRpm) error = `needs ${Math.round(Math.max(top, bottom))} rpm, above the ${L.maxRpm} rpm limit`;
  return { top, bottom, error };
}

export function defaultOrigin(y = 0, height = 1) {
  return [-COURT.halfLength - 0.5, y, height];
}

function fly(origin, speed, elev, az, top, side) {
  const v = launchVelocity(speed, elev, az);
  return simulate(origin, v, spinVector(v, top, side), { maxBounces: 0 });
}

/** Mirror of launcher.aim: low-arc elevation and azimuth to land on target. Throws if unreachable. */
export function aim(origin, target, speed, topspinRpm = 0, sidespinRpm = 0, minNetClearance = 0.15) {
  const top = topspinRpm * RPM, side = sidespinRpm * RPM;
  const [tx, ty] = target, [ox, oy] = origin;
  const want = Math.hypot(tx - ox, ty - oy);
  let az = Math.atan2(ty - oy, tx - ox);
  const dist = (e, a) => {
    const f = fly(origin, speed, e, a, top, side);
    const b = f.bounces[0];
    return [f.hitNet || !b ? -1 : Math.hypot(b.pos[0] - ox, b.pos[1] - oy), f];
  };
  const deg = Math.PI / 180;
  let elev = null, flight = null;
  for (let iter = 0; iter < 6; iter++) {
    let e = -20 * deg;
    let [dLo] = dist(e, az);
    let bracket = null;
    while (e < 50 * deg) {
      const e2 = e + 2 * deg;
      const [d2] = dist(e2, az);
      if (dLo <= want && want <= d2) { bracket = [e, e2]; break; }
      e = e2; dLo = d2;
    }
    if (!bracket) throw new Error(`target is out of reach at ${speed.toFixed(1)} m/s`);
    let [a, b] = bracket;
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2;
      if (dist(m, az)[0] < want) a = m; else b = m;
    }
    elev = (a + b) / 2;
    flight = dist(elev, az)[1];
    const land = flight.bounces[0].pos;
    const err = Math.atan2(ty - oy, tx - ox) - Math.atan2(land[1] - oy, land[0] - ox);
    if (Math.abs(err) < 1e-5) break;
    az += err;
  }
  const land = flight.bounces[0].pos;
  if (flight.netClearance !== null && flight.netClearance < minNetClearance) {
    throw new Error(`shot clears the net by only ${flight.netClearance.toFixed(2)} m; add speed, topspin or depth`);
  }
  return {
    elevationDeg: elev / deg,
    azimuthDeg: az / deg,
    landing: [land[0], land[1]],
    netClearance: flight.netClearance,
    flightTime: flight.bounces[0].t,
    flight,
  };
}

/** Nearest-neighbour + 2-opt order over balls (no keep-outs; the Python planner handles those). */
export function collectRoute(start, balls) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const left = balls.slice();
  const tour = [];
  let cur = start;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (d(cur, left[i]) < d(cur, left[bi])) bi = i;
    cur = left.splice(bi, 1)[0];
    tour.push(cur);
  }
  const seq = [start, ...tour];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < seq.length - 1; i++) {
      for (let j = i + 1; j < seq.length; j++) {
        const a = seq[i - 1], b = seq[i], c = seq[j], e = seq[j + 1];
        const before = d(a, b) + (e ? d(c, e) : 0);
        const after = d(a, c) + (e ? d(b, e) : 0);
        if (after < before - 1e-9) {
          const mid = seq.slice(i, j + 1).reverse();
          seq.splice(i, j - i + 1, ...mid);
          improved = true;
        }
      }
    }
  }
  let length = 0;
  for (let i = 1; i < seq.length; i++) length += d(seq[i - 1], seq[i]);
  return { order: seq.slice(1), length };
}
