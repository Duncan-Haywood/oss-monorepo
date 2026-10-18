// Container and pallet load planner. Pure functions, no DOM.
//
// The question: you have cargo lines (cartons or pallets, each with a size,
// weight and quantity) and a container, truck or pallet. How many units go in,
// how many are left over, and how many containers does the whole load need?
//
// This is 3D bin packing with orientation, weight and stacking constraints,
// which is NP-hard, so the planner is a heuristic and says so. One pass is an
// extreme-point constructive packer: units are placed one at a time at the
// lowest free corner where they are inside the walls, overlap nothing, rest on
// the floor or on boxes below with enough support, respect each line's
// allowed rotations, its "highest layer" limit and the weight its units may
// carry on top, and keep the running total under the payload. Each placement is
// then slid back against the walls and neighbours. The search repeats that pass
// with three corner-ordering rules, several unit orderings and seeded random
// perturbations, and keeps the packing with the most packed volume, then the
// most packed units. The whole-load plan fills one container at a time (greedy)
// and repeats on what is left.
//
// Everything is integer millimetres and kilograms internally. Dimensions are
// rounded to the nearest millimetre on the way in, so touching faces compare
// exactly. `verifyPacking` re-checks a result with a separate implementation:
// bounds, pairwise overlap, payload, orientation, support, layers and load.
//
// It is a planning aid. It reports where the centre of gravity sits (`balanceReport`) but does not
// model load securing, axle weights, dunnage, pallet overhang rules, hazardous goods separation,
// carrier or legal limits, and it asserts no freight rate.

export const SYSTEMS = Object.freeze({
  metric: Object.freeze({ id: "metric", len: "cm", wt: "kg", mm: 10, kg: 1 }),
  imperial: Object.freeze({ id: "imperial", len: "in", wt: "lb", mm: 25.4, kg: 0.45359237 }),
});

export const DEFAULTS = Object.freeze({
  minSupport: 0.75, // share of a unit's base that must rest on the floor or boxes below
  restarts: 40,
  seed: 20261001,
  maxContainers: 200,
  pallet: Object.freeze({ l: 1219, w: 1016, deck: 145, tare: 25, heightCap: 1800, payload: 1000, doubleStack: false }),
});

// Restarts that keep the page responsive: each pass costs roughly the square of
// the unit count. A function of the input only, so results do not vary by device.
export function suggestRestarts(units) {
  if (units <= 120) return 60;
  if (units <= 300) return 40;
  if (units <= 800) return 16;
  if (units <= 2000) return 8;
  return 4;
}

export const MAX_UNITS = 6000;
export const MAX_LINES = 40;

// Commonly quoted nominal inside dimensions (mm) and planning payloads (kg).
// Real equipment varies by maker and by owner's plate; every figure is editable
// on the page and none is a certificate.
export const PRESETS = Object.freeze([
  { id: "20ft", name: "20 ft container", l: 5898, w: 2352, h: 2393, payload: 28200 },
  { id: "40ft", name: "40 ft container", l: 12032, w: 2352, h: 2393, payload: 26500 },
  { id: "40hc", name: "40 ft high cube container", l: 12032, w: 2352, h: 2698, payload: 26500 },
  { id: "53ft", name: "53 ft trailer", l: 16154, w: 2591, h: 2743, payload: 20000 },
  { id: "truck26", name: "26 ft box truck", l: 7300, w: 2400, h: 2400, payload: 4500 },
]);

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export const toMm = (v, sys) => Math.max(1, Math.round(v * sys.mm));
export const toKg = (v, sys) => v * sys.kg;
export const fromMm = (mm, sys) => mm / sys.mm;
export const fromKg = (kg, sys) => kg / sys.kg;

// ----- cargo lines ---------------------------------------------------------

export const ROTATIONS = Object.freeze(["upright", "any", "fixed"]);

export function parseRotation(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (!t) return "upright";
  if (/^(any|rotate|rotates|yes|y|free|all|can rotate|tip)/.test(t)) return "any";
  if (/^(fixed|no|n|none|as is|as-is|locked)/.test(t)) return "fixed";
  if (/^(up|upright|this side up|tsu|spin)/.test(t)) return "upright";
  return null;
}

// Build one cargo line from raw fields in the display system. Returns
// { line } or { error }. Blank layers / top weight mean "no limit".
export function buildLine(f, sys, index = 0) {
  const name = String(f.name ?? "").trim() || `Cargo ${index + 1}`;
  const l = num(f.l, NaN), w = num(f.w, NaN), h = num(f.h, NaN);
  if (![l, w, h].every((x) => Number.isFinite(x) && x > 0)) return { error: `${name}: length, width and height must be positive numbers.` };
  const weight = num(f.weight, NaN);
  if (!Number.isFinite(weight) || weight < 0) return { error: `${name}: weight per unit must be zero or more.` };
  const qty = num(f.qty, 1);
  if (!Number.isFinite(qty) || qty < 1 || Math.floor(qty) !== qty) return { error: `${name}: quantity must be a whole number of at least 1.` };
  const rotation = parseRotation(f.rotation);
  if (!rotation) return { error: `${name}: rotation must be upright, any or fixed.` };
  let maxLayers = Infinity;
  if (f.maxLayers !== "" && f.maxLayers !== undefined && f.maxLayers !== null) {
    const m = num(f.maxLayers, NaN);
    if (!Number.isFinite(m) || m < 1 || Math.floor(m) !== m) return { error: `${name}: highest layer must be a whole number of at least 1 (1 means floor only).` };
    maxLayers = m;
  }
  let maxTop = Infinity;
  if (f.maxTop !== "" && f.maxTop !== undefined && f.maxTop !== null) {
    const m = num(f.maxTop, NaN);
    if (!Number.isFinite(m) || m < 0) return { error: `${name}: weight allowed on top must be zero or more.` };
    maxTop = toKg(m, sys);
  }
  return {
    line: { name, dims: [toMm(l, sys), toMm(w, sys), toMm(h, sys)], weight: toKg(weight, sys), qty, rotation, maxLayers, maxTop },
  };
}

