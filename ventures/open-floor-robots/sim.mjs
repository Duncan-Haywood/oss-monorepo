// Browser port of the coverage planner (src/floorbots/room.py, coverage.py,
// variants.py and the runtime part of power.py). Same integer cell
// arithmetic and tie-breaks as the Python, so the same room gives the same
// path; sim.test.mjs checks it against fixtures/reference.json.

export const CHASSIS_RADIUS = 0.165;
export const CRUISE = 0.25;
export const TRANSIT = 0.35;
export const TURN_RATE = 1.5;

export const TOOLS = {
  vacuum: { name: "vacuum", width: 0.17, edgeReach: 0.196 },
  mop: { name: "mop", width: 0.17, edgeReach: 0.085 },
  comboMop: { name: "mop", width: 0.15, edgeReach: 0.075 },
};

const SHARED = { electronics: 4.0, drive: 4.0 };
export const VARIANTS = {
  vacuum: { name: "vacuum", title: "Robot vacuum", tools: [TOOLS.vacuum], loads: { ...SHARED, fan: 20.0, main_brush: 4.0, side_brush: 1.0 }, binMl: 220, tankMl: 0 },
  mop: { name: "mop", title: "Robot mop", tools: [TOOLS.mop], loads: { ...SHARED, pump: 0.5, vibration: 0.8, lift_servo: 0.2 }, binMl: 0, tankMl: 380 },
  combo: { name: "combo", title: "Robot vacuum-mop combo", tools: [TOOLS.vacuum, TOOLS.comboMop], loads: { ...SHARED, fan: 20.0, main_brush: 4.0, side_brush: 1.0, pump: 0.5, vibration: 0.8, lift_servo: 0.2 }, binMl: 130, tankMl: 135 },
};

export function laneWidth(v) {
  return Math.min(...v.tools.map((t) => t.width));
}
export function cleanPowerW(v) {
  return Object.values(v.loads).reduce((a, b) => a + b, 0);
}
export function radii(tool) {
  return { edge: tool.edgeReach, lane: tool.width / 2 };
}

// Battery: 4S2P 2600 mAh, 80% usable, 90% converters (power.Battery defaults).
export const BATTERY = { series: 4, parallel: 2, cellMah: 2600, cellV: 3.6, usable: 0.8, eff: 0.9 };
export function usableWh(b = BATTERY) {
  return b.series * b.parallel * b.cellMah / 1000 * b.cellV * b.usable * b.eff;
}
export function runtimeH(v, b = BATTERY) {
  return usableWh(b) / cleanPowerW(v);
}

export const PRESETS = {
  bedroom: { name: "bedroom", floor: [[0, 0, 3.6, 3.2]], obstacles: [[0, 0.8, 2.0, 2.4], [0, 2.4, 0.4, 2.8], [2.4, 2.6, 3.6, 3.2]], dock: [3.3, 0.3] },
  living: {
    name: "living", floor: [[0, 0, 5.0, 4.0]],
    obstacles: [[0.3, 3.1, 2.5, 4.0], [1.0, 1.8, 2.2, 2.4], [3.9, 2.8, 4.8, 3.8], [1.0, 0.0, 2.6, 0.4],
      [3.2, 0.4, 3.3, 0.5], [4.5, 0.4, 4.6, 0.5], [3.2, 1.3, 3.3, 1.4], [4.5, 1.3, 4.6, 1.4]],
    dock: [0.3, 0.3],
  },
  apartment: {
    name: "apartment", floor: [[0, 0, 7.0, 3.5], [0, 3.5, 3.5, 6.0]],
    obstacles: [[3.0, 0.0, 3.1, 1.6], [4.5, 1.2, 5.7, 2.1], [0.2, 5.2, 2.4, 6.0], [1.2, 3.9, 2.2, 4.6]],
    dock: [6.7, 0.3],
  },
};

const inRect = (r, x, y) => r[0] < x && x < r[2] && r[1] < y && y < r[3];

export function rasterise(room, res = 0.05) {
  const W = Math.max(...room.floor.map((r) => r[2]));
  const H = Math.max(...room.floor.map((r) => r[3]));
  const w = Math.round(W / res), h = Math.round(H / res);
  const free = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = (j + 0.5) * res;
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) * res;
      if (room.floor.some((r) => inRect(r, x, y)) && !room.obstacles.some((r) => inRect(r, x, y))) free[j * w + i] = 1;
    }
  }
  return { w, h, res, free, room };
}

export function freeCount(g) {
  let n = 0;
  for (const v of g.free) n += v;
  return n;
}

export function disk(rc) {
  const rr = rc * rc, n = Math.floor(rc), out = [];
  for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) if (di * di + dj * dj <= rr) out.push([di, dj]);
  return out;
}

