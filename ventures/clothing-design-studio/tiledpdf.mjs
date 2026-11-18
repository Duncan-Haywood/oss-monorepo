// Tiled 1:1 PDF of pattern pieces for home printers (A4 or US Letter).
// Pure JS, no dependencies: writes a PDF 1.4 file with vector paths only.
// Page 1 is a calibration sheet (a 5 cm square and a 10 cm line: measure them
// after printing; if they are off, print at "actual size", not "fit to page").
// Each piece then gets a grid of pages with an overlap strip, corner crop
// marks, a "piece row-col" label, and a glue/trim hint. Cut lines are solid,
// stitch lines dashed, the grain line has arrow ends, notches are small ticks.
const PT = 72 / 2.54; // points per cm
export const PAPER = Object.freeze({ a4: [21.0, 29.7], letter: [21.59, 27.94] });
const f = n => (Math.round(n * 100) / 100).toString();
const pdfText = s => String(s).replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");

/** Number of columns and rows of pages a piece needs. */
export function tileGrid(w, h, { paper = "a4", marginCm = 1, overlapCm = 1 } = {}) {
  const [pw, ph] = PAPER[paper] || PAPER.a4;
  const uw = pw - 2 * marginCm, uh = ph - 2 * marginCm, step = [uw - overlapCm, uh - overlapCm];
  const n = (len, use, st) => len <= use ? 1 : 1 + Math.ceil((len - use) / st - 1e-9);
  return { cols: n(w, uw, step[0]), rows: n(h, uh, step[1]), usable: [uw, uh], step };
}

