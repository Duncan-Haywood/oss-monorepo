// @ts-check
// Shop drawings as a PDF, written byte by byte with no library and no browser:
// one landscape Letter page per wall (continued pages when the parts table runs
// long), the same marks, rough openings, plate joints, dimension chain and
// parts table as drawings.mjs, drawn from the laid-out wall rather than
// converted from the SVG. Pure functions returning bytes; inches in, points out.
// Helvetica is one of the 14 standard PDF fonts, so nothing is embedded.
import { formatLength, formatInches, verifyWall } from "./engine.mjs";
import { markMembers } from "./drawings.mjs";
import { panelizeWall, panelParts } from "./panels.mjs";

const PAGE_W = 792, PAGE_H = 612, MARGIN = 36;

// Helvetica advance widths (1/1000 em) for ASCII 32..126, from the standard AFM.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

const FILL = { plate: [0.64, 0.51, 0.31], stud: [0.85, 0.73, 0.49], king: [0.77, 0.54, 0.23], jack: [0.55, 0.42, 0.18], header: [0.44, 0.31, 0.13], cripple: [0.89, 0.81, 0.62], sill: [0.72, 0.55, 0.29], blocking: [0.79, 0.71, 0.54] };

/** Text as the single-byte WinAnsi subset the standard fonts read: anything outside Latin-1 becomes "?". */
const latin = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const pdfStr = (s) => latin(s).replace(/[\\()]/g, (c) => "\\" + c);
const num = (n) => String(Math.round(n * 100) / 100);

/** Width of a string in points at a font size (bold approximated at 1.07x regular). */
export function textWidth(s, size, bold = false) {
  let w = 0;
  for (const ch of latin(s)) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126 ? HELV[c - 32] : 556); }
  return (w * size * (bold ? 1.07 : 1)) / 1000;
}

