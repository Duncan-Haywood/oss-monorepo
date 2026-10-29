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
