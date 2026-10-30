// @ts-check
// The gambrel roof on the plan sheets: its part of the building section, the
// roof framing plan, a truss detail to build every truss from, the roof as the
// exterior elevations show it, and its lines on the cover and in the nailing
// schedule. drawings.mjs calls these when the design's style is 'gambrel';
// the primitives are the same shapes drawings.mjs uses.

import { fmtFtIn, fmtIn } from './lumber.mjs';
import { gambrelShape, bandAbove, outerLine, LOFT_LIVE } from './gambrel.mjs';

/** @typedef {import('./drawings.mjs').Item} Item */
/** @typedef {[number, number]} P */
const rect = (x0, y0, x1, y1, cls) => /** @type {Item} */ ({ t: 'poly', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, cls });
const line = (a, b, cls) => /** @type {Item} */ ({ t: 'poly', pts: [a, b], closed: false, cls });
const text = (at, s, size = 11, anchor = 'middle', cls = 'label') => /** @type {Item} */ ({ t: 'text', at, text: s, size, anchor, cls });
const dim = (a, b, off, txt) => /** @type {Item} */ ({ t: 'dim', a, b, off, ...(txt ? { text: txt } : {}) });
const poly = (pts, cls, closed = true) => /** @type {Item} */ ({ t: 'poly', pts: pts.map((p) => /** @type {P} */ ([p[0], p[1]])), closed, cls });

const deg = (pitch) => ((Math.atan(pitch / 12) * 180) / Math.PI).toFixed(0);

/** The second truss (the first with gussets and a tie), or the first. @param {any} shed */
function sampleTruss(shed) {
  const c = shed.dims.rafterCenters;
  return c.length > 2 ? c[1] : c[0];
}

/** A gambrel's words for the roof, for notes and the cover. @param {any} shed */
export function gambrelRoofWords(shed) {
  const d = shed.design;
  const g = shed.dims.gambrel;
  const loft = d.loft === 'full' ? `; a loft over the whole length on ${g.tieSize} loft joists` : d.loft === 'half' ? `; a loft over half the length on ${g.tieSize} loft joists` : '';
  return `gambrel, ${d.gambrelLower}/12 lower and ${d.pitch}/12 upper slopes, knee ${fmtIn(g.yk)} in from each wall: ${d.rafterSize} chords in trusses at ${d.rafterSpacing}" o.c., 15/32" plywood gussets both faces, ${g.tieSize} ties on the plates${loft}`;
}

/**
 * The roof in the building section: one inside truss with its tie and
 * gussets (dashed), the loft deck, the sheathing and roofing line, both
 * slopes' pitch marks and the knee's height and position.
 * @param {any} shed
 */
export function gambrelSectionItems(shed) {
  const d = shed.design;
  const k = shed.dims;
  const W = d.width;
  const g = gambrelShape(d, k.plateTop);
  /** @type {Item[]} */
  const items = [];
  const x = sampleTruss(shed);
  const at = (m) => Math.abs(m.geom.origin[0] - (x - 0.75)) < 0.01;
  for (const m of shed.members.filter((m) => (m.kind === 'lower chord' || m.kind === 'upper chord') && at(m))) items.push(poly(m.geom.profile, 'member'));
  const tie = shed.members.find((m) => m.kind === 'rafter tie' && Math.abs(m.geom.origin[0] - (x + 0.75)) < 0.01);
  if (tie) items.push(poly(tie.geom.profile, 'member'));
  for (const p of shed.panels.filter((p) => p.kind === 'gambrel gusset' && Math.abs(p.geom.origin[0] - (x + 0.75)) < 0.01)) items.push(poly(p.geom.profile, 'hidden'));
  for (const p of shed.panels.filter((p) => p.kind === 'loft deck' && p.geom.origin[0] <= x + 1e-9 && p.geom.origin[0] + p.geom.profile[2][0] >= x - 1e-9)) {
    items.push(rect(p.geom.origin[1], p.geom.origin[2], p.geom.origin[1] + p.geom.profile[2][1], p.geom.origin[2] + p.geom.thickness, 'sheet'));
  }
  // Sheathing: between the outer line and a line 7/16" above it; the roofing on top.
  const outer = outerLine(g);
  const sheath = bandAbove(g, 7 / 16);
  items.push(poly([...outer, ...sheath.slice().reverse()], 'sheet'));
  items.push(poly(bandAbove(g, 7 / 16 + 0.4), 'roofline', false));
  // Pitch marks on each slope, 12 along and the rise up.
  const mark = (y, z, pitch) => {
    items.push(poly([[y, z], [y + 12, z], [y + 12, z + pitch]], 'thin'));
    items.push(text([y + 6, z + 1.5], '12', 9));
    items.push(text([y + 15, z + pitch / 2 - 3], String(pitch), 9, 'start'));
  };
  mark(g.yk * 0.15 - 14, g.top(g.yk * 0.15) + 6, d.gambrelLower);
  mark(g.yk + (W / 2 - g.yk) * 0.3, g.top(g.yk + (W / 2 - g.yk) * 0.3) + 10, d.pitch);
  items.push(dim([W - g.yk, k.plateTop], [W - g.yk, g.zk], -14, `${fmtIn(g.zk - k.plateTop)} knee`));
  items.push(dim([W - g.yk, g.zk + 20], [W, g.zk + 20], 10, fmtIn(g.yk)));
  const lbl = (y, z, s, anchor = 'start') => items.push(text([y, z], s, 8, anchor, 'label'));
  lbl(W / 2 + 6, g.top(W / 2 + 6) + 6, `7/16" OSB, underlayment, ${d.roofCover === 'metal' ? 'metal panels' : 'shingles'}`);
  lbl(W - g.yk / 2 + 8, (k.plateTop + g.zk) / 2 + 10, `${d.rafterSize} chords, trusses at ${d.rafterSpacing}" o.c.; gussets dashed`);
  if (tie) lbl(W * 0.3, k.plateTop + (tie.geom.profile[2][1] - k.plateTop) + (d.loft === 'none' ? 2 : 4), d.loft === 'none' ? `${k.gambrel.tieSize} truss tie on the plates` : `${k.gambrel.tieSize} loft joists, 3/4" floor`);
  return items;
}

