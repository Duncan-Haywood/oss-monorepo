// @ts-check
// Construction drawings for a framed shed: foundation plan, floor framing
// plan, a framing elevation of each wall, the roof framing plan and a
// building section through the gable. Each sheet is a list of primitives in
// real inches, so the same sheet renders to SVG for the screen and printer and
// to DXF for a CAD program, at true scale.

import { fmtFtIn, fmtIn } from './lumber.mjs';
import { WALLS, WALL_LABEL } from './model.mjs';
import { heelJoint } from './checks.mjs';

/** @typedef {[number, number]} P */
/**
 * @typedef {{ t: 'poly', pts: P[], closed?: boolean, cls: string }
 *   | { t: 'text', at: P, text: string, size?: number, anchor?: 'start'|'middle'|'end', cls?: string, rot?: number, spread?: string, from?: P }
 *   | { t: 'dim', a: P, b: P, off: number, text?: string }} Item
 */
/** @typedef {{ id: string, title: string, note?: string, items: Item[] }} Sheet */

const rect = (x0, y0, x1, y1, cls) => /** @type {Item} */ ({ t: 'poly', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, cls });
const line = (a, b, cls) => /** @type {Item} */ ({ t: 'poly', pts: [a, b], closed: false, cls });
const text = (at, s, size = 11, anchor = 'middle', cls = 'label') => /** @type {Item} */ ({ t: 'text', at, text: s, size, anchor, cls });
const dim = (a, b, off, txt) => /** @type {Item} */ ({ t: 'dim', a, b, off, ...(txt ? { text: txt } : {}) });

const CLS_FOR = {
  'skid': 'pt', 'rim joist': 'pt', 'floor joist': 'pt', header: 'header', 'rough sill': 'header',
  'top plate': 'plate', 'cap plate': 'plate', 'bottom plate': 'plate', rafter: 'member', 'ridge board': 'header', 'ridge beam': 'header', 'rafter tie': 'member',
};

/**
 * Plan footprint of a member from its 3D geometry: x along the shed's length, y across it.
 * @param {any} m
 */
