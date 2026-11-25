import test from "node:test";
import assert from "node:assert/strict";
import { readRequirement, readResults, judge, readTable, checkFai, faiCsv, summaryText } from "./fai.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const lim = (text, general) => { const r = readRequirement(text, general); return [r.kind, r.lower, r.upper]; };

test("bilateral, unequal, limit, max/min and diameter forms", () => {
  let r = readRequirement("Ø12.000 ±0.010"); close(r.lower, 11.99); close(r.upper, 12.01);
  r = readRequirement(".500 +/- .005"); close(r.lower, 0.495); close(r.upper, 0.505);
  r = readRequirement("0.500 +.002/-.000"); close(r.lower, 0.5); close(r.upper, 0.502);
  r = readRequirement("0.500 -0.001 +0.003"); close(r.lower, 0.499); close(r.upper, 0.503);
  r = readRequirement("25.00 −0.02 +0.00"); close(r.lower, 24.98); close(r.upper, 25);
  r = readRequirement("1.005/1.000"); close(r.lower, 1); close(r.upper, 1.005);
  r = readRequirement("12.00-12.05"); close(r.lower, 12); close(r.upper, 12.05);
  r = readRequirement("R.03 MAX"); assert.equal(r.lower, null); close(r.upper, 0.03);
  r = readRequirement("MIN 0.120"); close(r.lower, 0.12); assert.equal(r.upper, null);
  r = readRequirement('4X Ø.250 ±.002"'); assert.equal(r.count, 4); close(r.lower, 0.248);
  r = readRequirement(".125 ±.005 2 PLACES"); assert.equal(r.count, 2); close(r.upper, 0.13);
});

test("geometric tolerances read as 0 to the tolerance; a modifier is noted, never added", () => {
  let r = readRequirement("⌖ Ø.010 Ⓜ A B C");
  assert.deepEqual([r.kind, r.lower, r.upper], ["variable", 0, 0.01]);
  assert.match(r.notes.join(" "), /bonus tolerance is not added/);
  r = readRequirement("Flatness .002"); assert.deepEqual([r.lower, r.upper], [0, 0.002]);
  r = readRequirement("perpendicularity 0.05 A"); assert.deepEqual([r.lower, r.upper], [0, 0.05]);
  assert.equal(readRequirement("Position").kind, "unread");
});

test("surface finish, basic, reference, threads and notes", () => {
  assert.deepEqual(lim("32 Ra"), ["variable", null, 32]);
  assert.deepEqual(lim("Ra 0.8"), ["variable", null, 0.8]);
  assert.equal(readRequirement("[1.000]").kind, "reference");
  assert.equal(readRequirement("2.500 BSC").kind, "reference");
  assert.equal(readRequirement("(3.25)").kind, "reference");
  assert.equal(readRequirement("M6x1.0-6H").kind, "attribute");
  assert.equal(readRequirement("1/4-20 UNC-2B").kind, "attribute");
  assert.equal(readRequirement("Break all sharp edges").kind, "attribute");
  assert.equal(readRequirement("NOTE 4").kind, "attribute");
});

test("a bare nominal uses the general tolerance for its decimal places, and is unread without one", () => {
  const general = { linear: { 2: 0.01, 3: 0.005 }, angular: 0.5 };
  let r = readRequirement("1.250", general); close(r.lower, 1.245); close(r.upper, 1.255);
  r = readRequirement("1.25", general); close(r.lower, 1.24);
  r = readRequirement("45°", general); close(r.lower, 44.5); close(r.upper, 45.5);
  r = readRequirement("1.2", general); assert.equal(r.kind, "unread"); assert.match(r.reason, /1 decimal places/);
  assert.equal(readRequirement("1.250").kind, "unread");
});

test("results: numbers, accept/reject marks, units, and what it cannot read", () => {
  assert.deepEqual(readResults('0.4995 0.5012" ; 0.501mm'), { values: [0.4995, 0.5012, 0.501], marks: [], unread: [] });
  assert.deepEqual(readResults("ACC"), { values: [], marks: ["pass"], unread: [] });
  assert.deepEqual(readResults("REJ"), { values: [], marks: ["fail"], unread: [] });
  assert.deepEqual(readResults("see report").unread, ["see", "report"]);
});