// Every cell a disk at a cell centre overlaps at all (conservative, for collision).
export function body(rc) {
  const rr = rc * rc, n = Math.ceil(rc + 0.5), out = [];
  for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
    const x = Math.max(0, Math.abs(di) - 0.5), y = Math.max(0, Math.abs(dj) - 0.5);
    if (x * x + y * y < rr) out.push([di, dj]);
  }
  return out;
}

export function cspace(g, radius) {
  const offs = body(radius / g.res), { w, h, free } = g;
  const out = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!free[j * w + i]) continue;
    let ok = 1;
    for (const [di, dj] of offs) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h || !free[jj * w + ii]) { ok = 0; break; }
    }
    out[j * w + i] = ok;
  }
  return out;
}

function nearestCell(g, mask, x, y) {
  const ci = Math.trunc(x / g.res), cj = Math.trunc(y / g.res);
  let best = null, bd = null;
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    if (!mask[j * g.w + i]) continue;
    const d = (i - ci) * (i - ci) + (j - cj) * (j - cj);
    if (bd === null || d < bd) { best = [i, j]; bd = d; }
  }
  if (!best) throw new Error("the robot fits nowhere in this room");
  return best;
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function region(g, mask, s) {
  const out = new Uint8Array(mask.length), q = [s];
  out[s[1] * g.w + s[0]] = 1;
  for (let head = 0; head < q.length; head++) {
    const [i, j] = q[head];
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && ii < g.w && jj >= 0 && jj < g.h) {
        const k = jj * g.w + ii;
        if (mask[k] && !out[k]) { out[k] = 1; q.push([ii, jj]); }
      }
    }
  }
  return out;
}

function lineClear(g, reach, a, b) {
  const d2 = (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]);
  const n = Math.max(1, Math.ceil(Math.sqrt(d2) * 4));
  for (let k = 0; k <= n; k++) {
    const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
    const i = Math.floor(x + 0.5), j = Math.floor(y + 0.5);
    if (!(i >= 0 && i < g.w && j >= 0 && j < g.h) || !reach[j * g.w + i]) return false;
  }
  return true;
}

function bfsPath(g, reach, a, b) {
  const w = g.w, start = a[1] * w + a[0], goal = b[1] * w + b[0];
  const parent = new Int32Array(w * g.h).fill(-2);
  parent[start] = -1;
  const q = [start];
  for (let head = 0; head < q.length; head++) {
    const k = q[head];
    if (k === goal) break;
    const i = k % w, j = Math.floor(k / w);
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && ii < w && jj >= 0 && jj < g.h) {
        const kk = jj * w + ii;
        if (reach[kk] && parent[kk] === -2) { parent[kk] = k; q.push(kk); }
      }
    }
  }
  if (parent[goal] === -2) throw new Error(`no path from ${a} to ${b}`);
  const raw = [];
  for (let k = goal; k !== -1; k = parent[k]) raw.push([k % w, Math.floor(k / w)]);
  raw.reverse();
  const out = [raw[0]];
  let i = 0;
  while (i < raw.length - 1) {
    let j = raw.length - 1;
    while (j > i + 1 && !lineClear(g, reach, raw[i], raw[j])) j--;
    out.push(raw[j]);
    i = j;
  }
  return out;
}

const same = (a, b) => a[0] === b[0] && a[1] === b[1];

function link(g, reach, path, phases, target, phase) {
  const a = path[path.length - 1];
  if (same(a, target)) return;
  if (lineClear(g, reach, a, target)) { path.push(target); phases.push(phase); return; }
  for (const c of bfsPath(g, reach, a, target).slice(1)) { path.push(c); phases.push("link"); }
  phases[phases.length - 1] = phase;
}

function boundary(g, reach) {
  const out = [];
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    if (!reach[j * g.w + i]) continue;
    for (const [di, dj] of N4) {
      const ii = i + di, jj = j + dj;
      if (!(ii >= 0 && ii < g.w && jj >= 0 && jj < g.h) || !reach[jj * g.w + ii]) { out.push([i, j]); break; }
    }
  }
  return out;
}

function edgeOrder(cells, start) {
  const used = new Uint8Array(cells.length), out = [];
  let cur = start;
  for (let n = 0; n < cells.length; n++) {
    let best = -1, bd = null;
    for (let k = 0; k < cells.length; k++) {
      if (used[k]) continue;
      const c = cells[k], d = (c[0] - cur[0]) * (c[0] - cur[0]) + (c[1] - cur[1]) * (c[1] - cur[1]);
      if (bd === null || d < bd) { best = k; bd = d; }
    }
    used[best] = 1;
    cur = cells[best];
    out.push(cur);
  }
  return out;
}

