// @ts-check
// Parametric search for a simpler, cheaper build of the same shed. It counts
// the saw cuts a design needs (and which of them are angled or notched),
// then nudges one setting at a time (pitch, overhang, rafter and stud
// spacing, rafter seat, ridge type, a foot on the length or width within the
// footprint limit) and keeps a change only if the shed still passes every
// load and connection check, stays inside the footprint limit and gets no
// taller than 1" (or over the peak limit). It runs a greedy search for each of three goals and returns the
// winners plus every design it found that no other beats on cost, cuts and
// angled cuts at once.

import { buildShed, normalize } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { BLOCKS } from './model.mjs';
import { PRODUCTS } from './products.mjs';

/**
 * Saw cuts the build needs. A board cut into n pieces takes n cuts (one fewer
 * when the last piece uses the board's full remaining length). Angled cuts:
 * rafter plumb cuts (tail and ridge), sloped tops on gable studs and vent
 * trimmers, bevelled eave blocks, door braces and raked siding panels.
 * Notches: two cuts each for a birdsmouth.
 * @param {import('./model.mjs').Shed} shed
 * @param {import('./estimate.mjs').Estimate} est
 */
export function cutMetrics(shed, est) {
  let straight = 0;
  for (const l of est.lumber) for (const b of l.result.boards) straight += b.cuts.length - (b.offcut < 0.25 ? 1 : 0);
  if (est.trimCuts) for (const b of est.trimCuts.boards) straight += b.cuts.length;
  let angled = 0;
  let notches = 0;
  const all = [...shed.members, ...(shed.doorParts || [])];
  for (const m of all) {
    if (m.kind === 'rafter') { angled += shed.dims.overhang > 0 ? 2 : 1; if (!shed.dims.connector) notches += 1; }
    else if (m.kind === 'gable stud' || m.kind === 'vent trimmer' || m.kind === 'post stud' && m.group.startsWith('gable')) angled += 1;
    else if (m.kind === 'eave blocking') angled += 1;
    else if (m.kind === 'door brace') angled += 2;
  }
  for (const p of shed.panels) if (p.kind === 'siding' && p.geom.profile.length > 4) angled += 2;
  const offcut = est.lumber.reduce((t, l) => t + l.result.boards.reduce((u, x) => u + x.offcut, 0), 0);
  const bought = est.lumber.reduce((t, l) => t + l.result.boards.reduce((u, x) => u + x.stock, 0), 0);
  return { straight, angled, notches, total: straight + angled + 2 * notches, waste: bought ? offcut / bought : 0 };
}

const SIDING_NAMES = { 'T1-11': 'T1-11 plywood panels', 'LP SmartSide': 'LP SmartSide 38 Series primed panels, 3/8"', 'LP SmartSide 7/16': 'LP SmartSide 76 Series primed panels, 7/16"', 'board and batten': 'board and batten over OSB', vinyl: 'vinyl lap over OSB, with its starter, J-channel and corner posts' };

/** The widest stud spacing the siding is rated for, in inches. */
export function sidingSpan(d) {
  if (!d.siding) return 24;
  // Panel siding is its own sheathing: T1-11 and LP's 3/8" panel are rated for studs at 16" (see the panel's stamp);
  // LP's 7/16" panel and lap siding over OSB take 24".
  return d.sidingType === 'T1-11' || d.sidingType === 'LP SmartSide' ? 16 : 24;
}

/**
 * Minutes to put each bought unit in place, by shopping-list item: our own
 * planning figures for one capable person with a helper for lifts, not a
 * measured rate.
 */
