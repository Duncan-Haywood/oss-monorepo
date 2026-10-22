// @ts-check
// Panelizing: split a laid-out wall into shop-built panels no longer than a
// limit (a truck bed, a table, what two people can carry), cutting only where
// no stud, king, jack, cripple, header, sill or block crosses the line, so
// every panel is built from whole members and the plates are cut to panel
// length. Fewest panels first, then the most even widths. Pure functions;
// inches throughout. A layout aid, not engineering: lifting, bracing and
// shipping are for the builder.
import { formatLength, DEPTH } from "./engine.mjs";

const EPS = 1e-6;
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {{length: number, members: any[], id: string}} w laid-out wall from takeoff()
 * @param {number} maxWidth longest panel allowed, inches
 * @returns {{id: string, panels: {name: string, x0: number, x1: number, width: number, members: number[], over: boolean}[], cuts: number[], over: boolean}}
 */
export function panelizeWall(w, maxWidth) {
  const L = w.length;
  const framing = w.members.filter((m) => m.kind !== "plate");
  const edges = new Set();
  for (const m of framing) { edges.add(r3(m.x)); edges.add(r3(m.x + m.w)); }
  const open = (c) => c > EPS && c < L - EPS && framing.every((m) => !(m.x + EPS < c && c < m.x + m.w - EPS));
  const pts = [0, ...[...edges].filter(open).sort((a, b) => a - b), L];
  // best[j] = [panel count, sum of squared widths, previous index] to reach pts[j]
  const best = new Array(pts.length).fill(null);
  best[0] = [0, 0, -1];
  for (let j = 1; j < pts.length; j++) {
    for (let i = 0; i < j; i++) {
      if (!best[i]) continue;
      const width = pts[j] - pts[i];
      if (width > maxWidth + EPS && !(j === i + 1)) continue; // a wider hop is allowed only when no cut lies inside it
      const cand = [best[i][0] + 1, best[i][1] + width * width, i];
      if (!best[j] || cand[0] < best[j][0] || (cand[0] === best[j][0] && cand[1] < best[j][1] - EPS)) best[j] = cand;
    }
  }
  const idx = [];
  for (let j = pts.length - 1; j >= 0; j = best[j][2]) { idx.unshift(j); if (j === 0) break; }
  const cuts = idx.slice(1, -1).map((j) => pts[j]);
  const bounds = [0, ...cuts, L];
  const panels = bounds.slice(1).map((x1, k) => {
    const x0 = bounds[k];
    const members = w.members.map((m, i) => ({ m, i })).filter(({ m }) => {
      const c = m.x + m.w / 2;
      return c >= x0 - EPS && (c < x1 - EPS || (k === bounds.length - 2 && c <= x1 + EPS));
    }).map(({ i }) => i);
    return { name: String.fromCharCode(65 + (k % 26)) + (k >= 26 ? Math.floor(k / 26) : ""), x0, x1, width: r3(x1 - x0), members, over: x1 - x0 > maxWidth + EPS };
  });
  return { id: w.id, panels, cuts, over: panels.some((p) => p.over) };
}

/** A line per wall: panel names and widths, left to right. */
export function panelsText(set) {
  return set.map((s) => `${s.id}: ${s.panels.map((p) => `${p.name} ${formatLength(p.width)}${p.over ? " (OVER LIMIT: no cut line is clear)" : ""}`).join(" | ")}`);
}

// Weights are a handling estimate, not a load figure: kiln-dried SPF at about
// 28 lb/ft3 and treated bottom plates at about 40 lb/ft3 (wet treated stock
// runs heavier). Override with opts.pcf / opts.ptPcf.
export const SPF_PCF = 28;
export const PT_PCF = 40;
export const OSB_PSF = 1.6;

/**
 * Per-panel parts: every framing member whole, every plate trimmed to the
 * panel's span, and the panel's lumber weight.
 * @param {{id: string, length: number, members: any[]}} w laid-out wall from takeoff()
 * @param {ReturnType<typeof panelizeWall>} pan
 * @param {{pcf?: number, ptPcf?: number, psf?: number, wall?: any, headerHeight?: number}} [opts]
 *   psf: sheathing weight per ft2 of one face (OSB 7/16 is about 1.6); with
 *   opts.wall (the plan's wall, for its openings) the rough openings are taken
 *   out of each panel's face. `sheathLb` and `totalLb` come back when psf > 0.
 * @returns {{name: string, width: number, pieces: {size: string, length: number, kind: string, label: string, qty: number}[], pieceCount: number, lb: number, sheathLb?: number, totalLb?: number}[]}
 */
export function panelParts(w, pan, opts = {}) {
  const pcf = opts.pcf ?? SPF_PCF, ptPcf = opts.ptPcf ?? PT_PCF, psf = opts.psf ?? 0;
  const weigh = (size, len) => {
    const base = size.split(" ")[0];
    const depth = DEPTH[base] ?? 3.5;
    return (1.5 * depth * len / 1728) * (/\bPT\b/.test(size) ? ptPcf : pcf);
  };
  return pan.panels.map((p) => {
    const rows = new Map();
    let lb = 0;
    const add = (m, len) => {
      const label = m.kind === "plate" ? m.label : m.label.replace(/,.*$/, "");
      const key = `${m.size}|${r3(len)}|${m.kind}|${label}`;
      const row = rows.get(key) || { size: m.size, length: r3(len), kind: m.kind, label, qty: 0 };
      row.qty++;
      rows.set(key, row);
      lb += weigh(m.size, len);
    };
    for (const i of p.members) if (w.members[i].kind !== "plate") add(w.members[i], w.members[i].length);
    for (const m of w.members) {
      if (m.kind !== "plate") continue;
      const a = Math.max(m.x, p.x0), b = Math.min(m.x + m.w, p.x1);
      if (b - a > EPS) add(m, b - a);
    }
    const pieces = [...rows.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.length - a.length);
    const out = { name: p.name, width: p.width, pieces, pieceCount: pieces.reduce((t, x) => t + x.qty, 0), lb: Math.round(lb * 10) / 10 };
    if (psf > 0) {
      let area = p.width * w.height;
      for (const o of opts.wall?.openings || []) {
        const ow = Math.min(o.offset + o.width, p.x1) - Math.max(o.offset, p.x0);
        if (ow > EPS) area -= ow * o.height;
      }
      out.sheathLb = Math.round(Math.max(0, area) / 144 * psf * 10) / 10;
      out.totalLb = Math.round((lb + out.sheathLb) * 10) / 10;
    }
    return out;
  });
}
