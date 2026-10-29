// @ts-check
// Click-and-drag editing. The plan view resizes the footprint and slides doors
// and windows along (or between) walls; the end view sets wall height, roof
// pitch and overhang. Both only ever propose a new design object through
// `onChange`; the app rebuilds everything from it, so a drag and a typed value
// take the same path.

import { fmtFtIn, fmtIn } from './lumber.mjs';
import { wallFaceLength } from './model.mjs';

const NS = 'http://www.w3.org/2000/svg';
const snap = (v, step) => Math.round(v / step) * step;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Opening's start along its wall's axis (x for eave walls, y for gable ends). */
export function axisStart(design, op) {
  if (op.wall === 'front' || op.wall === 'right') return op.offset;
  return wallFaceLength(design, op.wall) - op.offset - op.width;
}

/**
 * Where an opening dragged to model point (x, y) lands: nearest wall, and the
 * offset from that wall's left corner as seen from outside, centred on the pointer.
 * @returns {{ wall: 'front'|'back'|'left'|'right', offset: number }}
 */
export function dropOpening(design, op, x, y) {
  const L = design.length;
  const W = design.width;
  const dists = [
    ['front', Math.abs(y)], ['back', Math.abs(W - y)], ['left', Math.abs(x)], ['right', Math.abs(L - x)],
  ];
  dists.sort((a, b) => /** @type {number} */ (a[1]) - /** @type {number} */ (b[1]));
  const wall = /** @type {'front'|'back'|'left'|'right'} */ (dists[0][0]);
  const face = wallFaceLength(design, wall);
  const along = wall === 'front' ? x : wall === 'back' ? L - x : wall === 'left' ? W - y : y;
  const offset = clamp(snap(along - op.width / 2, 1), 0, Math.max(0, face - op.width));
  return { wall, offset };
}

/** Pitch (rise per 12) from a dragged peak height above the top plate. */
export function pitchFromRise(rise, width) {
  return clamp(Math.round((rise * 12) / (width / 2)), 2, 14);
}

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

/** Model point under a pointer event, given a function from svg user units to model. */
function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  const m = svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
}

/**
 * Plan view: front wall at the bottom, ridge running left to right.
 * @param {SVGSVGElement} svg
 * @param {any} design
 * @param {{ onChange: (d: any, label: string) => void, onPreview?: (d: any) => void, warnings?: string[] }} hooks
 */
