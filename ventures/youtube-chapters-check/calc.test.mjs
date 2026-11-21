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

test("non-drop 23.976 and 29.97 timecodes count nominal frames per labelled second (SMPTE ST 12-1)", () => {
  // 01:00:00:00 at 29.97 NDF is 108,000 frames x 1001/30000 = 3603.6 s, not 3600.
  assert.ok(Math.abs(parseTimestamp("01:00:00:00", 29.97) - 3603.6) < 1e-6);
  assert.ok(Math.abs(parseTimestamp("00:30:00:00", 23.976) - 1801.8) < 1e-6);
  assert.ok(Math.abs(parseTimestamp("00:00:10:15", 29.97) - 315 * 1001 / 30000) < 1e-6);
  assert.equal(parseTimestamp("00:00:10:15", 30), 10.5);
  assert.equal(parseTimestamp("01:00:00;00", 29.97), 3600); // drop-frame labels track wall time
});

test("repair names every line it leaves out because the time is impossible", () => {
  const r = repair(sampleBrokenFile());
  assert.ok(!/everyone gets wrong/.test(r.text));
  assert.ok(r.changes.some((c) => /line 6/.test(c) && /everyone gets wrong/.test(c)), r.changes.join(" | "));
});

// A Timeline > Export > Timeline Markers to EDL file as DaVinci Resolve writes it (CMX 3600 events, the
// marker name in the |M: field of the comment line, timeline starting at 01:00:00:00).
const resolveEdl = (fcm = "NON-DROP FRAME", sep = ":") => [
  "TITLE: Timeline 1", `FCM: ${fcm}`, "",
  `001  001      V     C        01:00:00${sep}00 01:00:00${sep}01 01:00:00${sep}00 01:00:00${sep}01  `,
  " |C:ResolveColorBlue |M:Intro |D:1", "",
  `002  001      V     C        01:00:48${sep}12 01:00:48${sep}13 01:00:48${sep}12 01:00:48${sep}13  `,
  " |C:ResolveColorGreen |M:Why chapters help |D:1", "",
  `003  001      V     C        01:03:15${sep}00 01:03:15${sep}01 01:03:15${sep}00 01:03:15${sep}01  `,
  " |C:ResolveColorBlue |M:Setup | tools |D:1", "",
].join("\r\n");

test("a DaVinci Resolve marker EDL gives named chapters from 0:00", () => {
  const r = validate(resolveEdl(), { fps: 25 });
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings));
  assert.deepEqual(r.chapters.map((c) => [c.seconds, c.title]), [[0, "Intro"], [48 + 12 / 25, "Why chapters help"], [195, "Setup | tools"]]);
  assert.ok(titles(r).includes("Read as a DaVinci Resolve marker EDL"));
  const fixed = repair(resolveEdl(), { fps: 25 });
  assert.equal(fixed.text, "0:00 Intro\n0:48 Why chapters help\n3:15 Setup | tools\n");
  assert.ok(fixed.changes.some((c) => c.includes("timeline start")));
});

test("the Resolve timeline start comes off the label, so 29.97 non-drop still starts at 0:00", () => {
  // 01:00:00:00 at 29.97 NDF is 3603.6 s of real time; subtracting 3600 s after conversion would leave
  // the first marker at 0:03 and fail YouTube's 0:00 rule.
  const r = validate(resolveEdl(), { fps: 29.97 });
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings));
  assert.equal(r.chapters[0].seconds, 0);
  assert.ok(Math.abs(r.chapters[1].seconds - (48 * 30 + 12) * 1001 / 30000) < 1e-9);
  assert.ok(Math.abs(r.chapters[2].seconds - 195 * 30 * 1001 / 30000) < 1e-9);
});

test("a drop-frame Resolve EDL is read as drop-frame labels", () => {
  const r = validate(resolveEdl("DROP FRAME", ";"), { fps: 29.97 });
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings));
  assert.equal(validate(resolveEdl("DROP FRAME"), { fps: 29.97 }).chapters[2].seconds, r.chapters[2].seconds);
});

