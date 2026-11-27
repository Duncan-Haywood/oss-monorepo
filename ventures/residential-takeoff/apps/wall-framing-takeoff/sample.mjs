// @ts-check
// A made-up floor plan sheet, written as a real vector PDF so the page's "Try
// a sample" button and the tests run the same reader a visitor's file goes
// through. 11x17 sheet (1224 x 792 pt). The plan is a 36' x 24' building at
// 1/4" = 1'-0" (18 pt per foot) with an exterior wall 8" thick drawn as two
// lines, a 12' x 10' office closed by a door drawn as a leaf and swing, and
// dimension strings with witness lines. A wall section detail sits beside it
// at 1/2" = 1'-0". Page 2 is the same sheet printed at half size (every
// coordinate times 0.5), the mistake the scale check is for.

const FT = 18; // pt per foot at 1/4" = 1'-0"
const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c);
const text = (x, y, size, s, rot = false) => rot
  ? `BT /F1 ${size} Tf 0 1 -1 0 ${x} ${y} Tm (${esc(s)}) Tj ET\n`
  : `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(s)}) Tj ET\n`;
const line = (x1, y1, x2, y2) => `${x1} ${y1} m ${x2} ${y2} l S\n`;

/** A horizontal dimension from x1 to x2 at height y, witness lines down to wallY. */
function hdim(x1, x2, y, wallY, label) {
  let c = '0.25 w\n';
  c += line(x1 - 4, y, x2 + 4, y); // dimension line, carried past the witness lines
  const dir = Math.sign(y - wallY);
  c += line(x1, wallY + 3 * dir, x1, y + 4 * dir) + line(x2, wallY + 3 * dir, x2, y + 4 * dir);
  c += line(x1 - 3, y - 3, x1 + 3, y + 3) + line(x2 - 3, y - 3, x2 + 3, y + 3); // ticks
  c += text((x1 + x2) / 2 - 12, y + 2, 7, label);
  return c;
}
/** A vertical dimension from y1 to y2 at x, text reading up on its left side. */
function vdim(y1, y2, x, wallX, label) {
  let c = '0.25 w\n';
  c += line(x, y1 - 4, x, y2 + 4);
  const dir = Math.sign(x - wallX);
  c += line(wallX + 3 * dir, y1, x + 4 * dir, y1) + line(wallX + 3 * dir, y2, x + 4 * dir, y2);
  c += line(x - 3, y1 - 3, x + 3, y1 + 3) + line(x - 3, y2 - 3, x + 3, y2 + 3);
  c += text(x - 2, (y1 + y2) / 2 - 12, 7, label, true);
  return c;
}