function columns(g, reach) {
  const out = [];
  for (let i = 0; i < g.w; i++) {
    const runs = [];
    let j = 0;
    while (j < g.h) {
      if (reach[j * g.w + i]) {
        const j0 = j;
        while (j < g.h && reach[j * g.w + i]) j++;
        runs.push([j0, j - 1]);
      } else j++;
    }
    out.push(runs);
  }
  return out;
}

const overlap = (a, b) => a[0] <= b[1] && b[0] <= a[1];

export function decompose(g, reach) {
  const cols = columns(g, reach), cells = [];
  let active = new Map(), prev = [];
  cols.forEach((runs, i) => {
    const now = new Map();
    runs.forEach((run, r) => {
      const ups = [];
      prev.forEach((pr, p) => { if (overlap(pr, run)) ups.push(p); });
      if (ups.length === 1) {
        const p = ups[0];
        const downs = runs.filter((qr) => overlap(prev[p], qr));
        if (downs.length === 1 && active.has(p)) {
          const c = active.get(p);
          cells[c].runs.push(run);
          now.set(r, c);
          return;
        }
      }
      cells.push({ c0: i, runs: [run] });
      now.set(r, cells.length - 1);
    });
    active = now;
    prev = runs;
  });
  return cells;
}

function laneColumns(c0, n, step) {
  const cols = [];
  for (let k = 0; k < n; k += step) cols.push(k);
  if (cols[cols.length - 1] !== n - 1) cols.push(n - 1);
  return cols.map((k) => c0 + k);
}

const cmpTuple = (a, b) => { for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k]; return 0; };

function uncovered(run, segs) {
  const out = [];
  let j = run[0];
  for (const [a, b] of [...segs].sort(cmpTuple)) {
    if (a > j) out.push([j, a - 1]);
    j = Math.max(j, b + 1);
  }
  if (j <= run[1]) out.push([j, run[1]]);
  return out;
}

// Lanes [column, j0, j1] for one cell, with patch lanes where a neighbour's run overhangs (coverage.lane_set).
export function laneSet(cell, step) {
  const { c0, runs } = cell, n = runs.length, h = Math.floor(step / 2);
  const lanes = laneColumns(c0, n, step).map((c) => [c, runs[c - c0][0], runs[c - c0][1]]);
  const cov = runs.map(() => []);
  const mark = (col, j0, j1) => {
    for (let k = Math.max(0, col - c0 - h); k <= Math.min(n - 1, col - c0 + h); k++) {
      const a = Math.max(j0, runs[k][0]), b = Math.min(j1, runs[k][1]);
      if (a <= b) cov[k].push([a, b]);
    }
  };
  for (const l of lanes) mark(...l);
  for (let k = 0; k < n; k++) {
    for (const [a, b] of uncovered(runs[k], cov[k])) {
      let kk = Math.min(n - 1, k + h);
      while (kk > k && !(runs[kk][0] <= a && b <= runs[kk][1])) kk--;
      const lane = [c0 + kk, a, b];
      lanes.push(lane);
      mark(...lane);
    }
  }
  return lanes.sort(cmpTuple);
}

function cellLanes(lanes, reverse, up) {
  const out = [];
  for (const [col, j0, j1] of reverse ? [...lanes].reverse() : lanes) {
    out.push(up ? [[col, j0], [col, j1]] : [[col, j1], [col, j0]]);
    up = !up;
  }
  return out;
}

export function simplify(path, phases) {
  const wp = [path[0]], ph = [phases[0]];
  for (let k = 1; k < path.length; k++) {
    const c = path[k], p = phases[k];
    if (same(c, wp[wp.length - 1])) continue;
    if (wp.length >= 2 && ph[ph.length - 1] === p) {
      const [ax, ay] = wp[wp.length - 2], [bx, by] = wp[wp.length - 1];
      const cross = (bx - ax) * (c[1] - ay) - (by - ay) * (c[0] - ax);
      const dot = (bx - ax) * (c[0] - bx) + (by - ay) * (c[1] - by);
      if (cross === 0 && dot > 0) { wp[wp.length - 1] = c; continue; }
    }
    wp.push(c);
    ph.push(p);
  }
  return [wp, ph];
}

