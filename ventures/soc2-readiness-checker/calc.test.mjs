import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTROLS, AREAS, assess, parseAnswers, sampleAnswers, toCsv } from "./calc.mjs";

const all = (a) => Object.fromEntries(CONTROLS.map((c) => [c.id, a]));

test("control ids are unique and every area is named", () => {
  assert.equal(new Set(CONTROLS.map((c) => c.id)).size, CONTROLS.length);
  for (const c of CONTROLS) { assert.ok(AREAS[c.area], c.id); assert.ok([1, 2, 3].includes(c.w)); assert.ok(c.days > 0); assert.ok(c.evidence); }
});

test("everything done is 100% with no gaps and no work", () => {
  const r = assess(all("yes"), { start: "2026-10-12" });
  assert.equal(r.readiness, 100);
  assert.equal(r.gaps.length, 0);
  assert.equal(r.summary.totalDays, 0);
  assert.equal(r.summary.typeIReady, "2026-10-12");
});

test("nothing done is 0% and blockers are the weight-3 security controls", () => {
  const r = assess(all("no"), {});
  assert.equal(r.readiness, 0);
  assert.equal(r.blockers.length, CONTROLS.filter((c) => c.w === 3 && c.scope === "security").length);
});

test("partial counts half, and halves the remaining effort", () => {
  const r = assess(all("partial"), { daysPerWeek: 5 });
  assert.equal(r.readiness, 50);
  const full = assess(all("no"), { daysPerWeek: 5 });
  assert.ok(Math.abs(r.summary.totalDays * 2 - full.summary.totalDays) < 0.2);
});

test("optional scopes add controls only when chosen", () => {
  const base = assess(all("yes"), {}).summary.controls;
  const more = assess(all("yes"), { scopes: ["availability", "privacy"] }).summary.controls;
  assert.equal(more - base, CONTROLS.filter((c) => c.scope === "availability" || c.scope === "privacy").length);
});

test("not applicable is left out of the score, not scored as done", () => {
  const a = all("yes"); a["op-pentest"] = "na"; a["ir-plan"] = "no";
  const r = assess(a, {});
  assert.equal(r.summary.na, 1);
  assert.ok(r.readiness < 100);
  assert.ok(!r.gaps.some((g) => g.id === "op-pentest"));
});

test("unanswered controls count as not done and are reported", () => {
  const r = assess({}, {});
  assert.equal(r.unanswered.length, r.summary.controls);
  assert.match(r.advice.join(" "), /had no answer|had no answer and/);
});

test("gaps are ordered cheap and heavy first, with a cumulative finish week", () => {
  const r = assess(sampleAnswers(), { daysPerWeek: 2, start: "2026-10-12" });
  for (let i = 1; i < r.gaps.length; i++) {
    assert.ok(r.gaps[i - 1].value >= r.gaps[i].value - 1e-9);
    assert.ok(r.gaps[i].finishWeek >= r.gaps[i - 1].finishWeek);
  }
  assert.equal(r.gaps.at(-1).finishWeek, r.summary.weeks);
});

test("the observation window moves the Type II date", () => {
  const a = assess(sampleAnswers(), { start: "2026-10-12", windowMonths: 3 });
  const b = assess(sampleAnswers(), { start: "2026-10-12", windowMonths: 12 });
  assert.equal(a.summary.typeIReady, b.summary.typeIReady);
  assert.ok(b.summary.typeIIReport > a.summary.typeIIReport);
});

test("effort scale and weekly capacity change the duration, not the score", () => {
  const a = assess(sampleAnswers(), { daysPerWeek: 5, effortScale: 1 });
  const b = assess(sampleAnswers(), { daysPerWeek: 5, effortScale: 2 });
  assert.equal(a.readiness, b.readiness);
  assert.ok(b.summary.totalDays > a.summary.totalDays * 1.9);
});

test("parseAnswers reads CSV with aliases, a header, comments, and reports problems", () => {
  const p = parseAnswers("id,answer\n# note\nac-mfa,Y\ngov-risk,in progress\nnope,yes\nir-plan,maybe\nhr-bg,n/a");
  assert.deepEqual(p.answers, { "ac-mfa": "yes", "gov-risk": "partial", "hr-bg": "na" });
  assert.deepEqual(p.unknown, ["nope"]);
  assert.equal(p.bad.length, 1);
});

test("parseAnswers reads JSON and rejects broken JSON", () => {
  assert.equal(parseAnswers('{"ac-mfa":"yes"}').answers["ac-mfa"], "yes");
  assert.ok(parseAnswers("{oops").error);
});

test("csv export has one row per gap and quotes titles", () => {
  const r = assess(sampleAnswers(), {});
  const lines = toCsv(r).split("\n");
  assert.equal(lines.length, r.gaps.length + 1);
  assert.match(lines[1], /^1,"/);
});
