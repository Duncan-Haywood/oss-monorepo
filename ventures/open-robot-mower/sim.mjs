// Browser port of mowerbot's planner, coverage raster and power model
// (src/mowerbot/geometry.py, planner.py, coverage.py, power.py). Line for
// line, so sim.test.mjs can hold it to fixtures/reference.json, which the
// Python package writes. Change both together.

// ---------------------------------------------------------------- geometry

export function signedArea(ring) {
  let s = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function ccw(ring) {
  return signedArea(ring) > 0 ? ring.slice() : ring.slice().reverse();
}

export function pointInRing(p, ring) {
  const [x, y] = p;
  let inside = false;
  const n = ring.length;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y)) {
      const xc = xi + (y - yi) * (xj - xi) / (yj - yi);
      if (x < xc) inside = !inside;
    }
    j = i;
  }
  return inside;
}

function inward(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  return [-dy / L, dx / L];
}

export function offsetRing(ring, d) {
  const r = ccw(ring);
  const n = r.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = r[(i - 1 + n) % n], p1 = r[i], p2 = r[(i + 1) % n];
    const n1 = inward(p0, p1);
    const n2 = inward(p1, p2);
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    const k = 1 + dot;
    if (k < 2 / 9) {
      out.push([p1[0] + d * n1[0], p1[1] + d * n1[1]]);
      out.push([p1[0] + d * n2[0], p1[1] + d * n2[1]]);
    } else {
      out.push([p1[0] + d * (n1[0] + n2[0]) / k, p1[1] + d * (n1[1] + n2[1]) / k]);
    }
  }
  const a0 = signedArea(r);
  const a1 = signedArea(out);
  if (a1 <= 0 || (d > 0 && a1 >= a0) || selfIntersects(out) || tooClose(out, r, Math.abs(d))) return null;
  return out;
}

function tooClose(out, ring, d) {
  const m = out.length;
  const probes = out.concat(out.map((p, i) => [(p[0] + out[(i + 1) % m][0]) / 2, (p[1] + out[(i + 1) % m][1]) / 2]));
  const n = ring.length;
  for (const p of probes) {
    for (let i = 0; i < n; i++) if (pointSegmentDistance(p, ring[i], ring[(i + 1) % n]) < d * (1 - 1e-6)) return true;
  }
  return false;
}

export function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function segmentsCross(a, b, c, d) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function selfIntersects(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function rotate(p, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c * p[0] - s * p[1], s * p[0] + c * p[1]];
}

export function pathLength(points) {
  let s = 0;
  for (let i = 0; i < points.length - 1; i++) s += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  return s;
}

export function bbox(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

// ---------------------------------------------------------------- lawns

export function lawnArea(lawn) {
  return Math.abs(signedArea(lawn.outer)) - lawn.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);
}

export const LAWNS = {
  backyard: {
    name: "backyard",
    outer: [[0, 0], [18, 0], [18, 7], [12, 7], [12, 13], [0, 13]],
    holes: [
      [[3, 8], [6, 8], [6.5, 10], [5, 11.5], [3, 11]],
      [[14.2, 2.6], [15.4, 2.9], [15.6, 4.1], [14.6, 4.6], [13.9, 3.7]],
    ],
    dock: [1.0, 0.6],
  },
  front: { name: "front", outer: [[0, 0], [10, 0], [10, 6], [0, 6]], holes: [], dock: [0.5, 0.5] },
  curved: {
    name: "curved",
    outer: [[0, 0], [9, -1], [15, 1], [17, 6], [14, 11], [7, 12], [1, 9], [-1, 4]],
    holes: [[[7, 4], [9, 4], [9, 6], [7, 6]]],
    dock: [1.0, 1.0],
  },
};

// ---------------------------------------------------------------- planner

export function settings(over = {}) {
  const s = { cutWidth: 0.232, overlap: 0.03, perimeterPasses: 2, margin: null, speed: 0.35, turnRate: 1.2, ...over };
  s.spacing = s.cutWidth - s.overlap;
  s.edge = s.margin === null ? s.cutWidth / 2 : s.margin;
  return s;
}

