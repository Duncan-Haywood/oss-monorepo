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
// engineer's review: uplift, racking and the soil itself are not checked
// (blocks are checked against the IRC's lowest presumptive soil value).

import { check, worst, studCheck, headerCheck, roofCase, FLOOR, SPF2, T, DEPTH, designValues } from './structure.mjs';
import { fmtIn, actual } from './lumber.mjs';
import { trussChecks, trussForces } from './truss.mjs';
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
 * three. Null for a ridge beam, which has no ties, and for trusses (truss.mjs).
 * @param {import('./model.mjs').Shed} shed
 */
export function heelJoint(shed) {
  const d = shed.design;
  if (d.roofType !== 'ridgeBoard') return null;
  const cos = 1 / Math.sqrt(1 + (d.pitch / 12) ** 2);
  const w = (15 / cos + d.snowLoad) * (d.rafterSpacing / 12);
  const L = d.width / 12;
  const h = (L / 2) * (d.pitch / 12);
  const thrust = (w * L * L) / (8 * h);
  const perNail = nailZ(0.162, 1.5, 2.0) * 1.15;
  return { thrust, perNail, nails: Math.max(3, Math.ceil(thrust / perNail - 1e-9)) };
}

/**
 * Roof load on each eave wall, lb/ft: dead and snow. Under a ridge beam the
 * beam takes the upper half of each rafter, so the wall carries the lower half
 * of the run plus the wall and the overhang. Under a ridge board the board
 * carries nothing (the rafter pair and its tie are a truss), so each eave wall
 * carries the whole half roof, ridge to eave tip.
 * @param {import('./model.mjs').Shed} shed
 */
export function eaveRoofPlf(shed) {
  const d = shed.design;
  const k = shed.dims;
  const cos = 1 / Math.sqrt(1 + (d.pitch / 12) ** 2);
  const beam = d.roofType === 'ridgeBeam';
  const truss = d.roofType === 'truss';
  const rafterRunIn = d.width / 2 - (beam ? 1.5 : truss ? 0 : 0.75) - k.stud;
  const tribFt = (beam ? rafterRunIn / 2 + k.stud + d.overhang : d.width / 2 + d.overhang) / 12;
  // Under trusses each eave wall also carries half the attic (bottom chord) load.
  const dead = (15 / cos) * tribFt + (truss ? (trussForces(d).wc * d.width) / 2 / 12 / (d.rafterSpacing / 12) : 0);
  return { dead, snow: d.snowLoad * tribFt, rafterRunIn };
}

/** Wall dead load, psf of wall face: studs, plates, sheathing or siding. */
export const WALL_DEAD_PSF = 10;
/** Presumptive load-bearing value of the weakest soils (clay, silt), IRC Table R401.4.1. */
export const SOIL_PSF = 1500;
/** Allowance for the block's and the skid's own weight at each block, lb. */
const BLOCK_SELF_LB = 50;

/**
 * A skid on blocks is a beam from block to block. Treated skids are usually
 * Southern pine, and on blocks they stay damp: SYP No. 2, wet service. The
 * worst skid is checked for bending (wL^2/8 on the block-to-block spacing,
 * which is also the support moment of a two-span skid), shear (0.625wL, the
 * two-span interior shear), L/240 deflection, bearing on the block (1.25wL,
 * the two-span interior reaction; less on more spans), or the end reaction with the gable wall and
 * any ridge-beam post on it), and the block on the soil at 1,500 psf.
 * Loads: floor 10 dead + 40 live psf over the skid's strip; on an outer skid
 * the eave wall (10 psf) and its roof; combinations D+L (CD 1.0), D+S and
 * D+0.75L+0.75S (CD 1.15). Null without blocks (a skid on gravel bears along
 * its length).
 * @param {import('./model.mjs').Shed} shed
 */
