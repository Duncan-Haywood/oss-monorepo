// Chromium/Skia (and so every "Print to PDF" from a browser) draw text with a
// y-down CTM and a y-down text matrix. They cancel out; the page must still
// read top to bottom. Before 2026-11-19 either flip alone marked a run
// "flipped" and such pages came out bottom to top (found by the
// submittal-register venture's PDF eval: 5.8% recall until fixed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPdfLines } from "./pdf-text.mjs";

function tinyPdf(content) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let s = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return new TextEncoder().encode(s);
}

const text = async (content) => (await extractPdfLines(tinyPdf(content), async () => null)).pages[0].lines.map((l) => l.items.map((i) => i.text).join(" "));

test("y-down CTM and y-down Tm (browser print) read top to bottom", async () => {
  assert.deepEqual(await text("1 0 0 -1 0 792 cm BT /F1 10 Tf 1 0 0 -1 72 72 Tm (Opening balance) Tj 1 0 0 -1 72 90 Tm (01/02 Coffee 4.50) Tj 1 0 0 -1 72 108 Tm (Closing balance) Tj ET"), ["Opening balance", "01/02 Coffee 4.50", "Closing balance"]);
});

test("ordinary y-up page still reads top to bottom", async () => {
  assert.deepEqual(await text("BT /F1 10 Tf 72 720 Td (Opening balance) Tj 0 -18 Td (Closing balance) Tj ET"), ["Opening balance", "Closing balance"]);
});