/** The section's note. @param {any} shed */
export function gambrelSectionNote(shed) {
  const d = shed.design;
  const k = shed.dims;
  const g = k.gambrel;
  return `Gambrel roof, ${d.gambrelLower}/12 (${deg(d.gambrelLower)} deg) lower and ${d.pitch}/12 (${deg(d.pitch)} deg) upper. Heights from the top of the gravel: floor ${fmtFtIn(k.floorTop)}, top plate ${fmtFtIn(k.plateTop)}, knee ${fmtFtIn(g.zk)}, peak about ${fmtFtIn(k.peak)}. The lower chords' feet are cut level and sit on the plate (no birdsmouth); a ${g.tieSize} tie beside them on the plates takes the trusses' thrust, ${g.heelNails} 16d commons into each chord.${d.loft !== 'none' ? ` The loft is sized for ${LOFT_LIVE} psf of stored things, not people.` : ''}`;
}

/**
 * Roof framing plan: chords in plan, the knee lines, ties dashed, marks.
 * @param {any} shed
 * @param {(m: any) => string} markText
 */
export function gambrelRoofPlan(shed, markText) {
  const d = shed.design;
  const k = shed.dims;
  const g = k.gambrel;
  const L = d.length;
  const W = d.width;
  /** @type {Item[]} */
  const items = [rect(0, 0, L, W, 'outline')];
  const c = k.rafterCenters;
  for (const x of c) items.push(rect(x - 0.75, 0, x + 0.75, W, 'member'));
  for (const y of [g.yk, W / 2, W - g.yk]) items.push(line([0, y], [L, y], 'hidden'));
  for (const m of shed.members.filter((x) => x.kind === 'rafter tie' || x.kind === 'loft joist')) {
    const x = m.geom.origin[0];
    items.push(rect(x, 0, x + 1.5, W, 'hidden'));
  }
  // The tie brace, where wind uplift needs one: flat along the ties at mid-span.
  for (const m of shed.members.filter((x) => x.kind === 'chord brace')) {
    const [x0, y0] = m.geom.origin;
    const len = m.geom.profile[1][0];
    items.push(rect(x0, y0, x0 + len, y0 + 3.5, 'member'));
    items.push(text([x0 + Math.min(18, len / 2), y0 + 5], markText(m), 8, 'middle', 'mark'));
  }
  // One mark per kind, on the second truss.
  const x1 = c.length > 2 ? c[1] : c[0];
  for (const m of shed.members.filter((m) => ['lower chord', 'upper chord', 'rafter tie', 'loft joist'].includes(m.kind))) {
    const mk = markText(m);
    if (!mk) continue;
    const ys = m.geom.profile.map((p) => p[0]);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const x = m.geom.origin[0] + 0.75;
    if (m.kind === 'loft joist' || Math.abs(x - x1) < 2.5 || Math.abs(x - (x1 + 1.5)) < 2.5) items.push(text([x, (m.kind === 'rafter tie' || m.kind === 'loft joist' ? W * 0.42 : mid) - 1.5], mk, 8, 'middle', 'mark'));
  }
  for (let i = 0; i + 1 < Math.min(c.length, 4); i++) items.push(dim([c[i], W], [c[i + 1], W], 24, fmtIn(c[i + 1] - c[i])));
  items.push(dim([0, 0], [L, 0], -38));
  items.push(dim([L, 0], [L, g.yk], -30, `${fmtIn(g.yk)} to the knee`));
  items.push(dim([L, 0], [L, W], -60));
  items.push(text([L / 2, W / 2 + 10], 'peak: upper chords meet, gusset both faces (no ridge board)', 11));
  items.push(text([L / 2, g.yk + 6], 'knee', 9, 'middle', 'muted'));
  items.push(text([L / 2, W - g.yk + 6], 'knee', 9, 'middle', 'muted'));
  return {
    id: 'roof', title: 'Roof framing plan',
    note: `${c.length - 2} gambrel trusses at ${d.rafterSpacing}" on centre and a chord set over each gable wall (carried by the gable studs, no gussets). Each lower chord is ${fmtIn(g.lowerCut)} and each upper chord ${fmtIn(g.upperCut)} from a board's square end. ${g.tieSize} ${d.loft !== 'none' ? 'loft joists' : 'ties'} (dashed) lie on the plates beside every inside truss; the knee lines and peak are dashed. No ridge board, no eave overhang. Roof sheathing 7/16" OSB, ${k.roofRows} courses per side over both slopes. See the truss detail sheet.`,
    items,
  };
}

