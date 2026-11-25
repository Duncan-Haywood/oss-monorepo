import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { compute, sovLines, sovCsv, nextMonthCsv, summaryText, sampleLog, SAMPLE_SETTINGS } from "./stored.mjs";
import * as calc from "./calc.mjs";

const GEN = new URL("../pay-application-generator/calc.mjs", import.meta.url);
const generator = existsSync(GEN) ? await import(GEN.href) : null;

const HEAD = "Item,Description,Scheduled value,Previous,Stored last app,Delivered,Installed,Other work,Location,Documented";
const log = (...rows) => [HEAD, ...rows].join("\n");

test("sample: rollforward matches a hand calculation", () => {
  const r = compute(sampleLog(), SAMPLE_SETTINGS);
  assert.deepEqual(r.errors, []);
  const t = r.totals;
  assert.equal(t.storedLast, 1750000);
  assert.equal(t.delivered, 4800000);
  assert.equal(t.installed, 1300000);
  assert.equal(t.storedNow, 5250000); // 17,500 + 48,000 - 13,000
  assert.equal(t.storedOnsite, 2250000);
  assert.equal(t.storedOffsite, 3000000);
  assert.equal(t.thisPeriod, 3070000); // 10,000 + 10,500 + 6,400 + 0 + 3,800
  assert.equal(t.completedStored, 11980000);
  assert.equal(t.retainageOnStored, 525000);
  assert.equal(t.storedChange, 3500000);
  const sw = r.lines[1];
  assert.equal(sw.storedNow, 600000);
  assert.equal(sw.E, 1050000);
  assert.equal(sw.G, 2550000);
});

test("the rollforward identity holds on every line: stored last + delivered = installed + stored now", () => {
  for (const x of compute(sampleLog(), SAMPLE_SETTINGS).lines) assert.equal(x.storedLast + x.delivered, x.installed + x.storedNow, x.label);
});

test("installed material is billed once: the calculator's total completed and stored equals previous + other work + everything stored or delivered", () => {
  const r = compute(sampleLog(), SAMPLE_SETTINGS);
  const c = calc.compute(sovLines(r), { workRetainage: "10", storedRetainage: "10" });
  assert.deepEqual(c.findings.filter((f) => f.level === "high"), []);
  const t = r.totals;
  const previous = r.lines.reduce((a, x) => a + x.previous, 0);
  assert.equal(c.totals.completedStored, previous + t.otherWork + t.storedLast + t.delivered);
  assert.equal(c.totals.completedStored, t.completedStored);
  assert.equal(c.totals.stored, t.storedNow);
  assert.equal(c.totals.retainageOnStored, t.retainageOnStored);
});

test("SOV lines round-trip through the pay application generator", { skip: !generator }, () => {
  const r = compute(sampleLog(), SAMPLE_SETTINGS);
  const g = generator.compute(sovCsv(r), { retainagePct: "10" });
  assert.deepEqual(g.errors, []);
  assert.equal(g.summary.completed, r.totals.completedStored);
  assert.equal(g.summary.retStored, r.totals.retainageOnStored);
  assert.equal(g.lines[1].f, r.lines[1].storedNow);
  assert.equal(g.lines[1].e, r.lines[1].E);
});

test("next month starts from this month's closing figures", () => {
  const r = compute(sampleLog(), SAMPLE_SETTINGS);
  const next = compute(nextMonthCsv(r), SAMPLE_SETTINGS);
  assert.deepEqual(next.errors, []);
  assert.equal(next.totals.storedLast, r.totals.storedNow);
  assert.equal(next.totals.completedStored, r.totals.completedStored);
  next.lines.forEach((x, i) => assert.equal(x.previous, r.lines[i].previous + r.lines[i].E));
});

