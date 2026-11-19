import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegister, linesFromText, linesFromPdf, classify, isSubmittalHeading, toCsv, findSections, stripRunningLines, normalizeNumber } from "./engine.mjs";
import { extractPdfLines } from "./pdf-text.mjs";
import { SAMPLE_TEXT } from "./sample.mjs";

const reg = (t) => buildRegister(linesFromText(t));

test("sample book: sections, phases and types", () => {
  const r = reg(SAMPLE_TEXT);
  assert.deepEqual(r.sections.map((s) => [s.number, s.title, s.count]), [
    ["05 50 00", "METAL FABRICATIONS", 6],
    ["08 71 00", "DOOR HARDWARE", 9],
    ["09 91 23", "INTERIOR PAINTING", 3],
  ]);
  const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
  assert.equal(byId["055000-002"].type, "Shop Drawings");
  assert.match(byId["055000-002"].description, /each metal fabrication and its connections\. 1\. Show anchorage/);
  assert.equal(byId["055000-003"].type, "Design Data");
  assert.deepEqual(byId["055000-003"].flags, ["engineer-sealed"]);
  assert.equal(byId["055000-005"].label, "Welding certificates");
  assert.equal(byId["087100-002"].type, "Shop Drawings");
  assert.deepEqual(byId["087100-004"].flags, ["conditional"]);
  assert.equal(byId["087100-007"].phase, "Closeout");
  assert.equal(byId["087100-008"].type, "Closeout Submittals");
  assert.equal(byId["087100-009"].type, "Closeout Submittals"); // extra materials, kept as one row
  assert.equal(byId["099123-001"].flags.includes("sustainability"), true); // VOC content
  assert.equal(byId["099123-003"].type, "Product Data");
  assert.equal(r.summary.byPhase.Action, 10);
  // Mockups under QUALITY ASSURANCE are not a submittal article.
  assert.equal(r.items.some((i) => /Mockups/.test(i.description)), false);
});

test("table of contents lines do not steal a section", () => {
  const r = reg(SAMPLE_TEXT);
  assert.equal(r.sections.find((s) => s.number === "05 50 00").page, 2);
});

test("article number alone on a line (pdftotext layout)", () => {
  const r = reg(SAMPLE_TEXT);
  assert.equal(r.items.find((i) => i.section === "09 91 23").article, "1.1 ACTION SUBMITTALS");
});

const UFGS_LIKE = [
  "SECTION 07 92 00",
  "",
  "JOINT SEALANTS",
  "",
  "PART 1   GENERAL",
  "",
  "1.1   SUBMITTALS",
  "",
  "Items marked \"G\" need Government approval. Submit the following:",
  "",
  "SD-03 Product Data",
  "    Sealants; G, AE",
  "    Primers",
  "    Backing and bond breakers, closed-cell",
  "      polyethylene",
  "SD-04 Samples",
  "    Color charts; G",
  "SD-07 Certificates",
  "    Installer qualifications; S",
  "1.1.1   Coordination",
  "    Not an item, this is prose under a sub-article.",
  "",
  "1.2   QUALITY ASSURANCE",
  "",
  "SECTION 07 92 00  Page 1",
].join("\n");

test("UFGS SD lists: codes, G and reviewer, wrapped items, sub-article stops the list", () => {
  const r = reg(UFGS_LIKE);
  assert.deepEqual(r.items.map((i) => [i.sd, i.label, i.approval, i.reviewer]), [
    ["SD-03", "Sealants", "G", "AE"],
    ["SD-03", "Primers", "", ""],
    ["SD-03", "Backing and bond breakers, closed-cell polyethylene", "", ""],
    ["SD-04", "Color charts", "G", ""],
    ["SD-07", "Installer qualifications; S", "", ""],
  ]);
  assert.equal(r.items[0].phase, "Action");
  assert.equal(r.items[4].phase, "Informational");
});

test("a wrapped cross-reference in prose is not a section start", () => {
  const t = [
    "SECTION 07 27 36",
    "SPRAY FOAM AIR BARRIERS",
    "PART 1 GENERAL",
    "1.1 SUMMARY",
    "Coordinate the requirements of Section 07 27 10 BUILDING AIR BARRIER SYSTEM, and",
    "SECTION 07 27 26 FLUID-APPLIED MEMBRANE AIR BARRIERS, and other building envelope sections",
    "1.2 SUBMITTALS",
    "SD-03 Product Data",
    "    Sealants",
  ].join("\n");
  const r = reg(t);
  assert.deepEqual(r.sections.map((s) => s.number), ["07 27 36"]);
  assert.equal(r.items.length, 1);
});

test("section numbers: compact, spaced, dotted and UFGS suffixed", () => {
  const m = (s) => normalizeNumber(s.match(/(\d{2})\s?(\d{2})\s?(\d{2})(?:\.(\d{2}))?(?:\s(\d{2}))?/));
  assert.equal(m("099123"), "09 91 23");
  assert.equal(m("01 33 23.33"), "01 33 23.33");
  assert.equal(m("01 45 00.00 20"), "01 45 00.00 20");
});

