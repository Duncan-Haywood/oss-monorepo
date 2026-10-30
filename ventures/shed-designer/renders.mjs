// @ts-check
// Pictures of the starting designs, drawn by the tool's own WebGL viewer.
//
// `make-renders.mjs` loads each design into `createViewer` in headless
// Chromium and saves five views as small WebP files in `renders/`, with a
// manifest that records each design's scene hash. `renders.test.mjs` fails
// when a design, its geometry or the renderer's shaders change and the
// pictures were not redrawn, so the pictures can't drift from the tool.
//
// This module is browser-safe: the gallery, the marketing page and the size
// pages read the manifest through `renderFor` and `altFor`.

import { PRESETS, buildShed, wallLabel } from './model.mjs';
import { fmtFtIn } from './lumber.mjs';

/**
 * Bump when the camera, crop, supersampling or encoding changes in a way the
 * scene hash cannot see (it covers the geometry, colours and shaders).
 */
export const RENDER_VERSION = 1;

/**
 * The views drawn for every design. `theta` and `phi` are the viewer's own
 * orbit angles (front is -pi/2, as the "Front" button). `layers: 'framing'`
 * hides every covering, as "Framing only" does. `presentation` is the
 * viewer's own picture look (no board outlines); the framing keeps its
 * outlines so the studs can be counted.
 * @type {Record<string, { label: string, theta: number, phi: number, w: number, h: number, layers: 'finished' | 'framing', zoom: number, presentation: boolean }>}
 */
export const VIEWS = {
  hero: { label: 'from the front corner', theta: -0.95, phi: 0.26, w: 960, h: 640, layers: 'finished', zoom: 0.95, presentation: true },
  card: { label: 'from the front corner', theta: -0.95, phi: 0.26, w: 480, h: 320, layers: 'finished', zoom: 0.95, presentation: true },
  front: { label: 'from the front', theta: -Math.PI / 2, phi: 0.08, w: 480, h: 320, layers: 'finished', zoom: 0.82, presentation: true },
  side: { label: 'from the gable end', theta: 0, phi: 0.08, w: 480, h: 320, layers: 'finished', zoom: 0.82, presentation: true },
  back: { label: 'from the back', theta: Math.PI / 2, phi: 0.08, w: 480, h: 320, layers: 'finished', zoom: 0.82, presentation: true },
  framing: { label: 'framing cutaway', theta: -0.95, phi: 0.38, w: 640, h: 427, layers: 'framing', zoom: 0.95, presentation: false },
};

/** Layers hidden for the framing cutaway (the "Framing only" button's set). */
export const COVERINGS = ['sheathing', 'siding', 'roofing', 'trim', 'interior', 'front lining', 'decor'];

/**
 * Size budget for everything in `renders/`. Each file is checked against its
 * own limit, and the folder against the total, by `renders.test.mjs`. A
 * starting design's six pictures come to about 60 KB; the total was raised
 * from 900 KB to 1,100 KB when the lean-to and the gambrel barn joined the
 * presets, which leaves room for about three more.
 */
export const BUDGET = { total: 1100 * 1024, hero: 70 * 1024, other: 40 * 1024 };

/** A file-name-safe slug for a preset key: '8x12 classic' -> '8x12-classic'. */
export const slugOf = (key) => String(key).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Every design that gets pictures: the "New design" presets. A gallery of
 * optimised designs can pass its own `{ key: () => design }` map as `extra`.
 * @param {Record<string, () => any>} [extra]
 * @param {string[]} [views] which of VIEWS to draw (all by default)
 * @returns {{ slug: string, key: string, design: any, views: string[] }[]}
 */
export function renderTargets(extra = {}, views = Object.keys(VIEWS)) {
  const all = { ...PRESETS, ...extra };
  return Object.entries(all).map(([key, make]) => ({ slug: slugOf(key), key, design: make(), views }));
}

const SIDING = { 'T1-11': 'T1-11 panel siding', 'LP SmartSide': 'LP SmartSide panel siding', 'LP SmartSide 76': 'LP SmartSide panel siding', 'board and batten': 'board and batten siding', vinyl: 'vinyl siding', 'fiber cement': 'fiber cement siding' };

/**
 * Alt text for one view of one design, written from the built shed so it
 * says what the picture shows.
 * @param {any} design
 * @param {string} view
 */
