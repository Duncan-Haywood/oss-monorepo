// @ts-check
// The design search: enumerate layout parameters, score each candidate under
// the brief's priority, keep the best. Deterministic: the same brief always
// gives the same designs.
//
// Two stages keep it under a second: stage A varies the footprint, the zones
// and the wing with a fixed great room; stage B varies the great room
// (kitchen size and side, layout) for the best skeletons; then the top few
// get windows and doors and a full score that includes the facades.

import { program, rowSplits, buildSkeleton, netBox, HABITABLE, SLEEP, WET, grossAreas } from "./layout.mjs";
import { finishPlan } from "./openings.mjs";
import { planDrivers, estimate, ANCHOR } from "./cost.mjs";
import { STYLES } from "./styles.mjs";
import { area as polyArea, bbox, centroid } from "./geom.mjs";

export const WEIGHTS = {
  budget: { cost: 3.0, area: 2.0, rooms: 1.0, wet: 1.0, hall: 1.2, shape: 0.3, facade: 0.3, light: 0.3 },
  balanced: { cost: 1.5, area: 2.0, rooms: 1.5, wet: 0.5, hall: 0.8, shape: 0.8, facade: 1.0, light: 0.8 },
  beauty: { cost: 0.5, area: 2.0, rooms: 1.5, wet: 0.2, hall: 0.5, shape: 1.5, facade: 2.5, light: 1.5 },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Room-quality penalty: shortfalls against comfortable sizes, odd proportions. */
function roomPenalty(sk, brief) {
  let p = 0;
  const beds = brief.beds;
  const merged = !sk.great.dining; // living and dining share one room
  const want = {
    bed: { min: 10.5, area: 115 }, primary: { min: 12, area: 165 },
    living: merged ? { min: 14 + Math.min(beds, 3), area: 210 + 45 * beds } : { min: 12.5 + Math.min(beds, 3) * 0.5, area: 160 + 30 * beds },
    kitchen: { min: 9.5, area: 95 + 12 * beds }, dining: { min: 10, area: 100 + 8 * beds },
  };
  for (const r of sk.rooms) {
    const nb = netBox(sk, r);
    const a = polyArea(r.poly);
    const lo = Math.min(nb.w, nb.d), hi = Math.max(nb.w, nb.d);
    const w = want[r.kind];
    if (w) {
      const pub = r.kind === "living" || r.kind === "kitchen" || r.kind === "dining" ? 2 : 1;
      p += Math.max(0, w.min - lo) * 0.25 * pub;
      p += (Math.max(0, w.area - a) / w.area) * pub;
      const aspect = hi / lo;
      p += Math.max(0, aspect - (r.kind === "living" ? 1.7 : 1.45)) * 0.6;
      if (r.kind === "kitchen") p += Math.max(0, a - 220) / 200;
      if (SLEEP.has(r.kind)) p += Math.max(0, a - (r.kind === "primary" ? 240 : 150)) / 100;
    }
    if (r.kind === "bath" || r.kind === "ensuite") p += Math.max(0, hi / lo - 2.2) * 0.3 + Math.max(0, a - 110) / 150;
    if (r.kind === "half") p += Math.max(0, a - 45) / 60;
    if (r.kind === "laundry") p += Math.max(0, a - 75) / 80;
    if (r.kind === "closet" && !r.owner) p += Math.max(0, a - 50) / 60;
    if (r.kind === "wic") p += Math.max(0, a - 80) / 80 + Math.max(0, 40 - a) / 40;
  }
  return p;
}

function wetSpread(sk) {
  const pts = sk.rooms.filter((r) => WET.has(r.kind)).map((r) => centroid(r.poly));
  if (pts.length < 2) return 0;
  const xs = pts.map((p) => p[0]).sort((a, b) => a - b), ys = pts.map((p) => p[1]).sort((a, b) => a - b);
  const mx = xs[xs.length >> 1], my = ys[ys.length >> 1];
  return pts.reduce((s, [x, y]) => s + Math.abs(x - mx) + Math.abs(y - my), 0) / pts.length / sk.D;
}

/** Shape: the footprint's proportion and the roof span, against the style. */
function shapePenalty(sk, style) {
  const ratio = sk.W / sk.D;
  let p = Math.max(0, 1.4 - ratio) + Math.max(0, ratio - 3.2) * 0.5;
  // wide gables look heavy at steep pitches: keep the ridge height in proportion to the eave
  const ridge = (sk.D / 2) * (style.pitch / 12);
  p += Math.max(0, ridge - 1.3 * (style.ceiling + 1)) / 10;
  return p;
}

/**
 * Facade quality: openings on the front wall mirrored about the centre of
 * the house's front (or of the conditioned part when a garage is attached),
 * an even window rhythm, and a front glazing share in a pleasing band.
 */
export function facadeScore(plan) {
  const front = plan.openings.filter((o) => o.dir === "h" && o.c === 0 && o.kind !== "garage");
  const x0 = plan.p.Wg || 0;
  const axis = (x0 + plan.W) / 2;
  const half = (plan.W - x0) / 2;
  let miss = 0;
  for (const o of front) {
    const mirror = 2 * axis - o.pos;
    const best = Math.min(...front.map((f) => Math.abs(f.pos - mirror) + Math.abs(f.width - o.width) + Math.abs(f.height - o.height)));
    miss += Math.min(best, 4) / 4;
  }
  const symmetry = front.length ? 1 - miss / front.length : 0;
  const wins = front.filter((o) => o.kind === "window").sort((a, b) => a.pos - b.pos);
  let rhythm = 1;
  if (wins.length >= 3) {
    const gaps = wins.slice(1).map((w, i) => w.pos - wins[i].pos).filter((g) => g > 1);
    if (gaps.length >= 2) {
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
      rhythm = clamp01(1 - sd / mean);
    }
  }
  const wallArea = (plan.W - x0) * plan.ceiling;
  const glaz = front.filter((o) => o.kind === "window").reduce((s, o) => s + o.width * o.height, 0) / wallArea;
  const band = clamp01(1 - Math.max(0, 0.12 - glaz) / 0.12 - Math.max(0, glaz - 0.3) / 0.3);
  const doorCentred = clamp01(1 - Math.abs((front.find((o) => o.kind === "entry")?.pos ?? axis) - axis) / Math.max(half, 1));
  return { symmetry, rhythm, glazing: glaz, band, doorCentred, score: 0.4 * symmetry + 0.2 * rhythm + 0.2 * band + 0.2 * doorCentred };
}

/** Daylight: glazing as a share of each habitable room's floor, against 15%. */
export function lightScore(plan) {
  let s = 0, n = 0;
  for (const r of plan.rooms) {
    if (!HABITABLE.has(r.kind)) continue;
    const glass = plan.openings.filter((o) => (o.kind === "window" || o.kind === "slider" || o.kind === "entry") && o.rooms.includes(r.id)).reduce((t, o) => t + o.width * o.height * (o.kind === "entry" ? 0.3 : 0.8), 0);
    s += clamp01(glass / polyArea(r.poly) / 0.15);
    n++;
  }
  return n ? s / n : 0;
}

function porchArea(sk, brief, style) {
  const spec = porchSpec(sk, brief, style);
  return spec ? spec.w * spec.d : 0;
}

/** The porch a plan gets: x range and depth, or null. */
export function porchSpec(sk, brief, style) {
  const want = brief.porch === "auto" ? Boolean(style.porch) : brief.porch;
  if (!want) return null;
  const ps = style.porch || { depth: 6, span: "entry", roof: "shed", pitch: 3, post: 0.5 };
  const x0g = sk.p.Wg || 0;
  let a, b;
  if (ps.span === "full") { a = x0g; b = sk.W; }
  else if (ps.span === "public") {
    const z = sk.zones.find((zz) => zz.kind === "public");
    a = z.x0; b = z.x1;
    if (b - a < 12) { a = (a + b) / 2 - 6; b = a + 12; }
  } else {
    const lb = bbox(sk.great.living.poly);
    const c = Math.round((lb.x0 + lb.x1)); // twice the centre, snapped to 6 in
    a = c / 2 - 5; b = c / 2 + 5;
  }
  a = Math.max(x0g, a); b = Math.min(sk.W, b);
  return { x0: a, x1: b, w: b - a, d: ps.depth, roof: ps.roof, pitch: ps.pitch, post: ps.post };
}

function score(sk, brief, style, finished) {
  const W8 = WEIGHTS[brief.priority];
  const { conditioned } = grossAreas(sk);
  const drivers = planDrivers(sk, brief, style);
  const cost = estimate(drivers, brief, porchArea(sk, brief, style));
  const parts = {
    cost: cost.total / brief.area / ANCHOR.construction * ANCHOR.area, // vs the anchor $/sq ft at the target area
    area: Math.abs(conditioned - brief.area) / brief.area * 4,
    rooms: roomPenalty(sk, brief) / 4,
    wet: wetSpread(sk),
    hall: (sk.rooms.filter((r) => r.kind === "hall").reduce((s, r) => s + polyArea(r.poly), 0) / conditioned) * 5,
    shape: shapePenalty(sk, style),
  };
  if (finished) {
    const f = facadeScore(sk);
    parts.facade = 1 - f.score;
    parts.light = 1 - lightScore(sk);
  } else {
    parts.facade = 0.5;
    parts.light = 0.5;
  }
  let total = 0;
  for (const [k, v] of Object.entries(parts)) total += (W8[k] ?? 0) * v;
  return { total, parts, cost };
}

function range(a, b, step) {
  const out = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(Math.round(v * 2) / 2);
  return out;
}

/**
 * Search for designs. Returns { designs: [{ plan, score }], evaluated, feasible }
 * best first; designs are finished plans (walls, doors, windows).
 */
export function searchDesigns(brief, { keep = 6, trace = null, why = null } = {}) {
  const style = STYLES[brief.style];
  const prog = program(brief);
  const hall = brief.accessible ? 4 : 3.5;
  const Wg = brief.garage === 2 ? 22 : brief.garage === 1 ? 12 : 0;
  const porchDepth = (brief.porch === "auto" ? style.porch : brief.porch ? style.porch || { depth: 6 } : null)?.depth || 0;
  const maxD = Math.min(36, (brief.maxDepth ?? 999) - porchDepth);
  const maxW = brief.maxWidth ?? 999;
  const target = brief.area;
  const lo = target * 0.93, hi = target * 1.1;
  const Ds = range(brief.beds === 0 ? 16 : brief.beds === 1 ? 20 : 24, brief.beds === 0 ? Math.min(maxD, 24) : maxD, 2);
  const splits = prog.kind === "wing" ? rowSplits(prog.cells, 3) : [];
  const canSplit = prog.ensuite && brief.garage === 0 && brief.split !== false;
  const arrangements = prog.kind === "small" ? ["small"] : !canSplit ? ["linear"] : brief.split === true ? ["split"] : ["linear", "split"];
  let evaluated = 0, feasible = 0;
  const stageA = [];
  const push = (list, item, cap) => {
    list.push(item);
    if (list.length > cap * 2) { list.sort((a, b) => a.s.total - b.s.total); list.length = cap; }
  };
  for (const D of Ds) {
    const Wc0 = Math.ceil(lo / D / 2) * 2, Wc1 = Math.floor(hi / D / 2) * 2;
    for (let Wc = Wc0; Wc <= Wc1; Wc += 2) {
      if (Wc + Wg > maxW) continue;
      for (const arrangement of arrangements) {
        const suites = arrangement === "small" ? [null] : prog.ensuite ? [13.5, 15].flatMap((w) => [true, false].map((bedBack) => ({ w, bedBack }))) : [null];
        for (const suite of suites) {
          const stackWs = arrangement === "small" ? range(10, 14, 1) : [null];
          for (const sw of stackWs) {
            const WqOpts = arrangement === "small" ? [Wc - sw] : range(12, Math.min(34, Wc - 10), 2);
            for (const Wq of WqOpts) {
              const Lw = arrangement === "small" ? sw : Wc - Wq - (arrangement === "split" ? suite.w : 0);
              if (Lw < 3) continue;
              const span = Wq - (Wg ? 7 : 0); // the mudroom takes 7 ft of the back strip
              const pubDefault = span >= 20 ? { layout: "P1", kd: Math.min(12, D - 12), kw: Math.min(14, Math.max(10, Math.round(span / 2))), kitchenSide: "wing" } : { layout: "P2", kd: Math.min(10.5, D - 10.5), kitchenSide: "wing" };
              const mid = Math.round(((D - hall) / 2) * 2) / 2;
              const dfs = arrangement === "small" ? [0] : [mid - 1, mid, mid + 1];
              const stackOrders = arrangement === "small" ? [prog.stack, [...prog.stack.slice(1), prog.stack[0]]] : [null];
              for (const df of dfs) for (const split of splits.length ? splits : [null]) for (const wetAt of arrangement === "small" ? ["start"] : ["start", "end"]) for (const order of stackOrders) {
                const p = { D, arrangement, Wg, Wq, Lw, suite, df, hall, split, wetAt, pub: pubDefault, stack: order ? { order } : null };
                evaluated++;
                let sk;
                try { sk = buildSkeleton(p, prog, why); } catch (e) { if (why) why[`error: ${e.message}`] = (why[`error: ${e.message}`] || 0) + 1; sk = null; }
                if (!sk) continue;
                feasible++;
                const sc = score(sk, brief, style, false);
                if (trace) trace(p, sc);
                push(stageA, { p, s: sc }, 40);
              }
            }
          }
        }
      }
    }
  }
  stageA.sort((a, b) => a.s.total - b.s.total);
  const top = stageA.slice(0, 40);
  // stage B: the great room
  const stageB = [];
  for (const { p } of top) {
    const opts = [];
    if (p.Wq - (p.Wg ? 7 : 0) >= 19.5) for (const kd of [10.5, 12, 13.5]) for (const kw of [10, 12, 14]) for (const kitchenSide of ["wing", "far"]) opts.push({ layout: "P1", kd, kw, kitchenSide });
    for (const kd of [9.5, 10.5, 12]) opts.push({ layout: "P2", kd, kitchenSide: "wing" });
    let best = null;
    for (const pub of opts) {
      const q = { ...p, pub };
      evaluated++;
      let sk;
      try { sk = buildSkeleton(q, prog); } catch { sk = null; }
      if (!sk) continue;
      feasible++;
      const s = score(sk, brief, style, false);
      if (!best || s.total < best.s.total) best = { p: q, s };
    }
    if (best) stageB.push(best);
  }
  stageB.sort((a, b) => a.s.total - b.s.total);
  // finish the best and rescore with facades and daylight
  const finished = [];
  const seen = new Set();
  for (const { p } of stageB) {
    const key = JSON.stringify([p.D, p.Wq, p.Lw, p.arrangement, p.suite, p.df, p.split?.key, p.wetAt, p.pub, p.stack]);
    if (seen.has(key)) continue;
    seen.add(key);
    let plan;
    try {
      plan = finishPlan(buildSkeleton(p, prog), brief, style);
    } catch (e) {
      continue;
    }
    plan.porch = porchSpec(plan, brief, style);
    finished.push({ plan, score: score(plan, brief, style, true) });
    if (finished.length >= Math.max(keep * 3, 18)) break;
  }
  finished.sort((a, b) => a.score.total - b.score.total);
  // runners-up must differ in footprint or arrangement
  const designs = [];
  const shapes = new Set();
  for (const d of finished) {
    const k = `${d.plan.W}x${d.plan.D}/${d.plan.p.arrangement}/${d.plan.p.pub.layout}`;
    if (shapes.has(k) && designs.length) continue;
    shapes.add(k);
    designs.push(d);
    if (designs.length >= keep) break;
  }
  return { designs, evaluated, feasible };
}