export function drawPlan(svg, design, hooks) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const L = design.length;
  const W = design.width;
  const pad = 46;
  const extent = Math.max(L, W) + 2 * pad;
  svg.setAttribute('viewBox', `${-pad} ${-pad} ${Math.max(L + 2 * pad, extent * 0.9)} ${W + 2 * pad}`);
  const Y = (y) => W - y; // front (y = 0) at the bottom of the picture
  const g = el('g', {}, svg);
  el('rect', { x: -12, y: -12, width: L + 24, height: W + 24, class: 'pad' }, g);
  el('rect', { x: 0, y: 0, width: L, height: W, class: 'floor' }, g);
  const t = design.studSize === '2x6' ? 5.5 : 3.5;
  for (const [x, y, w, h] of [[0, W - t, L, t], [0, 0, L, t], [0, t, t, W - 2 * t], [L - t, t, t, W - 2 * t]]) el('rect', { x, y, width: w, height: h, class: 'wallband' }, g);
  el('line', { x1: 0, y1: W / 2, x2: L, y2: W / 2, class: 'ridge' }, g);
  const lab = (x, y, s, cls = 'plan-label') => { const e = el('text', { x, y, class: cls, 'text-anchor': 'middle' }, g); e.textContent = s; return e; };
  lab(L / 2, W / 2 - 4, 'ridge', 'plan-muted');
  lab(L / 2, W + 26, `FRONT  ${fmtFtIn(L)}`);
  lab(L / 2, -22, 'BACK', 'plan-muted');
  const side = lab(-26, W / 2, fmtFtIn(W));
  side.setAttribute('transform', `rotate(-90 -26 ${W / 2})`);

  // Openings.
  const openingBox = (op, dsg = design) => {
    const a = axisStart(dsg, op);
    const thick = 10;
    if (op.wall === 'front') return { x: a, y: Y(0) - thick / 2, w: op.width, h: thick };
    if (op.wall === 'back') return { x: a, y: Y(W) - thick / 2, w: op.width, h: thick };
    if (op.wall === 'left') return { x: -thick / 2, y: Y(a + op.width), w: thick, h: op.width };
    return { x: L - thick / 2, y: Y(a + op.width), w: thick, h: op.width };
  };
  for (const op of design.openings) {
    const { x, y, w, h } = openingBox(op);
    const r = el('rect', { x, y, width: w, height: h, rx: 2, class: `opening ${op.kind}`, tabindex: 0, role: 'button',
      'aria-label': `${op.kind} ${op.width} by ${op.height} inches on the ${op.wall} wall, ${op.offset} inches from its left corner. Drag to move.` }, g);
    const tl = el('title', {}, r); tl.textContent = `${op.kind === 'door' ? 'Door' : 'Window'} ${fmtIn(op.width)} x ${fmtIn(op.height)}: drag along a wall or onto another wall`;
    r.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      r.setPointerCapture(e.pointerId);
      let last = null;
      const move = (ev) => {
        const p = svgPoint(svg, ev);
        const drop = dropOpening(design, op, p.x, W - p.y);
        const next = { ...design, openings: design.openings.map((o) => (o.id === op.id ? { ...o, ...drop } : o)) };
        last = next;
        const b = openingBox({ ...op, ...drop });
        r.setAttribute('x', String(b.x)); r.setAttribute('y', String(b.y)); r.setAttribute('width', String(b.w)); r.setAttribute('height', String(b.h));
        hooks.onPreview?.(next);
      };
      const up = () => {
        r.removeEventListener('pointermove', move); r.removeEventListener('pointerup', up); r.removeEventListener('pointercancel', up);
        if (last) hooks.onChange(last, `moved ${op.kind}`);
      };
      r.addEventListener('pointermove', move); r.addEventListener('pointerup', up); r.addEventListener('pointercancel', up);
    });
  }

  // Resize handles: right edge (length), back edge (width), back-right corner (both).
  const handles = [
    { id: 'len', x: L, y: W / 2, cursor: 'ew-resize', label: 'Drag to change the length' },
    { id: 'wid', x: L / 2, y: 0, cursor: 'ns-resize', label: 'Drag to change the width' },
    { id: 'both', x: L, y: 0, cursor: 'nwse-resize', label: 'Drag to change length and width' },
  ];
  for (const hd of handles) {
    const c = el('circle', { cx: hd.x, cy: hd.y, r: 7, class: 'handle', style: `cursor:${hd.cursor}`, tabindex: 0, role: 'button', 'aria-label': hd.label }, g);
    const tl = el('title', {}, c); tl.textContent = hd.label;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      let last = null;
      const ghost = el('rect', { x: 0, y: 0, width: L, height: W, class: 'ghost' }, g);
      const move = (ev) => {
        const p = svgPoint(svg, ev);
        const next = { ...design };
        if (hd.id !== 'wid') next.length = clamp(snap(p.x, 6), 48, 480);
        if (hd.id !== 'len') next.width = clamp(snap(W - p.y, 6), 48, 240);
        last = next;
        ghost.setAttribute('width', String(next.length)); ghost.setAttribute('y', String(W - next.width)); ghost.setAttribute('height', String(next.width));
        c.setAttribute('cx', String(hd.id === 'wid' ? next.length / 2 : next.length));
        c.setAttribute('cy', String(hd.id === 'len' ? W - next.width / 2 : W - next.width));
        hooks.onPreview?.(next);
      };
      const up = () => {
        c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up);
        if (last) hooks.onChange(last, 'resized footprint');
      };
      c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    });
  }
}

