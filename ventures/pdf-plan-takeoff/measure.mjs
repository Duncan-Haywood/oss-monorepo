// Takeoff measurements: lengths, areas and counts on a sheet, snapping to the
// drawn line work, valued at a scale, and written out as CSV.

import { realLength, formatFeetInches } from './scale.mjs';

/**
 * A snapping index over a page's segments: endpoints first, then midpoints,
 * then the nearest point on a segment, within `radius` page units.
 */
export class SnapIndex {
  constructor(segs, cell = 24) {
    this.segs = segs; this.cell = cell; this.grid = new Map();
    for (let k = 0; k < segs.length; k += 4) {
      const x1 = segs[k], y1 = segs[k + 1], x2 = segs[k + 2], y2 = segs[k + 3];
      const i0 = Math.floor(Math.min(x1, x2) / cell), i1 = Math.floor(Math.max(x1, x2) / cell);
      const j0 = Math.floor(Math.min(y1, y2) / cell), j1 = Math.floor(Math.max(y1, y2) / cell);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 2500) continue; // a sheet border: not worth snapping
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const key = i * 1000003 + j;
        let a = this.grid.get(key); if (!a) this.grid.set(key, (a = [])); a.push(k);
      }
    }
  }
  /** @returns {{x:number,y:number,kind:'end'|'mid'|'on'}|null} */
  snap(x, y, radius) {
    const c = this.cell, segs = this.segs;
    const r = Math.ceil(radius / c);
    const i = Math.floor(x / c), j = Math.floor(y / c);
    let end = null, endD = radius, mid = null, midD = radius, on = null, onD = radius;
    const seen = new Set();
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      for (const k of this.grid.get((i + di) * 1000003 + (j + dj)) || []) {
        if (seen.has(k)) continue; seen.add(k);
        const x1 = segs[k], y1 = segs[k + 1], x2 = segs[k + 2], y2 = segs[k + 3];
        for (const [px, py] of [[x1, y1], [x2, y2]]) { const d = Math.hypot(px - x, py - y); if (d < endD) { endD = d; end = { x: px, y: py, kind: 'end' }; } }
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dm = Math.hypot(mx - x, my - y);
        if (dm < midD) { midD = dm; mid = { x: mx, y: my, kind: 'mid' }; }
        const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (L2 > 0) {
          const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / L2));
          const px = x1 + t * (x2 - x1), py = y1 + t * (y2 - y1), d = Math.hypot(px - x, py - y);
          if (d < onD) { onD = d; on = { x: px, y: py, kind: 'on' }; }
        }
      }
    }
    // an endpoint wins when it is within the radius; a midpoint when it is
    // nearly as close as the line itself; otherwise the nearest point on a line
    if (end) return end;
    if (mid && midD <= onD + radius / 3) return mid;
    return on;
  }
}

export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

/**
 * The real-world value of a measurement at its scale.
 * @param {{type:'length'|'area'|'count'|'fill', pts:{x:number,y:number}[], areaPt2?:number, scale?:{ratio:number,system:string}|null, factor?:number}} m
 * @returns {{value:number|null, unit:string, text:string, perimeter?:number}}
 */
export function valueOf(m) {
  if (m.type === 'count') return { value: m.pts.length, unit: 'ea', text: `${m.pts.length} ea` };
  const s = m.scale;
  if (!s) return { value: null, unit: '', text: 'no scale' };
  const metric = s.system === 'metric';
  if (m.type === 'length') {
    const r = realLength(polylineLength(m.pts), s); // inches or mm
    return metric ? { value: r / 1000, unit: 'm', text: `${(r / 1000).toFixed(3)} m` } : { value: r / 12, unit: 'LF', text: `${formatFeetInches(r)} (${(r / 12).toFixed(2)} LF)` };
  }
  const pt2 = m.type === 'fill' ? m.areaPt2 : polygonArea(m.pts);
  const lin = realLength(1, s); // real units per point
  const area = pt2 * lin * lin; // sq in or sq mm
  const per = m.type === 'area' ? realLength(polylineLength([...m.pts, m.pts[0]]), s) : null;
  if (metric) return { value: area / 1e6, unit: 'm2', text: `${(area / 1e6).toFixed(2)} m²`, perimeter: per == null ? undefined : per / 1000 };
  return { value: area / 144, unit: 'SF', text: `${(area / 144).toFixed(1)} SF`, perimeter: per == null ? undefined : per / 12 };
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
};

