import { test } from "node:test";
import assert from "node:assert/strict";
import { REPLIES, parseCsv, normalizeRows, analyze, parseRating, parseDate, sampleCsv, distinctiveTerms, THEMES } from "./calc.mjs";

const load = (csv) => normalizeRows(parseCsv(csv));

test("parseRating reads digits, words with digits and star glyphs", () => {
  assert.equal(parseRating("5"), 5);
  assert.equal(parseRating("4 stars"), 4);
  assert.equal(parseRating("★★★"), 3);
  assert.equal(parseRating("0"), null);
  assert.equal(parseRating("6"), null);
  assert.equal(parseRating(""), null);
});

test("parseDate handles Play Console, ISO date and unix seconds", () => {
  assert.equal(parseDate("2026-03-04 10:00:00").toISOString(), "2026-03-04T10:00:00.000Z");
  assert.equal(parseDate("2026-03-04").toISOString(), "2026-03-04T00:00:00.000Z");
  assert.equal(parseDate("1772582400").getUTCFullYear(), 2026);
  assert.equal(parseDate("nonsense"), null);
});

test("parseCsv keeps commas, quotes and newlines inside quoted review text", () => {
  const rows = parseCsv('Rating,Review\n1,"Bad, ""really"" bad\nsecond line"\n5,Good\n');
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], 'Bad, "really" bad\nsecond line');
});

test("missing rating or text column is an error that names what to add", () => {
  assert.match(load("Date,Review\n2026-01-01,hi").error, /No rating column/);
  assert.match(load("Rating,Date\n5,2026-01-01").error, /No review text column/);
});

test("unreadable ratings are skipped with a line number, not dropped silently", () => {
  const n = load("Rating,Review\n5,great\nx,bad\n1,crash\n");
  assert.equal(n.reviews.length, 2);
  assert.deepEqual(n.skipped, [{ line: 3, reason: "no readable 1-5 rating" }]);
});

test("Google Play style headers are recognised", () => {
  const n = load("Package Name,App Version Name,Review Submit Date and Time,Star Rating,Review Title,Review Text,Developer Reply Text\ncom.x,1.0,2026-02-01 09:00:00,2,Broken,It keeps crashing,\n");
  assert.equal(n.hasVersion, true);
  assert.equal(n.hasReply, true);
  assert.equal(n.reviews[0].version, "1.0");
  assert.match(n.reviews[0].text, /Broken\. It keeps crashing/);
});

test("overall numbers reconcile: distribution, months and versions each add up", () => {
  const n = load(sampleCsv());
  const r = analyze(n.reviews);
  assert.equal(r.dist.reduce((s, d) => s + d.count, 0), r.summary.reviews);
  assert.equal(r.byMonth.reduce((s, m) => s + m.reviews, 0), r.summary.reviews);
  assert.equal(r.byVersion.reduce((s, v) => s + v.reviews, 0), r.summary.reviews);
  const weighted = r.byVersion.reduce((s, v) => s + v.avg * v.reviews, 0) / r.summary.reviews;
  assert.ok(Math.abs(weighted - r.summary.avg) < 1e-9);
});

test("the sample plants a regression in 2.3.0 and the tool finds it, with crashes as the theme", () => {
  const r = analyze(load(sampleCsv()).reviews);
  assert.equal(r.regressions.length, 1);
  assert.equal(r.regressions[0].to, "2.3.0");
  assert.equal(r.regressions[0].topTheme, "Crashes and freezes");
  assert.equal(r.findings[0].severity, "high");
});

test("no regression is claimed for a version with too few reviews", () => {
  const csv = ["Rating,Review,Version", ...Array(6).fill("5,great,1.0"), "1,crash,1.1", "1,crash,1.1"].join("\n");
  assert.equal(analyze(load(csv).reviews).regressions.length, 0);
});

test("theme uplift is the what-if of rating like the rest, and is zero when nothing differs", () => {
  const same = load("Rating,Review\n3,crash here\n3,fine\n3,fine\n");
  assert.equal(analyze(same.reviews).themes.find((t) => t.key === "crashes").uplift, 0);
  const r = analyze(load("Rating,Review\n1,it crashes\n1,it crashes\n5,great\n5,great\n").reviews);
  const t = r.themes.find((x) => x.key === "crashes");
  assert.equal(t.mentions, 2);
  assert.ok(Math.abs(t.uplift - 2) < 1e-9); // 2 reviews * (5-1) / 4
});

