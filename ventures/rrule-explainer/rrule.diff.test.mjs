// Differential test against python-dateutil, through fixtures that
// gen_fixtures.py writes by running it on random rules. No Python is needed
// here; regenerate the fixtures to test against another dateutil release.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseInput, parseRule, parseDateValue, expand, icalWall } from "./rrule.mjs";

const fx = JSON.parse(readFileSync(new URL("./rrule.fixtures.json", import.meta.url), "utf8"));

function ours(c, opts) {
  const p = parseInput(`DTSTART:${c.dtstart}\nRRULE:${c.rule}`);
  p.rules = p.rules.map((r) => parseRule(r).rule);
  return expand(p, { limit: fx.take, dtstartMode: "rule", ...opts }).occurrences.map((o) => icalWall(o.day, o.sec));
}

function compare(group, opts) {
  const cases = fx.cases.filter((c) => c.group === group);
  const bad = [];
  for (const c of cases) {
    const got = ours(c, opts);
    if (JSON.stringify(got) !== JSON.stringify(c.out)) bad.push({ rule: c.rule, dtstart: c.dtstart, want: c.out.slice(0, 4), got: got.slice(0, 4) });
  }
  return { cases: cases.length, bad };
}

test(`random RFC-valid rules: flavor "dateutil" gives exactly ${fx.oracle}'s dates`, () => {
  const { cases, bad } = compare("rfc", { flavor: "dateutil" });
  assert.ok(cases >= 1400, `only ${cases} cases`);
  assert.deepEqual(bad.slice(0, 3), [], `${bad.length} of ${cases} differ`);
});

test("random RFC-valid rules: the RFC reading differs only where a WEEKLY rule's BYSETPOS counts days before DTSTART", () => {
  const { cases, bad } = compare("rfc", {});
  for (const b of bad) {
    assert.match(b.rule, /FREQ=WEEKLY/, b.rule);
    assert.match(b.rule, /BYSETPOS=/, b.rule);
    // Only the first week can differ: from the second date dateutil lists on, both agree.
    const want = fx.cases.find((c) => c.rule === b.rule && c.dtstart === b.dtstart).out;
    const got = ours({ rule: b.rule, dtstart: b.dtstart }, {});
    const d0 = parseDateValue(b.dtstart).day;
    const later = (xs) => xs.filter((x) => parseDateValue(x).day >= d0 + 7);
    assert.deepEqual(later(got).slice(0, 3), later(want).slice(0, 3), b.rule);
  }
  assert.ok(bad.length < cases * 0.02, `${bad.length} of ${cases}`);
});

test("mixed BYDAY lists (MO with 2MO): dateutil intersects the two kinds, the RFC takes the union", () => {
  const du = compare("mixed-byday", { flavor: "dateutil" });
  assert.ok(du.cases >= 90);
  assert.deepEqual(du.bad.slice(0, 3), [], `dateutil flavor: ${du.bad.length} of ${du.cases} differ`);
  const rfc = compare("mixed-byday", {});
  assert.ok(rfc.bad.length > du.cases / 2, `RFC reading differs on ${rfc.bad.length}`);
});