const cellsOf = (line) =>
  (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));

// "name, length, width, height, weight, quantity, rotation, highest layer, weight allowed on top"
export function parseCargo(text, sys = SYSTEMS.metric) {
  const lines = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const row = raw.trim();
    if (!row) continue;
    const c = cellsOf(row);
    if (c.length < 5) { skipped++; continue; }
    if (!Number.isFinite(num(c[1], NaN))) {
      if (lines.length || !/name|length|weight|qty|quantity/i.test(row)) skipped++;
      continue;
    }
    const r = buildLine({ name: c[0], l: c[1], w: c[2], h: c[3], weight: c[4], qty: c[5], rotation: c[6], maxLayers: c[7], maxTop: c[8] }, sys, lines.length);
    if (r.error) { warnings.push(r.error); skipped++; continue; }
    lines.push(r.line);
  }
  if (skipped && !warnings.length) warnings.push(`${skipped} line(s) skipped (need a name, three sizes, a weight and a quantity).`);
  if (!lines.length) return { error: "Add at least one cargo line: name, length, width, height, weight, quantity.", warnings };
  return finishLines(lines, warnings);
}

export function finishLines(lines, warnings = []) {
  if (lines.length > MAX_LINES) return { error: `At most ${MAX_LINES} cargo lines.`, warnings };
  const total = lines.reduce((s, l) => s + l.qty, 0);
  if (total > MAX_UNITS) return { error: `That is ${total.toLocaleString("en-US")} units; the planner handles up to ${MAX_UNITS.toLocaleString("en-US")} at a time. Plan a pallet or a shipment batch at a time.`, warnings };
  return { lines, warnings };
}

// Distinct orientations (l, w, h as placed) a line allows.
export function orientations(line) {
  const [a, b, c] = line.dims;
  let all;
  if (line.rotation === "fixed") all = [[a, b, c]];
  else if (line.rotation === "upright") all = [[a, b, c], [b, a, c]];
  else all = [[a, b, c], [b, a, c], [a, c, b], [c, a, b], [b, c, a], [c, b, a]];
  const seen = new Set(), out = [];
  for (const o of all) {
    const k = o.join("x");
    if (!seen.has(k)) { seen.add(k); out.push(o); }
  }
  return out;
}

export function resolveContainer(spec) {
  // spec: { id?, name, l, w, h, payload } in mm and kg.
  const c = { id: spec.id || "custom", name: spec.name || "Custom", l: Math.round(spec.l), w: Math.round(spec.w), h: Math.round(spec.h), payload: spec.payload };
  c.volume = c.l * c.w * c.h;
  return c;
}

export function palletContainer(p = DEFAULTS.pallet) {
  return resolveContainer({ id: "pallet", name: "Pallet", l: p.l, w: p.w, h: Math.max(1, p.heightCap - p.deck), payload: p.payload });
}

// ----- the packer ----------------------------------------------------------

