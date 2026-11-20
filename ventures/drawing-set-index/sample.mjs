// @ts-check
// A made-up five-sheet drawing set, written as a real PDF so the page's
// "Try a sample" button and the tests run the same reader a visitor's file
// goes through. Issue 1 is the permit set; issue 2 drops A-501, adds A-502,
// changes notes on A-101 and retitles A-201. Issue 2's cover index still
// lists A-501 and leaves out A-502 (a mistake the set check should catch).

const SHEETS = {
  1: [
    { no: 'G-001', title: ['COVER SHEET AND', 'DRAWING INDEX'], notes: [], index: true },
    { no: 'A-101', title: ['FIRST FLOOR PLAN'], notes: ['VERIFY ALL DIMENSIONS IN FIELD', 'SEE A-301 FOR SECTIONS', 'TYPICAL STUD WALL 2X6 @ 16" O.C.'], callouts: ['A-301', 'A-301', 'A-201'] },
    { no: 'A-201', title: ['EXTERIOR', 'ELEVATIONS'], notes: ['FIBER CEMENT LAP SIDING', 'ASPHALT SHINGLES, 30 YR'], callouts: ['A-301'] },
    { no: 'A-301', title: ['BUILDING SECTIONS'], notes: ['R-49 BLOWN INSULATION', 'R-21 BATT INSULATION'], callouts: ['A-501'] },
    { no: 'A-501', title: ['DETAILS'], notes: ['FLASHING AT WINDOW HEAD', 'SILL PAN FLASHING'], callouts: [] },
  ],
  2: [
    { no: 'G-001', title: ['COVER SHEET AND', 'DRAWING INDEX'], notes: [], index: true, staleIndex: true },
    { no: 'A-101', title: ['FIRST FLOOR PLAN'], notes: ['VERIFY ALL DIMENSIONS IN FIELD', 'SEE A-301 FOR SECTIONS', 'TYPICAL STUD WALL 2X6 @ 24" O.C.', 'ADD BLOCKING FOR GRAB BARS'], callouts: ['A-301', 'A-301', 'A-201'] },
    { no: 'A-201', title: ['EXTERIOR ELEVATIONS', 'NORTH AND SOUTH'], notes: ['FIBER CEMENT LAP SIDING', 'ASPHALT SHINGLES, 30 YR'], callouts: ['A-301'] },
    { no: 'A-301', title: ['BUILDING SECTIONS'], notes: ['R-49 BLOWN INSULATION', 'R-21 BATT INSULATION'], callouts: ['A-502'] },
    { no: 'A-502', title: ['WINDOW DETAILS'], notes: ['FLASHING AT WINDOW HEAD', 'SILL PAN FLASHING', 'JAMB FLASHING TAPE'], callouts: [] },
  ],
};

const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c);
const text = (x, y, size, s) => `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(s)}) Tj ET\n`;

function pageContent(sheet, issue, all) {
  const W = 1224, H = 792;
  let c = '0 0 0 RG 1.5 w\n';
  c += `18 18 ${W - 36} ${H - 36} re S\n`; // border
  c += `${W - 216} 18 m ${W - 216} ${H - 18} l S\n`; // title block strip
  for (const y of [120, 200, 280, 330]) c += `${W - 216} ${y} m ${W - 18} ${y} l S\n`; // cells
  c += text(W - 206, 760, 14, 'EXAMPLE ARCHITECTS');
  c += text(W - 206, 744, 8, 'Made-up firm for this sample');
  c += text(W - 206, 310, 11, 'SAMPLE RESIDENCE');
  c += text(W - 206, 296, 9, '100 Example Street, Anytown, ST 00000');
  c += text(W - 206, 262, 7, 'SHEET TITLE');
  sheet.title.forEach((t, i) => { c += text(W - 206, 240 - i * 18, 14, t); });
  c += text(W - 206, 184, 7, 'DATE');
  c += text(W - 140, 184, 9, issue === 1 ? '03/02/2026' : '04/15/2026');
  c += text(W - 206, 160, 7, issue === 1 ? 'ISSUED FOR PERMIT' : 'ISSUED FOR CONSTRUCTION');
  c += text(W - 206, 104, 7, 'SHEET');
  c += text(W - 170, 50, 36, sheet.no);
  sheet.notes.forEach((n, i) => { c += text(80, 700 - i * 16, 9, n); });
  (sheet.callouts || []).forEach((ref, i) => { c += `${200 + i * 160} 400 m ${240 + i * 160} 400 l S\n` + text(186 + i * 160, 380, 7, ref); });
  if (sheet.index) {
    c += text(80, 720, 16, 'DRAWING INDEX');
    let rows = all.map((s) => [s.no, s.title.join(' ')]);
    if (sheet.staleIndex) rows = SHEETS[1].map((s) => [s.no, s.title.join(' ')]); // not updated for issue 2
    rows.forEach(([no, t], i) => { c += text(80, 690 - i * 18, 10, no) + text(160, 690 - i * 18, 10, t); });
  }
  return c;
}

/** @param {1|2} issue @returns {Uint8Array} */
export function samplePdf(issue = 1) {
  const sheets = SHEETS[issue];
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  const kids = [];
  sheets.forEach((s, i) => {
    const content = pageContent(s, issue, sheets);
    const pageNum = 4 + i * 2, contNum = 5 + i * 2;
    kids.push(`${pageNum} 0 R`);
    objs[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1224 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contNum} 0 R >>`;
    objs[contNum] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
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