/** Measurements as CSV: one row each, with the scale it was valued at and where it came from. */
export function takeoffCsv(list) {
  const head = ['#', 'Sheet page', 'Label', 'Type', 'Quantity', 'Unit', 'Perimeter', 'Points', 'Scale', 'Scale from'];
  const rows = list.map((m, i) => {
    const v = valueOf(m);
    return [i + 1, m.page, m.label || '', m.type, v.value == null ? '' : +v.value.toFixed(4), v.unit, v.perimeter == null ? '' : +v.perimeter.toFixed(2), m.type === 'fill' ? '' : m.pts.length, m.scale ? m.scale.label || `1:${m.scale.ratio}` : '', m.scaleFrom || ''];
  });
  // totals by label and unit
  const tot = new Map();
  list.forEach((m) => { const v = valueOf(m); if (v.value == null) return; const k = `${m.label || m.type}\u0000${v.unit}`; tot.set(k, (tot.get(k) || 0) + v.value); });
  const lines = [head, ...rows].map((r) => r.map(csvCell).join(','));
  if (tot.size) {
    lines.push('', 'Totals by label,,,,,');
    for (const [k, v] of tot) { const [label, unit] = k.split('\u0000'); lines.push(['', '', label, 'total', +v.toFixed(4), unit].map(csvCell).join(',')); }
  }
  return lines.join('\n') + '\n';
}

/**
 * Wall runs for a framing takeoff: the length measurements on one sheet whose
 * label names walls, doors or windows, written as an ASCII DXF in real inches
 * (walls on WALLS, doors on DOORS, windows on WINDOWS), the layers the
 * residential takeoff's DXF reader takes. Each polyline segment is one LINE, so
 * a run clicked around a corner keeps the corner. Every point is valued at one
 * scale (the first wall run's), so the runs stay where they were drawn
 * relative to each other; a run on another scale, with no scale, or on another
 * page is left out and counted. y is flipped so the DXF reads as the sheet looks.
 * @param {{type:string, page:number, label?:string, pts:{x:number,y:number}[], scale?:{ratio:number,system:string}|null}[]} list
 * @param {{page?:number, wall?:RegExp, door?:RegExp, window?:RegExp}} [o]
 * @returns {{ok:boolean, dxf?:string, page?:number, walls:number, doors:number, windows:number, skipped:{noScale:number, otherScale:number, otherPage:number}, error?:string}}
 */
export function wallsDxf(list, o = {}) {
  const wallRe = o.wall ?? /wall|partition/i, doorRe = o.door ?? /door/i, winRe = o.window ?? /window|glaz/i;
  const layerOf = (m) => {
    const l = String(m.label || '');
    if (doorRe.test(l)) return 'DOORS';
    if (winRe.test(l)) return 'WINDOWS';
    return wallRe.test(l) ? 'WALLS' : null;
  };
  const runs = (Array.isArray(list) ? list : []).filter((m) => m && m.type === 'length' && Array.isArray(m.pts) && m.pts.length >= 2 && layerOf(m));
  const skipped = { noScale: 0, otherScale: 0, otherPage: 0 };
  const firstWall = runs.find((m) => layerOf(m) === 'WALLS' && m.scale && (o.page == null || m.page === o.page));
  const empty = { ok: false, walls: 0, doors: 0, windows: 0, skipped };
  if (!firstWall) return { ...empty, error: 'No length measurement labelled as a wall (a label with "wall" in it) has a scale on this sheet. Measure the wall runs with the length tool under a label such as "Walls", and doors and windows across their openings under "Doors" and "Windows".' };
  const page = firstWall.page, s = firstWall.scale;
  const same = (t) => t && t.ratio === s.ratio && t.system === s.system;
  const inch = (v) => {
    const r = realLength(v, s);
    return Math.round((s.system === 'metric' ? r / 25.4 : r) * 1000) / 1000;
  };
  const g = (c, v) => `${c}\n${v}\n`;
  let body = '';
  const n = { WALLS: 0, DOORS: 0, WINDOWS: 0 };
  for (const m of runs) {
    if (m.page !== page) { skipped.otherPage++; continue; }
    if (!m.scale) { skipped.noScale++; continue; }
    if (!same(m.scale)) { skipped.otherScale++; continue; }
    const layer = layerOf(m);
    const pts = layer === 'WALLS' ? m.pts : [m.pts[0], m.pts[m.pts.length - 1]]; // an opening is its two ends
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a.x === b.x && a.y === b.y) continue;
      body += g(0, 'LINE') + g(8, layer) + g(10, inch(a.x)) + g(20, -inch(a.y)) + g(30, 0) + g(11, inch(b.x)) + g(21, -inch(b.y)) + g(31, 0);
    }
    n[layer]++;
  }
  const dxf = g(0, 'SECTION') + g(2, 'HEADER') + g(9, '$INSUNITS') + g(70, 1) + g(0, 'ENDSEC') + g(0, 'SECTION') + g(2, 'ENTITIES') + body + g(0, 'ENDSEC') + g(0, 'EOF');
  return { ok: true, dxf, page, walls: n.WALLS, doors: n.DOORS, windows: n.WINDOWS, skipped };
}
