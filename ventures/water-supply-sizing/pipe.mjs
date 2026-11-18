// Pipe sizing for a water-supply tree: each segment's design flow comes from
// the fixtures downstream of it (demand.mjs), each segment is sized at one
// allowable friction rate set by the pressure budget of the tightest path
// (the uniform friction-rate method), and every fixture end is checked by
// walking the tree. Optionally (`trim`), the spare pressure on shorter paths
// is spent on smaller pipe while every end still holds the minimum.
//
// Friction: Hazen-Williams in US units, head loss per 100 ft of pipe
//   h (ft) = 0.2083 * (100 / C)^1.852 * Q^1.852 / d^4.8655   (Q gpm, d inches)
// and 1 ft of water = 0.433 psi. Velocity v (ft/s) = 0.4085 * Q / d^2.

import { demand } from './demand.mjs';

export const PSI_PER_FT = 0.433;

// Inside diameters from outside diameter and nominal wall, inches.
// Copper water tube: ASTM B88 outside diameters (nominal + 1/8 in) and walls.
// PEX: copper-tube-size outside diameters, SDR 9 wall (OD / 9, at least 0.070 in).
// Nominal dimensions; check the product you buy.
// An array, not an object: JavaScript lists integer-like keys ('1', '2')
// first, which would put 1 in ahead of 1/2 in.
const COPPER_OD = [['1/2', 0.625], ['3/4', 0.875], ['1', 1.125], ['1-1/4', 1.375], ['1-1/2', 1.625], ['2', 2.125]];
const WALLS = {
  'copper-k': { '1/2': 0.049, '3/4': 0.065, '1': 0.065, '1-1/4': 0.065, '1-1/2': 0.072, '2': 0.083 },
  'copper-l': { '1/2': 0.040, '3/4': 0.045, '1': 0.050, '1-1/4': 0.055, '1-1/2': 0.060, '2': 0.070 },
  'copper-m': { '1/2': 0.028, '3/4': 0.032, '1': 0.035, '1-1/4': 0.042, '1-1/2': 0.049, '2': 0.058 },
};
export const MATERIALS = {
  'copper-k': { label: 'Copper type K', c: 140 },
  'copper-l': { label: 'Copper type L', c: 140 },
  'copper-m': { label: 'Copper type M', c: 140 },
  'pex-sdr9': { label: 'PEX (CTS, SDR 9)', c: 150 },
};

export function sizesFor(material) {
  if (!MATERIALS[material]) throw new RangeError(`Unknown material "${material}"`);
  return COPPER_OD.map(([nominal, od]) => {
    const wall = material === 'pex-sdr9' ? Math.max(od / 9, 0.070) : WALLS[material][nominal];
    return { nominal, od, id: Math.round((od - 2 * wall) * 1000) / 1000 };
  });
}

export function frictionPsiPer100(gpm, idIn, c) {
  if (gpm <= 0) return 0;
  return 0.2083 * Math.pow(100 / c, 1.852) * Math.pow(gpm, 1.852) / Math.pow(idIn, 4.8655) * PSI_PER_FT;
}

export function velocityFps(gpm, idIn) {
  return 0.4085 * gpm / (idIn * idIn);
}

function validate(sys) {
  const e = [];
  const num = (v, name, lo, hi) => { if (!(Number(v) >= lo && Number(v) <= hi)) e.push(`${name} must be between ${lo} and ${hi}.`); };
  num(sys.staticPsi, 'Static pressure at the meter or tank (psi)', 1, 300);
  num(sys.minPsi ?? 20, 'Minimum pressure at a fixture (psi)', 0, 150);
  num(sys.meterLossPsi ?? 0, 'Meter, backflow and other fixed losses (psi)', 0, 100);
  num(sys.fittingsPct ?? 50, 'Fittings allowance (%)', 0, 300);
  num(sys.maxVelocityFps ?? 8, 'Maximum velocity (ft/s)', 1, 20);
  if (!MATERIALS[sys.material ?? 'copper-l']) e.push(`Unknown material "${sys.material}".`);
  const segs = sys.segments;
  if (!Array.isArray(segs) || !segs.length) { e.push('Add at least one pipe segment.'); return e; }
  const names = new Set();
  for (const s of segs) {
    if (!s?.name) { e.push('Every segment needs a name.'); continue; }
    if (names.has(s.name)) e.push(`Two segments are named "${s.name}".`);
    names.add(s.name);
    if (!(Number(s.lengthFt) > 0 && Number(s.lengthFt) <= 5000)) e.push(`${s.name}: length must be above 0 and at most 5,000 ft.`);
    if (!(Math.abs(Number(s.riseFt ?? 0)) <= 500)) e.push(`${s.name}: rise must be within ±500 ft.`);
  }
  const roots = segs.filter(s => !s.parent);
  if (roots.length !== 1) e.push(`Exactly one segment must start at the meter (no "from"); found ${roots.length}.`);
  for (const s of segs) if (s.parent && !names.has(s.parent)) e.push(`${s.name}: it starts from "${s.parent}", which is not a segment.`);
  // cycles
  const byName = Object.fromEntries(segs.map(s => [s.name, s]));
  for (const s of segs) {
    let cur = s, steps = 0;
    while (cur?.parent && steps <= segs.length) { cur = byName[cur.parent]; steps++; }
    if (steps > segs.length) { e.push(`${s.name}: the "from" links loop back on themselves.`); break; }
  }
  return e;
}