export function altFor(design, view) {
  const shed = buildShed(design);
  const d = shed.design; const k = shed.dims;
  const size = `${Math.round(k.width / 12 * 10) / 10} by ${Math.round(k.length / 12 * 10) / 10} ft`;
  const name = d.name || 'gable shed';
  if (view === 'framing') {
    const ridge = d.roofType === 'ridgeBeam' ? `a two-ply ${d.beamSize} ridge beam on posts` : `a ${k.ridgeSize} ridge board with rafter ties`;
    if (d.style === 'leanTo') return `Framing of the ${name} (${size}) with the siding, sheathing and roofing removed: studs at ${d.studSpacing}" on centre and rafters at ${d.rafterSpacing}" running from the tall front wall down to the low back wall (a lean-to, no ridge).`;
    if (d.roofType === 'truss') return `Framing of the ${name} (${size}) with the siding, sheathing and roofing removed: studs at ${d.studSpacing}" on centre and site-built trusses at ${d.rafterSpacing}" with OSB gussets.`;
    return `Framing of the ${name} (${size}) with the siding, sheathing and roofing removed: studs at ${d.studSpacing}" on centre, rafters at ${d.rafterSpacing}" and ${ridge}.`;
  }
  const colour = d.sidingColor === 'natural' ? 'stained' : d.sidingColor === 'unfinished' ? 'unfinished' : `${d.sidingColor}`;
  const cover = d.roofCover === 'metal' ? `${d.roofColor} metal roof` : `${d.roofColor} shingles`;
  // The hero looks at the front and the right gable end; the side view at the right gable end.
  const walls = view === 'hero' || view === 'card' ? ['front', 'right'] : view === 'side' ? ['right'] : [view];
  const openings = (d.openings || []).filter((o) => walls.includes(o.wall));
  // Like openings are counted together: "two 36" windows on the front".
  const groups = new Map();
  for (const o of openings) {
    const where = walls.length > 1 ? ` on the ${(wallLabel(d, o.wall) || o.wall).toLowerCase()}` : '';
    const k = `${Math.round(o.width)}" ${o.kind}|${where}`;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  const COUNT = ['', 'a', 'two', 'three', 'four', 'five', 'six'];
  const what = groups.size
    ? `, showing ${[...groups].map(([k, n]) => { const [thing, where] = k.split('|'); return `${COUNT[n] || n} ${thing}${n > 1 ? 's' : ''}${where}`; }).join(' and ')}`
    : '';
  const sid = d.siding === false ? 'unsided' : `${colour} ${SIDING[d.sidingType] || 'siding'}`;
  return `3D render of the ${name}, ${size}, seen ${VIEWS[view]?.label || view}: ${sid}, ${cover}, ${d.pitch}/12 ${k.lean ? 'lean-to roof' : 'roof'}, ${fmtFtIn(k.peak)} to the ${k.lean ? 'high edge' : 'peak'}${what}.`;
}

/**
 * A short fingerprint of a design as given (FNV-1a over its JSON), stored in
 * the manifest so a page can tell, without building it, that the design in
 * hand is the one that was drawn.
 * @param {any} design
 */
export function designKey(design) {
  const text = JSON.stringify(design);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * The drawn picture of this exact design from one view, or null. Any change
 * to the design (a customised preset) gives null, so the caller draws live.
 * @param {any} manifest
 * @param {any} design
 * @param {string} view
 * @param {string} [base]
 */
export function pictureFor(manifest, design, view, base = '') {
  if (!manifest?.designs) return null;
  const key = designKey(design);
  const slug = Object.keys(manifest.designs).find((s) => manifest.designs[s].designKey === key);
  return slug ? renderFor(manifest, slug, view, base) : null;
}

/**
 * The manifest entry and image path for one view, or null if not drawn.
 * @param {{ designs: Record<string, { files: Record<string, { file: string, w: number, h: number, alt: string }> }> } | null} manifest
 * @param {string} slug
 * @param {string} view
 * @param {string} [base] path to the venture folder from the page
 */
export function renderFor(manifest, slug, view, base = '') {
  const f = manifest?.designs?.[slug]?.files?.[view];
  return f ? { src: `${base}renders/${f.file}`, width: f.w, height: f.h, alt: f.alt } : null;
}