/**
 * End view: the gable profile. Drag the peak for pitch, the wall top for wall height,
 * the eave tip for overhang.
 * @param {SVGSVGElement} svg
 * @param {any} design
 * @param {{ floorTop: number }} dims
 * @param {{ onChange: (d: any, label: string) => void, onPreview?: (d: any) => void }} hooks
 */
export function drawEnd(svg, design, dims, hooks) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const W = design.width;
  const H = design.wallHeight;
  const o = design.overhang;
  const t = design.pitch / 12;
  const rise = (W / 2) * t;
  const maxRise = (W / 2) * (14 / 12);
  const pad = 40;
  const top = H + maxRise + 20;
  svg.setAttribute('viewBox', `${-o - pad} ${-pad / 2} ${W + 2 * o + 2 * pad} ${top + pad}`);
  const Y = (z) => top - z;
  const g = el('g', {}, svg);
  el('line', { x1: -o - 20, y1: Y(0), x2: W + o + 20, y2: Y(0), class: 'ground' }, g);
  el('polygon', { points: `0,${Y(0)} ${W},${Y(0)} ${W},${Y(H)} ${W / 2},${Y(H + rise)} 0,${Y(H)}`, class: 'endwall' }, g);
  el('polyline', { points: `${-o},${Y(H - o * t)} ${W / 2},${Y(H + rise)} ${W + o},${Y(H - o * t)}`, class: 'roofline-edit' }, g);
  const lab = (x, y, s, anchor = 'middle') => { const e = el('text', { x, y, class: 'plan-label', 'text-anchor': anchor }, g); e.textContent = s; };
  lab(W / 2, Y(H + rise) - 12, `${design.pitch}/12`);
  lab(W + o + 6, Y(H / 2), `${fmtFtIn(H)} wall`, 'start');
  lab(W / 2, Y(0) + 22, `${fmtFtIn(W)} gable end`);
  lab(-o, Y(H - o * t) + 18, `${fmtIn(o)}`);
  const handles = [
    { id: 'peak', x: W / 2, z: H + rise, cursor: 'ns-resize', label: 'Drag the peak to change the roof pitch' },
    { id: 'wall', x: W, z: H, cursor: 'ns-resize', label: 'Drag to change the wall height' },
    { id: 'eave', x: -o, z: H - o * t, cursor: 'ew-resize', label: 'Drag to change the eave overhang' },
  ];
  for (const hd of handles) {
    const c = el('circle', { cx: hd.x, cy: Y(hd.z), r: 7, class: 'handle', style: `cursor:${hd.cursor}`, tabindex: 0, role: 'button', 'aria-label': hd.label }, g);
    const tl = el('title', {}, c); tl.textContent = hd.label;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      let last = null;
      const ghost = el('polyline', { points: '', class: 'ghost' }, g);
      const move = (ev) => {
        const p = svgPoint(svg, ev);
        const z = top - p.y;
        const next = { ...design };
        if (hd.id === 'peak') { next.pitch = pitchFromRise(z - H, W); next.autoPitch = false; }
        if (hd.id === 'wall') { next.wallHeight = clamp(snap(z, 1), 60, 144); next.autoWall = false; }
        if (hd.id === 'eave') next.overhang = clamp(snap(-p.x, 1), 0, 36);
        last = next;
        const t2 = next.pitch / 12; const H2 = next.wallHeight; const o2 = next.overhang; const r2 = (W / 2) * t2;
        ghost.setAttribute('points', `${-o2},${Y(H2 - o2 * t2)} ${W / 2},${Y(H2 + r2)} ${W + o2},${Y(H2 - o2 * t2)}`);
        const at = hd.id === 'peak' ? [W / 2, H2 + r2] : hd.id === 'wall' ? [W, H2] : [-o2, H2 - o2 * t2];
        c.setAttribute('cx', String(at[0])); c.setAttribute('cy', String(Y(at[1])));
        hooks.onPreview?.(next);
      };
      const up = () => {
        c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up);
        if (last) hooks.onChange(last, hd.id === 'peak' ? 'changed pitch' : hd.id === 'wall' ? 'changed wall height' : 'changed overhang');
      };
      c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    });
  }
}