test("judging: in, out, at the limit, near the limit, missing, count shortfall", () => {
  assert.equal(judge({ requirement: ".500 ±.005", results: ".505" }).status, "accept");
  const out = judge({ requirement: ".500 ±.005", results: ".5051" });
  assert.equal(out.status, "reject");
  assert.match(out.issues.join(";"), /out of tolerance: 0.5051/);
  assert.match(out.issues.join(";"), /no nonconformance number/);
  assert.doesNotMatch(judge({ requirement: ".500 ±.005", results: ".5051", ncr: "NCR-12" }).issues.join(";"), /nonconformance/);
  const near = judge({ requirement: ".500 ±.005", results: ".5045" });
  assert.equal(near.status, "accept");
  assert.match(near.issues.join(";"), /within 10% of the tolerance band/);
  assert.equal(near.tolUsedPct, 90);
  assert.doesNotMatch(judge({ requirement: ".500 ±.005", results: ".5035" }).issues.join(";"), /within/);
  assert.match(judge({ requirement: "Flatness .002", results: ".0019" }).issues.join(";"), /within 10%/);
  assert.equal(judge({ requirement: "Flatness .002", results: ".0021" }).status, "reject");
  const pos = judge({ requirement: "⌖ Ø.010 Ⓜ A B C", results: ".0001 .0062" });
  assert.equal(pos.tolUsedPct, 62, "a geometric tolerance is scored from zero");
  assert.doesNotMatch(pos.issues.join(";"), /within 10%/, "a reading near zero is not near a limit");
  assert.equal(judge({ requirement: ".500 ±.005", results: "" }).status, "missing");
  assert.match(judge({ requirement: "4X Ø.250 ±.002", results: ".250 .251" }).issues.join(";"), /4 places on the drawing, 2 results/);
  assert.match(judge({ requirement: ".500 ±.005", results: "ACC" }).issues.join(";"), /actual value/);
  assert.equal(judge({ requirement: "M6x1.0-6H", results: "GO" }).status, "accept");
  assert.equal(judge({ requirement: "M6x1.0-6H", results: "NO-GO" }).status, "reject");
  assert.equal(judge({ requirement: "1.250", results: "1.25" }).status, "unread");
  assert.equal(judge({ requirement: "[1.000]", results: "" }).status, "reference");
  assert.equal(judge({ requirement: "32 Ra", results: "28" }).status, "accept");
  assert.equal(judge({ requirement: "32 Ra", results: "40" }).status, "reject");
});

test("one value of several out of tolerance rejects the characteristic", () => {
  const r = judge({ requirement: "12.000 ±0.010", results: "12.004 12.011 11.999" });
  assert.equal(r.status, "reject");
  assert.match(r.issues.join(";"), /out of tolerance: 12.011/);
});

test("table: header mapping, joined result columns, quoted CSV, tab-separated", () => {
  const csv = 'Char No.,Reference Location,Characteristic Designator,Requirement,Result 1,Result 2,Designed / Qualified Tooling,Nonconformance Number\n1,B3,,".500 ±.005",.501,.502,Mic 0-1,\n2,C4,KC,"Ø.250, +.001/-.000",.2505,,Pin gauge,\n';
  const t = readTable(csv);
  assert.deepEqual(t.columns.slice(0, 8), ["char", "location", "designator", "requirement", "results", "results", "tooling", "ncr"]);
  assert.equal(t.rows[0].results, ".501 .502");
  assert.equal(t.rows[1].requirement, "Ø.250, +.001/-.000");
  assert.equal(t.rows[1].designator, "KC");
  const tsv = readTable("Balloon\tDimension\tActual\n1\t.500 ±.005\t.501");
  assert.equal(tsv.rows[0].requirement, ".500 ±.005");
  const bare = readTable("1,.500 ±.005,.501,.502");
  assert.equal(bare.rows[0].results, ".501 .502");
  assert.match(bare.warnings[0], /no header row/);
});

test("whole check: repeats, gaps, readiness and the summary", () => {
  const good = checkFai("Char,Requirement,Result\n1,.500 ±.005,.501\n2,M6x1.0-6H,ACC\n3,[1.000],");
  assert.equal(good.summary.ready, true);
  assert.match(summaryText(good), /Every characteristic has a result inside its limits/);
  const bad = checkFai("Char,Requirement,Result\n1,.500 ±.005,.501\n1,.250 ±.005,.250\n4,.100 ±.005,");
  assert.equal(bad.summary.ready, false);
  assert.deepEqual(bad.summary.gaps, [2, 3]);
  assert.match(bad.rows[1].issues[0], /repeated \(also line 2\)/);
  assert.equal(bad.summary.missing, 1);
  assert.match(summaryText(bad), /missing from the sequence: 2, 3/);
  assert.equal(checkFai("").summary.ready, false);
});

test("CSV keeps negative numbers, neutralises formulas and quotes commas", () => {
  const r = checkFai('Char,Requirement,Result,NCR\n1,"=HYPERLINK(""x"")",-0.002,\n2,"-1.000 ±.005",-1.001,"@SUM(A1)"');
  const csv = faiCsv(r);
  assert.match(csv, /^Char No\.,Reference Location/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /,-1.001,/);
  assert.match(csv, /,'@SUM\(A1\),/);
  assert.match(csv, /,-1.005,-0.995,/);
});