function planBox(m) {
  const g = m.geom;
  const xs = []; const ys = [];
  for (const [a, b] of g.profile) {
    for (const t of [0, g.thickness]) {
      xs.push(g.origin[0] + g.u[0] * a + g.v[0] * b + g.w[0] * t);
      ys.push(g.origin[1] + g.u[1] * a + g.v[1] * b + g.w[1] * t);
    }
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/**
 * @param {import('./model.mjs').Shed} shed
 * @param {Map<string, string>} [marks] member id -> mark letter from the parts list
 * @returns {Sheet[]}
 */
export function buildSheets(shed, marks = new Map()) {
  const d = shed.design;
  const k = shed.dims;
  const L = d.length;
  const W = d.width;
  const sheets = /** @type {Sheet[]} */ ([]);
  const markText = (m) => marks.get(m.id) || '';
  // Where the rafter's underside meets the plate line, measured in from the wall's outside face:
  // the inside edge of the plate at a birdsmouth, the outside edge on a connector.
  const seat = k.connector ? 0 : k.stud;
  const treatedNote = d.floorTreated ? 'pressure-treated' : 'untreated (you chose untreated floor framing)';

  // 1. Foundation plan (top view, front wall at the bottom).
  {
    const items = /** @type {Item[]} */ ([]);
    items.push(rect(-12, -12, L + 12, W + 12, 'gravel'));
    items.push(rect(0, 0, L, W, 'outline'));
    for (const m of shed.members.filter((x) => x.kind === 'skid')) {
      const l = /** @type {any} */ (m.local);
      items.push(rect(l.s0, l.z0, l.s1, l.z1, 'pt'));
      items.push(text([L * 0.2, (l.z0 + l.z1) / 2 - 1.5], markText(m), 8, 'middle', 'mark'));
    }
    for (const f of shed.fixtures.filter((x) => x.kind === 'block')) {
      const o = f.geom.origin;
      items.push(rect(o[0], o[1], o[0] + 16, o[1] + 8, 'block'));
    }
    items.push(dim([0, 0], [L, 0], -38));
    items.push(dim([0, 0], [0, W], 38));
    items.push(dim([-12, W + 12], [L + 12, W + 12], 30, `pad ${fmtFtIn(L + 24)}`));
    const ys = k.skidYs;
    for (let i = 0; i + 1 < ys.length; i++) items.push(dim([L, ys[i]], [L, ys[i + 1]], -34, fmtIn(ys[i + 1] - ys[i])));
    items.push(text([L / 2, W / 2 + 4], `${k.skidCount} skids, PT ${d.skidSize} on edge`, 12));
    items.push(text([L / 2, W / 2 - 12], k.block ? `on ${k.blockCount} ${k.block.plural}` : 'on compacted gravel', 11));
    items.push(text([L / 2, -12 - 4], 'FRONT', 10, 'middle', 'muted'));
    sheets.push({
      id: 'foundation', title: 'Foundation plan',
      note: `${k.noPad ? 'Blocks on stripped, tamped firm soil; no gravel.' : k.underBlocks ? `A 4" bed of paver base under each block, 2" wider than the block all round (${k.baseBags} bags of 0.5 cu ft).` : `Gravel pad 4" deep, 12" past the shed on every side: about ${k.gravelCuYd.toFixed(1)} cu yd.`} Skids ${fmtFtIn(L)} long at the centres shown. Level the pad${k.block ? ' and the blocks' : ''} before setting skids; check local rules on setbacks and permits.`,
      items,
    });
  }

  // 2. Floor framing plan.
  {
    const items = /** @type {Item[]} */ ([]);
    for (const m of shed.members.filter((x) => x.group === 'floor')) {
      const l = /** @type {any} */ (m.local);
      items.push(rect(l.s0, l.z0, l.s1, l.z1, 'pt'));
      if (m.kind === 'floor joist') items.push(text([(l.s0 + l.s1) / 2, W / 2 + 10], markText(m), 9, 'middle', 'mark'));
      else if (l.s1 - l.s0 > l.z1 - l.z0) items.push(text([l.s0 + (l.s1 - l.s0) * 0.3, (l.z0 + l.z1) / 2 - 1.5], markText(m), 8, 'middle', 'mark'));
    }
    for (const y of k.skidYs) items.push(line([0, y], [L, y], 'hidden'));
    const c = k.joistCenters;
    items.push(dim([0, 0], [L, 0], -38));
    items.push(dim([0, 0], [0, W], 38));
    for (let i = 0; i + 1 < Math.min(c.length, 4); i++) items.push(dim([c[i], W], [c[i + 1], W], 24, fmtIn(c[i + 1] - c[i])));
    items.push(text([L / 2, -14], `${d.joistSize} joists at ${d.joistSpacing}" on centre, ${treatedNote}`, 11));
    sheets.push({
      id: 'floor', title: 'Floor framing plan',
      note: `${c.length} joists ${fmtIn(W - 3)} long between two ${fmtFtIn(L)} rim joists; skids dashed below. ${d.floorPanel === 'OSB' ? '23/32" tongue-and-groove OSB' : '3/4" tongue-and-groove plywood'} laid across the joists, 8 ft edges staggered, glued and screwed.`,
      items,
    });
  }

  // 3-6. Wall framing elevations, as seen from outside.
  for (const name of WALLS) {
    const wall = shed.walls[name];
    const eave = name === 'front' || name === 'back';
    const face = eave ? L : W;
    // Horizontal position as seen from outside.
    const hx = (s) => {
        if (name === 'front' || name === 'right') return s;
      return (eave ? L : W) - s;
    };
    const items = /** @type {Item[]} */ ([]);
    const off = eave ? 0 : k.stud;
    const floorBand = k.floorTop - k.skidTop;
    items.push(rect(0, -floorBand, face, 0, 'floorband'));
    for (const m of wall.members) {
      const l = /** @type {any} */ (m.local);
      const gable = m.group.startsWith('gable');
      const a = gable ? l.s0 : l.s0 + off;
      const b = gable ? l.s1 : l.s1 + off;
      const x0 = Math.min(hx(a), hx(b));
      const x1 = Math.max(hx(a), hx(b));
      const cls = CLS_FOR[m.kind] || 'member';
      if (gable && l.top) {
        const t0 = /** @type {[number, number][]} */ (l.top);
        items.push({ t: 'poly', pts: [[hx(a), l.z0], [hx(b), l.z0], [hx(t0[1][0]), t0[1][1]], [hx(t0[0][0]), t0[0][1]]], closed: true, cls });
      } else {
        items.push(rect(x0, l.z0, x1, l.z1, cls));
      }
      const mk = markText(m);
      const vertical = l.z1 - l.z0 > x1 - x0;
      if (mk && vertical && l.z1 - l.z0 > 14) items.push({ t: 'text', at: [(x0 + x1) / 2, (l.z0 + Math.min(l.z1, l.z0 + 60)) / 2], text: mk, size: 8, anchor: 'middle', cls: 'mark' });
      // Short pieces (cripples, gable studs, vent framing) are marked at their middle, in smaller letters.
      else if (mk && vertical) items.push(text([(x0 + x1) / 2, l.z0 + Math.min(l.z1 - l.z0, gable && l.top ? Math.min(l.top[0][1], l.top[1][1]) - l.z0 : Infinity) / 2 - 1], mk, 6, 'middle', 'mark'));
      // Plates are marked near the left end of each piece, so splices read piece by piece.
      else if (mk && /plate/.test(m.kind)) items.push(text([x0 + 3, (l.z0 + l.z1) / 2 - 0.5], mk, 6, 'start', 'mark'));
      else if (mk && !vertical && x1 - x0 > 14) items.push(text([(x0 + x1) / 2, (l.z0 + l.z1) / 2 - 3], mk, 8, 'middle', 'mark'));
      else if (mk) items.push(text([(x0 + x1) / 2, (l.z0 + l.z1) / 2 - 1], mk, 6, 'middle', 'mark'));
    }
    const H = d.wallHeight;
    if (!eave) {
      // Roof line over the gable: underside of the end rafter, and its top.
      const zb = (dist) => H + (dist - seat) * (d.pitch / 12);
      // The rafters stop at the ridge's faces, so the line is flat across the ridge.
      const rh = d.roofType === 'ridgeBeam' ? 1.5 : 0.75;
      const pts = /** @type {P[]} */ ([[-d.overhang, zb(-d.overhang)], [W / 2 - rh, zb(W / 2 - rh)], [W / 2 + rh, zb(W / 2 - rh)], [W + d.overhang, zb(-d.overhang)]]);
      items.push({ t: 'poly', pts, cls: 'roofline' });
      items.push({ t: 'poly', pts: pts.map(([x, z]) => /** @type {P} */ ([x, z + k.plumbH])), cls: 'roofline' });
      items.push(dim([W, 0], [W, k.ridgeTop - k.floorTop], -40, `${fmtFtIn(k.ridgeTop - k.floorTop)} to ridge top`));
    } else {
      // Rafter tails past the wall, as a band.
      const tail = d.pitch / 12 * (d.overhang + seat);
      items.push({ t: 'poly', pts: [[0, H], [face, H], [face, H - tail + k.plumbH], [0, H - tail + k.plumbH]], cls: 'roofline' });
    }
    // Centre of every full-height piece, from the left end, so the plates can be laid out from the sheet.
    const verts = wall.members.filter((m) => /stud/.test(m.kind) && !m.group.startsWith('gable'));
    for (const m of verts) {
      const l = /** @type {any} */ (m.local);
      const c = hx((l.s0 + l.s1) / 2 + off);
      items.push(line([c, -floorBand], [c, -floorBand - 1.5], 'dim'));
      // A king and a jack stand 1-1/2" apart: sheetSvg spreads labels that would touch and draws a leader to each tick.
      items.push({ t: 'text', at: [c + 0.8, -floorBand - 2], text: fmtIn(hx((l.s0 + l.s1) / 2 + off)), size: 7, anchor: 'end', cls: 'dimt', rot: 90, spread: 'centres', from: [c, -floorBand - 1.5] });
    }
    items.push(text([-2, -floorBand - 3], 'centres from left:', 7, 'end', 'muted'));
    items.push(dim([0, -floorBand], [face, -floorBand], -70));
    items.push(dim([face, 0], [face, H], eave ? -34 : -18, `${fmtFtIn(H)} wall`));
    for (const p of wall.openings) {
      const a = hx(p.a + off);
      const b = hx(p.a + p.w + off);
      const x0 = Math.min(a, b);
      const x1 = Math.max(a, b);
      items.push(rect(x0, p.bottom, x1, p.bottom + p.op.height, 'opening'));
      items.push(line([x0, p.bottom], [x1, p.bottom + p.op.height], 'opening'));
      items.push(line([x1, p.bottom], [x0, p.bottom + p.op.height], 'opening'));
      items.push(text([(x0 + x1) / 2, p.bottom + p.op.height / 2 + 4], `${p.op.kind === 'door' ? 'DOOR' : 'WINDOW'} R.O.`, 9));
      items.push(text([(x0 + x1) / 2, p.bottom + p.op.height / 2 - 8], `${fmtIn(p.w)} x ${fmtIn(p.op.height)}`, 9));
      items.push(dim([0, -floorBand], [x0, -floorBand], -52, `${fmtIn(x0)} to opening`));
      items.push(dim([x0, p.bottom], [x1, p.bottom], p.op.kind === 'window' ? -14 : 14));
      if (p.op.kind === 'window') items.push(dim([x1, 0], [x1, p.bottom], -14, `sill ${fmtIn(p.bottom)}`));
      items.push(dim([x0, 0], [x0, p.bottom + p.op.height], 14, `${fmtIn(p.bottom + p.op.height)} to header`));
    }
    for (const [i, vent] of (shed.vents?.[name] || []).entries()) {
      const a = hx(vent.s0); const b = hx(vent.s1);
      const x0 = Math.min(a, b); const x1 = Math.max(a, b);
      items.push(rect(x0, vent.z0, x1, vent.z1, 'opening'));
      items.push(text([(x0 + x1) / 2, vent.z0 + (vent.z1 - vent.z0) / 2 - 3], 'VENT', 8));
      // A pair of vents flanks the post: stack their labels so they do not run into each other.
      items.push(dim([x0, vent.z1], [x1, vent.z1], 10 + 14 * i, `${fmtIn(x1 - x0)} x ${fmtIn(vent.z1 - vent.z0)} vent`));
    }
    const studs = wall.members.filter((m) => m.kind === 'stud').length;
    sheets.push({
      id: `wall-${name}`, title: `${WALL_LABEL[name]} wall framing`,
      note: `${fmtFtIn(wall.len)} framed length, viewed from outside. ${d.studSize} studs ${fmtIn(k.studLen)} at ${d.studSpacing}" on centre (${studs} full studs), single bottom plate, double top plate. Letters are marks in the parts list.${eave ? '' : ` Gable studs are cut to the roof line; ${d.roofType === 'ridgeBeam' ? 'a two-ply post carries the ridge beam down onto two post studs' : 'a post carries the ridge'}${shed.vents?.[name] ? '; vents are framed with trimmers, a flat header and a sill' : ''}.`}`,
      items,
    });
  }

  // 7. Roof framing plan.
  {
    const items = /** @type {Item[]} */ ([]);
    const o = d.overhang;
    items.push(rect(0, -o, L, W + o, 'outline'));
    items.push(rect(0, 0, L, W, 'hidden'));
    for (const c of k.rafterCenters) {
      const rh2 = d.roofType === 'ridgeBeam' ? 1.5 : 0.75;
      items.push(rect(c - 0.75, -o, c + 0.75, W / 2 - rh2, 'member'));
      items.push(rect(c - 0.75, W / 2 + rh2, c + 0.75, W + o, 'member'));
    }
    const rh = d.roofType === 'ridgeBeam' ? 1.5 : 0.75;
    items.push(rect(0, W / 2 - rh, L, W / 2 + rh, 'header'));
    for (const m of shed.members.filter((x) => x.kind === 'rafter tie')) {
      const x = m.geom.origin[0];
      items.push(rect(x, 0, x + 1.5, W, 'hidden'));
    }
    const c = k.rafterCenters;
    for (let i = 0; i + 1 < Math.min(c.length, 4); i++) items.push(dim([c[i], W + o], [c[i + 1], W + o], 24, fmtIn(c[i + 1] - c[i])));
    items.push(dim([0, -o], [L, -o], -38));
    items.push(dim([L, -o], [L, 0], -30, `${fmtIn(o)} overhang`));
    items.push(dim([L, 0], [L, W], -30));
    // Blocking and sub-fascia from the model, and the mark of every roof member.
    for (const m of shed.members.filter((x) => x.group === 'roof')) {
      const bx = planBox(m);
      if (m.kind === 'eave blocking' || m.kind === 'sub-fascia') items.push(rect(bx.x0, bx.y0, bx.x1, bx.y1, 'member'));
      const mk = markText(m);
      if (!mk) continue;
      // Rafters a third of the way up from the eave, ties clear of the ridge, the rest at their middle.
      const y = m.kind === 'rafter' ? (bx.y0 < W / 2 - 2 ? bx.y0 + (bx.y1 - bx.y0) * 0.3 : bx.y1 - (bx.y1 - bx.y0) * 0.3)
        : m.kind === 'rafter tie' ? bx.y0 + (bx.y1 - bx.y0) * 0.42 : (bx.y0 + bx.y1) / 2;
      const x = m.kind === 'rafter' || m.kind === 'rafter tie' || m.kind === 'eave blocking' ? (bx.x0 + bx.x1) / 2 : bx.x0 + Math.min(18, (bx.x1 - bx.x0) / 2);
      items.push(text([x, y - 1.5], mk, m.kind === 'eave blocking' ? 6 : 8, 'middle', 'mark'));
    }
    items.push(text([L / 2, W / 2 + 10], d.roofType === 'ridgeBeam' ? `two-ply ${k.ridgeSize} ridge beam on posts` : `${k.ridgeSize} ridge board`, 11));
    items.push(text([L / 2, W / 4], `${d.rafterSize} rafters at ${d.rafterSpacing}" on centre`, 11));
    sheets.push({
      id: 'roof', title: 'Roof framing plan',
      note: `${c.length} rafter pairs, each rafter ${fmtIn(k.rafterCut)} from a board's square end (plumb cut at the ridge and tail, birdsmouth over the wall). ${d.roofType === 'ridgeBeam' ? `Rafters hang from a two-ply ${k.ridgeSize} ridge beam that bears on a two-ply post in each gable; no rafter ties, so the inside is open to the roof.` : `${d.tieSize} rafter ties (dashed) at plate height on every pair inside the gable ends.`} Roof sheathing 7/16" OSB, ${shed.dims.roofRows} courses per side.`,
      items,
    });
  }

  // 8. Building section through the shed, looking at the left gable from inside.
  {
    const items = /** @type {Item[]} */ ([]);
    const z0 = 0;
    items.push(rect(-12, -4, W + 12, z0, 'gravel'));
    for (const y of k.skidYs) {
      const sk = shed.members.find((m) => m.kind === 'skid');
      const th = sk ? (sk.geom.thickness) : 3.5;
      items.push(rect(y - th / 2, k.block ? k.block.h : 0, y + th / 2, k.skidTop, 'pt'));
      if (k.block) items.push(rect(y - k.block.across / 2, 0, y + k.block.across / 2, k.block.h, 'block'));
    }
    items.push(rect(0, k.skidTop, W, k.floorTop - 0.75, 'pt'));
    items.push(rect(0, k.floorTop - 0.75, W, k.floorTop, 'sheet'));
    for (const y0 of [0, W - k.stud]) {
      items.push(rect(y0, k.floorTop, y0 + k.stud, k.floorTop + 1.5, 'plate'));
      items.push(rect(y0, k.floorTop + 1.5, y0 + k.stud, k.plateTop - 3, 'member'));
      items.push(rect(y0, k.plateTop - 3, y0 + k.stud, k.plateTop, 'plate'));
    }
    const pair = shed.members.filter((m) => m.kind === 'rafter').slice(2, 4);
    for (const m of pair) items.push({ t: 'poly', pts: m.geom.profile.map((p) => /** @type {P} */ ([p[0], p[1]])), closed: true, cls: 'member' });
    const tie = shed.members.find((m) => m.kind === 'rafter tie');
    if (tie) items.push({ t: 'poly', pts: tie.geom.profile.map((p) => /** @type {P} */ ([p[0], p[1]])), closed: true, cls: 'member' });
    if (d.roofType === 'ridgeBeam') {
      items.push(rect(W / 2 - 1.5, k.ridgeTop - k.ridgeD, W / 2, k.ridgeTop, 'header'));
      items.push(rect(W / 2, k.ridgeTop - k.ridgeD, W / 2 + 1.5, k.ridgeTop, 'header'));
      items.push(rect(W / 2 - 1.5, k.plateTop, W / 2 + 1.5, k.ridgeTop - k.ridgeD, 'hidden'));
    } else {
      items.push(rect(W / 2 - 0.75, k.ridgeTop - k.ridgeD, W / 2 + 0.75, k.ridgeTop, 'header'));
    }
    const run = 12;
    const ax = W * 0.18;
    const az = k.plateTop + (ax - seat) * (d.pitch / 12) + k.plumbH + 10;
    items.push({ t: 'poly', pts: [[ax, az], [ax + run, az], [ax + run, az + d.pitch]], closed: true, cls: 'thin' });
    items.push(text([ax + run / 2, az + 1.5], '12', 9));
    items.push(text([ax + run + 3, az + d.pitch / 2 - 3], String(d.pitch), 9, 'start'));
    items.push(dim([0, k.floorTop], [0, k.plateTop], 34, `${fmtFtIn(d.wallHeight)} wall`));
    const sidingLabel = d.siding ? (d.sidingType === 'T1-11' || d.sidingType.startsWith('LP SmartSide') ? `${d.sidingType} panels` : `${d.sidingType} over OSB`) : '';
    // Clear of the siding label, which sits between the wall and this dimension.
    items.push(dim([W, 0], [W, k.peak], -(40 + textWidth(sidingLabel, 8)), `${fmtFtIn(k.peak)} to peak`));
    items.push(dim([0, 0], [W, 0], -30));
    const tailZ = k.plateTop - (d.overhang + seat) * (d.pitch / 12) - 8;
    if (d.overhang > 0) items.push(dim([-d.overhang, tailZ], [0, tailZ], -10, `${fmtIn(d.overhang)} overhang`));
    // Roof build-up, eave and wall finishes.
    const tt = d.pitch / 12;
    const cosA = 1 / Math.sqrt(1 + tt * tt);
    const zt = (dist) => k.plateTop + (dist - seat) * tt + k.plumbH;
    const zb = (dist) => k.plateTop + (dist - seat) * tt;
    const sh = (7 / 16) / cosA;
    const o = d.overhang;
    for (const back of [false, true]) {
      const Yv = (y) => (back ? W - y : y);
      items.push({ t: 'poly', pts: [[Yv(-o), zt(-o)], [Yv(W / 2), zt(W / 2)], [Yv(W / 2), zt(W / 2) + sh], [Yv(-o), zt(-o) + sh]], closed: true, cls: 'sheet' });
      items.push({ t: 'poly', pts: [[Yv(-o), zt(-o) + sh + 0.4], [Yv(W / 2), zt(W / 2) + sh + 0.4]], cls: 'roofline' });
      if (o > 0) {
        items.push(rect(Math.min(Yv(-o - 1.5), Yv(-o)), zt(-o) - 5.5, Math.max(Yv(-o - 1.5), Yv(-o)), zt(-o), 'member'));
        items.push(rect(Math.min(Yv(-o - 2.25), Yv(-o - 1.5)), zt(-o) - 6, Math.max(Yv(-o - 2.25), Yv(-o - 1.5)), zt(-o), 'plate'));
        items.push(line([Yv(-o), zb(-o) - 0.3], [Yv(0), zb(0) - 0.3], 'thin'));
      }
      if (d.siding) items.push(rect(Math.min(Yv(-0.6), Yv(0)), k.skidTop, Math.max(Yv(-0.6), Yv(0)), k.plateTop, 'sheet'));
    }
    const block = shed.members.find((m) => m.kind === 'eave blocking');
    if (block) items.push({ t: 'poly', pts: block.geom.profile.map((p) => /** @type {P} */ ([p[0], p[1]])), closed: true, cls: 'member' });
    if (shed.interior) for (const y0 of [k.stud, W - k.stud - 0.25]) items.push(rect(y0, k.floorTop, y0 + 0.25, k.plateTop - 3, 'sheet'));
    const lbl = (y, z, s2, anchor = 'start') => items.push(text([y, z], s2, 8, anchor, 'label'));
    lbl(W * 0.62, zt(W * 0.38) + 4, `7/16" OSB, underlayment, ${d.roofCover === 'metal' ? 'metal panels' : 'shingles'}`);
    lbl(W * 0.62, zt(W * 0.38) - 8, `${d.rafterSize} rafters at ${d.rafterSpacing}" o.c.`);
    if (o > 0) lbl(W + o + 3, zt(-o) - 4, '2x6 sub-fascia + 1x6 fascia; vented soffit under the tails', 'start');
    if (block) lbl(k.stud + 2, k.plateTop + 6, 'eave block between rafters', 'start');
    if (d.siding) lbl(W + 3, k.floorTop + 40, sidingLabel, 'start');
    lbl(k.stud + 4, k.floorTop + 10, `${d.studSize} studs at ${d.studSpacing}" o.c., double top plate`);
    lbl(W / 2 + 4, k.skidTop + 2, `${d.joistSize} joists at ${d.joistSpacing}" o.c. on ${k.skidCount} ${d.skidSize} skids`);
    items.push(text([W / 2, k.floorTop + 30], 'SECTION', 12, 'middle', 'muted'));
    sheets.push({
      id: 'section', title: 'Building section',
      note: `${d.pitch}/12 gable roof. Heights from the top of the gravel: floor ${fmtFtIn(k.floorTop)}, top plate ${fmtFtIn(k.plateTop)}, peak about ${fmtFtIn(k.peak)}. ${k.connector ? 'Rafters sit on variable-pitch connectors at the plate, with no birdsmouth.' : `Birdsmouth heel ${fmtIn(k.heel)} with a ${fmtIn(k.stud)} seat.`}`,
      items,
    });
  }
  // Exterior elevations: the finished outside of each wall, two to a sheet.
  {
    const tt = d.pitch / 12;
    const cosA = 1 / Math.sqrt(1 + tt * tt);
    const o = d.overhang;
    const zt = (dist) => k.plateTop + (dist - k.stud) * tt + k.plumbH;
    const roofTop = (dist) => zt(dist) + (7 / 16 + (d.roofCover === 'metal' ? 0.6 : 0.35)) / cosA;
    const face = (name) => (name === 'front' || name === 'back' ? L : W);
    const hxOf = (name, a) => (name === 'front' || name === 'right' ? a : face(name) - a);
    const elevation = (name, dx, items) => {
      const eave = name === 'front' || name === 'back';
      const F = face(name);
      const X = (a) => dx + a;
      items.push(line([X(-o - 24), 0], [X(F + o + 24), 0], 'outline'));
      items.push(rect(X(0), 0, X(F), k.skidTop, 'pt'));
      // Siding panels as they hang.
      for (const p of shed.panels.filter((x) => x.kind === 'siding' && x.wall === name)) {
        const g = p.geom;
        const pts = g.profile.map(([a, z]) => /** @type {P} */ ([X(hxOf(name, a)), z]));
        items.push({ t: 'poly', pts, closed: true, cls: 'sheet' });
      }
      // Roof seen from this side.
      if (eave) {
        items.push(rect(X(0), zt(-o) - 6, X(F), zt(-o), 'plate'));
        items.push({ t: 'poly', pts: [[X(0), zt(-o)], [X(F), zt(-o)], [X(F), k.peak], [X(0), k.peak]], closed: true, cls: 'roof' });
      } else {
        const pts = /** @type {P[]} */ ([[X(-o), roofTop(-o)], [X(F / 2), k.peak], [X(F + o), roofTop(-o)], [X(F + o), roofTop(-o) - 4], [X(F / 2), k.peak - 4 / cosA], [X(-o), roofTop(-o) - 4]]);
        items.push({ t: 'poly', pts, closed: true, cls: 'plate' });
      }
      // Doors, windows and vents.
      const w = shed.walls[name];
      const off = eave ? 0 : k.stud;
      for (const p of w.openings) {
        const a = hxOf(name, p.a + off);
        const b = hxOf(name, p.a + p.w + off);
        const x0 = Math.min(a, b);
        const x1 = Math.max(a, b);
        items.push(rect(X(x0), k.floorTop + p.bottom, X(x1), k.floorTop + p.bottom + p.op.height, p.op.kind === 'door' ? 'door' : 'glass'));
        items.push(text([X((x0 + x1) / 2), k.floorTop + p.bottom + p.op.height / 2], `${p.op.kind === 'door' ? 'DOOR' : 'WINDOW'} ${fmtIn(p.w)} x ${fmtIn(p.op.height)} R.O.`, 7));
      }
      for (const v of shed.vents?.[name] || []) {
        const a = hxOf(name, v.s0); const b = hxOf(name, v.s1);
        items.push(rect(X(Math.min(a, b)), k.floorTop + v.z0, X(Math.max(a, b)), k.floorTop + v.z1, 'glass'));
      }
      items.push(dim([X(0), 0], [X(F), 0], -28, fmtFtIn(F)));
      items.push(dim([X(F), 0], [X(F), eave ? zt(-o) : k.peak], -26, eave ? `${fmtFtIn(zt(-o))} to eave` : `${fmtFtIn(k.peak)} to peak`));
      items.push(text([X(F / 2), -48], `${name.toUpperCase()} (${eave ? 'EAVE SIDE' : 'GABLE END'})`, 10, 'middle', 'muted'));
    };
    for (const pair of [['front', 'back'], ['left', 'right']]) {
      const items = /** @type {Item[]} */ ([]);
      elevation(pair[0], 0, items);
      elevation(pair[1], face(pair[0]) + 2 * o + 96, items);
      sheets.push({
        id: `exterior-${pair[0]}-${pair[1]}`, title: `Exterior elevations: ${pair[0]} and ${pair[1]}`,
        note: `Finished outside as seen from each side: ${d.siding ? `${d.sidingType} siding (panel and sheet joints shown)` : 'no siding'}, ${d.roofCover === 'metal' ? 'metal roof' : 'shingle roof'}, rough openings for doors, windows and vents. Heights from the top of the gravel.`,
        items,
      });
    }
  }

  // Sheathing layout: every floor and roof sheet, where it goes and its size.
  {
    const items = /** @type {Item[]} */ ([]);
    for (const p of shed.panels.filter((x) => x.kind === 'floor sheet')) {
      const g = p.geom; const [x0, y0] = [g.origin[0], g.origin[1]];
      const w = g.profile[1][0]; const h = g.profile[2][1];
      items.push(rect(x0, y0, x0 + w, y0 + h, 'sheet'));
      items.push(text([x0 + w / 2, y0 + h / 2 - 3], `${fmtIn(w)} x ${fmtIn(h)}`, 8));
    }
    items.push(text([L / 2, -14], `FLOOR: ${d.floorPanel === 'OSB' ? '23/32" T&G OSB' : '3/4" T&G plywood'}, 8 ft edges across the joists, end joints on joists`, 9));
    const slope = k.slopeLen;
    const gap = 60;
    for (const side of ['front', 'back']) {
      const base = side === 'front' ? W + gap : W + gap + slope + 30;
      for (const p of shed.panels.filter((x) => x.kind === 'roof sheathing' && x.side === side)) {
        const [x0, q0] = /** @type {number[]} */ (p.pos);
        const w = p.geom.profile[1][0]; const h = p.geom.profile[2][1];
        items.push(rect(x0, base + q0, x0 + w, base + q0 + h, 'sheet'));
        items.push(text([x0 + w / 2, base + q0 + h / 2 - 3], `${fmtIn(w)} x ${fmtIn(h)}`, 8));
      }
      items.push(text([L / 2, base - 10], `ROOF, ${side} slope, laid flat (eave at the bottom): 7/16" OSB, staggered, end joints on rafters`, 9));
    }
    sheets.push({
      id: 'sheathing', title: 'Sheathing layout',
      note: `Each rectangle is one piece, with its size; pieces under 8 ft are cut from whole sheets (the shopping list counts the sheets after packing the cuts). Floor ${fmtFtIn(L)} x ${fmtFtIn(W)}; each roof slope ${fmtFtIn(L)} x ${fmtIn(slope)} along the slope.`,
      items,
    });
  }

  // Typical details and nailing schedule.
  {
    const items = /** @type {Item[]} */ ([]);
    const D2 = k.stud;
    // Header section: two plies, spacer, on the jack, under the cripple and plates.
    const hd = shed.walls.front?.openings?.[0]?.hd ?? 5.5;
    const hx0 = 0;
    items.push(rect(hx0, 0, hx0 + 1.5, hd, 'header'));
    if (D2 > 3) items.push(rect(hx0 + 1.5, 0, hx0 + D2 - 1.5, hd, 'sheet'));
    items.push(rect(hx0 + D2 - 1.5, 0, hx0 + D2, hd, 'header'));
    items.push(rect(hx0, hd, hx0 + D2, hd + 4, 'member'));
    items.push(rect(hx0, hd + 4, hx0 + D2, hd + 5.5, 'plate'));
    items.push(rect(hx0, hd + 5.5, hx0 + D2, hd + 7, 'plate'));
    items.push(text([hx0 + D2 / 2, -6], 'HEADER SECTION', 9, 'middle', 'muted'));
    items.push(text([hx0 + D2 + 2, hd / 2], `2 plies ${shed.walls.front?.openings?.[0]?.hdr ?? '2x6'}${D2 > 3 ? ` + ${fmtIn(D2 - 3)} plywood spacer` : ''}`, 7, 'start'));
    items.push(text([hx0 + D2 + 2, hd + 2], 'cripple on layout', 7, 'start'));
    items.push(text([hx0 + D2 + 2, hd + 6], 'top plate + cap plate', 7, 'start'));
    // Skid and floor section.
    const sx = 40;
    const sk = shed.members.find((m) => m.kind === 'skid');
    const st = sk ? sk.geom.thickness : 3.5;
    items.push(rect(sx - 6, -4, sx + 30, 0, 'gravel'));
    items.push(rect(sx, 0, sx + st, k.skidTop, 'pt'));
    items.push(rect(sx, k.skidTop, sx + 1.5, k.skidTop + k.joistDepth, 'pt'));
    items.push(rect(sx + 1.5, k.skidTop, sx + 24, k.skidTop + k.joistDepth, 'pt'));
    items.push(rect(sx, k.floorTop - 0.75, sx + 24, k.floorTop, 'sheet'));
    items.push(rect(sx, k.floorTop, sx + D2, k.floorTop + 1.5, 'plate'));
    items.push(rect(sx, k.floorTop + 1.5, sx + D2, k.floorTop + 12, 'member'));
    items.push(rect(sx - 0.6, k.skidTop, sx, k.floorTop + 12, 'sheet'));
    items.push(text([sx + 12, -9], 'SKID AND FLOOR EDGE', 9, 'middle', 'muted'));
    items.push(text([sx + 26, k.skidTop / 2], `PT ${d.skidSize} skid on ${k.block ? 'a block' : 'compacted gravel'}`, 7, 'start'));
    items.push(text([sx + 26, k.skidTop + k.joistDepth / 2], `PT ${d.joistSize} rim and joists, toenailed to the skid`, 7, 'start'));
    items.push(text([sx + 26, k.floorTop + 1], `${d.floorPanel === 'OSB' ? '23/32" T&G OSB' : '3/4" T&G plywood'}, glued and screwed`, 7, 'start'));
    items.push(text([sx + 26, k.floorTop + 8], 'bottom plate nailed through into the rim; siding laps the rim', 7, 'start'));
    // Nailing schedule (typical; check local code and maker instructions).
    const rows = [
      ['Stud to plate (end nail)', '2-16d'],
      ['Jack to king', '16d at 16" o.c., staggered'],
      ['Header to king, each end', '4-16d'],
      ['Header plies together', '16d at 16" o.c., both faces'],
      ['Cap plate to top plate', '16d at 16" o.c.; 2-16d at each lap'],
      ['Bottom plate to floor', '2-16d at 16" o.c. into rim or joist'],
      ['Rim to joist end', '3-16d'],
      ['Joist to skid', '2-16d toenail, or a framing tie'],
      ['Rafter to plate', 'rafter-to-plate tie each rafter, maker\'s nails'],
      [d.roofType === 'ridgeBeam' ? 'Rafter to ridge beam' : 'Rafter to ridge board', d.roofType === 'ridgeBeam' ? 'face-mount hanger, maker\'s nails' : '3-16d end or toenail'],
      ...(heelJoint(shed) ? [['Rafter tie to rafter, each end', `${heelJoint(shed)?.nails}-16d common, face nailed`]] : []),
      ['Subfloor', '1-5/8" screws 6" edges, 12" field, with adhesive'],
      ['Wall and roof sheathing', '8d at 6" edges, 12" field'],
      ['Siding panels', '8d galvanized 6" edges, 12" field'],
    ];
    const tx = 140;
    items.push(text([tx, 18], 'NAILING SCHEDULE (typical; your code and each maker\'s instructions win)', 9, 'start', 'muted'));
    rows.forEach(([a, b], i) => { items.push(text([tx, 10 - i * 5], a, 8, 'start')); items.push(text([tx + 42, 10 - i * 5], b, 8, 'start')); });
    // Frame the table so the sheet's fit includes the text, which has no width of its own here.
    items.push(rect(tx - 3, 10 - rows.length * 5, tx + 125, 22, 'outline'));
    items.push(line([tx + 40, 10 - rows.length * 5], [tx + 40, 14], 'thin'));
    sheets.push({ id: 'details', title: 'Typical details and nailing schedule', note: 'Header and floor-edge sections, not to scale with each other. Fastener counts are common practice for a light wood-framed shed, given for planning; confirm them against your local code.', items });
  }

  // 9. Rafter detail: the pattern rafter, drawn as it sits, with every cut.
  {
    const items = /** @type {Item[]} */ ([]);
    const tt = d.pitch / 12;
    const D2 = k.stud;
    const o = d.overhang;
    const rh = d.roofType === 'ridgeBeam' ? 1.5 : 0.75;
    const r = W / 2 - rh;
    const zb = (y) => (y - (k.connector ? 0 : D2)) * tt;
    const zt = (y) => zb(y) + k.plumbH;
    const raf = shed.members.find((m) => m.kind === 'rafter');
    const prof = raf ? raf.geom.profile.map(([y, z]) => /** @type {P} */ ([y, z - k.plateTop])) : [];
    items.push({ t: 'poly', pts: prof, closed: true, cls: 'member' });
    // The wall under it, for reference.
    items.push(rect(0, -6, D2, 0, 'hidden'));
    items.push(text([D2 / 2, -10], 'wall top plates', 8, 'middle', 'muted'));
    if (!k.connector) items.push(dim([D2, zb(D2)], [r, zb(r)], -18, `${fmtIn((r - D2) / Math.cos(Math.atan(tt)))} along the bottom edge (run ${fmtIn(r - D2)})`));
    if (k.connector) {
      items.push(text([D2 / 2, -16], 'variable-pitch connector here (no notch)', 8, 'middle'));
    } else {
      items.push(dim([0, -6], [D2, -6], -14, `seat ${fmtIn(D2)}`));
      items.push(dim([0, zb(0)], [0, 0], 12, `heel ${fmtIn(D2 * tt)}`));
    }
    if (o > 0) items.push(dim([-o, zb(-o) - 2], [0, zb(-o) - 2], -14, `${fmtIn(o)} tail`));
    items.push(dim([r, zb(r)], [r, zt(r)], -16, `plumb ${fmtIn(k.plumbH)}`));
    // The board's length runs along the rafter from the tail's long point to the ridge's: the
    // top edge plus the depth's run along the slope, which is what the cut list counts.
    const cosA = Math.cos(Math.atan(tt));
    const back = k.rafterDepth * tt; // the long point lies this far behind the tail's top corner, along the slope
    const lp = /** @type {P} */ ([-o - back * cosA, zt(-o) - back * tt * cosA]);
    items.push(line(lp, [-o, zt(-o)], 'hidden'));
    items.push(dim(lp, [r, zt(r)], 24, `${fmtIn(k.rafterCut)} cut length from a square end (mark on the cut sheet)`));
    items.push(text([r - 2, zt(r) + 6], `ridge plumb cut: ${d.pitch} on the common scale`, 9, 'end'));
    items.push(text([-o, zt(-o) + 6], o > 0 ? `tail plumb cut: ${d.pitch} on the common scale` : '', 9, 'start'));
    sheets.push({
      id: 'rafter', title: 'Rafter detail',
      note: `${d.rafterSize} rafter at ${d.pitch}/12 (${(Math.atan(tt) * 180 / Math.PI).toFixed(1)} deg). Lay out one pattern rafter from this sheet, test it at both gable ends and the middle, then trace the rest.${k.connector ? ' No birdsmouth: the rafter sits on a variable-pitch connector at the wall.' : ' Never overcut the birdsmouth corner; finish it with a handsaw.'}`,
      items,
    });
  }

  // Site-built door: the frame seen from inside, with the cut sizes.
  for (const dr of shed.doors || []) {
    const items = /** @type {Item[]} */ ([]);
    const { w, h, railLen } = dr;
    const T = 3.5;
    const bay = (h - 3 * T) / 2;
    const bh = T / Math.cos(Math.atan2(bay, railLen));
    items.push(rect(0, 0, w, h, 'hidden'));
    items.push(rect(0, 0, T, h, 'member'));
    items.push(rect(w - T, 0, w, h, 'member'));
    for (const z of [0, T + bay, h - T]) items.push(rect(T, z, w - T, z + T, 'member'));
    for (const z0 of [T, 2 * T + bay]) items.push({ t: 'poly', pts: [[T, z0], [w - T, z0 + bay - bh], [w - T, z0 + bay], [T, z0 + bh]], closed: true, cls: 'header' });
    for (const z of [T / 2, T + bay + T / 2, h - T / 2]) {
      items.push(rect(-1, z - 0.75, 8, z + 0.75, 'block'));
      items.push(text([9, z + 2.5], 'tee hinge', 7, 'start', 'muted'));
    }
    items.push(text([w - 6, h / 2 + 2], 'pull / hasp', 7, 'end', 'muted'));
    items.push(dim([0, 0], [w, 0], -14, `${fmtIn(w)} door (opening less 1/4" each side${dr.leaves > 1 ? ' and between the pair' : ''})`));
    items.push(dim([w, 0], [w, h], -16, `${fmtIn(h)} (1/4" top and bottom)`));
    items.push(dim([T, h], [w - T, h], 10, `rails ${fmtIn(railLen)}`));
    items.push(text([w / 2, T + bay / 2], `Z brace, ${dr.braceAngle.toFixed(0)} deg, cut to fit`, 8));
    // Part marks, as on the cut sheet.
    const doorMark = (kind) => markText(/** @type {any} */ ((shed.doorParts || []).find((p) => p.kind === kind && p.note.startsWith(`door ${dr.id}:`)) || {}));
    for (const x of [T / 2, w - T / 2]) items.push(text([x, h * 0.62], doorMark('door stile'), 8, 'middle', 'mark'));
    for (const z of [0, T + bay, h - T]) items.push(text([w * 0.62, z + T / 2 - 1.2], doorMark('door rail'), 8, 'middle', 'mark'));
    for (const z0 of [T, 2 * T + bay]) items.push(text([w * 0.7, z0 + bay * 0.7 - bh / 2], doorMark('door brace'), 8, 'middle', 'mark'));
    sheets.push({
      id: `door-${dr.id}`, title: `Door ${dr.id}: site-built shed door`,
      note: `Seen from inside, hinges on the left in this view. ${dr.leaves > 1 ? `A pair of leaves, each ${fmtIn(w)} wide. ` : ''}Skin: the siding cut out of the door opening, best face out. Frame: 2x4s laid flat, glued and screwed through the skin with 1-1/4" exterior screws every 8". The braces run down toward the hinges so the door cannot sag. Hang on three tee hinges with a 1/4" gap all round, the hinge straps over the rails.`,
      items,
    });
  }

  // 10. Corner detail: how the double top plate interlocks.
  {
    const items = /** @type {Item[]} */ ([]);
    const D2 = k.stud;
    const run = 30;
    const panel = (dx, title, layer) => {
      // Long (front) wall runs along x; end (left) wall runs along y. Corner at (dx, 0).
      if (layer === 'top') {
        items.push(rect(dx, 0, dx + run, D2, 'plate'));
        items.push(rect(dx, D2, dx + D2, run, 'plate'));
        items.push(text([dx + run / 2, D2 / 2 - 1], 'long wall top plate (full length)', 7));
        items.push({ t: 'text', at: [dx + D2 / 2 + 1, D2 + (run - D2) / 2], text: 'end wall top plate (between)', size: 7, anchor: 'middle', rot: 90 });
      } else {
        items.push(rect(dx + D2, 0, dx + run, D2, 'header'));
        items.push(rect(dx, 0, dx + D2, run, 'header'));
        items.push(text([dx + D2 + (run - D2) / 2, D2 / 2 - 1], `long wall cap, stops ${fmtIn(D2)} short`, 7));
        items.push({ t: 'text', at: [dx + D2 / 2 + 1, run / 2], text: `end wall cap, runs ${fmtIn(D2)} long`, size: 7, anchor: 'middle', rot: 90 });
        items.push(dim([dx, 0], [dx + D2, 0], -12, fmtIn(D2)));
      }
      items.push(text([dx + run / 2, run + 6], title, 10, 'middle'));
      items.push(text([dx - 2, -3], 'outside corner', 7, 'end', 'muted'));
    };
    panel(0, 'First layer: top plates', 'top');
    panel(run + 18, 'Second layer: cap plates (laps the corner)', 'cap');
    sheets.push({
      id: 'corner', title: 'Corner detail: interlocking top plates',
      note: `Plan view of a corner from above. The first top plates butt at the corner; the long wall's cap stops ${fmtIn(D2)} short and the end wall's cap runs over the long wall's top plate, locking the walls together. Nail the lap with two 16d down into the plate below. A flat steel strap across the corner is optional extra hold.`,
      items,
    });
  }

  // 0. Cover sheet: what this is, the data, the schedule and the index. Built last so the index is complete.
  {
    const items = /** @type {Item[]} */ ([]);
    const lines = [];
    const row = (s2, size = 10, cls = 'label') => lines.push({ s2, size, cls });
    row(d.name, 18);
    row(`${fmtFtIn(L)} x ${fmtFtIn(W)} gable shed, ${d.pitch}/12 roof, peak about ${fmtFtIn(k.peak)} above the gravel`, 11);
    row('');
    row('DESIGN DATA', 9, 'muted');
    row(`Walls: ${d.studSize} at ${d.studSpacing}" o.c., ${fmtFtIn(d.wallHeight)} floor to top of plates (studs ${fmtIn(k.studLen)}), double top plate interlocked at corners.`);
    row(`Floor: ${d.joistSize} joists at ${d.joistSpacing}" o.c. on ${k.skidCount} PT ${d.skidSize} skids, ${k.block ? `on ${k.block.plural} on ${k.noPad ? 'tamped firm soil' : k.underBlocks ? 'a bed of paver base each' : 'a compacted gravel pad'}` : 'on a compacted gravel pad'}; ${d.floorPanel === 'OSB' ? '23/32" T&G OSB' : '3/4" T&G plywood'}.`);
    row(`Roof: ${d.rafterSize} rafters at ${d.rafterSpacing}" o.c., ${d.roofType === 'ridgeBeam' ? `two-ply ${k.ridgeSize} ridge beam on posts, no ties` : `${k.ridgeSize} ridge board with ${d.tieSize} rafter ties`}, ${fmtIn(d.overhang)} overhang; ${d.roofCover === 'metal' ? 'corrugated metal' : 'shingles'} on 7/16" OSB.`);
    row(`Siding: ${d.siding ? d.sidingType : 'none'}. Inside: ${d.interior === 'none' ? 'bare framing' : d.interior}${d.insulation ? ', R-13 insulation' : ''}.`);
    row(`Loads used for the strength checks: ${d.snowLoad} psf roof snow, ${d.windLoad} psf wind on the walls, 15 psf roof dead, 40 psf floor live.`);
    row('');
    row('DOORS, WINDOWS AND VENTS (rough openings)', 9, 'muted');
    for (const [name, wall] of Object.entries(shed.walls)) for (const p of wall.openings) {
      row(`${p.op.kind === 'door' ? 'Door' : 'Window'} on the ${name} wall: ${fmtIn(p.w)} wide x ${fmtIn(p.op.height)} high${p.op.kind === 'window' ? `, sill ${fmtIn(p.bottom)} above the floor` : ''}; header 2-ply ${p.hdr}.`);
    }
    const nv = Object.values(shed.vents || {}).flat().length;
    if (nv) row(`Gable vents: ${nv}, each ${fmtIn(d.ventWidth)} x ${fmtIn(d.ventHeight)}.`);
    row('');
    row('SHEETS', 9, 'muted');
    sheets.forEach((sh2, i) => row(`${i + 2}. ${sh2.title}`));
    row('');
    row('NOTES', 9, 'muted');
    row('Written dimensions govern; do not scale the drawings. Letters on members are marks in the cut sheet and parts list.');
    row('All lumber in ground contact or on the skids is pressure-treated. Fasteners as the build instructions and each maker specify.');
    row('Not engineered and not checked against any building code. Confirm permits, setbacks, snow and wind loads with your building department.');
    lines.forEach((ln, i) => { if (ln.s2) items.push(text([0, -i * 22], ln.s2, ln.size, 'start', ln.cls)); });
    items.push(rect(-10, -lines.length * 22, 1000, 30, 'outline'));
    sheets.unshift({ id: 'cover', title: 'Cover sheet', note: 'Design summary, opening schedule and sheet index.', items });
  }
  return sheets;
}

/** Bounding box of a sheet's geometry, dimension offsets ignored. */
function bounds(items) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const see = ([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const it of items) {
    if (it.t === 'poly') it.pts.forEach(see);
    else if (it.t === 'text') see(it.at);
    else { see(it.a); see(it.b); }
  }
  return { x0, y0, x1, y1 };
}

/** Spread labels: least gap between neighbours, how far one may move, and how far a moved one drops for its leader (px). */
const SPREAD_GAP = 8.5;
const SPREAD_REACH = 24;
const SPREAD_DROP = 4;

/**
 * Screen x for each label of a row (sorted by x), at least `gap` apart and
 * each as near its own x as the others allow: neighbours that would touch are
 * merged into a run centred on the mean of their own positions.
 * @param {number[]} xs sorted
 * @param {number} gap
 */
export function spreadRow(xs, gap) {
  /** @type {number[][]} */
  const runs = [];
  const startOf = (r) => r.reduce((t, x, j) => t + x - j * gap, 0) / r.length;
  for (const x of xs) {
    let r = [x];
    while (runs.length) {
      const prev = runs[runs.length - 1];
      if (startOf(prev) + prev.length * gap <= startOf(r) + 1e-9) break;
      r = [.../** @type {number[]} */ (runs.pop()), ...r];
    }
    runs.push(r);
  }
  return runs.flatMap((r) => { const s0 = startOf(r); return r.map((_, j) => s0 + j * gap); });
}

/** Rough width of a line of lettering in pixels. */
const textWidth = (s, size) => String(s).length * size * 0.56;

/**
 * Every point a sheet draws, with how far its marks reach on screen from it in
 * pixels (x right, y down), whatever the scale: lettering, and a dimension's
 * offset, ticks and label. The same arithmetic as sheetSvg below.
 * @param {Item[]} items
 */
function screenReach(items) {
  /** @type {{ x: number, y: number, dx0: number, dx1: number, dy0: number, dy1: number }[]} */
  const out = [];
  const box = (x, y, cx, cy, w, h, ang, anchor = 'middle') => {
    // A w x h label whose baseline point sits (cx, cy) px from the model point, turned ang degrees on screen.
    const a0 = anchor === 'start' ? 0 : anchor === 'end' ? -w : -w / 2;
    const c = Math.cos(ang * Math.PI / 180); const sn = Math.sin(ang * Math.PI / 180);
    const pts = [[a0, -h], [a0 + w, -h], [a0, h * 0.3], [a0 + w, h * 0.3]].map(([u, v]) => [cx + u * c - v * sn, cy + u * sn + v * c]);
    out.push({ x, y, dx0: Math.min(...pts.map((p) => p[0])), dx1: Math.max(...pts.map((p) => p[0])), dy0: Math.min(...pts.map((p) => p[1])), dy1: Math.max(...pts.map((p) => p[1])) });
  };
  for (const it of items) {
    if (it.t === 'poly') for (const [x, y] of it.pts) out.push({ x, y, dx0: -1, dx1: 1, dy0: -1, dy1: 1 });
    else if (it.t === 'text') {
      if (!it.text) continue;
      const w = textWidth(it.text, it.size || 11); const h = it.size || 11; const ang = -(it.rot || 0);
      if (it.spread) for (const dx of [-SPREAD_REACH, SPREAD_REACH]) box(it.at[0], it.at[1], dx, SPREAD_DROP, w, h, ang, it.anchor || 'middle');
      else box(it.at[0], it.at[1], 0, 0, w, h, ang, it.anchor || 'middle');
    }
    else {
      const dx = it.b[0] - it.a[0]; const dy = -(it.b[1] - it.a[1]); const len = Math.hypot(dx, dy) || 1;
      const nx = dy / len; const ny = -dx / len;
      const o = it.off; const sg = Math.sign(o || 1);
      for (const p of [it.a, it.b]) {
        const ex = [nx * (o + sg * 4), ny * (o + sg * 4)];
        out.push({ x: p[0], y: p[1], dx0: Math.min(0, ex[0]) - 4, dx1: Math.max(0, ex[0]) + 4, dy0: Math.min(0, ex[1]) - 4, dy1: Math.max(0, ex[1]) + 4 });
      }
      let ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang <= -90) ang += 180;
      const label = it.text || fmtFtIn(Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]));
      const mx = (it.a[0] + it.b[0]) / 2; const my = (it.a[1] + it.b[1]) / 2;
      const cx = nx * (o + sg * 4); const cy = ny * (o + sg * 4);
      const w = textWidth(label, 10); // the label hangs to one side of its point or the other: allow both
      const c = Math.cos(ang * Math.PI / 180); const sn = Math.sin(ang * Math.PI / 180);
      const pts = [[-w / 2, -11], [w / 2, -11], [-w / 2, 11], [w / 2, 11]].map(([u, v]) => [cx + u * c - v * sn, cy + u * sn + v * c]);
      out.push({ x: mx, y: my, dx0: Math.min(...pts.map((p) => p[0])), dx1: Math.max(...pts.map((p) => p[0])), dy0: Math.min(...pts.map((p) => p[1])), dy1: Math.max(...pts.map((p) => p[1])) });
    }
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SVG_STYLE = `
.sds .pt{fill:#d8e4c8;stroke:#4d5f3a;stroke-width:.8}
.sds .member{fill:#f1dfb9;stroke:#6b4f2a;stroke-width:.8}
.sds .plate{fill:#e8d3a6;stroke:#6b4f2a;stroke-width:.8}
.sds .header{fill:#e2b978;stroke:#6b4f2a;stroke-width:.8}
.sds .sheet{fill:#d9c9a8;stroke:#6b4f2a;stroke-width:.6}
.sds .roof{fill:#5b616a;stroke:#2c2f33;stroke-width:.8}
.sds .door{fill:#8a6a48;stroke:#3d2c1b;stroke-width:.8}
.sds .glass{fill:#cfe3f3;stroke:#2563a8;stroke-width:.8}
.sds .block{fill:#c9c9c9;stroke:#555;stroke-width:.8}
.sds .gravel{fill:#eeeae2;stroke:#9a958a;stroke-width:.8;stroke-dasharray:4 3}
.sds .outline{fill:none;stroke:#222;stroke-width:1.2}
.sds .hidden{fill:none;stroke:#555;stroke-width:.8;stroke-dasharray:6 4}
.sds .floorband{fill:#d8e4c8;stroke:#4d5f3a;stroke-width:.6;opacity:.7}
.sds .opening{fill:none;stroke:#2563a8;stroke-width:.9;stroke-dasharray:5 3}
.sds .roofline{fill:none;stroke:#7a2f1d;stroke-width:1}
.sds .thin{fill:none;stroke:#222;stroke-width:.8}
.sds .dim{stroke:#1f4e8c;stroke-width:.7;fill:none}
.sds .dimt{fill:#1f4e8c;font:10px ui-sans-serif,system-ui,sans-serif}
.sds .label{fill:#222;font:11px ui-sans-serif,system-ui,sans-serif}
.sds .muted{fill:#777;font:10px ui-sans-serif,system-ui,sans-serif;letter-spacing:.1em}
.sds .mark{fill:#7a2f1d;font:700 8px ui-sans-serif,system-ui,sans-serif}
.sds .tb{fill:#fff;stroke:#222;stroke-width:1}
.sds .tbt{fill:#222;font:700 14px ui-sans-serif,system-ui,sans-serif}
.sds .tbs{fill:#444;font:10px ui-sans-serif,system-ui,sans-serif}
`;

/** Wrap text to lines of at most n characters. */
function wrap(s, n) {
  const out = [];
  let cur = '';
  for (const w of String(s).split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > n) { if (cur) out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Render one sheet as a standalone SVG, scaled to fit a landscape page with a title block.
 * @param {Sheet} sheet
 * @param {{ name?: string, number?: number, of?: number, width?: number, height?: number }} [meta]
 */
export function sheetSvg(sheet, meta = {}) {
  const PW = meta.width || 1100;
  const PH = meta.height || 780;
  const margin = 70;
  const tbH = 88;
  const b = bounds(sheet.items);
  // Dimension offsets, ticks and lettering are drawn in screen pixels beside
  // the geometry, so the fit has to leave room for them: find the largest
  // scale at which every piece, offset included, stays inside the frame and
  // clear of the title block, then centre what is left over.
  const reach = screenReach(sheet.items);
  const left = margin; const right = PW - margin; const top = margin; const bottom = PH - margin - tbH;
  const fits = (s) => {
    let xlo = -Infinity; let xhi = Infinity; let ylo = -Infinity; let yhi = Infinity;
    for (const r of reach) {
      const x = (r.x - b.x0) * s; const y = (b.y1 - r.y) * s;
      xlo = Math.max(xlo, left - x - r.dx0); xhi = Math.min(xhi, right - x - r.dx1);
      ylo = Math.max(ylo, top - y - r.dy0); yhi = Math.min(yhi, bottom - y - r.dy1);
    }
    return xlo <= xhi + 1e-9 && ylo <= yhi + 1e-9 ? { ox: (xlo + xhi) / 2, oy: (ylo + yhi) / 2 } : null;
  };
  let lo = 0; let hi = Math.min((right - left) / (b.x1 - b.x0 || 1), (bottom - top) / (b.y1 - b.y0 || 1));
  if (fits(hi)) lo = hi;
  else for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  const scale = lo;
  const at = fits(scale) || { ox: left, oy: top };
  const ox = at.ox;
  const oy = at.oy;
  const X = (x) => +(ox + (x - b.x0) * scale).toFixed(2);
  const Y = (y) => +(oy + (b.y1 - y) * scale).toFixed(2);
  const parts = [];
  // Labels in a spread row that would touch move apart; each moved one hangs on a leader from its tick.
  /** @type {Map<Item, number>} */
  const spreadX = new Map();
  /** @type {Map<string, Item[]>} */
  const rows = new Map();
  for (const it of sheet.items) if (it.t === 'text' && it.spread) rows.set(it.spread, [...(rows.get(it.spread) || []), it]);
  for (const row of rows.values()) {
    const sorted = row.slice().sort((p, q) => /** @type {any} */ (p).at[0] - /** @type {any} */ (q).at[0]);
    const xs = spreadRow(sorted.map((it) => X(/** @type {any} */ (it).at[0])), SPREAD_GAP);
    sorted.forEach((it, i) => spreadX.set(it, xs[i]));
  }
  for (const it of sheet.items) {
    if (it.t === 'poly') {
      const pts = it.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
      parts.push(it.closed ? `<polygon class="${it.cls}" points="${pts}"/>` : `<polyline class="${it.cls}" points="${pts}"/>`);
    } else if (it.t === 'text') {
      let x = X(it.at[0]); let y = Y(it.at[1]);
      const sx = spreadX.get(it);
      if (sx !== undefined && Math.abs(sx - x) > 0.05) {
        x = +sx.toFixed(2); y = +(y + SPREAD_DROP).toFixed(2);
        const f = it.from || it.at;
        parts.push(`<polyline class="dim" points="${X(f[0])},${Y(f[1])} ${(x - X(it.at[0]) + X(f[0])).toFixed(2)},${(y - 1).toFixed(2)}"/>`);
      }
      const rot = it.rot ? ` transform="rotate(${-it.rot} ${x} ${y})"` : '';
      parts.push(`<text class="${it.cls || 'label'}" x="${x}" y="${y}" text-anchor="${it.anchor || 'middle'}" style="font-size:${it.size || 11}px"${rot}>${esc(it.text)}</text>`);
    } else {
      const ax = X(it.a[0]); const ay = Y(it.a[1]); const bx = X(it.b[0]); const by = Y(it.b[1]);
      const dx = bx - ax; const dy = by - ay; const len = Math.hypot(dx, dy) || 1;
      const nx = (dy / len); const ny = (-dx / len); // left normal in screen space
      const o = it.off;
      const p1 = [ax + nx * o, ay + ny * o]; const p2 = [bx + nx * o, by + ny * o];
      const ext = (x, y, p) => `<line class="dim" x1="${x}" y1="${y}" x2="${(p[0] + nx * Math.sign(o) * 4).toFixed(2)}" y2="${(p[1] + ny * Math.sign(o) * 4).toFixed(2)}"/>`;
      parts.push(ext(ax, ay, p1), ext(bx, by, p2));
      parts.push(`<line class="dim" x1="${p1[0].toFixed(2)}" y1="${p1[1].toFixed(2)}" x2="${p2[0].toFixed(2)}" y2="${p2[1].toFixed(2)}"/>`);
      const tick = (p) => `<line class="dim" x1="${(p[0] - 4 * (dx / len) - 4 * nx).toFixed(2)}" y1="${(p[1] - 4 * (dy / len) - 4 * ny).toFixed(2)}" x2="${(p[0] + 4 * (dx / len) + 4 * nx).toFixed(2)}" y2="${(p[1] + 4 * (dy / len) + 4 * ny).toFixed(2)}" style="stroke-width:1.3"/>`;
      parts.push(tick(p1), tick(p2));
      const label = it.text || fmtFtIn(Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]));
      const mx = (p1[0] + p2[0]) / 2 + nx * 4 * Math.sign(o || 1);
      const my = (p1[1] + p2[1]) / 2 + ny * 4 * Math.sign(o || 1);
      let ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang <= -90) ang += 180;
      parts.push(`<text class="dimt" x="${mx.toFixed(2)}" y="${my.toFixed(2)}" text-anchor="middle" dominant-baseline="${Math.sign(o || 1) * ny >= 0 ? 'hanging' : 'auto'}" transform="rotate(${ang.toFixed(1)} ${mx.toFixed(2)} ${my.toFixed(2)})">${esc(label)}</text>`);
    }
  }
  const tbY = PH - tbH - 16;
  const noteLines = wrap(sheet.note || '', 112).slice(0, 4);
  const tb = [
    `<rect class="tb" x="16" y="${tbY}" width="${PW - 32}" height="${tbH}"/>`,
    `<line class="tb" x1="${PW - 330}" y1="${tbY}" x2="${PW - 330}" y2="${tbY + tbH}"/>`,
    `<text class="tbt" x="28" y="${tbY + 22}">${esc(sheet.title)}</text>`,
    ...noteLines.map((l, i) => `<text class="tbs" x="28" y="${tbY + 40 + i * 13}">${esc(l)}</text>`),
    `<text class="tbt" x="${PW - 318}" y="${tbY + 22}">${esc(String(meta.name || 'Shed').slice(0, 36))}</text>`,
    `<text class="tbs" x="${PW - 318}" y="${tbY + 40}">Sheet ${meta.number || 1} of ${meta.of || 1}. Written dimensions govern.</text>`,
    `<text class="tbs" x="${PW - 318}" y="${tbY + 54}">Printed to fit; the DXF export is full size in inches.</text>`,
    `<text class="tbs" x="${PW - 318}" y="${tbY + 68}">Not engineered or code-checked.</text>`,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" class="sds" viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" role="img" aria-label="${esc(sheet.title)}"><style>${SVG_STYLE}</style><rect width="${PW}" height="${PH}" fill="#fff"/>${parts.join('')}${tb.join('')}</svg>`;
}

/**
 * DXF (R12, ASCII) of one or more sheets at true scale in inches, laid side by side.
 * Layers: FRAMING, OUTLINE, HIDDEN, OPENINGS, DIMS, TEXT.
 * @param {Sheet[]} sheets
 */
/**
 * Text for an R12 DXF: one line, ASCII only. Anything else (a design named
 * "Café shed", a curly quote) is written as \U+XXXX, which AutoCAD, LibreCAD and
 * ezdxf read back as the character; raw UTF-8 shows as mojibake there.
 */
export function dxfText(s) {
  return [...String(s).replace(/[\r\n\t]+/g, ' ')].map((ch) => {
    const c = /** @type {number} */ (ch.codePointAt(0));
    return c >= 0x20 && c < 0x7f ? ch : c <= 0xffff ? `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}` : '?';
  }).join('').slice(0, 250);
}

export function sheetsDxf(sheets) {
  const out = [];
  const g = (code, v) => { out.push(String(code), String(v)); };
  const layerOf = (cls) => ({ hidden: 'HIDDEN', gravel: 'HIDDEN', opening: 'OPENINGS', outline: 'OUTLINE', roofline: 'OUTLINE', thin: 'OUTLINE' }[cls] || 'FRAMING');
  const layers = [['FRAMING', 30], ['OUTLINE', 7], ['HIDDEN', 8], ['OPENINGS', 5], ['DIMS', 4], ['TEXT', 7]];
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 1); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
  for (const [name, color] of layers) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const ln = (a, b, layer) => { g(0, 'LINE'); g(8, layer); g(10, a[0].toFixed(4)); g(20, a[1].toFixed(4)); g(30, 0); g(11, b[0].toFixed(4)); g(21, b[1].toFixed(4)); g(31, 0); };
  const tx = (p, h, s, layer, align = 1, rot = 0) => {
    g(0, 'TEXT'); g(8, layer); g(10, p[0].toFixed(4)); g(20, p[1].toFixed(4)); g(30, 0); g(40, h.toFixed(3)); g(1, dxfText(s));
    if (rot) g(50, rot.toFixed(2));
    if (align) { g(72, align); g(11, p[0].toFixed(4)); g(21, p[1].toFixed(4)); g(31, 0); }
  };
  let shift = 0;
  for (const sheet of sheets) {
    const b = bounds(sheet.items);
    const dx = shift - b.x0;
    const T = ([x, y]) => /** @type {P} */ ([x + dx, y]);
    const h = Math.max(1.5, (b.x1 - b.x0) / 120);
    for (const it of sheet.items) {
      if (it.t === 'poly') {
        const pts = it.pts.map(T);
        for (let i = 0; i + 1 < pts.length; i++) ln(pts[i], pts[i + 1], layerOf(it.cls));
        if (it.closed && pts.length > 2) ln(pts[pts.length - 1], pts[0], layerOf(it.cls));
      } else if (it.t === 'text') {
        tx(T(it.at), h * (it.size || 11) / 11, it.text, 'TEXT', it.anchor === 'start' ? 0 : it.anchor === 'end' ? 2 : 1, it.rot || 0);
      } else {
        const a = T(it.a); const bb = T(it.b);
        const vx = bb[0] - a[0]; const vy = bb[1] - a[1]; const len = Math.hypot(vx, vy) || 1;
        // Same side as the SVG: its screen-space left normal is (-vy, -vx)/len in y-up model space.
        const nx = -vy / len; const ny = vx / len;
        const o = it.off * h / 11;
        const p1 = /** @type {P} */ ([a[0] + nx * o, a[1] + ny * o]);
        const p2 = /** @type {P} */ ([bb[0] + nx * o, bb[1] + ny * o]);
        ln(a, p1, 'DIMS'); ln(bb, p2, 'DIMS'); ln(p1, p2, 'DIMS');
        const label = it.text || fmtFtIn(len);
        let ang = Math.atan2(vy, vx) * 180 / Math.PI;
        if (ang > 90) ang -= 180;
        if (ang <= -90) ang += 180;
        tx([(p1[0] + p2[0]) / 2 + nx * Math.sign(o) * h * 0.6, (p1[1] + p2[1]) / 2 + ny * Math.sign(o) * h * 0.6], h * 0.9, label, 'DIMS', 1, ang);
      }
    }
    tx([shift, b.y1 + h * 4], h * 1.6, sheet.title, 'TEXT', 0);
    shift += (b.x1 - b.x0) + 120;
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\n') + '\n';
}
