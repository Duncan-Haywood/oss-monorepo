import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync, constants as Z } from "node:zlib";
import { extractPdfLines } from "./pdf-text.mjs";
import { sampleDrawingPdf } from "./sample-drawing.mjs";
import { readDrawing, readGeneralTolerances, readTitleBlock, readNotes, revRank, faiLink, faiStarter, drawingCsv, flatten } from "./drawing.mjs";
import { checkFai } from "./fai.mjs";

const inflate = async (b) => { try { return new Uint8Array(inflateSync(b, { finishFlush: Z.Z_SYNC_FLUSH })); } catch { return null; } };
const sample = async () => readDrawing(await extractPdfLines(sampleDrawingPdf(), inflate));

// A line list by hand: [y, [x, text], [x, text]...], top of the page first.
const page = (...rows) => ({ lines: rows.map(([y, ...items]) => ({ key: -y, items: items.map(([x, text]) => ({ x, text, xEnd: x + text.length * 5 })) })) });

test("sample drawing: title block read from the cell under each label", async () => {
  const d = await sample();
  assert.equal(d.fields.partNumber.value, "EX-20417");
  assert.equal(d.fields.revision.value, "C");
  assert.equal(d.fields.title.value, "MOUNTING BRACKET, SENSOR");
  assert.equal(d.fields.material.value, "AL 6061-T651 PER AMS-QQ-A-250/11");
  assert.equal(d.fields.finish.value, "SEE NOTE 3");
  assert.equal(d.fields.scale.value, "2:1");
  assert.equal(d.fields.sheet.value, "1 OF 1");
  assert.equal(d.fields.cage.value, "0EX00");
  assert.equal(d.fields.drawingNumber, undefined, "no drawing number on the sample, so none is invented");
});

test("sample drawing: the revision table's latest row disagrees with the title block, and that becomes a question", async () => {
  const d = await sample();
  assert.deepEqual(d.revisionTable.rows, ["A", "B", "C", "D"]);
  assert.equal(d.revisionTable.latest, "D");
  assert.ok(d.questions.some((q) => /revision C but the revision table lists D/.test(q)));
});

test("sample drawing: general tolerances, units and standard", async () => {
  const d = await sample();
  assert.deepEqual(d.general.linear, { 2: 0.01, 3: 0.005 });
  assert.equal(d.general.angular, 0.5);
  assert.equal(d.general.units, "inch");
  assert.equal(d.general.standard, "ASME Y14.5-2018");
});

test("sample drawing: numbered notes with continuation lines, tags, and the skipped number", async () => {
  const d = await sample();
  assert.deepEqual(d.notes.map((n) => n.n), [1, 2, 3, 5]);
  assert.equal(d.notes[1].text, "MATERIAL CERTS REQUIRED WITH EACH SHIPMENT, TRACEABLE TO HEAT LOT.");
  assert.equal(d.notes[2].text, "ANODIZE PER MIL-PRF-8625, TYPE II, CLASS 2, BLACK. MASK BORE Ø.5000.");
  assert.deepEqual(d.notes.map((n) => n.tags), [["deburr"], ["certs"], ["finish"], ["marking"]]);
  assert.deepEqual(d.notesSkipped, [4]);
  assert.ok(d.questions.some((q) => /skip number 4/.test(q)));
});

test("sample drawing: dimension text in the views, and nothing from the title block, notes or tolerance block", async () => {
  const d = await sample();
  assert.deepEqual(d.dimensions.map((x) => x.text).sort(), ["(1.250)", ".375 +.002/-.000", "1/4-20 UNC-2B", "2.00", "2X Ø.201 THRU", "4.000", "45°", "Ø.5000 ±.0005"].sort());
  assert.equal(d.tightest, 0.0005);
  assert.deepEqual(d.specs.map((s) => s.spec).sort(), ["AMS-QQ-A-250", "ASME Y14.5", "MIL-PRF-8625", "MIL-STD-130"].sort());
});

test("hand-over to the first article checker: its reader takes the starter table and the general tolerances", async () => {
  const d = await sample();
  const link = faiLink(d);
  const [path, hash] = link.split("#");
  const q = new URLSearchParams(path.split("?")[1]);
  assert.equal(q.get("g2"), "0.01");
  assert.equal(q.get("g3"), "0.005");
  assert.equal(q.get("ga"), "0.5");
  assert.ok(hash.startsWith("chars="));
  const table = decodeURIComponent(hash.slice(6));
  assert.equal(table, faiStarter(d));
  const r = checkFai(table, { general: { linear: { 2: 0.01, 3: 0.005 }, angular: 0.5 } });
  const by = Object.fromEntries(r.rows.map((row) => [row.requirement, row.req]));
  assert.equal(by["4.000"].kind, "variable");
  assert.ok(Math.abs(by["4.000"].lower - 3.995) < 1e-9 && Math.abs(by["4.000"].upper - 4.005) < 1e-9, "bare 3-place dimension takes ±.005");
  assert.ok(Math.abs(by["2.00"].upper - 2.01) < 1e-9, "bare 2-place dimension takes ±.01");
  assert.ok(Math.abs(by["Ø.5000 ±.0005"].upper - 0.5005) < 1e-9);
  assert.equal(by["1/4-20 UNC-2B"].kind, "attribute");
  assert.equal(by["(1.250)"].kind, "reference");
  assert.equal(r.rows.length, d.dimensions.length + d.notes.length);
});

