import assert from "node:assert/strict";
import test from "node:test";
import { preflightImage } from "../src/lib/print-file-preflight.ts";

const file = (name: string, size = 4_000_000, type = "image/jpeg") => ({ name, size, type });

test("passes a correctly sized print master", () => {
  const result = preflightImage(file("harbor-11x14.jpg"), 3300, 4200);
  assert.deepEqual(result.findings, []);
  assert.equal(result.sizeToken, "11x14");
});

test("uses the conservative pixel floor when no size is named", () => {
  const result = preflightImage(file("untitled.png", 4_000_000, "image/png"), 1200, 1800);
  assert.equal(result.findings[0]?.rule, "pixel_floor");
  assert.equal(result.findings[0]?.severity, "blocking");
});

test("reports web exports and low implied DPI", () => {
  const result = preflightImage(file("web-8x10.jpg", 4_000_000, "image/jpeg"), 800, 1000);
  assert.deepEqual(result.findings.map((finding) => finding.rule), ["web_filename", "implied_dpi"]);
});

test("does not claim to validate unsupported formats", () => {
  const result = preflightImage(file("master.tiff", 1_000, "image/tiff"), 4000, 5000);
  assert.equal(result.findings[0]?.rule, "format");
});
