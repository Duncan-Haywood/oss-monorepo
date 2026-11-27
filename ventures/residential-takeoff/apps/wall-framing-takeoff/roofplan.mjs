// The roof plan view: an all-hip roof from an outline (roofoutline.mjs, hiproof.mjs)
// and, when it was framed (hipframe.mjs), every rafter on it, drawn from above.
//
// Plan coordinates are inches with y up (the outline is counter-clockwise); SVG has y
// down, so y is flipped about the eave line's top. Only numbers reach the SVG: no plan
// name or typed text is written into it, so there is nothing to escape (the dimension
// labels are formatLength of a number: digits, spaces, ' and ").
//
// Every eave side is dimensioned outside the eave line: a dimension line with ticks at
// the side's ends and its length along the eave edge, so the drawing prints as a roof
// plan a crew can check against the walls (wall length + 2 x overhang at an outside
// corner pair).
import { formatLength } from "./engine.mjs";

// The page loads the outline roof as one section (index.html, SECTION_IMPORT.roofplan), so
// the outline and framing functions it calls are re-exported here.
export { outlineRoof } from "./roofoutline.mjs";
export { frameOutlineRoof, outlineFrameCuts, outlineFrameText } from "./hipframe.mjs";
export { sheatheOutlineRoof, outlineSheathingText, outlineSheathingCuts } from "./outlinesheathing.mjs";

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ kind: string, x0: number, y0: number, x1: number, y1: number }} Seg */

/** Line colour and width (px, not scaled with the drawing) per member kind. */
export const ROOF_PLAN_STYLE = {
  ridge: { stroke: "#b3261e", width: 3, label: "ridge" },
  hip: { stroke: "#14465e", width: 3, label: "hip" },
  valley: { stroke: "#2e7d32", width: 3, label: "valley" },
  rafter: { stroke: "#6b6457", width: 1, label: "common rafter" },
  "jack rafter": { stroke: "#8a6d3b", width: 1, label: "hip jack" },
  "valley jack rafter": { stroke: "#5b8f5e", width: 1, label: "valley jack" },
  "cripple jack": { stroke: "#7d5ba6", width: 1, label: "cripple jack" },
};

/**
 * The segments of the plan view, in plan inches: walls, eave line, roof lines, rafters.
 * @param {{ ok: boolean, points: Pt[], eaveLine: Pt[], lines: Seg[] }} ro outlineRoof result
 * @param {{ ok: boolean, rafters: Seg[] } | null} [frame] frameOutlineRoof result
 */
export function roofPlan(ro, frame) {
  if (!ro || !ro.ok) return { ok: false, errors: ["No roof outline to draw."] };
  const xs = ro.eaveLine.map((p) => p.x), ys = ro.eaveLine.map((p) => p.y);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const lines = ro.lines.map((l) => ({ kind: l.kind, x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 }));
  const rafters = frame && frame.ok ? frame.rafters.map((r) => ({ kind: r.kind, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 })) : [];
  /** @type {Record<string, number>} */
  const counts = {};
  for (const s of [...lines, ...rafters]) counts[s.kind] = (counts[s.kind] || 0) + 1;
  return { ok: true, errors: [], box, walls: ro.points, eave: ro.eaveLine, lines, rafters, counts };
}

const n = (/** @type {number} */ v) => String(Math.round(v * 100) / 100);

/**
 * The eave sides' dimensions in plan inches: each side's ends, its length, and the
 * outward normal the dimension is drawn on (the eave line is counter-clockwise, so
 * outward is to the right of travel).
 * @param {{ eave: Pt[] }} p
 */
