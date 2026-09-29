import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, detectDelimiter, decodeBuffer, normalizeRows, analyze, clicksNeeded, tokens, matchKind, negativesList, sampleCsv } from "./calc.mjs";

const HEAD = "Search term,Match type,Added/Excluded,Campaign,Clicks,Impr.,Cost,Conversions,Conv. value\n";
const load = (body, head = HEAD) => normalizeRows(parseCsv(head + body));

test("parseNumber reads Google's formats", () => {
  assert.equal(parseNumber("1,234.56"), 1234.56);
  assert.equal(parseNumber("$12.50"), 12.5);
  assert.equal(parseNumber(" --"), 0);
  assert.equal(parseNumber("< 10"), 10);
  assert.equal(parseNumber("1.234,56", true), 1234.56);
  assert.ok(Number.isNaN(parseNumber("abc")));
});

test("delimiter is sniffed and UTF-16 exports decode", () => {
  assert.equal(detectDelimiter("Search term\tCost\tClicks\nfoo\t1\t2"), "\t");
  assert.equal(detectDelimiter("Search term;Cost;Clicks\nfoo;1,5;2"), ";");
  assert.equal(detectDelimiter("Search term,Cost,Clicks"), ",");
  const s = "Search term,Cost";
  const buf = new Uint8Array([0xff, 0xfe, ...[...s].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(buf.buffer), s);
});

test("title, date range and Total rows around the data are handled", () => {
  const n = normalizeRows(parseCsv('Search terms report\n"September 1, 2026 - September 28, 2026"\n' + HEAD + "plumber,Broad match,None,C,10,100,20.00,1,100\nTotal: Search terms, , ,,10,100,20.00,1.00,100\n"));
  assert.equal(n.error, null);
  assert.equal(n.rows.length, 1);
  assert.equal(n.totalsRows, 1);
});

test("missing columns give a specific message", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2")).error, /No header row/);
  assert.match(normalizeRows(parseCsv("Search term,Cost,Clicks\na,1,2")).error, /No Conversions column/);
  assert.match(normalizeRows(parseCsv("Search term,Cost,Conversions\na,1,2")).error, /No Clicks column/);
});

test("unreadable rows are reported with a line number, not dropped silently", () => {
  const n = load("a,Broad match,None,C,5,50,x,0,0\nb,Broad match,None,C,5,50,3.00,0,0\n");
  assert.equal(n.rows.length, 1);
  assert.deepEqual(n.skipped, [{ line: 2, reason: "unreadable cost" }]);
});

test("match types and tokens normalise", () => {
  assert.equal(matchKind("Exact match (close variant)"), "exact");
  assert.equal(matchKind("Phrase match"), "phrase");
  assert.equal(matchKind("Broad match"), "broad");
  assert.equal(matchKind(""), "unknown");
  assert.deepEqual(tokens("Plumber's  jobs, jobs"), ["plumber's", "jobs"]);
});

test("clicks needed is the fewest clicks with (1-p)^n under 5%", () => {
  assert.equal(clicksNeeded(0.06), Math.ceil(Math.log(0.05) / Math.log(0.94)));
  assert.equal(clicksNeeded(0.06), 49);
  assert.ok((1 - 0.06) ** 49 < 0.05 && (1 - 0.06) ** 48 >= 0.05);
  assert.equal(clicksNeeded(0), Infinity);
  assert.equal(clicksNeeded(0.9), 3);
});

const acct = [
  "plumber near me,Broad match,None,C,100,1000,300.00,10,2400",
  "emergency plumber,Exact match,None,C,50,400,200.00,6,1440",
  "plumber salary,Broad match,None,C,60,900,90.00,0,0",
  "plumbing jobs,Broad match,None,C,3,60,4.00,0,0",
  "plumber jobs near me,Phrase match,None,C,40,500,60.00,0,0",
  "how much does a plumber salary pay,Broad match,None,C,2,40,6.00,0,0",
].join("\n") + "\n";

test("every dollar lands in exactly one bucket", () => {
  const r = analyze(load(acct).rows);
  const b = r.buckets;
  assert.ok(Math.abs(b.converting + b.proven + b.overspent + b.watch + b.excluded - r.summary.cost) < 1e-9);
  assert.ok(Math.abs(b.proven + b.overspent + b.watch - r.summary.zeroCost) < 1e-9);
});