const EPS = 1e-9;
const MODES = [
  { cmp: (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2], score: (x, y, z, l, w, h) => [x + l, y, z] },
  { cmp: (a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1], score: (x, y, z, l, w, h) => [z + h, x, y] },
  { cmp: (a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1], score: (x, y, z, l, w, h) => [x + l, z, y] },
];
const cmp3 = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// One constructive pass. `seq` is an array of line indices, one per unit, in
// placement order. Returns the placements and what was left.
export function packPass(cont, lines, seq, modeIdx = 0, minSupport = DEFAULTS.minSupport, noise = 0, rng = null) {
  const L = cont.l, W = cont.w, H = cont.h;
  const mode = MODES[modeIdx % MODES.length];
  const placed = [];
  const exhausted = new Array(lines.length).fill(false);
  const orients = lines.map(orientations);
  const anyTop = lines.some((l) => Number.isFinite(l.maxTop));
  const counts = new Array(lines.length).fill(0);
  let weight = 0, volume = 0;
  let eps = [[0, 0, 0]];
  const epSeen = new Set(["0,0,0"]);

  // Uniform grid over the floor so a placement test only looks at nearby boxes.
  const GX = 40, GY = 10;
  const cw = Math.max(1, Math.ceil(L / GX)), ch = Math.max(1, Math.ceil(W / GY));
  const cells = Array.from({ length: GX * GY }, () => []);
  const stamp = [];
  let stampN = 0;
  const cx0 = (x) => Math.min(GX - 1, Math.floor(x / cw));
  const cy0 = (y) => Math.min(GY - 1, Math.floor(y / ch));
  const near = (x, y, x2, y2) => {
    // Indices of placed boxes whose cells intersect [x, x2) x [y, y2).
    stampN++;
    const out = [];
    for (let gx = cx0(x); gx <= cx0(x2 - 1); gx++) {
      for (let gy = cy0(y); gy <= cy0(y2 - 1); gy++) {
        for (const i of cells[gx * GY + gy]) if (stamp[i] !== stampN) { stamp[i] = stampN; out.push(i); }
      }
    }
    return out;
  };

  function tryPlace(x, y, z, l, w, h, li) {
    const x2 = x + l, y2 = y + w, z2 = z + h;
    if (x2 > L || y2 > W || z2 > H) return null;
    let supArea = 0, level = 1, sup = null;
    for (const i of near(x, y, x2, y2)) {
      const p = placed[i];
      if (p.x >= x2 || p.x2 <= x || p.y >= y2 || p.y2 <= y) continue;
      if (p.z >= z2) { if (p.z === z2) return null; continue; }
      if (p.z2 <= z) {
        if (p.z2 === z) {
          const a = (Math.min(x2, p.x2) - Math.max(x, p.x)) * (Math.min(y2, p.y2) - Math.max(y, p.y));
          supArea += a;
          (sup || (sup = [])).push([i, a]);
          if (p.level + 1 > level) level = p.level + 1;
        }
        continue;
      }
      return null;
    }
    if (z > 0) {
      if (!sup || supArea < minSupport * l * w - EPS) return null;
      if (level > lines[li].maxLayers) return null;
    }
    let delta = null;
    if (z > 0 && anyTop) {
      delta = new Map();
      const wt = lines[li].weight;
      const push = (i, amt, depth) => {
        delta.set(i, (delta.get(i) || 0) + amt);
        if (depth > 64) return;
        const p = placed[i];
        if (p.sup) for (const [j, share] of p.sup) push(j, amt * share, depth + 1);
      };
      for (const [i, a] of sup) push(i, (wt * a) / supArea, 0);
      for (const [i, amt] of delta) if (placed[i].load + amt > placed[i].maxTop + 1e-7) return null;
    }
    return { sup, supArea, level: z > 0 ? level : 1, delta };
  }

  const slideX = (y, z, w, h, x) => {
    let t = 0;
    for (const p of placed) if (p.y < y + w && p.y2 > y && p.z < z + h && p.z2 > z && p.x2 <= x && p.x2 > t) t = p.x2;
    return t;
  };
  const slideY = (x, z, l, h, y) => {
    let t = 0;
    for (const p of placed) if (p.x < x + l && p.x2 > x && p.z < z + h && p.z2 > z && p.y2 <= y && p.y2 > t) t = p.y2;
    return t;
  };
  const dropZ = (x, y, l, w, z) => {
    let t = 0;
    for (const i of near(x, y, x + l, y + w)) { const p = placed[i]; if (p.x < x + l && p.x2 > x && p.y < y + w && p.y2 > y && p.z2 <= z && p.z2 > t) t = p.z2; }
    return t;
  };
  const dropPoint = (x, y, z) => {
    let t = 0;
    for (const i of near(x, y, x + 1, y + 1)) { const p = placed[i]; if (p.x <= x && x < p.x2 && p.y <= y && y < p.y2 && p.z2 <= z && p.z2 > t) t = p.z2; }
    return t;
  };

  const leftover = [];
  for (const li of seq) {
    if (exhausted[li]) { leftover.push(li); continue; }
    const ln = lines[li];
    if (weight + ln.weight > cont.payload + 1e-7) {
      exhausted[li] = true; leftover.push(li); continue;
    }
    eps.sort(mode.cmp);
    let best = null, bestScore = null;
    const cands = noise > 0 ? [] : null;
    for (const [l, w, h] of orients[li]) {
      if (l > L || w > W || h > H) continue;
      for (const ep of eps) {
        const [x, y, z] = ep;
        if (x + l > L || y + w > W || z + h > H) continue;
        const r = tryPlace(x, y, z, l, w, h, li);
        if (r) {
          const sc = mode.score(x, y, z, l, w, h);
          if (cands) cands.push({ x, y, z, l, w, h, r });
          if (!bestScore || cmp3(sc, bestScore) < 0) { best = { x, y, z, l, w, h, r }; bestScore = sc; }
          break;
        }
      }
    }
    if (best && cands && cands.length > 1 && rng() < noise) best = cands[Math.floor(rng() * cands.length)];
    if (!best) { exhausted[li] = true; leftover.push(li); continue; }

    // Slide against the walls and neighbours, re-checking every move.
    let { x, y, z } = best;
    const { l, w, h } = best;
    let res = best.r;
    for (let it = 0; it < 6; it++) {
      let moved = false;
      const tz = dropZ(x, y, l, w, z);
      if (tz < z) { const r = tryPlace(x, y, tz, l, w, h, li); if (r) { z = tz; res = r; moved = true; } }
      const tx = slideX(y, z, w, h, x);
      if (tx < x) { const r = tryPlace(tx, y, z, l, w, h, li); if (r) { x = tx; res = r; moved = true; } }
      const ty = slideY(x, z, l, h, y);
      if (ty < y) { const r = tryPlace(x, ty, z, l, w, h, li); if (r) { y = ty; res = r; moved = true; } }
      if (!moved) break;
    }

    // Commit.
    const sup = res.sup ? res.sup.map(([i, a]) => [i, a / res.supArea]) : null;
    const b = { x, y, z, x2: x + l, y2: y + w, z2: z + h, l, w, h, line: li, level: res.level, sup, load: 0, maxTop: ln.maxTop };
    if (res.delta) for (const [i, amt] of res.delta) placed[i].load += amt;
    placed.push(b);
    for (let gx = cx0(b.x); gx <= cx0(b.x2 - 1); gx++) for (let gy = cy0(b.y); gy <= cy0(b.y2 - 1); gy++) cells[gx * GY + gy].push(placed.length - 1);
    counts[li]++;
    weight += ln.weight;
    volume += l * w * h;

    // Every so often, drop corners where even the smallest remaining unit
    // would overlap something or poke through a wall: free space only shrinks,
    // so they can never become usable again, and scanning them is the cost.
    if (placed.length % 16 === 0 && eps.length > 40) {
      let mL = Infinity, mW = Infinity, mH = Infinity;
      for (let i = 0; i < lines.length; i++) {
        if (exhausted[i]) continue;
        for (const [a, b2, c2] of orients[i]) { if (a < mL) mL = a; if (b2 < mW) mW = b2; if (c2 < mH) mH = c2; }
      }
      if (mL !== Infinity) {
        eps = eps.filter(([px, py, pz]) => {
          if (px + mL > L || py + mW > W || pz + mH > H) return false;
          for (const i of near(px, py, px + mL, py + mW)) {
            const p = placed[i];
            if (p.x < px + mL && p.x2 > px && p.y < py + mW && p.y2 > py && p.z < pz + mH && p.z2 > pz) return false;
          }
          return true;
        });
      }
    }

    // Update corner points: drop those inside the new box, add three new ones.
    eps = eps.filter((p) => !(b.x <= p[0] && p[0] < b.x2 && b.y <= p[1] && p[1] < b.y2 && b.z <= p[2] && p[2] < b.z2));
    const add = (px, py, pz) => {
      if (px >= L || py >= W || pz >= H) return;
      const k = `${px},${py},${pz}`;
      if (epSeen.has(k)) return;
      epSeen.add(k);
      eps.push([px, py, pz]);
    };
    add(b.x2, b.y, dropPoint(b.x2, b.y, b.z));
    add(b.x, b.y2, dropPoint(b.x, b.y2, b.z));
    add(b.x, b.y, b.z2);
    add(b.x2, 0, dropPoint(b.x2, 0, b.z));
    add(0, b.y2, dropPoint(0, b.y2, b.z));
  }

  return {
    placements: placed.map((p) => ({ line: p.line, x: p.x, y: p.y, z: p.z, l: p.l, w: p.w, h: p.h })),
    counts, leftoverUnits: leftover.length, weight, volume, count: placed.length,
  };
}

