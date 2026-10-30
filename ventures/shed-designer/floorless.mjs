// @ts-check
// A shed with no floor (design.floor 'none'): each wall's bottom plate bears
// on a PT 4x6 perimeter timber on edge on a full gravel pad, and under a
// ridge beam each gable post has a concrete pier of its own under the timber.
// The model builds it (model.mjs); these are its screening checks, in the
// same terms as the skid-on-blocks check (checks.mjs):
// - the timbers on the soil: the heaviest wall's line load, spread 2" each
//   side through the 4" gravel (a 2:1 spread), against the IRC's presumptive
//   1,500 psf for clay or silt (Table R401.4.1);
// - the bottom plate bearing on the timber: the heaviest point load the wall
//   brings down (a ridge-beam post, a jack stud under a header, an eave-wall
//   stud) on the stud's footprint, against Fc⊥ of the wet treated timber
//   (Southern pine No. 2, x 0.67 wet service, NDS Supplement Table 4B
//   footnotes / SPIB), the lower of plate and timber;
// - each post pier on the soil: the post's load and the pier's own concrete
//   (about 145 pcf, normal-weight concrete) on its 16" square footing.
// A timber lying on gravel along its whole length is not checked as a beam.
// Not engineered or code-checked.

import { designValues } from './structure.mjs';
import { eaveRoofPlf, SOIL_PSF, WALL_DEAD_PSF } from './checks.mjs';
import { headerLoadPlf } from './model.mjs';

/** Gravel under the timbers spreads the load this much each side, inches (4" bed at 2:1). */
export const GRAVEL_SPREAD_IN = 2;
/** Allowance for a wet treated 4x6's own weight, lb per foot. */
const TIMBER_SELF_PLF = 10;
/** Normal-weight concrete, lb per cubic foot. */
export const CONCRETE_PCF = 145;

/**
 * The floorless shed's checks, or null for a framed floor.
 * @param {import('./model.mjs').Shed} shed
 */
export function floorlessChecks(shed) {
  const d = shed.design;
  const k = shed.dims;
  if (!k.floorless || !k.timber) return null;
  const t = k.timber;
  const cos = 1 / Math.sqrt(1 + (d.pitch / 12) ** 2);
  const lean = d.style === 'leanTo';
  const roof = eaveRoofPlf(shed);
  // Line loads, lb/ft: an eave wall (its height of wall and its strip of
  // roof, dead + snow) and a gable wall (its framing and the end rafter's
  // strip, as headerLoadPlf counts it).
  const eaveWallFt = (lean ? k.highWall : d.wallHeight) / 12;
  const eavePlf = WALL_DEAD_PSF * eaveWallFt + roof.dead + roof.snow + TIMBER_SELF_PLF;
  const gablePlf = 40 + (15 / cos + d.snowLoad) * (d.rafterSpacing / 2) / 12 + TIMBER_SELF_PLF;
  const linePlf = Math.max(eavePlf, gablePlf);
  const widthIn = t.thick + 2 * GRAVEL_SPREAD_IN;
  const soilPsf = linePlf / (widthIn / 12);
  const timbers = { plf: linePlf, eave: eavePlf >= gablePlf, widthIn, psf: soilPsf, ratio: soilPsf / SOIL_PSF };

  // Point loads on the bottom plate, and the timber under it.
  const contact = Math.min(k.stud, t.thick);
  const postLb = k.postPiers ? ((15 / cos + d.snowLoad) * (d.width / 2) / 12 * d.length) / 12 / 2 : 0;
  /** @type {{ what: string, P: number, areaSqIn: number }[]} */
  const points = [];
  if (postLb) points.push({ what: 'a ridge-beam post on its two post studs', P: postLb, areaSqIn: 3 * contact });
  for (const [name, wall] of Object.entries(shed.walls)) {
    for (const p of wall.openings) {
      if (p.bay) continue;
      points.push({ what: `the jack stud under the ${name} ${p.op.kind}'s header`, P: (headerLoadPlf(d, name) * (p.w / 12)) / 2, areaSqIn: 1.5 * contact });
    }
  }
  points.push({ what: `an eave-wall stud at ${d.studSpacing}"`, P: (eavePlf - TIMBER_SELF_PLF) * (d.studSpacing / 12), areaSqIn: 1.5 * contact });
  const timberV = designValues('4x6', 'SYP', true);
  const plateV = designValues(d.studSize, 'SYP', false);
  const Fc = Math.min(timberV.Fc_perp, plateV.Fc_perp);
  const worstPoint = points.map((p) => ({ ...p, psi: p.P / p.areaSqIn })).sort((a, b) => b.psi - a.psi)[0];
  const plate = { ...worstPoint, Fc, ratio: worstPoint.psi / Fc };

  // Post piers: the post and the pier's own concrete on the footing.
  let pier = null;
  if (k.postPiers) {
    const concreteLb = (k.pierCuFt + k.pierFootCuFt) * CONCRETE_PCF;
    const footSqFt = (k.pierFootIn ** 2) / 144;
    const lb = postLb + concreteLb;
    pier = { postLb, concreteLb, footSqFt, lb, psf: lb / footSqFt, ratio: lb / footSqFt / SOIL_PSF };
  }
  return { timbers, plate, pier };
}

/**
 * Check rows for structuralChecks, in its add(member, size, detail, ratio, governs) form.
 * @param {import('./model.mjs').Shed} shed
 * @param {(member: string, size: string, detail: string, ratio: number, governs: string) => void} add
 */
export function addFloorlessRows(shed, add) {
  const c = floorlessChecks(shed);
  if (!c) return;
  const k = shed.dims;
  const d = shed.design;
  add('Perimeter timbers on the gravel', `PT 4x6 on edge, ground-contact`, `${Math.round(c.timbers.plf)} lb/ft under ${c.timbers.eave ? 'an eave wall (wall, roof and snow)' : 'a gable wall'}, spread ${GRAVEL_SPREAD_IN}" each side through the 4" gravel to ${c.timbers.widthIn}" wide: ${Math.round(c.timbers.psf)} psf on ${SOIL_PSF} psf, the IRC's value for clay or silt (R401.4.1)`, c.timbers.ratio, 'soil bearing');
  add('Bottom plate on the timbers', `PT ${d.studSize} plate on a PT 4x6`, `${Math.round(c.plate.P)} lb from ${c.plate.what}, on ${c.plate.areaSqIn.toFixed(2)} sq in: ${Math.round(c.plate.psi)} psi against Fc⊥ ${Math.round(c.plate.Fc)} psi (Southern pine No. 2, the timber wet)`, c.plate.ratio, 'bearing');
  if (c.pier) add('Post piers on the soil', `${k.pierFootIn}" x ${k.pierFootIn}" pier footing`, `${Math.round(c.pier.postLb)} lb from the ridge-beam post plus ${Math.round(c.pier.concreteLb)} lb of concrete on ${c.pier.footSqFt.toFixed(2)} sq ft; ${SOIL_PSF} psf, the IRC's value for clay or silt (R401.4.1)`, c.pier.ratio, 'soil bearing');
}