export function plan(g, { robotRadius = CHASSIS_RADIUS, cleanWidth = 0.17, overlap: ov = 0.10, start = null, edge = true, margin = 0.01 } = {}) {
  const mask = cspace(g, robotRadius + margin);
  const st = start || (g.room ? g.room.dock : [g.w * g.res / 2, g.h * g.res / 2]);
  const s = nearestCell(g, mask, st[0], st[1]);
  const reach = region(g, mask, s);
  const path = [s], phases = ["start"];
  if (edge) for (const c of edgeOrder(boundary(g, reach), s)) {
    const a = path[path.length - 1];
    // Only steps to a neighbouring boundary cell follow the wall; a jump is a transit move.
    const near = (c[0] - a[0]) * (c[0] - a[0]) + (c[1] - a[1]) * (c[1] - a[1]) <= 2;
    link(g, reach, path, phases, c, near ? "edge" : "link");
  }
  const step = Math.max(1, Math.floor(cleanWidth * (1 - ov) / g.res + 1e-9));
  const cells = decompose(g, reach), done = new Uint8Array(cells.length);
  const sets = cells.map((c) => laneSet(c, step));
  let lanes = 0;
  for (let n = 0; n < cells.length; n++) {
    const cur = path[path.length - 1];
    let best = null, bd = null;
    cells.forEach((cell, k) => {
      if (done[k]) return;
      for (const reverse of [false, true]) for (const up of [true, false]) {
        const first = cellLanes(sets[k], reverse, up)[0][0];
        const d = (first[0] - cur[0]) * (first[0] - cur[0]) + (first[1] - cur[1]) * (first[1] - cur[1]);
        if (bd === null || d < bd) { best = [k, reverse, up]; bd = d; }
      }
    });
    const [k, reverse, up] = best;
    done[k] = 1;
    for (const [a, b] of cellLanes(sets[k], reverse, up)) {
      if (same(a, b)) link(g, reach, path, phases, a, "lane"); // a one-cell lane: clean on the way in
      else {
        link(g, reach, path, phases, a, "link");
        link(g, reach, path, phases, b, "lane");
      }
      lanes++;
    }
  }
  link(g, reach, path, phases, s, "link");
  const [waypoints, ph] = simplify(path, phases);
  return { grid: g, reach, waypoints, phases: ph, lanes, cells: cells.length, laneSpacing: step * g.res };
}

export function planLength(p, phase = null) {
  let total = 0;
  for (let k = 1; k < p.waypoints.length; k++) {
    if (phase !== null && p.phases[k] !== phase) continue;
    const [a, b] = p.waypoints[k - 1], [c, d] = p.waypoints[k];
    total += Math.sqrt((c - a) * (c - a) + (d - b) * (d - b)) * p.grid.res;
  }
  return total;
}

export function planTurning(p) {
  let total = 0, prev = null;
  for (let k = 1; k < p.waypoints.length; k++) {
    const [a, b] = p.waypoints[k - 1], [c, d] = p.waypoints[k];
    if (a === c && b === d) continue;
    const h = Math.atan2(d - b, c - a);
    if (prev !== null) {
      let dh = Math.abs(h - prev);
      if (dh > Math.PI) dh = 2 * Math.PI - dh;
      total += dh;
    }
    prev = h;
  }
  return total;
}

export function planTimeS(p) {
  const clean = planLength(p, "edge") + planLength(p, "lane");
  return clean / CRUISE + (planLength(p) - clean) / TRANSIT + planTurning(p) / TURN_RATE;
}

export function paint(g, path, phases, radius) {
  const out = new Uint8Array(g.w * g.h), offsets = {};
  for (const [p, r] of Object.entries(radius)) offsets[p] = disk(r / g.res);
  for (let k = 1; k < path.length; k++) {
    const offs = offsets[phases[k]];
    if (!offs) continue;
    const [ax, ay] = path[k - 1], [bx, by] = path[k];
    const d2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
    const n = Math.max(1, Math.ceil(Math.sqrt(d2) * 2));
    for (let s = 0; s <= n; s++) {
      const ci = Math.floor(ax + (bx - ax) * s / n + 0.5), cj = Math.floor(ay + (by - ay) * s / n + 0.5);
      for (const [di, dj] of offs) {
        const i = ci + di, j = cj + dj;
        if (i >= 0 && i < g.w && j >= 0 && j < g.h && g.free[j * g.w + i]) out[j * g.w + i] = 1;
      }
    }
  }
  return out;
}

export function coverage(g, painted) {
  let n = 0;
  for (const v of painted) n += v;
  return n / Math.max(1, freeCount(g));
}

// One call for the page: plan a room for a variant and summarise it.
export function summarise(roomName, variantName, ov = 0.10) {
  const g = rasterise(PRESETS[roomName]);
  const v = VARIANTS[variantName];
  const p = plan(g, { cleanWidth: laneWidth(v), overlap: ov });
  const cov = {}, painted = {};
  for (const t of v.tools) {
    painted[t.name] = paint(g, p.waypoints, p.phases, radii(t));
    cov[t.name] = coverage(g, painted[t.name]);
  }
  const area = g.res * g.res * freeCount(g);
  const timeS = planTimeS(p);
  const runtime = runtimeH(v);
  return {
    grid: g, plan: p, painted, coverage: cov, floorM2: area, timeS, pathM: planLength(p),
    runtimeMin: runtime * 60, areaPerChargeM2: area / (timeS / 3600) * runtime, powerW: cleanPowerW(v),
  };
}
