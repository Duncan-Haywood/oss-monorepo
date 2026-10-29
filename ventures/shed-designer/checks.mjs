// @ts-check
// Structural checks on a framed shed: floor joists, rafters, the ridge beam
// and its posts, door and window headers, and wall studs under snow and wind.
//
// Each check is a simple-span, allowable-stress (NDS) check on SPF No. 2
// lumber from structure.mjs (copied from open-house-plans, where it is pinned
// against the research track's Python). The loads are yours to set: roof snow
// load and wind pressure on the walls, plus 15 psf roof dead load, and 10 dead
// and 40 live on the floor. A ratio is demand over capacity, so 1.00 is at the
// limit. This is a screening check of the kind a span table encodes, not an
// engineer's review: connections, uplift, racking and foundations are not checked.

import { check, worst, studCheck, headerCheck, roofCase, FLOOR, SPF2, T, DEPTH } from './structure.mjs';
import { fmtIn } from './lumber.mjs';

const CF_C = { '2x4': 1.15, '2x6': 1.1 };

/** Axial check of a built-up post: column stability about its deep axis, and bearing on the plate. */
export function postCheck(plies, stud, lengthIn, P, CD = 1.15) {
  const d = DEPTH[stud];
  const A = plies * T * d;
  const FcStar = SPF2.Fc * CD * (CF_C[stud] || 1);
  const FcE = (0.822 * SPF2.Emin) / (lengthIn / d) ** 2;
  const a = FcE / FcStar;
  const b = (1 + a) / (2 * 0.8);
  const Cp = b - Math.sqrt(b * b - a / 0.8);
  return Math.max(P / A / (FcStar * Cp), P / A / SPF2.Fc_perp);
}

/**
 * @param {import('./model.mjs').Shed} shed
 */
export function structuralChecks(shed) {
  const d = shed.design;
  const k = shed.dims;
  const snow = d.snowLoad;
  const wind = d.windLoad;
  const cos = 1 / Math.sqrt(1 + (d.pitch / 12) ** 2);
  const roof = roofCase(snow);
  /** @type {{ member: string, size: string, detail: string, ratio: number, governs: string, ok: boolean }[]} */
  const rows = [];
  const add = (member, size, detail, ratio, governs) => rows.push({ member, size, detail, ratio, governs, ok: ratio <= 1 });

  // Floor joists span between skids.
  const gaps = k.skidYs.slice(1).map((y, i) => y - k.skidYs[i]);
  const skidThick = shed.members.find((m) => m.kind === 'skid')?.geom.thickness ?? 3.5;
  const floorSpanIn = Math.max(...gaps) - skidThick;
  {
    const [gov, r] = worst(check({ size: d.joistSize, spacingIn: d.joistSpacing, bearingIn: skidThick }, floorSpanIn / 12, FLOOR));
    add('Floor joists', `${d.joistSize} at ${d.joistSpacing}"`, `${fmtIn(floorSpanIn)} clear between skids, 40 psf live + 10 dead`, r, gov);
  }
  // Rafters: from the inside of the wall plate to the ridge.
  const beam = d.roofType === 'ridgeBeam';
  const rafterRunIn = d.width / 2 - (beam ? 1.5 : 0.75) - k.stud;
  {
    const [gov, r] = worst(check({ size: d.rafterSize, spacingIn: d.rafterSpacing, pitch: d.pitch, bearingIn: k.stud }, rafterRunIn / 12, roof));
    add('Rafters', `${d.rafterSize} at ${d.rafterSpacing}"`, `${fmtIn(rafterRunIn)} horizontal run at ${d.pitch}/12, ${snow} psf snow + 15 dead`, r, gov);
  }
  // Roof load on each eave wall per foot. Under a ridge beam the beam takes
  // the upper half of each rafter, so the wall carries the lower half of the
  // run plus the wall and the overhang. Under a ridge board the board carries
  // nothing (the rafter pair and its tie are a truss), so each eave wall
  // carries the whole half roof, ridge to eave tip.
  const tribFt = (beam ? rafterRunIn / 2 + k.stud + d.overhang : d.width / 2 + d.overhang) / 12;
  const deadPlf = (15 / cos) * tribFt;
  const snowPlf = snow * tribFt;
  if (beam) {
    const spanIn = d.length - 2 * k.stud;
    const [gov, r] = worst(check({ size: d.beamSize, plies: 2, spacingIn: d.width / 2, pitch: d.pitch, repetitive: false, bearingIn: 3 }, spanIn / 12, roof));
    add('Ridge beam', `2-ply ${d.beamSize}`, `${fmtIn(spanIn)} between the gable posts, carrying half of each roof slope`, r, gov);
    const wBeamPlf = (15 / cos + snow) * (d.width / 2) / 12;
    const P = (wBeamPlf * d.length) / 12 / 2;
    const postH = shed.members.find((m) => m.kind === 'beam post')?.length ?? 12;
    add('Ridge beam posts', `2-ply ${d.studSize}`, `${Math.round(P)} lb each, ${fmtIn(postH)} above the plate, then the two post studs to the floor`,
      Math.max(postCheck(2, d.studSize, postH, P), postCheck(2, d.studSize, k.studLen, P)), 'compression');
  } else {
    add('Ridge board', d.ridgeSize || k.ridgeSize, 'not a beam: rafter ties at the plate carry the rafters\' outward thrust', 0, 'none');
  }
  // Headers over doors and windows.
  for (const [name, wall] of Object.entries(shed.walls)) {
    for (const p of wall.openings) {
      const eave = name === 'front' || name === 'back';
      const wPlf = eave ? deadPlf + snowPlf + 10 : 40; // gable-end headers carry the gable wall above, not the roof
      const r = headerCheck(p.hdr, p.w, wPlf, 2, 1, d.studSize);
      add(`Header over the ${name} ${p.op.kind}`, `2-ply ${p.hdr}`, `${fmtIn(p.w)} opening, ${Math.round(wPlf)} lb/ft`, r, 'bending, shear, deflection or bearing');
    }
  }
  // Eave-wall studs: roof gravity plus wind on the face.
  {
    const r = studCheck(d.studSize, d.studSpacing, k.studLen, [deadPlf, snowPlf], wind);
    add('Wall studs', `${d.studSize} at ${d.studSpacing}"`, `${fmtIn(k.studLen)} tall, roof load plus ${wind} psf wind on the wall`, r, 'combined bending and compression');
  }
  return {
    rows,
    ok: rows.every((x) => x.ok),
    loads: { snow, wind, roofDead: 15, floorLive: 40, floorDead: 10 },
  };
}