export function totalTurning(path) {
  let tot = 0;
  let prev = null;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1][0] - path[i][0], dy = path[i + 1][1] - path[i][1];
    if (dx * dx + dy * dy < 1e-12) continue;
    const h = Math.atan2(dy, dx);
    if (prev !== null) {
      const d = h - prev;
      tot += Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    }
    prev = h;
  }
  return tot;
}

export class FreeSpace {
  constructor(lawn, edge) {
    const outer = offsetRing(lawn.outer, edge);
    if (outer === null) throw new Error("lawn is narrower than the mower everywhere");
    this.rings = [outer];
    for (const h of lawn.holes) {
      const grown = offsetRing(h, -edge);
      this.rings.push(grown !== null ? grown : ccw(h));
    }
    let nodes = [];
    const o2 = offsetRing(lawn.outer, edge + 0.01);
    if (o2 !== null) nodes = nodes.concat(o2);
    for (const h of lawn.holes) {
      const h2 = offsetRing(h, -(edge + 0.01));
      if (h2 !== null) nodes = nodes.concat(h2);
    }
    this.nodes = nodes.filter((p) => this.inside(p));
    this.adj = null;
  }

  inside(p) {
    if (!pointInRing(p, this.rings[0])) return false;
    for (let k = 1; k < this.rings.length; k++) if (pointInRing(p, this.rings[k])) return false;
    return true;
  }

  clear(a, b) {
    for (const r of this.rings) {
      const n = r.length;
      for (let i = 0; i < n; i++) if (segmentsCross(a, b, r[i], r[(i + 1) % n])) return false;
    }
    return this.inside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }

  graph() {
    if (this.adj === null) {
      const n = this.nodes.length;
      const adj = Array.from({ length: n }, () => []);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = this.nodes[i], b = this.nodes[j];
          if (this.clear(a, b)) {
            const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
            adj[i].push([j, d]);
            adj[j].push([i, d]);
          }
        }
      }
      this.adj = adj;
    }
    return this.adj;
  }

  route(a, b) {
    if (this.clear(a, b)) return [a, b];
    const adj = this.graph();
    const n = this.nodes.length;
    const start = n, goal = n + 1;
    const pts = this.nodes.concat([a, b]);
    const fromStart = [];
    const toGoal = new Map();
    for (let i = 0; i < n; i++) {
      if (this.clear(a, this.nodes[i])) fromStart.push([i, Math.hypot(this.nodes[i][0] - a[0], this.nodes[i][1] - a[1])]);
    }
    for (let i = 0; i < n; i++) {
      if (this.clear(this.nodes[i], b)) toGoal.set(i, Math.hypot(b[0] - this.nodes[i][0], b[1] - this.nodes[i][1]));
    }
    const dist = new Array(n + 2).fill(Infinity);
    const prev = new Array(n + 2).fill(-1);
    const done = new Array(n + 2).fill(false);
    dist[start] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n + 2; i++) if (!done[i] && dist[i] < best) { u = i; best = dist[i]; }
      if (u < 0 || u === goal) break;
      done[u] = true;
      const nbrs = u === start ? fromStart : adj[u].concat(toGoal.has(u) ? [[goal, toGoal.get(u)]] : []);
      for (const [v, w] of nbrs) {
        if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
      }
    }
    if (dist[goal] === Infinity) return [a, b];
    const out = [goal];
    while (out[out.length - 1] !== start) out.push(prev[out[out.length - 1]]);
    return out.reverse().map((i) => pts[i]);
  }
}

function loopFrom(ring, p) {
  let k = 0, best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = (ring[i][0] - p[0]) ** 2 + (ring[i][1] - p[1]) ** 2;
    if (d < best - 1e-9) { best = d; k = i; }
  }
  const walk = ring.slice(k).concat(ring.slice(0, k));
  return walk.concat([walk[0]]);
}

