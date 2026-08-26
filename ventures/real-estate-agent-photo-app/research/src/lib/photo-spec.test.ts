/**
 * photo-spec.test.ts — `npm test` (tsx, no test framework dependency).
 *
 * Ported from `portfolio/pipeline/probes/mls-photo-spec/tests/test_check.py`
 * so the browser tool's TS port and the Python probe agree on the same
 * fixture corpus and the same findings. Synthetic PNG/JPEG bytes only —
 * no real listing photos needed.
 */

import zlib from "node:zlib";

import { SPEC_DATE, SPEC_ID, UNIMPLEMENTED_RULES, buildReshootPlan, checkBatch, checkPhoto, createEvidenceReport, formatReshootPlan } from "./photo-spec";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${message}: expected ${e}, got ${a}`);
}

function u32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function pngChunk(tag: string, data: Buffer): Buffer {
  const tagBuf = Buffer.from(tag, "ascii");
  const crc = zlib.crc32 ? zlib.crc32(Buffer.concat([tagBuf, data])) : crc32Fallback(Buffer.concat([tagBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([u32be(data.length), tagBuf, data, crcBuf]);
}

// Node's zlib.crc32 is only available from Node 21+; fall back to a small
// table-free implementation if it's missing. The PNG parser here only reads
// IHDR, so an invalid CRC would still be accepted by our code under test —
// this is just to keep fixture bytes well-formed.
function crc32Fallback(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngBytes(width: number, height: number): Buffer {
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

function jpegBytes(width: number, height: number): Buffer {
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
  const len16 = (n: number) => {
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

function fixtures(): Array<{ name: string; data: Uint8Array }> {
  return [
    { name: "living-1024x768.png", data: pngBytes(1024, 768) },
    { name: "kitchen-1200x800.jpg", data: jpegBytes(1200, 800) },
    { name: "too-small-64x48.png", data: pngBytes(64, 48) },
    { name: "wide-banner-1600x400.png", data: pngBytes(1600, 400) },
    { name: "agent-logo-1200x800.png", data: pngBytes(1200, 800) },
    { name: "living-staged.png", data: pngBytes(1024, 768) },
  ];
}

function testPassingPhotosHaveNoFindings() {
  const byName = new Map(checkBatch(fixtures()).map((r) => [r.info.name, r]));
  assertEqual(byName.get("living-1024x768.png")!.findings, [], "living-1024x768.png should pass");
  assertEqual(byName.get("kitchen-1200x800.jpg")!.findings, [], "kitchen-1200x800.jpg should pass");
}

function testLongEdgeAspectBrandingStaging() {
  const byName = new Map(checkBatch(fixtures()).map((r) => [r.info.name, r]));
  assertEqual(
    byName.get("too-small-64x48.png")!.findings.map((f) => f.rule),
    ["long_edge"],
    "too-small-64x48.png",
  );
  assertEqual(
    byName.get("wide-banner-1600x400.png")!.findings.map((f) => f.rule),
    ["aspect"],
    "wide-banner-1600x400.png",
  );
  assertEqual(
    byName.get("agent-logo-1200x800.png")!.findings.map((f) => f.rule),
    ["branding_filename"],
    "agent-logo-1200x800.png",
  );
  assertEqual(
    byName.get("living-staged.png")!.findings.map((f) => f.rule),
    ["staging_pair"],
    "living-staged.png",
  );
}

function testNonPhotoIsExcluded() {
  const files = [...fixtures(), { name: "notes.txt", data: new TextEncoder().encode("not a photo\n") }];
  const names = new Set(checkBatch(files).map((r) => r.info.name));
  assert(!names.has("notes.txt"), "notes.txt must not be treated as a photo");
  assertEqual(names.size, 6, "exactly 6 photos checked");
}

function testStagedWithOriginalSiblingPasses() {
  const files = [
    { name: "living.png", data: pngBytes(1024, 768) },
    { name: "living-staged.png", data: pngBytes(1024, 768) },
  ];
  const byName = new Map(checkBatch(files).map((r) => [r.info.name, r]));
  assertEqual(byName.get("living-staged.png")!.findings, [], "living-staged.png with sibling should pass");
  assertEqual(byName.get("living.png")!.findings, [], "living.png should pass");
}

function testJpegHeaderRoundtrip() {
  const data = jpegBytes(1600, 1200);
  const report = checkPhoto("room.jpg", data);
  assertEqual(report.info.format, "jpeg", "format");
  assertEqual(report.info.width, 1600, "width");
  assertEqual(report.info.height, 1200, "height");
  assertEqual(report.findings, [], "no findings");
}

function testUnreadableAndUnrecognisedFormat() {
  const report = checkPhoto("mystery.png", new TextEncoder().encode("not an image"));
  assertEqual(report.info.unreadable, "unrecognised-magic", "unreadable reason");
  assertEqual(
    report.findings.map((f) => f.rule),
    ["unreadable"],
    "single unreadable finding, no downstream rules run",
  );
}

function testReshootPlanMapsFindingsToActions() {
  const reports = checkBatch(fixtures());
  const plan = buildReshootPlan(reports);
  const byName = new Map(plan.items.map((item) => [item.fileName, item]));

  assertEqual(plan.recaptureCount, 1, "one long-edge recapture");
  assertEqual(plan.deskFixCount, 3, "aspect + branding + staging");
  assertEqual(plan.blockingCount, 3, "long_edge, branding, staging are blocking");
  assert(!byName.has("living-1024x768.png"), "passing photos stay off the list");
  assertEqual(byName.get("too-small-64x48.png")!.kind, "recapture", "long_edge → recapture");
  assertEqual(byName.get("wide-banner-1600x400.png")!.kind, "reexport", "aspect → reexport");
  assertEqual(byName.get("agent-logo-1200x800.png")!.kind, "rename", "branding → rename");
  assertEqual(byName.get("living-staged.png")!.kind, "pair", "staging → pair");
}

function testCleanBatchHasEmptyReshootPlan() {
  const reports = checkBatch([
    { name: "living-1024x768.png", data: pngBytes(1024, 768) },
    { name: "kitchen-1200x800.jpg", data: jpegBytes(1200, 800) },
  ]);
  const plan = buildReshootPlan(reports);
  assertEqual(plan.items.length, 0, "no items");
  assert(formatReshootPlan(plan).includes("nothing to fix"), "empty copy");
  assert(formatReshootPlan(plan).includes("visual_watermark"), "still discloses unimplemented");
}

function testReshootPlanTextIsCopyable() {
  const plan = buildReshootPlan(checkBatch(fixtures()));
  const text = formatReshootPlan(plan);
  assert(text.includes("too-small-64x48.png"), "names the recapture file");
  assert(text.includes("agent-logo-1200x800.png"), "names the rename file");
  assert(text.includes("Go back to the property"), "groups recaptures");
  assert(text.includes("Fix at the desk"), "groups desk fixes");
  assert(text.includes("not a warranty"), "disclaimer stays on the copied list");
}

function testEvidenceReportNamesTheSpecAndUnimplementedRules(): void {
  const reports = checkBatch([
    { name: "kitchen-1600x1200.png", data: new Uint8Array(pngBytes(1600, 1200)) },
  ]);
  const evidence = createEvidenceReport(reports, ["notes.txt"], "2026-08-26T20:55:00.000Z");
  assertEqual(evidence.reportType, "listing-lens-photo-preflight", "report type");
  assertEqual(evidence.specId, SPEC_ID, "spec id");
  assertEqual(evidence.specDate, SPEC_DATE, "spec date");
  assertEqual(evidence.checkedPhotos, 1, "checked photo count");
  assertEqual(evidence.skippedFiles, ["notes.txt"], "skipped files stay listed");
  assertEqual([...evidence.unimplementedRules], [...UNIMPLEMENTED_RULES], "unimplemented rules stay explicit");
  assert(evidence.photos[0].info.name === "kitchen-1600x1200.png", "keeps the checked photo");
}

const tests: Array<[string, () => void]> = [
  ["passing photos have no findings", testPassingPhotosHaveNoFindings],
  ["long edge / aspect / branding / staging", testLongEdgeAspectBrandingStaging],
  ["non-photo file is excluded", testNonPhotoIsExcluded],
  ["staged with original sibling passes", testStagedWithOriginalSiblingPasses],
  ["jpeg header roundtrip", testJpegHeaderRoundtrip],
  ["unreadable / unrecognised format", testUnreadableAndUnrecognisedFormat],
  ["reshoot plan maps findings to actions", testReshootPlanMapsFindingsToActions],
  ["clean batch has an empty reshoot plan", testCleanBatchHasEmptyReshootPlan],
  ["reshoot plan text is copyable", testReshootPlanTextIsCopyable],
  ["evidence report names the spec and unimplemented rules", testEvidenceReportNamesTheSpecAndUnimplementedRules],
];

let failures = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL - ${name}`);
    console.error(err);
  }
}

if (failures > 0) {
  console.error(`${failures}/${tests.length} tests failed`);
  process.exit(1);
} else {
  console.log(`${tests.length}/${tests.length} tests passed`);
}