// ----- search over orderings ----------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = [
  (l) => -(l.dims[0] * l.dims[1] * l.dims[2]),
  (l) => { const d = [...l.dims].sort((a, b) => b - a); return -(d[0] * d[1]); },
  (l) => -l.weight,
  (l) => -l.dims[2],
  (l) => -Math.max(...l.dims),
];

function buildSeq(lines, remaining, attempt, rng) {
  const idx = lines.map((_, i) => i).filter((i) => remaining[i] > 0);
  const constrained = lines.some((l) => Number.isFinite(l.maxTop) || Number.isFinite(l.maxLayers));
  let order;
  if (attempt < 30) {
    const key = KEYS[attempt % KEYS.length];
    const fragileLast = constrained && Math.floor(attempt / 15) % 2 === 1;
    const rank = (i) => (fragileLast ? (Number.isFinite(lines[i].maxTop) ? 1 : 0) : 0);
    order = idx.slice().sort((a, b) => rank(a) - rank(b) || key(lines[a]) - key(lines[b]) || a - b);
  } else {
    const key = KEYS[Math.floor(rng() * KEYS.length)];
    const mx = Math.max(1, ...idx.map((i) => Math.abs(key(lines[i]))));
    const noisy = idx.map((i) => [i, key(lines[i]) / mx + rng() * (0.2 + 0.6 * rng())]);
    order = noisy.sort((a, b) => a[1] - b[1]).map((p) => p[0]);
  }
  let seq = [];
  for (const i of order) for (let k = 0; k < remaining[i]; k++) seq.push(i);
  if (attempt >= 30 && attempt % 5 === 4) {
    // Fully interleave: a different packing family from line-by-line blocks.
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [seq[i], seq[j]] = [seq[j], seq[i]];
    }
  }
  return seq;
}

// Best packing of `remaining` units (per line) into one container.
export function bestPack(cont, lines, remaining, opts = {}) {
  const restarts = Math.max(1, opts.restarts ?? DEFAULTS.restarts);
  const minSupport = opts.minSupport ?? DEFAULTS.minSupport;
  const rng = mulberry32(opts.seed ?? DEFAULTS.seed);
  const total = remaining.reduce((s, n) => s + n, 0);
  let best = null, ran = 0;
  for (let a = 0; a < restarts; a++) {
    ran++;
    const seq = buildSeq(lines, remaining, a, rng);
    const r = packPass(cont, lines, seq, Math.floor(a / KEYS.length) % MODES.length, minSupport, a >= 30 ? 0.15 + 0.25 * rng() : 0, rng);
    r.attempt = a;
    if (!best || r.volume > best.volume || (r.volume === best.volume && r.count > best.count)) best = r;
    if (best.count === total) break;
  }
  best.attempts = ran;
  return best;
}