export function stripes(lawn, s, angle) {
  const inset = s.edge + Math.max(0, s.perimeterPasses - 0.5) * s.spacing;
  const outer = offsetRing(lawn.outer, inset);
  if (outer === null) return [];
  const rings = [outer];
  for (const h of lawn.holes) {
    const grown = offsetRing(h, -(s.edge + 0.5 * s.spacing));
    rings.push(grown !== null ? grown : ccw(h));
  }
  const rot = rings.map((r) => r.map((p) => rotate(p, -angle)));
  const [, y0, , y1] = bbox(rot.slice(0, 1));
  const eps = 1e-3;
  const n = Math.max(1, Math.ceil((y1 - y0 - 2 * eps) / s.spacing));
  const segs = [];
  for (let k = 0; k < n + 1; k++) {
    const y = y0 + eps + k * (y1 - y0 - 2 * eps) / n;
    const xs = [];
    for (const r of rot) {
      const m = r.length;
      for (let i = 0; i < m; i++) {
        const [xa, ya] = r[i], [xb, yb] = r[(i + 1) % m];
        if ((ya <= y && y < yb) || (yb <= y && y < ya)) xs.push(xa + (y - ya) * (xb - xa) / (yb - ya));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > 1e-3) segs.push([rotate([xs[i], y], angle), rotate([xs[i + 1], y], angle)]);
    }
  }
  return segs;
}

export function plan(lawn, s = settings(), angleDeg = null, stepDeg = 5) {
  if (angleDeg === null) {
    let best = null;
    const free = new FreeSpace(lawn, s.edge);
    let a = 0;
    while (a < 180 - 1e-9) {
      const p = planAt(lawn, s, a, free);
      if (best === null || p.timeS < best.timeS - 1e-9) best = p;
      a += stepDeg;
    }
    return best;
  }
  return planAt(lawn, s, angleDeg, new FreeSpace(lawn, s.edge));
}

function planAt(lawn, s, angleDeg, free) {
  const skipped = [];
  const loops = [];
  for (let i = 0; i < s.perimeterPasses; i++) {
    const r = offsetRing(lawn.outer, s.edge + i * s.spacing);
    if (r === null) { skipped.push(`perimeter pass ${i + 1}: lawn too narrow`); break; }
    loops.push(r);
  }
  const obstacle = [];
  lawn.holes.forEach((h, k) => {
    const r = offsetRing(h, -s.edge);
    if (r === null) { skipped.push(`obstacle ${k + 1}: no loop at this offset`); return; }
    obstacle.push(r);
  });
  const path = [lawn.dock];
  let cur = lawn.dock;
  const go = (points) => {
    const leg = free.route(cur, points[0]);
    for (const q of leg.slice(1)) path.push(q);
    for (const q of points.slice(1)) path.push(q);
    cur = path[path.length - 1];
  };
  for (const r of loops) go(loopFrom(r, cur));
  const todo = obstacle.slice();
  while (todo.length) {
    let k = 0, best = Infinity;
    for (let i = 0; i < todo.length; i++) {
      let d = Infinity;
      for (const p of todo[i]) d = Math.min(d, (p[0] - cur[0]) ** 2 + (p[1] - cur[1]) ** 2);
      if (d < best - 1e-9) { best = d; k = i; }
    }
    go(loopFrom(todo.splice(k, 1)[0], cur));
  }
  const segs = stripes(lawn, s, (angleDeg * Math.PI) / 180);
  const nStripes = segs.length;
  const left = segs.slice();
  while (left.length) {
    let bestI = 0, bestD = Infinity, flip = false;
    for (let i = 0; i < left.length; i++) {
      const [a, b] = left[i];
      const da = (a[0] - cur[0]) ** 2 + (a[1] - cur[1]) ** 2;
      const db = (b[0] - cur[0]) ** 2 + (b[1] - cur[1]) ** 2;
      if (da < bestD - 1e-9) { bestI = i; bestD = da; flip = false; }
      if (db < bestD - 1e-9) { bestI = i; bestD = db; flip = true; }
    }
    const [a, b] = left.splice(bestI, 1)[0];
    go(flip ? [b, a] : [a, b]);
  }
  go([lawn.dock]);
  const clean = [path[0]];
  for (const p of path.slice(1)) {
    const q = clean[clean.length - 1];
    if ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 > 1e-12) clean.push(p);
  }
  const length = pathLength(clean);
  const turning = totalTurning(clean);
  return {
    angleDeg, path: clean, stripes: nStripes, perimeterLoops: loops.length, obstacleLoops: obstacle.length,
    skipped, settings: s, length, turning, timeS: length / s.speed + turning / s.turnRate,
  };
}

