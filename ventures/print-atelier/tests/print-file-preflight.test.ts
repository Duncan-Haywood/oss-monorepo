import assert from "node:assert/strict";
import test from "node:test";
import {
  PRINT_FILE_SPEC_ID,
  batchPreflightExportFileName,
  buildBatchPreflightExportRecord,
  buildPreflightExportRecord,
  comparePreflightCandidates,
  defaultCompareSize,
  formatBytes,
  impliedDpiForNamedSize,
  listPrintSizes,
  preflightExportFileName,
  preflightImage,
  summarizeFindings,
} from "../src/lib/print-file-preflight.ts";

const file = (name: string, size = 4_000_000, type = "image/jpeg") => ({ name, size, type });

test("passes a correctly sized print master", () => {
  const result = preflightImage(file("harbor-11x14.jpg"), 3300, 4200);
  assert.deepEqual(result.findings, []);
  assert.equal(result.sizeToken, "11x14");
  assert.equal(summarizeFindings(result).passed, true);
});

test("uses the conservative pixel floor when no size is named", () => {
  const result = preflightImage(file("untitled.png", 4_000_000, "image/png"), 1200, 1800);
  assert.equal(result.findings[0]?.rule, "pixel_floor");
  assert.equal(result.findings[0]?.severity, "blocking");
});

test("reports web exports and low implied DPI", () => {
  const result = preflightImage(file("web-8x10.jpg", 4_000_000, "image/jpeg"), 800, 1000);
  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ["web_filename", "implied_dpi"],
  );
});

test("does not claim to validate unsupported formats", () => {
  const result = preflightImage(file("master.tiff", 1_000, "image/tiff"), 4000, 5000);
  assert.equal(result.findings[0]?.rule, "format");
});

test("flags a named-size crop mismatch as review, not a warranty fail", () => {
  const result = preflightImage(file("sunset-8x10.jpg"), 4000, 3000);
  assert.equal(result.sizeToken, "8x10");
  assert.ok(result.findings.some((finding) => finding.rule === "named_aspect"));
  assert.equal(result.findings.find((finding) => finding.rule === "named_aspect")?.severity, "degrading");
});

test("blocks files over the 50 MiB ceiling", () => {
  const result = preflightImage(file("harbor-11x14.jpg", 51 * 1024 * 1024), 3300, 4200);
  assert.equal(result.findings[0]?.rule, "byte_size");
  assert.equal(result.findings[0]?.severity, "blocking");
});

test("builds a dated export record with non-warranty language", () => {
  const result = preflightImage(file("harbor-11x14.jpg"), 3300, 4200);
  const record = buildPreflightExportRecord(result, "2026-08-24T15:56:00.000Z");
  assert.equal(record.spec, PRINT_FILE_SPEC_ID);
  assert.equal(record.generatedAt, "2026-08-24T15:56:00.000Z");
  assert.match(record.disclaimer, /not a print-ready warranty/i);
  assert.equal(record.fileName, "harbor-11x14.jpg");
  assert.equal(preflightExportFileName("Harbor 11x14.jpg"), "Harbor-11x14.jpg-preflight.json");
});

test("formats tiny files in bytes instead of 0.00 MiB", () => {
  assert.equal(formatBytes(69), "69 B");
  assert.equal(formatBytes(4_000_000), "3.8 MiB");
});

test("lists the named print sizes the compare view can target", () => {
  assert.ok(listPrintSizes().includes("11x14"));
  assert.ok(listPrintSizes().includes("18x24"));
});

test("defaults the compare size to the most common named token", () => {
  const files = [
    preflightImage(file("harbor-11x14.jpg"), 3300, 4200),
    preflightImage(file("studio-11x14.png", 3_000_000, "image/png"), 1650, 2100),
    preflightImage(file("poster-18x24.jpg"), 2700, 3600),
  ];
  assert.equal(defaultCompareSize(files), "11x14");
  assert.equal(defaultCompareSize([]), "11x14");
});

test("ranks the higher-DPI master first and names it as the recommendation", () => {
  const printReady = preflightImage(file("harbor-18x24.jpg"), 3600, 4800);
  const webExport = preflightImage(file("web-18x24.jpg"), 900, 1200);
  const comparison = comparePreflightCandidates([webExport, printReady], "18x24");

  assert.equal(comparison.recommendedFileName, "harbor-18x24.jpg");
  assert.equal(comparison.rows[0]?.fileName, "harbor-18x24.jpg");
  assert.equal(comparison.rows[0]?.recommended, true);
  assert.equal(comparison.rows[1]?.fileName, "web-18x24.jpg");
  assert.equal(comparison.rows[1]?.meetsDpiFloor, false);
  assert.match(comparison.reason, /harbor-18x24\.jpg/);
  assert.ok(impliedDpiForNamedSize(3600, 4800, "18x24") >= 150);
});

test("does not pick a winner when two passing files are a DPI tie", () => {
  const left = preflightImage(file("alpha-11x14.jpg"), 3300, 4200);
  const right = preflightImage(file("bravo-11x14.jpg"), 3300, 4200);
  const comparison = comparePreflightCandidates([left, right], "11x14");

  assert.equal(comparison.recommendedFileName, null);
  assert.equal(comparison.rows.every((row) => row.recommended === false), true);
  assert.match(comparison.reason, /too close/i);
});

test("does not call a blocked high-DPI master a DPI-floor miss", () => {
  const webTagged = preflightImage(file("web-8x10.jpg"), 2000, 2500);
  const softCrop = preflightImage(file("phone-8x10.jpg"), 400, 500);
  const comparison = comparePreflightCandidates([webTagged, softCrop], "8x10");

  assert.equal(webTagged.findings.some((finding) => finding.rule === "web_filename"), true);
  assert.equal(comparison.rows.find((row) => row.fileName === "web-8x10.jpg")?.meetsDpiFloor, true);
  assert.equal(comparison.rows.find((row) => row.fileName === "phone-8x10.jpg")?.meetsDpiFloor, false);
  assert.equal(comparison.recommendedFileName, null);
  assert.match(comparison.reason, /blocked/i);
  assert.doesNotMatch(comparison.reason, /None of these files meet the 150 DPI floor/);
});

test("reports when no file meets the DPI floor at the chosen size", () => {
  const small = preflightImage(file("phone-export.jpg"), 1200, 1600);
  const alsoSmall = preflightImage(file("instagram-square.jpg"), 1080, 1080);
  const comparison = comparePreflightCandidates([small, alsoSmall], "24x36");

  assert.equal(comparison.recommendedFileName, null);
  assert.equal(comparison.rows.every((row) => row.meetsDpiFloor === false), true);
  assert.match(comparison.reason, /None of these files meet the 150 DPI floor at 24x36/);
});

test("builds a dated batch export without claiming a print-ready warranty", () => {
  const printReady = preflightImage(file("harbor-18x24.jpg"), 3600, 4800);
  const webExport = preflightImage(file("web-18x24.jpg"), 900, 1200);
  const record = buildBatchPreflightExportRecord(
    [printReady, webExport],
    "18x24",
    "2026-08-25T18:10:00.000Z",
  );

  assert.equal(record.spec, PRINT_FILE_SPEC_ID);
  assert.equal(record.comparison.recommendedFileName, "harbor-18x24.jpg");
  assert.equal(record.files.length, 2);
  assert.match(record.disclaimer, /not a print-ready warranty/i);
  assert.equal(
    batchPreflightExportFileName("18x24", "2026-08-25T18:10:00.000Z"),
    "print-masters-18x24-2026-08-25T18-10-00-000Z-preflight.json",
  );
});