test("general tolerance block: places written several ways, minutes on angles, fractions, ISO 2768, mm", () => {
  const g = readGeneralTolerances("UNLESS OTHERWISE SPECIFIED\nX.X = ±0.1\nX.XX = ± 0.05\n3 PL ±.005\nANGULAR ±0°30'\nFRACTIONS ±1/64\nUNITS: MM\nISO 2768-mK");
  assert.deepEqual(g.linear, { 1: 0.1, 2: 0.05, 3: 0.005 });
  assert.equal(g.angular, 0.5);
  assert.equal(g.fractional.text, "±1/64");
  assert.equal(g.iso2768, "mK");
  assert.equal(g.units, "mm");
  assert.equal(g.found, true);
  assert.equal(readGeneralTolerances("PART NO 1234 REV A").found, false);
  assert.deepEqual(readGeneralTolerances(".XX +/- .010").linear, { 2: 0.01 });
});

test("title block: value on the label's own text, or the next piece on its line; a label is never a value", () => {
  const lines = flatten([page(
    [100, [10, "PART NO: AB-100"], [200, "REV"], [230, "B"]],
    [90, [10, "MATERIAL"], [200, "SCALE"]],
    [80, [10, "DRAWN"], [200, "1:2"]],
  )]);
  const { fields } = readTitleBlock(lines);
  assert.equal(fields.partNumber.value, "AB-100");
  assert.equal(fields.revision.value, "B");
  assert.equal(fields.scale.value, "1:2");
  assert.equal(fields.material, undefined, "DRAWN under MATERIAL is a label, not a material");
});

test("title block: an implausible value is not taken (a REV label over a date)", () => {
  const { fields } = readTitleBlock(flatten([page([100, [10, "REV"]], [90, [10, "03/02/2026"]])]));
  assert.equal(fields.revision, undefined);
});

test("notes: a stray numbered line outside the notes column is not a note; numbering restarts are dropped", () => {
  const lines = flatten([page(
    [200, [10, "NOTES:"]],
    [190, [10, "1. DEBURR."], [600, "1. NOT A NOTE"]],
    [180, [10, "2. HEAT TREAT TO 28-32 HRC."]],
    [170, [10, "1. ANOTHER LIST"]],
  )]);
  const n = readNotes(lines);
  assert.deepEqual(n.notes.map((x) => x.text), ["DEBURR.", "HEAT TREAT TO 28-32 HRC."]);
  assert.deepEqual(n.notes[1].tags, ["heat"]);
});

test("notes: a long continuation reads the same as cleaning after every line (the old quadratic path)", () => {
  // Pins the 2026-11-27 perf change: continuation lines are joined raw and
  // cleaned once. Odd spacing on purpose, so a missed collapse would show.
  const rows = [[5000, [10, "NOTES:"]], [4990, [10, "1.  FIRST  NOTE "]]];
  const parts = [];
  for (let i = 0; i < 200; i++) { const t = `  PLATE  ${i}   THICK  AREAS ${i % 3 ? "" : " "}`; parts.push(t); rows.push([4980 - i * 10, [24, t]]); }
  rows.push([4980 - 200 * 10, [10, "2. LAST."]]);
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const lineText = (t) => t.replace(/\s+$/, "");
  let expected = clean("FIRST  NOTE ");
  for (const t of parts) expected = clean(`${expected} ${lineText(t)}`);
  const n = readNotes(flatten([page(...rows)]));
  assert.deepEqual(n.notes.map((x) => x.text), [expected, "LAST."]);
});

test("revision ranking: letters, double letters and numbers", () => {
  assert.ok(revRank("D") > revRank("C"));
  assert.ok(revRank("AA") > revRank("Z"));
  assert.ok(revRank("12") > revRank("3"));
  assert.equal(revRank("?"), -1);
});

test("a PDF with no text layer says so and asks for a CAD export", () => {
  const d = readDrawing({ pages: [{ lines: [] }], flags: { pageCount: 1 } });
  assert.equal(d.readable, false);
  assert.match(d.questions[0], /no readable text/);
});

test("missing pieces become questions: part number, revision, material, tolerance block, units", () => {
  const d = readDrawing({ pages: [page([100, [10, "BRACKET"]], [80, [10, "2.500"]])] });
  const all = d.questions.join("\n");
  for (const re of [/part number/, /Which revision/, /What material/, /general tolerance block/, /inches or millimetres/]) assert.match(all, re);
});

test("markings: a distribution statement other than A and export control become questions", () => {
  const d = readDrawing({ pages: [page([100, [10, "DISTRIBUTION STATEMENT D. AUTHORIZED TO DOD AND US DOD CONTRACTORS ONLY"]], [90, [10, "WARNING - THIS DOCUMENT CONTAINS TECHNICAL DATA WHOSE EXPORT IS RESTRICTED BY THE ITAR"]])] });
  assert.ok(d.questions.some((q) => /distribution statement D/.test(q)));
  assert.ok(d.questions.some((q) => /export-control/.test(q)));
  const a = readDrawing({ pages: [page([100, [10, "DISTRIBUTION STATEMENT A. APPROVED FOR PUBLIC RELEASE"]])] });
  assert.ok(!a.questions.some((q) => /distribution statement/.test(q)));
});

test("CSV: formula-looking cells are neutralised and every title block field has a row", async () => {
  const d = await sample();
  d.notes.push({ n: 9, text: "=HYPERLINK(\"x\")", tags: [] });
  const csv = drawingCsv(d);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  for (const f of ["Part number", "Drawing number", "Revision", "Material", "Finish", "CAGE code"]) assert.match(csv, new RegExp(`Title block,${f},`));
  assert.match(csv, /Title block,Drawing number,not found/);
});