// A line can ever go in an empty container only if some orientation fits and a
// single unit is under the payload.
export function lineFits(line, cont) {
  if (line.weight > cont.payload + 1e-7) return "weight";
  return orientations(line).some(([l, w, h]) => l <= cont.l && w <= cont.w && h <= cont.h) ? null : "size";
}

function summarise(cont, lines, r) {
  return {
    placements: r.placements,
    counts: r.counts,
    count: r.count,
    volume: r.volume,
    util: r.volume / cont.volume,
    weight: r.weight,
    payloadPct: cont.payload > 0 ? r.weight / cont.payload : NaN,
    usedLength: r.placements.reduce((m, p) => Math.max(m, p.x + p.l), 0),
    usedHeight: r.placements.reduce((m, p) => Math.max(m, p.z + p.h), 0),
    attempts: r.attempts,
  };
}

// Whole-load plan: fill one container at a time (greedy) until nothing is left
// that can go in. Returns containers in loading order.
export function planLoad(lines, container, opts = {}) {
  const cont = resolveContainer(container);
  const restarts = opts.restarts ?? DEFAULTS.restarts;
  const seed = opts.seed ?? DEFAULTS.seed;
  const maxContainers = opts.maxContainers ?? DEFAULTS.maxContainers;
  const remaining = lines.map((l) => l.qty);
  const unfit = [];
  lines.forEach((l, i) => {
    const why = lineFits(l, cont);
    if (why) { unfit.push({ line: i, qty: l.qty, reason: why }); remaining[i] = 0; }
  });
  const fitUnits = remaining.reduce((s, n) => s + n, 0);
  const fitVolume = lines.reduce((s, l, i) => s + remaining[i] * l.dims[0] * l.dims[1] * l.dims[2], 0);
  const fitWeight = lines.reduce((s, l, i) => s + remaining[i] * l.weight, 0);
  const containers = [];
  while (remaining.some((n) => n > 0) && containers.length < maxContainers) {
    const r = bestPack(cont, lines, remaining, { restarts: containers.length === 0 ? restarts : Math.max(4, Math.ceil(restarts / 2)), seed: seed + containers.length * 7919, minSupport: opts.minSupport });
    if (!r.count) break;
    containers.push(summarise(cont, lines, r));
    r.counts.forEach((n, i) => { remaining[i] -= n; });
  }
  // Tail consolidation: the last container is often a sliver. Try to pack the
  // last two containers' contents into one, with the full search.
  while (containers.length >= 2) {
    const a = containers[containers.length - 2], b = containers[containers.length - 1];
    const rem = a.counts.map((n, i) => n + b.counts[i]);
    const total = a.count + b.count;
    const r = bestPack(cont, lines, rem, { restarts, seed: seed + 104729, minSupport: opts.minSupport });
    if (r.count !== total) break;
    containers.splice(containers.length - 2, 2, summarise(cont, lines, r));
  }
  const packedUnits = fitUnits - remaining.reduce((s, n) => s + n, 0);
  const lowerBound = fitUnits ? Math.max(1, Math.ceil(Math.max(fitVolume / cont.volume, cont.payload > 0 ? fitWeight / cont.payload : 0) - 1e-9)) : 0;
  const first = containers[0];
  return {
    container: cont,
    containers,
    containersNeeded: containers.length,
    unfit,
    unplaced: remaining, // units that fit an empty container in principle but were not placed (cap reached)
    totalUnits: lines.reduce((s, l) => s + l.qty, 0),
    packedUnits,
    firstPacked: first ? first.count : 0,
    leftoverFirst: lines.reduce((s, l) => s + l.qty, 0) - (first ? first.count : 0),
    lowerBound,
    avgUtil: containers.length ? containers.reduce((s, c) => s + c.util, 0) / containers.length : 0,
    lastUtil: containers.length ? containers[containers.length - 1].util : 0,
  };
}

// ----- independent verifier ------------------------------------------------