/**
 * Truss detail: one inside truss as it is laid out flat on the floor deck,
 * with every cut, the knee and peak positions and the gussets.
 * @param {any} shed
 */
export function gambrelTrussDetail(shed) {
  const d = shed.design;
  const k = shed.dims;
  const g = k.gambrel;
  const W = d.width;
  const pt = k.plateTop;
  const sh = gambrelShape(d, pt);
  /** @type {Item[]} */
  const items = [];
  const x = sampleTruss(shed);
  const at = (m, off) => Math.abs(m.geom.origin[0] - off) < 0.01;
  // Drawn from the plate line up, so heights read from the truss's own base.
  const up = (pts) => pts.map(([y, z]) => /** @type {P} */ ([y, z - pt]));
  for (const m of shed.members.filter((m) => (m.kind === 'lower chord' || m.kind === 'upper chord') && at(m, x - 0.75))) items.push({ t: 'poly', pts: up(m.geom.profile), closed: true, cls: 'member' });
  const tie = shed.members.find((m) => m.kind === 'rafter tie' && at(m, x + 0.75));
  if (tie) items.push({ t: 'poly', pts: up(tie.geom.profile), closed: true, cls: 'member' });
  for (const p of shed.panels.filter((p) => p.kind === 'gambrel gusset' && at(p, x + 0.75))) items.push({ t: 'poly', pts: up(p.geom.profile), closed: true, cls: 'hidden' });
  const zk = sh.zk - pt;
  const zr = sh.ridgeTop - pt;
  items.push(dim([0, 0], [W, 0], -20, `${fmtFtIn(W)} outside of wall to outside of wall`));
  items.push(dim([0, 0], [sh.yk, 0], -36, fmtIn(sh.yk)));
  items.push(dim([0, 0], [0, zk], 20, `${fmtIn(zk)} to the knee`));
  items.push(dim([W, 0], [W, zr], -20, `${fmtIn(zr)} to the peak`));
  items.push(text([sh.yk / 2 + 10, zk / 2], `lower chord ${fmtIn(g.lowerCut)}`, 9, 'start'));
  items.push(text([sh.yk + (W / 2 - sh.yk) / 2, (zk + zr) / 2 + 12], `upper chord ${fmtIn(g.upperCut)}`, 9));
  items.push(text([W / 2, (tie ? tie.geom.profile[2][1] - pt : 3.5) + 6], `feet: level cut, ${g.footDeg} deg off square, on the plates; ${g.tieSize} ${d.loft !== 'none' ? 'loft joist' : 'tie'} beside, ${g.heelNails} 16d into each chord`, 8));
  items.push(text([W - sh.yk + 6, zk + 2], `knee: mitre ${g.kneeLowDeg} deg off square on both chords`, 8, 'start'));
  items.push(text([W / 2, zr + 10], `peak: plumb cut, ${g.ridgeDeg} deg off square`, 8));
  return {
    id: 'truss', title: 'Gambrel truss detail',
    note: `${d.rafterSize} chords, ${d.gambrelLower}/12 lower and ${d.pitch}/12 upper. Gussets (dashed): 15/32" plywood both faces, ${g.gusset.knee}" along each chord at the knees${g.gusset.kneeExt ? ` and reaching ${fmtIn(g.gusset.kneeExt)} past the chords' inside edges into the corner (deep enough across the mitre for the knee's bending)` : ''}, ${g.gusset.peak}" at the peak; 8d commons 3" apart in rows 2" apart, staggered (${g.nailsPerKnee} a knee, ${g.nailsPerPeak} a peak, both faces). Snap the outline full size on the deck, screw stop blocks round it and build every truss in that jig.`,
    items,
  };
}

