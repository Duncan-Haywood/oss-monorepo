// An invented part drawing, written as a real PDF, so the page's "Try the
// sample" button and the tests run the same reader a customer's file goes
// through. Nothing here is a real part, company or CAGE code.
//
// Built in a known trap: the title block says revision C while the
// revision table lists D, and note 4 is missing (notes go 1, 2, 3, 5).

const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c);
const t = (x, y, size, s) => `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(s)}) Tj ET\n`;

function content() {
  const W = 1224, H = 792;
  let c = "0 0 0 RG 1 w\n";
  c += `18 18 ${W - 36} ${H - 36} re S\n`;
  // Title block, bottom right.
  c += `${W - 420} 18 m ${W - 420} 170 l S\n${W - 420} 170 m ${W - 18} 170 l S\n`;
  c += t(W - 410, 156, 7, "TITLE");
  c += t(W - 410, 142, 11, "MOUNTING BRACKET, SENSOR");
  c += t(W - 410, 120, 7, "PART NO");
  c += t(W - 410, 106, 11, "EX-20417");
  c += t(W - 250, 120, 7, "REV");
  c += t(W - 250, 106, 11, "C");
  c += t(W - 180, 120, 7, "CAGE CODE");
  c += t(W - 180, 106, 11, "0EX00");
  c += t(W - 410, 84, 7, "MATERIAL");
  c += t(W - 410, 70, 9, "AL 6061-T651 PER AMS-QQ-A-250/11");
  c += t(W - 410, 50, 7, "FINISH");
  c += t(W - 410, 36, 9, "SEE NOTE 3");
  c += t(W - 180, 84, 7, "SCALE");
  c += t(W - 180, 70, 9, "2:1");
  c += t(W - 180, 50, 9, "SHEET 1 OF 1");
  // Tolerance block, left of the title block.
  c += t(W - 640, 156, 7, "UNLESS OTHERWISE SPECIFIED:");
  c += t(W - 640, 144, 7, "DIMENSIONS ARE IN INCHES");
  c += t(W - 640, 132, 7, ".XX ±.01");
  c += t(W - 640, 120, 7, ".XXX ±.005");
  c += t(W - 640, 108, 7, "ANGLES ±0.5°");
  c += t(W - 640, 96, 7, "INTERPRET PER ASME Y14.5-2018");
  c += t(W - 640, 84, 7, "BREAK EDGES .005-.015");
  // Revision table, top right.
  c += t(W - 420, 760, 7, "REV");
  c += t(W - 380, 760, 7, "DESCRIPTION");
  c += t(W - 160, 760, 7, "DATE");
  c += t(W - 420, 746, 8, "A");
  c += t(W - 380, 746, 8, "INITIAL RELEASE");
  c += t(W - 160, 746, 8, "03/02/2026");
  c += t(W - 420, 732, 8, "B");
  c += t(W - 380, 732, 8, "ADDED NOTE 5");
  c += t(W - 160, 732, 8, "05/11/2026");
  c += t(W - 420, 718, 8, "C");
  c += t(W - 380, 718, 8, "BORE WAS .4990");
  c += t(W - 160, 718, 8, "08/20/2026");
  c += t(W - 420, 704, 8, "D");
  c += t(W - 380, 704, 8, "SLOT WIDTH CHANGED");
  c += t(W - 160, 704, 8, "10/06/2026");
  // Notes, top left.
  c += t(60, 740, 10, "NOTES:");
  c += t(60, 722, 9, "1. REMOVE ALL BURRS AND SHARP EDGES.");
  c += t(60, 708, 9, "2. MATERIAL CERTS REQUIRED WITH EACH SHIPMENT,");
  c += t(74, 696, 9, "TRACEABLE TO HEAT LOT.");
  c += t(60, 682, 9, "3. ANODIZE PER MIL-PRF-8625, TYPE II, CLASS 2, BLACK.");
  c += t(74, 670, 9, "MASK BORE Ø.5000.");
  c += t(60, 656, 9, "5. MARK PART NO AND REV PER MIL-STD-130, .12 HIGH, APPROX AS SHOWN.");
  // Views with dimension text.
  c += "200 300 m 600 300 l 600 500 l 200 500 l h S\n";
  c += t(380, 520, 9, "4.000");
  c += t(610, 400, 9, "2.00");
  c += t(360, 400, 9, "Ø.5000 ±.0005");
  c += t(250, 460, 9, "2X Ø.201 THRU");
  c += t(250, 330, 9, "1/4-20 UNC-2B");
  c += t(470, 330, 9, ".375 +.002/-.000");
  c += t(470, 460, 9, "45°");
  c += t(300, 270, 9, "(1.250)");
  c += t(60, 40, 7, "INVENTED EXAMPLE DRAWING FOR A FREE TOOL. NOT A REAL PART.");
  return c;
}

/** @returns {Uint8Array} */
export function sampleDrawingPdf() {
  const body = content();
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [4 0 R] /Count 1 >>";
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1224 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>";
  objs[5] = `<< /Length ${body.length} >>\nstream\n${body}endstream`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let n = 1; n < objs.length; n++) { offsets[n] = out.length; out += `${n} 0 obj\n${objs[n]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