export function verifyPacking(cont, lines, placements, opts = {}) {
  const minSupport = opts.minSupport ?? DEFAULTS.minSupport;
  const errors = [];
  const n = placements.length;
  const per = new Array(lines.length).fill(0);
  let weight = 0;
  for (let i = 0; i < n; i++) {
    const p = placements[i];
    const ln = lines[p.line];
    if (!ln) { errors.push(`unit ${i}: unknown line ${p.line}`); continue; }
    per[p.line]++;
    weight += ln.weight;
    if (p.x < 0 || p.y < 0 || p.z < 0 || p.x + p.l > cont.l || p.y + p.w > cont.w || p.z + p.h > cont.h) errors.push(`unit ${i}: outside the container`);
    const ok = orientations(ln).some(([a, b, c]) => a === p.l && b === p.w && c === p.h);
    if (!ok) errors.push(`unit ${i}: orientation ${p.l}x${p.w}x${p.h} not allowed for ${ln.name} (${ln.rotation})`);
  }
  per.forEach((c, i) => { if (c > lines[i].qty) errors.push(`line ${i}: ${c} placed but only ${lines[i].qty} ordered`); });
  if (weight > cont.payload + 1e-6) errors.push(`weight ${weight} exceeds payload ${cont.payload}`);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = placements[i], b = placements[j];
      if (a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.w && b.y < a.y + a.w && a.z < b.z + b.h && b.z < a.z + a.h) errors.push(`units ${i} and ${j} overlap`);
    }
  }
  // Support, layers and load, bottom up.
  const order = placements.map((_, i) => i).sort((a, b) => placements[a].z - placements[b].z);
  const level = new Array(n).fill(1), load = new Array(n).fill(0), sups = new Array(n).fill(null);
  for (const i of order) {
    const p = placements[i];
    if (p.z === 0) continue;
    let area = 0, lv = 1;
    const list = [];
    for (let j = 0; j < n; j++) {
      const q = placements[j];
      if (q.z + q.h !== p.z) continue;
      const ox = Math.min(p.x + p.l, q.x + q.l) - Math.max(p.x, q.x);
      const oy = Math.min(p.y + p.w, q.y + q.w) - Math.max(p.y, q.y);
      if (ox > 0 && oy > 0) { area += ox * oy; list.push([j, ox * oy]); lv = Math.max(lv, level[j] + 1); }
    }
    if (area < minSupport * p.l * p.w - 1e-6) errors.push(`unit ${i}: only ${(area / (p.l * p.w)).toFixed(2)} of its base is supported`);
    level[i] = lv;
    sups[i] = list.map(([j, a]) => [j, a / (area || 1)]);
    if (lv > lines[p.line].maxLayers) errors.push(`unit ${i}: layer ${lv} above the limit ${lines[p.line].maxLayers}`);
  }
  // Load: process top-down so each unit's carried load is complete before it is passed on.
  for (const i of order.slice().reverse()) {
    if (!sups[i]) continue;
    const through = lines[placements[i].line].weight + load[i];
    for (const [j, share] of sups[i]) load[j] += through * share;
  }
  for (let i = 0; i < n; i++) if (load[i] > lines[placements[i].line].maxTop + 1e-6) errors.push(`unit ${i}: carries ${load[i].toFixed(1)} kg, limit ${lines[placements[i].line].maxTop}`);
  return { ok: errors.length === 0, errors };
}

// ----- balance --------------------------------------------------------------

// Where the weight sits. Each unit is treated as uniform in density, so its
// mass is at the centre of its box. Fractions run 0..1 from the back wall, the
// left wall and the floor, so 0.5 is the middle of the container. `ok` is
// false when the centre of gravity is further from the middle than the
// tolerances (fractions of length / width, and a height ceiling). The defaults
// are planning figures, not a rule from any carrier or code; pass your own.
export function balanceReport(cont, lines, placements, { longTol = 0.1, latTol = 0.05, maxHeight = 0.6 } = {}) {
  let w = 0, mx = 0, my = 0, mz = 0, back = 0, left = 0;
  for (const p of placements) {
    const m = lines[p.line].weight;
    const cx = p.x + p.l / 2, cy = p.y + p.w / 2, cz = p.z + p.h / 2;
    w += m; mx += m * cx; my += m * cy; mz += m * cz;
    if (cx < cont.l / 2) back += m;
    if (cy < cont.w / 2) left += m;
  }
  if (!(w > 0)) return { weight: 0, x: NaN, y: NaN, z: NaN, backShare: NaN, leftShare: NaN, ok: true, warnings: [] };
  const x = mx / w / cont.l, y = my / w / cont.w, z = mz / w / cont.h;
  const warnings = [];
  const dir = (f, lo, hi) => (f < 0.5 ? lo : hi);
  if (Math.abs(x - 0.5) > longTol) warnings.push(`The centre of gravity is ${Math.round(Math.abs(x - 0.5) * 100)}% of the length off the middle, toward the ${dir(x, "back wall", "doors")}. Move heavy lines toward the middle.`);
  if (Math.abs(y - 0.5) > latTol) warnings.push(`The centre of gravity is ${Math.round(Math.abs(y - 0.5) * 100)}% of the width off the middle, toward the ${dir(y, "left", "right")} wall.`);
  if (z > maxHeight) warnings.push(`The centre of gravity is ${Math.round(z * 100)}% of the way up the container; put heavy lines on the floor.`);
  return { weight: w, x, y, z, backShare: back / w, leftShare: left / w, ok: warnings.length === 0, warnings };
}

// ----- pallets and comparison ---------------------------------------------

// Pack loose cargo onto pallets, then express each loaded pallet as a cargo
// line. Lines that cannot go on a pallet stay loose.
export function palletise(lines, pallet = DEFAULTS.pallet, opts = {}) {
  const p = { ...DEFAULTS.pallet, ...pallet };
  const cont = palletContainer(p);
  const plan = planLoad(lines, cont, { restarts: opts.restarts ?? 8, seed: opts.seed, minSupport: opts.minSupport, maxContainers: opts.maxContainers });
  const groups = new Map();
  for (const c of plan.containers) {
    const usedH = c.usedHeight;
    const height = p.deck + usedH;
    const weight = p.tare + c.weight;
    const key = `${height}|${weight.toFixed(3)}`;
    const g = groups.get(key) || { height, weight, qty: 0 };
    g.qty++;
    groups.set(key, g);
  }
  const palletLines = [...groups.values()].map((g, i) => ({
    name: `Loaded pallet ${i + 1}`,
    dims: [p.l, p.w, g.height],
    weight: g.weight,
    qty: g.qty,
    rotation: "upright",
    maxLayers: p.doubleStack ? 2 : 1,
    maxTop: p.doubleStack ? p.payload : 0,
  }));
  const loose = [];
  const looseIdx = new Set(plan.unfit.map((u) => u.line));
  lines.forEach((l, i) => { if (looseIdx.has(i)) loose.push(l); });
  return { plan, palletLines, loose, pallets: plan.containers.length, lines: [...palletLines, ...loose] };
}

