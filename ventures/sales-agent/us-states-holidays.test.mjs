// US state holiday presets (added 2026-11-12): the rules in holidays.mjs against a second source, python-holidays
// 0.108 (MIT), for every weekday holiday of 2022-2028 in 50 states and DC, and the federal rules against the same.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { usStateHolidays, usFederalHolidays, easter, holidayChecker, upcomingHolidays, theirDaysOff } from "./holidays.mjs";

const ref = JSON.parse(readFileSync(new URL("./fixtures/us-state-holidays-python-holidays-0.108.json", import.meta.url)));
const YEARS = [2022, 2023, 2024, 2025, 2026, 2027, 2028];
const weekday = (d) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w > 0 && w < 6; };
const inRange = (d) => d >= "2022-01-01" && d <= "2028-12-31";
const ours = (f) => new Set(YEARS.flatMap((y) => f(y).map((h) => h.date)).filter((d) => inRange(d) && weekday(d)));

// The deliberate differences (holidays.mjs, the note above usStateHolidays), worked out from the rule, not listed by
// hand: Susan B. Anthony Day (15 February) in four states, and Texas's skeleton-crew and optional days.
function leftOut(st, have) {
  const out = new Set();
  for (const y of YEARS) {
    const cand = [];
    if (["CA", "FL", "NY", "WI"].includes(st)) cand.push(`${y}-02-15`);
    if (st === "TX") {
      const [m, d] = easter(y), gf = new Date(Date.UTC(y, m, d - 2)).toISOString().slice(0, 10);
      cand.push(`${y}-01-19`, `${y}-03-02`, `${y}-03-31`, `${y}-04-21`, `${y}-08-27`, gf);
    }
    for (const c of cand) if (weekday(c) && !have.has(c)) out.add(c);
  }
  return out;
}

test("US federal rules match python-holidays, every weekday holiday 2022-2028", () => {
  assert.deepEqual([...ours(usFederalHolidays)].sort(), [...ref.federal].sort());
});

test("50 states and DC match python-holidays date for date, 2022-2028, but for the listed differences", () => {
  assert.equal(Object.keys(ref.states).length, 51);
  let shared = 0, skipped = 0;
  for (const [st, list] of Object.entries(ref.states)) {
    const have = ours((y) => usStateHolidays(y, st)), theirs = new Set(list);
    const extra = [...have].filter((d) => !theirs.has(d));
    assert.deepEqual(extra, [], `${st}: dates we give that python-holidays does not`);
    const missing = list.filter((d) => !have.has(d)).sort();
    const expected = [...leftOut(st, have)].filter((d) => theirs.has(d)).sort();
    assert.deepEqual(missing, expected, `${st}: dates python-holidays gives that we do not`);
    shared += have.size; skipped += missing.length;
  }
  // Pinned so a change to either side shows up as a number, not only a pass.
  assert.equal(shared, 4166);
  assert.equal(skipped, 50);
});

test("state presets in a holidays spec; Massachusetts keeps a Saturday holiday on the Saturday", () => {
  const tx = holidayChecker("us-tx");
  assert.ok(tx("2026-11-27") && tx("2026-12-24"), "Texas closes the day after Thanksgiving and Christmas Eve");
  assert.ok(!tx("2026-10-12"), "Texas offices work Columbus Day");
  assert.ok(!tx("2026-03-02"), "Texas Independence Day is a skeleton-crew day, offices open");
  const ma = holidayChecker("US-MA");
  assert.ok(ma("2026-04-20"), "Patriots' Day, third Monday of April");
  assert.ok(!ma("2026-07-03"), "4 July 2026 is a Saturday: Massachusetts does not move it to Friday");
  assert.ok(holidayChecker("us")("2026-07-03"), "the federal list does");
  const ga = usStateHolidays(2026, "ga");
  assert.ok(ga.some((h) => h.date === "2026-12-24" && h.name === "Washington's Birthday"), "Georgia keeps it next to Christmas");
  assert.ok(!ga.some((h) => h.date === "2026-02-16"));
  assert.ok(holidayChecker("us-la")("2026-02-17"), "Mardi Gras in Louisiana");
  assert.ok(holidayChecker("us-ny")("2027-11-02") && !holidayChecker("us-nj")("2027-11-02"), "Election Day: every year in NY, even years in NJ");
  assert.ok(holidayChecker("us-ca")("2027-10-29"), "Diwali, from the table");
  assert.ok(holidayChecker("us-dc")("2026-04-16"), "DC Emancipation Day");
  assert.deepEqual(upcomingHolidays("us-ak", "2026-10-01", 2).map((h) => h.name), ["Columbus Day", "Alaska Day"]);
  assert.throws(() => holidayChecker("us-zz"), /US state/);
  assert.throws(() => usStateHolidays(2026, "pr"), /unknown state/);
});

test("a prospect's US region means the business six, not the state's office calendar", () => {
  const read = theirDaysOff();
  assert.equal(read({}, { region: "US-TX" }).spec, "us-business");
  assert.equal(read({}, { holidays: "us-tx", region: "US-TX" }).spec, "us-tx", "the holidays column wins");
  assert.ok(!read({}, { region: "US-TX" }).isOff("2026-12-24"));
  assert.ok(read({}, { holidays: "us-tx" }).isOff("2026-12-24"));
});
