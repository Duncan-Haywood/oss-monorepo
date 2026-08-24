import assert from "node:assert/strict";
import test from "node:test";
import {
  PRINT_FILE_SPEC_ID,
  buildPreflightExportRecord,
  formatBytes,
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