export function skidOnBlocks(shed) {
  const d = shed.design;
  const k = shed.dims;
  if (!k.block) return null;
  const size = d.skidSize;
  const { thick: b, depth: h } = actual(size);
  const v = designValues(size, 'SYP', true);
  const ys = k.skidYs;
  const first = shed.fixtures.filter((f) => f.kind === 'block' && Math.abs(f.geom.origin[1] + k.block.across / 2 - ys[0]) < 1e-6);
  const xs = first.map((f) => f.geom.origin[0] + k.block.along / 2).sort((p, q) => p - q);
  const L = Math.max(...xs.slice(1).map((x, i) => x - xs[i]));
  const roof = eaveRoofPlf(shed);
  const cos = 1 / Math.sqrt(1 + (d.pitch / 12) ** 2);
  const gablePlf = 40 + (15 / cos + d.snowLoad) * (d.rafterSpacing / 2) / 12;
  const beam = d.roofType === 'ridgeBeam';
  const postLb = beam ? ((15 / cos + d.snowLoad) * (d.width / 2) / 12 * d.length) / 12 / 2 : 0;
  // A 4" gravel bed under the block spreads the load 2" each side (a 2:1
  // spread, and the bed's own size when it is laid under each block alone).
  const spread = k.noPad ? 0 : 2;
  const footSqFt = ((k.block.along + 2 * spread) * (k.block.across + 2 * spread)) / 144;
  let worstSkid = null;
  ys.forEach((y, i) => {
    const lo = i === 0 ? 0 : (ys[i - 1] + y) / 2;
    const hi = i === ys.length - 1 ? d.width : (y + ys[i + 1]) / 2;
    const trib = (hi - lo) / 12; // ft of floor
    const outer = i === 0 || i === ys.length - 1;
    // lb/in: dead, live, snow
    const D = (10 * trib + (outer ? WALL_DEAD_PSF * (d.wallHeight / 12) + roof.dead : 0)) / 12;
    const Lv = (40 * trib) / 12;
    const S = (outer ? roof.snow : 0) / 12;
    const post = beam && Math.abs(y - d.width / 2) < 1e-6 ? postLb : 0;
    const combos = [[D + Lv, 1.0], [D + S, 1.15], [D + 0.75 * Lv + 0.75 * S, 1.15]];
    const A = b * h, Sx = (b * h * h) / 6, I = (b * h ** 3) / 12;
    let ratios = { bending: 0, shear: 0, deflection: 0, bearing: 0, soil: 0 };
    let R = 0;
    // Reactions of a continuous skid on equal spans: one span 0.5wL at each
    // end; two spans 1.25wL inside and 0.375wL at the ends; three or more at
    // most 1.143wL inside (four spans) and 0.4wL at the ends (three spans).
    const spans = xs.length - 1;
    const [kIn, kEnd] = spans === 1 ? [0, 0.5] : spans === 2 ? [1.25, 0.375] : [1.143, 0.4];
    for (const [w, CD] of combos) {
      const end = kEnd * w * L + (gablePlf * trib) + post;
      const r = Math.max(kIn * w * L, end);
      R = Math.max(R, r);
      ratios = {
        bending: Math.max(ratios.bending, (w * L * L) / 8 / Sx / (v.Fb * CD)),
        shear: Math.max(ratios.shear, (1.5 * 0.625 * w * L) / A / (v.Fv * CD)),
        deflection: Math.max(ratios.deflection, ((5 * w * L ** 4) / (384 * v.E * I)) / (L / 240)),
        bearing: Math.max(ratios.bearing, r / (b * k.block.along) / v.Fc_perp),
        soil: Math.max(ratios.soil, (r + BLOCK_SELF_LB) / footSqFt / SOIL_PSF),
      };
    }
    const [governs, ratio] = worst({ bending: ratios.bending, shear: ratios.shear, deflection: ratios.deflection, bearing: ratios.bearing });
    if (!worstSkid || Math.max(ratio, ratios.soil) > Math.max(worstSkid.ratio, worstSkid.soil)) worstSkid = { skid: i, outer, L, R, governs, ratio, soil: ratios.soil, ratios, values: v, footSqFt, spread };
  });
  return worstSkid;
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
    // Treated joists are usually Southern pine, whose No. 2 bending value is
    // below SPF's from 2x6 up; a dry floor stays dry service.
    const species = d.floorTreated ? 'SYP' : 'SPF';
    const [gov, r] = worst(check({ size: d.joistSize, spacingIn: d.joistSpacing, bearingIn: skidThick, species }, floorSpanIn / 12, FLOOR));
    add('Floor joists', `${d.floorTreated ? 'PT ' : ''}${d.joistSize} at ${d.joistSpacing}"`, `${fmtIn(floorSpanIn)} clear between skids, 40 psf live + 10 dead (spread load; a mower's wheel is a point load, not checked), ${species === 'SYP' ? 'Southern pine' : 'SPF'} No. 2`, r, gov);
    const sf = subfloorCheck(d);
    add('Subfloor', sf.name, `joists ${d.joistSpacing}" apart; APA span rating ${sf.spanOC} oc (check the panel's stamp)`, sf.ratio, 'span rating');
  }
  {
    const sk = skidOnBlocks(shed);
    if (sk) {
      add('Skids on blocks', `PT ${d.skidSize}, Southern pine No. 2, wet`, `${fmtIn(sk.L)} block to block, ${sk.outer ? 'outer skid with the eave wall and its roof' : 'inner skid'}; ${Math.round(sk.R)} lb on a block`, sk.ratio, sk.governs);
      add('Blocks on the soil', `${k.block.along}" x ${k.block.across}" ${d.foundation === 'deck blocks' ? 'deck block' : 'block'}`, `${Math.round(sk.R + BLOCK_SELF_LB)} lb on ${sk.footSqFt.toFixed(2)} sq ft${sk.spread ? ' (spread 2" each side through the 4" gravel bed)' : ', straight on the soil'}; ${SOIL_PSF} psf, the IRC's value for clay or silt (R401.4.1)${sk.soil > 1 && !sk.spread ? (k.block.pier ? '. A wider footing at the bottom of each pier (or more piers) spreads the load over more ground' : '. A 4" bed of paver base under each block spreads the load over more ground') : ''}`, sk.soil, 'soil bearing');
    }
  }
  // Rafters: from the inside of the wall plate to the ridge.
  const beam = d.roofType === 'ridgeBeam';
  const truss = d.roofType === 'truss';
  const rafterRunIn = d.width / 2 - (beam ? 1.5 : truss ? 0 : 0.75) - k.stud;
  {
    const [gov, r] = worst(check({ size: d.rafterSize, spacingIn: d.rafterSpacing, pitch: d.pitch, bearingIn: k.stud }, rafterRunIn / 12, roof));
    add('Rafters', `${d.rafterSize} at ${d.rafterSpacing}"`, `${fmtIn(rafterRunIn)} horizontal run at ${d.pitch}/12, ${snow} psf snow + 15 dead`, r, gov);
  }
  // Roof load on each eave wall per foot (eaveRoofPlf).
  const { dead: deadPlf, snow: snowPlf } = eaveRoofPlf(shed);
  if (beam) {
    const spanIn = d.length - 2 * k.stud;
    const [gov, r] = worst(check({ size: d.beamSize, plies: 2, spacingIn: d.width / 2, pitch: d.pitch, repetitive: false, bearingIn: 3 }, spanIn / 12, roof));
    add('Ridge beam', `2-ply ${d.beamSize}`, `${fmtIn(spanIn)} between the gable posts, carrying half of each roof slope`, r, gov);
    const wBeamPlf = (15 / cos + snow) * (d.width / 2) / 12;
    const P = (wBeamPlf * d.length) / 12 / 2;
    const postH = shed.members.find((m) => m.kind === 'beam post')?.length ?? 12;
    add('Ridge beam posts', `2-ply ${d.studSize}`, `${Math.round(P)} lb each, ${fmtIn(postH)} above the plate, then the two post studs to the floor`,
      Math.max(postCheck(2, d.studSize, postH, P), postCheck(2, d.studSize, k.studLen, P)), 'compression');
  } else if (truss) {
    rows.push(...trussChecks(d).rows);
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
    // studCheck answers Infinity when the load reaches the stud's buckling load; show that as over capacity.
    add('Wall studs', `${d.studSize} at ${d.studSpacing}"`, `${fmtIn(k.studLen)} tall, roof load plus ${wind} psf wind on the wall${Number.isFinite(r) ? '' : '; the load reaches the stud\'s buckling load'}`, Number.isFinite(r) ? r : 9.99, 'combined bending and compression');
  }
  return {
    rows,
    ok: rows.every((x) => x.ok),
    loads: { snow, wind, roofDead: 15, floorLive: 40, floorDead: 10 },
  };
}