test("every theme regex compiles and matches its own label's obvious word", () => {
  assert.ok(THEMES.length >= 10);
  assert.ok(THEMES.find((t) => t.key === "crashes").re.test("it keeps crashing"));
  assert.ok(THEMES.find((t) => t.key === "billing").re.test("too expensive"));
  assert.ok(!THEMES.find((t) => t.key === "ads").re.test("loads fast"));
});

test("distinctive terms favour phrases that appear in unhappy reviews and not happy ones", () => {
  const reviews = [];
  for (let i = 0; i < 4; i++) reviews.push({ rating: 1, text: "constant crashes on launch" });
  for (let i = 0; i < 6; i++) reviews.push({ rating: 5, text: "great little tool" });
  const terms = distinctiveTerms(reviews).map((t) => t.term);
  assert.ok(terms.includes("constant crashes"));
  assert.ok(!terms.includes("great"));
});

test("unanswered queue lists low-star reviews without a reply, oldest first, only if the file has replies", () => {
  const r = analyze(load("Date,Rating,Review,Reply\n2026-02-01,1,bad,\n2026-01-01,2,worse,\n2026-01-05,1,bad,Sorry\n2026-01-06,5,nice,\n").reviews);
  assert.equal(r.unanswered.length, 2);
  assert.equal(r.unanswered[0].text, "worse");
  assert.equal(r.answeredLow, 1);
  const none = analyze(load("Rating,Review\n1,bad\n").reviews);
  assert.equal(none.unanswered.length, 0);
  assert.equal(none.hasReply, false);
});

test("a file with no dates and no versions still analyses", () => {
  const r = analyze(load("Rating,Review\n1,crash\n5,fine\n").reviews);
  assert.equal(r.byMonth.length, 0);
  assert.equal(r.byVersion.length, 0);
  assert.equal(r.summary.from, null);
});

test("tab and semicolon separated exports are read", () => {
  assert.equal(load("Star Rating\tReview Text\n1\tcrashes on launch\n5\tlove it").reviews.length, 2);
  assert.equal(load("Star Rating;Review Text\n1;crashes on launch\n5;love it").reviews.length, 2);
  assert.equal(parseCsv("a,b\n\"x;y\",2")[1][0], "x;y");
});

test("a theme that appears three times in the newest window and not before is rising; one angry user is not", () => {
  const rows = ["Date,Star Rating,Review Text"];
  for (let i = 0; i < 10; i++) rows.push(`2026-08-${String(1 + i).padStart(2, "0")},5,love it`);
  for (let i = 0; i < 3; i++) rows.push(`2026-09-${String(10 + i).padStart(2, "0")},1,keeps crashing`);
  rows.push("2026-09-14,1,login broke");
  const r = analyze(load(rows.join("\n")).reviews);
  assert.ok(r.rising.some((t) => t.key === "crashes"));
  assert.ok(!r.rising.some((t) => t.key === "login"));
  assert.ok(r.findings.some((f) => /rising/.test(f.title)));
});

test("a file with no dates has nothing rising", () => {
  assert.deepEqual(analyze(load("Star Rating,Review Text\n1,crash\n1,crash\n1,crash\n5,ok").reviews).rising, []);
});

test("every unanswered review gets a draft with the support address filled in and no unfilled placeholder", () => {
  const r = analyze(load("Date,Star Rating,Review Text,Developer Reply Text\n2026-01-01,1,app crashes,\n2026-01-02,1,wrong charge billing,\n2026-01-03,1,meh,\n2026-01-04,5,great,Thanks").reviews, { support: "help@example.com" });
  assert.equal(r.unanswered.length, 3);
  for (const u of r.unanswered) { assert.ok(u.draft.length > 20); assert.ok(!u.draft.includes("{support}")); }
  assert.ok(r.unanswered[0].draft.includes("help@example.com"));
  assert.ok(Object.values(REPLIES).every((x) => !/\b(will fix|by (monday|friday|next)|within \d+)/i.test(x)));
});