function planContent() {
  const W = 1224, H = 792;
  let c = '0 0 0 RG 1.5 w\n';
  c += `18 18 ${W - 36} ${H - 36} re S\n`;
  c += line(W - 216, 18, W - 216, H - 18);
  c += text(W - 206, 760, 14, 'EXAMPLE ARCHITECTS');
  c += text(W - 206, 744, 8, 'Made-up firm for this sample');
  c += text(W - 206, 240, 14, 'FLOOR PLAN');
  c += text(W - 170, 50, 36, 'A-101');
  // building: outside face from (X0, Y0), 36' x 24', wall 8" thick
  const X0 = 120, Y0 = 200, Wd = 36 * FT, Ht = 24 * FT, T = (8 / 12) * FT;
  c += '1.2 w\n';
  c += `${X0} ${Y0} ${Wd} ${Ht} re S\n`;
  c += `${X0 + T} ${Y0 + T} ${Wd - 2 * T} ${Ht - 2 * T} re S\n`;
  // office: 12' x 10' clear, in the inside corner at bottom left; 4" partitions
  const P = (4 / 12) * FT, ox = X0 + T, oy = Y0 + T, ow = 12 * FT, oh = 10 * FT;
  c += line(ox + ow, oy, ox + ow, oy + oh + P) + line(ox + ow + P, oy, ox + ow + P, oy + oh + P); // east partition
  c += line(ox, oy + oh, ox + ow - 3 * FT, oy + oh) + line(ox, oy + oh + P, ox + ow - 3 * FT, oy + oh + P); // north partition, 3' door gap at its east end
  c += line(ox + ow - 3 * FT, oy + oh, ox + ow - 3 * FT, oy + oh + P); // jamb
  c += line(ox + ow, oy + oh, ox + ow, oy + oh + P);
  // door leaf (closed across the opening) and swing
  c += '0.5 w\n' + line(ox + ow - 3 * FT, oy + oh + P / 2, ox + ow, oy + oh + P / 2);
  // the swing: quarter circle from the leaf's free end, hinge at the east jamb
  const r = 3 * FT, hx = ox + ow, hy = oy + oh + P / 2, kk = 0.5523 * r;
  c += `${hx - r} ${hy} m ${hx - r} ${hy - kk} ${hx - kk} ${hy - r} ${hx} ${hy - r} c S\n`;
  // dimensions: overall 36' - 0" and 24' - 0", office 12' - 0"
  c += hdim(X0, X0 + Wd, Y0 + Ht + 30, Y0 + Ht, "36' - 0\"");
  c += vdim(Y0, Y0 + Ht, X0 - 30, X0, "24' - 0\"");
  c += hdim(ox, ox + ow, Y0 - 24, Y0, "12' - 0\"");
  c += hdim(X0 + Wd - 16 * FT, X0 + Wd, Y0 - 24, Y0, "16' - 0\"");
  c += text(ox + 4 * FT, oy + 5 * FT, 8, 'OFFICE');
  c += text(ox + 4 * FT, oy + 5 * FT - 10, 7, '120 SF');
  // view title and scale under the plan, at its left
  c += '1 w\n' + line(X0, Y0 - 50, X0 + 200, Y0 - 50);
  c += text(X0, Y0 - 46, 10, 'FLOOR PLAN');
  c += text(X0, Y0 - 62, 8, '1/4" = 1\'-0"');
  // a wall section detail at 1/2" = 1'-0" (36 pt per foot): 4' of wall, 8" thick
  const DX = 820, DY = 260, D = 36;
  c += '1.2 w\n' + `${DX} ${DY} ${(8 / 12) * D} ${4 * D} re S\n`;
  c += hdim(DX, DX + (8 / 12) * D, DY + 4 * D + 20, DY + 4 * D, '8"');
  c += vdim(DY, DY + 4 * D, DX - 20, DX, "4' - 0\"");
  c += vdim(DY, DY + 2 * D, DX + 60, DX + (8 / 12) * D + 30, "2' - 0\"");
  c += '1 w\n' + line(DX - 40, DY - 50, DX + 110, DY - 50);
  c += text(DX - 40, DY - 46, 10, 'WALL SECTION');
  c += text(DX - 40, DY - 62, 8, '1/2" = 1\'-0"');
  return c;
}

/** The plan as a PDF; page 2 is the same sheet shrunk to half size. */
export function samplePdf() {
  const content = planContent();
  const half = 'q 0.5 0 0 0.5 0 0 cm\n' + content + 'Q\n';
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1224 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>';
  objs[5] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  objs[6] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 396] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R >>';
  objs[7] = `<< /Length ${half.length} >>\nstream\n${half}endstream`;
  objs[2] = '<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>';
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let n = 1; n < objs.length; n++) { offsets[n] = out.length; out += `${n} 0 obj\n${objs[n]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/** Where things are on page 1, for the tests and the page's guided sample. */
export const SAMPLE = {
  office: { x: 120 + 12 + 6 * 18, y: 200 + 12 + 3 * 18, sf: 120 },
  outsideCorners: [[120, 200], [120 + 36 * 18, 200], [120 + 36 * 18, 200 + 24 * 18], [120, 200 + 24 * 18]],
};
