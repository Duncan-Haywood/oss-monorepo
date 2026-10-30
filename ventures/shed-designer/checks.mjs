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
// engineer's review: uplift is checked at the rafter ties only, racking only
// as wall shear (no hold-downs or anchorage), and blocks against the IRC's
// lowest presumptive soil value.

import { check, worst, studCheck, headerCheck, roofCase, FLOOR, SPF2, T, DEPTH, designValues } from './structure.mjs';
import { fmtIn, actual } from './lumber.mjs';
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
  const rafterRunIn = d.width / 2 - (beam ? 1.5 : 0.75) - k.stud;
  const tribFt = (beam ? rafterRunIn / 2 + k.stud + d.overhang : d.width / 2 + d.overhang) / 12;
  return { dead: (15 / cos) * tribFt, snow: d.snowLoad * tribFt, rafterRunIn, tribFt };
}

/**
 * Allowable uplift (lb, load duration 160, SPF/HF lumber) of the tie at each
 * rafter end, from Simpson Strong-Tie's Wood Construction Connectors catalog
 * C-C-2024 (the 2021 edition gives the same rows). H2.5A: five 0.131" x 2-1/2"
 * nails into the rafter and five into the plates. VPA2: eight 0.148" x 3" into
 * the plates and two 0.148" x 1-1/2" into the rafter.
 */
export const RAFTER_TIES = {
  birdsmouth: { model: 'Simpson H2.5A', uplift: 615 },
  connector: { model: 'Simpson VPA2', uplift: 220 },
};

/**
 * Wind uplift on one rafter end at the eave wall, by ASCE 7's allowable-stress
 * combination 0.6D + 0.6W: the wind pressure you set, taken as uplift over the
 * rafter's strip of roof (the same strip that brings its weight to the wall)
 * and again under the overhang's soffit, less 0.6 of the 15 psf roof dead
 * load. Returns the net uplift, the tie's allowable load and the uplift
 * pressure the tie holds to. The pressure is the user's single wind figure:
 * ASCE 7 gives higher roof pressures near edges and corners, which is why the
 * pressure it holds to is shown too.
 * @param {import('./model.mjs').Shed} shed
 */
