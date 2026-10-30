// @ts-check
// "Done for you": a few close variations of your design, built and priced,
// so you can pick one instead of trying every setting yourself. Each keeps
// your footprint, doors, windows, colours and the framing you chose (2x4 walls
// at your spacing), and changes one or two things a builder would actually
// weigh: roof pitch, rafter spacing, ridge beam or ridge board, overhang.
// They are ranked: passing the structural checks first, then cost.

import { buildShed, normalize } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { fmtFtIn, fmtIn } from './lumber.mjs';

/**
 * @param {any} design
 * @param {import('./estimate.mjs').Prices} [prices]
 */
// Settings a person can see, in plain words, for saying what one design changes from another.
const SAID = [
  ['length', 'length', (v) => fmtFtIn(v)], ['width', 'width', (v) => fmtFtIn(v)],
  ['wallHeight', 'walls', (v) => fmtFtIn(v)], ['pitch', 'roof pitch', (v) => `${v}/12`], ['overhang', 'overhang', (v) => fmtIn(v)],
  ['roofType', 'roof', (v) => (v === 'ridgeBeam' ? 'ridge beam on posts' : 'ridge board with rafter ties')], ['beamSize', 'ridge beam', (v) => `two-ply ${v}`],
  ['studSize', 'studs', String], ['studSpacing', 'studs', (v) => `${v}" on centre`], ['rafterSize', 'rafters', String], ['rafterSpacing', 'rafters', (v) => `${v}" on centre`],
  ['joistSize', 'floor joists', String], ['joistSpacing', 'floor joists', (v) => `${v}" on centre`], ['skidSize', 'skids', String],
  ['foundation', 'foundation', String], ['floorPanel', 'subfloor', String], ['sidingType', 'siding', String], ['roofCover', 'roofing', String],
  ['rafterSeat', 'rafter seat', (v) => (v === 'birdsmouth' ? 'birdsmouth notch' : 'connectors')], ['wallTrim', 'wall trim', String],
];

/**
 * What design `b` changes from design `a`, in plain words, both built: the
 * settings that differ and the members that come and go (rafter ties, plates,
 * posts), so two options that cost about the same can still be told apart.
 * @param {any} a the built shed you compare against @param {any} b the other built shed
 */
export function designDiff(a, b) {
  const out = [];
  const da = a.design; const db = b.design;
  for (const [k, name, f] of SAID) if (da[k] !== db[k]) out.push(`${name} ${f(da[k])} → ${f(db[k])}`);
  const doors = (d) => JSON.stringify(d.openings.map((o) => [o.kind, o.wall, o.width, o.height, o.product ?? '']));
  if (doors(da) !== doors(db)) out.push(`doors and windows: ${da.openings.length} → ${db.openings.length}, or different sizes or units`);
  if (Math.abs(a.dims.peak - b.dims.peak) > 0.06) out.push(`peak ${fmtFtIn(Math.round(a.dims.peak * 8) / 8)} → ${fmtFtIn(Math.round(b.dims.peak * 8) / 8)}`);
  // Members by kind: the biggest changes in count, which name what the settings imply.
  const count = (s) => s.members.reduce((m, x) => m.set(x.kind, (m.get(x.kind) || 0) + 1), new Map());
  const ca = count(a); const cb = count(b);
  const kinds = [...new Set([...ca.keys(), ...cb.keys()])]
    .map((k) => [k, (cb.get(k) || 0) - (ca.get(k) || 0)]).filter(([, n]) => n !== 0)
    .sort((x, y) => Math.abs(Number(y[1])) - Math.abs(Number(x[1]))).slice(0, 4);
  if (kinds.length) out.push(`members: ${kinds.map(([k, n]) => `${Number(n) > 0 ? '+' : ''}${n} ${k}`).join(', ')}`);
  return out;
}

export function generateCandidates(design, prices) {
  const base = buildShed(design);
  const b = base.design;
  /** @type {{ label: string, change: any }[]} */
  const variants = [
    { label: 'Your design as set', change: {} },
    { label: `Rafters at ${b.rafterSpacing === 24 ? 16 : 24}" on centre`, change: { rafterSpacing: b.rafterSpacing === 24 ? 16 : 24 } },
    { label: b.roofType === 'ridgeBeam' ? 'Ridge board with rafter ties (cheaper, ties across the room)' : 'Ridge beam on posts (open to the roof)', change: { roofType: b.roofType === 'ridgeBeam' ? 'ridgeBoard' : 'ridgeBeam' } },
    { label: `Steeper roof, ${Math.min(12, b.pitch + 1)}/12`, change: { pitch: Math.min(12, b.pitch + 1), autoPitch: false } },
    { label: `Lower roof, ${Math.max(3, b.pitch - 1)}/12`, change: { pitch: Math.max(3, b.pitch - 1), autoPitch: false } },
    { label: 'A foot of overhang', change: { overhang: 12, autoOverhang: false } },
    { label: 'Wider shed, same length (+1 ft)', change: { width: b.width + 12 } },
  ];
  const baseTotal = estimate(base, prices).total;
  const seen = new Set();
  const out = [];
  for (const v of variants) {
    const d = normalize({ ...design, ...v.change, name: `${b.name}: ${v.label.toLowerCase()}` });
    const shed = buildShed(d);
    const key = JSON.stringify({ ...shed.design, name: '' });
    if (seen.has(key)) continue;
    seen.add(key);
    const est = estimate(shed, prices);
    const checks = structuralChecks(shed);
    const worst = checks.rows.reduce((m, r) => Math.max(m, r.ratio), 0);
    out.push({
      label: v.label,
      changes: designDiff(base, shed),
      delta: est.total - baseTotal,
      design: { ...design, ...v.change, name: d.name },
      total: est.total,
      lumber: est.lumberCost,
      boards: est.boards,
      waste: est.lumber.reduce((t, l) => t + l.result.boards.reduce((u, x) => u + x.offcut, 0), 0),
      peak: shed.dims.peak,
      pitch: shed.design.pitch,
      overhang: shed.design.overhang,
      ok: checks.ok,
      worst,
      warnings: shed.warnings.length,
      summary: `${shed.design.pitch}/12, ${fmtIn(shed.design.overhang)} overhang, peak ${fmtFtIn(shed.dims.peak)}`,
    });
  }
  out.sort((a, b2) => (a.ok === b2.ok ? a.total - b2.total : a.ok ? -1 : 1));
  return out;
}
