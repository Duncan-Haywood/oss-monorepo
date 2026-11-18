/**
 * Turntable preview: the design turned about its vertical axis.
 *
 * This is an honest approximation, not a 3D engine: the front or back drawing
 * is squeezed horizontally by cos(angle) and shaded across the width so the
 * garment reads as a rounded body, and a minimum width keeps the side-on view
 * from vanishing. `shadowDx` is reported for a future raised-print shadow.
 * It shows how a design sits as the garment turns. It does not model drape,
 * seams or sleeves, so it is not a fit check. A real WebGL / WebXR garment is
 * the next ROADMAP step.
 */
import { GARMENTS, VIEWBOX, METHODS, luminance } from "./catalogue.mjs";
import { renderDesign, esc } from "./render.mjs";

const MIN_WIDTH = 0.16; // fraction of full width kept at the side-on angle

export const normalise = deg => ((Number(deg) % 360) + 360) % 360;

/** What the turned garment looks like at an angle (0 = front, 180 = back). */
export function turntableFrame(angle) {
  const a = normalise(angle);
  const rad = (a * Math.PI) / 180;
  const c = Math.cos(rad);
  const side = c >= 0 ? "front" : "back";
  const scaleX = Math.max(MIN_WIDTH, Math.abs(c));
  // 0 facing us, 1 side-on: drives the edge darkening
  const turn = 1 - Math.abs(c);
  // raised-print shadow swings left/right with the turn, in drawing pixels
  const shadowDx = Math.round(Math.sin(rad) * (c >= 0 ? 1 : -1) * 3 * 10) / 10;
  return { angle: a, side, scaleX: Math.round(scaleX * 1000) / 1000, turn: Math.round(turn * 1000) / 1000, shadowDx };
}

/** Frame angles for a full turn in `n` steps (for a spin or a contact sheet). */
export function turnAngles(n = 8) {
  const k = Math.max(2, Math.min(72, Math.round(n)));
  return Array.from({ length: k }, (_, i) => Math.round((360 / k) * i * 10) / 10);
}

export function hasRaised(design) {
  return design.placements.some(p => METHODS[p.method]?.raised);
}

/** The turned design as one SVG string. Pure. */
export function renderTurntable(design, angle, { uid = "tt" } = {}) {
  const f = turntableFrame(angle);
  const g = GARMENTS[design.garment];
  const inner = renderDesign(design, { side: f.side, uid: `${uid}-d` });
  const cx = VIEWBOX.x + VIEWBOX.width / 2;
  const dark = luminance(design.colour) < 0.3;
  const edge = dark ? "#ffffff" : "#000000";
  const edgeOpacity = Math.round((dark ? 0.10 : 0.34) * f.turn * 100) / 100;
  const outline = g.outline[f.side];
  const label = `${design.colourName} ${g.label.toLowerCase()}, turned ${Math.round(f.angle)} degrees, ${f.side} view`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}" role="img" aria-label="${esc(label)}">`
    + `<title>${esc(label)}</title>`
    + `<defs><linearGradient id="${uid}-round" x1="0" x2="1" y1="0" y2="0">`
    + `<stop offset="0" stop-color="${edge}" stop-opacity="${edgeOpacity}"/><stop offset="0.3" stop-color="${edge}" stop-opacity="0"/>`
    + `<stop offset="0.7" stop-color="${edge}" stop-opacity="0"/><stop offset="1" stop-color="${edge}" stop-opacity="${edgeOpacity}"/></linearGradient></defs>`
    + `<g transform="translate(${cx} 0) scale(${f.scaleX} 1) translate(${-cx} 0)">`
    + inner
    + `<path d="${outline}" fill="url(#${uid}-round)"/>`
    + `</g></svg>`;
}
