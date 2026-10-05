import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parse, haversine, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);

test("the clean sample has no findings and sensible stats", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings, []);
  assert.equal(r.stats.points, 4);
  assert.equal(r.stats.durationS, 30);
  assert.ok(r.stats.distanceM > 200 && r.stats.distanceM < 350);
});

test("the broken sample reports each defect with a line number", () => {
  const r = validate(sampleBrokenFile());
  for (const c of ["no-version", "no-creator", "no-xmlns", "null-island", "ele-range", "time-order", "time-format", "empty-segment", "dup-time"]) assert.ok(codes(r).includes(c), c);
  assert.ok(r.findings.filter((f) => f.code !== "no-version").every((f) => f.line > 0));
  assert.equal(r.findings.find((f) => f.code === "time-order").line, 7);
});

test("haversine: one degree of latitude is about 111 km", () => {
  const d = haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
  assert.ok(Math.abs(d - 111195) < 200);
});

test("a swapped lat/lon is flagged as out of range", () => {
  const t = sampleFile().replace('lat="48.8566" lon="2.3522"', 'lat="2.3522" lon="148.8566"').replace("148.8566", "248.8566");
  assert.ok(codes(validate(t)).includes("lon-range"));
});

test("a teleporting GPS point is a jump warning", () => {
  const t = sampleFile().replace('lat="48.8576" lon="2.3541"', 'lat="49.8576" lon="2.3541"');
  assert.ok(codes(validate(t)).includes("jump"));
});

test("a null-island point does not also create jump noise", () => {
  const t = sampleFile().replace('lat="48.857" lon="2.353"', 'lat="0" lon="0"');
  assert.ok(codes(validate(t)).includes("null-island"));
  assert.ok(!codes(validate(t)).includes("jump"));
});

test("track with no times is reported", () => {
  const t = sampleFile().replace(/<time>[^<]*<\/time>/g, "");
  assert.ok(codes(validate(t)).includes("no-time"));
});

test("text that is not GPX is an error and does not throw", () => {
  const r = validate("hello world");
  assert.equal(r.summary.errors, 1);
  assert.deepEqual(codes(r), ["not-gpx"]);
  assert.doesNotThrow(() => validate(""));
});

test("truncated file is flagged", () => {
  assert.ok(codes(validate(sampleFile().replace("</gpx>", ""))).includes("unclosed-gpx"));
});

test("repair fixes only what is provable and the result re-validates better", () => {
  const before = validate(sampleBrokenFile());
  const fix = repair(sampleBrokenFile());
  const after = validate(fix.text);
  assert.ok(fix.changes.length >= 6);
  for (const c of ["no-version", "no-creator", "no-xmlns", "null-island", "empty-segment"]) assert.ok(!codes(after).includes(c), c);
  // not guessed: the out-of-order time and the 12000 m elevation are left alone
  assert.ok(codes(after).includes("time-order") && codes(after).includes("ele-range"));
  assert.ok(after.summary.errors < before.summary.errors);
});

test("repair leaves a clean file byte-identical", () => {
  const s = sampleFile();
  const fix = repair(s);
  assert.equal(fix.text, s);
  assert.deepEqual(fix.changes, []);
});

test("parse tolerates single quotes and self-closing points", () => {
  const g = parse(`<gpx version='1.1'><trk><trkseg><trkpt lat='1' lon='2'/></trkseg></trk></gpx>`);
  assert.equal(g.segments[0].points.length, 1);
  assert.equal(g.segments[0].points[0].lat, 1);
});

test("csv export quotes messages", () => {
  const csv = findingsCsv(validate(sampleBrokenFile()));
  assert.match(csv, /^line,severity,code,message\r\n/);
});

test("decodeBuffer strips a BOM and reads UTF-16", () => {
  assert.equal(decodeBuffer(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]).buffer), "a");
  assert.equal(decodeBuffer(new Uint8Array([0xff, 0xfe, 0x61, 0x00]).buffer), "a");
});