// Fixture counts served by each segment: its own plus everything downstream.
function servedCounts(segs, fixtureNames) {
  const kids = Object.fromEntries(segs.map(s => [s.name, []]));
  for (const s of segs) if (s.parent) kids[s.parent].push(s.name);
  const byName = Object.fromEntries(segs.map(s => [s.name, s]));
  const memo = {};
  const visit = name => {
    if (memo[name]) return memo[name];
    const own = byName[name].fixtures || {};
    const total = Object.fromEntries(fixtureNames.map(f => [f, Number(own[f] || 0)]));
    for (const k of kids[name]) { const sub = visit(k); for (const f of fixtureNames) total[f] += sub[f]; }
    return (memo[name] = total);
  };
  for (const s of segs) visit(s.name);
  return { counts: memo, kids };
}

export function sizeSystem(sys) {
  const errors = validate(sys);
  const fixtureTypes = sys.fixtureTypes || [];
  if (!fixtureTypes.length) errors.push('Define at least one fixture type.');
  const typeNames = fixtureTypes.map(f => f.name);
  for (const s of sys.segments || []) for (const f of Object.keys(s?.fixtures || {})) if (!typeNames.includes(f)) errors.push(`${s.name}: fixture type "${f}" is not defined.`);
  if (errors.length) return { errors };

  const material = sys.material ?? 'copper-l';
  const c = Number(sys.c ?? MATERIALS[material].c);
  const sizes = sizesFor(material);
  const minPsi = Number(sys.minPsi ?? 20), meterLoss = Number(sys.meterLossPsi ?? 0);
  const fit = 1 + Number(sys.fittingsPct ?? 50) / 100, vmax = Number(sys.maxVelocityFps ?? 8);
  const opts = { tail: Number(sys.tail ?? 0.01), truncate: Boolean(sys.truncate) };
  const segs = sys.segments;
  const byName = Object.fromEntries(segs.map(s => [s.name, s]));
  const { counts, kids } = servedCounts(segs, typeNames);

  const rows = {};
  for (const s of segs) {
    const groups = fixtureTypes.map(f => ({ ...f, count: counts[s.name][f.name] }));
    const any = groups.some(g => g.count > 0);
    const d = any ? demand(groups, opts) : null;
    if (d?.errors?.length) return { errors: d.errors.map(x => `${s.name}: ${x}`) };
    rows[s.name] = { name: s.name, parent: s.parent || null, lengthFt: Number(s.lengthFt), riseFt: Number(s.riseFt || 0), served: counts[s.name], gpm: d ? d.designGpm : 0 };
  }

  // Paths from the meter to each end segment (a segment with nothing after it).
  const ends = segs.filter(s => kids[s.name].length === 0).map(s => s.name);
  const pathTo = name => { const p = []; for (let cur = name; cur; cur = byName[cur].parent) p.unshift(cur); return p; };
  const paths = Object.fromEntries(ends.map(e => [e, pathTo(e)]));
  const developed = p => p.reduce((a, n) => a + rows[n].lengthFt, 0) * fit;
  const rise = p => p.reduce((a, n) => a + rows[n].riseFt, 0);
  let critical = ends[0], worstRate = Infinity;
  for (const e of ends) {
    const avail = Number(sys.staticPsi) - meterLoss - minPsi - PSI_PER_FT * rise(paths[e]);
    const rate = avail / developed(paths[e]) * 100;
    if (rate < worstRate) { worstRate = rate; critical = e; }
  }
  const allowable = worstRate;
  const warnings = [];
  if (!(allowable > 0)) {
    return { errors: [`There is no pressure left for friction on the path to "${critical}": static ${sys.staticPsi} psi less fixed losses ${meterLoss}, the minimum ${minPsi} and the climb of ${(PSI_PER_FT * rise(paths[critical])).toFixed(1)} psi is ${(allowable * developed(paths[critical]) / 100).toFixed(1)} psi. A booster pump or a lower minimum is needed.`] };
  }

  const pick = (gpm, from = 0) => {
    for (let i = from; i < sizes.length; i++) if (frictionPsiPer100(gpm, sizes[i].id, c) <= allowable + 1e-9 && velocityFps(gpm, sizes[i].id) <= vmax + 1e-9) return i;
    return -1;
  };
  for (const r of Object.values(rows)) {
    let i = r.gpm > 0 ? pick(r.gpm) : 0;
    if (i < 0) { i = sizes.length - 1; warnings.push(`${r.name}: even ${sizes[i].nominal} in is over the friction or velocity limit at ${r.gpm} gpm.`); }
    r.sizeIndex = i;
  }

  const lossOf = r => frictionPsiPer100(r.gpm, sizes[r.sizeIndex].id, c) * r.lengthFt * fit / 100;
  const endPressure = e => Number(sys.staticPsi) - meterLoss - paths[e].reduce((a, n) => a + lossOf(rows[n]) + PSI_PER_FT * rows[n].riseFt, 0);
  // The uniform friction rate comes from the tightest path, so every end
  // already holds the minimum; ends on shorter or lower paths hold more than
  // they need. With `trim`, that spare pressure buys smaller pipe: longest
  // segments first, step a size down while velocity stays in the limit and
  // every end still holds the minimum, until no step is possible.
  const allEndsHold = () => ends.every(e => endPressure(e) >= minPsi - 1e-9);
  for (const e of ends) if (endPressure(e) < minPsi - 1e-9) warnings.push(`${e}: ${endPressure(e).toFixed(1)} psi, below the ${minPsi} psi minimum even at the sizes chosen.`);
  let trimmed = 0;
  if (sys.trim && allEndsHold()) {
    const order = Object.values(rows).sort((a, b) => b.lengthFt - a.lengthFt);
    for (let changed = true; changed;) {
      changed = false;
      for (const r of order) {
        if (r.sizeIndex === 0 || r.gpm === 0) continue;
        if (velocityFps(r.gpm, sizes[r.sizeIndex - 1].id) > vmax + 1e-9) continue;
        r.sizeIndex--;
        if (allEndsHold()) { trimmed++; changed = true; } else r.sizeIndex++;
      }
    }
  }

  const out = segs.map(s => {
    const r = rows[s.name], sz = sizes[r.sizeIndex];
    return {
      name: r.name, from: r.parent, lengthFt: r.lengthFt, riseFt: r.riseFt, served: r.served, gpm: r.gpm,
      nominal: sz.nominal, idIn: sz.id,
      velocityFps: velocityFps(r.gpm, sz.id), psiPer100: frictionPsiPer100(r.gpm, sz.id, c), lossPsi: lossOf(r),
    };
  });
  const endRows = ends.map(e => ({ end: e, path: paths[e], developedFt: developed(paths[e]), riseFt: rise(paths[e]), pressurePsi: endPressure(e) }));
  return { errors: [], warnings, material, c, allowablePsiPer100: allowable, criticalEnd: critical, trimmed, segments: out, ends: endRows };
}