/** Break text into lines no wider than `width` points. */
function wrap(text, size, width) {
  const lines = [];
  let line = "";
  for (const word of latin(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size) > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** One page's content stream, built from drawing calls in PDF user space (origin bottom left, points). */
class Page {
  constructor() { /** @type {string[]} */ this.ops = []; }
  fill(rgb) { this.ops.push(`${rgb.map(num).join(" ")} rg`); }
  stroke(rgb, w = 0.5, dash = null) { this.ops.push(`${rgb.map(num).join(" ")} RG ${num(w)} w ${dash ? `[${dash.map(num).join(" ")}] 0 d` : "[] 0 d"}`); }
  rect(x, y, w, h, mode = "B") { this.ops.push(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re ${mode}`); }
  poly(pts, mode = "B") { this.ops.push(`${pts.map(([x, y], i) => `${num(x)} ${num(y)} ${i ? "l" : "m"}`).join(" ")} h ${mode}`); }
  line(x1, y1, x2, y2) { this.ops.push(`${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`); }
  /** options: align "left"|"center"|"right"; rot in degrees, counter-clockwise, about (x, y) */
  text(s, x, y, size, { bold = false, align = "left", rgb = [0, 0, 0], rot = 0 } = {}) {
    const w = textWidth(s, size, bold);
    const dx = align === "center" ? -w / 2 : align === "right" ? -w : 0;
    const a = (rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    this.ops.push(`BT ${rgb.map(num).join(" ")} rg /${bold ? "F2" : "F1"} ${num(size)} Tf ${num(c)} ${num(sn)} ${num(-sn)} ${num(c)} ${num(x + dx * c)} ${num(y + dx * sn)} Tm (${pdfStr(s)}) Tj ET`);
  }
  toString() { return this.ops.join("\n"); }
}

/** Assemble pages into a PDF file: catalog, page tree, two fonts, then a page and a stream per page. */
function assemble(pages, title) {
  /** @type {string[]} */
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // page tree, filled in below
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const info = add(`<< /Title (${pdfStr(title)}) /Producer (wall-framing-takeoff) >>`);
  const kids = [];
  for (const p of pages) {
    const body = p.toString();
    const stream = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${stream} 0 R >>`));
  }
  objs[1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // every character is one byte (latin() keeps content to Latin-1), so the offsets above are byte offsets
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

const DISCLAIMER = "No warranty. These drawings are a plan-derived picture of the layout you entered, not engineering, construction or building-code advice and not stamped; header sizes, jack counts and spacing are your inputs and are not checked against a span table or code. Check every dimension against your plans and your engineer before cutting or buying. To the maximum extent permitted by law the authors accept no liability for loss or damage arising from their use.";

/** The elevation of one wall, scaled to fit the box (bx, by, bw, bh) measured from the page's bottom left. */
function drawElevation(pg, w, wall, plan, pan, bx, by, bw, bh) {
  const H = w.height, L = w.length;
  const padL = 14, padT = pan ? 22 : 10, padB = 44, padR = 4; // wall inches reserved for dimensions and labels
  const s = Math.min(bw / (L + padL + padR), bh / (H + padT + padB));
  const ox = bx + (bw - (L + padL + padR) * s) / 2 + padL * s;
  const oy = by + (bh - (H + padT + padB) * s) / 2 + padB * s; // the floor line
  const X = (v) => ox + v * s, Y = (v) => oy + v * s;
  const peak = w.gable?.peak ?? L / 2;
  const { marks } = markMembers(w);
  pg.stroke([0.23, 0.18, 0.08], 0.3);
  w.members.forEach((m, i) => {
    pg.fill(FILL[m.kind] || [0.8, 0.8, 0.8]);
    if (m.sloped) {
      const t = 1.5, rising = m.x < peak - 1e-6;
      pg.poly((rising
        ? [[m.x, m.y], [m.x + m.w, m.y + m.h], [m.x + m.w, m.y + m.h + t], [m.x, m.y + t]]
        : [[m.x, m.y + m.h], [m.x + m.w, m.y], [m.x + m.w, m.y + t], [m.x, m.y + m.h + t]]).map(([x, y]) => [X(x), Y(y)]));
    } else pg.rect(X(m.x), Y(m.y), m.w * s, m.h * s);
    const tiny = (m.kind === "plate" ? m.h : Math.min(m.w, m.h)) < 3;
    const size = Math.max(3.5, Math.min(6.5, 3.4 * s));
    if (m.orient === "v" && m.h >= 14) pg.text(marks[i], X(m.x + m.w / 2) + size * 0.35, Y(m.y + m.h / 2), size, { align: "center", rot: 90 });
    else if (m.orient === "h" && m.w >= 14 && !tiny) pg.text(marks[i], X(m.x + m.w / 2), Y(m.y + m.h / 2) - size * 0.35, size, { align: "center" });
  });
  const headerH = plan.defaultHeaderHeight ?? 82.5;
  pg.stroke([0.11, 0.36, 0.48], 0.7, [3, 2]);
  for (const o of wall?.openings || []) {
    const top = o.headerHeight ?? headerH;
    pg.rect(X(o.offset), Y(top - o.height), o.width * s, o.height * s, "S");
    const cx = X(o.offset + o.width / 2), cy = Y(top - o.height / 2);
    pg.text(o.label || o.kind, cx, cy, Math.max(5, 4.4 * s), { align: "center", rgb: [0.11, 0.36, 0.48] });
    pg.text(`${formatInches(o.width)} x ${formatInches(o.height)}`, cx, cy - Math.max(5, 4.4 * s) - 1, Math.max(4.5, 3.4 * s), { align: "center", rgb: [0.11, 0.36, 0.48] });
  }
  // plate joints in red
  pg.stroke([0.7, 0.15, 0.12], 0.9);
  for (const [k, list] of Object.entries(w.joints || {})) {
    if (w.gable && k !== "bottom") continue;
    const y = k === "bottom" ? 1.5 : H - 1.5;
    for (const j of /** @type {number[]} */ (list)) pg.line(X(j), Y(y - 1), X(j), Y(y + 2.5));
  }
  // panel cuts and letters
  if (pan) {
    pg.stroke([0.42, 0.17, 0.57], 0.8, [4, 1.5, 1, 1.5]);
    for (const c of pan.cuts) pg.line(X(c), Y(H + 2), X(c), Y(-2));
    for (const p of pan.panels) pg.text(`Panel ${p.name}`, X((p.x0 + p.x1) / 2), Y(H + 6), 7, { bold: true, align: "center", rgb: [0.42, 0.17, 0.57] });
  }
  // dimension chain
  const stops = new Set([0, L]);
  for (const m of w.members) if (m.orient === "v" && (m.kind === "stud" || m.kind === "king")) stops.add(Math.round(m.x * 1000) / 1000);
  const xs = [...stops].sort((a, b) => a - b);
  pg.stroke([0.27, 0.27, 0.27], 0.3);
  for (const x of xs) pg.line(X(x), Y(-2), X(x), Y(-11));
  xs.slice(1).forEach((x, i) => {
    const d = x - xs[i];
    if (d * s >= 16) pg.text(formatInches(d), X((xs[i] + x) / 2), Y(-8), Math.min(6, 3.6 * s + 1), { align: "center", rgb: [0.13, 0.13, 0.13] });
  });
  pg.line(X(0), Y(-20), X(L), Y(-20)); pg.line(X(0), Y(-23), X(0), Y(-17)); pg.line(X(L), Y(-23), X(L), Y(-17));
  pg.text(`${w.id}: ${formatLength(L)} overall`, X(L / 2), Y(-30), 9, { bold: true, align: "center" });
  pg.line(X(-6), Y(0), X(-6), Y(H));
  pg.text(formatInches(H), X(-8), Y(H / 2), 6.5, { align: "center", rot: 90 });
}

/**
 * One wall (or one shop panel) as a sheet, continued pages when the parts run long.
 * @param {Page[]} pages
 * @param {{sheet: string, heading: string, panelNote?: string}} tag
 */
function wallSheet(pages, w, wall, plan, pan, tag) {
  const problems = tag.panelNote ? [] : verifyWall(w, wall);
  const { parts } = markMembers(w);
  let pg = new Page();
  pages.push(pg);
  const head = (p, suffix = "") => {
    p.text(`${tag.heading}${suffix}`, MARGIN, PAGE_H - MARGIN - 12, 16, { bold: true });
    p.text(`${tag.sheet}  |  ${formatLength(w.length)} long  |  ${formatInches(w.height)} high  |  ${w.stud} studs at ${formatInches(plan.studSpacing)} centres${w.gable ? `  |  gable ${w.gable.pitch}/12` : ""}${tag.panelNote ? `  |  ${tag.panelNote}` : ""}`, MARGIN, PAGE_H - MARGIN - 26, 8.5, { rgb: [0.33, 0.33, 0.33] });
  };
  head(pg);
  // disclaimer and check lines sit at the foot of the sheet
  const footLines = wrap(DISCLAIMER, 6.5, PAGE_W - 2 * MARGIN);
  const footTop = MARGIN + footLines.length * 8 + 4;
  pg.stroke([0.7, 0.7, 0.7], 0.4); pg.line(MARGIN, footTop, PAGE_W - MARGIN, footTop);
  footLines.forEach((l, k) => pg.text(l, MARGIN, footTop - 9 - k * 8, 6.5, { rgb: [0.33, 0.33, 0.33] }));
  const joints = ["bottom", "top", "cap"].map((k) => `${k} ${(w.joints?.[k] || []).map(formatLength).join(", ") || "none"}`).join("; ");
  const check = wrap(`Plate joints (red) from the wall start: ${joints}. ${tag.panelNote ? "The layout check runs on the whole wall (its own sheet); this panel is built from whole members cut at a clear line, with plates trimmed to its span." : problems.length ? `Layout check found ${problems.length} problem(s): ${problems.join("; ")}` : "Layout check passed: every member inside the wall, none overlapping, every plate joint over a full stud."}${w.notes?.length ? " " + w.notes.join(" ") : ""}`, 7.5, PAGE_W - 2 * MARGIN);
  const checkTop = footTop + 6 + check.length * 9;
  check.forEach((l, k) => pg.text(l, MARGIN, checkTop - 9 - k * 9 + 3, 7.5, { rgb: [problems.length ? 0.7 : 0.13, problems.length ? 0.15 : 0.13, problems.length ? 0.12 : 0.13] }));
  // elevation takes the upper part, the parts table the rest
  const elevTop = PAGE_H - MARGIN - 34;
  const elevH = Math.min(270, (elevTop - checkTop) * 0.55);
  pg.stroke([0.8, 0.8, 0.8], 0.5); pg.fill([1, 0.99, 0.97]);
  pg.rect(MARGIN, elevTop - elevH, PAGE_W - 2 * MARGIN, elevH, "B");
  drawElevation(pg, w, wall, plan, pan, MARGIN + 4, elevTop - elevH + 2, PAGE_W - 2 * MARGIN - 8, elevH - 4);
  // parts table: columns of rows that fit; more rows than fit means a continued page
  const rowH = 10.5, colW = 232, cols = 3;
  let y0 = elevTop - elevH - 14;
  const drawTableHead = (p, x, y) => {
    p.stroke([0.5, 0.5, 0.5], 0.4);
    p.text("Mark", x + 2, y, 7.5, { bold: true }); p.text("Qty", x + 52, y, 7.5, { bold: true, align: "right" });
    p.text("Size", x + 60, y, 7.5, { bold: true }); p.text("Cut length", x + 142, y, 7.5, { bold: true, align: "right" }); p.text("Member", x + 148, y, 7.5, { bold: true });
    p.line(x, y - 3, x + colW - 6, y - 3);
  };
  pg.text("Parts", MARGIN, y0, 10, { bold: true });
  let bottom = checkTop + 6;
  let k = 0;
  let top = y0 - 12;
  while (k < parts.length) {
    const per = Math.max(1, Math.floor((top - 10 - bottom) / rowH));
    for (let c = 0; c < cols && k < parts.length; c++) {
      const x = MARGIN + c * colW;
      drawTableHead(pg, x, top);
      for (let r = 0; r < per && k < parts.length; r++, k++) {
        const p = parts[k], y = top - 12 - r * rowH;
        pg.text(p.mark, x + 2, y, 7.5, { bold: true }); pg.text(String(p.qty), x + 52, y, 7.5, { align: "right" });
        pg.text(p.size, x + 60, y, 7.5); pg.text(formatInches(p.length), x + 142, y, 7.5, { align: "right" });
        pg.text(p.label.slice(0, 22), x + 148, y, 7.5);
      }
    }
    if (k < parts.length) { // continue on a fresh page below the heading
      pg = new Page(); pages.push(pg); head(pg, " (parts, continued)");
      top = PAGE_H - MARGIN - 50; bottom = MARGIN + 10;
    }
  }
}



/** A shop panel as a wall of its own: its members (plates trimmed to the span) shifted so the panel starts at 0. */
function panelWall(w, p) {
  const members = [];
  w.members.forEach((m, i) => {
    if (m.kind === "plate") {
      const a = Math.max(m.x, p.x0), b = Math.min(m.x + m.w, p.x1);
      if (b - a > 1e-6) members.push({ ...m, x: a - p.x0, w: b - a, length: b - a });
    } else if (p.members.includes(i)) members.push({ ...m, x: m.x - p.x0 });
  });
  const joints = {};
  for (const [k, list] of Object.entries(w.joints || {})) joints[k] = /** @type {number[]} */ (list).filter((j) => j > p.x0 + 1e-6 && j < p.x1 - 1e-6).map((j) => j - p.x0);
  return { ...w, length: p.width, members, joints, notes: [] };
}

/**
 * The drawing set as a PDF: one landscape Letter sheet per wall.
 * @param {{ok: boolean, walls: any[]}} result from takeoff()
 * @param {any} plan the plan that produced it
 * @param {{title?: string, panelMax?: number}} [opts] panelMax (inches) draws the shop-panel cut lines and letters
 * @returns {Uint8Array} the file's bytes
 */
export function drawingSetPdf(result, plan, opts = {}) {
  const title = opts.title || "Wall framing shop drawings";
  const pages = [];
  const total = result.walls.length;
  result.walls.forEach((w, i) => {
    const pan = opts.panelMax && opts.panelMax > 0 ? panelizeWall(w, opts.panelMax) : null;
    wallSheet(pages, w, plan.walls[i], plan, pan, { sheet: `Sheet ${i + 1} of ${total}`, heading: w.id });
  });
  if (opts.panelMax && opts.panelMax > 0) {
    result.walls.forEach((w, i) => {
      if (w.gable) return; // sloped plates are not trimmed to a span here; gable walls stay whole-wall sheets
      const pan = panelizeWall(w, opts.panelMax);
      if (pan.panels.length < 2) return;
      const wall = plan.walls[i];
      const lbs = panelParts(w, pan);
      pan.panels.forEach((p, k) => {
        const sw = { ...wall, openings: (wall?.openings || []).filter((o) => o.offset + o.width > p.x0 + 1e-6 && o.offset < p.x1 - 1e-6).map((o) => ({ ...o, offset: o.offset - p.x0 })) };
        wallSheet(pages, panelWall(w, p), sw, plan, null, { sheet: `Panel ${p.name} of ${pan.panels.length}, ${w.id}`, heading: `${w.id} - Panel ${p.name}`, panelNote: `about ${lbs[k].lb} lb of lumber` });
      });
    });
  }
  return assemble(pages, title);
}