export function compareOptions(lines, opts = {}) {
  const restarts = opts.restarts ?? 8;
  const options = [];
  const targets = [...PRESETS.map((c) => ({ ...c }))];
  if (opts.custom) targets.push({ ...opts.custom, id: "custom", name: opts.custom.name || "Your custom size" });
  const pal = palletise(lines, opts.pallet, { restarts, seed: opts.seed, minSupport: opts.minSupport });
  for (const t of targets) {
    const loose = planLoad(lines, t, { restarts, seed: opts.seed, minSupport: opts.minSupport });
    options.push({ id: t.id, label: `${t.name}, loose`, container: loose.container, plan: loose, mode: "loose" });
    if (pal.pallets > 0) {
      const pp = planLoad(pal.lines, t, { restarts, seed: opts.seed, minSupport: opts.minSupport });
      options.push({ id: `${t.id}+pallets`, label: `${t.name}, on ${pal.pallets} pallet${pal.pallets === 1 ? "" : "s"}`, container: pp.container, plan: pp, mode: "pallets" });
    }
  }
  return { options, pallet: pal };
}

// ----- views ----------------------------------------------------------------

// Rectangles for a to-scale view, in painter's order (draw first to last).
// top: x across, y down. side: x across, z up (viewer at y = 0).
export function viewRects(placements, view) {
  const list = placements.map((p) => ({ ...p }));
  if (view === "top") {
    list.sort((a, b) => a.z + a.h - (b.z + b.h) || a.x - b.x);
    return list.map((p) => ({ line: p.line, a: p.x, b: p.y, da: p.l, db: p.w }));
  }
  list.sort((a, b) => b.y - a.y || a.x - b.x);
  return list.map((p) => ({ line: p.line, a: p.x, b: p.z, da: p.l, db: p.h }));
}

// Loading order: back wall (x = 0) first, then across, then up.
export function loadingOrder(placements) {
  return placements
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)
    .map((p, n) => ({ step: n + 1, ...p }));
}

// ----- formatting -----------------------------------------------------------

export function fmtNum(x, d = 1) {
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("en-US", { maximumFractionDigits: d });
}
export function pct(x, d = 0) { return Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "—"; }
export function fmtInt(x) { return Math.round(x).toLocaleString("en-US"); }
export function lenText(mm, sys) { return fmtNum(fromMm(mm, sys), sys.id === "metric" ? 1 : 1); }
export function wtText(kg, sys) { return fmtNum(fromKg(kg, sys), 0); }
export function dimsText(mmList, sys) { return mmList.map((m) => fmtNum(fromMm(m, sys), 1)).join(" × "); }

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(plan, lines, sys) {
  const rows = [["container", "step", "line", "x from back wall (" + sys.len + ")", "y from left wall (" + sys.len + ")", "z from floor (" + sys.len + ")", "length (" + sys.len + ")", "width (" + sys.len + ")", "height (" + sys.len + ")", "weight (" + sys.wt + ")"]];
  plan.containers.forEach((c, ci) => {
    for (const p of loadingOrder(c.placements)) {
      rows.push([ci + 1, p.step, lines[p.line].name, lenText(p.x, sys), lenText(p.y, sys), lenText(p.z, sys), lenText(p.l, sys), lenText(p.w, sys), lenText(p.h, sys), wtText(lines[p.line].weight, sys)]);
    }
  });
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

const PACKET_COLORS = ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00", "#7a7a1f", "#8a5cf6", "#2c8c99", "#b5446e"];
const htmlEsc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const lineLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : String(i + 1));

// One to-scale view as inline SVG (no script, so it prints and e-mails as is).
function packetSvg(cont, placements, view, width = 640) {
  const across = cont.l, down = view === "top" ? cont.w : cont.h;
  const k = width / across, h = Math.max(20, Math.round(down * k));
  const rects = viewRects(placements, view).map((r) => {
    const x = r.a * k, y = view === "top" ? r.b * k : (down - r.b - r.db) * k, w = r.da * k, hh = r.db * k;
    const label = w >= 15 && hh >= 15 ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y + hh / 2 + 4).toFixed(1)}" text-anchor="middle" fill="#fff" font-size="11" font-weight="bold">${lineLetter(r.line)}</text>` : "";
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" fill="${PACKET_COLORS[r.line % PACKET_COLORS.length]}" stroke="#fff" stroke-width="1"/>${label}`;
  }).join("");
  const name = view === "top" ? "Top-down view" : "Side view";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${width + 4} ${h + 4}" width="100%" role="img" aria-label="${name}, to scale"><rect x="0" y="0" width="${width}" height="${h}" fill="#eef2f6" stroke="#1f4a5d" stroke-width="2"/>${rects}</svg>`;
}

