// @ts-check
// Panelizing: split a laid-out wall into shop-built panels no longer than a
// limit (a truck bed, a table, what two people can carry), cutting only where
// no stud, king, jack, cripple, header, sill or block crosses the line, so
// every panel is built from whole members and the plates are cut to panel
// length. Fewest panels first, then the most even widths. Pure functions;
// inches throughout. A layout aid, not engineering: lifting, bracing and
// shipping are for the builder.
import { formatLength } from "./engine.mjs";

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