/**
 * The roof as an exterior elevation shows it: on an eave side, the lower slope
 * up to the knee and the upper slope beyond; on a gable end, the gambrel
 * outline with its rake band.
 * @param {any} shed
 * @param {boolean} eave
 * @param {number} F the face's length
 * @param {(a: number) => number} X maps a distance along the face to the sheet
 * @param {(a: number) => number} hx maps a face distance to the elevation's left-to-right distance
 */
export function gambrelElevationRoof(shed, eave, F, X, hx) {
  const k = shed.dims;
  const g = gambrelShape(shed.design, k.plateTop);
  const cover = 7 / 16 + (shed.design.roofCover === 'metal' ? 0.6 : 0.35);
  /** @type {Item[]} */
  const items = [];
  if (eave) {
    // Seen square on, each slope is a band between its heights.
    const zKnee = g.zk + cover / g.cl;
    items.push(poly([[X(0), k.plateTop], [X(F), k.plateTop], [X(F), zKnee], [X(0), zKnee]], 'roof'));
    items.push(poly([[X(0), zKnee], [X(F), zKnee], [X(F), k.peak], [X(0), k.peak]], 'roof'));
  } else {
    const top = bandAbove(g, cover);
    const bottom = bandAbove(g, cover - 4);
    items.push(poly([...top, ...bottom.slice().reverse()].map(([y, z]) => [X(hx(y)), z]), 'plate'));
  }
  return items;
}

/**
 * Build steps for the gambrel roof, in place of the rafter steps.
 * @param {any} shed
 * @param {any} est
 * @param {(f: (m: any) => boolean) => string} marks part marks of the members f picks
 * @param {(f: (m: any) => boolean) => number} qty how many members f picks
 * @param {(xs: number[]) => string} list a list of positions
 */
