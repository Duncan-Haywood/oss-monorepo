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

/** The widest stud spacing the siding is rated for, in inches. */
export function sidingSpan(d) {
  if (!d.siding) return 24;
  // Panel siding is its own sheathing: T1-11 and LP's 3/8" panel are rated for studs at 16" (see the panel's stamp);
  // LP's 7/16" panel and lap siding over OSB take 24".
  return d.sidingType === 'T1-11' || d.sidingType === 'LP SmartSide' ? 16 : 24;
}

/** The moves the search may make from a design. */
function moves(d, base, resize) {
  const out = [];
  const set = (label, change) => out.push({ label, change });
  // Shingles want 4/12 or steeper (makers allow 2-4/12 only with a double underlayment); metal goes to 3/12.
  for (const p of [3, 4, 5, 6, 7, 8]) if (p >= (d.roofCover === 'metal' ? 3 : 4) && (p !== d.pitch || d.autoPitch)) set(`roof ${p}/12`, { pitch: p, autoPitch: false });
  // Some overhang always: it keeps rain off the siding and the trim.
  for (const o of [4, 6, 8, 12, 16]) if (o !== d.overhang || d.autoOverhang) set(`${o}" overhang`, { overhang: o, autoOverhang: false });
  set(`rafters ${d.rafterSpacing === 24 ? 16 : 24}" o.c.`, { rafterSpacing: d.rafterSpacing === 24 ? 16 : 24 });
  if (d.studSpacing === 24 || sidingSpan(d) >= 24) set(`studs ${d.studSpacing === 24 ? 16 : 24}" o.c.`, { studSpacing: d.studSpacing === 24 ? 16 : 24 });
  set(d.rafterSeat === 'connector' ? 'birdsmouth seats' : 'variable-pitch connectors', { rafterSeat: d.rafterSeat === 'connector' ? 'birdsmouth' : 'connector' });
  set(d.roofType === 'ridgeBeam' ? 'ridge board and ties' : 'ridge beam on posts', { roofType: d.roofType === 'ridgeBeam' ? 'ridgeBoard' : 'ridgeBeam' });
  // Only when asked: a foot either way on the length or width, never below 85% of the floor asked for.
  if (!resize) return out;
  for (const [k, dv] of [['length', 12], ['length', -12], ['width', 12], ['width', -12]]) {
    const next = { ...d, [k]: d[k] + dv };
    if (next.length < 72 || next.width < 72) continue;
    if (next.length * next.width < 0.85 * base.length * base.width) continue;
    set(`${dv > 0 ? '+' : '-'}1 ft ${k}`, { [k]: d[k] + dv });
  }
  return out;
}

/** Goals: dollars, plus a price on each cut and each angled cut or notch (your time). */
export const GOALS = {
  cheapest: { label: 'Cheapest', perCut: 0, perAngled: 0 },
  balanced: { label: 'Fewer cuts for a little more', perCut: 1, perAngled: 4 },
  simplest: { label: 'Fewest and simplest cuts', perCut: 5, perAngled: 20 },
};

/**
 * @param {any} design
 * @param {import('./estimate.mjs').Prices} [prices]
 * @param {{ rounds?: number, resize?: boolean }} [opts]
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
  const peakCap = start.maxPeak > 0 && base.peak <= start.maxPeak ? start.maxPeak : base.peak + 1;
  const feasible = (r) => r.ok && (!(start.maxFootprint > 0) || r.footprint <= start.maxFootprint + 1e-9) && r.peak <= peakCap + 0.01;
  const winners = {};
  for (const [goal, g] of Object.entries(GOALS)) {
    const score = (r) => r.total + g.perCut * r.cuts.straight + g.perAngled * (r.cuts.angled + 2 * r.cuts.notches);
    let cur = base;
    const path = [];
    for (let i = 0; i < rounds; i++) {
      let best = null;
      for (const mv of moves(cur.design, start, Boolean(opts.resize))) {
        const r = get(normalize({ ...cur.design, ...mv.change }));
        if (!feasible(r)) continue;
        if (score(r) < score(best ? best.r : cur) - 0.5) best = { r, mv };
      }
      if (!best) break;
      cur = best.r;
      path.push(best.mv.label);
    }
    winners[goal] = { ...cur, goal: g.label, changes: path, score: score(cur) };
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

function keyOf(d) { return JSON.stringify({ ...d, name: '' }); }

function evaluate(d, prices) {
  const shed = buildShed(d);
  const est = estimate(shed, prices);
  const sc = structuralChecks(shed);
  const cc = connectionChecks(shed);
  const cuts = cutMetrics(shed, est);
  return {
    design: shed.design, total: est.total, boards: est.boards, cuts, ok: sc.ok && cc.ok,
    peak: shed.dims.peak, footprint: (shed.design.length * shed.design.width) / 144,
    pitch: shed.design.pitch, overhang: shed.design.overhang,
  };
}