test("submittal headings vs procedure headings", () => {
  for (const h of ["ACTION SUBMITTALS", "INFORMATIONAL SUBMITTALS", "CLOSEOUT SUBMITTALS", "MAINTENANCE MATERIAL SUBMITTALS", "SUBMITTALS", "SUSTAINABILITY SUBMITTALS"]) assert.equal(isSubmittalHeading(h), true, h);
  for (const h of ["SUBMITTAL PROCEDURES", "SUBMITTAL REVIEW AND APPROVAL", "QUANTITY OF SUBMITTALS", "SUBMITTAL SCHEDULING", "DISAPPROVED SUBMITTALS", "QUALITY ASSURANCE"]) assert.equal(isSubmittalHeading(h), false, h);
});

test("classify common SectionFormat labels", () => {
  const cases = { "Product Data": "SD-03", "Shop Drawings": "SD-02", "Coordination Drawings": "SD-02", "Samples for Initial Selection": "SD-04", "Delegated-Design Submittal": "SD-05", "Qualification Data": "SD-07", "Welding certificates": "SD-07", "Field quality-control reports": "SD-06", "Product Test Reports": "SD-06", "Operation and Maintenance Data": "SD-10", "Maintenance Data": "SD-10", "Warranty": "SD-11", "Record Drawings": "SD-11", "Manufacturer's Instructions": "SD-08", "Sustainable design submittals": "" };
  for (const [label, sd] of Object.entries(cases)) assert.equal(classify(label), sd, label);
});

test("running headers and page footers are stripped", () => {
  const pages = [];
  const body = (i) => ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet"].map((w) => `${w} paragraph on page ${i}.`.replace(/ \d+/, i % 2 ? " one" : " two") + "x".repeat(i));
  for (let i = 1; i <= 6; i++) pages.push(["ACME CLINIC EXPANSION", ...body(i), `INTERIOR PAINTING 099123 - ${i}`, "Page 3 of 9"].join("\n"));
  const out = stripRunningLines(linesFromText(pages.join("\f"))).map((l) => l.text).filter(Boolean);
  assert.deepEqual(out, [1, 2, 3, 4, 5, 6].flatMap(body));
});

test("the copy of a section with the most body wins", () => {
  const t = ["SECTION 09 91 23 - INTERIOR PAINTING", "SECTION 09 91 23 - INTERIOR PAINTING", "PART 1 - GENERAL", "1.1 ACTION SUBMITTALS", "A. Product Data: For each product."].join("\n");
  const s = findSections(stripRunningLines(linesFromText(t)));
  assert.equal(s.length, 1);
  assert.equal(s[0].body.length, 3);
});

test("CSV: header, quoting and a formula guard", () => {
  const r = reg(["SECTION 09 91 23 - PAINTING", "PART 1", "1.1 ACTION SUBMITTALS", 'A. Product Data: "Brand", 2 coats.', "B. =HYPERLINK(1)"].join("\n"));
  const csv = toCsv(r);
  assert.ok(csv.startsWith("\ufeffSubmittal No.,Spec Section"));
  assert.match(csv, /"Product Data: ""Brand"", 2 coats\."/);
  assert.match(csv, /,'=HYPERLINK\(1\),/);
});

test("no sections: a warning, not a crash", () => {
  const r = reg("just a letter\nwith no spec sections");
  assert.equal(r.items.length, 0);
  assert.match(r.warnings[0], /No "SECTION/);
});

// A one-page PDF drawn the way Chromium/Skia draw text: a y-down CTM and a
// y-down text matrix. Lines must still read top to bottom.
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

test("PDF text: y-down CTM and Tm read top to bottom", async () => {
  const content = "1 0 0 -1 0 792 cm BT /F1 10 Tf 1 0 0 -1 72 72 Tm (SECTION 09 91 23 - PAINTING) Tj 1 0 0 -1 72 90 Tm (PART 1) Tj 1 0 0 -1 72 108 Tm (1.1 ACTION SUBMITTALS) Tj 1 0 0 -1 72 126 Tm (A. Product Data: For each product.) Tj ET";
  const { pages } = await extractPdfLines(tinyPdf(content), async () => null);
  const lines = linesFromPdf(pages).map((l) => l.text).filter(Boolean);
  assert.equal(lines[0], "SECTION 09 91 23 - PAINTING");
  const r = buildRegister(linesFromPdf(pages));
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].type, "Product Data");
});

test("PDF text: ordinary y-up page", async () => {
  const content = "BT /F1 10 Tf 72 720 Td (SECTION 09 91 23 - PAINTING) Tj 0 -18 Td (PART 1) Tj 0 -18 Td (1.1 ACTION SUBMITTALS) Tj 0 -18 Td (A. Samples: For each color.) Tj ET";
  const { pages } = await extractPdfLines(tinyPdf(content), async () => null);
  const r = buildRegister(linesFromPdf(pages));
  assert.equal(r.items[0].type, "Samples");
});
