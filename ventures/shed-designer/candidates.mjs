// @ts-check
// "Done for you": a few close variations of your design, built and priced,
// so you can pick one instead of trying every setting yourself. Each keeps
// your footprint, doors, windows, colours and the framing you chose (2x4 walls
// at your spacing), and changes one or two things a builder would actually
// weigh: roof pitch, rafter spacing, ridge beam or ridge board, overhang.
// They are ranked: passing the structural checks first, then cost.

import { buildShed, normalize, ROOF_TYPES } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { productById } from './products.mjs';
import { fmtFtIn, fmtIn } from './lumber.mjs';

/**
 * @param {any} design
 * @param {import('./estimate.mjs').Prices} [prices]
 */
// Settings a person can see, in plain words, for saying what one design changes from another.
/** @type {[string, string, (v: any) => string][]} */
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
  const base = buildShed(design, prices);
  const b = base.design;
  /** @type {{ label: string, change: any }[]} */
  const variants = [
    { label: 'Your design as set', change: {} },
    { label: `Rafters at ${b.rafterSpacing === 24 ? 16 : 24}" on centre`, change: { rafterSpacing: b.rafterSpacing === 24 ? 16 : 24 } },
    // A lean-to has no ridge; its other shape is the gable.
    ...(b.style === 'leanTo' ? [{ label: 'A gable roof instead of the lean-to', change: { style: 'gable' } }]
      : b.style === 'saltbox' ? [{ label: 'A gable roof instead of the saltbox', change: { style: 'gable' } }, ...ROOF_TYPES.filter((r) => r.type !== b.roofType && r.type !== 'truss').map((r) => ({ label: r.option, change: { roofType: r.type } }))] : ROOF_TYPES.filter((r) => r.type !== b.roofType).map((r) => ({ label: r.option, change: { roofType: r.type } }))),
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
    const shed = buildShed(d, prices);
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

/**
 * What each door and window really costs: the shed priced with it, less the
 * shed priced without it. That is the unit, plus its kings, jacks, header,
 * sill and cripples, its casing, caulk and flashing, less the studs it
 * replaces (and any change in how the boards pack). The lumber part is split out.
 * @param {any} design @param {import('./estimate.mjs').Prices} [prices]
 */
export function openingCosts(design, prices) {
  // Hold the walls, pitch and overhang where they are built now, so taking a
  // door out doesn't also lower the walls and charge that to the door.
  const built = buildShed(normalize(design), prices).design;
  const d = normalize({ ...built, autoWall: false, autoPitch: false, autoOverhang: false });
  const with_ = estimate(buildShed(d, prices), prices);
  return d.openings.map((op) => {
    const without = estimate(buildShed(normalize({ ...d, openings: d.openings.filter((o) => o.id !== op.id) }), prices), prices);
    const unpriced = op.product !== 'site-built' && !productById(op.product) && !d.customRange;
    return { id: op.id, total: with_.total - without.total, lumber: with_.lumberCost - without.lumberCost, unpriced };
  });
}
