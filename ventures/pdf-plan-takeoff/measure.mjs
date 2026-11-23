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