// ---------------------------------------------------------------- coverage

export function capsuleRow(a, b, r, y) {
  let lo = Infinity, hi = -Infinity;
  for (const c of [a, b]) {
    const dy = y - c[1];
    if (dy * dy <= r * r) {
      const h = Math.sqrt(r * r - dy * dy);
      lo = Math.min(lo, c[0] - h);
      hi = Math.max(hi, c[0] + h);
    }
  }
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L > 1e-12) {
    const ux = dx / L, uy = dy / L;
    let tlo = -Infinity, thi = Infinity;
    for (const [c0, c1, vlo, vhi] of [[ux * (y - a[1]) + uy * a[0], -uy, -r, r], [-ux * a[0] + uy * (y - a[1]), ux, 0, L]]) {
      if (Math.abs(c1) < 1e-15) {
        if (!(vlo <= c0 && c0 <= vhi)) { tlo = Infinity; thi = -Infinity; }
        continue;
      }
      let x1 = (vlo - c0) / c1, x2 = (vhi - c0) / c1;
      if (x1 > x2) [x1, x2] = [x2, x1];
      tlo = Math.max(tlo, x1);
      thi = Math.min(thi, x2);
    }
    if (tlo <= thi) { lo = Math.min(lo, tlo); hi = Math.max(hi, thi); }
  }
  return lo <= hi ? [lo, hi] : null;
}

export class Raster {
  constructor(lawn, res = 0.05, pad = 0.5) {
    const [x0, y0, x1, y1] = bbox([lawn.outer]);
    this.x0 = x0 - pad; this.y0 = y0 - pad; this.res = res;
    this.nx = Math.ceil((x1 + pad - this.x0) / res);
    this.ny = Math.ceil((y1 + pad - this.y0) / res);
    this.kind = new Uint8Array(this.nx * this.ny);
    for (let j = 0; j < this.ny; j++) {
      const y = this.y0 + (j + 0.5) * res;
      for (let i = 0; i < this.nx; i++) {
        const p = [this.x0 + (i + 0.5) * res, y];
        if (pointInRing(p, lawn.outer)) this.kind[j * this.nx + i] = lawn.holes.some((h) => pointInRing(p, h)) ? 2 : 1;
      }
    }
    this.hits = new Uint32Array(this.nx * this.ny);
  }

  sweep(a, b, r) {
    const res = this.res;
    const jlo = Math.max(0, Math.floor((Math.min(a[1], b[1]) - r - this.y0) / res));
    const jhi = Math.min(this.ny - 1, Math.floor((Math.max(a[1], b[1]) + r - this.y0) / res));
    for (let j = jlo; j <= jhi; j++) {
      const y = this.y0 + (j + 0.5) * res;
      const iv = capsuleRow(a, b, r, y);
      if (iv === null) continue;
      const ilo = Math.max(0, Math.ceil((iv[0] - this.x0) / res - 0.5));
      const ihi = Math.min(this.nx - 1, Math.floor((iv[1] - this.x0) / res - 0.5));
      const row = j * this.nx;
      for (let i = ilo; i <= ihi; i++) this.hits[row + i] += 1;
    }
  }

  sweepPath(path, r) {
    for (let k = 0; k < path.length - 1; k++) this.sweep(path[k], path[k + 1], r);
  }