export const MINUTES = {
  floorSheet: 12, floorOSB: 12, roofSheet: 12, wallSheathing: 12,
  siding8: 15, siding9: 16, siding10: 18, lpPanel: 15, lpPanel9: 16, lpPanel10: 18, lpPanel76: 15, lpPanel76x9: 16, lpPanel76x10: 18,
  vinylBox: 240, vinylJ: 10, vinylStarter: 8, vinylCorner: 15, hardiePlank: 10, boardBox: 20, battenBox: 30,
  shingleBundle: 25, starterShingle: 20, ridgeCapShingle: 30, underlayment: 45, dripEdge: 10, metalPanel: 10, metalRidge: 15,
  fasciaTrim: 15, soffitPanel: 20, rakeTrim: 15, gableVent: 30, zFlashing: 10,
  paint: 45, stain: 45, accentPaint: 60, interiorPaint: 45, glitter: 0,
  insulation: 30, drywall: 20, plywoodLining: 15, osbLining: 15, pegboard: 15, beadboard: 15, interiorPanel: 15, jointCompound: 120,
  deckBlock: 10, cmuBlock: 10, concreteBlock: 10, gravelTon: 90, paverBase: 4, landscapeFabric: 15,
};

/**
 * A rough count of the hours to build it, for weighing your time against
 * material: every cut (a straight cut 1 minute, an angled one 2.5, a birdsmouth
 * 4), every framing member placed and nailed (2.5), every connector or hanger
 * (2), every trim board (8), each window (45) and door (prehung 90, site-built
 * 180), and each bought unit at the minutes in MINUTES.
 * @param {import('./model.mjs').Shed} shed
 * @param {import('./estimate.mjs').Estimate} est
 * @param {ReturnType<typeof cutMetrics>} [cuts]
 */
export function laborHours(shed, est, cuts = cutMetrics(shed, est)) {
  const d = shed.design;
  let min = cuts.straight * 1 + cuts.angled * 2.5 + cuts.notches * 4;
  min += (shed.members.length + (shed.doorParts || []).length) * 2.5;
  min += shed.fixtures.filter((f) => f.kind === 'connector').length;
  min += (shed.wallTrim || []).length * 8;
  for (const r of est.shopping) {
    const m = /** @type {Record<string, number>} */ (MINUTES)[r.source?.key];
    if (m) min += m * r.qty;
  }
  for (const o of d.openings) min += o.kind === 'window' ? 45 : o.product === 'site-built' ? 180 : 90;
  return Math.round((min / 60) * 10) / 10;
}