test("a Resolve marker with no name is a blank-title error, not event-line text", () => {
  const edl = resolveEdl().replace(" |C:ResolveColorBlue |M:Intro |D:1", " |C:ResolveColorBlue |D:1");
  const r = validate(edl, { fps: 25 });
  assert.equal(r.chapters[0].title, "");
  assert.ok(titles(r).includes("Chapter has no title"));
});

test("an EDL with a 00:00:00:00 timeline start is not shifted", () => {
  const r = validate(resolveEdl().replace(/01:0/g, "00:0"), { fps: 25 });
  assert.deepEqual(r.chapters.map((c) => Math.floor(c.seconds)), [0, 48, 195]);
  assert.ok(!repair(resolveEdl().replace(/01:0/g, "00:0"), { fps: 25 }).changes.some((c) => c.includes("timeline start")));
});

test("rule boundaries: 10 s passes, 9 s fails, 0:01 start fails, 59 is the last legal minute or second", () => {
  assert.ok(!titles(validate("0:00 A\n0:10 B\n0:20 C")).includes("Chapter shorter than 10 seconds"));
  assert.ok(titles(validate("0:00 A\n0:09 B\n0:20 C")).includes("Chapter shorter than 10 seconds"));
  assert.ok(titles(validate("0:01 A\n0:20 B\n0:40 C")).includes("First chapter does not start at 0:00"));
  assert.equal(parseTimestamp("0:59"), 59);
  assert.equal(parseTimestamp("0:60"), null);
  assert.equal(parseTimestamp("1:59:00"), 7140);
  assert.equal(parseTimestamp("1:60:00"), null);
  assert.ok(!titles(validate("0:00 A\n0:20 B\n0:40 C", { duration: 50 })).includes("Chapter shorter than 10 seconds"));
  assert.ok(titles(validate("0:00 A\n0:20 B\n0:40 C", { duration: 49 })).includes("Chapter shorter than 10 seconds"));
});

test("WebVTT never writes '-->' inside a cue title", () => {
  const vtt = toWebVtt([{ seconds: 0, title: "Before --> after" }, { seconds: 30, title: "B" }], 60);
  assert.equal(vtt.split("\n").filter((l) => l.includes("-->")).length, 2);
  assert.ok(vtt.includes("Before -> after"));
});

// Re-audit 2026-11-21 (portfolio/quality/audits/2026-11-21-youtube-chapters-check.json): the defects the
// 2026-11-17 audit left open.
test("a start-end range line keeps the title, not the end time", () => {
  const p = parseChapters("0:00 - 1:30 Intro\n1:30 – 4:00 Setup\n4:00 Wrap up\n3:15 - Setting up the project");
  assert.deepEqual(p.chapters.map((c) => [c.seconds, c.title]), [[0, "Intro"], [90, "Setup"], [240, "Wrap up"], [195, "Setting up the project"]]);
});

test("Audacity labels written with a decimal comma are read", () => {
  const p = parseChapters("0,000000\t0,000000\tIntro\n12,500000\t12,500000\tB\n30,000000\t30,000000\tC");
  assert.deepEqual(p.chapters.map((c) => [c.seconds, c.title]), [[0, "Intro"], [12.5, "B"], [30, "C"]]);
});

test("without a video length the last chapter is reported as unchecked", () => {
  assert.ok(titles(validate("0:00 a\n0:10 b\n0:20 c")).includes("Last chapter's length not checked"));
  assert.ok(!titles(validate("0:00 a\n0:10 b\n0:20 c", { duration: 60 })).includes("Last chapter's length not checked"));
});

test("a chapter starting exactly at the video length is past the end", () => {
  assert.ok(titles(validate("0:00 A\n1:00 B\n3:00 C", { duration: 180 })).includes("Starts after the video ends"));
  assert.ok(!titles(validate("0:00 A\n1:00 B\n2:50 C", { duration: 180 })).includes("Starts after the video ends"));
});
