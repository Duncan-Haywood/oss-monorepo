import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseRows, gap, normGender, obligation, sampleInput, toCsv } from "./calc.mjs";

test("gap is (men - women) / men, positive when men earn more", () => {
  assert.equal(gap(100, 90), 10);
  assert.equal(gap(100, 110), -10);
  assert.equal(gap(0, 5), null);
});

test("hand-computed mean and median gaps from hourly pay", () => {
  // women: 20, 30 -> mean 25, median 25; men: 30, 40, 50 -> mean 40, median 40
  const csv = "gender,category,base,hours\nF,A,20,1\nF,A,30,1\nM,A,30,1\nM,A,40,1\nM,A,50,1";
  const r = analyze(csv);
  assert.equal(r.meanGap, 37.5);
  assert.equal(r.medianGap, 37.5);
  assert.equal(r.categories[0].totalGap, 37.5);
  assert.equal(r.categories[0].flag, true);
});

test("annual pay is converted to hourly using the hours column", () => {
  // woman: 36000/1800 = 20/h; man: 40000/2000 = 20/h -> no gap although annual pay differs
  const r = analyze("gender,base,hours\nF,36000,1800\nM,40000,2000");
  assert.equal(r.meanGap, 0);
});

test("variable pay gap uses recipients only and share receiving is reported", () => {
  const r = analyze("gender,base,bonus,hours\nF,10,0,1\nF,10,5,1\nM,10,10,1\nM,10,10,1");
  assert.equal(r.variable.shareF, 50);
  assert.equal(r.variable.shareM, 100);
  assert.equal(r.variableMeanGap, 50); // men 10 vs women 5 among recipients
});

test("quartiles split ranked workers into four equal parts", () => {
  const rows = ["gender,base,hours"];
  for (let i = 1; i <= 8; i++) rows.push(`${i <= 2 ? "F" : "M"},${i * 10},1`);
  const r = analyze(rows.join("\n"));
  assert.deepEqual(r.quartiles.map((q) => q.women), [2, 0, 0, 0]);
  assert.deepEqual(r.quartiles.map((q) => q.men), [0, 2, 2, 2]);
  assert.equal(r.quartiles[0].womenPct, 100);
});

test("a category with one gender is not comparable and not flagged", () => {
  const r = analyze("gender,category,base\nF,Solo,50\nF,Pair,50\nM,Pair,100");
  const solo = r.categories.find((c) => c.category === "Solo");
  assert.equal(solo.comparable, false);
  assert.equal(solo.flag, undefined);
  assert.equal(r.categories.find((c) => c.category === "Pair").totalGap, 50);
});

test("a gap just under 5% is not flagged and exactly 5% is", () => {
  assert.equal(analyze("gender,category,base\nF,A,95.1\nM,A,100").flagged.length, 0);
  assert.equal(analyze("gender,category,base\nF,A,95\nM,A,100").flagged.length, 1);
});

test("a negative gap beyond 5% (men paid less) is flagged too", () => {
  assert.equal(analyze("gender,category,base\nF,A,110\nM,A,100").flagged.length, 1);
});

test("headerless rows, semicolons, tabs, currency symbols and other genders", () => {
  assert.equal(parseRows("F;Eng;€50 000;0;1800\nM;Eng;60000;0;1800").rows.length, 2);
  const t = parseRows("F\tEng\t50000\t\t1800\nM\tEng\t60000\t\t1800");
  assert.equal(t.rows[0].variable, 0);
  const r = analyze("gender,base\nF,10\nM,10\nnonbinary,99");
  assert.equal(r.counts.other, 1);
  assert.equal(r.meanGap, 0);
});

test("bad rows are skipped and counted; unusable input returns an error", () => {
  const p = parseRows("gender,base\nF,10\nM,abc\nM,-5\nM,12");
  assert.equal(p.rows.length, 2);
  assert.equal(p.skipped, 2);
  assert.ok(parseRows("").error);
  assert.ok(analyze("gender,base\nF,10\nF,12").error);
});

test("gender normalisation", () => {
  assert.equal(normGender("Female"), "F");
  assert.equal(normGender(" m "), "M");
  assert.equal(normGender("x"), "other");
});

test("reporting obligation depends on headcount", () => {
  assert.match(obligation(300), /annual/);
  assert.match(obligation(120), /three years/);
  assert.match(obligation(40), /no mandatory/);
  assert.equal(obligation(0), null);
});

test("sample runs and exports CSV", () => {
  const r = analyze(sampleInput());
  assert.ok(!r.error);
  assert.ok(r.flagged.length >= 1);
  assert.match(toCsv(r), /mean hourly pay gap/);
});