  result() {
    const cell = this.res * this.res;
    let lawn = 0, cut = 0, intr = 0, out = 0, passes = 0;
    for (let k = 0; k < this.kind.length; k++) {
      const h = this.hits[k], kind = this.kind[k];
      if (kind === 1) {
        lawn += 1;
        if (h) { cut += 1; passes += h; }
      } else if (h) {
        if (kind === 2) intr += 1; else out += 1;
      }
    }
    return {
      lawnArea: lawn * cell, cutArea: cut * cell, missedArea: (lawn - cut) * cell, intrusionArea: intr * cell,
      outsideArea: out * cell, passesMean: cut ? passes / cut : 0, fraction: lawn ? cut / lawn : 0,
    };
  }
}

export function coverageOf(lawn, path, cutWidth, res = 0.05) {
  const r = new Raster(lawn, res);
  r.sweepPath(path, cutWidth / 2);
  return r.result();
}

// ---------------------------------------------------------------- power

const G = 9.81;

export function powerSpec(over = {}) {
  return {
    massKg: 9.5, crr: 0.12, driveEff: 0.55, electronicsW: 7.0, bladeIdleW: 10.0, cutJPerM2: 60.0,
    bladeEff: 0.8, batteryWh: 25.2 * 5.0, usable: 0.8, chargerW: 29.4 * 2.0, chargeEff: 0.88, ...over,
  };
}

export function budget(spec, speed, cutWidth, slopeDeg = 0, cutting = true) {
  const th = (slopeDeg * Math.PI) / 180;
  const force = spec.massKg * G * (spec.crr * Math.cos(th) + Math.sin(th));
  const drive = Math.max(0, force * speed) / spec.driveEff;
  const blade = cutting ? (spec.bladeIdleW + spec.cutJPerM2 * speed * cutWidth) / spec.bladeEff : 0;
  return { driveW: drive, bladeW: blade, electronicsW: spec.electronicsW, totalW: drive + blade + spec.electronicsW };
}

export function runtimeH(spec, speed, cutWidth, slopeDeg = 0) {
  return (spec.batteryWh * spec.usable) / budget(spec, speed, cutWidth, slopeDeg).totalW;
}

export function schedule(lawn, p, spec = powerSpec(), transitSpeed = 0.5) {
  const s = p.settings;
  const free = new FreeSpace(lawn, s.edge);
  const cutW = budget(spec, s.speed, s.cutWidth).totalW;
  const turnW = spec.electronicsW + spec.bladeIdleW / spec.bladeEff + 4.0;
  const moveW = budget(spec, transitSpeed, s.cutWidth, 0, false).totalW;
  const capacity = spec.batteryWh * spec.usable * 3600;
  const sessions = [];
  let energy = capacity, mowS = 0, mowM = 0, total = 0, prevH = null;
  const path = p.path;
  const tripHome = (pt) => pathLength(free.route(pt, lawn.dock));
  let i = 0;
  while (i < path.length - 1) {
    const a = path[i], b = path[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const h = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const turn = prevH !== null ? Math.abs(Math.atan2(Math.sin(h - prevH), Math.cos(h - prevH))) : 0;
    const dt = L / s.speed + turn / s.turnRate;
    const de = (cutW * L) / s.speed + (turnW * turn) / s.turnRate;
    const home = i < path.length - 2 ? tripHome(b) : 0;
    if (energy - de < (moveW * home) / transitSpeed && mowM > 0) {
      const back = tripHome(a);
      const used = capacity - energy + (moveW * back) / transitSpeed;
      const charge = used / (spec.chargerW * spec.chargeEff);
      sessions.push({ mowS, mowM, returnM: back, chargeS: charge });
      total += (2 * back) / transitSpeed + charge;
      energy = capacity - (moveW * back) / transitSpeed;
      mowS = 0; mowM = 0; prevH = null;
      continue;
    }
    energy -= de;
    mowS += dt; mowM += L; total += dt; prevH = h; i += 1;
  }
  sessions.push({ mowS, mowM, returnM: 0, chargeS: (capacity - energy) / (spec.chargerW * spec.chargeEff) });
  return { sessions, totalS: total, mowingS: sessions.reduce((t, x) => t + x.mowS, 0) };
}
