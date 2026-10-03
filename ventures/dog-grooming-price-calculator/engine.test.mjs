import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseClasses, compare, summarizeCompare, parseAppointments, audit, summarizeAudit, normalizeOptions, money } from "./engine.mjs";

const classes = readFileSync(new URL("./fixtures/classes.csv", import.meta.url), "utf8");
const appts = readFileSync(new URL("./fixtures/appointments.csv", import.meta.url), "utf8");
const find = (c, n) => c.classes.find((x) => x.name === n);

test("effective hourly, price for target and walk-away", () => {
  const c = compare(parseClasses(classes), {});
  const g = find(c, "Giant");
  assert.equal(money(g.plain.effective), "$42.43");
  assert.equal(money(g.plain.neededPrice), "$205.47");
  assert.equal(money(g.plain.walkAway), "$158.11");
  assert.equal(c.classes[0].name, "Giant");
  assert.equal(c.below, 5);
  assert.equal(money(find(c, "Small smooth").plain.effective), "$64.60");
});

test("the price for target actually earns the target", () => {
  const c = compare(parseClasses(classes), { driveMinutes: 20, noShowPct: 10 });
  for (const r of c.classes) {
    const redo = compare({ classes: [{ ...r, price: r.plain.neededPrice }] }, { driveMinutes: 20, noShowPct: 10 });
    assert.ok(Math.abs(redo.classes[0].plain.effective - 60) < 1e-6, r.name);
  }
});

test("extras and drive time change the answer", () => {
  const c = compare(parseClasses(classes), {});
  const d = find(c, "Medium doodle");
  assert.equal(money(d.variants[1].effective), "$42.58");
  assert.equal(find(c, "Medium double coat").variants.length, 4);
  assert.equal(money(find(compare(parseClasses(classes), { driveMinutes: 20 }), "Giant").plain.effective), "$38.19");
});

test("no-shows lower the hourly and zero no-shows matches the plain formula", () => {
  const p = parseClasses("A,100,60,0");
  assert.equal(compare(p, { noShowPct: 0 }).classes[0].plain.effective, 100);
  assert.equal(compare(p, { noShowPct: 50 }).classes[0].plain.effective, 50);
});

test("audit groups by class, finds underpayers and the raise per dog", () => {
  const a = audit(parseAppointments(appts), {});
  assert.equal(a.count, 12);
  assert.equal(money(a.revenue), "$1,265.00");
  assert.equal(a.hours.toFixed(2), "27.11");
  assert.equal(money(a.blendedHourly), "$44.01");
  assert.equal(a.below, 5);
  assert.equal(money(a.shortfall), "$436.32");
  assert.equal(a.classes[0].name, "Giant");
  assert.equal(money(a.classes[0].raisePerDog), "$66.79");
  assert.equal(money(a.classes[0].neededAvgPrice), "$221.79");
  assert.match(summarizeAudit(a).text, /^5 of 6 classes underpay/);
  assert.match(summarizeCompare(compare(parseClasses(classes), {})).text, /^5 of 6 classes earn under/);
});

test("class names group case-insensitively", () => {
  const a = audit(parseAppointments("Giant,100,60\ngiant,100,60"), {});
  assert.equal(a.classes.length, 1);
  assert.equal(a.classes[0].count, 2);
});

test("parsers report line numbers and never throw", () => {
  assert.match(parseClasses("A,x,30").errors[0], /Line 1: price/);
  assert.match(parseClasses("A,10,0").errors[0], /minutes/);
  assert.match(parseClasses("A,10").errors[0], /expected class/);
  assert.match(parseClasses("A,10,30,-1").errors[0], /supplies/);
  assert.match(parseAppointments("class,price,minutes\nA,10").errors[0], /Line 2/);
  assert.match(parseAppointments(",10,30").errors[0], /empty/);
  assert.equal(parseAppointments(null).appointments.length, 0);
  const many = Array.from({ length: 501 }, () => "A,10,10").join("\n");
  assert.match(parseAppointments(many).errors[0], /Too many/);
});

test("options are validated", () => {
  assert.throws(() => normalizeOptions({ targetHourly: "x" }), /must be a number/);
  assert.throws(() => normalizeOptions({ noShowPct: 99 }), /between/);
  assert.equal(normalizeOptions({}).targetHourly, 60);
});

test("empty inputs summarize safely", () => {
  assert.equal(summarizeCompare(compare({ classes: [] })).status, "empty");
  assert.equal(summarizeAudit(audit({ appointments: [] })).status, "empty");
});