// A self-contained, printable load plan: to-scale views, the per-line counts,
// the balance check and the loading list for every container, plus the
// disclaimer. `notes` are the planner's notices; `when` is a date string.
export function planReportHtml(plan, lines, sys, { title = "Container load plan", notes = [], when = "" } = {}) {
  const cont = plan.container;
  const dims = `${dimsText([cont.l, cont.w, cont.h], sys)} ${sys.len}`;
  const sections = plan.containers.map((c, ci) => {
    const bal = balanceReport(cont, lines, c.placements);
    const legend = lines.map((l, k) => (c.counts[k] ? `<span class="lg"><i style="background:${PACKET_COLORS[k % PACKET_COLORS.length]}"></i>${lineLetter(k)} · ${htmlEsc(l.name)} × ${c.counts[k]}</span>` : "")).join("");
    const rows = loadingOrder(c.placements).map((p) => `<tr><td>${p.step}</td><td>${lineLetter(p.line)} · ${htmlEsc(lines[p.line].name)}</td><td>${lenText(p.x, sys)}</td><td>${lenText(p.y, sys)}</td><td>${lenText(p.z, sys)}</td><td>${wtText(lines[p.line].weight, sys)}</td></tr>`).join("");
    const balText = bal.weight > 0
      ? `Centre of gravity ${pct(bal.x)} from the back wall, ${pct(bal.y)} from the left wall, ${pct(bal.z)} up. ` + (bal.ok ? "Near the middle." : bal.warnings.join(" "))
      : "No weight entered, so no balance to report.";
    return `<section><h2>Container ${ci + 1} of ${plan.containers.length}</h2>
<p>${c.count} units, ${pct(c.util, 1)} of the volume, ${wtText(c.weight, sys)} ${sys.wt} (${pct(c.payloadPct)} of the payload).</p>
${packetSvg(cont, c.placements, "top")}${packetSvg(cont, c.placements, "side")}
<p>${legend}</p><p>${htmlEsc(balText)}</p>
<table><thead><tr><th>Step</th><th>Line</th><th>From back (${sys.len})</th><th>From left (${sys.len})</th><th>From floor (${sys.len})</th><th>Weight (${sys.wt})</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join("");
  const summary = lines.map((l, k) => {
    const packed = plan.containers.reduce((s, c) => s + c.counts[k], 0);
    return `<tr><td>${lineLetter(k)} · ${htmlEsc(l.name)}</td><td>${l.qty}</td><td>${packed}</td><td>${l.qty - packed}</td></tr>`;
  }).join("");
  const noteHtml = notes.map((n) => `<li>${htmlEsc(n)}</li>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEsc(title)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#1d2330;max-width:760px;margin:24px auto;padding:0 16px}h1{font-size:22px}h2{font-size:17px;margin-top:28px;break-before:page}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border-bottom:1px solid #d6dbe1;padding:3px 6px;text-align:left}.lg{display:inline-block;margin:0 14px 4px 0}.lg i{display:inline-block;width:11px;height:11px;margin-right:4px;border-radius:2px}svg{display:block;margin:8px 0}.disc{margin-top:28px;font-size:12px;color:#4c5a68}</style></head>
<body><h1>${htmlEsc(title)}</h1>
<p>${htmlEsc(cont.name || "Container")}: ${dims}, payload ${wtText(cont.payload, sys)} ${sys.wt}.${when ? " Planned " + htmlEsc(when) + "." : ""} ${plan.containersNeeded} container${plan.containersNeeded === 1 ? "" : "s"} for ${plan.totalUnits} units.</p>
${noteHtml ? `<ul>${noteHtml}</ul>` : ""}
<h2 style="break-before:auto">Cargo</h2>
<table><thead><tr><th>Line</th><th>Ordered</th><th>Packed</th><th>Not packed</th></tr></thead><tbody>${summary}</tbody></table>
${sections}
<p class="disc"><strong>No warranty.</strong> A planning aid made in the browser by Container Load Planner; not a load-securing, axle-weight or compliance certificate. The packer is a heuristic, container sizes and payloads are nominal, and nothing here has been checked against a real loading. Confirm with your carrier or forwarder before booking.</p>
</body></html>
`;
}

export function sampleCargo(sys = SYSTEMS.metric) {
  // Invented goods, written in cm and kg and converted for imperial display.
  const rows = [
    ["Carton A (spare parts)", 60, 40, 40, 18, 300, "upright", "", ""],
    ["Carton B (boxed fittings)", 50, 40, 30, 12, 450, "upright", "", ""],
    ["Fragile glassware", 45, 35, 35, 9, 100, "upright", 2, 5],
    ["Euro pallet, floor only", 120, 80, 110, 420, 10, "upright", 1, 0],
    ["Long tube bundle", 200, 25, 25, 20, 10, "any", "", ""],
  ];
  const f = (n, k) => (sys.id === "metric" ? n : +(n / k).toFixed(2));
  return rows.map((r) => [r[0], f(r[1], 2.54), f(r[2], 2.54), f(r[3], 2.54), sys.id === "metric" ? r[4] : +(r[4] / 0.45359237).toFixed(1), r[5], r[6], r[7], r[8] === "" ? "" : sys.id === "metric" ? r[8] : +(r[8] / 0.45359237).toFixed(1)].join(",")).join("\n");
}