test("tiers: proven needs enough clicks, overspent needs cost over one conversion, otherwise watch", () => {
  const r = analyze(load(acct).rows);
  const t = Object.fromEntries(r.topWaste.map((x) => [x.term, x.tier]));
  assert.equal(r.summary.needed, clicksNeeded(16 / 255));
  assert.equal(t["plumber salary"], "proven");
  assert.equal(t["plumber jobs near me"], "overspent");
  assert.equal(t["plumbing jobs"], "watch");
});

test("a word in any converting term is never suggested; a core word is never suggested", () => {
  const r = analyze(load(acct + "plumber jobs,Broad match,None,C,30,300,40.00,3,720\n").rows);
  assert.ok(!r.wordCandidates.some((w) => w.word === "jobs"));
  const r2 = analyze(load(acct).rows, { coreWords: ["salary"] });
  assert.ok(!r2.wordCandidates.some((w) => w.word === "salary"));
});

test("a word in two or more zero-conversion terms is proposed as a negative", () => {
  const r = analyze(load(acct).rows);
  const words = r.wordCandidates.map((w) => w.word);
  assert.ok(words.includes("salary"));
  assert.ok(words.includes("jobs"));
  assert.ok(!words.includes("plumber"), "plumber is in converting terms");
  assert.ok(!words.includes("near"), "stop words are never candidates");
  assert.match(negativesList(r), /^salary$/m);
});

test("terms already covered by a word negative are not repeated as exact negatives", () => {
  const r = analyze(load(acct).rows);
  assert.ok(!r.exactNegatives.some((e) => /salary|jobs/.test(e.term)));
});

test("terms already excluded are left out of every suggestion", () => {
  const r = analyze(load("a b,Broad match,Excluded,C,90,900,120.00,0,0\na c,Broad match,Excluded,C,90,900,120.00,0,0\nz,Exact match,None,C,50,500,50.00,10,100\n").rows);
  assert.equal(r.buckets.excluded, 240);
  assert.equal(r.wordCandidates.length, 0);
  assert.equal(r.exactNegatives.length, 0);
});

test("target CPA replaces the average as the overspend line and flags expensive converters", () => {
  const rows = load("a,Exact match,None,C,50,500,200.00,10,0\nb,Broad match,None,C,10,100,150.00,1,0\nc,Broad match,None,C,4,60,30.00,0,0\n").rows;
  const r = analyze(rows, { targetCpa: 25 });
  assert.equal(r.summary.cpaRef, 25);
  assert.equal(r.expensive[0].term, "b");
  assert.equal(r.expensive[0].excess, 125);
  assert.equal(r.topWaste[0].tier, "overspent");
});

test("converting terms only reached by broad or phrase are proposed as exact keywords", () => {
  const r = analyze(load("good term,Broad match,None,C,20,200,60.00,4,0\nother,Exact match,None,C,20,200,60.00,4,0\nz,Broad match,None,C,3,30,9.00,0,0\n").rows);
  assert.deepEqual(r.promote.map((p) => p.term), ["good term"]);
});

test("no conversions at all is refused rather than calling everything waste", () => {
  const r = analyze(load("a,Broad match,None,C,5,50,10.00,0,0\n").rows);
  assert.match(r.invalid, /no conversions/);
});

test("the synthetic sample parses cleanly and gives a plausible report", () => {
  const text = sampleCsv();
  const n = normalizeRows(parseCsv(text, detectDelimiter(text)));
  assert.equal(n.error, null);
  assert.equal(n.skipped.length, 0);
  assert.equal(n.totalsRows, 1);
  const r = analyze(n.rows);
  assert.ok(r.summary.wasteShare > 0.15 && r.summary.wasteShare < 0.5);
  assert.ok(r.wordCandidates.some((w) => w.word === "jobs"));
  assert.ok(r.promote.length >= 1);
  assert.ok(r.summary.coveredShare > 0.5 && r.summary.coveredShare <= 1);
  // The sample is deterministic, so the documented figures cannot drift.
  assert.equal(sampleCsv(), text);
});

test("nothing suggested as a negative ever contained a conversion", () => {
  const text = sampleCsv();
  const n = normalizeRows(parseCsv(text));
  const r = analyze(n.rows);
  const converting = n.rows.filter((x) => x.conv > 0);
  for (const w of r.wordCandidates) assert.ok(!converting.some((x) => tokens(x.term).includes(w.word)), w.word);
  for (const e of r.exactNegatives) assert.ok(!converting.some((x) => x.term === e.term), e.term);
});
