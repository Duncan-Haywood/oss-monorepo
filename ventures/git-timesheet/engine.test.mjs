import test from "node:test";
import assert from "node:assert/strict";
import { parseLog, sessions, summarize, describe, toMarkdown, toCsv, gate } from "./engine.mjs";

const log = [
  "aaaa111|Ada|2026-09-01T09:00:00+02:00|feat(api): add invoices endpoint",
  "bbbb222|Ada|2026-09-01T09:50:00+02:00|fix: rounding",
  "cccc333|Ada|2026-09-01T14:00:00+02:00|docs: readme",
  "dddd444|Bob|2026-09-01T09:10:00+02:00|Merge branch 'main'",
  "eeee555|Bob|2026-09-02T23:30:00-05:00|chore: late night",
  "not a commit line",
].join("\n");

test("parseLog skips malformed lines and keeps the local day", () => {
  const { commits, bad } = parseLog(log);
  assert.equal(commits.length, 5);
  assert.equal(bad.length, 1);
  assert.equal(commits.find((c) => c.sha === "eeee555").day, "2026-09-02");
});

test("sessions split on the idle gap and add lead time", () => {
  const { commits } = parseLog(log);
  const ss = sessions(commits.filter((c) => c.author === "Ada"), { gap: 120, lead: 30 });
  assert.equal(ss.length, 2);
  assert.equal(ss[0].minutes, 50 + 30);
  assert.equal(ss[1].minutes, 30);
});

test("summarize bills each contributor separately and totals the amount", () => {
  const s = summarize(parseLog(log).commits, { rate: 100 });
  assert.equal(s.commits, 5);
  assert.equal(s.authors.length, 2);
  // Ada 80+30, Bob 30 (merge) + 30 (late night, different session) = 170 min
  assert.equal(s.minutes, 80 + 30 + 30 + 30);
  assert.equal(s.hours, 2.83);
  assert.equal(s.amount, 283.33);
  assert.equal(s.days.length, 2);
});

test("no rate means no amount", () => assert.equal(summarize(parseLog(log).commits).amount, null));

test("describe understands conventional commits", () => {
  assert.deepEqual(describe("feat(ui)!: dark mode"), { type: "feat", text: "dark mode" });
  assert.deepEqual(describe("Fix the thing"), { type: null, text: "Fix the thing" });
});

test("markdown hides merge noise, caveats the method, dedupes lines", () => {
  const md = toMarkdown(summarize(parseLog(log).commits, { rate: 100 }), { client: "Acme" });
  assert.match(md, /^# Work report — Acme/);
  assert.doesNotMatch(md, /Merge branch/);
  assert.match(md, /\*\*feat\*\*: add invoices endpoint/);
  assert.match(md, /not included/);
  assert.match(md, /\| Ada \|/);
});

test("csv quotes summaries", () => {
  const csv = toCsv(summarize(parseLog("a1b2c3|X|2026-01-01T10:00:00Z|say \"hi\", ok").commits));
  assert.match(csv, /"say ""hi"", ok"/);
});

test("empty input yields an explicit empty report", () => {
  assert.match(toMarkdown(summarize([])), /No commits in range/);
});

test("gate fails over limits", () => {
  const s = summarize(parseLog(log).commits, { rate: 100 });
  assert.equal(gate(s, { maxHours: 10 }).ok, true);
  assert.equal(gate(s, { maxHours: 1 }).ok, false);
  assert.equal(gate(s, { maxAmount: 100 }).ok, false);
});
