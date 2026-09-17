/**
 * Ported from `../tests/print-file-preflight.test.ts` so the static surface and
 * the Next.js app are held to the same corpus and the same verdicts.
 *
 * `preflightImage` takes name/size/type and the pixel dimensions, so every case
 * here is a plain object — no browser, no real image bytes, no fixtures.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_IMPLIED_DPI,
  PRINT_FILE_SPEC_ID,
  batchPreflightExportFileName,
  buildBatchPreflightExportRecord,
  buildPreflightExportRecord,
  comparePreflightCandidates,
  defaultCompareSize,
  formatBytes,
  impliedDpiForNamedSize,
  isPrintSize,
  listPrintSizes,
  namedSizeInches,
  preflightExportFileName,
  preflightImage,
  summarizeFindings,
} from "./preflight.mjs";

const file = (name, size = 4_000_000, type = "image/jpeg") => ({ name, size, type });
const rulesOf = (result) => result.findings.map((f) => f.rule);

test("passes a correctly sized print master", () => {
  const result = preflightImage(file("harbor-11x14.jpg"), 3300, 4200);
  assert.deepEqual(result.findings, []);
  assert.equal(result.sizeToken, "11x14");
  assert.equal(summarizeFindings(result).passed, true);
});

test("uses the conservative pixel floor when no size is named", () => {
  const result = preflightImage(file("untitled.jpg"), 1200, 900);
  assert.equal(result.findings[0]?.rule, "pixel_floor");
  assert.equal(result.findings[0]?.severity, "blocking");
});

test("reports web exports and low implied DPI", () => {
  // 800x1000 is exactly the 8x10 ratio, so this isolates the two rules under
  // test from the crop check.
  const result = preflightImage(file("web-8x10.jpg"), 800, 1000);
  assert.deepEqual(rulesOf(result), ["web_filename", "implied_dpi"]);
});

test("an off-ratio web export reports the crop finding too", () => {
  // 600x800 is 4.5% off the 11x14 crop, past the 4% tolerance.
  const result = preflightImage(file("web-11x14.jpg"), 600, 800);
  assert.deepEqual(rulesOf(result).sort(), ["implied_dpi", "named_aspect", "web_filename"]);
});

test("does not claim to validate unsupported formats", () => {
  const result = preflightImage(file("scan-11x14.tif", 4_000_000, "image/tiff"), 3300, 4200);
  assert.equal(result.findings[0]?.rule, "format");
});

test("flags a named-size crop mismatch as review, not a warranty fail", () => {
  const result = preflightImage(file("harbor-8x10.jpg"), 3000, 3000);
  assert.equal(result.sizeToken, "8x10");
  const mismatch = result.findings.find((finding) => finding.rule === "named_aspect");
  assert.ok(mismatch);
  assert.equal(mismatch.severity, "degrading");
});

test("blocks files over the 50 MiB ceiling", () => {
  const result = preflightImage(file("harbor-11x14.jpg", 60 * 1024 * 1024), 3300, 4200);
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
  assert.ok(isPrintSize("24x36"));
  assert.ok(!isPrintSize("9x13"));
});

test("a named size is matched in either orientation", () => {
  // A landscape 11x14 is a 14x11 print, and measuring it against portrait
  // inches would report a DPI failure on a file that is fine.
  assert.deepEqual(namedSizeInches("11x14", 4200, 3300), [14, 11]);
  assert.deepEqual(namedSizeInches("11x14", 3300, 4200), [11, 14]);
  assert.deepEqual(preflightImage(file("harbor-11x14.jpg"), 4200, 3300).findings, []);
});

test("defaults the compare size to the most common named token", () => {
  const files = [
    preflightImage(file("a-11x14.jpg"), 3300, 4200),
    preflightImage(file("b-11x14.jpg"), 3300, 4200),
    preflightImage(file("c-8x10.jpg"), 2400, 3000),
  ];
  assert.equal(defaultCompareSize(files), "11x14");
  assert.equal(defaultCompareSize([]), "11x14");
});

test("ranks the higher-DPI master first and names it as the recommendation", () => {
  const printReady = preflightImage(file("harbor-18x24.jpg"), 3600, 4800);
  const webExport = preflightImage(file("web-18x24.jpg"), 900, 1200);
  const comparison = comparePreflightCandidates([printReady, webExport], "18x24");

  assert.equal(comparison.recommendedFileName, "harbor-18x24.jpg");
  assert.equal(comparison.rows[0]?.fileName, "harbor-18x24.jpg");
  assert.equal(comparison.rows[0]?.recommended, true);
  assert.equal(comparison.rows[1]?.meetsDpiFloor, false);
  assert.match(comparison.reason, /harbor-18x24\.jpg/);
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

  assert.equal(webTagged.findings.some((f) => f.rule === "web_filename"), true);
  assert.equal(comparison.rows.find((r) => r.fileName === "web-8x10.jpg")?.meetsDpiFloor, true);
  assert.equal(comparison.rows.find((r) => r.fileName === "phone-8x10.jpg")?.meetsDpiFloor, false);
  assert.equal(comparison.recommendedFileName, null);
  assert.match(comparison.reason, /blocked/i);
  assert.doesNotMatch(comparison.reason, /None of these files meet the 150 DPI floor/);
});

test("a blocked file is never recommended, however many pixels it has", () => {
  // The ranking must not send an artist to a proof on a web export just
  // because it is the sharpest thing in the batch.
  const huge = preflightImage(file("web-16x20.jpg"), 8000, 10000);
  const modest = preflightImage(file("studio-16x20.jpg"), 2400, 3000);
  const comparison = comparePreflightCandidates([huge, modest], "16x20");
  assert.equal(comparison.rows[0]?.fileName, "studio-16x20.jpg");
  assert.equal(comparison.recommendedFileName, "studio-16x20.jpg");
});

test("reports when no file meets the DPI floor at the chosen size", () => {
  const small = preflightImage(file("phone-export.jpg"), 1200, 1600);
  const alsoSmall = preflightImage(file("instagram-square.jpg"), 1080, 1080);
  const comparison = comparePreflightCandidates([small, alsoSmall], "24x36");

  assert.equal(comparison.recommendedFileName, null);
  assert.equal(comparison.rows.every((row) => row.meetsDpiFloor === false), true);
  assert.match(comparison.reason, /None of these files meet the 150 DPI floor at 24x36/);
});

test("a lone passing file is recommended, and still asked to be compared", () => {
  // Upstream behaviour, pinned deliberately: one passing master above the
  // floor is a fine thing to print, so it is recommended — but with nothing to
  // rank it against, the reason asks for a second rather than implying the
  // tool chose it over alternatives.
  const only = preflightImage(file("harbor-11x14.jpg"), 3300, 4200);
  const comparison = comparePreflightCandidates([only], "11x14");
  assert.equal(comparison.recommendedFileName, "harbor-11x14.jpg");
  assert.match(comparison.reason, /Add another master/);
});

test("a lone blocked file is not recommended", () => {
  const only = preflightImage(file("web-11x14.jpg"), 3300, 4200);
  const comparison = comparePreflightCandidates([only], "11x14");
  assert.equal(comparison.recommendedFileName, null);
  assert.match(comparison.reason, /still blocked/);
});

test("an unsupported target size is refused rather than guessed", () => {
  const only = preflightImage(file("harbor-11x14.jpg"), 3300, 4200);
  assert.throws(() => comparePreflightCandidates([only], "9x13"), /Unsupported print size/);
});

test("implied DPI is pixels over inches at the target size", () => {
  assert.equal(Math.round(impliedDpiForNamedSize(3300, 4200, "11x14")), 300);
  assert.ok(impliedDpiForNamedSize(3600, 4800, "18x24") >= MIN_IMPLIED_DPI);
  assert.ok(impliedDpiForNamedSize(3600, 4800, "24x36") < MIN_IMPLIED_DPI);
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