export function rafterUplift(shed) {
  const d = shed.design;
  const cos = 1 / Math.sqrt(1 + (d.pitch / 12) ** 2);
  const s = d.rafterSpacing / 12;
  const { tribFt } = eaveRoofPlf(shed);
  const ohFt = d.overhang / 12;
  const tie = RAFTER_TIES[d.rafterSeat === 'connector' ? 'connector' : 'birdsmouth'];
  const windArea = s * (tribFt + ohFt);
  const dead = 0.6 * (15 / cos) * s * tribFt;
  const up = 0.6 * d.windLoad * windArea;
  return { net: up - dead, up, dead, tie, holdsPsf: (tie.uplift + dead) / (0.6 * windArea) };
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
 * Wind-resisting (ASD) unit shear of the wall bracing, plf, for SPF framing:
 * SDPWS 2015 Table 4.3A nominal wind capacity vw at 6" edge nailing, divided
 * by 2.0 for allowable stress (4.3.3) and times the specific-gravity factor
 * 1 - (0.5 - G) = 0.92 for SPF (G 0.42, footnote 3).
 * - Panel siding (T1-11, 19/32" plywood) is the "Plywood Siding, 3/8" row,
 *   8d galvanized casing nails: vw 450.
 * - Lap, board-and-batten and fiber-cement siding go over 7/16" OSB, the
 *   "Wood Structural Panels - Sheathing, 7/16", 8d" row: vw 670.
 * LP SmartSide panels are rated in LP's own report (APA PR-N124), which this
 * tool has not read; they get no value here.
 */
export const BRACING = {
  'T1-11': { what: 'T1-11 plywood siding, 8d galvanized casing at 6" edges', vw: 450 },
  osb: { what: '7/16" OSB sheathing, 8d at 6" edges', vw: 670 },
};
const SG_SPF = 1 - (0.5 - 0.42);
/** The ratio shown when nothing carries a load at all (999%); kept finite so it sorts and prints. */
export const NO_CAPACITY = 9.99;

/**
 * Racking: wind on one face of the shed is carried to the ground by the two
 * walls parallel to it, as shear walls. The force is 0.6W (ASD) on the
 * projected face from mid-height of the walls to the ridge, half to each
 * wall. A wall's capacity is its full-height sheathed segments between
 * openings: a segment narrower than h/3.5 does not count, and one between
 * h/2 and h/3.5 counts at 1.25 - 0.125h/b (SDPWS 4.3.4).
 *
 * A wall whose openings leave no segment (a wide door in a short wall) braces
 * nothing. Then the opposite wall takes the whole force and the roof
 * sheathing, as a rigid diaphragm, turns the twist into a couple on the two
 * walls at right angles. SDPWS 4.2.5.2.1 allows that for a one-storey open
 * front whose diaphragm cantilevers L' no more than 25 ft with L'/W' no more
 * than 1:1; past that the check fails. Hold-downs at segment ends and the
 * shed's anchorage to the ground are not checked.
 * @param {import('./model.mjs').Shed} shed
 */
export function racking(shed) {
  const d = shed.design;
  const k = shed.dims;
  if (!d.siding) return { rated: true, ratio: NO_CAPACITY, why: 'nothing braces the walls against racking: they need siding panels or sheathing nailed to them', what: 'no siding or sheathing' };
  const brace = d.sidingType === 'T1-11' ? BRACING['T1-11'] : d.sidingType.startsWith('LP SmartSide') ? null : BRACING.osb;
  if (!brace) return { rated: false, ratio: 0, why: '', what: '' };
  const cap = (brace.vw / 2) * SG_SPF;
  const h = d.wallHeight;
  const rise = (k.ridgeTop - k.plateTop) / 12; // ft
  const hFt = h / 12;
  /** Effective full-height length of a wall, ft. */
  const effFt = (name) => {
    const w = shed.walls[name];
    const face = name === 'front' || name === 'back' ? d.length : d.width;
    const holes = w.openings.map((p) => [w.start + p.a, w.start + p.a + p.w]).sort((a, b) => a[0] - b[0]);
    let x = 0;
    let eff = 0;
    for (const [a, b] of [...holes, [face, face]]) {
      const bIn = a - x;
      if (bIn > 0 && h / bIn <= 3.5 + 1e-9) eff += bIn * (h / bIn > 2 ? 1.25 - 0.125 * (h / bIn) : 1);
      x = Math.max(x, b);
    }
    return eff / 12;
  };
  const eff = Object.fromEntries(Object.keys(shed.walls).map((n) => [n, effFt(n)]));
  // Wind on the long (eave) face goes to the gable walls; on a gable end, to the eave walls.
  const dirs = [
    { F: 0.6 * d.windLoad * (d.length / 12) * (hFt / 2 + rise), pair: ['left', 'right'], across: ['front', 'back'], Lp: d.length / 12, Wp: d.width / 12 },
    { F: 0.6 * d.windLoad * (d.width / 12) * (hFt / 2 + rise / 2), pair: ['front', 'back'], across: ['left', 'right'], Lp: d.width / 12, Wp: d.length / 12 },
  ];
  /** @type {{ rated: boolean, ratio: number, why: string, what: string, wall?: string, v?: number, cap?: number }} */
  let out = { rated: true, ratio: 0, why: '', what: brace.what };
  const worse = (ratio, why, wall, v) => { if (ratio > out.ratio || !out.why) out = { rated: true, ratio, why, what: brace.what, wall, v, cap }; };
  const per = (lb, ft) => (ft > 0 ? lb / ft : NO_CAPACITY * cap);
  for (const dir of dirs) {
    const open = dir.pair.filter((n) => eff[n] <= 0);
    const tag = (n, lb, ft, extra = '') => `${n} wall: ${Math.round(lb)} lb of wind (0.6 x ${d.windLoad} psf) on ${ft.toFixed(1)} ft of full-height panel${extra}; ${Math.round(per(lb, ft))} lb/ft against ${Math.round(cap)} allowed (SDPWS Table 4.3A, SPF)`;
    if (open.length === 2) { worse(NO_CAPACITY, `neither the ${dir.pair[0]} nor the ${dir.pair[1]} wall has a full-height panel wide enough to brace it (narrower than its height / 3.5)`); continue; }
    if (open.length === 0) {
      for (const n of dir.pair) worse(per(dir.F / 2, eff[n]) / cap, tag(n, dir.F / 2, eff[n]), n, per(dir.F / 2, eff[n]));
      continue;
    }
    const solid = dir.pair.find((n) => !open.includes(n));
    const ratioLW = dir.Lp / dir.Wp;
    if (dir.Lp > 25 || ratioLW > 1 + 1e-9) {
      worse(NO_CAPACITY, `the ${open[0]} wall's openings leave no panel wide enough to brace it, and the roof cannot carry the twist to the other walls: it cantilevers ${dir.Lp.toFixed(1)} ft over ${dir.Wp.toFixed(1)} ft, past the 1:1 SDPWS allows (4.2.5.2.1). Narrow the opening, add a braced panel beside it, or put the door on a long wall`);
      continue;
    }
    worse(per(dir.F, eff[solid]) / cap, tag(solid, dir.F, eff[solid], `, all of it, as the ${open[0]} wall braces nothing`), solid, per(dir.F, eff[solid]));
    // The twist F x L'/2 as a couple on the walls at right angles, W' apart.
    const couple = (dir.F * dir.Lp / 2) / dir.Wp;
    for (const n of dir.across) worse(per(couple, eff[n]) / cap, tag(n, couple, eff[n], `, from the twist of the open ${open[0]} wall`), n, per(couple, eff[n]));
  }
  return out;
}

/** Density of wood, lb/cu ft, at specific gravity G and moisture content mc (%): NDS Supplement 3.1.3. */
export const woodDensity = (G, mc) => (62.4 * G * (1 + mc / 100)) / (1 + 0.009 * G * mc);
const polyArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i]; const [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; }
  return Math.abs(a) / 2;
};

