// Property test over the English the tool prints. The page shows describe()
// and every finding title to people, so wording bugs are user-visible bugs:
// 2026-11-18 red team found "on day last of the year" (negative BYYEARDAY)
// and "Unknown rule part " with a blank name. This runs every fixture rule
// (random RFC-valid rules, negative values included) plus hostile parts
// through analyze() and rejects the shapes those bugs had.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "./rrule.mjs";

const fx = JSON.parse(readFileSync(new URL("./rrule.fixtures.json", import.meta.url), "utf8"));

const BAD = [
  [/\b(day|days|week|weeks) (last|\d+(st|nd|rd|th))\b/, "an ordinal straight after 'day'/'week' (read it from the end: 'the last day')"],
  [/\b(1[123])(st|nd|rd)\b/, "11st, 12nd or 13rd"],
  [/\b\d*[02-9](1th|2th|3th)\b|\b1th\b|\b2th\b|\b3th\b/, "1th, 2th or 3th"],
  [/undefined|NaN|null|\[object/, "a JS value leaking into the text"],
  [/ {2,}|\s[,.]|\s$/, "doubled or stray space"],
  [/(Unknown rule part|time zone|appears twice)\s*$|^\s|""/, "a blank where a name belongs"],
];

function problems(text) {
  return BAD.filter(([re]) => re.test(text)).map(([, why]) => why);
}

function check(input, out) {
  const r = analyze({ text: input, limit: 3 });
  for (const s of r.description) for (const why of problems(s)) out.push({ input, text: s, why });
  for (const f of r.findings) for (const why of problems(f.title)) out.push({ input, text: f.title, why });
}

test("describe() and finding titles read as English for every fixture rule", () => {
  const bad = [];
  for (const c of fx.cases) check(`DTSTART:${c.dtstart}\nRRULE:${c.rule}`, bad);
  assert.ok(fx.cases.length >= 1500, `only ${fx.cases.length} cases`);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} wording problems`);
});

test("hostile rule parts still give named, readable findings", () => {
  const parts = ["=WEEKLY", "=", "COUNT=", "FREQ", ";;", "X=1", "BYDAY=", "BYYEARDAY=-1,-366,1", "BYWEEKNO=-1,-53,1", "BYMONTHDAY=-11,-12,-13,11,12,13,21,22,23,31", "BYSETPOS=-11,11,21,-1", "BYDAY=11MO,-12TU,13WE,21TH,22FR,23SA", "WKST=XX", "UNTIL=nope", "INTERVAL=-1"];
  const bad = [];
  for (const freq of ["YEARLY", "MONTHLY", "WEEKLY", "DAILY"]) for (const p of parts) check(`DTSTART:20260105T090000\nRRULE:FREQ=${freq};${p};COUNT=3`, bad);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} wording problems`);
});
