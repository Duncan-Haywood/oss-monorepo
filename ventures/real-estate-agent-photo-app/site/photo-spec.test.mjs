/**
 * Ported from `../research/src/lib/photo-spec.test.ts`, which was itself ported
 * from `portfolio/pipeline/probes/mls-photo-spec/tests/test_check.py`, so all
 * three implementations are held to the same fixture corpus and the same
 * findings. Synthetic PNG/JPEG bytes only — no real listing photos needed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

import {
  SPEC_DATE,
  SPEC_ID,
  UNIMPLEMENTED_RULES,
  buildReshootPlan,
  checkBatch,
  checkPhoto,
  createEvidenceReport,
  formatReshootPlan,
  isListingPhoto,
  readImageHeader,
} from "./photo-spec.mjs";

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function crc32Fallback(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(tag, data) {
  const tagBuf = Buffer.from(tag, "ascii");
  const payload = Buffer.concat([tagBuf, data]);
  const crc = zlib.crc32 ? zlib.crc32(payload) : crc32Fallback(payload);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([u32be(data.length), tagBuf, data, crcBuf]);
}

function pngBytes(width, height) {
  const ihdr = Buffer.concat([u32be(width), u32be(height), Buffer.from([8, 2, 0, 0, 0])]);
  const raw = Buffer.alloc((1 + 3 * width) * height, 80);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function jpegBytes(width, height) {
  const jfif = Buffer.concat([
    Buffer.from("JFIF\x00"),
    Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
  ]);
  const sofHeader = Buffer.alloc(6);
  sofHeader.writeUInt8(8, 0);
  sofHeader.writeUInt16BE(height, 1);
  sofHeader.writeUInt16BE(width, 3);
  sofHeader.writeUInt8(3, 5);
  const sof = Buffer.concat([sofHeader, Buffer.from([0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00])]);
  const len16 = (n) => {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(n, 0);
    return b;
  };
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe0]),
    len16(jfif.length + 2),
    jfif,
    Buffer.from([0xff, 0xc0]),
    len16(sof.length + 2),
    sof,
    Buffer.from([0xff, 0xd9]),
  ]);
}

function fixtures() {
  return [
    { name: "living-1024x768.png", data: pngBytes(1024, 768) },
    { name: "kitchen-1200x800.jpg", data: jpegBytes(1200, 800) },
    { name: "too-small-64x48.png", data: pngBytes(64, 48) },
    { name: "wide-banner-1600x400.png", data: pngBytes(1600, 400) },
    { name: "agent-logo-1200x800.png", data: pngBytes(1200, 800) },
    { name: "living-staged.png", data: pngBytes(1024, 768) },
  ];
}

const byName = (reports) => new Map(reports.map((r) => [r.info.name, r]));
const rulesOf = (report) => report.findings.map((f) => f.rule);

test("passing photos have no findings", () => {
  const reports = byName(checkBatch(fixtures()));
  assert.deepEqual(reports.get("living-1024x768.png").findings, []);
  assert.deepEqual(reports.get("kitchen-1200x800.jpg").findings, []);
});

test("long edge / aspect / branding / staging each fire exactly once", () => {
  const reports = byName(checkBatch(fixtures()));
  assert.deepEqual(rulesOf(reports.get("too-small-64x48.png")), ["long_edge"]);
  assert.deepEqual(rulesOf(reports.get("wide-banner-1600x400.png")), ["aspect"]);
  assert.deepEqual(rulesOf(reports.get("agent-logo-1200x800.png")), ["branding_filename"]);
  assert.deepEqual(rulesOf(reports.get("living-staged.png")), ["staging_pair"]);
});

test("severities are graded, not uniform", () => {
  const reports = byName(checkBatch(fixtures()));
  assert.equal(reports.get("too-small-64x48.png").findings[0].severity, "blocking");
  // A non-standard crop is still uploadable; it just galleries badly. Grading
  // it the same as an under-resolution file would make the blocking count
  // useless as "what stops delivery".
  assert.equal(reports.get("wide-banner-1600x400.png").findings[0].severity, "degrading");
});

test("non-photo files are excluded rather than reported as broken", () => {
  const files = [...fixtures(), { name: "notes.txt", data: new TextEncoder().encode("not a photo\n") }];
  const names = new Set(checkBatch(files).map((r) => r.info.name));
  assert.ok(!names.has("notes.txt"));
  assert.equal(names.size, 6);
});

test("a staged photo with its original sibling passes", () => {
  const reports = byName(checkBatch([
    { name: "living.png", data: pngBytes(1024, 768) },
    { name: "living-staged.png", data: pngBytes(1024, 768) },
  ]));
  assert.deepEqual(reports.get("living-staged.png").findings, []);
  assert.deepEqual(reports.get("living.png").findings, []);
});

test("a staged photo pairs with a -original sibling too", () => {
  const reports = byName(checkBatch([
    { name: "living-original.png", data: pngBytes(1024, 768) },
    { name: "living-staged.png", data: pngBytes(1024, 768) },
  ]));
  assert.deepEqual(reports.get("living-staged.png").findings, []);
});

test("jpeg header roundtrip", () => {
  const report = checkPhoto("room.jpg", jpegBytes(1600, 1200));
  assert.equal(report.info.format, "jpeg");
  assert.equal(report.info.width, 1600);
  assert.equal(report.info.height, 1200);
  assert.deepEqual(report.findings, []);
});

test("png header roundtrip", () => {
  const info = readImageHeader("room.png", pngBytes(1024, 768));
  assert.equal(info.format, "png");
  assert.equal(info.width, 1024);
  assert.equal(info.height, 768);
  assert.equal(info.unreadable, null);
});

test("an unreadable file reports only that, with no invented downstream findings", () => {
  const report = checkPhoto("mystery.png", new TextEncoder().encode("not an image"));
  assert.equal(report.info.unreadable, "unrecognised-magic");
  assert.deepEqual(rulesOf(report), ["unreadable"]);
});

test("a truncated png header is unreadable rather than zero-sized", () => {
  const truncated = pngBytes(1024, 768).subarray(0, 20);
  const info = readImageHeader("cut.png", truncated);
  assert.equal(info.unreadable, "png-header-truncated");
  assert.equal(info.width, null);
});

test("a jpeg with no SOF segment is unreadable", () => {
  const report = checkPhoto("noframe.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.equal(report.info.unreadable, "jpeg-sof-missing");
  assert.deepEqual(rulesOf(report), ["unreadable"]);
});

test("isListingPhoto accepts the three delivery suffixes, case-insensitively", () => {
  for (const name of ["a.jpg", "a.JPG", "a.jpeg", "a.PNG"]) assert.ok(isListingPhoto(name), name);
  for (const name of ["a.tif", "a.heic", "a.zip", "a"]) assert.ok(!isListingPhoto(name), name);
});

test("the reshoot plan maps findings to the highest-effort action", () => {
  const plan = buildReshootPlan(checkBatch(fixtures()));
  const items = new Map(plan.items.map((item) => [item.fileName, item]));

  assert.equal(plan.recaptureCount, 1);
  assert.equal(plan.deskFixCount, 3);
  assert.equal(plan.blockingCount, 3);
  assert.ok(!items.has("living-1024x768.png"), "passing photos stay off the list");
  assert.equal(items.get("too-small-64x48.png").kind, "recapture");
  assert.equal(items.get("wide-banner-1600x400.png").kind, "reexport");
  assert.equal(items.get("agent-logo-1200x800.png").kind, "rename");
  assert.equal(items.get("living-staged.png").kind, "pair");
});

test("a clean batch has an empty plan that still discloses what was not checked", () => {
  const plan = buildReshootPlan(checkBatch([
    { name: "living-1024x768.png", data: pngBytes(1024, 768) },
    { name: "kitchen-1200x800.jpg", data: jpegBytes(1200, 800) },
  ]));
  assert.equal(plan.items.length, 0);
  const text = formatReshootPlan(plan);
  assert.match(text, /nothing to fix/);
  assert.match(text, /visual_watermark/);
});

test("the copyable plan names the files and carries the disclaimer", () => {
  const text = formatReshootPlan(buildReshootPlan(checkBatch(fixtures())));
  assert.match(text, /too-small-64x48\.png/);
  assert.match(text, /agent-logo-1200x800\.png/);
  assert.match(text, /Go back to the property/);
  assert.match(text, /Fix at the desk/);
  assert.match(text, /not a warranty/);
});

test("the evidence report names the spec and the unimplemented rules", () => {
  const reports = checkBatch([{ name: "kitchen-1600x1200.png", data: pngBytes(1600, 1200) }]);
  const evidence = createEvidenceReport(reports, ["notes.txt"], "2026-08-26T20:55:00.000Z");
  assert.equal(evidence.reportType, "listing-lens-photo-preflight");
  assert.equal(evidence.specId, SPEC_ID);
  assert.equal(evidence.specDate, SPEC_DATE);
  assert.equal(evidence.checkedPhotos, 1);
  assert.deepEqual(evidence.skippedFiles, ["notes.txt"]);
  assert.deepEqual([...evidence.unimplementedRules], [...UNIMPLEMENTED_RULES]);
  assert.equal(evidence.photos[0].info.name, "kitchen-1600x1200.png");
});
