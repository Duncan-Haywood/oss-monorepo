import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, buildCode, parseCode, taxToDate, SAMPLE, SAMPLE_BUILD, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const build = (o) => buildCode({ ...SAMPLE_BUILD, ...o });

test("1257L is 12,579 tax-free and standard region", () => {
  const c = parseCode("1257L");
  assert.equal(c.allowance, 12579);
  assert.equal(c.region, "rUK");
  assert.equal(c.nonCumulative, false);
});

test("prefixes, flat codes and the emergency basis are recognised", () => {
  assert.equal(parseCode("s1257l").region, "Scotland");
  assert.equal(parseCode("C1257L").regionLabel, "Wales (C prefix)");
  assert.equal(parseCode("BR").rate, 0.2);
  assert.equal(parseCode("D0").rate, 0.4);
  assert.equal(parseCode("SD1").rate, 0.42);
  assert.equal(parseCode("NT").type, "nt");
  assert.equal(parseCode("0T").type, "zero");
  assert.equal(parseCode("K475").allowance, -4759);
  const e = parseCode("1257L M1");
  assert.equal(e.nonCumulative, true);
  assert.equal(parseCode("1257L W1").nonCumulative, true);
  assert.equal(parseCode("1257LX").nonCumulative, true);
});

test("junk codes are rejected, never guessed", () => {
  assert.ok(parseCode("hello").error);
  assert.ok(parseCode("").error);
  assert.ok(parseCode("D2").error);
});

test("cumulative standard code: half a year on 30,000 pays 1,742", () => {
  assert.equal(taxToDate(parseCode("1257L"), 15000, 6, 12), 1742);
  const r = run({ code: "1257L", taxPaid: "1742" });
  assert.equal(r.vsCode, 0);
  assert.equal(r.vsStd, 0);
});

test("BR on the same pay overpays against the standard code", () => {
  const r = run({});
  assert.equal(r.onCode, 3000);
  assert.equal(r.vsStd, 1258);
  assert.ok(r.findings.some((f) => /flat-rate code/.test(f.title)));
});

test("month 1 basis taxes each period alone", () => {
  assert.equal(taxToDate(parseCode("1257L M1"), 15000, 6, 12), 1741.2);
});

test("higher rate kicks in above the scaled basic band", () => {
  const std = parseCode("1257L");
  const t = taxToDate(std, 60000, 12, 12);
  assert.equal(t, Math.floor(((37700 * 0.2) + (60000 - 12579 - 37700) * 0.4) * 100) / 100);
});

test("Scottish bands apply for S codes", () => {
  assert.equal(taxToDate(parseCode("S1257L"), 30000, 12, 12), 3449.18);
});

test("NT pays nothing and K adds to pay", () => {
  assert.equal(taxToDate(parseCode("NT"), 20000, 12, 12), 0);
  assert.ok(taxToDate(parseCode("K475"), 20000, 12, 12) > taxToDate(parseCode("0T"), 0, 12, 12));
});

test("weekly and four-weekly periods validate against the year", () => {
  assert.ok(compute({ ...SAMPLE, frequency: "weekly", period: "53" }).errors.length);
  assert.equal(compute({ ...SAMPLE, frequency: "fourweekly", period: "13" }).errors.length, 0);
  assert.ok(compute({ ...SAMPLE, period: "0" }).errors.length);
});

test("bad inputs are errors", () => {
  assert.ok(run({ gross: "" }).errors.length);
  assert.ok(run({ taxPaid: "-1" }).errors.length);
  assert.ok(run({ frequency: "daily" }).errors.length);
});

test("a lower allowance is costed at 20 and 40 percent", () => {
  const r = run({ code: "1000L", gross: "15000", taxPaid: "2000" });
  assert.equal(r.gapAllowance, 12579 - 10009);
  assert.ok(r.findings.some((f) => /less allowance/.test(f.title)));
});

test("summary names the code and carries the disclaimer", () => {
  const s = summaryText(run({}));
  assert.match(s, /BR/);
  assert.match(s, /No warranty/);
});

test("builder: benefits cut the allowance, round down to a code", () => {
  const r = build({});
  assert.equal(r.codeText, "937L");
});

test("builder: marriage allowance gives M and N codes", () => {
  assert.equal(build({ income: "30000", benefits: "0", marriage: "received" }).codeText, "1383M");
  assert.equal(build({ income: "30000", benefits: "0", marriage: "given" }).codeText, "1131N");
});

test("builder: the 100k taper and the zero-allowance case", () => {
  assert.equal(build({ income: "110000", benefits: "0" }).codeText, "757L");
  assert.equal(build({ income: "130000", benefits: "0" }).codeText, "0T");
});

test("builder: too many benefits makes a K code, and underpayment collection reduces the code", () => {
  assert.equal(build({ income: "20000", benefits: "20000" }).codeText, "K743");
  assert.equal(build({ income: "30000", benefits: "0", underpayment: "500", underpaymentRate: "20" }).codeText, "1007L");
});

test("builder: region prefixes and validation", () => {
  assert.equal(build({ region: "Scotland", income: "30000", benefits: "0" }).codeText, "S1257L");
  assert.equal(build({ region: "Wales", income: "30000", benefits: "0" }).codeText, "C1257L");
  assert.ok(build({ income: "" }).errors.length);
  assert.ok(build({ region: "Mars" }).errors.length);
});