export function gambrelBuildSteps(shed, est, marks, qty, list) {
  const d = shed.design;
  const k = shed.dims;
  const g = k.gambrel;
  const W = d.width;
  const inner = k.rafterCenters.length - 2;
  const loft = d.loft !== 'none';
  const lower = (m) => m.kind === 'lower chord';
  const upper = (m) => m.kind === 'upper chord';
  const sheets = est.shopping.find((r) => /truss gussets/.test(r.name))?.qty ?? 0;
  /** @type {{ title: string, why?: string, steps: string[], check?: string[] }[]} */
  const out = [];
  out.push({
    title: 'Build the gambrel trusses',
    why: 'Build one truss flat on the floor deck, check it against the Gambrel truss detail sheet, then screw stop blocks round it as a jig so every truss comes out the same.',
    steps: [
      `Two slopes a side: the lower at ${d.gambrelLower}/12 (${deg(d.gambrelLower)} deg), the upper at ${d.pitch}/12 (${deg(d.pitch)} deg). The knee is ${fmtIn(g.yk)} in from the outside of each long wall and ${fmtIn(g.zk - k.plateTop)} above the top plate; the peak is ${fmtIn(k.ridgeTop - k.plateTop)} above it.`,
      `Lower chords (mark ${marks(lower)}, ${qty(lower)} of ${d.rafterSize}, ${fmtIn(g.lowerCut)} from a square end): the foot cut level, ${g.footDeg} deg off square, so it sits flat on the plate; the top end mitred ${g.kneeLowDeg} deg off square to meet the upper chord. No birdsmouth.`,
      `Upper chords (mark ${marks(upper)}, ${qty(upper)} of ${d.rafterSize}, ${fmtIn(g.upperCut)} from a square end): the bottom end mitred ${g.kneeLowDeg === g.kneeUpDeg ? 'the same' : `${g.kneeUpDeg} deg`} to meet the lower chord, the top a plumb cut ${g.ridgeDeg} deg off square.`,
      `Gussets from 15/32" plywood (${sheets} sheet${sheets === 1 ? '' : 's'} on the list): at each knee, ${g.gusset.knee}" along each chord, shaped to the two chords; at the peak, ${g.gusset.peak}" down each upper chord. Two of each per truss, one a face; the Gambrel truss detail sheet shows their shapes.`,
      `Snap the truss full size on the floor deck: the feet ${fmtFtIn(W)} apart outside to outside, the knees and peak where the detail sheet puts them. Lay the four chords on it, glue and nail a gusset on the top face of each joint with 8d commons 3" apart in rows 2" apart (${g.nailsPerKnee / 2} a knee and ${g.nailsPerPeak / 2} at the peak on each face), turn it over and do the other face, staggering the nails so they miss the first face's.`,
      `Screw blocks to the deck round the first truss as a jig and build the other ${Math.max(0, inner - 1)} in it. The two gable ends get the four chords only, no gussets: their gable studs carry them.`,
    ],
    check: ['Every truss the same: stack them and sight down the knees and peaks.', 'No nail tip shows through the far gusset.'],
  });
  out.push({
    title: 'Stand the gambrel trusses',
    steps: [
      `Mark truss centres on the long walls' cap plates: the end sets flush with the gable ends, the trusses at ${list(k.rafterCenters.slice(1, -1))} from the left end.`,
      'Set the gable-end chords first: nail them to each other at the knees and the peak and onto the corners, and brace them plumb. The gable studs go in under them later.',
      `Lift each truss upside down between the walls, rotate it up, set its feet on the plates at its mark and toenail each foot with two 16d; fix each foot to the plate with a rafter-to-plate tie (on the list).`,
      `Nail a ${g.tieSize} ${loft ? 'loft joist' : 'tie'} (mark ${marks((m) => m.kind === 'rafter tie')}) on the plates beside every inside truss, ${g.heelNails} 16d commons into each lower chord: it holds the truss's outward push (the Structure tab shows the working). Do it before the next truss goes up, and keep the temporary braces on until the roof is sheathed.`,
      qty((m) => m.kind === 'chord brace') ? `Tie brace (mark ${marks((m) => m.kind === 'chord brace')}): a 2x4 laid flat along the ties at mid-span${d.loft === 'half' ? ", from the left gable wall to the loft's edge joist" : ', gable wall to gable wall'}, two 10d into each tie, ends toenailed. Wind lifting the roof pushes the ties instead of pulling them, and the brace stops them bowing.` : '',
      loft ? `Loft: set the joists against the inside of ${d.loft === 'full' ? 'each gable wall' : 'the right gable wall'} (mark ${marks((m) => m.kind === 'loft joist')}) on the long walls' plates, then lay the loft floor (${est.shopping.find((r) => /loft floor/.test(r.name))?.qty ?? 0} sheets on the list) across the joists, every end joint on a joist, glued and nailed 6" at the ends and 12" along each joist. It is sized for 20 psf of stored things, not for people; put a stop board along its open edge.` : '',
      loft && d.loft === 'full' ? `Hatch: leave the floor out over ${shed.notes.find((n) => n.startsWith('Loft hatch'))?.replace(/^Loft hatch: /, '').replace(/, the ladder under it\.$/, '') ?? 'one bay'}, and fit the floor pieces round it, every edge on a joist or on a 2x4 block between joists.` : '',
      loft && qty((m) => m.kind === 'ladder rail') ? `Ladder: cut the two rails (mark ${marks((m) => m.kind === 'ladder rail')}) with a level cut at the foot and a plumb cut at the top, stand them 16" apart in the clear leaning 1 in 4 against the ${d.loft === 'full' ? "hatch's" : "loft's edge"} joist, and screw each to the joist with three 3" screws. Fix the rungs (mark ${marks((m) => m.kind === 'ladder rung')}) flat between the rails 12" apart, glued, with two 3" screws through each rail into each end. Check it takes your weight before you load the loft.` : '',
    ].filter(Boolean),
    check: ['Every chord in one plane: sight along the knees and run a string along the peak.', 'Diagonals across the ties match.'],
  });
  return out;
}