/** The moves the search may make from a design. */
function moves(d, base, resize, opts = {}) {
  const out = [];
  const set = (label, change, group = Object.keys(change).join('+')) => out.push({ label, change, group });
  // Shingles want 4/12 or steeper (makers allow 2-4/12 only with a double underlayment); metal goes to 3/12.
  for (const p of [3, 4, 5, 6, 7, 8]) if (p >= (d.roofCover === 'metal' ? 3 : 4) && (p !== d.pitch || d.autoPitch)) set(`roof ${p}/12`, { pitch: p, autoPitch: false });
  // Some overhang always: it keeps rain off the siding and the trim.
  for (const o of [4, 6, 8, 12, 16]) if (o !== d.overhang || d.autoOverhang) set(`${o}" overhang`, { overhang: o, autoOverhang: false });
  set(`rafters ${d.rafterSpacing === 24 ? 16 : 24}" o.c.`, { rafterSpacing: d.rafterSpacing === 24 ? 16 : 24 });
  // Smaller or larger rafters: kept only if the strength checks still pass.
  for (const sz of ['2x4', '2x6', '2x8']) if (sz !== d.rafterSize) set(`${sz} rafters`, { rafterSize: sz });
  if (d.studSpacing === 24 || sidingSpan(d) >= 24) set(`studs ${d.studSpacing === 24 ? 16 : 24}" o.c.`, { studSpacing: d.studSpacing === 24 ? 16 : 24 });
  set(d.rafterSeat === 'connector' ? 'birdsmouth seats' : 'variable-pitch connectors', { rafterSeat: d.rafterSeat === 'connector' ? 'birdsmouth' : 'connector' });
  set(d.roofType === 'ridgeBeam' ? 'ridge board and ties' : 'ridge beam on posts', { roofType: d.roofType === 'ridgeBeam' ? 'ridgeBoard' : 'ridgeBeam' });
  // Off-the-shelf swaps, when asked: another stock door or window, siding,
  // roofing, foundation, gravel and subfloor.
  if (opts.products) {
    for (const op of d.openings.filter((o) => o.kind === 'door' && o.product !== 'site-built')) {
      for (const pr of PRODUCTS.filter((x) => x.kind === 'door' && x.id !== op.product)) {
        set(`door ${op.id}: ${pr.name}`, { openings: d.openings.map((o) => (o.id === op.id ? { ...o, product: pr.id } : o)) }, `door ${op.id}`);
      }
    }
    if (d.openings.some((o) => o.kind === 'window')) {
      for (const pr of PRODUCTS.filter((x) => x.kind === 'window')) {
        if (d.openings.every((o) => o.kind !== 'window' || o.product === pr.id)) continue;
        set(`windows: ${pr.name}`, { openings: d.openings.map((o) => (o.kind === 'window' ? { ...o, product: pr.id } : o)) }, 'windows');
      }
    }
    // Fiber cement is left out: its trim boards are not priced yet, so it would look cheaper than it is.
    for (const t of ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16', 'board and batten', 'vinyl']) if (d.siding && t !== d.sidingType) set(`siding: ${SIDING_NAMES[t] || t}`, { sidingType: t });
    set(d.roofCover === 'metal' ? 'shingle roof' : 'metal roof', { roofCover: d.roofCover === 'metal' ? 'shingles' : 'metal' });
    for (const f of ['gravel', ...Object.keys(BLOCKS)]) if (f !== d.foundation) set(f === 'gravel' ? 'skids on a gravel pad' : `skids on ${/** @type {any} */ (BLOCKS)[f].plural}`, { foundation: f }, 'foundation');
    if (d.foundation !== 'gravel') for (const pd of ['full', 'under blocks', 'none']) if (pd !== d.pad) set({ full: 'a full gravel pad', 'under blocks': 'gravel only under the blocks', none: 'no gravel: blocks on tamped soil' }[pd], { pad: pd }, 'pad');
    // Blocks pay off only with the gravel cut back to under them, so offer the pair as one move.
    for (const f of Object.keys(BLOCKS)) if (f !== d.foundation || d.pad !== 'under blocks') set(`skids on ${/** @type {any} */ (BLOCKS)[f].plural}, gravel only under the blocks`, { foundation: f, pad: 'under blocks' }, 'foundation');
    set(d.floorPanel === 'OSB' ? 'plywood subfloor' : 'OSB subfloor', { floorPanel: d.floorPanel === 'OSB' ? 'plywood' : 'OSB' });
  }
  // Only when asked: a foot either way on the length or width, never below 85% of the floor asked for.
  const kept = () => (opts.keep ? out.filter((m) => !Object.keys(m.change).some((k) => opts.keep.includes(k))) : out);
  if (!resize) return kept();
  for (const [k, dv] of /** @type {[string, number][]} */ ([['length', 12], ['length', -12], ['width', 12], ['width', -12]])) {
    const next = { ...d, [k]: d[k] + dv };
    if (next.length < 72 || next.width < 72) continue;
    if (next.length * next.width < 0.85 * base.length * base.width) continue;
    set(`${dv > 0 ? '+' : '-'}1 ft ${k}`, { [k]: d[k] + dv });
  }
  return kept();
}

/** Goals: dollars, plus a price on each cut and each angled cut or notch (your time). */
export const GOALS = {
  cheapest: { label: 'Cheapest materials', perCut: 0, perAngled: 0, time: false },
  balanced: { label: 'Cheapest counting your time', perCut: 0, perAngled: 0, time: true },
  simplest: { label: 'Fewest and simplest cuts', perCut: 5, perAngled: 20, time: false },
};

/**
 * @param {any} design
 * @param {import('./estimate.mjs').Prices} [prices]
 * @param {{ rounds?: number, resize?: boolean, products?: boolean, peakSlack?: number, goals?: string[], keep?: string[], maxRatio?: number, clean?: boolean }} [opts]
 *   maxRatio: the most any structural check may be used (1 = right at its limit);
 *   clean: only designs the model has no warning about
 */
export function simplify(design, prices, opts = {}) {
  const rounds = opts.rounds ?? 6;
  const start = normalize(design);
  const base = evaluate(start, prices);
  /** @type {Map<string, any>} */
  const cache = new Map([[keyOf(start), base]]);
  const get = (d) => {
    const k = keyOf(d);
    if (!cache.has(k)) cache.set(k, evaluate(d, prices));
    return cache.get(k);
  };
  // Never over the peak limit if the design meets it, and never more than 1" taller than it is.
  const peakCap = start.maxPeak > 0 && base.peak <= start.maxPeak ? start.maxPeak : base.peak + (opts.peakSlack ?? 1);
  const feasible = (r) => r.ok && (!(start.maxFootprint > 0) || r.footprint <= start.maxFootprint + 1e-9) && r.peak <= peakCap + 0.01
    && (!(opts.maxRatio > 0) || r.worst <= opts.maxRatio + 1e-9) && (!opts.clean || r.warnings === 0);
  const winners = {};
  for (const [goal, g] of Object.entries(GOALS).filter(([k]) => !opts.goals || opts.goals.includes(k))) {
    const score = (r) => r.total + (g.time ? r.timeCost : 0) + g.perCut * r.cuts.straight + g.perAngled * (r.cuts.angled + 2 * r.cuts.notches);
    let cur = base;
    const path = [];
    /** @type {{ label: string, saving: number, materials?: number, hours?: number }[]} */
    const steps = [];
    for (let i = 0; i < rounds; i++) {
      let best = null;
      for (const mv of moves(cur.design, start, Boolean(opts.resize), opts)) {
        const r = get(normalize({ ...cur.design, ...mv.change }));
        if (!feasible(r)) continue;
        if (score(r) < score(best ? best.r : cur) - 0.5) best = { r, mv };
      }
      if (!best) break;
      steps.push({ label: best.mv.label, saving: Math.round((cur.total - best.r.total) * 100) / 100 });
      cur = best.r;
      path.push(best.mv.label);
    }
    winners[goal] = { ...cur, goal: g.label, changes: path, steps, score: score(cur) };
  }
  // Every feasible design found that nothing else beats on cost, cuts and angled cuts at once.
  const found = [...cache.values()].filter(feasible);
  const beats = (a, b) => a.total <= b.total && a.cuts.straight <= b.cuts.straight && a.cuts.angled + 2 * a.cuts.notches <= b.cuts.angled + 2 * b.cuts.notches
    && (a.total < b.total || a.cuts.straight < b.cuts.straight || a.cuts.angled + 2 * a.cuts.notches < b.cuts.angled + 2 * b.cuts.notches);
  const seenFront = new Set();
  const front = found.filter((a) => !found.some((b) => beats(b, a))).sort((a, b) => a.total - b.total)
    .filter((a) => { const k = `${a.total}|${a.cuts.straight}|${a.cuts.angled}|${a.cuts.notches}`; if (seenFront.has(k)) return false; seenFront.add(k); return true; });
  return { base, winners, front, evaluated: cache.size };
}

/**
 * The cheapest build of the same footprint from off-the-shelf parts: stock doors
 * and windows, siding, roofing, foundation, gravel and subfloor as well as the
 * framing moves. It may raise the peak by up to 6" (a taller stock door needs
 * taller walls) and says so.
 * @param {any} design @param {import('./estimate.mjs').Prices} [prices]
 * @param {{ keep?: string[] }} [opts] design keys the search leaves as they are
 */
export function budget(design, prices, opts = {}) {
  const start = normalize(design);
  // Materials plus your time at your labour rate: the apples-to-apples cost.
  const cost = (r) => r.total + r.timeCost;
  /** A step's saving, in all and split into materials and hours. */
  const step = (label, from, to) => ({ label, saving: Math.round((cost(from) - cost(to)) * 100) / 100, materials: Math.round((from.total - to.total) * 100) / 100, hours: Math.round((from.hours - to.hours) * 10) / 10 });
  const keep = opts.keep ?? ['roofType', 'rafterSeat'];
  const base = evaluate(start, prices);
  /** @type {Map<string, any>} */
  const cache = new Map([[keyOf(start), base]]);
  const get = (d) => { const k = keyOf(d); if (!cache.has(k)) cache.set(k, evaluate(d, prices)); return cache.get(k); };
  const peakCap = start.maxPeak > 0 && base.peak <= start.maxPeak ? start.maxPeak : base.peak + 6;
  const feasible = (r) => r.ok && (!(start.maxFootprint > 0) || r.footprint <= start.maxFootprint + 1e-9) && r.peak <= peakCap + 0.01;
  const mopts = { products: true, keep };
  // 1. Price every single move from your design.
  const singles = moves(start, start, false, mopts).map((mv) => ({ mv, r: get(normalize({ ...start, ...mv.change })) }))
    .filter((x) => feasible(x.r) && cost(x.r) < cost(base) - 0.5).sort((a, b) => cost(a.r) - cost(b.r));
  // 2. Apply them biggest saving first, one per group, keeping each only if it still saves.
  let cur = base;
  /** @type {{ label: string, saving: number, materials?: number, hours?: number }[]} */
  const steps = [];
  const used = new Set();
  for (const { mv } of singles) {
    if (used.has(mv.group)) continue;
    const r = get(normalize({ ...cur.design, ...mv.change, ...(mv.group.startsWith('door') || mv.group === 'windows' ? { openings: mergeOpenings(cur.design.openings, mv.change.openings) } : {}) }));
    if (!feasible(r) || cost(r) >= cost(cur) - 0.5) continue;
    used.add(mv.group);
    steps.push(step(mv.label, cur, r));
    cur = r;
  }
  // 3. Polish: from there, the best remaining single move, until none saves.
  for (let i = 0; i < 4; i++) {
    let best = null;
    for (const mv of moves(cur.design, start, false, mopts)) {
      const r = get(normalize({ ...cur.design, ...mv.change }));
      if (feasible(r) && cost(r) < cost(best ? best.r : cur) - 0.5) best = { r, mv };
    }
    if (!best) break;
    steps.push(step(best.mv.label, cur, best.r));
    cur = best.r;
  }
  // What the kept structure choices would save on top, each on its own.
  const alsoKept = moves(cur.design, start, false, { products: true }).filter((mv) => Object.keys(mv.change).some((k) => keep.includes(k)))
    .map((mv) => ({ label: mv.label, r: get(normalize({ ...cur.design, ...mv.change })) }))
    .filter((x) => feasible(x.r) && cost(x.r) < cost(cur) - 0.5)
    .map((x) => ({ ...step(x.label, cur, x.r), cuts: x.r.cuts }));
  // Savings held back only by the height allowance, with the peak each would give.
  const okButTall = (r) => r.ok && (!(start.maxFootprint > 0) || r.footprint <= start.maxFootprint + 1e-9) && r.peak > peakCap + 0.01;
  const taller = moves(cur.design, start, false, mopts).map((mv) => ({ label: mv.label, r: get(normalize({ ...cur.design, ...mv.change })) }))
    .filter((x) => okButTall(x.r) && cost(x.r) < cost(cur) - 0.5)
    .map((x) => ({ ...step(x.label, cur, x.r), peak: x.r.peak }))
    .sort((a, b) => b.saving - a.saving).slice(0, 4);
  return { base, best: { ...cur, steps }, also: alsoKept, taller, peakCap, evaluated: cache.size, keep };
}

/** Openings from one move laid over another's: each opening keeps the latest product chosen for it. */
function mergeOpenings(current, changed) {
  return current.map((o) => {
    const c = changed.find((x) => x.id === o.id);
    return c && c.product !== o.product ? { ...o, product: c.product } : o;
  });
}

function keyOf(d) { return JSON.stringify({ ...d, name: '' }); }

function evaluate(d, prices) {
  const shed = buildShed(d);
  const est = estimate(shed, prices);
  const sc = structuralChecks(shed);
  const cc = connectionChecks(shed);
  const cuts = cutMetrics(shed, est);
  const hours = laborHours(shed, est, cuts);
  return {
    hours, timeCost: Math.round(hours * (shed.design.laborRate ?? 0) * 100) / 100,
    design: shed.design, total: est.total, boards: est.boards, cuts, ok: sc.ok && cc.ok,
    worst: sc.rows.reduce((m, x) => Math.max(m, x.ratio), 0), warnings: shed.warnings.length,
    peak: shed.dims.peak, footprint: (shed.design.length * shed.design.width) / 144,
    pitch: shed.design.pitch, overhang: shed.design.overhang,
  };
}