/** Pieces: [{name, qty, cutOnFold, cut, stitch, grain, notches, bbox, size?}]. */
export function tiledPdf(pieces, opt = {}) {
  const { paper = "a4", marginCm = 1, overlapCm = 1, title = "Pattern" } = opt;
  if (!PAPER[paper]) throw new Error(`paper must be one of ${Object.keys(PAPER).join(", ")}`);
  if (!(marginCm >= 0.3 && marginCm <= 3) || !(overlapCm >= 0.5 && overlapCm <= 3)) throw new Error("margin must be 0.3 to 3 cm and overlap 0.5 to 3 cm");
  const list = (pieces || []).filter(p => p && p.cut && p.cut.length > 2 && p.bbox);
  if (!list.length) throw new Error("no pieces to print");
  const [pw, ph] = PAPER[paper];
  const pages = [];
  const X = cm => f(cm * PT), Y = cm => f((ph - cm) * PT); // page cm (y down) -> PDF points
  const path = (pts, ox, oy, closed) => pts.map((p, i) => `${X(p[0] + ox)} ${Y(p[1] + oy)} ${i ? "l" : "m"}`).join("\n") + (closed ? "\nh" : "") + "\n";
  const text = (x, y, s, size = 8) => `BT /F1 ${size} Tf ${X(x)} ${Y(y)} Td (${pdfText(s)}) Tj ET\n`;

  // Page 1: calibration and index.
  let c = text(marginCm, marginCm + 1, `${title} - print at 100% / actual size (no fit to page)`, 11);
  c += "1 w\n" + `${X(marginCm)} ${Y(marginCm + 7)} ${f(5 * PT)} ${f(5 * PT)} re S\n`;
  c += text(marginCm, marginCm + 7.8, "This square must measure 5 cm by 5 cm. If not, fix the printer scale.", 9);
  c += `${X(marginCm)} ${Y(marginCm + 10)} m ${X(marginCm + 10)} ${Y(marginCm + 10)} l S\n` + text(marginCm, marginCm + 10.6, "This line must measure 10 cm.", 9);
  let y = marginCm + 12.5;
  const grids = list.map(p => ({ p, g: tileGrid(p.bbox.w, p.bbox.h, { paper, marginCm, overlapCm }) }));
  let total = 1;
  for (const { p, g } of grids) {
    c += text(marginCm, y, `${p.size ? p.size + " " : ""}${p.name} x${p.qty}${p.cutOnFold ? " (cut on the fold)" : ""}: ${g.cols} x ${g.rows} pages (${f(p.bbox.w)} x ${f(p.bbox.h)} cm)`, 9);
    y += 0.6; total += g.cols * g.rows;
  }
  c += text(marginCm, y + 0.4, `Total ${total} pages. Trim the margin on the marked side, overlap the strips, tape or glue.`, 9);
  pages.push(c);

  for (const { p, g } of grids) {
    for (let r = 0; r < g.rows; r++) for (let k = 0; k < g.cols; k++) {
      // The tile's window in piece coordinates (top-left of the piece's box is its origin).
      const wx = p.bbox.minX + k * g.step[0], wy = p.bbox.minY + r * g.step[1];
      const ox = marginCm - wx, oy = marginCm - wy; // piece cm -> page cm
      let s = "q\n" + `${X(marginCm)} ${Y(marginCm + g.usable[1])} ${f(g.usable[0] * PT)} ${f(g.usable[1] * PT)} re W n\n`;
      s += "0.8 w\n" + path(p.cut, ox, oy, true) + "S\n";
      if (p.stitch && p.stitch.length > 2) s += "0.4 w [3 2] 0 d\n" + path(p.stitch, ox, oy, true) + "S [] 0 d\n";
      if (p.grain && p.grain.length === 2) {
        s += "0.4 w\n" + path(p.grain, ox, oy, false) + "S\n";
        for (const [a, b] of [[p.grain[0], p.grain[1]], [p.grain[1], p.grain[0]]]) {
          const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
          s += path([[a[0] + ux * 1 - uy * 0.4, a[1] + uy * 1 + ux * 0.4], a, [a[0] + ux * 1 + uy * 0.4, a[1] + uy * 1 - ux * 0.4]], ox, oy, false) + "S\n";
        }
      }
      for (const n of p.notches || []) s += path([[n.at[0] - 0.3, n.at[1]], [n.at[0] + 0.3, n.at[1]]], ox, oy, false) + "S\n" + path([[n.at[0], n.at[1] - 0.3], [n.at[0], n.at[1] + 0.3]], ox, oy, false) + "S\n";
      s += "Q\n0.3 w\n";
      // Crop marks at the four corners of the usable window.
      const m = marginCm, x1 = m + g.usable[0], y1 = m + g.usable[1], t = 0.5;
      for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [x1, m, -1, 1], [m, y1, 1, -1], [x1, y1, -1, -1]]) {
        s += `${X(cx - sx * t)} ${Y(cy)} m ${X(cx + sx * t)} ${Y(cy)} l S\n${X(cx)} ${Y(cy - sy * t)} m ${X(cx)} ${Y(cy + sy * t)} l S\n`;
      }
      // Overlap strips shaded by a thin dotted line where the next page starts.
      s += "[1 2] 0 d\n";
      if (k < g.cols - 1) s += `${X(m + g.step[0])} ${Y(m)} m ${X(m + g.step[0])} ${Y(y1)} l S\n`;
      if (r < g.rows - 1) s += `${X(m)} ${Y(m + g.step[1])} m ${X(x1)} ${Y(m + g.step[1])} l S\n`;
      s += "[] 0 d\n";
      s += text(m, ph - 0.45, `${p.size ? p.size + " " : ""}${p.name}  row ${r + 1}/${g.rows}  col ${k + 1}/${g.cols}` + (k < g.cols - 1 ? "  -> right neighbour overlaps at the dotted line" : ""), 7);
      pages.push(s);
    }
  }

  // Assemble: 1 catalog, 2 pages, 3 font, then (page, content) pairs.
  const objs = [];
  const kids = pages.map((_, i) => `${4 + 2 * i} 0 R`).join(" ");
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((s, i) => {
    objs[4 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw * PT)} ${f(ph * PT)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`;
    objs[5 + 2 * i] = `<< /Length ${s.length} >>\nstream\n${s}endstream`;
  });
  let out = "%PDF-1.4\n"; const off = [];
  for (let i = 1; i < objs.length; i++) { off[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + off.slice(1).map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { pdf: out, pages: pages.length, grids: grids.map(({ p, g }) => ({ name: p.name, cols: g.cols, rows: g.rows })) };
}
