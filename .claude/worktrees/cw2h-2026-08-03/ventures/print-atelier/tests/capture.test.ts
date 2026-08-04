import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceCaptureStage,
  createCaptureSessionFromFile,
  formatFileSize,
  parseCaptureSessions,
  serializeCaptureSessions,
} from "../src/lib/capture.ts";

test("createCaptureSessionFromFile captures upload metadata for Phase 2 persistence", () => {
  const file = new File(["test"], "autumn-canopy.jpg", { type: "image/jpeg" });
  const session = createCaptureSessionFromFile(file);

  assert.match(session.sessionId, /^cap_/);
  assert.equal(session.fileName, "autumn-canopy.jpg");
  assert.equal(session.mimeType, "image/jpeg");
  assert.equal(session.stage, "uploaded");
  assert.equal(session.titleSuggestion, "autumn canopy");
});

test("serialize and parse capture sessions round-trip safely", () => {
  const file = new File(["x"], "test.png", { type: "image/png" });
  const session = advanceCaptureStage(createCaptureSessionFromFile(file), "mockups");
  const raw = serializeCaptureSessions([session]);
  const parsed = parseCaptureSessions(raw);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.stage, "mockups");
  assert.equal(parseCaptureSessions("not-json").length, 0);
});

test("formatFileSize renders human-readable sizes", () => {
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(2048), "2.0 KB");
  assert.equal(formatFileSize(2 * 1024 * 1024), "2.0 MB");
});
