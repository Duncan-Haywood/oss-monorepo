// @ts-check
// The HOA packet: what the shed looks like from every side, with its size,
// heights and roof pitch, what it is clad in and what colour, and where it
// goes on the lot. An HOA's architectural committee usually asks for exactly
// this, so it is built as a few printable pages a person can save as a PDF
// from the browser's print dialog (no PDF library).
//
// The elevations here are drawn to look like the finished shed (siding
// direction and colour, trim, door, windows, vents, shingles), not like the
// framing sheets in drawings.mjs. The site plan is the plan set's own sheet
// (drawings.mjs, from the lot you type), reused as is.

import { fmtFtIn, fmtIn } from './lumber.mjs';
import { paletteOf, finishName, SIDING_FINISHES, TRIM_FINISHES, DOOR_FINISHES, SHINGLE_FAMILIES } from './looks.mjs';
import { buildSheets, sheetSvg } from './drawings.mjs';
import { productById } from './products.mjs';
import { LAP_PRODUCTS } from './lap.mjs';
import { gambrelShape, bandAbove, zOnPoly, kneeRun } from './gambrel.mjs';

/** @typedef {ReturnType<typeof import('./model.mjs').buildShed>} Shed */

export const VIEWS = /** @type {const} */ (['front', 'back', 'left', 'right']);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hex = (rgb) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('')}`;
const shade = (rgb, f) => rgb.map((c) => c * f);

/**
 * How the siding reads from the street: its direction and the spacing of its
 * lines. Lap siding runs level; T1-11 has vertical grooves; board and batten
 * has battens; smooth panels show only their 4 ft joints. A type this module
 * does not know is drawn as lap if its name says so, otherwise as panels.
 * @param {string} type
 */
export function sidingLook(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'vinyl') return { direction: 'horizontal', pattern: 'lap', spacing: 4, label: 'vinyl lap siding (horizontal, 4" reveal)' };
  const lap = LAP_PRODUCTS[type];
  if (lap) return { direction: 'horizontal', pattern: 'lap', spacing: lap.exposure, label: `${lap.short} siding (horizontal, ${fmtIn(lap.exposure)} exposure)` };
  if (t === 'fiber cement' || /lap|hardie|plank|clapboard/.test(t)) return { direction: 'horizontal', pattern: 'lap', spacing: 7, label: `${type} lap siding (horizontal, 7" exposure)` };
  if (t === 't1-11') return { direction: 'vertical', pattern: 'grooves', spacing: 8, label: 'T1-11 panel siding (vertical grooves 8" apart)' };
  if (t === 'board and batten') return { direction: 'vertical', pattern: 'battens', spacing: 12, label: 'board and batten (vertical battens about 12" apart)' };
  return { direction: 'vertical', pattern: 'panel', spacing: 48, label: `${type} panel siding (smooth, 4 ft panel joints)` };
}

