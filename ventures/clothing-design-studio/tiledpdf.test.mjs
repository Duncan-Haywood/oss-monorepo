import test from "node:test";
import assert from "node:assert/strict";
import { tiledPdf, tileGrid, PAPER } from "./tiledpdf.mjs";
import { draft } from "./pattern.mjs";

test("tileGrid: hand-counted pages on A4 with 1 cm margin and 1 cm overlap", () => {
  // usable 19 x 27.7, step 18 x 26.7
  assert.deepEqual([tileGrid(19, 27.7).cols, tileGrid(19, 27.7).rows], [1, 1]);
  assert.deepEqual([tileGrid(19.1, 27.7).cols, tileGrid(19.1, 27.7).rows], [2, 1]); // 19 + 18 = 37 covers up to 37
  assert.equal(tileGrid(37, 10).cols, 2);
  assert.equal(tileGrid(37.1, 10).cols, 3);
  assert.equal(tileGrid(10, 54.4).rows, 2); // 27.7 + 26.7 = 54.4 fits exactly
  assert.equal(tileGrid(10, 54.5).rows, 3);
});

test("a real tee makes a valid PDF whose xref offsets point at the objects", () => {
  const d = draft("tee", "M");
  const r = tiledPdf(d.pieces.map(p => ({ ...p, size: "M" })), { title: "Tee M" });
  const pdf = r.pdf;
  assert.ok(pdf.startsWith("%PDF-1.4") && pdf.trimEnd().endsWith("%%EOF"));
  assert.equal(r.pages, 1 + r.grids.reduce((a, g) => a + g.cols * g.rows, 0));
  assert.equal((pdf.match(/\/Type \/Page /g) || []).length, r.pages);
  const xr = +pdf.match(/startxref\n(\d+)/)[1];
  assert.ok(pdf.slice(xr).startsWith("xref"));
  const entries = pdf.slice(xr).split("\n").filter(l => /^\d{10} 00000 n/.test(l));
  entries.forEach((l, i) => assert.ok(pdf.slice(+l.slice(0, 10)).startsWith(`${i + 1} 0 obj`)));
  // stream lengths are exact
  for (const m of pdf.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)) assert.equal(+m[1], m[2].length);
  assert.ok(pdf.includes("5 cm by 5 cm"));
  assert.ok(pdf.includes("141.73 141.73 re S")); // the 5 cm calibration square in points
});

test("Letter paper changes the page size; bad input is refused", () => {
  const d = draft("tee", "S");
  const r = tiledPdf(d.pieces, { paper: "letter" });
  assert.ok(r.pdf.includes(`/MediaBox [0 0 ${Math.round(PAPER.letter[0] * 72 / 2.54 * 100) / 100} ${Math.round(PAPER.letter[1] * 72 / 2.54 * 100) / 100}]`));
  assert.ok(r.pdf.includes("/MediaBox [0 0 612 792]"));
  assert.throws(() => tiledPdf(d.pieces, { paper: "a0" }));
  assert.throws(() => tiledPdf(d.pieces, { overlapCm: 0 }));
  assert.throws(() => tiledPdf([]));
});

test("a larger size needs at least as many pages", () => {
  const n = s => tiledPdf(draft("tee", s).pieces).pages;
  assert.ok(n("XXL") >= n("XS"));
});