export function eaveDimensions(p) {
  return p.eave.map((a, i) => {
    const b = p.eave[(i + 1) % p.eave.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return { side: i + 1, a, b, length, label: formatLength(Math.round(length * 16) / 16), nx: (b.y - a.y) / length, ny: -(b.x - a.x) / length };
  });
}

/**
 * The plan view as an SVG string, north (plan +y) up. The page sets its width; the
 * viewBox is the eave line plus a margin for the dimensions, in inches.
 * @param {ReturnType<typeof roofPlan>} p
 * @param {{ dimensions?: boolean }} [o] dimensions on the eave sides (default on)
 */
export function roofPlanSvg(p, o = {}) {
  if (!p.ok || !("box" in p)) return "";
  const { box } = p;
  const dims = o.dimensions !== false;
  const big = Math.max(box.x1 - box.x0, box.y1 - box.y0);
  const fs = Math.max(6, 0.028 * big), off = 1.6 * fs; // label size and the dimension line's distance off the eave edge
  const w = box.x1 - box.x0, h = box.y1 - box.y0, pad = dims ? Math.max(12, 0.04 * big) + off + 1.4 * fs : Math.max(12, 0.04 * big);
  const X = (/** @type {number} */ x) => n(x - box.x0);
  const Y = (/** @type {number} */ y) => n(box.y1 - y);
  const poly = (/** @type {Pt[]} */ pts) => pts.map((q) => `${X(q.x)},${Y(q.y)}`).join(" ");
  const seg = (/** @type {Seg} */ s) => {
    const st = ROOF_PLAN_STYLE[/** @type {keyof typeof ROOF_PLAN_STYLE} */ (s.kind)] || ROOF_PLAN_STYLE.rafter;
    return `<line x1="${X(s.x0)}" y1="${Y(s.y0)}" x2="${X(s.x1)}" y2="${Y(s.y1)}" stroke="${st.stroke}" stroke-width="${st.width}" vector-effect="non-scaling-stroke" data-kind="${s.kind}"/>`;
  };
  const c = p.counts;
  const label = `Roof plan from above: ${c.ridge || 0} ridge, ${c.hip || 0} hip and ${c.valley || 0} valley lines` + (p.rafters.length ? `, ${p.rafters.length} rafters` : "") + `; eave line ${n(w / 12)} by ${n(h / 12)} ft overall.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(-pad)} ${n(-pad)} ${n(w + 2 * pad)} ${n(h + 2 * pad)}" role="img" aria-label="${label}" style="width:100%;max-height:70vh;background:#fffdf7">`
    + `<polygon points="${poly(p.eave)}" fill="#f3efe4" stroke="#33302a" stroke-width="1.5" vector-effect="non-scaling-stroke" data-kind="eave"/>`
    + `<polygon points="${poly(p.walls)}" fill="none" stroke="#33302a" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" data-kind="walls"/>`
    + p.rafters.map(seg).join("")
    + p.lines.map(seg).join("")
    + (dims ? eaveDimensions(p).map((d) => {
      const ax = d.a.x + d.nx * off, ay = d.a.y + d.ny * off, bx = d.b.x + d.nx * off, by = d.b.y + d.ny * off, t = 0.35 * fs;
      // ticks across the dimension line at both ends, and the label just outside it, along the side
      const tick = (/** @type {number} */ x, /** @type {number} */ y) => `M${X(x - d.nx * t)} ${Y(y - d.ny * t)}L${X(x + d.nx * t)} ${Y(y + d.ny * t)}`;
      const mx = (ax + bx) / 2 + d.nx * 0.5 * fs, my = (ay + by) / 2 + d.ny * 0.5 * fs;
      const vertical = Math.abs(d.nx) > 0.5;
      return `<path d="M${X(ax)} ${Y(ay)}L${X(bx)} ${Y(by)}${tick(ax, ay)}${tick(bx, by)}" stroke="#33302a" stroke-width="0.75" fill="none" vector-effect="non-scaling-stroke" data-kind="dim"/>`
        + `<text x="${X(mx)}" y="${Y(my)}" font-size="${n(fs)}" font-family="sans-serif" fill="#33302a" text-anchor="middle" dominant-baseline="middle"${vertical ? ` transform="rotate(-90 ${X(mx)} ${Y(my)})"` : ""} data-kind="dim" data-side="${d.side}">${d.label}</text>`;
    }).join("") : "")
    + `</svg>`;
}

/** The legend rows for the kinds this plan draws, in style order. @param {ReturnType<typeof roofPlan>} p */
export function roofPlanLegend(p) {
  if (!p.ok || !("counts" in p)) return [];
  return Object.entries(ROOF_PLAN_STYLE).filter(([k]) => p.counts[k]).map(([k, st]) => ({ kind: k, label: st.label, stroke: st.stroke, width: st.width, count: p.counts[k] }));
}
