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
import { subfloorCheck } from './levers.mjs';

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
 * Reference lateral design value Z (lb) of one nail in single shear, wood to
 * wood, by the NDS yield limit equations (NDS 12.3.1, Rd = 2.2 for D <= 0.17").
 * D diameter, side member thickness ls, main-member penetration lm (inches),
 * specific gravity G of both members, Fyb nail bending yield strength (psi).
 */
export function nailZ(D, ls, lm, G = 0.42, Fyb = 90000) {
  const Fe = 16600 * G ** 1.84; // dowel bearing strength for D < 1/4"
  const Re = 1, Rt = lm / ls, Rd = 2.2;
  const k1 = (Math.sqrt(Re + 2 * Re ** 2 * (1 + Rt + Rt ** 2) + Rt ** 2 * Re ** 3) - Re * (1 + Rt)) / (1 + Re);
  const k2 = -1 + Math.sqrt(2 * (1 + Re) + (2 * Fyb * (1 + 2 * Re) * D ** 2) / (3 * Fe * lm ** 2));
  const k3 = -1 + Math.sqrt((2 * (1 + Re)) / Re + (2 * Fyb * (2 + Re) * D ** 2) / (3 * Fe * ls ** 2));
  return Math.min(
    (D * lm * Fe) / Rd,
    (D * ls * Fe) / Rd,
    (k1 * D * ls * Fe) / Rd,
    (k2 * D * lm * Fe) / ((1 + 2 * Re) * Rd),
    (k3 * D * ls * Fe) / ((2 + Re) * Rd),
    ((D ** 2) / Rd) * Math.sqrt((2 * Fe * Fyb) / (3 * (1 + Re))),
  );
}

/**
 * The heel joint of a ridge-board roof: the rafter tie at the plate holds the
 * pair's outward thrust, H = wL^2 / 8h for the pair's load w (lb/ft on plan)
 * over the span L with the ridge h above the tie. It is face-nailed to each
 * rafter with 16d commons (0.162" x 3-1/2", SPF, CD 1.15 for snow); at least
 * three. Null for a ridge beam, which has no ties.
 * @param {import('./model.mjs').Shed} shed
 */
export function heelJoint(shed) {
  const d = shed.design;
  if (d.roofType === 'ridgeBeam') return null;
  const cos = 1 / Math.sqrt(1 + (d.pitch / 12) ** 2);
  const w = (15 / cos + d.snowLoad) * (d.rafterSpacing / 12);
  const L = d.width / 12;
  const h = (L / 2) * (d.pitch / 12);
  const thrust = (w * L * L) / (8 * h);
  const perNail = nailZ(0.162, 1.5, 2.0) * 1.15;
  return { thrust, perNail, nails: Math.max(3, Math.ceil(thrust / perNail - 1e-9)) };
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
    add('Floor joists', `${d.joistSize} at ${d.joistSpacing}"`, `${fmtIn(floorSpanIn)} clear between skids, 40 psf live + 10 dead (spread load; a mower's wheel is a point load, not checked)`, r, gov);
    const sf = subfloorCheck(d);
    add('Subfloor', sf.name, `joists ${d.joistSpacing}" apart; APA span rating ${sf.spanOC} oc (check the panel's stamp)`, sf.ratio, 'span rating');
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
    const heel = /** @type {NonNullable<ReturnType<typeof heelJoint>>} */ (heelJoint(shed));
    add('Rafter tie nailing (heel joint)', `${d.tieSize} tie, ${heel.nails} 16d commons a rafter`, `${Math.round(heel.thrust)} lb outward thrust per pair; ${Math.round(heel.perNail)} lb a nail (NDS yield limit, SPF)`, heel.thrust / (heel.nails * heel.perNail), 'nail shear');
  }
  // Headers over doors and windows.
  for (const [name, wall] of Object.entries(shed.walls)) {
    for (const p of wall.openings) {
      const eave = name === 'front' || name === 'back';
      // A gable-wall header carries the gable framing above it (40 lb/ft) and
      // the strip of roof the end rafter brings down the gable studs: half a
      // rafter spacing, as the roof does not overhang the gable.
      const wPlf = eave ? deadPlf + snowPlf + 10 : 40 + (15 / cos + snow) * (d.rafterSpacing / 2) / 12;
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
