import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, reportMarkdown, parseNum, EXAMPLE, FIELDS, DISCLOSURES } from "./calc.mjs";

test("parseNum reads European and English number styles", () => {
  assert.equal(parseNum("1,234.5"), 1234.5);
  assert.equal(parseNum("1.234,5"), 1234.5);
  assert.equal(parseNum("1 234,5"), 1234.5);
  assert.equal(parseNum("0,5"), 0.5);
  assert.equal(parseNum("12,5"), 12.5);
  assert.equal(parseNum(""), null);
  assert.equal(parseNum("abc"), null);
});

test("the example is complete and derives the expected totals", () => {
  const a = analyse(EXAMPLE);
  assert.equal(a.counts.complete, 11);
  assert.equal(a.derived.energyMWh, 490);
  assert.equal(a.derived.renewableMWh, 45);
  assert.equal(a.derived.renewableSharePct, 9.2);
  assert.equal(a.derived.ghgT, 132);
  assert.equal(a.derived.accidentRatePerMillionH, 37.04);
  assert.equal(a.derived.payGapPct, 9.8);
  assert.equal(a.derived.trainingHoursPerMan, 5);
  assert.equal(a.derived.trainingHoursPerWoman, 7.5);
  assert.equal(a.derived.recycledPct, 71.1);
  assert.deepEqual(a.flags.filter((f) => f.level === "error"), []);
});

test("an empty form is all missing and prints 'not reported', never zero", () => {
  const a = analyse({});
  assert.equal(a.counts.missing, 11);
  const md = reportMarkdown({});
  assert.match(md, /Scope 1: not reported/);
  assert.doesNotMatch(md, /Scope 1: 0/);
});

test("a typed zero is a reported zero", () => {
  const md = reportMarkdown({ ...EXAMPLE, fatalities: "0", fines: "0" });
  assert.match(md, /fatalities: 0/);
  assert.match(md, /fines: 0 EUR/);
});

test("consistency checks fire", () => {
  const f = (patch) => analyse({ ...EXAMPLE, ...patch }).flags.map((x) => x.text).join("|");
  assert.match(f({ empTemporary: 5 }), /Permanent plus temporary is 36/);
  assert.match(f({ empFemale: 2 }), /Men, women and other add to 28/);
  assert.match(f({ elecRenMWh: 999 }), /Renewable electricity is larger/);
  assert.match(f({ hazWasteT: 50 }), /Hazardous waste is larger/);
  assert.match(f({ hoursWorked: "" }), /Hours worked are missing/);
  assert.match(f({ factorSource: "" }), /source of the emission factors/);
  assert.match(f({ scope2t: 0 }), /Scope 2 of zero/);
  assert.match(f({ bargainPct: 140 }), /between 0 and 100/);
  assert.match(f({ payFemale: "" }), /both average pay figures/);
  assert.match(f({ waterM3: -5 }), /negative/);
  assert.match(f({ basis: "headcount", empTotal: 34.5 }), /whole number/);
});

test("errors sort before warnings", () => {
  const a = analyse({ ...EXAMPLE, scope2t: 0, empTemporary: 5 });
  assert.equal(a.flags[0].level, "error");
});

test("every field belongs to a known disclosure and ids are unique", () => {
  const ids = new Set();
  for (const f of FIELDS) { assert.ok(DISCLOSURES[f.d], f.id); assert.ok(!ids.has(f.id)); ids.add(f.id); }
  assert.equal(Object.keys(DISCLOSURES).length, 11);
});

test("the year prints without a thousands separator", () => {
  const md = reportMarkdown(EXAMPLE);
  assert.match(md, /Example Metalworks GmbH, 2025/);
  assert.match(md, /Reporting year: 2025/);
});