test("flags: over-installing, over the line, off-site without authority or papers, idle stock", () => {
  const r = compute(log("1,a,1000,0,100,0,300,0,on site,yes", "2,b,1000,800,0,300,0,0,site,yes", "3,c,5000,0,0,1000,0,0,warehouse,", "4,d,1000,0,200,0,0,100,on site,yes"), SAMPLE_SETTINGS);
  assert.deepEqual(r.errors, []);
  const text = r.findings.map((f) => f.title).join("\n");
  assert.match(text, /Item 1 \(a\): \$300\.00 installed from stock, but only \$100\.00/);
  assert.match(text, /Item 2 \(b\): work completed plus stored \(\$1,100\.00\)/);
  assert.match(text, /Item 3 \(c\): \$1,000\.00 stored off site.*FAR 52\.232-5/);
  assert.match(text, /Item 3 \(c\): off-site material with no documentation/);
  assert.match(text, /Item 4 \(d\): \$200\.00 stored last period and none installed/);
  assert.equal(r.findings[0].severity, "high");
  const allowed = compute(log("3,c,5000,0,0,1000,0,0,off-site,yes"), { ...SAMPLE_SETTINGS, offsiteAllowed: true });
  assert.equal(allowed.findings.filter((f) => f.severity === "high").length, 0);
});

test("bad input is named, not guessed", () => {
  assert.match(compute("Item,Scheduled value\n1,100", {}).errors[0], /installed column/);
  assert.match(compute("Scheduled value,Installed\n100,0", {}).errors[0], /stored materials columns/);
  assert.match(compute(log("1,a,abc,0,0,0,0,0,on site,"), {}).errors[0], /scheduled is not a dollar/);
  assert.match(compute(log("1,a,100,0,-5,0,0,0,on site,"), {}).errors[0], /stored last app cannot be negative/);
  assert.match(compute(log("1,a,100,0,0,0,0,0,the moon,"), {}).errors[0], /should be on site or off site/);
  assert.match(compute(log("1,a,100,0,0,0,0,0,,"), { workRetainage: "ten" }).errors[0], /percentages/);
  assert.match(compute("", {}).errors[0], /header row/);
});

test("different stored and work retainage rates are noted; summary lists the rollforward", () => {
  const r = compute(sampleLog(), { workRetainage: "5", storedRetainage: "10" });
  assert.ok(r.findings.some((f) => /moves to the work rate/.test(f.title)));
  const s = summaryText(r);
  assert.match(s, /= Stored now \(column F\)\s+\$52,500\.00/);
  assert.match(s, /Retainage on stored now at 10\.0%\s+\$5,250\.00/);
});

test("CSV output defuses spreadsheet formulas in descriptions", () => {
  const r = compute(log('1,"=HYPERLINK(1)",100,0,0,50,0,0,on site,yes'), SAMPLE_SETTINGS);
  assert.match(sovCsv(r), /'=HYPERLINK/);
});

// Red team 2026-11-25 (escaped mutants): a $0 line with work billed is over its value, and the
// mostly-stored hint uses the line's value even when it is a single cent.
test("zero-value line with billing is flagged; one-cent line still gets the stored-share hint", () => {
  const r = compute(log("1,Extra,0,0,0,0,0,500,on site,yes"), SAMPLE_SETTINGS);
  assert.ok(r.findings.some((f) => f.severity === "high" && /more than the scheduled value/.test(f.title)));
  const c = compute(log("1,Tiny,0.01,0,0,0.01,0,0,on site,yes"), SAMPLE_SETTINGS);
  assert.ok(c.findings.some((f) => /no work is billed yet/.test(f.title)));
});

// Red team 2026-11-25: "10 %" (a space before the sign) was refused while calc.mjs accepts it.
test("retainage typed with a space before % is read", () => {
  const r = compute(sampleLog(), { workRetainage: "10 %", storedRetainage: " 5 % " });
  assert.deepEqual(r.errors, []);
  assert.equal(r.totals.workRate, 0.1);
  assert.equal(r.totals.storedRate, 0.05);
});