/**
 * What the shed weighs, lb, counted low on purpose: framing and sheet goods
 * from their drawn volumes at 12% moisture, SPF at G 0.42 and treated
 * (Southern pine) members at G 0.55 (NDS Table 12.3.3A), panels at 0.42.
 * Shingles, doors, windows, trim, hardware and paint are left out; they add
 * weight, so leaving them out errs on the safe side when weight holds the
 * shed down.
 * @param {import('./model.mjs').Shed} shed
 */
export function selfWeight(shed) {
  const vol = (g) => (polyArea(g.profile) * g.thickness) / 1728;
  const framing = shed.members.reduce((t, m) => t + vol(m.geom) * woodDensity(/^PT /.test(m.material) ? 0.55 : 0.42, 12), 0);
  const panels = shed.panels.reduce((t, p) => t + vol(p.geom) * woodDensity(0.42, 12), 0);
  return { framing, panels, lb: framing + panels };
}

/**
 * Does the wind tip a shed that nothing ties to the ground? ASCE 7's ASD
 * combination 0.6D + 0.6W: the wind pressure you set on the whole face from
 * the bottom of the skids to the ridge, and as uplift on the roof's plan
 * (overhangs included), about the leeward line of skids (wind on the long
 * side) or the leeward end (wind on a gable end), against 0.6 of the weight
 * (selfWeight) about the same line. A ratio over 1 means the shed needs
 * anchors; holdDown is what the windward side must then hold, lb at each of
 * its two corners. Sliding, and the blocks themselves (they sit loose), are
 * not checked.
 * @param {import('./model.mjs').Shed} shed
 */
