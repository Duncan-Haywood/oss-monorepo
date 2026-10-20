import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, parseQuestions, questionsToText, saveSurvey, validateAnswers, addResponse, responsesFor, npsStats, summarize, themes, toCsv, parsePasted, bucket, slugify, removeSurvey } from "./survey.mjs";

const SRC = "nps*: How likely are you to recommend us?\nrating: Onboarding\nsingle: Plan | Free | Pro\nmulti: Features | Search | Export | API\ntext: What could we improve?";
const mk = () => { const st = newState(); const s = saveSurvey(st, { title: "Customer pulse", questions: SRC }, 1); return { st, s }; };

test("parseQuestions reads types, required stars and options", () => {
  const { questions, errors } = parseQuestions(SRC);
  assert.deepEqual(errors, []);
  assert.equal(questions.length, 5);
  assert.equal(questions[0].required, true);
  assert.deepEqual(questions[2].options, ["Free", "Pro"]);
  assert.equal(questionsToText(questions), SRC);
});

test("parseQuestions reports bad lines instead of guessing", () => {
  const { errors } = parseQuestions("poll: x\nsingle: Only | one\nnps:\n# comment");
  assert.equal(errors.length, 3);
  assert.match(errors[1], /at least two options/);
  assert.match(parseQuestions("").errors[0], /at least one/);
});

test("NPS matches the published definition and gives a 95% interval", () => {
  const s = npsStats([10, 10, 9, 8, 7, 6, 0, 3, 10, 9]);
  assert.deepEqual([s.promoters, s.passives, s.detractors, s.nps], [5, 2, 3, 20]);
  assert.ok(s.ci[0] < 20 && s.ci[1] > 20);
  assert.equal(npsStats([]).nps, null);
  assert.deepEqual(npsStats([10, 10, 10, 10]).ci, [100, 100]); // no variance, no spread
  assert.equal(bucket(9), "promoter"); assert.equal(bucket(7), "passive"); assert.equal(bucket(6), "detractor");
});

test("validateAnswers enforces ranges, options and required questions", () => {
  const { s } = mk();
  assert.ok(validateAnswers(s, {}).errors.q1);
  assert.ok(validateAnswers(s, { q1: "11" }).errors.q1);
  assert.ok(validateAnswers(s, { q1: "7.5" }).errors.q1);
  assert.ok(validateAnswers(s, { q1: "8", q3: "Enterprise" }).errors.q3);
  assert.ok(validateAnswers(s, { q1: "8", q4: ["Search", "Nope"] }).errors.q4);
  const ok = validateAnswers(s, { q1: "9", q2: "5", q3: "Pro", q4: ["Search", "Search", "API"], q5: "  fast  " });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.answers, { q1: 9, q2: 5, q3: "Pro", q4: ["Search", "API"], q5: "fast" });
});

test("closed surveys refuse responses; refs are sanitized", () => {
  const { st, s } = mk();
  const r = addResponse(st, s, { q1: 10 }, { now: 5, ref: "Email<script>" });
  assert.equal(r.ref, "emailscript");
  s.status = "closed";
  assert.throws(() => addResponse(st, s, { q1: 10 }), /closed/);
});

test("editing a live survey cannot remap old answers, but labels can change", () => {
  const { st, s } = mk();
  addResponse(st, s, { q1: 10 });
  assert.throws(() => saveSurvey(st, { id: s.id, title: "x", questions: SRC.replace("Pro", "Max") }), /locked/);
  saveSurvey(st, { id: s.id, title: "Renamed", questions: SRC.replace("Onboarding", "Setup") });
  assert.equal(st.surveys[s.id].questions[1].label, "Setup");
});

test("slugs are unique and surveys can be removed with their responses", () => {
  const { st } = mk();
  const b = saveSurvey(st, { title: "Customer pulse", questions: SRC });
  assert.equal(b.slug, "customer-pulse-2");
  addResponse(st, b, { q1: 3 });
  assert.ok(removeSurvey(st, b.id));
  assert.equal(st.responses.length, 0);
  assert.equal(slugify("Café  Ünïcode!"), "cafe-unicode");
});

test("summarize gives NPS, distributions, option shares and per-ref segments", () => {
  const { st, s } = mk();
  const add = (a, ref, t) => addResponse(st, s, a, { ref, now: Date.UTC(2026, 9, t) });
  add({ q1: 10, q2: 5, q3: "Pro", q4: ["Search"], q5: "love the fast search" }, "email", 1);
  add({ q1: 9, q3: "Pro", q5: "search is fast" }, "email", 1);
  add({ q1: 2, q2: 1, q3: "Free", q5: "slow export and confusing billing" }, "app", 2);
  add({ q1: 4, q3: "Free", q5: "billing is confusing" }, "app", 2);
  const sum = summarize(s, responsesFor(st, s.id));
  const nps = sum.questions[0];
  assert.equal(sum.total, 4); assert.equal(nps.nps, 0);
  assert.deepEqual(nps.byRef.map((x) => [x.ref, x.nps]), [["email", 100], ["app", -100]]);
  assert.equal(nps.byDay.length, 2);
  assert.equal(sum.questions[1].mean, 3);
  assert.deepEqual(sum.questions[2].counts.map((c) => c.pct), [50, 50]);
  const t = sum.questions[4].themes;
  const billing = t.find((x) => x.term === "billing"), fast = t.find((x) => x.term === "fast");
  assert.ok(billing.lift > 1 && fast.lift < 1, "detractor-heavy and promoter-heavy terms separate");
  assert.equal(sum.questions[4].recent[0].text, "billing is confusing");
});

test("themes skip stop words and count a term once per comment", () => {
  const t = themes([{ text: "billing billing billing", group: null }, { text: "the billing page", group: null }]);
  assert.deepEqual(t.map((x) => [x.term, x.count]), [["billing", 2], ["page", 1]]);
});

test("CSV quotes cells and neutralizes spreadsheet formulas", () => {
  const { st, s } = mk();
  addResponse(st, s, { q1: 8, q4: ["Search", "API"], q5: '=HYPERLINK("x"),"hi"' }, { now: 0 });
  const csv = toCsv(s, st.responses);
  assert.match(csv, /^submitted_at_utc,ref,/);
  assert.match(csv, /Search; API/);
  assert.match(csv, /"'=HYPERLINK\(""x""\),""hi"""/);
});

test("parsePasted accepts 'score, comment' lines and ignores junk", () => {
  const rows = parsePasted("10, great\n3 slow\nhello\n12, no\n9");
  assert.deepEqual(rows.map((r) => r.score), [10, 3, 9]);
  assert.equal(rows[1].text, "slow");
});