export const EXAMPLE_SYSTEM = Object.freeze({
  // Illustrative inputs for a two-bath house, not measured data. Replace the
  // flows with your fixtures' ratings and the timings with your household's.
  staticPsi: 60, meterLossPsi: 6, minPsi: 20, fittingsPct: 50, maxVelocityFps: 8,
  material: 'copper-l', tail: 0.01, truncate: false,
  fixtureTypes: [
    { name: 'Shower', gpm: 2.5, seconds: 480, usesPerHour: 2 },
    { name: 'Lavatory', gpm: 1.5, seconds: 20, usesPerHour: 10 },
    { name: 'Toilet (tank fill)', gpm: 3, seconds: 40, usesPerHour: 6 },
    { name: 'Kitchen sink', gpm: 1.8, seconds: 60, usesPerHour: 6 },
    { name: 'Dishwasher', gpm: 1.5, seconds: 120, usesPerHour: 1 },
    { name: 'Clothes washer', gpm: 3, seconds: 180, usesPerHour: 1 },
    { name: 'Hose bibb', gpm: 5, seconds: 600, usesPerHour: 0.5 },
  ],
  segments: [
    { name: 'Service to house', lengthFt: 60, riseFt: 0, fixtures: { 'Hose bibb': 1 } },
    { name: 'Main trunk', parent: 'Service to house', lengthFt: 25, riseFt: 0, fixtures: { 'Kitchen sink': 1, Dishwasher: 1, 'Clothes washer': 1 } },
    { name: 'Riser to upstairs', parent: 'Main trunk', lengthFt: 20, riseFt: 10, fixtures: {} },
    { name: 'Upstairs bath', parent: 'Riser to upstairs', lengthFt: 15, riseFt: 0, fixtures: { Shower: 1, Lavatory: 2, 'Toilet (tank fill)': 1 } },
    { name: 'Hall bath', parent: 'Riser to upstairs', lengthFt: 25, riseFt: 0, fixtures: { Shower: 1, Lavatory: 1, 'Toilet (tank fill)': 1 } },
    { name: 'Powder room', parent: 'Main trunk', lengthFt: 18, riseFt: 0, fixtures: { Lavatory: 1, 'Toilet (tank fill)': 1 } },
  ],
});
