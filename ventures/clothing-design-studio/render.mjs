/**
 * Draw a design as an SVG string: the garment outline in its colour, light
 * shading from the fabric, and each placement on the side being shown.
 * Pure, so the page, the tech pack and the tests draw the same picture.
 */

import { GARMENTS, FABRICS, METHODS, PX_PER_CM, VIEWBOX, sideOf, luminance } from "./catalogue.mjs";
import { MOTIFS } from "./motifs.mjs";

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Where a placement sits in drawing pixels. */
export function placementBox(design, p) {
  const a = GARMENTS[design.garment].areas[p.area];
  const w = p.w * PX_PER_CM;
  const h = p.w * p.aspect * PX_PER_CM;
  return { cx: a.cx + p.x * PX_PER_CM, cy: a.cy + p.y * PX_PER_CM, w, h };
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function artwork(design, p, { interactive, uid }) {
  const b = placementBox(design, p);
  const method = METHODS[p.method];
  const filter = method?.raised ? ` filter="url(#${uid}-raised)"` : (p.method === "embroidery" || p.method === "3d-puff-embroidery") ? ` filter="url(#${uid}-thread)"` : "";
  const x = -b.w / 2;
  const y = -b.h / 2;
  let inner = "";
  if (p.kind === "image" && p.src) {
    inner = `<image href="${esc(p.src)}" x="${x}" y="${y}" width="${b.w}" height="${b.h}" preserveAspectRatio="xMidYMid meet"/>`;
  } else if (p.kind === "image") {
    inner = `<rect x="${x}" y="${y}" width="${b.w}" height="${b.h}" fill="none" stroke="#888" stroke-dasharray="4 3"/><text x="0" y="4" text-anchor="middle" font-size="10" fill="#888">image not in link</text>`;
  } else if (p.kind === "motif") {
    const m = MOTIFS[p.motif];
    inner = m ? `<svg x="${x}" y="${y}" width="${b.w}" height="${b.h}" viewBox="0 0 100 100" color="${esc(p.ink)}" style="color:${esc(p.ink)}">${m.svg}</svg>` : "";
  } else if (p.kind === "text") {
    const family = p.font === "sans" ? "Helvetica, Arial, sans-serif" : p.font === "script" ? "'Brush Script MT', cursive" : "Georgia, 'Times New Roman', serif";
    inner = `<text x="0" y="${b.h * 0.32}" text-anchor="middle" font-family="${family}" font-weight="700" font-size="${Math.round(b.h * 0.9 * 10) / 10}" fill="${esc(p.ink)}" textLength="${b.w}" lengthAdjust="spacingAndGlyphs">${esc(p.text)}</text>`;
  }
  const selected = interactive && p.id === design.selected
    ? `<rect x="${x - 3}" y="${y - 3}" width="${b.w + 6}" height="${b.h + 6}" fill="none" stroke="#2f7de1" stroke-width="1.5" stroke-dasharray="5 3"/><circle class="handle" data-handle="scale" data-id="${p.id}" cx="${x + b.w + 3}" cy="${y + b.h + 3}" r="7" fill="#fff" stroke="#2f7de1" stroke-width="2"/><circle class="handle" data-handle="rotate" data-id="${p.id}" cx="0" cy="${y - 16}" r="6" fill="#2f7de1"/>`
    : "";
  const hit = interactive ? `<rect class="hit" data-id="${p.id}" x="${x}" y="${y}" width="${b.w}" height="${b.h}" fill="transparent"/>` : "";
  return `<g class="placement" data-id="${p.id}" transform="translate(${Math.round(b.cx * 10) / 10} ${Math.round(b.cy * 10) / 10}) rotate(${p.rotate || 0})"${filter}>${inner}${hit}${selected}</g>`;
}

/**
 * The SVG for one side. Options:
 *   side: "front" | "back" (default: design.side)
 *   guides: draw the print areas on that side
 *   interactive: hit boxes and handles for dragging
 *   title: accessible title
 */
export function renderDesign(design, { side = design.side, guides = false, interactive = false, title = null, uid = "cds" } = {}) {
  const g = GARMENTS[design.garment];
  const fabric = FABRICS[design.fabric];
  const base = design.colour;
  const dark = luminance(base) < 0.3;
  const shadow = shade(base, dark ? 0.08 : -0.12);
  const fold = shade(base, dark ? 0.12 : -0.18);
  const sheen = fabric?.sheen ?? 0.05;
  const weight = Math.min(1, (design.gsm - 120) / 300);
  const outline = g.outline[side];
  const extras = (g.extras[side] || []).map(d => `<path d="${d}" fill="${base}" stroke="${fold}" stroke-width="1.5"/>`).join("");
  const areas = guides
    ? Object.entries(g.areas).filter(([id]) => sideOf(id) === side).map(([id, a]) =>
      `<rect class="area" data-area="${id}" x="${a.cx - (a.w * PX_PER_CM) / 2}" y="${a.cy - (a.h * PX_PER_CM) / 2}" width="${a.w * PX_PER_CM}" height="${a.h * PX_PER_CM}" fill="none" stroke="${dark ? "#ffffff55" : "#00000040"}" stroke-dasharray="6 4"/>`).join("")
    : "";
  const art = design.placements.filter(p => sideOf(p.area) === side).map(p => artwork(design, p, { interactive, uid })).join("");
  const label = title ?? `${design.colourName} ${g.label.toLowerCase()} in ${fabric?.label.toLowerCase() ?? design.fabric}, ${side}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}" role="img" aria-label="${esc(label)}">`
    + `<title>${esc(label)}</title>`
    + `<defs>`
    + `<linearGradient id="${uid}-drape" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="${0.18 - weight * 0.08}"/><stop offset="0.25" stop-color="#fff" stop-opacity="${sheen}"/><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="0.8" stop-color="#fff" stop-opacity="${sheen * 0.6}"/><stop offset="1" stop-color="#000" stop-opacity="${0.2 - weight * 0.08}"/></linearGradient>`
    + `<filter id="${uid}-raised" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1.4" dy="2" stdDeviation="1.2" flood-color="#000" flood-opacity=".45"/></filter>`
    + `<filter id="${uid}-thread"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="3"/><feDisplacementMap in="SourceGraphic" scale="1.6"/><feDropShadow dx=".6" dy=".8" stdDeviation=".5" flood-opacity=".35"/></filter>`
    + `<clipPath id="${uid}-body"><path d="${outline}"/></clipPath>`
    + `</defs>`
    + `<path d="${outline}" fill="${base}" stroke="${shadow}" stroke-width="2"/>`
    + `<path d="${outline}" fill="url(#${uid}-drape)"/>`
    + `<g clip-path="url(#${uid}-body)" stroke="${fold}" stroke-width="1.2" fill="none" opacity="${0.5 - weight * 0.25}"><path d="M180 260 Q186 360 176 470"/><path d="M322 280 Q314 380 324 470"/></g>`
    + extras
    + areas
    + art
    + `</svg>`;
}
