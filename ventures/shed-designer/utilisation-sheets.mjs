// @ts-check
// Framing plans coloured by structural use: the floor framing, the roof
// framing and each wall elevation, every member filled with its utilisation
// band (utilisation.mjs) and grey where it is not checked on its own. They
// render through drawings.mjs's sheetSvg, so they print at the same size as
// the plan set; each member carries its id as a class (mid-<id>) so a tap on
// the screen can open its check.

import { sheetSvg } from './drawings.mjs';
import { WALLS, WALL_LABEL } from './model.mjs';
import { BANDS, UNCHECKED, bandOf } from './utilisation.mjs';
import { fmtUse } from './checks.mjs';

/** @typedef {import('./drawings.mjs').Sheet} Sheet */
/** @typedef {import('./utilisation.mjs').Use} Use */

const HEAT_STYLE = [
  ...BANDS.map((b, i) => `.sds .h${i}{fill:${b.hex};stroke:#3a3a3a;stroke-width:.7}`),
  `.sds .hn{fill:${UNCHECKED.hex};stroke:#777;stroke-width:.6}`,
  '.sds .hl{fill:#222;font:700 11px ui-sans-serif,system-ui,sans-serif;paint-order:stroke;stroke:#fff;stroke-width:3px}',
].join('\n');

const poly = (pts, cls) => /** @type {any} */ ({ t: 'poly', pts, closed: true, cls });
const box = (x0, y0, x1, y1, cls) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], cls);
const label = (at, text, size = 11, cls = 'hl') => /** @type {any} */ ({ t: 'text', at, text, size, anchor: 'middle', cls });

/** Plan footprint of a member: x along the shed, y across it. */
function planBox(m) {
  const g = m.geom;
  const xs = []; const ys = [];
  for (const [a, b] of g.profile) for (const t of [0, g.thickness]) {
    xs.push(g.origin[0] + g.u[0] * a + g.v[0] * b + g.w[0] * t);
    ys.push(g.origin[1] + g.u[1] * a + g.v[1] * b + g.w[1] * t);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/**
 * @param {import('./model.mjs').Shed} shed
 * @param {Map<string, Use>} heat member id -> its check (heatById)
 * @returns {Sheet[]}
 */
export function heatSheets(shed, heat) {
  const d = shed.design;
  const k = shed.dims;
  const cls = (m) => `${heat.has(m.id) ? `h${bandOf(/** @type {Use} */ (heat.get(m.id)).ratio)}` : 'hn'} mid-${m.id}`;
  // One label per check on a sheet, at the middle of its members.
  const labels = (items, members, where) => {
    /** @type {Map<Use, number[][]>} */
    const by = new Map();
    for (const m of members) {
      const u = heat.get(m.id);
      if (u) by.set(u, [...(by.get(u) || []), where(m)]);
    }
    for (const [u, pts] of by) {
      const at = pts[Math.floor(pts.length / 2)];
      items.push(label(/** @type {[number, number]} */ ([at[0], at[1]]), `${u.member.replace(/^Header over the /, 'Header ')} ${fmtUse(u.ratio)}`));
    }
  };
  const legend = (items, x, y) => {
    [...BANDS, UNCHECKED].forEach((b, i) => {
      const yy = y - i * 9;
      items.push(box(x, yy, x + 6, yy + 6, i < BANDS.length ? `h${i}` : 'hn'));
      items.push(/** @type {any} */ ({ t: 'text', at: [x + 9, yy + 1], text: b.label, size: 9, anchor: 'start', cls: 'label' }));
    });
  };
  const note = 'Colour is each member\'s use of capacity under the loads you set (Structure tab), grey where it is not checked on its own. A screening check, not an engineer\'s review.';
  /** @type {Sheet[]} */
  const sheets = [];
  {
    const items = [];
    const floor = shed.members.filter((m) => m.group === 'floor');
    for (const m of floor) { const l = /** @type {any} */ (m.local); items.push(box(l.s0, l.z0, l.s1, l.z1, cls(m))); }
    labels(items, floor, (m) => { const l = /** @type {any} */ (m.local); return [(l.s0 + l.s1) / 2, d.width / 2]; });
    legend(items, d.length + 12, d.width - 6);
    sheets.push({ id: 'use-floor', title: 'Floor framing, coloured by structural use', note, items });
  }
  {
    const items = [];
    const roof = shed.members.filter((m) => m.group === 'roof');
    items.push(box(0, 0, d.length, d.width, 'hidden'));
    // Ridge last, so the rafters' ends do not hide it.
    const order = [...roof.filter((m) => !/ridge/.test(m.kind)), ...roof.filter((m) => /ridge/.test(m.kind))];
    for (const m of order) { const b = planBox(m); items.push(box(b.x0, b.y0, b.x1, b.y1, cls(m))); }
    labels(items, roof, (m) => { const b = planBox(m); return /ridge/.test(m.kind) ? [d.length / 2, d.width / 2 + 6] : [(b.x0 + b.x1) / 2, m.kind === 'rafter' ? d.width / 4 : (b.y0 + b.y1) / 2]; });
    legend(items, d.length + 12 + d.overhang, d.width - 6);
    sheets.push({ id: 'use-roof', title: 'Roof framing, coloured by structural use', note, items });
  }
  for (const name of WALLS) {
    const wall = shed.walls[name];
    const eave = name === 'front' || name === 'back';
    const face = eave ? d.length : d.width;
    const off = eave ? 0 : k.stud;
    const hx = (s) => (name === 'front' || name === 'right' ? s : face - s);
    const items = [];
    for (const m of wall.members) {
      const l = /** @type {any} */ (m.local);
      const gable = m.group.startsWith('gable');
      const a = gable ? l.s0 : l.s0 + off;
      const b = gable ? l.s1 : l.s1 + off;
      if (gable && l.top) items.push(poly([[hx(a), l.z0], [hx(b), l.z0], [hx(l.top[1][0]), l.top[1][1]], [hx(l.top[0][0]), l.top[0][1]]], cls(m)));
      else items.push(box(Math.min(hx(a), hx(b)), l.z0, Math.max(hx(a), hx(b)), l.z1, cls(m)));
    }
    labels(items, wall.members, (m) => { const l = /** @type {any} */ (m.local); const s = (l.s0 + l.s1) / 2 + (m.group.startsWith('gable') ? 0 : off); return [hx(s), m.kind === 'header' ? l.z1 + 4 : d.wallHeight / 2]; });
    legend(items, face + 12, d.wallHeight - 6);
    sheets.push({ id: `use-wall-${name}`, title: `${WALL_LABEL[name]} wall framing, coloured by structural use`, note, items });
  }
  return sheets;
}

/** One heat sheet as SVG, with the band colours added to the plan style. */
export function heatSheetSvg(sheet, meta = {}) {
  return sheetSvg(sheet, meta).replace('</style>', `${HEAT_STYLE}</style>`);
}