export function anchorage(shed) {
  const d = shed.design;
  const k = shed.dims;
  const p = d.windLoad;
  const z0 = k.block ? k.block.h : 0;
  const Wt = selfWeight(shed).lb;
  const wall = (k.plateTop - z0) / 12; // ft, skid bottom to plate
  const rise = (k.ridgeTop - k.plateTop) / 12;
  const zb = z0 / 12;
  const L = d.length / 12;
  const W = d.width / 12;
  const U = p * L * (W + (2 * d.overhang) / 12); // uplift on the roof plan
  const dirs = [
    // Wind on the long side: wall rectangle and the roof's rectangle, about the leeward skid.
    { dir: 'on the long side', F: p * L * (wall + rise), M: p * L * (wall * (wall / 2) + rise * (wall + rise / 2)), arm: (k.skidYs[k.skidYs.length - 1] - k.skidYs[0]) / 2 / 12, base: (k.skidYs[k.skidYs.length - 1] - k.skidYs[0]) / 12 },
    // Wind on a gable end: wall rectangle and the gable triangle, about the leeward end.
    { dir: 'on a gable end', F: p * W * (wall + rise / 2), M: p * W * (wall * (wall / 2) + (rise / 2) * (wall + rise / 3)), arm: L / 2, base: L },
  ];
  let worst = null;
  for (const x of dirs) {
    const over = 0.6 * (x.M + U * x.arm); // ft-lb, the wind's moment (heights above the skid bottoms)
    const resist = 0.6 * Wt * x.arm;
    const ratio = over / resist;
    const holdDown = Math.max(0, (over - resist) / x.base / 2);
    if (!worst || ratio > worst.ratio) worst = { ...x, over, resist, ratio, holdDown, weight: Wt, uplift: U, z0: zb };
  }
  const a = /** @type {NonNullable<typeof worst>} */ (worst);
  return { ...a, tipsAtPsf: a.ratio > 0 ? p / a.ratio : Infinity };
}

/** One sentence on anchoring, for the Structure tab and the build instructions. */
export function anchorageText(shed) {
  const a = anchorage(shed);
  const w = shed.design.windLoad;
  const lead = `The shed weighs about ${(Math.round(a.weight / 10) * 10).toLocaleString('en-US')} lb (framing and sheets only, counted low), and nothing in these plans ties it to the ground.`;
  if (a.ratio <= 1) return `${lead} At ${w} psf its weight holds it down with ${Math.round((1 / a.ratio - 1) * 100)}% to spare (wind ${a.dir}, ASD 0.6D + 0.6W); it would tip at about ${Math.floor(a.tipsAtPsf)} psf.`;
  return `${lead} Wind ${a.dir} tips it at about ${Math.floor(a.tipsAtPsf)} psf (ASD 0.6D + 0.6W), so at the ${w} psf you set it needs anchors: ground anchors or straps that hold about ${Math.ceil(a.holdDown / 10) * 10} lb at each windward corner, on all four corners as the wind can come from either side.`;
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
      add('Blocks on the soil', `${k.block.along}" x ${k.block.across}" ${d.foundation === 'deck blocks' ? 'deck block' : 'block'}`, `${Math.round(sk.R + BLOCK_SELF_LB)} lb on ${sk.footSqFt.toFixed(2)} sq ft${sk.spread ? ' (spread 2" each side through the 4" gravel bed)' : ', straight on the soil'}; ${SOIL_PSF} psf, the IRC's value for clay or silt (R401.4.1)${sk.soil > 1 && !sk.spread ? '. A 4" bed of paver base under each block spreads the load over more ground' : ''}`, sk.soil, 'soil bearing');
    }
  }
  // Rafters: from the inside of the wall plate to the ridge.
  const beam = d.roofType === 'ridgeBeam';
  const rafterRunIn = d.width / 2 - (beam ? 1.5 : 0.75) - k.stud;
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
  // The rafter-to-plate ties against wind uplift.
  {
    const u = rafterUplift(shed);
    add('Rafter-to-plate ties (uplift)', `${u.tie.model} at each rafter end`, `${Math.max(0, Math.round(u.net))} lb net uplift a tie at ${wind} psf (0.6W on the roof and under the ${fmtIn(d.overhang)} overhang, less 0.6 of the roof's weight); ${u.tie.uplift} lb allowed (SPF, Simpson C-C-2024); holds to ${Math.floor(u.holdsPsf)} psf of uplift`, Math.max(0, u.net) / u.tie.uplift, 'uplift');
  }
  // The walls against racking.
  {
    const r = racking(shed);
    if (r.rated) {
      add('Wall bracing (racking)', r.what, r.why, r.ratio, 'shear');
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