/** The siding colour as a word and a hex value. @param {any} d */
export function sidingFinish(d) {
  // The same colour the 3D view paints (looks.mjs), so the packet and the picture agree.
  const h = hex(paletteOf(d).siding);
  if (/^#[0-9a-f]{6}$/i.test(String(d.sidingColor))) return { name: `paint ${d.sidingColor}`, hex: h };
  if (d.sidingColor === 'unfinished') return { name: d.sidingType === 'vinyl' ? 'factory colour' : 'unfinished (primed or bare)', hex: h };
  if (d.sidingType === 'vinyl' && d.sidingColor === 'natural') return { name: 'white (factory colour)', hex: h };
  return { name: d.sidingColor === 'natural' ? 'natural stain' : `${finishName(d.sidingColor, SIDING_FINISHES)} paint`, hex: h };
}

const roofHex = (d) => hex(paletteOf(d).roof);
const trimHex = (d) => hex(paletteOf(d).trim);
/** Colour names as a reader sees them: "gray-brown blend", "custom colour #5a6e8c". */
const roofName = (d) => finishName(d.roofColor, SHINGLE_FAMILIES);
const trimName = (d) => finishName(d.trimColor, TRIM_FINISHES);
const doorName = (d) => finishName(d.doorColor, DOOR_FINISHES);

/** A repeatable pseudo-random number in [0, 1) for a tab or course, so a drawing is the same every time. */
const rand = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

/** What a door or window is, in words an HOA reads. @param {any} op */
function openingName(op) {
  const pr = productById(op.product);
  if (op.kind === 'door') return op.product === 'site-built' ? 'door built from the siding, trimmed' : pr ? pr.name : 'door';
  return pr ? pr.name : 'window';
}

/**
 * The facts an HOA asks for, as label and value pairs: size, area, heights,
 * pitch, and every finish with its colour.
 * @param {Shed} shed
 */
export function packetSummary(shed) {
  const d = shed.design;
  const k = shed.dims;
  const area = (d.length * d.width) / 144;
  const look = sidingLook(d.sidingType);
  const ops = shed.framedOpenings;
  const count = (kind) => ops.filter((o) => o.kind === kind);
  const list = (kind) => {
    const groups = new Map();
    for (const o of count(kind)) {
      const key = `${fmtIn(o.width)} x ${fmtIn(o.height)} on the ${o.wall} (${openingName(o)})`;
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    return [...groups].map(([key, n]) => (n > 1 ? `${n} of ${key}` : key)).join('; ');
  };
  const rows = [
    ['Footprint', `${fmtFtIn(d.length)} x ${fmtFtIn(d.width)} (walls), ${area.toFixed(area % 1 ? 1 : 0)} sq ft`],
    ['Roof outline', `about ${fmtFtIn(d.length + 3)} x ${fmtFtIn(d.width + 2 * d.overhang)} including a ${fmtIn(d.overhang)} eave overhang front and back`],
    ['Height to the peak', `${fmtFtIn(k.peak)} above the ground (top of the gravel or blocks)`],
    ['Height to the eave walls', `${fmtFtIn(k.plateTop)} above the ground; walls ${fmtFtIn(d.wallHeight)} floor to top of plates`],
    k.floorless ? ['Floor', `none: a gravel floor; walls on timbers ${fmtFtIn(k.floorTop)} high`] : ['Floor height', `${fmtFtIn(k.floorTop)} above the ground`],
    ['Roof', d.style === 'gambrel'
      ? `gambrel (barn), ${d.gambrelLower}/12 lower and ${d.pitch}/12 upper slopes (${(Math.atan(d.gambrelLower / 12) * 180 / Math.PI).toFixed(0)} and ${(Math.atan(d.pitch / 12) * 180 / Math.PI).toFixed(0)} degrees), the bend ${fmtIn(kneeRun(d))} in from each long wall, peak running the ${fmtFtIn(d.length)} length`
      : `gable, ${d.pitch}/12 pitch (${(Math.atan(d.pitch / 12) * 180 / Math.PI).toFixed(1)} degrees), ridge running the ${fmtFtIn(d.length)} length`],
    ['Siding', d.siding ? `${look.label}${LAP_PRODUCTS[d.sidingType] ? ` (${d.sidingType})` : ''}, ${sidingFinish(d).name}${d.polkaDots ? ', with purple polka dots' : ''}` : 'none shown'],
    ['Roofing', d.roofing ? (d.roofCover === 'metal' ? `corrugated metal, ${roofName(d)}` : `asphalt shingles, ${roofName(d)} colour family`) : 'none shown'],
    ['Trim', d.wallTrim === 'none' ? `fascia and rake boards, ${trimName(d)}; no corner boards or casings` : `${d.wallTrim} corner boards and casings, fascia and rake boards, ${trimName(d)}`],
    ['Door finish', doorName(d) + (d.doorColor === 'stained' ? '' : ' paint')],
    ['Doors', count('door').length ? list('door') : 'none'],
    ['Windows', count('window').length ? list('window') : 'none'],
  ];
  if (d.gableVents && Object.keys(shed.vents || {}).length) rows.push(['Gable vents', `${fmtIn(d.ventWidth)} x ${fmtIn(d.ventHeight)}, in each gable end`]);
  return rows;
}

/**
 * One elevation as an SVG: the finished shed seen square-on from one side,
 * coloured as designed, with its overall width, wall and peak heights, roof
 * pitch and every opening dimensioned. Units are inches; the viewBox scales it.
 * @param {Shed} shed
 * @param {'front'|'back'|'left'|'right'} name
 */
export function elevationSvg(shed, name) {
  const d = shed.design;
  const k = shed.dims;
  const eave = name === 'front' || name === 'back';
  const F = eave ? d.length : d.width;
  const o = d.overhang;
  const tt = d.pitch / 12;
  const cosA = 1 / Math.sqrt(1 + tt * tt);
  // Top of the roof at a distance in from a wall face (negative is out over the eave), as drawings.mjs has it.
  const zt = (dist) => k.plateTop + (dist - k.stud) * tt + k.plumbH;
  const roofThick = (7 / 16 + (d.roofCover === 'metal' ? 0.6 : 0.35)) / cosA;
  // A gambrel's roof line, and lines square to it: the roof's top, the bottom of its edge and of the rake board.
  const gam = d.style === 'gambrel' ? gambrelShape(d, k.plateTop) : null;
  const cover = 7 / 16 + (d.roofCover === 'metal' ? 0.6 : 0.35);
  const gTop = gam ? bandAbove(gam, cover) : null;
  const gEdge = gam ? bandAbove(gam, -0.75) : null;
  const gRake = gam ? bandAbove(gam, -4.25) : null;
  const roofTop = (dist) => (gTop ? zOnPoly(gTop, dist) : zt(dist) + roofThick);
  const eaveZ = roofTop(-o);
  const rakeOut = 1.5; // sheathing and rake board past the gable wall
  const fascia = 5.5;
  const hxOf = (a) => (name === 'front' || name === 'right' ? a : F - a);
  const off = eave ? 0 : k.stud;
  const fin = sidingFinish(d);
  const sid = d.siding ? fin.hex : '#e9d9b5';
  const roofC = roofHex(d);
  const trim = trimHex(d);
  const look = sidingLook(d.sidingType);
  const z0 = k.floorless ? k.sidingBottom : Math.max(0, k.skidTop - 1);

  // Extent of the drawing, in inches. Text is sized to the shed so every
  // elevation of it prints at the same weight.
  const x0 = eave ? -rakeOut : -o;
  const x1 = eave ? F + rakeOut : F + o;
  const fs = +(Math.max(d.length + 2 * o, k.peak) / 42).toFixed(2);
  const top = k.peak + fs * 3;
  const Y = (z) => +(top - z).toFixed(2);
  const vb = { x: x0 - fs * 4.5, y: 0, w: x1 - x0 + fs * 12, h: top + fs * 7.5 };
  const parts = [];
  const P = (pts) => pts.map(([x, z]) => `${(+x).toFixed(2)},${Y(z)}`).join(' ');

  // Siding outline: a rectangle on an eave wall, a pentagon up to the rake board on a gable end.
  const wallTop = eave ? k.plateTop : gRake ? zOnPoly(gRake, 0) : roofTop(0) - 3.5;
  const outline = eave
    ? [[0, z0], [F, z0], [F, k.plateTop], [0, k.plateTop]]
    : gRake ? [[0, z0], [F, z0], ...gRake.slice().reverse()]
      : [[0, z0], [F, z0], [F, wallTop], [F / 2, k.peak - roofThick - 3.5 / cosA], [0, wallTop]];
  const clipId = `clip-${name}`;
  parts.push(`<defs><clipPath id="${clipId}"><polygon points="${P(outline)}"/></clipPath></defs>`);
  parts.push(`<polygon points="${P(outline)}" fill="${sid}" stroke="#333" stroke-width="0.5"/>`);
  // Siding lines, clipped to the wall.
  const lines = [];
  const line = (xa, za, xb, zb, w, c) => lines.push(`<line x1="${xa.toFixed(2)}" y1="${Y(za)}" x2="${xb.toFixed(2)}" y2="${Y(zb)}" stroke="${c}" stroke-width="${w}"/>`);
  const dark = hex(shade(hexToRgb(sid), 0.72));
  if (d.siding) {
    if (look.pattern === 'lap') {
      // Each course's butt edge, and the soft shadow it casts on the course below.
      const soft = hex(shade(hexToRgb(sid), 0.86));
      for (let z = z0 + look.spacing; z < k.peak; z += look.spacing) { lines.push(`<rect x="0" y="${Y(z)}" width="${F}" height="${(look.spacing * 0.18).toFixed(2)}" fill="${soft}"/>`); line(0, z, F, z, 0.45, dark); }
    } else {
      const step = look.pattern === 'panel' ? 48 : look.spacing;
      for (let x = step; x < F; x += step) {
        if (look.pattern === 'battens') lines.push(`<rect x="${(x - 1.25).toFixed(2)}" y="${Y(k.peak)}" width="2.5" height="${(k.peak - z0).toFixed(2)}" fill="${hex(shade(hexToRgb(sid), 0.9))}" stroke="${dark}" stroke-width="0.3"/>`);
        else line(x, z0, x, k.peak, x % 48 === 0 ? 0.6 : 0.4, dark);
      }
    }
    if (d.polkaDots) for (let x = 6; x < F; x += 12) for (let z = z0 + 6; z < k.peak; z += 12) lines.push(`<circle cx="${(x + ((Math.round(z / 12) % 2) * 6)).toFixed(2)}" cy="${Y(z)}" r="2.2" fill="#8047ad"/>`);
  }
  // Shade and shadow, drawn the drafting way with the sun at 45 degrees: the
  // eave casts a band as deep as it sticks out; the rake a narrower one.
  if (eave) lines.push(`<rect x="0" y="${Y(k.plateTop)}" width="${F}" height="${(o + fascia).toFixed(2)}" fill="#000" fill-opacity="0.16"/>`);
  else {
    const dz = (rakeOut + 4) / cosA;
    const rake = gRake || [[0, wallTop], [F / 2, k.peak - roofThick - 3.5 / cosA], [F, wallTop]];
    lines.push(`<polygon points="${P([...rake, ...rake.slice().reverse().map(([x, z]) => [x, z - dz])])}" fill="#000" fill-opacity="0.14"/>`);
  }
  parts.push(`<g clip-path="url(#${clipId})">${lines.join('')}</g>`);
  // Corner boards.
  if (d.wallTrim !== 'none') {
    for (const xa of [0, F - 3.5]) parts.push(`<rect x="${xa}" y="${Y(wallTop)}" width="3.5" height="${(wallTop - z0).toFixed(2)}" fill="${trim}" stroke="#555" stroke-width="0.3"/>`);
  }
  // Doors, windows and vents.
  const labels = [];
  for (const p of shed.walls[name]?.openings || []) {
    const a = hxOf(p.a + off);
    const b = hxOf(p.a + p.w + off);
    const xa = Math.min(a, b);
    const xb = Math.max(a, b);
    const za = k.floorTop + p.bottom;
    const zb = za + p.op.height;
    const cas = d.wallTrim === 'none' ? 0 : 3.5;
    if (cas) parts.push(`<rect x="${(xa - cas).toFixed(2)}" y="${Y(zb + cas)}" width="${(xb - xa + 2 * cas).toFixed(2)}" height="${(zb - za + cas + (p.op.kind === 'window' ? cas : 0)).toFixed(2)}" fill="${trim}" stroke="#555" stroke-width="0.3"/>`);
    if (p.op.kind === 'door') {
      const site = p.op.product === 'site-built';
      const fill = d.doorColor && d.doorColor !== 'stained' ? hex(paletteOf(d).door) : site ? sid : '#f3f1ec';
      parts.push(`<rect x="${xa.toFixed(2)}" y="${Y(zb)}" width="${(xb - xa).toFixed(2)}" height="${(zb - za).toFixed(2)}" fill="${fill}" stroke="#333" stroke-width="0.6" data-kind="door"/>`);
      const leaves = xb - xa > 60 ? 2 : 1;
      const lw = (xb - xa) / leaves;
      for (let i = 0; i < leaves; i++) {
        const lx = xa + i * lw;
        if (site) {
          // The Z frame's rails and brace, in trim colour, as a site-built shed door shows them.
          for (const zr of [za + 6, (za + zb) / 2, zb - 6]) parts.push(`<rect x="${(lx + 1).toFixed(2)}" y="${Y(zr + 1.75)}" width="${(lw - 2).toFixed(2)}" height="3.5" fill="${trim}" stroke="#555" stroke-width="0.2"/>`);
          parts.push(`<line x1="${(lx + 3).toFixed(2)}" y1="${Y(za + 8)}" x2="${(lx + lw - 3).toFixed(2)}" y2="${Y((za + zb) / 2 - 2)}" stroke="${trim}" stroke-width="3"/>`);
          parts.push(`<line x1="${(lx + 3).toFixed(2)}" y1="${Y((za + zb) / 2 + 2)}" x2="${(lx + lw - 3).toFixed(2)}" y2="${Y(zb - 8)}" stroke="${trim}" stroke-width="3"/>`);
        } else {
          for (const [pz0, pz1] of [[za + 6, (za + zb) / 2 - 3], [(za + zb) / 2 + 3, zb - 6]]) parts.push(`<rect x="${(lx + 5).toFixed(2)}" y="${Y(pz1)}" width="${(lw - 10).toFixed(2)}" height="${(pz1 - pz0).toFixed(2)}" fill="none" stroke="#999" stroke-width="0.4"/>`);
        }
        parts.push(`<circle cx="${(i === 0 && leaves === 2 ? lx + lw - 4 : lx + lw - 4).toFixed(2)}" cy="${Y(za + 36)}" r="1.2" fill="#333"/>`);
      }
      if (leaves === 2) parts.push(`<line x1="${(xa + lw).toFixed(2)}" y1="${Y(zb)}" x2="${(xa + lw).toFixed(2)}" y2="${Y(za)}" stroke="#333" stroke-width="0.6"/>`);
    } else {
      parts.push(`<rect x="${xa.toFixed(2)}" y="${Y(zb)}" width="${(xb - xa).toFixed(2)}" height="${(zb - za).toFixed(2)}" fill="#f5f5f2" stroke="#333" stroke-width="0.5" data-kind="window"/>`);
      parts.push(`<rect x="${(xa + 1.5).toFixed(2)}" y="${Y(zb - 1.5)}" width="${(xb - xa - 3).toFixed(2)}" height="${(zb - za - 3).toFixed(2)}" fill="#bcd6ea" stroke="#567" stroke-width="0.3"/>`);
      if (xb - xa > 20) parts.push(`<line x1="${((xa + xb) / 2).toFixed(2)}" y1="${Y(zb - 1.5)}" x2="${((xa + xb) / 2).toFixed(2)}" y2="${Y(za + 1.5)}" stroke="#f5f5f2" stroke-width="1.2"/>`);
    }
    labels.push({ xa, xb, za, zb, kind: p.op.kind, w: p.w, h: p.op.height, from: xa });
  }
  for (const v of shed.vents?.[name] || []) {
    const a = hxOf(v.s0); const b = hxOf(v.s1);
    const xa = Math.min(a, b); const xb = Math.max(a, b);
    const za = k.floorTop + v.z0; const zb = k.floorTop + v.z1;
    parts.push(`<rect x="${xa.toFixed(2)}" y="${Y(zb)}" width="${(xb - xa).toFixed(2)}" height="${(zb - za).toFixed(2)}" fill="#ecebe6" stroke="#555" stroke-width="0.4" data-kind="vent"/>`);
    for (let z = za + 1.5; z < zb - 0.5; z += 1.5) parts.push(`<line x1="${(xa + 0.8).toFixed(2)}" y1="${Y(z)}" x2="${(xb - 0.8).toFixed(2)}" y2="${Y(z)}" stroke="#999" stroke-width="0.35"/>`);
  }
  // Roof.
  if (eave) {
    // No fascia on a gambrel: its lower slope meets the wall with no overhang.
    if (!gam) parts.push(`<rect x="${(-rakeOut).toFixed(2)}" y="${Y(eaveZ)}" width="${(F + 2 * rakeOut).toFixed(2)}" height="${fascia}" fill="${trim}" stroke="#555" stroke-width="0.4"/>`);
    parts.push(`<polygon points="${P([[-rakeOut, eaveZ], [F + rakeOut, eaveZ], [F + rakeOut, k.peak], [-rakeOut, k.peak]])}" fill="${roofC}" stroke="#222" stroke-width="0.5"/>`);
    if (d.roofing && d.roofCover !== 'metal') {
      // Shingle courses (5" exposure along the slope), foreshortened by the view.
      // Architectural shingles are blends: tabs of uneven width, staggered
      // course to course, each a shade lighter or darker (the family's blend).
      // On a gambrel each slope foreshortens its courses differently.
      const kneeZ = gam && gTop ? zOnPoly(gTop, gam.yk) : Infinity;
      const stepAt = (z) => 5 * Math.sin(Math.atan(gam && z < kneeZ - 1e-9 ? d.gambrelLower / 12 : tt));
      const base = hexToRgb(roofC);
      const blend = paletteOf(d).roofBlend;
      const c = hex(shade(base, 0.7));
      const tabs = [];
      for (let z = eaveZ, i = 0; z < k.peak - 0.3; z += stepAt(z), i++) {
        const zt2 = Math.min(k.peak, z + stepAt(z));
        for (let x = -rakeOut - rand(i, 1) * 12, j = 0; x < F + rakeOut; j++) {
          const w = 9 + 6 * rand(i, j + 2);
          const xa = Math.max(-rakeOut, x); const xb = Math.min(F + rakeOut, x + w);
          const f = 1 + blend * (rand(j, i + 0.5) * 2 - 1);
          tabs.push(`<rect x="${xa.toFixed(2)}" y="${Y(zt2)}" width="${(xb - xa).toFixed(2)}" height="${(zt2 - z).toFixed(2)}" fill="${hex(shade(base, f))}" stroke="${c}" stroke-width="0.15"/>`);
          x += w;
        }
        parts.push(...tabs.splice(0));
        parts.push(`<line x1="${-rakeOut}" y1="${Y(z)}" x2="${F + rakeOut}" y2="${Y(z)}" stroke="${hex(shade(base, 0.55))}" stroke-width="0.5"/>`);
      }
    } else if (d.roofing) {
      const c = hex(shade(hexToRgb(roofC), 0.75));
      for (let x = 0; x < F; x += 2.67) parts.push(`<line x1="${x.toFixed(2)}" y1="${Y(eaveZ)}" x2="${x.toFixed(2)}" y2="${Y(k.peak)}" stroke="${c}" stroke-width="0.3"/>`);
    }
    if (gam && gTop) parts.push(`<line x1="${-rakeOut}" y1="${Y(zOnPoly(gTop, gam.yk))}" x2="${F + rakeOut}" y2="${Y(zOnPoly(gTop, gam.yk))}" stroke="#222" stroke-width="0.6"/>`);
  } else if (gTop && gEdge && gRake) {
    // A gambrel's gable: the roof edge and the rake board below it follow both slopes.
    parts.push(`<polygon points="${P([...gTop, ...gEdge.slice().reverse()])}" fill="${roofC}" stroke="#222" stroke-width="0.5"/>`);
    parts.push(`<polygon points="${P([...gEdge, ...gRake.slice().reverse()])}" fill="${trim}" stroke="#555" stroke-width="0.4"/>`);
  } else {
    const band = roofThick + 0.75;
    parts.push(`<polygon points="${P([[-o, eaveZ], [F / 2, k.peak], [F + o, eaveZ], [F + o, eaveZ - band], [F / 2, k.peak - band / cosA], [-o, eaveZ - band]])}" fill="${roofC}" stroke="#222" stroke-width="0.5"/>`);
    parts.push(`<polygon points="${P([[-o, eaveZ - band], [F / 2, k.peak - band / cosA], [F + o, eaveZ - band], [F + o, eaveZ - band - 3.5], [F / 2, k.peak - (band + 3.5) / cosA], [-o, eaveZ - band - 3.5]])}" fill="${trim}" stroke="#555" stroke-width="0.4"/>`);
    // Eave ends: the fascia seen end-on under each eave.
    for (const xa of [-o, F + o - 1.5]) parts.push(`<rect x="${xa}" y="${Y(eaveZ - band)}" width="1.5" height="${fascia}" fill="${trim}" stroke="#555" stroke-width="0.3"/>`);
  }
  // Ground.
  parts.push(`<line x1="${(x0 - fs * 3).toFixed(2)}" y1="${Y(0)}" x2="${(x1 + fs * 3).toFixed(2)}" y2="${Y(0)}" stroke="#4b5a3a" stroke-width="1"/>`);
  if (z0 > 0.5) parts.push(`<rect x="0" y="${Y(z0)}" width="${F}" height="${z0.toFixed(2)}" fill="#8f8f8a" stroke="#555" stroke-width="0.3"/>`);

  // Dimensions (all in blue, text in inches of drawing scale).
  const dims = [];
  const tick = fs * 0.5;
  const hdim = (xa, xb, z, text, cls) => {
    dims.push(`<g class="dim ${cls}"><line x1="${xa.toFixed(2)}" y1="${Y(z)}" x2="${xb.toFixed(2)}" y2="${Y(z)}"/>`
      + `<line x1="${xa.toFixed(2)}" y1="${(Y(z) - tick).toFixed(2)}" x2="${xa.toFixed(2)}" y2="${(Y(z) + tick).toFixed(2)}"/><line x1="${xb.toFixed(2)}" y1="${(Y(z) - tick).toFixed(2)}" x2="${xb.toFixed(2)}" y2="${(Y(z) + tick).toFixed(2)}"/>`
      + `<text x="${((xa + xb) / 2).toFixed(2)}" y="${(Y(z) - fs * 0.35).toFixed(2)}" text-anchor="middle" font-size="${fs}">${esc(text)}</text></g>`);
  };
  const vdim = (x, za, zb, text, cls, side = 1) => {
    const tx = x + side * fs * 0.45;
    dims.push(`<g class="dim ${cls}"><line x1="${x.toFixed(2)}" y1="${Y(za)}" x2="${x.toFixed(2)}" y2="${Y(zb)}"/>`
      + `<line x1="${(x - tick).toFixed(2)}" y1="${Y(za)}" x2="${(x + tick).toFixed(2)}" y2="${Y(za)}"/><line x1="${(x - tick).toFixed(2)}" y1="${Y(zb)}" x2="${(x + tick).toFixed(2)}" y2="${Y(zb)}"/>`
      + `<text x="${tx.toFixed(2)}" y="${Y((za + zb) / 2)}" text-anchor="middle" font-size="${fs}" transform="rotate(-90 ${tx.toFixed(2)} ${Y((za + zb) / 2)})">${esc(text)}</text></g>`);
  };
  const overall = eave ? `${fmtFtIn(F)} wall length` : `${fmtFtIn(F)} wall width`;
  hdim(0, F, -fs * 1.6, overall, 'overall');
  if (!eave && o > 0) hdim(-o, F + o, -fs * 3.4, `${fmtFtIn(F + 2 * o)} eave to eave`, 'eaves');
  const rx = x1 + fs * 5;
  vdim(rx, 0, k.peak, `${fmtFtIn(k.peak)} to peak`, 'peak');
  vdim(rx - fs * 2.6, 0, k.plateTop, `${fmtFtIn(k.plateTop)} to wall top`, 'wall');
  const lx = x0 - fs * 2.2;
  vdim(lx, 0, k.floorTop, k.floorless ? `timber ${fmtFtIn(k.floorTop)}` : `floor ${fmtFtIn(k.floorTop)}`, 'floor', -1);
  // Pitch: a little triangle on the roof (gable ends) or a note above it (eave sides).
  if (gam) {
    dims.push(`<g class="dim pitch"><text x="${(F / 2).toFixed(2)}" y="${(Y(k.peak) - fs * 0.6).toFixed(2)}" text-anchor="middle" font-size="${fs}">${d.pitch}/12 roof pitch above the bend, ${d.gambrelLower}/12 below it (gambrel); peak ${fmtFtIn(k.peak)} up</text></g>`);
  } else if (!eave) {
    const bx = F * 0.12; const bz = roofTop(F * 0.12) + fs * 2.2; const run = Math.max(12, F * 0.12);
    dims.push(`<g class="dim pitch"><polyline fill="none" points="${P([[bx, bz], [bx + run, bz], [bx + run, bz + run * tt]])}"/>`
      + `<text x="${(bx + run / 2).toFixed(2)}" y="${(Y(bz) + fs * 1.05).toFixed(2)}" text-anchor="middle" font-size="${fs * 0.9}">12</text>`
      + `<text x="${(bx + run + fs * 0.3).toFixed(2)}" y="${Y(bz + run * tt / 2)}" font-size="${fs * 0.9}">${d.pitch}</text>`
      + `<text x="${(bx - fs * 0.4).toFixed(2)}" y="${(Y(bz + run * tt) - fs * 0.6).toFixed(2)}" text-anchor="middle" font-size="${fs}">${d.pitch}/12 roof pitch</text></g>`);
  } else {
    dims.push(`<g class="dim pitch"><text x="${(F / 2).toFixed(2)}" y="${(Y(k.peak) - fs * 0.6).toFixed(2)}" text-anchor="middle" font-size="${fs}">${d.pitch}/12 roof pitch, ridge ${fmtFtIn(k.peak)} up</text></g>`);
  }
  // Each opening: its size above it, and a chain of dimensions under the
  // shed placing every door and window from the left corner as seen.
  for (const l of labels) {
    // A door's size goes inside it, on a white tab; a window's under its sill casing.
    const tx = (l.xa + l.xb) / 2;
    const label = `${l.kind} ${fmtIn(l.w)} x ${fmtIn(l.h)}`;
    const tz = l.kind === 'door' ? l.za + (l.zb - l.za) * 0.6 : l.za - (d.wallTrim === 'none' ? 0 : 3.5) - fs * 1.1;
    const tw = label.length * fs * 0.5;
    dims.push(`<g class="dim opening"><rect x="${(tx - tw / 2).toFixed(2)}" y="${(Y(tz) - fs * 0.95).toFixed(2)}" width="${tw.toFixed(2)}" height="${(fs * 1.3).toFixed(2)}" fill="#fff" opacity="0.85"/><text x="${tx.toFixed(2)}" y="${Y(tz).toFixed(2)}" text-anchor="middle" font-size="${fs * 0.85}">${esc(label)}</text></g>`);
  }
  if (labels.length) {
    const stops = [0, ...labels.flatMap((l) => [l.xa, l.xb]), F].sort((a, b) => a - b);
    const zc = eave || o <= 0 ? -fs * 3.4 : -fs * 5.2;
    for (let i = 0; i + 1 < stops.length; i++) {
      const [a, b] = [stops[i], stops[i + 1]];
      if (b - a < 0.25) continue;
      hdim(a, b, zc, b - a >= fs * 2.6 ? fmtFtIn(b - a) : '', 'chain');
    }
  }
  const title = `${name[0].toUpperCase()}${name.slice(1)} elevation (${eave ? 'eave side' : 'gable end'})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="hoa-elev" data-view="${name}" viewBox="${vb.x.toFixed(1)} ${vb.y} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}" role="img" aria-label="${esc(title)}">`
    + `<style>.hoa-elev .dim line,.hoa-elev .dim polyline{stroke:#1f4e8c;stroke-width:${(fs * 0.06).toFixed(2)}}.hoa-elev .dim text{fill:#1f4e8c;font-family:ui-sans-serif,system-ui,sans-serif}</style>`
    + `<rect x="${vb.x.toFixed(1)}" y="${vb.y}" width="${vb.w.toFixed(1)}" height="${vb.h.toFixed(1)}" fill="#fff"/>`
    + `${parts.join('')}${dims.join('')}</svg>`;
}

/**
 * The roof and footprint seen from above: the roof's outline with its
 * overhangs, the ridge, the walls under it, and where each door and window
 * sits, front wall at the bottom. Dimensioned in feet and inches.
 * @param {Shed} shed
 */
export function planSvg(shed) {
  const d = shed.design;
  const L = d.length;
  const W = d.width;
  const o = d.overhang;
  const r = 1.5; // sheathing and rake board past each gable wall
  const fs = +(Math.max(L, W + 2 * o) / 40).toFixed(2);
  const X = (x) => +x.toFixed(2);
  const Y = (y) => +(W + o - y).toFixed(2); // front (y = 0) at the bottom
  const parts = [];
  const roofC = roofHex(d);
  parts.push(`<rect x="${X(-r)}" y="${Y(W + o)}" width="${X(L + 2 * r)}" height="${X(W + 2 * o)}" fill="${roofC}" fill-opacity="0.25" stroke="#222" stroke-width="${(fs * 0.08).toFixed(2)}" data-kind="roof"/>`);
  parts.push(`<line x1="${X(-r)}" y1="${Y(W / 2)}" x2="${X(L + r)}" y2="${Y(W / 2)}" stroke="#222" stroke-width="${(fs * 0.08).toFixed(2)}" data-kind="ridge"/>`);
  parts.push(`<rect x="0" y="${Y(W)}" width="${L}" height="${W}" fill="none" stroke="#444" stroke-width="${(fs * 0.07).toFixed(2)}" stroke-dasharray="${fs * 0.5} ${fs * 0.3}" data-kind="walls"/>`);
  const t = (x, y, text, size = fs, anchor = 'middle', extra = '') => parts.push(`<text x="${X(x)}" y="${Y(y)}" text-anchor="${anchor}" font-size="${size.toFixed(2)}"${extra}>${esc(text)}</text>`);
  t(L / 2, W / 2 + fs * 0.4, 'RIDGE', fs * 0.8);
  t(L / 2, W * 0.25, `slope down ${d.pitch}/12`, fs * 0.8);
  t(L / 2, W * 0.75 + fs * 0.6, `slope down ${d.pitch}/12`, fs * 0.8);
  t(L / 2, -o - fs * 3.6, 'FRONT', fs, 'middle', ' font-weight="700"');
  // Each door and window, as a thick mark on its wall line with its width.
  for (const f of shed.fixtures.filter((x) => x.kind === 'door' || x.kind === 'window')) {
    const g = f.geom;
    const w = g.profile[1][0];
    const [x0, y0] = [g.origin[0], g.origin[1]];
    const [x1, y1] = [x0 + g.u[0] * w, y0 + g.u[1] * w];
    const col = f.kind === 'door' ? '#8a3b12' : '#2563a8';
    parts.push(`<line x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y1)}" stroke="${col}" stroke-width="${(fs * 0.45).toFixed(2)}" data-kind="${f.kind}"/>`);
    const mx = (x0 + x1) / 2; const my = (y0 + y1) / 2;
    const inX = mx <= 0.01 ? fs * 0.6 : mx >= L - 0.01 ? -fs * 0.6 : 0;
    const inY = my <= 0.01 ? fs * 1.4 : my >= W - 0.01 ? -fs * 0.9 : 0;
    t(mx + inX, my + inY, `${f.kind} ${fmtIn(w)}`, fs * 0.75, inX > 0 ? 'start' : inX < 0 ? 'end' : 'middle');
  }
  // Dimensions: walls and roof, both ways.
  const ds = [];
  const sw = (fs * 0.06).toFixed(2);
  const tk = fs * 0.4;
  const h = (a, b, y, text, cls) => ds.push(`<g class="dim ${cls}"><line x1="${X(a)}" y1="${Y(y)}" x2="${X(b)}" y2="${Y(y)}" stroke-width="${sw}"/><line x1="${X(a)}" y1="${Y(y) - tk}" x2="${X(a)}" y2="${Y(y) + tk}" stroke-width="${sw}"/><line x1="${X(b)}" y1="${Y(y) - tk}" x2="${X(b)}" y2="${Y(y) + tk}" stroke-width="${sw}"/><text x="${X((a + b) / 2)}" y="${(Y(y) - fs * 0.3).toFixed(2)}" text-anchor="middle" font-size="${fs}">${esc(text)}</text></g>`);
  const v = (x, a, b, text, cls) => { const tx = X(x - fs * 0.4); const ty = Y((a + b) / 2); ds.push(`<g class="dim ${cls}"><line x1="${X(x)}" y1="${Y(a)}" x2="${X(x)}" y2="${Y(b)}" stroke-width="${sw}"/><line x1="${X(x) - tk}" y1="${Y(a)}" x2="${X(x) + tk}" y2="${Y(a)}" stroke-width="${sw}"/><line x1="${X(x) - tk}" y1="${Y(b)}" x2="${X(x) + tk}" y2="${Y(b)}" stroke-width="${sw}"/><text x="${tx}" y="${ty}" text-anchor="middle" font-size="${fs}" transform="rotate(-90 ${tx} ${ty})">${esc(text)}</text></g>`); };
  h(0, L, -o - fs * 1.4, `${fmtFtIn(L)} walls`, 'walls-l');
  h(-r, L + r, W + o + fs * 1.4, `about ${fmtFtIn(L + 2 * r)} roof`, 'roof-l');
  v(L + r + fs * 2, 0, W, `${fmtFtIn(W)} walls`, 'walls-w');
  v(L + r + fs * 4.4, -o, W + o, `${fmtFtIn(W + 2 * o)} roof`, 'roof-w');
  if (o > 0) v(-r - fs * 1.2, W, W + o, `${fmtIn(o)}`, 'overhang');
  const vb = { x: -r - fs * 3.5, y: Y(W + o + fs * 3.4), w: L + 2 * r + fs * 9.5, h: W + 2 * o + fs * 8.6 };
  return `<svg xmlns="http://www.w3.org/2000/svg" class="hoa-elev hoa-plan" data-view="plan" viewBox="${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}" role="img" aria-label="Roof and footprint plan">`
    + `<style>.hoa-plan .dim line{stroke:#1f4e8c}.hoa-plan .dim text{fill:#1f4e8c}.hoa-plan text{font-family:ui-sans-serif,system-ui,sans-serif}</style>`
    + `<rect x="${vb.x.toFixed(1)}" y="${vb.y.toFixed(1)}" width="${vb.w.toFixed(1)}" height="${vb.h.toFixed(1)}" fill="#fff"/>${parts.join('')}${ds.join('')}</svg>`;
}

/** @param {string} h */
function hexToRgb(h) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h) || ['', 'cc', 'cc', 'cc'];
  return [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
}

/**
 * The site plan sheet from the plan set, when you have typed a lot; null
 * otherwise (and on a build of the plan set that has no site plan).
 * @param {Shed} shed
 */
export function siteSheetSvg(shed) {
  const site = buildSheets(shed).find((s) => s.id === 'site');
  return site ? sheetSvg(site, { name: shed.design.name }) : null;
}

/**
 * The whole packet as HTML pages, ready to print. `perspective` is a PNG data
 * URL of the 3D view, or null to leave it out.
 * @param {Shed} shed
 * @param {{ perspective?: string|null, date?: string }} [opts]
 */
export function packetHtml(shed, opts = {}) {
  const d = shed.design;
  const rows = packetSummary(shed);
  const fin = sidingFinish(d);
  const swatch = (c, label) => `<span class="swatch"><i style="background:${c}"></i>${esc(label)}</span>`;
  const site = siteSheetSvg(shed);
  const page = (title, body, cls = '') => `<section class="hoa-page ${cls}"><header class="hoa-head"><span>${esc(d.name)}</span><span>${esc(title)}</span></header>${body}<footer class="hoa-foot">Drawn from the design by Shed Designer${opts.date ? ` on ${esc(opts.date)}` : ''}. Dimensions in feet and inches; heights from the ground. Not engineered or code-checked, and not an approval: submit it to your HOA for its review.</footer></section>`;
  const fig = (v) => `<figure class="hoa-fig">${elevationSvg(shed, v)}<figcaption>${esc(v[0].toUpperCase() + v.slice(1))} elevation, ${v === 'front' || v === 'back' ? 'eave side' : 'gable end'}</figcaption></figure>`;
  const summary = `<table class="hoa-summary">${rows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table>`;
  const colours = `<p class="hoa-colours">${d.siding ? swatch(fin.hex, `Siding: ${fin.name}`) : ''}${swatch(roofHex(d), `Roof: ${roofName(d)}`)}${swatch(trimHex(d), `Trim: ${trimName(d)}`)}${d.doorColor && d.doorColor !== 'stained' ? swatch(hex(paletteOf(d).door), `Door: ${doorName(d)}`) : ''}</p>`;
  const persp = opts.perspective ? `<figure class="hoa-fig hoa-3d"><img src="${opts.perspective}" alt="3D view of the finished shed"><figcaption>3D view of the finished shed</figcaption></figure>` : '';
  return [
    page('Summary', `<h1>${esc(d.name)}: exterior design for HOA review</h1><div class="hoa-cover-grid"><div>${summary}${colours}</div>${persp}</div>`, 'hoa-cover'),
    page('Front and back elevations', fig('front') + fig('back')),
    page('Left and right elevations', fig('left') + fig('right')),
    page('Roof and footprint plan', `<figure class="hoa-fig hoa-planfig">${planSvg(shed)}<figcaption>Seen from above, front wall at the bottom: the roof outline with its overhangs, the ridge, the walls (dashed) and where each door and window sits.</figcaption></figure>`),
    page('Site plan', site
      ? `<figure class="hoa-fig hoa-site">${site}<figcaption>Where the shed goes, with its distance to each lot line and the house, as typed. Not a survey.</figcaption></figure>`
      : '<div class="hoa-nosite"><p><strong>No site plan yet.</strong> Type your lot, where the shed sits on it and your house under "Site plan" in Shed Designer, and this page shows the shed on the lot with its distance to each lot line and the house.</p><p>Until then, sketch it here: lot lines, the house, the shed, and the distance from the shed to each lot line.</p></div>', 'hoa-sitepage'),
  ].join('\n');
}

/** A design in a link's `#d=` fragment, as the designer's "Copy link" writes it. @param {object} design */
export function encodeDesign(design) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(design)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The design in a `#d=` fragment, or null when there is none or it is broken. @param {string} hash */
export function decodeDesign(hash) {
  const m = /#d=([^&]*)/.exec(hash || '');
  if (!m) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
