import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimestamp, parseChapters, validate, repair, formatTime, toDescription, toChaptersJson, toFfmetadata, toWebVtt, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer } from "./calc.mjs";

const titles = (r) => r.findings.map((f) => f.title);

test("parseTimestamp reads M:SS, H:MM:SS, fractions and frame timecodes", () => {
  assert.equal(parseTimestamp("0:00"), 0);
  assert.equal(parseTimestamp("12:30"), 750);
  assert.equal(parseTimestamp("1:02:03"), 3723);
  assert.equal(parseTimestamp("0:05.5"), 5.5);
  assert.equal(parseTimestamp("00:00:10:15", 30), 10.5);
  assert.equal(parseTimestamp("00:00:10;15", 30), 10.5);
  assert.equal(parseTimestamp("1:75"), null);
  assert.equal(parseTimestamp("1:02:75"), null);
  assert.equal(parseTimestamp("00:00:10:45", 30), null);
  assert.equal(parseTimestamp("abc"), null);
});

test("parseChapters reads leading, trailing, bracketed, Audacity and Premiere lines", () => {
  const text = ["0:00 Intro", "- 1:30 – Second", "Third part - 2:45", "[3:10] Fourth", "(4:00) Fifth", "5.5\t5.5\tAudacity label", "Marker Name\tDescription\tIn\tOut", "Premiere one\t\t00:00:20:00\t00:00:20:00", "just prose here"].join("\n");
  const p = parseChapters(text, { fps: 25 });
  assert.deepEqual(p.chapters.map((c) => [c.seconds, c.title]), [[0, "Intro"], [90, "Second"], [165, "Third part"], [190, "Fourth"], [240, "Fifth"], [5.5, "Audacity label"], [20, "Premiere one"]]);
  assert.equal(p.prose, 1);
});

test("a clean list passes with no findings", () => {
  const r = validate(sampleFile());
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.chapters, 5);
});

test("each YouTube rule is reported with its line", () => {
  const r = validate(sampleBrokenFile());
  const t = titles(r);
  assert.ok(t.includes("Not a valid time"));
  assert.ok(t.includes("Not in ascending order"));
  assert.ok(t.includes("First chapter does not start at 0:00"));
  assert.ok(t.includes("Chapter has no title"));
  assert.ok(t.includes("Chapter shorter than 10 seconds"));
  assert.equal(r.findings.find((f) => f.title === "Chapter has no title").line, 7);
  assert.equal(r.findings.find((f) => f.title === "Not in ascending order").line, 4);
});

test("fewer than three chapters and no timestamps are errors", () => {
  assert.ok(titles(validate("0:00 A\n0:30 B")).includes("Fewer than three chapters"));
  assert.ok(titles(validate("hello world")).includes("No timestamps found"));
});

test("duplicate times are reported and never merged", () => {
  const r = validate("0:00 A\n1:00 B\n1:00 C\n2:00 D");
  assert.ok(titles(r).includes("Two chapters at the same time"));
  const fixed = repair("0:00 A\n1:00 B\n1:00 C\n2:00 D");
  assert.match(fixed.text, /1:00 B\n1:00 C/);
});

test("duration flags a chapter past the end and a short last chapter", () => {
  assert.ok(titles(validate("0:00 A\n1:00 B\n2:00 C\n9:00 E", { duration: 180 })).includes("Starts after the video ends"));
  assert.ok(titles(validate("0:00 A\n1:00 B\n2:00 C\n2:55 D", { duration: 180 })).includes("Chapter shorter than 10 seconds"));
});

test("offset shifts everything and flags times that fall before zero", () => {
  const r = validate("0:05 Cut\n0:30 A\n1:00 B\n2:00 C", { offset: 30 });
  assert.ok(titles(r).includes("Time is before the start after the offset"));
  const fixed = repair("0:05 Cut\n0:30 A\n1:00 B\n2:00 C", { offset: 30 });
  assert.equal(fixed.text, "0:00 A\n0:30 B\n1:30 C\n");
});

test("repair sorts, normalises and optionally adds a 0:00 chapter", () => {
  const src = "2:10 Why\n0:45 Intro\n3:15 Setup\n4:30 Done";
  const noIntro = repair(src);
  assert.equal(noIntro.text, "0:45 Intro\n2:10 Why\n3:15 Setup\n4:30 Done\n");
  const withIntro = repair(src, { introTitle: "Intro" });
  assert.match(withIntro.text, /^0:00 Intro\n0:45 Intro\n/);
  assert.equal(validate(withIntro.text).summary.errors, 0);
});

test("repair writes H:MM:SS for every line once a video passes an hour", () => {
  const out = repair("0:00 A\n10:00 B\n1:05:00 C", {}).text;
  assert.equal(out, "0:00:00 A\n0:10:00 B\n1:05:00 C\n");
  assert.equal(repair("0:00 A\n1:00 B\n2:00 C", { duration: 4000 }).text.split("\n")[0], "0:00:00 A");
});

test("repair drops exact repeats only", () => {
  const r = repair("0:00 A\n0:00 A\n1:00 B\n2:00 C");
  assert.equal(r.text, "0:00 A\n1:00 B\n2:00 C\n");
  assert.ok(r.changes.some((c) => /repeat/.test(c)));
});

test("repair output revalidates clean when the source was only mis-ordered", () => {
  const r = repair("0:00 Intro\n3:15 C\n1:10 B\n5:00 D");
  assert.equal(validate(r.text).summary.errors, 0);
});

test("formatTime", () => {
  assert.equal(formatTime(75), "1:15");
  assert.equal(formatTime(3723, true), "1:02:03");
  assert.equal(formatTime(75, true), "0:01:15");
});

test("chapters.json, ffmetadata and WebVTT exports", () => {
  const ch = [{ seconds: 0, title: "Intro" }, { seconds: 90, title: "A=B; C" }];
  assert.deepEqual(JSON.parse(toChaptersJson(ch)), { version: "1.2.0", chapters: [{ startTime: 0, title: "Intro" }, { startTime: 90, title: "A=B; C" }] });
  const ff = toFfmetadata(ch, 300);
  assert.match(ff, /^;FFMETADATA1\n\[CHAPTER\]\nTIMEBASE=1\/1000\nSTART=0\nEND=90000\ntitle=Intro/);
  assert.ok(ff.includes("START=90000\nEND=300000\ntitle=A\\=B\\; C"));
  assert.equal(toFfmetadata(ch, null), null);
  assert.equal(toWebVtt(ch, 300), "WEBVTT\n\n1\n00:00:00.000 --> 00:01:30.000\nIntro\n\n2\n00:01:30.000 --> 00:05:00.000\nA=B; C\n");
  assert.equal(toDescription(ch), "0:00 Intro\n1:30 A=B; C\n");
});

test("long titles and long text are warnings", () => {
  const r = validate("0:00 " + "x".repeat(90) + "\n1:00 B\n2:00 C");
  assert.ok(titles(r).includes("Long chapter title"));
  assert.ok(titles(validate("0:00 A\n1:00 B\n2:00 C\n" + "p".repeat(5100))).includes("Longer than a YouTube description"));
});

test("findingsCsv escapes and decodeBuffer handles BOMs", () => {
  assert.match(findingsCsv(validate("0:00 A")), /^severity,line,title,detail,auto_fixed\r\n/);
  assert.equal(decodeBuffer(new Uint8Array([0xef, 0xbb, 0xbf, 0x30]).buffer), "0");
  assert.equal(decodeBuffer(new Uint8Array([0xff, 0xfe, 0x30, 0x00]).buffer), "0");
});
