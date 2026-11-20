import { test } from "node:test";
import assert from "node:assert/strict";
import { readRuns } from "./read.mjs";
import { samplePdf } from "./sample.mjs";
import { indexSet, checkSet, compareSets, parseId, canonicalId, compareIds, indexCsv, compareCsv, pagePhrases } from "./engine.mjs";

const read = async (issue) => indexSet((await readRuns(samplePdf(issue))).pages);

test("sheet IDs in the spellings offices use", () => {
  for (const [t, c] of [["A-101", "A101"], ["A101", "A101"], ["A 101", "A101"], ["A1.01", "A1.01"], ["S-100-A", "S100A"], ["ASK - 001", "ASK001"], ["_S100", "S100"], ["M.002", "M002"], ["FP-101", "FP101"]]) {
    const p = parseId(t);
    assert.ok(p, t);
    assert.equal(p.canonical, c, t);
  }
  for (const t of ["SECTION", "1/4\" = 1'-0\"", "12.11.2014", "N2806 Walden Ln", "Level 1"]) assert.equal(parseId(t), null, t);
  assert.equal(parseId("S-201").discipline, "Structural");
  assert.equal(parseId("S-201").sheetType, "Elevations");
  assert.equal(parseId("A-501").sheetType, "Details");
  assert.equal(canonicalId("a-101"), canonicalId("A101"));
});

test("NCS binding order: discipline order, then number", () => {
  const ids = ["A-201", "S-101", "G-001", "A-101", "M-001", "C-100", "A-101A"];
  assert.deepEqual([...ids].sort(compareIds), ["G-001", "C-100", "S-101", "A-101", "A-101A", "A-201", "M-001"]);
});

test("reads every sheet number and title of the sample set, not the callouts", async () => {
  const ix = await read(1);
  assert.deepEqual(ix.sheets.map((s) => s.number), ["G-001", "A-101", "A-201", "A-301", "A-501"]);
  assert.deepEqual(ix.sheets.map((s) => s.title), ["COVER SHEET AND DRAWING INDEX", "FIRST FLOOR PLAN", "EXTERIOR ELEVATIONS", "BUILDING SECTIONS", "DETAILS"]);
  assert.ok(ix.sheets.every((s) => s.found === "title-block"));
  assert.equal(ix.drawingIndex.page, 1);
  assert.equal(ix.drawingIndex.rows.length, 5);
  assert.deepEqual(checkSet(ix), []);
});

test("set check catches a stale cover sheet index", async () => {
  const f = checkSet(await read(2));
  assert.deepEqual(f.map((x) => x.kind).sort(), ["index-missing", "index-unlisted"]);
  assert.match(f.find((x) => x.kind === "index-missing").message, /A-501/);
  assert.match(f.find((x) => x.kind === "index-unlisted").message, /A-502/);
});

test("set check: duplicates, missing numbers and order within a discipline", () => {
  const ix = { pageCount: 4, drawingIndex: null, sheets: [
    { page: 1, number: "A-102", canonical: "A102", textPhrases: 9 },
    { page: 2, number: "A-101", canonical: "A101", textPhrases: 9 },
    { page: 3, number: "A-101", canonical: "A101", textPhrases: 9 },
    { page: 4, number: "", canonical: "", textPhrases: 0 },
  ] };
  const kinds = checkSet(ix).map((x) => x.kind).sort();
  assert.deepEqual(kinds, ["duplicate", "no-number", "order"]);
});

test("comparing two issues: added, removed, retitled, notes changed, dates ignored", async () => {
  const rows = compareSets(await read(1), await read(2));
  const by = Object.fromEntries(rows.map((r) => [r.number, r]));
  assert.equal(by["A-502"].status, "added");
  assert.equal(by["A-501"].status, "removed");
  assert.equal(by["A-201"].status, "retitled");
  assert.equal(by["A-101"].status, "text changed");
  assert.deepEqual(by["A-101"].added.sort(), ["add blocking for grab bars", 'typical stud wall 2x6 @ 24" o.c.']);
  assert.deepEqual(by["A-101"].removed, ['typical stud wall 2x6 @ 16" o.c.']);
  assert.equal(by["A-301"].status, "text changed"); // the callout now cites A-502
  assert.equal(by["G-001"].status, "same text"); // the issue date changed, nothing else
});

test("CSV output: header, one row per sheet, formula-looking cells defused", async () => {
  const ix = await read(1);
  const csv = indexCsv(ix).trim().split("\r\n");
  assert.equal(csv.length, 6);
  assert.match(csv[0], /^Page,File,Sheet number,Sheet title/);
  const c = compareCsv([{ number: "A-1", status: "added", oldTitle: "", newTitle: "=HYPERLINK()", oldPage: "", newPage: 1, added: [], removed: [] }]);
  assert.match(c, /"'=HYPERLINK\(\)"/);
});

test("rotated sheets (text drawn sideways on a portrait page) read upright", () => {
  // A landscape sheet drawn on a portrait page: text angle 90, title block
  // at the top right of the PDF page, which is the lower right as read.
  const runs = [
    { text: "A-101", x: 560, y: 1150, size: 30, width: 80, angle: 90, exact: true },
    { text: "FLOOR PLAN", x: 520, y: 1050, size: 14, width: 90, angle: 90, exact: true },
    { text: "A-301", x: 100, y: 300, size: 7, width: 20, angle: 90, exact: true },
  ];
  const pp = pagePhrases({ runs, box: [0, 0, 612, 1224] });
  const num = pp.phrases.find((p) => p.text === "A-101");
  assert.ok(num.u > 0.85 && num.v > 0.85, `${num.u} ${num.v}`);
  const ix = indexSet([{ runs, box: [0, 0, 612, 1224] }]);
  assert.equal(ix.sheets[0].number, "A-101");
  assert.equal(ix.sheets[0].title, "FLOOR PLAN");
});

test("text after inline images is still read (binary data holding '(' and 'EI')", async () => {
  const { textRuns } = await import("./pdf-text.mjs");
  const bin = String.fromCharCode(40, 69, 73, 0, 255, 40, 41, 69, 73, 10, 7, 9); // "(EI" ... 12 bytes
  const content = `q BI /W 4 /H 3 /BPC 8 /CS /G ID ${bin} EI Q\nq BI /W 2 /H 2 /F /AHx ID 0a0b0c0d> EI Q\nBT /F1 12 Tf 1 0 0 1 50 50 Tm (A-401) Tj ET`;
  const runs = textRuns(content, new Map());
  assert.deepEqual(runs.map((r) => r.text), ["A-401"]);
});
